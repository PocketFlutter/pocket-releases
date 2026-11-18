# Pocket SDK 0.1.22

## Hybrid Flutter host and configurable launch modes

The default Demo's Host page now has a **Hybrid Flutter host** entry. From Pocket Plaza, choose **Embed Pocket Plaza** or **Full-screen Flutter container**. The full-screen flow and the two native tabs reuse a standalone Flutter route. On return, the original Plaza instance and state are retained. Calls such as Profile → Lobby in the new container continue through the JS stack.

`InstallPocketSystemOptions` adds `openMode` and `externalOpen`. The external handler returns the existing `AppLaunch` handle when the route is accepted. Results and cancellation follow the existing protocol. A missing handler, invalid result, or launch timeout surfaces a failure. Embedded mode remains the default. See the [hybrid integration guide](HYBRID_FLUTTER_TAB_HOST.md) and [Host API](HYBRID_HOST_API.md).

## Standalone installation and Studio updates

The [one-click installer](INSTALL_STUDIO.md) installs the standalone Web SDK from the official stable release on macOS arm64 and Windows x64. It requires Node.js ≥22.22.2 and npm. It verifies the archive before preparing a new directory, preserves existing workspaces on repeated runs, and uses the existing Studio updater for subsequent upgrades. Git, Flutter, and source build tools are unnecessary.

The Editor's **Open Project** command supports the system folder picker on macOS and Windows and retains manual path entry. Canceling leaves the workspace untouched. Folder opening is available only over the Studio machine's loopback interface. See the [Studio workflow](EDITOR_STUDIO.md).

Source mode protects the Git workspace and distinguishes a missing Git executable, a non-repository path, an ownership rejection, and an inspection timeout. The installer and updater preserve uncommitted source changes. See [Studio updates](STUDIO_UPGRADE.md) for troubleshooting an old process after an on-disk update. Previously shipped updaters retain the checks they shipped with.

## API documentation maintained with the source

The [API index](API.md) links to the Flutter, JS/TS, plugin, Host, and toolchain references. The exported Web SDK includes the full developer documentation. Links to source omitted from the package target the matching provenance commit. Maintenance rules, the PR template, and CI require public API changes to update the references, examples, and machine-readable inventory. Automated documentation checks complement behavioral and platform verification.

## Validation scope

The hybrid host ran real pointer input against pinned QJBC and native FFI on macOS. Regressions covered switching between full-screen and embedded modes, results and cancellation, cross-container storage, and retention of the source instance. Additional checks covered widgets, the JS System kernel, source update diagnostics, and the export contract. See the individual topics for execution records. Android and iOS hybrid-host device acceptance remains pending. Installation and execution claims for the Web toolkit depend on this release's CI artifacts.
