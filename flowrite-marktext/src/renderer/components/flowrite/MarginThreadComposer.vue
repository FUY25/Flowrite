<template>
  <article
    v-if="anchor"
    class="flowrite-margin-composer"
    data-testid="flowrite-margin-thread-composer"
    @click.stop
    @mousedown.stop
    @keydown.stop
    @keypress.stop
    @keyup.stop
    @input.stop
  >
    <div class="flowrite-margin-composer__surface">
      <div class="flowrite-margin-composer__header">
        <p class="flowrite-margin-composer__eyebrow">
          Ask Flowrite
        </p>
        <button
          type="button"
          class="flowrite-margin-composer__close"
          data-testid="flowrite-margin-thread-close"
          aria-label="Close Ask Flowrite composer"
          @click="closeComposer"
        >
          ×
        </button>
      </div>

      <p class="flowrite-margin-composer__quote">
        "{{ anchor.quote }}"
      </p>

      <textarea
        ref="textarea"
        v-model="draft"
        class="flowrite-margin-composer__input"
        data-testid="flowrite-margin-thread-input"
        :disabled="submitting"
        rows="4"
        placeholder="Ask Flowrite about this passage"
      ></textarea>

      <p
        v-if="error"
        class="flowrite-margin-composer__error"
      >
        {{ error }}
      </p>

      <div class="flowrite-margin-composer__footer">
        <button
          type="button"
          class="flowrite-margin-composer__submit"
          data-testid="flowrite-margin-thread-submit"
          :disabled="submitting || !trimmedDraft"
          @click="submit"
        >
          {{ submitting ? 'Posting…' : 'Comment' }}
        </button>
      </div>
    </div>
  </article>
</template>

<script>
import { SCOPE_MARGIN } from '../../../flowrite/constants'

export default {
  props: {
    anchor: {
      type: Object,
      default: null
    }
  },
  data () {
    return {
      draft: '',
      submitting: false,
      error: ''
    }
  },
  computed: {
    trimmedDraft () {
      return this.draft.trim()
    }
  },
  watch: {
    anchor: {
      immediate: true,
      handler () {
        this.draft = ''
        this.submitting = false
        this.error = ''
        this.$nextTick(() => {
          if (this.$refs.textarea) {
            this.$refs.textarea.focus()
          }
        })
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

    async submit () {
      if (!this.trimmedDraft || this.submitting) {
        return
      }

      const pendingBody = this.trimmedDraft
      this.submitting = true
      this.error = ''
      let unwatch = null

      try {
        const submitPromise = this.$store.dispatch('SUBMIT_MARGIN_COMMENT', {
          body: pendingBody,
          anchor: this.anchor
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
      } catch (error) {
        if (this.closeAfterPersist(pendingBody)) {
          return
        }
        this.error = error && error.message ? error.message : 'Unable to post this margin comment.'
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
  .flowrite-margin-composer {
    margin: 0 0 14px;
    position: relative;
    z-index: 2;
    pointer-events: auto;
  }

  .flowrite-margin-composer__surface {
    position: relative;
    z-index: 2;
    border: 1px solid rgba(36, 42, 53, 0.12);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 12px 28px rgba(26, 33, 44, 0.08);
    padding: 14px;
  }

  .flowrite-margin-composer__header,
  .flowrite-margin-composer__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .flowrite-margin-composer__eyebrow {
    margin: 0;
    color: rgba(74, 86, 104, 0.82);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .flowrite-margin-composer__close {
    appearance: none;
    border: 1px solid rgba(36, 42, 53, 0.12);
    border-radius: 999px;
    background: rgba(247, 248, 250, 0.96);
    color: rgba(74, 86, 104, 0.82);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 5px 8px;
  }

  .flowrite-margin-composer__quote {
    margin: 10px 0 12px;
    color: rgba(39, 49, 66, 0.92);
    font-size: 13px;
    line-height: 1.5;
  }

  .flowrite-margin-composer__input {
    width: 100%;
    border: 1px solid rgba(36, 42, 53, 0.12);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.9);
    color: var(--editorColor);
    font-size: 13px;
    line-height: 1.5;
    padding: 10px 12px;
    resize: vertical;
  }

  .flowrite-margin-composer__input:focus {
    border-color: rgba(79, 101, 131, 0.34);
    outline: none;
  }

  .flowrite-margin-composer__error {
    margin: 10px 0 0;
    color: #9b4d3a;
    font-size: 12px;
    line-height: 1.4;
  }

  .flowrite-margin-composer__footer {
    margin-top: 12px;
    justify-content: flex-end;
  }

  .flowrite-margin-composer__submit {
    appearance: none;
    border: 1px solid rgba(36, 42, 53, 0.12);
    border-radius: 999px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 14px;
  }

  .flowrite-margin-composer__submit {
    background: rgba(239, 243, 247, 0.96);
    color: #1f2937;
  }

  .flowrite-margin-composer__submit:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
</style>
