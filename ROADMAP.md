# Flowrite Roadmap

Last updated: 2026-04-11

---

## Completed (V1 Foundation)

### 1. MarkText Fork & UI Foundation
- Forked MarkText as the editing base (Electron + Vue 2 + Muya)
- Normalized repo layout (`vendor/marktext/` + `flowrite-marktext/`)
- Flowrite-specific styling inheriting MarkText's calm aesthetic

### 2. Anthropic SDK Integration
- `@anthropic-ai/sdk` v0.86.1 added to dependencies
- Messages API with structured tool use (not Managed Agents)
- Prompt caching on stable system/document blocks

### 3. AI Backend Runtime
- Worker-thread orchestration (`runtimeWorker.js`, `runtimeManager.js`)
- Anthropic client with safeStorage API key management
- Prompt builder with persona injection (friendly/critical/improvement)
- Tool registry: `create_comment`, `propose_suggestion`
- Comment guardrails and collaboration routing
- Token-aware history trimming at 80K tokens
- Online/offline status detection

### 4. Sidecar Storage System
- `.flowrite/` sidecar directory per document
- `document.json` (conversation history, schema version)
- `comments.json` (global + margin threads with anchors)
- `suggestions.json` (pending/accepted/rejected with TTL pruning)
- `snapshotStore.js` (safety snapshots before suggestion acceptance)
- Corrupt JSON recovery with `.corrupt` backup

### 5. Global Comments Section
- Bottom-of-document discussion area
- Inline thread list with composer
- AI reply streaming via IPC
- Thread persistence across sessions

### 6. Margin Comments System
- "Ask Flowrite" popover on any text selection
- Margin-attached annotation cards (Notion-style)
- Persistent gutter dots (amber, editorial)
- Interaction-only underline/highlight
- Multi-message thread spine connectors
- Anchor drift detection with fuzzy reattachment
- Crowding-aware card reflow with stable insertion
- Card compression only when region is crowded

### 7. AI Review Mode (UI only)
- AI Review button with persona selection (UI complete)
- Backend wiring not yet connected (no actual AI review calls)
- Progress streaming to renderer (scaffolded)

---

## Phase 2: Core Product Completion

The features below complete the V1 product vision. These are the missing pieces that make Flowrite genuinely usable as a daily writing tool.

### 2.1 Suggestion & Rewrite UI
**Status:** Backend done (propose_suggestion tool works), UI partial (SuggestionCard.vue exists)
**What's needed:**
- [ ] Inline diff view showing original vs. proposed text
- [ ] Accept/reject flow with anchor validation and fuzzy re-anchor
- [ ] Safety snapshot creation before first acceptance per save cycle
- [ ] `applied_in_buffer` -> finalize on save flow
- [ ] Authorship trace (subtle underline/tint on accepted AI text)
- [ ] Hover provenance: shows when accepted, from which thread

### 2.2 Auto-Save
**Status:** Not started. MarkText has manual save only.
**What's needed:**
- [ ] Debounced auto-save (e.g. 3s after last keystroke, configurable)
- [ ] Save indicator in title bar (saved/unsaved/saving)
- [ ] Atomic markdown + sidecar save in one logical transaction
- [ ] Crash recovery: detect unsaved buffer on relaunch
- [ ] Option to disable auto-save for users who prefer manual control

### 2.3 Version History UI
**Status:** Backend done (snapshotStore.js creates snapshots), no UI
**What's needed:**
- [ ] Version history drawer/panel accessible from toolbar
- [ ] Timeline of snapshots with timestamps and trigger labels
- [ ] Side-by-side or inline diff viewer between versions
- [ ] Restore to any previous version
- [ ] AI-assisted changes visually distinct in diffs
- [ ] Snapshot creation on meaningful events (AI suggestion accepted, manual save after large edit)

---

## Phase 3: Writer Memory & AI Intelligence

The soul of Flowrite. These features transform AI from a generic commenter into a writing companion that knows you.

### 3.1 Writer Memory System
**Status:** Architecture designed in CLAUDE.md, `save_memory` tool not yet implemented
**What's needed:**
- [ ] `save_memory` tool implementation in toolRegistry
- [ ] `~/.flowrite/writer-memory.json` storage (user-level, cross-document)
- [ ] Memory categories: style, preference, context, fact
- [ ] Memory injection into system prompt (max 4000 tokens, FIFO overflow)
- [ ] AI learns writing patterns: sentence rhythm, vocabulary, tone preferences
- [ ] AI learns commenting preferences: how direct, how detailed, what to focus on
- [ ] "Soulmate commenter" behavior: adapts feedback style to what resonates with the writer

### 3.2 Memory Management UI
**Status:** Not started (P2 in TODOS.md)
**What's needed:**
- [ ] Settings panel showing all stored memory entries
- [ ] Edit/delete individual memories
- [ ] Memory categories with visual grouping
- [ ] Auto-pruning of stale or contradictory facts
- [ ] "Forget everything" reset option
- [ ] Token usage indicator (how much of the 4000-token budget is used)

### 3.3 AI Engineering & Prompt Quality
**Status:** Prompts functional, not yet refined for quality
**What's needed:**
- [ ] Refined system prompts for comment-first behavior (less generic, more editorial)
- [ ] Better persona differentiation (friendly/critical/improvement feel too similar currently)
- [ ] Context-aware commenting: AI references earlier parts of the document, not just the anchor
- [ ] Multi-turn thread coherence: AI remembers what was discussed in the thread
- [ ] Tone matching: AI adapts formality/casualness to the writer's document register
- [ ] Reduce AI verbosity: comments should be concise and pointed
- [ ] Eval suite: canned documents with expected comment quality benchmarks
- [ ] Prompt caching optimization: measure and reduce API costs

---

## Phase 4: Writing Experience Polish

Making the editor feel like home for serious writers.

### 4.1 Editor Ambiance & Theming
**What's needed:**
- [ ] Background color temperature control (warm/cool/neutral slider)
- [ ] Custom accent colors for the writing surface
- [ ] Dark mode refinement (not just inverted, but designed for long writing sessions)
- [ ] Font selection: serif/sans-serif/monospace with size control
- [ ] Line height and paragraph spacing adjustments
- [ ] Distraction-free / zen mode (hide all chrome except the text)
- [ ] Per-document theme memory

### 4.2 MarkText Trim & Performance
**Status:** Full MarkText feature set is carried over, much is unused
**What's needed:**
- [ ] Audit MarkText features: identify what Flowrite writers actually need
- [ ] Remove or disable unused features:
  - [ ] Source code mode (if not needed for the target user)
  - [ ] Mermaid/Vega chart rendering (heavy dependencies, niche use)
  - [ ] Image uploader integrations (SM.MS, GitHub, etc.)
  - [ ] Typewriter/focus mode (evaluate — may keep if writers use it)
- [ ] Reduce Electron bundle size by pruning unused node_modules
- [ ] Startup time optimization: lazy-load heavy components
- [ ] Memory profiling: identify leaks during long editing sessions
- [ ] Muya rendering performance for very long documents (10K+ words)

### 4.3 Keyboard-First Shortcuts
**What's needed:**
- [ ] `Cmd+Shift+C` — margin comment at current selection
- [ ] `Cmd+Shift+G` — focus global comment input
- [ ] `Cmd+Shift+R` — trigger AI review
- [ ] Keyboard navigation within thread cards
- [ ] Escape to dismiss/collapse active thread

### 4.4 Writing Flow Enhancements
**What's needed:**
- [ ] Word count / reading time in status bar
- [ ] Session writing stats (words written this session, time active)
- [ ] Focus timer / pomodoro integration (optional, non-intrusive)
- [ ] Quick document switching without losing comment state
- [ ] Recent files with Flowrite metadata preview

---

## Phase 5: Platform & Distribution

Getting Flowrite into writers' hands.

### 5.1 Landing Page & Website
- [ ] Product landing page explaining the "thinking editor" concept
- [ ] Demo video / interactive preview
- [ ] Download links for macOS (primary), Windows, Linux
- [ ] Blog / changelog for updates

### 5.2 Security & Authentication
- [ ] OAuth for future cloud features (Google, GitHub)
- [ ] End-to-end encrypted sync (if cloud sync is added)
- [ ] API key management improvements (multiple keys, usage tracking)
- [ ] Security audit: prompt injection boundaries, tool path scoping
- [ ] Code signing and notarization for macOS distribution

### 5.3 Distribution & Updates
- [ ] Auto-updater (Electron autoUpdater or electron-updater)
- [ ] DMG/installer packaging for macOS
- [ ] Windows installer (NSIS or MSI)
- [ ] Linux AppImage/deb/rpm
- [ ] Crash reporting (opt-in, privacy-respecting)

---

## Phase 6: Future Vision

Long-term ideas, not committed. Evaluate after V1 ships.

### 6.1 Ambient AI Companion
- Always-on gentle observations while writing (V2 direction from design.md)
- Non-intrusive: appears only when AI notices something worth flagging
- Requires solving interruption timing, trust, and UI placement

### 6.2 Multi-Document Intelligence
- Project-level context: AI understands relationships between documents
- Cross-document references and consistency checking
- `read_file` / `search_files` tools scoped to project directory

### 6.3 Cloud & Collaboration
- Optional cloud sync for documents + Flowrite metadata
- Shared commenting between trusted collaborators
- Publishing pipeline (export to blog, newsletter, etc.)

### 6.4 Vue 3 Migration
- Vue 2 EOL migration to Vue 3 + Pinia (P3 in TODOS.md)
- Should happen during a feature freeze
- Effort: XL (multi-quarter)

---

## Priority & Sequencing Summary

```
NOW        Phase 2: Suggestion UI, Auto-Save, Version History, Shortcuts
           (Complete the V1 product vision)

NEXT       Phase 3: Writer Memory, Memory UI, AI prompt quality
           (Make the AI companion feel personal)

THEN       Phase 4: Theming, MarkText trim, writing flow
           (Polish the daily writing experience)

LATER      Phase 5: Landing page, security, distribution
           (Get it into writers' hands)

FUTURE     Phase 6: Ambient AI, multi-doc, cloud, Vue 3
           (Expand the vision)
```

---

## Dependencies & Risk Notes

- **Suggestion UI** blocks the full comment-first workflow — users can't act on AI rewrites without it
- **Auto-save** is a prerequisite for version history to be meaningful
- **Writer memory** (`save_memory` tool) must land before memory management UI
- **MarkText trim** should be done carefully — audit usage before removing features
- **Vue 3 migration** is the biggest technical risk; defer until product-market fit is validated
- **Ambient AI** (Phase 6) is a hard UX problem; ship V1 without it and learn from writer behavior first
