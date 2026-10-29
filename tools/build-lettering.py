"""Compile Denis's original PNG outlines into local, scalable display fonts.

Run from any directory with the development font dependencies installed.
Sources stay untouched; generated WOFF2 fonts and a glyph manifest go to
web/fonts. The color font adds scratchy fills behind the original ink contours.
"""

import json
from pathlib import Path

import cv2
import numpy as np
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "lettering"
OUTPUT = ROOT / "web" / "fonts"
CAP_HEIGHT = 850
SIDE_BEARING = 30
COLORS = [
    "#e53935", "#ef9b24", "#f4d438", "#13816a", "#24bfd1",
    "#3478e5", "#7057ff", "#ee5b75", "#915c38",
]


def contours(mask, scale, baseline=0):
    """Trace all ink boundaries, retaining counters and hand-drawn wobble."""
    paths, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    pen = TTGlyphPen(None)
    height = mask.shape[0]
    for path in paths:
        if abs(cv2.contourArea(path)) < 1:
            continue
        simplified = cv2.approxPolyDP(path, 0.65, True)[:, 0]
        # Reverse after flipping Y: TrueType expects clockwise outer contours.
        points = [
            (round(x * scale + SIDE_BEARING), round((height - y) * scale + baseline))
            for x, y in simplified[::-1]
        ]
        if len(points) < 3:
            continue
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    return pen.glyph()


def interior_mask(ink):
    """Fill letter bodies while leaving A/B/O-style counters transparent."""
    paths, hierarchy = cv2.findContours(ink, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    fill = np.zeros_like(ink)
    if hierarchy is None:
        return fill
    for index in range(len(paths)):
        depth = 0
        parent = hierarchy[0][index][3]
        while parent != -1:
            depth += 1
            parent = hierarchy[0][parent][3]
        if depth == 1:
            cv2.drawContours(fill, paths, index, 255, cv2.FILLED)
        elif depth >= 2:
            cv2.drawContours(fill, paths, index, 0, cv2.FILLED)
    return fill


def extract_letters():
    """Map sheets by visual order or explicit bounds for multipart punctuation."""
    sheets = json.loads((SOURCE / "sources.json").read_text())
    letters = {}
    for filename, characters in sheets.items():
        image = cv2.imread(str(SOURCE / "sources" / filename), cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(f"Missing source sheet: {filename}")
        ink = np.where(image < 128, 255, 0).astype(np.uint8)
        if isinstance(characters, dict):
            for character, (x, y, width, height) in characters.items():
                letters[character] = (
                    ink[y:y + height, x:x + width].copy(), filename,
                    [x, y, width, height],
                )
            continue
        _, _, stats, _ = cv2.connectedComponentsWithStats(ink)
        components = sorted(stats[1:], key=lambda box: int(box[4]), reverse=True)
        # Inner counter outlines are separate components, enclosed by these boxes.
        exteriors = sorted(components[:len(characters.rstrip('.'))], key=lambda box: int(box[0]))
        if characters.endswith("."):
            exteriors.append(components[len(exteriors)])
        for character, (x, y, width, height, _) in zip(characters, exteriors, strict=True):
            crop = ink[y:y + height, x:x + width].copy()
            letters[character] = (crop, filename, [int(x), int(y), int(width), int(height)])
    if set(letters) != set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.+-,!?;"):
        raise ValueError("The source sheets must contain the alphabet, digits, and punctuation.")
    return letters


def build_fonts():
    """Build outline and layered-color fonts, with lowercase aliases and kerning."""
    letters = extract_letters()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    empty = TTGlyphPen(None).glyph()
    glyphs = {".notdef": empty, "space": empty}
    metrics = {".notdef": (500, 0), "space": (300, 0)}
    cmap = {32: "space"}
    color_layers = {}
    manifest = {}
    silhouettes = {}
    names = dict(zip("0123456789", [
        "zero", "one", "two", "three", "four", "five", "six",
        "seven", "eight", "nine",
    ], strict=True))
    names.update({".": "period", ",": "comma", "-": "hyphen", "+": "plus",
                  "!": "exclam", "?": "question", ";": "semicolon"})
    heights = {".": 125, ",": 180, "-": 190, "+": 620, ";": 340}
    baselines = {",": -100, "-": 330, "+": 115, ";": -100}
    for character, (ink, filename, bounds) in sorted(letters.items()):
        name = names.get(character, character)
        scale = heights.get(character, CAP_HEIGHT) / ink.shape[0]
        baseline = baselines.get(character, 0)
        width = round(ink.shape[1] * scale)
        advance = width + SIDE_BEARING * 2
        glyphs[name] = contours(ink, scale, baseline)
        metrics[name] = (advance, SIDE_BEARING)
        cmap[ord(character)] = name
        if character == "-":
            cmap[0x2212] = name
        if character.isalpha():
            cmap[ord(character.lower())] = name
        if character.isalnum() or character in "+-,!?;":
            fill = interior_mask(ink)
            rows, columns = np.indices(fill.shape)
            scratches = ((rows + columns // 3) % 23 < 2) & ((columns // 19 + rows // 31) % 5 != 0)
            fill[scratches] = 0
            fill_name = f"{name}.fill"
            glyphs[fill_name] = contours(fill, scale, baseline)
            metrics[fill_name] = (advance, SIDE_BEARING)
            color_layers[name] = [(fill_name, (ord(character) - 65) % len(COLORS)), (name, 0xFFFF)]
        if character.isalnum():
            silhouette = cv2.resize(ink, (width, CAP_HEIGHT), interpolation=cv2.INTER_NEAREST)
            silhouettes[name] = silhouette
        manifest[character] = {"sheet": filename, "bounds": bounds, "advance": advance}

    kern = []
    for first, first_mask in silhouettes.items():
        for second, second_mask in silhouettes.items():
            gaps = []
            for row in range(40, CAP_HEIGHT - 40, 15):
                left_pixels = np.flatnonzero(first_mask[row])
                right_pixels = np.flatnonzero(second_mask[row])
                if left_pixels.size and right_pixels.size:
                    gaps.append(metrics[first][0] + int(right_pixels[0]) - int(left_pixels[-1]))
            if gaps:
                adjustment = max(-150, min(40, 75 - min(gaps)))
                if abs(adjustment) > 5:
                    kern.append(f"pos {first} {second} {adjustment};")

    for colored in (False, True):
        family = "Sketchy Hand Color" if colored else "Sketchy Hand Ink"
        builder = FontBuilder(1000, isTTF=True)
        builder.setupGlyphOrder(list(glyphs))
        builder.setupCharacterMap(cmap)
        builder.setupGlyf(glyphs)
        builder.setupHorizontalMetrics(metrics)
        builder.setupHorizontalHeader(ascent=950, descent=-100)
        builder.setupNameTable({
            "familyName": family, "styleName": "Regular",
            "uniqueFontIdentifier": family + "-1.0", "fullName": family,
            "psName": family.replace(" ", "") + "-Regular",
            "version": "Version 1.0", "designer": "Denis",
            "description": "Original hand-drawn letters, numbers, and symbols by Denis.",
        })
        builder.setupOS2(sTypoAscender=950, sTypoDescender=-100,
                         usWinAscent=950, usWinDescent=100,
                         sCapHeight=CAP_HEIGHT, sxHeight=CAP_HEIGHT)
        builder.setupPost()
        builder.setupMaxp()
        builder.font.recalcTimestamp = False
        builder.font["head"].created = 3874867200
        builder.font["head"].modified = 3874867200
        addOpenTypeFeaturesFromString(builder.font, "feature kern {" + "".join(kern) + "} kern;")
        if colored:
            builder.setupCOLR(color_layers, version=0)
            builder.setupCPAL([[tuple(int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)) + (1.0,) for color in COLORS]])
        builder.font.flavor = "woff2"
        destination = OUTPUT / ("sketchy-hand-color.woff2" if colored else "sketchy-hand-ink.woff2")
        builder.save(destination)
        # Reopen the actual output to catch malformed tables before shipping it.
        with TTFont(destination) as font:
            assert all(ord(character) in font.getBestCmap() for character in letters)
        print(f"Built {destination.name}: {destination.stat().st_size:,} bytes")
    (OUTPUT / "glyphs.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    build_fonts()
