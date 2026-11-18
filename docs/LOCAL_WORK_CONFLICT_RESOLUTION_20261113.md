# Reconcile local work with main

On 2026-11-13, local work in progress was restored on historical main commit `d109f59`
with user authorization to resolve conflicts, commit, and push. The original worktree
and index were backed up to `~/.codex/backups/pocket-branch-cleanup-20261113-173452/`.
The backup preserves the original work, including local versions superseded on main
and omitted from the new commit.

## Sources and decisions

- Retained main's host-native font ABI, complex text measurement, font replay facts,
  PAK font admission, and regression tests. The superseded local font implementation
  was left in the backup, so rendering and state each have a single path.
- Retained main's secondary-route pop animation, dynamic width, and retained-route
  lifecycle. Added only the Looseleaf entry point, routes, pages, and state types.
- Retained main's Editor subproject and channel publishing UI, process identity
  checks, and process-tree shutdown. Omitted the temporary local fallback for missing
  `ps` and `process.kill` dependencies.
- Restored the local `sdk/packages/pocket_looseleaf/`, `pocket_arc/`,
  `pocket_ui/src/bytes.ts`, and related tests. The public SDK stays independent of
  the Demo. JS controls use the pinned PocketJS components, input, and layout. Flutter
  keeps its existing responsibilities. Source notes preserve the original Looseleaf
  and ARC visual provenance. The original designs and runtime were reused.
- Integrated both packages through `build_guest.ts`'s publicUiPackageRoot,
  prepareUiPackage, preload, and cleanup flow. Updated the npm and Bun workspace
  lockfiles and Web SDK export paths so the packages work outside the source workspace.
- Retained the local Editor changes to mtime-based status file invalidation and lazy
  Spine loading. Used the existing safe-path boundary and added exact vendor allow-list
  entries for the two libraries.
- Main's host-native font path superseded the local bitmap fallback. The 23 MB of
  unused fonts and generated caches were omitted from the commit. The backup retains
  the original files.
- Used the machine's existing project path and Codex per the user's earlier request.
  The retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` was
  unavailable locally. This change reused the SDK code and regression scenarios
  already migrated to main, with no new Flutter-native capability or Argon delegation.

## Validation

- A fresh pinned upstream archive passed checksum validation and accepted the entire
  patch stack. The second bootstrap proved idempotent. The old compiler override from
  the font cache was removed from the validation path.
- The default source buildGuest built actual Showcase QJBC and PAK. The matching
  `pocket_probe` passed bytecode, ABI, host request-response, frame, send, pointer,
  input, and stress regressions. Gallery Lazy used multiple real drags within bounds.
- Added `scripts/tests/ui_packages_native.test.ts`. Both public packages build through
  the same pipeline. Real pointer clicks on Paper and ARC buttons progressed the
  Count from 0 to 1 to 11 and changed DrawOps. Runtime and native assertions were exercised
  with real bytecode.
- Five isolated JS suites passed, covering eight device plans, five Editor version
  cases, one Editor concurrency case, three Looseleaf cases, and four UTF-8/Base64 cases.
- ARC boundary, palette, spring, and utility checks passed. The Showcase mobile
  source and state regression passed.
- Two Web SDK export checks passed. The exported libraries contain source and
  manifests and exclude tests and caches.
- The Bun frozen-lockfile install, architecture boundaries, and diff whitespace
  checks passed.
- The existing Dart renderer and FFI were reused. This round relied on the prior
  Flutter 3.50 device and Live2D validation described in `FLUTTER_3_50_UPGRADE.md`.
  The native probe did not exercise physical-device IME or GPU visuals.

Logs and temporary artifacts are under
`/tmp/pocket-flutter-350-validation/conflict-*` and were omitted from the source commit.

## Recheck in the original worktree

After restoring the final code to the original working directory, the temporary
Solid dependency symlink in the isolated worktree proved absent from a normal install.
Added the same `solid-js@1.9.14` development dependency as the pinned upstream and
updated both lockfiles. The ARC node:assert/registerHooks checks run under Node
transform-types and use the existing narrow resolver to load the real pinned upstream
lifecycle. The filename `arc.check.ts` keeps this Node-only check outside Bun test
discovery. This affects only test imports and leaves the public runtime on the real
implementation. Seven Looseleaf and bytes checks and the ARC unit and boundary checks
passed after a normal install.
