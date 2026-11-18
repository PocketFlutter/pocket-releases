# Integrate the PocketJS Flutter SDK

This source tree can be referenced locally. The SDK is currently unpublished on pub.dev and npm.
The SDK working root is `/Volumes/ORICO/Development/Github/pocket/sdk`. The sibling `../demo`
Showcase is outside the public API. The JS guest owns pages, components, themes, routing, and
state. The Flutter SDK handles bytecode admission, rendering and input, platform geometry,
update signatures, plugin lifecycle, and runtime resources.

## Create a standalone project

Run this outside the SDK repository.

```sh
bun /Volumes/ORICO/Development/Github/pocket/sdk/pocket.ts init /path/to/my-pocket-app \
  --sdk-root /Volumes/ORICO/Development/Github/pocket/sdk \
  --app-id com.example.myapp
# Add --hardware to enable the hardware provider.
# Add --platform-experience for system bars and haptics. Deep links stay off.
# Add --deep-link-scheme=pocketapp to enable a custom URL scheme.
```

`init` copies the public `packages/pocket_ui` package to `vendor/pocket-ui`. The scaffold
uses the SDK root you supply and contains only public SDK code. It generates the following files.

- `app.tsx`, `pocket.json`, `manifest.json`, and `editor.json`.
- An independently editable `vendor/pocket-ui` and precompiled `node_modules/@pocket/ui`.
- A standalone `flutter/` app for iOS, Android, and macOS.
- A local `pocket_sdk` path dependency in `flutter/pubspec.yaml` and four runtime assets.
- An iOS 15.0 deployment target, Apple Silicon `arm64` settings, and SwiftPM plugin integration enabled by default.

Opt into hardware with `--hardware`. It adds the separate `pocket_hardware` dependency, an
explicit plugin factory, an optional hardware permission and capability manifest, iOS usage
descriptions, and Android permissions in `AndroidManifest.xml`. Android's `minSdk` is at
least API 24 to meet the `pocket_flutter` renderer requirement. `build_native.sh android`
currently builds only `arm64-v8a`. The default init skips the provider and manifest patches.
An existing `pocket_hardware` dependency may still merge static permissions from the library
manifest. Permission requests wait for user action.

`--platform-experience` adds the separate `pocket_platform` package and an explicit factory
for system bars and haptics. Deep links are separately enabled by `--deep-link-scheme=pocketapp`,
which generates the URL scheme, iOS SceneDelegate forwarding, the Android intent filter, and
the optional links capability. Deep links are off in the standard Showcase. Enable them with
both the separate `PocketDeepLinkPlugin` and the native static declarations. Guests rely on
the scheme configured by the host. Support is limited to custom schemes.

The links provider retains bounded native URL events so the app can receive links when it
returns from the background. The system bar and haptics provider is revoked as part of the
usual foreground and background lifecycle. Both share the same platform package. JS owns
business routing and decides how the app opens.

The JS consumer uses the existing HostBridge message loop.

```ts
import { createPlatformExperience } from '@pocket/ui/platform-experience';
import { createPocketStreamAdapter } from '@pocket/ui/streams';

const experience = createPlatformExperience(host); // Does not subscribe to links automatically.
await experience.haptics.perform({ type: 'selection' });
await experience.systemUi.set({ statusBarIconBrightness: 'light' });
const streams = createPocketStreamAdapter(host, { maxActiveStreams: 4 });
const sensors = streams.open('hardware.sensors.watch', { samplingHz: 10 });
const remove = sensors.onData(sample => { /* Update JS page state. */ });
// Release the subscription when leaving the page. Dispose the adapter when the consumer exits.
remove();
sensors.cancel('page_left');
streams.dispose();
experience.dispose();
```

Streams reuse the existing `stream.open/data/batch/end/cancel/error` protocol. Native callbacks
push data directly. Buffers, active streams, and pending reads are bounded. Idle deadlines use
the host's existing guest virtual clock. Supply `scheduleTimeout` to HostBridge as the standard
Demo does. An external bridge that only issues manual `tick` calls cannot wake a paused guest.

Generate types from the actual registry by exporting `PocketPluginDescriptor.toJson()`
together with `PocketHost.capabilitiesJson()` and running the following command.

```sh
bun /path/to/pocket/sdk/pocket.ts types plugins.json --out=plugin-types.ts
```

The generator builds clients for registered capabilities only. Legacy capabilities without a
schema remain `unknown`. See [Plugin type contracts](PLUGIN_TYPES.md), [Platform experience](PLATFORM_EXPERIENCE.md),
[JS streams](JS_HOST_STREAMS.md), and [Hardware streams and GATT](HARDWARE_STREAMS.md).

The generated `app.tsx` uses public adapters directly and keeps layout logic local to the app.

```tsx
const [dark, setDark] = createSignal(false);
return (
  <MobileThemeProvider theme={() => dark() ? MOBILE_THEME_DARK : MOBILE_THEME_LIGHT}>
    <SafeAreaScaffold>
      <View class={dark() ? 'flex-col gap-2 p-4 bg-[#0d1726]' : 'flex-col gap-2 p-4 bg-slate-50'}>
        <Text>Hello PocketJS</Text>
        <MobileButton label={dark() ? 'Light' : 'Dark'} onPress={() => setDark(!dark())} />
      </View>
    </SafeAreaScaffold>
  </MobileThemeProvider>
);
```

`SafeAreaScaffold` subscribes to the host's `display.viewport` and applies the safe area once
as padding for the content shell. `availableDisplayPanes` still handles the active division.
Pages nested under the Showcase root should use the default `MobileScaffold` with
`safeArea="none"` so the content shell can own the safe area.

For a standalone mini-app whose host supplies a top-right close action, set
`reservedActions="mini-app"` on the same shell. This reserves 60 logical pixels, comprising the
44-pixel button, 8-pixel right margin, and 8-pixel gap. `MobileAppBar` automatically shrinks
and clips the title and subtitle while the background fills the viewport. The shared shell
handles the right-side margin and body padding.

The JS project is generated even if Flutter is unavailable during init. When Flutter is
available, run `flutter pub get` in `flutter/`, then run `pocket build` with `--platform`
to apply the iOS settings.

## Public Flutter API

A standalone shell needs a single entry point.

```dart
import 'package:flutter/material.dart';
import 'package:pocket_sdk/pocket_sdk.dart';

void main() => runApp(const PocketApp(
  config: PocketAppConfig(appId: 'com.example.myapp'),
));
```

`PocketApp` and `PocketSystemHost` use an opaque black background by default. Configure it with
`backgroundColor: const Color(0xFF000000)`. You can pass the same option to a standalone
`PocketGuest` or `PocketView`. Embedded surfaces default to transparent.
Set the background at a single root boundary so DrawOps chunks and scrolling content can reuse it.
See [Surface background](SURFACE_BACKGROUND.md) for provenance, the ablation test, and the macOS window boundary.

An existing Flutter app can embed the same guest inside its own `MaterialApp`.

```dart
MaterialApp(
  home: Scaffold(
    body: PocketGuest(
      config: const PocketAppConfig(appId: 'com.example.myapp'),
    ),
  ),
);
```

Use `PocketApp` as a standalone shell and `PocketGuest` to embed a guest. Both use the same
`PocketSession` lifecycle, including the JS UI, bridge, and frame loop. The SDK loads real
QuickJS script bytecode, the PAK, bytecode metadata, and the guest manifest from the configured
assets. An ABI mismatch stops startup. Only bytecode can run.

| `PocketAppConfig` field | Purpose |
| --- | --- |
| `appId` | App identity and the namespace for update storage and performance history. |
| `bytecodeAsset` / `pakAsset` / `metadataAsset` / `manifestAsset` | Configurable asset paths that default to `assets/app.qjbc`, `assets/app.pak`, `assets/app.bytecode.json`, and `assets/guest-manifest.json`, respectively. |
| `updates` | Signed update source configured through `PocketUpdateConfig`. The client holds only an Ed25519 public key. |
| `allowedPermissions` | Permissions allowed by the host. The guest manifest can further restrict the set. Hardware is explicitly registered through a separate package and plugin factories. |
| `memoryLimits` | Hard QuickJS heap limit per realm and maximum admitted PAK size. |
| `pluginFactories` | List of `PocketPlugin Function(PocketViewController)`. Each verified guest generation gets new plugin instances. |
| `additionalCapabilities` | Capability names that the host explicitly adds. |
| `showFps` | Shows an FPS diagnostic label and collects a bounded performance window. |

The JS SystemUI catalog selects limits with `memory` and `memoryPolicy`. Guests can reduce
their budgets within the host's `PocketMemoryLimits` bounds. See [Mini-app memory limits](APP_MEMORY_LIMITS.md)
for actual heap limits, legacy Demo tiers, and recording and replay settings.

Consumer apps declare optional hardware through a direct dependency on `pocket_hardware`. The
core `pocket_sdk` package keeps the plugin separate. The original `enableHardware` flag was
removed so the plugin factory is the sole registration mechanism.

```dart
import 'package:pocket_hardware/pocket_hardware.dart';

PocketPlugin hardwareProvider(PocketViewController controller) => HardwarePlugin(
  onTextureRegistered: controller.authorizePlatformTexture,
  onTextureReleased: controller.revokePlatformTexture,
);

const config = PocketAppConfig(
  appId: 'com.example.camera',
  pluginFactories: [hardwareProvider],
  allowedPermissions: {HardwarePermissions.camera},
);
```

Import low-level rendering and runtime diagnostics from `package:pocket_flutter/pocket_flutter.dart`.
The core entry point exports app integration and plugin contracts only.

Use `PocketSession` when you manage the runtime directly, such as when integrating an existing
navigation or lifecycle system.

```dart
final session = PocketSession(
  config: const PocketAppConfig(appId: 'com.example.myapp'),
);
await session.initialize();
// Pass session.controller to PocketView and use session.status() to read the update status.
await session.close(); // Waits for plugin shutdown and performance history to be saved.
```

`PocketApp` and `PocketGuest` automatically open and close sessions when mounted and unmounted.

## Updates, hardware, and custom plugins

Configure signed updates as follows.

```dart
const updates = PocketUpdateConfig(
  baseUrl: 'https://updates.example.test/some-other-path',
  hostVersion: '3.2.0',
  packageVersion: 'stable',
  keyId: 'release-key-1',
  publicKey: 'BASE64_ED25519_PUBLIC_KEY',
  namespace: 'production',
);

const config = PocketAppConfig(
  appId: 'com.example.myapp',
  updates: updates,
);
```

You can also use `PocketUpdateConfig.fromEnvironment()` and pass the settings at build time.

```sh
flutter run \
  --dart-define=POCKET_UPDATE_BASE_URL=https://updates.example.test/some-other-path \
  --dart-define=POCKET_HOST_VERSION=3.2.0 \
  --dart-define=POCKET_PACKAGE_VERSION=stable \
  --dart-define=POCKET_UPDATE_KEY_ID=release-key-1 \
  --dart-define=POCKET_UPDATE_PUBLIC_KEY=BASE64_ED25519_PUBLIC_KEY \
  --dart-define=POCKET_STORE_NAMESPACE=production
```

The structured config reads `/some-other-path/pocket/3.2.0/com.example.myapp/stable/latest.json`.
The base URL may include any fixed path prefix, so `pocket/` can live below the domain root.
`stable` is a mutable release slot. The version and build in the signed payload define package
identity and protect against replay. Existing Editor and loopback consumers may use
`POCKET_UPDATE_URL` alone with the full URL. Choose either the full URL or the structured fields.
See the [AI application development guide](AI_APP_DEVELOPMENT.md) for the release layout, initial
bundle, and subsequent single-resource updates.

Updates require a signed, ABI-compatible qjbc, PAK, and manifest. A failed candidate leaves the
previous healthy guest active. Recompile the host to update a native plugin or hardware provider.
Hardware requires explicit `allowedPermissions`. User actions trigger system permission
requests. The `--hardware` scaffold allows `HardwarePermissions.all` so the example can negotiate
the provider. In production, narrow this set by feature and keep the manifest declarations minimal.

The `com.pocketnexus.host/hardware` MethodChannel exposes the same capability protocol on iOS
and Android. The provider implementations are in `packages/pocket_hardware/ios` and
`packages/pocket_hardware/android`. Android applies platform permissions and lifecycle while
preserving the JS capability names. Declare the applicable iOS keys in `Info.plist`:
`NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSPhotoLibraryUsageDescription`,
`NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`,
`NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`,
`NSMotionUsageDescription`, and `NSFaceIDUsageDescription`. The CLI's `--hardware` flag
generates these descriptions.

The Android scaffold declares `CAMERA`, `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` on Android 12+,
legacy Bluetooth compatibility declarations, and location and biometric permissions. Motion and
pressure sensors use `SensorManager` without `BODY_SENSORS`. Photos are stored in the app-private
directory without external media or storage permissions. With no recording API, the current
provider omits `RECORD_AUDIO`. On Android, user actions must trigger runtime camera, BLE, or
location permission requests. Biometric authentication uses `BiometricPrompt`. Declaring the
permission only makes the request possible. The provider returns structured
`hardware_unsupported` or `hardware_permission_denied` results for unavailable hardware or
permissions. Photos, coordinates, sensors, and textures require real hardware.
`NSLocalNetworkUsageDescription` addresses app-specific networking and updates. Add it only if
the app needs it, independently of the hardware flag.

### Automatic iOS Scene lifecycle adaptation

`pocket init` and `pocket build --platform=ios-sim|ios` apply an idempotent Scene patch to the
default iOS shell generated by older Flutter versions such as 3.35. Flutter 3.47 generates a
Scene shell already, so the patch is a no-op. The implementation is
`pocket.ts:patchIosSceneLifecycle`.

- The generated default `AppDelegate.swift` adds `FlutterPluginRegistrant` to register plugins with the registry used by `FlutterSceneDelegate`.
- `Runner/Info.plist` gains the single-window `UIApplicationSceneManifest`, `UIWindowScene`, `FlutterSceneDelegate`, and `Main` storyboard configuration.
- Existing Scene manifests are reused across repeated runs.

When a project has a custom `AppDelegate.swift`, the CLI preserves it. If the Scene manifest is
missing, the CLI fails with instructions to add `FlutterSceneDelegate` and Scene configuration
manually. If it exists, the custom delegate is retained verbatim. For custom shells, verify that
`GeneratedPluginRegistrant` still registers through `FlutterPluginRegistrant` and that the
Scene lifecycle is preserved. `scripts/tests/tooling_scene.test.ts` covers default delegate
generation, custom delegate protection, and idempotence.

Implement custom plugins using the `pocket_services` types exported by `pocket_sdk.dart`.

```dart
final class EchoPlugin extends PocketPlugin {
  @override
  PocketPluginDescriptor get descriptor => const PocketPluginDescriptor(
    id: 'example.echo',
    version: '1.0.0',
    capabilities: {
      'example.echo': PocketPluginCapability(
        name: 'example.echo',
        kind: PocketCapabilityKind.request,
      ),
    },
  );

  @override
  void register(PocketPluginContext context) {
    context.registerRequest('example.echo', (params) => params);
  }
}

PocketApp(
  config: PocketAppConfig(
    appId: 'com.example.myapp',
    pluginFactories: [(_) => EchoPlugin()],
  ),
);
```

Plugins activate after descriptor, guest manifest, permission, and quota checks. The SDK
revokes capabilities and calls deactivate and dispose on guest switches, failure recovery,
and shutdown. Expose native APIs through `PocketPluginContext`.

## Build real bytecode and native libraries

```sh
cd /path/to/my-pocket-app
bun /Volumes/ORICO/Development/Github/pocket/sdk/pocket.ts build . --sdk-root /Volumes/ORICO/Development/Github/pocket/sdk
```

The build reuses the SDK's `scripts/build_guest.ts`, the pinned PocketJS compiler, and
`native/pocketjs_bytecode`. It performs these steps.

1. Parse the external project's `app.tsx` and `pocket.json`.
2. Precompile vendored `@pocket/ui` with the pinned transform because the compiler skips JSX transforms in general `node_modules`.
3. Emit diagnostic `build/pocket/app.js`, the complete PAK, and real `app.qjbc`.
4. Check `app.bytecode.json.entryFormat == quickjs-bytecode` and require a nonempty `runtimeAbi`.
5. Write `guest-manifest.json` and copy the qjbc, PAK, metadata, and manifest to `flutter/assets/`.

Use `app.js` for diagnostics and reproduction. The runtime loads only qjbc, with no source-evaluation fallback.

Select a platform explicitly to prepare the Flutter FFI archive.

```sh
bun /Volumes/ORICO/Development/Github/pocket/sdk/pocket.ts build . --sdk-root /Volumes/ORICO/Development/Github/pocket/sdk --platform=ios-sim
# For an iOS device use --platform=ios. For macOS use --platform=macos.
```

The command reuses `scripts/build_native.sh` and records the platform, input fingerprint, and
archive in the ignored SDK file `.pocket-build/sdk-native/<platform>.json`. Simulator, device, and
Android builds use their matching archives. A clean checkout requires the applicable Xcode and
Rust toolchains. `--platform` prepares the library only.

Run the build with `--platform` again after every SDK native source, patch, or transport ABI
update. `flutter run`, hot reload, and hot restart skip the fingerprint check and Rust compilation.
If `Pocket native binary ABI is incomplete` appears, rebuild the appropriate platform archive
and then the Flutter app. The ABI check must pass for startup. Changes to the first-frame timeout
or a JSON fallback would only bypass the check. For the Showcase, run
`bash sdk/scripts/build_native.sh ios-sim` from the repository root and rerun Flutter in `demo/`.
This updates both device and simulator slices.

## Pocket Studio for external projects

```sh
bun /Volumes/ORICO/Development/Github/pocket/sdk/pocket.ts editor /path/to/my-pocket-app \
  --port=8790
```

Use `--project-root` or `POCKET_EDITOR_PROJECT_ROOT` to point the service to an existing
project. Its pages and endpoints list and create projects, read and edit guest source, build,
publish, and report log status. External project mode uses the selected project. The GET and
PUT file API allows only safe guest source extensions and rejects out-of-root paths and
symlinks. Its response excludes qjbc, PAK, private keys, build state, and update artifacts.
Failed builds preserve the last successful revision and leave the failed source unpublished.
Signing still uses the real `scripts/package_update.ts`. The Flutter side uses the SDK's
`PocketSession`.

The SDK integration baseline completed a full Showcase cycle through this service.
Revision 17 built a 233,227-byte qjbc and 333,536-byte PAK and published
`entryFormat=quickjs-bytecode` with runtime ABI
`quickjs-bytecode-v1:5ab2246bcbd64b9d66e396043be05c2f77e7a6ab78e3125c56f8a1f62019a021`.
Independent checks verified the `latest.json` Ed25519 signature, qjbc and PAK hashes and sizes,
20 content-addressed blobs, and the complete PAK reconstructed from those blobs. The editor's
tar.gz serves offline export only. The host consumes the signed manifest and blobs using the
URL and key from `host.json`.

## Current limits

- The CLI supports the pinned Solid guest compilation path. Arbitrary Web and DOM packages are outside that support.
- A PAK is the complete runtime resource package. The update service can publish content-addressed ranges. `PocketSession` verifies and reconstructs the complete PAK before consumption. The tar.gz serves offline export only.
- Recompile the Flutter host to update native plugins. The JS update channel carries guest artifacts only.
- iOS deployment starts at 15.0. The Android renderer requires API 24 or later and the current native archive is `arm64-v8a` only. Building the Duo native geometry bridge requires Xcode and SDK 27.1 or newer. Older iOS runtimes return empty reserved regions.
- Validate Android camera, BLE, sensors, location, and biometrics on physical devices. Emulators and devices without permissions can verify structured unsupported and denied results only.

The 2026-11-02 input fix was Editor revision 18, version 0.1.1, build 2, with a 235139-byte qjbc
and 333472-byte PAK. The physical Duo app's `Host → Updates → Check` returned `stage=verified`,
`available=0.1.1`, and `lastError=none`. The standard app also activated 0.1.1.

To manage the macOS local service, run `bash scripts/editor_service.sh start` and use `status`
or `stop` to inspect or stop it. The service runs independently of the current terminal and
needs a new start after logout or restart.

Run these service commands from `/Volumes/ORICO/Development/Github/pocket/sdk`. The service
uses `editor/`, `packages/`, and compiler tooling under the SDK directory. The sibling
`../demo` is a consumer. The service uses the SDK tree instead of the historical `pocket_host`
path.

## SystemUI container close and hybrid tab launch contracts

- **Provenance and retained behavior.** The retained parent app's
  `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/main.dart` and
  `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/ui/mini_app_host_page.dart`
  provided the host page mounting and exit behavior. JS SystemUI owns decisions to close a
  container or directly launch into a mini-app route. Flutter provides boundary callbacks,
  visibility activation, and argument transport.
- **Dart host boundary** in `sdk/lib/src/pocket_system_host.dart` and `sdk/lib/src/pocket_app.dart`.
  - `PocketSystemHost`, `PocketSystemHost.fromHostConfig`, and
    `PocketSystemHostApplication` accept optional `VoidCallback? onClose`,
    `ValueChanged<PocketSystemLaunchResult?>? onCloseWithResult`,
    `PocketSystemLaunchRequest? initialLaunch`, and `bool active = true`.
  - `PocketSystemLaunchRequest` describes a host-initiated direct launch with `appId`,
    JSON-serializable `arguments`, `presentationStyle`, and `closeContainerWhenEmpty`.
    When `PocketSystemHost` creates `system-ui`, it injects `system.host.launch` through
    `session.setInitialEvents` at `t = 0` before the first frame. After
    `system.runtime.configure` completes for generation zero, the event clears to prevent
    replay during later hot reloads. `PocketSystemHostController.requestLaunchApp` can send
    the same event at runtime.
  - `PocketSystemLaunchResult` returns structured closing data with `appId`, `cancelled`,
    `value`, and `reason`. `onCloseWithResult` and `onClose` each fire once when JS
    SystemUI calls `system.container.close` with `{result: ...}` or an unhandled system
    back action at the root closes the direct-launch container.
  - Visibility and back interception depend on `active && TickerMode.of(context)` for
    `PocketGuest`, `PocketGuestSession`, `PocketSystemHost`, and
    `PocketSystemHostApplication`. When the Flutter tab is hidden, as with a background
    `IndexedStack` branch, or when `active == false`, they call
    `session.setForeground(false)` to pause the QuickJS frame clock and foreground plugins.
    They also set internal `PopScope.canPop` to `true` and disable edge back gesture
    interception, allowing external native Flutter routes to receive `maybePop()`.
  - In `sdk/lib/src/pocket_platform_data.dart`, `PocketPlatformData.openShared` provides a
    process-local reference-counted lease for the same normalized directory. A persistent
    tab and a transient full-screen container can safely use the same
    `pocket_platform_data.json` through shared in-memory state and a serialized atomic write
    queue.
- **JS SystemUI SDK** in `sdk/packages/pocket_ui/src/system.ts` and `system-surfaces.tsx`.
  - `PocketSystemKernel` listens for `system.host.launch` and directly opens the target
    child app after the initialization queue. With `closeContainerWhenEmpty == true`,
    `snapshot().directLaunch` is `true`. The underlying Showcase home is hidden and
    the first child screen opens without a slide-in delay. When the root child returns a
    result or is canceled and popped, leaving the stack empty, the kernel calls
    `system.container.close({ result })` after `system.runtime.respond` persists the result.
  - If an untrusted child app tries to forward `system.container.close` through
    `system.request`, the kernel returns `system_context_denied`.
- **Validation and examples.** See [Hybrid Flutter tab host](HYBRID_FLUTTER_TAB_HOST.md),
  `demo/tool/hybrid_tab_demo.dart`, `demo/test/hybrid_tab_host_test.dart`, and
  `demo/integration_test/hybrid_tab_host_test.dart`.
