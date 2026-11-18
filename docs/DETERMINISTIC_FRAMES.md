# PocketJS Deterministic Frames and the Flutter Integration Boundary

This document preserves the pre-integration research snapshot. Later work implemented the native trace clock, host transaction recording, JS upstream adapters, and archive entry points. See [RECORDING_REPLAY.md](RECORDING_REPLAY.md) and [VALIDATION.md](VALIDATION.md) for the current API, acceptance results, and remaining gaps.

On 2026-11-03, the study used pinned revision `99924de47c62fa36f526a8791055d91cbbdb3836`, prepared in `.cache/pocketjs/` by `scripts/prepare_upstream.py`. GPT-6 Luna / max independently examined upstream and the legacy demo and ran bounded native probes. The verification below reflects actual execution.

## Virtual Frame Contract

Upstream `docs/DETERMINISM.md` models an application as a virtual frame transaction.

`state[n + 1] = F(state[n], input[n], effectDeliveries[n])`

Reproducing state and output requires the same build, assets, initial state, simulation frequency, per-frame input, and delivery frame and order for external results. Display refresh rate is independent, and the wall-clock behavior of networks, devices, and operating systems can vary.

The frame pump in `framework/src/index.ts` advances the clock, effect delivery, application hooks, input, reactive effects, cleanup, and core ticks in contract order. `after()` in `framework/src/clock.ts` uses virtual deadlines and breaks ties by insertion order. Application timers should use `virtualNow()` and `after(seconds)`. Random behavior should use explicitly seeded state.

A lower simulation frequency reduces the number of test observations. Upstream compares journeys at 60, 4, and 2 Hz. A low-frequency result can sample a high-frequency trajectory when the logic uses seconds and has no dependency on particular frame numbers. Intermediate animation, touch, and collision behavior at 120 Hz requires separate coverage. Display refresh, simulation frequency, and measured FPS are distinct.

## Reusable Upstream Tools

| Upstream source | Existing capability | Development use |
| --- | --- | --- |
| `framework/src/devtools.ts` and `docs/DEVTOOLS.md` | Bounded flight recorder with `globalThis.__pocketDevtools.dumpTape()` and `replay()`. Up to 36,000 frames with RLE buttons and sticks and sparse touch, relative-axis, and motion tracks. | Capture actions that trigger a problem and replay from startup, reducing reliance on manual reproduction. |
| `framework/src/effects.ts` | `runEffect`, `installEffectDriver`, and host-injected `__pocketEffectDriver`. Results are delivered FIFO at the start of the next virtual frame. `__pocketEffectTrace` records commands and delivery frames. | Inject network and device results and control success, error, cancellation, and late delivery in tests. |
| `programs/sim/sim.ts` and `tests/sim.test.ts` | Headless simulation without a screen, vblank, or wall clock. Scripts advance quickly and capture framebuffer hashes, effect traces, and RGBA. | Fast-forward timers, navigation, and complex workflows in CI. A 30-second virtual timeout can execute immediately. |
| `tools/tape.ts` | Tape replay, frame-by-frame hash comparison, first divergent frame detection, and image capture. | Locate where state or drawing begins to diverge. |

The effect callback API avoids directly awaiting a Promise whose completion depends on external scheduling. Drivers may work asynchronously, but delivery into application state belongs to the frame transaction. Input tapes lack full effect result payloads and text/IME tracks. A touch tape alone captures only part of the session.

DevTools has optional transport and polling cadence. The Flutter integration should reuse its existing event and control channels. Stop publishing snapshots and logs when no debug panel is attached, and preserve demand-driven production drawing. Evaluate production recorder and trace cost, retained data, and gating independently.

## Development Uses

1. **Reproduce input and page issues.** Record touch, viewport and safe area, keyboard insets, text value/selection/composing, lifecycle, and external responses by frame. Replay cases such as a page shifting when an input is tapped or the keyboard immediately closing. Keep on-device Flutter IME coverage, including intermediate protocol state.
2. **Stabilize regression tests.** Script results for app navigation A→B→C→back, cancellation and failure, prewarm and eviction, and hot updates. Assert state, generation, request results, and the first visual difference without arbitrary delays.
3. **Accelerate tests.** Reuse simulation and virtual time for UI unit tests, timers, and application deadlines. Retain target-platform tests for real cameras, BLE, and system keyboards.
4. **Compare performance.** Run the same tape to compare JS, native, bridge, and draw timing, long frames, and wakeups. Determinism aligns logical frames for profiling. Measure FPS and power separately.

Drawing commands can serve as a logical regression baseline. Pixel comparisons require fixed renderer, font, density, viewport, and platform. Upstream simulation RGBA hashes apply to its renderer.

## Historical Flutter SDK Coverage

| Area | Status at the time of research |
| --- | --- |
| Fixed steps and virtual clock | Build and load set `__simHz=tickHz`. Native converts Flutter's monotonic Scheduler deltas into fixed guest/core ticks with a catch-up cap. Input edges retain independent transactions to preserve DOWN/UP events. |
| Demand scheduling and fast-forward | Skips known idle frames up to the next timer. Animation, physics, and other actual work still execute. An unchanged DrawList alone does not establish idleness. |
| Promise continuation wakeup | The study added a real QuickJS pending-job hint. A credited zero-tick boundary creates no logical frame. Pending jobs keep the host awake, and the next real fixed tick uses `Guest::frame → collect`. The 250ms budget remains in place. |
| DevTools/tape transport | Full Flutter transport and export were pending. The upstream recorder already supplied the timing and tape mechanics. |
| Effect driver and result tape | HostBridge/SystemUI RPC used Promises without fully recording external response frames and payloads or consistently installing the upstream effect driver. Asynchronous completion order remained an external input. |
| Full deterministic replay host | Pending. Live FFI settles idle time via `Instant.elapsed()` before external events. Matching only explicit delta and input commands omits that contribution. |
| System text input | The system IME bridge worked, but native `GuestFrame.text` was empty. Recording needed to cover the bridge's actual text/selection/composing/inset protocol. |

Source references include `evaluate_guest`, `fixed_tick_count`, `run_virtual_frames`, and `pocket_send` in `native/src/lib.rs`, `ticks_for_delta`, `before_external`, and `capture` in `native/src/demand.rs`, and `_onTick` in `packages/pocket_flutter/lib/src/pocket_view.dart`.

### Live Wall-Clock Behavior

Live execution needs to schedule new timers correctly after sleeping. Before dispatch, `before_external()` settles idle duration with `Instant.elapsed()` and uses `elapsed_credit_ms` to offset a later display delta, avoiding double accounting. The result includes the real event interval.

Two independent native probes ran the same explicit delta and input sequence, changing only the actual wait before event registration from about 50ms to about 250ms. Virtual frame at registration was 11 versus 15, with deadlines 311 versus 315. These observations include process, JS, and scheduling overhead. They show that replay must account for idle time. Existing Rust tests verify that two seconds of idle advances 120 frames before registration.

A separate deterministic guest produced `[4281558732, 4288243251, 4281558732]` in two native probes. Replacing the logic with `Math.random()` or `Date.now()` changed the output. The bounded probe covered this guest. Full upstream sim CI and cross-platform pixel equivalence were outside its scope.

### Executed Upstream Tests

```sh
cd sdk/.cache/pocketjs
bun test tests/clock.test.ts
```

The run returned **9 pass, 0 fail, 26 expect**. Log `/tmp/pocket-deterministic-clock-test.log`. It covered virtual frame timers, insertion order for equal deadlines, no same-frame execution for zero delay, and effect FIFO order, exactly-once completion, nested delivery on the next drain, host driver precedence, and traces with frame numbers. This verifies the upstream clock and effect foundation. The Flutter replay driver was outside this test, and the full `tests/sim.test.ts` requiring additional WASM and application builds was not run.

## Proposed Integration Order

1. Add controlled export of the existing DevTools flight recorder. Save build/ABI/PAK hashes, viewport/density, tickHz, initial state, and the input tape with its existing tracks.
2. Add an optional debug recorder/replay driver at the existing HostBridge boundary. Record capability and effect commands, results and errors, and actual virtual delivery frames. Extend the IME, viewport, and lifecycle lanes. Hardware replay returns recorded values without taking another photo or connecting to a device.
3. Add an explicit deterministic clock mode to the native host. Schedule replay events using recorded virtual frame times and bypass live `Instant` settlement in replay while preserving live behavior. Keep time explicit through the recorded inputs.
4. Reuse `programs/sim` and `tools/tape.ts` to establish state and first-divergent-frame baselines, then add Flutter renderer and device IME baselines. Using the same tape, ablate demand scheduling, prewarm, and transport and report workload, response latency, and sustained FPS separately.

The old demo's `mini_apps/app_game_detail/main.js` depends directly on VSync dt, and UIkit uses `Math.random()` for random styles. Reuse their interaction scenarios with upstream timing and external data contracts for deterministic tests.
