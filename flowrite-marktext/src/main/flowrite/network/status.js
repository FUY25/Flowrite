const OFFLINE_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH'
])

export const isOfflineError = error => {
  return Boolean(error && OFFLINE_ERROR_CODES.has(error.code))
}

export const normalizeFlowriteNetworkError = error => {
  if (isOfflineError(error)) {
    const offlineError = new Error('AI unavailable. Check your connection or API key.')
    offlineError.code = 'AI_UNAVAILABLE'
    return offlineError
  }

  return error
}

export const getOnlineStatus = ({ net } = {}) => {
  if (net && typeof net.isOnline === 'function') {
    return {
      online: !!net.isOnline()
    }
  }

  return {
    online: true
  }
}
