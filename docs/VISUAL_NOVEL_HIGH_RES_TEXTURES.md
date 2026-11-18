# High-Resolution Static Textures for the Visual Novel

## Scope and Reuse

This change raises the static PAK `ui:img.*` limit. Width and height must each be a power of two up to 2048. General texture operations remain limited to 512, including raw `uploadTexture`, font atlases, Sprite atlases, and individual TILESET tiles. The PAK header, IMG field widths, handles, UV format, and Flutter decoding protocol remain compatible.

The source-first review of `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`, found no reusable high-resolution PAK IMG upload or Live2D static texture pipeline. `lib/render/pocket_ui_components.dart` discusses `RepaintBoundary` and GPU caching for rendering, without PAK asset decoding or upload. This change reuses the pinned implementation with a separate limit for static IMG.

`sdk/scripts/prepare_upstream.py` applies `sdk/native/patches/image-high-resolution-pak.patch` to pinned revision `99924de47c62fa36f526a8791055d91cbbdb3836`. `.cache/pocketjs` is generated for bootstrap and tests.

## Limits and Downstream Behavior

- The contract retains `TEX_MAX_DIM = 512` and defines `IMG_MAX_DIM = 2048`. `contracts/spec/gen-rust.ts` generates Rust constants.
- `framework/compiler/pak.ts::encodeImageEntry` checks static IMG power-of-two dimensions and the 2048 maximum. Width and height remain `u16` in the PAK IMG header.
- Core `upload_texture_flags` retains 512. Only `upload_img_entry` passes the IMG limit to shared decoding and allocation. Sprite and TILESET limits remain 512.
- Core `Texture` and `TexView` hold `u32` dimensions. Reads and `texture_at` have no 512 truncation. PMS1 vertex UVs remain normalized 0..1. `TEX_TRI` retains the texture handle and vertex ABGR modulation. Dimensions are outside the mesh format.
- Native `FrameResource` uses `u32` dimensions and copies pixels from `TexView`. Flutter `PocketAssets._decodeEntry` reads IMG `u16` dimensions and allocates RGBA pixels without a separate 512 cap.
- Core `load_assets` parses and uploads all resources in a temporary `Ui`, then commits atomically. An invalid image returns an error without partial installation. Individual uploads validate dimensions, payload, and RLE before `tex_alloc`. Tests verify unchanged texture-slot count after failure, and the RLE temporary buffer is released on failure.

A 2048×2048 RGBA8 texture occupies 16 MiB. Core upload, native `FrameResource`, PAK/Dart RGBA decoding, and host image textures can hold simultaneous copies. The 64 MiB native binary frame limit covers the sum of encoded frame resources. Validate the full PAK and peak memory on target devices.

## Host and Compiler Compatibility

PAK stays at version 1. QJBC `runtimeAbi` identifies QuickJS bytecode ABI and does not encode static IMG limits. The prebuilt tool manifest verifies compiler SHA-256, but host IMG capability is not negotiated through it. Pair new compiler output containing 1024 or 2048 IMG with a native core including this patch. Older cores explicitly reject the PAK at asset installation instead of resizing or falling back. Upgrade compiler, Guest, and matching host together.

The initial source-only validation built no production tools, QJBC/PAK, or platform host. Final Web, Windows, Android, iOS, and macOS packages were initially unverified. `prepare_live2d.ts` original-dimension staging is an input, and actual runtime support requires regenerated PAK and the matching platform host. The later Lantern macOS result appears below.

## Standalone Source Verification

Prepare pinned upstream source.

```sh
python3 sdk/scripts/prepare_upstream.py
```

Run the targeted checks in `sdk/.cache/pocketjs`. This Bun path is specific to the recorded workspace.

```sh
/Volumes/ORICO/Development/Github/pocket/sdk/.pocket-build/browser-test-bun-1.4.4/node_modules/@oven/bun-darwin-aarch64/bin/bun test tests/image-pak.test.ts
/Volumes/ORICO/Development/Github/pocket/sdk/.pocket-build/browser-test-bun-1.4.4/node_modules/@oven/bun-darwin-aarch64/bin/bun tests/contract.ts
/Volumes/ORICO/Development/Github/pocket/sdk/.pocket-build/browser-test-bun-1.4.4/node_modules/@oven/bun-darwin-aarch64/bin/bun test --test-name-pattern='engine/spec/src/lib.rs' tests/generated-contracts.test.ts
cargo test -p pocketjs-core static_img_entries_use_the_larger_limit_without_widening_general_textures
```

Targeted results were 1/1 compiler IMG limit, all contract tests green, 1/1 generated Rust spec, and 1/1 core large-image upload, failure cleanup, mesh UV, and color modulation. The full `generated-contracts.test.ts` reported 11 passes and two unrelated pinned-upstream differences in the generated guest-web descriptor and 3DS header. The specific `engine/spec/src/lib.rs` generation consistency check passed.

For production, rerun `prepare_upstream.py`, build native core and host for the target Rust platform, package matching prebuilt tools, and rebuild Guest PAK/QJBC. Verify actual decoding, drawing, memory, and error fallback per platform. Web tooling and each mobile/desktop host require their own builds.

## Lantern Integration Results

The coordinator rebuilt the static archive through `build_native.sh macos`, packaged matching local compiler and probe tools, and rebuilt the regular Demo Lantern PAK and QJBC. macOS Debug FFI passed in 50 seconds, logged in `/tmp/pocket-highres-model-macos-y70.log`. Both textures decoded to 2048². Actual Core motion and masks, pause/resume, model release, and isolation from the main-story disk save passed. Full-body and close-up screenshots were verified at 329×600 and DPR 1. Other sizes and platforms need separate coverage. [Final Guest fingerprints](VISUAL_NOVEL_LIVE2D.md#current-high-resolution-checkpoint-2026-11-07)

PAK grew from 27,006,192 to 58,463,472 bytes, an increase of 31,457,280. Native, GPU, and Flutter residency and cold-start costs remain unmeasured. macOS sandboxing rejected the earlier app test using an explicit dylib outside the workspace. Two tests passed with normal in-app static linking and unchanged sandbox policy. High-resolution hosts and runtime acceptance remain pending for iOS, Android, Windows, and Web. The older Web WASM shipped in the local tool package has no 2048 verification.
