# Screendial — landing site

The public marketing site for [Screendial](../Screendial), the real-time desktop copilot that
highlights, explains, and narrates whatever's on your screen. Single-page (Home only), built with
TypeScript + Vite, reusing the desktop app's VHS/viewfinder visual language and motion system.

Outside Tauri it runs in plain browser mode — desktop-only actions (voice, the command palette)
show a toast instead of doing anything.

## What's on the page

- **Hero** — SCREENDIAL wordmark, tagline, and download buttons: macOS (`.dmg`, bundled in
  `public/downloads/`) and Windows (disabled, "Coming soon").
- **Watches & narrates** — general pitch for the highlight + voice-guidance experience.
- **Works with** — tag list of supported apps (DaVinci Resolve, Excel, Photoshop, Final Cut Pro,
  Xcode, VS Code, Safari, Finder, PowerPoint).
- **Ticker + footer** — decorative app-name/verb crawl and a tape-style sign-off.

There's no Sessions/Skills/Settings navigation or embedded chat bar — those were part of the
desktop dashboard this site was forked from and have been stripped out for the public landing page.

## Updating the macOS download

Replace `public/downloads/Screendial_<version>.dmg` with the new build and update the `href` in
the hero's download link in `src/dashboard/pages.ts` (`homePage`) to match the filename.

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
```
