# Margin Comment UI Spec

Date: 2026-04-11

## Overview

Flowrite margin comments are a document-attached annotation system, not a side chat panel.

The target interaction is closer to Notion's margin comments than to a separate review rail:

- one shared document scroll
- comments visually attached in the right page margin
- no separate comment pane feeling
- no second internal comment scroll
- cards remain visible by default and only compress when a region gets crowded

This spec covers **commenting UI only**. It does **not** include suggestion cards, rewrite surfaces, compose blocks, or other editing-specific behaviors.

## Core Decisions

- `Ask Flowrite` appears for **any non-empty text selection**
  - one word
  - sentence
  - paragraph
  - multi-paragraph selection
- Comment cards live in the page margin inside the same document scroll surface.
- Existing threads are shown as full cards by default.
- Compression happens only when nearby threads overlap enough to crowd the region.
- Dots are always visible.
- Underline/highlight appears only on interaction.
- New thread creation opens directly in input mode after `Ask Flowrite`.
- Existing thread replies stay collapsed until the user clicks the card.
- Thread delete is UI-only and does not alter AI memory/context.

## Layout Model

### Integrated Margin

The comment surface is part of the editor canvas, not an `aside` with independent behavior.

When annotations are visible:

- the document content remains the primary surface
- a modest right margin is reserved for cards
- cards are positioned against the document, not inside a separately framed rail
- document text and comment cards move together under one scroll container

When annotations are hidden:

- the cards are hidden
- dots remain visible in the gutter as the persistent index of commented passages

### Width And Position

Target margin width:

- default: `280px`
- allowed shrink range on narrower windows: down to about `248px`

The margin should feel like a narrow annotation zone, not a second workspace. The document must remain visually dominant on large monitors as well as standard laptop widths.

There should be:

- no hard pane frame
- no separate background treatment that reads like a sidebar
- no second scrollbar for comments

## Card Model

### Card Appearance

The card style should follow the Notion-like floating direction that was approved in review:

- white or page-matched background
- very light border
- soft radius
- minimal shadow
- calm metadata row
- visually lightweight enough to feel attached to the page

Cards should read as annotation objects placed in the page margin, not as chat bubbles or utility widgets.

### Thread Structure

One thread with many messages should read as a single vertical conversation object.

Approved direction:

- messages in the same thread are connected by a thin vertical spine
- avatar markers align on a single vertical axis
- the thread feels like one stacked conversation, not separate mini-cards

This should resemble the reference thread structure shown in review, where multiple messages inside one thread are visually linked by a light connector line.

### Default Visibility

Existing comments remain visible as full cards by default.

Do **not** shrink or fade inactive cards just because they are not selected.

Compression is only a crowding response, not the default idle state.

### Composer Behavior

For a **new** thread:

- user selects text
- user clicks `Ask Flowrite`
- a new card appears at the attached location
- that card opens directly in input mode for the first comment

For an **existing** thread:

- the card remains visible
- reply input is hidden by default
- clicking the card opens the reply affordance

This keeps the page calm while still making the first-comment action direct.

## Selection Entry Point

`Ask Flowrite` is the only creation entry point from text selection.

Requirements:

- visible for any non-empty text selection
- consistent across one-word, sentence, paragraph, and multi-paragraph selections
- no special-case disappearance for longer selections

The current behavior where one-word selection shows the action but sentence selection may not is a bug and must be fixed.

## Dots

Dots are the persistent index of commented text.

### Behavior

- always visible while a thread is attached
- visible whether annotation cards are shown or hidden
- clicking a dot reveals or focuses the related thread
- hovering a dot can preview the corresponding highlight

### Appearance

Approved direction:

- quiet amber dot
- **no glow / halo / light effect**
- small and calm, more editorial annotation marker than app chrome

The dot should be readable but understated. It should not feel like an alert badge.

### Positioning

Dots should align to the commented passage region in a way that feels stable and intentional.

For multi-paragraph anchors:

- the dot belongs to the thread's starting location
- nearby overlapping threads may stack or cluster, but should remain legible

## Underline And Anchor Highlight

Underline/highlight is the active connection between card and text. It is **not** always on.

### Visibility Rules

Show the highlight when:

- hovering the card
- hovering the dot
- the thread is active/selected
- composing a new thread

Hide the highlight when the thread is inactive.

### Appearance

Approved direction:

- soft editorial amber treatment
- subtle underline/highlight, not a harsh selection clone
- no bright neon color
- no heavy block background

The highlight should feel like thoughtful annotation, not debugging output.

### Attachment Accuracy

The highlight should match the actual commented sentence/range as closely as the stored anchor allows.

For multi-paragraph comments:

- start paragraph highlights from the start offset
- middle paragraphs show covered range cleanly
- end paragraph highlights to the end offset

For attached anchors, accuracy should be treated as exact, not approximate:

- exact sentence span when sentence-selected
- exact paragraph span when paragraph-selected
- exact multi-paragraph coverage across the stored range

Paragraph-level fallback is acceptable only for detached/recovery situations, not for normal attached rendering.

## Card-To-Text Relationship

Each comment card, dot, and text highlight must clearly belong to the same thread.

Requirements:

- hovering a card immediately reveals the related text highlight
- clicking a card makes that relationship persistent until focus changes
- card position should sit beside the attached paragraph region, not drift into an unrelated zone

Clicking the anchored text should focus the thread without causing viewport jump. The window should stay stable; the card may reflow locally to better align with the active anchored text.

This relationship is more important than raw recency ordering. Cards are anchored to text, not sorted as a generic discussion list.

## Overlap And Crowding

There is already a crowding strategy in the current implementation. This spec keeps that direction and clarifies the intended behavior in the integrated margin.

### Default Position

Each card gets a natural position based on the **start point of its anchor**.

The natural card location should feel vertically centered against the starting point of the selected/commented range, not just roughly attached to the paragraph top.

### Stable Insertion Reflow

When a new card is inserted, or when a card expands and would overlap nearby cards:

- cards should reflow like stable insertion in a spreadsheet or outline
- each card keeps its document-order relationship to nearby anchors
- neighboring cards move up or down just enough to maintain:
  - anchor order
  - non-overlap
  - proximity to their own natural anchor positions

This is stronger than a simple push-down-only stack. The goal is to preserve relative anchor alignment across the cluster, not just keep pushing later cards downward forever.

### Focus Without Jump

When the user clicks an anchored sentence or paragraph:

- do not auto-scroll the window
- activate the related thread
- allow local layout reflow so the card can sit closer to the same vertical level as the anchored text
- keep the movement local and ordered, not jumpy

The page should feel stable while the margin comments reorganize around the active thread.

### Motion

Local card reflow should animate softly:

- short duration, around `140–180ms`
- restrained easing
- enough to make the movement understandable
- not floaty or dramatic

### Compression

Compression happens only when a region becomes crowded enough that full cards would become unreadable or push too far away from their anchors.

Default rule:

- keep cards full when space allows
- compress only overlapping/crowded regions

### Existing Threads

Outside crowded regions, existing threads remain full visible cards.

## Thread Actions

V1 actions remain intentionally narrow:

- reply
- thread delete

Out of scope:

- message-level delete
- undo stack for comment deletion
- manual re-attach flow
- suggestion/rewrite UI inside the thread

Thread deletion is UI-layer only and should not mutate AI memory/context.

## Responsive Boundaries

This phase is optimized for normal desktop and laptop widths.

Requirements:

- preserve readable document width
- preserve readable margin-card width
- avoid turning the margin into a second panel on wider screens

Deferred:

- special small-window popover behavior
- narrow-screen mobile-style fallbacks

## Explicitly Out Of Scope

This spec does **not** cover:

- suggestion cards
- rewrite/editing surfaces
- compose blocks
- AI generation output beyond the comment thread itself
- soft-locking anchor text while AI streams
- separate comment-pane architecture

## Acceptance Criteria

The implementation is correct when all of these are true:

- `Ask Flowrite` appears for any non-empty selection.
- Selecting text and clicking `Ask Flowrite` creates a margin-attached card in immediate input mode.
- Existing threads appear as visible cards in the document margin, not in a separately scrolling pane.
- Dots remain visible even when cards are hidden.
- Underline/highlight appears only on interaction.
- Dot, highlight, and card clearly map to the same passage.
- Cards sit beside their attached paragraph region and push down only when overlap requires it.
- Compression occurs only in crowded regions.
- The UI feels like page annotation, not a side discussion app.
