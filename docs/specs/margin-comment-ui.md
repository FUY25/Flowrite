# Margin Comment UI Spec

Date: 2026-04-10

## Overview

Margin comments are Flowrite's primary interaction surface — the place where the writer and AI think together about specific passages. They must feel like quiet marginalia on a calm writing surface, not a chat sidebar or collaboration tool.

The interaction model is **comment-native**: the writer selects text, asks a question or leaves an observation, and the AI responds as a thoughtful reading companion. AI responses are short and human-feeling — a sentence or two, not multi-paragraph analysis.

Comments can also serve as the starting point for generation tasks. When a discussion in the margin leads the writer to want new or rewritten content, the AI can produce output that flows back into the document — but the conversational part stays in the comment thread.

Reference model: **Notion's inline margin comments**, adapted for a focused writing environment.

---

## Layout Model

### Document Shift

A single button shows or hides the comment margin. When comments are **visible**, the editor content area shifts slightly left to make room for the margin column on the right. When comments are **hidden**, the editor returns to its default centered position.

This mirrors the existing MarkText sidebar behavior where `editorWithTabs` already adjusts its width based on sidebar visibility. The margin comment column uses the same pattern.

```
Comments hidden:
┌──────────────────────────────────────────────┐
│            [ centered editor 750px ]         │
│                                              │
│   The quick brown fox jumps over the lazy    │
│   dog. This paragraph explores the idea...   │
│                                              │
└──────────────────────────────────────────────┘

Comments visible:
┌──────────────────────────────────────────────┐
│  [ editor shifted left ]    │ margin column  │
│                             │   (~280px)     │
│  The quick brown fox jumps  │  ┌──────────┐  │
│  over the lazy dog. This    │  │ comment   │  │
│  paragraph explores the...  │  │ card      │  │
│                             │  └──────────┘  │
└──────────────────────────────────────────────┘
```

### Sidebar Behavior

When the comment margin opens and the window is narrow enough that the editor would become uncomfortable (<1100px with both sidebars), the **left sidebar auto-collapses** to give priority to the comment margin. The user can manually reopen the left sidebar at any time.

### Margin Column

- Fixed width: **280px**
- Background: transparent (inherits editor background)
- No visible border between editor and margin — they share the same surface
- The margin column scrolls in sync with the editor content
- Comment cards are positioned vertically to align with their anchor paragraph

---

## Show/Hide Comments Button

A single button in the editor toolbar shows or hides the margin comment column.

The button should be subtle and consistent with MarkText's existing toolbar style. Icon: a small margin-annotation glyph (not a chat bubble, not a sparkle). Tooltip: "Show comments" / "Hide comments."

### Transition

- The editor shift should animate smoothly (~200ms, ease-out)
- Comment cards fade in after the shift completes (~100ms delay, ~150ms fade)
- On hide: cards fade out first, then editor shifts back to center

---

## Indexing: How Text-to-Thread Connection Shows Across States

The dot indicator is the **persistent index** — it's always visible in both states, telling the writer "you've thought about this passage before." The underline is the **active connection** that only appears on interaction.

### Comments Hidden

- **Dots visible**: each paragraph with a comment thread shows its dot indicator in the right gutter. The dots are quiet enough (6px, 30% opacity) that they don't disrupt the writing surface, but they tell the writer where thinking has happened.
- **No underlines**. No highlights. No margin column. Just dots in the gutter.
- **Clicking a dot** when comments are hidden → opens the comment margin (same as clicking the show/hide button), scrolls to that thread's card, and shows the anchor underline for that thread.

### Comments Visible

- **Dots visible** (same position and appearance as hidden state)
- **Underlines appear on interaction only** — hover a card or click a dot to show the muted green underline on the anchor text
- **Thread cards** visible in the margin column, aligned with their anchor paragraphs

### Summary

| | Comments Hidden | Comments Visible |
|---|---|---|
| Dots | Visible | Visible |
| Underlines | None | On hover/click only |
| Thread cards | None | In margin column |
| Click dot | Opens margin + scrolls to card + highlights | Scrolls to card + highlights |

---

## Dot Indicators

Each paragraph with an associated comment thread shows a **dot indicator** in the right gutter of the editor. Dots are visible in both hidden and visible comment states.

### Appearance

- Small circle, **6px diameter** (hit area: **24px** for comfortable clicking)
- Color: `var(--editorColor30)` (muted, barely there)
- Positioned at the vertical midpoint of the first line of the anchor paragraph
- Sits in the right gutter of the editor text area

### Behavior

- **Hover**: dot grows slightly (6px → 8px), color strengthens to `var(--editorColor50)`. Cursor: pointer.
- **Click (comments visible)**: activates the thread — the corresponding text range gets a muted underline highlight, and the comment card in the margin scrolls into view (if not already visible) and receives a brief subtle emphasis (border color pulse).
- **Click (comments hidden)**: opens the comment margin, then behaves the same as above — scrolls to card, shows underline.
- **Multiple dots**: one dot per thread, stacked if multiple threads anchor to the same paragraph (vertically offset by ~12px).

### No Highlight by Default

Dots are visible but **text highlights are not shown by default** in either state. Highlights only appear when:
- The user clicks a dot
- The user hovers over a comment card in the margin (only possible when comments are visible)
- The user is actively composing a new margin comment

This keeps the writing surface clean. The dots are the quiet, persistent index.

---

## Anchor Highlight

When a comment thread is active or hovered, its anchor text range receives a highlight.

### Appearance

- **Muted colored underline** beneath the anchor text range
- Color: `var(--themeColor30)` (MarkText's green at 30% opacity — very subtle)
- Underline thickness: **1.5px**
- Underline offset: **2px** below the text baseline
- No background highlight. No bold. No border. Just the underline.

### Multiple Active Highlights

When multiple threads are visible in the margin, each active thread's underline is visible simultaneously. All use the same muted underline color — no per-thread color coding in V1.

### Multi-Paragraph Anchors

Selections can span multiple paragraphs. The anchor stores `startParagraphId` + `startOffset` and `endParagraphId` + `endOffset`. The underline spans across paragraphs. The dot indicator appears next to the first paragraph.

### Detached Anchor

When a thread's anchor text can no longer be found (fuzzy reattachment failed with <60% similarity):
- Underline becomes **dashed** instead of solid
- Color shifts to `var(--editorColor20)` (gray, not green)
- The comment card shows a subtle "detached" indicator (see Thread States)

---

## Comment Card Anatomy

Each comment card in the margin represents one thread. The card contains all messages in that thread.

### Card Container

- Width: fills the margin column (~280px, with 8px padding on each side = 264px content width)
- Background: `var(--editorBgColor)` (same as editor — no surface separation)
- Border: `1px solid var(--editorColor10)` (barely visible)
- Border radius: **4px**
- Padding: **12px**
- Margin between cards: **8px**
- No shadow. Cards should feel printed on the page, not floating above it.

### Message Anatomy

Each message within a thread:

```
┌─────────────────────────────────────┐
│  Author · timestamp                 │
│  Message body text goes here and    │
│  wraps naturally within the card.   │
└─────────────────────────────────────┘
```

- **Author**: "You" or "AI" — plain text, `font-size: 12px`, `font-weight: 600`, color `var(--editorColor60)`
- **Timestamp**: relative time ("2m ago", "1h ago"), `font-size: 11px`, color `var(--editorColor30)`, separated from author by a middle dot `·`
- **Body**: `font-size: 13px`, `line-height: 1.5`, color `var(--editorColor80)`. Same font family as the editor.
- **AI messages**: identical layout to user messages. No avatar, no special background, no icon. Distinguished only by the "AI" author label. The AI should feel like a peer reader, not a product feature.

### Message Spacing

- Between messages within a thread: **8px** vertical gap
- Between author line and body: **2px**
- No dividers between messages — whitespace is the separator

### Delete Affordance

There is one action per thread: **delete**.

- **Thread-level delete**: On hover over the card container, a small `×` appears in the top-right corner of the card. Click to remove the entire thread.
- **Message-level delete**: On hover over an individual message, a small `×` appears in the top-right corner of that message. Click to remove that message from the thread display. If the thread has only one message remaining after deletion, the entire thread is removed.
- Delete icon: `12px`, color `var(--editorColor30)`, hover color `var(--deleteColor)` (`#ff6969`)
- Deletion is a **display-layer operation** — removes from `comments.json` only. The AI conversation history in `document.json` is unaffected. The writer can clean up visual clutter without worrying about AI context coherence.
- No confirmation dialog. Deleting a comment is low-stakes (the markdown is untouched, the AI still remembers the conversation).
- A brief toast notification appears at the bottom: "Comment deleted. Cmd+Z to undo" — fades after 3 seconds. Uses MarkText's existing notification system.

---

## Thread Compression

When a thread has many messages (4+), compress the middle to save vertical space.

### Behavior

Following the Notion pattern:

- **Always show**: the first message (original comment) and the last message (most recent reply)
- **Collapse middle**: replace middle messages with a "Show N replies" link
- **Threshold**: compress when thread has **4 or more messages**

### Visual

```
┌─────────────────────────────────────┐
│  You · 10m ago                      │
│  Is this claim supported?           │
│                                     │
│  Show 3 replies                     │
│                                     │
│  AI · 1m ago                        │
│  The evidence in paragraph 4 is     │
│  indirect — consider citing the     │
│  source directly.                   │
└─────────────────────────────────────┘
```

- "Show N replies" link: `font-size: 12px`, color `var(--themeColor)`, no underline. Hover: underline appears.
- Click: middle messages expand inline. The link changes to "Collapse replies" after expansion.
- Expand/collapse is instant (no animation) — it's a fold, not a transition.

---

## Crowding & Overlap Solution

When many comments anchor to nearby paragraphs, cards can compete for vertical space.

### Push-Down Stacking

Comment cards are positioned to align with their anchor paragraph. When two cards would overlap:

1. The **higher** card keeps its natural position (aligned with its anchor paragraph)
2. The **lower** card is pushed down until it clears the card above by the standard 8px gap
3. This cascades: a pushed card can push the card below it further down

### Auto-Compression for Crowded Regions

When push-down causes cards to extend significantly beyond their anchor positions, apply automatic thread compression:

- All threads in the crowded region compress to their first-message-only view (even if they have <4 messages)
- The "Show N replies" link appears for any thread with 2+ messages
- This reduces card height and resolves most overlap situations
- The user can still expand individual threads, which may cause temporary overlap (acceptable for an intentional user action)

### No Connector Lines

Displaced cards do not show connector lines back to their anchor. The spatial proximity is sufficient. When the user hovers over a displaced card, the anchor text underline appears, which is enough to establish the link.

### Ordering

Cards are ordered top-to-bottom by their anchor position in the document, not by creation time.

---

## Interaction Flow

### Creating a Margin Comment

1. **Select text**: User selects a sentence, phrase, or paragraph(s) in the editor.
2. **Invoke comment**: The comment icon appears at the end of Muya's existing FormatPicker toolbar (the selection toolbar that shows bold, italic, link, etc.). One icon added, not a new popup. If comments are currently hidden, clicking this icon also shows the comment margin.
3. **Compose**: A new empty comment card appears in the margin, aligned with the selection. The card contains a text input field with placeholder text: "Ask about this passage..." The anchor text receives the muted underline highlight.
4. **Submit**: User presses `Cmd+Enter` or clicks a subtle send affordance to submit. The card transitions from input to message display.
5. **AI responds**: The AI's response streams into the thread as a new message below the user's comment. A subtle loading indicator (three small animated dots, `var(--editorColor30)`) shows while waiting.

### Comment Icon in FormatPicker

Instead of adding a new floating button, add a single comment/annotation icon at the end of Muya's existing selection toolbar (FormatPicker). This avoids multiple popups competing on selection and is more discoverable since the user's eyes already go to the FormatPicker.

- Icon: small margin-annotation glyph, same as the show/hide comments button
- Positioned as the last item in the FormatPicker toolbar, separated by a subtle divider `|`
- Same size and style as existing FormatPicker icons

### Replying in a Thread

1. User clicks into an existing thread card
2. A reply input appears at the bottom of the card, below the last message
3. Same input field style as initial composition: placeholder "Reply..."
4. Submit with `Cmd+Enter`
5. AI response streams in below the user's reply

### Reply Input

- Appears only when the thread is focused (user clicks the card or the dot)
- `font-size: 13px`, matching message body
- Single-line by default, grows to max 3 lines as the user types
- Background: `var(--editorColor04)` (barely tinted)
- Border: none (the background tint is the boundary)
- Border radius: **3px**
- Padding: **6px 8px**

---

## Generation from Comments

Comment threads can serve as the starting point for writing tasks. When a discussion in the margin leads the writer to want new or rewritten content, the flow is:

1. The writer discusses a passage with AI in the comment thread (possibly multiple rounds)
2. At some point, the writer asks the AI to produce content: "rewrite this section," "elaborate on this point," "synthesize this with the notes in research.md"
3. The AI's response in the thread includes the generated content as a suggestion (same `propose_suggestion` tool, same accept/dismiss behavior as elsewhere in the system)
4. If the writer accepts, the text is applied to the document at the anchor location

For larger generation tasks that go beyond a single passage replacement (e.g., "write a new conclusion based on everything we discussed"), the AI produces a **compose block** in the document:

- The compose block appears inline in the document at the relevant location
- It contains the generated text as a suggestion with Accept / Dismiss / Retry affordances
- The compose block uses the same visual language as comment cards (same border, same typography) but lives inline in the document body
- Accept → text becomes part of the document. Dismiss → compose block disappears. Retry → AI regenerates.
- The compose block is a final output surface, not a conversational surface. The discussion stays in the comment thread.

This keeps the principle: conversation in the margins, output in the document.

---

## AI Streaming State

When the AI is responding:

### In the Comment Card

- A new message block appears with "AI" author label
- Body area shows three animated dots (a gentle pulse, not a spinner): `· · ·`
- As text streams in, it replaces the dots progressively
- The streaming text appears with a subtle fade-in per word/chunk (not per character — that's too slow)

### On the Anchor Text

- The anchor underline pulses softly: opacity oscillates between `var(--themeColor20)` and `var(--themeColor40)` on a 2-second cycle
- This indicates "the AI is thinking about this passage"
- The pulse stops when streaming completes, and the underline returns to its steady `var(--themeColor30)`

### Interaction During Streaming

- The user can continue editing OTHER parts of the document normally
- The anchor text range is **soft-locked**: edits to text within the anchor range are queued and applied after the AI response completes
- No modal blocking. No disabled states on the editor. Just the specific range is held.

### Error States

- **Network error before response**: dots stop, message appears: "Couldn't reach AI. Retry" in `var(--editorColor40)`. "Retry" is a text-link in `var(--themeColor)` that re-submits the same message.
- **Partial stream error**: show whatever text arrived + "Response interrupted. Retry" below it.
- **AI unavailable (no API key / offline)**: when the user tries to submit a comment, show inline notice in the reply input area: "AI unavailable — check connection or add API key in Settings." Existing threads and their content remain visible and readable.

---

## Empty State

When comments are visible but the document has no comment threads yet, the margin column shows a single placeholder message:

```
┌─────────────────────────────────────┐
│  Select text and use the comment    │
│  icon to start a conversation       │
│  about your writing.                │
└─────────────────────────────────────┘
```

- Same card styling as a regular comment card
- Text in `var(--editorColor30)`, `font-size: 13px`
- Vertically centered in the visible margin area
- Disappears as soon as the first thread is created

---

## Thread States

### Open (default)

Normal interactive state. All messages visible (subject to thread compression). Reply input available on focus.

### Detached

When the anchor text has been edited beyond recognition (fuzzy reattachment failed with <60% similarity):
- The dot indicator changes from a circle to a small **dash** (`—`)
- The card shows a subtle top-bar indicator: `1px solid var(--editorColor20)` dashed top border
- A small muted label appears at the top of the card: "Detached" in `font-size: 11px`, `var(--editorColor30)`
- No underline on any text (anchor is lost)
- The card positions itself based on its last known anchor paragraph. If that paragraph no longer exists, the card floats to the bottom of the margin column.
- The user can manually re-anchor by selecting new text and choosing "Re-attach comment" from the context menu, or delete the thread

---

## Dark Mode

All values reference CSS variables from MarkText's theming system, so dark mode (one-dark, material-dark, graphite) works automatically:

- `var(--editorBgColor)` → dark surface
- `var(--editorColor*)` → light text at various opacities
- `var(--themeColor*)` → theme accent at various opacities
- `var(--floatBorderColor)` → appropriate dark border

No additional dark-mode-specific tokens needed for V1.

---

## Design Tokens

Flowrite-specific tokens for the comment system. These should be reusable across margin comments and global comments.

```
--flowrite-dot-size: 6px
--flowrite-dot-size-hover: 8px
--flowrite-dot-hit-area: 24px
--flowrite-dot-color: var(--editorColor30)
--flowrite-dot-color-hover: var(--editorColor50)

--flowrite-anchor-underline-color: var(--themeColor30)
--flowrite-anchor-underline-width: 1.5px
--flowrite-anchor-underline-offset: 2px
--flowrite-anchor-pulse-lo: var(--themeColor20)
--flowrite-anchor-pulse-hi: var(--themeColor40)
--flowrite-anchor-pulse-duration: 2s

--flowrite-card-bg: var(--editorBgColor)
--flowrite-card-border: 1px solid var(--editorColor10)
--flowrite-card-radius: 4px
--flowrite-card-padding: 12px
--flowrite-card-gap: 8px

--flowrite-meta-size: 12px
--flowrite-meta-color: var(--editorColor60)
--flowrite-timestamp-size: 11px
--flowrite-timestamp-color: var(--editorColor30)
--flowrite-body-size: 13px
--flowrite-body-color: var(--editorColor80)
```

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Show/hide comments | `Cmd+Shift+M` |
| Comment on selection | `Cmd+Shift+C` (with text selected) |
| Submit comment / reply | `Cmd+Enter` (in comment input) |
| Cancel composition | `Escape` (in comment input) |

---

## Accessibility

- Dot indicators: `aria-label="Comment on: [first 20 chars of anchor quote]"`. Hit area is 24px despite 6px visual size.
- AI streaming: an `aria-live="polite"` region announces "AI is responding" when streaming starts and "AI response complete" when it finishes.
- Comment cards are focusable and announced by screen readers with thread context.
- The pulsing underline conveys state only through animation. The `aria-live` region provides the equivalent information for non-visual users.

---

## Responsive Behavior

### Narrow Windows

When the window width is less than **900px** and comments are visible:

- The margin column width reduces to **240px**
- Below **750px**: margin comments switch to a **popover mode** — cards appear as popovers anchored to the dot indicator rather than living in a persistent column. Only one popover visible at a time. This prevents the editor from becoming too narrow to write comfortably.
- Popover cards have the same anatomy as margin cards. Clicking a different dot closes the current popover and opens the new one. Reply input works the same way.

### Wide Windows

When the window width exceeds **1200px**:
- The margin column remains **280px** (does not grow)
- Extra space is distributed as padding around the editor area

---

## What This Spec Does Not Cover

- Global comments (separate spec — they live below the editor, not in the margin)
- Suggestion card detailed design (covered by suggestion system spec)
- Version history UI
- Authorship provenance traces
- Writer memory UI
- API key onboarding flow
- Multi-document context

---

## Data Layer Reference

### Display layer: `comments.json`

Deletion operates here. This is what the UI renders.

```json
{
  "schemaVersion": 1,
  "threads": [
    {
      "id": "thr_abc",
      "scope": "margin",
      "status": "open",
      "anchor": {
        "startParagraphId": "ag-42",
        "startOffset": 18,
        "endParagraphId": "ag-42",
        "endOffset": 61,
        "quote": "the original selected text"
      },
      "messages": [
        {
          "id": "msg_001",
          "author": "user",
          "body": "Is this claim supported?",
          "createdAt": "2026-04-10T14:30:00Z"
        },
        {
          "id": "msg_002",
          "author": "ai",
          "body": "The evidence is indirect — consider citing the source.",
          "createdAt": "2026-04-10T14:30:03Z"
        }
      ]
    }
  ]
}
```

### AI context layer: `document.json`

Separate lifecycle. Not affected by UI deletion. Managed by compaction and trimming.

```json
{
  "schemaVersion": 1,
  "conversationHistory": [ /* full message array for Claude API */ ]
}
```

### Deletion model

- **Delete a message**: remove from `comments.json` thread messages array. If thread has 0 messages remaining, remove the thread.
- **Delete a thread**: remove from `comments.json` threads array. Remove anchor underline and dot indicator.
- Neither operation touches `document.json`. The AI conversation history is a separate concern with its own lifecycle.
- Undo: standard Cmd+Z within the session. Deletion is added to the UI undo stack. Toast notification: "Comment deleted. Cmd+Z to undo" (fades after 3 seconds).
