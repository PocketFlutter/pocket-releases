# Apple App Store distribution

Pocket retains QuickJS, the pinned PocketJS compiler, and JS application UI. The default
remote host, signed updates, and immediate execution after download remain compatible.
Approval depends on the distribution and behavior of the particular app. This change removes
production recording entry points, packages privacy resources, and adds an optional mode
limited to bundled code.

## Build behavior

| Build | Remote loading | SDK session recording |
| --- | --- | --- |
| Default Debug / Profile | Existing signature checks | Explicit opt-in. Idle by default. |
| Default Release | Existing signature checks | Disabled. The recording plugin is never mounted automatically. |
| `POCKET_APP_STORE=true` | Remote hosts and QJBC updates disabled | Disabled |

`POCKET_APP_STORE` is a compile-time host option for apps that can start from bundled code.
Products that rely on remote code for startup should keep the default build settings.
Choose the mode according to the app's distribution design and review requirements.

```sh
# Retain remote loading. Release disables SDK session recording.
flutter build ipa --release

# Optional for standalone apps that ship all QJBC and PAK assets in the IPA.
flutter build ipa --release --dart-define=POCKET_APP_STORE=true
```

The optional mode rejects remote operations before creating a host HTTP client, reading
the remote cache, or creating update storage. Sessions configured with `updates` or
`downloadOnOpen` return an error. `updates.status` remains available. Update check, apply, and
rollback capabilities are unregistered. Ordinary business HTTP, Worker origin authorization,
native plugins, and bundled multi-app support continue to work.

Release builds omit the SystemHost default recording library and recording control plugin.
They also reject explicit recording factories, `recordOnStart`, `attach`, and `start`.
The Showcase uses its existing `supportsRecording(runtimeInfo)` negotiation for the page.
General FFI and debug entry points in `pocket_flutter` remain developer APIs, including
low-level trace symbols outside this change.

## Review requirements for remotely delivered code

This implementation reviewed Apple App Review Guideline 2.5.2, Developer Program License
Agreement section 3.3.1(B), and Guideline 4.7 in relation to the app's intended use.
Signature, hash, and ABI checks secure the package. App review separately evaluates the
actual feature scope, including whether remote updates hide or unlock undisclosed features.

For products offering online mini-apps under 4.7, the implementation review identified
prior Apple permission for exposing native APIs, per-software consent for sharing data or
privacy permissions, a software index with Universal Links, age restrictions, and content
governance. The host's `allowedPermissions` and OS prompts serve distinct runtime functions.
This change leaves consent and approval to the product's actual review and consent flows.

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)

## Parent project provenance and ablation

The implementation reviewed the retained `pocketjs_flutter_demo` tree, excluding `pocket_host/`.

- `lib/core/pocketjs_bundle_runner.dart` and `lib/core/ffi_bridge.dart` establish
  real JS and native execution and input boundaries. JS continues to own application UI.
- `docs/04_BIDIRECTIONAL_FFI_WASM_AND_YOOASSET_HOTUPDATE.md` is historical design
  evidence for code and resource separations and update safety. Some referenced paths
  are absent from the retained source, so implementation and validation need other evidence.
- `pocket_update_factory.dart`, `pocket_host_config.dart`, and `pocket_recordings.dart`
  are the current adaptation points. They reuse the update coordinator, lifecycle, and
  pinned buildGuest pipeline.

The ablation removes automatic creation and attachment of the recording library and
control plugin in production. Existing loading, state management, rendering, and
permission authorization are reused.

## Validation and release criteria

Run both default and optional configurations from `sdk/`.

```sh
flutter test test/pocket_distribution_test.dart test/pocket_config_test.dart test/recording_library_test.dart
flutter test --dart-define=POCKET_APP_STORE=true test/pocket_distribution_test.dart
```

`scripts/tests/distribution_fixture.ts` reuses the real JS input counter from
`system_update_fixture.ts` with the update dependency removed. The same buildGuest QJBC
and PAK must run in both modes. `pocket_distribution_ffi_test.dart` checks that real input
changes DrawList text from `Taps:0` to `Taps:1` and checks whether the real SystemHost
attaches the recording factory. A missing fixture or native library skips the test and
provides no execution evidence.

```sh
bun scripts/tests/distribution_fixture.ts /tmp/pocket-distribution-fixture
POCKET_DISTRIBUTION_FIXTURE_DIR=/tmp/pocket-distribution-fixture \
POCKET_NATIVE_LIBRARY=/absolute/path/to/libpocket_flutter.dylib \
flutter test --dart-define=POCKET_APP_STORE=true test/pocket_distribution_ffi_test.dart
```

See `APPLE_PRIVACY_PACKAGING.md` for privacy manifest sources and validation.
Before submission, inspect final Archive manifest resources, third-party SDKs, signing,
usage descriptions, actual data flows, and physical-device behavior. These tests establish
the exercised behavior. Apple review and inventory of update-related machine code in the
final archive require separate evidence.

### Recorded results

- Default mode passed 38 tests with zero skipped for distribution, configuration,
  recording library, host configuration, and signed SystemUI updates. The tests included
  actual native and QJBC input and remote version switching.
- Explicit `POCKET_APP_STORE=true` passed seven tests with zero skipped, including real
  input-driven drawing changes and SystemHost starting without the recording factory.
- Nine related Dart files passed analysis. Two plists and Podspec syntax passed.
  SwiftPM `dump-package` confirmed the `.copy` resource rule.
- The locally installed prebuilt tool package did not match the SDK version. The run used
  `POCKET_SOURCE_BUILD=1`, verified the pinned upstream revision first, and built the
  two fixtures and current Rust native library through the same buildGuest path.
  Version and ABI validation stayed in effect. Rust's `rust-objcopy` warned that it
  could not strip debug information because local `libLLVM.dylib` was missing.
  The build and real execution tests passed.
- A new iOS Archive, physical-device permission flow validation, and Apple review
  were outside this run.

### Consolidated review

A consolidated read-only Argon Medium review led to validation for custom capability
declarations. When a distribution setting disables updates or recording,
`additionalCapabilities` cannot re-declare the disabled capabilities. Added tests and
reran both validation groups.

Constructing `PocketHostConfig` directly creates only the configuration object.
Actual applications still go through `PocketAppConfig.validate` and the update factory
checks. `pocket_flutter` has a SwiftPM target and `pocket_archive` has a CocoaPods
target. Each includes privacy resources through its existing build entry point.
Final Archive resource placement and disabled recording still require release validation.
