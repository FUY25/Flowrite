# Flowrite TODOs

## P2: Keyboard-First Comment Shortcuts
**What:** Cmd+Shift+C for margin comment at selection, Cmd+Shift+G for global comment.
**Why:** Writers hate leaving the keyboard. Mouse-based comment invocation breaks flow.
**Effort:** S (human: ~2h / CC: ~10min)
**Depends on:** Comment system implemented (Tasks 5-6)

## P2: Memory Management UI
**What:** UI to view, edit, and delete writer memory entries. Auto-pruning of stale facts.
**Why:** Append-only memory accumulates stale observations. Without pruning, the AI injects
outdated facts into every session. V1 has a 4000-token FIFO cap as a safety valve, but
users need visibility and control.
**Effort:** M (human: ~1 week / CC: ~30min)
**Depends on:** save_memory tool implemented

## P3: Vue 3 Migration
**What:** Migrate from Vue 2 (end-of-life) + Vuex to Vue 3 + Pinia.
**Why:** Vue 2 is EOL. Options API makes reactive streaming state verbose. Long-term
maintainability concern.
**Effort:** XL (human: multi-quarter / CC: ~1-2 weeks). This is an ocean, not a lake.
**Depends on:** Nothing, but should be done during a feature freeze.
