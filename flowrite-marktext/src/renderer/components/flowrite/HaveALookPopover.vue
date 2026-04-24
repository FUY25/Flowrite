<template>
  <div
    class="flowrite-have-a-look"
    data-testid="flowrite-have-a-look-popover"
  >
    <template v-if="available">
      <div class="flowrite-have-a-look__pills">
        <button
          v-for="option in personaOptions"
          :key="option.value"
          type="button"
          class="flowrite-have-a-look__pill"
          :class="{ 'is-active': option.value === persona }"
          :disabled="busy"
          @click="$emit('update:persona', option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <textarea
        :value="prompt"
        class="flowrite-have-a-look__prompt"
        rows="2"
        maxlength="280"
        placeholder="Anything specific you want Flowrite to notice?"
        data-testid="flowrite-have-a-look-prompt"
        :disabled="busy"
        @input="$emit('update:prompt', $event.target.value)"
      ></textarea>

      <div class="flowrite-have-a-look__actions">
        <button
          type="button"
          class="flowrite-have-a-look__button is-secondary"
          data-testid="flowrite-have-a-look-cancel"
          :disabled="busy"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="flowrite-have-a-look__button"
          data-testid="flowrite-have-a-look-go"
          :disabled="busy"
          @click="$emit('confirm')"
        >
          Go
        </button>
      </div>

      <p
        v-if="busy"
        class="flowrite-have-a-look__status"
        data-testid="flowrite-have-a-look-status"
      >
        {{ statusMessage }}
      </p>
    </template>

    <div
      v-else
      class="flowrite-have-a-look__unavailable"
      data-testid="flowrite-have-a-look-unavailable"
    >
      <p class="flowrite-have-a-look__unavailable-title">Have a Look needs Claude first.</p>
      <p class="flowrite-have-a-look__unavailable-copy">{{ unavailableMessage }}</p>
      <div class="flowrite-have-a-look__actions flowrite-have-a-look__actions--setup">
        <button
          type="button"
          class="flowrite-have-a-look__button is-secondary"
          data-testid="flowrite-have-a-look-cancel"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="flowrite-have-a-look__button"
          data-testid="flowrite-have-a-look-open-settings"
          @click="$emit('open-settings')"
        >
          Open settings
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    persona: {
      type: String,
      required: true
    },
    prompt: {
      type: String,
      default: ''
    },
    busy: {
      type: Boolean,
      default: false
    },
    runtimeMessage: {
      type: String,
      default: ''
    },
    available: {
      type: Boolean,
      default: true
    },
    availabilityReason: {
      type: String,
      default: ''
    }
  },
  data () {
    return {
      personaOptions: [
        { value: 'friendly', label: 'Friendly' },
        { value: 'critical', label: 'Critical' },
        { value: 'improvement', label: 'Improvement' }
      ]
    }
  },
  computed: {
    statusMessage () {
      return this.runtimeMessage || 'Flowrite is reviewing the whole draft...'
    },
    unavailableMessage () {
      switch (this.availabilityReason) {
        case 'unconfigured':
          return 'Add your Claude API key in Flowrite settings, then try the review again.'
        case 'offline':
          return 'Flowrite could not reach Claude just now. Check your connection or API status, then retry.'
        case 'secure_storage_unavailable':
          return 'This device cannot store your Claude key securely, so Flowrite stays disabled.'
        case 'disabled':
          return 'Flowrite is currently turned off. Re-enable it in settings to run a review.'
        default:
          return 'Flowrite is not ready yet. Open settings to finish the Claude connection.'
      }
    }
  }
}
</script>

<style scoped>
  .flowrite-have-a-look {
    width: 320px;
    border: 1px solid rgba(28, 33, 44, 0.12);
    border-radius: 14px;
    background: color-mix(in srgb, var(--editorBgColor) 97%, white 3%);
    box-shadow: 0 18px 48px rgba(21, 28, 38, 0.16);
    padding: 12px;
  }

  .flowrite-have-a-look__pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .flowrite-have-a-look__pill,
  .flowrite-have-a-look__button {
    appearance: none;
    border: 1px solid rgba(28, 33, 44, 0.12);
    border-radius: 999px;
    background: transparent;
    color: var(--editorColor80);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    padding: 9px 12px;
  }

  .flowrite-have-a-look__pill:disabled,
  .flowrite-have-a-look__button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .flowrite-have-a-look__pill.is-active {
    background: color-mix(in srgb, var(--editorBgColor) 72%, var(--themeColor) 28%);
    border-color: color-mix(in srgb, var(--editorColor10) 50%, var(--themeColor) 50%);
    color: var(--editorColor100);
  }

  .flowrite-have-a-look__prompt {
    width: 100%;
    margin-top: 12px;
    border: 1px solid rgba(28, 33, 44, 0.1);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--editorColor80);
    font-size: 13px;
    line-height: 1.5;
    padding: 10px 12px;
    resize: none;
  }

  .flowrite-have-a-look__prompt:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  .flowrite-have-a-look__prompt:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--editorColor30) 50%, var(--themeColor) 50%);
  }

  .flowrite-have-a-look__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .flowrite-have-a-look__actions--setup {
    margin-top: 14px;
  }

  .flowrite-have-a-look__button {
    background: color-mix(in srgb, var(--editorBgColor) 68%, var(--themeColor) 32%);
  }

  .flowrite-have-a-look__button.is-secondary {
    background: transparent;
  }

  .flowrite-have-a-look__status,
  .flowrite-have-a-look__unavailable-copy {
    margin: 10px 2px 0;
    color: var(--editorColor50);
    font-size: 11.5px;
    line-height: 1.4;
  }

  .flowrite-have-a-look__unavailable-title {
    margin: 0;
    color: var(--editorColor90);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
  }
</style>
