import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { expect } from 'chai'
import { FlowriteController } from '../../../src/main/flowrite/controller'
import { saveSuggestions, loadSuggestions } from '../../../src/main/flowrite/files/suggestionsStore'
import { listSnapshots } from '../../../src/main/flowrite/files/snapshotStore'
import { getSidecarPaths } from '../../../src/main/flowrite/files/sidecarPaths'
import {
  SUGGESTION_STATUS_PENDING,
  SUGGESTION_STATUS_APPLIED_IN_BUFFER,
  SUGGESTION_STATUS_ACCEPTED,
  SUGGESTION_STATUS_REJECTED
} from '../../../src/flowrite/constants'

const createController = () => new FlowriteController({
  flowriteSettings: {
    getPublicState () {
      return {
        enabled: true,
        configured: true,
        online: true
      }
    },
    getRuntimeConfig () {
      return {}
    }
  }
})

describe('Flowrite suggestions', function () {
  let tempRoot
  let pathname
  let controller

  beforeEach(async function () {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-suggestions-'))
    pathname = path.join(tempRoot, 'draft.md')
    await fs.writeFile(pathname, '# Draft\n\nA reflective paragraph with a soft cadence.\n', 'utf8')
    controller = createController()
  })

  afterEach(async function () {
    await controller.dispose()
    await fs.remove(tempRoot)
  })

  it('accepts a pending suggestion into the buffer, snapshots once per save cycle, and finalizes after save', async function () {
    await saveSuggestions(pathname, [{
      id: 'suggestion-1',
      threadId: 'thread-1',
      targetText: 'soft cadence',
      suggestedText: 'sharper rhythm',
      rationale: 'Make the image land with more precision.',
      anchor: {
        version: 1,
        quote: 'soft cadence',
        contextBefore: 'with a ',
        contextAfter: '.',
        start: { key: 'paragraph-1', offset: 33 },
        end: { key: 'paragraph-1', offset: 45 }
      },
      status: SUGGESTION_STATUS_PENDING,
      author: 'assistant',
      createdAt: '2026-04-09T12:00:00.000Z'
    }])

    const acceptResult = await controller.acceptSuggestion({
      pathname,
      markdown: '# Draft\n\nA reflective paragraph with a soft cadence.\n',
      suggestionId: 'suggestion-1',
      saveCycleId: 'save-cycle-1'
    })

    expect(acceptResult.replacement.text).to.equal('sharper rhythm')

    const appliedSuggestions = await loadSuggestions(pathname)
    expect(appliedSuggestions[0].status).to.equal(SUGGESTION_STATUS_APPLIED_IN_BUFFER)
    expect(appliedSuggestions[0].bufferAppliedAt).to.be.a('string')

    const withAppliedMarkdown = '# Draft\n\nA reflective paragraph with a sharper rhythm.\n'
    await controller.finalizeAcceptedSuggestionsAfterSave({
      pathname,
      markdown: withAppliedMarkdown
    })

    const finalizedSuggestions = await loadSuggestions(pathname)
    expect(finalizedSuggestions[0].status).to.equal(SUGGESTION_STATUS_ACCEPTED)
    expect(finalizedSuggestions[0].acceptedAt).to.be.a('string')

    await saveSuggestions(pathname, [{
      ...finalizedSuggestions[0],
      id: 'suggestion-2',
      status: SUGGESTION_STATUS_PENDING,
      targetText: 'reflective paragraph',
      suggestedText: 'searching paragraph',
      anchor: {
        ...finalizedSuggestions[0].anchor,
        quote: 'reflective paragraph',
        contextBefore: 'A ',
        contextAfter: ' with',
        start: { key: 'paragraph-1', offset: 2 },
        end: { key: 'paragraph-1', offset: 22 }
      }
    }])

    await controller.acceptSuggestion({
      pathname,
      markdown: withAppliedMarkdown,
      suggestionId: 'suggestion-2',
      saveCycleId: 'save-cycle-1'
    })

    const snapshots = await listSnapshots(pathname)
    expect(snapshots).to.have.length(1)
  })

  it('reconciles interrupted applied-in-buffer suggestions back to pending when the saved markdown never changed', async function () {
    await saveSuggestions(pathname, [{
      id: 'suggestion-recover',
      threadId: 'thread-1',
      targetText: 'soft cadence',
      suggestedText: 'sharper rhythm',
      rationale: 'Make the image land with more precision.',
      anchor: {
        version: 1,
        quote: 'soft cadence',
        contextBefore: 'with a ',
        contextAfter: '.',
        start: { key: 'paragraph-1', offset: 33 },
        end: { key: 'paragraph-1', offset: 45 }
      },
      status: SUGGESTION_STATUS_APPLIED_IN_BUFFER,
      bufferAppliedAt: '2026-04-09T12:00:00.000Z',
      author: 'assistant',
      createdAt: '2026-04-09T12:00:00.000Z'
    }])

    const reconciled = await controller.reconcileSuggestionsWithMarkdown(pathname)

    expect(reconciled[0].status).to.equal(SUGGESTION_STATUS_PENDING)
    expect(reconciled[0].bufferAppliedAt).to.equal(null)
  })

  it('skips rewriting the suggestions sidecar when reconciliation finds no state changes', async function () {
    await saveSuggestions(pathname, [{
      id: 'suggestion-pending',
      threadId: 'thread-1',
      targetText: 'soft cadence',
      suggestedText: 'sharper rhythm',
      rationale: 'No write should happen when nothing changed.',
      anchor: {
        version: 1,
        quote: 'soft cadence',
        contextBefore: 'with a ',
        contextAfter: '.',
        start: { key: 'paragraph-1', offset: 33 },
        end: { key: 'paragraph-1', offset: 45 }
      },
      status: SUGGESTION_STATUS_PENDING,
      author: 'assistant',
      createdAt: '2026-04-09T12:00:00.000Z'
    }])

    const { suggestionsFile } = getSidecarPaths(pathname)
    const beforeStat = await fs.stat(suggestionsFile)
    const beforeContents = await fs.readFile(suggestionsFile, 'utf8')

    const reconciled = await controller.reconcileSuggestionsWithMarkdown(pathname)

    const afterStat = await fs.stat(suggestionsFile)
    const afterContents = await fs.readFile(suggestionsFile, 'utf8')

    expect(reconciled[0].status).to.equal(SUGGESTION_STATUS_PENDING)
    expect(afterStat.mtimeMs).to.equal(beforeStat.mtimeMs)
    expect(afterContents).to.equal(beforeContents)
  })

  it('rejects a suggestion without mutating the markdown buffer', async function () {
    await saveSuggestions(pathname, [{
      id: 'suggestion-reject',
      threadId: 'thread-1',
      targetText: 'soft cadence',
      suggestedText: 'sharper rhythm',
      rationale: 'Make the image land with more precision.',
      anchor: {
        version: 1,
        quote: 'soft cadence',
        contextBefore: 'with a ',
        contextAfter: '.',
        start: { key: 'paragraph-1', offset: 33 },
        end: { key: 'paragraph-1', offset: 45 }
      },
      status: SUGGESTION_STATUS_PENDING,
      author: 'assistant',
      createdAt: '2026-04-09T12:00:00.000Z'
    }])

    await controller.rejectSuggestion({
      pathname,
      suggestionId: 'suggestion-reject'
    })

    const suggestions = await loadSuggestions(pathname)
    expect(suggestions[0].status).to.equal(SUGGESTION_STATUS_REJECTED)
  })

  it('compacts old terminal suggestions while keeping active ones intact', async function () {
    await saveSuggestions(pathname, [
      {
        id: 'pending-suggestion',
        threadId: 'thread-1',
        targetText: 'soft cadence',
        suggestedText: 'sharper rhythm',
        rationale: 'Keep active suggestions visible.',
        anchor: null,
        status: SUGGESTION_STATUS_PENDING,
        author: 'assistant',
        createdAt: '2026-04-09T12:00:00.000Z'
      },
      ...Array.from({ length: 55 }, (_, index) => ({
        id: `terminal-${index}`,
        threadId: 'thread-1',
        targetText: `target ${index}`,
        suggestedText: `rewrite ${index}`,
        rationale: `rationale ${index}`,
        anchor: null,
        status: index % 2 === 0 ? SUGGESTION_STATUS_ACCEPTED : SUGGESTION_STATUS_REJECTED,
        author: 'assistant',
        createdAt: '2026-04-09T12:00:00.000Z',
        acceptedAt: index % 2 === 0
          ? (index === 0 ? '2026-02-01T12:00:00.000Z' : `2026-04-09T13:${String(index).padStart(2, '0')}:00.000Z`)
          : null,
        rejectedAt: index % 2 === 0 ? null : `2026-04-09T13:${String(index).padStart(2, '0')}:00.000Z`
      }))
    ])

    const suggestions = await loadSuggestions(pathname)
    const active = suggestions.filter(entry => entry.status === SUGGESTION_STATUS_PENDING)
    const terminal = suggestions.filter(entry => entry.status !== SUGGESTION_STATUS_PENDING)

    expect(active).to.have.length(1)
    expect(active[0].id).to.equal('pending-suggestion')
    expect(terminal).to.have.length(50)
    expect(terminal.some(entry => entry.id === 'terminal-0')).to.equal(false)
    expect(terminal.some(entry => entry.id === 'terminal-54')).to.equal(true)
  })
})
