<template>
  <article
    v-if="thread"
    class="flowrite-margin-thread-card"
    :class="[
      {
        'is-active': active || composer,
        'is-composer': composer
      },
      { 'is-static': !positioned }
    ]"
    :data-thread-id="thread ? thread.id : composerThreadId"
    :data-testid="composer ? null : 'flowrite-margin-thread'"
    @click="handleCardClick"
  >
    <div class="flowrite-margin-thread-card__surface">
      <div class="flowrite-margin-thread-card__meta flowrite-margin-thread-card__meta--sr-only">
        <span
          class="flowrite-margin-thread-card__status"
          data-testid="flowrite-margin-thread-status"
        >
          Attached
        </span>
      </div>

      <div class="flowrite-margin-thread-card__thread">
        <div
          v-if="visibleComments.length > 1"
          class="flowrite-margin-thread-card__spine"
          data-testid="flowrite-margin-thread-spine"
        ></div>

        <div
          class="flowrite-margin-thread-card__comments"
          :class="{
            'is-collapsed': isCollapsed
          }"
        >
          <div
            v-for="(comment, commentIndex) in visibleComments"
            :key="comment.id"
            class="flowrite-margin-thread-card__comment"
            :class="`author-${comment.author}`"
          >
            <div class="flowrite-margin-thread-card__avatar">
              {{ commentAvatar(comment) }}
            </div>
            <div class="flowrite-margin-thread-card__copy">
              <div class="flowrite-margin-thread-card__comment-meta">
                <span class="flowrite-margin-thread-card__author">
                  {{ commentAuthor(comment) }}
                </span>
                <span class="flowrite-margin-thread-card__comment-time">
                  {{ formatTimestamp(comment.createdAt) }}
                </span>
              </div>
              <p class="flowrite-margin-thread-card__body" data-testid="flowrite-margin-thread-body">{{ comment.body }}</p>
            </div>

            <button
              v-if="isCollapsed && hiddenCommentCount > 0 && commentIndex === 0"
              type="button"
              class="flowrite-margin-thread-card__fold"
              data-testid="flowrite-margin-thread-fold"
              @click.stop="toggleCompression"
            >
              {{ foldButtonLabel }}
            </button>
          </div>

          <button
            v-if="isCompressed && !isCollapsed"
            type="button"
            class="flowrite-margin-thread-card__fold flowrite-margin-thread-card__fold--expanded"
            data-testid="flowrite-margin-thread-fold"
            @click.stop="toggleCompression"
          >
            {{ foldButtonLabel }}
          </button>
        </div>
      </div>

      <div
        v-if="shouldShowReplyInput"
        class="flowrite-margin-thread-card__reply"
        :class="{ 'is-composer': composer }"
        @click.stop
      >
        <div class="flowrite-margin-thread-card__reply-row">
          <textarea
            ref="replyInput"
            v-model="replyDraft"
            class="flowrite-margin-thread-card__reply-input"
            :data-testid="composer ? 'flowrite-margin-thread-input' : 'flowrite-margin-thread-reply-input'"
            :placeholder="composer ? 'Ask Flowrite about this passage' : 'Reply...'"
            rows="1"
            :disabled="isInputPending"
            @input="syncReplyInputHeight"
            @keydown.enter.exact.prevent="submitInput"
            @keydown.meta.enter.prevent="submitInput"
            @keydown.ctrl.enter.prevent="submitInput"
            @keydown.esc.prevent="handleEscape"
          ></textarea>
          <button
            type="button"
            class="flowrite-margin-thread-card__submit"
            :data-testid="composer ? 'flowrite-margin-thread-submit' : 'flowrite-margin-thread-reply-submit'"
            :disabled="!trimmedReplyDraft || isInputPending"
            :aria-label="composer ? 'Post comment' : 'Send reply'"
            @click.stop="submitInput"
          >
            <span class="flowrite-margin-thread-card__submit-icon">↑</span>
          </button>
        </div>
        <p
          v-if="composer && error"
          class="flowrite-margin-thread-card__error"
        >
          {{ error }}
        </p>
      </div>
    </div>
  </article>
</template>

<script>
import {
  FLOWRITE_MARGIN_THREAD_COMPOSER_ID,
  formatFlowriteTimestamp,
  getFlowriteCommentAuthorLabel,
  getFlowriteCommentAvatar
} from '../../../flowrite/commentUi'

export default {
  props: {
    thread: {
      type: Object,
      required: true
    },
    active: {
      type: Boolean,
      default: false
    },
    composer: {
      type: Boolean,
      default: false
    },
    positioned: {
      type: Boolean,
      default: true
    },
    submitting: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: ''
    }
  },
  data () {
    return {
      replyDraft: '',
      isReplyPending: false,
      isExpanded: false,
      showReplyInput: false,
      replyHeightRafId: null,
      lastReplyInputHeight: 24,
      lastThreadId: null,
      lastCollapsedState: false
    }
  },
  computed: {
    composerThreadId () {
      return FLOWRITE_MARGIN_THREAD_COMPOSER_ID
    },

    comments () {
      if (this.composer) {
        return []
      }

      return Array.isArray(this.thread && this.thread.comments) ? this.thread.comments : []
    },

    isCompressed () {
      return Boolean(this.thread && this.thread.collapsed)
    },

    visibleComments () {
      if (!this.isCompressed || this.isExpanded) {
        return this.comments
      }

      if (this.comments.length <= 2) {
        return this.comments
      }

      return [
        this.comments[0],
        this.comments[this.comments.length - 1]
      ]
    },

    hiddenCommentCount () {
      return Math.max(0, this.comments.length - this.visibleComments.length)
    },

    isCollapsed () {
      return this.isCompressed && !this.isExpanded
    },

    foldButtonLabel () {
      if (this.isExpanded) {
        return 'Hide replies'
      }

      if (this.hiddenCommentCount > 0) {
        return `Show ${this.hiddenCommentCount} replies`
      }

      return 'Expand thread'
    },

    shouldShowReplyInput () {
      return this.composer || this.showReplyInput
    },

    trimmedReplyDraft () {
      return this.replyDraft.trim()
    },

    isInputPending () {
      return this.composer ? this.submitting : this.isReplyPending
    }
  },
  watch: {
    thread: {
      immediate: true,
      handler (nextThread) {
        const nextThreadId = nextThread && nextThread.id ? nextThread.id : null
        const nextCollapsedState = Boolean(nextThread && nextThread.collapsed)

        if (nextThreadId !== this.lastThreadId) {
          this.lastThreadId = nextThreadId
          this.lastCollapsedState = nextCollapsedState
          this.isExpanded = !nextCollapsedState
          this.showReplyInput = Boolean(this.composer)
          this.replyDraft = ''
          this.$nextTick(() => {
            if (this.shouldShowReplyInput) {
              this.syncReplyInputHeight()
            }
          })
          return
        }

        if (nextCollapsedState !== this.lastCollapsedState) {
          this.lastCollapsedState = nextCollapsedState
          this.isExpanded = !nextCollapsedState
        }
      }
    },

    composer: {
      immediate: true,
      handler (value) {
        if (value) {
          this.showReplyInput = true
          this.$nextTick(() => {
            this.syncReplyInputHeight()
            if (this.$refs.replyInput) {
              this.$refs.replyInput.focus()
            }
          })
        }
      }
    }
  },
  beforeDestroy () {
    if (this.replyHeightRafId) {
      window.cancelAnimationFrame(this.replyHeightRafId)
      this.replyHeightRafId = null
    }
  },
  methods: {
    handleCardClick () {
      if (this.composer) {
        this.$nextTick(() => {
          if (this.$refs.replyInput) {
            this.$refs.replyInput.focus()
          }
        })
        return
      }

      this.focusThread()
    },

    focusThread () {
      if (!this.thread || !this.thread.id) {
        return
      }

      this.showReplyInput = true
      if (this.$store && typeof this.$store.dispatch === 'function') {
        this.$store.dispatch('ACTIVATE_MARGIN_THREAD', this.thread.id)
      }
      this.$emit('focus-thread', this.thread.id)
      this.$nextTick(() => {
        if (this.$refs.replyInput) {
          this.syncReplyInputHeight()
          this.$refs.replyInput.focus()
        }
      })
    },

    async submitInput () {
      if (this.isInputPending) {
        return
      }

      const body = this.trimmedReplyDraft
      if (!body) {
        return
      }

      if (this.composer) {
        try {
          await new Promise((resolve, reject) => {
            this.$emit('submit-composer', {
              body,
              anchor: this.thread && this.thread.anchor ? this.thread.anchor : null,
              resolve,
              reject
            })
          })
        } catch (error) {
          // Keep the draft in place so the writer can retry after a failed submit.
        }
        return
      }

      if (!this.thread || !this.thread.id) {
        return
      }

      this.isReplyPending = true
      try {
        await new Promise((resolve, reject) => {
          this.$emit('reply', {
            threadId: this.thread.id,
            body,
            resolve,
            reject
          })
        })
        this.replyDraft = ''
        this.$nextTick(() => {
          this.syncReplyInputHeight()
        })
      } catch (error) {
        // Keep the reply draft in place so the writer can retry after a failed submit.
      } finally {
        this.isReplyPending = false
      }
    },

    closeComposer () {
      this.$emit('close-composer')
    },

    handleEscape () {
      if (this.isInputPending) {
        return
      }

      this.replyDraft = ''
      this.$nextTick(() => {
        this.syncReplyInputHeight()
      })

      if (this.composer) {
        this.closeComposer()
        return
      }

      this.showReplyInput = false
    },

    syncReplyInputHeight () {
      const input = this.$refs.replyInput
      if (!input) {
        return
      }

      if (this.replyHeightRafId) {
        window.cancelAnimationFrame(this.replyHeightRafId)
      }

      this.replyHeightRafId = window.requestAnimationFrame(() => {
        this.replyHeightRafId = null
        if (!this.$refs.replyInput) {
          return
        }

        input.style.height = 'auto'
        const nextHeight = Math.max(24, Math.min(input.scrollHeight, 132))
        if (Math.abs(nextHeight - this.lastReplyInputHeight) > 1) {
          input.style.height = `${nextHeight}px`
          this.lastReplyInputHeight = nextHeight
          return
        }

        input.style.height = `${this.lastReplyInputHeight}px`
      })
    },

    toggleCompression () {
      if (!this.isCompressed) {
        return
      }

      this.isExpanded = !this.isExpanded
      this.$nextTick(() => {
        this.$emit('size-change')
      })
    },

    commentAuthor (comment) {
      return getFlowriteCommentAuthorLabel(comment)
    },

    commentAvatar (comment) {
      return getFlowriteCommentAvatar(comment)
    },

    formatTimestamp (value) {
      return formatFlowriteTimestamp(value)
    }
  }
}
</script>

<style scoped>
  .flowrite-margin-thread-card {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 1;
    transition: top 160ms ease;
  }

  .flowrite-margin-thread-card.is-static {
    position: relative;
    pointer-events: auto;
    transition: none;
  }

  .flowrite-margin-thread-card__surface {
    position: relative;
    border: 1px solid rgba(52, 60, 72, 0.11);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 8px 22px rgba(26, 33, 44, 0.06);
    padding: 14px 16px 14px;
    cursor: pointer;
  }

  .flowrite-margin-thread-card.is-active .flowrite-margin-thread-card__surface {
    border-color: rgba(210, 153, 51, 0.26);
    box-shadow: 0 12px 26px rgba(26, 33, 44, 0.08);
  }

  .flowrite-margin-thread-card__meta,
  .flowrite-margin-thread-card__comment-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .flowrite-margin-thread-card__meta {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    border: 0;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .flowrite-margin-thread-card__comment-time,
  .flowrite-margin-thread-card__status {
    font-size: 11px;
    color: rgba(116, 123, 136, 0.78);
  }

  .flowrite-margin-thread-card__thread {
    position: relative;
  }

  .flowrite-margin-thread-card__spine {
    position: absolute;
    top: 16px;
    bottom: 16px;
    left: 14px;
    width: 1px;
    background: rgba(194, 199, 208, 0.66);
  }

  .flowrite-margin-thread-card__comments {
    position: relative;
  }

  .flowrite-margin-thread-card__comment {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .flowrite-margin-thread-card__comment + .flowrite-margin-thread-card__comment {
    margin-top: 16px;
  }

  .flowrite-margin-thread-card__avatar {
    position: relative;
    z-index: 1;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(217, 222, 230, 0.96);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: rgba(120, 126, 138, 0.88);
  }

  .flowrite-margin-thread-card__copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .flowrite-margin-thread-card__comment-meta {
    line-height: 1.2;
  }

  .flowrite-margin-thread-card__author {
    font-size: 13px;
    font-weight: 700;
    color: var(--editorColor80);
  }

  .flowrite-margin-thread-card__body {
    margin: 0;
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.45;
    color: rgba(44, 49, 58, 0.92);
  }

  .flowrite-margin-thread-card__fold {
    appearance: none;
    border: none;
    background: transparent;
    color: rgba(126, 132, 145, 0.92);
    cursor: pointer;
    display: inline-flex;
    font-size: 13px;
    font-weight: 600;
    margin: 10px 0 2px 40px;
    padding: 0;
  }

  .flowrite-margin-thread-card__fold:hover {
    color: rgba(83, 89, 103, 0.96);
  }

  .flowrite-margin-thread-card__fold--expanded {
    margin-top: 14px;
  }

  .flowrite-margin-thread-card__reply {
    margin-top: 10px;
    padding-left: 40px;
  }

  .flowrite-margin-thread-card__reply.is-composer {
    margin-top: 8px;
    padding-left: 0;
  }

  .flowrite-margin-thread-card__reply-row {
    align-items: flex-end;
    display: flex;
    gap: 10px;
  }

  .flowrite-margin-thread-card__reply-input {
    flex: 1;
    border: none;
    border-radius: 0;
    background: transparent;
    color: rgba(54, 60, 70, 0.92);
    font-size: 13px;
    line-height: 1.55;
    min-height: 24px;
    max-height: 132px;
    padding: 1px 0 0;
    resize: none;
    overflow-y: auto;
  }

  .flowrite-margin-thread-card__reply-input:focus {
    outline: none;
  }

  .flowrite-margin-thread-card__reply-input::placeholder {
    color: rgba(136, 141, 151, 0.86);
  }

  .flowrite-margin-thread-card__reply-input:disabled {
    cursor: progress;
    opacity: 0.72;
  }

  .flowrite-margin-thread-card__submit {
    appearance: none;
    border: none;
    border-radius: 999px;
    background: rgba(236, 239, 244, 0.98);
    color: rgba(126, 132, 145, 0.96);
    cursor: pointer;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
  }

  .flowrite-margin-thread-card__submit:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .flowrite-margin-thread-card__submit:not(:disabled) {
    background: rgba(210, 153, 51, 0.92);
    color: rgba(255, 255, 255, 0.98);
  }

  .flowrite-margin-thread-card__submit-icon {
    display: inline-block;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    transform: translateY(-1px);
  }

  .flowrite-margin-thread-card__error {
    margin: 8px 0 0;
    color: #9b4d3a;
    font-size: 12px;
    line-height: 1.4;
  }
</style>
