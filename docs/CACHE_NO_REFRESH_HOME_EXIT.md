# Cache-first entry and Home container exit

On 2026-11-10, two Demo consumer policies were corrected and SystemUI
`0.1.0-test.5` was published to the existing `pocket.host.demo/latest.json`.
The Flutter host did not need reinstalling.

## Provenance and ablation

The retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` was
reviewed for Flutter shell and safe-area behavior, excluding `pocket_host/`.
The parent had no reusable container exit button. The SDK retains the host safe
area and official `system.container.close` protocol.

`demo/js/system.ts` previously used `createPocketUpdateClient({autoRefresh: true})`,
which checked and applied updates on launch, update notifications, and foreground
return. `PocketSession.initialize(cacheFirst: true)` already stages a package in
the background for the next entry. The JS apply could replace the current page
after cache entry. The Demo stopped opting into auto-refresh and kept the manual
update API and public SDK auto-refresh option. The existing Dart update
coordinator remains authoritative.

The shared Home navigation bar in `demo/js/app.tsx` keeps a back arrow and adds
an explicit Exit Container button. Both use the same close request and failure
handling. Other pages retain route back navigation.

## Validation

- Real pinned QuickJS bytecode and native probe verified that healthy update status,
  `updates.changed`, and `onResume` emitted no unsolicited `updates.check` or
  `updates.apply`. Both 390 px and 1280 px layouts had one exit button. After
  returning to phone width, a real pointer click emitted one `system.container.close`.
- These checks passed against both an isolated build and the published Editor
  revision 19 build.
- Phone cache metadata confirmed the current Showcase entry URL. Manual phone
  taps and offline phone behavior remained unverified.

Evidence is under `sdk/.pocket-build/cache-no-refresh-20261110/`. Older packages
can start from cache and fetch the fix in the background. Re-entry uses the
new package after it is prepared.

The local `agy` Argon Medium review in session
`35592489-7f2c-450a-9825-d50b41a6a817` found no blockers. The index pointed to
`0.1.0-test.5`. The signed payload hash matched the index, and the entry hash
matched the revision 19 `app.qjbc` that passed native regression.

### Resident mini-app re-entry during a background refresh

On 2026-11-12, `PocketUpdateCoordinator.prepare()` reread the fixed mutable
package index on every call. A cache-first mini-app showed its healthy cache on
initial entry, then `PocketSession._scheduleCacheFirstPreparation` fetched and
verified a new package in the background. Previously,
`prepareForOpen(cacheFirst: true)` returned `updated: false` immediately while
that Future was in flight. The resident re-entry kept its old generation for
that entry even after background staging finished.

Only resident `downloadOnOpen` mini-apps now await the existing preparation
Future in `prepareForOpen(cacheFirst: true)`, then consume the verified staged
package. Cold starts still enter from cache quickly. Remote-only resident
re-entry can wait for in-flight preparation. It shares the existing
`_prepareOnOpen` progress timeouts, with 20 seconds of network inactivity and
120 seconds of verification or local preparation inactivity. Actual progress
resets the timer. Cancellation uses the original path. Bundled runtimes can use
their local package immediately. Background failures preserve the existing
error and healthy cache, including offline. The existing coordinator owns
network and state.

`sdk/test/session_download_on_open_test.dart` uses real
`PocketUpdateCoordinator`, local HTTP, and a signed package. The test covers
mounting the new build during the same resident re-entry with pending background
work. It also covers successful manifest retrieval followed by blob HTTP 503,
retaining the healthy cache and error. The fixed-index regression in
`sdk/packages/pocket_services/test/pocket_package_update_test.dart` confirms that
the same coordinator rereads the mutable index. These cases reproduce and fix the
SDK re-entry race. Without an on-device active-version log, the cause of the
concurrent physical-device Live2D error remained unconfirmed.

The user then asked to keep the Home back arrow. Restored it and published
`0.1.0-test.6`. Native regression again found both arrow and exit text at 390 and
1280 px. An actual phone-width arrow tap emitted one close request. The plain
Session regression `warm cache keeps its generation and bridge through a blocked same-manifest refresh`
passed. With background requests for the same signed manifest blocked or released,
and after manual check and apply, active package, payload SHA, generation,
controller, registry, and mount count stayed unchanged. Apply returned
`scheduled:false`. The redundant widget and runtime simulation was removed.

## Flutter FPS correction

The user requested Flutter FPS. `PocketView.showDebugFps` now reuses the Demo's
`FlutterFrameMonitor` to show Flutter engine `FrameTiming` cadence. Guest ticks/s
text, its dedicated field and color method, and per-second setState were removed.
The SDK owns the single monitor implementation, and the Demo re-exports it for
compatibility. The only behavior adjustment is bottom SafeArea. The HUD lets
input pass through. Flutter's official PerformanceOverlay was unsuitable because
it does not render in Release. See [Flutter FPS](FLUTTER_FPS.md) for provenance
and detailed acceptance.

All 13 original monitor tests and two SDK HUD show/hide tests passed. The same
local Argon Medium session reviewed final FrameTiming behavior and found no
blockers. Background updates keep the mutable manifest URL even when the cached
descriptor points to an older version. FunApp retains native cache-first updates.

## iPhone Release installation

FunApp resolved its local dependencies to this SDK. Final iOS Release-Dev build
passed in 832.2 seconds of Xcode time. The AOT artifact contained the Flutter
HUD and passed checks for 41 Pocket FFI symbols and intiface exports. It was
installed without clearing data to `com.lovappen.pulse` on `lincoln-phone`, and
foreground launch succeeded with PID 2864. Manual Home taps and visual FPS checks
were still open at this point. Native and Flutter regressions provided their
input and display evidence. Installation and launch JSON and logs share the
evidence directory.

The user's phone screenshot then showed the Flutter HUD at Flutter 76 FPS,
while Home still lacked back. The container's actual active pointer was
`0.1.0-test.3`. `test.6` downloaded into versions at 13:47:22 on that open.
The running page remained active as intended. The user was asked to re-enter
to validate staged activation. Healthy cache was preserved.

### Cause of rollback after phone re-entry

After fully exiting and reopening, the active pointer remained test3 and
failure rollback removed the test6 directory. Both required-root test3 and
test6 loaded individually from the phone cache copy, with the same namespace
and index URL. This excluded entry cache resolution. Forcing a wrong 120 Hz
native tick on a 60 Hz package also failed in a manual run. The actual SDK
uses 60 Hz from package metadata independently of display refresh, so that
manual input did not reproduce the phone's cause.

Exact test6 QJBC and PAK with the phone's actual compositor registry
`{profile:2,lobby:3,lantern:63}` reproduced
`guest bytecode evaluate: Guest: ui.__surfaces must match every installed child in the System catalog`.
The stack led from `readSurfaceRegistry` into `SystemAppSurfaces`. Flutter FFI
decoder and native probe reported the same error. The Demo statically declared
30 optional official samples installed, while the remote host descriptor
supplied only three actual children. Prior NativeSession tests hardcoded the
33-entry local Showcase registry. Remote first launch needed its own check.

The JS consumer now installs only optional samples present in the trusted
registry and aligns open policy and availability UI. It retains the descriptive
catalog, required-app constraints, SDK strict registry, signatures, and healthy
cache. No synthetic handles are assigned.

SDK initial candidate admission and runtime recovery now log bounded version,
hash, generation, stage, and error details for diagnosis after rollback.
The focused regression verifies one log per failure and a usable healthy fallback.

### test.7 release and phone confirmation

The fix passed both the three-entry phone registry and 33-entry local registry.
Actual Flutter FFI decoded 317 ops. Narrow and wide back arrows and pointer-driven
close passed. Final local Argon Medium session
`18e67f77-b96b-48a2-b097-c8ab18174403` found no blockers.

`0.1.0-test.7` was published to the existing entry. Signed payload SHA-256 was
`2e68cf6f6059a8f6a6dcff5b0dd20f9517bb37421af0b61dd8f7bf3e4e341bb1`.
Entry SHA-256 was `44d9a64d75c579d0b97d6ac31ea4913ec0fce1d6a7b876ab14efca33a77c9965`,
matching the 740327-byte QJBC that passed regression.

On the first external entry after publication, test.3 opened at 14:36:08 and
test.7 finished downloading at 14:36:11. With cacheFirst, the old page stayed
active during that visit. The user then successfully updated from inside
the app and the phone's active pointer was test.7. A full external re-entry
after the new version finished downloading remained unverified independently.
Evidence is `phone-current/files-after-test7.json` and
`phone-current/active-after-manual-update`.

The rerun of
`cacheFirst presents healthy cache through blocked HTTP and uses staged update on next open`
passed. Healthy cache mounted immediately with HTTP blocked. Background
completion preserved the generation, and the next open consumed local staging.
This verifies Session automatic activation. The FunApp external entry still
requires its own device validation.
