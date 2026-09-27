# Screendial — landing site

The public marketing site for [Screendial](../Screendial), the real-time desktop copilot that
highlights, explains, and narrates whatever's on your screen. Single-page (Home only), built with
TypeScript + Vite, reusing the desktop app's VHS/viewfinder visual language and motion system.

Outside Tauri it runs in plain browser mode — desktop-only actions (voice, the command palette)
show a toast instead of doing anything.

## What's on the page

- **Hero** — SCREENDIAL wordmark, tagline, and two copy-to-clipboard install commands: a
  `curl | bash` one-liner for macOS and an `irm | iex` one-liner for Windows.
- **Watches & narrates** — general pitch for the highlight + voice-guidance experience.
- **Works with** — tag list of supported apps (DaVinci Resolve, Excel, Photoshop, Final Cut Pro,
  Xcode, VS Code, Safari, Finder, PowerPoint).
- **Ticker + footer** — decorative app-name/verb crawl and a tape-style sign-off.

There's no Sessions/Skills/Settings navigation or embedded chat bar — those were part of the
desktop dashboard this site was forked from and have been stripped out for the public landing page.

## Install scripts

Both hero commands run a script straight from GitHub, which downloads the installer from a
[GitHub Release asset](https://github.com/idaraabasiudoh/screendialpub/releases) and runs it:

```sh
# macOS
curl -fsSL https://raw.githubusercontent.com/idaraabasiudoh/screendialpub/main/install.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/idaraabasiudoh/screendialpub/main/install.ps1 | iex
```

- [`install.sh`](install.sh) mounts the `.dmg`, copies `Screendial.app` into `/Applications`, and
  clears the Gatekeeper quarantine flag (the app is unnotarized).
- [`install.ps1`](install.ps1) runs the NSIS `-setup.exe` silently (`/S`) and launches the app if
  it can find it under the usual Tauri install locations. It hasn't been run against a real
  Windows machine yet — verify it there before pointing more people at it.

Neither installer binary is committed to this repo — `VITE_*` build vars get compiled straight
into the app bundle, so any build meant for public distribution must be built with a
rate-limited/demo key, never a production key, and uploaded as a release asset instead of a
git-tracked file.

To ship a new build:
1. Build with demo-safe keys, publish (or update) a [GitHub Release](https://github.com/idaraabasiudoh/screendialpub/releases/new) with the `.dmg`/`-setup.exe` attached.
2. Update `DMG_URL` in `install.sh` and/or `$ExeUrl` in `install.ps1` to the new release's asset URL.
3. If a URL or the release tag changed, update `MAC_INSTALL_CMD`/`WINDOWS_INSTALL_CMD` in
   `src/dashboard/pages.ts` (`homePage`) to match.

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
```
