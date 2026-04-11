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

  it('pushes overlapping cards down to preserve readability', function () {
    const layout = buildMarginLayout([
      { id: 'first', naturalTop: 100, height: 120 },
      { id: 'second', naturalTop: 150, height: 120 },
      { id: 'third', naturalTop: 180, height: 120 }
    ], {
      gap: 12
    })

    expect(layout[0]).to.include({
      id: 'first',
      top: 100
    })
    expect(layout[1].top).to.equal(232)
    expect(layout[2].top).to.equal(364)
  })

  it('auto-compresses crowded threads when push-down drift exceeds the threshold', function () {
    const layout = buildMarginLayout([
      { id: 'a', naturalTop: 120, height: 180, messageCount: 3 },
      { id: 'b', naturalTop: 170, height: 180, messageCount: 5 },
      { id: 'c', naturalTop: 220, height: 180, messageCount: 2 }
    ], {
      compressionDriftThreshold: 80
    })

    expect(layout.find(item => item.id === 'a')).to.include({
      top: 120,
      drift: 0,
      collapsed: false
    })
    expect(layout.find(item => item.id === 'b')).to.include({
      top: 314,
      drift: 144,
      collapsed: true
    })
    expect(layout.find(item => item.id === 'c')).to.include({
      top: 508,
      drift: 288,
      collapsed: true
    })
  })
})
