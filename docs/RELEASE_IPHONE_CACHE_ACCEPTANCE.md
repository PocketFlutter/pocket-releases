# iPhone Release and Local Cache Launch Acceptance

On 2026-11-10, FunApp built iOS Release-Dev using a local Pocket dependency. This is AOT Release mode in the Dev environment. The build installed on `lincoln-phone` (iPhone 15 Pro Max, `com.lovappen.pulse`) with existing app data intact. The final build succeeded in 179.5 seconds and compiled the kernel after the SDK and container source fixes. All 41 Pocket FFI symbols in the final Runner and the intiface interface passed verification.

## Cache Contract

- A complete, usable cache includes verified Host, directory, and bootstrap information and an admissible signed game resource package. FunApp now uses `PocketHostConfig.load(cacheFirst: true)` for the initial load and reload by root hash. Games continue to use the existing `PocketSession.initialize(cacheFirst: true)`.
- A cached entry reads from disk with zero HTTP requests. Verified game resources mount locally, and remote updates prepare in the background while the current game runs. Missing, corrupt, or inadmissible files, or missing entry information for the target version, require network recovery. Partial downloads cannot launch.
- Upgrades from earlier SDKs preserve the game resource cache. Earlier SDKs did not persist the Host entry cache, so the first launch after upgrade fetches entry information once and reuses the existing game resources.
- FunApp removed the retry path that automatically wiped the entire trust file after a trust conflict. The existing anchor and trust data for other games survive the failed request.

## Publishing and Validation

- The new SystemUI published as `0.1.0-test.4`. [Test channel index](http://192.168.50.230:8791/test/pocket/0.1.0/pocket.host.demo/latest.json)
- Showcase explicitly set `reusePublishedPackages` in `editor.json` to reuse the independent Lantern immutable signed version. The publishing logs and state file hashes for independent `pocket.demo.lantern` stayed unchanged, and `pocket-demo-lantern` still owns the original pinned index. This resolved the 409 publish conflict and preserved the runtime System schema and original game identity.
- All 11 SDK Host configuration tests passed, covering a cache hit with zero HTTP after the server shuts down, historical root hash matching, network repair of a corrupt cache, and trust conflict rejection.
- All five FunApp container tests passed, covering fullscreen, FPS, exit protection, active pointer retention, offline entry load, local reload of a historical directory, and preservation of the trust file.
- Four Editor version tests passed with 348 assertions, using `--timeout=60000` while the host also built. Coverage includes default conflicts, explicit reuse, an independent root serving as a child app, preservation of external versions in immutable and mutable Host paths, and rejection of a missing owner.
- The published QJBC SHA-256 matched its signed manifest, and the external Lantern bootstrap asset hash matched. Running the published artifact with the pinned native probe and sending actual pointer down/up to the Home back icon produced exactly one container close protocol request.

## Phone Acceptance Scope

Release installation succeeded. Automatic launch returned `Locked` because the phone was locked. Offline cache validation comes from real loopback HTTP and Flutter regression tests. Manual verification of offline game interaction on the phone remained pending.

Evidence is in the ignored directory `sdk/.pocket-build/release-cache-local-20261110/`. This pass made no commits or pushes.

The final consolidated review by local `agy` Argon Medium session `f97f1b8e-dbc8-4a1a-b7ca-473a22d4084d` found no blocking HIGH or MEDIUM issues. The noted direct Host plus `requiredRootPayloadSha256` combination uses no index and falls outside normal reloads from a pinned index entry. A cache miss still takes the existing network path and never returns the wrong root descriptor. The installation log confirmed `com.lovappen.pulse` installed. Automatic launch returned `Locked`, and the user was asked to unlock the device.
