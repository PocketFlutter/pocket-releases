# Measuring Flutter FPS and PocketJS Frame Cadence

This report documents measurement semantics, energy-related ablations, and the open-source survey for the Pocket SDK and Demo Flutter HUD. Implementation and validation used Flutter 3.35.7 and Dart 3.9.2. Ordinary Flutter runs and integration-test binding measurements are reported separately.

## SDK `showDebugFps` Update (2026-11-10)

`PocketView.showDebugFps` now reuses `FlutterFrameMonitor` and reports Flutter cadence FPS from engine `FrameTiming.vsyncStart` timestamps. The compact `CustomPaint` HUD works in Release, where the official `PerformanceOverlay` does not paint. Fullscreen PocketView places the HUD on the left side of the bottom safe area. Embedded previews use a top-corner badge. Both pass input through `IgnorePointer`. The old Guest `ticks/s` badge was removed. `PocketView.onPerformanceSample` and `PocketPerformanceSample.fps` continue to report Guest ticks and native turns to JS diagnostics.

The migration inspected the retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`. Its `lib/core/perf_monitor.dart` provides an independent `addTimingsCallback` monitor and history. Its `lib/ui/mini_app_host_page.dart` positions the status HUD and history drawer above the Pocket viewport. The existing Demo `FlutterFrameMonitor` moved into the SDK as the single implementation, and the old Demo path re-exports it for compatibility. The HUD's bottom `SafeArea` keeps it clear of the Home indicator.

The following commands passed.

```sh
cd sdk/packages/pocket_flutter
flutter test --no-pub --no-test-assets test/pocket_view_viewport_test.dart --plain-name 'shows the Flutter FPS HUD inside the safe area'
flutter test --no-pub --no-test-assets test/pocket_view_viewport_test.dart --plain-name 'hides the Flutter FPS HUD when disabled'
flutter test --no-pub --no-test-assets test/pocket_performance_test.dart --plain-name 'keeps a long gap crossing the sample boundary'
cd ../../../demo
flutter test --no-pub test/flutter_frame_monitor_test.dart
```

## Measurements

1. **Guest scheduler turn rate.** `PocketPerformanceSample.fps` uses `PocketView`'s active ticker and native `frameDelta` path. It counts scheduler turns and native frameDelta calls in active windows, including turns without visual changes. `PocketView.onPerformanceSample` sends this rate to JS diagnostics. Since 2026-11-10, the SDK's `showDebugFps` badge displays Flutter cadence instead.
2. **Flutter frame cadence.** The root `FlutterFrameMonitor` listens only to engine `FrameTiming` and measures adjacent `vsyncStart` gaps.

`buildDuration`, `rasterDuration`, and `totalSpan` measure frame phases and latency. `totalSpan` runs from vsync start to raster completion. `1e6 / totalSpanUs` does not measure cadence.

Report these rates independently. `FrameTiming` measures Flutter's reported frames. Physical screen presents and system keyboard or other compositor processes require separate instrumentation.

Guest synchronous errors and pending-job diagnostics belong to the runtime. Unhandled promise rejections require a runtime rejection tracker. `FlutterFrameMonitor` only collects Flutter timings.

## Demo Integration and Flags

In `demo/lib/main.dart`, `MaterialApp.builder` wraps the app content.

- `PocketAppConfig.showFps: false` disables the original Pocket badge.
- `FLUTTER_FPS` controls the numeric HUD. `false` stops both the listener and display for energy ablation.
- `FLUTTER_PERFORMANCE_OVERLAY` controls Flutter's official engine graph in Debug. The official overlay does not paint in Release.

```sh
flutter run --dart-define=FLUTTER_PERFORMANCE_OVERLAY=true
flutter run --dart-define=FLUTTER_FPS=false
```

The flags can be combined. Use `FLUTTER_PERFORMANCE_OVERLAY=true FLUTTER_FPS=false` to show the official graph alone, or disable the graph for the numeric HUD alone. Ordinary Debug Duo results, original JSON and logs, and limitations are recorded below. Physical-device Profile, Release, and energy acceptance were outside that run. [Actual runs and validation (2026-11-03)](#actual-runs-and-validation-2026-11-03)

Flutter 3.35.7 `flutter drive` defaults to `--start-paused`. When the wireless iOS Dart VM Service is undiscovered, the isolate has yet to enter `main()`, and the test app can remain white before HUD rendering begins. Disable the startup pause explicitly in phone automation. The driver still needs a reachable VM Service to collect results.

```sh
cd demo
flutter drive --no-pub --profile --no-start-paused -d DEVICE_ID \
  --driver test_driver/integration_test.dart \
  --target integration_test/first_open_regression_test.dart
```

To measure on a target device, run the same ordinary app verification tool.

```sh
cd demo
flutter run --profile --no-pub -d DEVICE_ID --target tool/verify_flutter_fps.dart
flutter run --release --no-pub -d DEVICE_ID --target tool/verify_flutter_fps.dart
```

These commands provide Profile and Release entry points. The recorded Debug Duo data applies only to that run.

After phone automation, restore the ordinary Showcase entry point by rebuilding `lib/main.dart` and installing and launching it with `devicectl`. Put launch options before the bundle ID. Arguments after it, including a misplaced `--terminate-existing`, are passed to the app verbatim.

```sh
cd demo
flutter build ios --profile --no-pub --target lib/main.dart
xcrun devicectl device install app \
  --device DEVICE_ID \
  build/ios/iphoneos/Runner.app
xcrun devicectl device process launch \
  --device DEVICE_ID \
  --terminate-existing \
  BUNDLE_ID
```

### Default Refresh Behavior

`FlutterFrameMonitor` collects existing engine timing through `addTimingsCallback`, with no active `Ticker`, `Timer`, `Timer.periodic`, or `scheduleFrame`. The HUD observes already scheduled frames with `addPersistentFrameCallback` and calls `markNeedsPaint` on its compact paint boundary when the sample version changes. Idle retains the last valid window without synthesizing 0 FPS, 60 FPS, or a frame.

Calling `setState` for every timing batch can schedule the next frame, making the HUD part of a self-driven loop. The collector and HUD are separate, and the HUD checks versions only in existing persistent frames. Disabling `FLUTTER_FPS` removes the collector.

## Rate Calculations

### Guest Tick and PocketJS

`PocketPerformanceSample.fps` counts ticker/native frameDelta outputs in the active window.

```text
guestTickRate = nativeTurnCount / activeWindowDurationSeconds
```

The compatibility fields `frames`, `durationMs`, `maxGapMs`, `slowFrames`, `refreshHz`, and `nativeMsP95` describe Guest ticks and the Pocket renderer bridge. `nativeMsP95` includes FFI, returned-frame copies, and Dart decoding, in addition to native execution.

`PocketView._onTick` drives `frameDeltaAt` with the scheduler ticker. Performance ticks are recorded only when Guest output arrives. Idle time is excluded from the active window.

- [`FlutterFrameMonitor` passive collector and HUD](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/sdk/packages/pocket_flutter/lib/src/flutter_frame_monitor.dart)
- [`PocketView._onTick` and performance window](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/sdk/packages/pocket_flutter/lib/src/pocket_view.dart)
- [`PocketPerformanceSample` field definitions](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/sdk/packages/pocket_flutter/lib/src/pocket_performance.dart)
- [`PocketSession.runtime.performance` registration and sample delivery](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/sdk/lib/src/pocket_session.dart)
- [Demo compatibility aggregation for performance history](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/demo/js/state.ts)

### Flutter Engine Cadence

`FrameTiming` callbacks arrive in asynchronous batches.

1. Read `timing.timestampInMicroseconds(FramePhase.vsyncStart)`.
2. Deduplicate and retain strictly increasing timestamps.
3. Calculate `deltaUs` for adjacent valid timestamps.
4. Report cadence from the gaps or span of the window, retaining the last valid window.

The HUD can report the following diagnostics.

```text
cadenceFps(i) = 1_000_000 / (vsyncStartUs[i] - vsyncStartUs[i - 1])
buildMs      = timing.buildDuration.inMicroseconds / 1000
rasterMs     = timing.rasterDuration.inMicroseconds / 1000
totalSpanMs  = timing.totalSpan.inMicroseconds / 1000
```

`cadenceFps` describes Flutter's reported cadence. `buildMs`, `rasterMs`, and `totalSpanMs` diagnose UI, raster, and end-to-end latency or jank. Derive the frame budget dynamically from `View.of(context).display.refreshRate`. [`addTimingsCallback`](https://api.flutter.dev/flutter/scheduler/SchedulerBinding/addTimingsCallback.html), [`FrameTiming`](https://api.flutter.dev/flutter/dart-ui/FrameTiming-class.html), [`timestampInMicroseconds`](https://api.flutter.dev/flutter/dart-ui/FrameTiming/timestampInMicroseconds.html), [`totalSpan`](https://api.flutter.dev/flutter/dart-ui/FrameTiming/totalSpan.html), [`Display.refreshRate`](https://api.flutter.dev/flutter/dart-ui/Display/refreshRate.html)

### Idle and Window Boundaries

- Missing timing callbacks generally mean no new observable Flutter frame. The HUD can show `last window` and `idle/no new timings`.
- Window boundaries use valid `vsyncStart` timestamps. Callback arrival time is separate.
- Cadence comes from vsync gaps. Mean `totalSpan` is a latency metric.
- Idle gaps alone do not indicate jank. The one-second window is trimmed by source time, so old samples expire after long idle. Display `--` with fewer than two frames. Keyboard-process cadence and physical display presents are outside this collector.

## Compatibility with Legacy Fields and Sources

### `runtime.performance` and History

`runtime.performance`, `runtime.performance.sample`, `PerformancePoint`, and existing history arrays stay compatible. The JS page renamed “FPS history” to **Frame diagnostics** and labels its rate `Guest ticks/s`. Continue labeling `fps`, `frames`, and `durationMs` as Guest ticks and native turns in new reports and UI.

The root Flutter monitor keeps cadence, build, and raster out of the legacy `fps` field. The compact HUD omits `totalSpan`, which can be inspected in raw engine data and official tools. Use separate transport fields or a `scope=flutterView` diagnostic record to preserve metric semantics for existing consumers.

### Legacy `lib/core/perf_monitor.dart`

The old implementation is migration evidence. The SDK now pairs its own PocketView and FrameTiming paths. [Legacy SDK reuse](LEGACY_SDK_REUSE.md)

- The legacy history incorporates old runtime window state and cannot distinguish Guest ticks from Flutter cadence.
- Prefilled 60 FPS and fixed lengths are legacy placeholders.
- The old HUD is tied to PocketView runtime lifecycle and would duplicate Dart monitoring state.
- The root monitor uses only `vsyncStart` for cadence and shuts down completely with `FLUTTER_FPS=false`, independent of old history.

### HUD Ablation and Missed-Wakeup Regression

The old `_isSelfHudRebuildFrame` dropped the entire next timing batch when it contained at most two frames, which could discard real app frames. The new collector keeps all valid timings.

The first numeric HUD used `setState` in the persistent phase. Although `ensureVisualUpdate` then schedules no frame, stale dirty-element and flush markers on `BuildOwner` could suppress a later external `setState` wakeup. The second ordinary app ablation reproduced a timeout while disabling the HUD. The log is `ordinary-ablation-before-fix.log`.

The final implementation invalidates only the independent **360×44** HUD paint boundary, at most twice per second while collecting all timings. `CustomPainter` reads the latest sample without changing widget build state. It reuses TextPainter and disposes it on controller replacement or unmount. The former fullscreen HUD layer shrank to the text rectangle and the redundant fullscreen RepaintBoundary around the app child was removed. Disabled mode returns the original child directly.

In an isolated package under `/tmp`, the coordinator swapped only `markNeedsPaint` back to `setState`. The parent wakeup regression failed, with `hasScheduledFrame` false after an external parent `setState`. The production paint path passed the same test. Production source was untouched by the negative control.

## Open-Source Survey

This historical survey used pub.dev and primary source files. It did not run dependency resolution or Flutter builds. Measurement semantics, active refresh, and maintenance drove the decisions. Dart upper bounds require actual resolution testing.

### statsfl

- Counts `Ticker` ticks and computes `ticks * 1000 / sampleTimeMs`, clamped by `maxFps`. It does not read `FrameTiming`.
- Defaults and chart normalization use 60. There is no 16.67 ms engine cadence evidence.
- Enabling it starts a persistent `Ticker`, contrary to the passive energy requirement.
- Survey version 2.3.0 had gone a long time without an update. MIT. Resolve its Dart constraints on the target SDK before judging compatibility.

The active ticker and non-engine metric ruled it out. [pub.dev](https://pub.dev/packages/statsfl), [GitHub](https://github.com/gskinnerTeam/flutter-stats-fl), [Source](https://raw.githubusercontent.com/gskinnerTeam/flutter-stats-fl/master/lib/statsfl.dart), [pubspec](https://raw.githubusercontent.com/gskinnerTeam/flutter-stats-fl/master/pubspec.yaml), [License](https://raw.githubusercontent.com/gskinnerTeam/flutter-stats-fl/master/LICENSE)

### fps_monitor and show_fps

#### `fps_monitor`

- Uses `addTimingsCallback` and `FrameTiming` with no Ticker or Timer.
- Clamps `totalSpan` below `16.7ms` up to that value and uses fixed chart thresholds of 16/33/66 ms. `totalSpan` measures latency.
- Survey version 2.0.0, archived GitHub repository, BSD-3-Clause. The Dart constraint `<3.0.0` requires actual resolution and build testing.

Its fixed 60 Hz thresholds, FPS derivation, and archived status ruled it out despite the appropriate source data. [pub.dev](https://pub.dev/packages/fps_monitor), [GitHub](https://github.com/Nayuta403/fps_monitor), [Observer source](https://raw.githubusercontent.com/Nayuta403/fps_monitor/master/lib/widget/performance_observer_widget.dart), [Chart source](https://raw.githubusercontent.com/Nayuta403/fps_monitor/master/lib/widget/fps_chart.dart), [pubspec](https://raw.githubusercontent.com/Nayuta403/fps_monitor/master/pubspec.yaml), [License](https://raw.githubusercontent.com/Nayuta403/fps_monitor/master/LICENSE)

#### `show_fps`

- Computes reciprocal FPS from successive `addPostFrameCallback` intervals in place of `FrameTiming`.
- Defaults `targetFps=60` and `chartMaxFps=60`, with budget `1000 / targetFps`.
- By default each callback calls `setState` and registers another callback, indirectly scheduling continuous frames. `visible=false` does not guarantee the collector stops. The displayed average is derived from per-frame reciprocals.
- Survey version 1.1.0, MIT. Dart 3.9 fits its constraints. The survey found no explicit Flutter 3.35 validation. Recent maintenance does not alter its measurement source.

The active refresh and callback-based metric ruled it out. [pub.dev](https://pub.dev/packages/show_fps), [GitHub](https://github.com/mantreshkhurana/show_fps), [Source](https://raw.githubusercontent.com/mantreshkhurana/show_fps/stable/lib/show_fps.dart), [pubspec](https://raw.githubusercontent.com/mantreshkhurana/show_fps/stable/pubspec.yaml), [License](https://raw.githubusercontent.com/mantreshkhurana/show_fps/stable/LICENSE)

### Official `PerformanceOverlay` and Passive Callback

- Engine rendering paints the official overlay without an app-level Ticker, Timer, or `scheduleFrame`. The chart stops updating in idle.
- It displays UI/raster timing. Guest ticks remain a separate Demo diagnostic.
- A numeric HUD only needs an `addTimingsCallback` collector using vsyncStart cadence and build/raster/totalSpan diagnostics.
- It ships in the Flutter SDK and can be verified with Flutter 3.35 and Dart 3.9 without an extra dependency. Framework source is BSD-3-Clause.

The Demo uses the official overlay plus a small passive collector. [API](https://api.flutter.dev/flutter/widgets/PerformanceOverlay-class.html), [Flutter source](https://github.com/flutter/flutter/blob/main/packages/flutter/lib/src/widgets/performance_overlay.dart), [UI performance guide](https://docs.flutter.dev/perf/ui-performance), [Flutter LICENSE](https://github.com/flutter/flutter/blob/main/LICENSE)

### `frame_insights`

At review time, version 0.1.0 was BSD-3-Clause and used the Flutter timing callback. Its FPS estimate derives from mean frame span, roughly `1 / avgSpan`, and does not count display presents. Its HUD, store, dashboard, and `shared_preferences` dependency add state, persistence, and potential measurement interference beyond this Demo's cadence needs. [pub.dev](https://pub.dev/packages/frame_insights), [API docs](https://pub.dev/documentation/frame_insights/latest/)

## Energy and Refresh Ablation Matrix

| Variant | `FLUTTER_FPS` | `FLUTTER_PERFORMANCE_OVERLAY` | Expected observation |
| --- | --- | --- | --- |
| A — Baseline | `true` | `false` | Root numeric HUD, no active ticker or timer |
| B — HUD disabled | `false` | `false` | Monitor and HUD disabled for energy and frame behavior comparison |
| C — Official graph | `false` | `true` | Official Flutter UI/raster graph only |
| D — Both diagnostics | `true` | `true` | Compare the signals and record the added painting cost of both displays |

Keep PocketJS business logic, Guest tick semantics, and the legacy `runtime.performance` schema identical across variants. Change only the observation layer and keep scheduling passive.

## Actual Runs and Validation (2026-11-03)

iPhone Duo simulator, iOS 27.1, 60 Hz display. Debug measurements verified the collector. Profile and Release performance require separate runs.

### Continuous Frames from the Integration-Test Binding

Flutter 3.35.7 `LiveTestWidgetsFlutterBinding.handleDrawFrame` calls `platformDispatcher.scheduleFrame()` outside benchmark policies. `fullyLive` handles the subsequent frames. An idle page in integration tests can therefore receive about 60 engine timings per second. The first idle check failed with 117 new frames in two seconds. The zero-frame assertion stayed in place. Earlier static-page results around 60 Hz under such a binding cannot establish ordinary app cadence or energy use.

The ordinary app verification tool uses `WidgetsFlutterBinding` without importing `flutter_test` and reuses the same real animation workload. [`demo/tool/verify_flutter_fps.dart`](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/demo/tool/verify_flutter_fps.dart)

```sh
cd demo
flutter run --no-pub -d DEVICE_ID --target tool/verify_flutter_fps.dart
```

`POCKET_FLUTTER_FPS_VERIFICATION` reported `passed=true`.

| Scenario | Flutter cadence | UI p95 | Raster p95 | Observation |
| --- | ---: | ---: | ---: | --- |
| Pure Flutter animation, initial window, HUD on | 57.000 FPS | 1.747ms | 36.182ms | 58 source frames in the recent window |
| Busy-wait 45 ms per build | 19.990 FPS | 45.956ms | 0.561ms | 20 source frames in recent window and more over-budget phases |
| Same warmed animation, HUD off | 60.000 FPS | 0.719ms | 17.905ms | HUD collector detached. Independent raw collector continued. |
| Same animation, HUD re-enabled | 60.000 FPS | 0.551ms | 19.692ms | Scheduling continued after toggling |
| Animation stopped, HUD on | — | — | — | After two seconds of draining, both collectors saw zero new frames in two seconds |
| Animation stopped, HUD off | — | — | — | After two seconds of draining, zero new frames in two seconds and HUD collector detached |

The collector detected actual Flutter jank independently of Pocket. The HUD did not drive idle frames. Raster exceeded budget in the initial window. Warm HUD-off and HUD-reenabled windows were near 60 FPS with differing raster p95. The single sequential comparison establishes neither zero overhead nor stable performance improvements. Zero extra frames measures frame scheduling only, separate from CPU and GPU energy.

Original JSON, logs, and source SHA256 are in the ignored local directory `demo/artifacts/performance/flutter-fps-20261103/`. `ordinary-flutter-final.json` records the final ordinary-binding measurements and `source-sha256-final.json` identifies source. `ordinary-flutter-pre-layer-ablation.json` records the run before the extra fullscreen boundary was removed. `first-harness-run.log` preserves the prior failure and reason.

All 40 Demo unit tests passed. Thirteen monitor tests cover 120 Hz, batch split equivalence, source-watermark deduplication, one-second windows, UI and raster long frames, idle, nearest-rank p95, disabling and unmounting, and passive HUD behavior. The SDK safe-area badge regression checks the renamed diagnostics.

```sh
cd demo
flutter test --no-pub
flutter analyze --no-pub
flutter drive --no-pub -d DEVICE_ID \
  --no-start-paused \
  --driver test_driver/integration_test.dart \
  --target integration_test/jank_regression_test.dart
# SDK badge coordinates and safe area
cd ../sdk/packages/pocket_flutter
flutter test --no-pub test/pocket_view_viewport_test.dart
```

The pure Flutter animation and deliberate jank in `jank_regression_test.dart` verify engine statistics and Showcase wiring. The ordinary-binding tool verifies zero additional idle frames. The regression also covers the actual system keyboard, Chinese IME, page scrolling, Mobile UI, and diagnostic history. Engine statistics and Guest tick history retain separate schemas, collection paths, and reporting during continuous animation.
