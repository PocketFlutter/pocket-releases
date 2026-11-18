# Blaze for Pocket Rust Builds

On 2026-11-03, a read-only assessment covered Blaze at `dae0fad151a71e077fcb4568e53190f59337c5e3`. The assessment did not install Blaze, switch toolchains, start a daemon, or benchmark a Pocket build under Blaze. [indexable-inc/blaze](https://github.com/indexable-inc/blaze)

Blaze cannot currently replace Pocket's production native library build. It is a candidate for an isolated Rust unit test and incremental development experiment on Apple Silicon. Faster rebuilds after edits establish neither app FPS nor input latency or device power improvements. Product behavior remains in JS, with no Dart logic added to integrate the build tool.

## Fit with the SDK

Pocket's `native/Cargo.toml` declares `cdylib`, `staticlib`, and `rlib`. `scripts/build_native.sh` uses Cargo to build `.a` for macOS/iOS and `.so` for Android. `native/build.rs` and `rquickjs-sys` also involve C compilation, QuickJS headers, clang/SDK, and mobile bindgen. Flutter artifact compatibility requires more than successful Rust compilation.

| Path | Blaze v2 evidence | Assessment |
| --- | --- | --- |
| macOS/iOS `.a` packaging | The docs reject staticlib/dylib. Mixed declarations including cdylib select Shared first and do not emit the required `.a`. | Keep the official library build. |
| iOS, iOS Simulator, Android | The linker target list omits `aarch64-apple-ios`, `aarch64-apple-ios-sim`, and `aarch64-linux-android`. | Mobile cross-compilation is unavailable. |
| Apple Silicon Rust unit tests | Test mode classifies the crate as an executable first. macOS arm64 is supported. | An isolated experiment is possible. Pocket builds remain unverified. |
| Local cdylib/probe | Shared output is implemented. C dependencies, symbols, and FFI still require verification. | Candidate experiment. Static packaging requires independent evidence. |
| Daily JS page iteration | `scripts/build_guest.ts` invokes Bun and the existing `pocketjs_bytecode` to generate QJBC. TS-only edits require no Rust recompilation. | Blaze does not directly accelerate JSX bundling, QuickJS bytecode compilation, or JS hot updates. Measure startup overhead separately. |
| build.rs / C / bindgen | Build scripts run in a sandbox with read-only access to host directories, write access to OUT_DIR, and the caller's environment. | Verify clang, registry, SDK, and linker directives in real builds. |
| Toolchain | Blaze uses its own dated nightly and ignores project rustup/toolchain selection. | Retain Cargo verification with Rust 1.93.1. |
| Release/LTO | A release LLVM backend exists. The linker lacks cross-module LTO. | Keep the final performance build. |
| Resource cost | The daemon keeps compilation state in memory and does not exit automatically. Upstream reports higher memory and disk use. | Record peak memory and cache size and clean up the experimental daemon. |

## Primary Evidence

- The selection logic checks test/bin, cdylib, then staticlib/dylib. [crate-type branch](https://github.com/indexable-inc/blaze/blob/dae0fad151a71e077fcb4568e53190f59337c5e3/crates/blaze-cargo/src/serve/unit/codegen.rs#L52-L72)
- The parser enumerates available linker targets. [Target parser](https://github.com/indexable-inc/blaze/blob/dae0fad151a71e077fcb4568e53190f59337c5e3/crates/blaze-link/src/target.rs#L375-L408)
- The compatibility notes cover the toolchain, build script sandbox, commands, and unsupported outputs. v2 does not automatically fall back to Cargo for failed builds. [Cargo compatibility](https://github.com/indexable-inc/blaze/blob/dae0fad151a71e077fcb4568e53190f59337c5e3/docs/cargo.md)
- The linker documentation covers the LTO boundary. [Linker](https://github.com/indexable-inc/blaze/blob/dae0fad151a71e077fcb4568e53190f59337c5e3/docs/linker.md)
- All upstream benchmark numbers describe v1. v2 replaced v1 on 2026-10-30 and had no published measurements at assessment time. The advertised maximum multiplier gives no estimate for Pocket or v2. [Upstream benchmarks](https://github.com/indexable-inc/blaze/blob/dae0fad151a71e077fcb4568e53190f59337c5e3/docs/benchmarks.md)

## Minimal Ablation

Keep production source and default build scripts intact. Use a temporary checkout and isolated Blaze home/cache with a pinned Blaze commit, identical source, and identical functional tests. Run the existing upstream preparation prerequisite for both variants.

1. Try the unchanged host with `blaze test --lib` to check C, QuickJS, and proc macro compatibility. Record any specific failure and preserve real Worker/IO and the engine.
2. If artifact type needs isolation, use a temporary minimal project to verify cdylib, rlib, and static C dependencies separately. Those results do not establish Pocket compatibility.
3. Compare Cargo and Blaze for cold builds, unchanged builds, single function edits, function signature edits, and C source edits. Repeat each group and report the medians, peak RSS, disk use, and daemon overhead. Distinguish initial loading from warm edits.
4. Run the same QuickJS/QJBC, duplex, Worker HTTP, offline recording replay, and FFI tests against the actual host library, then check exported symbols. Keep Cargo check/test as the independent baseline.
5. Add an explicit optional development command only if compatibility and warm-edit benefits are established. Preserve default Cargo/CI and avoid new runtime dependencies or polling. Mobile targets require official support for the relevant targets and artifacts.

The assessment establishes source-level compatibility limits. It contains no measured speedup or power savings.
