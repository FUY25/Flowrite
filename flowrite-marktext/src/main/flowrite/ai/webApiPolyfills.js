import {
  File as UndiciFile,
  FormData as UndiciFormData,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
  fetch as undiciFetch
} from 'undici'

export const UNDICI_WEB_APIS = {
  fetch: undiciFetch,
  Headers: UndiciHeaders,
  Request: UndiciRequest,
  Response: UndiciResponse,
  FormData: UndiciFormData,
  File: UndiciFile
}

export const ensureNodeWebAPIs = (target = globalThis, webApis = UNDICI_WEB_APIS) => {
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

export const resolveNodeFetch = (target = globalThis, webApis = UNDICI_WEB_APIS) => {
  const normalizedTarget = ensureNodeWebAPIs(target, webApis)
  return normalizedTarget.fetch.bind(normalizedTarget)
}
