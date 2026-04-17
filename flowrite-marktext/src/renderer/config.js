import path from 'path'
export const PATH_SEPARATOR = path.sep

export const THEME_STYLE_ID = 'ag-theme'
export const COMMON_STYLE_ID = 'ag-common-style'

export const FLOWRITE_PRIMARY_WRITING_FONT = 'Flowrite EB Garamond'
export const FLOWRITE_SECONDARY_WRITING_FONT = 'Flowrite Source Han Serif SC'
export const DEFAULT_WRITING_FONT_FALLBACK = '"Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, sans-serif'
export const DEFAULT_DISCUSSION_FONT = 'system-ui'
export const DEFAULT_DISCUSSION_FONT_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
export const DEFAULT_EDITOR_FONT_FAMILY = '"Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, sans-serif, Segoe UI Emoji, Apple Color Emoji, "Noto Color Emoji"'
export const DEFAULT_CODE_FONT_FAMILY = '"DejaVu Sans Mono", "Source Code Pro", "Droid Sans Mono", monospace'
export const DEFAULT_STYLE = Object.freeze({
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: '14px',
  hideScrollbar: false,
  theme: 'light'
})

export const railscastsThemes = Object.freeze(['dark', 'material-dark'])
export const oneDarkThemes = Object.freeze(['one-dark'])
