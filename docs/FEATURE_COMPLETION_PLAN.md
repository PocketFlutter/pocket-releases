# PocketJS Remaining Capability Implementation Plan

Historical status on 2026-11-03. The baseline was HEAD `bee700e` plus all existing uncommitted glyph, demand scheduling, multi-app, and recording work. Individual documents contain technical conclusions. VALIDATION.md records actual commands. Upstream stayed at `99924de47c62fa36f526a8791055d91cbbdb3836`. The main Compositor, raw text, Worker QJBC, HTTP, and offload paths landed. Integration, automated testing, and physical-device or energy acceptance represent separate milestones.

## Architecture and Ablation

JS SystemUI owns application policy, layout, and focus. Flutter and Rust host the actual runtime, DrawOps, system input, I/O, resources, and explicitly authorized channels. Reuse retained `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` outside `pocket_host/`. Legacy simulators, echo paths, and WXML trees do not constitute actual feature implementations. Use upstream Worker turns and facts, CompositorSurface, and the same QuickJS/PocketJS core, layout, and scheduler.

Default idle adds no ticker, timer probe, or Worker polling. Wake on input, frame changes, I/O completion, or a one-shot deadline. Establish bounded resources, generation checks, cancellation, and teardown before evaluating performance. Keep low-frequency JSON where measurement favored it over PB, and use existing PFB1/SPSC for high-frequency data.

## File Ownership and Workers

The user explicitly selected GPT-6 Luna / Max for this work, superseding the prior 5.6 Luna preference. The initial three native workers used `model=gpt-6-luna` and `reasoning_effort=max` and did not spawn agents. The coordinator serialized Flutter execution to avoid toolchain locks and device-test conflicts.

| Owner | Exclusive scope | Deliverable |
| --- | --- | --- |
| `/root/system_compositor_luna6` | `pocket_system_host.dart`, JS system/platform, `pocket_compositor.dart`, and tests | Insert real children in parent DrawOps with clip, Z-order, viewport, focus, and generation. SYSTEM_COMPOSITOR_IMPLEMENTATION.md. |
| `/root/worker_io_luna6` | New native Worker module/build.rs/Cargo dependencies, build_guest and tests, new Dart Worker API | Official Worker core and runner, dedicated thread, QJBC, channels, I/O, offload, cancellation, and limits. WORKER_IO_IMPLEMENTATION.md. |
| `/root/wechat_host_luna6` | `sdk/targets/wechat/`, standalone `build_wechat.ts`, and target tests | WeChat target and consumer package using real Guest and shared core. DevTools and device acceptance were pending. |
| Coordinator | native/lib.rs, public frame model/runtime/view, App/Session/Config, Demo, target registration, and measurement entry | Shared wiring, drawing and input fields, trust boundaries, signing and OTA compatibility, ablation, and runtime acceptance. |

Coordinate shared-file changes by ownership. Preserve other workers' edits and existing audits. Reuse completed workers for independent review, leaving time for integration and failure reproduction.

## Sequence and Acceptance Gates

### 1. Drawing and Input Fields

1. **Integrated.** TEXT_RUN word1 alignment travels through native JSON/PFB1, Dart model, text rendering, and cache fields. Layout uses core's existing line breaks and box width.
2. **Integrated.** SURFACE_QUAD word8 focused, independent numeric handle, original DrawOp index, full bounds, and visible clip travel from native through PFB1/JSON to `PocketCompositorSlot` and its child input gate.
3. **Integrated.** PFB1 preserves explicit metadata and versioning, JSON diagnostics, and legacy frame handling. Unsupported layouts should fail explicitly. Expand cross-version and malformed-frame coverage.
4. **Integrated.** Bounded `input.text` ingress to `GuestFrame.text` accepts keyDown/keyUp, commit, composition, and compositionEnd. Flutter IME `textInput.edit` remains a separate delivery path. Public raw ingress requires capability and host policy admission.
5. **Partially verified.** Native/C ABI and Flutter frame, model, and input tests cover fields and transport. Chinese and emoji, pixel positioning, physical hardware input, and recording digest coverage still need expansion.

### 2. Official System Child App Composition

1. **Integrated.** JS/catalog provides stable appId-to-surfaceHandle mapping. The trusted host validates and binds `ui.__surfaces`. Ordinary children lack management permissions.
2. **Integrated.** SystemUI uses official CompositorSurface. Flutter View inserts children at the exact DrawOp position and clips visibility while retaining the full coordinate origin.
3. **Integrated.** Each child owns an independent QuickJS/session and local viewport. Shell flags project focus. Pointer sequences bind to generations, and focus switching cancels old pointer and IME state.
4. **Integrated.** create/present/destroy store runtime facts. The full-screen overlay, second Dart app stack, and dual focus path were removed. Necessary legacy consumer compatibility remains.
5. **Automated coverage.** JS/Bun, native/C ABI, and Flutter compositor/model/host tests cover registry, clip and Z-order, resize, focus-only input, fully clipped residency, generations and late callbacks, and keyed disposal. Physical A/B interaction between two actual QJBC children was pending.
6. **Integrated.** Flutter target and ABI declarations use the actual target profile. Automatic generation and injection of `compositorSurfaces` into the Demo consumer remained a follow-up.

### 3. Worker, I/O, and Offload

1. **Integrated.** Official `domains.worker` builds ABI-matched QJBC. Metadata, manifest, hash, asset inventory, and signed package admission verify `app.worker.qjbc` and reject packages missing it.
2. **Integrated.** Official C Worker core/runner/QuickJS run on a dedicated thread and realm. UI channels attach before guest evaluation and latch before frames. Teardown detaches, stops, and joins by reference lifecycle.
3. **Integrated.** Uses pinned turn/context/facts order and limits for resources, requests, events, timers, and channels. A blocking wait wakes on completion or deadline independently of UI ticks and polling.
4. **Integrated.** HTTP and streaming I/O validate URL and limits against the declared node and host grant. They handle timeout, cancellation, backpressure, and stale completions. `io.offload` uses a real bounded provider with session/generation checks and cancellation.
5. **Native/C ABI and Flutter coverage.** Worker probe, native tests, build tests, offload stress and cancellation, and Flutter Worker/offload runtime, binding, and FFI tests cover QJBC, localhost HTTP, channels, cancellation, and provider wakeup. i2c and uart remain unsupported. Android and iOS target builds still require CI or device verification. Full deterministic Worker recording and replay is tracked separately. See [WORKER_RECORDING_REPLAY_PLAN.md](WORKER_RECORDING_REPLAY_PLAN.md).

### 4. WeChat Host

The separate WeChat worker was still integrating the feature. `sdk/targets/wechat/` and `build_wechat.ts` provide scaffold and build tooling.

1. Retain the legacy target direction of running a PocketJS Guest in a WeChat mini program. Verify WXWebAssembly, Canvas2D, system input, and package limits.
2. Build actual QuickJS WASM and load real QJBC/PAK. Upstream Web's default source evaluator handles different input. Fail clearly where the toolchain cannot build the target.
3. Connect real DrawOps, glyphs, clipping, textures, and resource release. Cover pointer phases, DPR, system input, background/foreground, and demand frames. Avoid whole-tree setData each frame.
4. Put consumer generation under the SDK target. Keep sdk and demo as the root entry points. Use the common host request, permission, and cancellation contract.
5. Record local real-engine execution, WeChat DevTools, and physical WeChat acceptance separately. DevTools and physical evidence were pending. The wx mock covers adapter behavior.

### 5. High Refresh Rate and Energy

Measurement tooling and simulator/static baselines existed. Sustained high-refresh hardware and physical energy evidence were pending.

1. Enumerate actual iOS and Android devices and their display refresh rates. Use real 120Hz hardware for the 120Hz acceptance.
2. Record device, OS, build mode, temperature, power conditions, and sampling window. Fix scenarios for static state, continuous animation, scrolling/input, 500 nodes, glass, two children, and Worker compute/I/O.
3. Leave FPS uncapped at 60. Dynamic scenarios collect frame intervals, build/raster/native P50/P95/P99, long frames, and input-to-visible-frame latency. Static scenarios emphasize ticker, FFI, and deadline wakes.
4. Use platform energy tools such as iOS Instruments and Android Perfetto/batterystats or supported power rails. Use equal windows, exclude first compilation and installation, and ablate recording, Worker, or prewarm one variable at a time. Measure power directly before reporting percentages.
5. Without attached high-refresh or energy-measurement hardware, provide repeatable capture and analysis and identify the missing hardware measurements.

## Completion Criteria

Each item records source paths, implementation changes, runnable commands, successes and failures, and unsupported boundaries. Run Rust and Bun first, then serialize Flutter analysis and tests, then run real QJBC and device inputs. Multi-app and recording are existing regression baselines and must survive Worker and composition changes. Compilation, mocked protocol, native/C ABI, Flutter tests, simulator behavior, and physical performance or energy are independent forms of evidence. Full deterministic Worker recording and replay, WeChat DevTools and device acceptance, and high-refresh and power validation remained open. No commit or release was requested for the historical work, so changes stayed in the workspace for review.

## Additional Worker Recording and Replay Work

On 2026-11-03, the user requested a plan followed by parallel implementation by GPT-6 Luna Max workers. The separate [WORKER_RECORDING_REPLAY_PLAN.md](WORKER_RECORDING_REPLAY_PLAN.md) covers Worker turns and clocks, I/O facts, bidirectional channel publish/latch, offload requests, and cancellation/completion races. One worker owned native facts and execution, the other archive bridging. The coordinator owned production C ABI, offload, and acceptance. JS owns all suitable logic and recording controls. Dart provides necessary bridging. Real HTTP passed original-instance teardown, service shutdown, two offline archive replays, and tamper rejection. The public entry removed its previous blocker. Full streaming, limits, backpressure, and mixed-domain boundary coverage remained open.
