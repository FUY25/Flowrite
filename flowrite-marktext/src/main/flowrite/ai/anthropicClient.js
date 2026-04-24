import Anthropic from '@anthropic-ai/sdk'
import {
  File as UndiciFile,
  FormData as UndiciFormData,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
  fetch as undiciFetch
} from 'undici'
import {
  FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL,
  FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
} from '../../../flowrite/constants'

export const DEFAULT_FLOWRITE_MODEL = process.env.FLOWRITE_MODEL || FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
export const DEFAULT_FLOWRITE_AI_BASE_URL = process.env.FLOWRITE_AI_BASE_URL || FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL

const UNDICI_WEB_APIS = {
  fetch: undiciFetch,
  Headers: UndiciHeaders,
  Request: UndiciRequest,
  Response: UndiciResponse,
  FormData: UndiciFormData,
  File: UndiciFile
}

export const ensureAnthropicWebAPIs = (target = globalThis, webApis = UNDICI_WEB_APIS) => {
  const hasAllRequiredApis = typeof target.fetch === 'function' &&
    typeof target.Headers === 'function' &&
    typeof target.Request === 'function' &&
    typeof target.Response === 'function' &&
    typeof target.FormData === 'function'

  if (hasAllRequiredApis) {
    return target
  }

  const {
    fetch,
    Headers,
    Request,
    Response,
    FormData,
    File
  } = webApis

  if (typeof target.fetch !== 'function') {
    target.fetch = fetch
  }
  if (typeof target.Headers !== 'function') {
    target.Headers = Headers
  }
  if (typeof target.Request !== 'function') {
    target.Request = Request
  }
  if (typeof target.Response !== 'function') {
    target.Response = Response
  }
  if (typeof target.FormData !== 'function') {
    target.FormData = FormData
  }
  if (typeof target.File !== 'function' && typeof File === 'function') {
    target.File = File
  }

  return target
}

export const resolveAnthropicFetch = (target = globalThis, webApis = UNDICI_WEB_APIS) => {
  const normalizedTarget = ensureAnthropicWebAPIs(target, webApis)
  return normalizedTarget.fetch.bind(normalizedTarget)
}

export const resolveDefaultAnthropicApiKey = () => {
  return process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY || ''
}

export const getAnthropicClientConfig = (overrides = {}) => {
  const {
    apiKey = resolveDefaultAnthropicApiKey(),
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
