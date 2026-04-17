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
    emojiPickerPatch = ''
  } = assets

  const scrollbarStyle = hideScrollbar ? '::-webkit-scrollbar {display: none;}' : ''

  return `${scrollbarStyle}
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

export const buildBundledFontFaceText = (assets = {}) => {
  const {
    ebGaramondVariableUrl = 'flowrite-eb-garamond-variable',
    sourceHanSerifScRegularUrl = 'flowrite-source-han-serif-sc-regular',
    sourceHanSerifScMediumUrl = 'flowrite-source-han-serif-sc-medium',
    sourceHanSerifScSemiBoldUrl = 'flowrite-source-han-serif-sc-semibold'
  } = assets

  return `
@font-face {
  font-family: "Flowrite EB Garamond";
  src: url(${ebGaramondVariableUrl}) format("truetype");
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
}
@font-face {
  font-family: "Flowrite Source Han Serif SC";
  src: url(${sourceHanSerifScRegularUrl}) format("opentype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Flowrite Source Han Serif SC";
  src: url(${sourceHanSerifScMediumUrl}) format("opentype");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "Flowrite Source Han Serif SC";
  src: url(${sourceHanSerifScSemiBoldUrl}) format("opentype");
  font-style: normal;
  font-weight: 600;
  font-display: swap;
}
`
}
