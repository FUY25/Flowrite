<template>
  <span v-if="false"></span>
</template>

<script>
import { mapState } from 'vuex'
import notice from '../../services/notification'
import { resolveMarginAnchor, resolveMarginThread } from '../../../flowrite/anchors'
import {
  SCOPE_MARGIN,
  ANCHOR_DETACHED,
  SUGGESTION_STATUS_ACCEPTED,
  SUGGESTION_STATUS_APPLIED_IN_BUFFER
} from '../../../flowrite/constants'
import {
  isKeyboardEditIntent,
  isMutatingBeforeInputType,
  selectionOverlapsLockedRanges
} from './lockedRangeGuards'
const ACTIVE_HIGHLIGHT_NAME = 'flowrite-margin-anchor-active'
const UNDERLINE_HIGHLIGHT_NAME = 'flowrite-margin-anchor-underline'
const LOCKED_HIGHLIGHT_NAME = 'flowrite-margin-anchor-locked'
const TRACE_HIGHLIGHT_NAME = 'flowrite-suggestion-trace'
const LOCK_NOTICE_MESSAGE = 'This passage is locked while Flowrite finishes reviewing it.'
const LOCK_NOTICE_COOLDOWN_MS = 1200

const supportsCssHighlights = () => {
  return typeof window !== 'undefined' &&
    typeof window.Highlight === 'function' &&
    typeof CSS !== 'undefined' &&
    CSS.highlights &&
    typeof CSS.highlights.set === 'function'
}

const createRangeFromParagraph = (paragraph, startOffset, endOffset) => {
  if (!paragraph || typeof document === 'undefined') {
    return null
  }

  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let consumed = 0
  let startNode = null
  let endNode = null
  let startNodeOffset = 0
  let endNodeOffset = 0
  let node = null

  const safeStartOffset = Number.isFinite(startOffset) ? startOffset : 0
  const safeEndOffset = Number.isFinite(endOffset) ? endOffset : 0

  while ((node = walker.nextNode())) {
    const nextConsumed = consumed + node.textContent.length
    if (!startNode && safeStartOffset >= consumed && safeStartOffset <= nextConsumed) {
      startNode = node
      startNodeOffset = safeStartOffset - consumed
    }
    if (!endNode && safeEndOffset >= consumed && safeEndOffset <= nextConsumed) {
      endNode = node
      endNodeOffset = safeEndOffset - consumed
    }
    consumed = nextConsumed
  }

  if (!startNode || !endNode) {
    return null
  }

  range.setStart(startNode, startNodeOffset)
  range.setEnd(endNode, endNodeOffset)
  return range
}

export default {
  props: {
    editorRoot: {
      type: Object,
      default: null
    },
    paragraphIndex: {
      type: Object,
      default: () => ({
        list: [],
        byId: new Map()
      })
    }
  },
  data () {
    return {
      interactiveRanges: [],
      lockedRanges: [],
      rafId: null,
      scrollContainer: null,
      resizeObserver: null,
      resizeListener: null,
      clickListener: null,
      beforeInputListener: null,
      keydownListener: null,
      pasteListener: null,
      dropListener: null,
      lastLockNoticeAt: 0
    }
  },
  computed: {
    ...mapState({
      comments: state => state.flowrite.comments,
      suggestions: state => state.flowrite.suggestions,
      composerMarginThread: state => state.flowrite.composerMarginThread,
      inFlightAnchors: state => state.flowrite.inFlightAnchors,
      markdown: state => (state.editor.currentFile ? state.editor.currentFile.markdown || '' : ''),
      showAnnotationsPane: state => state.flowrite.showAnnotationsPane,
      activeMarginThreadId: state => state.flowrite.activeMarginThreadId,
      highlightedMarginThreadIds: state => state.flowrite.highlightedMarginThreadIds
    }),

    marginThreads () {
      return Array.isArray(this.comments)
        ? this.comments.filter(thread => thread && thread.scope === SCOPE_MARGIN)
        : []
    },

    renderedThreads () {
      const threads = this.marginThreads.slice()
      if (this.composerMarginThread && this.composerMarginThread.scope === SCOPE_MARGIN) {
        threads.push(this.composerMarginThread)
      }
      return threads
    },

    highlightedThreadIds () {
      return new Set([
        ...(this.highlightedMarginThreadIds || []),
        this.activeMarginThreadId
      ].filter(Boolean))
    },

    traceableSuggestions () {
      return Array.isArray(this.suggestions)
        ? this.suggestions.filter(suggestion => {
          return suggestion &&
            suggestion.anchor &&
            suggestion.threadId &&
            (
              suggestion.status === SUGGESTION_STATUS_ACCEPTED ||
              suggestion.status === SUGGESTION_STATUS_APPLIED_IN_BUFFER
            )
        })
        : []
    }
  },
  watch: {
    comments: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
    },
    suggestions: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
    },
    markdown () {
      this.scheduleRefresh()
    },
    editorRoot () {
      this.attachListeners()
      this.scheduleRefresh()
    },
    paragraphIndex () {
      this.scheduleRefresh()
    },
    showAnnotationsPane () {
      this.scheduleRefresh()
    },
    composerMarginThread: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
    },
    activeMarginThreadId () {
      this.scheduleRefresh()
    },
    highlightedMarginThreadIds: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
    },
    inFlightAnchors: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
    }
  },
  mounted () {
    this.attachListeners()
    this.scheduleRefresh()
  },
  beforeDestroy () {
    this.detachListeners()
    this.clearNativeHighlights()
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  },
  methods: {
    getEditorContainer () {
      const root = this.getEditorShell()
      if (!root) {
        return null
      }

      return root.querySelector('.editor-component')
    },

    getEditorShell () {
      if (this.editorRoot) {
        return this.editorRoot
      }

      if (this.$el && typeof this.$el.closest === 'function') {
        return this.$el.closest('.editor-main') || this.$el.parentElement || null
      }

      if (typeof document !== 'undefined') {
        const shell = document.querySelector('.editor-main')
        if (shell) {
          return shell
        }
      }

      return this.$el ? this.$el.parentElement : null
    },

    buildFallbackParagraphIndex () {
      const root = this.getEditorShell()
      if (!root) {
        return {
          list: [],
          byId: new Map()
        }
      }

      const list = Array.from(root.querySelectorAll('#ag-editor-id .ag-paragraph[id]')).map(element => ({
        id: element.id,
        text: element.textContent || '',
        element
      }))

      return {
        list,
        byId: new Map(list.map(paragraph => [paragraph.id, paragraph]))
      }
    },

    getParagraphIndex () {
      return this.paragraphIndex && Array.isArray(this.paragraphIndex.list) && this.paragraphIndex.list.length
        ? this.paragraphIndex
        : this.buildFallbackParagraphIndex()
    },

    createThreadRange (paragraphIndex, paragraphId, startOffset, endOffset) {
      const paragraph = paragraphIndex.byId.get(paragraphId)
      if (!paragraph) {
        return null
      }

      return createRangeFromParagraph(paragraph.element, startOffset, endOffset)
    },

    buildResolvedRanges ({
      keyPrefix,
      resolution = {},
      anchor = null,
      threadId = null,
      clickable = false
    } = {}, paragraphIndex) {
      const ranges = Array.isArray(resolution.ranges) && resolution.ranges.length
        ? resolution.ranges
        : [{
          paragraphId: resolution.paragraphId || resolution.startParagraphId || (anchor && anchor.start ? anchor.start.key : ''),
          startOffset: Number.isFinite(resolution.startOffset)
            ? resolution.startOffset
            : (anchor && anchor.start ? anchor.start.offset : 0),
          endOffset: Number.isFinite(resolution.endOffset)
            ? resolution.endOffset
            : (anchor && anchor.end ? anchor.end.offset : 0)
        }]

      return ranges
        .map((rangeEntry, index) => {
          const range = this.createThreadRange(paragraphIndex, rangeEntry.paragraphId, rangeEntry.startOffset, rangeEntry.endOffset)
          return {
            key: `${keyPrefix}:${rangeEntry.paragraphId}:${index}`,
            threadId,
            paragraphId: rangeEntry.paragraphId,
            startOffset: Number.isFinite(rangeEntry.startOffset) ? rangeEntry.startOffset : 0,
            endOffset: Number.isFinite(rangeEntry.endOffset) ? rangeEntry.endOffset : 0,
            detached: resolution.status === ANCHOR_DETACHED,
            clickable,
            range
          }
        })
    },

    buildThreadRanges (thread, paragraphIndex) {
      return this.buildResolvedRanges({
        keyPrefix: thread.id,
        resolution: thread.resolvedAnchor || {},
        anchor: thread.anchor,
        threadId: thread.id,
        clickable: this.marginThreads.some(candidate => candidate && candidate.id === thread.id)
      }, paragraphIndex)
    },

    buildSuggestionRanges (suggestion, paragraphIndex) {
      return this.buildResolvedRanges({
        keyPrefix: `suggestion:${suggestion.id}`,
        resolution: resolveMarginAnchor(suggestion.anchor, paragraphIndex.list),
        anchor: suggestion.anchor,
        threadId: suggestion.threadId,
        clickable: Boolean(suggestion.threadId)
      }, paragraphIndex)
    },

    buildLockedRanges (anchor, paragraphIndex, index) {
      return this.buildResolvedRanges({
        keyPrefix: `lock:${index}`,
        resolution: resolveMarginAnchor(anchor, paragraphIndex.list),
        anchor
      }, paragraphIndex)
    },

    clearNativeHighlights () {
      if (supportsCssHighlights()) {
        CSS.highlights.delete(ACTIVE_HIGHLIGHT_NAME)
        CSS.highlights.delete(UNDERLINE_HIGHLIGHT_NAME)
        CSS.highlights.delete(LOCKED_HIGHLIGHT_NAME)
        CSS.highlights.delete(TRACE_HIGHLIGHT_NAME)
      }
    },

    setNativeHighlight (name, ranges) {
      if (!supportsCssHighlights()) {
        return false
      }

      if (!ranges.length) {
        CSS.highlights.delete(name)
        return true
      }

      CSS.highlights.set(name, new window.Highlight(...ranges))
      return true
    },

    refreshResolvedThreads () {
      const editorContainer = this.getEditorContainer()
      if (!editorContainer) {
        this.interactiveRanges = []
        this.lockedRanges = []
        this.clearNativeHighlights()
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      const resolvedThreads = this.renderedThreads
        .map(thread => resolveMarginThread(thread, paragraphIndex.list))

      const underlinedThreads = this.showAnnotationsPane
        ? resolvedThreads
        : resolvedThreads.filter(thread => this.highlightedThreadIds.has(thread.id))
      const activeThreads = resolvedThreads
        .filter(thread => this.highlightedThreadIds.has(thread.id))
      const lockedRanges = (this.inFlightAnchors || []).flatMap((anchor, index) => {
        return this.buildLockedRanges(anchor, paragraphIndex, index)
      })

      const underlineRanges = underlinedThreads.flatMap(thread => this.buildThreadRanges(thread, paragraphIndex))
      const activeRanges = activeThreads.flatMap(thread => this.buildThreadRanges(thread, paragraphIndex))
      const traceRanges = this.traceableSuggestions.flatMap(suggestion => this.buildSuggestionRanges(suggestion, paragraphIndex))

      this.interactiveRanges = [
        ...underlineRanges,
        ...traceRanges
      ].filter(entry => entry.clickable && entry.range)
      this.lockedRanges = lockedRanges.filter(entry => !entry.detached)
      this.setNativeHighlight(
        UNDERLINE_HIGHLIGHT_NAME,
        underlineRanges.filter(entry => !entry.detached && entry.range).map(entry => entry.range)
      )
      this.setNativeHighlight(
        ACTIVE_HIGHLIGHT_NAME,
        activeRanges.filter(entry => !entry.detached && entry.range).map(entry => entry.range)
      )
      this.setNativeHighlight(
        LOCKED_HIGHLIGHT_NAME,
        this.lockedRanges.filter(entry => entry.range).map(entry => entry.range)
      )
      this.setNativeHighlight(
        TRACE_HIGHLIGHT_NAME,
        traceRanges.filter(entry => !entry.detached && entry.range).map(entry => entry.range)
      )
    },

    scheduleRefresh () {
      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId)
      }

      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null
        this.refreshResolvedThreads()
      })
    },

    getParagraphElementForNode (node) {
      if (!node) {
        return null
      }

      const element = node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement

      return element && typeof element.closest === 'function'
        ? element.closest('.ag-paragraph[id]')
        : null
    },

    getOffsetWithinParagraph (paragraph, node, offset) {
      if (!paragraph || !node || typeof document === 'undefined') {
        return null
      }

      const probe = document.createRange()
      probe.selectNodeContents(paragraph)

      try {
        probe.setEnd(node, Number.isFinite(offset) ? offset : 0)
      } catch (error) {
        return null
      }

      return probe.toString().length
    },

    buildSelectionRangesFromDomRange (domRange, paragraphIndex) {
      if (!domRange) {
        return []
      }

      const startParagraph = this.getParagraphElementForNode(domRange.startContainer)
      const endParagraph = this.getParagraphElementForNode(domRange.endContainer)
      if (!startParagraph || !endParagraph) {
        return []
      }

      const startIndex = paragraphIndex.list.findIndex(paragraph => paragraph.id === startParagraph.id)
      const endIndex = paragraphIndex.list.findIndex(paragraph => paragraph.id === endParagraph.id)
      if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
        return []
      }

      const startOffset = this.getOffsetWithinParagraph(startParagraph, domRange.startContainer, domRange.startOffset)
      const endOffset = this.getOffsetWithinParagraph(endParagraph, domRange.endContainer, domRange.endOffset)
      if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
        return []
      }

      return paragraphIndex.list.slice(startIndex, endIndex + 1).map((paragraph, index, ranges) => {
        const isFirst = index === 0
        const isLast = index === ranges.length - 1
        const paragraphLength = paragraph.text.length
        const paragraphStart = isFirst
          ? Math.min(startOffset, paragraphLength)
          : 0
        const paragraphEnd = isLast
          ? Math.min(Math.max(endOffset, isFirst ? paragraphStart : 0), paragraphLength)
          : paragraphLength

        return {
          paragraphId: paragraph.id,
          startOffset: paragraphStart,
          endOffset: paragraphEnd
        }
      })
    },

    getSelectionRanges (paragraphIndex) {
      const selection = typeof window !== 'undefined' && typeof window.getSelection === 'function'
        ? window.getSelection()
        : null
      if (!selection || !selection.rangeCount) {
        return []
      }

      const ranges = []
      for (let index = 0; index < selection.rangeCount; index += 1) {
        ranges.push(...this.buildSelectionRangesFromDomRange(selection.getRangeAt(index), paragraphIndex))
      }

      return ranges
    },

    getTargetSelectionRanges (event, paragraphIndex) {
      const targetRanges = event && typeof event.getTargetRanges === 'function'
        ? Array.from(event.getTargetRanges() || [])
        : []
      const resolvedRanges = targetRanges.flatMap(range => this.buildSelectionRangesFromDomRange(range, paragraphIndex))

      return resolvedRanges.length
        ? resolvedRanges
        : this.getSelectionRanges(paragraphIndex)
    },

    selectionHitsLockedRanges (selectionRanges) {
      return this.lockedRanges.length > 0 &&
        selectionOverlapsLockedRanges(selectionRanges, this.lockedRanges)
    },

    showLockNotice () {
      const now = Date.now()
      if (now - this.lastLockNoticeAt < LOCK_NOTICE_COOLDOWN_MS) {
        return
      }

      this.lastLockNoticeAt = now
      notice.notify({
        time: 2200,
        title: 'Flowrite',
        message: LOCK_NOTICE_MESSAGE,
        type: 'warning'
      }).catch(() => {})
    },

    blockEditEvent (event) {
      if (!event) {
        return
      }

      if (typeof event.preventDefault === 'function') {
        event.preventDefault()
      }
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation()
      }

      this.showLockNotice()
    },

    handleBeforeInput (event) {
      if (!this.lockedRanges.length || !isMutatingBeforeInputType(event && event.inputType)) {
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      if (this.selectionHitsLockedRanges(this.getTargetSelectionRanges(event, paragraphIndex))) {
        this.blockEditEvent(event)
      }
    },

    handleKeydown (event) {
      if (!this.lockedRanges.length || !isKeyboardEditIntent(event)) {
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      if (this.selectionHitsLockedRanges(this.getSelectionRanges(paragraphIndex))) {
        this.blockEditEvent(event)
      }
    },

    handlePaste (event) {
      if (!this.lockedRanges.length) {
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      if (this.selectionHitsLockedRanges(this.getSelectionRanges(paragraphIndex))) {
        this.blockEditEvent(event)
      }
    },

    handleDrop (event) {
      if (!this.lockedRanges.length) {
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      if (this.selectionHitsLockedRanges(this.getSelectionRanges(paragraphIndex))) {
        this.blockEditEvent(event)
      }
    },

    attachListeners () {
      this.detachListeners()

      this.resizeListener = () => {
        this.scheduleRefresh()
      }
      window.addEventListener('resize', this.resizeListener)

      const container = this.getEditorContainer()
      if (container) {
        this.scrollContainer = container

        this.clickListener = event => {
          const caretRange = typeof document.caretRangeFromPoint === 'function'
            ? document.caretRangeFromPoint(event.clientX, event.clientY)
            : null
          const caretPosition = !caretRange && typeof document.caretPositionFromPoint === 'function'
            ? document.caretPositionFromPoint(event.clientX, event.clientY)
            : null
          const node = caretRange
            ? caretRange.startContainer
            : (caretPosition ? caretPosition.offsetNode : null)
          const offset = caretRange
            ? caretRange.startOffset
            : (caretPosition ? caretPosition.offset : null)

          if (!node || !Number.isFinite(offset)) {
            return
          }

          const match = this.interactiveRanges.find(entry => {
            if (!entry || !entry.range || typeof entry.range.comparePoint !== 'function') {
              return false
            }

            try {
              return entry.range.comparePoint(node, offset) === 0
            } catch (error) {
              return false
            }
          })

          if (match) {
            event.preventDefault()
            this.activateThread(match.threadId)
          }
        }

        container.addEventListener('click', this.clickListener, true)

        this.beforeInputListener = event => {
          this.handleBeforeInput(event)
        }
        this.keydownListener = event => {
          this.handleKeydown(event)
        }
        this.pasteListener = event => {
          this.handlePaste(event)
        }
        this.dropListener = event => {
          this.handleDrop(event)
        }

        container.addEventListener('beforeinput', this.beforeInputListener, true)
        container.addEventListener('keydown', this.keydownListener, true)
        container.addEventListener('paste', this.pasteListener, true)
        container.addEventListener('drop', this.dropListener, true)

        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => {
            this.scheduleRefresh()
          })
          this.resizeObserver.observe(container)
        }
      }
    },

    detachListeners () {
      if (this.resizeListener) {
        window.removeEventListener('resize', this.resizeListener)
        this.resizeListener = null
      }

      if (this.scrollContainer && this.clickListener) {
        this.scrollContainer.removeEventListener('click', this.clickListener, true)
      }
      if (this.scrollContainer && this.beforeInputListener) {
        this.scrollContainer.removeEventListener('beforeinput', this.beforeInputListener, true)
      }
      if (this.scrollContainer && this.keydownListener) {
        this.scrollContainer.removeEventListener('keydown', this.keydownListener, true)
      }
      if (this.scrollContainer && this.pasteListener) {
        this.scrollContainer.removeEventListener('paste', this.pasteListener, true)
      }
      if (this.scrollContainer && this.dropListener) {
        this.scrollContainer.removeEventListener('drop', this.dropListener, true)
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
        this.resizeObserver = null
      }
      this.scrollContainer = null
      this.clickListener = null
      this.beforeInputListener = null
      this.keydownListener = null
      this.pasteListener = null
      this.dropListener = null
    },

    activateThread (threadId) {
      if (!threadId) {
        return
      }

      this.$store.dispatch('ACTIVATE_MARGIN_THREAD', threadId)
    }
  }
}
</script>

<style>
  ::highlight(flowrite-margin-anchor-locked) {
    background-color: rgba(210, 153, 51, 0.18);
    color: inherit;
    text-decoration-line: underline;
    text-decoration-style: solid;
    text-decoration-color: rgba(210, 153, 51, 0.68);
    text-decoration-thickness: 1.5px;
    text-decoration-skip-ink: none;
    text-underline-offset: 0.14em;
  }
</style>
