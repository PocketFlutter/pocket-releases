import { DEFAULT_DEVICE } from "@open-wxa/wxa-runner-core";
import {
  ECOSYSTEM_SURFACE_PROFILES,
  getSurfaceProfile,
  listSurfaceProfiles,
  parseSurfaceEnvironment,
  surfaceEnvironmentFromProfile,
  surfaceGeometryForProfile,
  type EcosystemSurfaceProfile,
  type SurfaceEnvironment,
  type SurfaceRenderMode,
} from "../packages/pocket_ui/src/surface-catalog.ts";

/** Same pinned profile used by the official WeChat runner. Shell measurements
 * come from its PhoneShell presentation CSS, not from a second layout engine. */
export const previewDevice = Object.freeze({
  ...DEFAULT_DEVICE,
  safeArea: Object.freeze({
    top: DEFAULT_DEVICE.statusBarHeight,
    right: 0,
    bottom: DEFAULT_DEVICE.safeAreaBottom,
    left: 0,
  }),
  shell: Object.freeze({
    bezel: 13,
    borderRadius: 40,
    notchWidth: 209,
    notchHeight: 30,
    homeIndicatorWidth: 134,
    homeIndicatorHeight: 5,
    homeIndicatorBottom: 8,
  }),
  profiles: ECOSYSTEM_SURFACE_PROFILES,
});

export {
  ECOSYSTEM_SURFACE_PROFILES,
  getSurfaceProfile,
  listSurfaceProfiles,
  parseSurfaceEnvironment,
  surfaceEnvironmentFromProfile,
  surfaceGeometryForProfile,
  type EcosystemSurfaceProfile,
  type SurfaceEnvironment,
  type SurfaceRenderMode,
};
