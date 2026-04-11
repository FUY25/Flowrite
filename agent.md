# Agent Notes

## Flowrite MarkText test and launch convention

Use this when running Electron or Playwright for `flowrite-marktext`.

### E2E convention

- Run Electron/Playwright commands with Node 20 via `volta`:
  - `NODE_ENV=production volta run --node 20.20.0 yarn ...`
- Playwright e2e now packs automatically in `flowrite-marktext/test/e2e/global-setup.js`.
- Do not run pack and launch in parallel. A partially-written `dist/electron` bundle can open `chrome-error://chromewebdata/` or miss `#/editor`.
- The harness now verifies startup before tests proceed:
  - `yarn run pack` runs in Playwright global setup
  - a smoke launch must reach `#/editor`
  - the editor must expose `#ag-editor-id .ag-paragraph[id]`
- If a direct Playwright run fails before page assertions, treat it as a startup failure first and inspect the helper/global-setup diagnostics instead of trusting downstream timeouts.

### Manual launch convention

- If manual `yarn dev` or direct Electron launch opens a white screen, the next most likely cause is the local app profile:
  - `/Users/fuyuming/Library/Application Support/marktext-dev`
- Safe recovery:
  - `mv "$HOME/Library/Application Support/marktext-dev" "$HOME/Library/Application Support/marktext-dev.backup-$(date +%Y%m%d-%H%M%S)"`
- Reason: corrupted local app/profile/cache state can break renderer startup even when the app code is fine.
- Keep the backup for a while because this resets local preferences/state.
