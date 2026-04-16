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
          :style="{
            top: `${thread.top}px`
          }"
          @focus-thread="activateThread"
          @reply="replyToThread"
          @size-change="scheduleRefresh"
        ></margin-thread-card>
      </template>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { resolveMarginThread } from '../../../flowrite/anchors'
import { SCOPE_MARGIN } from '../../../flowrite/constants'
import { FLOWRITE_MARGIN_THREAD_COMPOSER_ID } from '../../../flowrite/commentUi'
import { buildMarginLayout } from './marginLayout'
import {
  bindMarginViewportListeners,
  createEmptyParagraphIndex,
  getMarginEditorContainer,
  getMarginEditorContainerRect,
  getMarginThreadRefreshKey,
  resolveComposerThreadId,
  resolveMarginParagraphIndex,
  resolveMarginThreadVerticalPosition
} from './marginShared'
import MarginThreadCard from './MarginThreadCard.vue'
import MarginThreadComposer from './MarginThreadComposer.vue'

const THREAD_GAP = 14
const DOT_VERTICAL_OFFSET = 8
const COMPRESSION_DRIFT_THRESHOLD = 80

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
      default: createEmptyParagraphIndex
    }
  },
  data () {
    return {
      positionedThreads: [],
      threadHeights: {},
      threadPositionCache: {},
      railHeight: 0,
      rafId: null,
      viewportBinding: null
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
    },

    marginThreadRefreshKey () {
      return getMarginThreadRefreshKey(this.marginThreads)
    },

    composerThreadRefreshKey () {
      return this.composerMarginThread
        ? getMarginThreadRefreshKey([this.composerMarginThread])
        : ''
    }
  },
  watch: {
    marginThreadRefreshKey () {
      this.scheduleRefresh()
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
    },

    composerThreadRefreshKey () {
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
    resolveThreadPosition (thread, paragraphIndex, editorRect, editorContainer) {
      return resolveMarginThreadVerticalPosition({
        thread,
        paragraphIndex,
        editorRect,
        editorContainer,
        positionCache: this.threadPositionCache,
        verticalOffset: DOT_VERTICAL_OFFSET
      })
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
      const editorContainer = getMarginEditorContainer(this)
      const editorRect = getMarginEditorContainerRect(this)
      if (!editorRect || !editorContainer) {
        this.positionedThreads = []
        this.railHeight = 0
        return
      }

      const paragraphIndex = resolveMarginParagraphIndex(this, this.paragraphIndex)
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
            height: this.threadHeights[thread.id] || this.estimateThreadHeight(resolvedThread)
          }
        })
        .filter(Boolean)

      if (this.composerMarginThread && this.composerMarginThread.anchor) {
        const resolvedComposer = resolveMarginThread(this.composerMarginThread, paragraphIndex.list)
        const composerPosition = this.resolveThreadPosition(resolvedComposer, paragraphIndex, editorRect, editorContainer)
        if (composerPosition) {
          threads.push({
            ...resolvedComposer,
            id: resolveComposerThreadId(this.composerMarginThread.id),
            order: threads.length,
            active: true,
            naturalTop: composerPosition.top,
            messageCount: 0,
            height: this.threadHeights[FLOWRITE_MARGIN_THREAD_COMPOSER_ID] || this.estimateThreadHeight(resolvedComposer),
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
      this.viewportBinding = bindMarginViewportListeners(this, {
        onRefresh: () => {
          this.scheduleRefresh()
        }
      })
    },

    detachListeners () {
      if (this.viewportBinding) {
        this.viewportBinding.teardown()
        this.viewportBinding = null
      }
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
