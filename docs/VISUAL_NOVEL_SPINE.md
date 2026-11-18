# Pocket Spine Runtime Integration Study

The study ran on 2026-11-07 with Esoteric Software `@esotericsoftware/spine-core` **4.3.13**. The npm registry confirmed `4.3.13` via `npm view` and reported `LicenseRef-LICENSE`. The official spine-ts 4.3 runtime reads Spine Editor 4.3.xx exports.

## Findings

Official `spine-core` loads skeletal data and handles animation state, world transforms, and CPU clipping in JS/TS without a DOM. The Pocket adapter only needs the core. It converts geometry into frame meshes and uses the existing Pocket renderer for textures, layout, and drawing. Official WebGL, Canvas, CanvasKit, Pixi, and Player backends are unnecessary for this integration.

Content and filename searches of the retained parent Flutter demo at `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`, found no Spine, Live2D, Skeleton, or DragonBones implementation or assets. The integration pairs the official runtime with Pocket's existing DrawOp/native mesh boundary.

## Official Sources and Runtime Boundaries

- The official [spine-ts 4.3 README](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/README.md) describes `spine-core` as the skeleton loading and processing module. Other modules provide WebGL, Canvas, CanvasKit, Pixi, Three.js, and Player backends. The README confirms 4.3.xx compatibility and links the core API docs.
- The installed package contains JS ESM, `.d.ts`, and the official Spine license, with no runtime dependencies. It supplies `TextureAtlas`, `SkeletonJson`, `SkeletonBinary`, `AnimationState`, `SkeletonClipping`, `MeshAttachment`, `RegionAttachment`, and `SkeletonRendererCore`. The adapter uses official loaders, animation state, Skeleton world transforms, attachment world vertices, and SkeletonClipping.
- Mesh and clipping behavior follows the core geometry in the official [SkeletonClipping 4.3 source](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonClipping.ts) and [SkeletonRendererCore 4.3 source](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonRendererCore.ts). Pocket handles the drawing.

### Spine Licensing

Spine runtime source is publicly readable and governed by proprietary terms. The npm metadata is `LicenseRef-LICENSE`. This section records the study's engineering summary of the [Spine Runtimes License Agreement](https://esotericsoftware.com/licenses/Spine-Runtimes-License-Agreement.pdf) and [Spine Editor License Agreement, Section 2](https://esotericsoftware.com/spine-editor-license). Review the applicable terms for a particular distribution.

- Editor License §2.1 conditions for integration or derivative works include adding “significant and primary functionality” to each product beyond the runtime and having a valid Spine Editor license at integration time.
- Editor License §2.2 permits distribution as incorporated into products when the accompanying documentation or materials include the Runtimes License Agreement and a valid Editor license was held at integration time. Under §2.3 and §2.4, third parties who modify, adapt, develop, or create derivative products containing the runtime need their own valid Editor license. The official README also states that SDKs and toolkits must explain the applicable requirements to their users.
- The alternative route under the Runtimes License Agreement requires every product user to obtain their own Spine Editor license and every redistribution to include the license and copyright notice.
- The trial grants no Spine Runtimes integration or distribution rights. Pocket keeps the module optional, off by default, and private to the workspace. Bundling the runtime with Pocket or a consumer artifact requires selecting an official licensing path and including its applicable terms and notices.

## Pocket Renderer Interface Gap

The integration reviewed the retained rendering path.

- [`PocketTextureTriangleOp`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/sdk/packages/pocket_flutter/lib/src/pocket_model.dart) describes texture, uniform color, position, UV, and clip.
- [`PocketViewPainter`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/sdk/packages/pocket_flutter/lib/src/pocket_view_painter.dart) draws textured geometry with `ui.Vertices(VertexMode.triangles)` and an image shader. Coordinates map directly to UVs, and modulation uses one tint. The adapter reuses these rendering principles.
- [`pocket_runtime.dart`](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/sdk/packages/pocket_flutter/lib/src/pocket_runtime.dart) exposes texture triangles as DrawOp. The native `TEX_TRI` ABI record has exactly three vertices. A skeletal attachment usually contains multiple triangles, and clipping can add vertices dynamically. The retained mesh path consumes this geometry. Mesh ABI, texture decoding, and Flutter painting remain outside this package.

Each Spine attachment produces a per-frame geometry snapshot independent of runtime scratch buffers. The SDK's Pocket / VN adapter converts it to a retained image mesh. The mesh uses the logical texture key from the project asset registry, and Pocket's existing resource boundary handles decoding and upload.

## Adapter Contract

The source under `sdk/packages/pocket_spine/` imports only official `@esotericsoftware/spine-core`. The package exports `createSpineRig`.

```ts
createSpineRig({
  skeleton: { format: "json", data } | { format: "binary", data },
  atlasText,
  textureKeys: { "page.png": "logical/image/key" },
  yAxis?: "up" | "down", // Defaults to down.
  coordinateScale?: number, // Defaults to 1.
})
```

- `animationNames` and `skinNames` come from official `SkeletonData`. `play(name,{loop,track})`, `setMix(from,to,seconds)`, and `setSkin(name)` call `AnimationState` and `Skeleton` directly. `setSkin(undefined)` and `setSkin(null)` restore `SkeletonData.defaultSkin`. Without one, they restore the skinless setup pose. The default is defined by SkeletonData independently of skin names.
- `advance(deltaSeconds)` updates Spine time and AnimationState, applies the pose, and computes world transforms. The existing VN frame clock can call it. Paused scenes park mesh updates.
- `frame()` returns `SpineFrameItem[]` in Spine draw order. A drawable mesh has logical `texture`, `positions`, `uvs`, `triangles`, uniform `rgba`, `blendMode:"normal"`, `clipped`, and atlas-page `premultipliedAlpha`. The adapter creates TypedArrays that survive later frames unchanged. It converts Spine y-up to Pocket y-down by default. Coordinates stay model-local. Pocket nodes handle scene layout and character transforms.
- Unsupported slots and attachments return `kind:"unsupported"` with a reason. This includes additive, multiply, and screen blending, two-color/dark tint, and attachments other than region, mesh, or clipping.
- `dispose()` clears Spine animation tracks, ends clipping, and releases `TextureAtlas`. Pocket's registry and texture store own PNG and image resources. The adapter does no duplicate decode or disposal. Operations on a disposed rig throw, and disposal is idempotent.

Official `SkeletonClipping.clipTrianglesUnpacked` performs CPU clipping. With `clipped:true`, position, UV, and index buffers already describe clipped geometry, which Pocket draws directly. The current test verifies a convex quadrilateral. More complex Spine clipping combinations need additional real fixtures.

The VN factory applies full initial intent before measuring first-frame bounds for stage fit. It advances the official runtime with zero delta to apply the pose. This allows accurate bounds for models with an initially selected skin and no default skin. Clearing `skin` during execution and engine rollback both restore setup or default skin through the same official rig API. Skin changes preserve animation phase.

Pocket retained mesh uses one uniform ARGB/ABGR tint. The adapter outputs normalized, unpremultiplied `[r,g,b,a]` and preserves the atlas page's PMA flag. The bridge packs the color for the Pocket mesh buffer. Test ordinary alpha blending with standard RGBA pages. The integration adapter should explicitly reject PMA pages until Pocket decode and shader premultiplication semantics have end-to-end coverage.

## Reproducible Verification

The custom fixture `test/fixtures/weighted-mesh.json` and adjacent `.atlas` use the official JSON and atlas loaders. They define a weighted four-point mesh using root and hinge bones, `idle` and `wave` rotation animations, and a clipping attachment. Run under Bun without `document`.

```sh
cd sdk/packages/pocket_spine
bun test
```

1. The official JSON loader reads the custom skeleton and atlas. The weighted mesh produces drawable geometry with the correct texture key.
2. Official SkeletonClipping produces new positions, UVs, and triangle indices within the fixture clip window.
3. `advance()` changes weighted vertices. The `AnimationStateData` / `AnimationState` idle→wave mix produces intermediate geometry different from direct wave playback.
4. An additive slot returns `unsupported:blend-mode` without a normal mesh.
5. Snapshots are independent of runtime scratch buffers. Dispose is idempotent, and subsequent frame calls fail.
6. Callers must bind every atlas page to a Pocket logical texture key.

The VN/Spine integration regression also ran in `sdk/`.

```sh
bun test packages/pocket_vn/test packages/pocket_spine/test
```

**30 passed, 0 failed.** New tests use different skins and an official-parser fixture without a default skin to verify first-frame fit. Actual NovelEngine rollback restores a model from a different skin to setup skin, then compares geometry at the same animation phase with an official Spine control rig whose skin stayed unchanged.

A binary smoke test temporarily read `spine-ue/Content/GettingStarted/Assets/celestial-circus/celestial-circus-pro.skel` and the adjacent `.atlas` from official `spine-runtimes` 4.3. The same official `SkeletonBinary` path produced a headless pose with 64 items, including 56 meshes and eight unsupported blend modes. Advance and dispose then succeeded. The official sample was used temporarily outside the repository.

```sh
../../node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict src/index.ts
bun build src/index.ts --target browser --outdir /tmp/pocket-spine-build --external @esotericsoftware/spine-core
```

Both commands passed. The browser bundle verifies Bun can package the core module without a Canvas or WebGL renderer. End-to-end verification of the JS package through pinned guest/QuickJS and the Pocket mesh buffer was pending in this study.

## Unsupported and Pending Cases

- **Blend.** Additive, multiply, screen, and two-color tint report an observable unsupported item. Eight additive slots in the official sample followed this path.
- **Attachments.** Region and mesh produce output. Clipping attachments act as CPU clipping operations. Paths, points, bounding boxes, advanced sequence variants, and other non-image attachments produce no drawing.
- **Textures.** The caller maps atlas regions and page files. Pocket owns image reads, atlas packing, decoding, and GPU handles.
- **Physics.** Advance calls official `Physics.update`. Spine physics constraints still need determinism, pause/resume, and timestep variation coverage.
- **Geometry.** Ordinary meshes, weighted meshes, and regular convex clipping have coverage. Deform, linked mesh, sequence, inverse, and concave clipping require Pocket end-to-end tests.
- **Live2D.** This is a distinct model format with its own license and no support in this package.
- **Lifecycle optimization.** Each rig creates its own `SkeletonData` and atlas. Measure larger models before introducing a shared immutable data cache.

## References

- [Spine spine-ts 4.3 README, module layout, 4.3.xx compatibility, and licensing summary](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/README.md)
- [Spine Skeleton.ts 4.3](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/Skeleton.ts)
- [Spine SkeletonClipping.ts 4.3](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonClipping.ts)
- [Spine SkeletonRendererCore.ts 4.3](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonRendererCore.ts)
- [Spine Runtimes License Agreement](https://esotericsoftware.com/licenses/Spine-Runtimes-License-Agreement.pdf)
- [Spine Editor License Agreement](https://esotericsoftware.com/spine-editor-license)
- [Official npm package @esotericsoftware/spine-core](https://www.npmjs.com/package/@esotericsoftware/spine-core)
