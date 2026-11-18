# Hybrid Flutter host API reference

This reference covers embedding Pocket SystemUI and mini apps in an existing Flutter app. Host Dart types come from `package:pocket_sdk/pocket_sdk.dart`. JS APIs come from the public `@pocket/ui/platform` and `@pocket/ui/system` subpaths. See [Flutter API](FLUTTER_API.md) for full Dart exports and optional imports, and the [hybrid integration guide](HYBRID_FLUTTER_TAB_HOST.md) for the workflow. The [API index](API.md), [JS API](JS_API.md), [Flutter API](FLUTTER_API.md), and [Tooling API](TOOLING_API.md) cover the rest of the SDK.

The Demo's Navigator key, plugin classes, route widgets, app IDs, and configurations are private examples. Register capabilities and navigation in the consumer's Flutter app and JS SystemUI.

## 1. Flutter host components

### PocketSystemHost

Embeds Pocket in an existing MaterialApp, Navigator, or native tab. One trusted host manages SystemUI and children. The direct constructor accepts:

| Parameter | Type | Required or default | Behavior and constraints |
| --- | --- | --- | --- |
| key | Key? | Optional | Flutter widget identity. Remount with a new key when changing the trusted configuration. |
| systemUI | PocketAppConfig | Required | Host-selected and authorized JS SystemUI configuration. |
| applications | Map<String, PocketAppConfig> | Required | Host-approved child configuration by app ID. JS selects an ID from this map. Asset paths are host-owned. |
| maxInstances | int | 8 | Maximum live native sessions, including the non-evictable SystemUI. Reaching the limit does not evict instances automatically. |
| controller | PocketSystemHostController? | Optional | Read-only runtime state and native intent entry points. The creator disposes externally provided controllers. Replacement while mounted is supported, although retaining one controller is preferred. |
| recordings | PocketRecordingLibrary? | Optional | Bounded debug recording library. Replacing it while mounted throws StateError. Remount to change it. |
| diagnostics | PocketHostDiagnostics? | Optional | Persistent diagnostics. The host owns a default app-support collector when omitted. Replacing it while mounted throws StateError. |
| catalogLoader | PocketSystemHostCatalogLoader? | Optional | Loads and verifies a host catalog at a signed-root update or mount boundary. Its rootPayloadSha256 must match the root generation. |
| onClose | VoidCallback? | Optional | Notifies the host of JS SystemUI container closure. |
| onCloseWithResult | ValueChanged<PocketSystemLaunchResult?>? | Optional | Returns a structured result on container closure or unhandled Back exit. |
| initialLaunch | PocketSystemLaunchRequest? | Optional | Delivers one launch intent before the first SystemUI frame. Changing it does not launch again. Use controller.requestLaunchApp at runtime. |
| active | bool | true | Combined with ancestor TickerMode to control foreground sessions and Back interception. May follow tab or route visibility. |
| cacheFirst | bool | false | Show a healthy, verified SystemUI cache first. Misses await signed downloads. An update is staged for next open while the current instance stays active. |
| backgroundColor | Color | 0xFF000000 | Fill for SystemUI root, startup, and error surfaces. |
| nativeEdgeExitEnabled | bool | true | Allows an unhandled native edge swipe to exit. JS guest gestures can still handle Back. |
| nativeExitRoute | TransitionRoute<dynamic>? | Optional | Outer route for native edge exit with a nested Navigator. Usually inferred from ancestor ModalRoute. |
| platformUpdateRequestTimeoutForTesting | Duration? | visibleForTesting only | Injects the update request timeout in tests. |

Trust configuration is fixed for one mount. Changes to systemUI, applications, or maxInstances throw StateError. Remount to change those fields, recordings, or diagnostics. The host can update active and rebind the controller. Both direct and factory construction enforce host permission, plugin, and capability grants.

`PocketSystemHost.fromHostConfig` requires `config: PocketHostConfig`. Optional parameters:

- `key: Key?`, `maxInstances: int = 8`, `controller: PocketSystemHostController?`
- `recordings: PocketRecordingLibrary?`, `diagnostics: PocketHostDiagnostics?`
- `approveSystemUI: PocketSystemHostSystemUIApprover?`, `approveApplication: PocketSystemHostApplicationApprover?`
- `reloadHostConfig: Future<PocketHostConfig?> Function(String? rootPayloadSha256)?`
- `onClose: VoidCallback?`, `onCloseWithResult: ValueChanged<PocketSystemLaunchResult?>?`, `initialLaunch: PocketSystemLaunchRequest?`
- `active: bool = true`, `cacheFirst: bool = false`, `backgroundColor: Color = 0xFF000000`, `nativeEdgeExitEnabled: bool = true`, `nativeExitRoute: TransitionRoute<dynamic>?`

The factory derives root and applications from one PocketHostConfig. Approvers modify root or child config before use. When a catalog exists, the SDK uses verified config to restore or load the catalog matching the root hash. See [SDK integration](SDK_INTEGRATION.md) and [Bundled Application Catalog](BUNDLED_APPLICATION_CATALOG.md) for signed remote updates.

### PocketSystemHostApplication

Use this widget when Pocket owns the top-level Flutter MaterialApp. It handles startup, catalog and host-config loading, error UI, host selection, and exit. Existing MaterialApps embed PocketSystemHost directly.

The raw constructor requires:

- `loadBundledApplications: Future<PocketBundledApplicationCatalog> Function()`
- `buildSystemUI: PocketSystemHostSystemUIBuilder`, a `PocketAppConfig Function(PocketBundledApplicationCatalog)`
- `buildApplications: PocketSystemHostApplicationsBuilder`, a `Map<String, PocketAppConfig> Function(PocketBundledApplicationCatalog)`

Both constructors accept these optional parameters:

- `key: Key?`, `loadHostConfig: Future<PocketHostConfig?> Function()?`, `hostConfigUrl: Uri?`
- `initialHostConfig: PocketHostConfig?`, `initialHostConfigError: Object?`, `initialBundledApplications: PocketBundledApplicationCatalog?`, `initialCatalogError: Object?`
- `controller: PocketSystemHostController?`, `recordings: PocketRecordingLibrary?`, `diagnostics: PocketHostDiagnostics?`
- `approveSystemUI: PocketSystemHostSystemUIApprover?`, a `PocketAppConfig Function(PocketAppConfig)`
- `approveApplication: PocketSystemHostApplicationApprover?`, a `PocketAppConfig Function(String appId, PocketAppConfig config)`
- `appBuilder: PocketSystemHostAppBuilder?`, a `Widget Function(BuildContext, Widget)`
- `onExit: VoidCallback?`, `onCloseWithResult: ValueChanged<PocketSystemLaunchResult?>?`, `initialLaunch: PocketSystemLaunchRequest?`
- `active: bool = true`, `showPerformanceOverlay: bool = false`, `backgroundColor: Color = 0xFF000000`, `nativeEdgeExitEnabled: bool = true`

`fromBundledAssets` requires `catalogAsset: String`, `assetPrefix: String`, `firstCompositorHandle: int`, `lastCompositorHandle: int`, and `systemUI: PocketAppConfig`. Additional optional parameters are `reservedAppIds: Set<String> = {}`, `bundle: AssetBundle?`, `nativePolicies: Map<String, PocketAppConfig> = {}`, and `keyboardInputAppIdPrefixes: Set<String> = {}`.

`fromBundledAssets` reserves systemUI.appId, merges the catalog compositor map into systemUI, and calls catalog.applicationsWithNativePolicies. Matching keyboard prefixes enable keyboardInputEnabled only. PocketSystemHostApplication uses the default maxInstances of PocketSystemHost. For remote or debug config use `loadHostConfig` or `hostConfigUrl`. A custom loader owns its I/O cancellation. The SDK cancels its own URL requests.

Related public types:

- `PocketSystemHostApplicationCatalogLoader` is `Future<PocketBundledApplicationCatalog> Function()`.
- `PocketSystemHostCatalogLoader` is `Future<PocketSystemHostCatalog?> Function(String? rootPayloadSha256)`.
- `PocketSystemHostCatalog` requires `systemUI: PocketAppConfig`, `applications: Map<String, PocketAppConfig>`, and `rootPayloadSha256: String?` and exposes them as fields. The loader must return the mounted root generation's matching hash.

`appBuilder(context, child)` composes the Flutter Pocket shell. Keep JS page and route state in SystemUI. `onExit` handles container exit. If omitted, the widget closes the outer route or restores its bundled host when it is the root route. `onCloseWithResult` reports structured container results. Mini-app results inside JS use the separate JS APIs below.

## 2. Catalog and trusted configuration

### PocketBundledApplicationCatalog

| API | Parameters | Result |
| --- | --- | --- |
| PocketBundledApplicationCatalog.empty | None | Empty immutable catalog. |
| PocketBundledApplicationCatalog.fromJson(value, ...) | value: Object?, required assetPrefix, firstCompositorHandle, and lastCompositorHandle, with reservedAppIds={} by default | Parses and validates schemaVersion 1 JSON. |
| PocketBundledApplicationCatalog.loadFromBundle(catalogAsset, ...) | catalogAsset, optional bundle (rootBundle by default), required assetPrefix, firstCompositorHandle, and lastCompositorHandle, with reservedAppIds={} by default | Loads JSON from the Flutter AssetBundle and validates with fromJson. |
| applicationsWithNativePolicies(...) | nativePolicies={} | Applies host permissions, plugins, and runtime limits to launchable apps while retaining catalog identity and resources. Returns an immutable map. |

Readable fields are entries, launchableEntries, applications, and compositorSurfaces. PocketBundledApplicationEntry exposes appId, launchable, config, workerBytecodeAsset, and declaresHttpWorker. The catalog supplies built paths, launchability, Worker descriptor facts, and stable compositor handles. Hardware, network, and plugin grants belong to the host.

Each catalog applications entry has appId, launchable, and assets.bytecode/pak/metadata/manifest. schemaVersion must be 1. IDs are unique, match `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`, and are outside reservedAppIds. Paths are relative, with no `.`, `..`, absolute path, backslash, or pre-applied assetPrefix. The SDK adds assetPrefix once. Compositor handles range from 2 through 63. Fixed surfaces and dynamic ranges cannot conflict. Dynamic assignment uses catalog order, and launchable=false consumes its position to preserve later IDs. Only launchable entries enter applications and compositorSurfaces. See [catalog schema and tooling](BUNDLED_APPLICATION_CATALOG.md).

nativePolicies keys must identify launchable entries and match the value's PocketAppConfig.appId. Nonempty workerHttpOrigins requires an entry whose compiler Worker descriptor declares HTTP. Unknown IDs, nonlaunchable entries, and mismatches throw FormatException.

### PocketAppConfig and native policies

See [Flutter API: PocketAppConfig](FLUTTER_API.md) for the full field and default table, `copyWith`, `withPlugins`, `withNativePolicy`, and validation. The catalog owns stable appId and QJBC/PAK/metadata/manifest identity. Host nativePolicies own allowedPermissions, pluginFactories, additionalCapabilities, keyboard, Worker origins, offload, memory, diagnostics, and recordings. Editable JS manifests declare requirements. The host grants access.

Call `catalog.applicationsWithNativePolicies(nativePolicies: ...)` for a bundled catalog. Each map key equals policy.appId and identifies a launchable entry. workerHttpOrigins requires HTTP Worker in compiled metadata. The merge preserves appId, assets, updates/bootstrap, and compositor handle from the catalog and uses the host's capabilities and limits. Unknown, nonlaunchable, and mismatched IDs fail.

PocketMemoryLimits applies to QuickJS heap and PAK admission. Process RSS and GPU memory are outside its scope. See [APP_MEMORY_LIMITS.md](APP_MEMORY_LIMITS.md) for limits and default admission, and [Flutter API: PocketUpdateConfig](FLUTTER_API.md), [MINI_APP_UPDATE_BEFORE_OPEN.md](MINI_APP_UPDATE_BEFORE_OPEN.md), and [SDK_INTEGRATION.md](SDK_INTEGRATION.md) for signed updates, downloadOnOpen, and remote code distribution.

## 3. Launch requests, results, and instance snapshots

### PocketSystemLaunchRequest / PocketSystemLaunchResult

`PocketSystemLaunchRequest({required String appId, Object? arguments, String? presentationStyle, bool closeContainerWhenEmpty = true})`

| Field | Behavior and constraints |
| --- | --- |
| appId | Required nonempty child ID. When validate receives systemUIAppId, appId must differ. When it receives applications, appId must be present. |
| arguments | Optional launch arguments. Must be encodable by jsonEncode with at most 65,536 UTF-8 bytes. |
| presentationStyle | Optional nonempty JS child style hint. The JS SDK normalizes page/push or sheet/modal/bottom-sheet. Host embedded/fullscreen mode is independent. |
| closeContainerWhenEmpty | Defaults to true. Close the host when SystemUI has no child pages. Useful for native direct-launch containers. |

`validate({String? systemUIAppId, Map<String, PocketAppConfig>? applications})` enforces these constraints. `toEventParams()` returns the host launch event parameter map. `PocketSystemLaunchResult({required String appId, required bool cancelled, Object? value, String? reason})` exposes the original appId, cancellation, structured value, and optional reason for cancellation or closure. `onCloseWithResult` can receive null. Handle absence, cancellation, and regular values separately.

### PocketSystemHostController / PocketSystemInstanceSnapshot

PocketSystemHostController extends ChangeNotifier.

| Member | Behavior |
| --- | --- |
| instances | Immutable list of current PocketSystemInstanceSnapshot values. |
| requestBack() → Future<bool> | Asks the active guest to handle a native Back. False yields to the embedding route. |
| requestLaunchApp(request) → bool | Validates the request and delivers it to resident SystemUI. Returns whether the attached controller received the event. |
| addListener/removeListener/dispose | ChangeNotifier lifecycle. The widget that created the controller disposes it. An injected controller remains consumer-owned. |

Read-only snapshot fields are instanceId, appId, session, firstFrame, generation, isSystemUI, ready, firstFrameReady, foreground, isPresented, and compositorFocused. isPresented means compositor presentation with a nonempty visible clip. Topmost and foreground are separate observations. Keep app selection, JS stack, result tokens, and eviction policy in their existing owners.

## 4. JS platform and SystemUI routing APIs

The public `@pocket/ui/platform` and `@pocket/ui/system` subpaths expose the integration below. See [JS API](JS_API.md) for components, routers, and specialized packages.

### Platform client

`createPocketPlatformClient(send?, options = {})` creates a guest client. `options.bridge` injects HostBridge. `options.media` defaults to a client-owned MediaController, accepts false to disable it, or accepts a controller or options.

| Member | Behavior |
| --- | --- |
| listApps() | Requests the host-visible app list. |
| launchApp(appId, argumentsValue = null, launchOptions?) → Promise<AppLaunch> | Starts a launch and returns requestId, targetAppId, a result promise, and cancel(). |
| openApp(appId, argumentsValue = null, launchOptions?) → Promise<AppResult> | Convenience wrapper that waits for the structured result. |
| returnResult(value = null) | Returns the current mini app's value to its caller through the bridge. |
| AppLaunch.cancel() | Requests cancellation for this requestId. Its Promise acknowledges host receipt. The matched platform.result/AppLaunch.result confirms the final outcome. |
| getAppUpdateStatus(appId, {checkLatest?}) | Returns installed, running, active, latest, and staged versions/builds, updateAvailable, stage, and lastError. checkLatest can request a signed latest lookup. |
| prepareAppUpdate(appId) | Downloads, verifies, and stages a package and returns MiniAppUpdateStatus. The later normal open gate activates it. |
| prewarm(appId) | Prewarms the mini app. |
| storage.get/set/remove/keys/batch | Uses the current guest ACL and optional namespace on each call. batch is app-scoped and atomic, with up to 256 set/remove operations and unique keys. |
| sendMessage(appId, data, topic = "default") / receiveMessages() / onMessage(listener) | Sends and receives app messages subject to JS policy. |
| onLifecycle(listener) / onPresets(listener) / presets() | Observes lifecycle or global display/system presets. |
| dispose() | Removes bridge listeners and disposes client-owned host/media scope. |

AppLaunchOptions supports presentationStyle or presentation.style. MiniAppPresentationStyleInput accepts sheet/page and aliases modal/bottom-sheet/push and normalizes to sheet or page. This selects the child surface within JS SystemUI. Full-screen host mode is independent. AppResult fields are requestId, appId, cancelled, value, and optional reason. AppLaunch exposes requestId, targetAppId, result, and cancel(). Arguments use supported JSON/BridgeValue transport.

### Pocket System kernel

`installPocketSystem(manifest, options)` from `@pocket/ui/system` installs the JS-owned app registry, policy, stack, result router, and resident lifecycle. Options require bridge and accept policies, maxResidentApps (including non-evictable SystemUI), and initial presets (darkMode/colorScheme/accentColor/density/presentationStyle). Each PocketAppPolicy has allowedOpenApps, messageTargets, and sharedNamespaces. JS manifest catalog and policy authorize opens. Dart config supplies matching permission and capability grants.

PocketSystemKernel exposes ready, snapshot(), presets(), setPresets(partial), surfaceBindings({includeStack?}), subscribe(listener), onBeforeDismiss(handler), presentSurfaces(appIds, focusedAppId?), closeContainer({result?}), handleBack(), and dispose(). The kernel owns the stack and caller/result relationships. closeContainer accepts a JSON-encodable result object. handleBack cancels the current JS child, and an unhandled Back goes to native host route exit.

### Configurable embedded and full-screen launches

Embedded mode presents the child on the current SystemUI CompositorSurface. Full-screen mode passes kernel authorization, then JS calls the external open handler and the host capability creates a separate Navigator route. Both use the same catalog and app policy validation, request and result tokens, and cancellation.

`InstallPocketSystemOptions` adds `openMode?: () => PocketSystemOpenMode` and `externalOpen?: PocketSystemExternalOpenHandler`. `PocketSystemOpenMode` is `"embedded" | "fullscreen"` and defaults to `"embedded"`. Fullscreen requires externalOpen. Only trusted root SystemUI opens consult openMode. Child launches stay in the active JS stack and compositor.

`PocketSystemExternalOpenRequest` has readonly `requestId: string`, `appId: string`, `arguments: JsonValue`, and `presentationStyle?: MiniAppPresentationStyle`. `PocketSystemExternalOpenHandler` is `(request: PocketSystemExternalOpenRequest) => Promise<AppLaunch> | AppLaunch`. Import AppLaunch from `@pocket/ui/platform`. The kernel validates caller and installed target before invoking the handler. Child callers also require allowedOpenApps. Trusted root SystemUI can target the installed catalog registry. The returned AppLaunch must match requestId and targetAppId and expose a result Promise and cancel function. Missing or mismatched fields fail with `invalid_external_launch`.

Return AppLaunch as soon as the native Navigator accepts and starts the route. Guest startup, first frame, and route pop may exceed the existing `platform.apps.open` timeout. AppLaunch.result goes through the kernel to the original JS caller via `platform.result`. Use AppLaunch.cancel for cancellation. Pocket/SystemUI stores the user's mode preference. openMode reads that selection and JS retains the app stack.

The Demo's plugin, Navigator owner, route widget, and capability names are example transport. `demo.hybridFlutter.open` opens the example page. Its Pocket Plaza registers:

| Demo transport | Request and result |
| --- | --- |
| `demo.hybridFlutter.openMode` | Empty object → `{ defaultMode: "fullscreen", fullscreenAvailable: true }`. Ordinary Showcase defaults to embedded without this capability. |
| `demo.hybridFlutter.openMiniApp` | `{ requestId, appId, arguments, presentationStyle? }` → `{ accepted: true, requestId, appId }`. Returns on acceptance. |
| `demo.hybridFlutter.cancelMiniApp` | `{ requestId }`. Requests the matching native route to close. |
| `demo.hybridFlutter.result` event | `{ requestId, appId, cancelled, value, reason? }`. JS subscribes before open and matches tokens to resolve `AppLaunch.result`. |

The Demo Mini Apps card offers **Embed Pocket Plaza** and **Full-screen Flutter container**. Current JS SystemUI holds the selection until recreation restores the host default. Child page/sheet is independent. Plaza full-screen requests and native tab buttons share `_pushMiniAppRoute`. The new route uses base SystemUI without an external opener so its child navigation stays in JS. Consumers register their own host plugin, capability, and Navigator entry.

## 5. Container isolation, storage, and lifecycle

PocketSystemHost instances in one app process can share the SDK platform storage engine and write queue. Each lease retains its own ACL. Guest identity sharing requires matching app IDs, authorized namespaces, and JS policy. Shared disk preserves independent QuickJS realms, JS state, route stacks, and lifecycle. Use platform.storage. Let the SDK own the engine for its data directory.

When the Pocket tab chooses full screen, the resident tab host remains on the covered route. The plugin starts a separate host for the authorized request. On pop, the resident tab resumes its original runtime. Child calls inside full screen stay within that container's JS stack. Native Back tries the active JS child and exits the host route when unhandled. controller.instances remains a snapshot.

## 6. Related documentation

- Integration steps, tab retention, Navigator routes, examples, and verification. [Hybrid Flutter tab host guide](HYBRID_FLUTTER_TAB_HOST.md)
- Public Flutter and Dart exports, native widgets, and plugins. [Flutter API](FLUTTER_API.md)
- JS package and subpath exports, UI, and application APIs. [JS API](JS_API.md)
- SDK package-level index. [API index](API.md)
- Compiler, CLI, build, and validation entry points. [Tooling API](TOOLING_API.md)
- Catalog schema, generation, and asset bootstrap. [Bundled Application Catalog](BUNDLED_APPLICATION_CATALOG.md)
- Package bootstrap, QJBC build, signed host configuration, and Flutter wiring. [SDK Integration](SDK_INTEGRATION.md)
- JS sheet/page presentation and dismissal. [Mini App Presentation](MINI_APP_PRESENTATION.md)
- Signed package status, preparation, and opening. [Mini App Update Before Open](MINI_APP_UPDATE_BEFORE_OPEN.md)
- JS-requested and host-admitted limits. [App Memory Limits](APP_MEMORY_LIMITS.md)
