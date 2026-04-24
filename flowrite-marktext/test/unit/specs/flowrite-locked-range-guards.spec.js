import { expect } from 'chai'
import {
  isKeyboardEditIntent,
  isMutatingBeforeInputType,
  pointFallsWithinLockedRange,
  rangesOverlap,
  selectionOverlapsLockedRanges
} from '../../../src/renderer/components/flowrite/lockedRangeGuards'

describe('Flowrite locked range guards', function () {
  it('treats a collapsed caret inside a locked range as blocked', function () {
    expect(selectionOverlapsLockedRanges([{
      paragraphId: 'paragraph-1',
      startOffset: 6,
      endOffset: 6
    }], [{
      paragraphId: 'paragraph-1',
      startOffset: 2,
      endOffset: 8
    }])).to.equal(true)
  })

  it('keeps adjacent but non-overlapping ranges editable', function () {
    expect(rangesOverlap({
      paragraphId: 'paragraph-1',
      startOffset: 8,
      endOffset: 12
    }, {
      paragraphId: 'paragraph-1',
      startOffset: 2,
      endOffset: 8
    })).to.equal(false)
  })

  it('recognizes overlap across one paragraph in a multi-range selection', function () {
    expect(selectionOverlapsLockedRanges([{
      paragraphId: 'paragraph-1',
      startOffset: 0,
      endOffset: 4
    }, {
      paragraphId: 'paragraph-2',
      startOffset: 0,
      endOffset: 5
    }], [{
      paragraphId: 'paragraph-2',
      startOffset: 3,
      endOffset: 9
    }])).to.equal(true)
  })

  it('only treats points inside the locked span as blocked', function () {
    expect(pointFallsWithinLockedRange({
      paragraphId: 'paragraph-1',
      offset: 4
    }, {
      paragraphId: 'paragraph-1',
      startOffset: 2,
      endOffset: 8
    })).to.equal(true)

    expect(pointFallsWithinLockedRange({
      paragraphId: 'paragraph-1',
      offset: 8
    }, {
      paragraphId: 'paragraph-1',
      startOffset: 2,
      endOffset: 8
    })).to.equal(false)
  })

  it('detects edit-intent keys and mutating beforeinput types', function () {
    expect(isKeyboardEditIntent({
      key: 'A',
      defaultPrevented: false,
      isComposing: false,
      metaKey: false,
      ctrlKey: false
    })).to.equal(true)

    expect(isKeyboardEditIntent({
      key: 'ArrowRight',
      defaultPrevented: false,
      isComposing: false,
      metaKey: false,
      ctrlKey: false
    })).to.equal(false)

    expect(isMutatingBeforeInputType('insertText')).to.equal(true)
    expect(isMutatingBeforeInputType('deleteContentBackward')).to.equal(true)
    expect(isMutatingBeforeInputType('formatBold')).to.equal(false)
  })
})
