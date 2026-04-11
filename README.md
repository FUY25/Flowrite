# Flowrite

Flowrite is a mac-first writing editor built on top of a MarkText fork in [`flowrite-marktext`](./flowrite-marktext).

This repo is the real git root. `flowrite-marktext` is a normal tracked folder inside this repo, not a nested git repository.

## Canonical Repo

- Canonical GitHub repo: `https://github.com/FUY25/Flowrite`
- Local path and GitHub repo are two views of the same project.
- Push and pull from the root repo, not from inside `flowrite-marktext`.
- Collaborators should treat GitHub as the shared source of truth once a branch is pushed.

## Workspace Layout

- [`flowrite-marktext`](./flowrite-marktext): the Electron app
- [`ROADMAP.md`](./ROADMAP.md): current product roadmap
- [`agent.md`](./agent.md): collaborator and agent working conventions

## Current Runtime Baseline

- Electron: `29.4.6`
- electron-builder: `26.8.1`
- App framework: Vue 2 + Muya
- Embedded Node in Electron 29: Node 20 line
- Recommended Node for local pack/e2e commands in this repo: `20.20.0`

Notes:

- The app itself runs through Electron.
- For local Playwright and pack flows, this repo has been most reliable with `volta run --node 20.20.0`.

## Local Development

Run the app manually:

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
yarn dev
```

Direct Electron launch fallback:

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist/electron/main.js
```

If the local dev profile causes a white screen, move it aside before relaunching:

```bash
mv "$HOME/Library/Application Support/marktext-dev" \
  "$HOME/Library/Application Support/marktext-dev.backup-$(date +%Y%m%d-%H%M%S)"
```

That issue has been caused by corrupted local app profile state, not by deleting `~/.git` or `~/.npm`.

## Build And Test Conventions

Renderer and main production pack:

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
NODE_ENV=production volta run --node 20.20.0 yarn run pack
```

Playwright e2e:

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
NODE_ENV=production volta run --node 20.20.0 yarn playwright test -c test/e2e/playwright.config.js
```

Important notes:

- The e2e harness now auto-packs before tests.
- If an Electron e2e run does not reach `#/editor`, do not trust downstream UI failures until startup is fixed.
- Prefer plain `yarn` commands in this repo.

## macOS Packaging Guidance

The current packaging config lives in [`flowrite-marktext/electron-builder.yml`](./flowrite-marktext/electron-builder.yml).

Current state:

- mac targets are configured for `dmg` and `zip`
- both `x64` and `arm64` artifacts are configured
- the build currently produces separate architecture-specific mac artifacts

What this means in practice:

- Intel Macs are supported by the `x64` build
- Apple Silicon Macs are supported by the `arm64` build
- this is not currently a single universal mac build

## Architecture Risk Notes For macOS DMG Distribution

The current setup is acceptable for shipping separate Intel and Apple Silicon DMGs, but there are a few important caveats.

### 1. Not universal yet

The current config builds separate `x64` and `arm64` artifacts. That is fine if users download the matching DMG, but it is not ideal if the product goal is "one mac download for all users".

If you want one artifact for both Intel and Apple Silicon Macs, the packaging strategy should be upgraded to a universal mac build instead of only publishing split-arch DMGs.

### 2. Native module rebuilds are required on macOS

This repo has an explicit Darwin postinstall workaround in [`flowrite-marktext/.electron-vue/postinstall.js`](./flowrite-marktext/.electron-vue/postinstall.js) because prebuilt native binaries have been unreliable for the correct architecture on macOS.

Implications:

- release machines need Xcode Command Line Tools
- native modules are rebuilt from source on macOS
- build time and CI fragility are higher than in a pure-JS app

This architecture is workable, but it is a real release-engineering constraint.

### 3. Code signing and notarization are still required for real distribution

For broad macOS distribution, especially across newer macOS versions, unsigned or un-notarized DMGs will create Gatekeeper friction.

If the product goal is polished mac distribution, the release pipeline should include:

- Developer ID signing
- notarization
- staple step for shipped artifacts

### 4. macOS version floor

Because this app is on Electron 29, the practical macOS support floor is modern macOS only. Electron's support policy for this generation no longer targets older pre-Catalina systems.

Treat macOS `10.15 Catalina` or later as the minimum baseline for planning. If the product needs older macOS support, the current Electron baseline is not a good fit.

## Recommendation

If the near-term goal is simply "ship DMGs for both Intel and Apple Silicon Macs", the current architecture is good enough.

If the goal is "one polished mac download that works everywhere", the current architecture is not fully there yet. The next release-engineering step should be:

1. decide whether to ship split-arch or universal artifacts
2. add signing + notarization
3. document the supported macOS floor clearly on the download page

## Related Files

- [`flowrite-marktext/README.md`](./flowrite-marktext/README.md): upstream-style app README
- [`flowrite-marktext/electron-builder.yml`](./flowrite-marktext/electron-builder.yml): packaging config
- [`flowrite-marktext/.electron-vue/postinstall.js`](./flowrite-marktext/.electron-vue/postinstall.js): Darwin native rebuild workaround
- [`ROADMAP.md`](./ROADMAP.md): product roadmap
