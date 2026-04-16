import { expect } from 'chai'
import {
  AUTHOR_USER,
  AUTHOR_ASSISTANT
} from '../../../src/flowrite/constants'
import {
  formatFlowriteTimestamp,
  getFlowriteCommentAuthorLabel,
  getFlowriteCommentAvatar,
  FLOWRITE_MARGIN_THREAD_COMPOSER_ID
} from '../../../src/flowrite/commentUi'
import { getSidecarPaths } from '../../../src/main/flowrite/files/sidecarPaths'
import {
  FLOWRITE_TOOLS,
  getFlowriteTools
} from '../../../src/main/flowrite/ai/toolRegistry'

describe('Flowrite shared helpers', function () {
  it('formats comment timestamps and author chrome consistently', function () {
    expect(getFlowriteCommentAuthorLabel({ author: AUTHOR_USER })).to.equal('You')
    expect(getFlowriteCommentAvatar({ author: AUTHOR_USER })).to.equal('Y')
    expect(getFlowriteCommentAuthorLabel({ author: AUTHOR_ASSISTANT })).to.equal('Flowrite')
    expect(getFlowriteCommentAvatar({ author: AUTHOR_ASSISTANT })).to.equal('F')
    expect(formatFlowriteTimestamp()).to.equal('Now')
    expect(formatFlowriteTimestamp('not-a-date')).to.equal('Now')
    expect(FLOWRITE_MARGIN_THREAD_COMPOSER_ID).to.equal('flowrite-margin-thread-composer')
  })

  it('memoizes derived sidecar paths per document pathname', function () {
    const pathname = '/notes/Quarterly Review.md'
    const first = getSidecarPaths(pathname)
    const second = getSidecarPaths(pathname)

    expect(first).to.equal(second)
    expect(first.documentSlug).to.equal('quarterly-review')
  })

  it('returns stable tool definitions without cloning the registry entries', function () {
    const replyTools = getFlowriteTools('thread_reply')
    const reviewTools = getFlowriteTools('ai_review')

    expect(replyTools).to.have.length(1)
    expect(replyTools[0]).to.equal(FLOWRITE_TOOLS[0])
    expect(reviewTools[0]).to.equal(FLOWRITE_TOOLS[0])
  })
})
