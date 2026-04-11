import {
  FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  FLOWRITE_COLLABORATION_MODE_COWRITING,
  FLOWRITE_THREAD_MODE_COMMENTING,
  FLOWRITE_THREAD_MODE_COWRITING
} from '../../../flowrite/constants.js'

const ACTION_SEEKING_PATTERNS = [
  /\brewrite(?:\s+(?:this|it|that|the|my))?\b/i,
  /\brephrase(?:\s+(?:this|it|that|the|my))?\b/i,
  /\banother wording(?:\s+for)?\s+(?:this|it|that|the|my)\b/i,
  /\bphrase\s+(?:this|it|that)\b/i,
  /\bwrite\s+(?:this|it|that)\s+out\b/i,
  /\bword\s+(?:this|it|that)\s+(?:better|differently)\b/i,
  /\bhelp me say\s+(?:this|it|that)\b/i,
  /\bcan you say\s+(?:this|it|that)\s+(?:better|differently)\b/i,
  /\bpolish\s+(?:this|it|that)\b/i,
  /\bdraft\s+(?:this|it|that|a response|a reply|an email)\b/i
]

export const isActionSeekingMessage = latestUserMessage => {
  if (typeof latestUserMessage !== 'string') {
    return false
  }

  const normalizedMessage = latestUserMessage.trim()
  if (!normalizedMessage) {
    return false
  }

  return ACTION_SEEKING_PATTERNS.some(pattern => pattern.test(normalizedMessage))
}

export const resolveNextThreadMode = ({
  collaborationMode = FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  currentThreadMode = FLOWRITE_THREAD_MODE_COMMENTING,
  latestUserMessage = ''
} = {}) => {
  if (collaborationMode === FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY) {
    return FLOWRITE_THREAD_MODE_COMMENTING
  }

  if (currentThreadMode === FLOWRITE_THREAD_MODE_COWRITING) {
    return FLOWRITE_THREAD_MODE_COWRITING
  }

  if (
    collaborationMode === FLOWRITE_COLLABORATION_MODE_COWRITING &&
    isActionSeekingMessage(latestUserMessage)
  ) {
    return FLOWRITE_THREAD_MODE_COWRITING
  }

  return FLOWRITE_THREAD_MODE_COMMENTING
}
