# Remediation after the a5dd273 review

Work was split with Argon. Argon handled OTA and Store, Editor security, method permissions, and the iOS hardware manager. This work covered production transport, binary frames, scheduling, the build toolchain, optional dependencies, and test entry points. End-to-end permissions and update acceptance remained separate after merging Argon's changes.

## Sources and ablations

The thin-host implementation referenced the retained project, excluding `pocket_host`.

- `BinaryDrawCmd` in `pocketjs_flutter_demo/native/pocket_runtime_multi.c` informed compact numeric transport. PFB1 consumes real PocketJS FrameOp and keeps the existing engine and layout. The old C state arrays were left behind.
- The SVG specification in `pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_graphics.js` remains relevant. Unused SDK `compute3dMechaFrame`, `compute2dParticleFrame`, line/arc types, and tests that only checked math were removed. They had no integrated rendering path.
- Hardware stays in `pocket_hardware`, registered by existing `pluginFactories`. The duplicate `enableHardware` switch is gone. Core package dependency resolution excludes `pocket_hardware`, and Showcase declares it explicitly.
- A prior cleanup removed the historical `sdk/migrations` archive. Source docs and AGENTS no longer require the missing archive.
- System input references Screen/ListView and `_PocketFlutterNativeKeyboardInput` in retained `lib/render/pocket_ui_components.dart` (roughly lines 877–942 and 3507–3675), and the Card keyboard example in `mini_apps/syslib/pocket_syslib_pages.js`. Keep the OS TextField, scrolling field, and bidirectional synchronization. Layout remains JS. Legacy collapsed-selection sync would lose composing state and was left behind.
- Input scrolling disproved an optimization hypothesis. In isolated `/tmp/pocket-style-ablation.rAZXtP`, both `c35a3fe` and explicit `View({get style(){…}})` instead of inline JSX compiled to reactive getters. Real resize/drag moved input text y through `354 → 304 → 255.64 → 208.866`, with the nearby Counter moving in sync and overlay rect y `346 → 296 → 247.64 → 200.866`. The redundant rewrite was reverted. Full-page Duo host acceptance is separate.

## Interface adjustments

- The core `pocket_sdk` barrel exports app entry, config, session, plugin contracts, and necessary controller, event, and duplex types. Import low-level rendering and diagnostics from `pocket_flutter`.
- Hardware consumers remove `enableHardware`, add `pocket_hardware`, and configure a top-level factory returning `HardwarePlugin`. See SDK_INTEGRATION.md and demo/lib/main.dart.
- Bundled metadata version/build enters Session runtimeInfo/status. Bundled packages now report their build. See TOOLCHAIN_NOTES.md for build sources and platform artifact isolation.
- The new frame ABI transports compact binary DrawOp and raw pixel bytes. Dart immediately copies borrowed buffers before decoding. Native pixel pointers stay within their borrow lifetime. The old JSON ABI remains for explicit compatibility and probes.

## Corrections to the review

- P2-4 referred to `patchIosSceneDelegate` and `PocketHardwareManager.handleIncomingDeepLink`, which were absent in a5dd273. `patchIosSceneLifecycle` supports Flutter scene startup. Preserve startup compatibility and treat deep links as a separate capability.
- `Referrer-Policy=no-referrer` alone does not establish that browser POST omits Origin. Editor write entry points still require strict checks, and browser claims require runtime verification. The prior round reproduced a different loopback Origin writing multipart data across ports. Argon handled the fix.
- Native SPSC zero-copy describes transport through reserved slots and atomic cursors. Pointer compatibility can still construct original JS events, so allocations may occur elsewhere.

## Verification

Commands ran in the real worktree with the production runtime. Flutter subpackage commands ran from each listed directory.

| Scope | Command | Observed result |
| --- | --- | --- |
| Rust runtime | `cd sdk/native && cargo test --locked` | 23 passed, one manual benchmark ignored. |
| SDK | `cd sdk && flutter test --reporter expanded` | Five passed. |
| Flutter bridge | `cd sdk/packages/pocket_flutter && POCKET_NATIVE_LIBRARY="$PWD/../../native/target/debug/libpocket_flutter.dylib" flutter test --reporter expanded` | Final 51 passed with real FFI enabled, including GuestFrame consuming pointer-up before outside dismiss and actual input text alignment. See `/tmp/pocket-bridge-final.log`. |
| Services | `cd sdk/packages/pocket_services && flutter test --reporter expanded` | 26 passed. |
| Showcase | `cd demo && flutter test --reporter expanded` | 18 passed, including real manifest and factory admission. |
| Showcase JS | `cd demo/js && bun test` | 11 passed. |
| Guest/native | `cd demo/js && bash scripts/test_guest.sh` | Actual QuickJS bytecode, input version round trip, 100/500-node frames, and graphics ablation passed. |
| Static checks | `cd sdk && flutter analyze`, `cd demo && flutter analyze`, `python3 sdk/scripts/check_architecture.py` | Passed. |
| Android build | `cd demo && flutter build apk --debug` | Passed. |
| iOS simulator build | `cd demo && flutter build ios --simulator --debug --no-codesign` | Passed. Runner exports binary frame, duplex, and create symbols. |
| Duo actual clicks | `cd demo && flutter test integration_test/guest_interaction_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409 --reporter expanded` | Passed. Argon fixed the earlier microphone declaration blocker and subsequent startup and clicks worked. |
| Duo system input | `cd demo && flutter test integration_test/system_keyboard_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409` | Passed. |

Final verification:

- `cd sdk && TMPDIR=/tmp bun test` passed 19 tests and 258 assertions. `bun test scripts/tests/build_guest.test.ts` passed four and 58 assertions. After the final Editor packaging change, `bun test editor/test/editor_server.test.ts` passed four and 98.
- Actual compilation from Editor build 42 to 43 updates `app.bytecode.json`, the output manifest, and host asset manifest together. Older pocket/manifest build 1 cannot mask the new build. Invalid Editor build 0 fails without falling back to a valid build in another file.
- Editor API tests confirm that rebuilding after config `0.1.0+1 → 0.2.0+2` updates the download manifest and preserves capabilities. The source manifest no longer duplicates release identity.
- Final `cd demo/js && bash scripts/test_guest.sh` passed. Then `cd demo && flutter build apk --debug` built current assets in 64 seconds.

Duo device tests used the simulator. Physical iPhone and Android hardware, 120 Hz FPS, and TSAN remain outside their scope. The native SPSC lock-free atomic protocol passed, with JS/Dart allocation and locking outside that claim.

## Duo input and scroll reproduction

Strict Duo testing found a resize from `951×669` to about `951×405` placed the Flutter field at `(32,366)` while the JS input card was absent. See `/tmp/pocket-fix-keyboard-lifecycle-final.log`.

The same arm64 dylib gave identical geometry for JSON and PFB1. A native reproduction isolated timing. Before the fix, consecutive `frame(0)` calls after resize had only 111 ops. The first `frame(16)` produced 148 ops, input text y372, Counter y320, and a field rect at y364. Page `ensureVisible` ran only in `onFrame`, which an immediate zero-time resize frame skips.

The fix uses the existing synchronous `display.viewport` bridge to measure in JS, call `ensureVisible`, and synchronize the field rect. `onFrame` continues to handle inertia and ordinary scrolling. Resize does not advance artificial time. The display bridge shares one dispatcher and removes observers on unmount. The input inherits the page clip and keeps one EditableText. When layout is temporarily unavailable, use the fallback already in visual coordinates without subtracting offset again. Height remains measurable when content width is temporarily zero.

After the fix the first actual QJBC `frame(0)` has 148 ops, input title y320, input text y372, Counter y320, and field rect y364. The next zero-time frame emits no redundant field update. Duo tests now check full-page movement and absolute Flutter hint and JS text coordinates.

On 2026-11-02, isolated `flutter drive --no-pub --no-dds --driver=test_driver/integration_test.dart --target=integration_test/native_resize_regression_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409` exited 0. Real iOS FFI kept page anchor and field rect synchronized through 20 resize segments and subsequent stable frames. See `/tmp/pocket-native-drive-duo.log`. That test does not create PocketView, so it covers a separate boundary.

The full host ran `system_keyboard_lifecycle_test.dart` with the same driver. It first spotted Flutter hint top 3 px above JS text top (`370.5719` vs `373.5719`). See `/tmp/pocket-keyboard-drive-duo.log`. TextField inherited Material 3 line height. The fix explicitly uses native `font_slot_line_height` rule `ceil(fontSize * 1.2)`, preserves the 2 px assertion, and adds no translation. A widget test measures the actual hint RenderBox.

The full host then passed in `/tmp/pocket-keyboard-drive-aligned-duo.log`. After removing temporary safe-area diagnostics, final source passed two consecutive runs in `/tmp/pocket-keyboard-final-1.log` and `/tmp/pocket-keyboard-final-2.log`. At the end of 60 samples each, Flutter hint and JS text matched at `(44,372)`, input title and Counter at y320, and field rect at `(32,364)-(360,397)`. EditableText and focus were retained. One Gallery click navigated and dismissed the keyboard. Neither run reproduced the 111-op missing card. Bounded failing-frame logs are retained.

On this machine `flutter test --no-dds` encounters a golden comparator VM stream subscription error. Acceptance used the existing `flutter drive` entry to isolate the product check. Physical Android and iPhone input, fonts, and other fold postures remain open.

## Follow-up after dd6059d (2026-11-03)

This records sources and implementation alongside the user-provided root review. Although that review marked earlier P1 items closed, independent tests reproduced Editor static symlink escapes, missing indirect location permissions for weather, explicit rollback promotion failing health, old Session failures affecting a replacement, and missing iOS photo-save callbacks. These were fixed in this round.

### Four boundary fixes

- Flutter input hits and paint share the intersection of field and page clips. Invisible parts no longer intercept Guest taps. Reuse the old project's OS TextField and scrolling behavior from `lib/render/pocket_ui_components.dart`, with JS-owned layout.
- A zero-width viewport uses `ScrollablePage`'s existing column fallback. Height remains measurable for zero-width content. Automatic ensureVisible consumes its own offset, so the next frame does not interpret it as user scrolling and close input. This reuses `display.viewport` and the scroller. Sources include retained `lib/render/pocket_ui_components.dart` and PocketJS clear examples. The former archive has been deleted.
- The idle timer probes one frame and sleeps again if nothing changes. External events still wake it. The first idle timestamp preserves the entire sleep interval across probes for exclusion. Sources include `lib/core/perf_monitor.dart` and `native/pocket_runtime_multi.c`. The existing ticker and native delta ABI remain the scheduler.
- CLI and buildGuest share `resolveReleaseIdentity`. They select one object by editor > pocket > manifest, default any missing fields in the selected object to 0.1.0 and 1, reject invalid fields, and never merge identities across files. Editor fallback preserves pocket.build. Build must be a positive safe integer. Update-enabled Sessions need a valid bundled build. Older offline artifacts can omit it.

### State, permission, and lifecycle

- Session/store tests use real signatures and persistent pointers for bundled build 1 → OTA 2 → store-bundled 3 plus two restarts. Native probe separately verifies actual QJBC.
- Explicit rollback uses the prepared package's single isRollback flag and existing store.rollback. Normal updates retain anti-rollback. Explicit targets are limited to previous/lastGood. Session removes its duplicate rollback flag and keeps original lastGood through the health window.
- Async widget initialization captures the Session it created. A failed old instance only cleans itself and cannot set the replacement's startup error.
- Weather needs location permission only without supplied coordinates. Network-only with coordinates works. Tests run actual negotiate, activate, and invoke through the manager. The source is `lib/core/real_hardware_bridge.dart`, and required plugin grants remain scoped.
- iOS captures retain results until album save completes. Capture ID and generation must match. Busy requests do not advance the current generation, and stop/dispose cancels once. Sources are `ios/Runner/AppDelegate.swift` and `lib/core/real_hardware_bridge.dart`. The manager and cameraQueue own the implementation.
- Editor validates static path components for source, files, manifest, assets, config, and legacy state. `lstat` detects dangling symlinks. First regular-file writes remain allowed and final open uses `O_NOFOLLOW`. Concurrent parent replacement by a hostile same-UID process is outside the boundary. Covering it requires directory-FD traversal or filesystem isolation.

### Ablation and execution evidence

Restoring the zero-width viewport branch or removing previousOffset sync independently failed the corresponding JS regression. Idle checks sample first-window FPS over four 250 ms probes, verify that the timer stops after one probe, and retain controller and pointer wake tests. The actual QJBC ablation proves that changing bytecode changes the first native frame.

Actual execution passed Rust `cargo test --locked` (23 passed, one manual benchmark ignored), all SDK Bun and Demo JS tests, `bash scripts/test_guest.sh`, and architecture checks. Both original Editor symlink negative controls returned 400 without touching external targets. Service tests cover legitimate external projects, build 42 without editor.json, first writes to new directories, and upload controls. See the delivery notes for Flutter and device closeout. Swift parse and simulator compilation leave physical camera and album checks open.

Independent candidate review confirmed that early return for valid editor.json skipped pocket.json validation and real compilation followed relative source symlinks. Both configs are now checked before startup/load. The Editor build reuses static input-tree validation for custom entries, source links, nested assets, and symlinked cache directories. node_modules and existing vendor/pocket-ui are trusted package boundaries. Generated directory contents are left unscanned and ordinary external imports follow the local bundler. This is static input validation. It provides no filesystem sandbox for arbitrary untrusted JS. Positive controls run buildGuest and produce QJBC.

A new rollback failure control covers missing previous pointers. When explicit rollback to bundled content fails before the health window closes, Session can immediately restore the verified OTA recovery target without a process restart. The reference exists only during explicit bundled rollback health. Promotion still uses package.isRollback.

| Scope | Command and directory | Result |
| --- | --- | --- |
| Rust | sdk/native: cargo test --locked | 23 passed, one manual benchmark ignored. |
| Session and SDK | sdk: flutter test --no-pub --reporter expanded | 19 passed, including explicit rollback, failed recovery, restart, store update, and stale Session async failure. |
| Bridge and actual FFI | sdk/packages/pocket_flutter: POCKET_NATIVE_LIBRARY="$PWD/../../native/target/debug/libpocket_flutter.dylib" flutter test --no-pub --reporter expanded | 53 passed with FFI tests enabled. |
| Services | sdk/packages/pocket_services: flutter test --no-pub --reporter expanded | 27 passed. |
| Demo and hardware permissions | demo: flutter test --no-pub --reporter expanded | 20 passed, including weather permutations through the actual manager. |
| SDK Bun, Editor, UI, and build | sdk: TMPDIR=/tmp bun test | 28 passed with 314 assertions, including security negative and valid controls and actual compilation. |
| Demo JS | demo/js: TMPDIR=/tmp bun test | 11 passed. |
| QJBC, ablation, and stress | demo/js: TMPDIR=/tmp bash scripts/test_guest.sh | Passed. Actual bytecode edits changed native frames, and 100/500-node and input round trips passed. |
| Static analysis | sdk: flutter analyze --no-pub, demo: dart analyze | Clean. |
| Architecture and patch checks | python3 sdk/scripts/check_architecture.py, git diff --check | Passed. |
| Swift | swiftc -frontend -parse sdk/packages/pocket_hardware/ios/Classes/PocketHardwareManager.swift | Passed. |
| Full Duo host | demo: flutter drive --no-pub --no-dds --driver=test_driver/integration_test.dart --target=integration_test/system_keyboard_lifecycle_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409 | Xcode compile and test passed. After 60 samples, hint and JS text matched at (44,372), page anchors at y320, and focus and single-click navigation were preserved. |

One rollback state ablation left a stale field reference. The first compile failed, then was fixed and rerun. Another concurrent rollback test failed because it lacked a declaration and initial health wait. After adding real capability admission and the health phase, all 19 passed with assertions, permissions, and anti-rollback checks intact.

This round ended without a commit. Physical iPhone and Android cameras, album callbacks, and all fold postures remain outside this acceptance, as do Linux/macOS cross-host builds.
