# Flowrite Document ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a stable `documentId` for Flowrite-managed markdown files so document identity survives renames and future recovery work, while keeping the current path-hash sidecar layout and using a top-of-file HTML comment as the metadata carrier.

**Architecture:** Keep `pathHash` as the fast local lookup for `.flowrite/<slug>-<pathHash>/`, but make `documentId` the authoritative identity stored both in the markdown and in `document.json`. Introduce a small user-data index that maps `documentId` to the last known markdown and sidecar paths so Flowrite can recover sidecars after files move. Strip the HTML comment before markdown enters the editor state, and re-inject it atomically on save.

**Tech Stack:** Electron main process, Vue 2/Vuex renderer state, Node `crypto`, existing Flowrite sidecar storage helpers, Mocha/Chai unit tests.

---

### Task 1: Add Markdown Document Identity Helper

**Files:**
- Create: `flowrite-marktext/src/main/flowrite/files/documentIdentity.js`
- Create: `flowrite-marktext/test/unit/specs/flowrite-document-identity.spec.js`

- [x] **Step 1: Write the failing identity-helper tests**

```js
import { expect } from 'chai'
import {
  extractDocumentIdentityFromMarkdown,
  ensureDocumentIdentityInMarkdown,
  createDocumentId
} from '../../../src/main/flowrite/files/documentIdentity'

describe('Flowrite document identity helper', function () {
  it('extracts a top-of-file flowrite id comment and removes it from editor markdown', function () {
    const source = '<!-- flowrite:id=doc-123 -->\n\n# Draft\n\nHello.\n'

    const result = extractDocumentIdentityFromMarkdown(source)

    expect(result.documentId).to.equal('doc-123')
    expect(result.markdown).to.equal('# Draft\n\nHello.\n')
    expect(result.carrier).to.equal('html_comment')
  })

  it('injects a top-of-file flowrite id comment without changing body markdown', function () {
    const source = '# Draft\n\nHello.\n'

    const result = ensureDocumentIdentityInMarkdown(source, 'doc-123')

    expect(result).to.equal('<!-- flowrite:id=doc-123 -->\n\n# Draft\n\nHello.\n')
  })

  it('replaces an existing flowrite id comment instead of duplicating it', function () {
    const source = '<!-- flowrite:id=old-id -->\n\n# Draft\n'

    const result = ensureDocumentIdentityInMarkdown(source, 'new-id')

    expect(result).to.equal('<!-- flowrite:id=new-id -->\n\n# Draft\n')
  })

  it('creates a UUID-shaped document id', function () {
    expect(createDocumentId()).to.match(/^[0-9a-f-]{36}$/)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-document-identity.spec.js`
Expected: FAIL with `Cannot find module '../../../src/main/flowrite/files/documentIdentity'`

- [x] **Step 3: Write the minimal identity helper**

```js
import crypto from 'crypto'

const DOCUMENT_ID_COMMENT_REG = /^<!--\s*flowrite:id=([0-9a-z-]+)\s*-->\n{0,2}/i

export const createDocumentId = () => crypto.randomUUID()

export const extractDocumentIdentityFromMarkdown = markdown => {
  const source = typeof markdown === 'string' ? markdown : ''
  const match = source.match(DOCUMENT_ID_COMMENT_REG)

  if (!match) {
    return {
      markdown: source,
      documentId: '',
      carrier: null
    }
  }

  return {
    markdown: source.replace(DOCUMENT_ID_COMMENT_REG, ''),
    documentId: match[1],
    carrier: 'html_comment'
  }
}

export const ensureDocumentIdentityInMarkdown = (markdown, documentId) => {
  const source = typeof markdown === 'string' ? markdown : ''
  const cleaned = source.replace(DOCUMENT_ID_COMMENT_REG, '')
  return `<!-- flowrite:id=${documentId} -->\n\n${cleaned}`
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-document-identity.spec.js`
Expected: PASS with `4 passing`

- [x] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/main/flowrite/files/documentIdentity.js flowrite-marktext/test/unit/specs/flowrite-document-identity.spec.js
git commit -m "add flowrite markdown document identity helper"
```

### Task 2: Thread `documentId` Through Markdown Load/Save

**Files:**
- Modify: `flowrite-marktext/src/main/filesystem/markdown.js`
- Modify: `flowrite-marktext/src/renderer/store/help.js`
- Modify: `flowrite-marktext/src/renderer/store/editor.js`
- Test: `flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`

- [x] **Step 1: Write the failing storage tests for strip-on-load and inject-on-save**

```js
it('strips the flowrite id comment before the markdown reaches editor state', async function () {
  const pathname = path.join(tempRoot, 'identity-load.md')
  await fs.ensureDir(path.dirname(pathname))
  await fs.writeFile(pathname, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')

  const rawDocument = await loadMarkdownFile(pathname, 'lf', true, 2)

  expect(rawDocument.markdown).to.equal('# Draft\n')
  expect(rawDocument.flowriteDocumentId).to.equal('doc-123')
})

it('re-injects the flowrite id comment during save when saveContext carries documentId', async function () {
  const pathname = path.join(tempRoot, 'identity-save.md')

  await writeMarkdownFile(pathname, '# Draft\n', markdownOptions, {
    flowrite: {
      document: {
        documentId: 'doc-123'
      }
    }
  })

  expect(await fs.readFile(pathname, 'utf8')).to.equal('<!-- flowrite:id=doc-123 -->\n\n# Draft\n')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js --grep "flowrite id comment"`
Expected: FAIL because `loadMarkdownFile` does not expose `flowriteDocumentId` and `writeMarkdownFile` does not inject the comment

- [x] **Step 3: Add document identity fields to the markdown load/save path**

```js
// src/main/filesystem/markdown.js
import {
  extractDocumentIdentityFromMarkdown,
  ensureDocumentIdentityInMarkdown
} from '../flowrite/files/documentIdentity'

// inside loadMarkdownFile()
const identity = extractDocumentIdentityFromMarkdown(markdown)
markdown = identity.markdown

return {
  markdown,
  filename,
  pathname,
  flowriteDocumentId: identity.documentId,
  flowriteDocumentIdCarrier: identity.carrier,
  encoding,
  lineEnding,
  adjustLineEndingOnSave,
  trimTrailingNewline,
  isMixedLineEndings
}

// inside writeMarkdownFile()
const flowriteDocumentId = saveContext.flowrite &&
  saveContext.flowrite.document &&
  saveContext.flowrite.document.documentId

if (flowriteDocumentId) {
  content = ensureDocumentIdentityInMarkdown(content, flowriteDocumentId)
}
```

```js
// src/renderer/store/help.js
export const defaultFileState = {
  // ...
  flowriteDocumentId: '',
  flowriteDocumentIdCarrier: null
}

// in getSingleFileState/createDocumentState()
flowriteDocumentId,
flowriteDocumentIdCarrier
```

```js
// src/renderer/store/editor.js
const { id, filename, pathname, markdown, flowriteDocumentId, flowriteDocumentIdCarrier } = state.currentFile

ipcRenderer.send('mt::response-file-save', {
  id,
  filename,
  pathname,
  markdown,
  options,
  defaultPath,
  flowrite: {
    document: {
      documentId: flowriteDocumentId,
      documentIdCarrier: flowriteDocumentIdCarrier
    }
  }
})
```

- [x] **Step 4: Run the focused storage tests**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js --grep "flowrite id comment"`
Expected: PASS with both new tests green

- [x] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/main/filesystem/markdown.js flowrite-marktext/src/renderer/store/help.js flowrite-marktext/src/renderer/store/editor.js flowrite-marktext/test/unit/specs/flowrite-storage.spec.js
git commit -m "thread flowrite document ids through markdown load and save"
```

### Task 3: Persist `documentId` In Sidecars And Add Recovery Index

**Files:**
- Create: `flowrite-marktext/src/main/flowrite/files/documentIndex.js`
- Modify: `flowrite-marktext/src/main/flowrite/files/documentStore.js`
- Modify: `flowrite-marktext/src/main/dataCenter/index.js`
- Test: `flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`

- [x] **Step 1: Write failing tests for sidecar persistence and index recovery**

```js
it('persists documentId in document.json', async function () {
  const pathname = path.join(tempRoot, 'identity-record.md')

  await saveDocumentRecord(pathname, {
    documentId: 'doc-123'
  })

  const documentRecord = await loadDocumentRecord(pathname)
  expect(documentRecord.documentId).to.equal('doc-123')
})

it('records the last known path for a document id in the global index', async function () {
  configureDocumentIndex({ rootPath: tempRoot })

  await rememberDocumentIndexEntry({
    documentId: 'doc-123',
    pathname: '/tmp/draft.md',
    documentDir: '/tmp/.flowrite/draft-aaaa1111'
  })

  const entry = await findDocumentIndexEntry('doc-123')
  expect(entry.pathname).to.equal('/tmp/draft.md')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js --grep "documentId|global index"`
Expected: FAIL because `documentId` is not in `DEFAULT_DOCUMENT_RECORD` and `documentIndex.js` does not exist

- [x] **Step 3: Implement sidecar schema and global index helpers**

```js
// src/main/flowrite/files/documentStore.js
export const DEFAULT_DOCUMENT_RECORD = {
  version: DOCUMENT_VERSION,
  documentId: '',
  lastKnownMarkdownPath: '',
  lastSnapshotSaveCycleId: null,
  conversationHistory: [],
  historyTokenEstimate: 0,
  responseStyle: 'comment_only',
  lastReviewPersona: 'improvement'
}
```

```js
// src/main/flowrite/files/documentIndex.js
import path from 'path'
import fs from 'fs-extra'

let documentIndexRoot = ''

export const configureDocumentIndex = ({ rootPath }) => {
  documentIndexRoot = rootPath
}

const getDocumentIndexPath = () => path.join(documentIndexRoot, 'flowrite', 'document-index.json')

export const rememberDocumentIndexEntry = async ({ documentId, pathname, documentDir }) => {
  const next = {
    [documentId]: {
      pathname,
      documentDir,
      updatedAt: new Date().toISOString()
    }
  }
  // load, merge, writeJsonSidecar-style persist
}

export const findDocumentIndexEntry = async documentId => {
  // load index and return entry or null
}
```

```js
// src/main/dataCenter/index.js
import { configureDocumentIndex } from '../flowrite/files/documentIndex'

constructor (paths) {
  // ...
  configureDocumentIndex({
    rootPath: this.userDataPath
  })
}
```

- [x] **Step 4: Run the targeted storage tests**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js --grep "documentId|global index"`
Expected: PASS with the new sidecar and index tests green

- [x] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/main/flowrite/files/documentIndex.js flowrite-marktext/src/main/flowrite/files/documentStore.js flowrite-marktext/src/main/dataCenter/index.js flowrite-marktext/test/unit/specs/flowrite-storage.spec.js
git commit -m "persist flowrite document ids and recovery index"
```

### Task 4: Resolve Identity On Bootstrap And Repair Moved Documents

**Files:**
- Modify: `flowrite-marktext/src/main/flowrite/files/documentStore.js`
- Modify: `flowrite-marktext/src/main/dataCenter/index.js`
- Modify: `flowrite-marktext/src/main/flowrite/files/sidecarPaths.js`
- Test: `flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`
- Test: `flowrite-marktext/test/unit/specs/flowrite-controller.spec.js`

- [x] **Step 1: Write failing recovery tests for moved files**

```js
it('relinks a moved markdown file to the old sidecar when documentId matches the recovery index', async function () {
  configureDocumentIndex({ rootPath: tempRoot })

  const oldPath = path.join(tempRoot, 'docs', 'draft.md')
  const newPath = path.join(tempRoot, 'archive', 'draft.md')

  await fs.ensureDir(path.dirname(oldPath))
  await fs.ensureDir(path.dirname(newPath))
  await fs.writeFile(oldPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
  await saveDocumentRecord(oldPath, { documentId: 'doc-123', lastKnownMarkdownPath: oldPath })
  await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])
  await rememberDocumentIndexEntry({
    documentId: 'doc-123',
    pathname: oldPath,
    documentDir: getSidecarPaths(oldPath).documentDir
  })

  await fs.move(oldPath, newPath)
  await fs.writeFile(newPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')

  await ensureDocumentIdentityForPath(newPath)

  expect(await loadComments(newPath)).to.deep.equal(await loadComments(newPath))
  expect(await fs.pathExists(getSidecarPaths(oldPath).documentDir)).to.equal(false)
  expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(true)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js test/unit/specs/flowrite-controller.spec.js --grep "relinks a moved markdown file"`
Expected: FAIL because bootstrap never resolves sidecars by `documentId`

- [x] **Step 3: Implement bootstrap-time identity resolution**

```js
// src/main/flowrite/files/documentStore.js
export const ensureDocumentIdentityForPath = async pathname => {
  const rawDocument = await loadMarkdownFile(pathname, 'lf', true, 2)
  const embeddedDocumentId = rawDocument.flowriteDocumentId || ''
  const currentPaths = getSidecarPaths(pathname)
  const currentRecord = await loadDocumentRecord(pathname)

  if (embeddedDocumentId && currentRecord.documentId === embeddedDocumentId) {
    await rememberDocumentIndexEntry({
      documentId: embeddedDocumentId,
      pathname,
      documentDir: currentPaths.documentDir
    })
    return {
      documentId: embeddedDocumentId,
      pathname
    }
  }

  const indexed = embeddedDocumentId
    ? await findDocumentIndexEntry(embeddedDocumentId)
    : null

  if (indexed && indexed.documentDir && indexed.documentDir !== currentPaths.documentDir) {
    await migrateSidecarDirectory(indexed.pathname, pathname)
  }

  const nextDocumentId = embeddedDocumentId || currentRecord.documentId || createDocumentId()
  await saveDocumentRecord(pathname, {
    ...currentRecord,
    documentId: nextDocumentId,
    lastKnownMarkdownPath: pathname
  })

  await rememberDocumentIndexEntry({
    documentId: nextDocumentId,
    pathname,
    documentDir: currentPaths.documentDir
  })

  return {
    documentId: nextDocumentId,
    pathname
  }
}
```

```js
// src/main/dataCenter/index.js
async bootstrapFlowriteDocument (pathname) {
  // ...
  const identity = await ensureDocumentIdentityForPath(pathname)
  const [document, comments, suggestions] = await Promise.all([
    loadDocumentRecord(pathname),
    loadComments(pathname),
    loadSuggestions(pathname)
  ])

  return {
    document,
    comments,
    suggestions,
    pathname,
    documentId: identity.documentId,
    availability,
    runtimeReady: Boolean(availability.enabled)
  }
}
```

- [x] **Step 4: Run the recovery tests**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js test/unit/specs/flowrite-controller.spec.js --grep "documentId|relinks a moved markdown file"`
Expected: PASS with moved-file recovery and bootstrap assertions green

- [x] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/main/flowrite/files/documentStore.js flowrite-marktext/src/main/dataCenter/index.js flowrite-marktext/src/main/flowrite/files/sidecarPaths.js flowrite-marktext/test/unit/specs/flowrite-storage.spec.js flowrite-marktext/test/unit/specs/flowrite-controller.spec.js
git commit -m "recover flowrite sidecars by document id on bootstrap"
```

### Task 5: Keep Identity Atomic During Save, Rename, And Move

**Files:**
- Modify: `flowrite-marktext/src/main/filesystem/markdown.js`
- Modify: `flowrite-marktext/src/main/flowrite/files/documentStore.js`
- Modify: `flowrite-marktext/src/main/menu/actions/file.js`
- Test: `flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`

- [x] **Step 1: Write failing tests for atomic save and in-app rename**

```js
it('writes matching markdown comment, document.json documentId, and index entry in one save', async function () {
  configureDocumentIndex({ rootPath: tempRoot })
  const pathname = path.join(tempRoot, 'atomic-identity.md')

  await writeMarkdownFile(pathname, '# Draft\n', markdownOptions, {
    flowrite: {
      document: {
        documentId: 'doc-123'
      }
    }
  })

  const markdown = await fs.readFile(pathname, 'utf8')
  const record = await loadDocumentRecord(pathname)
  const entry = await findDocumentIndexEntry('doc-123')

  expect(markdown.startsWith('<!-- flowrite:id=doc-123 -->')).to.equal(true)
  expect(record.documentId).to.equal('doc-123')
  expect(entry.pathname).to.equal(pathname)
})

it('updates the document index when the file is renamed in-app', async function () {
  configureDocumentIndex({ rootPath: tempRoot })
  const oldPath = path.join(tempRoot, 'draft.md')
  const newPath = path.join(tempRoot, 'renamed.md')

  await saveDocumentRecord(oldPath, { documentId: 'doc-123', lastKnownMarkdownPath: oldPath })
  await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])
  await rememberDocumentIndexEntry({
    documentId: 'doc-123',
    pathname: oldPath,
    documentDir: getSidecarPaths(oldPath).documentDir
  })

  await moveDocumentWithSidecars(oldPath, newPath)

  const entry = await findDocumentIndexEntry('doc-123')
  expect(entry.pathname).to.equal(newPath)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js --grep "document index|atomic identity"`
Expected: FAIL because save and move flows do not keep the index synchronized

- [x] **Step 3: Update save and move flows to keep identity synchronized**

```js
// src/main/filesystem/markdown.js
if (document !== undefined) {
  const currentDocumentRecord = await loadDocumentRecord(resolvedPath)
  const nextDocument = {
    ...currentDocumentRecord,
    ...document,
    lastKnownMarkdownPath: resolvedPath
  }
  await saveDocumentRecord(resolvedPath, nextDocument)
  await rememberDocumentIndexEntry({
    documentId: nextDocument.documentId,
    pathname: resolvedPath,
    documentDir: getSidecarPaths(resolvedPath).documentDir
  })
}
```

```js
// src/main/flowrite/files/documentStore.js
export const moveDocumentWithSidecars = async (oldPathname, newPathname) => {
  // existing move logic
  const record = await loadDocumentRecord(newPathname)
  if (record.documentId) {
    await saveDocumentRecord(newPathname, {
      ...record,
      lastKnownMarkdownPath: newPathname
    })
    await rememberDocumentIndexEntry({
      documentId: record.documentId,
      pathname: newPathname,
      documentDir: getSidecarPaths(newPathname).documentDir
    })
  }
}
```

- [x] **Step 4: Run the full storage suite**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-storage.spec.js`
Expected: PASS with all existing storage tests plus the new identity tests green

- [x] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/main/filesystem/markdown.js flowrite-marktext/src/main/flowrite/files/documentStore.js flowrite-marktext/src/main/menu/actions/file.js flowrite-marktext/test/unit/specs/flowrite-storage.spec.js
git commit -m "keep flowrite document identity synchronized on save and move"
```

### Task 6: Run End-To-End Verification And Document The Rollout

**Files:**
- Modify: `flowrite-marktext/test/unit/specs/flowrite-controller.spec.js`
- Modify: `flowrite-marktext/test/unit/specs/flowrite-ai-runtime.spec.js`
- Modify: `flowrite-marktext/docs/superpowers/plans/2026-04-16-flowrite-document-id.md`

- [x] **Step 1: Add one controller-level bootstrap assertion and one runtime-level persistence assertion**

```js
it('returns documentId in bootstrap payload after first Flowrite bootstrap', async function () {
  const payload = await dataCenter.bootstrapFlowriteDocument(pathname)
  expect(payload.document.documentId).to.match(/^[0-9a-f-]{36}$/)
})

it('preserves documentId when runtime history is persisted', async function () {
  const documentRecord = await loadDocumentRecord(documentPath)
  expect(documentRecord.documentId).to.equal('doc-123')
})
```

- [x] **Step 2: Run the final targeted verification set**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && ./node_modules/.bin/eslint src/main/flowrite/files/documentIdentity.js src/main/flowrite/files/documentIndex.js src/main/flowrite/files/documentStore.js src/main/filesystem/markdown.js src/renderer/store/help.js src/renderer/store/editor.js src/main/dataCenter/index.js test/unit/specs/flowrite-document-identity.spec.js test/unit/specs/flowrite-storage.spec.js test/unit/specs/flowrite-controller.spec.js test/unit/specs/flowrite-ai-runtime.spec.js`
Expected: EXIT 0

- [x] **Step 3: Run the final unit verification set**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && NODE_PATH=src BABEL_ENV=test NODE_ENV=test ./node_modules/.bin/mocha --require @babel/register test/unit/specs/flowrite-document-identity.spec.js test/unit/specs/flowrite-storage.spec.js test/unit/specs/flowrite-controller.spec.js test/unit/specs/flowrite-ai-runtime.spec.js`
Expected: PASS with all targeted identity/storage/controller/runtime tests green

- [x] **Step 4: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/test/unit/specs/flowrite-controller.spec.js flowrite-marktext/test/unit/specs/flowrite-ai-runtime.spec.js docs/superpowers/plans/2026-04-16-flowrite-document-id.md
git commit -m "verify flowrite document identity rollout"
```

## Self-Review

- Spec coverage: This plan covers metadata carrier choice, markdown strip/re-inject behavior, sidecar schema changes, recovery index, bootstrap resolution, move/save synchronization, and verification.
- Placeholder scan: No `TODO`, `TBD`, or “implement later” markers remain in task steps.
- Type consistency: The plan consistently uses `documentId`, `flowriteDocumentId`, `rememberDocumentIndexEntry()`, and `ensureDocumentIdentityForPath()` across tasks.

