import { expect } from 'chai'
import {
  createBrokenPipeSafeTransport,
  installBrokenPipeStreamGuards,
  isBrokenPipeError
} from '../../../src/main/utils/safeConsoleTransport'

describe('Main safe console transport', function () {
  it('stops calling the transport after the first broken pipe error', function () {
    let callCount = 0
    const transport = function transport () {
      callCount += 1
      const error = new Error('write EPIPE')
      error.code = 'EPIPE'
      throw error
    }

    const safeTransport = createBrokenPipeSafeTransport(transport)

    expect(() => safeTransport({ level: 'error' })).to.not.throw()
    expect(() => safeTransport({ level: 'error' })).to.not.throw()
    expect(callCount).to.equal(1)
    expect(safeTransport.__flowriteBrokenPipeDetected).to.equal(true)
  })

  it('preserves transport properties through the proxy wrapper', function () {
    const transport = function transport () {}
    transport.level = 'warn'

    const safeTransport = createBrokenPipeSafeTransport(transport)
    safeTransport.level = 'info'

    expect(transport.level).to.equal('info')
    expect(safeTransport.level).to.equal('info')
  })

  it('rethrows non-broken-pipe transport errors', function () {
    const transport = function transport () {
      throw new Error('boom')
    }

    const safeTransport = createBrokenPipeSafeTransport(transport)

    expect(() => safeTransport({ level: 'error' })).to.throw('boom')
  })

  it('recognizes broken pipe errors from code or message text', function () {
    expect(isBrokenPipeError({ code: 'EPIPE' })).to.equal(true)
    expect(isBrokenPipeError(new Error('write EPIPE'))).to.equal(true)
    expect(isBrokenPipeError(new Error('different failure'))).to.equal(false)
  })

  it('installs stdout and stderr guards that notify only once for broken pipes', function () {
    const listeners = {}
    const processLike = {
      stdout: {
        on (event, handler) {
          listeners[`stdout:${event}`] = handler
        }
      },
      stderr: {
        on (event, handler) {
          listeners[`stderr:${event}`] = handler
        }
      }
    }

    let notificationCount = 0
    installBrokenPipeStreamGuards(processLike, () => {
      notificationCount += 1
    })

    const error = new Error('write EPIPE')
    error.code = 'EPIPE'
    listeners['stdout:error'](error)
    listeners['stderr:error'](error)

    expect(notificationCount).to.equal(1)
    expect(processLike.__flowriteBrokenPipeGuardsInstalled).to.equal(true)
  })

  it('ignores non-broken-pipe stream errors', function () {
    const listeners = {}
    const processLike = {
      stdout: {
        on (event, handler) {
          listeners[`stdout:${event}`] = handler
        }
      }
    }

    let notificationCount = 0
    installBrokenPipeStreamGuards(processLike, () => {
      notificationCount += 1
    })

    listeners['stdout:error'](new Error('different failure'))

    expect(notificationCount).to.equal(0)
  })
})
