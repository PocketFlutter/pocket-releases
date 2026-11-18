# Pocket Web SDK 0.1.24

This version updates the standalone Web SDK and Studio packages published from the public PocketFlutter/Pocket repository via the [official installer](INSTALL_STUDIO.md).

- `@pocket/liquid-glass` UI package (`packages/pocket_liquid_glass`) and opt-in native surface bridge (`@pocket/platform` / `PocketPlatformPlugin` on iOS and Android): see the [Liquid Glass package guide](LIQUID_GLASS_PACKAGE.md), [Optional plugins](OPTIONAL_PLUGINS.md), [JS API](JS_API.md), and [Flutter API](FLUTTER_API.md).
- Project-local Preview host adapter configuration (`previewHostConfig` / project preview host profiles) and Studio server graceful SSE connection draining on shutdown: see [Editor project configuration](EDITOR_PROJECT_CONFIGURATION.md#project-local-preview-host-adapter) and [Tooling API](TOOLING_API.md).
- Windows parent PID reuse handling during Studio upgrades: see [Studio upgrades](STUDIO_UPGRADE.md) and commit `235b5b5`.
- The pinned QuickJS compiler revision (`UPSTREAM_REVISION`) and guest bytecode ABI (`BYTECODE_ABI`) remain unchanged from `0.1.23` (no bytecode ABI break).
- `@pocket/tftc` and its protocol/acceptance docs were moved to a separate private package and excluded from the public SDK and standalone Web SDK export (see [API index](API.md), [JS API](JS_API.md), and [Web SDK export](WEB_SDK_EXPORT.md)), while Preview Noble `hardware.bluetooth.*` transport ([Noble Bluetooth in Preview](LOCAL_BLUETOOTH_PREVIEW.md)) remains in the Web SDK.

See the [0.1.23 distribution notes](RELEASE_0.1.23.md), [API index](API.md), and [Web SDK export](WEB_SDK_EXPORT.md).
