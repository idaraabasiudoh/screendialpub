/**
 * TapeWaves — Vanta's WAVES as a layer inside a tape host's picture.
 *
 * It sits between the TapeCanvas and the CSS tape layers (scanlines, hum bar, vignette),
 * so the tape treatment runs over it like everything else on the reel. The mesh takes a
 * hue from the host's own tape look and is screened over the picture: lit crests glow in
 * that hue, faces turned away go dark and drop out, so each page keeps its palette.
 *
 * Kept cheap: three.js and Vanta are only fetched when a host mounts, the mesh renders at
 * half CSS resolution (soft, like everything else on tape) and at the tape's 30fps, and it
 * stops off-screen and in background tabs. Under reduced motion or "Reduce VHS effects"
 * it holds a single still frame, fainter, instead of animating.
 *
 * Vanta animates the swell on the CPU: every frame it moves all 8k vertices in JS and
 * recomputes normals the flat shading never reads (profiled at ~80% of the dashboard's
 * idle script time, plus GC churn). Here the same formula runs in the vertex shader and
 * Vanta's update is cut down to its camera easing, and its render loop is parked whenever
 * there is nothing to draw instead of waking on every display frame.
 */
import { prefersReducedMotion } from "./ui";
import type { TapeVariant } from "./vhs";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The parts of Vanta's WAVES instance this module reaches into (vanta.waves.js). */
interface VantaEffect {
  destroy(): void;
  isOnScreen(): boolean;
  onUpdate(): void;
  animationLoop(now?: number): void;
  req: number;
  t: number;
  options: { zoom: number };
  scene: { children: Array<{ isAmbientLight?: boolean; isPointLight?: boolean; intensity: number }> };
  plane: { frustumCulled: boolean; material: WaveMaterial };
  camera: Vec3 & { position: Vec3; lookAt(target: unknown): void } & Record<string, number | undefined>;
  cameraPosition: Vec3;
  cameraTarget: unknown;
}

interface WaveMaterial {
  needsUpdate: boolean;
  onBeforeCompile: (shader: { uniforms: Record<string, { value: number }>; vertexShader: string }) => void;
}

const WAVE_HEIGHT = 24;
const WAVE_SPEED = 1;
const ZOOM = 0.65;

/**
 * Vanta's swell, verbatim from vanta.waves.js onUpdate, as vertex shader code. The mesh's
 * rest heights are its original positions, so `position` is Vanta's `oy`.
 */
const swell = (speed: number, height: number) => {
  const s = speed.toFixed(4);
  return `
    vec3 transformed = vec3(position);
    float crossChop = sqrt(${s}) * cos(-position.x - position.z * 0.7);
    float delta = sin(${s} * uTime * 0.02 - ${s} * position.x * 0.025 + ${s} * position.z * 0.015 + crossChop);
    transformed.y += (delta + 1.0) * (delta + 1.0) * 0.25 * ${height.toFixed(4)};`;
};

/** Moves the swell onto the GPU and trims Vanta's per-frame update to camera easing. */
function gpuSwell(effect: VantaEffect, speed: number, height: number) {
  const time = { value: 0 };
  const material = effect.plane.material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", swell(speed, height));
  };
  material.needsUpdate = true;
  // displaced vertices leave the bounds three computed at rest
  effect.plane.frustumCulled = false;

  const cam = effect.camera;
  const axes = ["x", "y", "z"] as const;
  // Vanta only applies zoom once the pointer moves; start at the zoomed rest instead, so
  // the still frame and the first seconds match the framing everything was tuned at
  for (const a of axes) cam.position[a] = effect.cameraPosition[a] / effect.options.zoom;
  effect.onUpdate = () => {
    // Vanta's camera easing: pointer moves set tx/ty/tz around the zoomed rest (ox/oy/oz)
    for (const a of axes) {
      const rest = effect.cameraPosition[a] / effect.options.zoom;
      cam["o" + a] = rest;
      const target = cam["t" + a] ?? rest;
      const diff = target - cam.position[a];
      if (Math.abs(diff) > 0.01) cam.position[a] += diff * 0.02;
    }
    cam.lookAt(effect.cameraTarget);
    time.value = effect.t;
  };
}

/** One hue per tape look, taken from that look's own stops (see LOOKS in vhs.ts). */
const WAVE_COLOR: Record<TapeVariant, number> = {
  broadcast: 0x1636e8, // --cobalt
  tide: 0x0e7fa0,
  sodium: 0x5e3ec0,
};

const FRAME_MS = 1000 / 30;
const STILL_FRAMES = 3; // the first update only records rest heights; the swell shows after
const STILL_STRENGTH = 0.6;

type Mode = "off" | "still" | "live";

export interface WavesOptions {
  /** Vanta renders at least this tall (its default, 200, overflows thin hosts like a bar). */
  minHeight?: number;
  /** Swell speed multiplier (default 1). */
  speed?: number;
  /** Camera zoom; lower pulls back, fitting more (smaller) facets into the frame. */
  zoom?: number;
  /** Mesh colour, overriding the tape look's hue. */
  color?: number;
}

/** A mounted layer: call it to tear down; setPaused parks it without losing the renderer. */
export type WavesHandle = (() => void) & { setPaused(paused: boolean): void };

/** Mounts waves into `host` at `strength` (0..1 opacity). */
export function mountWaves(
  host: HTMLElement,
  variant: TapeVariant,
  strength: number,
  fxOn: () => boolean,
  options: WavesOptions = {},
): WavesHandle {
  const layer = document.createElement("div");
  layer.className = "tape-waves";
  layer.setAttribute("aria-hidden", "true");
  // above the picture, below the CSS tape layers (or an input bar's scrim)
  host.insertBefore(layer, host.querySelector(".tape-fx, .bar-scrim"));

  let effect: VantaEffect | null = null;
  let mode: Mode = "off";
  let loads = 0; // bumps on every start/stop so a slow chunk load can't mount a stale mode
  let inView = false;
  let lastFrame = 0;
  let framesDrawn = 0;
  let parked = false;
  let paused = false; // set by the host, e.g. an overlay bar while it is hidden

  const resume = () => {
    if (!effect || !parked || paused || !inView || document.hidden) return;
    parked = false;
    effect.req = requestAnimationFrame(effect.animationLoop);
  };

  const wantedMode = (): Mode => (fxOn() && !prefersReducedMotion() ? "live" : "still");

  const stop = () => {
    loads++;
    layer.classList.remove("is-on");
    effect?.destroy();
    effect = null;
    mode = "off";
  };

  const start = async (next: Mode) => {
    const load = ++loads;
    mode = next;
    try {
      const [{ default: WAVES }, THREE] = await Promise.all([
        import("vanta/src/vanta.waves.js"),
        import("three"),
      ]);
      if (load !== loads) return;
      const live = next === "live";
      const dpr = window.devicePixelRatio || 1;
      effect = WAVES({
        el: layer,
        THREE,
        mouseControls: live,
        touchControls: live,
        gyroControls: false,
        minHeight: options.minHeight ?? 200,
        minWidth: 200,
        // pixel ratio = dpr / scale, so this renders at half CSS resolution
        scale: dpr * 2,
        scaleMobile: dpr * 2,
        color: options.color ?? WAVE_COLOR[variant],
        shininess: 60,
        waveHeight: WAVE_HEIGHT,
        waveSpeed: options.speed ?? WAVE_SPEED,
        zoom: options.zoom ?? ZOOM,
        backgroundAlpha: 0,
      }) as VantaEffect;
      // Vanta lights the mesh with a 0.9 ambient, which flattens every facet to one flat
      // tint: screened over the tape that reads as a wash, not waves. Mostly directional
      // light instead: faces turned away go near-black (and vanish under screen), crests
      // catch the light, so the swell reads while the tape's blacks stay deep.
      effect.scene?.children.forEach((child) => {
        if (child.isAmbientLight) child.intensity = 0.12;
        if (child.isPointLight) child.intensity = 1.7;
      });
      gpuSwell(effect, options.speed ?? WAVE_SPEED, WAVE_HEIGHT);

      // Take over Vanta's loop: it re-arms requestAnimationFrame on every display frame
      // forever, drawing or not. Ours draws at the tape's 30fps (Vanta's clock is
      // time-based, so skipped frames don't slow the swell) and parks entirely off-screen,
      // in background tabs, and once a still frame has landed.
      const fx = effect;
      const vantaFrame = fx.animationLoop; // bound; it re-schedules fx.animationLoop
      framesDrawn = 0;
      fx.isOnScreen = () => true;
      fx.animationLoop = (now = performance.now()) => {
        if (paused || !inView || document.hidden || (!live && framesDrawn >= STILL_FRAMES)) {
          parked = true;
          return;
        }
        if (now - lastFrame < FRAME_MS - 2) {
          fx.req = requestAnimationFrame(fx.animationLoop);
          return;
        }
        lastFrame = now;
        framesDrawn++;
        vantaFrame();
      };
      parked = false;
      layer.style.setProperty("--waves-strength", String(live ? strength : strength * STILL_STRENGTH));
      requestAnimationFrame(() => layer.classList.add("is-on"));
    } catch (err) {
      // no WebGL or a failed chunk load: the tape picture alone is the designed fallback
      console.warn("[TapeWaves] disabled:", err);
    }
  };

  const sync = () => {
    const next = wantedMode();
    if (next === mode) return;
    stop();
    start(next);
  };

  const observer = new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    resume();
  });
  observer.observe(host);

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  motion.addEventListener("change", sync);
  window.addEventListener("screendial:fx", sync);
  document.addEventListener("visibilitychange", resume);
  sync();

  const teardown = () => {
    observer.disconnect();
    motion.removeEventListener("change", sync);
    window.removeEventListener("screendial:fx", sync);
    document.removeEventListener("visibilitychange", resume);
    stop();
    layer.remove();
  };

  return Object.assign(teardown, {
    setPaused(value: boolean) {
      paused = value;
      resume();
    },
  });
}
