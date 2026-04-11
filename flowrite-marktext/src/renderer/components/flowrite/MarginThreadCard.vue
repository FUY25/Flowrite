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
      <div class="flowrite-margin-thread-card__header">
        <div class="flowrite-margin-thread-card__heading">
          <p class="flowrite-margin-thread-card__eyebrow">
            Margin thread
          </p>
          <p
            v-if="thread.anchor && thread.anchor.quote"
            class="flowrite-margin-thread-card__quote"
            data-testid="flowrite-margin-thread-quote"
          >
            "{{ thread.anchor.quote }}"
          </p>
        </div>

        <button
          type="button"
          class="flowrite-margin-thread-card__focus"
          data-testid="flowrite-margin-thread-focus"
          @click.stop="focusThread"
        >
          {{ active ? 'Focused' : 'Open' }}
        </button>
      </div>

      <div class="flowrite-margin-thread-card__meta">
        <span
          class="flowrite-margin-thread-card__status"
          data-testid="flowrite-margin-thread-status"
        >
          {{ isDetached ? 'Detached' : 'Attached' }}
        </span>
        <span class="flowrite-margin-thread-card__timestamp">
          {{ formatTimestamp(thread.updatedAt) }}
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
            v-for="comment in visibleComments"
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
          </div>

          <button
            v-if="isCompressed"
            type="button"
            class="flowrite-margin-thread-card__fold"
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

      return this.comments.slice(0, 2)
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
        return `Show ${this.hiddenCommentCount} more`
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
    border: 1px solid rgba(37, 43, 54, 0.11);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 12px 28px rgba(26, 33, 44, 0.08);
    padding: 14px 14px 12px;
    cursor: pointer;
  }

  .flowrite-margin-thread-card.is-active .flowrite-margin-thread-card__surface {
    border-color: rgba(74, 118, 163, 0.24);
    box-shadow: 0 16px 34px rgba(42, 66, 95, 0.12);
  }

  .flowrite-margin-thread-card.is-detached .flowrite-margin-thread-card__surface {
    border-style: dashed;
  }

  .flowrite-margin-thread-card__header,
  .flowrite-margin-thread-card__meta,
  .flowrite-margin-thread-card__comment-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .flowrite-margin-thread-card__heading {
    min-width: 0;
  }

  .flowrite-margin-thread-card__eyebrow {
    margin: 0;
    color: rgba(74, 86, 104, 0.82);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .flowrite-margin-thread-card__quote {
    margin: 5px 0 0;
    color: rgba(39, 49, 66, 0.92);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .flowrite-margin-thread-card__focus {
    flex-shrink: 0;
    appearance: none;
    border: 1px solid rgba(36, 42, 53, 0.12);
    border-radius: 999px;
    background: rgba(247, 248, 250, 0.96);
    color: rgba(39, 49, 66, 0.82);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 12px;
  }

  .flowrite-margin-thread-card__meta {
    margin-top: 10px;
    justify-content: flex-start;
    color: rgba(74, 86, 104, 0.78);
  }

  .flowrite-margin-thread-card__status,
  .flowrite-margin-thread-card__timestamp,
  .flowrite-margin-thread-card__comment-time {
    font-size: 11px;
  }

  .flowrite-margin-thread-card__thread {
    position: relative;
    margin-top: 12px;
  }

  .flowrite-margin-thread-card__spine {
    position: absolute;
    top: 14px;
    bottom: 14px;
    left: 13px;
    width: 1px;
    background: rgba(210, 153, 51, 0.24);
  }

  .flowrite-margin-thread-card__comments {
    position: relative;
  }

  .flowrite-margin-thread-card__comments.is-collapsed {
    margin-top: 10px;
  }

  .flowrite-margin-thread-card__comment {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .flowrite-margin-thread-card__comment + .flowrite-margin-thread-card__comment {
    margin-top: 12px;
  }

  .flowrite-margin-thread-card__avatar {
    position: relative;
    z-index: 1;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: rgba(249, 246, 239, 0.98);
    border: 1px solid rgba(210, 153, 51, 0.18);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: rgba(108, 80, 28, 0.9);
  }

  .flowrite-margin-thread-card__copy {
    min-width: 0;
  }

  .flowrite-margin-thread-card__author {
    font-size: 12px;
    font-weight: 600;
    color: var(--editorColor80);
  }

  .flowrite-margin-thread-card__body {
    margin: 4px 0 0;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.55;
    color: var(--editorColor80);
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
    color: rgba(74, 86, 104, 0.86);
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    font-weight: 600;
    margin-top: 10px;
    padding: 0 0 0 38px;
  }

  .flowrite-margin-thread-card__fold:hover {
    color: rgba(39, 49, 66, 0.96);
  }

  .flowrite-margin-thread-card__reply {
    margin-top: 12px;
  }

  .flowrite-margin-thread-card__reply-input {
    width: 100%;
    border: 1px solid rgba(36, 42, 53, 0.12);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.94);
    color: var(--editorColor);
    font-size: 13px;
    line-height: 1.5;
    min-height: 72px;
    padding: 10px 12px;
    resize: vertical;
  }

  .flowrite-margin-thread-card__reply-input:focus {
    border-color: rgba(79, 101, 131, 0.34);
    outline: none;
  }

  .flowrite-margin-thread-card__reply-input:disabled {
    cursor: progress;
    opacity: 0.72;
  }
</style>
