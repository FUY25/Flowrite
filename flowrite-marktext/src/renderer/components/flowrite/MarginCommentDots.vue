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
      :class="{ 'is-active': isActive(thread.id) }"
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
import { SCOPE_MARGIN } from '../../../flowrite/constants'
import {
  bindMarginViewportListeners,
  createEmptyParagraphIndex,
  getMarginEditorContainer,
  getMarginEditorContainerRect,
  getMarginThreadRefreshKey,
  resolveMarginParagraphIndex,
  resolveMarginThreadVerticalPosition
} from './marginShared'

const DOT_VERTICAL_OFFSET = 8

export default {
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
      resolvedThreads: [],
      threadPositionCache: {},
      rafId: null,
      viewportBinding: null
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
    },

    marginThreadRefreshKey () {
      return getMarginThreadRefreshKey(this.marginThreads)
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

    refreshResolvedThreads () {
      const editorContainer = getMarginEditorContainer(this)
      const editorRect = getMarginEditorContainerRect(this)
      if (!editorRect || !editorContainer) {
        this.resolvedThreads = []
        return
      }

      const paragraphIndex = resolveMarginParagraphIndex(this, this.paragraphIndex)
      this.resolvedThreads = this.marginThreads
        .map(thread => {
          const resolvedThread = resolveMarginThread(thread, paragraphIndex.list)
          const position = this.resolveThreadPosition(resolvedThread, paragraphIndex, editorRect, editorContainer)
          if (!position) {
            return null
          }

          return {
            ...resolvedThread,
            dotTop: position.top
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

    isActive (threadId) {
      return this.activeMarginThreadId === threadId
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
</style>
