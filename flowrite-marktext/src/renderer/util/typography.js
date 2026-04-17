import {
  FLOWRITE_PRIMARY_WRITING_FONT,
  FLOWRITE_SECONDARY_WRITING_FONT,
  DEFAULT_DISCUSSION_FONT
} from '../config'

const EMOJI_FALLBACK = ['Segoe UI Emoji', 'Apple Color Emoji', '"Noto Color Emoji"']
const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'emoji',
  'math',
  'fangsong',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded'
])

const normalizeFontValue = value => typeof value === 'string' ? value.trim() : ''

const serializeFontFamily = value => {
  const normalized = normalizeFontValue(value)
  if (!normalized) {
    return ''
  }

  const lowerCaseValue = normalized.toLowerCase()
  if (
    normalized.includes(',') ||
    normalized.startsWith('var(') ||
    normalized.startsWith('"') ||
    normalized.startsWith('\'') ||
    GENERIC_FONT_FAMILIES.has(lowerCaseValue)
  ) {
    return normalized
  }

  return /\s/.test(normalized) ? `"${normalized}"` : normalized
}

export const getDefaultPrimaryWritingFont = () => FLOWRITE_PRIMARY_WRITING_FONT

export const getDefaultSecondaryWritingFont = () => FLOWRITE_SECONDARY_WRITING_FONT

export const getDefaultDiscussionFont = () => DEFAULT_DISCUSSION_FONT

export const buildWritingFontFamily = ({ primaryWritingFont, secondaryWritingFont } = {}) => {
  const primary = serializeFontFamily(primaryWritingFont) || serializeFontFamily(getDefaultPrimaryWritingFont())
  const secondary = serializeFontFamily(secondaryWritingFont) || serializeFontFamily(getDefaultSecondaryWritingFont())

  return [primary, secondary, 'var(--defaultWritingFontFamily)', ...EMOJI_FALLBACK].join(', ')
}

export const buildDiscussionFontFamily = ({ discussionFont } = {}) => {
  const discussion = serializeFontFamily(discussionFont) || serializeFontFamily(getDefaultDiscussionFont())

  return [discussion, 'var(--defaultDiscussionFontFamily)', ...EMOJI_FALLBACK].join(', ')
}

export const migrateLegacyEditorFontFamily = legacyEditorFontFamily => ({
  primaryWritingFont: normalizeFontValue(legacyEditorFontFamily) || getDefaultPrimaryWritingFont(),
  secondaryWritingFont: getDefaultSecondaryWritingFont(),
  discussionFont: getDefaultDiscussionFont()
})
