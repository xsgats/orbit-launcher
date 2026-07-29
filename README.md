# Orbit Launcher

A next-generation Minecraft launcher for Windows. Multiple instances, every mod loader,
a built-in Modrinth + CurseForge browser, and an interface designed to be the nicest part
of your evening.

Orbit is an original project — not a fork of any existing launcher.

---

## What it does

**Instances**
- Unlimited instances, each with its own mods, worlds, configs and settings
- Vanilla, Fabric, Quilt, Forge and NeoForge
- Every Minecraft version Mojang publishes: releases, snapshots, betas and alphas
- Duplicate, import, export (`.orbitpack`), back up and restore
- Custom icons and card artwork, groups, tags and favourites
- Playtime tracking and per-session launch history

**Content**
- Browse, search, install, update, disable and remove mods without leaving the launcher
- Modrinth and CurseForge results side by side, with per-source filters
- Automatic dependency resolution and compatibility warnings
- Modpack installation from either platform, plus `.mrpack` and CurseForge zip import
- Resource packs, shader packs and datapacks managed the same way
- World browser with game mode, difficulty, seed and size read from `level.dat`
- Screenshot gallery with copy-to-clipboard

**Accounts**
- Microsoft sign-in only, with a verified Minecraft: Java Edition licence required
- Multiple accounts with instant switching
- Tokens encrypted at rest with Windows DPAPI; silent refresh before every launch
- No offline mode, no cracked login, no third-party auth — by design

**Java**
- Detects every JDK/JRE already on the machine
- Downloads and manages Eclipse Temurin runtimes on demand
- Picks the right major version per instance automatically

**Everything else**
- Live log viewer with log4j XML parsing, level filtering and search
- Crash report capture and browsing
- Concurrent download manager with checksum verification and progress
- Minecraft news and patch notes
- In-app notifications, auto-updates, NSIS installer and uninstaller

---

## Requirements

- Windows 10 or 11 (x64)
- Node.js 20+ and npm — development only
- A Microsoft account that owns Minecraft: Java Edition

---

## Getting started

```bash
npm install
npm run icons     # regenerate build/icon.ico and resources/ from build/icon.svg
npm run dev       # hot-reloading development build
```

Production build and installer:

```bash
npm run build     # bundles main, preload and renderer into out/
npm run dist      # produces release/<version>/OrbitLauncher-Setup-<version>.exe
```

---

## First-run setup

Two integrations need a key before they work. Both are free, and Orbit tells you
exactly what to do inside the app.

### Microsoft sign-in (required to play)

Microsoft requires every launcher to authenticate under its own Azure application
registration, so Orbit ships without one.

1. Open the [Azure app registrations portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
   and choose **New registration**.
2. Give it any name. Set supported account types to **Personal Microsoft accounts only**.
3. Add a **Mobile and desktop applications** redirect URI of `http://localhost`.
4. Copy the **Application (client) ID** into Orbit under **Accounts** or
   **Settings → Integrations**.

You can also set `ORBIT_MSA_CLIENT_ID` in the environment to pre-fill it.

Orbit uses the OAuth 2.0 authorization-code flow with PKCE against a loopback
redirect. Sign-in happens on Microsoft's own page inside a sandboxed window —
Orbit never sees your password.

### CurseForge (optional)

Modrinth works with no configuration. To also browse CurseForge, get a free key from
the [CurseForge developer console](https://console.curseforge.com/#/api-keys) and paste
it into **Settings → Integrations**.

---

## Where your files live

Everything sits under one library root, `%APPDATA%\OrbitLauncher` by default and
changeable in **Settings → Folders**:

```
OrbitLauncher/
├─ instances/<name>/
│  ├─ .orbit/            instance.json, content.json, custom icon and background
│  └─ minecraft/         the game directory — mods, saves, config, screenshots…
├─ shared/               versions, libraries, assets and natives shared by all instances
├─ java/                 Orbit-managed Temurin runtimes
├─ backups/              per-instance backup archives
├─ cache/                metadata cache and download staging
└─ logs/                 launcher diagnostics
```

Settings, accounts and the Java index live in `%APPDATA%\OrbitLauncher` alongside them
and are never moved by a library relocation.

Set `ORBIT_DATA_ROOT` to pin the library somewhere else — useful for portable installs
and for testing against a throwaway library.

---

## Architecture

```
src/
├─ shared/            types.ts + api.ts — the single contract between processes
├─ preload/           contextBridge surface; the renderer gets no Node access
├─ main/
│  ├─ core/           paths, atomic JSON store, settings, logging, HTTP + cache,
│  │                  zip, NBT reader, media protocol, event fan-out
│  ├─ services/
│  │  ├─ accounts/    MSA → Xbox Live → XSTS → Minecraft, entitlement check
│  │  ├─ minecraft/   version manifest, rule evaluation, libraries, assets, natives
│  │  ├─ loaders/     Fabric/Quilt meta; Forge/NeoForge installer + processor runner
│  │  ├─ store/       Modrinth and CurseForge providers behind one interface
│  │  ├─ content/     jar and pack metadata parsing, local content management
│  │  ├─ instances.ts downloads.ts java.ts launcher.ts logs.ts tasks.ts …
│  └─ ipc.ts          every handler, one error-wrapping registration point
└─ renderer/src/
   ├─ styles/         design tokens, base, shell, controls, patterns, motion
   ├─ components/     primitives, app shell, error boundary
   ├─ pages/          one file per screen, instance tabs under pages/instance/
   ├─ state/          zustand store bridged to main-process events
   └─ lib/            router, formatting, shared instance actions
```

Design notes worth knowing:

- **The renderer never touches the filesystem or network directly.** Everything goes
  through the typed IPC surface in `shared/api.ts`.
- **Long operations are tasks.** `services/tasks.ts` gives every install, download,
  backup and import a cancellable handle with progress that is throttled before it
  reaches the UI, so a 4,000-file asset download does not flood IPC.
- **Forge and NeoForge run the vendor's own installer pipeline.** Orbit extracts
  `install_profile.json`, downloads the installer libraries, resolves the `[maven]`
  and `{TOKEN}` substitution table, then executes each processor on a matching JVM
  and verifies its declared output hashes.
- **Images from disk are served over a custom `orbit-media://` protocol** restricted to
  the library root, rather than being inlined as data URLs.
- **Selectors return stable references.** Zustand reads the snapshot on every render,
  so filtering happens in `useMemo`, never inside the selector.

---

## Development helpers

`ORBIT_CAPTURE=<dir>` walks the main routes and writes a PNG of each one, which makes
UI changes reviewable without driving the app by hand. `ORBIT_CAPTURE_ROUTES` overrides
the route list as JSON, and `ORBIT_CAPTURE_EXIT=1` quits when finished. Both are ignored
in packaged builds.

```bash
npm run typecheck        # main + renderer, strict
npm run build
npm run verify:package   # loads every packaged dependency inside the built app
```

`verify:package` runs automatically as part of `npm run dist`. It exists because
electron-builder prunes `node_modules` by walking the dependency tree itself, and that
walk can silently drop a transitive package — the app then fails on first launch with an
unreadable dialog. The check catches that at build time instead. (`archiver-utils` is
pinned as a direct dependency for the same reason: the collector loses it behind
`archiver`.)

---

## Legal

Minecraft content and materials are trademarks and copyrights of Mojang Studios. Orbit
is an independent launcher and is not endorsed by or associated with Mojang Studios or
Microsoft. Mod metadata is provided by Modrinth and CurseForge under their respective
terms; Java runtimes come from the Eclipse Adoptium project.

Orbit will not run Minecraft without a genuine, verified Java Edition licence.
