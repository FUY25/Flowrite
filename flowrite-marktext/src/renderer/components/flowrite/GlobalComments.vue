<template>
  <section
    v-if="shouldRender"
    class="flowrite-global-comments"
    :class="{ 'is-distraction-hidden': isSuppressedByWritingMode }"
    :style="{ fontFamily: discussionFontFamily }"
    data-testid="flowrite-global-comments"
    @mouseenter="isRevealActive = true"
    @mouseleave="isRevealActive = false"
    @focusin="isRevealActive = true"
    @focusout="handleFocusOut"
  >
    <div
      v-if="showThread"
      class="flowrite-global-comments__content"
    >
      <header
        v-if="threadComments.length"
        class="flowrite-global-comments__header"
      >
        <h3 class="flowrite-global-comments__title">
          Discussion
        </h3>
      </header>

      <div class="flowrite-global-comments__thread">
        <article
          v-for="comment in threadComments"
          :key="comment.id"
          class="flowrite-global-comments__comment"
          :class="[`author-${comment.author || 'assistant'}`]"
        >
          <div class="flowrite-global-comments__avatar">
            {{ commentAvatar(comment) }}
          </div>
          <div class="flowrite-global-comments__comment-copy">
            <div class="flowrite-global-comments__meta">
              <span class="flowrite-global-comments__author">
                {{ commentAuthor(comment) }}
              </span>
              <span class="flowrite-global-comments__timestamp">
                {{ formatTimestamp(comment.createdAt) }}
              </span>
            </div>
            <p
              class="flowrite-global-comments__body"
              data-testid="flowrite-comment-body"
            >{{ comment.body }}</p>
          </div>
        </article>
      </div>
    </div>

    <div
      v-else-if="showEmptyHint"
      class="flowrite-global-comments__empty"
    >
      <p class="flowrite-global-comments__empty-title">
        A thought worth keeping?
      </p>
      <p class="flowrite-global-comments__empty-copy">
        Leave a short note below.
      </p>
    </div>

    <form
      class="flowrite-global-comments__composer"
      @submit.prevent="submitComment"
    >
      <input
        :key="currentFile.pathname || 'flowrite-global-comments-input'"
        v-model="draft"
        class="flowrite-global-comments__input"
        data-testid="flowrite-global-comments-input"
        :disabled="composerDisabled"
        :placeholder="composerPlaceholder"
        @keydown.enter.exact.prevent="submitComment"
      >
      <div class="flowrite-global-comments__actions">
        <button
          class="flowrite-global-comments__submit"
          data-testid="flowrite-global-comments-submit"
          type="submit"
          :disabled="submitDisabled"
        >
          Send
        </button>
      </div>
    </form>

    <p
      v-if="statusMessage"
      class="flowrite-global-comments__status"
    >
      {{ statusMessage }}
    </p>
  </section>
</template>

<script>
import { mapState } from 'vuex'
import {
  SCOPE_GLOBAL,
  RUNTIME_STATUS_RUNNING,
  RUNTIME_STATUS_FAILED
} from '../../../flowrite/constants'
import {
  formatFlowriteTimestamp,
  getFlowriteCommentAuthorLabel,
  getFlowriteCommentAvatar
} from '../../../flowrite/commentUi'
import { buildDiscussionFontFamily } from '../../util/typography'

export default {
  data () {
    return {
      draft: '',
      submitError: '',
      isRevealActive: false,
      revealListenerAttached: false
    }
  },

  computed: {
    ...mapState({
      currentFile: state => state.editor.currentFile,
      discussionFont: state => state.preferences.discussionFont,
      comments: state => state.flowrite.comments,
      availability: state => state.flowrite.availability,
      runtime: state => state.flowrite.runtime,
      distractionFreeWriting: state => state.layout.distractionFreeWriting
    }),

    shouldRender () {
      return Boolean(this.currentFile && this.currentFile.pathname)
    },

    discussionFontFamily () {
      return buildDiscussionFontFamily({
        discussionFont: this.discussionFont
      })
    },

    globalThread () {
      return this.comments.find(thread => thread && thread.scope === SCOPE_GLOBAL) || null
    },

    threadComments () {
      return this.globalThread && Array.isArray(this.globalThread.comments)
        ? this.globalThread.comments
        : []
    },

    isRunning () {
      return this.runtime.status === RUNTIME_STATUS_RUNNING
    },

    isExpanded () {
      return this.threadComments.length > 0 || this.isRunning || Boolean(this.submitError)
    },

    showThread () {
      return this.isExpanded
    },

    showEmptyHint () {
      return this.availability.enabled && !this.showThread
    },

    isSuppressedByWritingMode () {
      return this.distractionFreeWriting && !this.isRevealActive
    },

    composerDisabled () {
      return !this.availability.enabled || this.isRunning
    },

    submitDisabled () {
      return this.composerDisabled || !this.draft.trim()
    },

    composerPlaceholder () {
      if (!this.availability.enabled) {
        return 'Enable Flowrite to start a discussion.'
      }

      return 'Write in discussion...'
    },

    statusMessage () {
      if (this.submitError) {
        return this.submitError
      }

      if (!this.availability.enabled) {
        return 'Discussion is read-only until Flowrite is available.'
      }

      if (this.runtime.status === RUNTIME_STATUS_FAILED && this.runtime.error && this.runtime.error.message) {
        return this.runtime.error.message
      }

      if (this.isRunning) {
        return this.runtime.message || 'Flowrite is replying...'
      }

      return ''
    }
  },

  watch: {
    'currentFile.pathname' () {
      this.draft = ''
      this.submitError = ''
      this.isRevealActive = false
    },

    'runtime.status' (status) {
      if (status !== RUNTIME_STATUS_FAILED) {
        this.submitError = ''
      }
    },

    distractionFreeWriting (value) {
      this.syncRevealListener()
      if (!value) {
        this.isRevealActive = false
      }
    }
  },

  mounted () {
    this.syncRevealListener()
  },

  beforeDestroy () {
    this.removeRevealListener()
  },

  methods: {
    addRevealListener () {
      if (typeof document === 'undefined' || this.revealListenerAttached) {
        return
      }

      document.addEventListener('mousemove', this.handleDocumentMouseMove, true)
      this.revealListenerAttached = true
    },

    removeRevealListener () {
      if (typeof document === 'undefined' || !this.revealListenerAttached) {
        return
      }

      document.removeEventListener('mousemove', this.handleDocumentMouseMove, true)
      this.revealListenerAttached = false
    },

    syncRevealListener () {
      if (this.distractionFreeWriting) {
        this.addRevealListener()
        return
      }

      this.removeRevealListener()
    },

    commentAuthor (comment) {
      return getFlowriteCommentAuthorLabel(comment)
    },

    commentAvatar (comment) {
      return getFlowriteCommentAvatar(comment)
    },

    formatTimestamp (value) {
      return formatFlowriteTimestamp(value)
    },

    async submitComment () {
      if (this.submitDisabled) {
        return
      }

      const nextDraft = this.draft.trim()
      this.draft = ''
      try {
        this.submitError = ''
        await this.$store.dispatch('SUBMIT_GLOBAL_COMMENT', nextDraft)
      } catch (error) {
        this.draft = nextDraft
        this.submitError = error && error.message
          ? error.message
          : 'Unable to submit this Flowrite comment.'
      }
    },

    updateRevealFromPointer (clientY, viewportHeight = window.innerHeight || 0) {
      if (!this.distractionFreeWriting) {
        this.isRevealActive = false
        return
      }

      const threshold = Math.max(viewportHeight * 0.75, viewportHeight - 180)
      this.isRevealActive = clientY >= threshold
    },

    handleDocumentMouseMove (event) {
      this.updateRevealFromPointer(event.clientY)
    },

    handleFocusOut () {
      window.setTimeout(() => {
        const root = this.$el
        if (!root || !root.contains(document.activeElement)) {
          this.isRevealActive = false
        }
      }, 0)
    }
  }
}
</script>

<style scoped>
  .flowrite-global-comments {
    background: var(--workspacePanelBgColor);
    padding: 0 22px 18px;
    transition: background-color .14s linear, padding .18s ease;
  }

  .flowrite-global-comments__content,
  .flowrite-global-comments__empty,
  .flowrite-global-comments__composer,
  .flowrite-global-comments__status {
    transition: opacity .18s ease, transform .18s ease, max-height .18s ease, margin .18s ease;
  }

  .flowrite-global-comments.is-distraction-hidden {
    padding-top: 0;
    padding-bottom: 12px;
    min-height: 18px;
  }

  .flowrite-global-comments.is-distraction-hidden .flowrite-global-comments__content,
  .flowrite-global-comments.is-distraction-hidden .flowrite-global-comments__empty,
  .flowrite-global-comments.is-distraction-hidden .flowrite-global-comments__composer,
  .flowrite-global-comments.is-distraction-hidden .flowrite-global-comments__status {
    opacity: 0;
    transform: translateY(6px);
    pointer-events: none;
    max-height: 0;
    overflow: hidden;
    margin-top: 0;
    margin-bottom: 0;
  }

  .flowrite-global-comments__content {
    max-width: 820px;
    margin: 0 auto 10px;
    padding-top: 2px;
  }

  .flowrite-global-comments__header {
    margin-bottom: 20px;
  }

  .flowrite-global-comments__title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--editorColor90);
  }

  .flowrite-global-comments__thread {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .flowrite-global-comments__comment {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .flowrite-global-comments__avatar {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--workspacePanelBgColor) 78%, var(--themeColor) 22%);
    border: 1px solid rgba(28, 33, 44, 0.06);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--editorColor80);
  }

  .flowrite-global-comments__comment-copy {
    min-width: 0;
  }

  .flowrite-global-comments__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 1px;
  }

  .flowrite-global-comments__author {
    font-size: 12px;
    font-weight: 600;
    color: var(--editorColor80);
  }

  .flowrite-global-comments__timestamp {
    font-size: 11px;
    color: var(--editorColor50);
  }

  .flowrite-global-comments__body {
    margin: 0;
    white-space: pre-wrap;
    font-size: 13.5px;
    line-height: 1.3;
    color: var(--editorColor80);
  }

  .flowrite-global-comments__composer {
    max-width: 820px;
    margin: 0 auto;
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 6px 0 12px;
    border: 1px solid rgba(28, 33, 44, 0.11);
    border-radius: 10px;
    background: color-mix(in srgb, var(--workspacePanelBgColor) 92%, white 8%);
    transition: background-color .14s linear, border-color .14s linear;
  }

  .flowrite-global-comments__empty {
    max-width: 820px;
    margin: 0 auto 12px;
    padding: 18px 0 2px;
    text-align: center;
    color: var(--editorColor50);
  }

  .flowrite-global-comments__empty-title,
  .flowrite-global-comments__empty-copy {
    margin: 0;
    font-size: 12px;
  }

  .flowrite-global-comments__empty-title {
    font-weight: 600;
    color: var(--editorColor60);
  }

  .flowrite-global-comments__empty-copy {
    margin-top: 4px;
    color: var(--editorColor40);
  }

  .flowrite-global-comments__input {
    flex: 1;
    min-width: 0;
    height: 38px;
    border: 0;
    background: transparent;
    font-family: inherit;
    color: var(--editorColor80);
    font-size: 13px;
    line-height: 38px;
    padding: 0;
    outline: none;
  }

  .flowrite-global-comments__input::placeholder {
    color: var(--editorColor50);
  }

  .flowrite-global-comments__actions {
    flex-shrink: 0;
  }

  .flowrite-global-comments__submit {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--editorColor60);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 0 8px;
    min-height: 28px;
  }

  .flowrite-global-comments__submit:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .flowrite-global-comments__status {
    max-width: 820px;
    margin: 6px auto 0;
    font-size: 11.5px;
    color: var(--editorColor50);
  }
</style>
