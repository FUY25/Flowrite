import {
  JOB_TYPE_BOOTSTRAP,
  JOB_TYPE_THREAD_REPLY,
  JOB_TYPE_AI_REVIEW,
  JOB_TYPE_REQUEST_SUGGESTION
} from '../../../flowrite/constants'

export const FLOWRITE_TOOLS = [
  {
    name: 'create_comment',
    description: 'Create a global or margin comment for the writer. Use comments first before proposing rewrites.',
    input_schema: {
      type: 'object',
      properties: {
        threadId: { type: 'string' },
        scope: {
          type: 'string',
          enum: ['global', 'margin']
        },
        body: { type: 'string' },
        anchor: { type: 'object' }
      },
      required: ['scope', 'body']
    }
  },
  {
    name: 'propose_suggestion',
    description: 'Propose rewrite text only after the writer explicitly asks for help rewriting.',
    input_schema: {
      type: 'object',
      properties: {
        threadId: { type: 'string' },
        targetText: { type: 'string' },
        suggestedText: { type: 'string' },
        rationale: { type: 'string' },
        anchor: { type: 'object' }
      },
      required: ['targetText', 'suggestedText']
    }
  }
]

const TOOL_SETS = {
  [JOB_TYPE_BOOTSTRAP]: ['create_comment'],
  [JOB_TYPE_THREAD_REPLY]: ['create_comment'],
  [JOB_TYPE_AI_REVIEW]: ['create_comment'],
  [JOB_TYPE_REQUEST_SUGGESTION]: ['propose_suggestion']
}

export const getFlowriteTools = (jobType = JOB_TYPE_THREAD_REPLY) => {
  const enabledTools = TOOL_SETS[jobType] || TOOL_SETS[JOB_TYPE_THREAD_REPLY]
  return FLOWRITE_TOOLS
    .filter(tool => enabledTools.includes(tool.name))
    .map(tool => ({ ...tool }))
}
