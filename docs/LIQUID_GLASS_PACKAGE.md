# Liquid Glass for PocketJS guests

`@pocket/liquid_glass` composes buttons, navigation, menus, and overlays from PocketJS primitives. The guest owns composition, input state, spring motion, and optical surface admission. An admitted surface uses the existing `GlassSurface` rendering path exported by `@pocket/ui` through the host.

## Use in a guest

Add `@pocket/liquid_glass` to the project's guest dependencies and compile the entry with the [Pocket Guest build](TOOLING_API.md#buildguest). This example mounts a controlled glass toggle in a shared group.

```tsx
import { createSignal } from "solid-js";
import {
  LiquidGlassButton,
  LiquidGlassGroup,
  LiquidGlassProvider,
} from "@pocket/liquid_glass";

export function GlassActions() {
  const [saved, setSaved] = createSignal(false);

  return (
    <LiquidGlassProvider qualityTier="balanced">
      <LiquidGlassGroup>
        <LiquidGlassButton
          label={saved() ? "Saved" : "Save"}
          selected={saved()}
          onPress={() => setSaved((value) => !value)}
        />
      </LiquidGlassGroup>
    </LiquidGlassProvider>
  );
}
```

To use the kit with the reusable `UiSkinProvider`, call `registerLiquidGlassSkin()` from `@pocket/liquid_glass/kit` before selecting the `"liquid-glass"` skin. The Showcase gallery, stress page, and skin selection are consumers in `demo/js`. See [JS API](JS_API.md) for the guest package map.

## Public entries

The [package manifest](../packages/pocket_liquid_glass/package.json) declares these entry points. The root re-exports each module. The linked declarations cover component props, callbacks, and return types.

| Subpath | Main exports |
| --- | --- |
| `./tokens` | Theme modes (`light`, `dark`, `amber-night`), named or hex accents, `resolveLiquidGlassPalette`, `resolveOpticalRecipe`, `concentricGlassRadius`, and `hexToArgb`. [Declarations](../packages/pocket_liquid_glass/src/tokens.ts) |
| `./motion` | `GLASS_SPRINGS`, `stepGlassSpring`, `quantizeOptical`, `createGlassSpring`, and `createImperativeSpring`. [Declarations](../packages/pocket_liquid_glass/src/motion.ts) |
| `./governor` | `TIER_GPU_BUDGET`, `createLiquidGlassGovernor`, `createGlassFrameProfiler`, and admission lease and profiler types. [Declarations](../packages/pocket_liquid_glass/src/governor.ts) |
| `./surfaces` | `LiquidGlassProvider`, `useLiquidGlass`, `useInLiquidGlassGroup`, `LiquidGlassBackdrop`, `LiquidGlassSurface`, and `LiquidGlassGroup`. [Declarations](../packages/pocket_liquid_glass/src/surfaces.tsx) |
| `./controls` | Flex surface, button, icon button, switch, slider, segmented control, badge, checkbox, radio group, input, progress, stepper, page control, and activity indicator. [Declarations](../packages/pocket_liquid_glass/src/controls.tsx) |
| `./navigation` | App bar, toolbar, navigation bar, card, list tile, metric, empty state, accordion, virtual list, and FPS HUD. [Declarations](../packages/pocket_liquid_glass/src/navigation.tsx) |
| `./overlays` | `LiquidGlassAlert`, `LiquidGlassToast`, `LiquidGlassDialog`, and `LiquidGlassSheet`. [Declarations](../packages/pocket_liquid_glass/src/overlays.tsx) |
| `./menus` | Menu, menu button, context menu, popover, alert modal, `normalizeMenuSections`, and `measureViewportRect`. [Declarations](../packages/pocket_liquid_glass/src/menus.tsx) |
| `./kit` | `liquidGlassSkinAdapter`, `registerLiquidGlassSkin`, and `resolveLiquidGlassSkinTokens`. [Declarations](../packages/pocket_liquid_glass/src/kit.tsx) |

## Rendering and frame budget

With no parent provider, the default theme is light with a blue accent, comfortable density, and reduced motion off. A provider creates an `ultra` governor unless a `qualityTier` or governor is supplied. If both are supplied, the provider applies the tier to that governor. Theme settings inherit from the parent when omitted.

`LiquidGlassSurface` defaults to rounded regular material and normal priority. Materials are `clear`, `regular`, `thick`, and `chrome`. A clear, high-priority pill is the default group surface. Nested glass surfaces use their vector tint treatments within the group. Reduced transparency and increased contrast also select the vector treatment.

`createLiquidGlassGovernor(options = {})` defaults to `ultra` and an eight-surface admission budget. The other tiers are `balanced` (five), `performance` (two), and `vector` (zero). `maxGpuSurfaces` overrides the ultra budget. `acquireLease(priority = "normal")` returns a lease with a reactive `granted()` accessor and `release()` method. Admission sorts by priority (`critical`, `high`, `normal`, `low`), then acquisition order. Higher-priority acquisitions can displace granted surfaces. Automatic adaptation defaults on and uses a 58 FPS threshold when frame samples are supplied. The target used by the profiler defaults to 60 FPS. `createGlassFrameProfiler` reuses the shared `@pocket/ui/fast` profiler with a 60 Hz target and 60-sample window by default; its readings measure guest work and frame cadence, not GPU presentation. Releasing a lease makes `granted()` false and admits the next eligible surface. `LiquidGlassFpsHud` displays caller-supplied profiler samples; it shows “No frame samples” until the caller records work via `governor.recordFrameSample(beginMs, endMs)`. The HUD does not measure its own callback as whole-frame work.

The governor controls admission to the optical path. Flutter uses its existing refraction shader where shader filters and shader loading succeed, with a frosted host treatment otherwise. Web Preview uses its existing glass renderer subject to browser and graphics support. WeChat Mini Program rendering and device behavior remain unverified for this package. The 60 FPS target is a benchmark setting. Sustained frame rates, visual fidelity, and touch behavior require acceptance on each target. See [Apple Glass rendering](APPLE_GLASS.md) for the underlying renderer and its scoped measurements.

## Migration provenance and validation

This integration ports the former `feat/liquid-glass` patch identified by commits `ae8a2f3` and `1dcc2ab` into PocketFlutter/Pocket. The source-first comparison used these files under the retained `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`:

| Retained source | Behavior referenced | Adaptation |
| --- | --- | --- |
| `mini_apps/pocketjs_uikit.js` | The JS recipe for lens displacement and optical primitive props. | Package-owned palette and surface recipes drive the existing PocketJS primitives. |
| `shaders/liquid_glass.frag` | Rounded-box and circular signed distance fields, bevel displacement, frosted sampling, and rim highlights. | The guest package uses the current SDK's host glass path. |
| `lib/render/pocket_ui_components.dart` | `PocketLiquidGlassSurface` offers opt-in glass and resolves a standard surface by default. | JS composes the UI and owns the opt-in behavior. The host consumes drawing operations and provides native rendering. |
| `test/pocket_38_components_screenshot_test.dart` | The screenshot scenario opens the 38-component gallery and checks the standard UI with opt-in glass. | Use gallery navigation and input-driven rendering as acceptance scenarios in the current Showcase. |

The migration includes package tests for JS behavior, a native Guest fixture for build and runtime coverage, Flutter bridge transport tests, and native scaffold fixture tests. Physical-device signing, extension installation, action delivery, and platform-specific screenshot or frame-rate acceptance require separate evidence. The optional system widget and activity bridge is documented in [Optional plugins](OPTIONAL_PLUGINS.md#native-surface-bridge).
