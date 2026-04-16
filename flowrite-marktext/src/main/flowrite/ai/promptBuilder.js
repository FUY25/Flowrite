import { getFlowriteTools } from './toolRegistry'
import {
  PERSONA_FRIENDLY,
  PERSONA_CRITICAL,
  PERSONA_IMPROVEMENT,
  FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  FLOWRITE_THREAD_MODE_COMMENTING,
  FLOWRITE_THREAD_MODE_COWRITING
} from '../../../flowrite/constants.js'
import { resolveNextThreadMode, isActionSeekingMessage } from './collaborationRouting.js'

export const DEFAULT_HISTORY_TOKEN_BUDGET = 80000

const SYSTEM_PROMPT = [
  'You are Flowrite, an AI writing companion for reflective markdown drafting.',
  'Respond comment-first rather than rewrite-first.',
  'Use create_comment when you want to leave feedback.',
  'Use propose_suggestion only when the writer explicitly asks for rewrite help.',
  'Do not mutate application state directly outside tool calls.'
].join(' ')

export const REVIEW_PERSONA_INSTRUCTIONS = {
  [PERSONA_FRIENDLY]: 'Adopt a warm, encouraging review voice that helps the writer reflect without flattening their intent.',
  [PERSONA_CRITICAL]: 'Adopt a rigorous, direct review voice that clearly identifies weak reasoning, vagueness, and unsupported leaps.',
  [PERSONA_IMPROVEMENT]: 'Adopt a practical revision voice focused on actionable improvements to clarity, structure, and thought.'
}

const buildCollaborationSystemInstruction = ({
  latestUserMessage = '',
  nextThreadMode = FLOWRITE_THREAD_MODE_COMMENTING
} = {}) => {
  if (nextThreadMode === FLOWRITE_THREAD_MODE_COWRITING) {
    const instructions = [
      'Cowriting mode is active for this reply.',
      'You may move from feedback into direct wording help when it serves the request.'
    ]

    if (isActionSeekingMessage(latestUserMessage)) {
      instructions.splice(1, 0, 'The latest user message explicitly asks for drafting or rewrite help.')
    }

    return instructions.join(' ')
  }

  return [
    'Stay in commenting mode for this reply.',
    'Do not escalate into cowriting or draft a rewrite for the writer.',
    'Plain text only for comment bodies.',
    'Strip markdown headings, bold, italics, blockquotes, fenced code blocks, and tables from comment text.',
    'Bulleted and numbered lists are allowed when they keep the comment clear.'
  ].join(' ')
}

const getBlockText = block => {
  if (typeof block === 'string') {
    return block
  }

  if (block && typeof block.text === 'string') {
    return block.text
  }

  if (block && typeof block.content === 'string') {
    return block.content
  }

  return ''
}

const getMessageText = message => {
  if (!message) {
    return ''
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content.map(getBlockText).join('\n')
  }

  return ''
}

export const estimateTokens = history => {
  const text = (history || []).map(getMessageText).join('\n')
  return Math.ceil(text.length / 4)
}

const isToolUseMessage = message => {
  return message &&
    message.role === 'assistant' &&
    Array.isArray(message.content) &&
    message.content.some(block => block && block.type === 'tool_use')
}

const isToolResultMessage = message => {
  return message &&
    message.role === 'user' &&
    Array.isArray(message.content) &&
    message.content.length > 0 &&
    message.content.every(block => block && block.type === 'tool_result')
}

const groupConversationHistory = (conversationHistory = []) => {
  const groups = []

  for (let index = 0; index < conversationHistory.length; index++) {
    const currentMessage = conversationHistory[index]
    const nextMessage = conversationHistory[index + 1]

    if (isToolUseMessage(currentMessage) && isToolResultMessage(nextMessage)) {
      groups.push([currentMessage, nextMessage])
      index += 1
      continue
    }

    groups.push([currentMessage])
  }

  return groups
}

export const trimConversationHistory = (conversationHistory = [], maxTokens = DEFAULT_HISTORY_TOKEN_BUDGET) => {
  const conversationGroups = groupConversationHistory(conversationHistory)
  let trimmedCount = 0
  let historyTokenEstimate = estimateTokens(conversationGroups.flat())

  while (conversationGroups.length > 0 && historyTokenEstimate > maxTokens) {
    const removedGroup = conversationGroups.shift()
    trimmedCount += removedGroup.length
    historyTokenEstimate -= estimateTokens(removedGroup)
  }

  return {
    conversationHistory: conversationGroups.flat(),
    trimmedCount,
    historyTokenEstimate
  }
}

export const buildCurrentTurnUserMessage = ({ markdown, prompt }) => {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `Document (${markdown.length} chars)\n\n${markdown}`,
        cache_control: { type: 'ephemeral' }
      },
      {
        type: 'text',
        text: prompt
      }
    ]
  }
}

export const buildHistoryPromptEntry = prompt => {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: prompt
      }
    ]
  }
}

export const buildRuntimeRequest = ({
  jobType,
  documentPath,
  markdown,
  prompt,
  conversationHistory = [],
  reviewPersona,
  collaborationMode = FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  currentThreadMode = FLOWRITE_THREAD_MODE_COMMENTING,
  latestUserMessage = '',
  threadId = null,
  model,
  maxTokens = 1024
}) => {
  const currentTurn = buildCurrentTurnUserMessage({ markdown, prompt })
  const nextThreadMode = resolveNextThreadMode({
    collaborationMode,
    currentThreadMode,
    latestUserMessage
  })
  const system = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' }
    }
  ]

  if (reviewPersona && REVIEW_PERSONA_INSTRUCTIONS[reviewPersona]) {
    system.push({
      type: 'text',
      text: REVIEW_PERSONA_INSTRUCTIONS[reviewPersona]
    })
  }

  system.push({
    type: 'text',
    text: buildCollaborationSystemInstruction({
      latestUserMessage,
      nextThreadMode
    })
  })

  return {
    model,
    max_tokens: maxTokens,
    metadata: {
      jobType,
      documentPath,
      collaborationMode,
      currentThreadMode,
      nextThreadMode,
      reviewPersona: reviewPersona || null,
      threadId
    },
    system,
    tools: getFlowriteTools(jobType),
    messages: [
      ...conversationHistory,
      currentTurn
    ]
  }
}
