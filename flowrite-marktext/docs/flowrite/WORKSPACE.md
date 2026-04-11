# Flowrite Workspace

This repository is the working Flowrite implementation fork. It is a fresh local clone of
MarkText so the original vendor copy remains untouched.

Working location:

- Active implementation repo: this copied `flowrite-marktext` workspace
- Untouched vendor source: the sibling `vendor/marktext` checkout

Current execution defaults:

- Gateway: Vercel AI Gateway
- Default model: `anthropic/claude-sonnet-4.6`
- Local secret source: `.env`

Environment handling:

- `.env.example` documents the expected local variables.
- Real secrets stay in the local `.env` file and must not be committed.
- The current app bootstrap already loads `.env` during development via `src/main/index.dev.js`.

The implementation follows the Flowrite planning and design docs in the sibling project
workspace, with the reduced first slice locked around:

- global comments below the document
- margin comments with a Notion-style annotation feel
- AI Review with persona selection
- suggestion accept/reject with explicit user control
- per-document sidecars and snapshot safety
