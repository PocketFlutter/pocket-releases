# Editor version backend

The Editor owns local publishing and the version inventory. Flutter continues
to consume the existing signed Pocket update protocol; there is no second
updater or application policy state machine in Dart.

## Source and retained behavior

Source-first inspection of the retained
`/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding
`pocket_host/`, found no Editor version service to migrate. This change extends
the reusable SDK implementation instead. The retained
`lib/core/pocketjs_bundle_runner.dart` and `lib/main.dart` use the former
bundle/syslib hot-update integration; their example release controls are not
copied into Dart. The current SDK already owns signed package preparation,
mounting and lifecycle, so this change reuses those boundaries:

- `editor/server.ts`: current-revision build gate, project APIs, root and mini-app
  resource snapshots, persistent development signing key and host templates.
- `scripts/build_guest.ts`: the pinned PocketJS compiler and bytecode pipeline.
- `scripts/package_update.ts`: signed manifests and content-addressed artifacts.
- `editor/update_endpoint.ts`: read-only public artifact transport, separate from
  the loopback Editor mutation API and signing material.
- `editor/client/editor.js`: the existing publish action and version drawer.
- `editor/preview.ts`: the existing installed-catalog compositor handle allocation,
  reused against the saved build snapshot when producing host descriptors.

The mutable `test` and `stable` routes remain the entry points for consumers.
Test publishing advances the build counter; stable publishing uses the build
declared by the project. The version drawer uses the same publish actions and
server inventory rather than maintaining a second release model in the browser.

## Version records

Each successful publish records the source revision, channel, version, build,
publish time, signing identity, archive and all package identities. The signed
artifacts are retained separately from the mutable channel entry points. History
links use a legal, immutable package-version segment in the existing public
route, so the host configuration can address them through the normal update
client.

The fixed channel index follows new publications. Its version records point to
immutable signed manifests and host descriptors. Mini-app bootstrap URLs remain
pinned to the matching release because their hashes describe those exact bytes.
Native update routing and persistent storage derive from the caller's fixed
index URL, so remote descriptor fields cannot switch channels or reset the
anti-rollback store. At runtime configuration, the host selects the child catalog
by the mounted, verified root payload hash before replacing the registry.
The existing runtime configuration request is the native boundary for refreshing
child registrations and compositor handles; JS keeps routing, state and UI
composition. The registry is not selected merely because a newer directory
record appeared while an older root is still mounted.

All root and child packages must finish packaging before the release inventory
is committed. An unsuccessful package operation leaves the previously published
slot available. The inventory is persisted with a same-directory atomic rename
and loaded again when the service starts.

Stable releases reject a lower build and reject changed content at an existing
build. Re-publishing identical content is idempotent; a different signing time
alone does not create a new release. Test releases advance automatically.

## One-click offline package

The test and stable version rows each expose a single download icon next to
the concrete published version. The icon downloads that release's complete
`.tar.gz` archive: root package, every mini app, signed manifests,
content-addressed resource blobs and host/bootstrap metadata. It never
publishes or changes the channel pointer.

Historical releases retain their original archives. An older download never
repackages the latest resources: every root and child keeps the version/build
recorded at that publication.

The offline packaging API also remains available for a saved successful build.
It preserves the current slots, history, build counters and published status,
and requires source/resources matching the build. The version panel uses the
specific release archive rather than a second current-build download action.

## A single entry point for LAN apps

The version panel shows one fixed update entry point and a one-click copy action:

```text
http://<LAN_IP>:<port>/test/pocket/<hostVersion>/<package>/latest.json
```

`hostVersion` is the host version and `package` is the root package ID. The entry point omits the concrete app package version. This `latest.json` is a version directory. It lists the latest version and the history for the same host, package, and channel. Each version links the root package and mini apps from that publication. The directory is generated from existing release records, with no separate state. The `stable` channel uses the same structure at `/stable/pocket/.../latest.json`.

The container needs one parameter. The Editor passes only this parameter when launching a device already configured for updates:

```sh
flutter run --dart-define=POCKET_HOST_CONFIG_URL='http://<LAN_IP>:<port>/test/pocket/<hostVersion>/<package>/latest.json'
```

At startup, the SDK reads the directory, selects the latest version, and resolves its configuration, mini apps, and resources. Every update check by `PocketUpdateCoordinator.prepare()` fetches the fixed directory again. The resource URLs for a download always come from the concrete signed manifest selected for that request. Relative URLs in the directory resolve against the entry point, so there is no need to enter child package addresses or construct version paths manually. Each version's configuration and bootstrap metadata are pinned to the published contents. Later releases leave the old metadata intact. The existing signed updater still handles the signed `latest.json` under a concrete version path. Distinct schemas prevent the fixed version directory and signed manifest from being interpreted as each other.

The Editor management API stays on loopback. The LAN serves only the version directory, configuration, and signed update artifacts, with no editing or publishing APIs or signing private key exposed. LAN HTTP is for debug hosts. Release hosts follow the SDK's HTTPS requirements. Bootstrap configuration must never silently replace an existing trusted public key during an update. Associated child packages use the signing identity already trusted for the fixed entry point. Downloads still pass the existing signature, ABI, hash, and anti-rollback checks. The remote root package also uses `downloadOnOpen` to download, verify, and execute the root selected by the directory.

## Validation

`bun editor/test/editor_live_probe.ts` creates an isolated workspace and uses the
real pinned compiler. It publishes a signed update over HTTP, verifies its
signature, downloads every referenced blob, reconstructs the PAK, and compares
the bytecode and PAK hashes with the build artifacts. An invalid subsequent
source build must fail without changing the published manifest. The probe also
publishes consecutive test versions and restarts the service to check persisted
history and immutable downloads. This checks compilation and artifact transport;
it does not claim to execute the bytecode
inside Flutter.

Use `bun test editor/test/editor_server.test.ts editor/test/update_endpoint.test.ts`
for service and public transport regressions. Service fixtures inject explicit
synthetic bytecode and are not runtime-execution evidence.

`bun test editor/test/version_management_ui.test.ts` runs the actual Editor
client in Playwright Chromium. It clicks the test and stable publish buttons,
checks the request bodies and automatic refresh, and verifies that a failed
inventory refresh clears the previously displayed slots and history.

The coordinator regressions cover successive signed releases through one fixed
index without recreating the coordinator, relative blob resolution at a different
path depth, index/manifest mismatch, cross-origin rejection and anti-rollback.
The existing granular and bundle download tests exercise the same resolved
manifest base. Signature, plugin and trust-policy admission regressions remain
on the original coordinator and verifier.

The version card exposes one download icon beside the concrete test/stable
version and build. Its accessible name and tooltip identify that exact release;
an unpublished slot is disabled. Playwright covers these controls and the saved
resource settings (2 tests, 81 assertions). A live download of the existing
legacy publication was also checked to contain the root and both associated
mini apps without changing published state.

The aggregate host descriptor adapts artifact origins to the address used by
the requesting container. Loopback aliases and the LAN endpoint therefore work
against the same immutable release. This adapter does not modify signed
manifests, package digests or release identities. The actual LAN fixed index was
loaded through `PocketHostConfig.load`, including verified bootstrap metadata,
remote-root download policy and the published compositor registry.

`mini_app_update_ffi_test.dart` also exercises a real signed root build 1 to
build 2 promotion with the release native library. The fixture compiles the
SystemUI once and reuses its bytecode/PAK for both signed release identities.
The test downloads root build 2, selects its matching catalog before mount,
changes the child's compositor handle from 2 to 3, and waits for the replacement
root and child to produce their first native frames. The host gates transient
rebuilds until the verified catalog generation equals the mounted session
generation; it never changes a loaded native compositor registry in place.
