/* eslint-env mocha */
import fs from 'fs/promises'
import path from 'path'
import { expect } from 'chai'
import { createAnthropicClient } from '../../src/main/flowrite/ai/anthropicClient.js'
import { buildRuntimeRequest } from '../../src/main/flowrite/ai/promptBuilder.js'

const PERSONA_FIXTURE_NAME = 'reflection-draft.md'
const PERSONA_REVIEW_PROMPT = 'Review this draft with one short comment-first response. Do not rewrite the draft.'
const PERSONA_GATEWAY_REQUIRED_MESSAGE = 'AI_GATEWAY_API_KEY is required for CLN-02 live persona verification.'
const PERSONA_VARIANTS = [
  { key: 'friendly', heading: 'Friendly' },
  { key: 'critical', heading: 'Critical' },
  { key: 'improvement', heading: 'Improvement' }
]

const normalizeWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim()

const collectResponseShape = response => {
  const content = response.content || []
  const toolUses = content.filter(block => block && block.type === 'tool_use')
  const text = normalizeWhitespace(
    content
      .filter(block => block && block.type === 'text')
      .map(block => block.text)
      .join('\n')
  )
  const commentBodies = toolUses
    .filter(block => block.name === 'create_comment')
    .map(block => normalizeWhitespace(block.input && block.input.body))
    .filter(Boolean)

  return {
    text,
    toolUses,
    commentBodies
  }
}

const expectCommentFirstOutcome = response => {
  const { text, toolUses, commentBodies } = collectResponseShape(response)
  const toolNames = toolUses.map(block => block.name)
  const sampleOutput = [...commentBodies, text].filter(Boolean).join('\n\n')
  const normalizedOutput = normalizeWhitespace(sampleOutput)

  const hasTextComment = text.length > 0
  const hasStructuredComment = commentBodies.length > 0 &&
    toolNames.length > 0 &&
    toolNames.every(name => name === 'create_comment')

  expect(hasTextComment || hasStructuredComment).to.equal(true)
  expect(toolNames).to.not.include('propose_suggestion')

  return {
    text,
    toolNames,
    commentBodies,
    sampleOutput,
    normalizedOutput
  }
}

const buildPersonaEvalReport = ({ fixtureName, runDate, model, personaOutputs }) => {
  const lines = [
    '# Phase 3 Persona Eval',
    '',
    `- Fixture: \`${fixtureName}\``,
    `- Run date: \`${runDate}\``,
    `- Model: \`${model}\``,
    '',
    '## Persona Outputs',
    ''
  ]

  for (const personaOutput of personaOutputs) {
    lines.push(`### ${personaOutput.heading}`)
    lines.push('')
    lines.push(`- Tool names: ${personaOutput.toolNames.length ? `\`${personaOutput.toolNames.join('`, `')}\`` : 'text response only'}`)
    lines.push('')
    lines.push('```text')
    lines.push(personaOutput.sampleOutput || '(no sample output captured)')
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

const getPersonaEvalReportPath = () => path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.planning',
  'phases',
  '03-cleanup-verification',
  '03-persona-eval.md'
)

const writePersonaEvalReport = async ({ fixtureName, runDate, model, personaOutputs }) => {
  const reportPath = getPersonaEvalReportPath()

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(
    reportPath,
    buildPersonaEvalReport({ fixtureName, runDate, model, personaOutputs }),
    'utf8'
  )

  return reportPath
}

const buildPersonaReviewRequest = ({ fixturePath, markdown, model, reviewPersona }) => buildRuntimeRequest({
  jobType: 'ai_review',
  documentPath: fixturePath,
  markdown,
  prompt: PERSONA_REVIEW_PROMPT,
  reviewPersona,
  conversationHistory: [],
  model,
  maxTokens: 256
})

const skipWithoutGatewayApiKey = context => {
  if (!process.env.AI_GATEWAY_API_KEY) {
    context.skip()
  }
}

const requireGatewayApiKey = () => {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(PERSONA_GATEWAY_REQUIRED_MESSAGE)
  }
}

describe('Flowrite smoke evals', function () {
  this.timeout(60000)

  it('returns comment-first feedback for a reflective draft fixture', async function () {
    skipWithoutGatewayApiKey(this)

    const fixturePath = path.join(__dirname, 'fixtures', PERSONA_FIXTURE_NAME)
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
    skipWithoutGatewayApiKey(this)

    const fixturePath = path.join(__dirname, 'fixtures', PERSONA_FIXTURE_NAME)
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

  it('captures materially different friendly, critical, and improvement outputs for the same reflective draft fixture', async function () {
    requireGatewayApiKey()

    const fixturePath = path.join(__dirname, 'fixtures', PERSONA_FIXTURE_NAME)
    const markdown = await fs.readFile(fixturePath, 'utf8')
    const { client, model } = createAnthropicClient()
    const personaOutputs = []

    for (const persona of PERSONA_VARIANTS) {
      const response = await client.messages.create(buildPersonaReviewRequest({
        fixturePath,
        markdown,
        model,
        reviewPersona: persona.key
      }))

      personaOutputs.push({
        ...persona,
        ...expectCommentFirstOutcome(response)
      })
    }

    await writePersonaEvalReport({
      fixtureName: PERSONA_FIXTURE_NAME,
      runDate: new Date().toISOString(),
      model,
      personaOutputs
    })

    const normalizedOutputs = personaOutputs.map(persona => persona.normalizedOutput)
    expect(new Set(normalizedOutputs).size).to.equal(3)

    expect(personaOutputs[0].normalizedOutput).to.not.equal(personaOutputs[1].normalizedOutput)
    expect(personaOutputs[0].normalizedOutput).to.not.equal(personaOutputs[2].normalizedOutput)
    expect(personaOutputs[1].normalizedOutput).to.not.equal(personaOutputs[2].normalizedOutput)
  })
})
