# Pocket API Reference

This index covers the Pocket SDK API. Its baseline is the current `sdk/package.json`, the workspace `sdk/packages/*/package.json` files, Dart `pubspec.yaml` files, and exported package libraries. Showcase under `demo/` is a consumer example outside the SDK API.

## Documentation

- Standalone Studio installation, directory selection, and project binding without a Git checkout. [Install Studio](INSTALL_STUDIO.md)
- Generated public constructors, fields, getters, methods, parameters, and defaults using actual export filters. [Dart signatures](DART_API_SIGNATURES.md)
- Generated public types, properties, functions, and overloads based on package exports. [JS/TS signatures](JS_API_SIGNATURES.md)
- Dart facade and host types. [Flutter API](FLUTTER_API.md)
- Stable native Flutter tab host surface. [Hybrid Host API](HYBRID_HOST_API.md)
- Integration, lifecycle, and state boundaries. [Hybrid Flutter Tab Host](HYBRID_FLUTTER_TAB_HOST.md)
- Workspace export paths, component families, core clients, methods, and capability limits. [JavaScript / TypeScript API](JS_API.md)
- Repository npm scripts, `pocket.ts`, Studio service, build tools, and publishing commands. [CLI and tooling API](TOOLING_API.md)
- `pocket_sdk` configuration, app shell, updates, plugins, and platform integration. [Flutter SDK integration](SDK_INTEGRATION.md)
- Existing Dart host reference. [Flutter SDK](FLUTTER_SDK.md)
- Native capability registration and restrictions. [Optional native plugins](OPTIONAL_PLUGINS.md) · [Hardware modules](HARDWARE_MODULES.md) · [Dio IO Worker](DIO_WORKER.md)
- Component names, renderer projection, and outstanding features. [Component contracts](COMPONENTS.md) · [UI feature parity](POCKETJS_FEATURE_PARITY_UI.md)
- Specialized interfaces and runtime boundaries. [Diagnostics package](DIAGNOSTICS_PACKAGE.md) · [Visual novel engine](VISUAL_NOVEL_ENGINE.md) · [Live2D Web support](WEB_LIVE2D.md)
- Consumer guides. [Toolchain requirements](NPM_TOOLCHAIN.md) · [Studio workflow](EDITOR_STUDIO.md) · [Editor project identity and configuration](EDITOR_PROJECT_CONFIGURATION.md) · [Web SDK export](WEB_SDK_EXPORT.md) · [Update package modes](PACKAGE_UPDATE_MODES.md)
- Machine-readable export inventory tracking package exports, recursive re-exports, Dart export filters, declaration locations, and source hashes. It catches missing coverage. Written behavior, defaults, and runtime semantics require review. [Public export inventory](API_SURFACE.json)

## Identifying Public APIs

JS/TS import paths must be listed in each package's `package.json#exports`. A source-file `export` is public only when reachable from a package entry. Dart entry points are package `lib/*.dart` libraries and their actual exports after `show` / `hide` filtering. Exact package paths and declaration baselines are in [`API_SURFACE.json`](API_SURFACE.json). Public types, implementation sources, and the reference guides define behavior, members, parameters, and defaults.

```ts
import { View, Text, Focusable } from "@pocket/ui";
import { createHostBridge, type HostBridge } from "@pocket/ui/host";
import { MobileButton } from "@pocket/ui/mobile";
```

```dart
import 'package:pocket_sdk/pocket_sdk.dart';
import 'package:pocket_dio/pocket_dio.dart'; // Only when the consumer explicitly adds the optional plugin
```

Import through the published entry points. `@pocket/<package>/src/...` and SDK implementation paths absent from the manifest `exports` may change.

## JavaScript Workspace Coverage

`sdk/package.json#workspaces` lists nine Guest/SDK JS workspaces plus the `@pocket/cos` publishing tools. See the API and machine inventory for exact paths, commands, and public declarations. [JS API](JS_API.md)

| Package | Purpose and Interface | Reference and Status |
| --- | --- | --- |
| [`@pocket/ui`](../packages/pocket_ui/package.json) | JS UI primitives and composition, routing, HostBridge, system capabilities, resources, recording, mobile and skin components. Root and 40 named subpaths. | Some upstream nodes and DrawList operations are disconnected. [Component contracts](COMPONENTS.md) · [Integration](SDK_INTEGRATION.md) · [JS API](JS_API.md) |
| [`@pocket/looseleaf`](../packages/pocket_looseleaf/package.json) | Hand-drawn paper, markings, controls, navigation, data, overlays, skins, and kit. Root and named subpaths. | Current workspace source API. Export sources define props, and `@pocket/ui` and the engine constrain interaction behavior. |
| [`@pocket/arc`](../packages/pocket_arc/package.json) | Calm-motion semantic tokens, spring helpers, surfaces, controls, navigation, data, overlays, skins, and kit. | Current workspace source API. Platform capabilities require separate acceptance. |
| [`@pocket/liquid_glass`](../packages/pocket_liquid_glass/package.json) | JS optical surface admission, motion, controls, menus, and a skin adapter. Root and nine named subpaths. | Target behavior depends on the host's glass rendering path. [Liquid Glass](LIQUID_GLASS_PACKAGE.md) |
| [`@pocket/vn`](../packages/pocket_vn/package.json) | Visual novel state machine, authoring, saves, input, audio/video, locale, collections, inventory, mesh/skin, Spine/Live2D, and scene views. | The feature gap reference describes readiness by backend. [Engine](VISUAL_NOVEL_ENGINE.md) · [Authoring](VISUAL_NOVEL_AUTHORING.md) · [Editor](VISUAL_NOVEL_EDITOR.md) · [Feature gaps](VISUAL_NOVEL_LETSGAL_PARITY.md). See the relevant `VISUAL_NOVEL_*.md` guides for specialized features. |
| [`@pocket/spine`](../packages/pocket_spine/package.json) | Spine input/rig/frame types, `createSpineRig`, and atlas page queries. `package.json` marks it private. | The sole package entry is `.`. The integration covers a subset of Spine runtime and attachment rendering. [Spine limits](VISUAL_NOVEL_SPINE.md) |
| [`@pocket/live2d`](../packages/pocket_live2d/package.json) | Cubism manifest, motion, physics, pose, and interaction parsers, plus Pocket transport client. | Web Core is an external licensed dependency, and runtime/provider configuration is separate. [Live2D](VISUAL_NOVEL_LIVE2D.md) · [Web setup and limits](WEB_LIVE2D.md) |
| [`@pocket/diagnostics`](../packages/pocket_diagnostics/package.json) | JS diagnostics records, normalization, collector, browser/Node storage adapters. `package.json` marks it private. | File writes are available only through the Node module entry. [Diagnostics package](DIAGNOSTICS_PACKAGE.md) |
| [`@pocket/sync`](../packages/pocket_sync/package.json) | Multi-endpoint cross-subnet CRDT sync, HKDF-HMAC replay protection, embedded server/client, and Solid reactive state. `package.json` marks it private. | Host network transport requires optional `pocket_sync` registration and `network` permission. [JS API](JS_API.md) |
| [`@pocket/cos`](../packages/pocket_cos/package.json) | COS signing, client, credential discovery, release/Studio publishing helpers, and CLI. | Keep credentials outside documentation. [COS publishing](COS_PUBLISH.md) |

Workspace exports identify the source API. Check actual releases for npm publication and the host references for runtime support. [Published packages](EXTERNAL_PUBLISHED_PACKAGES.md)

## Dart Package Coverage

The SDK has one root package and 21 `pocket_*` packages. The source of truth is local Flutter package source, and each `pubspec.yaml` currently uses `publish_to: none`. The root depends on `pocket_flutter`, `pocket_archive`, `pocket_diagnostics`, and `pocket_services`. Consumers explicitly depend on and register additional providers as needed. This table describes the actual main libraries and exports. [Exact exported symbols](API_SURFACE.json)

| Dart Package / Import | Public Entry Point | Reference |
| --- | --- | --- |
| `pocket_sdk` / `package:pocket_sdk/pocket_sdk.dart` | Integration facade for App/Guest, configuration, session, system host, worker/offload, recording, and package directories. Exports only the explicitly listed types. | [Flutter SDK](FLUTTER_SDK.md) · [SDK integration](SDK_INTEGRATION.md) · [Hybrid Host API subset](HYBRID_HOST_API.md) |
| `pocket_flutter` / `package:pocket_flutter/pocket_flutter.dart` | Flutter view, renderer, input/IME, binary transport, display, frame/performance, and worker/offload host. | [Flutter SDK](FLUTTER_SDK.md) · [Hybrid Host API](HYBRID_HOST_API.md) · [View geometry](POCKET_VIEW_DISPLAY_GEOMETRY.md) |
| `pocket_archive` / `package:pocket_archive/pocket_archive.dart` | Native archive boundary (`PocketNativeArchive`). The public class defines member details. | [Archive integration](NATIVE_ARCHIVE_INTEGRATION.md) |
| `pocket_services` / `package:pocket_services/pocket_services.dart` | Plugin descriptors/capabilities, manifests, signed packages/updates, and host stream contracts. | [Plugin type generation](PLUGIN_TYPES.md) · [Update modes](PACKAGE_UPDATE_MODES.md) · [Host streams](JS_HOST_STREAMS.md) |
| `pocket_diagnostics` / `package:pocket_diagnostics/pocket_diagnostics.dart` | Dart diagnostics collector, storage, Flutter error adapter, and shared types. | [Flutter diagnostics](FLUTTER_DIAGNOSTICS.md) · [Diagnostics package](DIAGNOSTICS_PACKAGE.md) |
| `pocket_hardware_core` / `package:pocket_hardware_core/pocket_hardware_core.dart` | Hardware providers, capabilities/permissions, platform streams, and texture contracts. | [Hardware modules](HARDWARE_MODULES.md) · [Hardware streams](HARDWARE_STREAMS.md) |
| `pocket_hardware` / `package:pocket_hardware/pocket_hardware.dart` | Groups optional camera, Bluetooth, sensor, location, biometric, and weather plugins. Device hardware availability varies. | [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_permissions` / `package:pocket_permissions/pocket_permissions.dart` | OS permission handler and plugin capability. | [Permissions and optional plugins](OPTIONAL_PLUGINS.md) · [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_camera` / `package:pocket_camera/pocket_camera.dart` | Camera permission, preview texture, and capture. Requires platform plugin, declarations, and actual permission. | [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_bluetooth` / `package:pocket_bluetooth/pocket_bluetooth.dart` | BLE scan, GATT, and notifications. | [Hardware streams](HARDWARE_STREAMS.md) · [Local Bluetooth preview](LOCAL_BLUETOOTH_PREVIEW.md) |
| `pocket_sensors` / `package:pocket_sensors/pocket_sensors.dart` | Motion and barometer provider. | [Hardware streams](HARDWARE_STREAMS.md) · [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_location` / `package:pocket_location/pocket_location.dart` | Location provider and permissions. | [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_biometrics` / `package:pocket_biometrics/pocket_biometrics.dart` | Biometric prompt capability provider. | [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_weather` / `package:pocket_weather/pocket_weather.dart` | Weather capability provider. | [Hardware modules](HARDWARE_MODULES.md) |
| `pocket_clipboard` / `package:pocket_clipboard/pocket_clipboard.dart` | Optional text-only clipboard plugin (`PocketClipboardPlugin`, `clipboard.read` / `clipboard.write`). | [CLIPBOARD_PLUGIN.md](CLIPBOARD_PLUGIN.md)、[OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md)。 |
| `pocket_file_picker` / `package:pocket_file_picker/pocket_file_picker.dart` | Optional open-file dialog plugin (`PocketFilePickerPlugin`, `files.open`; returns opaque handles, never host paths). | [FILE_PICKER_PLUGIN.md](FILE_PICKER_PLUGIN.md)、[OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md)。 |
| `pocket_dio` / `package:pocket_dio/pocket_dio.dart` | Dio-based HTTP capability with dedicated IO Worker and host origin policy. | [Dio Worker](DIO_WORKER.md) · [Optional plugins](OPTIONAL_PLUGINS.md) |
| `pocket_platform` / `package:pocket_platform/pocket_platform.dart` | System UI, haptics, deep links, and opt-in system surface transport. | [Platform experience](PLATFORM_EXPERIENCE.md) · [Native surface bridge](OPTIONAL_PLUGINS.md#native-surface-bridge) · [SDK integration](SDK_INTEGRATION.md) |
| `pocket_audio` / `package:pocket_audio/pocket_audio.dart` | Audio plugin and player lifecycle contracts. | [Visual novel audio](VISUAL_NOVEL_AUDIO.md) · [Media lifecycle](MEDIA_LIFECYCLE.md) |
| `pocket_live2d` / `package:pocket_live2d/pocket_live2d.dart` | Licensed Cubism native provider and model/texture contracts. | [Live2D native pack](VISUAL_NOVEL_LIVE2D_NATIVE_PACK.md) · [Visual novel Live2D](VISUAL_NOVEL_LIVE2D.md) |
| `pocket_studio` / `package:pocket_studio/pocket_studio.dart` | Optional Pocket Studio provider (`PocketStudioPlugin`, `PocketStudioConfig`, `PocketStudioService`) mapping 53 allowlisted `studio.*` capabilities to local editor service routes with CSRF injection, path/key scrubbing and SSE streams. | [STUDIO_PROVIDER.md](STUDIO_PROVIDER.md)、[ARCHITECTURE](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/studio/docs/ARCHITECTURE.md)。 |
| `pocket_sync` / `package:pocket_sync/pocket_sync.dart` | Embedded HTTP/WebSocket CRDT sync server and multi-endpoint cross-subnet client provider (`PocketSyncPlugin`). | [Flutter API](FLUTTER_API.md) · [Optional plugins](OPTIONAL_PLUGINS.md) |

Optional plugin packages are registered through the consumer's `PocketAppConfig.pluginFactories` (or generated equivalent). A capability declaration does not install native code, grant OS permission, or guarantee that the device implements the feature; see [optional plugin setup](OPTIONAL_PLUGINS.md).

## Capability Status and Limits

- Public exports define the package surface. Runtime operation requires renderer, native provider, permission, licensed runtime, and target support. Validate with an actual JS Guest build, execution, and input.
- `@pocket/ui` components can map to several native operations. The references track unimplemented and partially verified primitives and components by platform. [Components](COMPONENTS.md) · [UI feature parity](POCKETJS_FEATURE_PARITY_UI.md)
- Optional hardware, platform experience, Dio, and Live2D Core require real host providers or licensed dependencies. Missing host setup and unsupported devices return structured errors. Consumers also register real Web capability handlers. [Web SDK boundary](WEB_SDK_EXPORT.md)
- Check Flutter, Web, and WeChat target implementation and validation separately. [Platform parity](MINI_APP_PLATFORM_PARITY.md) · [Web SDK](WEB_SDK_EXPORT.md) · [WeChat host](WECHAT_HOST_IMPLEMENTATION.md) · [Validation](VALIDATION.md)
- SDK public APIs exclude `demo/`, test fixtures, `sdk/.cache/`, `sdk/.pocket-build/`, and the old parent's `pocket_host/`.

## Provenance and Adaptation

The documentation review covered retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` outside `pocket_host/`: `README.md`, `docs/02_ARCHITECTURE_AND_MEMORY_DESIGN.md`, `docs/03_DUAL_HOST_UI_COMPONENTS_SPEC.md`, `docs/04_DEVELOPER_GUIDE_AND_VERIFICATION.md`, and `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md`. They preserve the Flutter/WeChat architecture intent, component comparisons, and regression cases of the legacy design. The legacy mapping of 20 components and shared-memory, 3D, and OTA designs are provenance references outside the current public API.

This index derives from current `sdk/` manifests, root Dart facade, and exported declarations. JS owns UI, navigation, composition, and app state. Flutter handles rendering, input/IME, lifecycle, resource decoding, and explicitly registered native capabilities. The full behavior references stay linked in place to prevent duplicate API docs from drifting. Specialized docs record verification without extrapolating from old screenshots or static declarations.

## Maintenance Contract

Maintain this index and the companion references alongside the source. [JS API](JS_API.md) · [Tooling API](TOOLING_API.md)

1. Use public package exports, Dart library exports, and actual CLI parser and usage. Private `src/` paths, tests, artifacts, and historical descriptions remain outside the supported surface.
2. For changes to public names, parameters, defaults, results, async completion timing, events, capabilities/permissions, CLI arguments, artifacts, or platform boundaries, update this index, the matching API reference, and runnable examples together. Review signatures, results, errors, events, capabilities, platform support, and migration paths using the PR checklist. [API documentation review items](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/.github/pull_request_template.md)
3. Document the deprecation version, replacement path, and support period before removing or replacing an API.
4. Link API changes to the applicable release or release note. Read actual `package.json` / `pubspec.yaml` for the version baseline.
5. After changing exports, update semantic docs and examples, then check and regenerate the machine inventory. The inventory records SHA-256 for reachable source. Changes to members, signatures, and defaults trigger validation, and implementation-only changes can trigger it conservatively. The checker guards links and export coverage. Human review verifies parameters, defaults, and runtime behavior. [Repository instructions](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/AGENTS.md)

   ```sh
   python3 sdk/scripts/check_api_docs.py
   # Regenerate the declaration baseline and signature catalogs after reviewing API changes.
   python3 sdk/scripts/check_api_docs.py --write
   node sdk/scripts/generate_api_signatures.mjs
   (cd sdk && ../.fvm/flutter_sdk/bin/dart run scripts/generate_api_signatures.dart)
   python3 sdk/scripts/check_api_docs.py
   ```

Signature generation needs the bootstrapped pinned TypeScript compiler and Flutter/Dart analyzer dev dependencies. Standalone Web SDK installation and use need neither maintenance tool. With stale catalogs, `--write` writes the inventory first and then reports a validation failure. Run both generators and check again.

6. See the [0.1.24 distribution notes](RELEASE_0.1.24.md), the [0.1.23 distribution notes](RELEASE_0.1.23.md), and the recorded API changes in the 0.1.22 notes and the 0.1.21 and 0.1.20 historical releases. GitHub Releases determines actual release status. Link only records that cover the API change. [0.1.22](RELEASE_0.1.22.md) · [0.1.21](RELEASE_0.1.21.md) · [0.1.20](RELEASE_0.1.20.md)
