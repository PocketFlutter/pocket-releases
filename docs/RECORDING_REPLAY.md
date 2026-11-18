# Host transaction recording and deterministic replay

Based on pinned PocketJS revision `99924de47c62fa36f526a8791055d91cbbdb3836`.
JS reuses the existing recording SDK for controls. Native owns capture and injection of
Worker and offload facts. Dart handles FFI marshalling, archive I/O, and old-format
compatibility. See [Deterministic frames](DETERMINISTIC_FRAMES.md) for sources and contracts.

## Capture boundary

Capture starts before code loading in a new native runtime and ends on explicit stop or
runtime disposal. The window contains no heap snapshot. To capture a restorable sequence,
start with a fresh instance. Remounting or updating creates a runtime with its own recorder,
and archives keep app and generation records separate.

Capture records actual PocketJS and host transactions.

- JS, QJBC, and PAK loading, engine ABI, content SHA-256, viewport, density, and tickHz.
- Exact deltas for full, delta, and PFB1 frame requests, and stable digests of output DrawOps,
  events, resource contents, and resource releases.
- Host responses, JS events, text values, selection and composition, viewport, safe areas,
  and lifecycle messages inside `send`.
- Live resize, auxiliary surfaces, and scheduler pause and resume.
- Actual SPSC duplex ingress payloads and steps, and egress peek and consume. Capture copies
  diagnostic data before borrowed memory expires and keeps the native atomic publish path.
- Every idle interval actually used by native `before_external`, plus the order and values
  of JS `Date.now`, `Math.random`, and existing `performance.now` calls.
- Worker configuration with actual QJBC SHA-256, declarations, ABI, tickHz, limits, and grants.
  Native captures Worker turns, channels, timers, I/O facts, and the UI latch.
- `io.offload` configuration and native broker submit, provider completion, timeout and cancel,
  and guest reply consumption. The replay broker runs independently of the real Dart provider.
- Worker and offload cross-thread wakeups via `externalWork` host transactions. During capture,
  runtime disposal uses `asyncStop` to stop native Worker and offload work before closing the
  provider and destroying the realm.

Replay runs a new real QuickJS and PocketJS instance without network, hardware, OTA, or
platform management providers. The guest reissues its original requests. Recorded external
results are delivered in transaction order. This verifies guest behavior and rendering given
the same external inputs without repeating camera capture, business storage writes, or downloads.

Replay records the protocol entering JS and the guest output. OS keyboard visibility and
layout remain device checks. DrawOps digests cannot establish external video or camera
live-texture pixels. Pixel equality across fonts, GPUs, and renderers needs separate
baselines. Worker and offload budgets, backpressure, concurrent streaming requests, and
all cancellation races remain incompletely validated.

## Upstream runtime reuse

`@pocket/ui/recording` directly uses upstream `__pocketDevtools.dumpTape/replay` and `clock/effects`.

- `captureUpstreamTape()` and `dumpCurrentInputTape()` export the existing flight recorder.
- `create/installEffectRecordingDriver()` capture commands, payloads, results or errors, and actual delivery frames.
- `create/installEffectReplayDriver()` deliver through the upstream effect drain and check command and frame order, duplicate completion, cancellation, and late results.
- `exportRecording()` and `replayRecording()` validate build metadata and input and effect tapes.

The official input tape omits IME and some host results. Flutter host transactions
supply those facts. Use the existing JS tick and input recorder for each trace. Upstream
headless sim and tape CLI remain available for independent renderer baselines.
Native Flutter replay uses the current QJBC and FFI path.

Archive `upstreamInputTape` is a diagnostic attachment for official devtools.
Native replay reads only the host transaction trace to deliver each pointer action once.
Imports report attachment presence via `hasUpstreamInputTape`. JS reuses upstream
contract validation. Dart only checks for a bounded JSON object.

The old demo's `lib/core/perf_monitor.dart` sampled performance history and
`mini_apps/app_canvas_lab/main.js` demonstrated canvas command capture. Neither
implemented session replay. The current implementation reuses upstream input and
effect contracts and adds native facts where the host trace lacked I/O evidence.

## Clock consistency

Production mode 0 preserves live behavior. Capture mode 1 continues to use the existing
`Instant` accounting, preserving timer registration after idle. Older UI-only transactions
use v1 `{idleMs, scalars}`. The v2 envelope is
`{version:2, idleMs, scalars, workerEvents?, offloadEvents?}`. Both event arrays share
one native trace and global increasing `seq`. An event is `{seq, session, kind, data}`.
Replay merges both lanes by `seq` and still drives them in host transaction entry order.
Mode 2 advances the existing virtual clock by recorded values without reading replay
wall-clock delays. The existing scheduler handles idle credit, fixed ticks, and Promise
pending-job wakeups.

The ABI uses `pocket_trace_clock_mode` and `pocket_trace_clock_begin_json/end_json`.
Modes 1 and 2 can only be enabled before the first load. Stopping capture can restore
mode 0. Call ordering, missing or extra times, and scalar calls are checked as replay
differences. Worker and offload share an 8,192-event and 8 MiB budget. Dart validates
JSON bounds, event count, and cumulative bytes. Native checks event kind and data
semantics. Exceeding a budget marks the recording incomplete while live guest work continues.

Replay checks evidence before creating a native instance. Every transaction requires
a clock envelope. Successful drawing requires frame SHA-256. `frameDelta` also needs
an explicit unchanged result. Old v1 data still parses. With missing evidence, replay
reports unverified or rejected. The upstream tape remains attached for diagnostics, and
the host transactions drive the actual input and effects once.

Worker QJBC is stored as a normal SHA-256 content-addressed asset. Its config entry
records bytecode hash, declarations, ABI, generation, tickHz, resource limits, and
actual capabilities and HTTP origin grants. Recorded payloads are canonical inline
Base64, with no separate blob route. Each Worker payload is limited to 1,024 bytes.
Replay restores the same QJBC and config from the archive and uses the native runner
independently of the original runtime, threads, network, and hardware.

Implicit current time in `new Date()`, strings from `Date()`, and third-party clocks
and random sources are currently outside capture. Use the PocketJS virtual clock,
explicit seeds, and effect contracts. Route other relevant inputs through the host
or effect lane, or adapt them explicitly.

## SDK integration

The thin host uses one entry point. Recording is idle at startup and begins on client
`diagnostics.recording.start` or an explicit host call to `recordings.start()`.

```dart
final recordings = PocketRecordingLibrary();

PocketSystemHost(
  systemUI: mySystemUI,
  applications: trustedApps,
  recordings: recordings,
);

// Start with diagnostics.recording.start, which remounts the current generation for full capture.
// Tests can also use recordings.start() or PocketRecordingLibrary(recordOnStart: true).

// Freeze the recording prefix at a completed transaction boundary.
recordings.stop();
final result = await recordings.replay();
final exported = await recordings.export();
final again = await PocketRecordingLibrary.replayArchive(
  File(exported['path'] as String),
);
```

A single-app consumer can call `recordings.attach(config, controls: true)` before
mount and pass the returned config to `PocketGuest`. Embedded consumers managing
their own storage can supply `PocketAppConfig.recordingFactory` returning a new
`PocketRecordingController`. The low-level entry points are
`FfiPocketRuntime.open(recording: controller)` and
`replayPocketRecording(recording, assets: ...)`.

The factory runs before each new runtime. Preserve config and factory identity across
parent widget rebuilds. `PocketRecordingLibrary` defaults to idle with
`recordOnStart: false`, providing a zero-overhead `PocketRecordingController(enabled: false)`.
When the client sends `diagnostics.recording.start`, the library clears the previous
buffer, enables capture, and uses `PocketSession` to remount the current trusted SystemUI
generation. Capture starts at `loadBytecode`, and `onReady` dispatches
`diagnostics.recording.started`. Each runtime can use either the library or a custom
recordingFactory.

Explicit `recordings.stop()` or controller finish stops capture. With Worker or offload
configured, it records a `captureStop` trace cut before switching back to mode 0. The live
guest, Worker, and provider continue running. UI-only capture stop changes clock mode
without an entry, so new UI-only recordings can remain v1. Offline replay validates
the same cut at `captureStop` and ends its asynchronous execution domain. Replay
uses recorded facts. If runtime disposal happens during active capture, native records
`asyncStop`, synchronously stops Worker and offload, then lets Dart close the provider
and destroys the native realm. Replay repeats `asyncStop` without a real provider.

`PocketRecordingLibrary` aggregates diagnostics. The application stack, return tokens,
foreground decisions, and LRU belong to existing orchestration. The optional diagnostic
provider registers only with trusted SystemUI. Ordinary child apps can be recorded and
lack permission to export the system archive.

## Showcase use

```sh
cd demo
flutter run -d DEVICE_ID
```

The application pages are JS. Open the Deterministic replay card in Host → Runtime to
start and manage capture on demand.

1. Select `Start recording` to start a window. The trusted session remounts and returns to Runtime after readiness to show capture status.
2. Use the page, enter text, and open a mini-app.
3. Select `Recording status` to inspect capture state and transaction counts per realm.
4. Select `Stop recording` to end capture, or `Stop & verify replay` to freeze the window and rebuild the guest for verification in a new isolate.
5. Select `Export recording` to save the archive with the SystemUI upstream input tape.

The default recorder is idle with `enabled: false, recording: false`. It captures no trace,
retains no bytecode or PAK assets, and does no recording polling. Automated tests can start
before the first frame through `PocketRecordingLibrary(recordOnStart: true)` or
`--dart-define=POCKET_RECORD=true`. The app continues after capture stop, and another
`Start recording` opens a fresh window. Stop before exporting so the large archive payload
is outside capture.

## Files and quotas

The archive contains `recordings.json` and `assets/<sha256>.bin`. The tape records opaque
asset keys, length, and SHA. Trusted callers supply replay assets. Tape source paths
are never opened. The library explicitly keeps assets in memory for replay of retired
OTA generations. Archive assets deduplicate by content hash.

Each runtime defaults to 8,192 host transactions and 8 MiB of trace. Worker and offload
facts share an additional 8,192-event and 8 MiB lane. The optional asset retention cap
defaults to 16 MiB. The library keeps up to eight runtimes by default, configurable from
1 to 32. A quota breach marks capture incomplete and replay rejects it. File import and
export limit manifest size, aggregate asset size, and file count. Import accepts only
ordinary directories and regular asset files.

A standalone `PocketRecordingController` defaults to keeping no source, bytecode, or
PAK. Supply matching `PocketReplayAssets`. `PocketRecordingLibrary` explicitly retains
them. Archives allow at most 128 assets, 128 MiB total, and 64 MiB per file. Import checks
length and SHA before copying assets used by each runtime. Incomplete, unstarted, and
empty sessions cannot be exported as replayable archives. Stop restores the original
clock object. Cached clock or random functions remain callable.

Replay returns `matched`, `replayable`, `entriesReplayed`, `framesCompared`, and
`firstMismatch`. Differences identify transaction and frame numbers and the affected
input, output, time, or asset boundary. The first difference fails the run even if
the final frame matches.

## Validation

Acceptance includes real QJBC, multiple apps, IME composition, offline replay after
runtime disposal, archive export and re-import, tamper rejection, and recording-toggle
ablation. See [Validation](VALIDATION.md) for execution evidence.

The earlier UI-only Duo run passed two user scenarios. It matched 388 transactions
and 124 frame digests across three apps after original instance disposal and passed
archive export and re-import. The JS status, stop-and-verify, and export buttons were
actually clicked. A prior real-dylib UI-only run also passed 10 tests. These historical
runs covered UI only. macOS, iOS simulator, and Android arm64 native builds passed.
Android device replay and physical power consumption remained unverified.

As of 2026-11-03, nine native Worker trace tests, five native offload tests, and 12
recording model tests passed. The final `pocket_flutter` suite passed 104 and the SDK
suite passed 56. Architecture checks passed. Three fresh realms replayed recorded
timer, random, date, and channel facts from the real production Worker C ABI after
the original was destroyed. Native offload C ABI submit and provider completion
facts replayed three times without a provider after destruction. The real debug
dylib passed the Dart offload FFI recording, provider close, and disposal sequence
and three provider-free replays.

The final Rust suite passed 68 lib and six duplex tests, with one manual throughput
test ignored. The actual Worker HTTP regression passed 10/10 consecutive runs.
Offload idle shutdown passed 50/50. Two SDK Worker FFI tests executed with the latest
debug dylib. They verified two offline archive replays after the original HTTP instance
and service closed, one total network request, and rejection of seq and payload
tampering. That result allowed removal of the old Session Worker recording guard.
`PocketAppConfig` and `PocketRecordingLibrary.attach` now support the offload provider
combination. Config tests confirm attach does not create a provider prematurely.
The two earlier SDK skips are historical. See the
[Worker deterministic recording and replay plan](WORKER_RECORDING_REPLAY_PLAN.md)
for I/O, budget, backpressure, concurrent streams, cancellation, and late completion limits.
