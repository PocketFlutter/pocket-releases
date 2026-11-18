# Editor project identity and configuration

This guide describes what Studio saves when a project app ID changes. The identity helper is an Editor implementation detail, not an additional public `@pocket/*` API. It keeps the source project and its managed local System packages consistent before the next build.

Here, `appId` is the Pocket guest/package identity. It is separate from the Flutter host's iOS `CFBundleIdentifier` and Android `applicationId`; changing it does not edit native bundle identifiers.

## Source-first behavior and adaptation

Before adding this flow, the retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` was inspected with `pocket_host/` excluded. `mini_apps/app_login/app.json` and `main.js` retain an app ID and hand a saved identity to `Host.navigateTo("app_nav")`; `mini_apps/app_nav/app.json` and `main.js` retain route actions to `app_game_detail`; `mini_apps/app_game_detail/app.json` and `main.js` provide the destination guest. `lib/core/pocketjs_bundle_runner.dart` and `lib/ui/mini_app_host_page.dart` contain the parent Flutter sandbox and route orchestration.

The retained behavior is that app IDs are the keys used for independent guests and navigation. This project keeps that behavior in JS: `platform.openApp()` routes through the existing Pocket System catalog, while Flutter remains the rendering/input host. The Editor updates exact app identity references and the catalog that the existing `buildGuest`/Preview path already reads; it does not introduce a second router or rewrite Flutter business logic.

## What changes when the root app ID changes

On a config save that changes `editor.json.appId`, Studio plans the whole migration from the validated `pocket.system.json` catalog before writing. The root `pocket.json.id` and `editor.json.appId` are written by the Editor server callback as part of the same transaction.

| Project data | Rename behavior |
| --- | --- |
| `pocket.system.json.roles.systemUI` | Changes to the new root app ID. |
| `applications.catalog[].package`, `installation.installedPackages` | Exact IDs for the root and managed local children change. |
| Managed child catalog manifest `id`, child `pocket.json.id` and matching child `editor.json.appId` | Change to the new child ID. |
| JS/TS source string literals and no-substitution template literals | Exact package ID literals and `pocket://app/<id>` URL path IDs change. A pinned TypeScript parser identifies string nodes; comments, JSX text, longer strings, and unrelated prose stay intact. |
| `pocket.resources.json.packages` and `generated/compositor-surfaces.json` | Matching package-keyed entries change, with the registry handles and entry values retained. |
| `pocket.system.json.id` | Remains unchanged; it identifies the System catalog independently from the root app. |
| `editor.json.reusePublishedPackages` and their catalog entries | Remain unchanged; these IDs belong to externally reused published packages. |

A managed child already named `<oldRootId>.<suffix>` keeps that suffix under the new root, for example `acme.host.profile` becomes `studio.host.profile`. If it does not use the old root prefix, Studio derives a stable suffix from the package's final ID segment, then its manifest directory name. IDs longer than 128 characters, duplicate results, external-package collisions, malformed catalogs, ambiguous nested package roots, and unsafe paths are rejected before the write begins.

The migration only changes the identified structured fields and exact source literals. It does not rewrite arbitrary substrings, UI labels, comments, release history, `assets/` files, cache/build output, dependency trees, or unrelated files. Source scanning follows the Editor input boundary: it skips `node_modules` (including a symlink), `.git`, `.pocket-build`, `build`, `builds`, `dist`, `out`, `updates`, `keys`, and `.pocket-ui-backup-<token>` directories; the three existing `vendor/pocket-ui`, `vendor/pocket-looseleaf`, and `vendor/pocket-arc` SDK links are checked for a target and skipped without following them. Other source symlinks and symlinked generated directories are rejected before writes.

All planned files are validated before writing. Writes use sibling temporary files and atomic renames. If a file write or the root-config callback fails, Studio restores the original package files and root configs. The callback is required so the catalog and root project configuration cannot silently diverge.

## Save, build, and consumer boundaries

- The settings panel's **Save configuration** action writes project config independently; it does not save source text. If the source editor is dirty during an app ID change, Studio blocks that config-only save and asks you to save the source first. After a successful identity transaction, the selected source file is reloaded from disk so an older editor buffer cannot undo the migration.
- The new-project UI no longer exposes a `tickHz` field. It stores the internal default `tickHz: 60`; existing project values are preserved, and Build reads the saved value. `buildGuest` accepts 1–120. This is the Guest simulation/build tick rate, not a measured display FPS or device performance guarantee.
- The build number is displayed read-only in the config panel. The first successful build commits build number 1; each later successful build advances by one. Config saves, source saves, refreshes, and failed builds do not advance it. After restart, Studio resumes from the committed artifact; when no artifact history exists but a legacy project config has `build > 1`, the next build advances from that value.
- Studio updates `generated/compositor-surfaces.json` in the JS project so its next local Preview uses the new IDs. For an embedded Flutter consumer, regenerate the consumer's packaged assets with its existing `npm run build:system` flow after changing catalog IDs.
- SDK code cannot safely infer or edit consumer-owned Dart constants, native registries, published package records, or external deployment policy. Update any consumer hard-coded app IDs explicitly and rebuild that consumer. Published/reused package identities remain owned by their publisher.

## Validation

`sdk/editor/test/project_identity.test.ts` passes 5/5 cases for stable child slugs, structured catalog/resource/registry references, exact source-node rewriting, external package/cache/assets preservation, collision preflight, transactional rollback, dependency symlink target preservation, and rejection of an unrelated source symlink before writes. `sdk/editor/test/project_identity_preview.test.ts` passes 1/1 native case: it creates an isolated root/child project, renames it, compiles both with pinned `buildGuest`, starts native Preview, and sends real pointer down/up input to the JS root action; the renamed child renders.

The associated Editor Chromium config test passes 1/1 case: config save does not write dirty source or submit a build, successful app ID save migrates exact source references and refreshes the source view, dirty source blocks a second identity save, the first two successful builds display 1 then 2, and a failed third build remains at 2. `sdk/editor/test/build_number.test.ts` passes 2/2 cases for artifact commit/restart/failure rollback and legacy build history. The native Preview case skips when no local `pocket_probe` is available. These tests use temporary project roots and do not edit `demo/js/editor.json`.

```sh
POCKET_SOURCE_BUILD=1 bun test \
  sdk/editor/test/project_identity.test.ts \
  sdk/editor/test/project_identity_preview.test.ts
```

## Project-local Preview host adapter

Web Studio can opt a project into a machine-local Preview host adapter. Add `"previewHostConfig": true` to the project's existing `editor.json`. Omit the flag or set it to `false` to disable workspace profile discovery. The machine-only profile lives outside the project source at `<studio-workspace>/preview-hosts/<editor-project-id>.json`.

Workspace profiles are supported on POSIX systems where Studio can check ownership and permissions. For the Editor project ID `my-app`, create the private profile directory with mode 0700 and give `my-app.json` mode 0600. The file must be owned by the Studio process user and must be a regular file without symbolic or hard links. Set `projectRoot` to the canonical absolute path of the source directory. Keep the profile and any sensitive development settings out of version control.

```json
{
  "projectId": "my-app",
  "projectRoot": "/absolute/canonical/path/to/my-app",
  "hostConfig": { "apiBaseUrl": "http://127.0.0.1:8787/api/v1" },
  "http": {
    "allowedOrigins": ["http://127.0.0.1:8787"],
    "allowedRoutes": [{ "method": "GET", "path": "/api/v1/health" }]
  }
}
```

An opted-in project's Preview and project mutations, such as saving configuration and starting a build, require a loopback connection from the Studio computer. Project mutations also require loopback when a registered source directory is the same as, contains, or sits within the opted-in source directory. Unrelated projects keep their existing access policy. The per-project Preview status exposes `hostConfig` as `disabled`, `ready`, or `invalid`. With a missing or rejected profile, local Preview runs without the adapter and Studio shows a notice. On profile creation, replacement, or removal, the affected Preview session reconnects without rebuilding the project or restarting Studio. Neighboring projects keep their sessions.

An explicit single-project startup adapter supplied through the Editor service's `previewHostConfigPath` option or `POCKET_EDITOR_PREVIEW_HOST_CONFIG_PATH` takes precedence for its selected project. The explicit adapter continues to use its existing schema. Canonical project-root binding applies to workspace profiles.

The retained parent `pocketjs_flutter_demo`, excluding its archived `pocket_host/`, has no project-scoped Preview adapter declaration. Studio extends its existing adapter config parser, host-request allowlist, and startup option with private workspace resolution and project-scoped session refresh. The adapter continues to serve the existing `funhub.host.config` and `dio.request` capabilities only to the trusted SystemUI. See [Tooling API](TOOLING_API.md#current-editor-http-api).
