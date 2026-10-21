"""Checks for glyph coverage, source mapping, color layers, and open counters."""

import importlib.util
import re
from pathlib import Path
import unittest

import cv2
import numpy as np
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("lettering", ROOT / "tools/build-lettering.py")
LETTERING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LETTERING)


class LetteringTests(unittest.TestCase):
    def test_visual_order_overrides_the_abc_filename(self):
        letters = LETTERING.extract_letters()
        self.assertEqual(set(letters), set("ABCDEFGHIJKLMNOPQRSTUVWXYZ."))
        self.assertLess(letters["C"][2][0], letters["A"][2][0])
        self.assertLess(letters["A"][2][0], letters["B"][2][0])
        self.assertLess(letters["."][2][3], 100)

    def test_fill_preserves_enclosed_counter_spaces(self):
        ink = np.zeros((40, 40), dtype=np.uint8)
        cv2.rectangle(ink, (2, 2), (37, 37), 255, 2)
        cv2.rectangle(ink, (14, 14), (25, 25), 255, 2)
        fill = LETTERING.interior_mask(ink)
        self.assertEqual(fill[8, 8], 255)
        self.assertEqual(fill[20, 20], 0)
        self.assertEqual(fill[0, 0], 0)

    def test_font_cycles_through_game_colors_excluding_black_and_white(self):
        engine_source = (ROOT / "game/engine.mjs").read_text(encoding="utf-8")
        palette_line = next(line for line in engine_source.splitlines() if line.startswith("export const palette"))
        colors = [color for color in re.findall(r"#[0-9a-f]{6}", palette_line)
                  if color not in ("#172033", "#ffffff")]
        self.assertEqual(LETTERING.COLORS, colors)
        with TTFont(ROOT / "web/fonts/sketchy-hand-color.woff2") as font:
            actual_colors = [f"#{color.red:02x}{color.green:02x}{color.blue:02x}"
                             for color in font["CPAL"].palettes[0]]
            self.assertEqual(actual_colors, colors)
            for index, character in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
                self.assertEqual(font["COLR"].ColorLayers[character][0].colorID,
                                 index % len(colors))

    def test_fonts_cover_uppercase_lowercase_and_period(self):
        for style in ("color", "ink"):
            with TTFont(ROOT / f"web/fonts/sketchy-hand-{style}.woff2") as font:
                mapping = font.getBestCmap()
                for character in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                    self.assertEqual(mapping[ord(character)], character)
                    self.assertEqual(mapping[ord(character.lower())], character)
                self.assertEqual(mapping[ord(".")], "period")
                self.assertLess(font["glyf"]["period"].yMax, 200)
                for character in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                    self.assertGreater(font["glyf"][character].numberOfContours, 0)
                    self.assertEqual(font["glyf"][character].yMax, LETTERING.CAP_HEIGHT)
                if style == "color":
                    self.assertEqual(len(font["COLR"].ColorLayers), 26)
                    self.assertEqual(font["COLR"].ColorLayers["A"][-1].colorID, 0xFFFF)
                else:
                    self.assertNotIn("COLR", font)


if __name__ == "__main__":
    unittest.main()
