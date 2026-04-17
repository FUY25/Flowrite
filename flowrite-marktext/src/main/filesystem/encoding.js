import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const CED_ICONV_ENCODINGS = {
  'BIG5-CP950': 'big5',
  KSC: 'euckr',
  'ISO-2022-KR': 'euckr',
  GB: 'gb2312',
  ISO_2022_CN: 'gb2312',
  JIS: 'shiftjis',
  SJS: 'shiftjis',
  Unicode: 'utf8',

  // Map ASCII to UTF-8
  'ASCII-7-bit': 'utf8',
  ASCII: 'utf8',
  MACINTOSH: 'utf8'
}

// Byte Order Mark's to detect endianness and encoding.
const BOM_ENCODINGS = {
  utf8: [0xEF, 0xBB, 0xBF],
  utf16be: [0xFE, 0xFF],
  utf16le: [0xFF, 0xFE]
}

let cachedCedDetector
let hasResolvedCedDetector = false

const checkSequence = (buffer, sequence) => {
  if (buffer.length < sequence.length) {
    return false
  }
  return sequence.every((v, i) => v === buffer[i])
}

const resolveCedDetector = () => {
  if (hasResolvedCedDetector) {
    return cachedCedDetector
  }

  hasResolvedCedDetector = true

  try {
    const cedModule = require('ced')
    cachedCedDetector = typeof cedModule === 'function'
      ? cedModule
      : (cedModule && typeof cedModule.default === 'function' ? cedModule.default : null)
  } catch (error) {
    cachedCedDetector = null
  }

  return cachedCedDetector
}

const normalizeDetectedEncoding = detectedEncoding => {
  if (typeof detectedEncoding !== 'string' || detectedEncoding.length === 0) {
    return 'utf8'
  }

  if (CED_ICONV_ENCODINGS[detectedEncoding]) {
    return CED_ICONV_ENCODINGS[detectedEncoding]
  }

  return detectedEncoding.toLowerCase().replace(/-_/g, '')
}

/**
 * Guess the encoding from the buffer.
 *
 * @param {Buffer} buffer
 * @param {boolean} autoGuessEncoding
 * @returns {Encoding}
 */
export const createEncodingGuesser = ({ resolveCedDetector: getCedDetector = resolveCedDetector } = {}) => (buffer, autoGuessEncoding) => {
  let isBom = false
  let encoding = 'utf8'

  // Detect UTF8- and UTF16-BOM encodings.
  for (const [key, value] of Object.entries(BOM_ENCODINGS)) {
    if (checkSequence(buffer, value)) {
      return { encoding: key, isBom: true }
    }
  }

  // // Try to detect binary files. Text files should not containt four 0x00 characters.
  // let zeroSeenCounter = 0
  // for (let i = 0; i < Math.min(buffer.byteLength, 256); ++i) {
  //   if (buffer[i] === 0x00) {
  //     if (zeroSeenCounter >= 3) {
  //       return { encoding: 'binary', isBom: false }
  //     }
  //     zeroSeenCounter++
  //   } else {
  //     zeroSeenCounter = 0
  //   }
  // }

  // Auto guess encoding, otherwise use UTF8.
  if (autoGuessEncoding) {
    let cedDetector = null

    try {
      cedDetector = getCedDetector()
    } catch (error) {
      cedDetector = null
    }

    if (typeof cedDetector === 'function') {
      try {
        encoding = normalizeDetectedEncoding(cedDetector(buffer))
      } catch (error) {
        encoding = 'utf8'
      }
    }
  }
  return { encoding, isBom }
}

export const guessEncoding = createEncodingGuesser()
