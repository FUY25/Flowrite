import log from 'electron-log'
import {
  createAnthropicClient,
  DEFAULT_FLOWRITE_AI_BASE_URL,
  DEFAULT_FLOWRITE_MODEL,
  resolveDefaultAnthropicApiKey
} from '../ai/anthropicClient'
import {
  getOnlineStatus as resolveOnlineStatus,
  normalizeFlowriteNetworkError
} from '../network/status'
import {
  FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  FLOWRITE_COLLABORATION_MODE_COWRITING
} from '../../../flowrite/constants'

const DEFAULT_FLOWRITE_SETTINGS = Object.freeze({
  enabled: true,
  baseURL: DEFAULT_FLOWRITE_AI_BASE_URL,
  model: DEFAULT_FLOWRITE_MODEL,
  collaborationMode: FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  encryptedApiKey: '',
  hasCompletedFirstRun: false
})

const VALID_FLOWRITE_COLLABORATION_MODES = new Set([
  FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  FLOWRITE_COLLABORATION_MODE_COWRITING
])

const normalizeCollaborationMode = collaborationMode => {
  return VALID_FLOWRITE_COLLABORATION_MODES.has(collaborationMode)
    ? collaborationMode
    : FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY
}

const normalizeFlowriteSettings = settings => {
  const nextSettings = settings && typeof settings === 'object'
    ? settings
    : {}

  return {
    ...DEFAULT_FLOWRITE_SETTINGS,
    ...nextSettings,
    collaborationMode: normalizeCollaborationMode(nextSettings.collaborationMode)
  }
}

const createDefaultValidator = async runtimeConfig => {
  const { client, model } = createAnthropicClient(runtimeConfig)
  await client.messages.create({
    model,
    max_tokens: 1,
    messages: [{
      role: 'user',
      content: [{
        type: 'text',
        text: 'Reply with OK.'
      }]
    }]
  })
  return { ok: true }
}

const toOnlineState = value => {
  if (typeof value === 'boolean') {
    return {
      online: value
    }
  }

  if (value && typeof value.online === 'boolean') {
    return value
  }

  return {
    online: true
  }
}

const isSecureStorageUnavailableError = error => {
  return Boolean(error && error.code === 'FLOWRITE_SECURE_STORAGE_UNAVAILABLE')
}

export class FlowriteSettings {
  constructor ({
    store,
    safeStorage,
    validator = createDefaultValidator,
    getOnlineStatus = resolveOnlineStatus,
    logger = log
  } = {}) {
    this.store = store
    this.safeStorage = safeStorage
    this.validator = validator
    this.getOnlineStatus = getOnlineStatus
    this.logger = logger
  }

  getStoredSettings () {
    const storedSettings = this.store && typeof this.store.get === 'function'
      ? this.store.get('flowrite')
      : {}

    return normalizeFlowriteSettings(storedSettings)
  }

  persistSettings (settings) {
    const normalizedSettings = normalizeFlowriteSettings(settings)

    if (!this.store || typeof this.store.set !== 'function') {
      return normalizedSettings
    }

    this.store.set('flowrite', normalizedSettings)
    return normalizedSettings
  }

  encryptApiKey (apiKey) {
    if (!apiKey) {
      return ''
    }

    if (!this.safeStorage || typeof this.safeStorage.isEncryptionAvailable !== 'function' || !this.safeStorage.isEncryptionAvailable()) {
      const error = new Error('Secure storage is unavailable.')
      error.code = 'FLOWRITE_SECURE_STORAGE_UNAVAILABLE'
      throw error
    }

    return this.safeStorage.encryptString(apiKey).toString('base64')
  }

  decryptApiKey (encryptedApiKey) {
    if (!encryptedApiKey) {
      return ''
    }

    if (!this.safeStorage || typeof this.safeStorage.isEncryptionAvailable !== 'function' || !this.safeStorage.isEncryptionAvailable()) {
      return ''
    }

    try {
      return this.safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'))
    } catch (error) {
      this.logger.error('Failed to decrypt Flowrite API key:', error)
      return ''
    }
  }

  resolveApiKey ({ settings = this.getStoredSettings(), overrides = {} } = {}) {
    if (typeof overrides.apiKey === 'string') {
      return overrides.apiKey
    }

    return this.decryptApiKey(settings.encryptedApiKey) || resolveDefaultAnthropicApiKey()
  }

  getRuntimeConfig (overrides = {}) {
    const settings = this.getStoredSettings()

    return {
      apiKey: this.resolveApiKey({ settings, overrides }),
      baseURL: typeof overrides.baseURL === 'string' && overrides.baseURL ? overrides.baseURL : settings.baseURL,
      model: typeof overrides.model === 'string' && overrides.model ? overrides.model : settings.model
    }
  }

  getPublicState ({ settings = this.getStoredSettings(), online } = {}) {
    const normalizedSettings = normalizeFlowriteSettings(settings)
    const configured = Boolean(this.resolveApiKey({ settings: normalizedSettings }))
    const networkState = typeof online === 'boolean'
      ? { online }
      : toOnlineState(this.getOnlineStatus())
    const requestedEnabled = normalizedSettings.enabled !== false

    let status = 'ready'
    let reason = null

    if (!requestedEnabled) {
      status = 'disabled'
      reason = 'disabled'
    } else if (!configured) {
      status = 'disabled'
      reason = 'unconfigured'
    } else if (!networkState.online) {
      status = 'disabled'
      reason = 'offline'
    }

    return {
      enabled: requestedEnabled && configured && networkState.online,
      configured,
      online: networkState.online,
      firstRun: !normalizedSettings.hasCompletedFirstRun && !configured,
      status,
      reason,
      baseURL: normalizedSettings.baseURL,
      model: normalizedSettings.model,
      collaborationMode: normalizedSettings.collaborationMode
    }
  }

  getSecureStorageUnavailableState (settings = this.getStoredSettings()) {
    return {
      ...this.getPublicState({
        settings: {
          ...settings,
          encryptedApiKey: ''
        }
      }),
      enabled: false,
      status: 'disabled',
      reason: 'secure_storage_unavailable'
    }
  }

  async updateSettings (updates = {}) {
    const current = this.getStoredSettings()
    const next = {
      ...current
    }

    if (typeof updates.enabled === 'boolean') {
      next.enabled = updates.enabled
    }

    if (typeof updates.baseURL === 'string' && updates.baseURL) {
      next.baseURL = updates.baseURL
    }

    if (typeof updates.model === 'string' && updates.model) {
      next.model = updates.model
    }

    if (
      typeof updates.collaborationMode === 'string' &&
      VALID_FLOWRITE_COLLABORATION_MODES.has(updates.collaborationMode)
    ) {
      next.collaborationMode = updates.collaborationMode
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'apiKey')) {
      if (updates.apiKey) {
        try {
          next.encryptedApiKey = this.encryptApiKey(updates.apiKey)
        } catch (error) {
          if (isSecureStorageUnavailableError(error)) {
            next.encryptedApiKey = ''
            next.hasCompletedFirstRun = true
            this.persistSettings(next)
            return this.getSecureStorageUnavailableState(next)
          }
          throw error
        }
      } else {
        next.encryptedApiKey = ''
      }
    }

    next.hasCompletedFirstRun = true
    this.persistSettings(next)

    return this.getPublicState({ settings: next })
  }

  async testApiKey (candidateSettings = {}) {
    const runtimeConfig = this.getRuntimeConfig(candidateSettings)
    let encryptedApiKey = ''

    if (runtimeConfig.apiKey) {
      try {
        encryptedApiKey = this.encryptApiKey(runtimeConfig.apiKey)
      } catch (error) {
        if (isSecureStorageUnavailableError(error)) {
          return {
            valid: false,
            error: {
              code: error.code,
              message: error.message
            },
            flowrite: this.getSecureStorageUnavailableState({
              ...this.getStoredSettings(),
              ...candidateSettings,
              hasCompletedFirstRun: true,
              encryptedApiKey: ''
            })
          }
        }
        throw error
      }
    }

    const settings = {
      ...this.getStoredSettings(),
      ...candidateSettings,
      hasCompletedFirstRun: true,
      encryptedApiKey
    }

    if (!runtimeConfig.apiKey) {
      return {
        valid: false,
        error: {
          code: 'FLOWRITE_API_KEY_MISSING',
          message: 'Claude API key is required.'
        },
        flowrite: this.getPublicState({ settings })
      }
    }

    try {
      await this.validator(runtimeConfig)
      return {
        valid: true,
        flowrite: this.getPublicState({ settings, online: true })
      }
    } catch (error) {
      const normalizedError = normalizeFlowriteNetworkError(error)
      return {
        valid: false,
        error: {
          code: normalizedError.code || 'FLOWRITE_API_KEY_INVALID',
          message: normalizedError.message || 'Flowrite API key validation failed.'
        },
        flowrite: this.getPublicState({
          settings,
          online: normalizedError.code === 'AI_UNAVAILABLE' ? false : undefined
        })
      }
    }
  }
}

export default FlowriteSettings
