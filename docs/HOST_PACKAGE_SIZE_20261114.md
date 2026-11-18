# Host Package Size and Release Build Reductions

2026-11-14. Flutter 3.50.0 / Dart 3.14.0. Local builds targeted macOS arm64, Android arm64, and physical iOS devices (arm64). This report distinguishes the full Showcase, the minimal consumer app, native static libraries, and distribution archives.

## Measurements

| Build | Logical file size | Details |
| --- | ---: | --- |
| Showcase Release baseline | 119.437 MiB | All currently staged Guests and optional plugins, built with `--analyze-size` |
| Same static library and resources, entry-point linking | 118.918 MiB | Down 543,856 bytes, approximately 531 KiB |
| Minimal app template Release | 30.032 MiB | Measured again after refreshing the native library, with Showcase, Live2D, and the hardware umbrella package omitted |
| Minimal app local ZIP | 12.142 MiB | Produced by `ditto -c -k --keepParent`. Store download sizes require separate measurement |
| Minimal app Release with separate Dart debug symbols | 28.968 MiB | `--split-debug-info` keeps symbol files on the build machine |
| Local ZIP after splitting symbols | 11.690 MiB | Same `ditto` command |
| Minimal Android template APK, initial Release | 26.520 MiB | Targeted android-arm64, with other ABI libraries still included by plugins |
| Android APK, aligned ABI and split symbols | 22.826 MiB | 23,934,741 bytes, arm64-v8a only |
| Android APK, native libraries also compressed | **10.835 MiB** | 11,360,877 bytes. Same runtime libraries and Guest, with native libraries extracted at installation |
| Minimal iOS template Release `.app` | 24.736 MiB | 25,937,498 bytes, unsigned physical-device arm64 build |
| iOS `.app` after splitting Dart symbols | **23.665 MiB** | 24,814,786 bytes, unsigned physical-device arm64 build |
| Local iOS IPA ZIP after splitting symbols | **9.965 MiB** | 10,449,308 bytes, unsigned local ZIP. App Store download sizes require separate measurement |

The minimal project includes 0.213 MiB of QJBC, PAK, metadata, and manifest files. It uses the real PocketJS/QuickJS runtime and preserves the compiler contract. These measurements describe the current template. A theoretical minimum was outside the scope of the measurements.

Minimal package breakdown for the same Release build with `--analyze-size`:

| Component | MiB |
| --- | ---: |
| Flutter engine and ICU | 14.892 |
| Native host and plugins | 9.047 |
| Dart AOT | 5.495 |
| Guest bytecode, PAK, and declarations | 0.213 |
| Other metadata and resources | Approximately 0.385 |

Release applies Dart AOT and tree shaking by default. The `--tree-shake-icons` option operates on icon fonts. The Flutter engine, QuickJS native library, and app PAK are outside Dart reachability analysis. Flutter also distinguishes uploaded packages from store-processed download and installation sizes. [Flutter app size documentation](https://docs.flutter.dev/perf/app-size)

## Implemented Reductions

### Link macOS by FFI entry point

The macOS podspec adopts the existing iOS SwiftPM `Package.swift` approach. It replaces library-wide `-force_load` with `-u` roots for the five existing creation and attach entry points and retains `-export_dynamic`. Dart still resolves FFI symbols in the process image, and JS, Worker, and rendering integration follow their existing paths.

Both builds used the same initial static library, Guest, resources, and Release options.

| Item | Original | Entry-point linking |
| --- | ---: | ---: |
| Host executable bytes | 8,706,304 | 8,162,448 |
| Exports starting with `_pocket_` | 108 | 108 |
| Logical bytes in full package | 125,238,684 | 124,694,828 |

This binary ablation preceded the native archive refresh. The final minimal-template figures above use the refreshed library built from current source. Each comparison applies to its own inputs. The disk size of an `.a` archive and its contribution to the linked app are separate measurements.

### Request only the supplied ABI in generated macOS projects

The first minimal consumer build showed that the generated project still attempted to compile x86_64 Pods while the SDK shipped only an arm64 library. Scaffolding and repeated builds now reuse the retained Demo's `macos/Podfile` configuration to set arm64 and macOS 12 idempotently. The patch preserves other consumer settings and leaves global Flutter configuration alone. The minimal project then completed a real Release build.

### Filter unsupported Android ABIs

After setting `--target-platform=android-arm64`, the initial APK still included x86_64 and armeabi-v7a copies of `libc++_shared.so` and `libpocket_archive.so` supplied by plugins. The SDK's QuickJS library supports arm64-v8a only.

The scaffold's `patchAndroidMinimum` now adds an arm64 filter to the default configuration. It preserves an existing explicit `abiFilters` setting and defers to Flutter's split configuration in `split-per-abi` mode. Together with split Dart debug symbols, the resulting APK measured 22.826 MiB, down 3,873,791 bytes (13.93%) from the initial 26.520 MiB. The comparison measures both settings together.

The final APK contained only `arm64-v8a` under `lib/`.

| Uncompressed APK contents | MiB |
| --- | ---: |
| `libflutter.so` | 10.821 |
| `libpocket_flutter.so` | 4.609 |
| Dart `libapp.so` | 4.438 |
| `classes.dex` | 1.672 |
| `libc++_shared.so` | 1.195 |
| `libpocket_archive.so` | 0.451 |
| Guest bytecode, PAK, and declarations | 0.213 |

The table reports logical sizes of individual uncompressed ZIP entries. The APK file size is measured separately. Local builds used SDK 36, Gradle 9.3.1, AGP 9.1.1, and NDK 28.2.13676358 for the app and QuickJS. The archive plugin used NDK 28.1.13356709 according to its existing configuration. Flutter dependency version checks ran normally. The default Gradle 9.5 archive for the new template was damaged locally, so only the acceptance project under `/tmp` used the compatible version above. The APK used a local test signature. Store upload and physical Android installation were outside the validation scope.

### Enable native-library compression for a compact Android APK

Add the property to the minimal consumer's `android/gradle.properties`.

```properties
pocket.compressNativeLibraries=true
```

Then run the Release build.

```sh
flutter build apk --release --target-platform=android-arm64 --split-debug-info=build/symbols
```

The existing SDK init/build Android patch adds support for this property idempotently in Kotlin and Groovy. Omitting the property keeps AGP's default. Setting it to `false` explicitly disables compression. Other values fail during configuration. A consumer's existing `useLegacyPackaging` setting takes precedence. Run Pocket build once in an existing project to add the property-reading logic.

| APK comparison | Bytes | MiB |
| --- | ---: | ---: |
| Directly mapped native libraries, split symbols | 23,934,741 | 22.826 |
| ZIP-compressed native libraries, split symbols | 11,360,877 | **10.835** |
| Reduction | 12,573,864 | **52.53%** |

SHA-256 matched across both APKs for all six `.so` files, `classes.dex`, `app.qjbc`, and `app.pak`. Runtime capabilities, compiler, and model and image quality stayed identical. The manifests had `extractNativeLibs=false` and `true`, respectively. Native library ZIP entries used stored and deflated modes, respectively.

AGP compresses `.so` files with `useLegacyPackaging=true`. This reduces the file size of an APK for direct distribution. Installation extracts the libraries, whose uncompressed contents total 22,691,088 bytes (about 21.64 MiB) in this build. Installation footprint and startup speed require on-device measurements, which this experiment did not perform. Measure AAB and Play download sizes separately through their delivery pipeline. [AGP native-library packaging documentation](https://developer.android.com/reference/tools/gradle-api/9.1/com/android/build/api/dsl/JniLibsPackaging)

Actual Gradle builds from the generated scaffold verified 11,360,877 bytes for `true` and 23,934,741 bytes with uncompressed `.so` files for either `false` or an omitted property. An invalid value failed during configuration with `pocket.compressNativeLibraries must be true or false`. Regression checks passed for scaffold idempotence and preservation of custom packaging policy.

### Size-optimized Rust build experiment

A native probe built from current source in an isolated target directory measured 5,315,792 bytes with the default settings and 4,871,760 bytes with `opt-level=s`. Both builds loaded the README counter's QJBC/PAK produced by the pinned `buildGuest`, sent real `input.pointer` down/up clicks, and verified the text at every value from `0 → 100`. The results measure size and correctness of the local test tool. Device frame time and startup data were insufficient to adopt this Rust profile by default. The probe's size reduction is outside the APK size calculation.

### Reusable size inventory

```sh
python3 sdk/scripts/analyze_host_size.py /path/to/App.app --json /tmp/app-size.json
python3 sdk/scripts/analyze_host_size.py /path/to/app-arm64-v8a-release.apk --json /tmp/apk-size.json
```

The script uses the Python standard library and supports directories and APK/AAB/IPA ZIP files. It groups the engine, Dart, native code, Guest files, fonts, loose media, and other resources, then lists the largest files. It skips symlinks, flags Debug payloads, and inspects archives without extracting or executing them. It reports logical file bytes and, for ZIPs, compressed entry bytes and total archive bytes. Store reports use separate measurements.

## iOS Release Measurements on Device

Both builds used the same minimal consumer and real QJBC/PAK, Xcode 27.0 and iPhoneOS SDK 27.0, deployment target iOS 15, and arm64. The existing `build_native.sh ios` script built and packaged the device and simulator XCFramework. The final `.app` links only the device slice, so its size excludes the simulator archive.

```sh
bash sdk/scripts/build_native.sh ios
# Inside the generated Flutter consumer project
flutter build ios --release --no-codesign --no-pub
flutter build ios --release --no-codesign --no-pub --split-debug-info=build/ios-symbols
```

| Build | Logical `.app` size | Local unsigned IPA ZIP |
| --- | ---: | ---: |
| Standard Release | 24.736 MiB | 10.423 MiB |
| Separate Dart debug symbols | **23.665 MiB** | **9.965 MiB** |

The ZIP was generated with `ditto -c -k --keepParent Payload output.ipa` from a standard `Payload/Runner.app` directory. Installation requires signing, and App Store distribution additionally applies its own signing, encryption, and packaging. Apple and Flutter distinguish local archives, device variants, and store download and installation sizes. The 9.965 MiB result applies only to the local archive. [Apple App Thinning measurements](https://developer.apple.com/documentation/xcode/reducing-your-app-s-size), [Flutter iOS size measurement](https://docs.flutter.dev/perf/app-size)

Contents of the `.app` after splitting symbols:

| Component | MiB |
| --- | ---: |
| Flutter engine and ICU | 9.797 |
| Native host and plugins, including Pocket linked into Runner | 8.977 |
| Dart AOT | 4.472 |
| Guest QJBC, PAK, metadata, and manifest | 0.213 |
| Other resources and metadata | Approximately 0.205 |

Both builds contained the same 109 `_pocket_` C ABI exports, including the five creation and attach roots. The Flutter engine and Guest QJBC/PAK were byte-for-byte identical. Relinking also produced a 104-byte difference in Runner. The 3,330,663-byte Dart symbols file `app.ios-arm64.symbols` stays on the build machine and is excluded from the app. Validation covered the build, architecture, exports, and artifact contents. Signing, physical iPhone installation and execution, and App Store upload were outside its scope.

The first build failed because the display bridge directly referenced types introduced in SDK 27.1. The SwiftPM manifest now sets a compile-time condition based on the selected Xcode SDK. With older SDKs, `PocketDisplayGeometry.swift` reuses its unsupported path, returning `supported: false` while reporting the actual viewport and Reduce Transparency state. Newer SDKs use the existing API and runtime version check. The manifest parsed and both Release builds passed with SDK 27.0. SDK 27.1 was unavailable locally, so its branch remains unverified on this machine. [Display bridge compatibility with older SDKs](POCKET_VIEW_DISPLAY_GEOMETRY.md#building-with-an-older-ios-sdk)

The size script now reads `CFBundleExecutable` in `.app/Info.plist` and classifies iOS Runner under native host. Logical totals and groupings match between the directory and IPA ZIP.

## Largest Remaining Opportunity: Guest Delivery

The current Showcase resource directory is about 87.40 MiB.

| Directory or file | MiB | Delivery option |
| --- | ---: | --- |
| Entire Lantern Guest directory | 72.978 | Deliver the complete signed mini-app on demand |
| Lantern `app.pak` | 66.406 | Already included in the line above |
| Official demo directory | 13.128 | Production consumers can bundle only the examples and apps they need |
| profile / lobby | 0.276 / 0.273 | Bundle or deliver on demand according to offline requirements |

The SDK already offers signature-verified `downloadOnOpen`, a content-addressed cache, and recovery to a healthy release. Keep small bootstrap metadata and manifests bundled and deliver large Guest QJBC/PAK files and loose resources through the existing update channel. The first open without a cache requires network access. Later opens can use verified cache entries. Prewarming also triggers downloads and should remain under JS policy.

The current Showcase lacks a production update source and public key. It retains its offline resources and default startup behavior. [On-demand mini-apps](ON_DEMAND_MINI_APPS.md), [Editor resource delivery](EDITOR_RESOURCE_DELIVERY.md), [Update trust policy](RELEASE_TRUST_POLICY.md)

## Production Build Commands

Prepare the native target and real Guest first, then measure each platform separately.

```sh
flutter build macos --release --analyze-size
flutter build apk --release --target-platform=android-arm64 --analyze-size
flutter build appbundle --release
```

Use `--split-debug-info` to keep Dart debug symbols separately on the build machine. The option is mutually exclusive with `--analyze-size`.

```sh
flutter build macos --release --split-debug-info=build/symbols
flutter build apk --release --target-platform=android-arm64 --split-debug-info=build/symbols
```

The local builds with split symbols reduced the minimal macOS app from 30.032 to 28.968 MiB, a decrease of about 1.064 MiB, and the local ZIP from 12.142 to 11.690 MiB. The approximately 3.2 MiB `app.darwin-arm64.symbols` file stays on the build machine and is excluded from the app. The earlier build uses `--analyze-size` and the later build uses `--split-debug-info`. These are measured results for the two build configurations.

Archive the symbol files alongside each release for later `flutter symbolize` use. Preserve C ABI exports and image quality, and preserve the native FFI fault boundary provided by `catch_unwind` when evaluating compiler changes such as `panic=abort`. Measure both performance and size independently with Rust `opt-level=s/z`. Cargo provides no guarantee that these settings reduce size. [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html)

## Sources, Validation, and Limits

- The retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` was unavailable locally. The user authorized work in the current workspace with Codex. This work reused `pocket.ts`, the Demo Podfile, iOS SwiftPM linker roots, signed on-demand delivery, and existing Flutter rendering and input contracts. The scope was package size.
- The macOS Release baseline and ablation, minimal-consumer Release build, and real QJBC/PAK all built successfully.
- Both macOS Release executables preserved all 108 Pocket C ABI exports.
- `host_link_size_smoke_test.dart` passed in a real macOS drive run, confirming visible FFI roots, Guest `00 → 01`, a PNG change after pointer input, and surface disposal.
- Three official Live2D Core bridge checks passed independently of the full model scenario.
- The actual Android Release APK build and ABI inspection passed. Android and macOS scaffolding preserved custom configuration and passed idempotence checks.
- macOS scaffold configuration and reapplication regressions passed, along with SDK/demo architecture and diff whitespace checks.
- The existing macOS static library predated current native source and was refreshed with the existing script. Full model theater acceptance remained unsuccessful. The old library had a PMS1 bytes issue, and the refreshed library encountered active-model and scene-timing failures. The original `force_load` baseline also failed navigation settling, so the full scenario remains unverified and cannot isolate the effects of the linking change.
- Windows size was outside the scope. iOS and Android validation covered package builds and artifact contents. macOS also had a separate input-driven runtime check. Device acceptance requires separate validation of each platform's engine, signatures, ABI, package formats, and store processing.

Full local inventories, symbol comparisons, build and drive logs, and minimal projects remain under `/tmp/pocket-host-size-20261114/`, `/tmp/pocket-host-size-continue-20261114/`, and `/tmp/pocket-host-size-ios-20261114/`. Binaries, native archives, and third-party SDKs are excluded from source commits.
