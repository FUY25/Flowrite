import { getSidecarPaths } from './sidecarPaths'
import { loadJsonSidecar, writeJsonSidecar } from './documentStore'
import { TERMINAL_SUGGESTION_STATUSES } from '../../../flowrite/constants'

const MAX_TERMINAL_SUGGESTIONS = 50
const TERMINAL_SUGGESTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const validateSuggestions = suggestions => {
  if (!Array.isArray(suggestions)) {
    throw new Error('Flowrite suggestions sidecar must be a JSON array.')
  }
  return suggestions
}

const compactSuggestions = suggestions => {
  const now = Date.now()
  const active = []
  const terminal = []

  for (const entry of suggestions) {
    if (TERMINAL_SUGGESTION_STATUSES.has(entry.status)) {
      terminal.push(entry)
    } else {
      active.push(entry)
    }
  }

  const prunedTerminal = terminal.filter(entry => {
    const timestamp = entry.acceptedAt || entry.rejectedAt
    if (!timestamp) {
      return true
    }
    return (now - new Date(timestamp).getTime()) < TERMINAL_SUGGESTION_MAX_AGE_MS
  })

  const trimmedTerminal = prunedTerminal.length > MAX_TERMINAL_SUGGESTIONS
    ? prunedTerminal.slice(prunedTerminal.length - MAX_TERMINAL_SUGGESTIONS)
    : prunedTerminal

  return [...active, ...trimmedTerminal]
}

export const loadSuggestions = async pathname => {
  const { suggestionsFile } = getSidecarPaths(pathname)
  const suggestions = await loadJsonSidecar(suggestionsFile, [])
  return Array.isArray(suggestions) ? suggestions : []
}

export const saveSuggestions = async (pathname, suggestions) => {
  const { suggestionsFile } = getSidecarPaths(pathname)
  await writeJsonSidecar(suggestionsFile, compactSuggestions(validateSuggestions(suggestions)))
}
