# Integrating a hybrid Flutter tab host

Use this guide to add Pocket to an existing Flutter app while keeping its `MaterialApp`, native tabs, and Flutter routes. A Pocket JS SystemUI page can live inside a tab, and the native Navigator can open a separate full-screen container. Flutter owns rendering, IME, lifecycle, resource reads, and authorized native capability transport. JS/SystemUI owns business pages, app state, and embedded mini-app routes.

The [hybrid host API reference](HYBRID_HOST_API.md) documents Flutter hosting, catalogs, launches, AppConfig, and JS platform entry points. See the [API index](API.md), [JS API](JS_API.md), [Flutter API](FLUTTER_API.md), and [Tooling API](TOOLING_API.md) for package and public entry-point inventories. Additional component and plugin signatures are maintained there.

Implementation references include the [hybrid page](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/hybrid_tab_app.dart), [standalone entry](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/tool/hybrid_tab_demo.dart), [thin Demo Flutter host](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/main.dart), and [real QJBC integration test](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/integration_test/hybrid_tab_host_test.dart). The page and Demo plugin transport live in `demo/lib/native_examples/`. `demo/tool/hybrid_tab_demo.dart` keeps the standalone `main` and compatibility export. Consumers use `package:pocket_sdk/pocket_sdk.dart`. Demo internals are private implementation references.

## Integration structure and responsibilities

```text
Existing Flutter MaterialApp
├── Native tabs and nested native routes
├── Lazily mounted, retained Pocket tab
│   └── PocketSystemHost (rendering, input, lifecycle, native capability transport)
│       ├── JS/SystemUI embedded launch: present the mini app on this host's compositor surface
│       └── JS/SystemUI full-screen launch: native capability pushes a separate PocketSystemHost route
└── Launch directly from native: root Navigator pushes a separate PocketSystemHost route
```

- The host keeps control of the root `MaterialApp`, theme, native TabBar, and native route stack. Embed `PocketSystemHost` in an existing page. `PocketSystemHostApplication.fromBundledAssets` creates its own `MaterialApp` for apps where Pocket owns the shell.
- Flutter tab selection controls the surrounding tabs. JS SystemUI owns business routing, embedded mini-app stacks, and results. Keep `currentMiniApp`, the mini-app stack, and reopen orchestration in JS.
- Choose embedded compositor presentation or a full-screen host route when JS launches. The registered native launch capability pushes a separate Flutter route for full-screen mode. `PocketSystemHostController.instances` provides read-only runtime observations. Keep routing at the launch boundary, before the child draws in a tab.
- The Flutter route contains one full-screen host. Its internal mini-app calls, such as Profile → Lobby, use the JS stack. Closing it pops the native route and preserves the original Pocket tab's JS realm, index, and state.
- Keep config stable while a host is mounted. If `systemUI`, `applications`, permissions, or native policies change, close and remount the relevant host through the SDK lifecycle, using a new Key when necessary.

## 1. Keep MaterialApp and prepare JS bytecode and Flutter assets

Use the SDK's pinned `buildGuest` to produce `.qjbc`, `.pak`, metadata, and manifest from the JS/TS project. Use the existing compiler, runtime, and layout engine, and surface build failures rather than synthesizing success.

Reproducible Showcase build:

```sh
cd /Volumes/ORICO/Development/Github/pocket/demo/js
bun install --frozen-lockfile
bun run build:system
cd ..
command -v flutter
flutter --version
flutter pub get
```

Other apps can use their existing `bun run build` or `pocket.ts build` from the [SDK integration guide](SDK_INTEGRATION.md). Copy outputs below the Flutter asset root and register them in `pubspec.yaml`. Flutter reads only registered bundle assets. See [`demo/pubspec.yaml`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/pubspec.yaml) and [`demo/assets/apps/official/catalog.json`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/assets/apps/official/catalog.json) for examples. Keep business source separate from `.pocket-build` caches and regenerate catalogs through the build pipeline.

Use one Flutter SDK binary for `flutter pub get`, `flutter run`, `test`, and `drive`. Record `command -v flutter` and `flutter --version`, then use that executable or the same FVM commands throughout validation. Separate SDKs need separate `.dart_tool/package_config.json` to avoid plugin or FFI ABI mismatch.

Each catalog entry must resolve bytecode, PAK, metadata, and guest manifest. All entries must use the same pinned compiler and engine QJBC ABI. Rebuild after JS or resource changes. `PocketBundledApplicationCatalog` validates schema, IDs, relative paths, launchable status, and compositor handle range. `pubspec.yaml` controls file inclusion in the Flutter bundle.

## 2. Prepare the catalog, SystemUI, and native policies once

Load and retain the catalog during host State initialization. Tab switches and route pushes reuse the same config. The host defines its SystemUI config and the minimum native permissions. State fields and parameters below are example code. The catalog, configuration types, and methods are public SDK APIs.

```dart
import 'package:flutter/material.dart';
import 'package:pocket_sdk/pocket_sdk.dart';

PocketAppConfig? _systemUI;
Map<String, PocketAppConfig>? _applications;
Object? _catalogError;

Future<void> _preparePocket({
  required PocketAppConfig baseSystemUI,
  required Map<String, PocketAppConfig> nativePolicies,
}) async {
  try {
    final catalog = await PocketBundledApplicationCatalog.loadFromBundle(
      'assets/apps/official/catalog.json',
      assetPrefix: 'assets/',
      firstCompositorHandle: 4,
      lastCompositorHandle: 62,
      reservedAppIds: <String>{baseSystemUI.appId},
    );
    final systemUI = baseSystemUI.copyWith(
      compositorSurfaces: <String, int>{
        ...baseSystemUI.compositorSurfaces,
        ...catalog.compositorSurfaces,
      },
    );
    final applications = catalog.applicationsWithNativePolicies(
      nativePolicies: nativePolicies,
    );

    if (!mounted) return;
    setState(() {
      _systemUI = systemUI;
      _applications = applications;
      _catalogError = null;
    });
  } on Object catch (error) {
    if (!mounted) return;
    setState(() => _catalogError = error);
  }
}
```

- `systemUI.appId` is the stable root ID. Add it to `reservedAppIds` to exclude it from launchable children.
- Compositor handles are in `2..63` and must not overlap fixed handles. This example uses `4..62`. A smaller app can retain its own reserved range.
- `applicationsWithNativePolicies` accepts policies for existing, launchable catalog apps only. Each policy's `appId` must match its map key. Catalog data supplies trusted resource paths. The host owns hardware, network, and permission grants.
- The host explicitly sets each app's `PocketAppConfig` native permissions, `pluginFactories`, `additionalCapabilities`, input and keyboard behavior, memory limits, and `workerHttpOrigins`. Manifest declarations require matching host grants. HTTP origins must match exactly and the catalog Worker descriptor must declare an HTTP Worker.
- JS compositor surfaces require `additionalCapabilities: {'ui.compositor-surfaces'}` in SystemUI config. Register only the plugins and permissions required by your JS manifest.
- Cross-app identity sharing requires explicit capability and namespace declarations in the JS SystemUI policy and each guest manifest. See the storage constraints below.

Start with these SDK constructors and add the consumer's own plugins and permissions. Add an HTTP origin only for an entry with an HTTP Worker descriptor.

```dart
final baseSystemUI = PocketAppConfig(
  appId: 'com.example.system-ui',
  additionalCapabilities: const <String>{'ui.compositor-surfaces'},
  memoryLimits: const PocketMemoryLimits(
    heapLimitBytes: 128 * 1024 * 1024,
    maxPakBytes: 8 * 1024 * 1024,
  ),
);
final nativePolicies = <String, PocketAppConfig>{
  'com.example.api': PocketAppConfig(
    appId: 'com.example.api',
    workerHttpOrigins: const <String>{'https://api.example.com'},
  ),
};
```

Replace `com.example.*` with stable IDs used by SystemUI, guest manifests, and the catalog. Omit `workerHttpOrigins` for entries without an HTTP Worker descriptor. [`demo/lib/native_examples/showcase_base_config.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/showcase_base_config.dart) shows Showcase's ordinary native policies, with the JS-to-native route bridge handled separately. Tailor the config to the consumer's requirements.

## 3. Mount the Pocket tab on first visit and retain state

On the first visit to the Pocket tab, mount `PocketSystemHost`. Retain it in an `IndexedStack` or equivalent keep-alive container. Flutter tab selection supplies the `active` visibility signal. Pocket also observes ancestor `TickerMode`. An inactive tab pauses its foreground session and ticker and yields Back to the native Navigator.

```dart
final PocketSystemHostController _tabController = PocketSystemHostController();
static const int _pocketTabIndex = 2;
bool _pocketVisited = false;
int _selectedIndex = 0;

void _selectTab(int index) {
  setState(() {
    _selectedIndex = index;
    if (index == _pocketTabIndex) _pocketVisited = true;
  });
}

Widget _pocketTab() {
  if (!_pocketVisited) return const SizedBox.expand();
  final error = _catalogError;
  if (error != null) {
    return Center(child: SelectableText('Pocket catalog failed: $error'));
  }
  if (_systemUI == null || _applications == null) {
    return const SizedBox.expand(); // The host can render its own loading UI here.
  }
  return PocketSystemHost(
    systemUI: _systemUI!,
    applications: _applications!,
    controller: _tabController,
    active: _selectedIndex == _pocketTabIndex,
  );
}
```

Put `_pocketTab()` in the host's selected page container and retain the instance after the first visit. Use the host's keep-alive or IndexedStack if its tabs would otherwise discard state. The StatefulWidget State that created `_tabController` calls `_tabController.dispose()` when the page unmounts. `PocketSystemHost` detaches an external controller and leaves disposal to its owner.

## 4. Choose embedded or full-screen launch inside the Pocket tab

Offer **Embed in Pocket tab** and **Open full screen** in JS SystemUI settings. Keep the choice in JS state and branch when `platform.apps.open` starts. Embedded opens use the current JS SystemUI and compositor surface. Full-screen opens use an explicitly registered host capability. The host creates a separate full-screen `PocketSystemHost` route with the same trusted catalog, appId, and arguments.

`presentationStyle: "sheet" | "page"` controls a child mini-app's visual presentation inside JS SystemUI. Embedded and full-screen modes select the current Pocket tab viewport or a separate Flutter Navigator route. Changing `presentationStyle` leaves the host route mode unchanged.

Use `InstallPocketSystemOptions.openMode` to read the selected mode. For full screen, the kernel confirms that the target is installed before calling `externalOpen(request)`. Root SystemUI is trusted to open it. Embedded child requests remain subject to `allowedOpenApps`. Return an accepted AppLaunch token matching the request as soon as the route is accepted. `platform.apps.open` has a short timeout, so guest startup and the first frame follow asynchronously. Completion and cancellation use `platform.result` and `AppLaunch.cancel()`. See [hybrid host API](HYBRID_HOST_API.md) for request fields. Consumers register their own native plugin/capability and Navigator entry. The Demo Mini Apps card offers **Embed Pocket Plaza** and **Full-screen Flutter container**, with full screen shown only when the host reports fullscreenAvailable. Hybrid Plaza defaults to fullscreen and normal Showcase to embedded. The current JS instance retains the selection until container recreation restores the host default. See the [Host API](HYBRID_HOST_API.md) for accepted/result/cancel transport.

The JS app stack, `returnResult`, and cancellation work the same in both modes. Inside a full-screen host, child openings use the JS stack. Back goes to the current JS mini app first. When no JS page remains, close the full-screen route and return to the original Pocket tab.

## 5. Launch a mini app full-screen from a native page and collect a result

A native button pushes a `PocketSystemHost` route to the root Navigator. Supply the target appId and JSON arguments in `initialLaunch`. JS receives `system.host.launch` during SystemUI initialization, before showing a SystemUI home page. When the root mini app finishes, JS calls `system.container.close({result})`. Flutter returns the structured result to the caller through `onCloseWithResult`.

```dart
Future<PocketSystemLaunchResult?> openMiniAppFromNative(
  BuildContext context,
  String appId, {
  Object? arguments,
}) => Navigator.of(context, rootNavigator: true)
    .push<PocketSystemLaunchResult>(
  MaterialPageRoute<PocketSystemLaunchResult>(
    builder: (routeContext) => Scaffold(
      backgroundColor: const Color(0xFF000000),
      body: PocketSystemHost(
        systemUI: _systemUI!,
        applications: _applications!,
        initialLaunch: PocketSystemLaunchRequest(
          appId: appId,
          arguments: arguments,
          closeContainerWhenEmpty: true,
        ),
        onCloseWithResult: (result) {
          final route = ModalRoute.of(routeContext);
          if (routeContext.mounted && (route?.isCurrent ?? true)) {
            Navigator.of(routeContext).pop(result);
          }
        },
      ),
    ),
  ),
);
```

At the call site, `await openMiniAppFromNative(context, 'com.example.notes', arguments: const {'source': 'native-detail'});` then handle the result if `context.mounted`. The [hybrid host API](HYBRID_HOST_API.md) covers result types, argument limits, and `presentationStyle`. The style applies to the JS child and host launch mode is selected separately.

Native Back and cancellation reuse the container's close path. With `onCloseWithResult`, Back canceling the root returns `cancelled: true`, and JS-initiated close returns its structured `value`. Use `onClose` for an exit notification. Pop once and leave the container closed. See [hybrid_tab_app.dart](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/hybrid_tab_app.dart) for controller lifecycle, native detail routes, and result UI. That Demo page owns a `MaterialApp`. Integrate with the existing consumer root Navigator and its own key and application tree.

To open a child inside the already mounted Pocket tab, use `_tabController.requestLaunchApp(PocketSystemLaunchRequest(...))` to send `system.host.launch` to resident SystemUI. Use the independent root route above for a new container.

## 6. Storage, identity, and permissions across containers

Within one Flutter process, `PocketSystemHost` instances under the same app support directory share the SDK's platform storage engine and write queue through internal `PocketPlatformData.openShared`. Consumers use the public host API. Each lease keeps its own app ACL. Closing a temporary full-screen container preserves the resident tab's grants. The shared persistent space leaves QuickJS realms, instance state, and JS route stacks independent.

JS SystemUI policy controls cross-guest identity sharing. Use stable app IDs, explicitly declare `platform.storage.*`, and grant only required apps the needed namespaces, such as the Demo's `identity`. When host and JS policy disagree, surface a permission error. Keep storage authorization within the SDK and use consistent quotas.

See the [`demo/js/system.ts`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/js/system.ts) `sharedNamespaces` policy and identity reads and writes in the [Profile guest](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/js/apps/profile/app.tsx) and [Lobby guest](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/js/apps/lobby/app.tsx). The policy grants these guests only the explicitly named JS `identity` namespace. Other apps require their own grants, and separate processes do not share in-memory state.

## 7. Troubleshoot catalogs, resources, and launch

Read the reported error and check in order:

1. **Catalog file.** Confirm `catalogAsset` exists under the Flutter asset root. Join `assetPrefix` and each JSON relative path once. Verify the directories in `pubspec.yaml`, rebuild assets, run `flutter pub get`, and restart.
2. **Catalog validity.** Use a supported schema, unique legal unreserved app IDs, `launchable` entries, and relative paths within bounds. Compositor handles must be unique, in range, and fit the reservation.
3. **Trust configuration.** Native policy keys must equal config.appId and point to launchable apps. Register the actual plugin, permissions, capabilities, and memory limit required by each app. Verify an HTTP Worker descriptor and exact origin allowlist.
4. **Mount status.** `PocketSystemHostController.instances` reports `ready`, `firstFrameReady`, `foreground`, `isPresented`, and `session.failure` for SystemUI and child sessions. Use these snapshots for runtime diagnostics.
5. **Close and disposal.** After returning from embedded mode, confirm the child is no longer presented. After leaving full screen, confirm the route was removed and the original tab resumed. The owning State disposes its controllers. On host unmount, the SDK closes owned sessions, image resources, and storage leases.
6. **Real input.** Use Flutter pointer or device touch and confirm QJBC state, text, or DrawList changes. An asset-load status, test widget text, or static screenshot does not verify Guest input.

## 8. Agent integration and runtime acceptance

1. Inspect the existing Flutter root, tabs, route/Navigator ownership, lifecycle, and resource loading, then read the linked Demo and SDK API. Preserve the outer `MaterialApp`, theme, native pages, and state.
2. Inspect JS SystemUI, guest manifests, and system policy. Confirm pinned `buildGuest` creates QJBC/PAK/catalog and Flutter bundles them. Register each necessary native policy.
3. Add one catalog preparation, a lazy-mounted Pocket tab, a controller with clear ownership, and any required native direct-launch route to the existing page. Keep business state and routing in JS.
4. Add opening mode selection to JS SystemUI and branch under platform `launchApp/openApp`. Embedded uses the current compositor. Full screen calls a registered native capability to push a root Navigator route. Share JS policy and result semantics. Select the route before child presentation.
5. With the real system package, exercise first Pocket tab mount, JS button and frame changes, switching to native tabs and back, embedded and full-screen child open/close, JS child launch inside full screen, direct opening from native tab and detail pages, launch arguments, success results, Back cancellation, and allowed shared namespaces across two containers. Confirm the root Navigator top is a new Pocket host in full-screen mode and the original tab's `instanceId` and JS count survive pop.
6. Execute QJBC/PAK on every target using a device or native integration test. macOS, Android, and iOS require separate evidence.

Repository regression entry points:

```sh
cd /Volumes/ORICO/Development/Github/pocket/demo
cd js && bun run test:mobile && cd ..
flutter run -t tool/hybrid_tab_demo.dart -d macos
flutter test test/hybrid_tab_host_test.dart test/hybrid_flutter_host_plugin_test.dart
flutter analyze
flutter drive --no-pub --no-dds -d macos \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/hybrid_tab_host_test.dart
flutter drive --no-pub --no-dds -d macos \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/hybrid_entry_test.dart
python3 ../sdk/scripts/check_architecture.py
```

`flutter test test/hybrid_tab_host_test.dart` uses a probe runtime for widget-level tab mounting, route timing, and host events. Runtime acceptance uses pinned bytecode and FFI in `integration_test/hybrid_tab_host_test.dart`, with actual guest clicks and state or frame changes. The integration test leaves outer hybrid AppBar off by omitting `onClose`. Consumers with visible AppBars or toolbars need corresponding device assertions.

### macOS verification on 2026-11-16

The repository's `.fvm/flutter_sdk` pointed at Flutter 3.47.9. Both drive targets used pinned QJBC and native FFI:

- `hybrid_entry_test.dart` opened the hybrid host from default Demo's Host entry. Native and Pocket counters changed on real pointer input. The original Showcase `instanceId` and count survived close. `/tmp/pocket-hybrid-configurable-entry.log` reports `All tests passed.`.
- `hybrid_tab_host_test.dart` compared native and Plaza launches in a fixed 1280×1000 logical viewport. Plaza created a distinct launch controller and route, kept the source free of duplicate children, paused its ticker, preserved and covered the prior NavigationBar, and matched native launch full-screen bounds. Pop restored the original instance and count. Embedded mode created no new route and kept the native TabBar visible. Shared identity, Profile → Lobby JS calls, results, and native detail cancellation passed. See `/tmp/pocket-hybrid-configurable-route-final.log`. After the acceptance deadline fix, rebuilding pinned QJBC and rerunning the same route test passed. See `/tmp/pocket-release22-timeout-route-test.log`.
- Thirty-two SDK system-kernel tests cover external async results, root-only authorization, invalid JSON results, timely timeout when acceptance never returns, queue recovery, and canceling a late accepted route. `demo/js` mobile UI and guest-state checks passed. Two widget test files passed three tests total, and `flutter analyze --no-pub` passed. Logs are `/tmp/pocket-hybrid-widgets-final.log` and `/tmp/pocket-hybrid-analyze-final.log`.

Runtime testing exposed controller disposal on route pop before the host unmounted. Wait for `TransitionRoute.completed` and dispose on the frame after the transition removes the route. Apply the same ownership timing to consumer-defined full-screen routes.

The logs include `Failed to foreground app; open returned 1`, followed by a successful Flutter Driver connection and completed assertions. This round covers macOS. Android, iOS, and arbitrary window sizes remain unverified. The older geometry implementation that hid the TabBar was removed. Its logs apply only to that earlier implementation.

## 9. Retained parent sources and adaptations

The source-first review inspected `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` and excluded `pocket_host/`.

- `lib/main.dart` retains the original `MaterialApp`, theme, and root entry and separates warm-up from first-frame readiness. The new integration preserves the host's root shell and existing routing system.
- `lib/ui/mini_app_host_page.dart` establishes a fixed host region, a Pocket viewport, and an overlay above it, plus disposal of page-owned runners and controllers. Put the Pocket host inside the existing tab viewport and keep diagnostic and tab chrome outside its sizing boundary.
- `lib/core/pocketjs_bundle_runner.dart` was inspected for routing and ownership. It maintains Dart app and page state. The current SDK uses its pinned JS SystemUI and host controllers in place of that legacy runner, custom runtime, and `pocket_host/`.

The current SDK adapts a native shell and tabs, a lazy retained surface, background pause, native `Navigator.maybePop` that inactive tabs do not intercept, structured guest results from native routes, and authorized storage across same-app containers. For full screen, JS selects the mode and calls the native route capability at launch. Verify that route independently. The implementation uses `PocketSystemHost`, `PocketSystemHostController`, and pinned JS SystemUI.

Demo responsibilities are split so sources in `lib/` never import back from `tool/`:

- [`demo/lib/native_examples/hybrid_tab_app.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/hybrid_tab_app.dart) implements the hybrid page, tabs, native launch, and results. Native buttons and Plaza full-screen requests share `_pushMiniAppRoute`, and the new container's children stay on the JS stack.
- [`demo/tool/hybrid_tab_demo.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/tool/hybrid_tab_demo.dart) retains the `flutter run -t tool/hybrid_tab_demo.dart` entry and compatibility exports.
- [`demo/lib/native_examples/showcase_base_config.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/showcase_base_config.dart) supplies ordinary Showcase SystemUI config and child policies.
- [`demo/lib/native_examples/showcase_config.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/showcase_config.dart) composes the Demo root app and registers the hybrid Flutter example transport.
- [`demo/lib/native_examples/hybrid_flutter_host_plugin.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/lib/native_examples/hybrid_flutter_host_plugin.dart) provides the Demo example page and openMode/openMiniApp/cancelMiniApp and result event transport. RPC waits for route acceptance, results arrive separately, and disposal cancels outstanding requests it owns. This transport and the Demo GlobalKey are private to the Demo.
- [`demo/js/app.tsx`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/demo/js/app.tsx) links to the Flutter example from the Showcase Host page and back. The Mini Apps card owns outer launch mode, and `demo/js/system.ts` wires native accepted/result/cancel events into AppLaunch.
