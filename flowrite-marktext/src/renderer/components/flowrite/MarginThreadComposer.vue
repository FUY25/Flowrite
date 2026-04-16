<template>
  <div
    v-if="composerThread"
    class="flowrite-margin-thread-composer"
    :class="{ 'is-positioned': positioned }"
    data-testid="flowrite-margin-thread-composer"
    @click.stop
    @mousedown.stop
    @keydown.stop
    @keypress.stop
    @keyup.stop
    @input.stop
  >
    <margin-thread-card
      composer
      :thread="composerThread"
      :positioned="false"
      :submitting="submitting"
      :error="error"
      @submit-composer="submitComposer"
      @close-composer="closeComposer"
      @size-change="$emit('size-change')"
    ></margin-thread-card>
  </div>
</template>

<script>
import { SCOPE_MARGIN, AUTHOR_USER } from '../../../flowrite/constants'
import { FLOWRITE_MARGIN_THREAD_COMPOSER_ID } from '../../../flowrite/commentUi'
import MarginThreadCard from './MarginThreadCard.vue'

export default {
  components: {
    MarginThreadCard
  },
  props: {
    thread: {
      type: Object,
      default: null
    },
    anchor: {
      type: Object,
      default: null
    },
    positioned: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      submitting: false,
      error: ''
    }
  },
  computed: {
    sourceAnchor () {
      if (this.thread && this.thread.anchor) {
        return this.thread.anchor
      }

      return this.anchor || null
    },

    composerThread () {
      if (this.thread) {
        return this.thread
      }

      return this.sourceAnchor
        ? {
          id: FLOWRITE_MARGIN_THREAD_COMPOSER_ID,
          scope: SCOPE_MARGIN,
          anchor: this.sourceAnchor,
          comments: [],
          collapsed: false
        }
        : null
    }
  },
  watch: {
    sourceAnchor: {
      immediate: true,
      handler () {
        this.submitting = false
        this.error = ''
      }
    }
  },
  methods: {
    anchorsMatch (leftAnchor, rightAnchor) {
      if (!leftAnchor || !rightAnchor) {
        return false
      }

      const leftStart = leftAnchor.start || {}
      const rightStart = rightAnchor.start || {}
      const leftEnd = leftAnchor.end || {}
      const rightEnd = rightAnchor.end || {}

      return leftAnchor.quote === rightAnchor.quote &&
        leftStart.key === rightStart.key &&
        leftStart.offset === rightStart.offset &&
        leftEnd.key === rightEnd.key &&
        leftEnd.offset === rightEnd.offset
    },

    closeComposer () {
      this.$store.dispatch('CLOSE_FLOWRITE_MARGIN_COMPOSER', {
        restoreAnnotationsPane: true
      })
    },

    closeAfterPersist (pendingBody) {
      if (!this.hasPersistedCommentWithBody(pendingBody)) {
        return false
      }

      this.$store.dispatch('CLOSE_FLOWRITE_MARGIN_COMPOSER', {
        restoreAnnotationsPane: false
      })
      return true
    },

    hasPersistedCommentWithBody (body) {
      const trimmedBody = typeof body === 'string' ? body.trim() : ''
      if (!trimmedBody || !this.sourceAnchor) {
        return false
      }

      const comments = this.$store && this.$store.state && this.$store.state.flowrite
        ? this.$store.state.flowrite.comments
        : []

      return Array.isArray(comments) && comments.some(thread => (
        thread &&
        thread.scope === SCOPE_MARGIN &&
        this.anchorsMatch(thread.anchor, this.sourceAnchor) &&
        Array.isArray(thread.comments) &&
        thread.comments.some(comment => comment && comment.author === AUTHOR_USER)
      ))
    },

    async submitComposer ({ body, anchor, resolve, reject } = {}) {
      if (!body || !anchor || this.submitting) {
        if (typeof reject === 'function') {
          reject(new Error('Unable to post this margin comment.'))
        }
        return
      }

      const pendingBody = body.trim()
      this.submitting = true
      this.error = ''
      let unwatch = null

      try {
        const submitPromise = this.$store.dispatch('SUBMIT_MARGIN_COMMENT', {
          body: pendingBody,
          anchor
        })

        unwatch = this.$store.watch(
          state => state.flowrite.comments,
          () => {
            if (unwatch && this.closeAfterPersist(pendingBody)) {
              unwatch()
              unwatch = null
            }
          },
          {
            deep: true
          }
        )

        await submitPromise
        this.closeAfterPersist(pendingBody)

        if (typeof resolve === 'function') {
          resolve()
        }
      } catch (error) {
        if (this.closeAfterPersist(pendingBody)) {
          if (typeof resolve === 'function') {
            resolve()
          }
          return
        }

        this.error = error && error.message ? error.message : 'Unable to post this margin comment.'
        if (typeof reject === 'function') {
          reject(error)
        }
      } finally {
        if (unwatch) {
          unwatch()
          unwatch = null
        }

        if (!this._isDestroyed && !this._isBeingDestroyed) {
          this.submitting = false
        }
      }
    }
  }
}
</script>

<style scoped>
  .flowrite-margin-thread-composer {
    position: relative;
    z-index: 2;
    pointer-events: auto;
  }

  .flowrite-margin-thread-composer.is-positioned {
    margin: 0;
    position: absolute;
    left: 0;
    right: 0;
  }
</style>
