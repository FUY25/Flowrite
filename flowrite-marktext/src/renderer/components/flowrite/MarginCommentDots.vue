<template>
  <div
    v-if="resolvedThreads.length"
    class="flowrite-margin-dots"
    aria-hidden="true"
  >
    <button
      v-for="thread in resolvedThreads"
      :key="thread.id"
      type="button"
      class="flowrite-margin-dot"
      :class="[
        { 'is-active': isActive(thread.id) },
        { 'is-detached': isDetached(thread) }
      ]"
      :style="{
        top: `${thread.dotTop}px`
      }"
      :aria-label="dotLabel(thread)"
      data-testid="flowrite-margin-dot"
      @click="activateThread(thread.id)"
    >
      <span class="flowrite-margin-dot__core"></span>
    </button>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { resolveMarginThread } from '../../../flowrite/anchors'
import { ANCHOR_DETACHED, SCOPE_MARGIN } from '../../../flowrite/constants'

const DOT_VERTICAL_OFFSET = 8

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
      resolvedThreads: [],
      threadPositionCache: {},
      rafId: null,
      resizeObserver: null,
      resizeListener: null
    }
  },
  computed: {
    ...mapState({
      comments: state => state.flowrite.comments,
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

      if (typeof document !== 'undefined') {
        const shell = document.querySelector('.editor-main')
        if (shell) {
          return shell
        }
      }

      return this.$el ? this.$el.parentElement : null
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

    getFallbackDotTop (threadId, editorRect, editorContainer, paragraphIndex) {
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
      if (!firstRange || !editorRect) {
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
          top: this.getFallbackDotTop(thread.id, editorRect, editorContainer, paragraphIndex),
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

    refreshResolvedThreads () {
      const editorContainer = this.getEditorContainer()
      const editorRect = this.getEditorContainerRect()
      if (!editorRect || !editorContainer) {
        this.resolvedThreads = []
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      this.resolvedThreads = this.marginThreads
        .map(thread => {
          const resolvedThread = resolveMarginThread(thread, paragraphIndex.list)
          const position = this.resolveThreadPosition(resolvedThread, paragraphIndex, editorRect, editorContainer)
          if (!position) {
            return null
          }

          return {
            ...resolvedThread,
            dotTop: position.top,
            isDetached: position.detached
          }
        })
        .filter(Boolean)
        .sort((left, right) => left.dotTop - right.dotTop)
      this.threadPositionCache = this.resolvedThreads.reduce((cache, thread) => {
        cache[thread.id] = thread.dotTop
        return cache
      }, { ...this.threadPositionCache })
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
    },

    isActive (threadId) {
      return this.activeMarginThreadId === threadId
    },

    isDetached (thread) {
      return Boolean(thread && thread.isDetached)
    },

    dotLabel (thread) {
      const quote = thread && thread.anchor && thread.anchor.quote ? thread.anchor.quote : 'selected passage'
      return `Open margin comment on ${quote}`
    },

    activateThread (threadId) {
      if (this.activeMarginThreadId === threadId && this.showAnnotationsPane) {
        this.$store.dispatch('CLOSE_FLOWRITE_ANNOTATIONS_PANE')
        return
      }

      this.$store.dispatch('ACTIVATE_MARGIN_THREAD', threadId)
    }
  }
}
</script>

<style scoped>
  .flowrite-margin-dots {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
  }

  .flowrite-margin-dot {
    position: absolute;
    right: 10px;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    box-shadow: none;
    pointer-events: auto;
    cursor: pointer;
  }

  .flowrite-margin-dot__core {
    display: block;
    width: 8px;
    height: 8px;
    margin: 2px auto 0;
    border-radius: 999px;
    background: rgba(210, 153, 51, 0.82);
    box-shadow: none;
  }

  .flowrite-margin-dot.is-active {
    background: transparent;
  }

  .flowrite-margin-dot.is-active .flowrite-margin-dot__core {
    background: rgba(210, 153, 51, 0.96);
  }

  .flowrite-margin-dot.is-detached {
    opacity: 0.72;
  }
</style>
