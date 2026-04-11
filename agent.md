# Agent Notes

## Flowrite MarkText test and launch convention

Use this when running Electron or Playwright for `flowrite-marktext`.

### E2E convention

- Run Electron/Playwright commands with Node 20 via `volta`:
  - `NODE_ENV=production volta run --node 20.20.0 yarn ...`
- Before Playwright e2e, rebuild the packed Electron app:
  - `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext`
  - `NODE_ENV=production volta run --node 20.20.0 yarn run pack`
- Reason: the checked-in `dist/electron` bundle can become stale or route incorrectly. The failure mode we hit was:
  - Electron launched `file:///.../dist/electron/index.html?...` without `#/editor`
  - the renderer never mounted the editor document
  - Playwright then timed out waiting for `#ag-editor-id .ag-paragraph[id]`
- Quick verification after packing:
  - launch through `test/e2e/helpers.js`
  - confirm the window URL ends with `#/editor`
  - confirm the page has editor paragraphs before trusting any e2e failure

### Manual launch convention

- If manual `yarn dev` or direct Electron launch opens a white screen, the next most likely cause is the local app profile:
  - `/Users/fuyuming/Library/Application Support/marktext-dev`
- Safe recovery:
  - `mv "$HOME/Library/Application Support/marktext-dev" "$HOME/Library/Application Support/marktext-dev.backup-$(date +%Y%m%d-%H%M%S)"`
- Reason: corrupted local app/profile/cache state can break renderer startup even when the app code is fine.
- Keep the backup for a while because this resets local preferences/state.
