# GLYPH_RUN Integration Study

Research baseline `bee700e`, 2026-11-03. This document preserves the gaps and recommendations identified during research. The implementation followed the proposed path for native opcode 3. See [the implementation and acceptance results](GLYPH_AND_SCHEDULER_IMPLEMENTATION.md). Research tests cover the upstream foundation. Implementation tests cover the resulting integration.

## Findings

Reuse the pinned upstream glyph pages in Rust and project GLYPH_RUN into the existing textured drawing operations with UV coordinates, color, and clipping. Reuse PFB1, resource revisions, Flutter's image cache, and Canvas. A gid identifies a glyph in an atlas and cannot reliably be converted to a Unicode character for TextPainter. Glyph positioning already comes from upstream.

GLYPH_RUN support means consuming the pinned upstream contract and preserving its drawing semantics. Unicode shaping, system font fallback, color emoji, and arbitrary text rotation depend on upstream font coverage and layout capabilities.

## Protocol and Baseline Behavior

The DrawList specification in `sdk/.cache/pocketjs/contracts/spec/spec.ts` (around line 1439) defines opcode 3 as a record of `3 + 2*n` u32 words.

| Word | Meaning |
| --- | --- |
| 0 | GLYPH_RUN opcode 3 |
| 1 | Low 8 bits hold fontSlot, bits 8–15 are reserved, and the high 16 bits hold the glyph count |
| 2 | Upstream ABGR color |
| First word per glyph | Top-left cell coordinates as two packed i16 values |
| Second word per glyph | Low 16 bits hold gid, high 16 bits are reserved |

The FONT ATLAS v3 cmap stores codepoint/gid/advance/xoff. Bitmaps use fixed cells and a raster density. A gid identifies a glyph within the selected font atlas, while upstream supplies its position. The SCISSOR stack and actual cell dimensions determine visibility. Glyph bitmaps come from a registered font atlas or PAK. TEXT_RUN carries UTF-8 strings.

- Upstream `engine/render/draw-ops/src/lib.rs` already decodes the record length correctly and carries the clip.
- The host at `sdk/native/src/lib.rs` installs a text measurer. It projects ordinary text to TEXT_RUN, which Dart lays out and draws with TextPainter.
- The provider decision in `engine/core/src/draw.rs` also checks tracking, transforms, and 3D state. Nonzero tracking, transforms beyond translation, and 3D can fall back to baked glyphs. Pure translation keeps the provider. Non-unit axis-aligned scaling may generate TEX_QUAD.
- The baseline host FrameOp projection lacks an opcode 3 branch and raises `unsupported PocketJS draw opcode 3`. Changing the measurer alone leaves the projection gap.
- Upstream transforms the anchors of rotated baked glyphs while keeping the cells upright. Preserve that behavior.

## Reusable Implementation

Rebuild the pinned sources with `sdk/scripts/prepare_upstream.py`. Keep the cache generated from the pin.

| Source | Use |
| --- | --- |
| `engine/core/src/lib.rs` `font_atlas` and `font_atlas_revision` | Access font atlases and detect replacement even when the atlas count stays the same. |
| `prepare_glyph_page(slot, gid)` in the same file | Create a shared glyph page on demand and obtain the handle, contains check, and UV descriptor. Revalidate the descriptor after resource changes. |
| `engine/render/glyph-pages/src/layout.rs` | Reuse GlyphSource, guarded glyph pages, multi-page layout, and UVs. Transparent borders prevent sampling bleed between adjacent glyphs. |
| `engine/render/glyph-pages/src/mask.rs` | Use A8 coverage compositing, scaling, and clipping as a pixel reference. |
| Glyph page implementation in `engine/core/src/draw.rs` | Share coverage pages with scaled text. Apply per-quad tint to white RGB and coverage alpha. |
| TEX_QUAD, synthetic texture, and sent_resources in `sdk/native/src/lib.rs` | Reuse texture references, revision export, and release. |
| `pocket_flutter/lib/src/pocket_view_painter.dart` | Reuse UV, tint, clipping, and image drawing. |

Review of the retained `pocketjs_flutter_demo` (excluding pocket_host) found only the older BinaryDrawCmd/FFI buffer transport in `native/pocket_runtime_multi.c`. The pinned upstream glyph-page API and the current resource pipeline provide the direct integration points. The parent demo's simulated font and drawing layers are unnecessary.

Existing glyph pages use T8 coverage and a 1024-byte white/alpha palette, which `pocket_assets.dart` already handles. PFB1 image tag 6 carries the resource, UVs, and tint.

Upstream baked text looks up Unicode scalars in the cmap with limited kerning and ligature shaping. Missing entries use gid0 tofu. The web runtime's glyph population script does not run automatically in QuickJS. Core streaming requires explicit request and commit. Dynamic Chinese coverage and color emoji remain subject to upstream support.

## Recommended Integration Steps

1. Collect GLYPH_RUN slot/gid requirements from the actual DrawList and prepare pages through the upstream API. Account for Ui mutable borrows, changes to page resources, and mixed TEXT_RUN/TEX_QUAD in one frame. Discard invalidated descriptors.
2. Generate the existing image/texture operations from the atlas's logical cell size, glyph coordinates, page UVs, converted ABGR color, and current clip. Upstream already handles spacing, line breaks, and shaping.
3. Add page textures to the common resource references for primary and auxiliary surfaces. Send by revision and release after the final reference is lost. FrameDrawCache already tracks the global raster_revision and retains generic handles. Font loading and stream commits increment the revision. Verify and reuse that invalidation.
4. Reuse PFB1 image encoding and Dart decoding and image caching. Keep glyphs on the existing binary contract and renderer initially.
5. Preserve default TEXT_RUN and system TextField behavior. Ordinary text can continue through its existing provider, and both providers must work in the same frame.
6. If measurement identifies per-glyph DrawOp overhead as a bottleneck, compare batched Canvas.drawAtlas by page with a compact glyph operation before adding another binary contract.

## Acceptance Coverage

- Nonzero tracking, transforms, ordinary TEXT_RUN alongside glyphs, and opcode 3 triggered by a real QJBC/PAK.
- Multiple gids per font, glyphs across pages, A→B→A page switches, multiple font slots, and primary and auxiliary output.
- Nonzero coordinates, partial clips, nested scissor, alpha and ABGR tint, integer raster density, and interactions with scaling and textured drawing.
- Atlas replacement with the same count, texture release and reuse, guest reload or OTA switch, and unchanged static frames. An old decoder Future must never overwrite a new page.
- Defined behavior for missing slots, invalid gids, truncated records, resource limits, and invalid handles, consistent with upstream rules.
- Pixel comparison of coverage against the reference compositor and real Flutter screenshots. Operation counts alone cannot verify glyph appearance.
- On-device profile and release comparisons for startup, scrolling, static redraw, and long text. Measure CPU, raster time, allocations, texture memory, and power before making performance claims relative to TextPainter.

## Verification During the Study

Running cargo test in the pinned upstream workspace failed because the cache lacked the workspace member `tools/build/gba/bake/Cargo.toml`. This required no changes to production sources or the upstream cache.

Unmodified copies of `engine/spec`, `engine/drivers`, `engine/render/draw-ops`, and `engine/render/glyph-pages` ran in a temporary minimal workspace with `cargo test --offline --manifest-path <temporary>/Cargo.toml`. All 16 tests and one doctest passed, covering DrawList decoding, the driver contract, glyph coverage, and bounds checks. Log `/tmp/pocket-glyph-isolated-tests.log`.

The host GLYPH_RUN path, real font pixels, mixed providers, and device performance and power were still open at this research stage. The study left runtime, ABI, and default text behavior unchanged and produced no commit.
