# Native Pocket Studio releases

The [Native Studio workflow](../.github/workflows/studio-native-release.yml) publishes macOS Apple Silicon, Windows x64, and Linux x64 desktop installers and signed `dev.pocket.studio` OTA bundles in [PocketFlutter/pocket-releases](https://github.com/PocketFlutter/pocket-releases/releases). The Web SDK uses its existing `sdk-v*` releases.

## Source and build boundaries

The retained parent at `../pocketjs_flutter_demo` has the original host entitlements in `macos/Runner/Release.entitlements`, the content-addressed update design in `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md`, and early packaging utilities such as `tools/compile_pocket_syslib_aot.py`. The source checkout at `PocketFlutter/Pocket` supplies the desktop packaging workflow, `sdk/scripts/package_native_studio.ts`, its tests, and `sdk/scripts/build_web_engine.ts`. The public workflow reuses those tools with an exact source revision and publishes only the compiled release assets.

Desktop dispatches require a source commit containing the `--omit-bundled-projects` change in `sdk/scripts/package_native_studio.ts`. The workflow validates that flag in the source packaging plan and passes it to every public installer build. The flag is required to keep the private Demo and example project payloads out of public desktop installers.

Dispatch from `main` with a full `source_sha` from the canonical source repository and a positive `build_number` higher than previous production builds. The workflow checks that the requested commit matches the source checkout and is an ancestor of `PocketFlutter/Pocket` main. The package jobs independently confirm their checkout matches the verified SHA. The workflow takes the release version from the pinned source SDK.

- `platforms` defaults to `all` and accepts a comma-separated list of `macos-arm64`, `windows-x64`, and `linux-x64`.
- `ota_only` selects only the signed OTA bundle. Otherwise the workflow builds the selected desktop installers and one signed OTA bundle.
- `mode` defaults to `release`. `create_dmg` adds a macOS DMG alongside the ZIP.
- With `publish_release` unchecked, the workflow checks architecture, source packager tests, and packaging plans. With it checked, the workflow builds, signs, and publishes.

## Protected environments and release assets

| Environment | Allowed branch | Secrets | Jobs |
| --- | --- | --- | --- |
| `studio-native-build` | `main` | Read-only `POCKET_SOURCE_SSH_KEY` | Source validation and desktop builds |
| `studio-native-signing` | `main` | Read-only `POCKET_SOURCE_SSH_KEY` and production `STUDIO_UPDATE_SIGNING_KEY` | Signed OTA build |

Set `POCKET_SOURCE_SSH_KEY` once as a repository Actions secret to share it between both jobs, or set it in each environment. The matching public key must already have read access to `PocketFlutter/Pocket`. Configure `STUDIO_UPDATE_SIGNING_KEY` in the signing environment.

The signing job writes the production Ed25519 key to a restrictive runner temporary file, removes the file after signing, and uploads the public verification key. The desktop jobs embed the public key. Private source commands suppress output, and checkout cleanup runs even on failure. The workflow uses no source or build caches.

The OTA and desktop jobs upload exact archive, SHA-256, manifest, and public key files with one-day retention. When desktop builds are requested, a separate one-day build artifact contains the compiled WebEngine files consumed by the desktop jobs. The publish job downloads only release artifacts, checks each archive against its sidecar, and creates `SHA256SUMS`. It rejects an existing `studio-v<version>` tag or release and creates a new release at the public packaging commit with `--latest=false`.

## Native OTA client rollout

The signed OTA feed is configured independently in Native Studio's `sdk/editor/studio_remote_ota.ts`. Moving the default feed to [the public Releases API](https://api.github.com/repos/PocketFlutter/pocket-releases/releases) requires the corresponding client source change. Existing clients can use `POCKET_STUDIO_SELF_UPDATE_RELEASES_URL` to select the feed. A deployment that serves a direct HTTPS `latest.json` can embed it through the workflow repository variable `STUDIO_SELF_UPDATE_URL`.

Provision the same production key ID and Ed25519 keypair as existing Native Studio installations expect. The client verifies the signature with its embedded public key and requires the OTA build number to exceed its active build.
