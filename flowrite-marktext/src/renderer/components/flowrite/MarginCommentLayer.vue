<template>
  <div
    class="flowrite-margin-surface"
    data-testid="flowrite-margin-comments"
  >
    <margin-thread-composer
      v-if="composerMarginThread"
      :anchor="composerMarginThread.anchor"
    ></margin-thread-composer>

    <div
      ref="threadRail"
      class="flowrite-margin-surface__threads"
      :style="{
        height: `${railHeight}px`
      }"
    >
      <margin-thread-card
        v-for="thread in positionedThreads"
        :key="thread.id"
        :ref="`flowrite-margin-thread-${thread.id}`"
        :thread="thread"
        :active="activeMarginThreadId === thread.id"
        :style="{
          top: `${thread.top}px`
        }"
        @focus-thread="activateThread"
        @reply="replyToThread"
        @size-change="scheduleRefresh"
      ></margin-thread-card>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { resolveMarginThread } from '../../../flowrite/anchors'
import { ANCHOR_DETACHED, SCOPE_MARGIN } from '../../../flowrite/constants'
import { buildMarginLayout } from './marginLayout'
import MarginThreadCard from './MarginThreadCard.vue'
import MarginThreadComposer from './MarginThreadComposer.vue'

const THREAD_GAP = 14
const DOT_VERTICAL_OFFSET = 8
const COMPRESSION_DRIFT_THRESHOLD = 80
const COMPRESSION_MESSAGE_COUNT_THRESHOLD = 4

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
      scrollContainer: null
    }
  },
  computed: {
    ...mapState({
      comments: state => state.flowrite.comments,
      composerMarginThread: state => state.flowrite.composerMarginThread,
      markdown: state => (state.editor.currentFile ? state.editor.currentFile.markdown || '' : ''),
      showAnnotationsPane: state => state.flowrite.showAnnotationsPane,
      activeMarginThreadId: state => state.flowrite.activeMarginThreadId
    }),

    marginThreads () {
      return Array.isArray(this.comments)
        ? this.comments.filter(thread => thread && thread.scope === SCOPE_MARGIN)
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
      const visibleCommentCount = collapsed ? Math.min(commentCount, 2) : commentCount
      const baseHeight = collapsed ? 90 : 112

      return baseHeight + (visibleCommentCount * 48) + quoteHeight
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

          return {
            ...resolvedThread,
            order,
            active: this.activeMarginThreadId === resolvedThread.id,
            naturalTop: position.top,
            messageCount: Array.isArray(resolvedThread.comments) ? resolvedThread.comments.length : 0,
            height: this.threadHeights[thread.id] || this.estimateThreadHeight(resolvedThread),
            isDetached: position.detached
          }
        })
        .filter(Boolean)

      this.positionedThreads = buildMarginLayout(threads, {
        gap: THREAD_GAP,
        compressionDriftThreshold: COMPRESSION_DRIFT_THRESHOLD,
        compressionMessageCountThreshold: COMPRESSION_MESSAGE_COUNT_THRESHOLD
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
        const threadElement = this.$refs[`flowrite-margin-thread-${thread.id}`]
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
      this.scrollContainer = null
    },

    isDetached (thread) {
      return Boolean(thread && thread.resolvedAnchor && thread.resolvedAnchor.status === ANCHOR_DETACHED)
    },

    activateThread (threadId) {
      this.$store.dispatch('ACTIVATE_MARGIN_THREAD', threadId)
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
