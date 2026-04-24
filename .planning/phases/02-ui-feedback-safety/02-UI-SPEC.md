---
phase: 02
slug: ui-feedback-safety
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-16
---

# Phase 02 — UI Design Contract

> Visual and interaction contract for Flowrite's AI review feedback surfaces. This phase extends the existing MarkText + Flowrite visual language instead of introducing a new design system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | existing Flowrite renderer patterns |
| Component library | none |
| Icon library | existing CSS-drawn toolbar icons plus current SVG assets |
| Font | inherit current MarkText/Flowrite UI stack; do not introduce a new font family in this phase |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline icon offsets, compact status gaps |
| sm | 8px | Pill spacing, toolbar control gaps |
| md | 12px | Popover padding, compact card interiors |
| lg | 16px | Card padding, annotation rail inset |
| xl | 24px | Section spacing between toolbar, discussion, and rail groups |
| 2xl | 32px | Wide popover and discussion breathing room |
| 3xl | 48px | Major vertical separation only when the editor shell expands |

Exceptions: existing 6px and 10px legacy gaps may remain where they are already stable, but new or edited phase-2 controls should normalize to the scale above.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 13.5px | 400 | 1.4 |
| Label | 12px | 600 | 1.2 |
| Heading | 14px | 600 | 1.25 |
| Display | 15px | 600 | 1.2 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--editorBgColor)` | Editor-backed surfaces, discussion background, popover base |
| Secondary (30%) | `color-mix(in srgb, var(--editorBgColor) 97%, white 3%)` | Toolbar shell, review popover, annotation rail cards |
| Accent (10%) | `var(--themeColor)` blended into current neutrals | Active persona pill, progress emphasis, selected annotation states |
| Destructive | `#c4554d` | Delete-thread and hard failure affordances only |

Accent reserved for: the active review persona pill, the "Have a look!" CTA text treatment when idle, the active annotation dot/card state, and locked-range emphasis. Do not tint every secondary button with the accent color.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | Have a look! |
| Empty state heading | A thought worth keeping? |
| Empty state body | Leave a short note below. |
| Error state | Review stopped. Partial comments are still here. Retry the same review? |
| Destructive confirmation | Delete comment thread: remove this annotation thread from the margin rail |

Additional locked copy:
- Busy label: `Reviewing...`
- Runtime helper: `Flowrite is reviewing the whole draft...`
- Lock notice: `This passage is locked while Flowrite finishes reviewing it.`

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not required |

---

## Interaction Contract

- The actual entry point remains `Toolbar.vue`; do not resurrect `AiReviewButton.vue`.
- When any Flowrite runtime job is active, the toolbar review button remains disabled. During `PHASE_AI_REVIEW`, the CTA label switches to `Reviewing...`.
- If the review popover is still visible after submission, the persona pills, textarea, and confirm action become read-only/disabled until the job reaches a terminal status.
- The discussion panel remains the canonical place for global review comments and runtime copy. Review progress text should persist there until completion or failure.
- Margin review output must surface as actual annotation-rail cards and paragraph dots, not only as persisted sidecar data.
- The annotation rail should follow paragraph positions during scroll and resize so cards stay visually tied to their anchored passages.
- Locked in-flight ranges use a warm amber highlight plus underline treatment that is distinct from the normal active-thread highlight.

## Safety Contract

- "Locked" means text insertion, deletion, paste, and drop are prevented when the current selection overlaps an in-flight review range.
- Locked behavior is range-scoped. Editing elsewhere in the document must remain available.
- Locked ranges clear immediately on `completed` or `failed` runtime states.
- A blocked edit attempt may show one concise notice, but must not create modal interruption or steal focus from the editor.

## Responsive Contract

- Preserve the existing annotation rail width behavior driven by `getMarginRailWidthForViewport`.
- The rail remains readable between roughly 248px and 280px wide on desktop.
- The progress state must remain legible in the toolbar and global discussion panel without requiring the annotations pane to be open.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-04-16
