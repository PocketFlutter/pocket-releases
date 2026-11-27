# Central Builds in `PocketFlutter/pocket-releases`

`PocketFlutter/pocket-releases` hosts centralized manual CI and release builds on GitHub-hosted runners for private Pocket repositories while keeping source checkouts, test diagnostics, and signing credentials confidential.

## Pocket Source CI (`pocket-source-ci.yml`)

- **Protected workflow and Git credential**:
  - Dispatched manually via `workflow_dispatch` on `refs/heads/main` inside the main-only `pocket-source-ci` environment.
  - Uses the read-only `POCKET_SOURCE_SSH_KEY` secret to check out `PocketFlutter/Pocket` with `persist-credentials: false`.
  - Disables all source/package caches, uploads no artifacts, suppresses command stdout/stderr (`exec >/dev/null 2>&1` with step-name error traps), writes only safe job status summaries, and removes `pocket-source` and temporary files with `if: always()`.
- **Revision and pre-merge branch checks**:
  - A full 40-character hexadecimal `source_sha` is always required and must match checkout `HEAD`.
  - **Default (`source_branch` omitted)**: verifies `source_sha` is an ancestor of canonical `refs/remotes/origin/main` (`git merge-base --is-ancestor`).
  - **Reviewer-authorized pre-merge branch check (`source_branch` set)**: validates `source_branch` via `git check-ref-format` as a non-`main` canonical branch name, rejects `refs/*`, `origin/*`, and fork/PR refs (`pull/*`, `pr/*`), and requires the exact remote tracking branch tip `refs/remotes/origin/<source_branch>` in `PocketFlutter/Pocket` to equal `source_sha`.
  - All inputs are bound via step `env:` variables and never interpolated directly into Bash scripts.
  - Invoke manual branch checks only for trusted, reviewer-inspected branches in `PocketFlutter/Pocket`. Publication workflows (`studio-native-release.yml`, `web-sdk-release.yml`, `package-registry-release.yml`, `sdk-packages-release.yml`) remain strictly locked to canonical `main` ancestry.
- **Future automation**:
  - Add automatic dispatch after manual verification. A GitHub App can receive source repository events and dispatch the centralized workflow, then report the result on the exact source SHA.

## Future `pocket-platform` Builds (Go & Web)

- Future centralized Go and web verification/release workflows for the private `PocketFlutter/pocket-platform` repository must provision an independent, read-scoped SSH deploy key (separate from `POCKET_SOURCE_SSH_KEY`) and isolated environment boundary.
- Wire Go tests, disposable PostgreSQL migration checks, the Web bundle build and smoke tests once their entry points exist in the platform source. Build by exact source SHA, and deploy the verified image or asset digest through separate environment gates.
