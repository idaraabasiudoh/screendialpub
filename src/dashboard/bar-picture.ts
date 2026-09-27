/**
 * BarPicture — the landing page's picture (the WebGL tape plus Vanta's waves) behind an
 * input bar: the dashboard's chat bar and the overlay's command palette.
 *
 * The host needs a `.bar-scrim` child (the waves slot in under it) and should clip to its
 * shape. The picture only runs while the bar is active: the overlay hides its palette with
 * `visibility`, which IntersectionObserver still counts as on-screen, so without this it
 * would keep two WebGL layers rendering over the desktop the whole time the palette is
 * closed. Deactivating hands the tape's compiled context back to the pool (reopening costs
 * no recompile) and parks the waves' renderer.
 */
import { acquireTape, TapeCanvas, TapeVariant } from "./vhs";
import { mountWaves, WavesHandle } from "./waves";

const FX_KEY = "screendial_dashboard_fx"; // written by the dashboard's "Reduce VHS effects"

/** The dashboard's effects level (0..1), readable from either window: same origin. */
export function storedFx(): number {
  try {
    return Number(localStorage.getItem(FX_KEY)) || 1;
  } catch {
    return 1;
  }
}

export interface BarPicture {
  setActive(active: boolean): void;
  destroy(): void;
}

// Calmer tape than the hero (the bar carries text), but livelier waves: in a 60px strip
// the hero's slow, large swell barely registers. So they run ~2.2x faster, the camera
// pulls back to fit more, smaller facets into the strip, and the mesh takes the palette's
// brighter electric blue, at full strength.
const TAPE_INTENSITY = 0.35;
const WAVES_STRENGTH = 1;
const WAVES = { minHeight: 1, speed: 2.2, zoom: 0.42, color: 0x2f6bff } as const; // --electric

export function mountBarPicture(
  host: HTMLElement,
  options: { variant?: TapeVariant; fx?: () => number; active?: boolean } = {}
): BarPicture {
  const variant = options.variant ?? "broadcast";
  const fx = options.fx ?? storedFx;

  let tape: TapeCanvas | null = null;
  let waves: WavesHandle | null = null;
  let active = false;

  const intensity = () => TAPE_INTENSITY * fx();

  const setActive = (next: boolean) => {
    if (next === active) return;
    active = next;
    if (active) {
      tape = acquireTape(host, { variant, intensity: intensity(), pixelRatio: 1, fps: 30 });
      // the waves' three.js chunk only loads the first time a bar opens
      waves ??= mountWaves(host, variant, WAVES_STRENGTH, () => fx() >= 1, WAVES);
      waves.setPaused(false);
    } else {
      tape?.release();
      tape = null;
      waves?.setPaused(true);
    }
  };

  // "Reduce VHS effects" is changed in the dashboard. That window fires screendial:fx; the
  // overlay only sees the storage write, so re-announce it there as the same event, which
  // the waves also listen for.
  const onFx = () => tape?.setIntensity(intensity());
  const onStorage = (e: StorageEvent) => {
    if (e.key === FX_KEY) window.dispatchEvent(new Event("screendial:fx"));
  };
  window.addEventListener("screendial:fx", onFx);
  window.addEventListener("storage", onStorage);

  setActive(options.active ?? true);

  return {
    setActive,
    destroy() {
      window.removeEventListener("screendial:fx", onFx);
      window.removeEventListener("storage", onStorage);
      tape?.release();
      tape = null;
      waves?.();
      waves = null;
    },
  };
}
