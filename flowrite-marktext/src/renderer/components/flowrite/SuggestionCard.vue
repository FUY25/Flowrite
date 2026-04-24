<template>
  <section
    class="flowrite-suggestion-card"
    :class="[statusClass]"
    data-testid="flowrite-suggestion-card"
  >
    <p class="flowrite-suggestion-card__eyebrow">
      {{ statusLabel }}
    </p>

    <div v-if="hasTargetText" class="flowrite-suggestion-card__section">
      <p class="flowrite-suggestion-card__label">Selected text</p>
      <p class="flowrite-suggestion-card__target" data-testid="flowrite-suggestion-target">
        {{ suggestion.targetText }}
      </p>
    </div>

    <div class="flowrite-suggestion-card__section">
      <p class="flowrite-suggestion-card__label">Suggested rewrite</p>
      <p class="flowrite-suggestion-card__text" data-testid="flowrite-suggestion-text">
        {{ suggestion.suggestedText }}
      </p>
    </div>

    <p
      v-if="suggestion.rationale"
      class="flowrite-suggestion-card__rationale"
    >
      {{ suggestion.rationale }}
    </p>

    <p
      v-if="showSaveHint"
      class="flowrite-suggestion-card__meta"
      data-testid="flowrite-suggestion-save-hint"
    >
      Save or autosave to lock this rewrite into history.
    </p>

    <div
      v-if="showActions"
      class="flowrite-suggestion-card__actions"
    >
      <button
        type="button"
        class="flowrite-suggestion-card__button"
        data-testid="flowrite-suggestion-accept"
        :disabled="pendingAction"
        @click="$emit('accept', suggestion.id)"
      >
        Accept
      </button>
      <button
        type="button"
        class="flowrite-suggestion-card__button is-secondary"
        data-testid="flowrite-suggestion-reject"
        :disabled="pendingAction"
        @click="$emit('reject', suggestion.id)"
      >
        Reject
      </button>
    </div>
  </section>
</template>

<script>
import {
  SUGGESTION_STATUS_PENDING,
  SUGGESTION_STATUS_ACCEPTED,
  SUGGESTION_STATUS_APPLIED_IN_BUFFER,
  SUGGESTION_STATUS_REJECTED
} from '../../../flowrite/constants'

export default {
  props: {
    suggestion: {
      type: Object,
      required: true
    },
    pendingAction: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    statusClass () {
      return `status-${this.suggestion.status || SUGGESTION_STATUS_PENDING}`
    },

    hasTargetText () {
      return Boolean(this.suggestion && this.suggestion.targetText)
    },

    showActions () {
      return this.suggestion.status === SUGGESTION_STATUS_PENDING
    },

    showSaveHint () {
      return this.suggestion.status === SUGGESTION_STATUS_APPLIED_IN_BUFFER
    },

    statusLabel () {
      if (this.suggestion.status === SUGGESTION_STATUS_ACCEPTED) {
        return 'Accepted'
      }

      if (this.suggestion.status === SUGGESTION_STATUS_APPLIED_IN_BUFFER) {
        return 'Applied, waiting for save'
      }

      if (this.suggestion.status === SUGGESTION_STATUS_REJECTED) {
        return 'Rejected'
      }

      return 'Rewrite suggestion'
    }
  }
}
</script>

<style scoped>
  .flowrite-suggestion-card {
    margin-top: 10px;
    padding: 12px;
    border: 1px solid rgba(37, 43, 54, 0.12);
    border-radius: 12px;
    background: rgba(248, 247, 243, 0.94);
  }

  .flowrite-suggestion-card__eyebrow {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(74, 86, 104, 0.78);
  }

  .flowrite-suggestion-card__section + .flowrite-suggestion-card__section {
    margin-top: 10px;
  }

  .flowrite-suggestion-card__label {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: rgba(102, 114, 133, 0.78);
  }

  .flowrite-suggestion-card__target,
  .flowrite-suggestion-card__text,
  .flowrite-suggestion-card__rationale,
  .flowrite-suggestion-card__meta {
    margin: 0;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.55;
    color: #273142;
  }

  .flowrite-suggestion-card__target {
    padding-left: 10px;
    border-left: 2px solid rgba(39, 49, 66, 0.14);
    color: rgba(39, 49, 66, 0.78);
  }

  .flowrite-suggestion-card__text {
    font-weight: 600;
  }

  .flowrite-suggestion-card__rationale {
    margin-top: 10px;
    color: rgba(39, 49, 66, 0.74);
  }

  .flowrite-suggestion-card__meta {
    margin-top: 10px;
    color: rgba(102, 114, 133, 0.86);
    font-size: 12px;
  }

  .flowrite-suggestion-card__actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .flowrite-suggestion-card__button {
    appearance: none;
    border: 1px solid rgba(37, 43, 54, 0.14);
    border-radius: 999px;
    background: white;
    color: #273142;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 12px;
  }

  .flowrite-suggestion-card__button.is-secondary {
    background: transparent;
  }

  .flowrite-suggestion-card__button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .flowrite-suggestion-card.status-applied_in_buffer {
    border-color: rgba(210, 153, 51, 0.28);
    background: rgba(252, 249, 240, 0.98);
  }
</style>
