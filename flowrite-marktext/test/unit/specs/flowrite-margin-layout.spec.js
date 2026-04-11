import { expect } from 'chai'
import { buildMarginLayout } from '../../../src/renderer/components/flowrite/marginLayout'

describe('Flowrite margin layout', function () {
  it('orders threads by anchor position rather than updatedAt', function () {
    const layout = buildMarginLayout([
      { id: 'late', naturalTop: 320, height: 120 },
      { id: 'early', naturalTop: 120, height: 120 }
    ])

    expect(layout.map(item => item.id)).to.deep.equal(['early', 'late'])
  })

  it('keeps nearby cards close to their anchors instead of only pushing later cards downward', function () {
    const layout = buildMarginLayout([
      { id: 'a', naturalTop: 100, height: 120 },
      { id: 'b', naturalTop: 140, height: 120, active: true },
      { id: 'c', naturalTop: 180, height: 120 }
    ], {
      gap: 12
    })

    expect(layout.map(item => item.id)).to.deep.equal(['a', 'b', 'c'])
    expect(layout.find(item => item.id === 'b').top).to.be.closeTo(140, 30)
    expect(layout.find(item => item.id === 'c').top - layout.find(item => item.id === 'c').naturalTop).to.be.lessThan(120)
  })

  it('auto-compresses crowded threads when reflow drift exceeds the threshold', function () {
    const layout = buildMarginLayout([
      { id: 'a', naturalTop: 120, height: 180, messageCount: 3 },
      { id: 'b', naturalTop: 170, height: 180, messageCount: 5 },
      { id: 'c', naturalTop: 220, height: 180, messageCount: 2 }
    ], {
      compressionDriftThreshold: 80
    })

    expect(Math.abs(layout.find(item => item.id === 'a').drift)).to.be.greaterThan(80)
    expect(layout.find(item => item.id === 'a').collapsed).to.equal(true)
    expect(Math.abs(layout.find(item => item.id === 'b').drift)).to.be.lessThan(80)
    expect(layout.find(item => item.id === 'b').collapsed).to.equal(true)
    expect(layout.find(item => item.id === 'c').collapsed).to.equal(true)
  })
})
