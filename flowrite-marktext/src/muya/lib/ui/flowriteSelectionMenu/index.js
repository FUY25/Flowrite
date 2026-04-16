import BaseFloat from '../baseFloat'
import selection from '../../selection'
import { buildFlowriteSelectionPayload } from '../flowriteSelectionPayload'

import './index.css'

const defaultOptions = {
  placement: 'top',
  modifiers: {
    offset: {
      offset: '0, 8'
    }
  },
  showArrow: false
}

const createReference = rect => {
  return {
    getBoundingClientRect () {
      return rect
    },
    clientWidth: rect.width,
    clientHeight: rect.height
  }
}

class FlowriteSelectionMenu extends BaseFloat {
  static pluginName = 'flowriteSelectionMenu'

  constructor (muya, options = {}) {
    const name = 'ag-flowrite-selection-menu'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.currentSelection = null
    this.button = document.createElement('button')
    this.button.classList.add('ag-flowrite-selection-menu__button')
    this.button.setAttribute('type', 'button')
    this.button.setAttribute('data-testid', 'flowrite-selection-comment-button')
    this.button.textContent = 'Ask Flowrite'
    this.button.addEventListener('click', this.handleClick)
    this.container.appendChild(this.button)
    this.floatBox.classList.add('ag-flowrite-selection-menu-container')
    this.listen()
  }

  listen () {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe('selectionChange', changes => {
      this.handleSelectionChange(changes)
    })
  }

  handleSelectionChange (changes) {
    const range = selection.getSelectionRange()
    const selectedQuote = typeof window.getSelection === 'function'
      ? window.getSelection().toString()
      : ''
    const cursor = selection.getCursorRange()
    const getBlock = key => this.muya && this.muya.contentState && typeof this.muya.contentState.getBlock === 'function'
      ? this.muya.contentState.getBlock(key)
      : null

    this.currentSelection = buildFlowriteSelectionPayload({
      range,
      cursor,
      selectedQuote,
      getBlock,
      requireSingleParagraph: true
    })

    if (!this.currentSelection) {
      this.hide()
      return
    }

    this.show(createReference(this.currentSelection.rect))
  }

  handleClick = event => {
    event.preventDefault()
    event.stopPropagation()
    if (!this.currentSelection) {
      return
    }

    this.muya.eventCenter.dispatch('flowrite-selection-comment', {
      ...this.currentSelection
    })
    this.hide()
  }

  hide () {
    super.hide()
  }

  destroy () {
    this.button.removeEventListener('click', this.handleClick)
    super.destroy()
  }
}

export default FlowriteSelectionMenu
