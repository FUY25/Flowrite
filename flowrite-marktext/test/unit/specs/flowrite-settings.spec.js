import { expect } from 'chai'
import { FlowriteSettings } from '../../../src/main/flowrite/settings/flowriteSettings'
import {
  FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  FLOWRITE_COLLABORATION_MODE_COWRITING
} from '../../../src/flowrite/constants'

class MemoryStore {
  constructor (initial = {}) {
    this.state = { ...initial }
  }

  get (key) {
    return this.state[key]
  }

  set (key, value) {
    this.state[key] = value
    return value
  }
}

const createSafeStorage = () => ({
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(`enc:${value}`, 'utf8'),
  decryptString: value => Buffer.from(value).toString('utf8').replace(/^enc:/, '')
})

describe('Flowrite settings', function () {
  afterEach(function () {
    delete process.env.AI_GATEWAY_API_KEY
  })

  it('persists the API key in encrypted form and excludes it from renderer state', async function () {
    const store = new MemoryStore()
    const settings = new FlowriteSettings({
      store,
      safeStorage: createSafeStorage(),
      getOnlineStatus: () => ({ online: true })
    })

    const flowrite = await settings.updateSettings({
      apiKey: 'flowrite-secret-key'
    })

    expect(store.get('flowrite').encryptedApiKey).to.equal(Buffer.from('enc:flowrite-secret-key', 'utf8').toString('base64'))
    expect(flowrite.configured).to.equal(true)
    expect(flowrite).to.not.have.property('apiKey')
    expect(settings.getRuntimeConfig().apiKey).to.equal('flowrite-secret-key')
  })

  it('validates a candidate API key with the runtime configuration before enabling AI', async function () {
    const calls = []
    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: createSafeStorage(),
      validator: async config => {
        calls.push(config)
        return { ok: true }
      },
      getOnlineStatus: () => ({ online: true })
    })

    const result = await settings.testApiKey({
      apiKey: 'candidate-key',
      model: 'custom-model'
    })

    expect(calls).to.have.length(1)
    expect(calls[0].apiKey).to.equal('candidate-key')
    expect(calls[0].model).to.equal('custom-model')
    expect(result.valid).to.equal(true)
    expect(result.flowrite.enabled).to.equal(true)
    expect(result.flowrite.configured).to.equal(true)
  })

  it('marks Flowrite as offline when API-key validation hits a network-unavailable error', async function () {
    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: createSafeStorage(),
      validator: async () => {
        const error = new Error('network unreachable')
        error.code = 'ENETUNREACH'
        throw error
      },
      getOnlineStatus: () => ({ online: true })
    })

    const result = await settings.testApiKey({
      apiKey: 'candidate-key'
    })

    expect(result.valid).to.equal(false)
    expect(result.error.code).to.equal('AI_UNAVAILABLE')
    expect(result.flowrite.online).to.equal(false)
    expect(result.flowrite.enabled).to.equal(false)
  })

  it('degrades into a disabled Flowrite state when secure storage is unavailable', async function () {
    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: {
        isEncryptionAvailable: () => false
      },
      validator: async () => ({ ok: true }),
      getOnlineStatus: () => ({ online: true })
    })

    const updatedState = await settings.updateSettings({
      apiKey: 'candidate-key'
    })
    const validationResult = await settings.testApiKey({
      apiKey: 'candidate-key'
    })

    expect(updatedState.enabled).to.equal(false)
    expect(updatedState.reason).to.equal('secure_storage_unavailable')
    expect(validationResult.valid).to.equal(false)
    expect(validationResult.error.code).to.equal('FLOWRITE_SECURE_STORAGE_UNAVAILABLE')
    expect(validationResult.flowrite.enabled).to.equal(false)
    expect(validationResult.flowrite.reason).to.equal('secure_storage_unavailable')
  })

  it('returns a disabled fallback state when AI is not configured on first run', function () {
    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: createSafeStorage(),
      getOnlineStatus: () => ({ online: true })
    })

    const flowrite = settings.getPublicState()

    expect(flowrite.enabled).to.equal(false)
    expect(flowrite.configured).to.equal(false)
    expect(flowrite.online).to.equal(true)
    expect(flowrite.firstRun).to.equal(true)
    expect(flowrite.status).to.equal('disabled')
    expect(flowrite.reason).to.equal('unconfigured')
  })

  it('defaults collaboration mode to comment_only and exposes it in public state', function () {
    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: createSafeStorage(),
      getOnlineStatus: () => ({ online: true })
    })

    const flowrite = settings.getPublicState()

    expect(flowrite.collaborationMode).to.equal(FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY)
  })

  it('normalizes stale stored collaboration modes back to comment_only on read and public state', function () {
    const settings = new FlowriteSettings({
      store: new MemoryStore({
        flowrite: {
          collaborationMode: 'legacy-mode'
        }
      }),
      safeStorage: createSafeStorage(),
      getOnlineStatus: () => ({ online: true })
    })

    expect(settings.getStoredSettings().collaborationMode).to.equal(FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY)
    expect(settings.getPublicState().collaborationMode).to.equal(FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY)
  })

  it('accepts only supported collaboration modes when updating settings', async function () {
    const store = new MemoryStore()
    const settings = new FlowriteSettings({
      store,
      safeStorage: createSafeStorage(),
      getOnlineStatus: () => ({ online: true })
    })

    await settings.updateSettings({
      collaborationMode: FLOWRITE_COLLABORATION_MODE_COWRITING
    })

    expect(store.get('flowrite').collaborationMode).to.equal(FLOWRITE_COLLABORATION_MODE_COWRITING)

    await settings.updateSettings({
      collaborationMode: 'invalid-mode'
    })

    expect(store.get('flowrite').collaborationMode).to.equal(FLOWRITE_COLLABORATION_MODE_COWRITING)
  })

  it('normalizes invalid collaboration modes from test candidate settings before returning public state', async function () {
    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: createSafeStorage(),
      validator: async () => ({ ok: true }),
      getOnlineStatus: () => ({ online: true })
    })

    const result = await settings.testApiKey({
      apiKey: 'candidate-key',
      collaborationMode: 'invalid-mode'
    })

    expect(result.valid).to.equal(true)
    expect(result.flowrite.collaborationMode).to.equal(FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY)
  })

  it('treats the environment API key as configured runtime state', function () {
    process.env.AI_GATEWAY_API_KEY = 'env-flowrite-key'

    const settings = new FlowriteSettings({
      store: new MemoryStore(),
      safeStorage: createSafeStorage(),
      getOnlineStatus: () => ({ online: true })
    })

    const runtimeConfig = settings.getRuntimeConfig()
    const flowrite = settings.getPublicState()

    expect(runtimeConfig.apiKey).to.equal('env-flowrite-key')
    expect(flowrite.enabled).to.equal(true)
    expect(flowrite.configured).to.equal(true)
    expect(flowrite.reason).to.equal(null)
  })
})
