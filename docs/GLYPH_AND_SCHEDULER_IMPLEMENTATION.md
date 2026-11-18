# Glyph and Demand Scheduler Implementation

Baseline `bee700e`, 2026-11-03. The integration preserved PocketJS layout, font, and fixed-step semantics and added the missing host adapters. It reused the existing text layout and JS event loop.

## Work Assignment and Sequence

1. `glyph_impl` consumed GLYPH_RUN in the Rust DrawList projection. It reused upstream glyph pages, image/PFB1 tag 6, T8 decoding, and resource revisions. It checked coordinates, density, UVs, coverage, clipping, font replacement, and caching. Scheduling was outside its scope.
2. `scheduler_engine_impl` added reproducible patches to the upstream pin for JS continuous work, the next virtual timer, and safe idle fast-forward. Core reports animation, timeline, and physics work. Ordinary onFrame callbacks are conservatively continuous. Known input and geometry observers run on events, and scroll inertia requests continuous frames only while moving.
3. `scheduler_flutter_impl` integrated the optional native scheduling ABI. Continuous work uses vsync, known idle stops the ticker, and a known deadline uses a one-shot Timer. Input, asynchronous responses, keyboard, and lifecycle events wake it directly. Legacy guests and libraries without the contract stay on vsync to avoid missed wakeups.
4. The coordinator integrated the native scheduling adapter after glyph work, handled long-idle virtual time and external-message accounting, updated Showcase activity hints and documentation, and validated the integration.

Workers used GPT-6 Luna / max because the requested 6.1-Luna was unavailable in the tool. This difference was reported. Workers shared the workspace, edited assigned paths, preserved other edits, and created no additional agents.

## Interface Contracts

- JS `__pocketWorkState()` returns `{version: 1, continuous, framesUntilTimer, simulationHz}`. Run continuously when state is uncertain.
- JS `__pocketSkipIdleFrames(n)` advances idle virtual frames without callback or animation effects, stops at the next timer, and returns the actual number skipped.
- Core `Ui::has_pending_work()` exposes actual pending work. An unchanged previous frame does not predict future work.
- Native `pocket_next_wake_delay_ms(handle)` returns negative for indefinite idle, zero for continuous or unknown work, and positive for milliseconds until the next deadline. Dart uses this value for deadlines.

## Ablation and Acceptance

| Scenario | Required result |
| --- | --- |
| Static page stays idle | After one stable transaction, no periodic FFI calls or 100ms probe Timer. |
| Animation, inertia, ordinary onFrame | Vsync continues and work state is recalculated when work ends. |
| after() longer than five seconds | One deadline wake, correct callback order, and no starvation from the former 1000ms frame cap. |
| Input, IME, asynchronous host.response | Idle execution wakes directly and preserves page and input behavior. |
| Reload, dispose, background | Cancel the old Timer before it can reach a new generation or disposed runtime. |
| Legacy bytecode or native library | Continuous vsync compatibility when the work-state interface is absent. |
| Mixed glyphs and atlas replacement | Correct image coverage, UVs, and tint. Reuse the cache and invalidate on replacement. |

Run real behavior tests for each worker scope first, then Rust, Flutter bridge, SDK and Showcase JS, architecture checks, and device input regressions. Base performance conclusions on measured frame calls and wakeups. Device power percentages require device power measurements.

## Sources and Scope

The study reviewed retained `pocketjs_flutter_demo/native/pocket_runtime_multi.c` outside pocket_host. It provided historical approaches for skipping redundant frames, fixed binary records, and FFI. The integration gets actual glyph support from pinned upstream `engine/render/glyph-pages` and `Ui::prepare_glyph_page`. It gets scheduling from deterministic virtual timers and the frame lifecycle in `framework/src/clock.ts`, along with actual core activity. New code supplies the missing host protocol and wakeup bridge.

Unicode shaping, color emoji, and rotated glyph behavior follow the upstream contract. See [GLYPH_RUN_STUDY.md](GLYPH_RUN_STUDY.md).

## Integration Follow-ups

- Removed global work hints for constant passive observers. Callbacks still run on actual event frames, and work-state queries avoid scanning duplicate false hints. Coverage includes 256 passive observers.
- Showcase request timeouts use `after()` for 30 seconds, eliminating 1800 continuous frames while waiting. Transitions use actual simulationHz.
- External JS calls after ticker shutdown obtain a fresh bounded execution budget through `with_turn`, preventing the previous frame's expired 250ms budget from interrupting valid handlers.
- Enabled native physics bindings. Corrected the SURFACE_QUAD inline visible-area projection, preserving full texture geometry and reusing the existing clip field.
- Supported and pending capabilities are listed in [POCKETJS_FEATURE_PARITY.md](POCKETJS_FEATURE_PARITY.md).

To run the scheduler regression, build the current native probe and run `bun run test:demand` in `sdk`. It covers JS behavior and a real JSX→QJBC/PAK→native ablation. For the same five-second timer, continuous execution invokes observers 300 times before the deadline. Demand scheduling invokes them once. Both fire at virtual frame 300 and update the text. Demand scheduling then returns `-1` for idle.

## Historical Worker Verification, 2026-11-03

Commands ran from the root, SDK package, or Demo as indicated. The next section records the final run separately.

| Command or scope | Result and evidence |
| --- | --- |
| `cargo test --manifest-path sdk/native/Cargo.toml` | 30 native library tests and six duplex integration tests passed. One manual throughput benchmark was skipped. Covered real QJBC and PAK glyphs, resource replacement, surface inline clips, long idle, and external wakeup budgets. Log `/tmp/pocket-native-tests.log`. |
| `bash sdk/scripts/build_native.sh macos` and `ios-sim` | Both native builds passed. iOS device and simulator libraries were regenerated. Logs `/tmp/pocket-macos-native-build.log` and `/tmp/pocket-ios-native-build.log`. |
| `bun run test:demand` (`sdk/`) | JS scheduling and real JSX→QJBC/PAK→native ablation passed. Observer callbacks fell from 300 to one, with both timers firing at frame 300. Log `/tmp/pocket-demand-tests.log`. |
| `bun test` (`sdk/`) | 39 tests and 371 assertions passed. Log `/tmp/pocket-sdk-bun-tests.log`. |
| `POCKET_BUILD_GUEST=0 bash scripts/test_guest.sh` (`demo/js/`) | Guest state, hardware declarations, input, real pointer events, bytecode ablation, and stress page passed. 100 and 500 nodes produced 541 and 1761 DrawOps, respectively. Log `/tmp/pocket-demo-guest-tests.log`. |
| `POCKET_NATIVE_LIBRARY=.../sdk/native/target/debug/libpocket_flutter.dylib flutter test --no-pub --reporter expanded` (bridge) | 62 passed, covering real FFI, ticker shutdown and deadlines, synchronous response wakeup races, input, and T8 glyph pixels. Two glyph pixels were `[136,16,32,255]` and `[8,144,32,255]`. Background remained outside the clip. Log `/tmp/pocket-bridge-final-tests.log`. |
| `flutter test` (`sdk/` and `demo/`) | 19 and 20 passed, respectively. Logs `/tmp/pocket-sdk-flutter-tests.log` and `/tmp/pocket-demo-flutter-tests.log`. |
| `flutter drive ... --target=integration_test/system_keyboard_lifecycle_test.dart -d 4D366210-290E-46DB-8BC6-3C5233700409` (Demo) | One functional case passed on the Duo simulator. Log count `+2` includes `tearDownAll`. Covered the system keyboard, page scrolling, editor identity, and per-frame geometry stability. Log `/tmp/pocket-duo-demand-drive.log`. |
| `python3 sdk/scripts/check_architecture.py` | Passed SDK and Demo entry-point checks and verified that the SDK does not depend on Demo or the legacy business renderer. |

The glyph pixel test uses real T8 decoding and the PocketView canvas with an injected frame to isolate Flutter projection. Native tests separately cover real QJBC and PAK up to the frame boundary. Visual results for other fonts, scripts, and devices require separate coverage. Duo results come from a simulator and cover functional behavior.

FPS samples exclude intentional sleep and measure intervals with continuous frame requests. The initial device test dispatched discrete counter events every 16ms. The scheduler returned to sleep after each event, so it never collected a continuous window and the numeric label assertion failed. The device regression now uses a real transition to hold continuous work and injects a UI stall during that interval. Separate scheduler and duplex tests cover discrete-event wakeups and the next-frame response. A missing numeric FPS value alone does not indicate a stall.

## Final Verification, 2026-11-03

This section uses the final readable logs or explicitly attributed worker verification. Duo `tearDownAll` entries are excluded from functional case counts. See [VALIDATION.md](VALIDATION.md) for the full regression list.

| Scope or log | Confirmed result |
| --- | --- |
| Native Rust | A worker reported 31 unit and six duplex tests passed, with one manual throughput benchmark ignored. The readable `/tmp/pocket-native-tests.log` is an earlier run with 30 unit and six duplex tests passed and one ignored. |
| Demand scheduler, `/tmp/pocket-demand-current-final-tests.log` | 11 JS behavior tests passed with 54 `expect()` calls. Real JSX→QJBC/PAK→native ablation gave one deadline callback in demand mode and 300 in continuous mode. Both fired at virtual frame 300. Final wake delays were `-1` and `0`, respectively. |
| Pinned upstream clock, `/tmp/pocket-deterministic-clock-test.log` | 9 pass, 0 fail, 26 `expect()` calls. Covers virtual clock, `after()`, effect FIFO and next drain, and tracing. Full simulator/WASM verification is separate. |
| Flutter bridge, `/tmp/pocket-bridge-post-fix-tests.log` | 68 passed, covering real FFI, ticker shutdown and deadlines, external-response wakeup races, input, and T8 GLYPH_RUN UVs, coverage, clipping, and tint. |
| JS SDK/System Bun, `/tmp/pocket-sdk-system-final-bun.log` | 50 pass, 0 fail, 418 `expect()` calls across 13 files. |
| SDK, Demo, and Services | SDK 33 tests and analyze passed. Demo 20 tests and analyze passed. `pocket_services` 27 passed. Logs `/tmp/pocket-sdk-current-final-tests.log`, `/tmp/pocket-sdk-current-final-analyze.log`, `/tmp/pocket-demo-current-final-tests.log`, `/tmp/pocket-demo-system-final-analyze.log`, and `/tmp/pocket-services-final-tests.log`. |
| Demo JS end to end, `/tmp/pocket-demo-guest-current-final.log` | Reducer, platform-neutral hardware contract, JS→frame ablation, guest build, and static native probe completed. 100 and 500 nodes produced 541 and 1761 DrawOps. |
| Duo SystemUI, `/tmp/pocket-duo-js-system-closure.log` | Three functional cases passed. Final `+4` includes one `tearDownAll`. The log covers real A/B guests, shared identity, results and messages, failure cleanup, and prewarm reuse. Ablation gave `cold=203ms`, `warm=105ms`, `residents=2`, and `reused=true`. |
| Duo system keyboard, `/tmp/pocket-duo-system-keyboard-final.log` | One functional case passed. Final `+2` includes one `tearDownAll`. Covered the system keyboard and viewport resizing. |

The Duo test exposed a missed Promise continuation wakeup when external `host.response` arrived after a credited zero tick. The fix added a QuickJS pending-job hint to keep scheduling active until the next real fixed tick drains pending jobs, using the existing event loop and tick count. The `cold=203ms` and `warm=105ms` values came from a single debug simulator ablation reusing the same instance. They serve as functional evidence. FPS statistics are uncapped at 60. Sustained performance, higher refresh rates, and physical power consumption require hardware measurement.
