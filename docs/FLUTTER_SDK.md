# Pocket SDK

Use this entry point to integrate Pocket into a Flutter project. Write application pages, component composition, themes, routing, and state in JS. The SDK handles bytecode loading, rendering and input, platform geometry, signed updates, plugin admission, and the runtime lifecycle.

```dart
import 'package:flutter/material.dart';
import 'package:pocket_sdk/pocket_sdk.dart';

void main() => runApp(const PocketApp(
  config: PocketAppConfig(appId: 'com.example.myapp'),
));
```

Declare a `pocket_sdk` path dependency and four build artifacts in `pubspec.yaml`: `assets/app.qjbc`, `assets/app.pak`, `assets/app.bytecode.json`, and `assets/guest-manifest.json`. From the SDK root, use `pocket.ts init` to scaffold a standalone project and `build` to compile real QuickJS bytecode. See the [integration guide](SDK_INTEGRATION.md) for all steps.

To embed Pocket into an existing Flutter app, add `PocketGuest(config: ...)` inside its `MaterialApp`. The guest renders at the size of its parent and persists through window resizes. Keep application pages in JS. `PocketApp` provides a standalone launch shell, and `PocketGuest` embeds the same implementation and lifecycle.

Optional configuration

- `updates: PocketUpdateConfig(...)` connects to a signed release source. `PocketUpdateConfig.fromEnvironment()` reads the four `POCKET_*` development settings. The client receives only the public key.
- `showFps: true` shows live metrics. Each `appId` maintains its own bounded history.
- Consumers explicitly depend on `pocket_hardware` and register capabilities through `pluginFactories`. Use `allowedPermissions` to set host policy. The JS manifest can only narrow that policy, and the host requests OS permission after a user action.
- `pluginFactories` injects application plugins. Each factory receives a `PocketViewController` and creates a fresh instance on every verified guest switch. The SDK handles admission, activation, revocation, and disposal.
- Customize the four asset fields as needed. The runtime accepts only bytecode with a matching ABI.

Use `PocketSession(config: ...)` to manage the runtime directly. Await `close()` to wait for plugin shutdown and persistence of history. The SDK provides session, bridge, and update-switching logic for ordinary apps.

This source SDK supports local integration. npm and pub.dev releases are pending. The minimum iOS deployment target is 15.0, the Android renderer requires API 24 or later, and the current Android native archive provides only `arm64-v8a`. Building the Duo native geometry bridge requires Xcode / SDK 27.1 or later. Older iOS runtimes return empty reserved regions. The Android hardware provider shares the iOS capability and MethodChannel protocol, with physical-device verification still pending. Native plugin updates require a host rebuild. JS hot updates carry the guest only.
