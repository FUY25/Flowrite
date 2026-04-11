<template>
  <div
    v-if="anchor"
    class="flowrite-margin-thread-composer"
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
      :positioned="false"
      :anchor="anchor"
      :submitting="submitting"
      :error="error"
      @submit-composer="submitComposer"
      @close-composer="closeComposer"
    ></margin-thread-card>
  </div>
</template>

<script>
import { SCOPE_MARGIN } from '../../../flowrite/constants'
import MarginThreadCard from './MarginThreadCard.vue'

export default {
  components: {
    MarginThreadCard
  },
  props: {
    anchor: {
      type: Object,
      default: null
    }
  },
  data () {
    return {
      submitting: false,
      error: ''
    }
  },
  watch: {
    anchor: {
      immediate: true,
      handler () {
        this.submitting = false
        this.error = ''
      }
    }
  },
  methods: {
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
      if (!trimmedBody || !this.anchor) {
        return false
      }

      const comments = this.$store && this.$store.state && this.$store.state.flowrite
        ? this.$store.state.flowrite.comments
        : []

      return Array.isArray(comments) && comments.some(thread => (
        thread &&
        thread.scope === SCOPE_MARGIN &&
        thread.anchor &&
        thread.anchor.quote === this.anchor.quote &&
        Array.isArray(thread.comments) &&
        thread.comments.some(comment => comment && comment.author === 'user' && comment.body === trimmedBody)
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
    },

    closeComposer () {
      this.$store.dispatch('CLOSE_FLOWRITE_MARGIN_COMPOSER')
    }
  }
}
</script>

<style scoped>
  .flowrite-margin-thread-composer {
    margin: 0 0 14px;
    position: relative;
    z-index: 2;
    pointer-events: auto;
  }
</style>
