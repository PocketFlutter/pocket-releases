# Android Impeller Rectangular Clipping Ablation

This report traces rendering stalls on a physical Android device running Flutter 3.35.7 with Impeller Vulkan. The ablation changed DrawList rectangular clip antialiasing while Impeller Vulkan and clipping remained active.

## Result

The current [`PocketCanvasPainter`](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/sdk/packages/pocket_flutter/lib/src/pocket_view_painter.dart#L330-L341) applies the DrawOp's rectangular `op.clip` as follows.

```dart
canvas.clipRect(
  Rect.fromLTWH(clip.x, clip.y, clip.width, clip.height),
  doAntiAlias: false,
);
```

The change preserves `SCISSOR`/`SCISSOR_POP` bounds, nested restoration, draw order, and image, tint, triangle, and surface drawing. It makes only rectangular clipping use hard edges. Rounded shapes (`PocketRoundedOp`), gradients, plain and textured triangles, text, and images retain their respective antialiasing and filtering paths. Image `filterQuality` and tint remain as before. Production code is in `sdk/packages/pocket_flutter/lib/src/pocket_view_painter.dart:330-341`.

With the same MAA_AN00 (SM7550), Flutter 3.35.7, Impeller Vulkan, and Showcase scene, **Profile `FrameTiming.rasterDuration`** fell from about 56 ms to about 3 ms. This was the smallest change supported by device measurements.

## DrawList Contract and Sources

The pinned upstream [`spec.ts`](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/sdk/.cache/pocketjs/contracts/spec/spec.ts#L1447-L1453) defines the following behavior.

- `SCISSOR` is a three-word operation `op, xy, wh` that pushes a rectangular clip.
- The core intersects the rectangle with all enclosing scissors. The backend only applies the received rectangle.
- `SCISSOR_POP` restores the preceding clip, or the screen when the stack is empty.
- The core guarantees balanced `SCISSOR` and `SCISSOR_POP` pairs.

The contract describes hard rectangular clipping. `doAntiAlias: false` preserves the rectangle, depth, and restoration behavior.

| Source | Observed implementation | Relevance to this migration |
| --- | --- | --- |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/render/pocket_ui_components.dart:403-406,3215-3222,3258-3262,3935-3937` | The old host combines `ClipRRect` and `CustomPaint`, with `isAntiAlias:true` or high-quality filtering in its path, arc, and image painters. It has no per-DrawOp `SCISSOR` painter. | Preserve rounded-edge, path, and image antialiasing when changing rectangular scissors. The old UI provides no directly reusable per-operation clip fix. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/perf_monitor.dart:22-29,84-120` | The old monitor reads UI and raster timing through `SchedulerBinding.addTimingsCallback` and maintains FPS and jank history. | Reuse separate Profile FrameTiming and raster measurement. The old HUD's initial FPS values and thresholds do not establish GPU behavior. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/native/pocket_runtime_multi.c:82-93,341-365,439-470` | The old runtime maintains `target_fps`, a dirty mask, and DrawList buffers and frame steps. It has no per-operation `SCISSOR`, `clipRect`, or `antiAlias` implementation. | Provides native scheduling and DrawList provenance. There is no equivalent rectangular clipping fix to migrate. |
| `sdk/.cache/pocketjs/devices/gles/pocket-gles/src/geometry.rs:53-81,245-285` | The current pinned GLES backend batches core-intersected clip rectangles as integer `Clip` state. `SCISSOR` and `SCISSOR_POP` preserve draw order. | Confirms hard rectangular clipping semantics at the contract boundary. |

The source comparison found neither a matching Flutter `doAntiAlias` option in the old demo nor a reusable Android Impeller Vulkan baseline. The painter adaptation follows the pinned contract, the hard scissor behavior of the pinned GLES backend, and the on-device ablation.

## On-Device Ablation Results

The table reports **Profile `FrameTiming.rasterDuration`** in milliseconds for the same Showcase scene on MAA_AN00 (SM7550), Flutter 3.35.7, and Impeller Vulkan. Release acceptance uses separate SurfaceFlinger measurements below.

| Variant | Frames | Raster median | Raster p95 | Notes |
| --- | ---: | ---: | ---: | --- |
| Original Pocket baseline | 99 | 48.645 | 60.545 | Earlier Pocket run for historical reference |
| Current scene baseline | 154 | 56.451 | 61.226 | Default `doAntiAlias`. The home page has zero triangles, so `no-triangles` is equivalent and provides no triangle ablation. |
| no-clips | 467 | 2.909 | 4.294 | Diagnostic clip bypass to isolate the clipping path |
| noimages | 156 | 57.193 | 60.085 | Diagnostic image removal. Raster remains slow. |
| notint | 37 | 56.317 | 58.780 | Diagnostic tint removal. Raster remains slow, with a small sample. |
| **Keep clip + `doAntiAlias:false`** | **483** | **3.084** | **3.978** | Profile diagnostic build preserves images, tint, and clips. Release uses separate SurfaceFlinger sampling. |
| Pure Flutter | 309 | 2.226 | 3.480 | Rendering host control without Pocket DrawList content |

The final variant sends and applies rectangular clips with `Canvas.clipRect` antialiasing disabled. `no-clips` is a temporary diagnostic ablation.

## Reproduction

Run each temporary ablation in an isolated copy or with an isolated patch. Keep the diagnostic `no-clips` variant out of production commits.

1. Pin the source, Flutter 3.35.7, and Impeller Vulkan. Keep Vulkan active throughout, including the control runs. Confirm that the production painter uses `clipRect(..., doAntiAlias: false)`.
2. **Profile raster sampling.** Build the same Showcase Profile APK from `demo/`.

   ```sh
   flutter build apk --profile --target-platform android-arm64 --target=lib/main.dart
   ```

   Install on the same MAA_AN00 and use the same page and workload. Use identical installation, launch, warmup, and sampling durations for each variant. Let launch, first-frame activity, and cold shader compilation finish before recording frame counts and median/p95 `FrameTiming.rasterDuration`. You can also retain a Perfetto trace. A single `AcquireNextDrawable` slice measures neither raster duration nor physical display FPS.
3. Compare the original default rectangular clip, temporary `no-clips` bypass, `doAntiAlias:false`, and pure Flutter scene. Record sample counts for the optional `noimages` and `notint` diagnostic controls.
4. With `doAntiAlias:false`, check rounded corners, image edges, tint, nested scissors, and surface/texture order. Verify that only antialiasing at the rectangular clip edge changes.
5. **Release SurfaceFlinger acceptance.** Build the production Release APK.

   ```sh
   flutter build apk --release --target-platform android-arm64 --target=lib/main.dart
   ```

   Install over the existing app on the same MAA_AN00, retaining data. Start normally, confirm Impeller Vulkan in the logs, and verify that the package lacks `DEBUGGABLE`. Record valid adjacent SurfaceFlinger intervals and visual results for Release. Flutter `FrameTiming` raster values above apply to Profile.

Restoring Flutter's default `doAntiAlias:true` increased raster time from about 3 ms to about 56 ms on the device. The DrawList core already computes the intersected rectangular screen boundary. Rounded corners and images keep antialiasing and filtering in their own draw paths. Edge coverage is disabled only for the contract's hard rectangular scissor.

## Release Device Acceptance Results

The arm64 Release APK was installed over the existing app on MAA_AN00 with app data preserved. The app launched normally without extra `--ez` arguments. Logs confirmed Impeller Vulkan, and the package lacked `DEBUGGABLE`. A screenshot of the same Showcase page shows Flutter at 60 FPS, saved in `/tmp/pocket-android-release-impeller-fixed.png`.

SurfaceFlinger returned 98 valid adjacent intervals from the final 100 frames.

| Run | Valid intervals | Median | p90 |
| --- | ---: | ---: | ---: |
| Release `doAntiAlias:false` | 98 | 16.707ms | 16.709ms |
| Original Profile baseline | 98 | 66.793ms | 66.827ms |

Release system presentation returned to about 60 Hz. The figures measure SurfaceFlinger presentation intervals. Profile Flutter raster duration remains a separate measurement.

## Interpreting `AcquireNextDrawable`

The earlier Vulkan trace showed `AcquireNextDrawable` wait alongside raster times around 56 ms. Raster returned to about 3 ms after disabling rectangular clip antialiasing. The measurements support GPU or raster queue buildup, or preceding work prolonging drawable acquisition.

`AcquireNextDrawable` measures waiting and synchronization. It can include GPU queue backpressure, surface availability, display synchronization, or completion of preceding commands. The slice alone cannot establish an SM7550 driver defect. Interpret it alongside raster timings, SurfaceFlinger or Perfetto data, and cold and warm shader measurements from the same scene.

## Acceptance Scope

This release validation confirmed the following.

1. Visual bounds and draw order are preserved for images, tint, nested scissors, and surfaces/textures.
2. The Profile diagnostic build measured raster median/p95 of about `3.084ms / 3.978ms`.
3. Valid SurfaceFlinger intervals measured `16.707ms / 16.709ms` median/p90, separately from Flutter raster and presentation/compositor waits.
4. Impeller Vulkan and the same Flutter engine were used throughout, with no Skia fallback.

The data applies to the measured device and scene. Other GPU and workload combinations require their own measurements.
