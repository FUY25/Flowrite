/* eslint-env mocha */
import fs from 'fs/promises'
import path from 'path'
import { expect } from 'chai'
import { createAnthropicClient } from '../../src/main/flowrite/ai/anthropicClient.js'
import { buildRuntimeRequest } from '../../src/main/flowrite/ai/promptBuilder.js'

const describeIfEnabled = process.env.AI_GATEWAY_API_KEY ? describe : describe.skip

const collectResponseShape = response => {
  const content = response.content || []

  return {
    text: content
      .filter(block => block && block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim(),
    toolUses: content.filter(block => block && block.type === 'tool_use')
  }
}

const expectCommentFirstOutcome = response => {
  const { text, toolUses } = collectResponseShape(response)
  const toolNames = toolUses.map(block => block.name)

  const hasTextComment = text.length > 0
  const hasStructuredComment = toolNames.length > 0 && toolNames.every(name => name === 'create_comment')

  expect(hasTextComment || hasStructuredComment).to.equal(true)
  expect(toolNames).to.not.include('propose_suggestion')

  return {
    text,
    toolNames
  }
}

describeIfEnabled('Flowrite smoke evals', function () {
  this.timeout(30000)

  it('returns comment-first feedback for a reflective draft fixture', async function () {
    const fixturePath = path.join(__dirname, 'fixtures', 'reflection-draft.md')
    const markdown = await fs.readFile(fixturePath, 'utf8')
    const { client, model } = createAnthropicClient()

    const response = await client.messages.create(buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: fixturePath,
      markdown,
      prompt: 'Leave one short comment-first response about what feels unclear. Do not rewrite the draft.',
      conversationHistory: [],
      model,
      maxTokens: 256
    }))

    const { text, toolNames } = expectCommentFirstOutcome(response)
    if (text) {
      expect(text.toLowerCase()).to.not.include('rewritten version')
    }
    expect(toolNames).to.not.include('propose_suggestion')
  })

  it('can emit the Flowrite create_comment tool shape through the gateway', async function () {
    const fixturePath = path.join(__dirname, 'fixtures', 'reflection-draft.md')
    const markdown = await fs.readFile(fixturePath, 'utf8')
    const { client, model } = createAnthropicClient()

    const response = await client.messages.create(buildRuntimeRequest({
      jobType: 'thread_reply',
      documentPath: fixturePath,
      markdown,
      prompt: 'Use the create_comment tool once with a short global comment about the draft.',
      conversationHistory: [],
      model,
      maxTokens: 256
    }))

    const toolUse = (response.content || []).find(block => block && block.type === 'tool_use')
    expect(toolUse).to.not.equal(undefined)
    expect(toolUse.name).to.equal('create_comment')
  })

  it('sends materially different review persona instructions for friendly, critical, and improvement review modes', async function () {
    const fixturePath = path.join(__dirname, 'fixtures', 'reflection-draft.md')
    const markdown = await fs.readFile(fixturePath, 'utf8')
    const { client, model } = createAnthropicClient()

    const friendlyRequest = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: fixturePath,
      markdown,
      prompt: 'Review this draft with one short comment-first response.',
      reviewPersona: 'friendly',
      conversationHistory: [],
      model,
      maxTokens: 256
    })

    const criticalRequest = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: fixturePath,
      markdown,
      prompt: 'Review this draft with one short comment-first response.',
      reviewPersona: 'critical',
      conversationHistory: [],
      model,
      maxTokens: 256
    })

    const improvementRequest = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: fixturePath,
      markdown,
      prompt: 'Review this draft with one short comment-first response.',
      reviewPersona: 'improvement',
      conversationHistory: [],
      model,
      maxTokens: 256
    })

    expect(friendlyRequest.system[1].text).to.not.equal(criticalRequest.system[1].text)
    expect(criticalRequest.system[1].text).to.not.equal(improvementRequest.system[1].text)
    expect(friendlyRequest.system[1].text).to.not.equal(improvementRequest.system[1].text)

    const [friendlyResponse, criticalResponse, improvementResponse] = await Promise.all([
      client.messages.create(friendlyRequest),
      client.messages.create(criticalRequest),
      client.messages.create(improvementRequest)
    ])

    const friendlyOutcome = expectCommentFirstOutcome(friendlyResponse)
    const criticalOutcome = expectCommentFirstOutcome(criticalResponse)
    const improvementOutcome = expectCommentFirstOutcome(improvementResponse)

    expect(
      friendlyOutcome.text.length > 0 || friendlyOutcome.toolNames.length > 0
    ).to.equal(true)
    expect(
      criticalOutcome.text.length > 0 || criticalOutcome.toolNames.length > 0
    ).to.equal(true)
    expect(
      improvementOutcome.text.length > 0 || improvementOutcome.toolNames.length > 0
    ).to.equal(true)
  })
})
