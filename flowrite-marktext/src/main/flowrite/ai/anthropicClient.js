import Anthropic from '@anthropic-ai/sdk'
import {
  UNDICI_WEB_APIS,
  ensureNodeWebAPIs,
  resolveNodeFetch
} from './webApiPolyfills'

export const DEFAULT_FLOWRITE_MODEL = process.env.FLOWRITE_MODEL || 'anthropic/claude-sonnet-4.6'
export const DEFAULT_FLOWRITE_AI_BASE_URL = process.env.FLOWRITE_AI_BASE_URL || 'https://ai-gateway.vercel.sh'

export const ensureAnthropicWebAPIs = (target = globalThis, webApis = UNDICI_WEB_APIS) => {
  return ensureNodeWebAPIs(target, webApis)
}

export const resolveAnthropicFetch = (target = globalThis, webApis = UNDICI_WEB_APIS) => {
  return resolveNodeFetch(target, webApis)
}

export const getAnthropicClientConfig = (overrides = {}) => {
  const {
    apiKey = process.env.AI_GATEWAY_API_KEY || '',
    model = DEFAULT_FLOWRITE_MODEL,
    baseURL = DEFAULT_FLOWRITE_AI_BASE_URL,
    defaultHeaders = {}
  } = overrides

  return {
    apiKey,
    model,
    baseURL,
    defaultHeaders: {
      'x-flowrite-runtime': 'marktext',
      ...defaultHeaders
    }
  }
}

export const createAnthropicClient = overrides => {
  const config = getAnthropicClientConfig(overrides)

  return {
    client: new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      fetch: resolveAnthropicFetch(globalThis)
    }),
    model: config.model,
    config
  }
}
