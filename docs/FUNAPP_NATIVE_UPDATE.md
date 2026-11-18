# FunApp iOS native ABI update boundary

2026-11-10. FunApp's `Release` and `Profile` configurations use `Flutter/Intiface.xcconfig` to restrict dynamic exports in the final Runner. Updating the Pocket Dart Git ref or SwiftPM's `-export_dynamic` alone cannot override that restriction. An ablation showed that the static library contained the ABI while the final Runner lacked it, locating the problem at the consumer's link boundary.

Source inspection covered `pocketjs_flutter_demo/ios/PocketRuntime/pocket_runtime.podspec` and `Classes/pocket_runtime_multi.c/.h` in the retained parent, excluding `pocket_host/`. The integration retains static linking, targeted `-u` roots, and the same PocketJS engine. It adds neither a second native implementation nor a global SDK export filter.

FunApp's implementation and sole update command are documented in `tools/POCKET_NATIVE_UPDATES.md`: `tools/flutter_pub_get_fast --update-pocket <ref>`. `tools/pocket_ios_linker.rb` merges `_pocket_*` only into Runner configurations that already filter exports, preserving intiface. Unfiltered Debug configurations keep open exports and automatically remove the earlier, incorrectly added allowlist. Keep this consumer policy out of the shared Pocket Package.swift because it would affect native FFI in other consumers.

Preflight collects the ABI from the chosen SDK's Dart FFI lookups and indirect wrappers, then verifies the iOS static library, new symbol prefixes, and SDK path consistency. The Podfile idempotently installs a `dyld_info -exports` check for the final Runner. Changes to source or tools still require rebuilding the pinned native toolchain. Symbol compatibility alone cannot establish that a cached binary matches its source commit.

Actual Mach-O ablations covered open exports by default, intiface filtering, consumer-side merging, and unsafe shared filtering. A signed Release-Dev build installed successfully, and the final Runner exported all 41 Pocket FFI symbols plus the essential intiface interfaces. Three Ruby tests with 27 assertions and 14 Python checks passed. Full game interaction on a phone remains unverified.
