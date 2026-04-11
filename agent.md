# Agent Notes

This file is the quick collaborator guide for working in this repo with Codex, Claude Code, OpenClaw, or any other coding agent.

## Repo shape

- Real git root: `/Users/fuyuming/Desktop/project/Flowrite`
- Canonical GitHub repo: `https://github.com/FUY25/Flowrite`
- `flowrite-marktext/` is a normal tracked folder inside the root repo, not a nested git repo
- Commit from the root repo, not from inside `flowrite-marktext`
- Push and pull from the root repo
- Once work is pushed, GitHub is the shared collaboration source of truth, not only the local folder

## Tech stack

- Desktop app: Electron `29.4.6`
- Packaging: `electron-builder 26.8.1`
- Renderer app: Vue 2
- Editor core: Muya
- Preferred local Node for pack/e2e flows: `20.20.0`
- Package manager: `yarn`

## Working conventions

- Prefer plain `yarn` commands in this repo.
- Prefer `volta run --node 20.20.0` for pack and Playwright flows.
- Do not use `npx` unless there is no repo-local equivalent.
- Do not reintroduce generated artifacts into git.
- Be careful with `dist/electron` and other packed outputs. They are runtime artifacts, not source.

## Documentation rules

- Keep product and project docs under the repo `docs/` tree instead of scattering notes around the workspace.
- Approved product specs belong in `docs/specs/`.
- Implementation plans belong in `flowrite-marktext/docs/superpowers/plans/` when they are app-specific execution plans.
- If a plan is repo-wide rather than app-specific, keep it under the root `docs/` tree.
- Before starting larger feature work, read the relevant spec and plan first.

## Coding expectations

- Write tests first for behavior changes and bug fixes.
- Follow TDD when possible:
  - write the failing test
  - verify it fails for the right reason
  - implement the smallest fix
  - rerun the targeted test
- Prefer targeted tests before broad suites while iterating.
- Use the Codex superpower skills where they fit the task instead of improvising a new process:
  - `systematic-debugging` for bugs
  - `test-driven-development` for fixes and features
  - `verification-before-completion` before claiming success
  - `writing-plans` or existing plan docs before larger execution work
- If there is already an approved spec or plan, execute against that instead of inventing a new direction.

## File editing rules

- Respect existing user changes in the worktree.
- Do not revert unrelated modifications.
- Keep changes focused.
- Prefer editing source rather than layering temporary hacks on top.
- Reuse existing components and flows where possible instead of duplicating UI or business logic.

## Flowrite architecture guardrails

- Margin comments, global discussion, and suggestions should use the Flowrite sidecar/runtime system.
- Do not write comment UI state into the user markdown file.
- Preserve the separation between:
  - markdown content
  - Flowrite sidecar metadata
  - runtime / AI orchestration

## Test and launch convention for `flowrite-marktext`

Use this when running Electron or Playwright for `flowrite-marktext`.

### E2E convention

- Run Electron/Playwright commands with Node 20 via `volta`:
  - `NODE_ENV=production volta run --node 20.20.0 yarn ...`
- Playwright e2e packs automatically in `flowrite-marktext/test/e2e/global-setup.js`.
- Do not run pack and launch in parallel. A partially-written `dist/electron` bundle can open `chrome-error://chromewebdata/` or miss `#/editor`.
- The harness verifies startup before tests proceed:
  - `yarn run pack` runs in Playwright global setup
  - a smoke launch must reach `#/editor`
  - the editor must expose `#ag-editor-id .ag-paragraph[id]`
- If a direct Playwright run fails before page assertions, treat it as a startup failure first and inspect the helper/global-setup diagnostics instead of trusting downstream timeouts.

### Manual launch convention

- Manual app launch:
  - `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext`
  - `yarn dev`
- Direct Electron fallback:
  - `./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist/electron/main.js`

### White-screen recovery

- If manual `yarn dev` or direct Electron launch opens a white screen, the likely cause is the local app profile:
  - `/Users/fuyuming/Library/Application Support/marktext-dev`
- Safe recovery:
  - `mv "$HOME/Library/Application Support/marktext-dev" "$HOME/Library/Application Support/marktext-dev.backup-$(date +%Y%m%d-%H%M%S)"`
- Reason: corrupted local app/profile/cache state can break renderer startup even when the app code is fine.
- Keep the backup for a while because this resets local preferences and local state.

## Packaging notes

- Current mac packaging is good enough for separate Intel and Apple Silicon builds.
- Current setup is not yet a single universal mac build.
- For real distribution, signing and notarization still need to be part of the release path.

## Good collaborator defaults

- Start by reading the relevant spec, plan, and nearby code.
- Prefer a small reproducible test over a guess.
- Verify behavior before claiming a fix.
- Leave the repo easier to understand than you found it.
