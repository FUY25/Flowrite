import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_DISCUSSION_FONT_FALLBACK
} from '../config'
import { buildWorkspaceWarmthCss } from './workspaceWarmth'

export const buildCommonStyleText = (options, assets = {}) => {
  const {
    codeFontFamily,
    codeFontSize,
    hideScrollbar,
    theme,
    workspaceBackgroundWarmth
  } = options

  const {
    ebGaramondRegularUrl = 'flowrite-eb-garamond-regular',
    sourceHanSerifScRegularUrl = 'flowrite-source-han-serif-sc-regular',
    emojiPickerPatch = ''
  } = assets

  const scrollbarStyle = hideScrollbar ? '::-webkit-scrollbar {display: none;}' : ''

  return `${scrollbarStyle}
@font-face {
  font-family: "Flowrite EB Garamond";
  src: url(${ebGaramondRegularUrl}) format("truetype");
  font-display: swap;
}
@font-face {
  font-family: "Flowrite Source Han Serif SC";
  src: url(${sourceHanSerifScRegularUrl}) format("opentype");
  font-display: swap;
}
:root {
  --defaultWritingFontFamily: ${DEFAULT_EDITOR_FONT_FAMILY};
  --defaultDiscussionFontFamily: ${DEFAULT_DISCUSSION_FONT_FALLBACK};
}
span code,
td code,
th code,
code,
code[class*="language-"],
.CodeMirror,
pre.ag-paragraph {
font-family: ${codeFontFamily}, ${DEFAULT_CODE_FONT_FAMILY};
font-size: ${codeFontSize}px;
}

${buildWorkspaceWarmthCss({ theme, workspaceBackgroundWarmth })}
${emojiPickerPatch}
`
}
