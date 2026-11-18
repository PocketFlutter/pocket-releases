# Deterministic Worker Recording and Replay

On 2026-11-03 the user requested recording and replay for Worker, IO, and offload. Native facts and replay, archive bridging, offline archive replay of actual Worker HTTP, and the main offload FFI path passed. Full streaming, quota, and mixed-domain coverage remained open.

## Format and Limits

- Pure UI recordings retain schema v1. Existing `{idleMs, scalars}` trace envelopes read and replay unchanged.
- Schema v2 uses `{version:2, idleMs, scalars, workerEvents?, offloadEvents?}`. Each event has exactly `{seq, session, kind, data}`. Worker and offload share a native trace and a globally increasing `seq`. Archives group `workerEvents` and `offloadEvents`. Replay merges facts on `seq` and executes them in host transaction-entry order.
- Worker and offload share limits of 8,192 events and 8 MiB. Each event is limited to 16 KiB and an individual Worker fact payload to 1,024 bytes. Byte payloads use canonical inline Base64 fields such as `bytesBase64`, with no separate blob route. Dart validates JSON shape, nesting, counts, and bytes. Native validates kind/data semantics. Over-limit capture is incomplete and leaves live execution intact. Oversized archive imports are rejected.
- Worker QJBC reuses the SHA-256 asset archive. `workerConfigure` records QJBC descriptor, SHA, declaration, ABI, generation, tickHz, limits, capabilities, and `allowedHttpOrigins`. Replay verifies and restores the same assets and grants.
- Offload configuration records generation/session/timeout/methods. The native broker records provider completion, timeout/cancel, late completion, and Guest reply consumption. Replay uses the native configure/replay broker with a null notify pointer and no Dart provider.
- `externalWork` records each host wake transaction, including zero-delta wakeups, so Worker/offload facts always have a matching host entry.

## Stop and Dispose

- `PocketRecordingLibrary.stop()` and controller finish stop capture. With Worker or offload, complete the `captureStop` trace cutoff before switching trace clock to mode 0. App, Worker, and provider keep running. Pure UI only switches mode 0, without `captureStop`, preserving v1 for new pure UI recordings.
- Runtime disposal during capture invokes `pocket_stop_async` in the same trace begin/end transaction and records `asyncStop`. Native stops Worker, detaches the UI bridge, and closes offload. Then Dart closes the provider, destroys native runtime, and finishes the controller.
- Replay dispatches corresponding native paths for `captureStop` and `asyncStop`. Offload replay starts no deadline or provider thread, and Worker replay installs no Dart wake callback. On offline capture stop, complete the cut and terminate async execution without restoring real IO. Cleanup requires no unrecorded async stop. The live original instance continues after capture stops.

The JS SDK owns product recording controls, cross-app orchestration, and decisions. The official native Worker runner and offload broker own facts, injection, and visible ordering. Dart owns FFI marshalling, runtime lifecycle, asset IO, and archive reconstruction.

## Verification on 2026-11-03

- Nine native Worker trace-lane tests passed. Production Worker C ABI timer, random, date, and channel facts replayed in three fresh realms after original disposal.
- Five native offload tests passed. Production offload C ABI submit and provider completion facts replayed three times without providers after original disposal.
- Actual debug-dylib Dart offload FFI passed capture, provider close, runtime disposal, and three provider-free replays. The custom `compute.sum` provider ran once during capture only.
- Twelve recording model tests, all 104 pocket_flutter tests, and all 56 SDK tests passed, including actual Worker FFI and production Session admission. Architecture passed.
- Earlier pure UI v1 evidence includes matching digests for 388 transactions and 124 frames across three Duo apps after disposal, archive export/import, and ten pure UI recording tests with a real dylib. It establishes v1 coverage.
- Final Rust totals were 68 lib and six duplex passes with one manual throughput benchmark ignored. Actual Worker HTTP capture, disposal, and offline replay passed 10/10. Offload idle close passed 50/50.
- Two SDK Worker FFI tests ran on the latest debug dylib. Pure UI continued after capture stop. Real Worker QJBC, HTTP, and channel recording was archived after disposing the original runtime and closing the HTTP server. Two fresh isolates replayed offline, leaving request count at one. Tampered seq and inline payload were rejected. Log: `/tmp/pocket-worker-recording-http-ffi-verified.log`. The fixture used real `buildGuest`.

## Remaining End-to-End Coverage

- Global quota edges across Worker and offload, event/backpressure overflow behavior, and rejection of incomplete archives.
- Two-way Worker snapshot/ring backpressure, streaming HTTP chunks, out-of-order requests, timeout/cancel/late completion, CPU quota, background pause, reload/eviction, and generation isolation.
- Device/ABI differences, network hardware, texture pixels, and actual elapsed time are outside replay determinism guarantees.

After offline HTTP archive FFI passed, the outdated high-level Session Worker recording guard was removed. `PocketAppConfig` and `PocketRecordingLibrary.attach` now admit offload provider and recording combinations. Config tests verify attach does not instantiate the provider early. Complex IO and quota coverage remains explicit.

## Implementation Plan and Remaining Work

Completed:

1. Extended trace envelopes and archives with pure UI v1 compatibility and shared Worker/offload sequencing and limits.
2. Used the pinned official runner and broker to capture and inject Worker turns, time and random scalars, channel, IO, and offload facts.
3. Added Worker QJBC archive assets, configuration reconstruction, `externalWork`, `captureStop`, `asyncStop`, and provider-free replay dispatch.
4. Verified repeated replay after disposal with Worker and offload C ABI and Dart offload FFI.
5. Verified actual HTTP archive FFI, two offline replays after runtime and server shutdown, and rejection of seq and payload tampering.

Remaining:

1. Add end-to-end quota, backpressure, streaming, multiple-request, timeout/cancel/late completion, and mixed-sequence tests. Reject unsupported cases explicitly and document limits.
2. Keep pure UI, duplex, input/IME, and idle-timer regressions and compare recording disabled, enabled, and replay. Disabled capture does not copy payloads, poll, or create a persistent ticker.

Implementation entry points: `native/src/worker.rs`, `native/src/offload.rs`, `native/src/replay.rs`, `packages/pocket_flutter/lib/src/pocket_recording.dart`, `pocket_runtime.dart`, `pocket_offload_binding.dart`, and `lib/src/pocket_recordings.dart`.
