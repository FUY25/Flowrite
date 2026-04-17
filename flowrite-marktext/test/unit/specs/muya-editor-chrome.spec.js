import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import renderIcon from '../../../src/muya/lib/parser/render/renderBlock/renderIcon'
import selection from '../../../src/muya/lib/selection'

const specDirectory = path.dirname(fileURLToPath(import.meta.url))

const editorSourcePath = path.resolve(specDirectory, '../../../src/renderer/components/editorWithTabs/editor.vue')
const inputCtrlSourcePath = path.resolve(specDirectory, '../../../src/muya/lib/contentState/inputCtrl.js')
const editorCssSourcePath = path.resolve(specDirectory, '../../../src/muya/lib/assets/styles/index.css')

const createRangeAt = (node, offset) => {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  return range
}

const buildParagraphFixture = () => {
  document.body.innerHTML = '<div id="ag-editor-id"><p id="paragraph-1" class="ag-paragraph"><a class="ag-front-icon" contenteditable="false"></a><span class="ag-paragraph-content"><span>The </span><span>**</span><strong>quick</strong><span>**</span><span> brown fox jumps over </span><a class="ag-inline-rule" href="https://example.com">the lazy dog</a><span>.</span><span> A second sentence follows here.</span></span></p></div>'

  return {
    paragraph: document.querySelector('#paragraph-1'),
    quickTextNode: document.querySelector('strong').firstChild,
    secondSentenceTextNode: document.querySelector('.ag-paragraph-content').lastChild.firstChild
  }
}

describe('Muya editor chrome', function () {
  afterEach(function () {
    document.body.innerHTML = ''
    const nativeSelection = document.getSelection()
    if (nativeSelection) {
      nativeSelection.removeAllRanges()
    }
    delete document.caretRangeFromPoint
    delete document.caretPositionFromPoint
  })

  it('does not register the front menu plugin in the editor shell', function () {
    const editorSource = fs.readFileSync(editorSourcePath, 'utf8')

    expect(editorSource).to.not.include("import FrontMenu from 'muya/lib/ui/frontMenu'")
    expect(editorSource).to.not.include('Muya.use(FrontMenu)')
  })

  it('does not render front icon handles for top-level blocks', function () {
    const paragraphBlock = {
      parent: null,
      type: 'p'
    }

    expect(renderIcon(paragraphBlock)).to.equal(null)
  })

  it('switches quick insert and placeholder copy to slash-first writing prompts', function () {
    const inputCtrlSource = fs.readFileSync(inputCtrlSourcePath, 'utf8')
    const editorCssSource = fs.readFileSync(editorCssSourcePath, 'utf8')

    expect(inputCtrlSource).to.include('Input / to quick insert paragraph')
    expect(inputCtrlSource).to.include('return /^\\/\\S*$/.test(text)')
    expect(editorCssSource).to.include("content: 'Start writing. Press / to format.';")
    expect(editorCssSource).to.not.include("content: 'Type @ to insert';")
  })

  it('selects the full sentence when double click lands inside formatted text', function () {
    const { paragraph, quickTextNode } = buildParagraphFixture()
    document.caretRangeFromPoint = () => createRangeAt(quickTextNode, 2)

    selection.selectSentenceAt(paragraph, 12, 18)

    expect(document.getSelection().toString()).to.equal('The **quick** brown fox jumps over the lazy dog.')
  })

  it('selects the clicked sentence when the caret lands in a later sentence', function () {
    const { paragraph, secondSentenceTextNode } = buildParagraphFixture()
    document.caretRangeFromPoint = () => createRangeAt(secondSentenceTextNode, 5)

    selection.selectSentenceAt(paragraph, 20, 24)

    expect(document.getSelection().toString()).to.equal('A second sentence follows here.')
  })

  it('selects the full paragraph text without the front icon chrome', function () {
    const { paragraph } = buildParagraphFixture()

    selection.selectParagraphAt(paragraph)

    expect(document.getSelection().toString()).to.equal(
      'The **quick** brown fox jumps over the lazy dog. A second sentence follows here.'
    )
  })
})
