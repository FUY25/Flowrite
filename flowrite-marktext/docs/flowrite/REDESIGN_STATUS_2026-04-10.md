# Flowrite Redesign Status

Updated: 2026-04-10
Branch: `codex/flowrite-v1-foundation`

## Implemented

- The visible tab strip has been removed from the editor shell.
- The remaining tab language has been removed from the main menus, command palette, and shell-facing shortcuts.
- The default editor window size has been reduced to feel calmer on first open.
- The top chrome has been tightened to a thinner, quieter layout.
- The left sidebar now uses a simpler header model with `Files`, `Outline`, and `Search`.
- The global discussion input is now a one-line muted bar with `Send` on the right.
- The discussion surface sits at the end of the article instead of feeling like a large pinned composer panel.
- The main editing surface has fewer visible boxes and separators than before.
- The shell styling has been tightened further so the top bar, sidebar controls, and discussion composer feel smaller and quieter.

## Locked Design Decisions

The following product decisions were agreed after the latest redesign review and should guide the next implementation pass.

### 1. Sidebar header and entry points

- The left pane header should have:
  - a left-side mode switch button for `Files` and `Outline`
  - a centered mode label such as `Files` or `Outline`
  - a right-side search button
- These views already exist in the app, but the entry point should feel closer to the lighter Typora-style shell instead of the older MarkText panel model.
- The left pane background should become lighter and softer than the current treatment.

### 2. Sidebar footer

- Add a footer utility bar to the bottom of the left sidebar.
- The current root folder name does **not** need to be centered; left aligned is acceptable.
- Put `New File` in the bottom-left of this footer as a small `+`.
- Also add a hover affordance on folders:
  - when hovering a folder row, show a subtle `+` action aligned to the right
  - this should create a new file inside that folder
- Put the `Sort / Order By` control in the bottom-right utility area of the sidebar footer.
- The sort control should be a secondary utility, not part of the main top header.

### 3. Empty discussion state

- For a `.md` file with no discussion yet, the default state should **not** show a full discussion panel.
- The empty state should be:
  - the one-line boxed comment bar
  - plus a small enhanced hint above it
- Keep this hint restrained and non-social; it should feel like part of the writing flow, not a large collaboration panel.
- The thread layout should expand only after the first actual comment appears.

### 4. Discussion placement

- The discussion input should live at the end of the article within the document flow.
- It should not behave like a viewport-level or window-level fixed composer.
- The first comment experience should feel like commenting on the page itself, not opening a separate chat area.

## Not Finished Yet

### 1. True tab removal is not complete

The visible tab UI and most tab-facing affordances are gone, but the underlying tab model still exists in the codebase.

Remaining work:

- Remove tab-centric state and behavior from the editor store.
- Remove remaining tab-specific IPC flows and command constants where no longer needed.
- Remove or rename remaining internal keybinding ids that still carry tab terminology.
- Make file opening semantics explicitly single-document instead of allowing hidden multi-file state.
- Clean up sidebar and notification code that still assumes multiple open tabs.

### 2. Full aesthetic polish is not complete

The shell has moved closer to the Typora-inspired direction, but the whole app is not yet visually unified.

Remaining work:

- Refine title/path presentation so it feels more intentional and less inherited from old MarkText.
- Tighten article spacing rhythm further, especially around headings, paragraphs, and the discussion boundary.
- Bring the annotations pane into the same calmer visual language as the new shell.
- Reduce remaining heavy borders, dividers, and legacy panel styling.
- Revisit icon sizing and alignment for the top chrome after real in-app use.

### 3. Sidebar behavior still needs final product cleanup

Current shell direction is correct, but the sidebar model still needs completion.

Remaining work:

- Remove legacy "opened files" assumptions fully from the file tree experience.
- Ensure the new `Files` / `Outline` / `Search` header behavior feels obvious and lightweight.
- Add the new sidebar footer utilities (`+`, root folder label, sort/order area).
- Add the hover `+` affordance on folders for quick file creation.

## Not Fully Checked Yet

### 1. The full redesign has not been re-verified end-to-end from this assistant session

The app was build-verified after the latest redesign pass, and the user confirmed Electron opens successfully in their own machine environment, but this assistant session still has limited GUI verification confidence.

Current caveat:

- `pack:renderer` and `pack:main` both pass.
- ESLint passes on the touched redesign files.
- Full in-app visual QA of the latest shell pass still depends on user-side runtime verification.

### 2. Single-document behavior is not fully locked yet

The shell now looks single-document, but the deeper file-open model still needs one more product pass.

Remaining work:

- Decide the exact behavior when a user with unsaved work opens another file.
- Remove the last hidden-multi-document assumptions from the renderer state model.
- Re-test file switching, search-result navigation, and close/save flows after that cleanup.

## What Was Verified

- `pack:renderer` passes
- `pack:main` passes
- ESLint passes on the touched redesign files

## Recommended Next Steps

1. Manually inspect the latest shell pass in-app.
2. Complete true single-document behavior for file opening and unsaved-work transitions.
3. Re-run the Flowrite Electron e2e/manual verification after that behavior pass.
4. Finish the final aesthetic polish pass for annotations and document spacing rhythm.
