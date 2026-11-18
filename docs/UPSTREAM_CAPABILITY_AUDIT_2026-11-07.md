# Upstream Capability Audit and Integration Roadmap

Reviewed on 2026-11-07 against the official PocketJS commit pinned by Pocket, `99924de47c62fa36f526a8791055d91cbbdb3836`. Compatibility is scoped to this revision. The report covers the working tree, including uncommitted changes. [Pinned source and patch entry point](../scripts/prepare_upstream.py)

## Findings and Evidence

Host services, input devices, and resource tooling are the main opportunities. Upstream already provides reusable layout, responsive UI, animation, gestures, 2D physics, and Workers. Many gaps lie between target declarations, providers, resource packaging, and targeted acceptance.

The official registry contains **32 capability IDs**. UI components and target-specific support are tracked separately. The default Flutter target declares `text.glyphs.baked`, `runtime.worker`, `input.touch`, and `display.viewport.live`. SystemUI additionally declares `ui.compositor-surfaces`. Optional runtime grants and SDK plugins are outside this default list, whose length does not measure overall coverage.

The sweep covered **35 official demos**. Of those, **33 built and completed a one-frame native startup test**, and two were limited by auxiliary-display requirements. The 33 entered the resource catalog. Interaction acceptance, platform coverage, and Flutter/Web/Safari FPS were outside the sweep. Results are in `demo/build/official-demos/report.json` with `frames=1,warmup=0`. [Publishable demo catalog](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/assets/apps/official/catalog.json)

Integrated means an execution path exists. Partial means only part of the contract or validation is present. A gap lacks an end-to-end host path. Dedicated-target capabilities require specific devices or products. Source availability, demo startup, and bridge unit tests provide separate evidence.

## Integration Evidence

- Large images. The Lantern build reuses texture preprocessing to separate artwork masters from runtime textures. Native execution of QJBC/PAK produces draw operations for 12 real textures after a click. [Large image implementation](LARGE_IMAGE_IMPLEMENTATION.md)
- Game input. Flutter enables it on demand. Web feeds standard Gamepad and keyboard observations into the official frame structure. Web tests compile real QJBC and verify text and pixel changes. [Game input implementation](GAME_INPUT_IMPLEMENTATION.md)
- Standalone Web Worker. Browser, Flutter, and Editor evidence is documented separately. [Web Worker implementation](WEB_WORKER_IMPLEMENTATION.md)

## Official Contracts and Host Coverage

Contracts come from `sdk/.cache/pocketjs/contracts/spec/platform-types.ts` and neighboring `contracts/spec/*.ts`. The pinned script regenerates the cache. [Flutter target declarations](../scripts/flutter_target.ts), [Session admission](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/sdk/lib/src/pocket_session.dart)

| Official capability | Current status | Remaining work and acceptance |
| --- | --- | --- |
| `runtime.worker` | Independent QuickJS realm, Worker QJBC, descriptor, channels, wakeup, and disposal are wired to Editor and Flutter. | Verify cross-platform cancellation, backpressure, exceptions, and mixed realms. Maintain a separate Worker realm. |
| `net.http` | Worker HTTP requires both a declaration and origin grant. Real local HTTP regression passed. | Verify TLS, offline, redirects, timeout, cancellation, size limits, and devices. Keep networking in the Worker. |
| `io.offload` | Bounded providers, session/generation handling, cancellation, late-result isolation, and main record/replay path exist. | Add real application providers and stress tests on the existing transport. |
| `io.i2c`, `io.uart` | Board-level providers are missing. | Integrate per device requirement. Keep disabled by default for ordinary mobile games. |
| `input.touch` | Default with real pointer → Guest → frame path. | Verify multitouch, cancels, cross-surface handling, and device edge cases. |
| `input.pointer`, `input.cursor` | Touch and Focusable do not cover full mouse hover or joystick-derived cursor semantics. | Implement mouse edges, hover, wheel, drag, and official cursor opt-in while retaining gesture and focus behavior. |
| `input.buttons`, `input.analog.left`, `input.analog.right` | Flutter added optional keyboard and controller buttons/dual-stick ingress. Web added optional keyboard and standard Gamepad sampling using official bitmasks and packed axes. | Real Web QJBC frame and pixel changes passed. Flutter still needs a physical controller provider and USB/Bluetooth matrix. [Game input implementation](GAME_INPUT_IMPLEMENTATION.md) |
| `input.text`, `input.ime` | Raw text ingress and Flutter system IME are wired. Full official semantics are outside the default target declaration. | Verify hardware keyboard, composing text, candidate-window placement, emoji and CJK devices. Avoid duplicate IME and raw-text delivery. |
| `input.touch.auxiliary`, `display.auxiliary` | A second output and corresponding touch path within one AppInstance are missing. | Implement viewport, resources, coordinates, and input routing together. System child surfaces are a separate feature. |
| `ui.compositor-surfaces` | SystemUI supports child sessions and handle/focus/clip/Z/generation. Editor has a registry. | Verify actual multi-QJBC input, disposal, reload, switching, and platforms. Retain one catalog source. |
| `ui.physics` | Native core is enabled. Basic world and disposal are tested. The default target omits the declaration. | Verify collisions, jelly, zones, particles, visuals, input, and release before exposing a grant. Reuse the official engine. |
| `audio.pcm` | SDK audio extensions and playback are separate from official PCM credit/ring/clock requirements. | Reuse the official contract for native sink, credit, underrun, pause, background, and disposal. |
| `media.playback` | SDK video and texture support covers only part of the official media namespace. | Align open/status/pause/volume, audio clock, decoder availability, and texture release. |
| `camera.qr`, `camera.photo` | SDK `hardware.camera.*` providers exist. Direct official camera contract needs adaptation. | Reuse permissions, capture, textures, and lifecycle. Add QR, photo listing, JPEG, and deletion semantics, with physical-device tests. |
| `data.fs` | App/shared JSON KV exists. Per-app official file trees are separate. | Reuse path, quota, and pagination contracts with isolated app directories. Keep large IO orchestration out of Dart business state. |
| `host.clipboard` | IME and generic RPC alone leave the clipboard contract uncovered. | Implement copy/cut/paste, async failures, foreground/background constraints, and real editing acceptance. |
| `display.viewport.live` | Dynamic viewport is supported by default. | Verify layout, hit testing, IME, and resource density together after resizing. |
| `text.glyphs.baked` | Default support. GLYPH_RUN reuses official glyph pages, T8, and the image channel. | Verify text pixels, replacement fonts, and fallback. Full Unicode shaping requires separate tests. |
| `text.glyphs.streamed`, `text.glyphs.runtime` | Low-level font stream operations exist. Complete archive and runtime glyph services require integration. | Open, retrieve, and submit glyphs. Test cancellation, quota, cache invalidation, dynamic Chinese, and emoji. |
| `text.layout.native`, `text.layout.offload` | Host measuring and offload foundations exist. Official declaration, full service, and complex-script guarantees need alignment. | Verify common provider for measure/layout, shaping, fallback, line wrapping, offline behavior, and timeout. |
| `link.companion`, `system.wifi`, `system.agent` | Dedicated device and companion capabilities distinct from generic network, Bluetooth, and AI APIs. | Integrate official protocols when the product needs them and report availability accurately. |

## Games and UI

| Upstream layer | Current foundation | Remaining work and validation |
| --- | --- | --- |
| Nodes and drawing | view/text/image/surface and DrawList → Rust → PFB1 → Flutter resource/Canvas path, including GLYPH_RUN. | Verify pixels, clips, alpha, transforms, resource revision, and release for each draw op. Startup covers native execution only. |
| Controls, scrolling, focus, and gestures | Pinned framework has reusable behavior. Business composition is in JS. Components absent from `pocket_ui` re-exports can be imported directly from upstream. | Expand public API where needed. Reuse click, drag, focus, scroll, disable, and cancel behavior, adapting skins or specific required behavior. |
| Animation and scheduling | Reuses upstream animation/motion/clock. On-demand deadline and wakeup regressions exist. | Verify continuous animation, interruption, background recovery, and long idle. JS remains responsible for orchestration. |
| Sprite/atlas/IndexedImage | Upstream resource and drawing primitives are reusable. | Verify frame animation, UVs, palettes, transparency, pixel density, release, and actual FPS. |
| DeepZoom/TILESET/virtual lists | Upstream implementation exists, and zoomlab and related demos have startup evidence. | Verify pan and zoom, tile eviction, large-list interactions, and memory. |
| 2D physics | Official core enabled. | Verify complex interactions and stable frame times. Reuse upstream world/body/collider and remove duplicate state. |
| 3D scenes | Official `engine/pocket3d` is a separate substrate. Flutter and Web offer 2D and limited 2.5D. | Full 3D needs a dedicated rendering, resource, input, and platform scope. Surfaces and system.agent provide separate capabilities. |

The math helpers in `pocket_ui/src/motion.ts` are separate from official `animate/spring`. Real `video_player`/Texture support is separate from `videoOpen/Tick/Texture/Close` providers, and VN audio intents are separate from a PCM sink. TEXT_RUN is wired, but full upstream shaping and Unicode metrics parity with Flutter TextPainter requires verification. Web has optional keyboard and standard Gamepad sampling. Ordinary WeChat sends neutral buttons and axes without a provider. Relative deltas and the raw GuestFrame text lane still require alignment.

## Toolchain, Editor, and Resource Consistency

The public build uses Solid and a pinned buildGuest → QJBC/PAK pipeline. Upstream also contains Vue Vapor, Octane, and MicroTS. Integration requires SDK aliases, types, manifests, Workers, Editor, scaffolding, bytecode validation, and release artifacts. Select a framework based on need and compare the same scenario while retaining a shared compiler pipeline.

Editor Web Preview executes the Guest through a local native probe. Document native execution, preview pixels and input, Flutter bridging, and device results independently. Browser-only JS/WASM execution and direct browser access to system hardware are separate capabilities. Register hardware providers on demand and return actual unsupported or denied results.

The standalone Web SDK packages Worker QJBC and descriptors and runs real HTTP in the browser. Its optional render Worker reuses the same UI engine and has a separate role. Flutter and Editor capabilities still require their own validation. [Web Worker implementation](WEB_WORKER_IMPLEMENTATION.md), [Web render Worker](WEB_RENDER_WORKER.md)

| Environment | Worker and HTTP | Offload | Lifecycle and record/replay |
| --- | --- | --- | --- |
| Flutter native | Independent realm with HTTP origin/redirect/size/timeout/backpressure/cancel handling. | Bounded native queue and Dart provider/broker. | Pause, virtual clock, stop/join/generation, trace and replay exist. Mixed streaming and full device matrix remain. |
| Editor Web Preview | Native probe executes real Workers. Local HTTP verified. | Flutter-equivalent providers require separate verification. | Probe can record and replay. Browser projects DrawOps and events. |
| Standalone Web SDK | Independent Worker QJBC/descriptor and real HTTP verified, with 12 consecutive requests each in main-thread and render Worker modes. | UI engine and raster can run in an explicitly enabled render Worker. Other offload providers still need acceptance. | Hide/resume and disposal passed. Complete replay remains unverified. |

Reuse `native/src/worker.rs`, `native/src/offload.rs`, `packages/pocket_flutter/lib/src/pocket_worker_runtime.dart`, `pocket_offload_runtime.dart`, and `pocket_recording.dart`. For standalone Web, check independent realms in the runtime before wiring artifacts, configuration, and providers. When Flutter is hidden, the Worker virtual clock freezes, while native IO deadlines remain managed by their own domain.

An Editor full rebuild encountered a resource packaging blocker. The new 1024×1536 `demo/js/apps/lantern/art/station.png` exceeded the default prebuilt npm PAK compiler's requirement that both dimensions be powers of two and ≤512. Evaluate atlases, tiling/DeepZoom, or a resource-path upgrade in the same pinned toolchain. Apply changes to the compiler the build actually runs and keep the original artwork. This result was separate from the standalone Worker HTTP regression.

The version backend, LAN publishing, signing, versioning, and OTA belong to the Pocket SDK product layer. Keep one update implementation with an initial full PAK, subsequent resource deltas, manifest/hash validation, and atomic switching. Capability integration should reuse the existing cache and update lifecycle.

Validate public target declarations and actual Session grants separately. The target controls compilation and resolution, and host configuration and providers control availability. The report's `hostCompatibility` records default Session gaps.

The official `framework/src/devtools.ts`, `tools/devtools.ts`, and inspection, pause, step, and tape transport semantics are reusable. Editor preview and recording only cover a subset of official device debugging. The prebuilt manifest checks revision, ABI, and hash. Release validation should also verify agreement between source and packaged tools.

## Recommended Order and Acceptance Gates

These are independent work packages. Capability counts and unmeasured device requirements do not establish time estimates.

| Priority | Work package | Estimated scope | Acceptance |
| --- | --- | --- | --- |
| P0 | Consistent build and resource entry points, including large images | Medium, blocks the new game build | Same pinned compiler in scaffold, Editor, and Showcase, with actual large-image display and no duplicate cache |
| P1 | Standalone Web Worker/HTTP/offload and replay | Medium to large, depending on existing independent realms | Complete artifacts/config, real browser requests, cancellation, disposal, and offline replay validated in standalone Web |
| P1 | Keyboard, mouse, gamepad, and official capability admission | Medium | Real input changes Guest frames. Verify disconnect, cancel, focus, dead zones, and actual grants. |
| P1 | PCM and official media | Medium to large, depending on platform sink/decoder | Audible output, audio/video clocks, credit, background, and disposal in Web Preview and Flutter separately |
| P1 | Dynamic fonts and layout | Medium to large | Arbitrary Chinese, emoji, and complex scripts, font fallback, cancellation, release, and measure/layout agreement |
| P1 | Sprite, DeepZoom, physics, and declarations | Small to medium, mostly wiring and scenario acceptance | Real input, pixel changes, resource release, and sustained frame timing before broadening support |
| P2 | Official FS, clipboard, and camera | Medium across three independent providers | Isolated paths and quotas, real clipboard, and device permissions and camera lifecycle using existing providers |
| P2 | Worker/HTTP/offload reliability matrix | Medium, main path exists | TLS, cancellation, backpressure, replay, quotas, late messages, and mobile |
| P3 | Auxiliary screens, other frameworks, board IO/companion | Large or product-specific | Confirm requirements, then validate full dual-screen output/input, one framework release pipeline, and actual hardware as appropriate |

The eight P0/P1/P2 packages include several validation and adaptation tasks. Decide P3 extensions by product need. The list is a roadmap, and its items do not give a completion percentage.

## Reused Sources and Ablation

The review also inspected `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`. Legacy FFI, permission and hardware, resources, and interaction cases provide reusable evidence. Retain actual platform outcomes.

- Transport references came from parent `native/pocket_runtime_multi.c`. Glyphs and clock behavior reuse pinned upstream. [Glyph and scheduler implementation](GLYPH_AND_SCHEDULER_IMPLEMENTATION.md)
- Reused parent `lib/core/real_hardware_bridge.dart` and related files, retaining actual hardware outcomes and removing dummy photo and permission fallbacks. [Hardware reuse](HARDWARE_REUSE.md)
- Reused the pinned independent Worker and IO contracts. The parent lacked a directly reusable independent Worker HTTP implementation. [Worker and IO implementation](WORKER_IO_IMPLEMENTATION.md), [Official Worker Preview](WORKER_OFFICIAL_PREVIEW.md)
- Retained upstream catalog, role, and surface contracts with the existing thin host. [System compositor implementation](SYSTEM_COMPOSITOR_IMPLEMENTATION.md), [Multi-app implementation](MULTI_APP_IMPLEMENTATION.md)

Begin each package with an ablation. Run the same interaction through the existing and adapted paths, and observe input-to-frame behavior, pixels and resources, native calls, memory, and wakeups. Remove duplicate layout, providers, Dart state, and caches. Add layers only when measured gaps require them.

New evidence here includes the 35-demo sweep, real UI and Worker compilation, local HTTP completion, and Flutter Worker catalog and grant tests. Full service coverage, device power, Safari compatibility, and sustained FPS remain outside these results. The earlier UI and services reviews are historical baselines. Use later implementation records for Worker, focus, and raw text. [UI review](POCKETJS_FEATURE_PARITY_UI.md), [Services review](POCKETJS_FEATURE_PARITY_SERVICES.md)

## Appendix: Declarations and Startup Results for 35 Official Demos

`passed` covers the build and one-frame native startup. Required and Enhanced are app declarations. Host-provided capabilities are listed separately.

| Demo | Native startup | Required (common baked glyphs omitted) | Enhanced |
| --- | --- | --- | --- |
| `3ds-demo` | platform_limited | `display.auxiliary`, `input.buttons`, `input.touch.auxiliary` | `input.analog.left` |
| `blackberry-classic-demo` | passed | `input.buttons` | `input.touch` |
| `cafe` | passed | `input.buttons` | — |
| `cards` | passed | `input.buttons` | — |
| `chrome` | passed | `input.buttons` | — |
| `clear` | passed | `input.touch`, `io.offload` | — |
| `companion-zero` | passed | `input.buttons` | — |
| `cursor` | passed | `input.buttons` | `input.cursor` |
| `devkit` | passed | `input.buttons` | — |
| `gallery` | passed | `input.buttons` | — |
| `gba-hero` | passed | `input.buttons` | — |
| `hero` | passed | `input.buttons` | `display.viewport.live` |
| `im` | passed | `input.buttons` | `input.analog.left` |
| `iphone16-demo` | passed | `input.touch` | — |
| `iphone2g-demo` | passed | `input.touch` | — |
| `iphone4s-demo` | passed | `input.touch` | — |
| `ipodnano-hero` | passed | `input.buttons` | — |
| `ipodtouch-demo` | passed | `input.touch` | — |
| `launcher` | passed | `input.buttons` | — |
| `library` | passed | `input.buttons` | — |
| `meizu-m8-demo` | passed | `input.touch` | — |
| `motions` | passed | `input.buttons` | — |
| `music` | passed | `input.buttons` | `audio.pcm` |
| `nexus` | platform_limited | `display.auxiliary`, `input.buttons`, `input.touch.auxiliary`, `ui.physics` | `system.agent` |
| `nexus-touch` | passed | `input.touch`, `ui.physics` | — |
| `note` | passed | `input.buttons` | `display.viewport.live`, `host.clipboard`, `input.ime`, `input.pointer`, `input.text`, `text.glyphs.runtime`, `text.layout.native` |
| `notifications` | passed | `input.buttons` | — |
| `nsengine` | passed | `input.touch` | — |
| `settings` | passed | `input.buttons` | — |
| `solid-aot-lab` | passed | `input.buttons` | — |
| `stats` | passed | `input.buttons` | — |
| `text-cjk` | passed | `input.buttons`, `io.offload`, `text.glyphs.streamed` | — |
| `text-offload` | passed | `input.buttons`, `io.offload`, `text.layout.offload` | — |
| `worker-http` | passed | `input.buttons`, `net.http`, `runtime.worker` | — |
| `zoomlab` | passed | `input.buttons` | — |
