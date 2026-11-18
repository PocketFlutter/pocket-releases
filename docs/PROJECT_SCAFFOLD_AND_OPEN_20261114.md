# Project Scaffolding and Opening Projects in the Editor

2026-11-14. The CLI creates Flutter consumer projects, and Studio creates JS/Preview projects. Both use the App/Game templates, pinned `buildGuest`, QJBC/PAK, and the public UI package.

## Usage

### Create a Project

- **Studio.** Click New Project (新建项目), choose App or Game, and provide an ID and name. Leave Save Directory (保存目录) blank to use the existing workspace. An absolute path creates a project in that new directory. Existing directories are rejected to protect user files.
- **Flutter CLI.** In the full SDK, run `bun pocket.ts init /absolute/path/to/app --template=app`. Use `--template=game` for games. This uses existing Flutter generation, plugin options, and resource preparation.

| Generated content | Purpose |
| --- | --- |
| `app.tsx` / `assets/` | JS pages and assets |
| `pocket.json` / `manifest.json` / `editor.json` | Guest build, capability, and Editor configuration |
| `package.json` / `tsconfig.json` / `.gitignore` | Project commands, TS, and generated-file rules |
| `README.md` | Template development and run instructions |
| `flutter/` / `vendor/pocket-ui/` | Host and vendored UI from the full Flutter CLI. Studio projects omit the generated host. |

### Open an Existing Project

1. Click Open Project (打开项目) in the Studio toolbar.
2. Enter the absolute directory containing `pocket.json`, or a Flutter project directory whose business JS is under `js/`.
3. Edit, save, and build in the original directory. The source and configuration stay in place.
4. Projects appear in the same list with the directory in the subtitle and list tooltip. The server restores records on restart, and refreshing the browser in the same workspace restores the previous selection.

External paths can only be opened or created via local Studio loopback requests. The endpoints reuse Host/Origin checks, CSRF and editor credentials, and project path/symlink checks. LAN visitors cannot attach arbitrary local directories. Symlinks are checked at the project root, configuration, and entry point.

The workspace atomically writes history to `opened-projects.json` and keeps up to 64 external project roots. Same-name projects receive stable distinct IDs derived from their source directories. Existing `editor.json` remains intact. Missing or moved paths are skipped with diagnostics, and users can open the new location.

Native consumers are detected only through project-local `flutter/pubspec.yaml` or the parent of `js/` in the selected first-layer Flutter project. The web page cannot submit arbitrary Flutter commands or host paths. Opening a directory does not run installation, builds, or deployment, or request device permissions.

### Project Commands

Run in the generated project root.

```sh
npm start
npm run build
npm run build:web
npm run editor:status
npm run editor:stop
```

Flutter consumers can prepare native libraries with flags such as `npm run build -- --platform=macos`. Ordinary JS/Preview projects build to `build/pocket/`. Web export uses `build/web/`.

Install the matching platform package using the [npm toolchain](NPM_TOOLCHAIN.md). Source developers explicitly set `POCKET_SOURCE_BUILD=1` and install source dependencies. Missing prebuilt tools produce an error. Project commands use the existing Node launcher to select the build entry.

The current working directory supplies the project path, including spaces and single quotes. Projects can move while the SDK remains in place. Scripts reference the absolute SDK path and need that reference updated if the SDK moves.

## Sources and Adaptations

The retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` was unavailable locally. Earlier user authorization covered the current workspace and Codex. See [the upgrade record](FLUTTER_3_50_UPGRADE.md). Native capability is outside this change. The scaffold reuses the current SDK.

| Source | Reuse and adaptation |
| --- | --- |
| `pocket.ts:initProject/buildProject` | Keeps Flutter generation, plugin options, vendored UI, and the bytecode pipeline. Validates identity before creating directories. |
| `editor/server.ts:createProject/projectDirectory/loadCatalogProjectSources` | Reuses templates, file access, and catalog mapping. Adds explicit local opening, persistence, and collision isolation. |
| `scripts/project_templates.ts` / `templates/app` / `templates/game` | Keeps App and Game as the only templates. Showcase is separate. |
| `scripts/editor_service.mjs` / `toolchain.mjs` | Project npm commands forward to existing entry points. Source execution requires an explicit flag. |
| `scripts/project_scaffold.ts` / `project_commands.mjs` | Share support-file generation and cross-platform argv forwarding. Service and compiler implementations stay in the SDK. |
| `scripts/export_web_sdk.ts` | The standalone archive includes the same scaffold support files and excludes Flutter/Dart packages. |

Opening a consumer preserves custom npm scripts, tsconfig, README, and UI. JS retains business UI and state. Dart, FFI, and renderer code were outside the change.

## Verification

11 isolated suites passed 66 tests. Browser Studio used the explicit Chrome channel. Service upgrade tests used canonical `/private/tmp` to avoid macOS `/var` alias differences.

- CLI and Studio App/Game creation, external path creation, overwrite refusal, in-place save, same-name isolation, restart recovery, rejection of invalid paths, symlinks and cross-origin requests, and export support files.
- `project_open_live_probe.ts` used the real local service and Chrome to click New Project, open an existing project, check error feedback, build, then click native QJBC Preview. Text changed `0 → 1` and DrawOps changed.
- After moving the project to a path containing spaces and single quotes, actual `npm run build` generated real QJBC/PAK.
- Existing sources stayed intact. Desktop and 390px viewport checks had no browser exceptions or horizontal overflow. Project listing recovered after restart.
- README prose and image examples used the same actual compiler and pointer acceptance. Links, anchors, and shell syntax were verified independently.

```sh
# Run in the SDK directory with the matching native probe prepared.
POCKET_SOURCE_BUILD=1 npm exec --yes --package=bun@1.4.4 -- \
  bun scripts/test_js.ts editor/test/project_open.test.ts \
  editor/test/project_templates.test.ts scripts/tests/project_templates.test.ts \
  scripts/tests/export_web_sdk.test.ts
POCKET_SOURCE_BUILD=1 POCKET_TEST_BROWSER_CHANNEL=chrome \
  npm exec --yes --package=bun@1.4.4 -- bun editor/test/project_open_live_probe.ts
```

Omit the channel variable to use Playwright's installed Chromium. This machine lacked the required revision, so the run used installed Chrome explicitly. Tests isolated only SDK self-upgrade discovery requests. Application sources, create/open APIs, compiler, native probe, and Preview input were real. iOS, Android, Windows GUI, and device-plugin verification were outside this run.
