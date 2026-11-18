# File picker plugin (`pocket_file_picker`)

Optional, general-purpose open-file capability. It is not tied to any one product. `pocket_sdk` does not depend on it; a consumer opts in by
adding a path dependency on `sdk/packages/pocket_file_picker` and registering the plugin. It uses Flutter's `file_selector` package (macOS,
Windows, Linux, Android, iOS, web), which is a dependency of this package only. `scripts/check_architecture.py` lists `pocket_file_picker`
among the optional packages the core SDK must not depend on.

## Capabilities

Plugin id `flutter.files`; all are `request` capabilities and need the single permission `files.open`.

| Capability | Params | Result |
| --- | --- | --- |
| `files.pickOpen` | `{ accept?: string[], multiple?: boolean }` | `{ files: [{ handle, name, size, mime }] }` (`[]` when the user cancels) |
| `files.readChunk` | `{ handle, offset, length }` (`length` 1..131072) | `{ handle, offset, length, size, eof, data }` (`data` is base64 of `length` raw bytes) |
| `files.release` | `{ handle }` | `{ released: boolean }` |

* `accept` entries are bare extensions (`"png"`, no dot, no wildcard, at most 32, 1..16 alphanumerics); they become one `XTypeGroup`. Omitted
  means any file. Invalid entries fail `invalid_params` before the dialog opens.
* A handle is 32 lowercase hex characters from a secure random source. The guest never sees an absolute path: `name` is the platform file
  name with any directory part removed, `mime` comes from the extension (`application/octet-stream` otherwise). Dialog failures report
  `dialog_failed` without the underlying message (it can contain a path).
* Transfers are chunked: at most 128 KiB raw per `readChunk` (174,764 base64 characters, under the 250 KiB descriptor quota and the 256 KiB
  bridge message). Reading at or past the end returns an empty `eof` chunk. `file_changed` is raised when the file's size no longer matches the
  one recorded at pick time; `read_failed` for IO errors.
* Limits: `maxFileBytes` (default 256 MiB, host-configurable 1 byte..1 GiB; larger picks fail `too_large`), at most 32 files per pick, at most 64
  live handles per plugin instance (`too_many_handles`; release or pick again), one open dialog at a time (`busy`), at most four concurrent
  requests. The handle table is the plugin's only state (the fact which file the user chose, owned by the native boundary); it is cleared on
  dispose.

## Permission layers

1. Host scope: the trusted host lists `files.open` in `PocketAppConfig.allowedPermissions`.
2. Guest manifest: the guest declares the capabilities and the permission. A declared capability whose permission was not declared is revoked at
   admission. Child guests do not inherit a parent's grant; each guest's own manifest is negotiated against the host scope.
3. Operating system: the platform dialog is the user's explicit consent for the files. A sandboxed macOS app also needs
   `com.apple.security.files.user-selected.read-only` (the Studio runs unsandboxed). Calls without a grant fail before any dialog opens.

## Host registration and JS use

```dart
import 'package:pocket_file_picker/pocket_file_picker.dart';

final config = PocketAppConfig(
  appId: 'dev.example.app',
  allowedPermissions: {'files.open'},
  pluginFactories: [(_) => PocketFilePickerPlugin()],
);
```

Guest `manifest.json`: capabilities `files.pickOpen`, `files.readChunk`, `files.release` (optional) and permission `files.open`.

```ts
import { createHostBridge } from "@pocket/ui/host";
import { createPocketFilesClient } from "@pocket/ui/files";

const files = createPocketFilesClient(createHostBridge());
const [file] = await files.pickOpen({ accept: ["png", "jpg"] });   // from an explicit user action
if (file) {
  const chunk = await files.readChunk(file.handle, 0);            // base64 data, <= 128 KiB
  await files.release(file.handle);
}
```

The client validates arguments and every answer (handles, names without separators, echoed offsets) and rejects with the host error codes. The
Editor preview does not fake a dialog: an unregistered plugin is `capability_unavailable`. There is no CLI scaffold flag (the plugin needs no
platform patch beyond what `file_selector` registers); the Studio is the first consumer.

## Source-first note

The retained parent `pocketjs_flutter_demo` is not available in this environment, so nothing could be inspected there. Modelled on this
repository: `pocket_clipboard` (descriptor, schemas, permission layout, `PocketPluginManager` admission tests, `ui/src/clipboard.ts` client) and the
Studio provider's chunked-transfer limits (128 KiB, base64, 256 KiB message). No Dart policy was added: which app may open files is the grant
chain; the guest owns sizes, names, progress and retries.

## Validation

* `flutter test` in `packages/pocket_file_picker` (9 tests): `file_selector`'s method channel mocked; handles, name/size/mime, chunk
  reassembly of a 300 KiB file, cancel, multiple, parameter/handle/size validation, bounded handle table, path-free dialog errors, busy,
  `file_changed`, no grant / undeclared capability / undeclared permission, and a child guest that does not inherit the parent's grant.
* `bun test packages/pocket_file_picker/test/files_client.test.ts` (3 tests): request correlation, local validation, malformed answers.
* The Studio host test `studio/test/studio_resources_test.dart` drives the real native runtime, the registered plugin and a real editor service:
  the guest uploads a file through `files.pickOpen`/`readChunk` and the bytes land identical in the project's `assets/`.
* `python3 scripts/check_architecture.py`.

Not verified: the real macOS `NSOpenPanel` (and the other platform dialogs): this environment is Linux and the dialog is a method-channel
stand-in. The `file_selector_macos` registration is in the regenerated `studio/macos/Flutter/GeneratedPluginRegistrant.swift`; it has not been built.
