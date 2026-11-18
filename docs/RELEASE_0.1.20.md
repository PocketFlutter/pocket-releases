# Pocket SDK 0.1.20 integration

## Included changes

- Retain Apple distribution hardening: remote loading stays enabled by default; the explicit bundled-code profile disables remote code, and Release builds omit SDK session recording. Privacy manifests follow the existing SwiftPM/CocoaPods targets.
- Add the optional JS/TS COS publisher and Studio controls, preserving signed packages, content-addressed resources and child-before-root index publication. Credentials remain local to the publishing machine.
- Add Flutter hybrid Tab hosting, initial mini-app launch/results and shared storage leases. Flutter transports lifecycle and native route facts; JS SystemUI owns mini-app stack and presentation policy.
- Integrate the released `sdk-v0.1.19` mainline (skin/router/fast UI and optional ecosystem surfaces) before building this version. Update SDK/package-lock/tool admission versions together to `0.1.20`.
- Fix a build failure discovered during integration: System manifest validation now checks the SDK `surfaces.modules` extension using the existing ecosystem module resolver, then passes only the upstream schema fields to the pinned validator. Invalid module IDs and unrelated unknown properties remain errors; input files are unchanged. This adapts the existing `build_system.ts`, `ecosystem_scaffold.ts` and project-font extension boundary rather than adding another compiler/schema engine. The retained-parent sources inspected for the feature migrations are documented in `COS_PUBLISH.md`, `HYBRID_FLUTTER_TAB_HOST.md` and `APPLE_APP_STORE.md`.
- Rebuild Showcase, Profile and Lobby through the pinned buildGuest/QJBC pipeline. Update Settings regression expectations to the Default skin's current canvas tokens.

## Local branch audit

| Removed branch | Evidence / preserved state |
| --- | --- |
| `codex/apple-app-store-hardening` | Already at the mainline commit `347682a`. |
| `fix/sdk-release-0.1.14` | Tree identical to squash commit `318cba6`. |
| `fix/sdk-release-0.1.15` | Tree identical to squash commit `7f18206`. |
| `fix/source-auto-update` | Tree identical to squash commit `2fb3ece`. |
| `codex/native-rounded-shapes-20261110` | Rounded-shape work retained by `6035de9` and `e33543b`; its attached worktree was clean. |
| `codex/runtime-incremental-20261104` | Historical isolation snapshot; current main already contains frame deltas, guest admission and HMR. All 44 dirty-source paths exist in current main, 19 are byte-identical; current frame-delta encoding additionally avoids an intermediate allocation. Full uncommitted source state archived before removal. |
| `build/windows-0.1.1-20261106` | Branch commit is an ancestor of main; current tooling/docs contain its Node and Windows consumer fixes. Full dirty-source state archived before removal. |

The two dirty worktree archives are verified Git bundles under the local repository's `.git/local-branch-archives/20261116/`, with source-tree/commit metadata in adjacent text files and retained `refs/archive/local-*` refs. They preserve tracked and nonignored untracked source. Generated caches are not release source. Detached worktrees belonging to other tasks were retained.

## Validation and release boundary

Validation uses the same pinned compiler and freshly built native runtime, with explicit maintainer source-build mode because matching `0.1.20` platform tools do not exist before this release. Tool version, ABI and hash validation are retained.

- SDK Dart: 34 focused configuration/storage/host/COS tests; 3 real native QJBC and signed-update tests; 7 explicit bundled-code profile tests.
- JS: 12 COS tests, 27 kernel tests, 5 system extension/font validation tests, 17 packaging/scaffold/Studio UI tests, plus the COS end-to-end publish/download/native execution scenario.
- Real Showcase native Settings regression passed for theme/accent/density/reset/navigation/persistence. The Hybrid Tab unit test and real macOS integration scenario both passed; the latter verifies actual QJBC input, tab suspension/native Back, fullscreen direct launch/results and shared storage. The mock-runtime unit test is not used as proof of JS execution.
- Architecture check, Dart analysis, version equality and whitespace checks are required before release submission.

The existing `Pocket Web SDK release` workflow builds the Web engine and both platform tool packages, then runs clean macOS/Windows consumer acceptance before producing GitHub Release attachments. Submission of `sdk-v0.1.20` does not by itself mean the workflow has passed. No npm registry publication or separate source-repository publication is part of this release operation.
