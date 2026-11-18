# Optional hardware packages and system permissions

Pocket uses Flutter's `permission_handler` for system permissions. It forwards actual
results to JS and enforces trusted host and guest manifest admission. Permission state
and queuing stay with the existing platform mechanism. Hardware reads never prompt automatically.

| Optional package | Dart plugin | Capabilities |
| --- | --- | --- |
| `pocket_permissions` | `PocketPermissionsPlugin` | `permissions.status/request/openSettings` |
| `pocket_camera` | `PocketCameraPlugin` | Preview, textures, lens, flash, capture, private photo list and deletion, and export to the system album |
| `pocket_bluetooth` | `PocketBluetoothPlugin` | Scan, connect, GATT read and write, and notification streams |
| `pocket_sensors` | `PocketSensorsPlugin` | One-shot readings and continuous samples |
| `pocket_location` | `PocketLocationPlugin` | Real location fixes |
| `pocket_biometrics` | `PocketBiometricsPlugin` | System biometric authentication |
| `pocket_weather` | `PocketWeatherPlugin` | Existing Open-Meteo request. A standalone plugin requires latitude and longitude. |

Camera and photos share one package and lifecycle, from capture to private storage
and optional export to the system album. Biometrics are authentication operations.
Network access is separate from runtime permission prompts.

`pocket_hardware_core` provides shared contracts, schemas, validation, and transport.
It has no native plugin implementation or dependency on the permissions plugin.
Each native package owns its Kotlin and Swift implementation, channel, and platform
declarations and can be selected independently.

The legacy `pocket_hardware` bundle depends on the domain packages and preserves
`HardwarePlugin`, `hardware.permissions`, and `hardware.permissions.request`.
Legacy permission calls use `PocketSystemPermissions`. New consumers should select
packages by capability.

## Select modules during scaffolding

```sh
bun sdk/pocket.ts init /path/to/app --camera --bluetooth
bun sdk/pocket.ts init /path/to/motion --sensors
bun sdk/pocket.ts init /path/to/motion-ios --sensors --permissions=hardware.sensors
bun sdk/pocket.ts init /path/to/weather --weather
```

Combine `--camera`, `--bluetooth`, `--sensors`, `--location`, `--biometrics`,
and `--weather`. The default selects no hardware. Legacy `--hardware` selects the
compatibility bundle. Use `--permissions=<comma-separated hardware policy keys>`
on its own or alongside selected modules. Camera, Bluetooth, and location register
the permissions plugin with the matching allowlist. Sensors include it only when
explicitly selected, for iOS motion authorization. Biometrics and weather omit it
unless separately requested.

Generated Flutter dependencies, factories, guest manifests, Android declarations,
iOS usage descriptions, and compiler macros reflect the selected modules. Rebuilding
preserves consumer customizations.

## Embed in Flutter

Add the required packages to the consumer's `pubspec.yaml`. This example adds camera
and permissions.

```yaml
dependencies:
  pocket_camera:
    path: /path/to/pocket/sdk/packages/pocket_camera
  pocket_permissions:
    path: /path/to/pocket/sdk/packages/pocket_permissions
```

```dart
import 'package:pocket_camera/pocket_camera.dart';
import 'package:pocket_permissions/pocket_permissions.dart';
import 'package:pocket_sdk/pocket_sdk.dart';

final config = PocketAppConfig(
  appId: 'dev.example.camera',
  allowedPermissions: {HardwarePermissions.camera, HardwarePermissions.photos},
  pluginFactories: [
    (_) => PocketPermissionsPlugin(allowedPermissions: {
      HardwarePermissions.camera, HardwarePermissions.photos,
    }),
    (controller) => PocketCameraPlugin(
      onTextureRegistered: controller.authorizePlatformTexture,
      onTextureReleased: controller.revokePlatformTexture,
    ),
  ],
);
```

The guest manifest declares the capabilities and policy keys it uses.

```json
{
  "protocolVersion": 1,
  "capabilities": {"requires": [], "optional": [
    "permissions.status", "permissions.request", "permissions.openSettings",
    "hardware.camera.preview.start", "hardware.camera.preview.stop"
  ]},
  "permissions": {"optional": ["hardware.camera"]}
}
```

```ts
import { createPocketPermissionsClient } from '@pocket/ui/permissions';

const permissions = createPocketPermissionsClient(host);
// Request from a user gesture. Status comes from permission_handler.
const result = await permissions.request('hardware.camera');
if (result.granted) {
  await host.request('hardware.camera.preview.start', { lens: 'back' });
}
```

`limited` is reported independently. `granted` means full authorization. A user
denial returns `ok: true, granted: false` with system status. Admission failures
such as missing declarations or host permission reject through the bridge.
JS decides whether to explain, ask again, or open settings.

Android 12 and later use Bluetooth scan and connect permissions. Earlier Android
uses location for scans when necessary. `permission_handler 12.0.1` and
`device_info_plus 11.5.0` are pinned for Flutter 3.35 and the Android toolchain.
`device_info_plus` supplies the OS SDK version. `permission_handler` issues the
request. Android private photos and ordinary motion sensors need no permission
prompt. iOS album export uses add-only access. Match platform declarations,
iOS usage descriptions, and permission_handler macros to the chosen capabilities.

## Compose independent modules

`--weather --location` registers two separate capabilities. Weather declares network
policy only and requires both coordinates. Missing coordinates return `invalid_argument`.
If the app needs current location, JS requests location before weather.

```ts
const position = await host.request<{ latitude: number; longitude: number }>(
  'hardware.location.current',
);
const weather = await host.request('hardware.weather.current', {
  latitude: position.latitude,
  longitude: position.longitude,
});
```

Request OS location authorization explicitly through
`permissions.request('hardware.location')`. The compatibility bundle preserves legacy
weather requests without coordinates.

Native pending location and biometric requests belong to an actual session and
operation. Another session's `disposeSession` leaves the request in place.
Late callbacks from canceled or superseded operations cannot complete a new
request. `permission_handler` owns permission requests, replacing the old location
retry on successful authorization.

Android biometric support remains API 28 and later. `BiometricPrompt` supplies the
authentication result. A manual fingerprint enrollment preflight and
`USE_FINGERPRINT` were removed because they could reject devices supporting other
biometric methods. `BiometricPrompt.authenticate` uses `USE_BIOMETRIC`. The OS
callback reports unenrolled, unavailable, canceled, and other results.
See [Android API](https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt).

## Sources and ablation

Source review covered the retained parent, excluding `pocket_host/`.

- `pocketjs_flutter_demo/mini_apps/pocket_plugins.json` declared `permission_handler`,
  while the parent's `pubspec.yaml` lacked a dependency on it.
- `lib/core/real_hardware_bridge.dart` provided previous names, parameters, and
  scenarios for compatibility. Migration excluded simulated authorization success.
- `ios/Runner/AppDelegate.swift` provided the original camera, BLE, sensor, location,
  and biometric implementations.

Kotlin and Swift were extracted from the actual SDK `pocket_hardware` implementation.
The texture grant and revocation, BLE GATT queue, sensor owner token and operation
generation, sampling frequency, and session cleanup fixes were retained.
Shared Dart adaptation moved to `pocket_hardware_core/lib/src/hardware_plugin.dart`.

Removed the shared native `checkPermissions/requestPermission` implementation,
native pending authorization state, authorization callback distribution, and
sensor reads used to infer permission. Actual authorization, device availability,
and resource cancellation checks remain at each operation boundary.

## Validation

Permissions tests use the actual `permission_handler` platform interface. They cover
denied, limited, permanently denied, Android Bluetooth version differences, and
manifest and host admission. JS tests use the existing HostBridge, pinned buildGuest,
and real QuickJS and native probe to verify pointer-driven requests, denial, and
rendered changes. Core and compatibility tests retain stream, quota, sensor timeout,
and cross-session identity regressions. New tests verify selective registration
and isolated channel routing.

- Dart passed seven permissions, four core, 11 compatibility, and 16 Demo hardware
  contract tests. Six independent domain packages passed analysis.
- Two JS permissions and actual QuickJS/native pointer tests passed 49 assertions.
  Strict TypeScript checking passed.
- Ten scaffold, Dio, and Android config regressions passed. Platform declarations
  and compile macros stayed idempotent.
- Five Android packages and Demo Kotlin compiled. One BLE and two sensor native
  tests passed.
- Five independent iOS pods built Simulator Release and two native sensor tests
  passed. Local Xcode rejected the old Flutter pod deployment target 11 during
  lint. Manual verification passed using the project's
  `IPHONEOS_DEPLOYMENT_TARGET=15.0`.

Physical camera and BLE behavior and system permission dialogs require device testing.

### Follow-up ablation

The same sources supported additional changes to the standalone modules. Removed the
iOS location retry and timeout after a grant, manual Android fingerprint preflight,
and unused permissions. Dart continues to use the existing authorization and
application state. Location cleanup shares its completion path. Callback isolation
uses native request identity and trusted sessionId without a separate counter.

- Six core and 11 compatibility regressions and core analysis passed. New cases
  verified weather-only mode without a location dependency and that requests and
  cleanup carry the same trusted session for location and authentication.
- Six scaffold and permission config tests passed 50 assertions. Only
  `USE_BIOMETRIC` is declared for biometrics, and repeated patching is idempotent.
- Android location and biometric Kotlin compiled. iOS Simulator Debug Runner built
  with both modules.
- `hardware_native_test.dart` and `hardware_sensor_regression_test.dart` passed on
  iPhone 18 Pro simulator. The former read real permission_handler status and
  independent channel results. The latter verified two real JS sensor clicks,
  return to Home, and a frame change showing the updated count. The tests did not
  request permissions. Missing simulator hardware still reported unavailability.

Physical-device races in callback isolation and system biometric interaction
remain unverified.
