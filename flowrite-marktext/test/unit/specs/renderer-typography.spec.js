import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const specDirectory = path.dirname(fileURLToPath(import.meta.url))
const isKarmaRuntime = () => typeof window !== 'undefined' && Boolean(window.__karma__)

let getDefaultPrimaryWritingFont
let getDefaultSecondaryWritingFont
let getDefaultDiscussionFont
let buildWritingFontFamily
let buildDiscussionFontFamily
let migrateLegacyEditorFontFamily

const loadTypographyModule = async () => {
  if (isKarmaRuntime()) {
    return import('../../../src/renderer/util/typography.js')
  }

  const require = createRequire(import.meta.url)
  return require('../../../src/renderer/util/typography')
}

describe('Renderer typography utility', function () {
  before(async function () {
    const typographyModule = await loadTypographyModule()
    getDefaultPrimaryWritingFont = typographyModule.getDefaultPrimaryWritingFont
    getDefaultSecondaryWritingFont = typographyModule.getDefaultSecondaryWritingFont
    getDefaultDiscussionFont = typographyModule.getDefaultDiscussionFont
    buildWritingFontFamily = typographyModule.buildWritingFontFamily
    buildDiscussionFontFamily = typographyModule.buildDiscussionFontFamily
    migrateLegacyEditorFontFamily = typographyModule.migrateLegacyEditorFontFamily
  })

  it('exposes the bundled primary and secondary writing defaults', function () {
    expect(getDefaultPrimaryWritingFont()).to.equal('Flowrite EB Garamond')
    expect(getDefaultSecondaryWritingFont()).to.equal('Flowrite Source Han Serif SC')
  })

  it('builds the default writing stack with bundled primary and secondary fonts', function () {
    expect(buildWritingFontFamily({
      primaryWritingFont: '',
      secondaryWritingFont: ''
    })).to.equal([
      '"Flowrite EB Garamond"',
      '"Flowrite Source Han Serif SC"',
      'var(--defaultWritingFontFamily)',
      'Segoe UI Emoji',
      'Apple Color Emoji',
      '"Noto Color Emoji"'
    ].join(', '))
  })

  it('builds the default discussion stack with system-ui plus discussion fallbacks', function () {
    expect(getDefaultDiscussionFont()).to.equal('system-ui')
    expect(buildDiscussionFontFamily({
      discussionFont: ''
    })).to.equal([
      'system-ui',
      'var(--defaultDiscussionFontFamily)',
      'Segoe UI Emoji',
      'Apple Color Emoji',
      '"Noto Color Emoji"'
    ].join(', '))
  })

  it('keeps an existing editor font as the migrated primary writing font', function () {
    expect(migrateLegacyEditorFontFamily('Times New Roman')).to.deep.equal({
      primaryWritingFont: 'Times New Roman',
      secondaryWritingFont: getDefaultSecondaryWritingFont(),
      discussionFont: 'system-ui'
    })
  })

  it('wires the shared writing stack into the editor and title surfaces', function () {
    const editorSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/renderer/components/editorWithTabs/editor.vue'),
      'utf8'
    )
    const titleBarSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/renderer/components/titleBar/index.vue'),
      'utf8'
    )

    expect(editorSource).to.include('buildWritingFontFamily')
    expect(editorSource).to.include("'font-family': writingFontFamily")
    expect(editorSource).to.include("'fontWeight': writingFontWeight")
    expect(titleBarSource).to.include('buildWritingFontFamily')
    expect(titleBarSource).to.include('fontFamily: writingFontFamily')
  })
})
