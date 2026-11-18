# Editor Web Rendering: Rounded Seams and Screen Density

## Reuse Stable Background Blur During Fades (2026-11-05)

This change reuses the retained parent's rendering resource principles in `lib/render/pocket_ui_components.dart` and the existing real Canvas backdrop blur. Previously every fade frame reran full-screen DPR blur even when only the Dialog and composite alpha above the glass changed. The existing scratch canvas now retains the last filtered pixels. It compares preceding ordered DrawOps, the resource epoch, logical and backing dimensions, and blur sigma exactly. A match reuses the blur and performs only current-frame clip, opacity, and tint composition.

Background op changes, image replacement/release, and resize invalidate the result. Foreground panel scale/fade does not. A preceding video DrawOp always forces recompute because decoded frames can change without DrawOps changing. Frames without glass clear the key. Closing releases scratch pixels. Multiple glass surfaces still sample actual previously painted content in order. When the one scratch cannot satisfy a surface, it recomputes conservatively. DPR and blur resolution stay intact and dialogs are not preopened offscreen.

Ablation removed the experimental 32-bit hash, four historical snapshots, LRU, and second memory budget. The final path reuses one scratch without color history. Exact sequence comparison avoids hash collisions. The resource epoch tracks actual browser-decoded asset changes and does not duplicate business theme or dialog state.

`preview_glass_cache.test.ts` uses real Chromium Canvas. Three opacity frames blur once and still blend according to progress. Red/blue changing to red/green, a red-to-blue replacement with the same asset ID, release to white, and resize invalidate correctly. Two frames with a video prefix both recompute. The flow uses one target and resets dimensions on close. An unready video DrawOp covers conservative invalidation, while existing video tests cover actual decoding. A negative control selecting the HEAD client through an environment variable failed, with two blurs across two frames instead of one, without editing production source. Transparent blur, TEX_TRI, and PSM5 pixel regressions passed.

Real Showcase ablation used the same new QJBC (591,313 bytes), release probe, and fresh Playwright Chromium at 390×844/DPR2. It ran UI → For → Close for one first open and one reopen. The old client ran 12/13 entry blurs, compared with four each in the new client. Other frames reused the filter. Mean synchronous draw calls changed from about 6.65/6.45ms to 2.78/2.80ms, and medians from 6.9/6.7ms to 0.45/0.40ms. Remaining recomputes came from actual resources or background changes. This measures local synchronous Canvas calls, outside GPU completion or screen FPS. Both clients preserved multiple monotonically decreasing intermediate opacities and removed the modal only after exit.

Three final Canvas regressions for blur cache, texture alpha/PSM5, and tint passed. Real idle-wake and pixel tests passed, and five native dialog cycles passed in a separate Bun process. Cycle completion now checks glass surface release. Semantic Text can become a glyph image before unmount during fade-out, so its disappearance cannot justify tapping the underlying button. Scale checks match the native Dialog test with one pixel of integer quantization per edge, while still verifying growth and monotonic blur opacity across frames.

## Image Tint Cost During Repeated Theme Changes (2026-11-05)

The retained parent's `mini_apps/syslib/pocket_syslib_pages.js` theme/composition and `shaders/liquid_glass.frag` inform behavior. The parent has no Editor Canvas projection, so the change adapts `sdk/editor/client/preview.js` without copying layout or business state. Actual PocketJS still animates themes and emits DrawOps.

Previously each intermediate tint ran drawImage then getImageData, forcing synchronous readback, and per-resource tint maps never evicted. The renderer reuses CPU RGBA from decoding and preserves channel-wise multiplication. Each texture has an LRU of up to eight entries and about 1M pixels, retaining one entry if a single image exceeds the budget. Replacement, release, and preview close free original and tinted canvases.

Real Chromium `preview_tint.test.ts` sends 80 colors and checks pixels, bounded area, no internal getImageData, and cleanup on replacement and release. Disabling just LRU grew retained pixels from nine at most to 82 and failed. Restoring only GPU readback failed the no-readback assertion. Both controls used temporary scripts without changing shared production files. This tests projection cost. Separate native Guest/browser input tests verify full theme interaction.

Static resource forwarding retains the native revision fast path. For providers without revisions, it compares cached pixel/palette references before comparing contents of different arrays, avoiding two new Uint8Arrays each frame. Reconnection receives complete resources and actual changes still use deltas.

Each Editor preview.frame notification also repeats preview.regions settings. The old entry redrew the entire canvas regardless. It now redraws only when the setting changes. Chromium sent 80 identical settings and observed zero extra clearRect/full draws. Switching the value caused one redraw even when repeated. Deduplication lives at the shared projection boundary, leaving business notifications and actual animation frames intact.

Real Modal regression found that glass and application surfaces both carry id/handle. The old compositor mistook glass for an unloaded child and removed it. The new path reads the native descriptor kind, treats only application or older descriptor-less frames as child slots, and keeps glass/platformTexture at their original draw positions for the host projection. Synthetic images without native IDs or handles cannot verify this case.

Native `build_frame` no longer generates DrawList twice on changed frames. It calls official `draw()` / `draw_auxiliary()` once for comparison. On change, it takes the same snapshots from `current_draw_list()` / `current_auxiliary_draw_list()` and copies them to the decoder. A cache hit avoids copying. DrawOps decode, resource revision, events, and invalidation stay intact. The retained parent's `native/pocket_runtime_multi.c` frame/drawlist boundary was reviewed first. This change uses current pinned PocketJS snapshots without changing upstream rendering or adding a renderer.

## Seam Cause and Render Path

On 2026-11-04, the Mini Apps button in Editor port `8792` showed a thin horizontal seam. `preview.ts` composites native FrameResult before `client/preview.js` projects to Canvas2D. This path is separate from Flutter's `pocket_view_painter.dart` and Android Impeller hard rectangle scissor.

PocketJS builds rounded fills from four alpha corner textures and same-colored rectangle strips. When mapping a 390×844 child frame into a 390×788 host surface, scale 788/844 moves integer y edges onto fractions. Canvas computes coverage for each piece independently, which can expose the backdrop at joins.

Read-only comparison found an upstream difference. Flutter resizes each child runtime viewport from surface constraints. Web originally used the root viewport for child creation and resize, then scaled it afterward. Child sizing now matches native, removing the browser step that guessed rounded components in DrawOps and snapped coordinates.

## Implementation Constraints

- `preferredViewportSlots` prefers a focused surface for a child and otherwise takes its first visible one. `syncChildViewports` resizes native children to those bounds, deduplicates unchanged sizes, and retains last size when hidden. PocketJS still owns child layout.
- Pump the child after resize to process new layout and host requests. Visible background children settle without advancing foreground animation.
- Do not infer component types from corner UVs, colors, and adjacent rectangles or round all DrawOps. The local rounded-component compensation was removed to avoid false sprite matches and altering translucent fills.
- Keep corner texture alpha and filtering. Preserve clip and avoid reconstructing rounded geometry to hide seams.
- Native DrawOps still provide clip. Input is bounded by the native 10-bit coordinate range and root viewport. A child animating in from the bottom exposes input only where it overlaps the canvas.
- `renderCurrentFrame` uses the screen DPR rounded up to an integer as a uniform backing-store supersampling factor. FrameResult, input, and screenshot protocol stay logical. `setTransform` maps to backing pixels. Child viewport correction and DPR clarity address separate issues.
- Browsers may scale the entire iframe through CSS. Record logical, backing, and CSS dimensions and DPR when comparing screen captures with raw canvas pixels.

### Strip Seams at Fractional Browser Zoom (2026-11-06)

Chrome zoom can make `window.devicePixelRatio` fractional. The old backing store individually rounded `width * dpr` and `height * dpr`. At DPR 1.8, 390×844 became 702×1519 and produced distinct x/y ratios (1.8 and 1.79976). The edges of same-color middle and top/bottom DrawOp strips fell on different coverage rows and exposed dark seams in rounded controls and inputs.

The whole logical frame now uses one integer `ceil(devicePixelRatio)` (DPR 1.8 → 2, 780×1688). The browser scales the completed Canvas once. Original DrawOp coordinates, tile alpha, native clip, and image filtering are preserved. `preview_density_seam.test.ts` samples button interiors row by row using real native Showcase FrameResult at DPR 1.8. The current projection had zero bad rows. The old fractional-density negative control consistently showed seams.

## Validation and Ablation

Tests are under `sdk/editor/test/`.

- `preview_density.test.ts` uses a real browser to verify DPR changes, logical input, and screenshot size.
- `preview_density_seam.test.ts` checks the absence of rounded-strip seams at fractional DPR with native Showcase, and runs the old-density negative control.
- `preview_pointer.test.ts` checks multitouch, wheel, and input order after capture loss.
- `preview_viewport.test.ts` checks geometry-based child resizing, deduplication, hidden-size retention, transition clipping, and input mapping.
- `preview.test.ts` verifies real native Profile → Lobby → Showcase. Automatic clicks wait for region geometry to settle after entry animation.
- `preview_rounded_seam.test.ts` samples actual native Profile rounded pieces. The negative control needs to visibly reproduce the seam to verify the fix.

The final 2026-11-04 run covered six files, with **8 pass / 0 fail**. It included annotated regions, DPR, pointers, real native open/return, viewport sync, and rounded pixels. Architecture checks and `git diff --check` passed. The coordinator also opened real Profile from `http://127.0.0.1:8792/` in Playwright Chromium and captured no visible seam inside the button.

The prior live projection measured boundary pixels `[69,109,237]` and `[99,131,240]`, distinct from opaque interior `[49,93,235]`. The viewport sync update still passed after removing rounded snapping. Earlier one-row sampling and button targeting during transition were caught by the tests and excluded from passes. Pixel checks must cover both sides of joins and actual RGB outside clip. Alpha of 255 over a white background does not establish containment.

Run from repository root:

```sh
bun test sdk/editor/test/preview.test.ts sdk/editor/test/preview_viewport.test.ts sdk/editor/test/preview_rounded_seam.test.ts sdk/editor/test/preview_density.test.ts sdk/editor/test/preview_pointer.test.ts sdk/editor/test/preview_regions.test.ts --max-concurrency=1 --timeout 60000
python3 sdk/scripts/check_architecture.py
git diff --check
```

The results cover the listed cases. Later rebuild of separate `preview_mini_app.test.ts` was blocked by a missing Lobby fixture `SafeAreaScaffold` export in the shared checkout. An earlier pass was excluded from final counts. `preview.test.ts` verified real native open and return using prebuilt Demo assets.

Keep this record and inline comments in sync if the strategy changes, and retain reproducible negative controls. The observations, implementation, and acceptance evidence have separate scopes.

## Native Mini App Safe-Area Invalidation

An Android capture on the same date revealed a host geometry issue. The entering child RenderBox moved from bottom to top without parent constraints or OS window metrics changing. Initial `safeArea.top=0` could persist. Measuring on initialization or OS metric changes alone missed this movement.

`PocketSystemHost` compares compositor slot bounds, visibleClip, and logicalViewport. It increments `geometryRevision` on actual geometry changes and passes it through existing `PocketGuestSession` to `PocketView`. After layout, the child reuses `_safeAreaForHost` to measure its intersection with physical system safe area and reports through existing display.viewport. No root inset copying, polling, or native ABI was added. Existing reporting cache deduplicates unchanged values.

JS retains `SafeAreaScaffold`. An independent child consumes safe area once by default. Pages inside a safe-area container use the inset-free composition entry. Host reporting and JS Page padding have distinct responsibilities, avoiding hardcoded status-bar height and stacked padding.

Open Duo should avoid only the top-right status region while keeping the remainder of the top usable. Page and close button use intersections of actual ReservedRegion with their own bounds. Local `occlusion` cannot become full-width top padding or whole-page right padding. The host reports actual viewPadding and regions, and does not infer status glyph rects from model names. Missing OS localized data remains unavailable. The coordinator reran host geometryRevision and viewport/system-host tests with eight passes.

Folded Duo keeps the right safe area. Open or partly open Duo exposes a full-height central division, which can be inactive, and localized top-right occlusion. Samples have legacy `safeArea.right` of 84 in both states. Standalone Page uses `pageInsets()` to release conservative content right padding only when a valid central division and exact corner occlusion explain the right inset. Original `safeArea` and `reservedInsets()` remain intact. Missing, off-window, or edge-aligned divisions or mismatched regions/insets fall back conservatively. The rule uses actual geometry.

The close button consumes conservative insets, then uses `avoidDisplayOcclusions()` for intersecting localized regions. Page app-bar trailing area and padding share derived insets and leave space for the shifted close button. Body content does not move with local controls. The coordinator passed nine JS geometry/Duo tests. A native fixture verified no app-bar overlap after geometry updates in the same runtime at 390 and 320 widths. Real geometry samples are in `demo/js/tests/fixtures/duo_geometry.json`. This pass did not reinstall on hardware or run full Duo fold/unfold acceptance.

The close button keeps concentric circles: visible 30px outer and 14/10/6px inner. The 44px hit area stays transparent in normal, focus, and active states, avoiding a 44px focus halo. Matching parity can prevent some half-pixel center offsets. High-density native masks remain separate.

## Native Masks and Browser DPR

Canvas DPR cannot add information to source textures. PocketJS disc/border masks use runtime rasterDensity to create higher-resolution textures while preserving logical size. Editor service sets rasterDensity=2, while public PreviewManager defaults to 1. This improves generated corner and shadow masks. External low-resolution assets are unaffected and DPR changes do not recreate the runtime or discard user state. Flutter devices still use their own pixel density path.

## Actual Rendering Latency for Repeated Theme and Toggle Input (2026-11-05)

Temporary `sdk/editor/test/.tmp_showcase_render_measure.ts` distinguished JS state commits, native FrameResult round trips, and Canvas painting. Real clicks used current `demo/assets` with 587,987-byte root bytecode and Profile/Lobby PAK/QJBC, pinned Playwright Chromium, and the newly optimized release probe `sdk/native/target/release/pocket_probe`. A temporary wrapper measured monotonic time from sending each `op: "frame"` to the native subprocess until receiving its complete response. Protocol and production source stayed intact.

Browser instrumentation wrapped only the main canvas's `CanvasRenderingContext2D.clearRect/save/restore`. It starts at depth-zero clearRect and ends on the final restore to depth zero. This measures synchronous Canvas2D projection in `renderCurrentFrame`. Browser compositor, GPU swap, and display scan-out are excluded. Chrome timer granularity quantizes short samples at 0 or about 0.1ms. P50/p95 use nearest rank over sorted samples and establish no 60fps or frame budget claim.

Actual input alternated Light and Dark nine times in Settings and tapped Enabled nine times under Mobile UI → Controls. Final states were Dark and Disabled. Both had zero pending inputs and no page errors, and showed no additional preview.frame or Canvas drawing after 250ms of settling.

| Interaction | Canvas Draw Samples | Draw P50 / P95 / Max | DrawOps | Resources | Max Frame Payload |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nine theme alternations | 42 | 0 / 0.100 / 0.100 ms | 282 (min=max) | 0 | 39,505 B |
| Nine Enabled taps | 35 | 0 / 0.100 / 0.100 ms | 364 (min=max) | 0 | 50,244 B |

In the same run, the independent native `op: "frame"` wrapper recorded 270 complete responses. Round-trip p50 was **0.952ms**, p95 **3.471ms**, and max **40.429ms**. The largest native frame carried 364 DrawOps, nine resources, and a 120,177 B JSON response. This includes the probe process boundary and Guest execution, separate from Canvas painting.

Temporary instrumentation adds no preview API telemetry. It establishes synchronous Canvas projection time for these repeated inputs and absence of extra drawing after idle. Compositor, GPU swap, actual device refresh, and other resource or host-surface scenarios remain outside scope.

## Unresolved Modal Harness Interaction (2026-11-05)

The standalone real Guest modal test repeatedly opened and closed under Chromium. Targeted native, Flutter raster, and browser tests for colorless blur plus scale/fade passed. Running `preview_timing.test.ts` before real modal in one Bun process still exposes a composition regression. Last isolated-process baseline was 0/5, while modal-only was 3/3. In failures, the probe exited with code 0/EOF after receiving `frame`/`schedule` but no `quit`. Some still had one SSE subscriber. Others lost the subscriber first and then hit idle eviction.

The delayed DOWN fulfilled before MOVE/UP were sent. Awaiting operationTail, awaiting server.stop(true), closing page first, and closing preview first did not consistently eliminate the failure. No fixed sleep was added. Available evidence cannot assign the cause to Modal JS, NativeProbe, or Bun or justify retaining a NativeProbe close/stdin.end lifecycle patch. Temporary diagnostics and processes were cleaned up. The combined suite remains unverified despite targeted UI passes.
