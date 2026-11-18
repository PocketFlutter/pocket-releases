# Flutter and Dart API reference

See the [generated signature catalog](DART_API_SIGNATURES.md) for all public members,
parameters, defaults, and overloads. This page describes integration behavior and limits.

The public entry point is `package:pocket_sdk/pocket_sdk.dart`. Declare optional packages
explicitly in the consumer's `pubspec.yaml` and import them by name. Some low-level types
are available only from their own packages. Import plugin schema types from
`package:pocket_services/pocket_services.dart`.

See [Project API](API.md) for navigation and [API_SURFACE.json](API_SURFACE.json) for package
entry points, export filters, and declarations. Refer to the public declarations for exact
types of named parameters. Use public exports and respect `show` and `hide` filters.

## Choose an entry point

| API | Required or primary properties | Defaults and use |
| --- | --- | --- |
| `PocketApp` | `config: PocketAppConfig`, `active`, `backgroundColor`, `loadingBuilder` | Standalone MaterialApp and Scaffold. Active by default with a black root background. |
| `PocketGuest` | Same properties. Nullable backgroundColor. | Embeds in an existing Flutter page, sharing the SDK frame loop and leaving application routing to the host. |
| `PocketSystemHost` | `systemUI`, `applications`, controller, initialLaunch, active, catalogLoader, onCloseWithResult, and related properties | Multi-guest SystemUI container for an existing Flutter app's tab or route. |
| `PocketSystemHostApplication` | Direct constructor, `fromBundledAssets`, or `fromHostConfig` | Includes an app shell and Navigator, catalog loading, and remote bootstrap. |

`PocketApp` and `PocketGuest` take `key, config, active, backgroundColor, loadingBuilder`.
`PocketGuestSession` is visible in source. The umbrella library exports App and Guest
as the public application entry points. Mount creates the session, and unmount releases
the runtime and resources. `active` combines with ancestor `TickerMode` and AppLifecycle.
Background views cannot run foreground capabilities.

See [Host parameters, catalog, launch, and controller](HYBRID_HOST_API.md),
[Hybrid host setup and launch modes](HYBRID_FLUTTER_TAB_HOST.md), and
[Basic integration](SDK_INTEGRATION.md).

## Trusted host configuration with PocketAppConfig

The native configuration establishes permission ceilings. A guest manifest can narrow
them. See [pocket_config.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_config.dart).

| Property | Default and meaning |
| --- | --- |
| `appId` | Required stable application identity for updates, storage, and policy. |
| `bytecodeAsset` | `assets/app.qjbc`, actual QJBC from the pinned compiler. |
| `pakAsset` | `assets/app.pak`. |
| `metadataAsset` | `assets/app.bytecode.json`, with digest and ABI admission information. |
| `manifestAsset` | `assets/guest-manifest.json`. |
| `updates` | Nullable `PocketUpdateConfig`. Remote success requires a configured source and a real verified update. |
| `downloadOnOpen` | false. Controls signed package preparation before remote open. |
| `showFps` | false. For diagnostics. |
| `fontFamilyFallback` | Empty list. Host font fallbacks. |
| `keyboardInputEnabled` / `keyboardAutofocus` | false / false. Opt in to native keyboard input. |
| `keyboardButtonMap` | Empty map. Maps `LogicalKeyboardKey` to guest button masks. |
| `rawTextInputEnabled` | false. Optional raw key and IME bridge for editor views. See [Studio text input](STUDIO_TEXT_INPUT.md). |
| `textLayoutCacheCapacity` | 256. Bounded `PocketTextLayoutCache` entry limit passed to `PocketView`. |
| `allowedPermissions` | Empty set. Trusted host permission ceiling. |
| `pluginFactories` | Empty list. Creates capability providers per verified generation. |
| `additionalCapabilities` | Empty set. Explicit additional capabilities still require provider registration. |
| `recordingFactory` / `diagnostics` | Nullable. Recording controls and diagnostics integration. |
| `compositorSurfaces` | Empty map. Trusted host mapping of appId to handle. |
| `workerHttpOrigins` | Empty set. Authorized Worker I/O origins. |
| `offloadProviderFactory` | Nullable. Native offload boundary. |
| `memoryLimits` | `const PocketMemoryLimits()`. Heap and PAK admission budgets. See [Memory limits](APP_MEMORY_LIMITS.md). |
| `bootstrapMetadataJson` / `bootstrapManifestJson` | Nullable. Prepared bootstrap text still goes through admission. |

`copyWith({...})` returns a new config. `withPlugins(factories)` replaces the complete
list. To append, explicitly pass `[...config.pluginFactories, ...newFactories]`.
`withNativePolicy(policy)` merges trusted native policy. `validate()` throws on invalid
configuration. The runtime uses config equality to detect changes. Reuse provider
closure identities across build frames.

## PocketUpdateConfig and updates

The `PocketUpdateConfig` constructor defaults `url, indexUrl, baseUrl, hostVersion,
packageVersion, keyId, publicKey` to empty strings and `namespace` to `'default'`.
`trustRootKeyId, trustRootPublicKey, trustPolicyUrl` are nullable.
`PocketUpdateConfig.fromEnvironment()` reads build defines. See the source and
[Update modes](PACKAGE_UPDATE_MODES.md) for mappings.

The `debugHttpHosts` constructor argument defaults to an empty list. The getter returns
the effective HTTP host allowlist. It applies in all build modes. The session adds
default developer hosts in debug only.

| Member | Use and result |
| --- | --- |
| `configured` | Whether valid update source and signature trust are configured. |
| `trustPolicyConfigured` | Whether root-signed trust policy is enabled. |
| `manifestUri(packageId)` | Resolves the canonical update entry point. `packageVersion` selects admission compatibility independently of the canonical URL path. |
| `validate()` | Rejects incomplete or invalid configuration. Surface validation failures to the caller. |

The client stores public keys only. Private signing keys stay with the publisher.
See [Trust and updates](PACKAGE_UPDATE_MODES.md), [Update before opening](MINI_APP_UPDATE_BEFORE_OPEN.md),
and [COS publishing](COS_PUBLISH.md). `pocket_services` exports package validation,
trust policy, and the update coordinator. Direct consumers import that package and
reuse its cancellation and progress lifecycle.

## Advanced PocketSession lifecycle

Most applications use the widgets above. `PocketSession({required config, beforeGenerationMount})`
is a ChangeNotifier. Direct consumers own subscriptions and disposal.

| Member | Behavior |
| --- | --- |
| `initialize({prepareForOpen=false, cacheFirst=false})` | Initializes once and returns a Future. Supply both options on the first call and handle errors. |
| `setForeground(bool)` | Serializes foreground transitions subject to widget and app lifecycle. |
| `hasConfiguredCapability(name)` | Checks configured capabilities without altering authorization. |
| `setInitialEvents(events)` / `initialEvents` | Stores events for generation startup only. |
| `addEventListener` / `removeEventListener` | Receive `PocketEvent`. Remove listeners when finished. |
| `ready, failure, lastError, stage, generation` | Actual startup, failure, and generation facts. Use those facts to determine admission. |
| `foreground, mountedPayloadSha256, tickHz, memoryLimits` | Current runtime facts. |
| `transferProgress, remotePackagePreparationInProgress` | Observed remote preparation progress. |
| `controller` | Low-level view control boundary. |
| `config, appId, capabilities, beforeGenerationMount` | Configuration, identity, admitted generation capabilities, and pre-mount hook. The hook runs before a verified package is published to Flutter. |
| `runtimeInfo()` / `status()` | Synchronous runtime summary and asynchronous status, respectively. Both read state only. |
| `prepareForOpen({...})` | Prepares a package using existing signed-open admission. See source for deadline and cancellation parameters. |
| `inspectUpdate({checkLatest=false, cancellation})` | Inspection only. Returns null if unconfigured, throws busy when occupied, and leaves installed pointers in place. |
| `prepareUpdate({cancellation})` | Stages a signed candidate. Activation requires the health check. |
| `onEvent`, `onPerformanceSample`, `onReady`, `onError` | Runtime and widget boundary callbacks usually driven by the host. |
| `close()` | Future that waits for teardown and pending initialization, background preparation, and persistence to finish. |
| `dispose()` | Starts cleanup. A disposed session cannot be reused. |

Use the public signatures in [pocket_session.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_session.dart) for
additional diagnostics and update members. Keep callbacks scoped to their own generations.

## Plugin API and capability admission

A `PocketPlugin` implements `descriptor` and can override `register(context)`,
`activate(context)`, `deactivate(context)`, and `dispose()`. `backgroundSafe` defaults to
false. Set it to true only for trusted coordination that avoids foreground device resources.

`PocketPluginDescriptor` declares id, version, capabilities, permissions, limits, and
related metadata. Use `PocketPluginContext.registerRequest` and `registerStream` for
provider registration. `PocketCapabilityKind` differentiates requests and streams.
`PocketCapabilityException` carries structured errors. Schema types, registry, and stream
context come from `pocket_services`. Report unregistered capabilities as unavailable.
See [Plugin types](PLUGIN_TYPES.md) and [Streams](JS_HOST_STREAMS.md).

| Optional package | Public entry point or config | Limits and reference |
| --- | --- | --- |
| `pocket_hardware` | `HardwarePlugin.forPocketViewController`, `HardwarePermissions` | Compatibility bundle. New consumers should select domain packages as needed. |
| `pocket_hardware_core` | Common hardware contracts, permissions, and provider types | Shared contracts. Device capabilities require their respective providers. See [Hardware modules](HARDWARE_MODULES.md). |
| `pocket_permissions` | `PocketPermissionsPlugin` | Queries, requests, and opens settings for system permissions. The host supplies static declarations. |
| `pocket_camera` | `PocketCameraPlugin` | Camera textures and capture. Authorize textures with the actual controller. |
| `pocket_bluetooth` | `PocketBluetoothPlugin` | Scan, GATT, and notifications. See [Hardware streams](HARDWARE_STREAMS.md). |
| `pocket_sensors` | `PocketSensorsPlugin` | Native callback push, bounded streams, and lifecycle revocation. |
| `pocket_location` | `PocketLocationPlugin` | Constrained by host and system permissions. |
| `pocket_biometrics` | `PocketBiometricsPlugin` | Actual platform authentication. Unsupported platforms report unavailability. |
| `pocket_weather` | `PocketWeatherPlugin` | Actual location and network facts. JS handles application policy. |
| `pocket_clipboard` | `PocketClipboardPlugin` | Plain-text clipboard read and write, `clipboard.read` and `clipboard.write`. See [Clipboard plugin](CLIPBOARD_PLUGIN.md). |
| `pocket_file_picker` | `PocketFilePickerPlugin` | System file-open dialog through `files.open`. Returns opaque handles only. See [File picker plugin](FILE_PICKER_PLUGIN.md). |
| `pocket_platform` | `PocketPlatformPlugin`, `PocketDeepLinkPlugin` | System bars and haptics register separately from links. See [Platform experience](PLATFORM_EXPERIENCE.md). |
| `pocket_dio` | `PocketDioPlugin(allowedOrigins=[], requestTimeout=30s, maxResponseBytes=256KiB, dioFactory?)` | Empty origins deny network access. Worker I/O applies. Guest timeouts can only shorten the deadline. See [Optional plugins](OPTIONAL_PLUGINS.md). |
| `pocket_audio` | `PocketAudioPlugin.forPocketViewController` | Consumers register the plugin and limit resource prefixes. JS owns VN and audio policy. |
| `pocket_live2d` | `PocketLive2dPlugin.fromBundledCatalog` | Model resources and native decoding. JS owns orchestration. |
| `pocket_studio` | `PocketStudioPlugin`, `PocketStudioConfig`, `PocketStudioService` | Maps 53 allowlisted `studio.*` capabilities to local Editor service routes with CSRF injection, path and key redaction, and SSE. See [Studio provider](STUDIO_PROVIDER.md). |
| `pocket_sync` | `PocketSyncPlugin` | Embedded HTTP and WebSocket sync server and cross-subnet client in a separate I/O isolate. Requires `network`. |
| `pocket_archive` | Public archive readers and writers | Path permissions still apply. See [Archive integration](NATIVE_ARCHIVE_INTEGRATION.md). |
| `pocket_diagnostics` | Public collector, storage, uploader, and exporter types | Actual capabilities depend on registration and configuration. See [Diagnostics package](DIAGNOSTICS_PACKAGE.md). |

The inventory below lists each package's declaration names and library paths.
See each public library and guide for extra constructor options, event payloads, and
platform requirements. Device support requires validation with the real transport.

## Diagnostics, recording, Worker, and low-level rendering

- `PocketHostDiagnostics` takes `directory, collector, maxFileBytes, maxRotatedFiles,
  maxRecords, recentLogLimit, captureFlutterErrors=false, capturePlatformDispatcherErrors=false,
  context`. The diagnostics package defines bounded defaults. `ensureCollector()`
  initializes it. `attach(config, controls: false)` binds it. Read `collectorOrNull`,
  `journalPath`, and `closed`. Manage error hooks with `attachFlutterErrors()` and
  `detachFlutterErrors()`. Write with `recordLog`, `recordCrash`, `recordSessionLog`,
  and `recordSessionCrash`. Query with `list`, `listLogs`, `listCrashes`, and
  `getCrashRecentLogs`. Use `exportRecords`, `clear`, `flush`, and `close` to
  export, clear, flush, and finish. Detach or close error hooks. See [Flutter diagnostics](FLUTTER_DIAGNOSTICS.md).
- `PocketRecordingLibrary` provides `attach(config, controls: false)`, `start()`,
  `status()`, `stop()`, `isRecording`, `replay()`, `export(...)`, and static
  `replayArchive(File)`. Distribution policy gates recording in Release builds.
  See [Recording and replay](RECORDING_REPLAY.md) for assets and native and Worker facts.
- `PocketWorkerArtifact.verify(...)` verifies the bytecode digest, runtime ABI,
  bindingGeneration, tickHz, admitted capabilities, and explicit origins. Returns
  `bytecodePath, sha256, program`. Worker runs bytecode in the pinned native runtime.
- `PocketMemoryLimits`, `PocketWorkerLimits`, `PocketWorkerProgram`, and offload
  request, result, and cancellation types enforce host memory and I/O ceilings. Worker,
  Dio I/O isolate, and Web renderWorker use independent configuration.
- `PerformanceHistory`, `PocketPerformanceSample`, and `PocketLongFrameEvent`
  describe observed performance without owning application state.
- `pocket_flutter` exposes the low-level `PocketView`, `PocketViewController`, DrawOps,
  DisplayGeometry, Duplex, Compositor, Runtime, TextCache, and Recording APIs.
  `pocket_sdk` exports selected types. For application integration, use the existing
  rendering and runtime. See [Flutter source entry point](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/pocket_flutter.dart).
- Apple distribution flags include `pocketAppStoreDistribution`,
  `pocketRemoteCodeEnabled`, and `pocketSessionRecordingEnabled`. The bundled profile
  is explicitly selected. The default uses remote loading policy. See [Distribution](APPLE_APP_STORE.md).

## Package and public declaration inventory

The inventory follows relative `export` chains from the actual Dart entry points.
The [machine-readable inventory](API_SURFACE.json) includes cross-package `show` and
`hide` filters. A declaration in a library is available from `pocket_sdk` only if its
export chain permits it.

### `pocket_archive`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_archive/lib/pocket_archive.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_archive/lib/pocket_archive.dart) | `PocketNativeArchive` |

### `pocket_audio`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_audio/lib/pocket_audio.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_audio/lib/pocket_audio.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_audio/lib/src/pocket_audio_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_audio/lib/src/pocket_audio_plugin.dart) | `PocketAudioActiveChanged`, `PocketAudioPlaybackChanged`, `PocketAudioPlayer`, `PocketAudioPlayerFactory`, `PocketAudioPlayerState`, `PocketAudioPlugin` |

### `pocket_biometrics`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_biometrics/lib/pocket_biometrics.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_biometrics/lib/pocket_biometrics.dart) | `PocketBiometricsPlugin` |

### `pocket_bluetooth`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_bluetooth/lib/pocket_bluetooth.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_bluetooth/lib/pocket_bluetooth.dart) | `PocketBluetoothPlugin` |

### `pocket_camera`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_camera/lib/pocket_camera.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_camera/lib/pocket_camera.dart) | `PocketCameraPlugin` |

### `pocket_clipboard`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_clipboard/lib/pocket_clipboard.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_clipboard/lib/pocket_clipboard.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_clipboard/lib/src/clipboard_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_clipboard/lib/src/clipboard_plugin.dart) | `PocketClipboardCapabilities`, `PocketClipboardPermissions`, `PocketClipboardPlugin` |

### `pocket_diagnostics`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_diagnostics/lib/pocket_diagnostics.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_diagnostics/lib/pocket_diagnostics.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_diagnostics/lib/src/collector.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_diagnostics/lib/src/collector.dart) | `DiagnosticsCollector`, `MemoryDiagnosticsStorage` |
| [packages/pocket_diagnostics/lib/src/file_storage.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_diagnostics/lib/src/file_storage.dart) | `FileDiagnosticsCollector`, `FileDiagnosticsStorage` |
| [packages/pocket_diagnostics/lib/src/flutter_adapter.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_diagnostics/lib/src/flutter_adapter.dart) | `FlutterErrorCollector`, `FlutterErrorCollectorHandle` |
| [packages/pocket_diagnostics/lib/src/normalize.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_diagnostics/lib/src/normalize.dart) | `ResolvedNormalizationLimits`, `TruncationTracker` |
| [packages/pocket_diagnostics/lib/src/types.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_diagnostics/lib/src/types.dart) | `DiagnosticClearFilter`, `DiagnosticContext`, `DiagnosticCrashInput`, `DiagnosticCrashRecord`, `DiagnosticExportBundle`, `DiagnosticLogInput`, `DiagnosticLogRecord`, `DiagnosticNormalizationLimits`, `DiagnosticQuery`, `DiagnosticRecentLogSummary`, `DiagnosticRecord`, `DiagnosticRecordKind`, `DiagnosticSeverity`, `DiagnosticsStorage`, `DiagnosticsStorageAppendOptions`, `NormalizedDiagnosticError`, `RecentLogCaptureMode`, `SynchronousDiagnosticsStorage` |

### `pocket_dio`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_dio/lib/pocket_dio.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_dio/lib/pocket_dio.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_dio/lib/src/dio_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_dio/lib/src/dio_plugin.dart) | `PocketDioPlugin` |

### `pocket_file_picker`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_file_picker/lib/pocket_file_picker.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_file_picker/lib/pocket_file_picker.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_file_picker/lib/src/file_picker_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_file_picker/lib/src/file_picker_plugin.dart) | `PocketFilePickerCapabilities`, `PocketFilePickerPermissions`, `PocketFilePickerPlugin` |

### `pocket_flutter`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_flutter/lib/pocket_flutter.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/pocket_flutter.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_flutter/lib/src/pocket_assets.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_assets.dart) | `PocketPakImage`, `PocketPakImages` |
| [packages/pocket_flutter/lib/src/pocket_binary_codec.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_binary_codec.dart) | `PocketBinaryCodec`, `PocketBinaryOffloadRecord` |
| [packages/pocket_flutter/lib/src/pocket_display.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_display.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_flutter/lib/src/pocket_display_geometry.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_display_geometry.dart) | `PocketDisplayGeometryChannel`, `PocketDisplayGeometrySnapshot`, `PocketDisplayGeometrySource`, `PocketDisplayGeometryUpdate`, `PocketDisplayRegion` |
| [packages/pocket_flutter/lib/src/pocket_duplex.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_duplex.dart) | `PocketBinaryDuplexRuntime`, `PocketDuplexChannel`, `PocketDuplexEndpoint`, `PocketDuplexEvent`, `PocketDuplexMessage` |
| [packages/pocket_flutter/lib/src/flutter_frame_monitor.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/flutter_frame_monitor.dart) | `FlutterFrameMonitor`, `FlutterFrameMonitorController`, `FlutterFrameTimingSample`, `FlutterFrameWindow` |
| [packages/pocket_flutter/lib/src/pocket_model.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_model.dart) | `PocketArcOp`, `PocketClip`, `PocketEvent`, `PocketFrame`, `PocketGradientOp`, `PocketHostSurfaceOp`, `PocketImageOp`, `PocketImageResource`, `PocketMeshLayerBeginOp`, `PocketMeshLayerRestoreOp`, `PocketMeshMaskBeginOp`, `PocketOp`, `PocketPoint`, `PocketRectOp`, `PocketRoundedGradientOp`, `PocketRoundedOp`, `PocketSurfaceFrame`, `PocketTextOp`, `PocketTextureTriangleOp`, `PocketTriangleOp`, `PocketVideoOp` |
| [packages/pocket_flutter/lib/src/pocket_memory_limits.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_memory_limits.dart) | `PocketMemoryLimits` |
| [packages/pocket_flutter/lib/src/pocket_guest_security.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_guest_security.dart) | `PocketGuestSecurityPolicy` |
| [packages/pocket_flutter/lib/src/pocket_host_fonts.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_host_fonts.dart) | `PocketHostFontMetrics` |
| [packages/pocket_flutter/lib/src/pocket_package.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_package.dart) | `PocketPackageManifest`, `PocketPackageSource` |
| [packages/pocket_flutter/lib/src/pocket_performance.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_performance.dart) | `PocketLongFrameEvent`, `PocketPerformanceSample`, `PocketPerformanceSampleCallback` |
| [packages/pocket_flutter/lib/src/pocket_raw_text_input.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_raw_text_input.dart) | `PocketRawTextClient`, `PocketRawTextOutput` |
| [packages/pocket_flutter/lib/src/pocket_startup_progress.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_startup_progress.dart) | `PocketLoadingBuilder`, `PocketStartupProgress`, `PocketStartupStage` |
| [packages/pocket_flutter/lib/src/pocket_runtime.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_runtime.dart) | `FfiPocketRuntime`, `PocketBytecodeMetadata`, `PocketBytecodeRuntime`, `PocketCompositorRuntime`, `PocketNativeStageTimings`, `PocketRecordingReplay`, `PocketReplayRunner`, `PocketReplayRuntimeFactory`, `PocketRuntime`, `PocketRuntimeBytecode`, `PocketRuntimeException`, `PocketRuntimeScheduling` |
| [packages/pocket_flutter/lib/src/pocket_recording.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_recording.dart) | `PocketHostFontMetricsSnapshot`, `PocketRecording`, `PocketRecordingController`, `PocketRecordingEntry`, `PocketRecordingFormatException`, `PocketRecordingMetadata`, `PocketReplayAssets`, `PocketReplayMismatch`, `PocketReplayResult` |
| [packages/pocket_flutter/lib/src/pocket_text_cache.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_text_cache.dart) | `PocketTextLayoutCache` |
| [packages/pocket_flutter/lib/src/pocket_view.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_view.dart) | `PocketDuplexEventCallback`, `PocketEventCallback`, `PocketImageResourceDecoder`, `PocketView`, `PocketViewCapture`, `PocketViewController` |
| [packages/pocket_flutter/lib/src/pocket_compositor.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_compositor.dart) | `PocketCompositorSlot`, `PocketHostSurfaceBuilder` |
| [packages/pocket_flutter/lib/src/pocket_worker_runtime.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_worker_runtime.dart) | `PocketWorkerLimits`, `PocketWorkerProgram`, `PocketWorkerRuntime` |
| [packages/pocket_flutter/lib/src/pocket_offload_runtime.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_flutter/lib/src/pocket_offload_runtime.dart) | `PocketBoundedOffloadProvider`, `PocketOffloadCancellationToken`, `PocketOffloadCancelled`, `PocketOffloadCompletion`, `PocketOffloadKey`, `PocketOffloadProvider`, `PocketOffloadRequest`, `PocketOffloadRuntime` |

### `pocket_hardware`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_hardware/lib/pocket_hardware.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_hardware/lib/pocket_hardware.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_hardware/lib/src/hardware_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_hardware/lib/src/hardware_plugin.dart) | `HardwarePlugin` |

### `pocket_hardware_core`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_hardware_core/lib/pocket_hardware_core.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_hardware_core/lib/pocket_hardware_core.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_hardware_core/lib/src/hardware_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_hardware_core/lib/src/hardware_plugin.dart) | `HardwareCapabilities`, `HardwareCapabilityPlugin`, `HardwareFeature`, `HardwareFeatures`, `HardwarePermissionHandler`, `HardwarePermissions`, `HardwarePlatform`, `HardwarePlatformException`, `HardwareStreamingPlatform`, `HardwareTextureCallback`, `HardwareWeatherFetcher`, `MethodChannelHardwarePlatform` |

### `pocket_live2d`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_live2d/lib/pocket_live2d.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_live2d/lib/pocket_live2d.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_live2d/lib/src/pocket_live2d_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_live2d/lib/src/pocket_live2d_plugin.dart) | `PocketLive2dPlugin` |
| [packages/pocket_live2d/lib/src/pocket_live2d_types.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_live2d/lib/src/pocket_live2d_types.dart) | `PocketLive2dCanvas`, `PocketLive2dCoreFactory`, `PocketLive2dCoreMetadata`, `PocketLive2dCoreModel`, `PocketLive2dCorePlacementUpdater`, `PocketLive2dCoreTopologyReader`, `PocketLive2dDrawable`, `PocketLive2dParameterDefault`, `PocketLive2dParameterMetadata`, `PocketLive2dPartMetadata`, `PocketLive2dPlacement` |

### `pocket_location`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_location/lib/pocket_location.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_location/lib/pocket_location.dart) | `PocketLocationPlugin` |

### `pocket_permissions`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_permissions/lib/pocket_permissions.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_permissions/lib/pocket_permissions.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_permissions/lib/src/permissions_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_permissions/lib/src/permissions_plugin.dart) | `DeviceInfoPlusPocketDeviceInfo`, `PocketDeviceInfo`, `PocketPermissionNames`, `PocketPermissionsCapabilities`, `PocketPermissionsPlugin`, `PocketSystemPermissions` |

### `pocket_platform`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_platform/lib/pocket_platform.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_platform/lib/pocket_platform.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_platform/lib/src/platform_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_platform/lib/src/platform_plugin.dart) | `FlutterPocketPlatformUi`, `MethodChannelPocketPlatformTransport`, `PocketDeepLinkPlugin`, `PocketPlatformCapabilities`, `PocketPlatformClock`, `PocketPlatformHaptics`, `PocketPlatformMethodCallHandler`, `PocketPlatformPlugin`, `PocketPlatformTransport`, `PocketPlatformUi`, `StopwatchPocketPlatformClock` |

### `pocket_sensors`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_sensors/lib/pocket_sensors.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_sensors/lib/pocket_sensors.dart) | `PocketSensorsPlugin` |

### `pocket_services`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_services/lib/pocket_services.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/pocket_services.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_services/lib/src/pocket_guest_manifest.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_guest_manifest.dart) | `GuestManifest`, `PocketCapabilityName`, `PocketGuestManifest`, `PocketPermissionName` |
| [packages/pocket_services/lib/src/pocket_package.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_package.dart) | `PocketArchiveExtractor`, `PocketCancellationToken`, `PocketManifestAsset`, `PocketManifestBundle`, `PocketManifestEntry`, `PocketManifestFile`, `PocketManifestVerifier`, `PocketPackage`, `PocketPackageArtifact`, `PocketPackageException`, `PocketPackageFormatException`, `PocketPackageManifest`, `PocketPackagePreparationProgress`, `PocketPackagePreparationStage`, `PocketPackageStore`, `PocketPakBlobEntry`, `PocketPakManifest`, `PocketPakPart`, `PocketSignedManifest`, `PocketUpdateCancellation`, `PocketVersionInfo` |
| [packages/pocket_services/lib/src/pocket_trust.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_trust.dart) | `PocketReleaseKey`, `PocketSignedTrustPolicy`, `PocketTrustException`, `PocketTrustPolicy`, `PocketTrustStore` |
| [packages/pocket_services/lib/src/pocket_stream.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_stream.dart) | `PocketDuplexStream`, `PocketStreamBridge`, `PocketStreamBufferOverflowException`, `PocketStreamProtocolException`, `PocketStreamRemoteException`, `PocketStreamSend` |
| [packages/pocket_services/lib/src/pocket_host.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_host.dart) | `PocketCapabilityAvailability`, `PocketCapabilityDescriptor`, `PocketCapabilityException`, `PocketCapabilityKind`, `PocketCapabilityRequest`, `PocketCapabilityStream`, `PocketHost`, `PocketHostRawSend`, `PocketHostRegistry`, `PocketHostSend`, `PocketHostStreamContext` |
| [packages/pocket_services/lib/src/pocket_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_plugin.dart) | `PocketPermissionRequest`, `PocketPermissionRequestHandler`, `PocketPlugin`, `PocketPluginBudget`, `PocketPluginCapability`, `PocketPluginCapabilitySchema`, `PocketPluginContext`, `PocketPluginDescriptor`, `PocketPluginLimits`, `PocketPluginManager`, `PocketPluginMethod`, `PocketPluginRegistry`, `PocketPluginSchema`, `PocketPluginSchemaType`, `PocketPluginSession` |
| [packages/pocket_services/lib/src/pocket_update.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_services/lib/src/pocket_update.dart) | `HttpPocketUpdateTransport`, `PocketDownloadResponse`, `PocketPreparedPackage`, `PocketUpdateCoordinator`, `PocketUpdateInspection`, `PocketUpdateMode`, `PocketUpdateProgress`, `PocketUpdateProgressCallback`, `PocketUpdateScope`, `PocketUpdateStage`, `PocketUpdateTarget`, `PocketUpdateTransport` |

### `pocket_studio`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_studio/lib/pocket_studio.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/pocket_studio.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_studio/lib/src/studio_config.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/src/studio_config.dart) | `PocketStudioConfig` |
| [packages/pocket_studio/lib/src/studio_image.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/src/studio_image.dart) | `StudioImagePreview` (plus helpers in `studio_image.dart`) |
| [packages/pocket_studio/lib/src/studio_paths.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/src/studio_paths.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_studio/lib/src/studio_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/src/studio_plugin.dart) | `PocketStudioPlugin` |
| [packages/pocket_studio/lib/src/studio_scrub.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/src/studio_scrub.dart) | `StudioPathScrubber` |
| [packages/pocket_studio/lib/src/studio_service.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_studio/lib/src/studio_service.dart) | `PocketStudioService`, `PocketStudioServiceException` |

### `pocket_sync`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_sync/lib/pocket_sync.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_sync/lib/pocket_sync.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [packages/pocket_sync/lib/src/sync_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_sync/lib/src/sync_plugin.dart) | `PocketSyncPlugin` |

### `pocket_weather`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [packages/pocket_weather/lib/pocket_weather.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/packages/pocket_weather/lib/pocket_weather.dart) | `PocketWeatherPlugin` |

### `pocket_sdk`

| Declaring library | Public top-level type declarations |
| --- | --- |
| [lib/pocket_sdk.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/pocket_sdk.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [lib/src/pocket_app.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_app.dart) | `PocketApp`, `PocketGuest`, `PocketGuestSession`, `PocketGuestSessionState` |
| [lib/src/pocket_config.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_config.dart) | `PocketAppConfig`, `PocketOffloadProviderFactory`, `PocketPluginFactory`, `PocketUpdateConfig` |
| [lib/src/pocket_distribution.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_distribution.dart) | See the library and machine-readable inventory for exports, functions, and constants. |
| [lib/src/pocket_diagnostics.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_diagnostics.dart) | `PocketHostDiagnostics` |
| [lib/src/pocket_bundled_application_catalog.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_bundled_application_catalog.dart) | `PocketBundledApplicationCatalog`, `PocketBundledApplicationEntry` |
| [lib/src/pocket_host_config.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_host_config.dart) | `PocketHostCatalogEntry`, `PocketHostConfig`, `PocketHostLoadProgress`, `PocketHostLoadProgressCallback` |
| [lib/src/pocket_session.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_session.dart) | `PocketSession`, `PocketSessionEventListener`, `PocketSessionGenerationMountHook` |
| [lib/src/performance_history.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/performance_history.dart) | `PerformanceHistory` |
| [lib/src/pocket_recordings.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_recordings.dart) | `PocketRecordingLibrary` |
| [lib/src/package_info_plugin.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/package_info_plugin.dart) | `PackageInfoPlugin` |
| [lib/src/pocket_system_host.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_system_host.dart) | `PocketSystemHost`, `PocketSystemHostAppBuilder`, `PocketSystemHostApplication`, `PocketSystemHostApplicationApprover`, `PocketSystemHostApplicationCatalogLoader`, `PocketSystemHostApplicationsBuilder`, `PocketSystemHostCatalog`, `PocketSystemHostCatalogLoader`, `PocketSystemHostController`, `PocketSystemHostSystemUIApprover`, `PocketSystemHostSystemUIBuilder`, `PocketSystemInstanceSnapshot`, `PocketSystemLaunchRequest`, `PocketSystemLaunchResult` |
| [lib/src/pocket_worker.dart](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/lib/src/pocket_worker.dart) | `PocketWorkerArtifact` |
