<template>
  <article
    v-if="thread"
    class="flowrite-margin-thread-card"
    :class="[
      {
        'is-active': active,
        'is-detached': isDetached
      }
    ]"
    :data-thread-id="thread.id"
    data-testid="flowrite-margin-thread"
    @click="focusThread"
  >
    <div class="flowrite-margin-thread-card__surface">
      <div
        v-if="isDetached"
        class="flowrite-margin-thread-card__detached"
      >
        Detached
      </div>

      <div class="flowrite-margin-thread-card__meta flowrite-margin-thread-card__meta--sr-only">
        <span
          class="flowrite-margin-thread-card__status"
          data-testid="flowrite-margin-thread-status"
        >
          {{ isDetached ? 'Detached' : 'Attached' }}
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
              {{ comment.author === 'user' ? 'Y' : 'F' }}
            </div>
            <div class="flowrite-margin-thread-card__copy">
              <div class="flowrite-margin-thread-card__comment-meta">
                <span class="flowrite-margin-thread-card__author">
                  {{ comment.author === 'user' ? 'You' : 'Flowrite' }}
                </span>
                <span class="flowrite-margin-thread-card__comment-time">
                  {{ formatTimestamp(comment.createdAt) }}
                </span>
              </div>
              <p
                class="flowrite-margin-thread-card__body"
                data-testid="flowrite-margin-thread-body"
              >
                {{ comment.body }}
              </p>
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
        v-if="showReplyInput"
        class="flowrite-margin-thread-card__reply"
        @click.stop
      >
        <textarea
          ref="replyInput"
          v-model="replyDraft"
          class="flowrite-margin-thread-card__reply-input"
          data-testid="flowrite-margin-thread-reply-input"
          placeholder="Reply..."
          rows="3"
          :disabled="isReplyPending"
          @keydown.meta.enter.prevent="submitReply"
          @keydown.ctrl.enter.prevent="submitReply"
        ></textarea>
      </div>
    </div>
  </article>
</template>

<script>
import { ANCHOR_DETACHED } from '../../../flowrite/constants'

export default {
  props: {
    thread: {
      type: Object,
      required: true
    },
    active: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      replyDraft: '',
      isReplyPending: false,
      isExpanded: false,
      showReplyInput: false,
      lastThreadId: null,
      lastCollapsedState: false
    }
  },
  computed: {
    isDetached () {
      return Boolean(
        this.thread &&
        this.thread.resolvedAnchor &&
        this.thread.resolvedAnchor.status === ANCHOR_DETACHED
      )
    },

    comments () {
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
          this.showReplyInput = false
          return
        }

        if (nextCollapsedState !== this.lastCollapsedState) {
          this.lastCollapsedState = nextCollapsedState
          this.isExpanded = !nextCollapsedState
        }
      }
    }
  },
  methods: {
    focusThread () {
      if (!this.thread || !this.thread.id) {
        return
      }

      this.showReplyInput = true
      this.$emit('focus-thread', this.thread.id)
    },

    async submitReply () {
      if (!this.thread || !this.thread.id || this.isReplyPending) {
        return
      }

      const body = this.replyDraft.trim()
      if (!body) {
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
      } catch (error) {
        // Keep the reply draft in place so the writer can retry after a failed submit.
      } finally {
        this.isReplyPending = false
      }
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

    formatTimestamp (value) {
      if (!value) {
        return 'Now'
      }

      const date = new Date(value)
      if (Number.isNaN(date.getTime())) {
        return 'Now'
      }

      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })
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

  .flowrite-margin-thread-card.is-detached .flowrite-margin-thread-card__surface {
    border-style: dashed;
  }

  .flowrite-margin-thread-card__meta,
  .flowrite-margin-thread-card__comment-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .flowrite-margin-thread-card__detached {
    position: absolute;
    top: 12px;
    right: 14px;
    border-radius: 999px;
    background: rgba(242, 244, 247, 0.98);
    color: rgba(108, 121, 139, 0.92);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    padding: 5px 8px;
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
  }

  .flowrite-margin-thread-card__author {
    font-size: 13px;
    font-weight: 700;
    color: var(--editorColor80);
  }

  .flowrite-margin-thread-card__body {
    margin: 6px 0 0;
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.5;
    color: rgba(44, 49, 58, 0.92);
  }

  .flowrite-margin-thread-card__comments.is-collapsed .flowrite-margin-thread-card__body {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
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
    margin-top: 14px;
    border-top: 1px solid rgba(228, 231, 237, 0.96);
    padding-top: 12px;
  }

  .flowrite-margin-thread-card__reply-input {
    width: 100%;
    border: 1px solid rgba(221, 225, 232, 0.96);
    border-radius: 14px;
    background: rgba(248, 249, 251, 0.98);
    color: var(--editorColor);
    font-size: 13px;
    line-height: 1.5;
    min-height: 58px;
    padding: 11px 13px;
    resize: vertical;
  }

  .flowrite-margin-thread-card__reply-input:focus {
    border-color: rgba(210, 153, 51, 0.34);
    outline: none;
  }

  .flowrite-margin-thread-card__reply-input:disabled {
    cursor: progress;
    opacity: 0.72;
  }
</style>
