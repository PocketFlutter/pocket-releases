# Cache-first Host Bootstrap for remote containers

## Integration scope and source inspection

On 2026-11-10, a source-first review inspected the retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`.

- `lib/main.dart:8-18` and `lib/ui/mini_app_host_page.dart:15-30` mount local views directly during `runApp`. Neither implements a remote Host Bootstrap document cache.
- `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md` describes package manifests, chunk SHA-256 verification, and atomic `ActiveManifest` switching. It has no fixed app index or immutable Host descriptor cache.

`PocketSession.initialize(cacheFirst: true)` already mounted a locally verified, signed `lastGood` package before fetching updates in the background. FunApp's `TryFunPocketRemoteContainer._load` still always awaited the network in `PocketHostConfig.load(uri)` before mounting `PocketSystemHost.fromHostConfig`. Even a cached remote container therefore depended on HTTP requests for the index, Host descriptor, and bootstrap files (`app.bytecode.json` and `guest-manifest.json`) on every open.

## Architecture and implementation

`PocketHostConfig.load` and `loadFromEnvironment` accept an optional `cacheFirst` parameter, which defaults to `false`. The existing loader, local filesystem, trust boundary, updater, and version admission state machine remain in use.

1. **Cache contents and key isolation**
   - The cache lives in `pocket-host-cache/` under `trustAnchorDirectory`, which defaults to `ApplicationSupportDirectory`.
   - The normalized entry URL keys the latest verified entry. Normalization strips fragments and preserves the full origin, path, and query selectors. `source + rootPayloadSha256` keys historical Host descriptors for immutable roots.
   - The cache contains the verified Host descriptor, inline bootstrap data (`bootstrapMetadataJson` and `bootstrapManifestJson`), the fixed package index's `catalog`, and the current `selectedCatalogEntry`.
2. **Strict local revalidation and recovery**
   - When `cacheFirst: true` finds a local entry, the loader applies the same checks as a network load before issuing any HTTP request. It validates the URL and HTTP allowlist, enforces the `baseUri` origin, revalidates each `bootstrapAssets` size and SHA-256 declaration, checks schemas and child packages through `PocketHostConfig.fromJson`, and compares trust anchors in `pocket-host-trust.json`.
   - When `requiredRootPayloadSha256` is supplied, only a descriptor with the matching `rootPayloadSha256` qualifies. The loader never falls back to or mixes in descriptors for other roots.
   - Missing entries, corrupt files or JSON, bootstrap hash mismatches, and excessive file sizes trigger cleanup of damaged entries and fallback to the original network loader. A trust-anchor mismatch (`trust anchor changed`) throws `FormatException` directly.
3. **Atomic writes, cancellation safety, and bounded capacity**
   - After a successful network load and validation of bootstrap resources and trust anchors, the loader writes to a temporary file and uses `rename` for atomic publication. `PocketCancellationToken` supports cancellation and cleanup of temporary files. The cache keeps the 16 most recent entries (`_hostCacheMaxEntries = 16`).
4. **Single package state machine and generation-aligned catalogs**
   - Host Bootstrap caching never probes or validates `PocketPackageStore`. `PocketSession.initialize(cacheFirst: true)` remains solely responsible for package signatures, minimum versions, and staged-candidate selection.
   - FunApp's `TryFunPocketRemoteContainer` passes `cacheFirst: true` during initial `_load` and `reloadHostConfig`. The first cold start loads over the network and writes the cache. Later opens return the local `PocketHostConfig` and immediately mount `PocketSystemHost(cacheFirst: true)`. When a new root prepared in the background mounts at next open, or when the descriptor for the mounted root is already cached, lookup uses the exact `requiredRootPayloadSha256`. An uncached root hash falls back to fetching the corresponding immutable descriptor over the network.

## Validation evidence

- **SDK Host Config regression (Flutter 3.47.9).** `test/pocket_host_config_test.dart` covers writing the cache on cold start, loading with zero requests after shutting down the loopback HTTP server using `PocketHostConfig.load(..., cacheFirst: true)` while retaining `bootstrapMetadataJson` and `bootstrapManifestJson`, matching the exact historical descriptor offline via `requiredRootPayloadSha256`, falling back to the network for an uncached root hash, enforcing the HTTP allowlist, fetching a fresh descriptor after cache tampering, and rejecting trust-anchor conflicts.
- **FunApp container regression (Flutter 3.35.7).** `common_lib/packages/tryfun_pocket/test/remote_loading_test.dart` covers shutting down the HTTP server after `TryFunPocketRemoteContainer` primes the cache on cold start, remounting and loading its Host configuration with zero network requests while preserving bootstrap resources, using `catalogLoader` and `requiredRootPayloadSha256` to resolve the exact cached historical descriptor offline, and requesting an unknown root over the network without reusing an old cache entry.
