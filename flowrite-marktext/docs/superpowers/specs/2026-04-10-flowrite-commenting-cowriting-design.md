# Flowrite Commenting And Co-Writing Design

Date: 2026-04-10

## Goal

Flowrite should feel like a human collaborator in both global discussion and margin comments.

That means:

- comments should read like reader responses, reflections, or nudges
- comments should not look like markdown-authored document content
- when the conversation turns action-oriented, Flowrite may help write
- whether that escalation is allowed should be controlled by a software setting, not by an inline UI toggle

The visual UI does not change between comment behavior and co-writing behavior. The difference is in routing and allowed output.

## Current State

Today the Flowrite stack already has two main output paths:

- `create_comment` persists thread comments into the comments sidecar
- `propose_suggestion` persists rewrite suggestions into the suggestions sidecar

The runtime already uses prompt routing:

- discussion and margin replies are comment-first
- suggestions are only created when the writer explicitly asks for rewrite help

This is a strong base, but it is still mostly prompt-driven. The product now needs a more explicit internal behavior model so comments stay comment-like over time and co-writing can happen intentionally.

## Product Rules

### 1. Two user-facing collaboration preferences

Add a Flowrite collaboration preference in software settings:

- `Comment only`
- `Co-writing`

This setting belongs in app settings, not in the thread UI.

### 2. Same UI surface, different behavior

Discussion comments and margin comments keep the same visual presentation in both preferences.

There is no separate co-writing bubble style.

The setting only changes what the assistant is allowed to do.

### 3. Comment behavior constraints

When Flowrite is in comment behavior, output must follow these rules:

- allow short paragraphs
- allow bullets
- allow numbered lists
- allow abstract or reflective observations
- avoid long quote dumps from the document
- avoid report-like section headings
- do not use markdown headings
- do not use bold or italic markdown syntax
- do not use blockquotes
- do not use code fences
- do not use tables
- do not make the comment look like finished document prose by default

### 4. Co-writing behavior

When Flowrite is in co-writing behavior, it may:

- propose rephrasings
- draft alternative wording
- tighten or expand text
- help the user continue writing

For passage-specific rewrite requests, the system should still prefer `propose_suggestion` when that produces a better editing experience than dumping rewritten prose into the thread.

### 5. Escalation rule

All proactive AI review comments begin in comment behavior.

When the user replies, the branch may escalate into co-writing behavior only when:

- the app preference is `Co-writing`, and
- the latest user intent is action-seeking rather than reflective

Examples of action-seeking intent:

- rewrite this
- help me phrase this
- show me a version
- make this tighter
- draft this
- write this out
- give me another wording

If the preference is `Comment only`, escalation is never allowed.

## Chosen Architecture

Use a hidden thread state machine.

Each thread gets an internal collaboration state that is not rendered as a separate visual component:

- `commenting`
- `cowriting`

Each new thread starts in `commenting`.

The runtime decides the current state from:

- the persisted user preference
- the existing thread state
- the latest user message intent
- the current request type

This state should be persisted with the thread record so future replies do not have to rediscover the mode from scratch.

## Why This Approach

This approach is heavier than prompt-only routing, but it solves the product problem more cleanly.

Benefits:

- comments remain stable and comment-like over time
- escalation feels natural instead of mechanical
- global setting has a clear enforcement point
- future behavior such as “prefer editing” vs “prefer commenting” can extend the same model
- renderer and tests can reason about thread state explicitly, even if the UI looks the same

Tradeoff:

- requires comment schema updates and migration logic
- needs validator and prompt updates
- adds routing complexity in the controller/runtime

The tradeoff is acceptable because this behavior is core to Flowrite’s identity, not a cosmetic rule.

## Data Model Changes

### Comment thread record

Extend persisted comment thread records with:

- `interactionMode`: `commenting` or `cowriting`

Rules:

- default existing threads to `commenting`
- global thread may escalate to `cowriting`
- margin threads may escalate to `cowriting`
- the mode is stored on the thread, not just on individual comments

Reasoning:

- the escalation applies to the branch of conversation
- keeping it at thread level makes routing simpler
- the UI can still remain visually identical

### Flowrite settings

Extend persisted Flowrite settings with:

- `collaborationMode`: `comment_only` or `cowriting`

Default:

- `comment_only`

Reasoning:

- it preserves the current comment-first product feel
- co-writing becomes an intentional opt-in

## Routing Design

### Global and margin comment submissions

When the user submits a new discussion or margin comment:

1. load the thread
2. determine the current `interactionMode`
3. evaluate the latest user message for action-seeking intent
4. if settings allow escalation and intent is action-seeking:
   - switch thread to `cowriting`
5. otherwise keep thread in `commenting`
6. build the runtime prompt with explicit mode instructions
7. validate the assistant output against the chosen mode

### AI review pass

The proactive `Have a look!` review always starts in `commenting`.

Even in `Co-writing` preference, AI review should not jump directly into rewriting unless the user later asks for action in the thread.

### Suggestion requests

Suggestion requests remain the dedicated rewrite path.

If a margin thread is already in `cowriting`, the runtime may still choose `propose_suggestion` when:

- the request is tightly attached to a specific quote or paragraph
- the result should be accept/reject-able in the editor

This keeps co-writing flexible without flattening all rewrite help into loose thread prose.

## Prompting And Guardrails

### Prompt changes

Every Flowrite runtime request that can create comments should include:

- the global collaboration setting
- the thread interaction mode
- whether escalation is allowed for this turn
- the allowed comment formatting rules

For `commenting` mode, the prompt should explicitly ban:

- markdown headings
- emphasis syntax
- tables
- code fences
- blockquotes

For `cowriting` mode, the prompt should explicitly allow drafting help while still preferring suggestions for localized edits.

### Output validation

Prompting alone is not enough.

Add post-generation validation for comment-mode tool inputs before persistence.

For `create_comment` payloads in `commenting` mode:

- reject or normalize heading lines
- reject or normalize markdown emphasis markers
- reject blockquote syntax
- reject fenced code blocks
- reject tables

Preferred behavior:

- lightweight normalization for minor issues
- hard rejection and retry if the output is clearly document-like markdown

This protects comment quality even if the model drifts.

## Settings UI

Add a Flowrite setting section in app preferences for collaboration behavior.

Label recommendation:

- `Flowrite collaboration style`

Options:

- `Comment only`
- `Co-writing`

Help text should be short:

- `Comment only` keeps Flowrite reflective and discussion-first.
- `Co-writing` allows Flowrite to shift into drafting help when your reply asks for action.

No inline toggle should appear in discussion or margin UI for this feature.

## Migration

Existing comment sidecars have no interaction mode today.

Migration rule:

- all existing threads load as `commenting`

This is safe because:

- it matches current product behavior
- it avoids surprising users with unexpected co-writing

Existing Flowrite settings that have no collaboration mode should default to `comment_only`.

## Testing

Add coverage for:

### Settings and migration

- Flowrite settings default to `comment_only`
- existing comment threads without `interactionMode` normalize to `commenting`

### Routing

- `Comment only` never escalates, even with rewrite-like user intent
- `Co-writing` escalates when user intent is clearly action-seeking
- reflective replies in `Co-writing` remain in `commenting`

### Guardrails

- comment-mode responses reject headings
- comment-mode responses reject markdown emphasis
- comment-mode responses allow bullets and numbered lists

### Suggestions

- passage-specific rewrite replies can still route into suggestions
- AI review remains comment-only on first pass

## Non-Goals

This phase does not include:

- a visible in-thread mode toggle
- different visual rendering for co-writing replies
- full user editing of existing AI comments
- a richer preference matrix such as “prefer editing” vs “prefer commenting”

Those can build on top of this hidden-state foundation later.

## Recommendation

Implement the hidden state machine now.

It is the best fit for the product because it keeps the UI natural and human, while giving the system explicit rules for when a reflective conversation is allowed to turn into active writing help.
