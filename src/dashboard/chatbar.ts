import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { esc, isTauri, logo } from "./ui";
import { pixelArrow, pixelIcon } from "./pixel-icons";

/**
 * The Screendial chat bar, embedded in the dashboard.
 *
 * The overlay window owns the agent (screen capture, Gemini, on-screen tools), so this
 * bar is a remote control for it: queries, voice, clear and audio go out as events,
 * and the overlay reports its state, status text and replies back.
 */

type AgentState = "idle" | "listening" | "processing";

interface Exchange {
  query: string;
  reply: string;
  tools: string[];
  error?: boolean;
}

// Survives page changes within the dashboard.
const session = {
  state: "idle" as AgentState,
  audio: false,
  status: "",
  log: [] as Exchange[],
  pending: "",
  acked: false,
};

const ICONS = {
  clear: pixelIcon("trash"),
  audioOff: pixelIcon("sound-off"),
  audioOn: pixelIcon("sound-on"),
  settings: pixelIcon("settings"),
  mic: pixelIcon("mic"),
};

const STATUS_IDLE = "Standby — Enter to send, Shift+Enter for a new line";

export interface ChatBar {
  el: HTMLElement;
  destroy(): void;
}

export function createChatBar(opts: { onOpenSettings(): void; toast(message: string): void }): ChatBar {
  const el = document.createElement("div");
  el.className = "chatbar";
  el.innerHTML = `
    <ol class="chat-log" aria-live="polite"></ol>
    <p class="chatbar-status meta"><span class="osd-dot"></span><span class="chatbar-status-text"></span></p>
    <form class="chatbar-box" autocomplete="off">
      <span class="chatbar-mark" aria-hidden="true">${logo(30)}</span>
      <label class="sr-only" for="chatbar-input">Ask Screendial</label>
      <textarea id="chatbar-input" rows="1" spellcheck="false"
        placeholder="Ask Screendial for anything on your screen"></textarea>
      <div class="chatbar-tools">
        <button type="button" class="icon-btn" data-act="clear" title="Clear conversation">${ICONS.clear}</button>
        <button type="button" class="icon-btn" data-act="audio" aria-pressed="false" title="Audio output"></button>
        <button type="button" class="icon-btn" data-act="settings" title="Settings">${ICONS.settings}</button>
        <button type="button" class="icon-btn icon-btn--mic" data-act="voice" aria-pressed="false" title="Voice command">${ICONS.mic}</button>
        <button type="submit" class="chatbar-send">Send
          ${pixelArrow}
        </button>
      </div>
      <span class="chatbar-progress" aria-hidden="true"></span>
    </form>`;

  const form = el.querySelector<HTMLFormElement>("form")!;
  const input = el.querySelector<HTMLTextAreaElement>("textarea")!;
  const statusText = el.querySelector<HTMLElement>(".chatbar-status-text")!;
  const logEl = el.querySelector<HTMLOListElement>(".chat-log")!;
  const audioBtn = el.querySelector<HTMLButtonElement>('[data-act="audio"]')!;
  const micBtn = el.querySelector<HTMLButtonElement>('[data-act="voice"]')!;

  const render = () => {
    el.dataset.state = session.state;
    micBtn.setAttribute("aria-pressed", String(session.state === "listening"));
    audioBtn.setAttribute("aria-pressed", String(session.audio));
    // swap the icon only when the setting flips, not on every render
    if (audioBtn.dataset.audio !== String(session.audio)) {
      audioBtn.dataset.audio = String(session.audio);
      audioBtn.innerHTML = session.audio ? ICONS.audioOn : ICONS.audioOff;
    }
    audioBtn.title = session.audio ? "Audio output on" : "Audio output muted";
    statusText.textContent =
      session.status ||
      (session.state === "listening"
        ? "Listening — press the mic again to send"
        : session.state === "processing"
          ? "Analyzing your screens…"
          : STATUS_IDLE);
  };

  const renderLog = () => {
    const recent = session.log.slice(-1);
    const rows = recent.map(
      (x) => `
      <li class="chat-turn">
        <span class="meta">You</span><p>${esc(x.query)}</p>
      </li>
      <li class="chat-turn chat-turn--agent${x.error ? " is-error" : ""}">
        <span class="meta">Screendial</span>
        <p>${esc(x.reply)}${x.tools.length ? `<span class="chat-tools">${x.tools.map((t) => `<code>${esc(t)}</code>`).join("")}</span>` : ""}</p>
      </li>`
    );
    if (session.state === "processing" && session.pending) {
      rows.push(`<li class="chat-turn"><span class="meta">You</span><p>${esc(session.pending)}</p></li>`);
    }
    logEl.innerHTML = rows.join("");
    el.classList.toggle("has-log", rows.length > 0);
  };

  const autoGrow = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };

  // If the overlay never picks a request up (not running, reloading), unlock the bar
  // rather than leaving it stuck in "processing".
  let ackTimer = 0;
  let doneTimer = 0;
  const giveUp = (message: string) => {
    if (session.state !== "processing") return;
    session.state = "idle";
    session.status = "";
    if (session.pending) {
      session.log.push({ query: session.pending, reply: message, tools: [], error: true });
      session.pending = "";
    }
    render();
    renderLog();
  };
  const clearTimers = () => {
    window.clearTimeout(ackTimer);
    window.clearTimeout(doneTimer);
  };

  const send = async () => {
    const query = input.value.trim();
    if (!query || session.state === "processing") return;
    input.value = "";
    autoGrow();
    session.pending = query;
    session.state = "processing";
    session.status = "";
    render();
    renderLog();

    if (isTauri) {
      clearTimers();
      session.acked = false;
      ackTimer = window.setTimeout(() => {
        if (!session.acked) giveUp("Couldn't reach the overlay. Is Screendial running?");
      }, 5000);
      doneTimer = window.setTimeout(() => giveUp("No answer after 90 seconds. Try again."), 90_000);
      await emit("dashboard-query", { query });
      return;
    }
    // Browser preview: there is no overlay to drive.
    window.setTimeout(() => {
      session.log.push({
        query,
        reply: "Preview mode. Open the desktop app to see guidance drawn on your screen.",
        tools: [],
      });
      session.pending = "";
      session.state = "idle";
      render();
      renderLog();
    }, 1400);
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });

  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (input.value) {
        input.value = "";
        autoGrow();
      } else {
        input.blur();
      }
    }
  });

  el.querySelector(".chatbar-tools")!.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!btn) return;
    switch (btn.dataset.act) {
      case "clear":
        session.log = [];
        session.pending = "";
        renderLog();
        if (isTauri) await emit("dashboard-clear-chat");
        opts.toast("Conversation cleared");
        break;
      case "audio":
        if (isTauri) {
          await emit("dashboard-toggle-audio");
        } else {
          session.audio = !session.audio;
          render();
        }
        break;
      case "settings":
        opts.onOpenSettings();
        break;
      case "voice":
        if (!isTauri) {
          opts.toast("Voice works inside the desktop app");
          break;
        }
        await emit("dashboard-voice");
        break;
    }
  });

  // "/" focuses the bar from anywhere on the page, like a search field.
  const onSlash = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === "/" && !/input|textarea/i.test(target.tagName) && !target.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  };
  window.addEventListener("keydown", onSlash);

  // Mirror the overlay's agent.
  const unlisteners: Promise<UnlistenFn>[] = [];
  if (isTauri) {
    unlisteners.push(
      listen<{ state: AgentState; audio: boolean }>("agent-state", ({ payload }) => {
        if (payload.state === "processing") session.acked = true;
        if (payload.state === "idle") {
          session.status = "";
          clearTimers();
        }
        session.state = payload.state;
        session.audio = payload.audio;
        render();
      }),
      listen<{ text: string; visible: boolean }>("agent-status", ({ payload }) => {
        session.status = payload.visible ? payload.text : "";
        render();
      }),
      listen<{ query: string; reply: string; tools: string[]; error?: boolean }>("agent-reply", ({ payload }) => {
        session.log.push(payload);
        session.pending = "";
        renderLog();
      })
    );
    emit("dashboard-sync");
  }

  render();
  renderLog();

  return {
    el,
    destroy() {
      window.removeEventListener("keydown", onSlash);
      clearTimers();
      unlisteners.forEach((p) => p.then((off) => off()));
    },
  };
}
