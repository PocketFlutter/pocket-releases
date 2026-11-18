# JavaScript / TypeScript API

See the [generated signature catalog](JS_API_SIGNATURES.md) for all public members, parameters, defaults, and overloads. This page describes integration behavior and limits.

This reference follows the `sdk/package.json` workspace and each package's `exports`. The package manifest specifies valid import paths. Public signatures come from the declarations and implementation reachable from those entry points. See [API_SURFACE.json](API_SURFACE.json) for reachable exports and the source change baseline. That inventory guards against omissions. The reference documents parameters, defaults, and behavior.

JS and TS own guest UI, routing, business state, and component composition. `buildGuest` compiles to pinned PocketJS and QuickJS bytecode. Dart host plugins provide explicitly admitted native capabilities. Unless specified otherwise, consume `@pocket/*` TypeScript types in the SDK guest compilation environment. Running QJBC UI components requires a compatible runtime.

## Import examples

```tsx
import { ActionButton, InputField, SafeAreaScaffold } from "@pocket/ui";
import { MobileButton, MobileThemeProvider, MOBILE_THEME_LIGHT } from "@pocket/ui/mobile";
import { createHostBridge } from "@pocket/ui/host";
import { createPocketPermissionsClient } from "@pocket/ui/permissions";
import { createPocketStreamAdapter } from "@pocket/ui/streams";
import { createNovelEngine } from "@pocket/vn";
```

```tsx
const [name, setName] = createSignal("");
return (
  <MobileThemeProvider theme={() => MOBILE_THEME_LIGHT}>
    <SafeAreaScaffold edges="all">
      <InputField value={name} onInput={setName} placeholder="Name" />
      <MobileButton label="Save" onPress={() => saveName(name())} />
    </SafeAreaScaffold>
  </MobileThemeProvider>
);
```

Use `SafeAreaScaffold` as a standalone guest shell. If an outer shell already consumes the safe area, use `MobileScaffold` with the default `safeArea="none"` to apply insets once. See `src/ui.tsx` and `src/mobile.tsx` for complete props and [SDK integration](SDK_INTEGRATION.md) for host setup.

## `@pocket/ui` package exports

`packages/pocket_ui/package.json` defines the root and all named subpaths below. Import via the listed public entry points and avoid direct private `@pocket/ui/src/...` imports.

| Import specifier | Main public API and purpose | Public type or source |
| --- | --- | --- |
| `@pocket/ui` | Actual root re-exports from `ui`, route views, mobile, display and responsive, accessibility and semantics, media, updates, recording, graphics, skins, and Apple UI. Some subpaths require explicit imports. | [`src/index.ts`](../packages/pocket_ui/src/index.ts) |
| `@pocket/ui/ui` | `SafeAreaScaffold` and `MobileScaffold` composition, `ActionButton`, `InputField`, `ScrollablePage`, tabs and navigation, and contour helpers. | [`src/ui.tsx`](../packages/pocket_ui/src/ui.tsx), [Component contracts](COMPONENTS.md) |
| `@pocket/ui/mobile` | Mobile tokens and context, density and size hooks, button, feedback, and form components, Surface providers, and Shadcn vocabulary. | [`src/mobile.tsx`](../packages/pocket_ui/src/mobile.tsx) |
| `@pocket/ui/apple` | `AppleGlassButton`, `AppleGlassNavigationBar`, `AppleGlassToolbar`, and `AppleDraggableGlass` compositions. | [`src/apple.tsx`](../packages/pocket_ui/src/apple.tsx), [Apple Glass](APPLE_GLASS.md) |
| `@pocket/ui/legacy` | Legacy `computeTransitionDescriptor`, `buildLiquidGlassRecipe`, and `TRANSITION_MODES` descriptors. | [`src/legacy.ts`](../packages/pocket_ui/src/legacy.ts) returns JS descriptors or recipes for rendering. |
| `@pocket/ui/responsive` | `deriveWindowSizeClass`, `deriveDesignDensity`, and pane, inset, and occlusion geometry functions and types. | [`src/responsive.ts`](../packages/pocket_ui/src/responsive.ts) |
| `@pocket/ui/display` | `createDisplayGeometry`, `createSystemPresets`, `subscribeHostEvents`, `getSystemPresetsSnapshot`, `subscribeSystemPresets`, and hooks. | [`src/display.ts`](../packages/pocket_ui/src/display.ts) |
| `@pocket/ui/graphics` | `POCKET_GRAPHICS_VERSION`, `SvgIconSpec`, and `POCKET_SVG_ICON_SPECS`. | [`src/graphics.ts`](../packages/pocket_ui/src/graphics.ts) |
| `@pocket/ui/host` | `HostBridge` / events / request and direct-object packet adapter. | [`src/host.ts`](../packages/pocket_ui/src/host.ts) |
| `@pocket/ui/back-navigation` | Native/host back request and gesture events, `createPocketBackNavigation`. | [`src/back-navigation.ts`](../packages/pocket_ui/src/back-navigation.ts), [back navigation](BACK_NAVIGATION.md) |
| `@pocket/ui/dio` | `createPocketDioClient(host).request(params)`. | [`src/dio.ts`](../packages/pocket_ui/src/dio.ts), [Dio Worker](DIO_WORKER.md) |
| `@pocket/ui/permissions` | `createPocketPermissionsClient(host).status/request(policyKey)`. | [`src/permissions.ts`](../packages/pocket_ui/src/permissions.ts) |
| `@pocket/ui/streams` | Bounded HostStream adapter, `PocketStream`, `open/onStream/get/dispose`. | [`src/streams.ts`](../packages/pocket_ui/src/streams.ts), [Host streams](JS_HOST_STREAMS.md) |
| `@pocket/ui/platform-experience` | Haptics, system UI, deep-link initial/latest, and explicit link event subscriptions. | [`src/platform-experience.ts`](../packages/pocket_ui/src/platform-experience.ts), [Platform experience](PLATFORM_EXPERIENCE.md) |
| `@pocket/ui/media` | `createMediaController` and lifecycle and playback intent contract. | [`src/media.ts`](../packages/pocket_ui/src/media.ts), [Media lifecycle](MEDIA_LIFECYCLE.md) |
| `@pocket/ui/images` | `createPocketImagesClient`, capture/read/list/remove, `PocketStoredImage`. | [`src/images.tsx`](../packages/pocket_ui/src/images.tsx) re-exports [`src/images.ts`](../packages/pocket_ui/src/images.ts) |
| `@pocket/ui/video` | `<Video>` host surface + shared `MediaController` adapter. | [`src/video.tsx`](../packages/pocket_ui/src/video.tsx), [Video facts](VIDEO_MEDIA_FACTS.md) |
| `@pocket/ui/platform` | `createPocketPlatformClient` for MiniApp launch, update status, lifecycle/messages and app-scoped storage. | [`src/platform.ts`](../packages/pocket_ui/src/platform.ts) |
| `@pocket/ui/system` | `installPocketSystem(manifest, options)` and `PocketSystemKernel` lifecycle, policy, presentation and snapshots. | [`src/system.ts`](../packages/pocket_ui/src/system.ts), [System UI](MULTI_APP_IMPLEMENTATION.md) |
| `@pocket/ui/updates` | `diffUpdateManifests`, `planPackageUpdate`, and `createPocketUpdateClient`. | [`src/updates.ts`](../packages/pocket_ui/src/updates.ts), [Update modes](PACKAGE_UPDATE_MODES.md) |
| `@pocket/ui/recording` | Input and effect tapes, validation, recording and replay drivers, and `PocketRecording` serialization. | [`src/recording.ts`](../packages/pocket_ui/src/recording.ts), [Recording and replay](RECORDING_REPLAY.md) |
| `@pocket/ui/system-surfaces` | `SystemAppSurfaces` and mini-app back gesture preview presentation. | [`src/system-surfaces.tsx`](../packages/pocket_ui/src/system-surfaces.tsx) |
| `@pocket/ui/inline-text` | `InlineText`, run/ruby/link layout and ref-based layout result. | [`src/inline-text.tsx`](../packages/pocket_ui/src/inline-text.tsx), [Inline Text](INLINE_TEXT_IMPLEMENTATION.md) |
| `@pocket/ui/bytes` | UTF-8/base64 encode/decode helpers (`utf8ToBytes`, `bytesToUtf8`, `bytesToBase64`, `base64ToBytes`). | [`src/bytes.ts`](../packages/pocket_ui/src/bytes.ts) |
| `@pocket/ui/skins` | `UiSkinProvider`, registration, token resolution and skin components/props. | [`src/skins.tsx`](../packages/pocket_ui/src/skins.tsx), [UI reuse](UI_REUSE.md) |
| `@pocket/ui/router` | Typed route matcher/router, URI/search codecs, deep-link binding and Solid hooks. | [`src/router.tsx`](../packages/pocket_ui/src/router.tsx), [Showcase routing](SHOWCASE_ROUTING.md) |
| `@pocket/ui/fast` | `PocketVirtualList`, FastText, pools and frame profiler helpers. | [`src/fast.tsx`](../packages/pocket_ui/src/fast.tsx), [scroll reuse](SCROLL_REUSE.md) |
| `@pocket/ui/surface-catalog` | Surface environment/profile registry and geometry helpers. | [`src/surface-catalog.ts`](../packages/pocket_ui/src/surface-catalog.ts) |
| `@pocket/ui/surfaces` | Widget, wearable, live-activity and ecosystem surface compositions/providers. | [`src/surfaces.tsx`](../packages/pocket_ui/src/surfaces.tsx) |
| `@pocket/ui/dev` | Hot root/state registration for the supported development reload flow. | [`src/dev.ts`](../packages/pocket_ui/src/dev.ts) |
| `@pocket/ui/clipboard` | `createPocketClipboardClient(host)` for plain-text `clipboard.read` and `clipboard.write`. | [`src/clipboard.ts`](../packages/pocket_ui/src/clipboard.ts), [Clipboard plugin](CLIPBOARD_PLUGIN.md) |
| `@pocket/ui/files` | `createPocketFilesClient(host)`, `files.open` file picker, and opaque file handles. | [`src/files.ts`](../packages/pocket_ui/src/files.ts), [File picker plugin](FILE_PICKER_PLUGIN.md) |
| `@pocket/ui/code` | Code editor document model, selection, undo, shortcuts, and syntax highlighting. | [`src/code/index.ts`](../packages/pocket_ui/src/code/index.ts), [Code editor core](CODE_EDITOR_CORE.md) |
| `@pocket/ui/code-view` | Virtualized `CodeView` editor and key, wheel, and pointer handling. | [`src/code/view.tsx`](../packages/pocket_ui/src/code/view.tsx), [Code view](CODE_VIEW.md) |
| `@pocket/ui/tree` | `TreeView` component and node rendering. | [`src/tree.tsx`](../packages/pocket_ui/src/tree.tsx), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |
| `@pocket/ui/tree-model` | Pure state model for expansion, collapse, selection, and keyboard navigation. | [`src/tree-model.ts`](../packages/pocket_ui/src/tree-model.ts), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |
| `@pocket/ui/split-pane` | `SplitPane` component. | [`src/split-pane.tsx`](../packages/pocket_ui/src/split-pane.tsx), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |
| `@pocket/ui/split-pane-model` | State model for pane ratios, collapse, and drag constraints. | [`src/split-pane-model.ts`](../packages/pocket_ui/src/split-pane-model.ts), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |
| `@pocket/ui/tabs` | `EditorTabs` tab bar. | [`src/tabs.tsx`](../packages/pocket_ui/src/tabs.tsx), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |
| `@pocket/ui/tabs-model` | Pure state model for activation, pinning, reordering, and closing tabs. | [`src/tabs-model.ts`](../packages/pocket_ui/src/tabs-model.ts), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |
| `@pocket/ui/toast-host` | `ToastHost` and bounded notification queue. | [`src/toast-host.tsx`](../packages/pocket_ui/src/toast-host.tsx), [Shared editor components](SHARED_EDITOR_COMPONENTS.md) |

The root `@pocket/ui` index additionally re-exports accessibility, semantics, motion, `RouteView`, Flutter-vocabulary wrappers and other entries from [`src/index.ts`](../packages/pocket_ui/src/index.ts); those declarations are in `API_SURFACE.json`. Direct subpaths which exist only in `package.json#exports` stay imported explicitly.

### Component families and props

These families follow the current JS implementations. Use their existing state. Full props are documented in the corresponding `*Props` interfaces or inline parameter types in the linked source.

| Family | Main components and props | Behavior |
| --- | --- | --- |
| Guest shell and input | `SafeAreaScaffoldProps`, `SafeAreaScaffold`, `MobileScaffold`, `ScrollablePage`, and `InputField` (`value: Accessor<string>`, `onInput`, optional `onSubmit`, `placeholder`, `appearance`, `multiline`, `maxLines`, `minLines`, and `autoFocus`). See [Studio text input](STUDIO_TEXT_INPUT.md). | The shell consumes host viewport insets once. JS owns the `InputField` value. Flutter hosts EditableText and the IME overlay. |
| General product components | `HeaderProps` and `Header`, `ActionButtonProps` and `ActionButton` (also aliased as `Button`), `Badge`, `EmptyState`, `MetricCard`, `NavigationBarProps` and `NavigationBar`, `Tabs`, `List`, `ViewText`, and `DetailModal`. | Compositions live in [`src/ui.tsx`](../packages/pocket_ui/src/ui.tsx). `ActionButton` supports `primary/secondary/quiet/danger` and ignores presses when disabled. |
| Mobile theme and layout | `MobileThemeProvider({ theme?, density?, children? })`, `DesignDensityProvider({ density, children? })`, `MobileScaffold`, `MobileAppBar`, `MobileCard`, `createMobileTheme`, `useMobileTheme`, `useDesignDensity`, and `useWindowSizeClass`. | `theme` and `density` can be values or accessors. Defaults use host presets. |
| Mobile controls | `MobileButtonProps` (`label`, `onPress?`, `kind?`, `compact?`, `disabled?`, and style and debug fields), `MobileSwitchProps`, `MobileSegmentedControl`, `MobileStepper`, `MobileProgress`, `MobileCheckbox`, and `MobileRadioGroup`. | `MobileButton.kind` defaults to `filled`. Disabled controls do not dispatch press. See [`src/mobile.tsx`](../packages/pocket_ui/src/mobile.tsx). |
| Mobile data and feedback | `MobileBadge`, `MobileTag`, `MobileAvatar`, `MobileListTile`, `MobileAccordion`, `MobileSkeleton`, `MobileAlert`, `MobileToast`, `MobilePopup` and `MobileActionSheet`, and `MobileDialog`. | Aliases including `Badge`, `Tag`, `Alert`, `Toast`, `Popup`, and `Dialog` reuse their corresponding implementations. See component props for tone and action fields. |
| Shadcn-compatible family | `ShadcnSeparator/Kbd/Card*`, `ShadcnSelect/InputOTP/ToggleGroup/Command/Table/Calendar`, `ShadcnBreadcrumb/Pagination`, `ShadcnHoverCard/DropdownMenu/Collapsible/ScrollArea`, `ShadcnAspectRatio/ButtonGroup/Carousel/Chart/Combobox/ContextMenu/DataTable/DatePicker/Drawer/Empty/FormField/InputGroup/Item/Menubar/NavigationMenu/Popover/Resizable/Sidebar/Spinner/Textarea/Tooltip/Typography`, and aliases. | See [`src/mobile.tsx`](../packages/pocket_ui/src/mobile.tsx) exports for names and [Component limits](COMPONENTS.md) for verified native opcodes and device behavior. |
| Apple and accessibility | `AppleGlassButtonProps`, `AppleGlassNavigationBarProps`, `AppleGlassToolbarProps`, `AppleDraggableGlassProps`, `AccessibilityPreferencesProvider`, and `AppleSemanticsProvider`. | Host support for the corresponding semantics and events is required. See [`src/apple.tsx`](../packages/pocket_ui/src/apple.tsx), [`src/accessibility.ts`](../packages/pocket_ui/src/accessibility.ts), and [`src/semantics.ts`](../packages/pocket_ui/src/semantics.ts). |
| Ecosystem surfaces and skins | `WidgetSurface`, `TodayWidgetCard`, `LockAccessoryWidget`, `WearTileSurface`, `LiveActivityBanner`, `EcosystemAdaptiveShell`, and `Skin*` components. | JS surface and UI composition. OS widget targets require platform integration. |

## HostBridge, events, and asynchronous results

`HostBridge` is the single JS transport for capability and client requests and events. See [`src/host.ts`](../packages/pocket_ui/src/host.ts).

```ts
const host = createHostBridge();
const remove = host.onEvent?.((event) => {
  if (event.method === "platform.lifecycle") onLifecycle(event.params);
});
try {
  const client = createPocketPermissionsClient(host);
  const result = await client.status("hardware.camera");
  if (!result.granted) await requestFromUserGesture(client, "hardware.camera");
} finally {
  remove?.();
  host.dispose();
}
```

| Public contract | Signature / defaults / result |
| --- | --- |
| `createHostBridge(sendOverride?, options = {})` | Returns `HostBridge`. Defaults to `maxPendingRequests=32` and `timeoutFrames=180`, with ranges 1–256 and 1–28,800. With the official guest timer, pass `scheduleTimeout(frames, callback)` so deadlines can wake an idle runtime. |
| `host.request<T>(capability, params = {}, options?)` | Returns `Promise<T>`. `params` must be an object. Sends a `host.request` packet and completes on `host.response`. Rejects on `ok=false`. Rejected sends return `unconfigured`, deadlines return `timeout`, and concurrency overflow returns `request_quota`. Disposing rejects pending requests. |
| `host.onEvent(listener)` / `host.emit(method, params={})` | Listeners return unsubscribe callbacks. Older injected bridges can omit `emit`, `onEvent`, latest viewport or presets, and `onTick`. Check optional methods before calling. |
| `host.tick()` / `host.scheduleTimeout?()` / `host.dispose()` | `tick` advances guest-frame request deadlines. Dispose clears event sinks, subscriptions, and pending requests. |
| `HostBridgeAbiError` | Thrown when both the Pocket direct-object `pocket._emitValue` ABI and an injected send adapter are absent. Startup requires the transport. |

The `HostBridge` wire format uses `event/host.request { requestId, capability, params }` and `event/host.response { requestId, capability, ok, result?, error? }`. Host-originated `HostEvent` has `id/method/params/raw`. The diagnostic callback collects at most 32 listener, tick, and dispatch errors. See [`src/host.ts`](../packages/pocket_ui/src/host.ts) for event payloads, bindings, and timeouts.

### `@pocket/ui/system`

`installPocketSystem(manifest, options)` validates the JS app manifest, installs the app registry, stack, result router, and resident policy, and returns `PocketSystemKernel`. `InstallPocketSystemOptions` requires `bridge: HostBridge`. `policies`, `maxResidentApps`, and `presets` are optional. The resident limit defaults to 8 and accepts 1–256.

Use `openMode` and `externalOpen` to integrate routes owned by the outer host container.

```ts
import { installPocketSystem } from "@pocket/ui/system";
import type { InstallPocketSystemOptions, PocketSystemExternalOpenHandler } from "@pocket/ui/system";

// acceptRoute is the consumer's own Navigator adapter; it accepts the route
// and returns a result/cancel handle without waiting for app startup or exit.
const externalOpen: PocketSystemExternalOpenHandler = (request) =>
  acceptRoute(request);

const options: InstallPocketSystemOptions = {
  bridge,
  openMode: () => fullscreenSelected ? "fullscreen" : "embedded",
  externalOpen,
};
const system = installPocketSystem(manifest, options);
```

`openMode?: () => "embedded" | "fullscreen"` defaults to `() => "embedded"` and is consulted only for opens from trusted root SystemUI. Child opens stay in the JS stack. Fullscreen requires `externalOpen`, otherwise the request fails with `external_open_unavailable`. An invalid mode fails with `invalid_open_mode`. The kernel checks installed app, caller policy, and arguments before calling the handler. The request is read-only `{ requestId, appId, arguments, presentationStyle? }`, and the handler is `(request: PocketSystemExternalOpenRequest) => Promise<AppLaunch> | AppLaunch`. The handle must match `requestId` and `targetAppId` and provide `result: Promise<AppResult>` and `cancel(): Promise<BridgeValue>`. Invalid handles fail with `invalid_external_launch`. Completion goes back to the JS caller through `platform.result`. Return the handle as soon as the native route is accepted, before guest startup or the first frame. The kernel cancels accepted launches when the original request times out or its runtime is invalidated. See [Hybrid Host API](HYBRID_HOST_API.md), [Hybrid Flutter tab host](HYBRID_FLUTTER_TAB_HOST.md), and the types in [`src/system.ts`](../packages/pocket_ui/src/system.ts) and [`src/platform.ts`](../packages/pocket_ui/src/platform.ts).

## Platform, permission, stream, and network clients

`pocket.json`'s `engine.capabilities.requires/enhances` declares pinned compiler engine features such as `text.glyphs.baked` using lowercase dotted names. Declare HostBridge RPCs such as `platform.widgets.publishSnapshot` and `sync.mesh.blob.putChunk` under `manifest.json` `capabilities.requires/optional` with their original case. `schema.pattern /engine/capabilities/...` usually indicates the wrong declaration layer. If `capability.unknown` follows, check the engine feature list. Host RPCs still require provider registration and admission after correcting the engine list.

### `@pocket/ui/platform`

`createPocketPlatformClient(send?, options={})` can reuse `options.bridge` and accept or disable a media controller. By default each client owns one media controller and lifecycle listener. Use the following methods.

- `listApps()`, `getAppUpdateStatus(appId, {checkLatest=false})`, and `prepareAppUpdate(appId)` return host request promises.
- `launchApp(appId, argumentsValue=null, options?)` returns `AppLaunch { requestId, targetAppId, result: Promise<AppResult>, cancel(): Promise<BridgeValue> }`. `openApp(...)` is shorthand for awaiting `.result`. `AppResult` contains `cancelled`, `value`, and optional `reason`.
- `returnResult(value=null)` and `prewarm(appId)` each make one host request.
- `storage.get/set/remove/keys/batch(operations, namespace?)` supports `{type:"set",key,value}` and `{type:"remove",key}` in a batch and commits it atomically in one request.
- `sendMessage(appId, data, topic="default")` sends and `receiveMessages()` receives. `onMessage`, `onLifecycle`, and `onPresets` return unsubscribe callbacks.
- Only `platform.result` resolves the launch `result`. The client consumes `platform.message`, `platform.lifecycle`, `platform.launch`, and `platform.presets`. `dispose()` clears subscriptions and rejects pending launch waiters.

See [`src/platform.ts`](../packages/pocket_ui/src/platform.ts) for the entry point and implementations.

### Permissions and platform experience

```ts
const permissions = createPocketPermissionsClient(host);
const status = await permissions.status("hardware.camera");
// Trigger the request from an actual user gesture.
const requested = await permissions.request("hardware.camera");

const experience = createPlatformExperience(host);
await experience.haptics.perform({ type: "selection" });
await experience.systemUi.set({ statusBarIconBrightness: "light" });
// Explicitly subscribe when entering an app that handles deep links.
const linkSub = experience.subscribeLinks((link) => router.openDeepLink(link));
```

`createPocketPermissionsClient(host)` reads current OS state. Both `status(policyKey)` and `request(policyKey)` return `Promise<PocketPermissionResult>` with `status` equal to `granted | denied | restricted | permanentlyDenied | limited | provisional | notRequired`. `realHardware` reports the host's hardware assessment. Make permission requests from user actions. Static declarations enable requests, and the OS determines grants. See [`src/permissions.ts`](../packages/pocket_ui/src/permissions.ts) and [Optional plugins](OPTIONAL_PLUGINS.md).

`createPlatformExperience(host, options={})` returns `links.initial/latest`, `links.subscribe`, `systemUi.set`, `haptics.perform`, and flat compatibility aliases. Host operations return promises. Link events arrive only after explicit `subscribeLinks()`. The app chooses its own destination or route. The client reuses a supplied caller-owned stream adapter or creates one on subscription. `isUnsupportedPlatformError(error)` checks explicitly unsupported or unconfigured errors. See [`src/platform-experience.ts`](../packages/pocket_ui/src/platform-experience.ts) and [Platform experience](PLATFORM_EXPERIENCE.md).

### Streams

`createPocketStreamAdapter(host, options={})` receives events via the existing HostBridge. Defaults are 16 active streams, 64 queued messages per stream, and no idle deadline unless `deadlineFrames` is supplied. Open options override ID, queue size, and deadline. `PocketStream` provides `onData/onError/onEnd`, `read()`, an async iterator, and `send/sendBatch/end/cancel`. All read forms consume the same bounded queue. The `closed` promise finishes as `ended/errored/cancelled/disposed`.

Host events are `stream.open/data/batch/end/cancel/error`. The hard batch limit is 256 events or 256 KiB. See [`src/streams.ts`](../packages/pocket_ui/src/streams.ts) for `streamId`, reserved `host-stream` prefix, callback errors, and queue constraints, and [JS streams](JS_HOST_STREAMS.md) and [Hardware streams](HARDWARE_STREAMS.md) for domain capabilities, arguments, and platform-specific permissions.

### Dio

```ts
const dio = createPocketDioClient(host);
const response = await dio.request<{ ok: boolean }>({
  url: "https://api.example.test/status",
  responseType: "json",
});
```

`PocketDioRequest` supports `url`, `method?`, `headers?`, `queryParameters?`, `data?`, `responseType?: "json" | "text" | "bytes"` (default `json`), and `timeoutMs?`. Returns `{statusCode, headers, data}`. Non-2xx statuses return as responses. Transport, policy, and lifecycle failures reject. JS owns retry and business state. Requires the opt-in `pocket_dio` plugin, `network` permission, and host `allowedOrigins`. Dio I/O and renderWorker run independently. See [`src/dio.ts`](../packages/pocket_ui/src/dio.ts) and [Dio Worker](DIO_WORKER.md).

## Typed router and update API

### Router

```ts
const router = createPocketRouter({
  routes: [
    { id: "home", path: "/" },
    { id: "profile", path: "/users/:userId" },
  ],
});
router.navigate("profile", { params: { userId: "u-1" } });
const [page, setPage] = useSearchState("page", stateParam.int(1, { min: 1 }));
```

`createPocketRouter({routes,...})` requires at least one route and exposes `navigate/push/replace/back/pop/openDeepLink/setSearch/batch/buildUri/buildHref/resolve/bindPlatformExperience`. Navigation methods return a `boolean` indicating whether they handled the request. `setSearch` accepts a map or updater. Query codecs default history to `replace` and omit values equal to their defaults. Routes support `path/aliases/primary/parent/redirectTo/searchSchema/retainParams/beforeEnter/meta`. `stateParam` supplies typed codecs such as string, optionalString, int, number, boolean, literal, json, and array. URI parsing serves these routes. See [`src/router.tsx`](../packages/pocket_ui/src/router.tsx) for full signatures, options, and hooks.

### Update planner/client

- `diffUpdateManifests(baseline, candidate, cachedBlobHashes?)` compares entry, Worker, PAK, and assets and returns files and byte counts to download or reuse.
- `planPackageUpdate({baseline?,candidate,mode="auto",target={scope:"all"},cachedBlobHashes?})` chooses a zip or granular plan. Granular `code/resource` needs a baseline and is incompatible with `zip`. Missing assets throw `PocketUpdatePlanError`.
- `createPocketUpdateClient(host, options={})` exposes `ready: Promise<boolean>` and `status/check/checkZip/checkCodeOnly/checkResource/apply/rollback/refresh/dispose`. `autoRefresh` defaults to off. Auto-refresh and state handoff require host event subscriptions. `apply/rollback` resolve with `{scheduled,version}`. Remount happens asynchronously.

See [`src/updates.ts`](../packages/pocket_ui/src/updates.ts), [Update modes](PACKAGE_UPDATE_MODES.md), and [AI app development](AI_APP_DEVELOPMENT.md) for manifest fields, delivery modes, state restore, and errors.

## Images, video, media, and recording

### Images / resources

`createPocketImagesClient(host)` returns `capture(options?)`, `read(id)`, `list()`, and `remove(id)`. Capture defaults to a maximum 256×256 and 65,536 pixels. `remove` returns `false` for an absent ID. IDs are 64 lowercase hex characters. `PocketStoredImage` displays a stored image in the guest tree. Optional plugins supply host storage and read capabilities. See [`src/images.ts`](../packages/pocket_ui/src/images.ts) and [`src/images.tsx`](../packages/pocket_ui/src/images.tsx).

### Video / media

`VideoProps` requires `id`, `asset`, and `media` and accepts `group/page/active/playing/token/loop/fit/class/style`. Defaults are `active=true`, `playing=false`, and `fit="cover"`. Omit `loop` for legacy native loop behavior. MediaController owns playback intent and lifecycle in JS. Flutter owns the decoder and controller. Surfaces require host authorization. See [`src/media.ts`](../packages/pocket_ui/src/media.ts) for `createMediaController(options={})`, `VideoSnapshot`, and events, and [`src/video.tsx`](../packages/pocket_ui/src/video.tsx) for the component.

### Recording

The recording APIs include `createEffectRecorder(driver, limits={})`, `createEffectReplayDriver(tape, options={})`, `exportRecording(options={})`, `replayRecording(value, options={})`, and input tape `dumpInputTape`, `validateInputTape`, and `replayInputTape`. `DEFAULT_EFFECT_MAX_*` exports default limits. Validate data before replay. Effect replay runs a deterministic harness. Compatibility aliases `dumpRecording`, `captureRecording`, `validateTape`, and `captureUpstreamTape` reuse these implementations. See [`src/recording.ts`](../packages/pocket_ui/src/recording.ts) and [Recording and replay](RECORDING_REPLAY.md).

## Other JavaScript workspaces

Each row lists subpaths from its package's `exports`. Use those public entries for imports. See [API_SURFACE.json](API_SURFACE.json) for all reachable declarations, types, and export files.

### UI component libraries

| Package | Public subpaths | API families and key exports |
| --- | --- | --- |
| `@pocket/looseleaf` | `.`, `./tokens`, `./surfaces`, `./marks`, `./controls`, `./navigation`, `./data`, `./overlays`, `./skins`, `./kit` | Surfaces include `Desk/Paper/Tape/Card/IndexCard/StickyNote/Polaroid/Notebook/Page/Receipt/Ticket/Envelope/Folder/Corkboard/Clipboard/Napkin/FlipCard`. Marks include `Highlight/Underline/Circled/Strike/Squiggle/Scribble/Bracket/Arrow/Asterisk/Callout/Annotate/Lettering/Marker/Handwritten/Quote/Signature/Tally/Stamp/Seal/Sticker/Doodle/Mascot/Confetti/Boil`. Controls, data, navigation, and overlays include `Button/Input/Switch/Select/Combobox/Tabs/Table/DataTable/Calendar/DatePicker/Toast/Dialog/Drawer/Tooltip/Accordion` among others. The package also exports `Looseleaf*` aliases. See subpath types in [`src`](../packages/pocket_looseleaf/src/index.ts). |
| `@pocket/arc` | `.`, `./tokens`, `./motion`, `./surfaces`, `./controls`, `./navigation`, `./data`, `./overlays`, `./skins`, `./kit` | `ArcThemeProvider/useArcTheme`, `createArcSpring/stepArcSpring`, surface/control/navigation/data/overlay/skin families. The kit exposes `ArcAppBar/ArcNavigationBar/ArcListTile/ArcCheckbox/ArcRadioGroup/ArcInput/ArcStepper/ArcAlert/ArcMetric/ArcEmpty/ArcAccordion`. See props in [`src/index.ts`](../packages/pocket_arc/src/index.ts) and its recursively re-exported public modules. |
| `@pocket/liquid_glass` | `.`, `./tokens`, `./motion`, `./governor`, `./surfaces`, `./controls`, `./navigation`, `./overlays`, `./menus`, `./kit` | `LiquidGlassProvider`, `LiquidGlassSurface`, `LiquidGlassGroup`, optical tokens, spring helpers, priority admission, controls, navigation, menus, and the `liquid-glass` skin adapter. [Liquid Glass](LIQUID_GLASS_PACKAGE.md) |

Component packages expose their declared public entries. Target support depends on PocketJS primitives and runtime behavior in Flutter, Web, or WeChat.

### System widget and activity requests

`@pocket/ui/surfaces` exports `publishWidgetSnapshot(host, manifest)`, `upsertLiveActivity(host, payload)`, and `endLiveActivity(host, activityId?)`, each returning `Promise<BridgeObject>`. `drainPendingWidgetActions(host)` returns `Promise<readonly QueuedWidgetActionEvent[]>`. The helpers accept the request portion of a `HostBridge`. Use `RichWidgetSnapshotPayload` for optional widget text, progress, metrics, actions, and hotspots. `LiveActivityUpsertPayload` requires a title. The trusted host registers and grants the corresponding capabilities.

```ts
import { publishWidgetSnapshot } from "@pocket/ui/surfaces";

const result = await publishWidgetSnapshot(host, {
  title: "Today's progress",
  primaryValue: "3 of 5",
  progress: 0.6,
});
```

Check `result.published` for the native outcome. See [Native surface bridge](OPTIONAL_PLUGINS.md#native-surface-bridge) for availability, action events, and error responses.

### Visual novel (`@pocket/vn`)

`@pocket/vn` exports 20 manifest subpaths: `.`, `./types`, `./video`, `./authoring`, `./view`, `./clock`, `./audio`, `./localization`, `./collections`, `./inventory`, `./mesh`, `./mesh-view`, `./skin`, `./skin-view`, `./spine`, `./live2d`, `./atmosphere`, `./atmosphere-view`, `./choice-surface`, and `./choice-surface-view`.

`createNovelEngine(story: StoryDefinition, options: NovelEngineOptions = {})` returns `NovelEngine`. Main methods are `getSnapshot/getStagePresentation/subscribe/start/advance/selectChoice/updateInput/submitInput/cancelInput/tick/pause/resume/setPreferences/rollback/newGame/save/load/dispose`. Most transitions return `EngineUpdate {state,events,...}`. See the types for exact unions. `save()` returns `NovelSaveData` and `subscribe` returns an unsubscribe callback. The JS engine owns input, statement, video, and audio state. `StoryValidationError`, `SaveDataError`, and `NovelEngineError` report validation and save failures. For events, instructions, and extension module types, see [`src/types.ts`](../packages/pocket_vn/src/types.ts) and [`src/engine.ts`](../packages/pocket_vn/src/engine.ts). See the [Engine](VISUAL_NOVEL_ENGINE.md), [Authoring](VISUAL_NOVEL_AUTHORING.md), [Video](VISUAL_NOVEL_VIDEO.md), [Audio](VISUAL_NOVEL_AUDIO.md), [Localization](VISUAL_NOVEL_LOCALIZATION.md), [Collections](VISUAL_NOVEL_COLLECTIONS.md), and [Inventory](VISUAL_NOVEL_INVENTORY.md) guides.

### Spine / Live2D

| Package | Public path and API | Asynchronous results and runtime limits |
| --- | --- | --- |
| `@pocket/spine` | Only `.`. `createSpineRig(input: SpineRigInput): SpineRig`; `getSpineAtlasInfo(atlasText)` / `getSpineAtlasPages(atlasText)`. | `SpineRig` exposes parsed rig/frame data; `SpineUnsupportedFrame` explicitly marks unsupported frame output. npm workspace declares `@esotericsoftware/spine-core` 4.3.13 dependency; see [Spine boundary](VISUAL_NOVEL_SPINE.md). |
| `@pocket/live2d` | `.`, `./manifest`, `./motion`, `./interaction`, `./physics`, `./pose`, `./transport`; key APIs `parseCubismModel3`, `parseCubismMotion3`, `parseCubismExpression3`, `createCubismPhysics3Simulation`, `createCubismInteractionController`, `createPocketLive2dClient(host, options?)`. | `PocketLive2dClient` load/update/release exchanges model facts and frames over declared capabilities; default maximum 16 textures / 128MiB native payload. Cubism Core remains external host dependency and is not included in QuickJS engine; see [Live2D](VISUAL_NOVEL_LIVE2D.md) and [Web Live2D](WEB_LIVE2D.md). |

### Diagnostics / COS / Sync

| package | public paths and principal APIs | result / limitations |
| --- | --- | --- |
| `@pocket/diagnostics` | `.`, `./types`, `./normalize`, `./browser`, `./node`, `./file`; `createDiagnosticsCollector`, `createMemoryDiagnosticsStorage`, `createKeyValueDiagnosticsStorage`, `attachBrowserErrorCollector`, `createFileDiagnostics`, normalize helpers. | File adapter is the same source as `./node`; not available in Browser runtime. bounded record limits/types see [DIAGNOSTICS_PACKAGE.md](DIAGNOSTICS_PACKAGE.md). package manifest marks it private. |
| `@pocket/cos` | `.`, `./types`, `./sign`, `./local-config`, `./client`, `./publisher`, `./cli`; `createCosClient`, `signCosRequest`, `resolveCosTarget`, `inspectLocalCosEnvironment`, `publishReleaseDirectoryToCos`, `runCosCli`. | Client async operations include `checkAccess/headObject/putObject/uploadFile`; multipart defaults: 8 MiB threshold, 4 MiB part, concurrency 4, maxRetries 2. CLI covers inspect/check/publish. Credentials are injected/discovered locally; never include them in source or output. See [COS_PUBLISH.md](COS_PUBLISH.md). |
| `@pocket/sync` | `.`, `./protocol`, `./client`, `./server`, `./solid`; `ReplayGuard`, `classifySyncEndpoint`, `createPocketSyncClient`, `createPocketSyncServer`, `createSyncMeshStore`. | Multi-endpoint LAN, Tailscale/WireGuard CGNAT (`100.64.0.0/10`) and HTTPS WAN CRDT sync with HKDF-HMAC replay guard and chunked blobs; requires host `pocket_sync` plugin and `network` permission. Package manifest marks it private. |

## Export status and support boundary

- package manifest exports and runtime-supported APIs are separate concepts. For example, optional camera/Bluetooth/Live2D/Dio needs matching Dart provider, generated native platform config, permissions or external licensed Core.
- all actual public top-level JS declarations are represented in [`API_SURFACE.json`](API_SURFACE.json); member-level signatures/defaults and semver behavior must be reviewed in reachable `src` files and the corresponding sections above. Non-exported helper modules remain private even if they use `export` internally.
- unsupported PocketJS components, bytecode instructions and visual verification scope are enumerated in [COMPONENTS.md](COMPONENTS.md), [POCKETJS_FEATURE_PARITY_UI.md](POCKETJS_FEATURE_PARITY_UI.md), and [VALIDATION.md](VALIDATION.md). No API here promises unverified interaction, full platform parity, or performance.
- For public JS export changes, deprecation, release notes, and inventory commands, see the [API maintenance contract](API.md#maintenance-contract).
