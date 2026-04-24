# Flowrite — Product Requirements Document

**Version:** 2.0
**Date:** 2026-04-15
**Authors:** Pan (Lego), Yumin (傅禹铭)
**Status:** Draft for Review

---

## 1. Product Vision

### One-Liner
A writing-first minimalist Markdown editor with AI as a thoughtful commenting companion, not a ghostwriter.

### Product Thesis
Today, writers face a broken dichotomy:
- **Use AI as a ghostwriter** — weakens authorship, breaks the thinking loop.
- **Copy-paste text into a chat app** — destroys context, fragments workflow.

Flowrite keeps reflection inside the document. AI behaves like a smart reader in the margins and below the draft — helping the writer notice vagueness, contradictions, leaps in logic, tone mismatches, and unresolved thoughts. Rewrite help exists, but only after the writer asks for it.

This should feel closer to "Word comments for reflective writing" than "ChatGPT next to a text box."

### 10x Vision
At 10x, Flowrite is the default "thinking editor" for serious writers. Every writer who currently pastes text into ChatGPT for feedback instead uses Flowrite because the AI is already in the margins, already knows their style, and already has context. The AI feels like a brilliant reading partner who has read everything you've ever written.

### Key Product Insight
Every AI writing tool in market helps you write faster. None help you think better. Flowrite's "comment before rewrite" is a genuine gap. The "AI Review" button that produces proactive document-wide comments is closer to "code review for writing" than anything in market.

---

## 2. Core Principles

1. **Writing First, Thinking First** — AI assists but never dominates. The document is the main character.
2. **Clean by default** — AI features only appear on user trigger. Out-of-box experience is a calm, minimal editor. All features are opt-in.
3. **Comment before rewrite** — AI always explains before modifying. Reflection is the differentiator, not automation volume.
4. **No silent edits** — every change requires explicit user approval. AI proposes, never silently edits.
5. **Plain markdown is truth** — `.md` files remain canonical. Metadata belongs in sidecar files, not in the prose.
6. **Calm, native, personal** — the app should feel like well-designed stationery, not a productivity dashboard.

---

## 3. Target Users

### Primary: Serious Solo Writers
- Writes in markdown (or willing to)
- Wants help clarifying thought, not generating text
- Values authorship and inspectability
- Wants AI in context, not in a detached chat window
- Includes: essayists, researchers, newsletter writers, technical writers, journalers, reflective writers

### User Spectrum (from April 11 founding sync)
The team identified a left-to-right spectrum of AI involvement:

| Level | Description | Flowrite Scope |
|-------|------------|----------------|
| 0 | No AI — pure personal writing | Editor only (always supported) |
| 1 | Comments only — AI reads and reflects | V1 Core |
| 2 | Micro edits — AI suggests sentence-level rewrites | V1 Rewrite |
| 3 | Section rewrite — AI proposes paragraph-level changes | V1 Rewrite |
| 4 | Global rewrite — structure-level changes | Deferred (needs complex routing) |
| 5 | Cross-file synthesis — AI reads multiple files, constructs new | Out of scope (this is Cursor/Obsidian territory) |

**Decision:** Flowrite targets levels 0-3. Level 4+ is deferred to CLI/agent integration. This is a deliberate constraint — we are not building a text-mode Cursor.

---

## 4. Interaction Model

Flowrite has three interaction modes, all sharing a single AI session per article.

### 4.1 AI Review ("Have a Look")
**Trigger:** One-click button in toolbar, with persona selection.
**Personas:** Friendly, Critical, Improvement.
**Behavior:**
- AI proactively reads the full document
- Generates both global comments (in bottom discussion) and margin comments (on specific passages)
- Shows a progress indicator during review (inherently longer than single comments)
- This is the closest approximation to the "always-on writing buddy" vision, but user-triggered

**Decision (April 11):** "Have a Look" is an imitation of the always-on mode, just one-click-triggered rather than continuous. The always-on version is a future V2+ feature.

### 4.2 Margin Comments (Sidebar)
**Trigger:** User selects text, writes a comment in the sidebar card.
**Behavior:**
- AI responds in the same thread
- Sidebar cards show a one-line AI summary tab when collapsed (inspired by Arc browser bookmarks)
- Collapsed state: small dot indicator, like Word tracking mode — minimal distraction
- Expanded state: full thread with reply capability
- Two content types coexist in sidebar:
  - **Discussion threads** — valuable exchange that persists permanently. Users can revisit and continue.
  - **Suggestion cards** — rewrite proposals that appear as cards. After user accepts or rejects, the card disappears from UI. No "resolve" button — accept/reject IS the terminal action.

**Design rationale (April 11):** Modeled after legal margin notes tradition — comments stay, edits get applied and cleared. This keeps the sidebar clean and avoids the cluttered feeling of unresolved items piling up.

### 4.3 Global Discussion (Bottom Panel)
**Trigger:** User writes in the discussion panel below the editor.
**Scope:** Full-document level discussion with AI.
**Behavior:**
- Shares the same AI session as margin comments (single session per article)
- Only UI distribution differs — this is for document-wide reflection
- AI responds with plain text only (no markdown in comments)

### Session Architecture (DD-001)
- **One session per article** — all sidebar comments and global discussion share context
- Conversation history stored in `.flowrite/document.json`
- History loaded on document open, providing cross-thread context
- Compaction at 80K tokens: summarize oldest 60% of turns
- **Rationale:** Simpler architecture, AI has full cross-context understanding. With 1M+ context windows, no practical limit for writing use cases.

---

## 5. AI Behavior Specification

### 5.1 Comment-First Behavior (DD-005)
AI always comments/discusses before rewriting. The default response shape:
1. **Comment first** — observation, analysis, question
2. **Offer help second** — "Want me to rewrite this?" or "Here are three alternatives"

Rewrite only happens when:
- User explicitly requests it ("help me rewrite this")
- AI proposes and user accepts ("would you like me to rewrite for you?")

### 5.2 Output Format Rules (DD-006)
| Context | Output Format | Reasoning |
|---------|--------------|-----------|
| Comments (margin + global) | Plain text only | Follows Notion/Lark convention. Comments should be concise. Markdown in comments looks messy. |
| Comments | Short sentences | Human comments are small. AI should match. No 800-word essays in a comment. |
| Suggestion/Rewrite | Markdown allowed | Content modifications need to preserve formatting. |

### 5.3 No Chat/Action Split
AI distinguishes intent from natural language. There is no separate "chat mode" vs "action mode" button.
- "Give me some feedback on this paragraph" → AI comments
- "Help me polish this" → AI proposes rewrite suggestion
- AI model is smart enough to route without explicit mode switching

### 5.4 Structured Tool Calls
AI uses structured tool calls, not free-form text responses:
- `create_comment(target, content)` — leave a comment (margin or global)
- `propose_suggestion(target, original_text, suggested_text, rationale)` — propose a rewrite
- `save_memory(key, value)` — store writer facts/preferences
- `read_file(path)` — read document content
- `search_files(query)` — search across project files

### 5.5 Text Lock During AI Response
Text blocks are locked during AI response. No edits to in-flight anchor ranges. This prevents anchor drift mid-response.

---

## 6. Feature Specifications by Milestone

### M1: Core Comments & Discussion (Current priority)

#### M1.1 Sidebar Comments (Mostly implemented)
- Select text → comment input appears
- AI responds in thread
- Collapsed view: small dot indicator on the margin
- Expanded view: full card with thread
- Arc-style one-line summary on each card tab
- Cards stack vertically aligned with their anchor paragraphs
- Stacking/overlap resolution when multiple comments are near each other

#### M1.2 Global Discussion Panel (Mostly implemented)
- Bottom panel for document-wide discussion
- Input field for user questions/comments
- AI responses appear in conversation flow
- Plain text output only

#### M1.3 "Have a Look" Review (UI built, needs wiring)
- Three persona buttons: Friendly, Critical, Improvement
- Triggers full-document review
- AI generates both global and margin comments in one pass
- Progress indicator during review
- Need to wire Have a Look output to existing sidebar UI

### M2: Suggestion & Rewrite

#### M2.1 Suggestion Cards in Sidebar
When AI proposes a rewrite (either proactively or on request):
- A **suggestion card** appears in the sidebar, visually distinct from discussion comments
- Card shows: original text, proposed replacement, AI rationale
- Two actions: **Accept** (apply change) or **Reject** (dismiss card)
- After action, card disappears from sidebar
- No "resolve" button needed — accept/reject is terminal

**Design decision (April 11, DD-002):** Suggestion cards vanish after action. Discussion threads persist. This keeps UI clean. Version history (Git tree) captures the actual changes. Discussion threads are the valuable artifact, not the action card itself.

#### M2.2 Authorship Trace
After accepting a suggestion:
- Subtle visual indicator on modified text (faint underline, light tint, or hover affordance)
- On hover: shows that passage came from AI-assisted suggestion, when accepted, which thread it came from
- Trace is quiet by default, easy to inspect

#### M2.3 Rewrite Scope
- **Sentence-level:** AI rewrites a highlighted sentence
- **Paragraph-level:** AI rewrites a highlighted paragraph
- **No global/structural rewrite in V1** — if user needs that, they use the global discussion to discuss structure, then manually reorganize or delegate to CLI tools

### M3: Auto-Save & Version History

#### M3.1 Auto-Save
- Currently: no auto-save, user must Cmd+S
- Target: automatic save on a timer (e.g., every 30 seconds of inactivity)
- Auto-save and version history must be built together

#### M3.2 Version History (Git Tree)
- Each accepted AI edit = a Git commit
- Manual saves also create commits
- Ability to rewind to any prior state
- Diff viewer showing what changed between versions
- AI-assisted changes are visible and inspectable in diffs
- **Mental model:** "document history," not "AI history"

**Decision (April 11):** Auto-save and version history are a single feature built on Git tree. This is a core writing tool capability — the ability to rewind — not a nice-to-have.

### M4: CLI Tools

#### M4.1 Dedicated CLI for External Agents
Build a CLI that Claude Code, Codex, and other AI agents can use to interact with Flowrite:
- `flowrite comment <file> <line> <message>` — leave a comment
- `flowrite discuss <file> <message>` — post to global discussion
- `flowrite suggest <file> <range> <new_text>` — propose a rewrite
- `flowrite read-comments <file>` — read existing comments
- `flowrite read-discussion <file>` — read discussion history
- `flowrite versions <file>` — list version history

**Decision (April 11, DD-003):** No embedded terminal in the editor. Terminals in editors look ugly (see Obsidian terminal plugin). Discussion/comments are permanent records; terminal sessions are ephemeral. Different paradigms. Instead, build CLI tools that external agents can use.

**Exception:** A hidden terminal for API key authentication only. Login flow triggers a terminal, then it hides.

### M5: Cross-Session Memory

#### M5.1 Writer Memory (V1 — append-only)
- Claude calls `save_memory()` tool to remember writer facts, preferences, and context
- Stored at `~/.flowrite/writer-memory.json` (user-level, not per-document)
- Append-only in V1. Max 4000 tokens injected into system prompt. FIFO overflow.
- AI knows the writer better over time — writing style preferences, recurring themes, knowledge level

#### M5.2 Memory Goals
1. **Style awareness:** AI learns the writer's preferred tone, vocabulary, sentence structure
2. **Soulful dialogue:** For journaling scenarios — AI remembers past reflections, can reference them, provides continuity across sessions. This is what makes the AI feel like a companion, not a tool.

#### M5.3 Memory Management (V2)
- UI for viewing, editing, pruning memories
- Memory categories: style preferences, factual knowledge, writer context
- Smarter memory retrieval (beyond FIFO)

### M6: Voice "Flow Mode" (Future — Killer Feature)

**This is the feature no competitor has built. It is the long-term differentiator.**

#### M6.1 Core Concept
Voice + AI + live document writing, combined into a single flow:
- User speaks → local Whisper transcribes to text → Claude thinks and responds
- **AI responds in TEXT, not voice** — supports deeper thinking, saves tokens
- Document writes itself as the conversation progresses
- After finalize, conversation overlay disappears, text commits to document

#### M6.2 Three Combined Capabilities
Previous tools offer these separately. Flowrite combines them:
1. **Transcription** — speech to text (Apple dictation mode)
2. **AI Conversation** — iterative back-and-forth with a thinking partner
3. **Document Generation** — content appears on the page as you discuss

No one offers all three simultaneously in a writing context.

#### M6.3 UI Design for Flow Mode
- Triggered via slash commands: `/journal`, `/brainstorm`, `/plan` (each is a customizable skill)
- On activation: screen dims (focus mode overlay), conversation happens in highlighted area
- AI questions appear as text in the overlay (not spoken back)
- Document content writes itself in the background as conversation progresses
- After user says "finalize" or triggers end: overlay fades, text is committed to document

**Skill System:**
- Each slash command activates a voice "skill" with a predefined question script
- `/journal` — AI interviews you about your day, outputs a journal entry
- `/brainstorm` — collaborative ideation, captures ideas as structured notes
- `/plan` — discuss a document plan, AI writes the outline as you talk
- Users can create custom skills with their own question scripts

#### M6.4 Technical Approach
- **Speech-to-text:** Local Whisper model (no cloud dependency for transcription)
- **Thinking:** Claude (text model) for deep reasoning and response generation
- **Two "interns" model:** One fast intern does transcription, one smart intern does thinking and writing. By the time you finish speaking, the smart intern has nearly finished writing.
- **Token efficiency:** Voice input only. AI never speaks back. Text output saves significant tokens vs TTS.

#### M6.5 Application Scenarios
- **Journaling:** AI interviews you with customizable questions → journal entry writes itself
- **Technical writing:** Discuss a plan document → plan writes and revises as you talk
- **Brainstorming:** Speak ideas freely → AI organizes them into structured notes
- **Any scenario where speaking is faster than typing** — which is most creative/ideation work

---

## 7. UI/UX Specification

### 7.1 Information Architecture

```
┌──────────────────────────────────────────────────────┐
│  Toolbar: [Have a Look ▾] [Focus] [Theme] [Settings] │
├────────────────────────────────┬─────────────────────┤
│                                │                     │
│                                │  Sidebar            │
│   Main Writing Surface         │  ┌───────────────┐  │
│   (Markdown WYSIWYG)           │  │ Comment Card   │  │
│                                │  │ [1-line tab]   │  │
│   • Clean, calm, centered      │  └───────────────┘  │
│   • Focus mode available       │  ┌───────────────┐  │
│   • Typewriter mode available  │  │ Suggestion     │  │
│                                │  │ [Accept|Reject]│  │
│                                │  └───────────────┘  │
│                                │        •  (dot)     │
│                                │        •  (dot)     │
├────────────────────────────────┴─────────────────────┤
│  Global Discussion Panel                              │
│  [User input field]                                   │
│  AI: "The argument in section 2 feels..."             │
│  User: "Can you elaborate on..."                      │
└──────────────────────────────────────────────────────┘
```

### 7.2 Sidebar Card Design

**Collapsed state:**
- Small dot on margin (like Word track changes)
- Minimal — doesn't distract from writing
- One-line AI summary visible on hover or as a small tab

**Expanded state (click to expand):**
- Full thread view with back-and-forth
- Reply input at bottom
- For suggestion cards: diff view with Accept/Reject buttons
- Cards are vertically aligned with their anchor text

**Arc Browser inspiration:** Each card tab shows a one-line summary generated by AI, like Arc's bookmark titles. This lets the writer scan all open threads at a glance without expanding each one.

### 7.3 Default State
- On first open: editor only, no AI features visible
- All AI features activated by user action
- Sidebar hidden by default, appears when first comment is created
- Discussion panel collapsed by default, expands on click
- This is the "clean by default" principle in action

### 7.4 Focus Mode
- Single highlighted line (typewriter mode from MarkText)
- All other content dimmed
- Sidebar and discussion panel hidden
- Can be toggled with a keyboard shortcut

### 7.5 Writing Experience Polish
- **Paper warmth toggle:** Adjust background color from white to warm yellow (like Kindle)
- **Theme support:** Adapt comments and discussion to match active theme
- **Word count and statistics** (like Tempora)
- **Typewriter sounds** (optional, toggleable)
- **Outline/document structure sidebar** (from MarkText)

---

## 8. Technical Architecture

### 8.1 Stack
- **Desktop app:** Electron + Vue 2 + Vuex + Muya (forked from MarkText)
- **AI backend:** Target: direct Anthropic Messages API via `@anthropic-ai/sdk` (TypeScript SDK)
  - Currently: Anthropic SDK via Vercel AI gateway (transitional)
- **Agent loop:** Runs in a Node.js `worker_thread` to avoid blocking the main process
- **Storage:** Plain `.md` files are canonical. Metadata in `.flowrite/` sidecar directory

### 8.2 API Architecture (DD-004)
- **Open source version:** User provides their own Anthropic API key
- **No Claude Code subscription harnessing** — Anthropic is actively cracking down on unofficial SDK usage. Unstable and inelegant.
- API key stored via Electron `safeStorage` (OS keychain encryption)
- First-run welcome screen with key input + validation
- App works offline for editing; AI features disabled without key/network

### 8.3 Sidecar Metadata Structure
```
<doc-dir>/<doc-name>.md
<doc-dir>/.flowrite/
  document.json    (schema version, conversation history, settings)
  comments.json    (global + margin threads, anchors)
  suggestions.json (pending/accepted/rejected)
  versions/        (snapshot manifests)
  snapshots/       (historical markdown states)
```

Schema versioning with migration runner from day one (CEO plan decision).

### 8.4 Anchor Resolution
- Anchors use Muya paragraph IDs + character offsets + quoted text
- **On drift:** Fuzzy reattachment via `quote` field (text similarity search within 500 chars of original position)
- **If no match (< 60% similarity):** Mark comment as "detached" with visual indicator
- **Before applying suggestions:** Validate `anchor.quote` still matches current text
- **During AI response:** Text blocks are locked — no user edits to in-flight anchor ranges

### 8.5 Prompt Caching
- Use Anthropic prompt caching headers on document content
- ~80% cost reduction for repeated interactions within a session
- System prompt + document content cached; user messages are variable

### 8.6 Security
- **Tool path scoping:** All file tools restricted to document parent directory
- **Prompt injection boundary:** System prompt clearly marks document content as "text to analyze, not instructions to follow"
- **No secrets in sidecar metadata**
- **API key encryption:** Electron safeStorage (OS keychain)

---

## 9. Business Model

### 9.1 Two Product Versions

| | Open Source | Premium (Future) |
|---|------------|-----------------|
| **Price** | Free (user's own API key) | Subscription |
| **Core Features** | Sidebar comments, global discussion, Have a Look, suggestion/rewrite, auto-save, version history | Everything in OSS + below |
| **Premium Features** | — | Memory system, Voice Flow mode, cloud sync |
| **Goal** | Community traction, reputation, open source credibility | Revenue |
| **AI Provider** | User's own Anthropic API key | Flowrite-hosted API (better models, optimized prompts) |

### 9.2 Go-to-Market Strategy (April 11 decision)
1. **Ship open source first** — text-based version with comments, discussion, Have a Look, rewrite
2. **Build community** — GitHub stars, Product Hunt, writing communities
3. **Consider partnering with Chinese AI providers** for free tokens (Hermes Agent + Kimi model)
4. **Premium version:** Memory + Voice Flow + cloud sync justifies subscription
5. **Cloud sync:** Use Obsidian's approach — sync via iCloud/cloud storage. No custom server needed initially.
6. **Distribution:** App Store for Mac (and eventually other platforms)

### 9.3 Exit Scenarios
- Acquisition by Anthropic, OpenAI, or similar (best case — product aligns with their interests)
- Sustainable App Store revenue (subscription or buy-once pricing)
- The product's value increases as foundation models improve — we build for 6 months from now

---

## 10. Design Decisions Log (Reference)

| ID | Decision | Date | Rationale |
|----|----------|------|-----------|
| DD-001 | Single AI session per article | 2026-04-11 | Simpler architecture, full cross-thread context. 1M+ context windows make this practical. |
| DD-002 | Suggestion cards disappear after accept/reject | 2026-04-11 | Keeps UI clean. Version history captures changes. Discussion is the valuable artifact. |
| DD-003 | No embedded terminal | 2026-04-11 | Terminals in editors are ugly. Comments are permanent; terminal sessions are ephemeral. Build CLI instead. |
| DD-004 | API key over Claude Code subscription harnessing | 2026-04-11 | Anthropic cracking down on unofficial usage. Unstable and inelegant. |
| DD-005 | Comment-first AI behavior | 2026-04-11 | "Writing First, Thinking First" philosophy. Reduces accidental overwrites. |
| DD-006 | Plain text comments, markdown rewrites | 2026-04-11 | Follows Notion/Lark convention. Comments should be concise and readable. |
| DD-007 | Rewrite displayed as sidebar cards, not inline | 2026-04-11 | Modeled after legal margin notes. Comments stay, edits get applied and cleared. |
| DD-008 | CLI tools for external agent integration | 2026-04-11 | Enables Claude Code/Codex without embedding a terminal. |
| DD-009 | Voice Flow as slash-command skills | 2026-04-11 | Generalizable pattern: `/journal`, `/brainstorm`, `/plan` each activate a voice skill with custom scripts. |
| DD-010 | Open source first, premium later | 2026-04-11 | Build reputation before monetizing. AI subscription fatigue means free/cheap entry is essential. |

---

## 11. Roadmap

**Priority order (agreed April 11):** Comments → Rewrite → Auto-Save → CLI → Memory → Voice

### M1: Core Comments & Discussion
**Status:** Mostly implemented (sidebar comments, global discussion, Have a Look UI)
**Remaining:**
- Wire Have a Look output to sidebar UI
- Polish card stacking/overlap logic
- Arc-style summary tabs on cards
- Theme adaptation for comments/discussion

### M2: Suggestion & Rewrite
**Status:** Not started
**Scope:**
- Suggestion card UI in sidebar
- Accept/reject flow
- Diff display for proposed changes
- Authorship trace on accepted text

### M3: Auto-Save & Version History
**Status:** Not started (no auto-save in MarkText fork)
**Scope:**
- Auto-save mechanism
- Git tree-based version history
- Version browser and diff viewer
- Each accepted edit = a commit

### M4: CLI Tools
**Status:** Not started
**Scope:**
- CLI binary for comment/discuss/suggest/read operations
- Integration guide for Claude Code and Codex

### M5: Memory System
**Status:** Not started
**Scope:**
- `save_memory()` tool implementation
- `~/.flowrite/writer-memory.json` storage
- System prompt injection
- FIFO overflow at 4000 tokens

### M6: Voice Flow Mode
**Status:** Vision defined (April 11)
**Scope:**
- Local Whisper integration
- Slash-command skill framework
- Focus mode overlay for voice conversations
- Finalize-and-commit flow

### Polish Track (Parallel)
- Remove unnecessary MarkText features
- Keyboard shortcuts for comment operations
- Paper warmth / theme customization
- Typewriter sounds, word count
- Writing flow enhancements

---

## 12. V1 Scope Summary

### In Scope (V1 = M1 + M2 + M3)
- Markdown editor and viewer (WYSIWYG, from MarkText)
- Plain `.md` file as canonical format
- Global AI discussion below document
- Margin AI comments attached to selected text
- Manual AI invocation only (no always-on)
- Comment-first AI response behavior
- Suggestion cards with accept/reject
- Auto-save with version history (Git tree)
- API key authentication (user's own key)
- Focus mode, typewriter mode, theme support

### Out of Scope for V1
- Human collaboration / shared commenting
- Always-on autonomous AI commenting while writing
- Voice input/output
- Cross-file references and multi-document context
- Memory system
- CLI tools
- Cloud sync
- Embedded terminal

---

## 13. Success Criteria

The product succeeds if a writer can say:
- "I stayed inside my draft the whole time."
- "The AI helped me think, not just rewrite."
- "I could always tell what changed."
- "My markdown still belongs to me."
- "The comments felt like a real companion, not a chatbot."
- "The sidebar was clean — I could see what mattered at a glance."

---

## 14. Open Questions

1. **Anchor behavior on major edits:** When user restructures paragraphs, how do anchored comments migrate? Current plan: fuzzy match with 60% similarity threshold, then "detached" state. Needs UX testing.
2. **Suggestion card history:** After accepting a suggestion, the card disappears from sidebar. Should there be a way to browse past accepted/rejected suggestions? (Current answer: version history serves this purpose via Git diffs.)
3. **Multi-document context in V1:** Should AI be able to read other files in the same directory for context? (April 11 discussion leaned toward "not hard to do" but deferred to avoid Obsidian scope creep.)
4. **Always-on mode UX:** How to handle interruption, trust, and timing for a future ambient AI commenting mode? (Deferred to V2.)
5. **Chinese AI provider partnership:** Which provider for the open-source version's free tier? (Kimi mentioned as possibility, following Hermes Agent's model.)
6. **App Store pricing:** Buy-once or subscription? If subscription, what price point? (Tempora sells for $19 one-time. Our premium with AI would need subscription due to API costs.)

---

## Appendix A: Competitive Landscape

| Product | What It Does | How Flowrite Differs |
|---------|-------------|---------------------|
| Tempora | Clean markdown editor, $19 one-time | No AI. Flowrite adds AI commenting without losing the clean experience. |
| Notion AI | AI writing inside Notion | AI is a ghostwriter, not a thought partner. No focus/writing-first mode. Comments are collaborative, not AI-native. |
| Cursor | AI code editor | For code, not prose. Cross-file is their strength. Flowrite stays document-focused. |
| Obsidian + plugins | Knowledge base with community plugins | No native AI commenting. Terminal plugins are ugly. Flowrite is writing-first, not knowledge-management-first. |
| Generic AI writing tools | Chat sidebar + editor | Two-panel layout feels split and unfocused. Not writing-first. AI is a chatbot, not a margin reader. |

## Appendix B: Key Meeting References

- **Founding Sync (2026-04-11):** Pan & Yumin. ~2 hours. Established product vision, interaction model, business strategy, and roadmap priorities. Source: Tencent Meeting recording + transcription.
- **Notion Hub:** https://www.notion.so/7ce2470396f6833da12401a57e1422b5
- **GitHub:** https://github.com/FUY25/Flowrite
