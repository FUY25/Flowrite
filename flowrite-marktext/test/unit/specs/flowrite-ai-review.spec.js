import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { expect } from 'chai'
import { FlowriteController } from '../../../src/main/flowrite/controller'
import { loadComments, FLOWRITE_GLOBAL_THREAD_ID } from '../../../src/main/flowrite/files/commentsStore'

describe('Flowrite AI review', function () {
  let tempRoot

  beforeEach(async function () {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-ai-review-'))
  })

  afterEach(async function () {
    await fs.remove(tempRoot)
  })

  it('streams progress while one review run creates multiple comments without persisting final free text', async function () {
    const pathname = path.join(tempRoot, 'draft.md')
    await fs.writeFile(pathname, '# Draft\n\nA paragraph that needs review.\n', 'utf8')

    const sentEvents = []
    const browserWindow = {
      isDestroyed () {
        return false
      },
      webContents: {
        isDestroyed () {
          return false
        },
        send (channel, payload) {
          sentEvents.push({ channel, payload })
        }
      }
    }

    const controller = new FlowriteController({
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

    let receivedReviewPersona = null
    controller.runtimeManager.runJob = async ({ documentPath, onProgress, payload }) => {
      receivedReviewPersona = payload.reviewPersona

      const firstResult = await controller.executeToolCall({
        name: 'create_comment',
        input: {
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          scope: 'global',
          body: 'First review comment.'
        },
        documentPath
      })
      await onProgress({
        eventType: 'tool_result',
        requestId: 'review-request-1',
        payload: {
          name: 'create_comment',
          result: firstResult
        }
      })

      const secondResult = await controller.executeToolCall({
        name: 'create_comment',
        input: {
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          scope: 'global',
          body: 'Second review comment.'
        },
        documentPath
      })
      await onProgress({
        eventType: 'tool_result',
        requestId: 'review-request-1',
        payload: {
          name: 'create_comment',
          result: secondResult
        }
      })

      return {
        requestId: 'review-request-1',
        finalText: 'Review complete.'
      }
    }

    try {
      const result = await controller.runAiReview({
        browserWindow,
        pathname,
        markdown: '# Draft\n\nA paragraph that needs review.\n',
        reviewPersona: 'improvement'
      })

      expect(result.finalText).to.equal('Review complete.')

      const comments = await loadComments(pathname)
      const globalThread = comments.find(thread => thread.id === FLOWRITE_GLOBAL_THREAD_ID)
      expect(globalThread.comments.map(comment => comment.body)).to.deep.equal([
        'First review comment.',
        'Second review comment.'
      ])

      const progressMessages = sentEvents
        .filter(event => event.channel === 'mt::flowrite:runtime-progress')
        .map(event => event.payload)
      expect(progressMessages.some(payload => payload.phase === 'ai_review' && payload.status === 'running')).to.equal(true)
      expect(progressMessages.some(payload => payload.message === 'Flowrite added 1 review comment...')).to.equal(true)
      expect(progressMessages.some(payload => payload.message === 'Flowrite added 2 review comments...')).to.equal(true)
      expect(progressMessages.some(payload => payload.phase === 'ai_review' && payload.status === 'completed')).to.equal(true)
      expect(globalThread.comments.some(comment => comment.body === 'Review complete.')).to.equal(false)
      expect(receivedReviewPersona).to.equal('improvement')
    } finally {
      await controller.dispose()
    }
  })
})
