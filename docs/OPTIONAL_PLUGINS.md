# Built-In and Optional SDK Plugins

A trusted Flutter host compiles and registers plugins. JS manifests can request registered capabilities. Native code installation belongs to the host.

| Package or plugin | Enablement | Current capability |
| --- | --- | --- |
| `PackageInfoPlugin` / `flutter.package_info_plus` | Registered by default in `pocket_sdk` | `plugins.packageInfo`, host app metadata |
| `pocket_hardware` / `flutter.hardware` | Compatibility aggregate, CLI `--hardware` | All hardware capabilities. New consumers can select individual packages below. |
| `pocket_permissions` / `flutter.permission_handler` | Explicitly register `PocketPermissionsPlugin` | Uses Flutter permission_handler for querying and requesting system permissions and opening settings |
| `pocket_camera`, `pocket_bluetooth`, `pocket_sensors`, `pocket_location`, `pocket_biometrics`, `pocket_weather` | Register the corresponding plugin, such as `PocketCameraPlugin` | Only the matching domain. Each native package is independent of the other hardware packages. |
| `pocket_platform` / `flutter.platform` | Add the dependency and register `PocketPlatformPlugin`, or use CLI `--platform-experience` | `platform.systemUi.set`, `platform.haptics.perform` |
| `pocket_platform` / `flutter.links` | Register `PocketDeepLinkPlugin` with a scheme and configure the native scheme, or use CLI `--deep-link-scheme=...` | `platform.links.initial/latest/events` |
| `pocket_dio` / `dart.dio` | Add the dependency and register `PocketDioPlugin`, or use CLI `--dio` | `dio.request`, bounded HTTP requests on a dedicated I/O Worker isolate |
| `pocket_clipboard` / `flutter.clipboard` | Add the dependency and register `PocketClipboardPlugin`, or use CLI `--clipboard`. The host grants `clipboard.read` and `clipboard.write` as needed. | `clipboard.readText/hasText/writeText`, plain text only, 192 KiB cap. See [CLIPBOARD_PLUGIN.md](CLIPBOARD_PLUGIN.md). |
| `pocket_file_picker` / `flutter.files` | Add the dependency and register `PocketFilePickerPlugin` (uses Flutter `file_selector`). The host grants `files.open`. | `files.pickOpen/readChunk/release` opens the system file picker and returns a path-free opaque handle, name, size, and MIME. Reads use chunks of at most 128 KiB. See [FILE_PICKER_PLUGIN.md](FILE_PICKER_PLUGIN.md). |

System runtime, platform proxy, and debug recording use internal plugins. OTA downloads use `http` in `pocket_services`. Worker `net.http` uses its existing Worker I/O channel. Both paths operate independently of Dio.

See [HARDWARE_MODULES.md](HARDWARE_MODULES.md) for hardware packages, permission boundaries, and examples.

## Dio Integration

Dio runs requests, reads response streams, and decodes JSON, text, and bytes on its own persistent I/O Worker isolate. The main isolate retains capability admission, request correlation, and lifecycle. The first request starts the Worker on demand and further requests reuse it. Callers use the same `createPocketDioClient(host).request()` and response shape without enabling a Worker flag.

The I/O Worker is independent of the upstream JS business Worker in `domains.worker` and the web `renderWorker`. For Dio alone, declare `dio.request`, grant `network`, and configure `allowedOrigins`. The Web render Worker remains disabled by default. See [Dio Worker implementation](DIO_WORKER.md).

In the consumer `pubspec.yaml`, add a path dependency on `sdk/packages/pocket_dio`. `pocket_sdk` has no direct dependency on it. For a new project, use `bun pocket.ts init /path/to/app --dio`. The generated origin allowlist starts empty.

```dart
import 'package:pocket_dio/pocket_dio.dart';
import 'package:pocket_sdk/pocket_sdk.dart';

PocketPlugin createDioPlugin(PocketViewController controller) =>
    PocketDioPlugin(allowedOrigins: {'https://api.example.com'});

final config = PocketAppConfig(
  appId: 'dev.example.app',
  allowedPermissions: {'network'},
  pluginFactories: [createDioPlugin],
);
```

Guest `manifest.json`:

```json
{
  "protocolVersion": 1,
  "capabilities": { "requires": [], "optional": ["dio.request"] },
  "permissions": { "optional": ["network"] }
}
```

Use the existing `HostBridge` for application pages.

```ts
import { createPocketDioClient } from '@pocket/ui/dio';

const dio = createPocketDioClient(host);
const response = await dio.request({
  url: 'https://api.example.com/items',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  queryParameters: { page: 1 },
  data: { name: 'Pocket' },
  responseType: 'json', // json | text | bytes
  timeoutMs: 2000,
});
// response: { statusCode, headers, data }
```

Non-2xx statuses still return HTTP responses. Network errors, denied requests, limits, and lifecycle cancellation use the existing bridge errors. Origins match exactly. Redirects are never followed automatically. Backgrounding or disposal cancels in-flight requests, and disposal releases the I/O Worker. Returning to the foreground allows new requests on demand. JS owns retries, application authentication policy, state, and page orchestration.

The host default total timeout is 30 seconds. Guest `timeoutMs` can only shorten it. HostBridge has its own independent frame timeout. For longer requests, configure the consumer bridge deadline accordingly. Both raw response bytes and the encoded return value have limits. The default limit is 256 KiB, and JSON encoding can make byte arrays hit it earlier.

Default `json` mode decodes JSON according to response Content-Type and returns text for other MIME types. Invalid content declared as JSON produces a decoding error. `text` always returns text and `bytes` returns an integer array.

The API covers bounded HTTP. Filesystem paths, multipart file uploads, downloads to disk, and progress streams are outside its scope. Editor Preview reports the capability as unavailable when the native plugin is absent.

Android's main manifest needs `android.permission.INTERNET`, added by the `--dio` scaffold. Declare it explicitly when embedding manually. A sandboxed macOS host requires `com.apple.security.network.client` in the entitlements for the chosen build configuration. iOS and Android cleartext HTTP follow platform transport policy independently of the origin allowlist. Production APIs should use HTTPS.

## Sources, Adaptation, and Ablation

The retained parent excluding `pocket_host/` was inspected before implementation.

- `pocketjs_flutter_demo/pubspec.yaml` and `mini_apps/pocket_plugins.json` had no Dio declaration.
- `mini_apps/pocket_plugins.lock.json`, `pocket_flutter_plugins.d.ts`, and `tools/sync_pocket_plugins.py` informed explicit selection and capability contracts. The implementation uses its own dependency graph and avoids string-scanning estimates of trimming and size.
- Weather HTTP starting at `lib/core/real_hardware_bridge.dart:390` provided a reference for real asynchronous networking and timeouts. Its fixed weather request did not cover general Dio and supplied evidence for an optional I/O adapter. Synthetic success data was excluded.

The adapter uses existing `PocketPlugin`, permission admission, request budgeting, and `HostBridge`. Registration and lifecycle stay on these existing paths. The single `dio.request` API leaves retry and method aliases to the caller. With `--dio` disabled, the scaffold omits the Dio dependency, factory, permission, and capability. Enabling it adds just those integration pieces.

## Verification

- `sdk/packages/pocket_dio` checks real loopback HTTP, response formats, status codes, origin restrictions, redirects, limits, and lifecycle cleanup.
- `sdk/packages/pocket_ui/test/dio.test.ts` checks request correlation, HTTP error status, and missing-plugin propagation through the real HostBridge.
- `sdk/packages/pocket_ui/test/dio_native.test.ts` uses pinned `buildGuest` and actual QuickJS/native probe. A pointer click triggers `dio.request`, and an injected host response verifies Loading → HTTP result/Unavailable frame changes. The injected response covers transport, and Dart loopback tests cover actual network I/O. iOS and Android device testing is outside this evidence.
- `sdk/scripts/tests/dio_scaffold.test.ts` covers default-off behavior and combinations with other optional plugins.
