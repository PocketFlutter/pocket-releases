# Pocket Studio self-update and recovery architecture

## 1. Source-first review and evidence gaps

The implementation began by reviewing the retained parent at `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`.

- `mini_apps/syslib/pocket_syslib_ota.js` provides in-memory Guest AOT version comparison (`parseSemVerTuple`), host ABI matching, and in-memory rollback state.
- `lib/core/yooasset_package_manager.dart` and `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md` cover YooAsset chunk-based updates for Flutter hosts and mini apps.
- The retained parent has no GitHub Release checker, prebuilt platform-tool archive verification, consumer file preservation, interrupted update recovery, or cross-platform process replacement for the standalone Web SDK (`@pocket/web-sdk-tools`) or desktop Studio service (`127.0.0.1:8791`).

The implementation reuses the existing modules, process manager, and state machine.

| Path | Responsibility |
| --- | --- |
| `sdk/scripts/prebuilt_tools.mjs` | Reuses `validateToolsPackage` and `readPrebuiltToolsSourceConstants`. Normal pinned validation remains strict. The updater reads `SDK_VERSION`, `UPSTREAM_REVISION`, and `BYTECODE_ABI` from the new on-disk `scripts/prebuilt_tools.mjs` so stale constants in the old process cannot cause false startup ABI errors. |
| `sdk/scripts/editor_service.mjs` | The shared cross-platform service manager owns port `8791`, persisted PID and startup config, process retirement, and `/health`. `editorToolEnvironment(options, sdkRoot)` accepts an explicit root. The manager integrates `upgrade-apply` and recovers interrupted upgrades only after `restart()` stops the managed service. Recovery cold re-executes the disk entry point. |
| `sdk/scripts/studio_upgrade.mjs` | The coordinator selects stable GitHub releases, enforces HTTPS origins and streaming byte limits, checks SHA-256, safely extracts tar archives, and backs up and replaces individual files. Bounded Windows file-release retries use `maxRetries: 10, retryDelay: 200` and `withBoundedFsRetries`. A `randomUUID` token authenticates lock handoff across processes. Busy tasks defer updates. |
| `sdk/editor/server.ts`, `sdk/editor/client/editor.js` | Serve `/api/studio/upgrade`, `/api/studio/upgrade/check`, and `/api/studio/upgrade/apply`. `/health` reports process `pid` and startup SDK `version`. Server builds, saves, publishes, and deployments defer updates. Unsaved client drafts (`dirty`/`resourcesDirty`) defer automatic updates and reload until saved. Open pages check hourly. |

## 2. Safety and reliability

### 2.1 Source workspace protection and stable releases

- `parseStableSemver` accepts only final `sdk-v<major>.<minor>.<patch>` tags. It ignores draft releases, prereleases, and tags with prerelease suffixes.
- `readInstalledSdkInfo` distinguishes managed `standalone` installs from Git `source` checkouts, identified by markers such as `.git`, a parent `demo/`, or `editor/test`. Standalone installs keep verified archive-based file replacement. Source installs use restricted Git fast-forwards. Ineligible workspaces receive a specific deferral reason.

### 2.2 Check the on-disk ABI before and after update

- `validateStagedStandaloneSdk` extracts `prebuilt/pocket-tools-<platform>-<arch>-<version>.tgz` into staging. It checks that version, `upstreamRevision`, QuickJS `bytecodeAbi`, and all prebuilt binary SHA-256 digests agree across staged `package.json`, `provenance.json`, `scripts/prebuilt_tools.mjs`, and the platform-tools `manifest.json`.
- `resolvePrebuiltTools(sdkRoot)` reads constants from `sdkRoot/scripts/prebuilt_tools.mjs` through `readPrebuiltToolsSourceConstants`. With `editorToolEnvironment(options, sdkRoot)`, the same process starts the new service against the latest disk ABI and `upstreamRevision` after file replacement. Routine operation retains strict pinned-version and ABI checks.

### 2.3 File ownership, bounded Windows retries, and consumer files

`prepareSdkUpgradeBackup` and `applyStagedSdkFiles` update individual SDK-owned paths recorded in `.pocket-build/.pocket-sdk-manifest.json`.

- Add or update files from the new archive.
- Delete a file only if the previous SDK owned it and the current release removed it. Remove empty directories as needed.
- Use `rmSync(..., { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })` for platform tools, staging, and backup directories. File copy and delete go through `withBoundedFsRetries`, retrying `EBUSY`, `EPERM`, `EACCES`, and `ENOTEMPTY` at most ten times with 200 ms spacing. This handles file handles briefly retained by a just-exited Windows process without terminating unrelated processes.
- Preserve consumer files in managed directories (for example `packages/my-custom-package/custom.ts` and `packages/pocket_ui/consumer-extension.ts`), at the root, in `.pocket-build/editor-workspace-8791/`, and in `node_modules/`.

### 2.4 Lock handoff, deferral, backup, and recovery

- **Authenticated handoff and spawn confirmation.** The archive download uses `phase: "downloading"`. After staging passes, immediately before spawning the detached updater, set `phase: "spawning"` and record a one-time `handoffToken` from `randomUUID()`, `targetVersion`, and `stageDir`. `spawnDetachedServiceUpgrade` passes the token through `--handoff-token=` and `POCKET_UPGRADE_HANDOFF_TOKEN` and awaits the child `spawn` event. The child's `upgradeApply` takes over as `phase: "applying"` only after all three fields match exactly. It waits 150 ms before stopping the old service so the browser can receive the parent's complete HTTP response.
- **Busy and unsaved work.** Server `canApplyUpgrade` defers automatic application for `sdkScopeBlocked`, active `projectWrites`, builds (`busy`), publishes (`publishSlots`), device deployment, and Codex or WeChat builds. Direct `apply` receives HTTP `409`. While `dirty`, `resourcesDirty`, or local build/save/publish/deploy activity is present, the browser checks with `autoApply: false` and defers automatic `window.location.reload()`. Saving source and resource policy allows updating or reloading to resume. Open pages also check hourly.
- **Completed backup and verified rollback health.** Before stopping Studio on 8791, `upgradeApply` completes `prepareSdkUpgradeBackup` and writes `backup-complete.json`. If the new start or `/health` fails, it restores the backup and restarts the old service. Only a healthy old service warrants `rolledBack: true`. Failed recovery reports `rolledBack: false`.
- **One recovery entry and cold restart.** `status()` and `editor/server.ts` no longer call `recoverInterruptedSdkUpgrade`. Only `editor_service.mjs` `restart()` performs recovery, after stopping the managed old process. After recovery it immediately cold-starts the disk copy of `scripts/editor_service.mjs` via `spawnSync` to use restored metadata.

## 3. Validation

- **Unit tests and safety gates** (`sdk/editor/test/studio_upgrade.test.ts`, `sdk/scripts/tests/prebuilt_tools.test.ts`, `sdk/scripts/tests/editor_service.test.ts`).
  - Stable semver parsing and ordering, GitHub HTTPS allowlist, and rejection of unsafe tar entries with path traversal, absolute paths, drive letters, backslashes, symlinks, or excessive size.
  - Source workspace protection, standalone concurrent merge behavior, and invalid hash rejection.
  - Authenticated `downloading` → `spawning` → `applying` process lock handoff using `handoffToken`, `targetVersion`, and `stageDir`, plus bounded Windows `EBUSY`/`EPERM` retries.
  - Server busy deferral (HTTP `409` and `deferredReason`) and resumption after saving.
  - Staged validation of release packages with future compiler `upstreamRevision` and `bytecodeAbi`, plus real disk constants after update through `resolvePrebuiltTools` and `editorToolEnvironment(options, sdkRoot)`.
  - Preserving custom files nested inside managed directories, rejecting incomplete backups for rollback, and limiting interrupted recovery to `restart()`. `status()` does not trigger recovery.
- **Actual standalone CLI replacement and Playwright Chromium end-to-end integration**, without injected internal `deps` substitutes.
  - Install actual `scripts/editor_service.mjs`, `scripts/studio_upgrade.mjs`, `scripts/prebuilt_tools.mjs`, `scripts/native_probe_path.ts`, and a live health service in a temporary standalone SDK. Temporarily remove `POCKET_SOURCE_BUILD` to exercise the real `prebuiltEnvironment` and future ABI checks.
  - Unsaved drafts (`dirty`) defer automatic update. Clicking Save triggers actual detached `editor_service.mjs upgrade-apply` handoff. `/health` reports a new `pid` and `version` 0.1.11 with the new ABI. Playwright observes native navigation via `page.waitForNavigation`, without hooks or explicit `page.reload()`.
  - Simulate a new service startup crash and run real CLI rollback. Confirm truthful old-version health and no browser reload loop.
- **Actual 0.1.10 cross-platform release archives.** The public macOS `darwin-arm64` and Windows `win32-x64` standalone SDK archives were extracted and checked with `validateStagedStandaloneSdk`.

### 0.1.12 release verification fixes

- macOS `/var` and `/private/var` aliases can make canonical Node ESM paths differ from CLI arguments. The service entry compares `realpathSync` when path strings differ. An actual CLI execution through a symlinked directory now catches false success without command execution.
- The upgrade browser test uses Bun 1.4.4 like the existing Editor tests. The actual standalone child service uses Bun 1.3.9 pinned by `resolveManagedBun`. Chromium startup has a 15-second limit and logs phases for platform-specific diagnosis.
- In an isolated source snapshot, 34 tests and 284 assertions passed across upgrade, service config, prebuilt tools, packaging, and SDK export. Coverage included real replacement, browser auto navigation, and rollback.
- On Windows, service ownership compares files with `realpathSync` when command-line paths differ, supporting short/long paths and junctions. Shutdown excludes the updater's process branch from `taskkill /T` and still cleans other worker trees. Pre-shutdown validation failures persist errors so the page stops waiting. Path aliases, process-tree partitioning, and preflight failure states passed. Argon Medium reviewed the patch.
- Windows management uses the existing Node CLI and keeps the service on Bun 1.3.9. `realpathSync.native` compares command-line, PID record, and health-check paths, supporting 8.3 paths and retaining the selected project. The final focused lifecycle and service config suite passed 24 tests and 138 assertions. The earlier five-suite run passed 37 tests and 296 assertions.
- The Windows ablation showed that launching the updater directly from Bun 1.3.9 still causes `EADDRINUSE` in the replacement service even with Node and ignored stdio. That branch was removed. Windows starts the existing Node manager with PowerShell `Start-Process` in a separate window without standard-stream redirection, then waits for the launcher to exit and return a valid PID. State machine, authentication, backup, and rollback are reused. macOS still spawns the original CLI directly.
- Release run `42999927580` passed real standalone CLI upgrade, update resumption after draft save, automatic browser refresh, rollback, and service config on macOS and Windows. The Windows run showed neither path misidentification nor inherited port contention. The local lifecycle fixes passed 24 tests and 138 assertions. Argon Medium reviewed the final launcher adaptation.

## Windows updater ancestry and SDK 0.1.15

The Windows launcher deliberately uses the existing PowerShell `Start-Process`
path above; replacing it with direct Bun/Node spawn reintroduces the port-handle
inheritance failure already captured by the earlier ablation. Its short-lived
launcher can exit before retirement. Windows `ParentProcessId` may then refer to
an exited process or a reused PID ([Microsoft Win32_Process reference](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)).

A protected retirement must therefore avoid recursive OS tree termination.
Build one plan from the process snapshot, exclude the updater and its visible
descendants, and signal only the enumerated old-server PIDs in child-first
order. Reject invalid snapshots or a target inside the protected subtree.
Before TERM and KILL, share one identity check against current PID facts;
missing or mismatched command/binary fields prevent signaling. Wait for every
planned PID, including Workers that ignore TERM, before completing retirement.
Individual process termination does not terminate children on Windows
([Microsoft process termination reference](https://learn.microsoft.com/en-us/windows/win32/procthread/terminating-a-process)).
This retains cleanup of known old Workers without requiring a complete live
ancestor chain or relaxing protection into an unproven recursive fallback.

The PR CI now runs the same Windows standalone upgrade and rollback command as
the Release job, including real detached CLI execution and Playwright Chromium
navigation. Final macOS and Windows archives remain subject to the release
installation/runtime gate. The unsuccessful 0.1.14 candidate was not published;
its tag remains immutable, and this release uses SDK version 0.1.15.


## Automatic updates in Git source mode

### Sources and reuse

A follow-up review of the retained parent, excluding `pocket_host/`, inspected `mini_apps/syslib/pocket_syslib_ota.js` and `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md`. The first provides Guest AOT version, ABI, and rollback logic. The second describes host and mini-app resource updates. Neither covers Git updates for a desktop source workspace. The retained directory no longer contains `lib/core/yooasset_package_manager.dart`, which earlier notes cited.

Source mode uses the existing stable release discovery, archive download and SHA-256 checks, safe extraction, platform tool validation, upgrade lock, detached process, service ownership, and health probes. The Git boundary adds workspace eligibility, target commit selection, and fast-forward updates.

### Automatic application and file preservation

- Source mode automatically applies eligible updates on initial and periodic checks, like standalone mode. The client checks `autoUpgradeSupported`. Unsaved drafts and active server builds, saves, publishes, and deployments still defer update and refresh.
- Source updates follow official stable GitHub releases. Before applying, verify the origin repository, `main` branch, workspace state including staged and untracked files, and fast-forward relation from HEAD to the target release commit. Local changes, divergence, or a dependency change without a valid npm lockfile produce a specific deferral reason. The updater preserves developer files and does not stash or commit. Before advancing or rolling back, check whether added target paths conflict with existing files or blocked ancestors, including ignored consumer files. The forward merge explicitly disallows overwriting ignored paths.
- Compare npm lockfiles structurally while ignoring the SDK root version. Bun's `bun.lock` is JSONC. Compare its raw Git text conservatively without parsing or rewriting it as JSON. If lockfiles are unchanged, reuse lightweight tool replacement. When dependencies change and a valid npm lockfile exists, 0.1.21 and later run bounded `npm ci --ignore-scripts --legacy-peer-deps` with development and optional dependencies explicitly included, then install the verified tool package. Temporary Git fixtures use the actual `sdk/bun.lock` to exercise identical and changed text.
- Use matching platform tools from the verified archive so compiler and probe advance with the source version. Git updates Git-owned files. The standalone archive serves only verified tools in source mode.
- Recheck eligibility before shutdown and application. Start a new service and verify version and health afterward. On failure, restore old tools and service configuration only when the safety checks pass. Return to old HEAD only if HEAD still equals the selected target and the workspace remains clean. Avoid unconditional `reset --hard` and removal of untracked files. Verify backup completeness, version, and ABI before restoring tools. Leave current tools intact if the backup is missing or corrupt. If new local changes, ignored-path collisions, or an external HEAD change prevent rollback, retain backups and report the on-disk version. Preserve and resolve those changes manually, then retry through managed-service restart. The updater reports unsuccessful rollback and avoids launching mismatched tools.

### Local upgrade evidence

The development workspace fast-forwarded from `d547885` to published SDK 0.1.15 (`7f18206`). Existing edits were preserved and restored without conflicts, with stash backup `pocket local changes preserved before SDK 0.1.15 update`. Verified macOS arm64 tools were synchronized, and the service configuration switched from old source build outputs to the packaged compiler and probe. Actual `/health` returned `version: 0.1.15`, and Playwright Chromium loaded a workbench showing `v0.1.15` without page errors. Five existing tests passed for the Preview host adapter, deferred SystemUI requests, and failure handling.

New real temporary Git repository tests on Bun 1.3.9 passed 15 tests and 50 assertions. They cover fast-forward admission across version changes, preserving staged, unstaged, and untracked files, rejection of the wrong branch, detached HEAD, diverged history, wrong or rewritten origin, deferral on dependency graph changes, release tag retrieval over actual local SSH and temporary ref cleanup, and rejection of source/archive/tool ABI mismatch. They use no public GitHub access or developer repository changes.

CI and Release lifecycle gates both run `editor/test/source_upgrade_git.test.ts`, covering Windows runners and release platforms while retaining standalone upgrade and rollback execution.

The final Bun 1.4.4 combined run passed 53 tests and 372 assertions:

```sh
POCKET_SOURCE_BUILD=1 npm exec --yes --package=bun@1.4.4 -- bun test --timeout 60000 editor/test/studio_upgrade.test.ts editor/test/source_upgrade_git.test.ts scripts/tests/editor_service.test.ts editor/test/studio_workbench_layout.test.ts
```

The actual source CLI uses temporary Git repositories and an explicit test marker to bind a dynamic port. It verifies authenticated handoff, complete stage and tool digests, Git fast-forward, new HTTP version and PID, and normal restart after upgrade. The test leaves an old native probe in place and confirms that later restart still binds verified tools. Failure cases include Git and tool restoration after unhealthy startup, ignored-file conflicts, pre-shutdown rejection of corrupt archives, and reporting the actual disk version when rollback cannot run. Actual standalone detached CLI, Playwright auto refresh, and failure rollback also passed, as did architecture checks and `git diff --check`.

## Editor automatic update progress in 0.1.16

- `createStudioUpgradeManager` exposes `downloadedBytes` and optional `downloadTotalBytes` in existing state. `readBoundedResponseBytes` preserves the byte cap and reports bytes consumed while streaming. It exposes a total only for integer `Content-Length` without HTTP `Content-Encoding`, so compressed response size cannot be mistaken for actual download size. Unknown totals show received bytes alone.
- During the existing upgrade `POST`, the Editor uses the same short polling timer to read `/api/studio/upgrade` and show actual `downloading`, `applying`, and `restarting` phases and incoming bytes. The timer handle remains the request mutex while GET is pending, preventing another upgrade POST. When the POST completes, polling stops and the existing `/health` restart probe resumes.
- A browser check can reach the new process before the detached updater releases its lock. When persisted status is `up-to-date` with `currentVersion` equal to the actual install, the manager syncs that terminal state if its memory state is `idle` or `restarting`. Active phases, including `checking`, download, and apply, retain priority. Stale terminals for a different version are ignored. A targeted regression starts with restart-state initialization, writes the success terminal while holding the lock, then checks from a new page. Without idle synchronization it gets `idle`. With the fix it gets `up-to-date`.
- The header explicitly shows **Automatic updates enabled**, **Automatic updates deferred**, or **Automatic updates unavailable**. It displays full wrapping text for unsaved Editor drafts, resource policy changes, and backend `deferredReason`. Source Git deferral has separate wording so saving an Editor draft is not presented as the fix. Narrow headers wrap the text and keep it visible.
- Unit tests cover per-chunk bytes with a trusted total and withholding totals for `Content-Encoding`. The real Chromium lifecycle uses actual standalone CLI download from a local Node HTTP fixture that sends the package with `Content-Length` in chunks and pauses after the first. Playwright checks automatic-update status, the full draft deferral reason, and visible percentage at 1280 px and 831 px, and confirms exactly one upgrade POST during download. Releasing the remaining chunks then verifies new service PID/version, browser reload, and health. A separate actual CLI test covers rollback after startup failure.
- Local Bun 1.4.4 passed 19 tests and 198 assertions with `POCKET_SOURCE_BUILD=1 npm exec --yes --package=bun@1.4.4 -- bun test --timeout 60000 editor/test/studio_upgrade.test.ts`. The suite includes byte progress and compressed length unit tests, actual chunked downloading, Playwright Chromium displays at 1280 px and 831 px and the concurrent POST gate, real service PID/version and refresh, and actual CLI rollback.

## Source dependencies and full recovery in 0.1.21

A further retained-parent review, excluding `pocket_host/`, inspected `mini_apps/syslib/pocket_syslib_ota.js`, `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md`, and top-level `fix.sh`. The first two manage Guest and resource updates and the last repairs the Flutter/native project. None implements a Studio Git dependency installation transaction. The new flow reuses locked install policy from `scripts/toolchain.mjs` and validation, completion markers, ownership, health, and rollback in `studio_upgrade.mjs` and `editor_service.mjs`.

When dependencies change, the existing backup journal saves all old `node_modules` including old tools before shutdown. This avoids a duplicate tool backup. After fast-forward, a locked install runs for at most five minutes with root and workspace lifecycle scripts disabled, then applies verified platform tools. Install failure, timeout, startup failure, and interruptions use existing rollback to restore Git, the full dependency tree, and tools. If safe rollback cannot run, backups remain and the actual version is reported. If npm removed dependencies before the interruption, the manager loads its process-management dependencies from the completed snapshot, enforces service ownership, stops the service, and restores files even when the live dependency directory is missing.

A real temporary Git repository with a registry-free npm workspace verifies JS imports after install, absence of root and workspace lifecycle execution, mismatch and timeout failures, restart failure, live CLI service inspection with a missing dependency directory, and restoration of original dependency bytes, tools, and HEAD. Actual service CLI upgrades and Playwright Chromium lifecycle tests remain. Real 0.1.20 and 0.1.21 dependency declarations and lockfiles passed both old and fixed eligibility checks for automatic 0.1.20 → 0.1.21 fast-forward without reinstalling dependencies.

Existing 0.1.19 installs apply their old gate before downloading new code. Crossing the added COS workspace boundary for the first time requires one clean source fast-forward, official `npm run setup` with matching tools, and restart. Keep lock validation enabled. 0.1.20 already includes COS and can auto-update to this patch. Later versions use the fixed installer. See `RELEASE_0.1.21.md`.

## Troubleshoot an unreadable Git source workspace status

Compare `/health.version` for loaded service code with `/api/studio/upgrade.currentVersion` for the on-disk install. A running service keeps its loaded modules after manual source changes. If the versions differ, use managed `npm restart` from that install, retain the project binding, and check again using the single managed listener.

In the SDK directory run `git --version`, `git -C .. rev-parse --show-toplevel`, and `git -C .. status --porcelain=v1 --untracked-files=all`. Check the Studio service's actual PATH as well as the interactive shell. Missing Git, an extracted archive without `.git`, Git ownership rejection, and timeouts are distinct. Current development builds report the underlying cause. Older versions combine them into one message. The updater leaves `safe.directory` and global Git trust settings unchanged.

On 2026-11-16, homemini macOS Web Preview had live `/health` version 0.1.18 and disk version 0.1.19. All Git commands succeeded in that repository. Managed restart loaded 0.1.19 and the check correctly reported staged, modified, or untracked files. Existing remote development edits, including `pocket_sync`, were preserved, and 0.1.21 was left uninstalled. This confirms the restart recovered checks on that machine. Other failures with the same message require their own diagnosis. Workspace edits remain user files.
