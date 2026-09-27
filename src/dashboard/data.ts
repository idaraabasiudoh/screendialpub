import { BUILTIN_SKILLS, Skill } from "../skills";

export interface SessionMessage {
  role: "user" | "model";
  text: string;
  tools?: string[];
}

export interface Session {
  id: string;
  title: string;
  app: string;
  startedAt: Date;
  duration: string;
  displays: number;
  messages: SessionMessage[];
  live?: boolean;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** Placeholder archive until sessions are persisted by the overlay. */
const ARCHIVE: Session[] = [
  {
    id: "s-0417",
    title: "Grading a night exterior",
    app: "DaVinci Resolve",
    startedAt: minutesAgo(12),
    duration: "14:08",
    displays: 2,
    messages: [
      { role: "user", text: "The shadows in this shot look green. Where do I fix that?" },
      { role: "model", text: "Open the Color page, then pull the Lift wheel slightly toward magenta. I've highlighted the Lift wheel on your second display.", tools: ["highlight", "voice"] },
      { role: "user", text: "Better. Now how do I copy this grade to the next three clips?" },
      { role: "model", text: "Select the three clips in the thumbnail timeline, then middle-click the graded clip to apply its grade.", tools: ["to_do_overlay", "voice"] },
    ],
  },
  {
    id: "s-0416",
    title: "Tracing a failing fetch",
    app: "Safari",
    startedAt: minutesAgo(95),
    duration: "06:41",
    displays: 1,
    messages: [
      { role: "user", text: "Why is this page stuck on the loading spinner?" },
      { role: "model", text: "Open Web Inspector with Cmd+Option+I and check the Network tab. The /api/feed request returns 401.", tools: ["highlight", "overlay"] },
      { role: "user", text: "How do I see the request headers?" },
      { role: "model", text: "Click the request row, then open the Headers pane on the right. The Authorization header is missing.", tools: ["highlight", "voice"] },
    ],
  },
  {
    id: "s-0415",
    title: "Splitting the editor for a diff",
    app: "Visual Studio Code",
    startedAt: minutesAgo(60 * 5),
    duration: "03:12",
    displays: 2,
    messages: [
      { role: "user", text: "I want this file on the left and its test on the right." },
      { role: "model", text: "Press Cmd+\\ to split the editor, then Cmd+P and type the test file name.", tools: ["overlay", "voice"] },
      { role: "user", text: "Can you give me a snippet that runs only this test?" },
      { role: "model", text: "Here is the command. Paste it into the integrated terminal.", tools: ["code_overlay"] },
    ],
  },
  {
    id: "s-0414",
    title: "Ripple-deleting dead air",
    app: "DaVinci Resolve",
    startedAt: minutesAgo(60 * 26),
    duration: "09:55",
    displays: 2,
    messages: [
      { role: "user", text: "How do I remove this gap without leaving a hole in the timeline?" },
      { role: "model", text: "Select the gap and press Shift+Backspace to ripple delete it. I've boxed the gap on the timeline.", tools: ["highlight", "voice"] },
    ],
  },
  {
    id: "s-0413",
    title: "Finding a folder that vanished",
    app: "Finder",
    startedAt: minutesAgo(60 * 30),
    duration: "02:03",
    displays: 1,
    messages: [
      { role: "user", text: "My exports folder disappeared from the sidebar." },
      { role: "model", text: "Press Cmd+Shift+G and enter ~/Movies/Exports, then drag the folder back into the sidebar.", tools: ["overlay", "voice"] },
    ],
  },
  {
    id: "s-0412",
    title: "Setting up a release checklist",
    app: "Visual Studio Code",
    startedAt: minutesAgo(60 * 52),
    duration: "11:20",
    displays: 2,
    messages: [
      { role: "user", text: "Walk me through cutting a release build." },
      { role: "model", text: "Here is a checklist. I'll tick each step as you finish it.", tools: ["to_do_overlay", "voice"] },
      { role: "user", text: "Where does the bundle end up?" },
      { role: "model", text: "In src-tauri/target/release/bundle/macos. I've highlighted it in the Explorer.", tools: ["highlight"] },
    ],
  },
  {
    id: "s-0411",
    title: "Reopening a closed tab group",
    app: "Safari",
    startedAt: minutesAgo(60 * 76),
    duration: "01:37",
    displays: 1,
    messages: [
      { role: "user", text: "I closed a whole window of research tabs." },
      { role: "model", text: "Open the History menu and choose Reopen Last Closed Window, or press Cmd+Shift+T.", tools: ["highlight", "voice"] },
    ],
  },
];

interface StoredChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: number;
}

/** The overlay's real conversation (same origin, same localStorage). */
function readLiveSession(): Session | null {
  try {
    const raw = localStorage.getItem("screendial_chat_history");
    const history: StoredChatMessage[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(history) || history.length === 0) return null;
    const first = history[0];
    const last = history[history.length - 1];
    const seconds = Math.max(0, Math.round((last.timestamp - first.timestamp) / 1000));
    return {
      id: "live",
      title: history.find((m) => m.role === "user")?.text.slice(0, 48) || "Current session",
      app: "Live",
      startedAt: new Date(first.timestamp),
      duration: `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
      displays: 1,
      live: true,
      messages: history.map((m) => ({ role: m.role, text: m.text })),
    };
  } catch {
    return null;
  }
}

export function getSessions(): Session[] {
  const live = readLiveSession();
  return live ? [live, ...ARCHIVE] : ARCHIVE;
}

export function getSkills(): Skill[] {
  return BUILTIN_SKILLS;
}

export function relativeTime(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
