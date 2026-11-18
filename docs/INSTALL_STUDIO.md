# Install the standalone Web SDK and Studio

The installer downloads the standalone Web SDK from an official GitHub release, runs its bundled
`setup` and `doctor`, and passes startup to the existing Studio service manager. It works
without a Git checkout or changes to system Node.js.

## Requirements and supported platforms

- Node.js 22.22.2 or later. Node.js 24 LTS is recommended.
- Install npm and make it available on `PATH` before running the installer.
- Supported platforms are macOS Apple Silicon (`darwin-arm64`) and Windows x64
  (`win32-x64`). The installer rejects macOS Intel, Linux, Windows ARM64, and other
  unsupported platforms before downloading.
- First-time installation needs access to `PocketFlutter/Pocket` GitHub Releases and
  the npm registry. Git, Python, Rust, Flutter, and a global Bun installation are optional
  for this workflow.

## Install with one command

On macOS Apple Silicon, run the following command.

```sh
curl -fsSL https://raw.githubusercontent.com/PocketFlutter/Pocket/main/sdk/scripts/install_studio.mjs | node --input-type=module -
```

On Windows x64, use `curl.exe` in PowerShell 7 or Command Prompt.

```powershell
curl.exe -fsSL https://raw.githubusercontent.com/PocketFlutter/Pocket/main/sdk/scripts/install_studio.mjs | node --input-type=module -
```

By default the existing service manager starts Studio on `http://127.0.0.1:8791` after
installation. Pass CLI options on the same pipeline as needed.

```sh
curl -fsSL https://raw.githubusercontent.com/PocketFlutter/Pocket/main/sdk/scripts/install_studio.mjs | node --input-type=module - --version=0.1.21 --dir="$HOME/.pocket/studio" --no-start
```

```powershell
curl.exe -fsSL https://raw.githubusercontent.com/PocketFlutter/Pocket/main/sdk/scripts/install_studio.mjs | node --input-type=module - --version=0.1.21 --dir="$env:USERPROFILE\.pocket\studio" --no-start
```

Use `--no-start` for CI, remote installation, or later manual startup. Installation and
checks still run. Run `npm run start` in the installation directory afterward. Options also
accept space-separated values, for example `--version 0.1.21`.

## CLI options

| Option | Default | Behavior |
| --- | --- | --- |
| `--version=MAJOR.MINOR.PATCH` | Latest available stable version | Installs the specified official `sdk-v<version>` release. Accepts stable semantic versions such as `0.1.21`. |
| `--dir=PATH` | `~/.pocket/studio` (on Windows, `.pocket\studio` in the user directory) | SDK installation directory. Relative paths resolve from the current working directory. |
| `--project-root=PATH` | Unset | Existing regular directory to pass to the Studio service manager as the project root. |
| `--no-start` | Off | Installs and runs `setup` and `doctor`, then skips Studio startup. |
| `--help` / `-h` | Off | Prints options without checking npm or using the network. |

For another project, choose a new `--dir`. Keep the SDK install location separate from the
consumer project passed to `--project-root`.

## Installation and directory protection

The [install_studio.mjs](../scripts/install_studio.mjs) installer is a single-file Node CLI so
it can run through `curl | node -` before the SDK exists locally. Production release lookups use
the fixed official GitHub API. A stable `sdk-v<version>` release must contain a precisely
named platform archive and `.sha256` sidecar. Download URLs must belong to releases in
PocketFlutter/Pocket. Requests enforce response size, timeout, and redirect origin limits.

Before placing files, the installer checks SHA-256, SDK package name and version, official
repository and commit details in `provenance.json`, the pinned PocketJS revision, and the SDK
and revision declared by `prebuilt_tools.mjs`. Extraction accepts regular files and
directories under `package/`, rejects traversal, symlinks, hard links, and special entries,
and caps archive size, extracted file size, total size, and entry count.

For a first installation, the installer creates a run-specific staging directory beside the
destination. It runs `npm run setup` and `npm run doctor` there, then renames it into place
on the same filesystem after the checks pass. A failed attempt cleans up only its own staging
directory. If the destination exists and is unrecognized as a managed Pocket SDK install,
the installer leaves it untouched and returns an error.

On repeat runs, an existing managed install runs only `npm run doctor` and starts Studio as
requested. Consumer files are preserved. If the requested version differs from the managed
install, use the existing Studio SDK upgrade flow or choose a new `--dir`. The installer
rejects an in-place overwrite or upgrade. The [editor_service.mjs](../scripts/editor_service.mjs)
service manager owns port `8791` and process lifecycle. An unmanaged process occupying the
port produces an error and keeps running.

## Provenance and required adaptations

The source audit reviewed the retained parent tree, excluding `pocket_host/`. Its
`pocketjs_flutter_demo/README.md` and development docs address Flutter, WeChat, and GCC tests.
Its `pocketjs_flutter_demo/fix.sh` patches a project using local paths and Flutter iOS template
assumptions. A standalone installer needs to work without Git and Flutter, which prevents
direct reuse of these sources.

Current reusable components include [export_web_sdk.ts](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/sdk/scripts/export_web_sdk.ts), which
builds a standalone package with platform-specific prebuilt tools and provenance,
the [release workflow](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/.github/workflows/toolchain.yml), which builds macOS arm64 and
Windows x64 archives and checksums, [toolchain.mjs](../scripts/toolchain.mjs), whose `setup`
and `doctor` verify npm dependencies and prebuilt tools, and
[editor_service.mjs](../scripts/editor_service.mjs), which manages Studio startup and shutdown.
The installer stays single-file for `curl | node -` bootstrap and reuses these package and
release names, validation, pinned compiler, and service commands. Upgrades follow the
existing [Studio upgrade process](STUDIO_UPGRADE.md).

## Validation record

- The offline fixture command `bun test --timeout 60000 sdk/scripts/tests/install_studio.test.ts`
  passed 11 tests with zero failures. Coverage includes correct platform archives,
  bad hashes, traversal, destination conflict protection, repeat-run consumer file
  preservation, exclusion of Git source trees, parent-directory symlinks, Node CLI
  path aliases, stable release selection, Node and npm requirements, and unsupported platforms.
- On 2026-11-16, macOS Apple Silicon passed acceptance with the historical official
  release 0.1.21. SHA-256 and provenance checks, npm setup, staging doctor, and doctor
  after atomic placement passed. The standalone SDK CLI built actual guest QJBC and a
  repeat run preserved the workspace sentinel. Logs are
  `/tmp/pocket-installer-acceptance.log`, `/tmp/pocket-installer-relocated-doctor.log`,
  `/tmp/pocket-installer-guest-build.log`, and `/tmp/pocket-installer-repeat.log`.
  This acceptance covered macOS Apple Silicon only.

The fixture runs offline. Trust in actual release packages, runtime, and build behavior
comes from official release acceptance and the boundaries in [Web SDK export](WEB_SDK_EXPORT.md).
