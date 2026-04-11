<template>
  <div
    class="flowrite-have-a-look"
    data-testid="flowrite-have-a-look-popover"
  >
    <div class="flowrite-have-a-look__pills">
      <button
        v-for="option in personaOptions"
        :key="option.value"
        type="button"
        class="flowrite-have-a-look__pill"
        :class="{ 'is-active': option.value === persona }"
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
      @input="$emit('update:prompt', $event.target.value)"
    ></textarea>

    <div class="flowrite-have-a-look__actions">
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
        data-testid="flowrite-have-a-look-go"
        @click="$emit('confirm')"
      >
        Go
      </button>
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

  .flowrite-have-a-look__button {
    background: color-mix(in srgb, var(--editorBgColor) 68%, var(--themeColor) 32%);
  }

  .flowrite-have-a-look__button.is-secondary {
    background: transparent;
  }
</style>
