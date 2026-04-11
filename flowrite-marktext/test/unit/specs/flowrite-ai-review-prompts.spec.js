import { expect } from 'chai'
import { FlowriteController } from '../../../src/main/flowrite/controller'
import { buildRuntimeRequest } from '../../../src/main/flowrite/ai/promptBuilder'

describe('Flowrite AI review prompts', function () {
  it('builds an AI review prompt that persists review comments only through comment tools', async function () {
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

    try {
      const prompt = controller.buildAiReviewPrompt('critical', 'Look for emotional contradictions.')

      expect(prompt).to.include('"critical" persona')
      expect(prompt).to.include('Specific review request: Look for emotional contradictions.')
      expect(prompt).to.include('Leave 1 to 3 concise comments')
      expect(prompt).to.include('Use create_comment with scope "global"')
      expect(prompt).to.include('You may also create passage-level comments')
      expect(prompt).to.include('Do not propose rewrites')
      expect(prompt).to.include('Do not write free-text output as the review result')
    } finally {
      await controller.dispose()
    }
  })

  it('adds commenting-mode system instructions for comment-only collaboration', function () {
    const request = buildRuntimeRequest({
      jobType: 'thread_reply',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Please help with this.',
      conversationHistory: [],
      model: 'test-model',
      collaborationMode: 'comment_only',
      currentThreadMode: 'commenting',
      latestUserMessage: 'Can you rewrite this to sound tighter?'
    })

    const systemText = request.system.map(entry => entry.text).join('\n')

    expect(systemText).to.include('Stay in commenting mode for this reply.')
    expect(systemText).to.include('Do not escalate into cowriting or draft a rewrite for the writer.')
    expect(systemText).to.include('Plain text only for comment bodies.')
    expect(systemText).to.include('Strip markdown headings, bold, italics, blockquotes, fenced code blocks, and tables from comment text.')
  })

  it('adds cowriting-mode system instructions when rewrite intent escalates the thread', function () {
    const request = buildRuntimeRequest({
      jobType: 'thread_reply',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Please help with this.',
      conversationHistory: [],
      model: 'test-model',
      collaborationMode: 'cowriting',
      currentThreadMode: 'commenting',
      latestUserMessage: 'Please rephrase this opening and write it out for me.'
    })

    const systemText = request.system.map(entry => entry.text).join('\n')

    expect(systemText).to.include('Cowriting mode is active for this reply.')
    expect(systemText).to.include('The latest user message explicitly asks for drafting or rewrite help.')
    expect(systemText).to.include('You may move from feedback into direct wording help when it serves the request.')
    expect(systemText).to.not.include('Plain text only for comment bodies.')
  })
})
