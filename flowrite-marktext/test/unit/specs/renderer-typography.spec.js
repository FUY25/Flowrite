import { expect } from 'chai'
import {
  getDefaultPrimaryWritingFont,
  getDefaultSecondaryWritingFont,
  getDefaultDiscussionFont,
  buildWritingFontFamily,
  buildDiscussionFontFamily,
  migrateLegacyEditorFontFamily
} from '../../../src/renderer/util/typography'

describe('Renderer typography utility', function () {
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
})
