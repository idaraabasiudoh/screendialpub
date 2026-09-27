import "../styles/fonts.css";
import "../styles/tape.css";
import "../styles/vhs.css";
import "../styles/brand.css";
import { homePage, sessionsPage, settingsPage, skillsPage, Page, PageContext } from "./pages";
import { listen } from "@tauri-apps/api/event";
import { isTauri, logo, prefersReducedMotion } from "./ui";

const ROUTES = [
  { path: "home", label: "Home" },
  { path: "sessions", label: "Sessions" },
  { path: "skills", label: "Skills" },
  { path: "settings", label: "Settings" },
] as const;

const FX_KEY = "screendial_dashboard_fx";

function readFx(): number {
  try {
    return Number(localStorage.getItem(FX_KEY)) || 1;
  } catch {
    return 1;
  }
}

class Dashboard {
  private shell: HTMLElement;
  private view: HTMLElement;
  private toastEl: HTMLElement;
  private current: Page | null = null;
  private routeToken = 0;
  private visited = new Set<string>();
  private ctx: PageContext;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="shell">
        <header class="topbar" data-tauri-drag-region>
          <a class="wordmark" href="#/home">${logo(24)}<span>Screendial</span></a>
          <nav class="nav">
            ${ROUTES.map(
              (r, i) => `<a href="#/${r.path}" data-route="${r.path}"><span class="nav-num">0${i + 1}</span>${r.label}</a>`
            ).join("")}
          </nav>
          <span class="topbar-status meta"><span class="osd-dot"></span>Standby</span>
        </header>
        <main class="view" tabindex="-1"></main>
        <div class="tracking-wipe" aria-hidden="true"></div>
        <div class="toast" role="status" aria-live="polite"></div>
      </div>`;

    this.shell = root.querySelector(".shell")!;
    this.view = root.querySelector(".view")!;
    this.toastEl = root.querySelector(".toast")!;

    this.ctx = {
      navigate: (path) => (location.hash = `#/${path}`),
      firstVisit: true,
      fx: readFx(),
      setFx: (value) => {
        this.ctx.fx = value;
        try {
          localStorage.setItem(FX_KEY, String(value));
        } catch {
          /* per-viewer preference only */
        }
        document.documentElement.dataset.fx = value < 1 ? "low" : "full";
        window.dispatchEvent(new Event("screendial:fx"));
      },
      toast: (message) => this.toast(message),
    };
    document.documentElement.dataset.fx = this.ctx.fx < 1 ? "low" : "full";

    // Topbar turns solid once content scrolls under it. Read scrollTop in a frame, not in
    // the event: by then parallax has written styles, and a read here forces a sync layout.
    let scrollFrame = 0;
    this.view.addEventListener(
      "scroll",
      () => {
        scrollFrame ||= requestAnimationFrame(() => {
          scrollFrame = 0;
          this.shell.classList.toggle("is-scrolled", this.view.scrollTop > 24);
        });
      },
      { passive: true }
    );

    window.addEventListener("hashchange", () => this.route(true));
    this.route(false);

    // The floating bar's gear opens Settings here.
    if (isTauri) {
      listen<string>("dashboard-navigate", ({ payload }) => this.ctx.navigate(payload));
    }
  }

  private resolve(): { name: string; page: (ctx: PageContext) => Page } {
    const [name = "home", param] = location.hash.replace(/^#\/?/, "").split("/");
    switch (name) {
      case "sessions":
        return { name, page: (ctx) => sessionsPage(ctx, param) };
      case "skills":
        return { name, page: skillsPage };
      case "settings":
        return { name, page: settingsPage };
      default:
        return { name: "home", page: homePage };
    }
  }

  private async route(animate: boolean) {
    const { name, page } = this.resolve();
    const token = ++this.routeToken;

    this.shell.dataset.route = name;
    this.shell.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((a) => {
      a.toggleAttribute("aria-current", a.dataset.route === name);
    });

    // Tape "tracking" wipe: the old frame tears, the new one rolls in.
    const wipe = animate && !prefersReducedMotion();
    if (wipe) {
      this.shell.classList.remove("is-tracking");
      void this.shell.offsetWidth;
      this.shell.classList.add("is-tracking");
      await new Promise((r) => setTimeout(r, 150));
      if (token !== this.routeToken) return;
    }

    this.current?.destroy();
    this.ctx.firstVisit = !this.visited.has(name);
    this.visited.add(name);
    this.current = page(this.ctx);
    this.view.replaceChildren(this.current.el);
    this.view.scrollTop = 0;
    this.shell.classList.remove("is-scrolled");

    if (wipe) {
      setTimeout(() => {
        if (token === this.routeToken) this.shell.classList.remove("is-tracking");
      }, 300);
    }
  }

  private toastTimer = 0;
  private toast(message: string) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("is-on");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("is-on"), 2600);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new Dashboard(document.getElementById("dashboard")!);
});
