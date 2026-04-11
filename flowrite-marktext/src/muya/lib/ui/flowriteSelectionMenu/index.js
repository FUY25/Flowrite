import BaseFloat from '../baseFloat'
import selection from '../../selection'

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
    const quote = typeof selectedQuote === 'string' ? selectedQuote.replace(/\s+/g, ' ').trim() : ''
    const isCollapsed = !changes || !changes.start || !changes.end || (
      changes.start.key === changes.end.key && changes.start.offset === changes.end.offset
    )

    if (isCollapsed || !range || range.collapsed || !quote) {
      this.currentSelection = null
      this.hide()
      return
    }

    if (changes.start.key !== changes.end.key) {
      this.currentSelection = null
      this.hide()
      return
    }

    const rect = range.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) {
      this.currentSelection = null
      this.hide()
      return
    }

    this.currentSelection = {
      quote,
      rect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      start: {
        key: changes.start.key,
        offset: changes.start.offset,
        blockText: changes.start.block && typeof changes.start.block.text === 'string'
          ? changes.start.block.text
          : ''
      },
      end: {
        key: changes.end.key,
        offset: changes.end.offset,
        blockText: changes.end.block && typeof changes.end.block.text === 'string'
          ? changes.end.block.text
          : ''
      }
    }

    this.show(createReference(rect))
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
