// Suggestion lifecycle statuses
export const SUGGESTION_STATUS_PENDING = 'pending'
export const SUGGESTION_STATUS_APPLIED_IN_BUFFER = 'applied_in_buffer'
export const SUGGESTION_STATUS_ACCEPTED = 'accepted'
export const SUGGESTION_STATUS_REJECTED = 'rejected'

export const TERMINAL_SUGGESTION_STATUSES = new Set([
  SUGGESTION_STATUS_ACCEPTED,
  SUGGESTION_STATUS_REJECTED
])

// Comment thread scopes
export const SCOPE_GLOBAL = 'global'
export const SCOPE_MARGIN = 'margin'

// Collaboration modes
export const FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY = 'comment_only'
export const FLOWRITE_COLLABORATION_MODE_COWRITING = 'cowriting'

// Thread modes
export const FLOWRITE_THREAD_MODE_COMMENTING = 'commenting'
export const FLOWRITE_THREAD_MODE_COWRITING = 'cowriting'

// Thread status
export const THREAD_STATUS_OPEN = 'open'
export const THREAD_STATUS_RESOLVED = 'resolved'

// Well-known thread IDs
export const FLOWRITE_GLOBAL_THREAD_ID = 'global-thread'

// Comment authors
export const AUTHOR_USER = 'user'
export const AUTHOR_ASSISTANT = 'assistant'

// Runtime statuses
export const RUNTIME_STATUS_IDLE = 'idle'
export const RUNTIME_STATUS_RUNNING = 'running'
export const RUNTIME_STATUS_COMPLETED = 'completed'
export const RUNTIME_STATUS_FAILED = 'failed'

export const TERMINAL_RUNTIME_STATUSES = new Set([
  RUNTIME_STATUS_COMPLETED,
  RUNTIME_STATUS_FAILED,
  RUNTIME_STATUS_IDLE
])

// Runtime phases
export const PHASE_IDLE = 'idle'
export const PHASE_BOOTSTRAP = 'bootstrap'
export const PHASE_GLOBAL_COMMENT = 'global_comment'
export const PHASE_MARGIN_COMMENT = 'margin_comment'
export const PHASE_AI_REVIEW = 'ai_review'
export const PHASE_SUGGESTION_REQUEST = 'suggestion_request'

// AI job types
export const JOB_TYPE_BOOTSTRAP = 'bootstrap'
export const JOB_TYPE_THREAD_REPLY = 'thread_reply'
export const JOB_TYPE_AI_REVIEW = 'ai_review'
export const JOB_TYPE_REQUEST_SUGGESTION = 'request_suggestion'

// Review personas
export const PERSONA_FRIENDLY = 'friendly'
export const PERSONA_CRITICAL = 'critical'
export const PERSONA_IMPROVEMENT = 'improvement'

// Anchor resolution statuses
export const ANCHOR_ATTACHED = 'attached'
export const ANCHOR_DETACHED = 'detached'
