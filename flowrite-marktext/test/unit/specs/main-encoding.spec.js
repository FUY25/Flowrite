import { expect } from 'chai'

const loadEncodingModule = async () => {
  return import('../../../src/main/filesystem/encoding.js')
}

describe('Main encoding detection', function () {
  let createEncodingGuesser

  before(async function () {
    const encodingModule = await loadEncodingModule()
    createEncodingGuesser = encodingModule.createEncodingGuesser
  })

  it('falls back to utf8 when the native ced detector is unavailable', function () {
    const guessEncoding = createEncodingGuesser({
      resolveCedDetector: () => {
        throw new Error('forced ced unavailable')
      }
    })

    expect(guessEncoding(Buffer.from('hello'), true)).to.deep.equal({
      encoding: 'utf8',
      isBom: false
    })
  })
})
