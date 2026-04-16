import { expect } from 'chai'
import {
  createBrokenPipeSafeTransport,
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
})
