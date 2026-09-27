import { acquireTape, TapeVariant } from "./vhs";
import { mountWaves } from "./waves";
import { driveTickers, observeParallax, observeReveals } from "./motion";
import { getSessions, getSkills, relativeTime, Session } from "./data";
import {
  arrow,
  askScreendial,
  broadcastSettings,
  esc,
  getDisplays,
  logo,
  prefersReducedMotion,
  startClock,
  startTimecode,
} from "./ui";

export interface Page {
  el: HTMLElement;
  destroy(): void;
}

export interface PageContext {
  navigate(path: string): void;
  /** 0..1 multiplier for every VHS effect ("Reduce effects" setting). */
  fx: number;
  setFx(value: number): void;
  toast(message: string): void;
  /** Entrance animations play once per page per session, not on every visit. */
  firstVisit: boolean;
}

/** Collects teardown callbacks for a page's canvases, timers and observers. */
class Scope {
  private cleanups: Array<() => void> = [];
  add(fn: () => void) {
    this.cleanups.push(fn);
  }
  tape(host: HTMLElement, variant: TapeVariant, intensity: number, ctx: PageContext) {
    // 1x canvas: the 3px scanline pitch still resolves, at a quarter of the retina cost.
    // 30fps everywhere: an even cadence (every 2nd refresh) reads smoother than 24.
    const tape = acquireTape(host, { variant, intensity: intensity * ctx.fx, pixelRatio: 1, fps: 30 });
    const onFx = () => tape.setIntensity(intensity * ctx.fx);
    window.addEventListener("screendial:fx", onFx);
    this.add(() => {
      window.removeEventListener("screendial:fx", onFx);
      tape.release();
    });
    return tape;
  }
  /** Vanta waves pressed into a tape host's picture: headers only, the smaller panels stay plain. */
  waves(host: HTMLElement, variant: TapeVariant, strength: number, ctx: PageContext) {
    this.add(mountWaves(host, variant, strength, () => ctx.fx >= 1));
  }
  dispose() {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}

const fxLayers = (level: "full" | "soft" | "trace") => `
  <div class="tape-fx tape-fx--${level}" aria-hidden="true">
    <span class="fx-scrim"></span>
    <span class="fx-band"></span>
    <span class="fx-vignette"></span>
  </div>`;

const sep = `<span class="sep" aria-hidden="true"></span>`;

const INSTALL_SCRIPT_URL = "https://raw.githubusercontent.com/idaraabasiudoh/screendialpub/main/install.sh";

/**
 * Halftone collage cut-outs (styling-assets asset1-4, palette-reduced into public/art),
 * slapped onto the page. Sizes are the files' pixels at 2x. Decorative: no alt text, no
 * pointer events. Tilt rides the `rotate` property so reveals and parallax compose with it.
 */
const STICKERS = {
  camera: [432, 440],
  magnifier: [407, 440],
  books: [440, 397],
  cloud: [440, 318],
} as const;

const sticker = (name: keyof typeof STICKERS, place: string, tilt: number, parallax: string) => {
  const [w, h] = STICKERS[name];
  return `<img class="sticker sticker--${place}" src="/art/${name}.png" width="${w / 2}" height="${h / 2}"
    style="--tilt:${tilt}deg; --h:${h / 2}px" alt="" aria-hidden="true" draggable="false" decoding="async"
    data-reveal="3" data-motion="slap" data-parallax="${parallax}" />`;
};

/**
 * Camcorder viewfinder, after the reference frame: corner brackets inset from the picture
 * and a readout in each corner (REC, clock, VHS, tape counter). Headers drop "VHS": the
 * page title owns that corner.
 */
const viewfinder = (variant: "hero" | "band") => `
  <div class="vf vf--${variant}" aria-hidden="true">
    <span class="vf-frame"></span>
    <span class="vf-label vf-tl"><span class="vf-rec-dot"></span>REC</span>
    <span class="vf-label vf-tr" data-clock>--:--</span>
    ${variant === "hero" ? `<span class="vf-label vf-bl">VHS</span>` : ""}
    <span class="vf-label vf-br" data-timecode></span>
  </div>`;

function create(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "page";
  wrap.innerHTML = html;
  return wrap;
}

/** Reveals, parallax and tickers for a page, once it is in the document. */
function startMotion(root: HTMLElement, scope: Scope, ctx: PageContext) {
  observeReveals(root, scope, ctx.firstVisit);
  observeParallax(root, scope);
  driveTickers(root, scope);
}

function wireAskButtons(root: HTMLElement, ctx: PageContext) {
  root.querySelectorAll<HTMLElement>("[data-ask]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ok = await askScreendial();
      ctx.toast(ok ? "Command palette opened on your screen" : "Run inside the desktop app to open the palette");
    })
  );
}

function pageBand(title: string, swash: string, meta: string, art = "") {
  return `
    <header class="page-band">
      ${fxLayers("soft")}
      <span class="band-ghost" aria-hidden="true" data-parallax="-140,50">${title}</span>
      <div class="band-copy">
        <p class="meta" data-reveal="0" data-parallax="0,-30">${meta}</p>
        <h1 class="band-title" data-reveal="1" data-motion="wipe">
          <span data-parallax="-40,0">${title}</span>
          <em class="swash" data-parallax="60,0">${swash}</em>
        </h1>
      </div>
      ${viewfinder("band")}
    </header>
    ${art}`;
}

/* ------------------------------------------------------------------------- */
/* HOME                                                                      */
/* ------------------------------------------------------------------------- */

export function homePage(ctx: PageContext): Page {
  const scope = new Scope();

  const el = create(`
    <section class="hero">
      ${fxLayers("full")}
      ${viewfinder("hero")}

      <div class="hero-copy">
        <p class="meta hero-kicker" data-reveal="0" data-parallax="80,-40">Desktop copilot ${sep} Visual guide ${sep} Voice first</p>
        <h1 class="hero-title" aria-label="Screendial">
          <span class="hero-line" data-reveal="1" data-parallax="-220,30">SCREEN</span>
          <span class="hero-line hero-line--offset" data-reveal="2" data-parallax="220,70">DIAL</span>
          <em class="hero-swash" data-reveal="3" data-parallax="-60,160">your desktop,<br />narrated</em>
        </h1>

        <div class="hero-downloads" data-reveal="4">
          <div class="install-cmd">
            <span class="install-cmd-label">macOS</span>
            <code class="install-cmd-text">curl -fsSL ${INSTALL_SCRIPT_URL} | bash</code>
            <button type="button" class="install-cmd-copy" data-copy-cmd>Copy</button>
          </div>
          <span class="pill pill--disabled" aria-disabled="true">
            Download for Windows
            <span class="pill-note">Coming soon</span>
          </span>
        </div>
        <p class="meta install-cmd-note" data-reveal="5">Installs to /Applications ${sep} Clears the Gatekeeper quarantine flag</p>
      </div>
    </section>

    <section class="split">
      ${sticker("camera", "seam", -8, "0,-140")}
      <figure class="split-media split-media--video">
        <video class="split-video" src="/videos/excel.mp4" autoplay muted playsinline controls></video>
        ${fxLayers("soft")}
        <figcaption class="meta" data-reveal="2" data-motion="wipe">Fig. 02 &mdash; Excel, live</figcaption>
      </figure>
      <div class="split-panel">
        <header class="panel-head" data-reveal="0" data-motion="wipe">
          ${logo(56)}
          <h2 class="stack-heading">Watches<br/>&amp; narrates</h2>
        </header>
        <div class="panel-copy">
          <p data-reveal="1" data-motion="right">Use Screendial to show you explain or guide you on anything on your screen; Learning a new software, navigating your system, explaining and writing code, or troubleshooting your PC.</p>
          <p data-reveal="2" data-motion="right">Ask it anything, and it narrates while pointing at the screen, walking you through each step, so you can keep both hands on your work.</p>
        </div>
      </div>
    </section>

    <section class="split split--reverse">
      <div class="split-panel">
        <header class="panel-head" data-reveal="0" data-motion="wipe">
          ${logo(56)}
          <h2 class="stack-heading">Works<br/>with</h2>
        </header>
        <div class="panel-copy">
          <p data-reveal="1" data-motion="left">Screendial isn't locked to one app. Point it at whatever's open and it adapts to that interface, from creative tools to everyday office software.</p>
          <ul class="app-tags" data-reveal="2" data-motion="left">
            ${["DaVinci Resolve", "Excel", "Photoshop", "Final Cut Pro", "Xcode", "Visual Studio Code", "Safari", "Finder", "PowerPoint"]
              .map((a) => `<li class="app-tag">${esc(a)}</li>`)
              .join("")}
          </ul>
        </div>
      </div>
      <figure class="split-media split-media--video">
        <video class="split-video" src="/videos/dav.mp4" autoplay muted playsinline controls></video>
        ${fxLayers("soft")}
        <figcaption class="meta" data-reveal="2" data-motion="wipe">Fig. 03 &mdash; DaVinci Resolve, live</figcaption>
      </figure>
    </section>

    <div class="ticker" aria-hidden="true">
      <div class="ticker-track" data-ticker="1">
        ${Array.from({ length: 2 }, () =>
          ["DaVinci Resolve", "Safari", "Visual Studio Code", "Finder", "Any window", "Every display"]
            .map((t) => `<span>${t}</span>${sep}`)
            .join("")
        ).join("")}
      </div>
      <div class="ticker-track ticker-track--ghost" data-ticker="-1">
        ${Array.from({ length: 2 }, () =>
          ["Points at", "Explains", "Tracks", "Speaks", "Replays"].map((t) => `<span>${t}</span>${sep}`).join("")
        ).join("")}
      </div>
    </div>

    <footer class="colophon">
      <span class="colophon-mark" aria-hidden="true" data-parallax="-180,0">SIDE A</span>
      <div class="colophon-end" data-reveal="0">
        <span class="meta"><span class="osd-dot"></span>End of tape</span>
        <button class="text-btn" type="button" data-rewind>&#9664;&#9664; Rewind</button>
      </div>
    </footer>
  `);

  const run = () => {
    scope.tape(el.querySelector(".hero")!, "broadcast", 1, ctx);
    scope.waves(el.querySelector(".hero")!, "broadcast", 0.6, ctx);
    el.querySelectorAll<HTMLElement>("[data-timecode]").forEach((t) =>
      scope.add(startTimecode(t, 14 * 60 + 32))
    );
    el.querySelectorAll<HTMLElement>("[data-clock]").forEach((c) => scope.add(startClock(c)));
    startMotion(el, scope, ctx);
  };
  requestAnimationFrame(run);
  wireAskButtons(el, ctx);
  el.querySelector("[data-rewind]")!.addEventListener("click", () =>
    el.closest(".view")?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })
  );

  const copyBtn = el.querySelector<HTMLButtonElement>("[data-copy-cmd]")!;
  const copyText = el.querySelector<HTMLElement>(".install-cmd-text")!.textContent!;
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      copyBtn.textContent = "Copied";
    } catch {
      copyBtn.textContent = "Select & copy";
    }
    window.setTimeout(() => (copyBtn.textContent = "Copy"), 1800);
  });

  return { el, destroy: () => scope.dispose() };
}

/* ------------------------------------------------------------------------- */
/* SESSIONS                                                                  */
/* ------------------------------------------------------------------------- */

export function sessionsPage(ctx: PageContext, selectedId?: string): Page {
  const scope = new Scope();
  const sessions = getSessions();
  const apps = ["All", ...Array.from(new Set(sessions.map((s) => s.app)))];
  let filter = "All";
  let query = "";
  let selected = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  const el = create(`
    ${pageBand("SESSIONS", "the archive", `Archive ${sep} ${String(sessions.length).padStart(2, "0")} recordings`, sticker("magnifier", "band", -7, "0,-90"))}
    <div class="sessions">
      <aside class="session-index" data-reveal="2">
        <div class="filters" role="tablist">
          ${apps.map((a) => `<button class="chip${a === "All" ? " is-on" : ""}" data-app="${esc(a)}">${esc(a)}</button>`).join("")}
        </div>
        <label class="search">
          <span class="meta">Search</span>
          <input type="search" placeholder="Words from a transcript" spellcheck="false" />
        </label>
        <ol class="session-list"></ol>
      </aside>
      <article class="transcript" aria-live="polite"></article>
    </div>
  `);

  const list = el.querySelector<HTMLOListElement>(".session-list")!;
  const transcript = el.querySelector<HTMLElement>(".transcript")!;

  const visible = () =>
    sessions.filter(
      (s) =>
        (filter === "All" || s.app === filter) &&
        (!query ||
          s.title.toLowerCase().includes(query) ||
          s.messages.some((m) => m.text.toLowerCase().includes(query)))
    );

  const renderList = () => {
    const items = visible();
    list.innerHTML = items.length
      ? items
          .map(
            (s) => `
        <li>
          <button class="session-row${s.id === selected.id ? " is-active" : ""}" data-id="${s.id}">
            <span class="row-index">${s.live ? "LIVE" : s.id.replace("s-", "")}</span>
            <span class="row-body">
              <strong>${esc(s.title)}</strong>
              <span>${esc(s.app)} &middot; ${relativeTime(s.startedAt)}</span>
            </span>
            <span class="row-len">${s.duration}</span>
          </button>
        </li>`
          )
          .join("")
      : `<li class="empty meta">No recordings match.</li>`;
  };

  const renderTranscript = (session: Session) => {
    transcript.classList.remove("is-rolling");
    void transcript.offsetWidth; // restart the "tape roll" animation
    transcript.classList.add("is-rolling");
    transcript.innerHTML = `
      <header class="transcript-head">
        <p class="meta">${session.live ? "Live" : "Recording " + session.id.replace("s-", "")} ${sep} ${esc(session.app)}</p>
        <h2>${esc(session.title)}</h2>
        <dl class="specs">
          <div><dt>Recorded</dt><dd>${session.startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd></div>
          <div><dt>Length</dt><dd>${session.duration}</dd></div>
          <div><dt>Displays</dt><dd>${session.displays}</dd></div>
          <div><dt>Turns</dt><dd>${session.messages.length}</dd></div>
        </dl>
      </header>
      <ol class="turns">
        ${session.messages
          .map(
            (m, i) => `
          <li class="turn turn--${m.role}" style="--i:${i}">
            <span class="turn-who meta">${m.role === "user" ? "You" : "Screendial"}</span>
            <p>${esc(m.text)}</p>
            ${m.tools?.length ? `<span class="turn-tools">${m.tools.map((t) => `<code>${t}</code>`).join("")}</span>` : ""}
          </li>`
          )
          .join("")}
      </ol>
      <footer class="transcript-foot">
        <button class="pill pill--volt" data-ask>Continue on screen ${arrow}</button>
      </footer>`;
    wireAskButtons(transcript, ctx);
  };

  el.querySelector(".filters")!.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>(".chip");
    if (!chip) return;
    filter = chip.dataset.app!;
    el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-on", c === chip));
    renderList();
  });

  el.querySelector("input")!.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value.trim().toLowerCase();
    renderList();
  });

  list.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLButtonElement>(".session-row");
    if (!row) return;
    selected = sessions.find((s) => s.id === row.dataset.id) ?? selected;
    history.replaceState(null, "", `#/sessions/${selected.id}`);
    renderList();
    renderTranscript(selected);
  });

  renderList();
  renderTranscript(selected);

  requestAnimationFrame(() => {
    scope.tape(el.querySelector(".page-band")!, "broadcast", 0.5, ctx);
    scope.waves(el.querySelector(".page-band")!, "broadcast", 0.5, ctx);
    el.querySelectorAll<HTMLElement>("[data-timecode]").forEach((t) => scope.add(startTimecode(t, 3600 + 812)));
    el.querySelectorAll<HTMLElement>("[data-clock]").forEach((c) => scope.add(startClock(c)));
    startMotion(el, scope, ctx);
  });

  return { el, destroy: () => scope.dispose() };
}

/* ------------------------------------------------------------------------- */
/* SKILLS                                                                    */
/* ------------------------------------------------------------------------- */

export function skillsPage(ctx: PageContext): Page {
  const scope = new Scope();
  const skills = getSkills();

  const el = create(`
    ${pageBand("SKILLS", "field notes", `Context packs ${sep} matched to the app in front`, sticker("books", "band", 5, "0,-90"))}
    <p class="lede" data-reveal="1" data-parallax="0,-40">
      <span class="lede-lead">When you ask for help,</span> Screendial checks which app is in front and loads the matching notes:
      where things sit on screen, and which shortcuts matter. Anything unrecognised falls back to general visual grounding.
    </p>
    <ol class="skill-list">
      ${skills
        .map(
          (s, i) => `
        <li class="skill" data-reveal="${(i % 4) + 2}" data-motion="left">
          <button class="skill-row" aria-expanded="false">
            <span class="skill-index">${String(i + 1).padStart(2, "0")}</span>
            <span class="skill-name">${esc(s.name.replace(/ Skill$/, ""))}</span>
            <span class="skill-desc">${esc(s.description)}</span>
            <span class="skill-apps">${s.targetApps
              .filter((a) => a !== "*")
              .slice(0, 3)
              .map((a) => `<span>${esc(a)}</span>`)
              .join("") || "<span>Fallback</span>"}</span>
            <span class="skill-toggle" aria-hidden="true"></span>
          </button>
          <div class="skill-detail"><div><pre>${esc(s.content.trim())}</pre></div></div>
        </li>`
        )
        .join("")}
    </ol>
  `);

  el.querySelectorAll<HTMLButtonElement>(".skill-row").forEach((row) =>
    row.addEventListener("click", () => {
      const open = row.getAttribute("aria-expanded") === "true";
      row.setAttribute("aria-expanded", String(!open));
      row.parentElement!.classList.toggle("is-open", !open);
    })
  );

  requestAnimationFrame(() => {
    scope.tape(el.querySelector(".page-band")!, "sodium", 0.45, ctx);
    scope.waves(el.querySelector(".page-band")!, "sodium", 0.5, ctx);
    el.querySelectorAll<HTMLElement>("[data-timecode]").forEach((t) => scope.add(startTimecode(t, 7200 + 45)));
    el.querySelectorAll<HTMLElement>("[data-clock]").forEach((c) => scope.add(startClock(c)));
    startMotion(el, scope, ctx);
  });

  return { el, destroy: () => scope.dispose() };
}

/* ------------------------------------------------------------------------- */
/* SETTINGS                                                                  */
/* ------------------------------------------------------------------------- */

export function settingsPage(ctx: PageContext): Page {
  const scope = new Scope();
  const storedKey = localStorage.getItem("screendial_api_key") || "";
  const storedModel = localStorage.getItem("screendial_model") || "gemini-3.5-flash";

  const el = create(`
    ${pageBand("SETTINGS", "calibration", `Tracking ${sep} Signal ${sep} Output`, sticker("cloud", "band", -4, "0,-90"))}
    <form class="settings" autocomplete="off">
      <section class="setting" data-reveal="1" data-motion="left">
        <div class="setting-label"><span class="setting-num" aria-hidden="true" data-parallax="0,-70">01</span><h3>Model</h3><p>Screendial sends your screens and request to Google Gemini.</p></div>
        <div class="setting-fields">
          <label class="field">
            <span class="meta">Gemini API key</span>
            <span class="field-row">
              <input name="key" type="password" value="${esc(storedKey)}" placeholder="AIzaSy&hellip;" spellcheck="false" />
              <button type="button" class="text-btn" data-reveal-key>Show</button>
            </span>
          </label>
          <label class="field">
            <span class="meta">Model</span>
            <input name="model" type="text" value="${esc(storedModel)}" spellcheck="false" />
          </label>
          <button type="submit" class="pill pill--volt">Save ${arrow}</button>
        </div>
      </section>

      <section class="setting" data-reveal="2" data-motion="left">
        <div class="setting-label"><span class="setting-num" aria-hidden="true" data-parallax="0,-70">02</span><h3>Displays</h3><p>Every connected screen is captured on each request.</p></div>
        <ol class="displays"><li class="meta">Scanning&hellip;</li></ol>
      </section>

      <section class="setting" data-reveal="3" data-motion="left">
        <div class="setting-label"><span class="setting-num" aria-hidden="true" data-parallax="0,-70">03</span><h3>Picture</h3><p>Tone down the tape effects in this window.</p></div>
        <div class="setting-fields">
          <label class="switch">
            <input type="checkbox" name="fx" ${ctx.fx < 1 ? "checked" : ""} />
            <span class="switch-track"><span></span></span>
            <span>Reduce VHS effects</span>
          </label>
        </div>
      </section>

      <section class="setting" data-reveal="4" data-motion="left">
        <div class="setting-label"><span class="setting-num" aria-hidden="true" data-parallax="0,-70">04</span><h3>Controls</h3><p>How to reach Screendial while you work.</p></div>
        <dl class="controls">
          <div><dt>Menu bar icon</dt><dd>Ask, voice, hide / show, clear, quit</dd></div>
          <div><dt><kbd>Enter</kbd></dt><dd>Send from the palette</dd></div>
          <div><dt><kbd>Shift</kbd> <kbd>Enter</kbd></dt><dd>New line</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>Clear input, then dismiss</dd></div>
        </dl>
      </section>
    </form>
  `);

  const form = el.querySelector<HTMLFormElement>("form")!;
  const keyInput = form.elements.namedItem("key") as HTMLInputElement;
  const modelInput = form.elements.namedItem("model") as HTMLInputElement;

  el.querySelector<HTMLButtonElement>("[data-reveal-key]")!.addEventListener("click", (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const hidden = keyInput.type === "password";
    keyInput.type = hidden ? "text" : "password";
    btn.textContent = hidden ? "Hide" : "Show";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = keyInput.value.trim();
    const model = modelInput.value.trim() || "gemini-3.5-flash";
    localStorage.setItem("screendial_api_key", key);
    localStorage.setItem("screendial_model", model);
    await broadcastSettings(key, model);
    ctx.toast("Saved. The overlay uses it from the next request.");
  });

  (form.elements.namedItem("fx") as HTMLInputElement).addEventListener("change", (e) => {
    ctx.setFx((e.target as HTMLInputElement).checked ? 0.35 : 1);
  });

  getDisplays().then((displays) => {
    el.querySelector(".displays")!.innerHTML = displays.length
      ? displays
          .map(
            (d) => `
        <li>
          <span class="display-shape" style="aspect-ratio:${d.width}/${d.height}"><span>${d.id}</span></span>
          <span><strong>${esc(d.name)}</strong><span class="meta">${d.width} &times; ${d.height}${d.is_primary ? " &middot; primary" : ""}</span></span>
        </li>`
          )
          .join("")
      : `<li class="meta">No displays reported.</li>`;
  });

  requestAnimationFrame(() => {
    scope.tape(el.querySelector(".page-band")!, "tide", 0.4, ctx);
    scope.waves(el.querySelector(".page-band")!, "tide", 0.5, ctx);
    el.querySelectorAll<HTMLElement>("[data-timecode]").forEach((t) => scope.add(startTimecode(t, 10800 + 3)));
    el.querySelectorAll<HTMLElement>("[data-clock]").forEach((c) => scope.add(startClock(c)));
    startMotion(el, scope, ctx);
  });

  return { el, destroy: () => scope.dispose() };
}
