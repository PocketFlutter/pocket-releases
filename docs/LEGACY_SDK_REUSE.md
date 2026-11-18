# SDK capability reuse from the legacy Demo

> This is a historical baseline. The [2026-11-03 source review and migration candidates](LEGACY_REUSE_REVIEW_20261103.md)
> tracks subsequent implementation and ablation. Some coverage and gap findings below describe
> the state before those changes.

Reviewed `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps` and `native`
on 2026-11-02, excluding the old repository's `pocket_host/`. Login, weather pages, and
account data belong to the Demo consumer. Public SDK coverage is evaluated independently.
See the [legacy native audit](LEGACY_NATIVE_AUDIT.md) for actual `native/` behavior,
current SDK counterparts, and migration boundaries.

## Public implementations

| Legacy source | SDK destination | Boundary |
| --- | --- | --- |
| `syslib/pocket_syslib_graphics.js` | `packages/pocket_ui/src/graphics.ts`, exported through `@pocket/ui` and `@pocket/ui/graphics` | Pure particle frames, six-entity orbit and segment calculations, and SVG specs. Scene, Rapier, and 3D rendering are outside this implementation. |
| `syslib/pocket_syslib_router.js` | `packages/pocket_ui/src/legacy.ts` | Calculates four transition descriptors. The old C Navigator and cross-sandbox return values are separate gaps at this checkpoint. |
| `pocketjs_uikit.js` | `packages/pocket_ui/src/legacy.ts` and `mobile.tsx` | Glass recipes, SDF calculations, and real Flutter glass surface using the current surface runtime. |
| `syslib/pocket_syslib_flutter_ui.js` | `packages/pocket_ui/src/mobile.tsx` and new JS widgets | Compose existing PocketJS and Solid primitives. The old `{tag,props,children}` VDOM and Dart component interpreter stayed outside the migration. |
| `syslib/pocket_syslib_hardware.js` | `packages/pocket_hardware` | Actual iOS and Android permissions and hardware providers. Production reports actual device results. |
| `syslib/pocket_syslib_ota.js` | `packages/pocket_services` | Existing signed qjbc and PAK update path. |
| `native/pocket_runtime_multi.c/.h` duplex ABI | `native/src/duplex.rs` and `pocket_duplex.dart`. See `DUPLEX_TRANSPORT.md`. | ABI v2 uses two lock-free SPSC queues, atomic publication, batched FFI, and independent Arc lifetime. Actual QuickJS callbacks and emits use scalar JS boundaries. The old C echo was removed. |

## Capability gaps at this checkpoint

The old `app_game_detail` needs actual Scene asset loading, Rapier collision, continuous
BLE controller notifications, and shared state across runtimes. The old router needs
the full asynchronous push-result lifecycle. Legacy declarations alone establish
neither current implementation nor support.

Legacy `.pjc`, `build_aot`, runtime bundles, plugin lock inventories, and page metadata
are incompatible with the current QuickJS qjbc ABI. Public APIs are recompiled
through the current pipeline. External projects import SDK packages directly.

## Validation methods

- Run `bun sdk/packages/pocket_ui/test/graphics.test.ts` for graphics calculations.
- The Demo consumes public `@pocket/ui` to render particles and UI. Integration
  tests must exercise actual QuickJS pointer interactions and frame changes.
- Duplex layout, backpressure, lifecycle, and integration have separate evidence.
  Actual JS end-to-end zero-copy claims require more than the old C echo.

## Full legacy tree review, excluding pocket_host

The review inspected `lib/`, `native/`, `mini_apps/`, `tools/`, `ios/`, `android/`,
`macos/`, `shaders/`, `assets/svg/`, `wechat_host/`, `web_wasm_preview/`, `test/`,
and `tests/`. Findings come from implementations and call chains. The legacy app
was not run and no legacy caches were generated.

### Priority SDK integration candidates

| Priority | Technology | Implementation evidence | Reusable parts and gaps at the time |
| --- | --- | --- | --- |
| P1 | Deep-link input | Cold-launch and URLContext handling in `ios/Runner/SceneDelegate.swift` and forwarding in `AppDelegate.swift` | Legacy iOS has an actual platform entry point. SDK lacked reusable URL ingress. A thin platform plugin should forward URL facts to JS for routing and permission decisions. Verify Android cold and warm launches and unsubscription. |
| P1 | Binary duplex | Shared ring mappings in `native/pocket_runtime_multi.h` and `lib/core/ffi_bridge.dart` | Reuse fixed 16-byte messages, two queues, batching, and backpressure. Legacy JS did not participate and the C echo only exercised native layout. See `DUPLEX_TRANSPORT.md`. |
| P1 | Shared JS controls | `mini_apps/syslib/pocket_syslib_flutter_ui.js` | This round exported Divider, Chip, determinate progress, FAB, IconButton, and NavigationDestination using current official primitives. |
| P1 | Graphics calculations and assets | `syslib/pocket_syslib_graphics.js` and `assets/svg/` | Public math and SVG specifications were migrated. 3D rendering and physics need separate implementation. |
| P2 | On-demand scheduling and drawing isolation | `_syncTickerState`, RepaintBoundary, and page subtree cache in `lib/render/pocket_ui_components.dart` | Reuse regression scenarios for idle tick suspension, resume, and transition cache invalidation. PocketView has idle and dirty mechanisms. Leave the Dart page stack and unbounded cache out. |
| P2 | Frame diagnostics | addTimingsCallback and throttled HUD updates in `lib/core/perf_monitor.dart` | Current FPS and history could expand to UI, raster, and jank breakdowns with HUD self-trigger filtering. Old prefilled 60 FPS and fixed timings were placeholders. |
| P2 | Navigation lifecycle and return values | `syslib/pocket_syslib_router.js` and old Dart router | Transition formulas are migrated. Push-result, cancel, appear, and disappear can become pure JS SDK contracts. Freeze and prewarm must track actual runtime, independent of historical C flags. |
| P2 | Plugin schemas and type generation | `mini_apps/pocket_plugins.json` and `tools/sync_pocket_plugins.py` | Version, permission, method schema, TS generation, and disabled configs are references. Derive from the compiled registry. Fixed sizeKB and text matching do not establish trimming. |
| P2 | Sensor data tools | Barometric altitude and BLE decoding in `syslib/pocket_syslib_hardware.js` | Standalone helpers can validate lengths and ranges. Malformed packets should report errors. Real values require a hardware transport. |
| P3 | New host adaptation | `wechat_host/core/wx_pocket_host.js` | Retained-node protocol and Canvas command mapping can inform a future host. The code uses setData and WXML without PocketJS WASM core. A distributable multi-target SDK needs further implementation. |

### Existing coverage to reuse

- The old `_PocketFlutterNativeKeyboardInput` informs system keyboard scenarios.
  The SDK already uses Flutter EditableText. Extend real-input regressions there.
- Legacy iOS AppDelegate permission, camera, BLE, location, and biometric behavior
  moved into providers with shared Texture handling. Current Android exceeds the
  legacy default Activity runner.
- Legacy Liquid Glass SDF, rim lighting, and sampling informed the SDK's recipe
  and shader surface. Keep one implementation and compare visuals and performance.
- Keep current QuickJS bytecode, signed updates, rollback, PAK, fixed tick, DrawList,
  and delta cache.

### Legacy components excluded from direct integration

1. Much of `native/pocket_runtime_multi.c` sandbox, memory tiers, watchdog, 3D, video,
   plugins, and OTA only simulates state and lacks QuickJS execution. Reuse ABI and scenarios.
2. `lib/core/pocketjs_bundle_runner.dart` and `lib/render/pocket_ui_components.dart`
   hold business state in Dart and use the old VDOM. Business UI remains in JS.
3. `lib/core/real_hardware_bridge.dart` fallbacks fabricate successful photos, BLE,
   sensor, and weather data after failures. Exclude them from production.
4. `tools/compile_pocket_syslib_aot.py` returns `header + js_bytes` from
   `compile_pjc_binary`, where the payload is source with comments and spacing
   removed. Node-evaluated VDOM JSON is also source-derived data. Real bytecode
   requires the current QuickJS compilation pipeline.
5. `tools/sync_pocket_plugins.py` retains methods with `m_name in js_source` and
   estimates savings from fixed sizeKB. Actual binary trimming requires stronger
   evidence. Lock and declaration files alone do not establish Flutter compilation
   or registration.
6. `web_wasm_preview/index.html` uses JavaScript DataView reads and writes to
   `WebAssembly.Memory`, and echo is a JS function. It instantiates no WASM
   module and has no cross-worker atomic synchronization. Its layout is useful
   reference material.
7. `tests/verify_architecture.py` exercises old C state through ctypes. Screenshot
   tests use the old Dart renderer and machine-specific absolute paths. Reuse
   scenarios, then obtain actual runtime, hardware, performance, and isolation evidence.

### Integration order

Complete deep-link ingress and the binary transport with actual consumers first.
Improve shared JS widgets in parallel, followed by navigation results, lifecycle,
and diagnostic metrics. Multiple guests, budgets, VFS, 3D, and build-time native
plugin trimming each need deliberate design, limits, and acceptance.

### Ablation and acceptance

- Keep the current QuickJS runtime, Solid primitives, and signed update state machine.
  The old C runtime, Dart VDOM, `.pjc` toolchain, and OTA manager stay outside the SDK.
- Use existing messages for low-frequency control and the shared binary ring for
  high-frequency fixed numeric payloads. Keep business state in its existing owner.
- Verify native transport with actual JS reads and replies, full queues, missing
  handlers, handler exceptions, and access after reload and disposal. ABI layout
  and end-to-end behavior have separate checks.
- Compare CPU time, allocations, FFI counts, and p95 frame time using identical
  1, 64, and 255-message loads, device, and Release or Profile mode. Historical
  claims of 120 FPS or percentage gains are outside this evidence.

## Recorded implementation validation

- `cargo test --locked --lib binary_duplex` passed five tests for actual QuickJS
  reads and replies, missing handlers, and handler exceptions.
- `cargo test --locked --test duplex_layout` passed six cases for one million
  concurrent atomic SPSC messages, full queues, role exclusivity, and shutdown
  races. A separate manual Release benchmark exists.
- `pocket_flutter: flutter test test/pocket_duplex_test.dart` covers the wire
  protocol, batched FFI counts, and access after disposal. See `DUPLEX_TRANSPORT.md`
  for actual FFI and latest observed results.
- `bun sdk/packages/pocket_ui/test/graphics.test.ts` passed pure graphics tests.

These are targeted source and host checks. ABI v2 Android arm64 and iOS arm64
simulator native libraries were rebuilt and checked for exports. Ship them with the
host, then separately establish device execution and end-to-end performance on them.

- `flutter_widgets.test.ts` compiled the independent consumer fixture using SDK
  imports.
- `flutter_widgets_native.test.ts` passed actual QuickJS pointer callbacks, FAB
  disable and restore, Chip and navigation selection colors, and actual progress
  DrawOp width increases from 50% to 60% to 70%.
- After removal of this round's business Mini Apps page, Showcase rebuilt with
  243,948-byte qjbc and 334,112-byte PAK. The architecture boundary check passed.
