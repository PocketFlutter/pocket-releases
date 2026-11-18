# SDK Source Guide

`/Volumes/ORICO/Development/Github/pocket/sdk` is the sole entry point for the reusable implementation.
`../demo` consumes it as the Showcase. Start with the entry points below.

## Three Entry Points

| File | Purpose |
| --- | --- |
| `lib/pocket_sdk.dart` | External Flutter projects import `PocketApp`, `PocketGuest`, configuration, and session APIs here. |
| `pocket.ts` | Scaffold projects, build QuickJS bytecode, prepare iOS and Android native projects, and start the Editor. |
| `packages/pocket_ui/src/index.ts` | Public entry point for the JS/TSX component library. JS composes pages, themes, navigation, and forms. |

## SDK Execution Path

```text
consumer app.tsx
  → sdk/packages/pocket_ui
  → sdk/scripts/build_guest.ts + pinned PocketJS compiler
  → app.qjbc + app.pak
  → sdk/native QuickJS/PocketJS runtime
  → sdk/packages/pocket_flutter PocketView
  → Flutter Canvas / system TextField / registered native plugins
```

The host loads QuickJS bytecode generated at build time. JS source is unavailable as a runtime fallback. Flutter handles rendering, resources, lifecycle, system input, and explicitly registered native capabilities. JS owns business pages, state, routing, transitions, and component composition.

## Directory Map

```text
sdk/
├── lib/pocket_sdk.dart       # Public Flutter SDK entry point
├── pubspec.yaml              # package:pocket_sdk
├── pocket.ts                 # Sole CLI: init / build / editor
├── packages/
│   ├── pocket_flutter/       # PocketView, bytecode loading, rendering, IME, platform textures
│   ├── pocket_hardware/      # iOS/Android hardware providers, permission and capability protocols
│   ├── pocket_services/      # Updates, signing, caching, plugin lifecycle
│   └── pocket_ui/            # @pocket/ui JS components, mobile, responsive, glass
├── native/                   # Rust FFI, QuickJS runtime, bytecode compiler
├── scripts/                  # Upstream setup, guest and native builds, package signing, checks
├── editor/                   # Local source editing, compilation, signing, and publishing service
└── docs/                     # API, provenance, validation, performance, and migration records
```

`.cache/`, `.pocket-build/`, `native/target/`, Pods, and Flutter build are all generated outside the SDK source entry points. The historical migration archive was removed. [SDK integration](SDK_INTEGRATION.md) covers adding the SDK to an existing Flutter project. [Validation](VALIDATION.md) records verified capabilities and current limitations.

## Common Commands

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
bun pocket.ts init /path/to/my-app --sdk-root "$PWD"
bun pocket.ts build /path/to/my-app --sdk-root "$PWD" --platform=ios-sim
python3 scripts/check_architecture.py
bash scripts/editor_service.sh start
```

`pocket.ts init` scaffolds an independent consumer without copying `demo`. Build the Demo JS from `/Volumes/ORICO/Development/Github/pocket/demo/js`. The Editor also creates projects from the public SDK template. Demo pages and state are private to the Showcase.
