import { expect } from 'chai'
import {
  createMarginAnchor,
  resolveMarginAnchor
} from '../../../src/flowrite/anchors'
import { ANCHOR_ATTACHED } from '../../../src/flowrite/constants'

describe('Flowrite margin anchors', function () {
  it('fuzzily reattaches a changed passage in the same paragraph', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-para-1',
        offset: 2
      },
      end: {
        key: 'ag-para-1',
        offset: 22
      },
      quote: 'reflective paragraph',
      startBlockText: 'A reflective paragraph with a soft cadence.',
      endBlockText: 'A reflective paragraph with a soft cadence.'
    })

    const resolution = resolveMarginAnchor(anchor, [{
      id: 'ag-para-1',
      text: 'A reflective, luminous paragraph with a soft cadence.'
    }])

    expect(resolution.status).to.equal('attached')
    expect(resolution.paragraphId).to.equal('ag-para-1')
    expect(resolution.strategy).to.match(/^fuzzy/)
    expect(resolution.score).to.be.greaterThan(0.72)
  })

  it('resolves a multi-paragraph anchor into a range that spans the start and end paragraphs', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1', text: 'Alpha first paragraph tail' },
      { id: 'ag-2', text: 'second para closes here' }
    ])

    expect(resolution.status).to.equal(ANCHOR_ATTACHED)
    expect(resolution.paragraphId).to.equal('ag-1')
    expect(resolution.startParagraphId).to.equal('ag-1')
    expect(resolution.endParagraphId).to.equal('ag-2')
    expect(resolution.ranges).to.deep.equal([
      { paragraphId: 'ag-1', startOffset: 6, endOffset: 26 },
      { paragraphId: 'ag-2', startOffset: 0, endOffset: 11 }
    ])
  })

  it('fuzzily reattaches a multi-paragraph anchor after modest edits in both paragraphs', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1', text: 'Alpha first paragraph tail plus' },
      { id: 'ag-2', text: 'second para closes here and more' }
    ])

    expect(resolution.status).to.equal(ANCHOR_ATTACHED)
    expect(resolution.strategy).to.match(/^fuzzy_cross_paragraph/)
    expect(resolution.paragraphId).to.equal('ag-1')
    expect(resolution.startParagraphId).to.equal('ag-1')
    expect(resolution.endParagraphId).to.equal('ag-2')
    expect(resolution.ranges).to.have.length(2)
    expect(resolution.ranges[0].paragraphId).to.equal('ag-1')
    expect(resolution.ranges[1].paragraphId).to.equal('ag-2')
  })

  it('marks the thread detached when the original paragraph ids are gone', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1-renamed', text: 'Alpha first paragraph tail plus' },
      { id: 'ag-2-renamed', text: 'second para closes here and more' }
    ])

    expect(resolution.status).to.equal('detached')
  })

  it('does not downgrade a failed cross-paragraph anchor into an unrelated single paragraph', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1-renamed', text: 'Alpha first paragraph tail plus' },
      { id: 'ag-2-renamed', text: 'second para closes here and more' },
      { id: 'unrelated', text: 'first paragraph tail second para' }
    ])

    expect(resolution.status).to.equal('detached')
  })

  it('reattaches a merged cross-paragraph quote to the surviving local paragraph', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1', text: 'Alpha first paragraph tail second para closes here' },
      { id: 'bridge', text: 'A note about transitions.' },
      { id: 'unrelated', text: 'first paragraph tail second para' }
    ])

    expect(resolution.status).to.equal(ANCHOR_ATTACHED)
    expect(resolution.paragraphId).to.equal('ag-1')
    expect(resolution.strategy).to.equal('exact_quote_local_cross_paragraph')
  })

  it('fuzzily reattaches a multi-paragraph anchor when one endpoint id survives', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1-renamed', text: 'Alpha first paragraph tail plus' },
      { id: 'ag-2', text: 'second para closes here and more' }
    ])

    expect(resolution.status).to.equal(ANCHOR_ATTACHED)
    expect(resolution.strategy).to.match(/^fuzzy_cross_paragraph/)
    expect(resolution.paragraphId).to.equal('ag-1-renamed')
    expect(resolution.startParagraphId).to.equal('ag-1-renamed')
    expect(resolution.endParagraphId).to.equal('ag-2')
    expect(resolution.ranges).to.have.length(2)
    expect(resolution.ranges[0].paragraphId).to.equal('ag-1-renamed')
    expect(resolution.ranges[1].paragraphId).to.equal('ag-2')
    expect(resolution.ranges[0].endOffset).to.be.greaterThan(resolution.ranges[0].startOffset)
    expect(resolution.ranges[1].endOffset).to.be.greaterThan(resolution.ranges[1].startOffset)
  })

  it('fuzzily reattaches a multi-paragraph anchor when the end survives and the start moved two paragraphs earlier', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-3',
        offset: 23
      },
      quote: 'first paragraph tail bridge second paragraph closes',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second paragraph closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'p-0', text: 'Alpha first paragraph tail' },
      { id: 'p-1', text: 'bridge' },
      { id: 'ag-3', text: 'second paragraph closes here' }
    ])

    expect(resolution.status).to.equal(ANCHOR_ATTACHED)
    expect(resolution.strategy).to.match(/^fuzzy_cross_paragraph/)
    expect(resolution.paragraphId).to.equal('p-0')
    expect(resolution.startParagraphId).to.equal('p-0')
    expect(resolution.endParagraphId).to.equal('ag-3')
    expect(resolution.ranges).to.deep.equal([
      { paragraphId: 'p-0', startOffset: 5, endOffset: 26 },
      { paragraphId: 'p-1', startOffset: 0, endOffset: 6 },
      { paragraphId: 'ag-3', startOffset: 0, endOffset: 24 }
    ])
  })

  it('keeps the surviving endpoint local when a later duplicate passage is stronger', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-1',
        offset: 6
      },
      end: {
        key: 'ag-2',
        offset: 11
      },
      quote: 'first paragraph tail second para',
      startBlockText: 'Alpha first paragraph tail',
      endBlockText: 'second para closes here'
    })

    const resolution = resolveMarginAnchor(anchor, [
      { id: 'ag-1-renamed', text: 'Alpha first paragraph tail plus' },
      { id: 'ag-2', text: 'second para closes here and more' },
      { id: 'filler-1', text: 'An unrelated note about stationery.' },
      { id: 'filler-2', text: 'Another unrelated line about weather.' },
      { id: 'filler-3', text: 'A third unrelated line about coffee.' },
      { id: 'other-1', text: 'Alpha first paragraph tail' },
      { id: 'other-2', text: 'second para closes here' }
    ])

    expect(resolution.status).to.equal(ANCHOR_ATTACHED)
    expect(resolution.strategy).to.match(/^fuzzy_cross_paragraph/)
    expect(resolution.paragraphId).to.equal('ag-1-renamed')
    expect(resolution.startParagraphId).to.equal('ag-1-renamed')
    expect(resolution.endParagraphId).to.equal('ag-2')
    expect(resolution.ranges).to.have.length(2)
    expect(resolution.ranges[0].paragraphId).to.equal('ag-1-renamed')
    expect(resolution.ranges[1].paragraphId).to.equal('ag-2')
  })

  it('marks the thread detached when there is no safe match', function () {
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-para-1',
        offset: 2
      },
      end: {
        key: 'ag-para-1',
        offset: 22
      },
      quote: 'reflective paragraph',
      startBlockText: 'A reflective paragraph with a soft cadence.',
      endBlockText: 'A reflective paragraph with a soft cadence.'
    })

    const resolution = resolveMarginAnchor(anchor, [{
      id: 'ag-para-2',
      text: 'An abrupt closing line about thunder and gravel.'
    }])

    expect(resolution.status).to.equal('detached')
  })
})
