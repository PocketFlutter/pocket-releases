# Pocket Web SDK 0.1.23

This version publishes the standalone Web SDK and Studio from the public PocketFlutter/Pocket repository. The [official installer](INSTALL_STUDIO.md) resolves the release there. GitHub Releases provides separate verified macOS arm64 and Windows x64 archives.

The SDK retains the public API and behavior documented in the [0.1.22 SDK notes](RELEASE_0.1.22.md). The compiler, QuickJS bytecode ABI, and PocketJS upstream revision retain their existing pins. See the [API index](API.md) and [Web release validation](WEB_SDK_EXPORT.md).

On Windows, Studio resolves reused process IDs with creation times during an upgrade. This prevents a false ancestry match from blocking the old service's retirement while preserving protection for the updater and its descendants. See [Studio upgrades](STUDIO_UPGRADE.md).
