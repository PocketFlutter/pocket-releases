# Retained performance optimizations and measurements

Measurement correction, 2026-11-03. The original Pocket badge and compatibility `fps` history measured active Guest ticker/native turns. The metric is now named `Guest ticks/s`. The Demo root independently computes `Flutter FPS` from Flutter `FrameTiming.vsyncStart`. The old `fullyLive` integration binding requests subsequent frames automatically. Its roughly 60 Hz on a static workload establishes neither normal-runtime cadence nor idle power use. Historical UI/raster measurements apply to those test loads, and user-observed jank requires separate investigation. See [FLUTTER_FPS.md](FLUTTER_FPS.md) for the current methodology, normal Flutter runtime validation, and open-source alternatives.

Local measurements from 2026-11-02 use Apple Silicon, Flutter 3.35.7, Dart 3.9.2, and Xcode 27.1.

## Retained optimizations

Comparison with the actual PocketJSKit source found the following.

- `pocket_view_painter.dart` and `pocket_text_cache.dart` were identical.
- A native delta marker avoids decoding a full frame and visual Dart setState.
- Every 32 DrawOps share a RepaintBoundary. Unchanged chunks retain raster layers.
- Shared bounded TextPainter LRU with capacity 256. Image caching uses identity, revision, and epoch.
- Native DrawList cache, frame JSON cache, resource revision deduplication, and floating-point deltaMs remained.

The real QuickJS engine omits the old simulated C runtime's dirty-mask, ring-buffer, and high-FPS path that ignored time advancement. Web Editor CSS and animation use separate performance measurements.

## macOS profile measurements

`bun run profile:macos` uses actual vsync and Flutter FrameTiming. After warm-up, it measures four seconds per scene without a `pump(16ms)` loop. The static page still ran the native ticker. Canvas paints count actual paint calls.

| Scene | Measured Hz | UI build p95 | Raster p95 | Frames over 16.67 ms | Canvas paints |
| --- | ---: | ---: | ---: | ---: | ---: |
| Static home | 60.0 | 0.74ms | 2.50ms | 0 / 244 | 0 |
| JS counter updated every vsync | 59.7 | 5.28ms | 2.29ms | 1 / 240 | 238 |
| 500 retained nodes, static | 60.0 | 1.49ms | 6.99ms | 0 / 241 | 0 |

Local generated evidence is `artifacts/performance/macos-profile.json`. The profile build also corrected macOS architectures. The existing Rust archive supplies arm64 only, so profile and release explicitly use arm64.

## iPhone Duo simulator debug measurements

The same `performance_test.dart` ran on iOS 27.1 at 60 Hz with four seconds per scene.

| Scene | Measured Hz | UI build p95 | Raster p95 | Over-budget frames | Canvas paints |
| --- | ---: | ---: | ---: | ---: | ---: |
| Static home | 60.0 | 1.49ms | 1.16ms | 0 / 243 | 0 |
| JS counter updated every vsync | 60.0 | 4.58ms | 0.86ms | 0 / 235 | 239 |
| 500 retained nodes, static | 60.0 | 1.52ms | 2.83ms | 0 / 237 | 0 |

These are actual engine FrameTimings from a debug simulator. Physical iOS and continuous 500-node animation need separate runs. This run did not reproduce the reported sustained low FPS. Reproduce with the reported page, device, and interaction.

## Native full versus delta ablation

`native/src/bin/pocket_bench.rs` links the release runtime directly, loads actual QJBC and PAK, and collects 300 frames after warm-up. It measures engine and FFI work, excluding Dart JSON decoding, widget build, and GPU work.

| Scene | Full p50/p95/p99 | Delta p50/p95/p99 | Returned data |
| --- | --- | --- | --- |
| Static home | 25/28/35µs | 22/24/26µs | Full about 27.1 KB/frame. Delta averages 108 B/frame including the first full frame. |
| Animated counter | 94/98/100µs | 94/197/280µs | Both about 27.1 KB/frame. |

Delta reduces transferred data about 250-fold while idle. It decides after the full guest/layout/resource pass, so the native CPU reduction is smaller. Dynamic speedups vary. A short run's p95 variation requires repeated measurement before classifying a regression.

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
cargo run --locked --release --manifest-path native/Cargo.toml --bin pocket_bench -- \
  --bytecode ../demo/assets/app.qjbc \
  --pak ../demo/assets/app.pak \
  --frames 300
cd ../demo/js
bun run profile:macos
```

## Structural changes and historical baselines

The current PFB1 binary frame/resource ABI carries numerical DrawOps and pixel data without full-frame JSON. Dart still copies and decodes the borrowed buffer. The full/delta table above measures the former JSON path. Earlier native `needs_frame` or visual-epoch checks and reducing full DrawList comparison and cloning remain candidates for investigation. Measure reproducible low-FPS cases while preserving timer, Promise, input, and animation semantics.

Record simulator debug separately from physical profile/release. This run does not establish physical iOS performance.

## Persistent FPS badge and history

- The top-right `FPS xx | min xx` badge is controlled by `showDebugFps` in debug, profile, and release. `min` is the session minimum and displays `--` until the first valid sample.
- Roughly one-second ticker windows record FPS, frames, durationMs, maxGapMs, slowFrames over 1.5 display budgets, refreshHz, and bridge/decode p95 under compatibility field `nativeMsP95`.
- A continuous time base across windows catches long gaps at boundaries and excludes the initial zero-interval tick. Pause/resume resets the window. Background time and initial bytecode load are excluded.
- **Host → Runtime → FPS history** is a JS page showing 60 recent points, minimum FPS, and timestamps. A separate performance signal avoids rebuilding app state or a 500-node list on every sample.
- Memory and disk retain 600 entries. Writes are asynchronous and serialized after every 10 entries and normal disposal. Log errors do not roll back the runtime. Hard exits can lose the final partial batch.
- History lives at `getApplicationSupportDirectory()/pocket-performance/<appId>/history.json`.

`../demo/integration_test/fps_history_test.dart` intentionally blocks the UI isolate on a timer. It verifies the badge minimum drops, JS history appears, disk records a large gap and slow frame, and restart restores it. The test measures induced jank.

## Baseline after public SDK integration (2026-11-02)

Duo simulator in debug at 60 Hz, sampling four seconds per scene after warm-up. Raw results are `artifacts/performance/sdk-iphone-duo.json`.

| Scene | Measured Hz | Build p95 | Raster p95 | Over-budget frames |
| --- | ---: | ---: | ---: | ---: |
| Static home | 59.508 | 2.009ms | 1.768ms | 1 |
| Counter updated every vsync | 60.000 | 4.756ms | 0.919ms | 0 |
| 500 static nodes | 60.000 | 1.655ms | 2.981ms | 0 |
| Static Glass | 59.504 | 1.562ms | 3.102ms | 0 |

Static screens had zero Canvas paints and the counter had 240. Glass warmed for three seconds. A brief initial drop remained visible on page entry. This is a short, steady-state simulator baseline. Transitions, keyboard animation, and physical iOS profile need separate measurements.

## Long-frame records (2026-11-03)

The host retains the latest 240 `longFrameEvents` alongside FPS windows. Each record includes UTC time, actual `refreshHz`, `budgetMs=1000/refreshHz`, Flutter `buildMs/rasterMs` where available, bridge/decode `nativeMs`, consecutive active-frame `activeGapMs`, and JS page/action `context`. A measured stage or active gap must exceed 1.5 times the budget. There is no 60 FPS ceiling. Idle stop and the dormant interval after resume are excluded. Low cadence from sparse updates alone does not establish a long frame.

`scope=flutterView` reports build and raster for the engine's whole view, so per-child attribution requires separate evidence. `scope=pocketView` measures bridge or active gaps of that PocketView. `nativeMs` includes FFI, response copying, and Dart decode.

The implementation reuses the active ticker and FrameTiming callback without polling or a perpetual ticker. Stopping after brief activity flushes unsent events. An event-only delivery without valid cadence skips FPS history and does not set minimum to zero. Old history restore filters those windows too. Async writes remain serialized every 10 samples and on dispose. Hard exit can lose the final batch. JS provides action-change context via existing `runtime.performance({context})`, and the performance page shows recent long-frame breakdown. Dart holds no additional route state for diagnostics.

Mini App opening failed because Showcase still declared removed `system.runtime.present`. Requesting `system.runtime.awaitFirstFrame` was denied and the open transaction rolled back and reclaimed the instance. The declaration was aligned. The contract test extracts valid methods from the Dart registry and runs the JS open flow.

On the Duo simulator, `flutter drive --no-pub --no-dds --driver=test_driver/integration_test.dart --target=integration_test/fps_history_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409` passed. The test blocks the Flutter UI isolate for 45 ms every 60 ms and verifies records exceed the actual refresh budget, persist, and restore in a fresh Host. This blockage exists only in the test. Thirteen JS and 24 render/performance tests passed. These prove the recording path. Power and high-refresh physical performance remain separate.

The second Mini Apps blocker was the compiler entry. The public package exposed `@pocket/ui/system-surfaces`, but pass 1 only preloaded the public index and missed the component's default class STYLE_IDS. Strict style parsing threw before adding the compositor node. Resident fallback could still prewarm children, leaving a ready first frame without visible output. The public index now includes `SystemAppSurfaces` and uses the same compiler and compositor. `demo/js/tests/system_surface_compiler.test.ts` uses a temporary consumer, real compilation, and native probe to verify valid handle, bounds, and clip in hostSurface. Presentation uses the existing compositor.

All three Duo `multi_app_test.dart` scenarios passed after fixes: Profile→Lobby identity/message sharing and result, cold start and prewarmed reuse with hidden realm idle stop, and failure reclamation and owner cleanup. SystemUI remains mounted as compositor root. The foreground child must be visible and focused. One short local observation gave cold=201 ms and warm=103 ms for reproduction. Final repository `bun test` passed 81 with zero failures, including actual compile and native compositor probe.

## Recording Glass and keyboard jank (2026-11-03)

`demo/integration_test/interaction_jank_test.dart` samples from immediately before the real tap. It covers first and repeat Glass opens plus first and repeat opening and closing of the real system keyboard. It scrolls to the target before the window, uses no TestTextInput or extra driver ticker, and does not synthesize FPS with 16 ms pumps. The test records FrameTiming, actual bridge call duration, IME inset, and persisted long frames. The bridge probe covers only frameDelta calls. `engineSpanHzIncludesIdle` is the engine frame span ratio within the window, including intentional idle time.

The table preserves one debug run on the 60 Hz Duo simulator with recording off, in milliseconds. The old script assigned FrameTimings by callback arrival, so delayed frames from the previous operation can appear in a later window. Use these figures for historical traceability. Optimization comparison, physical-device power, and AOT performance require separate measurements.

| Interaction | Build max | Raster max | Frame bridge max |
| --- | ---: | ---: | ---: |
| First Glass open | 22.3 | 6.7 | 4.6 |
| Repeat Glass open | 22.5 | 3.0 | 15.9 |
| First keyboard open | 79.8 | 1.4 | 2.8 |
| Repeat keyboard open | 20.9 | 1.8 | 2.9 |
| First keyboard close | 15.0 | 1.9 | 5.5 |
| Repeat keyboard close | 12.7 | 1.9 | 6.2 |

The historical runs suggest long builds during interaction. Re-run with corrected frame attribution. FragmentProgram preloading showed no stable benefit. Removing complex InputDecoration still left first open about 68 ms and warm open about 20 ms, without resolving the main bottleneck. Both candidates were reverted. Optical shader/saveLayer and composing/geometry semantics retain their original implementations. The legacy input lifecycle reference is `pocketjs_flutter_demo/lib/render/pocket_ui_components.dart`, and recipe caching came from `mini_apps/pocketjs_uikit.js`. The original VDOM renderer was excluded.

Diagnostics fixed two confirmed gaps. Flutter long builds without Pocket native frame context, such as first text-field creation, now record as independent `scope=flutterView` facts without fabricated native or gap times. During idle stop, synchronous diagnostics can wake the ticker. The host now stops first, then checks whether that callback already woke it, preventing the old stop or deadline from overriding the wake. Idle gap filtering uses an explicit sleep marker. Twenty-six targeted render and scheduling regressions passed.

### Reuse deterministic recording

```sh
cd demo
flutter drive --no-pub --no-dds \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/interaction_jank_test.dart \
  --dart-define=POCKET_PERF_RECORD=true -d DEVICE_ID
cd js
bun run perf:save
```

The test captures actual input, viewport, and host transactions with `PocketRecordingLibrary`, exports an archive after disposing the original instance, and runs offline `replayArchive`. All 623 transactions and 225 frames matched. `perf:save` extracts performance JSON, the recording manifest, and content-addressed assets from the driver report into a new `demo/artifacts/performance/interaction-*` directory and verifies asset SHA. This preserves the archive after test teardown. Generated artifacts and bytecode archives stay ignored.

To measure performance, repeat the script without `POCKET_PERF_RECORD=true` and save in a different directory. Recording adds transaction digest and hash work. During capture, bridge peak reached approximately 49 ms. Replay verifies SDK execution facts and frame output, while real-time sampling is needed for system keyboard rendering time, Flutter build/raster, and GPU power. Use both for before/after performance and offline behavior consistency.

The pure Flutter control, `flutter_keyboard_control_test.dart`, mounts a same-style TextField only after tapping in a fresh process and opens actual IME with no Pocket dependency. The old local run recorded maximum build times of 125.9 ms on first open, 6.7 ms on warm open, and 5–6 ms on close, with actual inset 792→0. This script shared the batch-attribution problem and the first window overlapped launch. The 125.9 ms may include startup. The widget trees also differ, so subtracting about 7 ms from about 21 ms does not isolate SDK cost. Repeat both using corrected attribution. Release/AOT and elimination of keyboard jank have yet to be shown.

### Local invalidation and interaction-window calibration

`PocketView` adapts local listening and retained rendering subtrees from the legacy `lib/render/pocket_ui_components.dart` to actual DrawOps and native TextField.

- Scene and editor notifiers signal invalidation only. Frame, text, selection, and scroll state keep their existing owners. Values and composition sync through the current controller. Rect/style/open/close updates invalidate only the editor. Several events in a frame are coalesced. A simultaneous scene refresh consumes final editor state.
- Main and auxiliary DrawOps, surface parameters and focus, resource completion or release, and host input property changes still refresh the scene. Equality reuses current op equivalence plus video fit. Newly decoded list identity does not signal a change.
- The scene widget stays mounted. Outer FPS-label setState no longer rebuilds into it. A stable editor wrapper key protects EditableText from canvas chunk count changes. The same controller, FocusNode, selection, composition, and editing epoch remain.
- DPR changes invalidate explicitly on their own to prevent reusing an obsolete pixel grid. Keyboard metrics with the same DPR do not. A regression reproduced the issue before the fix.
- Host resizing, system keyboard, and JS scroll semantics stay on their established paths. This change did not enable a stable full-height viewport.

Glass follows recipe reuse from `mini_apps/pocketjs_uikit.js`. A Solid memo caches recipe and string payload, and one effect registers or updates the surface. This removes duplicate `onMount` and effect registration without a global surface cache, registration state, or shader prewarming. Tests use the actual pinned Solid client runtime in a separate process and cover effect, memo, and cleanup behavior.

`frame_timing_collector.dart` continuously receives engine timings. It clears the old batch before each operation and waits for delayed batches afterward. Assign the source frame with the following projection.

```text
buildStartWallUs = rasterFinishWallUs - (rasterFinishUs - buildStartUs)
```

The final two values come from the same FrameTiming monotonic phases. The method avoids comparing scheduler vsync target to vsync start or assuming 16.67 ms. Select and sort by projected build-start time. Every scenario must have valid timings, and an empty batch is missing evidence. The pure Flutter control uses the same collector. Closing the keyboard taps the fixed header to avoid Gallery route creation. The window lasts about 1.4 seconds. `wallClockMs` is window duration. `engineSpanHzIncludesIdle` includes idle. Flutter view timings include test harness and system keyboard work.

```sh
cd demo
# Demo regressions: real keyboard lifecycle, CJK input, scroll, and navigation
flutter drive --no-pub --no-dds \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/jank_regression_test.dart -d DEVICE_ID
# Lightweight timeline for attributing the same keyboard interaction
flutter drive --no-pub --no-dds \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/interaction_jank_test.dart \
  --dart-define=POCKET_PERF_TRACE=true -d DEVICE_ID
```

Default trace retains framework phases and the `Pocket.frameDeltaAt` span and inserts a marker before the tap. Add `POCKET_PERF_WIDGET_TRACE=true` for per-widget build/layout/paint. The test fails if its slowest build frame falls outside a complete Dart Frame, preventing misleading results when the VM ring buffer loses the start. Trace times are stored separately from normal runs. `POCKET_PERF_RECORD` independently verifies execution and frame consistency.

At the user's direction, the Demo temporarily removed the Liquid Glass page, entry, and demo transition options. `interaction_jank_test.dart` now measures only keyboard. `jank_regression_test.dart` aggregates input, scrolling, and mobile navigation. SDK Glass components and standalone optical regressions remain. Earlier Glass figures are historical. Turning transitions off temporarily reduced later frame work without removing first-frame spikes, so the ablation was reverted.

The lightweight keyboard trace covered the slowest frame in all four scenarios. One Duo simulator debug first open had a 57.772 ms build. Its Dart Frame was 61.811 ms, including 47.606 ms LAYOUT, nested 40.051 ms BUILD, 5.316 ms PAINT, and 1.166 ms frame bridge. No GC overlapped that frame. The longest UI-thread compilation span was 1.515 ms, distinct from aggregate background compilation. Warm open build was 13.764 ms, with 9.384 ms LAYOUT, nested 7.317 ms BUILD, and 1.377 ms bridge. This locates cost in layout/build, with widget-level causes still open. Trace timings do not establish normal-run improvements. Untraced repeated samples varied and still showed first-open spikes.

After removing Glass, the four real keyboard scenarios were rerecorded and replayed offline after disposing the original session. All 402 transactions and 145 frames matched. Archive: `demo/artifacts/performance/interaction-2sBZ4M/`. Raw window and trace reports: `demo/artifacts/performance/jank-fix-20261103T061326Z/`. These are ignored generated artifacts. The run verifies this input, viewport, and host set. Worker and hardware need their own runs.

## Demo regressions without Glass (2026-11-03)

The Demo omits the everyday Liquid Glass entry, and independent SDK optical tests remain. Two commands ran the iPhone Duo debug simulator regression.

```sh
cd demo
flutter drive --no-pub --no-dds \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/jank_regression_test.dart -d DEVICE_ID
flutter drive --no-pub --no-dds \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/multi_app_test.dart -d DEVICE_ID
```

All five `jank_regression_test.dart` flows passed: keyboard lifecycle, CJK IME, page scroll, Mobile UI navigation, and absent Glass entry. All three `multi_app_test.dart` flows passed: A→B result/message, hidden prewarmed instance reuse, and failure reclamation. Previous Mobile UI failure came from the helper sharing its 12-drag budget with a 50 ms per-check 0.5 px settling test. `ScrollablePage` inertia can last more than one second, so a visible target could consume its budget before settling. The helper now keeps separate 12-drag and bounded four-second settle budgets and a finite point/clip trace. Visibility assertions and SDK scrolling semantics were preserved.

Logs: `/tmp/pocket-no-glass-device-regression-final.log` and `/tmp/pocket-no-glass-miniapps-final.log`. Corresponding archives: `demo/artifacts/performance/jank-fix-20261103T061326Z/no-glass-device-regression-final.*` and `no-glass-miniapps-final.*`. Debug simulator cold=150 ms and warm=101 ms are a single reuse ablation observation. These commands verify device functionality and instance lifecycle. Normal-run FrameTiming, trace, and controlled A/B measurements provide independent performance evidence.
