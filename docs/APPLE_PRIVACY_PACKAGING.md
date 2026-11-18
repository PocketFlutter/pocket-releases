# Apple privacy manifest packaging

Pocket's iOS source integration includes two SDK-owned `PrivacyInfo.xcprivacy` files.

| Component | Manifest path | Packaging configuration |
| --- | --- | --- |
| Pocket Flutter / native runtime | `packages/pocket_flutter/ios/pocket_flutter/Sources/pocket_flutter/PrivacyInfo.xcprivacy` | Target resources `.copy` in the enclosing `Package.swift` |
| Pocket Archive | `packages/pocket_archive/ios/PrivacyInfo.xcprivacy` | `pocket_archive_privacy` resource bundle in `pocket_archive.podspec` |

Both declare `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1` for access to timestamps, sizes, and other metadata of files in the app container. Each declared category requires evidence of actual API access.

## Evidence of API usage

- `lib/src/pocket_host_config.dart` checks the cache size limit with `File.stat().size` and sorts entries by `stat.modified` for cleanup. The cache lives in the app support directory.
- The file-based bytecode entry point in `native/src/lib.rs` reads local QJBC/PAK. Rust file IO introduces `fstat` in the current native library.
- Code paths such as `CheckNoSymlinkDirectory` in `packages/pocket_archive/ios/native/src/pocket_archive_zip.cpp` use `lstat` to block symlinks and directory traversal.
- `packages/pocket_archive/ios/native/7zip_sources.cmake` selects `CPP/Windows/FileFind.cpp`, `FileDir.cpp`, `FileIO.cpp`, and `C/7zFile.c`. The files under the Windows directory supply POSIX code paths as well.

The current manifests cover Pocket-managed caches, resources, and extraction directories in the app container. Embedders adding access to user-selected documents outside the app container should verify the applicable reasons and path permissions separately.

Inspection of Pocket Flutter's iOS Swift source found no direct access to `UserDefaults`, `systemUptime`, or `activeInputModes`. The two manifests cover only evidenced access by Pocket. Flutter, path_provider, and other dependencies carry their own declarations. Rust uses `Instant` and `clock_gettime` for scheduling and timing. Check the final linked iOS artifact to determine whether it references Apple's listed `mach_absolute_time` symbol. macOS or historical cached libraries do not establish the final iOS symbol set.

A targeted `nm -u -j` check of the current iOS arm64 XCFramework static library found `_fstat`, `_fstatat`, `_lstat`, and `_stat`. It found neither `_mach_absolute_time` nor the disk capacity API symbols included in the check. This evidence covers the current library. Verify the final app, Flutter, and other plugins separately.

The SDK infrastructure uploads no telemetry and connects to no tracking domains, so the manifests set tracking to false and leave tracking domains and collected data types empty. Consumer JS, network workflows, separately integrated analytics SDKs, and custom plugins can have different data flows. The host must complete App Privacy declarations based on the data the app actually uses.

## Parent source and retained behavior

The source review inspected `lib/core/pocketjs_bundle_runner.dart`, `lib/core/ffi_bridge.dart`, `native/pocket_runtime_multi.c`, and the iOS directory in the retained `pocketjs_flutter_demo`, excluding `pocket_host/`. The parent established the actual runtime, resource file, and native host boundaries. Packaging reuses the current SDK's SwiftPM runtime target and CocoaPods archive target, with no legacy host copy or extra native wrapper.

## Validation and limits

```sh
plutil -lint packages/pocket_flutter/ios/pocket_flutter/Sources/pocket_flutter/PrivacyInfo.xcprivacy
plutil -lint packages/pocket_archive/ios/PrivacyInfo.xcprivacy
swift package --package-path packages/pocket_flutter/ios/pocket_flutter dump-package
ruby -c packages/pocket_archive/ios/pocket_archive.podspec
```

These commands validate the manifest syntax and build configuration. Before release, generate an Xcode privacy report from the final archive and verify that the app includes both SDK resource bundles and the Flutter and dependency manifests. Check the final machine-code references, privacy labels, and purpose strings for permissions.

The source integration continues to use the static-library XCFramework. This work produced no new signed SDK binary distribution. For standalone binary distribution, verify resource placement and applicable signing requirements.

[Apple privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [Required reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api), and [API categories and allowed reasons](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).
