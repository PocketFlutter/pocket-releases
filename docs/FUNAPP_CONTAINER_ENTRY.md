# Follow-up status

On 2026-11-10, a follow-up resolved the release conflict (HTTP 409) documented below,
completed offline caching for the entry point, and installed Release on an iPhone.
See [iPhone release cache acceptance](RELEASE_IPHONE_CACHE_ACCEPTANCE.md) for the latest
verification and its limits. The investigation below is historical.

# FunApp Pocket container entry

On 2026-11-10, source review reused the host exit boundary from the retained parent
`pocketjs_flutter_demo/lib/ui/mini_app_host_page.dart`, excluding `pocket_host/`. It also
reused validation and updates from the current SDK's `PocketSession.initialize(cacheFirst: true)`
and `PocketPackageStore.lastGood`. Cache selection and navigation stay in the existing flows.

- FunApp's `TryFunPocketRemoteContainer` preserves active and lastGood activation pointers
  after each host config read. `PocketSystemHost.fromHostConfig(cacheFirst: true)` passes
  the cache-first policy to the root SystemUI session. A usable signed local package
  mounts first while the update is prepared in the background. Missing or corrupt caches
  and version admission failures use the normal download and verification path.
  Startup still requires host descriptor and trust checks.
- FunApp's `TryFunPocketRemoteContainerPage` uses a simple page without an AppBar. The old
  global key, config copy, and refresh navigation bar state were removed. The JS SystemUI
  Home back icon sends the standard `system.container.close` request to invoke `onClose`.
  FunApp only pops the container route if it remains on top, so repeated taps cannot pop
  the page below it. See `SDK_INTEGRATION.md` for the protocol.
- Debug explicitly enables `showFps` and displays the SDK's `Guest ticks/s` label on the
  SystemUI root PocketView. It measures guest frame scheduling. Child apps share the
  same overlay and screen refresh would require a separate measurement.
- Debug initially added a Lantern shortcut using the current input address's HTTP(S)
  origin. Its default was
  `http://192.168.50.230:8791/test/pocket/0.1.0/pocket.demo.lantern/latest.json`.
  Index resolution uses signed release logs and immutable assets even if the source
  directory is gone. It preserves release ownership without creating a blank project.

The five existing Session cacheFirst cases passed, covering stalled or blocked network
requests while a cache is available, cold download, background failure, and updating on
the next open. The JS kernel protocol tests passed. Actual compiled SystemUI QJBC, run
through the pinned native probe with real pointer down/up on the back icon, emitted
a single `host.request(system.container.close,{})`. The signed iOS Release-Dev build
passed in 400.5 seconds of Xcode time. The final Runner passed checks for 41 Pocket FFI
and intiface interfaces. Flutter close protocol checks passed, as did all four FunApp
regressions for removing the navigation bar, FPS options, repeated close without an
extra pop, actual HTTP cancellation and error retry, and preserved activation pointers.
Twenty JS System kernel checks passed, including the ablation case where the app can
still exit while catalog configuration is blocked. The full historical SDK host
suite still has an existing async error handling failure in awaitFirstFrame. The close
protocol passed when run independently.

The Showcase compilation succeeded. Publishing the full Showcase to the test channel
hit HTTP 409 because the existing Lantern slot belongs to the separate
`pocket-demo-lantern` project. The backend correctly rejected the cross-project
overwrite. The existing release and ownership were preserved. The phone loads the
existing Lantern test package from the fixed index above. Publishing the new SystemUI
back button remotely needed to respect the existing release ownership.

The retained parent's `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md` and audit
docs describe signed OTA, SHA-256, and rollback. Review excluded `pocket_host/`.
Neither source included Editor release logs or a historical index server. The existing
`sdk/editor/server.ts` release log parser was adapted so project source configuration
is used only for optional legacy migration.

After deletion of a temporary project's source directory, the fixed index, immutable
Host, signed manifest, and resource hashes remained valid. State and log bytes stayed
identical, with 222 assertions passing. After restarting the local production service,
the user's fixed LAN Lantern index, Host, manifest, 1,231,811-byte entry, and
14,536,995-byte 7z package all returned HTTP 200. The entry and package SHA-256
matched the manifest. On-device iPhone game interaction was outside that check.

The final review put catalog admission and verified root hash reuse in
`PocketSystemHost.fromHostConfig` before custom reload callbacks so FunApp I/O cannot
bypass those checks. A direct Host descriptor without an immutable catalog skips
directory reloader installation. A matching root hash reuses the descriptor. Only a
new root invokes custom transport. All nine Host config and four FunApp container
cases passed again.

The local consolidated `agy` Argon Medium review found two issues: a Debug dylib ABI
preflight false positive and a custom catalog reload bypassing reuse. Both were fixed.
The re-review found no blockers. Preflight now resolves `Runner.debug.dylib` only when
it is a declared Mach-O dependency, so an unrelated sibling with the same name cannot
mask missing symbols. All 16 Python cases passed. Actual Debug-Dev and Release-Dev
artifacts passed checks for 41 Pocket FFI and intiface interfaces. Review session
`16338cb9-8b20-40c1-859e-8e41385619f7`. At the end of that round the latest UI was still
local, with no phone installation, commit, or push.

## Host shake Inspector and Debug entry on 2026-11-10

The FunApp Debug page kept only the Pocket container entry. The separate Lantern
shortcut and bespoke URL formatting were removed. Games remain accessible from the
Pocket home page. The container route uses `tryFunPocketRemoteContainerRouteName`.
The host's `FlutterInspectorShake.isEnabled` uses the existing NavigatorObserver's
actual route membership. A Pocket route on the stack disables shake even when covered
by a Flutter Dialog. Pop, remove, or replace restores shake when the container leaves.
Manual Inspector gestures such as magic tap remain available. This Inspector policy
belongs to FunApp.

Targeted navigation widget tests passed for entry, Dialog cover and dismissal, cover by
other pages, pop, remove, and replace. Dart formatting passed. Local `agy` Argon Medium
session `a7900426-0cc2-4f55-a9ab-9836850b938d` found a modal top-route edge case. It
reported `NO BLOCKING FINDINGS` after the change to route membership. Activation requires
installing a new host build.

The iPhone Release-Dev build passed in 90.1 seconds of Xcode time and produced a
426.3 MB Runner.app. The final Runner passed 43 Pocket FFI symbol and intiface export
checks. Installation preserved app data and launch succeeded, recorded in
`shake-release-install.json` and `shake-release-launch.json`. The native library was
synced to the current interface with the pinned `build_native.sh ios`. Automated tests
cover navigation behavior.

The user later opened Pocket on the newly installed host and shook the physical phone,
confirming the Inspector no longer appeared. The navigation regression verifies shake
restoration after exit. Manual user confirmation of restoration was outside the
recorded device check.
