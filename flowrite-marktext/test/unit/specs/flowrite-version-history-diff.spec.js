import { expect } from 'chai'
import { buildVersionHistoryDiff } from '../../../src/renderer/components/flowrite/versionHistoryDiff'

describe('Flowrite version history diff', function () {
  it('marks removed and added lines around unchanged context', function () {
    const diff = buildVersionHistoryDiff(
      '# Draft\n\nOld line\nShared line\n',
      '# Draft\n\nNew line\nShared line\n'
    )

    expect(diff).to.deep.equal([
      { type: 'context', marker: ' ', text: '# Draft' },
      { type: 'context', marker: ' ', text: '' },
      { type: 'remove', marker: '−', text: 'Old line' },
      { type: 'add', marker: '+', text: 'New line' },
      { type: 'context', marker: ' ', text: 'Shared line' },
      { type: 'context', marker: ' ', text: '' }
    ])
  })

  it('handles empty documents without throwing', function () {
    expect(buildVersionHistoryDiff('', '')).to.deep.equal([])
    expect(buildVersionHistoryDiff('', 'Hello')).to.deep.equal([
      { type: 'add', marker: '+', text: 'Hello' }
    ])
  })
})
