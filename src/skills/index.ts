export interface Skill {
  id: string;
  name: string;
  targetBundles: string[];
  targetApps: string[];
  description: string;
  recommendedTools: string[];
  content: string;
}

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "davinci-resolve",
    name: "DaVinci Resolve Workflow Skill",
    targetBundles: [
      "com.blackmagic-design.DaVinciResolve",
      "com.blackmagic-design.DaVinciResolveStudio"
    ],
    targetApps: ["DaVinci Resolve", "DaVinci Resolve Studio", "Resolve"],
    description: "Video editing workflows, razor cuts, ripple delete, and inspector panel navigation.",
    recommendedTools: [
      "highlight_element",
      "move_cursor",
      "send_keyboard_shortcut",
      "speak_guidance",
      "show_output_widget"
    ],
    content: `
- Timeline: bottom 45% [ymin: 550, xmin: 0, ymax: 1000, xmax: 1000]
- Blade Tool (B): toolbar above tracks [ymin: 510, xmin: 80, ymax: 540, xmax: 110]
- Selection Mode (A): [ymin: 510, xmin: 50, ymax: 540, xmax: 75]
- Inspector Panel: top-right [ymin: 80, xmin: 750, ymax: 500, xmax: 1000]
- Shortcuts:
  * Razor Cut: 'B'
  * Selection Tool: 'A'
  * Ripple Delete: 'Shift + Backspace' (macOS) / 'Shift + Delete' (Windows)
  * Trim Start: 'Shift + ['
  * Trim End: 'Shift + ]'
  * Play/Pause: 'Space'
`
  },
  {
    id: "safari",
    name: "Safari & Web Browser Navigation Skill",
    targetBundles: [
      "com.apple.Safari",
      "com.apple.SafariTechnologyPreview",
      "com.google.Chrome",
      "company.thebrowser.Browser"
    ],
    targetApps: ["Safari", "Google Chrome", "Arc", "Brave", "Edge"],
    description: "Web browser navigation, address bar, tabs, developer tools, and reader mode.",
    recommendedTools: [
      "highlight_element",
      "move_cursor",
      "send_keyboard_shortcut",
      "speak_guidance",
      "show_output_widget"
    ],
    content: `
- Address & Search Bar: top-center [ymin: 30, xmin: 250, ymax: 75, xmax: 750]
- Tabs Bar: under address bar [ymin: 75, xmin: 0, ymax: 115, xmax: 1000]
- Back/Forward: top-left [ymin: 30, xmin: 70, ymax: 75, xmax: 150]
- Shortcuts:
  * Focus URL: 'Cmd + L'
  * New Tab: 'Cmd + T'
  * Close Tab: 'Cmd + W'
  * Reopen Tab: 'Cmd + Shift + T'
  * Web Inspector: 'Cmd + Option + I'
  * Private Window: 'Cmd + Shift + N'
  * Reload: 'Cmd + R'
`
  },
  {
    id: "vscode",
    name: "Visual Studio Code Developer Skill",
    targetBundles: [
      "com.microsoft.VSCode",
      "com.microsoft.VSCodeInsiders",
      "com.todesktop.230313mzl4w4u92"
    ],
    targetApps: ["Code", "Visual Studio Code", "Cursor"],
    description: "Code editing assistance, command palette, terminal, split editors, and multi-cursor.",
    recommendedTools: [
      "highlight_element",
      "move_cursor",
      "send_keyboard_shortcut",
      "speak_guidance",
      "show_output_widget"
    ],
    content: `
- Command Palette: 'Cmd + Shift + P' (macOS) / 'Ctrl + Shift + P' (Windows)
- File Quick Open: 'Cmd + P'
- Toggle Terminal: 'Ctrl + \`'
- Toggle Primary Sidebar: 'Cmd + B'
- Global Search: 'Cmd + Shift + F'
- Split Editor: 'Cmd + \\'
- Format Document: 'Option + Shift + F'
`
  },
  {
    id: "macos-system",
    name: "macOS System & Window Management Skill",
    targetBundles: [
      "com.apple.finder",
      "com.apple.dock",
      "com.apple.systempreferences"
    ],
    targetApps: ["Finder", "Dock", "System Settings", "Desktop"],
    description: "macOS system-wide desktop operations, window management, and Finder workflows.",
    recommendedTools: [
      "highlight_element",
      "move_cursor",
      "send_keyboard_shortcut",
      "speak_guidance",
      "show_output_widget"
    ],
    content: `
- Spotlight Search: 'Cmd + Space'
- Switch Apps: 'Cmd + Tab'
- Force Quit: 'Option + Cmd + Esc'
- Screen Capture Area: 'Cmd + Shift + 4'
- Screen Recording Bar: 'Cmd + Shift + 5'
- Finder New Window: 'Cmd + N'
- Finder Go to Folder: 'Cmd + Shift + G'
- Mission Control: 'Ctrl + Up Arrow'
`
  },
  {
    id: "general-gui",
    name: "General GUI Visual Grounding Skill",
    targetBundles: ["*"],
    targetApps: ["*"],
    description: "Universal visual grounding for any desktop window or native application.",
    recommendedTools: [
      "highlight_element",
      "move_cursor",
      "send_keyboard_shortcut",
      "speak_guidance",
      "show_output_widget"
    ],
    content: `
- Universal Visual Grounding Guidelines:
  1. Carefully locate interactive buttons, search inputs, toolbars, and menus when the user asks to find or interact with an element.
  2. Normalize bounding box coordinates to [ymin, xmin, ymax, xmax] in 0..1000.
  3. Only invoke highlight_element when the user specifically needs a visual button or element pointed out. For general guidance, questions, or code, use speak_guidance or show_output_widget instead.
`
  }
];

export function resolveSkill(appName: string, _bundleId?: string): Skill {
  const normalized = appName.trim().toLowerCase();
  for (const skill of BUILTIN_SKILLS) {
    if (skill.targetApps.includes("*")) continue;
    for (const target of skill.targetApps) {
      if (normalized.includes(target.toLowerCase())) {
        return skill;
      }
    }
  }
  return BUILTIN_SKILLS.find((s) => s.id === "general-gui")!;
}
