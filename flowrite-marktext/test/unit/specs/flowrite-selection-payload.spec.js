import { expect } from 'chai'
import { buildFlowriteSelectionPayload } from '../../../src/muya/lib/ui/flowriteSelectionPayload'

describe('Flowrite selection payload', function () {
  it('builds the payload from the DOM cursor range instead of external selection-change offsets', function () {
    const payload = buildFlowriteSelectionPayload({
      range: {
        collapsed: false,
        getBoundingClientRect () {
          return {
            top: 10,
            left: 20,
            right: 70,
            bottom: 30,
            width: 50,
            height: 20
          }
        }
      },
      cursor: {
        start: {
          key: 'paragraph-1',
          offset: 4
        },
        end: {
          key: 'paragraph-1',
          offset: 8
        }
      },
      selectedQuote: 'beta',
      getBlock: key => ({
        key,
        text: 'Alpha beta gamma'
      })
    })

    expect(payload).to.deep.equal({
      quote: 'beta',
      rect: {
        top: 10,
        left: 20,
        right: 70,
        bottom: 30,
        width: 50,
        height: 20
      },
      start: {
        key: 'paragraph-1',
        offset: 4,
        blockText: 'Alpha beta gamma'
      },
      end: {
        key: 'paragraph-1',
        offset: 8,
        blockText: 'Alpha beta gamma'
      },
      sameBlock: true
    })
  })

  it('returns null for the floating menu when the DOM cursor spans multiple paragraphs', function () {
    const payload = buildFlowriteSelectionPayload({
      range: {
        collapsed: false,
        getBoundingClientRect () {
          return {
            top: 10,
            left: 20,
            right: 70,
            bottom: 30,
            width: 50,
            height: 20
          }
        }
      },
      cursor: {
        start: {
          key: 'paragraph-1',
          offset: 4
        },
        end: {
          key: 'paragraph-2',
          offset: 3
        }
      },
      selectedQuote: 'beta gamma',
      getBlock: key => ({
        key,
        text: key === 'paragraph-1' ? 'Alpha beta' : 'gamma delta'
      }),
      requireSingleParagraph: true
    })

    expect(payload).to.equal(null)
  })
})
