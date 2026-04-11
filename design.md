# Flowrite Design

Date: 2026-04-09

## Summary

Flowrite is a markdown writing environment for serious writers who want AI as a thoughtful commenting companion, not a ghostwriter.

The core idea is simple:

- The document stays central.
- AI interacts through comments, not a separate chatbot universe.
- AI helps the writer clarify thought before it helps rewrite prose.
- The writer always stays in control of authorship.

This should feel closer to "Word comments for reflective writing" than "ChatGPT next to a text box."

## Product Thesis

Today, writers usually do one of two things:

- Use AI as a ghostwriter.
- Copy and paste text into a chat app for reflection.

Both break the thinking loop.

The first weakens authorship. The second destroys context.

Flowrite keeps reflection inside the document. AI behaves like a smart reader in the margins and below the draft, helping the writer notice vagueness, contradictions, leaps in logic, tone mismatches, and unresolved thoughts. Rewrite help exists, but only after the writer asks for it.

## Principles

1. The document is the main character.
2. AI should comment before it rewrites.
3. AI should propose, never silently edit.
4. Plain markdown remains the source of truth.
5. Metadata belongs in overlays and sidecar files, not in the prose.
6. The app should feel calm, native, and personal.
7. Reflection is the differentiator, not automation volume.

## Target User

The initial product is intentionally broad across serious solo writers, but narrow in workflow:

- the user writes in markdown
- the user wants help clarifying thought
- the user values authorship and inspectability
- the user wants AI in context, not in a detached chat window

This can serve essayists, reflective writers, researchers, newsletter writers, and other writing-heavy knowledge workers, as long as the experience stays document-first.

## V1 Scope

### In Scope

- Markdown editor and viewer
- Plain `.md` file as the canonical document format
- Global AI comments below the document
- Margin AI comments attached to a selected sentence or paragraph
- Manual AI invocation only
- Comment-first AI response behavior
- Optional follow-up rewrite or alternative suggestions
- Accept/reject for every AI text suggestion
- Subtle authorship trace for accepted AI-assisted text
- Automatic version history with restore
- Version diffs that make AI-assisted changes inspectable
- Settings for AI response style:
  - comment only
  - comment + rewrite suggestion

### Out of Scope for V1

- Human collaboration
- Shared commenting between multiple people
- Permanent chat sidebar
- Always-on autonomous AI commenting while writing
- Real-time co-writing with AI
- Inline AI-generated markdown markers stored in the document

## Core Interaction Model

Flowrite has one interaction language: comments.

There are two scopes of comments:

### 1. Global Comments

These live below the document and are used for draft-level reflection.

Examples:

- "What is the main argument here?"
- "Which section feels weak?"
- "Where am I being vague?"
- "Does the tone stay consistent?"

This replaces the need for a separate AI chat panel. The user is still interacting with AI, but inside a document-native discussion surface.

### 2. Margin Comments

These are attached to a sentence or paragraph and are used for passage-level reflection.

Examples:

- "What is unclear here?"
- "Is this sentence doing too much?"
- "Can you challenge this claim?"
- "Suggest a cleaner version in my tone."

## AI Behavior

### Default Response Shape

The default AI behavior is:

1. Comment first
2. Offer help second

Example:

- AI comment: "This paragraph makes two claims and the second one arrives too fast."
- Follow-up offer: "Want me to rewrite this sentence or give three alternatives?"

This preserves the sense that the AI is a reader and thinking partner first.

### Rewrite Rules

- AI may generate rewritten text only after user invocation or based on the response-style setting.
- Every rewrite is a suggestion.
- No AI-generated text is applied automatically.
- The user must explicitly accept or reject each suggestion.

## Authorship Model

Accepted AI-assisted text should remain inspectable without making the document ugly.

The UI should show a subtle authorship trace for accepted suggestions, for example:

- a faint underline
- a light tint
- a hover affordance

On hover or inspection, the user can see:

- that this passage came from an AI-assisted suggestion
- when it was accepted
- which comment or thread it came from

This trace should be quiet by default but easy to inspect.

## Version History

Version history is part of the trust model, not an extra feature.

The system should:

- create automatic snapshots over time
- create snapshots before meaningful AI suggestion application
- allow restore to older versions
- show diffs between versions
- make AI-assisted changes visible in version diff

The primary mental model should be "document history," not "AI history."

## Storage Model

The markdown file stays clean.

### Canonical File

- `document.md`

### Sidecar Metadata

Metadata should live outside the markdown source, in sidecar files or a hidden project folder.

This metadata includes:

- comment anchors
- comment threads
- AI responses
- suggestion state
- accepted/rejected suggestion records
- authorship trace metadata
- version snapshots or snapshot index

Inside the app, the user sees plain markdown plus UI overlays. Outside the app, they still own a normal markdown file.

## Suggested Information Architecture

### Main Writing Surface

- central markdown editor/viewer
- clean, calm, document-first layout

### Right Margin or Overlay Layer

- margin comment indicators
- passage-level comment threads
- suggestion accept/reject affordances

### Bottom Global Discussion Section

- draft-level conversation with AI
- no separate chat product

### Version History Panel

- timeline of snapshots
- diff viewer
- restore controls

### Settings

- AI response style
- model choice later
- trace visibility preferences later

## V1 User Flows

### Global Reflection Flow

1. User writes draft.
2. User opens the global comments section.
3. User asks a whole-document question.
4. AI responds with a comment.
5. User replies or asks follow-up questions.
6. If rewrite help is needed, AI proposes suggestion cards.
7. User accepts or rejects specific suggestions.

### Passage Reflection Flow

1. User selects a sentence or paragraph.
2. User invokes AI comment on that selection.
3. AI leaves a margin comment.
4. User replies in thread.
5. User optionally asks for rewrite help.
6. AI produces one or more suggestions.
7. User accepts or rejects them.

### Recovery Flow

1. User inspects version history.
2. User sees where AI-assisted changes entered the draft.
3. User restores a previous version or keeps current text.

## Non-Goals

Flowrite should not become:

- a generic AI writing app
- a ghostwriting tool
- a collaborative office suite
- a permanent chatbot next to a document
- a markdown format that pollutes source files with proprietary markup

## V2 Direction

Possible V2 direction:

- an optional always-on thought companion mode
- AI that offers gentle, ambient observations while the user writes

This should be treated as a second-phase product problem because interruption, trust, and UI timing are hard. V1 is already interesting enough without it.

## Open Product Questions

- How should comment anchors behave as the markdown changes?
- What is the best visual language for subtle AI authorship traces?
- Should the editor default to source mode, rich markdown preview, or a hybrid live-render mode?
- How much of version history should be file-based versus database-indexed?

## Success Criteria for V1

The product succeeds if a writer can say:

- "I stayed inside my draft the whole time."
- "The AI helped me think, not just rewrite."
- "I could always tell what changed."
- "My markdown still belongs to me."
- "The comments felt like a real companion, not a chatbot."
