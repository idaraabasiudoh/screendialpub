# Screendial — landing site

The public marketing site for [Screendial](../Screendial), the real-time desktop copilot that
highlights, explains, and narrates whatever's on your screen. Single-page (Home only), built with
TypeScript + Vite, reusing the desktop app's VHS/viewfinder visual language and motion system.

Outside Tauri it runs in plain browser mode — desktop-only actions (voice, the command palette)
show a toast instead of doing anything.

## What's on the page

- **Hero** — SCREENDIAL wordmark, tagline, and an install command: a one-line `curl | bash` for
  macOS (copy-to-clipboard) and a disabled "Coming soon" pill for Windows.
- **Watches & narrates** — general pitch for the highlight + voice-guidance experience.
- **Works with** — tag list of supported apps (DaVinci Resolve, Excel, Photoshop, Final Cut Pro,
  Xcode, VS Code, Safari, Finder, PowerPoint).
- **Ticker + footer** — decorative app-name/verb crawl and a tape-style sign-off.

There's no Sessions/Skills/Settings navigation or embedded chat bar — those were part of the
desktop dashboard this site was forked from and have been stripped out for the public landing page.

## macOS install

The hero's terminal command runs [`install.sh`](install.sh) straight from GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/idaraabasiudoh/screendialpub/main/install.sh | bash
```

`install.sh` downloads the `.dmg` from a [GitHub Release asset](https://github.com/idaraabasiudoh/screendialpub/releases),
mounts it, copies `Screendial.app` into `/Applications`, and clears the Gatekeeper quarantine flag
(the app is unnotarized).

The `.dmg` is **not** committed to this repo — `VITE_*` build vars get compiled straight into the
app bundle, so any build meant for public distribution must be built with a rate-limited/demo key,
never a production key, and uploaded as a release asset instead of a git-tracked file.

To ship a new build:
1. Build with demo-safe keys, publish a new [GitHub Release](https://github.com/idaraabasiudoh/screendialpub/releases/new) with the `.dmg` attached.
2. Update `DMG_URL` in `install.sh` to the new release's asset URL.
3. If the install command's URL or the release tag changed, update `INSTALL_SCRIPT_URL` in
   `src/dashboard/pages.ts` (`homePage`) to match.

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
```
