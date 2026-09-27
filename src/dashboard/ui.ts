import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export const isTauri = "__TAURI_INTERNALS__" in window;
export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The Screendial logo, the S° mark, keyed to transparency from the brand art
 * (styling-assets/screendiallogotrspt.jpg -> public/brand). Shared by the dashboard and
 * the overlay. Wrapped so hosts can hang state (working / listening) off .brand-mark.
 */
const LOGO_RATIO = 213 / 256;
export function logo(height: number): string {
  const width = Math.round(height * LOGO_RATIO);
  return `<span class="brand-mark" aria-hidden="true"><img class="logo" src="/brand/screendial-logo.png" width="${width}" height="${height}" alt="" draggable="false" /></span>`;
}

export const arrow = `
  <svg class="arrow" width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
    <path d="M0 5h32M28 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.2" />
  </svg>`;

/** Tape counter "HH:MM:SS:FF", starting from an arbitrary point on the reel. */
export function startTimecode(el: HTMLElement, offsetSeconds = 0): () => void {
  const start = performance.now() - offsetSeconds * 1000;
  const pad = (n: number) => String(n).padStart(2, "0");
  // one fixed-width cell per digit (see .tc-d): the display face has no tabular figures
  el.innerHTML = Array.from({ length: 4 }, () => `<span class="tc-d"></span><span class="tc-d"></span>`).join(`<span class="tc-sep">:</span>`);
  const cells = Array.from(el.querySelectorAll<HTMLElement>(".tc-d"));
  const tick = () => {
    const ms = performance.now() - start;
    const s = Math.floor(ms / 1000);
    const digits = pad(Math.floor(s / 3600)) + pad(Math.floor(s / 60) % 60) + pad(s % 60) + pad(Math.floor((ms % 1000) / 33.4));
    cells.forEach((cell, i) => {
      if (cell.textContent !== digits[i]) cell.textContent = digits[i];
    });
  };
  tick();
  const id = window.setInterval(tick, prefersReducedMotion() ? 1000 : 1000 / 30);
  return () => window.clearInterval(id);
}

/** Viewfinder clock "HH:MM", the colon blinking in CSS. Re-renders on the minute only. */
export function startClock(el: HTMLElement): () => void {
  let timer = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  const tick = () => {
    const now = new Date();
    el.innerHTML = `${pad(now.getHours())}<span class="vf-colon">:</span>${pad(now.getMinutes())}`;
    timer = window.setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20);
  };
  tick();
  return () => window.clearTimeout(timer);
}

/** Opens the overlay's command palette (no-op in a plain browser). */
export async function askScreendial() {
  if (!isTauri) return false;
  await emit("trigger-prompt");
  return true;
}

export async function broadcastSettings(apiKey: string, model: string) {
  if (!isTauri) return;
  await emit("settings-updated", { apiKey, model });
}

export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  is_primary: boolean;
  scale_factor: number;
}

export async function getDisplays(): Promise<DisplayInfo[]> {
  if (!isTauri) {
    return [
      { id: 0, name: "Built-in Retina Display", width: 2940, height: 1912, is_primary: true, scale_factor: 2 },
      { id: 1, name: "External Display", width: 2560, height: 1440, is_primary: false, scale_factor: 1 },
    ];
  }
  try {
    return await invoke<DisplayInfo[]>("get_display_info_cmd");
  } catch {
    return [];
  }
}
