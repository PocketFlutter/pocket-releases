# Studio provider (`pocket_studio`)

Optional SDK package for the Pocket-hosted Studio (`studio/`, milestone M1). The contract (frozen capability
table, grant model, scrubbing rules, lifecycle) is in `studio/docs/ARCHITECTURE.md`; this file is the
`AGENTS.md` record: sources reused, necessary changes, validation.

`pocket_sdk` does not depend on `pocket_studio` (`check_architecture.py` lists it among the optional packages),
and nothing under `sdk/` imports `studio/`.

## Source-first record

The retained parent `pocketjs_flutter_demo` is not available in this environment, so no retained implementation
could be inspected. Reused from this repository:

- `pocket_services`: `PocketPlugin`, `PocketPluginDescriptor` (per-capability permissions, schemas, limits),
  `PocketPluginContext.registerRequest/registerStream`, `PocketCapabilityException`, `PocketHost`,
  `PocketStreamBridge` and its 256-item / 256 KiB wire limits; the `pocket_clipboard` plugin as the model for
  the separate read/write grant layout and for the admission tests (`PocketPluginManager.negotiate/invoke`).
- `sdk/editor/server.ts` routes and guards exactly as documented in `EDITOR_FS_AND_BUILD_ROUTES.md` (no service
  change was needed: every capability maps onto an existing route).
- `pocket_dio` was inspected for its IO-worker pattern and deliberately not reused (see ARCHITECTURE.md,
  "Provider design").
- `scripts/tests/studio_preview_service.ts` and `test/studio_preview_ffi_test.dart` for the real-service / real
  native test pattern; `PocketSession`'s host wiring (`PocketHost` + `PocketPluginManager`) for the host test.

## Necessary changes (evidenced gaps)

| Change | Why |
| --- | --- |
| New package `sdk/packages/pocket_studio` | the stateless route map, scrubber, SSE mapping and service lifecycle did not exist (`M0_REPORT.md` C5/C6, 3.4) |
| `PocketAppConfig.rawTextInputEnabled` (field, `copyWith`, `withNativePolicy`, equality, `PocketApp` pass-through) | `PocketView.rawTextInputEnabled` existed (`STUDIO_TEXT_INPUT.md` D) but no consumer could enable it through the SDK config; the Studio host needs it for the M4 editor. Default `false`, additive. Test: `test/pocket_config_test.dart` |
| `check_architecture.py`: `studio/` rules | thin host, no extra Dart in `studio/lib`, no JS source in assets, SDK must not import `studio/`, studio must not import `demo/`, macOS-only |

M5 (publish and inspect) changes, each evidenced by the Studio pages that needed them:

| Change | Why |
| --- | --- |
| `sdk/editor/server.ts` `readArtifact`: `resources.json` joins the artifact allow-list (read-only, same guards) | the pack contents summary needs the build's resource snapshot (key, kind, bytes, placement per resource); the `.pak` itself is binary and metadata-only. Test: `editor/test/editor_server.test.ts` |
| Provider: `resources.json` in `pocketStudioArtifactNames`; oversized pretty-printed JSON artifacts are re-encoded compactly before the 128 KiB cut (`bytes` stays the real size) | the snapshot of a larger project would otherwise be truncated and unparseable |
| Provider: `studio.publish.publish` drops the signed envelope's base64 `payload` (keeps `keyId`, `signature`, `payloadBase64Bytes`) | the payload lists every blob and can exceed the 256 KiB result quota for large projects, which would report a failure for a publish that already happened; the signed bytes are served at `manifestUrl` |
| Provider scrubber rule 5: key-like JSON fields (`privateKey`, `private_key`, `privateKeyPem`, `privateKeyBase64`, `secretKey`, `securityToken`, `signingKey`, `signingSeed`, `seed`) are dropped and PEM/OpenSSH private-key blocks in any string become `<redacted-key>` | keys stay in the service (`keys/editor-dev-key.json` is never served) and COS secrets stay in local/workspace config; this is a provider-side backstop. Tests: `studio_plugin_test.dart` (all publish & COS routes, errors, artifacts), `real_service_test.dart` (real publish, no field of the real key file in any result) |
| Verbatim file payloads: `studio.fs.read` `content` and `studio.fs.readChunk` `data` (base64) skip every scrub rule, including PEM redaction (`StudioCall.verbatimKeys`, `studio_client.dart` `_finish`); all other fields, errors and stream events are still scrubbed | rewriting file content corrupts source (`#!/usr/bin/env bun`, `'/tmp/x'`) and breaks chunk checksums. The editor service blocks its own workspace/keys from the fs routes, so verbatim content cannot expose workspace files. Tests: `studio_plugin_test.dart`, `real_service_test.dart` round trip |
| Extra project roots (`extraProjectRoots`) and dynamically opened local roots (`studio.project.openLocal`) are registered with the scrubber as `<project>`; `studio.build.start` unwraps the service's `{status}` to the flat status; an SSE event over 256 KiB becomes `{type:"gap",dropped:1}`; the preview child's store namespace is `studio-preview-<sha256(publicKey)[0..12]>` (`PocketStudioConfig.previewNamespace`) | scrub completeness, frozen contract, no silent loss, per-key anti-downgrade floor |

Otherwise no service change: plan, publish, history, offline, artifacts.list/inspect all map onto existing routes.

## What the provider does (and nothing more)

`PocketStudioPlugin` (`lib/src/studio_plugin.dart`) registers 53 capabilities (37 from M1, 3 from M8, 5 from M9, and 8 parity routes) from the fixed table in
`studio_routes.dart`: it validates ids and paths (`studio_paths.dart`), builds the URL with `Uri.pathSegments`
(per-segment encoding), forwards over a loopback-only `dart:io` `HttpClient` (`studio_client.dart`), injects
`x-pocket-csrf` from `/health` on writes (one refresh on 403), scrubs every result, error and stream event
(`studio_scrub.dart`), and maps SSE routes to capability streams with a bounded, batching, gap-marking queue.
`PocketStudioService` (`studio_service.dart`) attaches to or starts `bun <sdk>/pocket.ts editor`, polls `/health`
to a deadline and stops its own child on exit. `PocketStudioConfig` carries the trusted host configuration.

Two result projections exist because the framework caps one response at 256 KiB: project status drops `logs`
(`project.list/open`), and `build.status` / `logs.tail` keep the newest ~100 KiB of log lines. Everything else is
passed through unchanged after scrubbing, or fails with `too_large` rather than truncating.

## Validation

All run on Linux x86_64 and Apple Silicon macOS (2026-11-17) with the real native library and the real editor service.

```sh
export PATH=/opt/flutter/bin:$PATH
cd sdk/packages/pocket_studio
flutter analyze
POCKET_REQUIRE_REAL=1 flutter test   # 94/94 fake HTTP service tests + real editor service tests
cd ../../.. && python3 sdk/scripts/check_architecture.py
cd sdk && flutter test test/pocket_config_test.dart
cd ../studio/js && POCKET_SOURCE_BUILD=1 TMPDIR=/tmp bash scripts/test_guest.sh
cd .. && POCKET_REQUIRE_REAL=1 POCKET_NATIVE_LIBRARY=$PWD/../sdk/native/target/debug/libpocket_flutter.so flutter test
```

Verified on Apple Silicon macOS (2026-11-17):
- `bash sdk/scripts/build_native.sh macos` -> `libpocket_flutter.a`
- `cd studio && flutter build macos --debug` -> `pocket_studio_app.app` launched via Impeller MetalSDF, started the live editor service via `PocketStudioService` (`POCKET_STUDIO_BUN`), passed `/health` (`service: pocket-editor`), and stayed running cleanly.
- Automated suites: `studio/test` (10/10), `studio/js` `test_guest.sh` (129 unit + 70 probe), `pocket_studio` (94/94 with `POCKET_REQUIRE_REAL=1`), `pocket_clipboard` (13/13), `pocket_file_picker` (9/9).
- Interactive live macOS GUI/IME candidate-window checks, live COS cloud upload with real credentials, and Apple Developer ID signing/notarisation remain manual/distribution steps.

`real_service_test.dart` starts the service through `PocketStudioService` (`bun pocket.ts editor <demo JS project>
--port=<free> --workspace=<tmp>`) and calls the plugin: health scrubbing, project list/open/openLocal, tree, read, stat,
chunked read with sha256, project create (including `pickParentDirectory` & `ecosystemModules`), write, mkdir, rename, 300 KB chunked upload with hash verification,
delete, ecosystem catalog/get/set, COS get/set/check/publish & secret scrubbing, error mapping, and a real `fs.watch` change event. A skip is not evidence: `POCKET_REQUIRE_REAL=1` turns any missing dependency into a failure.

## Known limits

- The preview child's public key is read from the trusted workspace after the service's first preview publish;
  catalog refresh and bootstrap metadata are M3.
- Streams reopen on `plugin_stream_quota` (10000 items) or server-side slow-consumer drops; the guest owns that.
- Artifacts: binary artifacts return metadata only; text artifacts are cut at 128 KiB (`truncated: true`).
- Version history has no trial/promoted/rolled-back state: the service journal records publications and slot pointers only; those states live in each device's update coordinator.
- Interactive live macOS GUI/IME candidate-window checks, live COS cloud upload with real credentials, and Apple Developer ID signing/notarisation remain manual/distribution steps (`studio/docs/RELEASE_CHECKLIST.md`).

## M6: text cache, trusted extra roots, update key, self-update slot

Source-first note: the retained parent `pocketjs_flutter_demo` is not available in this environment (as in the earlier Studio
records), so nothing was inspected there. Everything reuses current SDK code: `PocketAppConfig` fields added the way
`rawTextInputEnabled` was, the catalog-source map of `editor/server.ts`, `editorUpdateTrust`, `PocketUpdateConfig`,
`PocketUpdateCoordinator`, `PocketPackageStore`, the session health trial/rollback and `createPocketUpdateClient`
(`SYSTEM_UI_SELF_REFRESH.md`, `PACKAGE_UPDATE_MODES.md`, `RELEASE_TRUST_POLICY.md`).

* `PocketAppConfig.textLayoutCacheCapacity` (default 256, copyWith/withNativePolicy/equality/hashCode) -> `PocketView`.
  Tests: `test/pocket_config_test.dart`, `test/pocket_font_family_fallback_test.dart` (widget level).
* Service: `StartEditorOptions.extraProjectRoots` / `--extra-project-root=DIR` (repeatable; also accepted by
  `pocket.ts editor`) lists additional trusted external projects; `provisionUpdateKey` / `--provision-update-key` creates the
  update signing key at startup (idempotent, never rotated; keyId `editor-<primary project id>`). Guarded exactly like the
  primary root; no HTTP route can add roots. Tests: `editor/test/editor_extra_roots.test.ts`.
* Provider config: `PocketStudioConfig.extraProjectRoots`, `updateChannel` (`test` default), `selfUpdateUrl`, `readUpdateKey()`
  (public half only), `studioAppId`; the lifecycle helper passes `--provision-update-key` and the extra roots. Tests:
  `test/studio_config_test.dart`, `test/real_service_test.dart`.
* Launcher: `bun sdk/pocket.ts editor [<project>]` (`scripts/pocket_studio_launcher.ts`, tests in `scripts/tests`) now defaults to Pocket Studio on macOS when `studio/` is present in the repo checkout (auto-detecting `<repoRoot>/.fvm/flutter_sdk/bin/flutter`); `--web`, `POCKET_EDITOR_UI=web`, service-only flags, standalone Web SDK exports without `studio/`, and non-macOS platforms use the web Studio.

## M8: diagnostics export and SDK upgrade capabilities

Source-first: `sdk/editor/diagnostics.ts` (`GET/POST /api/projects/:id/diagnostics`), `scripts/studio_upgrade.mjs` and
`editor/server.ts` (`/api/studio/upgrade[/check|/apply]`) already provide everything and `sdk/docs/STUDIO_DIAGNOSTICS.md`,
`STUDIO_UPGRADE.md` describe them; `server.ts` is unchanged. The provider adds the reserved names (contract rows in
`studio/docs/ARCHITECTURE.md`), no new permission names:

| Capability | Perm | Provider behavior |
| --- | --- | --- |
| `studio.logs.diagnostics` `{project, kind?}` | `studio.read` | GET the bundle (read limit 16 MiB instead of 2 MiB), scrub it like every result (absolute paths, token, key fields and PEM blocks), keep whole records newest first up to ~160 KiB (`keptRecords`, `omitted`, `truncated`), add the derived `exportId` and the service `downloadUrl` (`?download=1`). `kind` other than `log`/`crash` is `invalid_params`. Only the export is exposed; the service's POST (browser report) is not |
| `studio.service.upgrade.check` `{}` | `studio.write` | POST with the fixed body `{autoApply:false}` (the service would otherwise download and apply in a standalone install); params are ignored |
| `studio.service.upgrade.apply` `{}` | `studio.deploy` | POST; HTTP 409 (source checkout, busy service) maps to `conflict` with the service text |

Tests: `test/studio_plugin_test.dart` (routing, fixed body, 409, scrubbing and bounds, permission admission),
`test/real_service_test.dart` (real service: settings set/get and validation errors, diagnostics export and its download URL, upgrade
status/check against a local loopback releases feed through `POCKET_STUDIO_UPGRADE_RELEASES_URL` + `POCKET_STUDIO_UPGRADE_ALLOW_LOOPBACK`, and the
409 apply of the source checkout). Not run: an actual standalone replace and restart (needs a standalone SDK install and a GitHub release).

## M9: asset upload, image previews and the resource placement editor

Source-first: the retained parent `pocketjs_flutter_demo` (excluding `pocket_host/`) is not available in this environment, so nothing could be
inspected there. Reused from this repository: the web Studio's resource panel (`editor/client/index.html` ids
`resource-package-picker`, `resource-list`, `save-resources`; `editor/client/editor.js` `fetchResources`, `saveResources`, the 409 handling) as
the behaviour reference; the existing `GET/PUT /api/projects/:id/resources` and `GET …/resources/preview` routes; the chunked
`uploads` session mechanism (`EDITOR_FS_AND_BUILD_ROUTES.md`) with the asset policy of the multipart `POST …/assets`
(`allowAssets`, flat safe name, 32 MiB); the host's own image decoder pattern (`PocketSystemHost._decodePocketImageEntry`, the IMG entry
layout of `platform.images.read`) and the guest's `PocketStoredImage` component (`DYNAMIC_IMAGE_RESOURCES.md`); the `pocket_clipboard` plugin as
the model for the new `pocket_file_picker` package (`FILE_PICKER_PLUGIN.md`).

| Change | Why |
| --- | --- |
| Service `POST …/uploads` accepts `{target:"asset", name, totalBytes, sha256}`; the commit of an asset session writes below `assets/` with `allowAssets`, skips the UTF-8/NUL check, bumps the revision (`asset saved: <name>`) and answers `{path, bytes, sha256, revision, assets}`. `path` together with `target:"asset"`, unknown targets, unsafe names and > 32 MiB are refused (400/413). Without `target` nothing changed (`assets/…` and binary names stay refused). The multipart route is unchanged and now shares the name pattern | a whole 32 MiB file cannot cross one 256 KiB host message; the chunked session already had hashing, ordering, idle expiry, per-project and global caps and the buffered-bytes budget. Tests: `editor/test/editor_asset_routes.test.ts` |
| Service `GET …/assets/<name>` returns the raw bytes (read guards, `allowAssets`, symlinks refused, <= 32 MiB, `nosniff`, sandbox CSP, `no-store`) | the host-side image decoder needs the bytes of an asset that is not in a build yet; the chunk route refuses `assets/` on purpose. Tests: same file |
| Provider `studio.assets.upload.begin` (write), `studio.assets.preview` (read), `studio.project.resources.get/set/preview` | the reserved resource names plus the asset upload; they reuse the five existing permission names |
| Provider `studio_image.dart`: `dart:ui` `ImageDescriptor` -> aspect-fit to <= 128 px -> straight RGBA -> raw IMG entry (`Uint8List`) | the guest has no PNG/JPEG decoder; the entry is the layout `PocketStoredImage` uploads with `uploadImgEntry`. 65,544 bytes at most, so it fits the 256 KiB quota (a 256 px envelope would not). SVG/non-images/corrupt files fail with `unsupported_format`/`not_an_image`/`decode_failed` |
| Provider `resources.get/set`: the service's relative `previewUrl` becomes `preview: true` | a relative route is useless to a guest that has no HTTP; the thumbnail is read with `studio.project.resources.preview` |
| `PocketStudioConfig.hostPermissions` | the Studio host's grant set lives in the package (permission names only), so `studio/lib/main.dart` stays <= 100 lines |

Validation: `test/studio_assets_resources_test.dart` (fake HTTP service: routes, validation, decode of an engine-made PNG, scaling, errors, quota
through `PocketPluginManager`), `test/real_service_test.dart` ("assets: chunked binary upload…": real upload of a binary asset, preview
decode, build, resource inventory, placement save and a real 409), `editor/test/editor_asset_routes.test.ts`, and the guest/host tests
listed in `studio/docs/ARCHITECTURE.md`.

## Parity additions: openLocal, on-demand ecosystem modules, Tencent Cloud COS, and SSE `EditorState` identity fix

Source-first: reused the existing web Studio routes in `sdk/editor/server.ts` (`POST /api/projects/pick-directory`, `POST /api/projects/open`, `GET /api/ecosystem/modules`, `GET/POST /api/projects/:id/ecosystem`, `GET/PUT /api/projects/:id/cos`, `POST /api/projects/:id/cos/check`, `POST /api/projects/:id/cos/publish`) and `sdk/editor/client/editor.js`.

| Capability / Change | Perm | Provider / Service behavior |
| --- | --- | --- |
| `studio.project.openLocal` `{}` | `studio.write` | `studio_plugin.dart` calls internal `POST /api/projects/pick-directory` (host OS folder picker) and, if not cancelled, forwards the chosen directory internally to `POST /api/projects/open`, registers the new root with `StudioPathScrubber` as `<project>`, and returns `{cancelled:true}` or the scrubbed `Project` (logs dropped). Host filesystem paths never reach the guest |
| `studio.project.create` (`pickParentDirectory`, `ecosystemModules`) | `studio.write` | When `pickParentDirectory: true`, `studio_plugin.dart` first calls internal `POST /api/projects/pick-directory` (returning `{cancelled:true}` if cancelled) and injects `directory` into `POST /api/projects` without exposing the host path to the guest; `ecosystemModules` (`string[]`) is validated and forwarded |
| `studio.ecosystem.catalog` `{}` | `studio.read` | `GET /api/ecosystem/modules` -> `{modules, profiles}` |
| `studio.ecosystem.get` `{project}` | `studio.read` | `GET /api/projects/:project/ecosystem` -> enabled ecosystem modules |
| `studio.ecosystem.set` `{project, modules?\|add?}` | `studio.write` | `POST /api/projects/:project/ecosystem` -> updated ecosystem modules |
| `studio.cos.get` `{project}` | `studio.read` | `GET /api/projects/:project/cos` -> COS configuration + redacted local/workspace credential inspection |
| `studio.cos.set` `{project, enabled?, syncOnPublish?, bucket?, region?, keyPrefix?, publicBaseUrl?, credentials?}` | `studio.write` | `PUT /api/projects/:project/cos`; guest clears credential input fields immediately after save, and `secretKey` / `securityToken` are scrubbed on outbound/returned payloads (`StudioPathScrubber`) |
| `studio.cos.check` `{project, bucket?, region?, keyPrefix?, publicBaseUrl?}` | `studio.write` | `POST /api/projects/:project/cos/check` with a 60 s provider timeout |
| `studio.cos.publish` `{project, channel?}` | `studio.publish` | `POST /api/projects/:project/cos/publish` with a 130 s provider timeout; `studio.publish.publish` also preserves `cosPublish` and `cosError` when `syncOnPublish` is enabled |
| `sdk/editor/server.ts` SSE `EditorState` in-place identity preservation | n/a | When `loadState` reloads project state from disk (e.g. across config/ecosystem/COS writes or external refreshes), `server.ts` mutates the existing in-memory `EditorState` object in place instead of replacing its reference, so active SSE subscriptions (`build/events`, `watch`) attached to that `EditorState` instance continue receiving events without dropping |

Validation: `sdk/packages/pocket_studio/test/studio_plugin_test.dart` and `real_service_test.dart` (94/94 with `POCKET_REQUIRE_REAL=1`), `studio/js` `scripts/test_guest.sh` (129 unit + 70 probe), `studio/test` (10/10).
