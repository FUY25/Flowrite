export const isBrokenPipeError = error => {
  if (!error) {
    return false
  }

  return error.code === 'EPIPE' ||
    error.errno === 'EPIPE' ||
    (typeof error.message === 'string' && error.message.includes('EPIPE'))
}

export const createBrokenPipeSafeTransport = transport => {
  if (typeof transport !== 'function' || transport.__flowriteBrokenPipeSafe) {
    return transport
  }

  let brokenPipeDetected = false

  return new Proxy(transport, {
    apply (target, thisArg, args) {
      if (brokenPipeDetected) {
        return undefined
      }

      try {
        return Reflect.apply(target, thisArg, args)
      } catch (error) {
        if (isBrokenPipeError(error)) {
          brokenPipeDetected = true
          return undefined
        }
        throw error
      }
    },
    get (target, prop, receiver) {
      if (prop === '__flowriteBrokenPipeSafe') {
        return true
      }

      if (prop === '__flowriteBrokenPipeDetected') {
        return brokenPipeDetected
      }

      return Reflect.get(target, prop, receiver)
    },
    set (target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver)
    }
  })
}
