# Flowrite

## What This Is

Flowrite is a markdown writing environment for serious writers who want AI as a thoughtful commenting companion, not a ghostwriter. Forked from MarkText (vendor/marktext).

## Architecture

- **Desktop app:** Electron + Vue 2 + Vuex + Muya (from MarkText)
- **AI backend:** Anthropic Messages API via `@anthropic-ai/sdk` (TypeScript SDK)
- **NOT Managed Agents** — the original plan used Claude Managed Agents but this was changed during CEO review. Messages API with custom tool use is the correct choice for request/response interactions in a desktop app.
- **Agent loop:** Runs in a Node.js `worker_thread` to avoid blocking the main process
- **Tools:** Custom tools executed locally by Electron (read_file, edit_file, search_files, create_comment, propose_suggestion, save_memory)
- **Storage:** Plain .md files are canonical. Metadata in .flowrite/ sidecar directory

## Key Design Decisions

### Three Interaction Modes
1. **AI Review button** — AI proactively reviews document with a chosen persona (friendly, critical, improvement)
2. **User margin comment** — user selects text, writes a comment, AI responds in thread
3. **User global comment** — user writes a global comment, AI responds in thread

### AI Behavior Rules
- AI uses structured tool calls (create_comment, propose_suggestion), not free text
- AI comments before it rewrites (comment-first behavior)
- Every rewrite is a suggestion that must be explicitly accepted or rejected
- No silent edits. No auto-apply.
- Text blocks are locked during AI response (no edits to in-flight anchor ranges)

### Session Model
- One session per article (not per thread)
- Conversation history stored in .flowrite/document.json
- History loaded on document open, providing cross-thread context
- Compaction at 80K tokens: summarize oldest 60% of turns

### Cross-Session Memory
- Claude calls save_memory() tool to remember writer facts/preferences/context
- Stored at ~/.flowrite/writer-memory.json (user-level, not per-doc)
- Append-only in V1. Max 4000 tokens injected into system prompt. FIFO overflow.

### API Key
- Stored via Electron safeStorage (OS keychain encryption)
- First-run welcome screen with key input + validation
- App works offline for editing; AI features disabled without key/network

### Sidecar Metadata
```
<doc-dir>/<doc-name>.md
<doc-dir>/.flowrite/
  document.json    (schema version, conversation history, settings)
  comments.json    (global + margin threads, anchors)
  suggestions.json (pending/accepted/rejected)
  versions/        (snapshot manifests)
  snapshots/       (historical markdown states)
```

### Anchor Resolution
- Anchors use Muya paragraph IDs + character offsets + quoted text
- On drift: fuzzy reattachment via quote field (text similarity search)
- If no match (< 60% similarity): mark comment as "detached"
- Before applying suggestions: validate anchor.quote still matches

### Security
- Tool path scoping: all file tools restricted to document parent directory
- Prompt injection boundary in system prompt (document content = text to analyze, not instructions)
- No secrets in sidecar metadata

## File Structure

- `design.md` — Product design document
- `marktext-feasibility.md` — MarkText fork feasibility analysis
- `docs/superpowers/plans/` — Implementation plan
- `docs/ceo-plans/` — CEO review and scope decisions
- `vendor/marktext/` — MarkText fork (implementation base)
- `vendor/marktext/src/main/flowrite/` — Flowrite main-process code
- `vendor/marktext/src/renderer/components/flowrite/` — Flowrite Vue components
- `vendor/marktext/src/renderer/store/modules/flowrite*.js` — Vuex modules

## Commands

```bash
# Install MarkText dependencies
npm --prefix vendor/marktext install

# Run in dev mode
npm --prefix vendor/marktext run dev

# Run unit tests
npm --prefix vendor/marktext run unit

# Run e2e tests
npm --prefix vendor/marktext run e2e
```

## IPC Convention

MarkText uses `mt::` prefix for IPC channels. Flowrite additions use `mt::flowrite:` prefix for consistency.
