/**
 * @pocket/liquid_glass — GPU-budgeted Liquid Glass controls for PocketJS.
 *
 * Engineered from the empirical WebGPU + demand-driven UIKit Gallery reference architecture:
 * - Dual-path optical surfaces (`LiquidGlassSurface`): real GPU Snell refraction + 48-tap
 *   golden-angle frost (`packages/pocket_flutter/shaders/liquid_glass.frag` & WebGL2
 *   `PocketLiquidGlass`) governed by a deterministic GPU pass budget (`LiquidGlassGovernor`),
 *   with automatic Zero-Pass Specular Vector Glass fallback for dense scroll lists, grouped
 *   children (`LiquidGlassGroup`), and WeChat Mini Program hosts.
 * - Morphing menus & overlays (`LiquidGlassMenu`, `LiquidGlassMenuButton`,
 *   `LiquidGlassContextMenu`, `LiquidGlassPopover`, `LiquidGlassAlertModal`) with pill-to-platter
 *   liquid morphing, inline expanding submenus, and continuous press-and-scrub selection.
 * - Zero-VDOM imperative 60–120Hz spring physics (`createImperativeSpring` via `jump()`) with
 *   `onFrame` demand parking (no continuous frame requests while settled) and quantized uniform caching.
 * - Full 21-slot `@pocket/ui/skins` adapter (`liquidGlassSkinAdapter`) across `light`, `dark`,
 *   and blue-channel-free `amber-night` (`#RRGG00`) palettes.
 */

export * from "./tokens.ts";
export * from "./motion.ts";
export * from "./governor.ts";
export * from "./surfaces.tsx";
export * from "./controls.tsx";
export * from "./navigation.tsx";
export * from "./overlays.tsx";
export * from "./menus.tsx";
export * from "./kit.tsx";
