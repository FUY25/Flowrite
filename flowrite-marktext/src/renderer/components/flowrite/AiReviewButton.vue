<template>
  <section
    v-if="shouldRender"
    class="flowrite-ai-review"
    data-testid="flowrite-ai-review"
  >
    <div class="flowrite-ai-review__copy">
      <p class="flowrite-ai-review__eyebrow">AI Review</p>
      <p class="flowrite-ai-review__description">
        Ask Flowrite to read the whole draft and leave a short review pass in the discussion below.
      </p>
    </div>

    <div class="flowrite-ai-review__controls">
      <label class="flowrite-ai-review__label" for="flowrite-ai-review-persona">
        Persona
      </label>
      <select
        id="flowrite-ai-review-persona"
        v-model="persona"
        class="flowrite-ai-review__select"
        data-testid="flowrite-ai-review-persona"
        :disabled="isDisabled"
      >
        <option value="friendly">Friendly</option>
        <option value="critical">Critical</option>
        <option value="improvement">Improvement</option>
      </select>
      <button
        type="button"
        class="flowrite-ai-review__button"
        data-testid="flowrite-ai-review-run"
        :disabled="isDisabled"
        @click="runReview"
      >
        {{ isReviewing ? 'Reviewing…' : 'Review Draft' }}
      </button>
    </div>

    <p
      v-if="statusMessage"
      class="flowrite-ai-review__status"
      data-testid="flowrite-ai-review-status"
    >
      {{ statusMessage }}
    </p>
  </section>
</template>

<script>
import { mapState } from 'vuex'
import {
  PHASE_AI_REVIEW,
  RUNTIME_STATUS_RUNNING,
  RUNTIME_STATUS_FAILED,
  PERSONA_FRIENDLY
} from '../../../flowrite/constants'

export default {
  data () {
    return {
      persona: PERSONA_FRIENDLY,
      submitError: ''
    }
  },

  computed: {
    ...mapState({
      currentFile: state => state.editor.currentFile,
      availability: state => state.flowrite.availability,
      runtime: state => state.flowrite.runtime
    }),

    shouldRender () {
      return Boolean(this.currentFile && this.currentFile.pathname)
    },

    isReviewing () {
      return this.runtime.phase === PHASE_AI_REVIEW && this.runtime.status === RUNTIME_STATUS_RUNNING
    },

    isDisabled () {
      return !this.availability.enabled || this.runtime.status === RUNTIME_STATUS_RUNNING
    },

    statusMessage () {
      if (this.submitError) {
        return this.submitError
      }

      if (this.runtime.phase === PHASE_AI_REVIEW && this.runtime.status === RUNTIME_STATUS_RUNNING) {
        return this.runtime.message || 'Flowrite is reviewing the draft...'
      }

      if (!this.availability.enabled) {
        return 'AI Review is unavailable until Flowrite is enabled.'
      }

      if (this.runtime.phase === PHASE_AI_REVIEW && this.runtime.status === RUNTIME_STATUS_FAILED && this.runtime.error) {
        return this.runtime.error.message || 'Flowrite could not finish this review.'
      }

      return 'Review comments appear in the discussion below.'
    }
  },

  watch: {
    'runtime.status' (status) {
      if (status !== RUNTIME_STATUS_FAILED) {
        this.submitError = ''
      }
    },

    'currentFile.pathname' () {
      this.submitError = ''
      this.persona = PERSONA_FRIENDLY
    }
  },

  methods: {
    async runReview () {
      if (this.isDisabled) {
        return
      }

      try {
        this.submitError = ''
        await this.$store.dispatch('RUN_AI_REVIEW', this.persona)
      } catch (error) {
        this.submitError = error && error.message
          ? error.message
          : 'Unable to start Flowrite AI Review.'
      }
    }
  }
}
</script>

<style scoped>
  .flowrite-ai-review {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 20px;
    border-top: 1px solid var(--editorColor10);
    border-bottom: 1px solid var(--editorColor10);
    background: color-mix(in srgb, var(--editorBgColor) 92%, white 8%);
  }

  .flowrite-ai-review__copy {
    min-width: 0;
  }

  .flowrite-ai-review__eyebrow {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--editorColor50);
  }

  .flowrite-ai-review__description,
  .flowrite-ai-review__status {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--editorColor60);
  }

  .flowrite-ai-review__controls {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .flowrite-ai-review__label {
    font-size: 12px;
    color: var(--editorColor50);
  }

  .flowrite-ai-review__select,
  .flowrite-ai-review__button {
    appearance: none;
    border: 1px solid var(--editorColor10);
    border-radius: 999px;
    background: var(--editorBgColor);
    color: var(--editorColor80);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
  }

  .flowrite-ai-review__button {
    cursor: pointer;
  }

  .flowrite-ai-review__button:disabled,
  .flowrite-ai-review__select:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  @media (max-width: 860px) {
    .flowrite-ai-review {
      align-items: flex-start;
      flex-direction: column;
    }

    .flowrite-ai-review__controls {
      flex-wrap: wrap;
    }
  }
</style>
