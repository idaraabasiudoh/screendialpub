/**
 * TapeCanvas — a degraded CRT/VHS frame rendered in two WebGL passes.
 *
 * 1. SCENE: a soft, luminous form and horizontal colour bands are drawn into a tiny
 *    texture — roughly 200px wide and one texel row per scanline — so all fine detail
 *    is destroyed before the picture ever reaches the "tube".
 * 2. CRT: at full device resolution the texture is re-scanned line by line: each line
 *    gets its own displacement and gain, colour trails horizontally, the RGB guns are
 *    misconverged, the beam swells on bright lines, highlights bloom across the gaps,
 *    and chroma noise, tracking tears, exposure drift and a slight tube curve go on top.
 *
 * Only the image layer is degraded; typography above it stays sharp.
 */

export type TapeVariant = "broadcast" | "tide" | "sodium";

interface TapeLook {
  /** Six hue stops the scene cycles through (a loop). */
  hues: [string, string, string, string, string, string];
  /** Colour highlights blow out to. */
  core: string;
  figure: number; // strength of the soft vertical form
  lift: number; // overall exposure bias
  offsetX: number; // horizontal position of the form (-0.5..0.5)
}

const LOOKS: Record<TapeVariant, TapeLook> = {
  broadcast: {
    hues: ["#1636E8", "#2F6BFF", "#3FD6F2", "#7B3FF2", "#F03AA8", "#FF7A2E"],
    core: "#FFF4E8",
    figure: 1,
    lift: 0,
    offsetX: 0.16,
  },
  tide: {
    hues: ["#0A3D66", "#0E7FA0", "#3CD6D0", "#9EF0C8", "#2F6BFF", "#123C8C"],
    core: "#F2FFE6",
    figure: 0.85,
    lift: 0.05,
    offsetX: 0,
  },
  sodium: {
    hues: ["#2A1B7A", "#5E3EC0", "#8A4FE0", "#D6E040", "#F6FF3A", "#3A2380"],
    core: "#FFFFE4",
    figure: 1,
    lift: 0.05,
    offsetX: 0,
  },
};

export interface TapeOptions {
  variant: TapeVariant;
  /** 0..1 — how unstable and degraded the signal is. */
  intensity: number;
  /** Device-pixel multiplier for the CRT pass (capped by devicePixelRatio). */
  pixelRatio?: number;
  /** Scanline pitch in CSS pixels. */
  linePitch?: number;
  fps?: number;
  seed?: number;
}

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
`;

/* Pass 1 — the picture before it hits the tube. */
const SCENE_FRAG = `
precision highp float;
uniform vec2 u_srcRes;
uniform float u_aspect;
uniform float u_time;
uniform float u_seed;
uniform vec2 u_pointer;
uniform float u_figure;
uniform float u_lift;
uniform float u_offsetX;
uniform vec3 u_h0; uniform vec3 u_h1; uniform vec3 u_h2;
uniform vec3 u_h3; uniform vec3 u_h4; uniform vec3 u_h5;
uniform vec3 u_core;
${NOISE}
vec3 hue(float h) {
  h = fract(h) * 6.0;
  if (h < 1.0) return mix(u_h0, u_h1, h);
  if (h < 2.0) return mix(u_h1, u_h2, h - 1.0);
  if (h < 3.0) return mix(u_h2, u_h3, h - 2.0);
  if (h < 4.0) return mix(u_h3, u_h4, h - 3.0);
  if (h < 5.0) return mix(u_h4, u_h5, h - 4.0);
  return mix(u_h5, u_h0, h - 5.0);
}
vec3 scene(vec2 uv, float t) {
  vec2 p = vec2((uv.x - 0.5) * u_aspect, uv.y - 0.5);

  // horizontal banding: long in x, tight in y
  float bands = fbm(vec2(p.x * 0.9 + u_seed, p.y * 7.0 - t * 0.08));
  float drift = fbm(vec2(p.x * 0.5 - t * 0.03, p.y * 2.2 + u_seed + t * 0.05));

  // a soft standing form with a breathing waist, drifting with the pointer
  float cx = u_offsetX * u_aspect + (u_pointer.x - 0.5) * 0.06 + sin(t * 0.21) * 0.025;
  float w = 0.19 + 0.08 * sin(p.y * 5.0 + t * 0.35) + 0.05 * drift;
  float bx = (p.x - cx) / w;
  float body = exp(-bx * bx) * smoothstep(0.62, 0.0, abs(p.y + 0.04));
  vec2 hd = (p - vec2(cx - 0.015, 0.2)) * vec2(6.5, 5.5);
  float head = exp(-dot(hd, hd));
  float form = (body * 0.8 + head * 0.7) * u_figure;

  // a fully lit frame: the background never falls far below mid-blue
  float v = 0.34 + u_lift + form * 0.9 + (bands - 0.45) * 0.95 + (drift - 0.5) * 0.55;
  // occasional bright streaks riding single lines
  v += smoothstep(0.74, 0.92, noise(vec2(p.x * 2.0 + t * 0.2, uv.y * 60.0))) * 0.28;

  // hue: blue through the middle, warmer toward top and bottom, shifting over time
  float edge = pow(clamp(abs(p.y) * 2.0, 0.0, 1.0), 1.5);
  float h = 0.02 + drift * 0.3 + bands * 0.18 + edge * 0.64 + form * 0.06 + sin(t * 0.05) * 0.03;
  vec3 col = hue(h) * max(v, 0.0) * 1.3;
  col = mix(col, u_core, smoothstep(1.0, 1.45, v)); // blown-out core
  return clamp(col, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_srcRes;
  // colour trails to the right: smeared here, at source resolution, where it is cheap
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float wk = exp(-fk * 0.6);
    acc += scene(uv - vec2(fk * 0.9 / u_srcRes.x, 0.0), u_time) * wk;
    wsum += wk;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}
`;

/* Pass 2 — the tube. */
const CRT_FRAG = `
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_res;
uniform vec2 u_srcRes;
uniform float u_time;
uniform float u_intensity;
uniform float u_seed;
uniform float u_line;
${NOISE}
float luma(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / u_res;
  float t = u_time;
  float I = u_intensity;

  // slight tube curvature
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc * (1.0 - dot(cc, cc) * 0.04 * I);

  // vertical instability: a constant tremble, and the odd hop
  float hop = step(0.985, hash(vec2(floor(t * 4.0), u_seed))) * 0.012;
  float vj = ((noise(vec2(t * 1.3, u_seed)) - 0.5) * 0.004 + hop) * I;
  float y = (uv.y + vj) * u_res.y;
  float line = floor(y / u_line);
  float fy = fract(y / u_line);
  float lineV = (line + 0.5) * u_line / u_res.y;

  // horizontal displacement, per line
  float lt = floor(t * 30.0);
  float jitter = (hash(vec2(line, lt)) - 0.5) * 0.003 * I;
  float wob = sin(lineV * 14.0 + t * 1.3) * 0.002 * I + sin(lineV * 53.0 - t * 3.1) * 0.0008 * I;
  float bandPos = 1.0 - fract(t * 0.05 + u_seed * 0.37);
  float band = smoothstep(0.07, 0.0, abs(lineV - bandPos));
  float tear = step(0.75, noise(vec2(t * 0.6, u_seed + 3.0)));
  float bandShift = band * (0.008 + 0.03 * tear) * I * (noise(vec2(line * 0.4, t * 9.0)) - 0.35);
  float stray = step(0.992, hash(vec2(line * 0.37, floor(t * 7.0)))) * (hash(vec2(line, lt)) - 0.5) * 0.06 * I;
  float hs = smoothstep(0.05, 0.0, uv.y);
  float hsShift = hs * 0.05 * I * (hash(vec2(line, lt)) - 0.2);
  float u = uv.x + jitter + wob + bandShift + stray + hsShift;

  // the three guns don't quite converge
  float px = 1.0 / u_srcRes.x;
  float ca = (1.1 + band * 3.0) * px * (0.4 + 0.6 * I);
  vec3 col = vec3(
    texture2D(u_src, vec2(u + ca, lineV)).r,
    texture2D(u_src, vec2(u, lineV)).g,
    texture2D(u_src, vec2(u - ca * 1.3, lineV)).b
  );

  // bloom sampled across lines, so highlights spill over the gaps
  vec3 glow = (texture2D(u_src, vec2(u - px * 2.0, uv.y + 0.016)).rgb
             + texture2D(u_src, vec2(u + px * 2.0, uv.y - 0.016)).rgb
             + texture2D(u_src, vec2(u, uv.y)).rgb) / 3.0;

  // uneven line intensity + exposure drift
  float gain = 0.8 + 0.4 * noise(vec2(line * 0.23, t * 0.7 + u_seed));
  gain *= 1.0 + (hash(vec2(line * 1.7, floor(t * 12.0))) - 0.5) * 0.14 * I;
  float expo = 1.12 + (noise(vec2(t * 6.0, u_seed)) - 0.5) * 0.14 * I;
  col *= gain * expo;

  // beam profile: bright lines swell and close the gap, dark lines thin out
  float l = luma(col);
  float bw = mix(0.2, 0.5, clamp(l * 1.1, 0.0, 1.0));
  float d = (fy - 0.5) / bw;
  col *= exp(-d * d * 1.4) * 1.6;

  float gl = luma(glow);
  col += glow * glow * 1.15 * smoothstep(0.3, 1.0, gl) + glow * 0.06;

  // oversaturate, blow out, crush
  float L = luma(col);
  col = mix(vec3(L), col, 1.3);
  col = 1.0 - exp(-max(col, 0.0) * 1.3);
  col = pow(max(col - 0.02, 0.0), vec3(1.12));

  // chroma speckle, band snow, head-switching snow
  vec2 np = frag + fract(t * 13.1) * vec2(97.0, 31.0);
  vec3 n = vec3(hash(np), hash(np + 17.3), hash(np + 41.9)) - 0.5;
  col += n * (0.06 + 0.08 * I) * (0.3 + L);
  col += band * (hash(np * 0.5) - 0.3) * 0.16 * I;
  col = mix(col, vec3(hash(vec2(line, t * 31.0)) * 0.6), hs * 0.5 * I);

  // vignette
  vec2 vc = (uv - 0.5) * vec2(1.05, 1.3);
  col *= 1.0 - dot(vc, vc) * 0.7;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type Uniforms = Record<string, WebGLUniformLocation | null>;

/**
 * Compiled canvases are kept between pages: linking the two programs is the most
 * expensive step, and redoing it on every navigation caused a visible hitch.
 */
const pool: TapeCanvas[] = [];
const MAX_POOL = 3; // the most any page shows at once (Home)

export function acquireTape(host: HTMLElement, options: TapeOptions): TapeCanvas {
  const tape = pool.pop();
  if (tape) {
    tape.attach(host, options);
    return tape;
  }
  return new TapeCanvas(host, options);
}

export class TapeCanvas {
  private host!: HTMLElement;
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private scene: { program: WebGLProgram; u: Uniforms } | null = null;
  private crt: { program: WebGLProgram; u: Uniforms } | null = null;
  private target: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number } | null = null;
  private opts!: Required<TapeOptions>;
  private raf = 0;
  private lastFrame = 0;
  private startedAt = performance.now();
  private visible = false; // set by the IntersectionObserver's first callback
  private pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, cx: -1, cy: -1 };
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  // Just record the position; it's mapped into the canvas once per rendered frame.
  private onPointerMove = (e: PointerEvent) => {
    this.pointer.cx = e.clientX;
    this.pointer.cy = e.clientY;
  };
  private onMotionChange = () => this.kick();

  constructor(host: HTMLElement, options: TapeOptions) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "tape-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.init();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      this.kick();
    });
    this.attach(host, options);
  }

  /** Puts this (possibly recycled) canvas into a host with a given look. */
  public attach(host: HTMLElement, options: TapeOptions) {
    this.host = host;
    this.opts = {
      pixelRatio: 1,
      linePitch: 3,
      fps: 30,
      seed: Math.random() * 10,
      ...options,
    };
    this.visible = false;
    this.lastFrame = 0;
    this.pointer.cx = -1;
    host.prepend(this.canvas);

    if (this.gl) {
      this.applyLook();
    } else {
      host.classList.add("tape--fallback", `tape--${options.variant}`);
    }

    this.resizeObserver.observe(host);
    this.intersectionObserver.observe(host);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    reducedMotion.addEventListener("change", this.onMotionChange);
    document.addEventListener("visibilitychange", this.onMotionChange);

    this.resize();
    this.kick();
  }

  public setIntensity(value: number) {
    this.opts.intensity = value;
    this.kick();
  }

  /** Stops and detaches; the compiled context goes back to the pool for the next page. */
  public release() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    reducedMotion.removeEventListener("change", this.onMotionChange);
    document.removeEventListener("visibilitychange", this.onMotionChange);
    this.canvas.remove();

    if (this.gl && !this.gl.isContextLost() && pool.length < MAX_POOL) {
      pool.push(this);
    } else {
      this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }

  private init(): boolean {
    const gl = this.canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) return false;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[TapeCanvas] shader error:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const link = (frag: string, names: string[]) => {
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, frag);
      if (!vs || !fs) return null;
      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, "a_pos");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
      const u: Uniforms = {};
      for (const name of names) u[name] = gl.getUniformLocation(program, name);
      return { program, u };
    };

    this.scene = link(SCENE_FRAG, [
      "u_srcRes", "u_aspect", "u_time", "u_seed", "u_pointer", "u_figure", "u_lift", "u_offsetX",
      "u_h0", "u_h1", "u_h2", "u_h3", "u_h4", "u_h5", "u_core",
    ]);
    this.crt = link(CRT_FRAG, [
      "u_src", "u_res", "u_srcRes", "u_time", "u_intensity", "u_seed", "u_line",
    ]);
    if (!this.scene || !this.crt) return false;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(this.crt.program);
    gl.uniform1i(this.crt.u.u_src, 0);

    this.gl = gl;
    return true;
  }

  private applyLook() {
    const gl = this.gl!;
    const look = LOOKS[this.opts.variant];
    const s = this.scene!;
    gl.useProgram(s.program);
    look.hues.forEach((hex, i) => gl.uniform3fv(s.u[`u_h${i}`], hexToRgb(hex)));
    gl.uniform3fv(s.u.u_core, hexToRgb(look.core));
    gl.uniform1f(s.u.u_figure, look.figure);
    gl.uniform1f(s.u.u_lift, look.lift);
    gl.uniform1f(s.u.u_offsetX, look.offsetX);
    gl.uniform1f(s.u.u_seed, this.opts.seed);
    gl.useProgram(this.crt!.program);
    gl.uniform1f(this.crt!.u.u_seed, this.opts.seed);
  }

  /** Low-res scene texture: ~200 texels across, one row per scanline. */
  private allocateTarget(cssW: number, cssH: number) {
    const gl = this.gl!;
    const w = Math.round(Math.min(260, Math.max(110, cssW / 6)));
    const h = Math.max(8, Math.round(cssH / this.opts.linePitch));
    if (this.target && this.target.w === w && this.target.h === h) return;
    if (this.target) {
      gl.deleteFramebuffer(this.target.fb);
      gl.deleteTexture(this.target.tex);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.target = { fb, tex, w, h };
  }

  private resize() {
    const cssW = Math.max(1, this.host.clientWidth);
    const cssH = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, this.opts.pixelRatio);
    const w = Math.round(cssW * ratio);
    const h = Math.round(cssH * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (this.gl) {
        this.allocateTarget(cssW, cssH);
        this.draw(this.lastFrame || performance.now());
      }
    }
  }

  /** (Re)starts the loop, or renders a single still frame when motion is reduced. */
  private kick() {
    cancelAnimationFrame(this.raf);
    if (!this.gl) return;
    if (reducedMotion.matches) {
      this.draw(this.startedAt + 12_000);
      return;
    }
    if (this.visible && !document.hidden) {
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // small tolerance so 30fps locks to every 2nd vsync instead of alternating 2 and 3
    if (now - this.lastFrame < 1000 / this.opts.fps - 4) return;
    this.lastFrame = now;
    this.draw(now);
  };

  private draw(now: number) {
    const gl = this.gl;
    const target = this.target;
    if (!gl || !target || !this.scene || !this.crt) return;
    const time = (now - this.startedAt) / 1000;
    const p = this.pointer;
    if (p.cx >= 0) {
      const r = this.host.getBoundingClientRect();
      p.tx = (p.cx - r.left) / Math.max(1, r.width);
      p.ty = 1 - (p.cy - r.top) / Math.max(1, r.height);
    }
    p.x += (p.tx - p.x) * 0.04;
    p.y += (p.ty - p.y) * 0.04;

    // pass 1: scene -> low-res texture (unbind it as a source first: no feedback loop)
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(this.scene.program);
    gl.uniform2f(this.scene.u.u_srcRes, target.w, target.h);
    gl.uniform1f(this.scene.u.u_aspect, this.canvas.width / this.canvas.height);
    gl.uniform1f(this.scene.u.u_time, time);
    gl.uniform2f(this.scene.u.u_pointer, p.x, p.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: CRT at device resolution
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.crt.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.uniform2f(this.crt.u.u_res, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.crt.u.u_srcRes, target.w, target.h);
    gl.uniform1f(this.crt.u.u_time, time);
    gl.uniform1f(this.crt.u.u_intensity, this.opts.intensity);
    gl.uniform1f(this.crt.u.u_line, this.opts.linePitch * (this.canvas.width / Math.max(1, this.host.clientWidth)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
