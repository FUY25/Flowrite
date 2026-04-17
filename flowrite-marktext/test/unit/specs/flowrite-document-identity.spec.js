import { expect } from 'chai'
import {
  extractDocumentIdentityFromMarkdown,
  ensureDocumentIdentityInMarkdown,
  createDocumentId
} from '../../../src/main/flowrite/files/documentIdentity'

describe('Flowrite document identity helper', function () {
  it('extracts a top-of-file flowrite id comment and removes it from editor markdown', function () {
    const source = '<!-- flowrite:id=doc-123 -->\n\n# Draft\n\nHello.\n'

    const result = extractDocumentIdentityFromMarkdown(source)

    expect(result.documentId).to.equal('doc-123')
    expect(result.markdown).to.equal('# Draft\n\nHello.\n')
    expect(result.carrier).to.equal('html_comment')
  })

  it('injects a top-of-file flowrite id comment without changing body markdown', function () {
    const source = '# Draft\n\nHello.\n'

    const result = ensureDocumentIdentityInMarkdown(source, 'doc-123')

    expect(result).to.equal('<!-- flowrite:id=doc-123 -->\n\n# Draft\n\nHello.\n')
  })

  it('replaces an existing flowrite id comment instead of duplicating it', function () {
    const source = '<!-- flowrite:id=old-id -->\n\n# Draft\n'

    const result = ensureDocumentIdentityInMarkdown(source, 'new-id')

    expect(result).to.equal('<!-- flowrite:id=new-id -->\n\n# Draft\n')
  })

  it('creates a UUID-shaped document id', function () {
    expect(createDocumentId()).to.match(/^[0-9a-f-]{36}$/)
  })
})
