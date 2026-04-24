<template>
  <div
    class="flowrite-margin-surface"
    data-testid="flowrite-margin-comments"
  >
    <div
      ref="threadRail"
      class="flowrite-margin-surface__threads"
      :style="{
        height: `${railHeight}px`
      }"
    >
      <template v-for="thread in positionedThreads">
        <margin-thread-composer
          v-if="thread.isComposer"
          :key="thread.id"
          :ref="`flowrite-margin-entry-${thread.id}`"
          :thread="thread"
          positioned
          :style="{
            top: `${thread.top}px`
          }"
          @size-change="scheduleRefresh"
        ></margin-thread-composer>
        <margin-thread-card
          v-else
          :key="thread.id"
          :ref="`flowrite-margin-entry-${thread.id}`"
          :thread="thread"
          :active="activeMarginThreadId === thread.id"
          :suggestions="threadSuggestionsById[thread.id] || []"
          :suggestion-pending-id="suggestionPendingByThreadId[thread.id] || ''"
          :suggestion-error="suggestionErrorsByThreadId[thread.id] || ''"
          :style="{
            top: `${thread.top}px`
          }"
          @focus-thread="activateThread"
          @reply="replyToThread"
          @request-suggestion="requestSuggestion"
          @accept-suggestion="acceptSuggestion"
          @reject-suggestion="rejectSuggestion"
          @size-change="scheduleRefresh"
        ></margin-thread-card>
      </template>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { resolveMarginThread } from '../../../flowrite/anchors'
import {
  ANCHOR_DETACHED,
  SCOPE_MARGIN,
  SUGGESTION_STATUS_ACCEPTED,
  SUGGESTION_STATUS_REJECTED
} from '../../../flowrite/constants'
import { buildMarginLayout } from './marginLayout'
import MarginThreadCard from './MarginThreadCard.vue'
import MarginThreadComposer from './MarginThreadComposer.vue'

const THREAD_GAP = 14
const DOT_VERTICAL_OFFSET = 8
const COMPRESSION_DRIFT_THRESHOLD = 80

const sortSuggestions = suggestions => {
  return suggestions.slice().sort((left, right) => {
    const leftTime = new Date(left && left.createdAt ? left.createdAt : 0).getTime()
    const rightTime = new Date(right && right.createdAt ? right.createdAt : 0).getTime()
    return rightTime - leftTime
  })
}

export default {
  components: {
    MarginThreadCard,
    MarginThreadComposer
  },
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
      positionedThreads: [],
      threadHeights: {},
      threadPositionCache: {},
      railHeight: 0,
      rafId: null,
      resizeObserver: null,
      resizeListener: null,
      scrollContainer: null,
      scrollListener: null,
      suggestionActionPendingId: '',
      suggestionErrorsByThreadId: {}
    }
  },
  computed: {
    ...mapState({
      comments: state => state.flowrite.comments,
      suggestions: state => state.flowrite.suggestions,
      composerMarginThread: state => state.flowrite.composerMarginThread,
      markdown: state => (state.editor.currentFile ? state.editor.currentFile.markdown || '' : ''),
      showAnnotationsPane: state => state.flowrite.showAnnotationsPane,
      activeMarginThreadId: state => state.flowrite.activeMarginThreadId
    }),

    marginThreads () {
      return Array.isArray(this.comments)
        ? this.comments.filter(thread => thread && thread.scope === SCOPE_MARGIN)
        : []
    },

    threadSuggestionsById () {
      const grouped = {}
      const entries = Array.isArray(this.suggestions) ? this.suggestions : []

      entries.forEach(suggestion => {
        if (!suggestion || !suggestion.threadId) {
          return
        }

        if (
          suggestion.status === SUGGESTION_STATUS_ACCEPTED ||
          suggestion.status === SUGGESTION_STATUS_REJECTED
        ) {
          return
        }

        if (!grouped[suggestion.threadId]) {
          grouped[suggestion.threadId] = []
        }
        grouped[suggestion.threadId].push(suggestion)
      })

      Object.keys(grouped).forEach(threadId => {
        grouped[threadId] = sortSuggestions(grouped[threadId])
      })

      return grouped
    },

    suggestionPendingByThreadId () {
      if (!this.suggestionActionPendingId) {
        return {}
      }

      const suggestion = (Array.isArray(this.suggestions) ? this.suggestions : []).find(entry => entry && entry.id === this.suggestionActionPendingId)
      if (!suggestion || !suggestion.threadId) {
        return {}
      }

      return {
        [suggestion.threadId]: suggestion.id
      }
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

    activeMarginThreadId () {
      this.scheduleRefresh()
    }
  },
  mounted () {
    this.attachListeners()
    this.scheduleRefresh()
  },
  beforeDestroy () {
    this.detachListeners()
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

      return this.$el ? this.$el.parentElement : null
    },

    getRailElement () {
      return this.$refs.threadRail || null
    },

    getEditorContainerRect () {
      const container = this.getEditorContainer()
      return container ? container.getBoundingClientRect() : null
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

    getFallbackThreadTop (threadId, editorRect, editorContainer, paragraphIndex) {
      const cachedTop = this.threadPositionCache[threadId]
      if (Number.isFinite(cachedTop)) {
        return cachedTop
      }

      const fallbackParagraph = Array.isArray(paragraphIndex && paragraphIndex.list) && paragraphIndex.list.length
        ? paragraphIndex.list[0]
        : null
      const fallbackRect = fallbackParagraph && fallbackParagraph.element
        ? fallbackParagraph.element.getBoundingClientRect()
        : null

      if (!fallbackRect || !editorRect || !editorContainer) {
        return 0
      }

      return Math.max(0, fallbackRect.top - editorRect.top + editorContainer.scrollTop + DOT_VERTICAL_OFFSET)
    },

    resolveThreadPosition (thread, paragraphIndex, editorRect, editorContainer) {
      const resolution = thread.resolvedAnchor || {}
      const ranges = Array.isArray(resolution.ranges) && resolution.ranges.length
        ? resolution.ranges
        : [{
          paragraphId: resolution.paragraphId || resolution.startParagraphId || (thread.anchor && thread.anchor.start ? thread.anchor.start.key : ''),
          startOffset: Number.isFinite(resolution.startOffset)
            ? resolution.startOffset
            : (thread.anchor && thread.anchor.start ? thread.anchor.start.offset : 0),
          endOffset: Number.isFinite(resolution.endOffset)
            ? resolution.endOffset
            : (thread.anchor && thread.anchor.end ? thread.anchor.end.offset : 0)
        }]

      const firstRange = ranges[0]
      if (!firstRange || !editorRect || !editorContainer) {
        return null
      }

      const paragraph = paragraphIndex.byId.get(firstRange.paragraphId)
      const rect = paragraph && paragraph.element
        ? paragraph.element.getBoundingClientRect()
        : null

      if (!rect) {
        if (resolution.status !== ANCHOR_DETACHED) {
          return null
        }

        return {
          top: this.getFallbackThreadTop(thread.id, editorRect, editorContainer, paragraphIndex),
          status: resolution.status || '',
          detached: true
        }
      }

      return {
        top: Math.max(0, rect.top - editorRect.top + editorContainer.scrollTop + DOT_VERTICAL_OFFSET),
        status: resolution.status || '',
        detached: resolution.status === ANCHOR_DETACHED
      }
    },

    estimateThreadHeight (thread) {
      const commentCount = Number.isFinite(thread && thread.messageCount)
        ? thread.messageCount
        : (Array.isArray(thread.comments) ? thread.comments.length : 0)
      const quoteHeight = thread.anchor && thread.anchor.quote ? 36 : 0
      const collapsed = Boolean(thread && thread.collapsed)
      const suggestionCount = Number.isFinite(thread && thread.suggestionCount)
        ? thread.suggestionCount
        : (Array.isArray(thread && thread.suggestions) ? thread.suggestions.length : 0)
      const visibleCommentCount = collapsed ? Math.min(commentCount, 2) : commentCount
      const baseHeight = collapsed ? 90 : 112
      const suggestionHeight = suggestionCount > 0 ? (suggestionCount * 148) : 0

      return baseHeight + (visibleCommentCount * 48) + quoteHeight + suggestionHeight
    },

    refreshResolvedThreads () {
      const editorContainer = this.getEditorContainer()
      const editorRect = this.getEditorContainerRect()
      if (!editorRect || !editorContainer) {
        this.positionedThreads = []
        this.railHeight = 0
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      const threads = this.marginThreads
        .map((thread, order) => {
          const resolvedThread = resolveMarginThread(thread, paragraphIndex.list)
          const position = this.resolveThreadPosition(resolvedThread, paragraphIndex, editorRect, editorContainer)
          if (!position) {
            return null
          }

          const suggestions = this.threadSuggestionsById[resolvedThread.id] || []

          return {
            ...resolvedThread,
            order,
            active: this.activeMarginThreadId === resolvedThread.id,
            naturalTop: position.top,
            messageCount: Array.isArray(resolvedThread.comments) ? resolvedThread.comments.length : 0,
            suggestionCount: suggestions.length,
            suggestions,
            height: this.threadHeights[thread.id] || this.estimateThreadHeight({
              ...resolvedThread,
              suggestions,
              suggestionCount: suggestions.length
            }),
            isDetached: position.detached
          }
        })
        .filter(Boolean)

      if (this.composerMarginThread && this.composerMarginThread.anchor) {
        const resolvedComposer = resolveMarginThread(this.composerMarginThread, paragraphIndex.list)
        const composerPosition = this.resolveThreadPosition(resolvedComposer, paragraphIndex, editorRect, editorContainer)
        if (composerPosition) {
          threads.push({
            ...resolvedComposer,
            id: this.composerMarginThread.id || 'flowrite-margin-thread-composer',
            order: threads.length,
            active: true,
            naturalTop: composerPosition.top,
            messageCount: 0,
            suggestionCount: 0,
            height: this.threadHeights['flowrite-margin-thread-composer'] || this.estimateThreadHeight(resolvedComposer),
            isDetached: false,
            isComposer: true
          })
        }
      }

      this.positionedThreads = buildMarginLayout(threads, {
        gap: THREAD_GAP,
        compressionDriftThreshold: COMPRESSION_DRIFT_THRESHOLD
      })
      this.threadPositionCache = this.positionedThreads.reduce((cache, thread) => {
        cache[thread.id] = thread.top
        return cache
      }, { ...this.threadPositionCache })
      this.railHeight = Math.max(
        editorContainer.scrollHeight,
        this.positionedThreads.length
          ? this.positionedThreads[this.positionedThreads.length - 1].bottom + THREAD_GAP
          : 0
      )

      this.$nextTick(() => {
        this.syncThreadHeights()
      })
    },

    syncThreadHeights () {
      const nextHeights = { ...this.threadHeights }
      let didChange = false

      this.positionedThreads.forEach(thread => {
        const threadElement = this.$refs[`flowrite-margin-entry-${thread.id}`]
        const target = Array.isArray(threadElement) ? threadElement[0] : threadElement
        const element = target && target.$el ? target.$el : target
        if (!element || typeof element.getBoundingClientRect !== 'function') {
          return
        }

        const height = Math.ceil(element.getBoundingClientRect().height)
        if (!height) {
          return
        }

        if (Math.abs((nextHeights[thread.id] || 0) - height) > 1) {
          nextHeights[thread.id] = height
          didChange = true
        }
      })

      if (didChange) {
        this.threadHeights = nextHeights
        this.scheduleRefresh()
      }
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

    attachListeners () {
      this.detachListeners()

      this.resizeListener = () => {
        this.scheduleRefresh()
      }
      window.addEventListener('resize', this.resizeListener)

      const container = this.getEditorContainer()
      if (container) {
        this.scrollContainer = container
        this.scrollListener = () => {
          this.scheduleRefresh()
        }
        container.addEventListener('scroll', this.scrollListener)

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

      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
        this.resizeObserver = null
      }

      if (this.scrollContainer && this.scrollListener) {
        this.scrollContainer.removeEventListener('scroll', this.scrollListener)
      }
      this.scrollContainer = null
      this.scrollListener = null
    },

    isDetached (thread) {
      return Boolean(thread && thread.resolvedAnchor && thread.resolvedAnchor.status === ANCHOR_DETACHED)
    },

    activateThread (threadId) {
      this.$store.dispatch('ACTIVATE_MARGIN_THREAD', threadId)
    },

    clearSuggestionError (threadId) {
      if (!threadId || !this.suggestionErrorsByThreadId[threadId]) {
        return
      }

      this.$delete(this.suggestionErrorsByThreadId, threadId)
      this.scheduleRefresh()
    },

    setSuggestionError (threadId, error) {
      if (!threadId) {
        return
      }

      const message = error && error.message
        ? error.message
        : 'This rewrite could not be completed.'
      this.$set(this.suggestionErrorsByThreadId, threadId, message)
      this.scheduleRefresh()
    },

    async replyToThread ({ threadId, body, resolve, reject } = {}) {
      if (!threadId || !body) {
        if (typeof reject === 'function') {
          reject(new Error('Flowrite replies require a thread and message body.'))
        }
        return
      }

      const thread = this.marginThreads.find(candidate => candidate && candidate.id === threadId)
      if (!thread || !thread.anchor) {
        if (typeof reject === 'function') {
          reject(new Error('This Flowrite margin thread is no longer available.'))
        }
        return
      }

      try {
        await this.$store.dispatch('REPLY_TO_MARGIN_THREAD', {
          threadId,
          body,
          anchor: thread.anchor
        })
        this.clearSuggestionError(threadId)
        if (typeof resolve === 'function') {
          resolve()
        }
      } catch (error) {
        if (typeof reject === 'function') {
          reject(error)
          return
        }
        throw error
      }
    },

    async requestSuggestion ({ threadId, body, anchor, resolve, reject } = {}) {
      const thread = threadId
        ? this.marginThreads.find(candidate => candidate && candidate.id === threadId)
        : null
      const requestAnchor = thread && thread.anchor ? thread.anchor : anchor
      const resolvedThreadId = threadId || (thread && thread.id) || ''

      if (!body || !requestAnchor) {
        const error = new Error('Flowrite rewrite suggestions require an anchored selection.')
        if (typeof reject === 'function') {
          reject(error)
        }
        return
      }

      this.clearSuggestionError(resolvedThreadId)

      try {
        await this.$store.dispatch('REQUEST_SUGGESTION', {
          body,
          anchor: requestAnchor
        })
        if (typeof resolve === 'function') {
          resolve()
        }
      } catch (error) {
        this.setSuggestionError(resolvedThreadId, error)
        if (typeof reject === 'function') {
          reject(error)
          return
        }
        throw error
      }
    },

    async acceptSuggestion (suggestionId) {
      if (!suggestionId) {
        return
      }

      const suggestion = (Array.isArray(this.suggestions) ? this.suggestions : []).find(entry => entry && entry.id === suggestionId)
      const threadId = suggestion && suggestion.threadId ? suggestion.threadId : ''

      this.suggestionActionPendingId = suggestionId
      this.clearSuggestionError(threadId)
      try {
        await this.$store.dispatch('ACCEPT_SUGGESTION', suggestionId)
      } catch (error) {
        this.setSuggestionError(threadId, error)
      } finally {
        this.suggestionActionPendingId = ''
        this.scheduleRefresh()
      }
    },

    async rejectSuggestion (suggestionId) {
      if (!suggestionId) {
        return
      }

      const suggestion = (Array.isArray(this.suggestions) ? this.suggestions : []).find(entry => entry && entry.id === suggestionId)
      const threadId = suggestion && suggestion.threadId ? suggestion.threadId : ''

      this.suggestionActionPendingId = suggestionId
      this.clearSuggestionError(threadId)
      try {
        await this.$store.dispatch('REJECT_SUGGESTION', suggestionId)
      } catch (error) {
        this.setSuggestionError(threadId, error)
      } finally {
        this.suggestionActionPendingId = ''
        this.scheduleRefresh()
      }
    }
  }
}
</script>

<style scoped>
  .flowrite-margin-surface {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    width: min(280px, max(248px, 24vw));
    padding: 18px 16px 22px;
    pointer-events: none;
  }

  .flowrite-margin-surface__threads {
    position: relative;
    min-height: 100%;
    pointer-events: auto;
  }

  .flowrite-margin-surface :deep(.flowrite-margin-thread-composer) {
    pointer-events: auto;
  }
</style>
