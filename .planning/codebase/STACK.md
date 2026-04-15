# Technology Stack

**Analysis Date:** 2026-04-15

## Languages

**Primary:**
- JavaScript (ES2020+) — All application code: Electron main process, Vue renderer, shared modules
- Vue SFC (`.vue`) — Renderer UI components with inline `<template>`, `<script>`, `<style scoped>`

**Secondary:**
- CSS (scoped, PostCSS with `color-mix()`) — Component styles, uses CSS custom properties for theming

## Runtime

**Environment:**
- Node.js — Electron main process (worker_threads, fs-extra, path, crypto)
- Chromium renderer — Vue 2 SPA in Electron renderer process
- Worker threads — AI agent loop runs in a `worker_thread` spawned by Node.js main process

**Electron Version:**
- `^29.4.6` (devDependency; actual binary rebuilt against target Node ABI)
- `@electron/remote` `^2.1.3` — Bridges renderer/main for remote module calls

## Package Manager

- **Yarn** (lockfile: `yarn.lock` present)
- Also usable with `npm` (root-level `package-lock.json` in project root)

## Frameworks

**Core:**
- Vue `^2.6.14` — Renderer SPA framework (Options API throughout)
- Vuex `^3.6.2` — State management (modules pattern; `flowrite` module at `src/renderer/store/modules/flowrite.js`)
- Vue Router `^3.5.3` — Client-side routing in renderer
- Element UI `^2.15.8` — Component library (dialogs, forms in preferences)
- Muya — Custom in-source WYSIWYG markdown editor (`src/muya/`) forked from MarkText

**Build:**
- Webpack `^5.72.0` — Bundler for both main and renderer processes
- `electron-vue` build scripts in `.electron-vue/` directory
- Babel `^7.x` — Transpilation with `@babel/preset-env`, class properties plugin
- `electron-builder` `^26.8.1` — Packaging/release

**Testing:**
- Karma `^6.3.18` + Mocha `^9.2.2` — Unit test runner (`src/renderer`, `src/main`)
- `@playwright/test` `^1.59.1` — End-to-end tests (`test/e2e/`)
- `chai` `^4.3.6` — Assertions in unit and eval tests
- `dotenv` `^16.0.0` — Required for flowrite eval tests (`test/evals/flowrite-smoke.spec.js`)

## Key Dependencies

**AI / Anthropic:**
- `@anthropic-ai/sdk` `^0.86.1` — Official Anthropic TypeScript/JavaScript SDK. Used in both the Electron main process (`src/main/flowrite/ai/anthropicClient.js`) and injected into the `worker_thread` runtime string at build time.
- `undici` `^5.28.5` — Polyfills `fetch`, `Headers`, `Request`, `Response`, `FormData` for Anthropic SDK in Node.js/Electron environments that lack native fetch APIs. Applied in both main process and worker thread global scope.

**Storage / File System:**
- `fs-extra` `^10.1.0` — Extended fs for sidecar JSON reads/writes (`src/main/flowrite/files/`)
- `electron-store` `^8.0.1` — Persistent settings store for Flowrite preferences (base URL, model, encrypted API key, collaborationMode)
- `keytar` `^7.9.0` — Native credential storage (present in dependencies; `electron.safeStorage` is the primary encryption mechanism)

**Editor:**
- `codemirror` `^5.65.2` — Code block editing inside Muya
- `prismjs` `^1.27.0` — Syntax highlighting
- `snabbdom` `^3.4.0` + `snabbdom-to-html` `^7.0.0` — Virtual DOM used by Muya
- `mermaid` `^10.0.0` — Diagram rendering in editor

**Networking / HTTP:**
- `axios` `^0.26.1` — Used in renderer for preferences/image upload paths (not for AI calls)

**Other Utilities:**
- `electron-log` `^4.4.6` — Structured logging in main process
- `fuzzaldrin` `^2.1.0` — Fuzzy string matching (used for anchor drift reattachment)
- `vscode-ripgrep` `^1.12.1` — Search in open folder

## Configuration

**Environment Variables (development/testing):**
- `AI_GATEWAY_API_KEY` — API key for Vercel AI gateway; fallback when no key is stored in safeStorage
- `FLOWRITE_MODEL` — Override default model (default: `anthropic/claude-sonnet-4.6`)
- `FLOWRITE_AI_BASE_URL` — Override gateway base URL (default: `https://ai-gateway.vercel.sh`)
- `FLOWRITE_TEST_CLIENT_MODULE` — Path to a test client module for eval tests
- Actual values NOT committed; `.env` file used in test contexts via `dotenv`

**Build Config Files:**
- `flowrite-marktext/electron-builder.yml` — Electron packaging targets (macOS, Linux, Windows)
- `flowrite-marktext/babel.config.js` — Babel config
- `flowrite-marktext/.electron-vue/` — Webpack configs for main/renderer and dev-runner

**Runtime Settings (persisted):**
- Stored via `electron-store` under key `flowrite`
- Fields: `enabled`, `baseURL`, `model`, `collaborationMode`, `encryptedApiKey`, `hasCompletedFirstRun`
- API key encrypted at rest using `electron.safeStorage.encryptString` (OS keychain)

## Platform Requirements

**Development:**
- Node.js (compatible with Electron 29 ABI)
- Yarn (for lockfile fidelity)
- macOS/Linux/Windows (electron-rebuild required for native modules: `keytar`, `native-keymap`, `fontmanager-redux`)

**Production:**
- Packaged as Electron desktop app
- macOS, Linux, Windows targets via `electron-builder`
- AI features require internet access + valid `AI_GATEWAY_API_KEY`

---

*Stack analysis: 2026-04-15*
