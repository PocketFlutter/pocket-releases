# VN T01 rich-text investigation before implementation

This pre-implementation record preserves the source investigation. The actual schema uses code-point ranges on dialogue text. The candidate AST below was not adopted. See [inline rich dialogue](VISUAL_NOVEL_RICH_TEXT.md) for current behavior and acceptance.

Date: 2026-11-09. The source review was read-only and predates Core rich text. Its gaps reflect that snapshot. See [InlineText implementation](INLINE_TEXT_IMPLEMENTATION.md) for the later single-Core-leaf implementation, public API, bootstrap patch, ablations, and current acceptance.

## Findings

- Reusable pieces include plain-text nodes, native measurement and wrapping, JS VN tick/save/localization, and Flutter's existing `TEXT_RUN` painter.
- The retained parent (excluding `pocket_host/`) and the VN at this snapshot used complete plain strings. Pinned Core joined a Text node and its Text descendants and measured, wrapped, and painted them using one parent style. There was no span, ruby, pause marker, or link range data.
- Use the existing Core text node and DrawList. Shared measurement, wrapping, ruby baselines, and links require Core inline-run layout ranges. `wrapText` offsets for one string cannot supply that geometry.
- Flutter's existing `PocketTextOp` and `TextPainter` draw Core lines at supplied positions without rewrapping. Keep line breaks, ruby positioning, and link geometry in Core and story state in JS. The VN does not need Flutter `RichText`.

## Source-first review of the retained parent

The investigation checked `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` and excluded `pocket_host/`.

| Retained path | Existing behavior | Reusable scope |
| --- | --- | --- |
| `lib/render/pocket_ui_components.dart:1234-1281` | `Text` / `View.Text` reads full `txt` from a `textListenable` and makes Flutter `Text(txt, style: ...)` with one `resolvedStyle`. | Full-string display with one weight, size, and color. No TextSpan or RichText. |
| `mini_apps/syslib/pocket_syslib_flutter_ui.js:101-116,831-840` | `TextStyle` applies to the full component. `wrapTextPage` passes a string and `text(content, opts)` creates one Text. | Full-line text and plain-text pagination shape. |
| `mini_apps/syslib/pocket_syslib_pages.js:775-779` | The example passes plain `text` into `ui.wrapTextPage`. | Reader example and input behavior. |
| `lib/render/pocket_ui_components.dart:2732-2775` | WrapTextPage displays page numbers and plain Text. | Reader shell only. |
| `docs/03_DUAL_HOST_UI_COMPONENTS_SPEC.md:12,51-55`, `mini_apps/app_ui_showcase/main.js:7,32,37` | Spec and Showcase use single-string Text nodes. | Preserve old plain Text compatibility. |

The retained source had no T01 behavior to migrate. `pocket_host/` is outside the source boundary.

## Existing runtime text paths

### Plain-text measurement, wrapping, and layout

- `wrapTextLines` in `sdk/packages/pocket_ui/src/mobile.tsx:278-323` calls Core wrapping through `global.ui.wrapText` when present and slices JS strings by UTF-16 break columns, retaining explicit blank lines. It uses a JS estimate only when the op is absent. New VN wrapping should use the Core provider.
- Pinned `contracts/spec/spec.ts:251-268`, `contracts/spec/ui-ops.ts:144-146`, and `engine/core/src/text.rs:221-235,392-415` define `wrapText(str, fontSlot, maxW)`, one string and slot and width returning UTF-16 breaks. `sdk/docs/TEXT_WRAPPING.md:3-29` records source reuse and actual plain-text QJBC/native resizing 390→320→480.
- `sdk/packages/pocket_ui/test/wrap_text_lines.test.ts:89-135` covers native offsets, Chinese, blank lines, and fallback. `sdk/packages/pocket_ui/test/paragraph_native.test.ts:9-84` covers real QJBC/native narrow screens, resize, and following control positions. These are plain-string baselines.

### Framework text resources

- `<Text>` in `sdk/.cache/pocketjs/framework/src/primitives.ts:37-49,102-127` has one prepared string and font slot. Ordinary props use a single `text` primitive.
- `TextPart` in `framework/src/text.ts:11-14,79-103` distinguishes local atlas segments from async glyph resources. `TextStyle` has one size/density/bold/fontSlot/width. It traverses scalars by cmap. A shaper must provide true shaping and caret boundaries. It provides no same-paragraph style runs.
- `framework/src/text-view.ts:5-45` reuses a bounded set of children for local and remote glyphs, with one `TextLayout` and color as input.
- `framework/src/text-layout.ts:1-3,23-27,253-280` is an experimental asynchronous whole-string service using an `io.offload` companion, no synchronous fallback, string/slot/width input, and line offsets. Pinned `text.shape` at `engine/crates/pocket-text/src/lib.rs:253-310` receives text/family/size/width and one `Attrs::new().family(...)`, returns page glyph geometry, and is not connected to the main Text node. Neither offers synchronous VN inline spans, ruby, and links.

### VN dialogue state, pauses, history, and saves

- `say` at `sdk/packages/pocket_vn/src/types.ts:250-263` uses `text:string`. `SayState` (`:383-398`) keeps full text, code-point revealProgress, and derived visibleText. `BacklogEntry` (`:453-460`) stores a string.
- `engine.ts:1196-1200` uses `Array.from` to derive a code-point prefix. `:1554-1569` saves full strings to backlog and active state to rollback. V4 (`types.ts:687-729`) shares `textPool:string[]` across backlog and rollback.
- `localization.ts:907-917` replaces a full line with `catalog.lines[say.id]`. `:1161-1185` rebases active, backlog, and rollback. `engine.ts:827-862` proportionally maps new and old string length for reveal. Translated richness requires locale-specific offsets.
- `types.ts:287` defines separate `wait` instructions at story boundaries. `text-sounds.ts:1-15,76-88` `minIntervalMs` throttles short glyph audio and does not pause reveal.
- `view.tsx:474-479,1104-1113` measures dialogue height from the full plain line and renders its visible prefix in one `<Text>`. A full-area `FocusTarget` calls `engine.advance()` on press. Inline links require exact hit targets and routing before that advance.
- Reuse `engine.tick`, skip, pause, save, localization, and current Editor transactions. `sdk/editor/client/novel.js:804` uses one dialogue textarea. Plain-text edit, undo/redo, save/reopen, and import/export browser tests at `sdk/editor/test/novel_text_browser.test.ts:46-123` provide baselines.
- At the time, `sdk/docs/VISUAL_NOVEL_GOAL_TRACKER.md:89-94` listed spans T01.1, ruby T01.2, local pause/link T01.3, and history/save character boundaries T01.4 as awaiting implementation. This investigation did not change status.

## Pinned Core synchronous Text and DrawList

The inspected Core was extracted to `sdk/.cache/pocketjs` from the pinned revision. Persistent changes belong in patches.

1. `sdk/.cache/pocketjs/engine/core/src/tree.rs:77-78,355-368` stores `text:String` per node. `collect_run` concatenates the node and Text descendants without child styles.
2. In `engine/core/src/layout.rs:42-58,82-102,573-599`, `MeasureCtx` holds one text, slot, tracking, and line height. `build` creates one Taffy Text leaf with one `Resolved` style. Incremental updates at `:761-805` also use one string and slot.
3. `engine/core/src/draw.rs:2918-2972,3090-3144` calls `emit_text` once per Text node. The atlas path emits `GLYPH_RUN` with positioned glyphs and one slot/color per op. The native path emits `TEXT_RUN` with slot, alignment, origin, boxW, lineHeight, color, and UTF-8 string. `collect_run_of` at `:3147-3158` also only joins strings.
4. Native provider `MeasureFn` and `WrapFn` at `engine/core/src/text.rs:221-235,326-415` take one string and slot. `layout.rs` caches one measurement per leaf. The existing interface accepts no multiple styles or ruby.
5. `GLYPH_RUN` and `TEXT_RUN` at `contracts/spec/spec.ts:1445-1450,1487-1510` can each carry one slot and color. Core could emit several positioned ops per paragraph. The current producer emits a full-string op per leaf. Ruby needs relative base and annotation y and line-box height. An inline run table or glyph/ruby flags within an op require a new DrawList layout and version.
6. `sdk/native/src/lib.rs:3851-3892` decodes one TEXT_RUN into one PocketTextOp. `sdk/packages/pocket_flutter/lib/src/pocket_model.dart:372-393` stores one text, color, and fontSlot. `pocket_view_painter.dart:454-495` uses `TextSpan(text: value, style: textStyle)` and TextPainter without rewrapping Core lines. `pocket_text_cache.dart:5-10,36-75,62-66` caches that single-style painter.

Keep paragraph runs on a single Core leaf. JS supplies stable ranges and style tokens. Core stores ranges and applies one measurement provider to wrap the whole paragraph and calculate line boxes, baselines, positioned fragments, and link rectangles. Flutter draws those results. Single-string wrapText offsets inform the character-coordinate convention. Mixed-style geometry requires the shared Core layout.

`hitTest` and `hitTestBounds` (`engine/core/src/draw.rs:797-843`, `contracts/spec/ui-ops.ts:122,141-146`) return the top node ID, without character range or link ID. Derive link rectangles from Core inline layout. Core could expose range hits, or JS could create controlled hit targets from exact returned rectangles. The full-screen VN FocusTarget currently advances. Dispatch link actions in JS and suppress `advance()` for that press. The exact API was undecided.

### Patches, bootstrap, and generated contracts

- `sdk/scripts/prepare_upstream.py:19-24` pins revision `99924de47c62fa36f526a8791055d91cbbdb3836` and archive SHA. The prepared cache is unpacked and marker-verified. `PATCHES` at `:26-48` had no rich-text patch at this checkpoint.
- Put persistent changes in `sdk/native/patches/<topic>.patch` and register patch and label at `prepare_upstream.py:29-48`. Lines `:343-387` check forward/reverse applicability or prior application. `:399-406` reextract mismatched revisions, apply patches, and verify the final contract. Editing the cache alone is temporary.
- Core boundaries include `tree.rs` for ranges, `layout.rs` and `text.rs` for styled measure/wrap/line/ruby/link geometry, and `draw.rs` for positioned fragments. If op format changes, `engine/render/draw-ops/src/lib.rs` verifies new length/version. Expose one JS-callable Core UI op and binding for hits.
- Define Core additions in `contracts/spec/ui-ops.ts` or `contracts/spec/spec.ts`. The generator documented at `spec.ts:1-18` and `sdk/.cache/pocketjs/package.json:291` produces `engine/spec/src/lib.rs`, `contracts/generated/pocket_spec.h`, driver contract, UI bindings, and guest Web bindings. Keep Rust Core, native DrawList decoding in `sdk/native/src/lib.rs`, and Dart PocketTextOp and painter aligned.
- Repeated existing TEXT_RUN/GLYPH_RUN ops are already supported. The format may stay unchanged if every positioned fragment carries its own coordinates, slot, color, and clipping and Core wrapping and advance match painting. For a new field or opcode, update `contracts/spec/spec.ts:1423-1534`, bump `DRAW_LIST_VERSION` (then 3), and update generated Rust and C contracts, Rust draw-ops/software raster, SDK native, Flutter decoder/renderer, and other readers. The closed DrawList rejects unknown ops (`engine/render/draw-ops/src/lib.rs:1-7,44-75`).

## JS schema proposal from the investigation

The following candidate was for T01 discussion. See the current implementation for the accepted API.

```ts
type SayPart =
  | { kind: "text"; id: string; text: string; style?: string;
      ruby?: { text: string; style?: string }; link?: string }
  | { kind: "pause"; id: string; durationMs: number };
```

- Keep one canonical say source. Normalize legacy `text` into one text part, or use `content` as the new source. `SayState.text/visibleText` can be derived compatibility views.
- Use stable IDs for runs, styles, links, and pauses. Map tokens to registered font slots, colors, and limited semantics. The protocol has no general font size, italic, or text-decoration dictionary. Core computes ruby size, vertical reserve, and baseline.
- A pause has zero width. Existing JS tick consumes and persists remaining time. Keep Dart timers and text-sound throttles independent. A link names a JS action or target key, with navigation, variables, and story policy in JS.
- Translate base and ruby text by stable part ID. Recompute lengths, breaks, and ranges for each locale. Map engine code points to Core UTF-16 at one tested boundary and avoid copying source-language offsets.
- Save part ID, reveal cursor within part, and remaining pause time when applicable. Preserve the same semantics in history and rollback. Decide version and legacy migration, then reuse the shared pool to avoid duplicate spans and derived strings in active, backlog, and rollback.

## Proposed minimum end-to-end acceptance

1. Specify and verify JS story, Editor, localization, and save schemas with plain-text compatibility. Define reveal, pause, and link availability for V4 history, rollback, and active lines.
2. Patch pinned Core and bootstrap. Place run metadata on one leaf, unify styled measurement, line breaks, and geometry, share it with ruby, and derive exact hit rectangles. JS continues to own story, tick, actions, and editing.
3. Add a real bilingual Guest line in `demo/js/` with mixed-style wrapping, ruby, an inline pause, and a link. At actual sizes and slots, check line breaks and ruby clearance. Tap the link through real input and assert its JS action and unchanged line position.
4. Verify Editor edit, undo, save/reopen, import/export, mid-line save/load, rollback/backlog, locale rebase, manual/auto/skip, pause/resume, and voice completion. Retain plain-text resize and editing as baselines and add actual QJBC/native and input assertions for T01.

The existing text and painter provide the foundation. This investigation identified the required Core inline layout and JS state, editing, and save changes. It preceded T01 implementation and verification.
