# Court figure atlas

`court-figures-v1.png` was generated specifically for Solitaire HighNoon on
2026-09-02 with OpenAI's built-in ImageGen tool. A user-supplied historical
playing-card image was used only as a general style reference and is not
included in the product or atlas.

The atlas contains three original, double-ended figures in this order:

1. King
2. Queen
3. Jack

The production prompt requested an aged nineteenth-century hand-colored
woodcut/copperplate appearance, late-medieval court clothing, no copied deck,
no rank or suit marks, and no logos or watermark. Rank, suit, card border and
interaction states remain deterministic PixiJS graphics.

The generated source was reduced to 768 x 512 pixels for runtime delivery.
If the atlas cannot be loaded, the client retains its procedural court-card
fallback.

## Table material textures

`table-felt-v1.png`, `table-walnut-v1.png` and `table-bronze-v1.png` were generated specifically for
Solitaire HighNoon on 2026-09-02 with OpenAI's built-in ImageGen tool. They are
original project assets; no third-party texture files were copied or bundled.

The felt prompt requested evenly lit, seamless dark bottle-green billiard wool
with visible fine fibers and no objects, text, marks or focal features. The
walnut prompt requested evenly lit, seamless antique dark walnut with subtle
grain, no planks, objects, metal, text, marks or focal features. The bronze
prompt requested aged cast brass with fine hammered irregularity, worn golden
highlights and dark patina, without a predefined frame or rivets. All runtime
images were reduced to 512 x 512 pixels. PixiJS and CSS layer them over deterministic
fallback colors, so the board remains usable if any texture cannot load.
