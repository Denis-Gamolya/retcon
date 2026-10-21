# Artwork and lettering

## Visual direction

The interface follows a sketchbook: warm cream surroundings, white drawing
paper, charcoal ink, and burnt red for primary actions. Green and red hand-lettered labels
identify Truth and Lie; selected votes also have checkmarks and thicker edges.
Functional text uses the system UI font. Display headings and the wordmark use
Denis’s original hand-drawn alphabet as a local color font. Truth/Lie labels recolor the custom font green or red without frames or rotation. Unsupported digits and punctuation fall back to the
existing display stack. No remote fonts or image services are required.

Timed phases use a compact player strip, with full standings at reveal.
Tools and sliders share one toolbar; hidden locked controls retain their space.
Canvas pixels and drawing colors remain independent of interface styling.
Keep rough decoration confined to the wordmark, home doodle, and lettering.

The lettering remains real, selectable text, supporting any word or game name.
All 26 uppercase letters and a period are included; lowercase aliases use the
same uppercase drawings. Missing digits and punctuation use fallback fonts.

### Rebuild the lettering

Original PNG sheets live in `assets/lettering/sources/`; `sources.json` records
the actual left-to-right letter order (the ABC sheet is C–A–B). Preserve these
originals. `tools/build-lettering.py` traces the ink, normalizes cap height,
adds optical spacing and kerning, and puts scratch-textured color inside the
letter bodies. Counters and surrounding space remain transparent. It emits
`web/fonts/` WOFF2 assets and a source-to-glyph manifest. The color font uses
OpenType COLR/CPAL layers; the ink font retains only the original outline style.

The source/build/runtime separation follows the
[Google Fonts build workflow](https://googlefonts.github.io/gf-guide/build.html);
font generation uses the official
[FontTools APIs](https://fonttools.readthedocs.io/en/stable/colorLib/index.html).
The tools and dependencies are needed only to rebuild lettering, not to play.

```powershell
python -m venv --system-site-packages .venv
.\.venv\Scripts\python.exe -m pip install -r tools/lettering-requirements.txt
.\.venv\Scripts\python.exe tools/build-lettering.py
.\.venv\Scripts\python.exe tests/lettering_test.py
```

The build also requires NumPy (included by OpenCV) and reads the source PNGs
directly. The alphabet cycles through the nine game colors, excluding black and white.
Change `COLORS` in the build script to recolor it, then rebuild; keep the
Truth/Lie CSS palette overrides in sync with the palette size. Inspect the full alphabet and sample headings at `/lettering`.

