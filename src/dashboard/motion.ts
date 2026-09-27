/**
 * Motion — scroll-linked movement, in the tape's register.
 *
 * - Parallax: [data-parallax="x,y"] elements drift at their own depth as the page scrolls.
 * - Reveals: [data-reveal] blocks play in when they enter the frame and slide/fade back out
 *   when they leave it, in the direction of travel ([data-motion] picks the axis).
 * - Tickers: marquee rows that idle at a steady crawl and surge with scroll speed, like tape
 *   being scrubbed.
 *
 * Cost rules, since this runs over live WebGL: scroll handlers only schedule a frame (never
 * read layout in the event), frames read before they write, unchanged values aren't
 * rewritten, and the ticker's crawl is a compositor animation rather than a script loop.
 *
 * Parallax writes the individual `translate` property, so it composes with the reveal
 * keyframes (which own `transform`) and with `rotate`, instead of overwriting them.
 * Everything is transform/opacity only, one rAF per scrolled frame, and all of it stands
 * down under reduced motion.
 */
import { prefersReducedMotion } from "./ui";

interface Cleanup {
  add(fn: () => void): void;
}

const scroller = (root: HTMLElement) =>
  root.closest<HTMLElement>(".view") ?? document.querySelector<HTMLElement>(".view")!;

/* ------------------------------------------------------------------------- */
/* Reveals                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Two-way reveals. On a page's first visit everything plays in; on later visits whatever is
 * already on screen is simply there, and only scrolling brings movement.
 */
export function observeReveals(root: HTMLElement, scope: Cleanup, firstVisit: boolean) {
  const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (prefersReducedMotion()) {
    targets.forEach((el) => el.classList.add("is-shown"));
    return;
  }
  targets.forEach((el, i) => el.style.setProperty("--i", String(Number(el.dataset.reveal) || i % 6)));

  const reported = new WeakSet<Element>();
  const shown = new WeakSet<Element>();
  // Latest observer verdict per element: in view, and whether it sits above the frame.
  const latest = new WeakMap<Element, { inView: boolean; above: boolean }>();
  // Elements mid-entrance. The observer measures elements as painted, so an entrance
  // that starts clipped (wipe) or offset past the frame edge would read as "left" and
  // bounce straight back out; exits wait until the entrance has landed.
  const entering = new WeakSet<Element>();

  const enter = (el: HTMLElement, above: boolean) => {
    el.dataset.from = above ? "above" : "below";
    el.classList.remove("is-out");
    el.classList.add("is-in");
    entering.add(el);
    shown.add(el);
  };

  const leave = (el: HTMLElement, above: boolean) => {
    el.dataset.to = above ? "above" : "below";
    el.classList.remove("is-in", "is-shown");
    el.classList.add("is-out");
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const above = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        const first = !reported.has(el);
        reported.add(el);
        latest.set(el, { inView: entry.isIntersecting, above });

        if (entry.isIntersecting) {
          if (el.classList.contains("is-in") || el.classList.contains("is-shown")) continue;
          if (first && !firstVisit) {
            el.classList.add("is-shown");
            shown.add(el);
          } else {
            enter(el, above);
          }
        } else if (shown.has(el) && !entering.has(el) && !el.classList.contains("is-out")) {
          leave(el, above);
        }
      }
    },
    // a slightly smaller frame than the window, so blocks fade while still in view
    { root: scroller(root), rootMargin: "-6% 0px -6% 0px", threshold: 0.08 }
  );
  targets.forEach((el) => io.observe(el));

  // Entrance landed: if the element was scrolled away meanwhile, send it out now.
  const onAnimationEnd = (e: AnimationEvent) => {
    const el = e.target as HTMLElement;
    if (!entering.has(el) || !e.animationName.startsWith("reveal")) return;
    entering.delete(el);
    const state = latest.get(el);
    if (state && !state.inView) leave(el, state.above);
  };
  root.addEventListener("animationend", onAnimationEnd);

  // Never leave content hidden if the observer is slow to report (busy machine).
  const fallback = window.setTimeout(
    () => targets.forEach((el) => !reported.has(el) && el.classList.add("is-in")),
    1200
  );
  scope.add(() => {
    io.disconnect();
    root.removeEventListener("animationend", onAnimationEnd);
    window.clearTimeout(fallback);
  });
}

/* ------------------------------------------------------------------------- */
/* Parallax                                                                  */
/* ------------------------------------------------------------------------- */

interface Layer {
  el: HTMLElement;
  x: number;
  y: number;
  centre: number; // layout centre within the scroller, without our translate
  rest: number; // progress at scrollTop 0 for first-screen layers, so they start in place
  last: string; // last value written, to skip no-op style writes
}

/**
 * data-parallax="x,y" — px of drift per viewport height the element travels from the
 * middle of the frame. Positive y runs ahead of the scroll (foreground), negative lags
 * behind it (background); x slides sideways as the element passes.
 */
export function observeParallax(root: HTMLElement, scope: Cleanup) {
  if (prefersReducedMotion()) return;
  const view = scroller(root);
  const layers: Layer[] = Array.from(root.querySelectorAll<HTMLElement>("[data-parallax]")).map((el) => {
    const [x = 0, y = 0] = el.dataset.parallax!.split(",").map(Number);
    return { el, x, y, centre: 0, rest: 0, last: "" };
  });
  if (!layers.length) return;

  let raf = 0;
  let measureRaf = 0;

  // All writes, then all reads: one layout for the whole set instead of one per layer.
  const measure = () => {
    measureRaf = 0;
    for (const layer of layers) layer.el.style.translate = "";
    const vh = view.clientHeight;
    const viewTop = view.getBoundingClientRect().top - view.scrollTop;
    for (const layer of layers) {
      const r = layer.el.getBoundingClientRect();
      layer.centre = r.top - viewTop + r.height / 2;
      layer.rest = layer.centre < vh ? (layer.centre - vh / 2) / vh : 0;
      layer.last = "";
    }
    frame();
  };

  const frame = () => {
    raf = 0;
    const vh = view.clientHeight || 1;
    const mid = view.scrollTop + vh / 2;
    for (const layer of layers) {
      const p = (layer.centre - mid) / vh - layer.rest;
      if (Math.abs(p) > 1.8) continue; // well off screen: leave it where it was
      const value = `${(p * layer.x).toFixed(1)}px ${(p * layer.y).toFixed(1)}px`;
      if (value === layer.last) continue;
      layer.last = value;
      layer.el.style.translate = value;
    }
  };

  const onScroll = () => {
    raf ||= requestAnimationFrame(frame);
  };

  // content that changes size (fonts landing, a skill opening) moves every layer below it
  const resize = new ResizeObserver(() => {
    measureRaf ||= requestAnimationFrame(measure);
  });
  resize.observe(view);
  resize.observe(root);
  view.addEventListener("scroll", onScroll, { passive: true });
  measure();

  scope.add(() => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(measureRaf);
    resize.disconnect();
    view.removeEventListener("scroll", onScroll);
  });
}

/* ------------------------------------------------------------------------- */
/* Tickers                                                                   */
/* ------------------------------------------------------------------------- */

const TICKER_SPEED = 42; // px/s at idle
const TICKER_SURGE = 0.35; // playback-rate added per px scrolled in a frame
const TICKER_RATE = [-6, 18] as const; // playback-rate bounds while surging

/**
 * [data-ticker="1|-1"] tracks: content is doubled in the markup, so the track loops at
 * half its width. The crawl is a Web Animation, so it runs on the compositor with no
 * per-frame script; scrolling only nudges its playback rate (down pushes each row along
 * its direction, up drags it back) and the surge decays back to the crawl.
 */
export function driveTickers(root: HTMLElement, scope: Cleanup) {
  const tracks = Array.from(root.querySelectorAll<HTMLElement>("[data-ticker]"));
  if (!tracks.length || prefersReducedMotion()) return;
  const view = scroller(root);

  const rows = tracks.map((el) => ({ el, dir: Number(el.dataset.ticker) || 1, anim: null as Animation | null }));
  let visible = false;
  let surge = 0;
  let lastScroll = view.scrollTop;
  let last = 0;
  let raf = 0;

  const build = () => {
    for (const row of rows) {
      const half = row.el.scrollWidth / 2;
      if (!half) continue;
      row.anim?.cancel();
      const [from, to] = row.dir > 0 ? [0, -half] : [-half, 0];
      const duration = (half / TICKER_SPEED) * 1000;
      row.anim = row.el.animate(
        [{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${to}px, 0, 0)` }],
        { duration, iterations: Infinity }
      );
      // start deep into the loop, so scrolling up (negative rate) never runs out of reel
      row.anim.currentTime = duration * 500;
      if (!visible) row.anim.pause();
    }
  };

  const setRate = (rate: number) => rows.forEach((row) => row.anim && (row.anim.playbackRate = rate));

  // Only runs while a surge is decaying; idle rows need no frames from us at all.
  const settle = (now: number) => {
    raf = 0;
    const scrolled = view.scrollTop - lastScroll;
    lastScroll = view.scrollTop;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    surge = surge * Math.pow(0.04, dt) + scrolled * TICKER_SURGE;
    if (Math.abs(surge) < 0.02 && !scrolled) {
      surge = 0;
      last = 0;
      setRate(1);
      return;
    }
    setRate(Math.max(TICKER_RATE[0], Math.min(TICKER_RATE[1], 1 + surge)));
    raf = requestAnimationFrame(settle);
  };

  const onScroll = () => {
    if (visible) raf ||= requestAnimationFrame(settle);
    else lastScroll = -1; // re-read on the next visible frame
  };

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (lastScroll < 0) lastScroll = view.scrollTop;
    rows.forEach((row) => (visible ? row.anim?.play() : row.anim?.pause()));
  });
  tracks.forEach((el) => io.observe(el));

  // the track's width settles once the display face loads
  let width = 0;
  const resize = new ResizeObserver(() => {
    const w = tracks[0].scrollWidth;
    if (w !== width) {
      width = w;
      build();
    }
  });
  tracks.forEach((el) => resize.observe(el));
  view.addEventListener("scroll", onScroll, { passive: true });

  scope.add(() => {
    cancelAnimationFrame(raf);
    io.disconnect();
    resize.disconnect();
    view.removeEventListener("scroll", onScroll);
    rows.forEach((row) => row.anim?.cancel());
  });
}
