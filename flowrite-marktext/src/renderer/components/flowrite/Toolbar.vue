<template>
  <div
    class="flowrite-toolbar"
    :class="{ 'flowrite-toolbar--inline': inline }"
    data-testid="flowrite-toolbar"
  >
    <div v-if="!inline" class="flowrite-toolbar__left">
      <button
        type="button"
        class="flowrite-toolbar__icon-button"
        :class="{ 'is-active': showSideBar }"
        aria-label="Toggle sidebar"
        data-testid="flowrite-sidebar-toggle"
        @click="toggleSidebar"
      >
        <span class="flowrite-toolbar__panel-icon" aria-hidden="true">
          <span></span>
          <span></span>
        </span>
      </button>
    </div>

    <div class="flowrite-toolbar__right">
      <button
        type="button"
        class="flowrite-toolbar__icon-button"
        :class="{ 'is-active': showAnnotationsPane }"
        aria-label="Toggle annotations"
        data-testid="flowrite-annotations-toggle"
        :disabled="!hasDocument"
        @click="toggleAnnotations"
      >
        <span class="flowrite-toolbar__annotation-icon" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      <div
        class="flowrite-toolbar__review"
        ref="review"
      >
        <button
          type="button"
          class="flowrite-toolbar__review-button"
          data-testid="flowrite-have-a-look-button"
          :disabled="!hasSavedDocument || isBusy"
          @click="togglePopover"
        >
          <span
            class="flowrite-toolbar__review-label"
            :class="{ 'is-busy': isBusy }"
          >
            {{ isBusy ? 'Looking…' : 'Have a look!' }}
          </span>
        </button>

        <div
          v-if="showPopover"
          class="flowrite-toolbar__popover"
        >
          <have-a-look-popover
            :persona.sync="persona"
            :prompt.sync="prompt"
            @cancel="closePopover"
            @confirm="runReview"
          ></have-a-look-popover>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import bus from '../../bus'
import {
  PERSONA_FRIENDLY,
  RUNTIME_STATUS_RUNNING
} from '../../../flowrite/constants'
import HaveALookPopover from './HaveALookPopover.vue'

export default {
  components: {
    HaveALookPopover
  },
  props: {
    inline: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      showPopover: false,
      persona: PERSONA_FRIENDLY,
      prompt: ''
    }
  },
  computed: {
    ...mapState({
      currentFile: state => state.editor.currentFile,
      showSideBar: state => state.layout.showSideBar,
      showAnnotationsPane: state => state.flowrite.showAnnotationsPane,
      runtime: state => state.flowrite.runtime,
      availability: state => state.flowrite.availability
    }),

    hasDocument () {
      return Boolean(this.currentFile && typeof this.currentFile.markdown === 'string')
    },

    hasSavedDocument () {
      return Boolean(this.currentFile && this.currentFile.pathname)
    },

    isBusy () {
      return !this.availability.enabled || this.runtime.status === RUNTIME_STATUS_RUNNING
    }
  },
  watch: {
    'currentFile.pathname' () {
      this.persona = PERSONA_FRIENDLY
      this.prompt = ''
      this.showPopover = false
    }
  },
  mounted () {
    document.addEventListener('click', this.handleDocumentClick, true)
  },
  beforeDestroy () {
    document.removeEventListener('click', this.handleDocumentClick, true)
  },
  methods: {
    toggleSidebar () {
      bus.$emit('view:toggle-layout-entry', 'showSideBar')
    },

    toggleAnnotations () {
      if (!this.hasDocument) {
        return
      }
      this.$store.dispatch('TOGGLE_FLOWRITE_ANNOTATIONS_PANE')
    },

    togglePopover () {
      if (this.isBusy) {
        return
      }
      this.showPopover = !this.showPopover
    },

    closePopover () {
      this.showPopover = false
    },

    handleDocumentClick (event) {
      if (!this.showPopover) {
        return
      }

      const root = this.$refs.review
      if (root && !root.contains(event.target)) {
        this.closePopover()
      }
    },

    async runReview () {
      if (this.isBusy) {
        return
      }

      await this.$store.dispatch('RUN_AI_REVIEW', {
        reviewPersona: this.persona,
        prompt: this.prompt.trim()
      })
      this.prompt = ''
      this.closePopover()
    }
  }
}
</script>

<style scoped>
  .flowrite-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 18px 1px;
    background: var(--workspaceHeaderBgColor);
  }

  .flowrite-toolbar--inline {
    justify-content: flex-end;
    gap: 6px;
    padding: 0;
    background: transparent;
  }

  .flowrite-toolbar__left,
  .flowrite-toolbar__right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__right {
    gap: 6px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__right > * {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
  }

  .flowrite-toolbar__icon-button,
  .flowrite-toolbar__review-button {
    appearance: none;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--editorColor60);
    cursor: pointer;
    transition: background-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
  }

  .flowrite-toolbar__icon-button {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 9px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__icon-button {
    width: 26px;
    height: 26px;
    border-radius: 8px;
  }

  .flowrite-toolbar__icon-button.is-active,
  .flowrite-toolbar__icon-button:hover,
  .flowrite-toolbar__review-button:hover {
    background: rgba(20, 24, 31, 0.05);
    color: var(--editorColor80);
  }

  .flowrite-toolbar__review-button {
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    padding: 8px 13px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__review-button {
    font-size: 12.5px;
    min-height: 26px;
    padding: 0 13px;
    display: inline-flex;
    align-items: center;
  }

  .flowrite-toolbar__review-button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .flowrite-toolbar__review-label {
    display: inline-block;
    background-image: linear-gradient(
      90deg,
      #6f8fd8 0%,
      #63a892 22%,
      #d3a56d 46%,
      #cc8a86 68%,
      #8d84c7 84%,
      #6f8fd8 100%
    );
    background-size: 240% 100%;
    background-position: 0% 50%;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: flowrite-rainbow-drift-breathe 13.5s ease-in-out infinite;
  }

  .flowrite-toolbar__review-label.is-busy,
  .flowrite-toolbar__review-button:disabled .flowrite-toolbar__review-label {
    animation: none;
    background-image: none;
    color: currentColor;
    -webkit-text-fill-color: currentColor;
  }

  .flowrite-toolbar__panel-icon,
  .flowrite-toolbar__annotation-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .flowrite-toolbar__panel-icon {
    width: 15px;
    height: 13px;
    border: 1px solid currentColor;
    border-radius: 3px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__panel-icon {
    width: 15px;
    height: 12px;
  }

  .flowrite-toolbar__panel-icon span:first-child {
    position: absolute;
    left: 5px;
    top: 2px;
    bottom: 2px;
    width: 1px;
    background: currentColor;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__panel-icon span:first-child {
    left: 5px;
    top: 1px;
    bottom: 1px;
  }

  .flowrite-toolbar__annotation-icon {
    width: 15px;
    height: 15px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__annotation-icon {
    width: 13px;
    height: 13px;
  }

  .flowrite-toolbar__annotation-icon span {
    position: absolute;
    left: 1px;
    right: 1px;
    height: 1px;
    border-radius: 999px;
    background: currentColor;
  }

  .flowrite-toolbar__annotation-icon span:nth-child(1) {
    top: 4px;
  }

  .flowrite-toolbar__annotation-icon span:nth-child(2) {
    top: 7px;
  }

  .flowrite-toolbar__annotation-icon span:nth-child(3) {
    top: 10px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__annotation-icon span:nth-child(1) {
    top: 3px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__annotation-icon span:nth-child(2) {
    top: 6px;
  }

  .flowrite-toolbar--inline .flowrite-toolbar__annotation-icon span:nth-child(3) {
    top: 9px;
  }

  .flowrite-toolbar__review {
    position: relative;
  }

  .flowrite-toolbar__popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 18;
  }

  @keyframes flowrite-rainbow-drift-breathe {
    0% {
      background-position: 0% 50%;
      filter: saturate(0.88) brightness(0.96);
      opacity: 0.84;
    }

    50% {
      background-position: 100% 50%;
      filter: saturate(1) brightness(1);
      opacity: 1;
    }

    100% {
      background-position: 200% 50%;
      filter: saturate(0.88) brightness(0.96);
      opacity: 0.84;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flowrite-toolbar__review-label {
      animation: none;
      background-position: 50% 50%;
    }
  }
</style>
