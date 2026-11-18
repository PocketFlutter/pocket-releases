# Pocket CLI and toolchain reference

This reference covers repository npm scripts, `pocket.ts`, the Studio service, and release helpers. Definitions come from the root and SDK `package.json` files, script parsers and usage, and toolchain docs. Internal tests, benchmarks, and generated outputs are outside the consumer API.

## Entry points and prerequisites

Install standalone Web SDK and Studio with the [one-click installer](INSTALL_STUDIO.md). `node install_studio.mjs` accepts `--version=MAJOR.MINOR.PATCH`, `--dir=PATH`, `--project-root=PATH`, `--no-start`, and `--help`. By default it picks the latest stable platform release and installs to `~/.pocket/studio`. It requires Node.js ≥22.22.2 and npm. Git, Flutter, Python, and Rust are unnecessary. Existing managed installs are checked and launched. Their Studio updater handles later upgrades.

| Entry point | Use | Requirements |
| --- | --- | --- |
| Repository root `npm run ...` | Install/check tools, start Studio, build Guest and Web, and package tools. | Node.js **22.22.2+** and npm. Guest builds use npm-managed Bun and prebuilt tools for the current OS and CPU. |
| `npm --prefix sdk run ...` | Runs the SDK scripts from `sdk/`. | Same as above. |
| `bun sdk/pocket.ts ...` | Initializes projects, builds native hosts, generates plugin types, and runs foreground Editor. | Bun and a complete SDK checkout. Consumers normally use SDK npm scripts and project `npm run build`. |
| `node sdk/scripts/editor_service.mjs ...` | Manages background Studio start/restart/stop/status. | Node.js and installed SDK toolchain dependencies. Fixed port 8791. |

`npm run setup` uses Node and npm to install dependencies and the matching platform prebuilt tools. It verifies tool version, QuickJS ABI, and per-file SHA-256 and explicitly fails on missing or mismatched tools. Source release commands require Python 3, `patch`, Rust/Cargo **1.93+**, and local C/C++/LLVM tools. Run `npm run doctor` for the current checkout's actual package and validation status. See [NPM_TOOLCHAIN.md](NPM_TOOLCHAIN.md) and [PROVENANCE.md](PROVENANCE.md).

## Root npm scripts

The root [package.json](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/package.json) forwards common commands.

| Command | Behavior and output |
| --- | --- |
| `npm run setup` | Installs Node/npm dependencies, managed Bun, and prebuilt SDK tools for the current platform. |
| `npm start` | Starts or resumes Studio with `demo/js` and Flutter root `demo` by default. URL `http://127.0.0.1:8791`. |
| `npm restart` / `npm stop` / `npm run status` | Restarts, stops, or checks the Studio service. |
| `npm run bootstrap` | Maintains source checkout bootstrap. Normal installation uses setup. |
| `npm run doctor` / `npm run build:probe` | Checks prebuilt tools and probe package. No local Rust compilation. |
| `npm run build:guest -- --project-root=DIR --outdir=DIR` | Runs pinned buildGuest and produces QuickJS bytecode and PAK. |
| `npm run build:web -- --project-root=DIR --outdir=DIR` | Builds browser runtime outputs. See flags below. |
| `npm run setup:source` / `npm run bootstrap:source` / `npm run package:tools` | Tool release workflow. |

## SDK npm scripts

See [sdk/package.json](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/package.json) for the exact definitions.

| Area | `npm run` command | Behavior |
| --- | --- | --- |
| Project | `init -- DIRECTORY [options]`, `build -- DIRECTORY [options]` | Delegates to `pocket.ts init/build`. See [project templates](PROJECT_TEMPLATES.md). |
| JS compiler and targets | `build:guest -- [guest flags]`, `build:web -- [web flags]`, `export:web-sdk -- [export flags]`, `preview:wechat -- [target flags]` | Uses pinned Guest and QuickJS. See [Web SDK](WEB_SDK_EXPORT.md) and [WeChat host](WECHAT_HOST_IMPLEMENTATION.md) for target boundaries. |
| Studio | `editor`, `editor:start`, `editor:restart`, `editor:stop`, `editor:status` | Calls Node service start/restart/stop/status. Use `bun pocket.ts editor DIRECTORY [options]` for foreground Editor. See [Studio](EDITOR_STUDIO.md). |
| Toolchain | `setup`, `bootstrap`, `doctor`, `build:probe`, `setup:source`, `bootstrap:source`, `build:probe:source`, `build:engine:source`, `package:tools` | Prebuilt installation and validation and source release tools. See [NPM_TOOLCHAIN.md](NPM_TOOLCHAIN.md). |
| Other CLI | `cos -- [cos args]`, `official-demos -- [demo args]` | COS publishing and official sample collection and builds. COS accepts credentials through local config. |
| Architecture | `check:architecture` | Checks SDK and Showcase boundaries. |
| Test entry points | `test`, `test:demand`, `test:packages`, `test:editor`, `test:editor:live` | See manifest commands. Test results do not define the public contract. |

Run `build`, `init`, and `export:web-sdk` at the SDK root. Generated projects have their own `npm run build` and `npm run build:web`. See [generated directories and commands](PROJECT_SCAFFOLD_AND_OPEN_20261114.md).

## `pocket.ts` project CLI

See [pocket.ts usage and validation](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/pocket.ts#L1095). Missing or invalid arguments print usage and exit with an error. Use `--name=value`.

### `init <directory>`

```sh
npm run init -- /absolute/path/to/app --sdk-root="$PWD" --template=app
```

| Option | Default and behavior |
| --- | --- |
| `--template=app\|game` | Defaults to `app`. Other values fail. |
| `--sdk-root=DIR` | SDK root. The tool can resolve a default from its own path. |
| `--app-id=ID`, `--name=NAME`, `--version=VERSION` | Set identity, display name, and initial version. |
| `--hardware` | Adds the combined hardware provider and explicit host registration. |
| `--camera`, `--bluetooth`, `--sensors`, `--location`, `--biometrics`, `--weather` | Select individual hardware modules. Require consumer permissions, native config, and actual providers. |
| `--permissions=POLICY_KEYS` | Restricts or declares permission policy keys. OS grants remain separate. |
| `--dio` | Adds optional `pocket_dio`. Requires a host origin allowlist. |
| `--platform-experience` | Adds system bar and haptic provider. |
| `--deep-link-scheme=SCHEME` | Generates an explicit custom URL scheme. Universal Links require separate integration. |
| `--surfaces=MODULES` | Adds selected external ecosystem surfaces. |

Choose an initializable destination. The scaffold creates a JS app, Pocket config and manifest, Flutter host, dependencies, and platform config according to selected modules. `pocket.json`, `manifest.json`, and host declarations are authoritative. See [SDK integration](SDK_INTEGRATION.md) and [templates](PROJECT_TEMPLATES.md).

### `surfaces [directory]`

```sh
npm --prefix sdk run init -- /path/to/app --sdk-root=/path/to/pocket/sdk
bun sdk/pocket.ts surfaces /path/to/app --add=MODULE_A,MODULE_B
bun sdk/pocket.ts surfaces /path/to/app --set=MODULE_A
bun sdk/pocket.ts surfaces --list
```

Use `--add=MODULES` to append or `--set=MODULES` to replace the selection. They are mutually exclusive. `--list` prints available/enabled modules and profiles without editing. Module names and profiles come from [ecosystem_scaffold.ts](../scripts/ecosystem_scaffold.ts). Unknown modules fail.

### `build <directory>`

```sh
npm run build -- /path/to/app --sdk-root=/path/to/pocket/sdk --platform=ios-sim
```

| Option | Behavior |
| --- | --- |
| `--sdk-root=DIR` | Source SDK root. |
| `--out=DIR` | Build output directory. |
| `--platform=ios-sim\|ios\|macos\|android` | Accepts those four values. See release and configuration docs for native requirements. |

Build uses the pinned Guest and QuickJS bytecode compilers. Invalid QJBC, PAK, or manifest fails.

### `types <descriptor.json> --out=plugin-types.ts`

```sh
bun sdk/pocket.ts types plugins.json --out=plugin-types.ts
```

Reads actual `PocketPluginDescriptor` and host capability descriptors and generates TypeScript client types for registered capabilities only. Legacy capability types without schemas remain `unknown`. Input size is limited to 256 KiB. Install native plugins separately. See the [plugin type contract](PLUGIN_TYPES.md) and [plugin_types.ts](../scripts/plugin_types.ts#L598).

### `editor [--pocket|--web] [<directory>]`

```sh
bun sdk/pocket.ts editor /path/to/app --port=8795 --workspace=/path/to/workspace
bun sdk/pocket.ts editor --web /path/to/app --port=8791 --workspace=/path/to/workspace
```

On macOS with `studio/` (`../studio/pubspec.yaml`), defaults to desktop Pocket Studio via `flutter run -d macos` or `<repoRoot>/.fvm/flutter_sdk/bin/flutter`, port `8795`, and current directory when omitted. Selects Web Studio or the local service for `--web`, `POCKET_EDITOR_UI=web`, a standalone Web SDK without `studio/`, non-macOS, or service-only flags `--flutter-root`, `--update-host`, `--update-port`, `--update-host-version`, `--extra-project-root`, and `--provision-update-key`.

| Option or environment | Behavior |
| --- | --- |
| `--pocket` / `--web` | Selects desktop Pocket Studio or Web Studio/service. Mutually exclusive. |
| `POCKET_EDITOR_UI=pocket\|web` | Sets default mode. |
| `--port=N` | Desktop defaults to `8795`. Web and `editor_service.mjs` daemon default to fixed `8791`. |
| `--workspace=DIR` | Workspace root. |
| `--flutter-root=DIR` | Consumer Flutter root, Web/service only. |
| `--update-host=LAN_IP`, `--update-port=N`, `--update-host-version=VERSION` | LAN device update and preview broadcast address, port, and host version, Web/service only. |
| `--extra-project-root=DIR` | Adds an allowed root. Repeatable, Web/service only. |
| `--provision-update-key` | Generates and configures a local development update signing key, Web/service only. |

This CLI runs foreground Editor. `npm start` uses the `editor_service.mjs` manager for daemon, state, logs, and port ownership on 8791. See [EDITOR_STUDIO.md](EDITOR_STUDIO.md), [STUDIO_PROVIDER.md](STUDIO_PROVIDER.md), and [Editor project identity and configuration](EDITOR_PROJECT_CONFIGURATION.md).

## Guest and Web build options and outputs

### `build:guest`

```sh
npm run build:guest -- --project-root=/path/to/project --outdir=/path/to/build
```

Required: `--project-root=DIR` and `--outdir=DIR`. Optional: `--entry=FILE`, `--tick-hz=N`, `--density=1..4`, `--bake-fonts`/`--no-bake-fonts`, `--copy-assets-to=DIR`, and `--keep-source=FILE`. The root includes project config, manifest, and entry. The pinned platform tools supply QuickJS and PAK compilers. Standard outputs include `app.qjbc`, `app.bytecode.json`, `app.pak`, and `guest-manifest.json`. Application Workers add Worker QJBC, metadata, and admission descriptor. Flutter SDK is unnecessary.

### `build:web`

```sh
npm run build:web -- --project-root=/path/to/project --outdir=/path/to/web
```

Required: `--project-root` and `--outdir`. Optional: `--entry`, `--tick-hz`, `--density`, `--engine`, `--runtime`, `--live2d-core`, repeatable `--worker-http-origin=https://origin.example`, and `--render-worker`/`--no-render-worker`. Rendering defaults to the main thread. Render Worker requires a packaged Worker asset and browser `OffscreenCanvas` and CSP support. Live2D projects require a licensed local Cubism Core file via `--live2d-core` or `POCKET_CUBISM_WEB_CORE`. Outputs include `engine/pocketjs.wasm`, browser runtime, QJBC, PAK, config, types, and build metadata. See [Web SDK export](WEB_SDK_EXPORT.md).

### Other build and release scripts

| Command | Behavior |
| --- | --- |
| `export:web-sdk` | Exports a standalone Web SDK source tree per [WEB_SDK_EXPORT.md](WEB_SDK_EXPORT.md). Optional publishing is separate from Release upload. |
| `preview:wechat` | Uses the retained WeChat host/preview pipeline. See [WeChat host](WECHAT_HOST_IMPLEMENTATION.md). |
| `build:probe` | Verifies installed prebuilt `pocket_probe`. |
| `build:probe:source` | Builds native preview probe from source and requires the publisher toolchain. |
| `build:engine:source` | Builds the Web engine from pinned native source. Ordinary development uses setup. |
| `package:tools` | Packages verified native and compiler tools and generates checksums. |
| `official-demos` | Compiles and benchmarks pinned samples. See [official_demos.ts](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/scripts/official_demos.ts#L142) for flags. |

## Publisher update package CLI

Run `scripts/package_update.ts` with SDK-managed Bun. It has no same-name npm script. See [package_update.ts usage](../scripts/package_update.ts#L2771).

```sh
bun scripts/package_update.ts package --app-id ID --version VERSION --build N \
  --js app.js --pak app.pak --out DIR --key-file /secure/path/private-key.pem
bun scripts/package_update.ts patch --base-dir DIR --out DIR \
  --version VERSION --build N --key-file /secure/path/private-key.pem
bun scripts/package_update.ts generate-dev-key --out /secure/path/key.pem
```

`package` requires `--app-id`, `--version`, `--build`, `--pak`, and `--key-file`. Select one of `--js` and `--bytecode`, and one of `--out` and `--deploy-root`. `--deploy-root` also needs `--host-version` and accepts `--route-version`. For QJBC use matching `--entry-format quickjs-bytecode`, `--bytecode`, and `--runtime-abi`. `patch` requires `--base-dir`, version, build, signing key, and JS or bytecode entry. It supports `--pak-entry KEY=FILE`, `--asset NAME=FILE`, and `--remove-asset NAME`. See [AI app development](AI_APP_DEVELOPMENT.md), [package update modes](PACKAGE_UPDATE_MODES.md), and [release trust policy](RELEASE_TRUST_POLICY.md).

Provide private keys through a secure local file. Keep keys, COS secrets, API tokens, and actual CSRF values out of manifests, examples, and docs. `generate-dev-key` refuses to overwrite an existing key unless given `--force`.

## COS CLI

`npm run cos -- [inspect|check|publish] [options]` defaults to `inspect`. See [packages/pocket_cos/src/cli.ts](../packages/pocket_cos/src/cli.ts).

| Command | Options and result |
| --- | --- |
| `inspect [--workspace-keys-dir DIR] [--json]` | Shows redacted local COS configuration availability and bucket discovery. |
| `check --bucket BUCKET --region REGION [--prefix PREFIX] [--endpoint URL] [--public-base-url URL]` | Checks target access and reports status. Bucket and region can come from local config. |
| `publish (--deploy-root DIR \| --dir DIR) [target options] [--key-file FILE \| --public-key-file FILE] [--dry-run]` | Uploads a verified SDK release/package or Studio version. Supply one directory form. |

Target options also include `--bucket`, `--region`, `--prefix`, `--endpoint`, and `--public-base-url`. Tests can opt into `--allow-insecure-http`. `--json` and `--dry-run` are booleans. Credentials resolve from secure local config. See [COS publishing](COS_PUBLISH.md).

## Current Editor HTTP API

Studio routes are defined in [editor/server.ts](../editor/server.ts#L4285) and Preview transport in [editor/preview.ts](../editor/preview.ts#L5727). These local interfaces serve Studio UI. Consumers normally use CLI or UI, and cross-version HTTP compatibility is outside the public app API.

| HTTP | Current use |
| --- | --- |
| `GET /health` | Local health and runtime fields. Keep response CSRF values private. |
| `POST /api/projects/pick-directory` | Loopback-only macOS/Windows folder picker. Returns `{path: string \| null}` with null on cancel, times out after 120 seconds, and allows one picker at a time. Use localhost on the Studio machine. |
| `GET /api/projects`, `POST /api/projects`, `POST /api/projects/open` | List, create, and open local projects. External absolute paths require a loopback peer. |
| `GET /api/preview/device`, `GET /api/preview/profiles`, `GET /api/ecosystem/modules` | Device presets, profiles, and ecosystem registries. |
| `POST /api/projects/:id/build` or `/compile` | Compiles the project. Read status, logs, and files through `/status`, `/logs`, and `/artifacts/*`. |
| `GET /api/projects/:id/preview/status`, `snapshot`, `stream`. `POST /api/projects/:id/preview/input` | Preview state, snapshot, SSE frames, and input. `GET /media` and `GET /resource` read restricted resources. |
| `GET\|HEAD /updates/*`, `/pocket/*`, `/test/pocket/*`, `/stable/pocket/*`. `GET /releases/*` | Studio published and update artifacts. Other remote hosting requires a suitable server. |

Editor routes enforce loopback/LAN, Origin, CSRF, and request validation. Keep this service local and retain private tokens, keys, and credentials. Linked source defines full behavior. Stabilizing the service API would require an explicit version and compatibility commitment.

## Versioning and documentation maintenance

Consumer setup uses Node/npm and matching prebuilt packages. Source release tools also require Python, Rust, and C/C++. npm workspace, Dart package, and native archive versions come from their own manifests, locks, and releases. See [SDK package](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/package.json), [sdk/package.json](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/package.json), and [toolchain.mjs](../scripts/toolchain.mjs).

Update this page, affected guides, and release notes when changing flags, defaults, dependencies, outputs, endpoints, or supported targets. See [API.md](API.md#maintenance-contract) for the export baseline and maintenance contract. Run:

```sh
python3 sdk/scripts/check_api_docs.py
```
