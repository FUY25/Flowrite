# MarkText Feasibility Notes

Date: 2026-04-09
Inspected base: `vendor/marktext` at commit `be81e3a`

## Verdict

Yes, MarkText is a plausible base for Flowrite, but it should be treated as a fork, not as a light extension.

The good news:

- the writing experience already feels polished
- the app is already desktop-first and markdown-first
- Muya exposes selection and editor events that are usable for comment anchoring
- the renderer layout can host extra UI around the editor

The hard part:

- comments, suggestion decorations, AI provenance, and durable version history all touch editor-core behavior
- Muya does not have a mature plugin surface for deep document annotations
- MarkText's own docs explicitly say Muya needs better modularization and plugin APIs

## Why It Is Still A Good Candidate

MarkText already gets the hard "native-feeling markdown writing" part right.

That matters because Flowrite is not trying to invent a new text experience from scratch. The product bet is that writers want a calm markdown editor with a reflective AI layer on top.

Using MarkText lets us inherit:

- editor polish
- markdown import/export behavior
- desktop packaging
- existing editor modes
- a known Electron/Vue structure

## Relevant Findings

### 1. MarkText is built around Muya

The architecture docs describe the app as three parts: Muya, main process, and renderer process. They also note that Muya is the realtime preview core and that it still needs better modularization and plugins.

This means Flowrite features belong mostly in the renderer plus Muya boundary, not as a thin shell around the app.

### 2. The editor surface already supports overlay-style UI

MarkText's interface docs describe the editor as the core area with tabs, notifications, and multiple overlays such as toolbars and pickers.

This is encouraging for:

- margin comment pins
- suggestion cards
- hover-based provenance affordances
- a bottom global-comments section

### 3. Muya already exposes the right raw signals

Muya supports plugin registration via `Muya.use(...)`, dispatches `change` and `selectionChange` events, and is hosted from `src/renderer/components/editorWithTabs/editor.vue`.

That gives us clear extension points for:

- selection-based AI invocation
- comment anchoring
- suggestion application
- comment side panels and toolbars

### 4. Selection anchors are better than expected

Muya selection resolves to paragraph ids plus offsets:

- `anchor.key`
- `anchor.offset`
- `focus.key`
- `focus.offset`

That is a good basis for margin comments and suggestions because we can anchor metadata to stable block ids and text offsets instead of to raw DOM nodes.

### 5. Existing history is not enough for Flowrite versioning

MarkText already stores editor history in document state and Muya pushes whole-state history entries while editing.

That is useful for undo/redo, but it is not the durable version timeline Flowrite needs. We still need a persistent snapshot/version system outside the in-memory undo stack.

### 6. Save/load currently only understands markdown

The main save path writes the markdown file directly. The markdown filesystem module only reads and writes `.md` content plus encoding and line-ending normalization.

That means Flowrite needs an additional metadata persistence layer for:

- comment threads
- suggestion state
- accepted AI traces
- snapshot/version metadata

## Recommended Product-to-Code Mapping

### Global Comments

Add a new bottom panel under the editor surface in the renderer layer.

Most likely entry point:

- `src/renderer/components/editorWithTabs/index.vue`

This panel should be document-scoped and separate from the editor DOM, which keeps it easier to build and less risky than inline annotation work.

### Margin Comments

Use Muya selection events and paragraph/offset anchors to create comment threads attached to selected ranges.

Most likely entry points:

- `src/renderer/components/editorWithTabs/editor.vue`
- `src/muya/lib/index.js`
- `src/muya/lib/selection/index.js`

This likely needs:

- a comment-anchor store in Vuex
- renderer overlays aligned to paragraph DOM nodes
- rebasing logic when markdown changes

### Suggestions And Accept/Reject

Suggestions should not directly mutate markdown on AI response. Instead:

- AI proposes a candidate replacement for a selected range
- the UI shows it as a suggestion
- accept/reject triggers the actual markdown edit

Implementation likely needs:

- a suggestion model in renderer state
- range-aware patch application into Muya content
- inline decoration or margin affordance to show pending suggestion state

This is one of the hardest parts because it crosses both UI and document mutation.

### AI Provenance Trace

Accepted AI edits should leave a subtle inspectable trace.

Best implementation shape:

- store provenance in sidecar metadata
- decorate the affected range visually in the renderer
- show provenance details on hover or click

Do not store provenance markers inside the markdown source.

### Durable Version History

Build a separate snapshot system, not just reuse Muya undo history.

Suggested model:

- snapshot on save
- snapshot before accepting AI suggestions
- snapshot before large replace operations
- store snapshot index and diffs in sidecar metadata

## Storage Recommendation

Keep the markdown file canonical and plain.

Suggested sidecar layout:

```text
draft.md
.flowrite/
  document.json
  comments.json
  suggestions.json
  versions/
```

Possible contents:

- `document.json`: document id, settings, metadata version
- `comments.json`: global threads, margin threads, anchors
- `suggestions.json`: pending and accepted/rejected suggestion records
- `versions/`: snapshot manifests and historical markdown states or diffs

This matches the product promise that the app only shows plain markdown while still keeping rich app state nearby.

## Recommended Implementation Strategy

### Phase 1

Fork MarkText and get it building inside the workspace.

### Phase 2

Add a Flowrite renderer shell:

- bottom global comments panel
- AI invoke actions
- new Vuex modules for comments, suggestions, and metadata

### Phase 3

Add margin comment anchoring using Muya selection keys and offsets.

### Phase 4

Add suggestion accept/reject and markdown patch application.

### Phase 5

Add persistent sidecar save/load and durable version history.

### Phase 6

Add subtle AI provenance decoration.

## Biggest Risks

1. Anchor drift

Paragraph ids and offsets are useful, but edits can still invalidate old anchors. We will need rebasing logic or fuzzy reattachment.

2. Decoration brittleness

Muya's render path is custom. Inline suggestion and provenance markers may require careful renderer changes instead of just DOM post-processing.

3. Save consistency

If markdown and sidecar metadata save separately, they can drift. We should treat them as one logical save transaction.

4. Fork maintenance

Because Muya is not strongly modularized, deep annotation features will make upstream syncing harder over time.

## Recommendation

Use MarkText as a starting point if the goal is to get to a strong writing experience quickly.

Do not use it if the goal is to preserve easy upstream compatibility or build the annotation layer as a tiny plugin.

The right mental model is:

"Flowrite is a focused fork of MarkText with a new document-annotation and AI-reflection layer."

That is realistic.
