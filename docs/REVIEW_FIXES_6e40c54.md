# 6e40c54 Review Fixes and Ablation

See the [review snapshot](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/POCKET_SDK_REVIEW_6e40c54.md). The fixes use existing PocketJS runtime, HostBridge, bidirectional streams, and Flutter drawing boundaries. Application policy and UI remain in JS.

| Finding | Fix | Verification |
| --- | --- | --- |
| R1 iOS watch and read stop each other | Producer ownership, event-driven wakeup, generation checks, and error cleanup | Actual iOS build. Sustained physical sampling remains pending. |
| R2 Listener error propagation | Per-consumer isolation and bounded diagnostics | Real SDK Bun and QuickJS fixture |
| R3 Multiple host stream claims | One owner per HostBridge | Two adapters exercising open, cancel, and dispose |
| R4 Dart buffer accounting | Decrement pending at actual delivery | Nine real StreamController regressions |
| R5 Android sensor starvation | Latest per-type snapshots and per-stream deadlines | Kotlin compilation and JVM policy tests. Physical sampling remains pending. |
| R6 Missing original CCCD errors | Preserve original code/message through disconnect cleanup | Mapping tests and identity/exactly-once path inspection. Peripheral timing remains pending. |
| R7 Unbounded batches and queues | JS preflight and final bounded native admission | Bun and real QuickJS batch/queue regressions |

## Sources and Implementation Boundaries

The review examined bounded drawing command buffers, external buffer admission, and duplex transport in retained `pocketjs_flutter_demo/native/pocket_runtime_multi.c`, along with actual PocketJS, QuickJS, and plugins in the SDK. The legacy C sample provided configuration accounting and host examples. Allocation and rendering stay with current QuickJS and PocketJS. The changes tighten existing boundaries and eliminate duplicate work.

## Native Message Limits

JSON carries control and capability messages. Existing binary frames and SPSC numeric channels remain the corresponding data paths.

| Boundary | Limit or behavior |
| --- | --- |
| Single `pocket._emit` | At most 256 KiB of UTF-8 JSON, checked before parsing |
| `stream.batch` | At most 256 items. Reject nested batches, including name/method aliases. |
| Pending JSON output queue | At most 1024 items and 1 MiB of encoded input |
| Rejection | `_emit` returns false and preserves accepted messages. Admission recovers after frame/error/load drains. |

The sole producer accounts for cumulative bytes and resets after checking that the existing queue is empty. No extra queue, poller, or Dart scheduling state is required. These limits cover encoded data size and event counts. Native heap and process RSS have separate costs.

`sdk/native/tests/bridge_limits.rs` uses actual QuickJS calls to verify oversized payloads, batch counts, nesting and aliases, invalid JSON, cumulative counts and bytes, and recovery after drain.

## File Admission

Before reading a PAK, `pocket_load_files` and `pocket_load_bytecode_files` take the smallest of the existing 256 MiB file cap, approved maxPakBytes, and full QuickJS heap ceiling. Metadata checks and `take(limit + 1)` use the same file handle and reject changes in size during the read.

A sparse oversized PAK regression checks metadata admission for source and bytecode file loaders. Both reject before bytecode validation or a reset of the running realm. Default host grants stay the same. Aggregate app/GPU/RSS quotas are outside this check.

## Static Frame Ablation

Resource membership and revision checks borrow cached DrawOps. Owned operations are built only for complete output. The unchanged delta path avoids cloning operations, auxiliary data, and texture handles. Transient events and resource changes still emit complete frames. Legacy full-frame output retains the cache.

`frame_delta_cache.rs` verifies unchanged→transient event→unchanged→legacy complete through the actual ABI. The same allocator probe compared a single-node scenario.

| 100 unchanged binary deltas | 6e40c54 | After fix |
| --- | --- | --- |
| Empty scene allocation calls | 292 | 292 |
| Single-node allocation calls | 492 | 292 |
| Single-node cumulative allocated bytes | 66,260 | 34,660 |

These are debug macOS allocation counts for the fixture. Phone FPS and power require device measurements. Virtual-frame and resource accounting still run as needed. The experiment added no idle frames.

## JS Channels and Stream Ownership

HostBridge isolates exceptions separately for event, tick, and legacy global-sink consumers. Optional `onDiagnostic` reports up to 32 times and truncates error text. A throwing diagnostic observer cannot block other consumers. The budget applies across a bridge lifetime without an extra diagnostic queue.

System, Platform, Display, and Showcase use `HostBridge.onEvent` and share the decoded `HostEvent`. Only legacy request-only injected bridges parse strings. A real Platform client and stream adapter regression verifies one JSON.parse per wire event.

Adapters sharing one HostBridge use a WeakMap for exclusive ownership of host-originated streams. Only adapters with a registered `onStream` consumer qualify. The first eligible subscriber owns the stream. Other adapters neither duplicate the local stream nor cancel someone else's stream on dispose. The next valid open with the same ID can be claimed after the owner closes or releases it. Guest-initiated open retains its isolated ID rule.

`sendBatch` preflights the entire UTF-8 wire envelope and item count. More than 256 items or 256 KiB raises `stream_batch_too_large`. Invalid JSON values raise TypeError. Preflight failure sends no partial batch. Bounded traversal avoids allocating a huge JSON string before checking. Native `_emit` enforces the final boundary.

Preflight rejects accessors, own and inherited `toJSON`, cycles, depth above 32, and more than 16,384 traversed nodes. For ordinary data objects, a later stringify cannot expand getters or toJSON past the checked size. Untrusted Proxy execution is outside the preflight isolation model.

## Dart Stream Buffering

The old count incremented and decremented around add, missing actual StreamController backlog. The new count releases capacity when delivery reaches the subscriber. Pending data before listening, during pause, immediately after resume, and during reentry counts against the cap. Overflow closes the stream with `stream.error` (`stream_buffer_overflow`). A normal end delivers accepted items in order. Canceling the only subscription releases the remote producer.

The existing controller and protocol handle data and draining. A batch holds at most 256 items and cannot nest. A chunked UTF-8 encoder stops after 256 KiB without building an oversized encoded string. Nine tests exercise real Dart StreamController behavior for absent listeners, pause, normal end, remote error, cancellation, dispose, reentry, and message boundaries.

## Sensors and BLE

iOS separates watch producer ownership from the independent one-shot manager. When a watch exists, read wakes on actual shared producer samples and has a one-shot timeout. Canceling the watch preserves active shared reads. Core Motion's requested frequency tracks active consumers, using monotonic time for throttling. Generation checks reject late samples and errors. Restart clears old samples. A producer error also ends shared reads for that generation without an extra asynchronous hop. No sampling polling was added.

Android snapshots the latest real sample per sensor type and emits on independently tracked stream deadlines, avoiding starvation by faster sensors. Registration rates follow active consumers. Cancellation and completion reconfigure or stop registrations. Failed reconfiguration attempts to restore the old registration. If restoration fails, it clears partial OS registrations and closes the logical stream.

Android GATT keeps immediate fencing and exactly-once completion. Disconnect callbacks carry the original code/message. Notification cleanup preserves the CCCD setup failure cause. JVM tests exercise production cause mapping and sensor snapshot/deadline policy. Actual BLE peripheral verification is separate.

## Verification

- `cargo test --locked` passed 96 tests with one existing ignored test. Log `.pocket-build/review-fixes-6e40c54/rust-tests.log` in ignored build output.
- `build_native.sh ios-sim` and `build_native.sh macos` built actual archives and probes.
- SDK root `flutter analyze` reported No issues found.
- SDK root `flutter test` passed 67 and initially skipped four because a native-library environment variable or Worker fixture was missing.
- Final `bun test sdk/packages/pocket_ui/test sdk/scripts/tests/streams_runtime.test.ts` passed 27 including actual QuickJS stream runtime. Demo system/state/mobile passed 12.
- The R2 QuickJS fixture registers a throwing listener before the adapter. Existing sample counts and rendered text assertions passed. An isolated runtime rerun passed one test.
- `pocket_services` passed 48 including nine new real stream-buffer regressions.
- `pocket_flutter` passed 130 with `POCKET_NATIVE_LIBRARY` set.
- Demo `flutter test --no-pub` passed 45. `flutter analyze --no-pub` reported No issues found.
- After preparing the actual Worker fixture, all three tests from two SDK FFI files and one from `recording_worker_session_test.dart` passed. This covered all four initial skips. The first fixture build encountered Bun dependency cache EEXIST. `bun install --frozen-lockfile --backend=copy` repaired generated cache and default buildGuest then built successfully.
- `bun run build:system` rebuilt Showcase, profile, and lobby bytecode. `POCKET_BUILD_GUEST=0 bash scripts/test_guest.sh` passed JS state, hardware contract, real bytecode ablation, and native load/ABI/message/pointer/input/stress coverage.
- Android `./gradlew :pocket_hardware:compileDebugKotlin :pocket_hardware:testDebugUnitTest` compiled and passed three JVM tests.
- `python3 sdk/scripts/check_architecture.py` and `git diff --check` passed.
- Swift and podspec parsing and actual `flutter build ios --simulator --debug --no-pub` passed. The first build found missing explicit self in a new closure. The fix rebuilt successfully. The interaction test build included final generation/error fixes. New XCTest sources were outside executed device counts.
- On iPhone 18 Pro / iOS 27.2 simulator, `legacy_capabilities_test.dart` passed one and `multi_app_test.dart` passed three. Keyboard, text client, and page-scroll cases passed three. An additional Editor signature-update case failed its setup assertion because `POCKET_UPDATE_URL` was absent, before exercising update logic. An isolated `input_regression_test.dart --name 'keyboard|TextField|pages scroll'` rerun passed all three input cases. The update case remains outside passing counts.

Real Core Motion, BLE CCCD, OS sensor registration failures, and phone FPS and energy still require physical-device acceptance.
