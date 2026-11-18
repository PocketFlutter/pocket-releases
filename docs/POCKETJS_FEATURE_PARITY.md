# PocketJS Capability Coverage and Performance Priorities

The newer 2026-11-07 review covers 32 pinned upstream capabilities, UI and game features, tooling, and Editor. It distinguishes implementation, runtime verification, and platform limits. This document preserves the earlier integration record. [Upstream capability audit and roadmap](UPSTREAM_CAPABILITY_AUDIT_2026-11-07.md)

Review date: 2026-11-03. Evidence uses actual upstream contracts at `99924de47c62fa36f526a8791055d91cbbdb3836` and implemented paths. Component label counts and source presence alone do not establish support.

The UI and services audits include older Worker, focus, and raw-text baseline findings. Use the newer implementation records for their status. The order below describes coverage work for later releases. [UI, rendering, and input review](POCKETJS_FEATURE_PARITY_UI.md), [Services, Worker, and tooling review](POCKETJS_FEATURE_PARITY_SERVICES.md), [Compositor implementation](SYSTEM_COMPOSITOR_IMPLEMENTATION.md), [Worker and IO implementation](WORKER_IO_IMPLEMENTATION.md)

The legacy mini-app platform and WeChat Host are separate capabilities. A Session covers a runtime instance, and a legacy WXML view alone cannot establish actual Guest execution on WeChat. [Mini-app platform and WeChat host parity](MINI_APP_PLATFORM_PARITY.md)

## Integrations in This Phase

- GLYPH_RUN reuses upstream glyph pages and the existing image/PFB1/T8 resource path. Real bytecode and PAK verify coverage, UVs, tint, density, and resource release after font replacement.
- PocketJS work state and virtual timer deadlines drive Flutter and remove the 100 ms idle probe. Legacy guests continue conservatively. Continuous animation retains its sampling rate.
- Input, responses, duplex publication, and lifecycle wake directly. Tests cover fast-forward after long idle, background clock isolation, and expired QuickJS execution budgets.
- Core physics bindings are now enabled. Native tests cover creation and disposal of a world and no pending work without a world. Complex collisions require separate validation.
- SURFACE_QUAD inline bounds, numeric handle, and word8 focus are projected through JSON/PFB1, Dart `PocketCompositorSlot`, and the child input gate. SystemUI child CompositorSurface, clip/Z order, viewport, focus, and generation are wired. Physical-device interaction with two real QJBCs remains open.
- Bounded `input.text` ingress delivers key down/up, commit, composition, and composition end to `GuestFrame.text`. Flutter `textInput.edit` is a separate system IME lane. Avoid duplicate delivery.
- `domains.worker` is preserved and generates ABI-matched `app.worker.qjbc`. The native C runner uses an independent QuickJS realm. Declared and granted Worker HTTP supports origin checks, timeout, cancellation, and backpressure. `io.offload` supports bounded providers, session/generation, cancellation, and isolation of late results. Native/C ABI and Flutter bridge/runtime tests cover these boundaries. i2c and uart still lack board providers.

## Follow-Up Order

1. **Rendering and input fidelity.** TEXT_RUN alignment, SURFACE_QUAD focus/clip/handle, and GuestFrame.text passed native/PFB1/Dart bridge tests. Sprite, DeepZoom/TILESET, complex physics, multiple outputs, and full text pixels need scenario coverage.
2. **Worker and IO platform matrix.** Worker QJBC, independent realms, channels, real HTTP, and offload are implemented. Declaration and host grant still govern admission. i2c/uart, mobile target builds, and full streaming failure/backpressure matrices remain.
3. **Adapt service contracts.** Reuse registered hardware and plugins for upstream modules as needed. SDK `hardware.camera.*` and upstream `camera` streaming require separate integration. Verify font archive and other upstream providers explicitly and reuse provider code.
4. **Build and target coverage.** Public builds pin Solid. Vue Vapor, Octane, MicroTS, and feature plan are outside the shared public build pipeline. WeChat Host integration uses its dedicated target. Scaffold, mocks, and generated scripts alone do not establish support.
5. **Deterministic record and replay.** Ordinary UI traces, Worker turns, IO facts, channel publish/latch, and offload providers are integrated. Real HTTP passed archived offline replay after tearing down the original instance and stopping the server. Streaming, quotas, backpressure, and mixed domains need broader coverage. [Worker record/replay plan](WORKER_RECORDING_REPLAY_PLAN.md)

## Acceptance Goals

| Goal | Measurements | Design |
| --- | --- | --- |
| High FPS | UI and raster time, long frames, animation and scrolling at target refresh | Reuse core, texture caches, and binary frames. Measure actual hotspots first. |
| Low energy | Static-page ticker and FFI counts, timer wakes, background activity | Stop for known idle, use a one-shot deadline for future work, and exclude async waiting from per-frame polling. |
| Responsive input | Input-to-frame, message-to-frame, IME consistency | Wake immediately for input and async completions and isolate heavy work from UI. |

Dynamic Protobuf reduced representative message size but increased Guest CPU encoding and decoding time. Rendering already uses PFB1, and pointer ingress uses 16-byte lock-free records, so the full Protobuf layer was omitted. Callback reductions require device energy data to quantify power savings. [QuickJS codec measurements](TRANSPORT_CODEC_EVALUATION.md)

## SystemUI Integration (2026-11-03)

JS owns multi-app policy and Flutter exposes a thin instance channel. This path uses official PocketSystemV1 catalog, installed snapshots, and roles.systemUI, and adds cross-app open/results, scheduling, shared JSON KV and messaging, and bounded prewarm/LRU. Official child CompositorSurface, focus projection, clip/Z order, and separate child sessions are wired. Upstream System provider completeness, automatic catalog-to-consumer packaging, and device A/B validation remain separate. Earlier statements that multi-app management was absent describe the pre-integration baseline. [Implementation and acceptance](MULTI_APP_IMPLEMENTATION.md), [Compositor implementation](SYSTEM_COMPOSITOR_IMPLEMENTATION.md)

## Record/Replay and Remaining Status

Host transaction traces, wall-clock-free replay, upstream input/effect adapters, and export are implemented. [Record and replay validation](RECORDING_REPLAY.md)

| Capability | Status at the review |
| --- | --- |
| GLYPH_RUN, PFB1 drawing, lock-free pointer, on-demand stop and wake | Integrated with real bytecode and bridge tests. Full Unicode shaping and all font fidelity remain outside this evidence. |
| JS SystemUI, cross-app open/results, shared KV/messages, prewarm/LRU | Integrated. Three actual app workflows passed on Duo. |
| Flutter system input, follow scrolling, selection/composing, and GuestFrame raw text | System IME is wired. Separate `input.text` delivers key, commit, composition, and compositionEnd to GuestFrame. Hardware keyboard and IME device coverage remains incomplete. |
| Multi-app host transactions, offline replay, and archive import/export | Two Duo workflows passed, with matching summaries for 388 transactions and 124 frames across three apps. Coverage is protocol and Guest output, excluding external texture pixels, arbitrary external JS randomness, and platform providers themselves. Worker HTTP/offload passed main-path archived offline replay. See the plan for remaining cases. |
| Package version/signing/OTA, Editor, iOS and Android plugin framework | Integrated with layered regressions. Full physical hardware matrix remains open. |
| Official Flutter System target, dynamic child CompositorSurface and focus | Official surfaces, handles, focus, clips, and generation wired with native/C ABI and Flutter bridge/model/compositor tests. Physical dual-QJBC interaction, map packaging, and device/energy behavior remain open. |
| Worker QJBC, independent realms, channels, real HTTP, and `io.offload` | Native/C ABI, build, Worker probe, Flutter runtime/binding, and archived offline replay pass. HTTP/offload require declarations and grants, and i2c/uart lack providers. Full streaming/backpressure/mixed-domain recording acceptance remains open. |
| Vue Vapor, Octane, and MicroTS public builds | Outside current public builds. Solid remains default. |
| WeChat mini-program host | One real QuickJS WASM Guest plus QJBC/PAK passed Node pointer, state, pixel, and host-response tests. Dynamic System and Worker/offload are explicitly rejected. DevTools and physical-device acceptance remain open. |
| Complex Sprite, DeepZoom, physics, and multiple outputs | Scenario, pixel, input, or release gaps remain. See UI/services audits and implementation records. |
| Sustained high-refresh performance and physical energy use | Device acceptance remains open. FPS statistics have no fixed 60 FPS cap. |
