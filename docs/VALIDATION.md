# Validation Records

The 2026-11-03 GLYPH_RUN, demand scheduling, and regression results are in the integration record. The 11-02 historical validation below described GLYPH_RUN as disconnected at that time. The capability coverage and platform comparison separately audit remaining gaps and the legacy multi-app platform/WeChat Host. [Glyph and scheduler integration](GLYPH_AND_SCHEDULER_IMPLEMENTATION.md) · [Capability coverage](POCKETJS_FEATURE_PARITY.md) · [Platform comparison](MINI_APP_PLATFORM_PARITY.md)

## 2026-11-16: Linux Container Test Prerequisites and Failure Fixes

This audit covered the retained SDK suites after `3ff13d6`. The goal was to run acceptance cases locally wherever satisfying the missing pinned-artifact prerequisite was possible, retain only unavoidable skips, and fix failures in the full `bun test`. It added no mock runtime or success placeholder.

| Scope | Changes and Preserved Behavior |
| --- | --- |
| Native toolchain built from source | `nativeToolchain()` in `sdk/scripts/tests/prerequisites.ts` prefers explicit `POCKET_NATIVE_PROBE` / `POCKET_TOOLS_PACKAGE`. Otherwise it uses `pocket_probe` and `pocketjs_bytecode` built from source under `native/target/release`, and assembles the untracked artifact `.pocket-build/toolchain-package` through the same `scripts/package_toolchain.ts` used by release CI. Seventeen files that required a pinned macOS arm64 probe, `current-native-tools`, `highres-native-tools-20261107`, `POCKET_TOOLS_PACKAGE`, `POCKET_NATIVE_PROBE`, or `POCKET_SOURCE_HASH` now use this helper. They record the chosen binary's SHA-256 instead of a frozen probe hash. |
| Pinned macOS Bun | Reuse the active Bun if the runner version equals the pinned 1.4.4. Previously the test required a macOS binary from `.pocket-build/browser-test-bun-1.4.4`. |
| Chromium executable | `playwright_path.ts` adds `resolveChromiumExecutable()`. Headless containers without full Chromium record the shell they actually run. |
| Skip titles | `acceptanceTest` adds missing prerequisites to skipped test titles. |
| Web engine | `web_game_input_guest` invokes repository `scripts/build_web_engine.ts` to build `.pocket-build/web-engine/pocketjs.wasm`. It requires `rustup target add wasm32-unknown-unknown`, including for the pinned 1.98.1 toolchain in `.cache/pocketjs`, and `llvm-ar` on PATH. `build_wechat.ts` now searches PATH for `llvm-ar`. |
| Remaining skips | Only the licensed Live2D Cubism SDK `Hiyori` sample remains missing, affecting `novel_authoring_browser`, `resources_system`, and 48 Lantern cases under `demo/js`. |
| Product fixes | `editor/preview.ts` yields the serial queue when SystemUI awaits child runtime load or a native child frame is in flight (`childBoundaryPending`). This avoids using all 48 pumps in zero wall-clock time. On POSIX, `scripts/editor_service.mjs` preserves the upgrade process when the prior service runs `tree-kill` and treats zombies as exited (`processAlive`). |
| Tests aligned with the current Demo/client | Wait for Showcase to settle before sampling. Profile declares `page` presentation (horizontal push) in `pocket.json`, and Lobby keeps the global bottom-up sheet. Native corner geometry is a `rounded` DrawOp. Host fonts no longer generate atlas textures. Preview routing adds `/resource`. Publishing starts at `#publish-test` with channel selection, and `startup` sends `hostFonts` among its fields. |

| Executed Command / Log | Result and Scope |
| --- | --- |
| `cargo test --locked --manifest-path sdk/native/Cargo.toml`, `/tmp/pocket-worker-recording-rust-verified.log` | 68 lib + 6 duplex passed, one manual throughput benchmark ignored. Covers real Worker HTTP/timer/random/Date/channel and offload submit/timeout/cancel/session/late completion. |
| Targeted `cargo test --locked --lib worker::tests::official_worker_records_http_timer_and_duplex_channels_then_replays_offline -- --exact` ten times from `sdk/native`, `/tmp/pocket-worker-recording-http-repeat10.log` | 10/10, 0.13–0.28s each. Exercises real QJBC, HTTP, bidirectional channels, timer/scalars, active HTTP stub cleanup, and strict stop/turn.end/worker.exit ordering. These are repeated functional runs. |
| Final lib test binary above, `offload::tests::callback_reply_probe_outside_batch_does_not_create_host_trace_event --exact --nocapture` fifty times with a 15s timeout per run, `/tmp/pocket-offload-shutdown-repeat-verified.log` | 50/50 with one test actually run each time, verifying no lost wakeup on idle-deadline thread shutdown. Neither Cargo exit 0 alone nor a zero-test run counted. |
| `cargo build --locked --manifest-path sdk/native/Cargo.toml --lib --bin pocket_probe --bin pocket_worker_probe`, `/tmp/pocket-worker-recording-native-build-verified.log` | Current debug dylib and actual probes built. |
| `bun sdk/scripts/tests/worker_recording_fixture.ts /tmp/pocket-worker-recording-fixture-20261103`, `/tmp/pocket-worker-recording-fixture-build.log` | Real `buildGuest` generated UI and independent Worker QJBC/metadata using the same pinned upstream and ABI. |
| SDK, set `POCKET_NATIVE_LIBRARY=.../sdk/native/target/debug/libpocket_flutter.dylib` and `POCKET_RECORDING_WORKER_FIXTURE_DIR=/tmp/pocket-worker-recording-fixture-20261103`, then `flutter test test/recording_worker_ffi_test.dart`, `/tmp/pocket-worker-recording-http-ffi-verified.log` | 2 passed, 0 skipped. The channel returned real HTTP body/end to UI. The archive exported after the source instance was destroyed and the server stopped. Two independent isolates replayed offline with matched results and the HTTP request count stayed at 1. Tampered seq/payload were rejected. UI-only capture also continued executing after stop. |
| Bridge, set the same `POCKET_NATIVE_LIBRARY` and run `flutter test --no-pub --concurrency=2`, `/tmp/pocket-recording-bridge-final-verified.log` | Final source passed all 104 in 3m32s, covering real FFI, three provider-free offload replays, legacy UI-only format, duplex, input/IME, glyphs, and stopped-clock wakeups. Includes the regression rejecting deletion of frame/clock from an actual controller archive. |
| SDK, set the two native/fixture environment variables above, then `flutter test --no-pub --concurrency=2`, `/tmp/pocket-recording-sdk-final-verified.log` | 56 passed in 2m34s. Real Worker FFI ran without skipping. Production Session and recording admission verify ready, SHA, ABI, declarations, and grants with real QJBC/metadata. |
| SDK `flutter analyze --no-pub`, `/tmp/pocket-recording-sdk-analyze-verified.log` | No issues found. Redundant imports in the new tests were removed. |
| `bash sdk/scripts/build_native.sh ios-sim`, `/tmp/pocket-worker-recording-ios-verified.log` | Release static archives for iOS arm64 and simulator arm64 and XCFramework packaging built. Device Worker HTTP and power remain separate acceptance tasks. |
| `bash sdk/scripts/build_native.sh android`, `/tmp/pocket-worker-recording-android-verified.log` | Android arm64 release `.so` built and installed under SDK jniLibs. Runtime and power still require device evidence. |
| `bash sdk/scripts/build_native.sh macos`, `/tmp/pocket-worker-recording-macos-verified.log` | macOS arm64 release library, production static archive, and `pocket_probe` built. |
| Demo JS, `POCKET_NATIVE_PROBE=.../sdk/native/target/debug/pocket_probe bun tests/native_guest_probe.ts --required`, `/tmp/pocket-native-guest-current-verified.log` | Current native loaded real QJBC and passed ABI, host response, and pointer/input/stress. The 100/500-node runs emitted 541/1761 DrawOps. |

This pass fixed cross-actor replay ordering, waits under the core lock, completion of active turns after Host stop, HTTP stub cleanup, and a lost broker-shutdown wakeup seen at runtime. The CPU guard uses thread CPU time and excludes wall-clock trace wait. Independent review proved in a real controller that deleting frame summaries could falsely match. Legacy formats missing required summaries or the clock envelope still parse, but replay returns unverified/rejected and cannot return matched. Production Live leaves recording gates and trace payloads disabled. High-refresh devices, physical power, and the full streaming, quota, backpressure, and mixed-domain matrix remain unaccepted. [Implementation plan](WORKER_RECORDING_REPLAY_PLAN.md)

## 2026-11-03: JS-First Boundaries and Real WeChat WASM Execution

New product policy stays in JS. The native Worker runner/offload broker captures execution facts JS cannot observe accurately. The default Dart provider no longer includes the unused sum/Fibonacci isolate path. Pure computation reuses JS Worker and Dart retains explicitly authorized native IO. No extra JS computation wrapper or Dart scheduler was added.

| Executed Command / Log | Result and Scope |
| --- | --- |
| `node sdk/targets/wechat/tests/qjbc_pointer.mjs /private/tmp/pocketjs-wechat-lobby-final-20261103`, `/tmp/pocket-wechat-independent-proof-final.log` | The coordinator independently ran real QuickJS WASM and Lobby QJBC/PAK. Pointer down/up changed count/visits and pixel digests, and storage response/dispose passed. WASM 2,647,634 bytes, Brotli 774,428 bytes, SHA-256 `fdc1e31b98fbafe5bf7c1f6e68d43e5e380eab7c4c121f4b948af5456c22dd79`. WeChat DevTools and device acceptance require independent runs. |
| `bun test --timeout 120000 sdk/scripts/tests/build_wechat_admission.test.ts`, `/tmp/pocket-wechat-admission-independent.log` | 3 pass, 6 expect. Worker/System are rejected before build, and a single Guest proceeds to real Guest build validation. The current WeChat target supports a single Guest and excludes dynamic System child apps, Worker HTTP, and offload. |
| Bridge `flutter test test/pocket_offload_runtime_test.dart`, `/tmp/pocket-js-first-offload-test.log` | 4 pass. HTTP redirect, cancel, and error boundaries survive, and the default provider leaves pure computation with JS. |
| SDK `flutter analyze --no-pub`, `/tmp/pocket-js-first-sdk-analyze-final.log` | No issues found. |
| SDK `flutter test test/system_host_test.dart --plain-name 'recording preserves an offload factory without creating a provider'`, `/tmp/pocket-js-first-config-test-final.log` | 1 pass. Recording configuration retains an explicit provider factory and attach leaves it unstarted. |
| `python3 sdk/scripts/check_architecture.py`, `git diff --check` | Passed. Demo Dart remains a thin host and SDK uses no Demo internals. |

Worker/IO archive replay has newer evidence. The historical UI-only recording totals below cover a different scope. [Implementation and acceptance](WORKER_RECORDING_REPLAY_PLAN.md)

## 2026-11-03: Host Recording and Offline Replay

Three existing GPT-5.6 Luna Max workers completed native clock, Dart transaction/library tests, and JS upstream adaptation/independent review without model escalation. The coordinator integrated SDK, archive, and JS controls and ran Flutter acceptance serially. The work added no second JS scheduler or Dart platform policy. [Current recording and replay implementation](RECORDING_REPLAY.md)

| Executed Command / Log | Result and Scope |
| --- | --- |
| `cargo test --locked --manifest-path sdk/native/Cargo.toml`, `/tmp/pocket-recording-native-final-tests.log` | 43 lib + 6 duplex = 49 passed, one manual throughput ignored. Covers strict scalar/idle replay, mode0 restoration, callable cached functions, resource order, and recording quotas. |
| `bash sdk/scripts/build_native.sh macos` / `ios-sim` / `android`, `/tmp/pocket-recording-native-{macos,ios,android}.log` | All three targets built, with Android arm64. Android recording/replay device execution remains pending. |
| Bridge, `POCKET_NATIVE_LIBRARY=.../native/target/debug/libpocket_flutter.dylib flutter test --no-pub`, `/tmp/pocket-recording-bridge-final-tests.log` | 83 passed, including real FFI, scheduling, input, drawing, and recording errors. The signed-zero regression was added later and appears in the focused run below. The counts overlap. |
| Bridge, `flutter test --no-pub test/pocket_recording_test.dart test/pocket_recording_ffi_test.dart` with the same native environment, `/tmp/pocket-recording-final-ffi.log`, `/tmp/pocket-recording-bridge-final-analyze.log` | 16 passed and analyze clean. Includes signed-zero, strict clock, raw RPC fields, duplex success/invalid submissions, resource tampering, quota overflow, deep events, continued execution after stop, and full digest ablation with recording enabled/disabled. |
| SDK, `flutter test --no-pub` / `flutter analyze --no-pub`, `/tmp/pocket-recording-sdk-final-{tests,analyze}.log` | 44 passed and analyze clean. Library tests reject unstarted, empty, and over-quota sessions. Invalid attachments do not stop recording early. Asset limits cover SHA, symlinks, filenames, and single-file size. |
| Demo, `flutter test --no-pub` / `flutter analyze --no-pub`, `/tmp/pocket-recording-demo-final-{tests,analyze}.log` | 20 passed and analyze clean. |
| Services, `flutter test --no-pub`, `/tmp/pocket-recording-services-final-tests.log` | 27 passed. |
| SDK, `bun test --timeout 60000`, `/tmp/pocket-recording-sdk-final-bun.log` | 51 pass, 0 fail, 424 `expect()`, 14 files. Recording cases run the real upstream clock/effects/devtools fixture and verify after removing Web TextEncoder. |
| Demo JS, `bun run build:system`, `POCKET_BUILD_GUEST=0 bash scripts/test_guest.sh`, `/tmp/pocket-recording-demo-final-{build,guest}.log` | Real Showcase/Profile/Lobby QJBC+PAK. JS bytecode ablation and native pointer/response/input/stress probe passed, with 541/1761 DrawOps at 100/500 nodes. |
| Duo, `flutter drive --no-pub --no-dds --driver=test_driver/integration_test.dart --target=integration_test/recording_replay_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409`, `/tmp/pocket-recording-duo-verified.log` | Two business cases passed. Final `+3` includes tearDownAll. Scenario one matched 388 transactions and 124 frame digests across three apps. Offline replay and export/import passed after all original sessions/native handles were destroyed. Scenario two actually clicked JS status/stop/replay/export and re-imported its export. |
| `python3 sdk/scripts/check_architecture.py`, `git diff --check` | Passed. The SDK is independent of Demo. |

The Duo input scenario used real Flutter TextInputClient and TestTextInput with Chinese and emoji, selection, and composing. Actual OS keyboard lifecycle has separate evidence below. Replay starts no hardware, network, or platform management providers. It verifies Guest output against host-boundary inputs and does not record camera video or Flutter/GPU pixels.

Acceptance fixed resource HashMap ordering that made identical-frame digests drift, Proxy invariant violations on read-only QuickJS `performance.now`, invalidation of cached clock wrappers after stop, one-ULP JSON f64 drift, rejection of valid optional undefined in upstream Tape, missing Web TextEncoder in QuickJS, inability to replay original failed duplex transactions faithfully, and diagnostic overflow/deep events overriding business results. Each was verified through a real native or device path, without catches, float tolerances, or counts-only comparisons to conceal failures.

Ablation retained one native host transaction trace and removed the redundant unreleased JS host observer. Official input tape remains an attachment and does not drive native replay a second time. Recording is off by default and does not copy duplex diagnostic payloads, wrap clocks, construct a recorder, or poll. Stopping restores mode0. Enabled/disabled ablation compares the entire frame digest. A single debug timing cannot establish power or production performance.

## 2026-11-03: Integration Validation Before Recording

These results come from available logs and worker verification. Duo `tearDownAll` is excluded from business-case counts, with no inferred passes beyond the logs. Simulator results leave physical device power, stability, and sustained FPS open.

| Scope / Evidence | Result |
| --- | --- |
| SDK Dart tests and analyze, `/tmp/pocket-sdk-current-final-tests.log`, `/tmp/pocket-sdk-current-final-analyze.log` | 33 passed. `No issues found`. |
| Demo Dart tests and analyze, `/tmp/pocket-demo-current-final-tests.log`, `/tmp/pocket-demo-system-final-analyze.log` | 20 passed. `No issues found`. |
| `pocket_services`, `/tmp/pocket-services-final-tests.log` | 27 passed. |
| Flutter bridge, `/tmp/pocket-bridge-post-fix-tests.log` | 68 passed, including actual FFI, stopped-clock/deadline behavior, external-response wakeup races, input, and T8 glyph painting. |
| JS SDK/System Bun, `/tmp/pocket-sdk-system-final-bun.log` | 50 pass, 0 fail, 418 `expect()` calls across 13 files. |
| Demand scheduler, `/tmp/pocket-demand-current-final-tests.log` | 11 JS behavior tests passed, with 54 `expect()`. In the actual JSX→QJBC/PAK→native ablation, the demand path ran one deadline callback and continuous ran 300. Both executed the deadline on virtual frame 300. Final wake delays were `-1` and `0`, respectively. |
| Pinned PocketJS upstream virtual clock, `/tmp/pocket-deterministic-clock-test.log` | 9 pass, 0 fail, 26 `expect()`. Covers clock, `after()`, effect FIFO/next drain, and trace. Full simulator and WASM need separate acceptance. |
| Full Demo JS pipeline, `/tmp/pocket-demo-guest-current-final.log` | Reducer, platform-neutral hardware contract, JS→frame ablation, Guest build, and static native probe passed. 100/500 nodes emitted 541/1761 DrawOps. |
| Duo SystemUI, `/tmp/pocket-duo-js-system-closure.log` | Three business cases passed. Final `+4` includes one `tearDownAll`. Covers real Guest A/B, shared identity, result/messages, failure cleanup, and prewarm reuse. One debug simulator ablation logged `cold=203ms`, `warm=105ms`, `residents=2`, `reused=true`. |
| Duo system keyboard, `/tmp/pocket-duo-system-keyboard-final.log` | One business case passed. Final `+2` includes one `tearDownAll`. Verified real system keyboard and viewport resize. |
| Native Rust | The workers reported 31 unit + 6 duplex = 37 passed and one manual throughput ignored. The accessible older `/tmp/pocket-native-tests.log` shows 30 unit + 6 duplex = 36 passed and one ignored, and is evidence for that earlier run only. |

The real Duo regression showed that Promise continuations lost their wakeup when external `host.response` arrived after a credited zero tick. The fix uses the QuickJS pending-job hint to keep the next real fixed tick awake and drain pending jobs. It adds neither synthetic ticks nor a second event loop. `cold=203ms` and `warm=105ms` come from one debug simulator ablation reusing the same instance. They verify path behavior without establishing physical power or stable performance gains. This pass did not set a 60 FPS cap or measure physical power.

The records below use the 2026-11-02 environment: Apple Silicon macOS, Flutter 3.35.7, Dart 3.9.2, Rust 1.93.1, Xcode 27.2, and an iOS 27.1 Duo simulator. Demo paths relative to SDK are `../demo/lib`, `../demo/assets`, and `../demo/js`. Historical `host/` and `guest/` paths document migration provenance.

## Real Runtime Pipeline

| Validation | Executed Result |
| --- | --- |
| Pinned upstream preparation, six patches, Guest compilation | Full `python3 scripts/prepare_upstream.py` and `bun scripts/build_guest.ts demo/js --out ../demo/assets` passed. Preparation was idempotent, and a worker applied every patch to a pristine temporary checkout of the pinned revision. |
| QuickJS bytecode compilation and load | Actual JS_EVAL_FLAG_COMPILE_ONLY + JS_WriteObject. Runtime uses JS_ReadObject + JS_EvalFunction. The host excludes app.js from the bundle. |
| Rust unit tests | 9/9 passed, including format, ABI, digests, real execution, and input. |
| Static native probe | QJBC load, ABI, host request/response, real pointer input, state, and navigation passed. |
| JS/bytecode ablation | Changing only the JS title and rebuilding QJBC changed the actual DrawList title. Dart/native stayed intact. |
| Flutter renderer unit/widget tests | Initial 11/11 and latest 15/15 after input lifecycle regression. Covers bytecode, cache, painting, pointer, FPS sampling, and input boundaries. See the input section below. |
| Signed-package Bun tooling | 10/10 passed, 92 assertions. |
| Service Dart tests | 14/14 passed, including rejection of signature tampering, unknown key, ABI, and blob digest, plus permission revocation/reactivation, late responses, and pointer cleanup. |
| Host analyze and widget tests | Passed. Later performance tests have a separate record. |
| Real macOS Flutter/native page tests | Count, Gallery round trip, Runtime/Bytecode/Plugins, real package_info_plus, and unconfigured update errors passed. |
| Real macOS signed update tests | Embedded → v1 → v2 → rollback v1. Correctly signed broken package failed startup and recovered to v1. Remounting the host still loaded the healthy cache. |
| iPhone Duo / iOS 27.1 simulator | Latest bytecode and plugins built. Count, real package_info_plus, 500 retained nodes, signed v1/v2, rollback, broken-package recovery, and cached restart all passed. |

Update tests locate actual `PocketCanvasPainter` text, then exercise Flutter gesture → FFI → JS. Apply must replace the PocketView/native instance. Broken-package recovery must observe a new instance, post-recovery ready, and the actual error. An old title alone cannot establish recovery.

Current bytecode sizes and ABI come from `../demo/assets/app.bytecode.json`. Recompile after each JS or SDK UI change so the artifact reflects the source.

## Editor production build / publish (2026-11-02)

`bun test editor/test/editor_server.test.ts scripts/tests/build_guest.test.ts` passed 4 tests and 61 assertions. Coverage includes multi-file read/write boundaries, explicit external projects, real builds with installed-only `@pocket/ui`, and exact node_modules restoration. Builds for one project are mutually exclusive, and CLI/Editor share `buildGuest()`. The script assertions in `tooling_scene.test.ts` checked the default Scene template and retention of a custom AppDelegate. They exited 0 without registering Bun tests.

Production `editor_live_probe.ts` verified real QuickJS qjbc/PAK, Ed25519 signing, blob digests, PAK reassembly, and prevention of stale-build publishing when source is broken. The final local service at `http://127.0.0.1:8790` ran the latest code. The multi-file API synced, froze, built, and published Showcase revision **17**.

- QJBC 233,227 bytes and PAK 333,536 bytes.
- ABI `quickjs-bytecode-v1:5ab2246bcbd64b9d66e396043be05c2f77e7a6ab78e3125c56f8a1f62019a021`.
- Independent checks passed for Ed25519, entry/PAK digests and sizes, 20 blobs, PAK reassembly, and metadata.
- Published entry `/updates/showcase/latest.json` and client public key configuration `/updates/showcase/host.json`.
- Editor and `../demo/assets` matched bytecode payload digest, size, and PAK. Build-path comments cause different sourceSha/header and overall qjbc digests, so the full bytecode files differ across paths.

The verification covers local loopback editing and publishing. Multiplayer production deployment was outside scope. The private key stays in the ignored workspace outside the Flutter package.

## Historical FPS Validation

- The upper-right label continuously reports current and minimum FPS in every build mode.
- Real iPhone Duo `fps_history_test.dart` blocked the UI thread for 45ms every 60ms for 3 seconds. The label's minimum dropped, the JS FPS page showed the history, the file logged low FPS/slow frames with maxGap≥40ms, and remounting read history successfully.
- Four persistence tests cover the 600-record cap, restoration, rejection of invalid values, and memory history surviving write failures.
- The 200ms stall test verifies that long gaps crossing a sample-window boundary are still recorded.

## Stress Page and Performance Scope

- The real native probe reported 544 DrawOps for 100 retained nodes and 1,440 DrawOps for 500.
- Actual iOS simulator taps created and drew 500 nodes before the update flow resumed.
- These runs cover correctness and load. Following a user low-FPS report, `performance_test.dart` compared optimizations in the original project and separately recorded engine, UI build, and raster metrics. Its three macOS profile and iPhone Duo debug scenarios ran at about 60Hz. [Performance record](PERFORMANCE.md)
- Physical device profile/release needs separate evidence from simulator debug.

## Fixes and Ablations

- Removed the legacy Demo mock C/runtime, Dart bundle runner, Dart business widget tree, duplicate routes, and story template/editor.
- Reused PocketJSKit's actual renderer, asset/text caches, and input bridge. Moved services into separate packages outside the renderer.
- Removed ScrollRail/WrapLines/WrapTextPage, which had no independent behavior, and the duplicate ActionBar that intercepted Home taps. The focus scope covers navigation.
- macOS uses a static runtime to resolve Xcode 27 dylib LINKEDIT alignment. The duplicate dylib test path was removed.
- The iOS host, Flutter framework, and Pods now share minimum iOS 15.0. The iOS force_load symlink path was fixed. UIScene and plugin registration follow the Flutter 3.35.7 example, and iPhone Duo launched successfully.
- Bytecode loading removed the ROM_DATA borrow flag so QuickJS owns valid data after the FFI input is freed. packageSource precedes embedded assets. A failed load has no source fallback.
- Fixed Dart extension recursion causing Stack Overflow, added regression coverage, and verified actual macOS/iOS paths.
- Switching packages invalidates the old generation and cancels old timers and late responses. Cache pointers move only after the first frame and a short healthy run.

## Unverified or Disconnected on 2026-11-02

This historical snapshot predates the 2026-11-03 GLYPH_RUN and demand scheduling verification above.

Android provider static manifest/minSdk, Dart channel contracts, and JS capability declarations passed, and the Android debug APK built with the arm64 native runtime. Android and iOS physical hardware, hardware keyboard/IME via `GuestFrame.text`, GLYPH_RUN, the general compositor, full component coverage, and sustained on-device performance remained open at the time.

## Flutter System Input Bridge (2026-11-02)

`../demo/integration_test/system_keyboard_test.dart` passed on the iPhone Duo iOS 27.1 simulator. Taps in the real bytecode Guest opened Flutter `TextField`/`EditableText`. `TestTextInput` drove the actual `TextInputClient` through Chinese input, emoji, selection/composing, deletion, done, navigation close, and JS draft restoration on return. The test did not call `demo.setText`. It uses a platform input stub, with system keyboard appearance and actual key taps checked separately. The upstream `GuestFrame.text` hardware keyboard/IME channel remained disconnected.

Guest state tests, architecture checks, the real native probe, and bytecode ablation passed. Coverage includes real pointer input opening an editor, measured rects, edit/submit responses, no redundant text echo, closure on unmount, compact viewport drag, and open→resize→rect-only update without closing input. Removal of JS OSK and integration of the original example's scroll reduced JS from 331889 to 301987 bytes, QJBC from 199041 to 179661 bytes, and PAK from 334560 to 291152 bytes. The editor sends rect-only updates only on actual geometry changes and preserves Flutter caret and composing state.

`system_keyboard_lifecycle_test.dart` passed on iPhone Duo iOS 27.1 using the real system keyboard without registering TestTextInput. It waited for actual viewInsets > 0 and asserted the same EditableTextState, focus, and open keyboard for three seconds. The input moved automatically into the reduced viewport. Tapping Gallery navigated and closed the keyboard. All 15 renderer tests passed, including canvas chunk additions/removals, transient insets, and outside-tap down/up ordering and dragging.

`page_scroll_test.dart` passed on the same device. Real multi-frame drags moved Home content to the bottom while keeping Header/Nav fixed. In Gallery under a real host constraint of 360px height, previously clipped content became visible after dragging, without a blank tail from an oversized fixed range. Navigation to Host still worked after scrolling. Full-size Gallery does not force scrolling when all content fits.

After scroll integration, `guest_interaction_test.dart` passed again on the same device. It covered the count, Home/Gallery/Host routes, bytecode information, real plugin responses, unconfigured update error, and stress-page interaction. Edge handoff for nested VirtualList scrolling remained outside scope. [Scroll reuse](SCROLL_REUSE.md)

Removing the overlay key in an ablation showed that changing canvas sibling count replaces EditableTextState. The stable key was retained and transient zero inset no longer implies close. [Input reuse](INPUT_REUSE.md) · [Scroll reuse](SCROLL_REUSE.md)

To address whole-page movement in the user's 12.17.35 recording, the framework viewport transition keeps the old native frame at 1:1 with top-left clipping while awaiting a resized frame. Previously it shrank to contain and then recovered. The extended `system_keyboard_lifecycle_test.dart` passed again on real iPhone Duo. Throughout keyboard open and close, main canvas scaleX/scaleY stayed 1 and left/top stayed 0 relative to the host in every Flutter frame. The same editor, focus, visibility after auto-scroll, and navigation close also passed. The test callback reads Element/RenderBox directly to avoid WidgetTester guard-protected queries during asynchronous pumps.

Standard `lib/main.dart` was restarted and left running. `artifacts/input/keyboard-after.mp4` records the actual keyboard open, input, and close. The 20fps transition review `keyboard-transition-after.jpg` shows full width and the top-left anchor. The iOS keyboard first-use prompt in the recording is system UI. Auxiliary surface scrolling retains bounded fit to avoid applying OverflowBox under unbounded height. All 15 renderer tests and analysis passed again.

The standard iPhone Duo Demo started detached from `lib/main.dart`. A display=3 capture visibly showed `FPS 60 | min 55`. The first 20 new log entries had a minimum of 55.4 and latest 60. The generated capture is `artifacts/performance/iphone-fps-label.png`.

## 2026-11-02: General Optical Surface and Host Regression

- `POCKET_TEST_ASSETS=../demo/assets POCKET_TEST_SOURCE=../demo/js/.pocket-build/app.js cargo test --locked --manifest-path native/Cargo.toml` passed nine native tests, including retained host surface registration, parameter updates, clipping, and release. Demo provides test assets explicitly. SDK no longer hardcodes its paths.
- `packages/pocket_services: dart test` passed 14 tests, including admission revocation after permission or activation failures.
- `packages/pocket_flutter: flutter test --no-pub` passed 20 tests, including safe area, keyboard overlap, nested taps, and platform texture grant revocation.
- `demo: flutter test --no-pub` passed 14 after adding the Android-shaped hardware contract. `flutter analyze --no-pub` was clean.
- Android hardware scaffolding passed `bun sdk/scripts/tests/android_scaffold.test.ts` for minimum permissions, Android 12 BLE flags, removal of unused media/recording/sensor permissions, and idempotent API 24 minSdk patching. `demo/js/tests/hardware_platform.test.ts` and `demo/test/hardware_plugin_test.dart` verify JS/Dart use platform-neutral hardware capabilities. Static tests leave Android device acceptance open.
- iPhone Duo iOS 27.1 `hardware_native_test.dart` passed real MethodChannel permission query, unsupported errors, and session cleanup. Physical camera, BLE, location, and biometrics need separate acceptance.
- iPhone Duo `glass_optics_test.dart` passed raw RGBA equivalence assertions using real FFI `SURFACE_QUAD`, Impeller shader, shape changes, disabled warp, surface removal, and clipping under a window offset. Screenshots are in `artifacts/showcase/glass-*.png`.
- Optical ablation removed duplicate Gaussian blur composition and reused the shader's sampling kernel. It fixed coordinates that treated the full backdrop canvas as a local lens. Only glass-bearing canvases isolate the sampling layer. Ordinary pages add no saveLayer.

```sh
cd ../demo
flutter drive --driver=test_driver/showcase.dart \
  --target=integration_test/glass_optics_test.dart \
  -d 4D366210-290E-46DB-8BC6-3C5233700409 --no-pub
```

The production page regression aggregates existing tests in `sdk_regression_test.dart` through a shared screenshot driver. The public SDK record below describes `duo_geometry_native_test.dart`, which independently verifies actual Duo open/close.

## Public SDK Integration Regression (2026-11-02)

- `sdk/test` session integration passed three cases covering independent appId, external plugin factories, missing required capability rejection, and close during initialization. Analyze was clean.
- Final `packages/pocket_flutter` run passed 25 and analyze was clean. Coverage includes native geometry conversion, stale-frame delays, nested and fixed viewports, FPS safe area, and existing input and drawing regressions.
- `packages/pocket_services` passed 14. Signed publishing tooling passed 10 tests and 92 assertions.
- `demo/test` passed 13 after public SDK migration. Hardware tests import `pocket_hardware` directly and no longer depend on a private host adapter.
- iPhone Duo `hardware_native_test.dart` passed again after automatic plugin registration, covering real qjbc launch, native MethodChannel availability and unsupported errors, and cleanup. Physical camera, BLE, and location still need separate device acceptance.
- An independent temporary project passed `init → build --platform=ios-sim → flutter analyze → flutter build ios --simulator --no-codesign`. SDK is independent of Showcase `demo/lib` and `demo/js`.

Eight SDK device scenarios, the signed update lifecycle, actual open/close Duo geometry, native hardware channels, and real pointer input on two independent scaffold projects passed. Editor revision 17 signing, 20 blobs, PAK reassembly, and host bytecode payload were verified and serve as the baseline before the input fix. After deleting the old directory, rebuild into a separate directory and the native probe passed with metadata matching the host. Device logs are `/tmp/pocket-sdk-device-verified.log`, `/tmp/pocket-sdk-updates-stable.log`, `/tmp/pocket-duo-geometry-final.log`, `/tmp/pocket-hardware-sdk-ios.log`, `/tmp/pocket-external-sdk-final.log`, and `/tmp/pocket-sdk-template-device.log`. Simulator channels leave physical hardware coverage open.

## Input Recording and Update Check Fix (2026-11-02)

After fixing the user's `14.44.40` recording, `input_regression_test.dart` passed four real cases on the same iPhone Duo simulator: system keyboard lifecycle and per-frame horizontal anchor, Chinese emoji selection/composing, real page scrolling, and Editor signed update Check. Flutter's +5 includes tearDownAll. The business count is four. The update reported `stage=verified`, `available=0.1.1`, and `lastError=none`. See `/tmp/pocket-input-device-final.log`.

Seven input package unit tests and analyze passed, along with the latest native QuickJS probe, mobile geometry assertions, and host analyze. New embedded qjbc was 235139 bytes and PAK 333472 bytes. Editor revision 18 published the same JS SDK with identical PAK, valid signature, and 17 verified blobs. Full server and embedded bytecode hashes may differ across build paths.

`artifacts/input/input-fix-keyboard.mp4` records the actual keyboard and `artifacts/input/input-fix-keyboard.png` is the screenshot. The video confirms a light input background, only necessary vertical scrolling when the keyboard opens, and stable right-side navigation. [Input reuse provenance and ablation](INPUT_REUSE.md)

The Editor service moved from a tool PTY to a temporary user launchd job (PPID 1). The isolated-port `editor_service.sh` start/status/stop, independent shell health check, and actual service-side compile passed. It explicitly forwards PATH/HOME only and needs another start after logout or restart. The standard app displayed `active=0.1.1` and `lastError=none`.

## SDK and Demo Entry Point Cleanup (2026-11-02)

The working directories are `sdk/` and `demo/`. `sdk/pubspec.yaml` defines the public Flutter package. `demo/` is the Flutter root and `demo/js/` contains pages and JS tooling. Demo's only runtime dependencies are Flutter and `pocket_sdk`, with other direct package references used for testing. CLI and Editor share `sdk/templates/app/app.tsx` (App) and `sdk/templates/game/app.tsx` (Game). `sdk/scripts/serve_updates.ts` is the sole local update service.

The new paths passed independent CLI init/build, Editor live build/publish, SDK Flutter tests, Demo analyze, JS reducer/mobile/native probe, and bytecode ablation. Nine Rust tests received Demo build artifacts explicitly and never silently skip a missing fixture. Final Demo qjbc was 235139 bytes and PAK 333472 bytes.

All four `input_regression_test.dart` cases passed the actual device regression from the final `demo/` path, covering per-frame system keyboard layout, Chinese/emoji/selection, page scrolling, and signed Update Check. See `/tmp/pocket-layout-device.log`. The shared compiler's per-file Bun file-dependency symlink regression passed 2 cases and 27 assertions and restored dependency links after build.

## Android Hardware Integration (2026-11-02)

- `sdk: bash scripts/build_native.sh android` succeeded. APK includes `lib/arm64-v8a/libpocket_flutter.so` (2,328,464 bytes).
- `demo: flutter build apk --debug --no-pub` succeeded. Hardware plugins register automatically and the merged manifest has minimum API 24.
- `demo: flutter test --no-pub` passed 14 and `flutter analyze --no-pub` was clean. Android scaffold idempotency, JS hardware/mobile tests, and SDK architecture checks passed.
- During installation for `hardware_native_test.dart` on MAA_AN00 (Android API 36), the device returned `INSTALL_FAILED_ABORTED: User rejected permissions`. The test did not start and made no hardware calls.
- Camera uses Camera2 and a Flutter Texture with private app files for photos. BLE, sensors, biometrics, and location use Android native APIs. Permission interaction, camera orientation/mirroring, BLE peripherals, GPS, and biometric user interaction still need device-specific acceptance.

The Android API 35 arm64 emulator passed the final run with `All tests passed`:

`flutter drive --driver=test_driver/integration_test.dart --target=integration_test/hardware_native_test.dart -d emulator-5554 --no-pub`

The emulator loaded actual 235,404-byte QuickJS qjbc and verified page launch, production native channels, permission state, structured unauthorized camera error, sensor response, and two session cleanups. An earlier inconsistent camera `PlatformException` was fixed to return the shared map. The rerun passed without weakening tests. Physical peripheral acceptance remains open. `pocket_flutter: flutter test test/pocket_surface_test.dart` passed two tests, including 90° rotation and mirroring of Texture. Dynamic rotation still needs device evidence.

After integration tests, standard `flutter build apk --debug --no-pub` passed again. `demo/build/app/outputs/flutter-apk/app-debug.apk` launches ordinary Showcase.

## 2026-11-13: Studio M7 hardening (shared components, keymap hooks, recording regression)

Linux container, real debug native library. New SDK surface: `Tree`, `SplitPane`, `TabsBar`, `ToastHost` (`SHARED_EDITOR_COMPONENTS.md`),
`CodeView onKeyDown`, `InputField autoFocus`, and a `PocketView` fix: host font metrics are now synced right after the runtime is created
(before compositor/offload/worker configuration) so a recording, which locks its font snapshot at the first recorded transaction, no longer
defers the sync and fails to load a native-text bytecode. Evidence: `studio/test/studio_recording_test.dart` records a real Studio journey
(open, edit, save, build, publish) and replays it offline and from the exported archive with every frame digest matching (about 355-375
transactions, 122-130 frames). `packages/pocket_ui/test/shared_components_{model,native}.test.ts` (bun 3 + probe 5). Full SDK suites after the
change: pocket_flutter 307 passed, sdk `flutter test` 202 passed, Rust all passed, pocket_services/pocket_studio/pocket_clipboard passed.
`bun test packages/pocket_ui ...`: 321 passed, 5 failed; the failures (`accessibility.test.ts` x2, Duo close hitbox in `system_kernel.test.ts`,
file-level errors in `wrap_text_lines.test.ts` and `flutter_widgets.test.ts`) come from `mock.module` leaking between files in one process and
persist with the new exports removed; each file passes when run on its own.
