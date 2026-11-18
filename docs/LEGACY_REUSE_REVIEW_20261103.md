# Legacy Demo Capability Review and Migration Candidates

Review date: 2026-11-03. This historical review helps maintainers select later SDK work. It did not implement any migrations.

## Scope and Evidence

- The comparison used `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` at HEAD `d95fdcd`, excluding `pocket_host/`, and the current repository at `1b39b1a` plus working-tree changes, including the UI and actual memory-limit implementation.
- The original `pocket_flutter_poc/PocketJSKit` was unavailable locally, so the review could only inspect one of the two original demos.
- The coordinator and three Luna Max workers examined platform experience, native code and resources, plugins and hardware and updates, and JS/UI/multi-app/WeChat. Findings cross-checked implementations, callers, and consumers. Labels, declarations, and fixed counts alone were insufficient evidence.
- The review did not rerun device, build, or performance experiments. An implemented capability means the code exists. Platform acceptance and performance benefits require separate measurement.

**The old demo contains useful code, alongside declarations, optional hooks, and simulated state. Prioritize gaps between platform entry points, JS APIs, and actual providers. Retain the existing runtime and JS-owned business UI.**

P1 denotes SDK entry points recommended for near-term work, P2 depends on actual consumer needs, and P3 is deferred. These were review recommendations.

## A. Reusable Legacy Implementations with Remaining Gaps

| ID | Candidate | Legacy implementation and current gap | Suggested ownership and priority |
| --- | --- | --- | --- |
| A1 | Deep links on cold and warm launch | The old iOS app has real URL entry points, initial/latest caching, and MethodChannel dispatch. The current SDK lacks a unified links capability, public JS API, and app selection policy. The old code demonstrates URL schemes only. | Platform plugin receives events. JS SystemUI parses them, selects an app, and dispatches. **P1**. |
| A2 | JS/TS plugin type generation | The old build script generates `.d.ts` namespaces, method signatures, and aliases. The current runtime descriptor has method permissions and quotas, but lacks complete argument and result schemas and a corresponding JS plugin type generator. | Build tooling and the JS types package generate declarations from compiled plugins and explicit schemas. **P1**. |
| A3 | Status bar and Android navigation bar styling | The old Dart runner applies `SystemUiOverlayStyle`. Current JS light and dark UI lacks a public OS chrome API. Safe-area geometry is already handled separately. | JS provides the current page's style. The thin host applies it and restores the previous style on page exit or app switch. **P1**. |
| A4 | Haptic feedback | Old buttons and touchpads call Flutter `HapticFeedback`. JS components currently lack a general haptics capability. | Thin platform capability triggered by JS interactions. Support disabling it and rate limits, with no persistent polling. **P2**, when needed for production app experience. |
| A5 | Pure BLE parsing and barometric altitude functions | The old syslib has packet parsing and formulas that can become JS utilities. The old packet formats, city presets, and weather DTOs are mostly demo-specific. Corrupt packets and failures must retain genuine error handling, without fixed humidity, temperature, or simulated weather. | Optional JS utilities with explicit protocols, units, lengths, and ranges. **P2**. |
| A6 | Particle and orbital math | Old JS computes particle positions and orbits for six entities. Current `graphics.ts` exports only SVG specs. The `line/arc` values returned by the old functions lack a current consumer. | Adapt to existing official drawing primitives or DrawOps when required and verify the real rendering path. **P2**, driven by graphics needs. |

### A. Source Evidence and Acceptance

**A1 — Deep links**

- Old cold and warm entry points, caching, and push dispatch. [SceneDelegate.swift:14](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/ios/Runner/SceneDelegate.swift:14), [SceneDelegate.swift:19](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/ios/Runner/SceneDelegate.swift:19), [AppDelegate.swift:186](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/ios/Runner/AppDelegate.swift:186)
- Current app entry points and hardware capabilities have no general links integration. [AppDelegate.swift](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/demo/ios/Runner/AppDelegate.swift), [AndroidManifest.xml:36](../../demo/android/app/src/main/AndroidManifest.xml:36), [hardware_plugin.dart:36](../packages/pocket_hardware/lib/src/hardware_plugin.dart:36)
- Verify cold and warm processes, buffering before JS readiness, duplicate URIs, invalid destinations, missing target apps, back navigation, and unsubscribe after disposal. Android needs a new platform entry point.

**A2 — Plugin type generation**

- Old generator and generated declarations. [sync_pocket_plugins.py:256](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/tools/sync_pocket_plugins.py:256), [pocket_flutter_plugins.d.ts:1](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/pocket_flutter_plugins.d.ts:1)
- Current descriptors expose capability name, kind, and permissions. Full signatures require an explicit schema. [pocket_plugin.dart:36](../packages/pocket_services/lib/src/pocket_plugin.dart:36), [pocket_plugin.dart:100](../packages/pocket_services/lib/src/pocket_plugin.dart:100)
- Verify type checking in a standalone consumer, compile errors for invalid arguments, agreement between the actual registry and generated declarations, and accurate declarations of platform availability. Runtime authorization remains separate from generated types.

**A3 / A4 — Production app platform experience**

- Old OS chrome configuration and application. [pocketjs_bundle_runner.dart:322](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/pocketjs_bundle_runner.dart:322), [pocketjs_bundle_runner.dart:349](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/pocketjs_bundle_runner.dart:349)
- Old real haptic call. [pocket_ui_components.dart:779](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/render/pocket_ui_components.dart:779)
- The current SDK and Demo's Dart, public JS, Swift, and Kotlin have no `SystemChrome`, `SystemUiOverlayStyle`, or JS-facing haptics implementation. A shared request entry already exists. [host.ts:31](../packages/pocket_ui/src/host.ts:31)
- Reuse platform calls and define the JS contract. Keep page state and preset policy in JS. Verify legible dark-page text, restoration after returning from nested pages and closing child apps, and absence of haptics in the background or for disabled buttons.

**A5 / A6 — Optional pure functions**

- Old hardware utilities. [pocket_syslib_hardware.js:22](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_hardware.js:22)
- Old orbit and particle math and current graphics exports. [pocket_syslib_graphics.js:60](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_graphics.js:60), [pocket_syslib_graphics.js:114](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_graphics.js:114), [graphics.ts:7](../packages/pocket_ui/src/graphics.ts:7)
- Math unit tests cover only arithmetic. Verify real rendering, BLE packet reception, and performance separately. Restore providers when a consumer needs them.

## B. Gaps Requiring New End-to-End Integration

| ID | Capability | Current and legacy evidence | Recommendation |
| --- | --- | --- | --- |
| B1 | Continuous BLE and sensor subscriptions | Dart provides bounded stream transport and plugin stream permissions and quotas. A public JS adapter and continuous hardware streams are missing. Upstream service/media wrappers require explicit integration with Flutter `PocketStreamBridge`. Old declarations, optional hooks, and passive sampling do not establish a full Guest subscription. | **P1 for telemetry.** Connect JS subscriptions to actual event producers, cancellation, and foreground/background suspension. Reuse duplex for high-frequency scalars as needed. Use device events for streams. |
| B2 | BLE GATT interactions | Real scan, connect, and service discovery exist. Characteristic reads, writes, and notifications lack a public end-to-end API. Old interface lists do not establish a real GATT provider. | **P1 for peripheral apps.** Add controlled methods and event streams with disconnect, timeout, permission revocation, duplicate completion, and disposal handling. |
| B3 | Release-time plugin dependency locks and ABI checks | Current code offers runtime registration, negotiation, activation, and method permissions. The old lock generator uses string matching to detect method use. Its size savings come from preset sizeKB estimates, with no evidence of native binary trimming. | **P2.** Reuse dependency constraints and reproducible inventories. Measured size improvements and dynamic native installation would require separate evidence. |
| B4 | JS plugin enable/disable interface | The old bundle defines registration, enable/disable, and tree-shake shim names. The current trusted host registers and activates plugins, with no equivalent public Guest management API. Old shims do not load native code dynamically. | **P2 for platform management.** JS can request changes allowed by trusted policy. Native code installation and permission grants stay with the trusted host. Omit the simulated tree-shake API. |
| B5 | Multi-app, SystemUI, and Workers for WeChat | The current target runs real QuickJS bytecode and PAK, drawing, and touch. It supports one Guest and one main surface. The builder rejects PocketSystem and Worker projects. The legacy WeChat host has simplified nodes and helpers with no complete multi-realm engine. | **P2**, higher if WeChat must align with Flutter. Integrate real multi-Guest, compositor, and Worker support using the existing rendering model. |
| B6 | Independent syslib module updates | The current update unit is a complete signed Guest package. The old `hotUpdatable` inventory and metadata manager lack the complete per-module verification, loading, health promotion, and rollback path. | **P3.** Design dependencies, signing, compatibility, and atomic rollback only if independent system-library releases are required. Reuse the OTA lifecycle. |
| B7 | VFS and sandboxed file API | PAK, app storage, and shared namespaces exist. There is no common writable virtual path resolver. Old C and WeChat helpers mainly concatenate strings and lack VFS security guarantees. | **P2 for file-oriented apps.** Requires path normalization, symlink protection, namespaces, permissions, and actual disk quotas. |
| B8 | Advanced graphics such as 3D Scene, Rapier, or HDR | The full old `Scene.loadNode/getSharedTransformArray/onCollision` public path is absent. The old C transform arrays, collision queue, video frame counter, and simulated VRAM count provide limited infrastructure. Current textures and surfaces already exist. | **P2 for games.** Use actual official capabilities and retain the existing scene ABI. Verify GPU and physics behavior with actual consumers. |
| B9 | Whole-app resource budget | QuickJS heap and PAK admission are actually limited, with separate Worker realm limits. Whole-app RSS, GPU textures, decoded frames, and aggregate Worker memory are outside these hard limits. Old memory tiers and VRAM trimming mainly simulate counters. | **P2.** Add accounting across resources and an eviction policy if platform-level guarantees are needed. |
| B10 | Android microphone | Microphone permission can be declared, but the Android provider returns unsupported. Old declarations do not establish real cross-platform recording. Define permissions, recording, and audio streams separately. | **P1** if the SDK promises Android microphone support. Otherwise document platform support accurately and keep unsupported behavior explicit. |
| B11 | Stable public compositions such as DeepZoom | The pinned framework has Gallery, Lazy, Portal, DeepZoom, and related primitives. There is no complete compatibility wrapper for the old catalog. Stable `@pocket/ui` integration and visual device acceptance for DeepZoom remain possible. | **P2.** Add small JS compositions for demonstrated scenarios and use the existing primitives. The old catalog had 38 `View.*` entries. |
| B12 | Same-app navigation promises and page lifecycle | Cross-app `openApp/result` runs today. The Demo also has a page stack, but no public same-app `push()->Promise / pop(result)` API. The old wrapper depends on optional router globals. Excluding `pocket_host/`, the real host path could not be established. | **P2.** If a stable in-app router is needed, compose the page stack, cancellation, results, and page hooks in JS. Report this separately from cross-app runtime lifecycle. |

### B. Source Locations

- Stream transport, plugin stream guard, JS entry, and hardware methods. [pocket_stream.dart:19](../packages/pocket_services/lib/src/pocket_stream.dart:19), [pocket_plugin.dart:301](../packages/pocket_services/lib/src/pocket_plugin.dart:301), [host.ts:31](../packages/pocket_ui/src/host.ts:31), [hardware_plugin.dart:36](../packages/pocket_hardware/lib/src/hardware_plugin.dart:36)
- Current GATT paths. [iOS BLE:913](../packages/pocket_hardware/ios/Classes/PocketHardwareManager.swift:913), [Android BLE:545](../packages/pocket_hardware/android/src/main/kotlin/dev/pocketjs/pocket_hardware/PocketHardwarePlugin.kt:545)
- Old lock file and estimated size report, and dynamic plugin shim. [sync_pocket_plugins.py:219](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/tools/sync_pocket_plugins.py:219), [pocketjs_runtime_bundle.js:83](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/pocketjs_runtime_bundle.js:83)
- WeChat builder rejection of multi-app and Worker projects and current support. [build_wechat.ts:580](../scripts/build_wechat.ts:580), [WeChat host implementation](WECHAT_HOST_IMPLEMENTATION.md)
- Old independent syslib declaration and current release packaging. [pocket_syslib_manifest.json:19](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/pocket_syslib_manifest.json:19), [package_update.ts](../scripts/package_update.ts)
- Old VFS and KV implementation and game caller. [pocket_runtime_multi.c:519](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/native/pocket_runtime_multi.c:519), [app_game_detail/main.js:5](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/app_game_detail/main.js:5)
- Actual memory limits and coverage boundaries. [APP_MEMORY_LIMITS.md](APP_MEMORY_LIMITS.md)
- Unsupported Android microphone response. [PocketHardwarePlugin.kt:283](../packages/pocket_hardware/android/src/main/kotlin/dev/pocketjs/pocket_hardware/PocketHardwarePlugin.kt:283)
- Old same-app optional wrapper and current public cross-app API. [pocketjs_runtime_bundle.js:43](/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/pocketjs_runtime_bundle.js:43), [platform.ts:68](../packages/pocket_ui/src/platform.ts:68)

## C. Existing Integrations and Replacements

| Capability | Current implementation and scope |
| --- | --- |
| Real precompiled QuickJS bytecode, PAK, signed updates, versions, health commit, and rollback | Implemented in `sdk/native`, `pocket_services`, and current publishing tools. The old `.pjc` used source with a prepended header. |
| JS multi-app registry, SystemUI, cross-app opening and results, lifecycle, messaging and storage, prewarming and LRU | The current background policy suspends apps. [Multi-app implementation](MULTI_APP_IMPLEMENTATION.md), [system.ts](../packages/pocket_ui/src/system.ts), [platform.ts](../packages/pocket_ui/src/platform.ts) |
| Official System child-app compositing | Implemented for Flutter. WeChat support is tracked separately. [System compositor implementation](SYSTEM_COMPOSITOR_IMPLEMENTATION.md) |
| Bidirectional lock-free transport | `native/src/duplex.rs` uses atomic SPSC and real QuickJS consumption. High-frequency scalar traffic and low-frequency control follow separate paths. End-to-end zero copy applies only where supported. [Duplex transport](DUPLEX_TRANSPORT.md) |
| Worker, IO, offload, and recorded facts | Implemented with coverage varying by target and fixture. [Worker IO implementation](WORKER_IO_IMPLEMENTATION.md), [Recording and replay](RECORDING_REPLAY.md) |
| Actual per-realm memory limits | Real enforced limits supersede the old static tier descriptions. [App memory limits](APP_MEMORY_LIMITS.md) |
| Flutter native input, JS mobile components, and transitions | Input adaptation in `pocket_flutter`; `pocket_ui/src/mobile.tsx`, `flutter-widgets.tsx`, and `legacy.ts`. Business UI stays in JS. |
| Liquid Glass SDK component and surface | `mobile.tsx` and Flutter surfaces. The user deferred the Showcase entry. Performance and visual quality require separate acceptance. |
| Video decoding and display, and camera Texture | `pocket_flutter` uses `video_player`. `PocketVideoOp` makes `PocketView` create an actual VideoPlayerController and display a Texture. Camera has a real platformTexture provider. The official companion `.pkst` and media service providers are separate optional integrations. The old HDR and video frame-count page does not determine current video support. |
| iOS and Android hardware providers | Actual platform code in `pocket_hardware`. Platform coverage and device acceptance are tracked separately. Providers return actual failures. |
| Independent Flutter FPS, historical and jank measurements, on-demand scheduling | Separate Flutter engine and SDK measurements exist. Earlier prefilled 60 FPS, constant durations, and manual simulated ticks were excluded. High refresh and power targets require separate measurements. |

## D. Redundant Legacy Designs to Leave Behind

1. Keep the real Rust and QuickJS implementation for sandboxing, memory, watchdog, graphics, video, and OTA. The old C implementations simulated those states.
2. Keep JS and official primitives as the UI and layout owners. The old Dart page state, `{tag, props, children}` interpreter, and recursive WeChat WXML node tree would duplicate that state.
3. Use the actual QJBC pipeline. The old `.pjc`, comment-stripped source with a binary header, and Node-generated VDOM JSON use incompatible formats.
4. Reliable trimming, supply-chain verification, and performance claims require actual measurements and validation. The old script matched plugin strings, assumed fixed sizeKB, and used simulated SHA/ABI hashes.
5. SDK providers must return actual BLE, location, weather, and photo failure outcomes. The old demo returned success fixtures on some errors.
6. Login lobby interactions, weather pages, city presets, and graphics demo assets are Demo features and provide no evidence of SDK platform migration.

This assessment reviewed code and its consumers. Runtime ablation remained outside scope. For later performance work, measure CPU, allocations, FFI calls, p95/p99, long frames, and idle energy on the same device and workload in Profile or Release before deciding which approach to retain.

## E. Suggested Review Order and Remaining Acceptance

The suggested sequence was **A1 Deep Links → A2 type generation → A3 system bars → A4 haptics** to complete external integration and production app experience. For real peripheral apps, pursue **B1 continuous streams and B2 GATT** as one integration. Select remaining work based on product needs.

Three existing capabilities still needed acceptance.

- High-refresh hardware requires actual 90 Hz, 120 Hz, or higher testing for input latency, long frames, idle CPU, and energy. Simulator 60 FPS only covers its own environment.
- Physical iOS and Android hardware testing covers first permission, denial, permanent denial, foreground recovery, cancellation and timeout, BLE disconnection, and release of camera, photo, and location resources.
- WeChat developer tools and physical devices must verify load, touch, input, storage, package limits, and low-end device performance. Host WASM tests cover the host only.

Earlier reviews are historical baselines. Claims that the graphics math was migrated, multi-app support was missing, or memory limits were future work were superseded by the source review and current implementation docs. Distinguish cross-app results from in-app page-stack results. [LEGACY_SDK_REUSE.md](LEGACY_SDK_REUSE.md), [LEGACY_NATIVE_AUDIT.md](LEGACY_NATIVE_AUDIT.md)

## Review Record

- Used `git rev-parse --short HEAD` and scoped `git status` to identify both baselines and working-tree changes, preserving concurrent edits.
- Used `rg` to locate old implementations, current public exports, platform providers, callers, and consumers. Compared numbered source lines for each item.
- Checked old iOS deep-link cold and warm entry points, current capabilities and iOS/Android runners, and real SystemChrome and haptics paths and their missing public entry points.
- Checked plugin type generation, lock algorithm, current descriptors, stream transport, WeChat builder restrictions, and actual `graphics.ts` exports.
- `python3 sdk/scripts/check_architecture.py` and documentation local-link existence checks passed. These checks cover architecture and links only.
- The work added this report and a historical baseline note in the old reuse docs. It left the old project unexecuted, its caches ungenerated, and implementation source untouched.
