# e06720e Remediation Review and Follow-Up Verification

This historical review independently assessed `e06720e5ab88e9ff211d3eedfe2d768cb77a004b` against `de8b051d3d87829ce25f50c021b74c0a11b7d6c8`, earlier baseline `bee700ebce1d044cfa27ad31c39e7e0f05bca149`, and `POCKET_SDK_AUDIT_REPORT_de8b051.md`. With explicit user authorization, six GPT-5.6-Luna / Max workers then addressed five residual defects and ran ablations. The coordinator integrated and reviewed changes and ran Flutter serially.

## Findings and Snapshot Boundaries

**Original e06720e fell short of the merge criteria.** It fixed most original issues. P1 residuals affected wakeup on first visible frame failure, rearming after Offload replies drain, and zero-tick analog stick input. P2 residuals affected the Worker HTTP total budget and WeChat disposal reentrancy. The existing green test suite missed these cases.

**The working-tree fixes passed the local pre-commit acceptance below.** All five residuals had targeted runtime evidence with no new blocker confirmed in the executed scope. These results apply to the corrected working tree. CLI, FFI, and Node coverage is separate from physical WeChat and Flutter device integration.

- Original snapshot: `/tmp/pocket-remediation-e06720e`. Evidence: `/tmp/pocket-remediation-logs/`.
- Integrated verification: `/tmp/pocket-fix-verify`. Final evidence: `/tmp/pocket-fix-e06720e/`.
- Concurrent work was captured as `preexisting.patch` and `preexisting-status.txt` and preserved. Integrated verification includes UI and performance changes present at capture, so test totals differ from the original target.
- Demo QJBC/PAK rebuilt in isolation and did not overwrite shared artifacts. A later concurrent edit to `demo/integration_test/showcase_mobile_test.dart` was outside the fixes and device integration was not run.

## Original Findings Rechecked

Line numbers refer to final source. Removed code points to its replacement. The target column assesses original e06720e, and follow-up covers the uncommitted fixes. Fixed refers to the listed defect. Device acceptance is separate.

| Original item | e06720e status | Follow-up code and runtime evidence |
|---|---|---|
| P0-1 Showcase capability declarations | Fixed | `demo/js/manifest.json:50` and `demo/assets/guest-manifest.json:50` declare `system.runtime.awaitFirstFrame`. `demo/lib/main.dart:23` adds compositor. Real `showcase_admission_test.dart` passed. `sdk/scripts/flutter_target.ts:65` keeps the role capability SystemUI-only. A negative probe rejected compositor for an ordinary profile child. See `compositor-isolation.log`. |
| P0-2 CLI and Editor Worker artifacts | Fixed | `sdk/pocket.ts:630`, `:653`, and `sdk/editor/server.ts:748` copy both Worker files. `:839` permits reading them. `sdk/scripts/build_guest.ts:553` and `:555` write Worker metadata, with domains, descriptor, and permissions preserved at `:574`. Original real CLI and Editor probes exited 0. See `cli_worker_repro.log` and `editor_worker_repro.log`. Final build_guest, package_update, Worker fixture, and Session passed. |
| P1-1 Unclosed turn and Worker error replay | Fixed | `sdk/native/src/worker_trace.rs:719` checks unconsumed events and active turns. `replay.rs:398` validates before preparing stop. `stop_worker_checked` in `lib.rs:734` checks `runtime.last_error()` after join. `sdk/packages/pocket_flutter/lib/src/pocket_runtime.dart:2935` rejects nested begin, orphan end, and unclosed trailing turns. Original and final real Worker recording probes rejected all three invalid structures. Final `worker-tamper-final.log` records two passes. |
| P1-2 Record captureStop cutoff | Fixed | `sdk/native/src/worker_trace.rs:604` waits for active turns in Record and marks incomplete on timeout. Record cutoff and timeout Rust tests and real `recording_worker_ffi_test.dart` passed. Final ablation keeps the `replay.rs:516` ordering of closing the Worker batch before propagating clock quota failure. |
| P1-3 WeChat idle clock and scale | Fixed | `sdk/targets/wechat/template/wechat-host.js:230` and `:275` skip based on elapsed time, without advancing when registering the schedule. `:146` preserves startup scale on resize. The original probe recorded `skipAtSchedule=[]`, one frame for early wakeup, and scale=2. Final lifecycle regressions include scale, hide, and show. Evidence is Node/Bun only. |
| P1-4 awaitFirstFrame and isPresented | Partial | Original already required a first frame and compositor visibility, but failure after producing an Offstage frame left the visible waiter pending. `sdk/lib/src/pocket_system_host.dart:1239` moves rejection outside `!hasEverProducedFrame`. Host FFI covers rejection, disposal while waiting, and recreation. Old logic failed with TimeoutException and fixed logic passed. SystemUI remains the compositor root with `isPresented=true`, documented at `:1379`. Concurrent integration assertions use that contract. Device integration was not run. |
| P1-5 Offload rearming and drains | Partial | Original drained request and cancel queues and had separate Dart 256-item counters and a second cancellation drain. Final-reply consumption still missed rearming. `sdk/native/src/offload.rs:590`, `:609`, and `:1257` check three queues under one lock. FFI notify_count rose from 2 to 3. Rust covers later submit, cancel, multiple replies, and stale replies. `pocket_offload_binding.dart:157` remains the Dart entry. |
| P1-6 On-demand scheduling, zero ticks, and idle time | Partial | Original `demand.rs:101` and related code cover axes, motion, and ongoing work. Idle credit consumption and patched `bindDpadScroll` were corrected. Zero-tick GuestFrame still missed analog sticks and recentering. `sdk/native/src/lib.rs:1730` and `:1776` reuse external_work_pending, with both sticks at `:2224`. Real QuickJS verifies both sticks and one-shot recentering without advancing virtual time. `pocket_view.dart:1025` retains resize wakeup. |
| P2-1 asyncStop and io.fact interleaving | Fixed | `sdk/native/src/worker_trace.rs:68` delegates offline io.fact to Workers. `worker.rs:1905` and `:2802` inject in global order and wait without passing other actors. Rust interleaving and stop and real Worker/HTTP offline replay passed. |
| P2-2 System LRU, cancellation, and stack back | Fixed | `sdk/packages/pocket_ui/src/system.ts:1235` protects presented split-screen instances. `:1267` clears presented IDs on destroy. `:1343` lets background callers cancel their own calls through a parent, and `:1419` delivers cancellations to live external callers. Final system_kernel Bun tests cover child caller cancellation and split-screen LRU. |
| P2-3 Worker and Dart HTTP | Partial | Original Dart `pocket_offload_runtime.dart:321` checks cancellation after openUrl, `:342` handles custom Content-Type, `:365` strips cross-origin sensitive headers, and `:382` removes entity headers when switching to GET. Worker per-hop remaining budgets still allowed a blocking body read to exceed the total. `sdk/native/src/worker.rs:3501` sets ureq overall timeout. Delayed headers/body and cumulative redirect tests passed. Non-interruptible DNS remains a documented ureq boundary. |
| P2-4 Session runtimeInfo and Worker versions | Fixed | `sdk/lib/src/pocket_session.dart:237` returns active or embedded Worker information. `:393` uses Worker-specific expectedTickHz and derives bindingGeneration from its descriptor. Actual OTA, Session, and Worker admission passed. |
| P2-5 WeChat cleanup and initial resize | Partial | Original cached window and keyboard changes during startup and sent resize at `pages/index/index.js:82`. dispose could still admit reentrant requests. `wechat-host.js:346` closes request admission. `:642` sets disposed before abort, isolates abort exceptions, and releases references before native destroy in finally. Original template passed two and failed three. Fixed template passed five. |
| P2-6 Child viewport | Fixed | `sdk/lib/src/pocket_system_host.dart:333` uses automatic viewport from `pocket_view.dart:2273`. `demo/integration_test/guest_interaction_test.dart:49` prefers inputEnabled PocketView for multi-instance support. Flutter compositor, input, and view passed. Device keyboard integration was not run. |
| P3-1 Surface focus and align | Fixed | `sdk/packages/pocket_flutter/lib/src/pocket_view.dart:2205` excludes zero-size and clipped-invisible application surfaces. `pocket_model.dart:121` and `:688` reject align outside 0..2 in JSON and binary. Model, compositor, and input passed. |
| P3-2 Mini-app target and docs | Fixed | `demo/js/scripts/build_mini_apps.ts:15` selects `pocket-flutter` in resolveSystemDocument. validateSystemFile only checks schema. test_guest rebuilt and executed this path and compositor docs were corrected. The unused buildGuest target argument was removed while retaining actual target resolution. |

## Residual Defects and Fix Evidence

1. **P1, next Offload notification lost after a reply drained.** With only replies queued, Dart consumed the final reply while wake_pending stayed true, so the next submit or cancel was coalesced. Real FFI `notify_count` rose from 2 to 3. The fix reuses the three-queue empty check and rearms under the same lock after consuming the final reply.
2. **P1, openApp hangs after an Offstage frame followed by failure.** Failure notification was outside hasEverProducedFrame, but visible waiter rejection still applied only before the first output. The serialized JS transaction queue could not handle the pending failure. An original probe measured destroys=0 while waiting. The real host regression reproduced TimeoutException on old code and received the runtime failure after the fix.
3. **P1, zero-delta omitted analog sticks and recentering.** Demand capture detected analog input but zero-tick GuestFrame skipped it. Original FFI reported `analog_zero_events=0`, then `=1` after the next tick. The fix reuses one-shot external work without incrementing time.
4. **P2, Worker HTTP body reads could exceed the total deadline.** Under a 300 ms budget, the original probe took 571 ms to finish one byte. Controlled ablation returned Ok(1) at 492 ms on the old agent and timed out at 301 ms on the fixed agent. The fix adds pinned ureq overall timeout and retains each hop's absolute deadline.
5. **P2, WeChat dispose reentrancy retained a request.** A synchronous cancellation callback could create a new request before disposed was set. The original probe reported `reentrantPendingAfterDispose=["reentrant"]`. The fix closes admission before abort and releases references even when provider abort or native destroy throws. It reuses disposed and the existing response contract.

## Ablations

| Original item | e06720e | Follow-up |
|---|---|---|
| Duplicate wasm-shim.c | Fixed | Remains removed. build_wechat builds pinned and verified upstream support source. |
| Scalar TraceClock ABI and last_* | Open | Removed legacy begin/end/last getters. `sdk/native/src/replay.rs:498` returns a transient envelope. Worker/offload v2 empty tracks and quota cleanup order remain. |
| PocketRecordingLimitException | Open | Removed the unused type and export. Quota still reports incomplete. |
| Recording aliases | Open | Removed uncalled completed. Retained recordedBytes and stop for existing public consumers. |
| Duplex stub and ABI wrapper | Open | Removed always-empty get_ring and actual_abi alias. Dart, probe, and bench use canonical runtime_abi. |
| Demo host barrel and config copies | Open | Removed demo/js/host.ts and import @pocket/ui/host directly. `sdk/lib/src/pocket_config.dart:112` retains a single field-copy boundary. |

External consumers of removed C ABI exports, `PocketRecordingLimitException`, `completed`, or the old buildGuest string overload must migrate to canonical APIs. In-repo call scans, builds, and real FFI passed. The six `REMEDIATION_*.md` files document sources, retained behavior, and decisions.

## Final Commands and Counts

Commands ran from corresponding projects under `/tmp/pocket-fix-verify`. Original target logs remain in `/tmp/pocket-remediation-logs/`. Flutter ran serially. The environment was:

```sh
export CARGO_TARGET_DIR=/Volumes/ORICO/Development/Github/pocket/sdk/native/target
export POCKET_NATIVE_LIBRARY=/Volumes/ORICO/Development/Github/pocket/sdk/native/target/debug/libpocket_flutter.dylib
export POCKET_RECORDING_WORKER_FIXTURE_DIR=/tmp/pocket-worker-fixture-fixed
export POCKET_NATIVE_PROBE=/Volumes/ORICO/Development/Github/pocket/sdk/native/target/debug/pocket_probe
export TMPDIR=/tmp
```

| Actual command | Final result | Log under /tmp/pocket-fix-e06720e/ |
|---|---|---|
| `cargo build --locked --manifest-path sdk/native/Cargo.toml` | PASS | cargo-build.log |
| `cargo test --locked --manifest-path sdk/native/Cargo.toml` | 82 passed, 0 failed, 1 ignored manual throughput benchmark | cargo-test.log |
| `python3 sdk/scripts/prepare_upstream.py --verify-only` | PASS, pinned revision 99924de47c62fa36f526a8791055d91cbbdb3836 | upstream.log |
| `python3 sdk/scripts/check_architecture.py` | PASS | architecture.log |
| `bun sdk/scripts/tests/worker_recording_fixture.ts /tmp/pocket-worker-fixture-fixed` | PASS, real UI/Worker QJBC and PAK | worker-fixture.log |
| `(cd sdk && bun test)` | 76 passed, 0 failed | bun-sdk.log |
| `(cd demo/js && bun test)` | 14 passed, 0 failed | bun-demo-serial.log |
| `POCKET_NATIVE_PROBE=.../pocket_probe bash demo/js/scripts/test_guest.sh` (run as `bash scripts/test_guest.sh` from demo/js) | PASS, modified real QJBC changed first frame. Pointer/input/host response/stress passed. | guest.log |
| pocket_services `flutter analyze --no-pub` and `flutter test --no-pub --concurrency=1 --reporter expanded` | 0 analysis issues, 27 passed, 0 failed, 0 skipped | flutter-services-*.log |
| pocket_hardware, same commands | 0 analysis issues. Test exit 1: `Test directory "test" not found.` No runnable suite. | flutter-hardware-*.log |
| pocket_flutter, same commands | 0 analysis issues, 116 passed, 0 failed, 0 skipped | flutter-flutter-*.log |
| sdk, same commands | Final 0 analysis issues, 62 passed, 0 failed, 0 skipped | flutter-sdk-analyze-final.log, flutter-sdk-test.log |
| demo, same commands | 0 analysis issues, 27 passed, 0 failed, 0 skipped | flutter-demo-*.log |
| `flutter test --no-pub --concurrency=1 --reporter expanded /tmp/pocket-review-worker-tamper_test.dart` (sdk) | Two additional passes covering truncation, nested begin, and orphan end | worker-tamper-final.log |
| `bun /tmp/pocket-fix-e06720e/compositor-isolation.ts` | PASS, root admitted and ordinary child denied compositor | compositor-isolation.log |
| `git diff --check` | PASS | Empty output, exit 0 |

The main matrix totals **404 passed, 0 failed, Rust 1 ignored**. Extra tamper, focused, and ablation tests are excluded. There were 232 Flutter tests and zero Worker FFI/Session skips. The hardware test command was unavailable and excluded from passes.

Initial parallel Bun upstream builds hit EEXIST during dependency linking. Serial reruns passed. Initial host test analysis reported a redundant import and unused variables. Cleanup and rerun yielded zero issues. Old-logic ablations failed as expected. Original failure logs were retained.

The independent review did not run WeChat DevTools, physical WeChat, or Flutter device integration. It did not start a browser, stop existing services, or read private keys. Later authorized integration and parallel Argon simulator results are in `COMBINED_REVIEW_HANDOFF_e06720e.md`. The original target retains its failed merge assessment.
