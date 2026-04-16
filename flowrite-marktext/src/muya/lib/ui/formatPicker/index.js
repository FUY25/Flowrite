import BaseFloat from '../baseFloat'
import icons from './config'
import selection from '../../selection'
import quoteIcon from '../../assets/pngicon/quote_block/2.png'
import { buildFlowriteSelectionPayload } from '../flowriteSelectionPayload'

import './index.css'

const defaultOptions = {
  placement: 'top',
  modifiers: {
    offset: {
      offset: '0, 5'
    }
  },
  showArrow: false
}

class FormatPicker extends BaseFloat {
  static pluginName = 'formatPicker'

  constructor (muya, options = {}) {
    const name = 'ag-format-picker'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.formats = null
    this.currentSelection = null
    this.options = opts
    this.icons = icons
    const formatContainer = this.formatContainer = document.createElement('div')
    this.container.appendChild(formatContainer)
    this.floatBox.classList.add('ag-format-picker-container')
    this.listen()
  }

  listen () {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe('muya-format-picker', ({ reference, formats }) => {
      if (reference) {
        this.formats = formats
        this.currentSelection = this.captureSelection()
        setTimeout(() => {
          this.show(reference)
          this.render()
        }, 0)
      } else {
        this.hide()
      }
    })
  }

  captureSelection () {
    const range = selection.getSelectionRange()
    const cursor = selection.getCursorRange()
    const selectedQuote = typeof window.getSelection === 'function'
      ? window.getSelection().toString()
      : ''
    const getBlock = key => this.muya.contentState.getBlock(key)

    return buildFlowriteSelectionPayload({
      range,
      cursor,
      selectedQuote,
      getBlock
    })
  }

  getToolRows () {
    if (this.currentSelection && !this.currentSelection.sameBlock) {
      return [[{
        type: 'ask-flowrite',
        text: 'Ask Flowrite',
        action: 'flowrite',
        dataTestId: 'flowrite-selection-comment-button'
      }]]
    }

    const iconMap = new Map(this.icons.map(icon => [icon.type, icon]))
    const createFormatTool = (type, dataTestId) => {
      const icon = iconMap.get(type)
      return {
        type,
        icon: icon && icon.icon,
        tooltip: icon ? icon.tooltip : type,
        shortcut: icon ? icon.shortcut : '',
        action: 'format',
        dataTestId
      }
    }

    return [
      [
        createFormatTool('strong'),
        createFormatTool('em'),
        createFormatTool('u'),
        createFormatTool('del'),
        createFormatTool('mark'),
        createFormatTool('link')
      ],
      [
        {
          type: 'blockquote',
          icon: quoteIcon,
          tooltip: 'Quote',
          shortcut: '',
          action: 'paragraph',
          dataTestId: 'flowrite-selection-tool-quote'
        },
        createFormatTool('inline_code', 'flowrite-selection-tool-code'),
        createFormatTool('image'),
        createFormatTool('clear'),
        {
          type: 'ask-flowrite',
          text: 'Ask Flowrite',
          action: 'flowrite',
          dataTestId: 'flowrite-selection-comment-button'
        }
      ]
    ]
  }

  isToolActive (tool) {
    if (!Array.isArray(this.formats) || !tool || tool.action !== 'format') {
      return false
    }

    return this.formats.some(format => format.type === tool.type || (format.type === 'html_tag' && format.tag === tool.type))
  }

  createIconNode (tool) {
    const iconWrapper = document.createElement('span')
    iconWrapper.classList.add('ag-format-picker__icon-wrapper')
    iconWrapper.setAttribute('aria-hidden', 'true')

    const icon = document.createElement('i')
    icon.classList.add('ag-format-picker__icon')

    const iconInner = document.createElement('i')
    iconInner.classList.add('ag-format-picker__icon-inner')
    iconInner.style.backgroundImage = `url(${tool.icon})`

    icon.appendChild(iconInner)
    iconWrapper.appendChild(icon)
    return iconWrapper
  }

  render () {
    const { formatContainer } = this
    const rows = this.getToolRows()
    formatContainer.innerHTML = ''

    const surface = document.createElement('div')
    surface.classList.add('ag-format-picker__surface')
    surface.setAttribute('data-testid', 'flowrite-selection-toolbar')
    if (this.currentSelection && !this.currentSelection.sameBlock) {
      surface.classList.add('ag-format-picker__surface--selection-only')
    }

    rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div')
      rowElement.classList.add('ag-format-picker__row')
      rowElement.setAttribute('data-testid', 'flowrite-selection-toolbar-row')

      row.forEach(tool => {
        const button = document.createElement('button')
        button.setAttribute('type', 'button')
        button.classList.add('ag-format-picker__tool')
        button.classList.add(`ag-format-picker__tool--${tool.type}`)
        if (tool.action === 'flowrite') {
          button.classList.add('ag-format-picker__tool--ask-flowrite')
        }
        if (this.isToolActive(tool)) {
          button.classList.add('active')
        }
        if (tool.dataTestId) {
          button.setAttribute('data-testid', tool.dataTestId)
        }
        button.setAttribute('aria-label', tool.tooltip || tool.text || tool.type)
        button.setAttribute('title', [tool.tooltip || tool.text || tool.type, tool.shortcut].filter(Boolean).join(' '))

        if (tool.icon) {
          button.appendChild(this.createIconNode(tool))
        } else {
          const label = document.createElement('span')
          label.classList.add('ag-format-picker__ask-label')
          label.textContent = tool.text
          button.appendChild(label)
        }

        button.addEventListener('click', event => {
          this.selectItem(event, tool)
        })
        rowElement.appendChild(button)
      })

      if (rowIndex === 0) {
        rowElement.classList.add('ag-format-picker__row--primary')
      } else {
        rowElement.classList.add('ag-format-picker__row--secondary')
      }
      surface.appendChild(rowElement)
    })

    formatContainer.appendChild(surface)
  }

  selectItem (event, item) {
    event.preventDefault()
    event.stopPropagation()
    const { contentState, eventCenter } = this.muya
    contentState.render()

    if (item.action === 'flowrite') {
      if (this.currentSelection) {
        eventCenter.dispatch('flowrite-selection-comment', {
          ...this.currentSelection
        })
      }
      this.hide()
      return
    }

    if (item.action === 'paragraph') {
      this.muya.updateParagraph(item.type)
      this.hide()
      return
    }

    this.muya.format(item.type)
    if (/link|image/.test(item.type)) {
      this.hide()
    } else {
      const { formats } = contentState.selectionFormats()
      this.formats = formats
      this.currentSelection = this.captureSelection()
      this.render()
    }
  }
}

export default FormatPicker
