# Pocket SDK 0.1.21

This patch fixes source Studio updates across SDK dependency changes. The updater retains official-origin, clean-main, fast-forward, release provenance and platform-tool integrity checks. A changed dependency graph is installed from the npm lockfile with lifecycle scripts disabled; failed upgrades restore the previous source, dependency tree and tools. Releases without dependency changes retain the lightweight tool replacement path.

## Upgrade boundary

The previous updater executes locally before any new release code is installed. Publishing this patch cannot change the dependency guard already running in 0.1.19. Users crossing from that version to the COS workspace addition need a one-time source update followed by the official `npm run setup` with matching verified platform tools, then a Studio restart. Preserve consumer changes and use the normal clean-main fast-forward requirements. Do not disable the old guard or ignore lockfile changes.

Version 0.1.20 already contains the COS workspace; its dependency declarations and lock graph are unchanged in 0.1.21, so its existing automatic update path can install this patch. Later source upgrades use the repaired updater.

## Release checks

Local validation: 64 upgrade tests / 471 assertions, including the real service CLI and Playwright Chromium lifecycle; the five dependency transaction scenarios also pass after making the failure fixture registry-free. Thirteen packaging tests, architecture boundaries, syntax, whitespace and version consistency checks pass. Actual 0.1.20 manifests pass both the old and new updater eligibility checks for 0.1.21 without dependency installation.

The existing Pocket Web SDK release workflow produces platform packages and Web SDK archives and runs macOS/Windows consumer acceptance before publishing the release. A pushed tag alone is not evidence that those checks completed.
