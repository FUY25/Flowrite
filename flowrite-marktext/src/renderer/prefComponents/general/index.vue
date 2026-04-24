<template>
  <div class="pref-general">
    <h4>General</h4>
    <compound>
      <template #head>
        <h6 class="title">Auto Save:</h6>
      </template>
      <template #children>
        <bool
          description="Automatically save document changes"
          :bool="autoSave"
          :onChange="value => onSelectChange('autoSave', value)"
        ></bool>
        <range
          description="Delay following document edit before automatically saving"
          :value="autoSaveDelay"
          :min="1000"
          :max="10000"
          unit="ms"
          :step="100"
          :onChange="value => onSelectChange('autoSaveDelay', value)"
        ></range>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Window:</h6>
      </template>
      <template #children>
        <cur-select
          v-if="!isOsx"
          description="Title bar style"
          notes="Requires restart."
          :value="titleBarStyle"
          :options="titleBarStyleOptions"
          :onChange="value => onSelectChange('titleBarStyle', value)"
        ></cur-select>
        <bool
          description="Hide scrollbars"
          :bool="hideScrollbar"
          :onChange="value => onSelectChange('hideScrollbar', value)"
        ></bool>
        <bool
          description="Open files in new window"
          :bool="openFilesInNewWindow"
          :onChange="value => onSelectChange('openFilesInNewWindow', value)"
        ></bool>
        <bool
          description="Open folders in new window"
          :bool="openFolderInNewWindow"
          :onChange="value => onSelectChange('openFolderInNewWindow', value)"
        ></bool>
        <cur-select
          description="Zoom"
          :value="zoom"
          :options="zoomOptions"
          :onChange="value => onSelectChange('zoom', value)"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Sidebar:</h6>
      </template>
      <template #children>
        <bool
          description="Wrap text in table of contents"
          :bool="wordWrapInToc"
          :onChange="value => onSelectChange('wordWrapInToc', value)"
        ></bool>

        <!-- TODO: The description is very bad and the entry isn't used by the editor. -->
        <cur-select
          description="Sort field for files in open folders"
          :value="fileSortBy"
          :options="fileSortByOptions"
          :onChange="value => onSelectChange('fileSortBy', value)"
          :disable="true"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Flowrite:</h6>
      </template>
      <template #children>
        <cur-select
          description="Flowrite collaboration style"
          notes="Comment only keeps Flowrite reflective. Co-writing allows Flowrite to draft when your reply asks for action."
          :value="flowriteCollaborationMode"
          :options="flowriteCollaborationOptions"
          :onChange="onFlowriteChange"
        ></cur-select>

        <section class="flowrite-settings" data-testid="flowrite-settings-panel">
          <div class="flowrite-settings__status">
            <span
              class="flowrite-settings__badge"
              :class="`is-${flowriteStatusTone}`"
              data-testid="flowrite-settings-status"
            >
              {{ flowriteStatusLabel }}
            </span>
            <p class="flowrite-settings__summary">{{ flowriteSummary }}</p>
          </div>

          <p class="flowrite-settings__key-state">
            {{ flowriteKeyStateMessage }}
          </p>

          <div class="flowrite-settings__field">
            <label class="flowrite-settings__label" for="flowrite-api-key">Claude API key</label>
            <input
              id="flowrite-api-key"
              v-model="flowriteApiKeyDraft"
              class="flowrite-settings__input"
              type="password"
              autocomplete="off"
              placeholder="Paste a new Claude API key to save or test"
              data-testid="flowrite-settings-api-key"
              @input="handleFlowriteApiKeyInput"
            >
          </div>

          <div class="flowrite-settings__field-row">
            <div class="flowrite-settings__field flowrite-settings__field--wide">
              <label class="flowrite-settings__label" for="flowrite-base-url">Base URL</label>
              <input
                id="flowrite-base-url"
                v-model="flowriteBaseURLDraft"
                class="flowrite-settings__input"
                type="text"
                spellcheck="false"
                data-testid="flowrite-settings-base-url"
                @input="flowriteFeedback = null"
              >
            </div>
            <div class="flowrite-settings__field flowrite-settings__field--wide">
              <label class="flowrite-settings__label" for="flowrite-model">Model</label>
              <input
                id="flowrite-model"
                v-model="flowriteModelDraft"
                class="flowrite-settings__input"
                type="text"
                spellcheck="false"
                data-testid="flowrite-settings-model"
                @input="flowriteFeedback = null"
              >
            </div>
          </div>

          <div class="flowrite-settings__quick-actions">
            <button
              type="button"
              class="flowrite-settings__chip"
              data-testid="flowrite-settings-direct-defaults"
              @click="useClaudeDirectDefaults"
            >
              Use direct Claude defaults
            </button>
            <button
              v-if="flowriteCanClearStoredKey"
              type="button"
              class="flowrite-settings__chip"
              data-testid="flowrite-settings-clear-key"
              @click="markFlowriteKeyForRemoval"
            >
              Clear stored key on save
            </button>
          </div>

          <p class="flowrite-settings__notes">
            Open-source Flowrite talks directly to Claude. Your saved key stays in the OS keychain, not inside the markdown file or `.flowrite/` sidecars.
          </p>

          <div class="flowrite-settings__actions">
            <button
              type="button"
              class="flowrite-settings__button is-secondary"
              :disabled="flowriteTesting || flowriteSaving"
              data-testid="flowrite-settings-test"
              @click="testFlowriteConnection"
            >
              {{ flowriteTesting ? 'Testing…' : 'Test connection' }}
            </button>
            <button
              type="button"
              class="flowrite-settings__button"
              :disabled="flowriteSaving || flowriteTesting"
              data-testid="flowrite-settings-save"
              @click="saveFlowriteSettings"
            >
              {{ flowriteSaving ? 'Saving…' : 'Save Flowrite settings' }}
            </button>
          </div>

          <p
            v-if="flowriteFeedback"
            class="flowrite-settings__feedback"
            :class="`is-${flowriteFeedback.tone}`"
            data-testid="flowrite-settings-feedback"
          >
            {{ flowriteFeedback.message }}
          </p>
        </section>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Action on startup:</h6>
      </template>
      <template #children>
        <section class="startup-action-ctrl">
          <el-radio-group v-model="startUpAction">
            <!--
              Hide "lastState" for now (#2064).
            <el-radio class="ag-underdevelop" label="lastState">Restore last editor session</el-radio>
            -->
            <el-radio label="folder" style="margin-bottom: 10px;">Open the default directory<span>: {{defaultDirectoryToOpen}}</span></el-radio>
            <el-button size="small" @click="selectDefaultDirectoryToOpen">Select Folder</el-button>
            <el-radio label="blank">Open a blank page</el-radio>
          </el-radio-group>
        </section>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Misc:</h6>
      </template>
      <template #children>
        <cur-select
          description="User interface language"
          :value="language"
          :options="languageOptions"
          :onChange="value => onSelectChange('language', value)"
          :disable="true"
        ></cur-select>
      </template>
    </compound>
  </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import { mapState } from 'vuex'
import Compound from '../common/compound'
import Range from '../common/range'
import CurSelect from '../common/select'
import Bool from '../common/bool'
import { isOsx } from '@/util'

import {
  titleBarStyleOptions,
  zoomOptions,
  fileSortByOptions,
  languageOptions,
  flowriteCollaborationOptions
} from './config'
import {
  FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL,
  FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
} from '../../../flowrite/constants'

export default {
  components: {
    Compound,
    Bool,
    Range,
    CurSelect
  },
  data () {
    return {
      titleBarStyleOptions,
      zoomOptions,
      fileSortByOptions,
      languageOptions,
      flowriteCollaborationOptions,
      isOsx,
      flowriteBaseURLDraft: FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL,
      flowriteModelDraft: FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL,
      flowriteApiKeyDraft: '',
      flowriteClearKeyPending: false,
      flowriteSaving: false,
      flowriteTesting: false,
      flowriteFeedback: null,
      flowriteDraftsInitialized: false
    }
  },
  computed: {
    ...mapState({
      autoSave: state => state.preferences.autoSave,
      autoSaveDelay: state => state.preferences.autoSaveDelay,
      titleBarStyle: state => state.preferences.titleBarStyle,
      defaultDirectoryToOpen: state => state.preferences.defaultDirectoryToOpen,
      openFilesInNewWindow: state => state.preferences.openFilesInNewWindow,
      openFolderInNewWindow: state => state.preferences.openFolderInNewWindow,
      zoom: state => state.preferences.zoom,
      hideScrollbar: state => state.preferences.hideScrollbar,
      wordWrapInToc: state => state.preferences.wordWrapInToc,
      fileSortBy: state => state.preferences.fileSortBy,
      language: state => state.preferences.language,
      flowrite: state => state.preferences.flowrite,
      flowriteCollaborationMode: state => state.preferences.flowrite.collaborationMode
    }),
    startUpAction: {
      get: function () {
        return this.$store.state.preferences.startUpAction
      },
      set: function (value) {
        const type = 'startUpAction'
        this.$store.dispatch('SET_SINGLE_PREFERENCE', { type, value })
      }
    },
    flowriteConfigured () {
      return Boolean(this.flowrite && this.flowrite.configured)
    },
    flowriteCanClearStoredKey () {
      return this.flowriteConfigured || this.flowriteClearKeyPending
    },
    flowriteStatusTone () {
      if (!this.flowrite) {
        return 'muted'
      }

      if (this.flowrite.reason === 'secure_storage_unavailable') {
        return 'warning'
      }

      if (this.flowrite.status === 'ready' && this.flowrite.enabled) {
        return 'success'
      }

      if (this.flowrite.reason === 'offline') {
        return 'warning'
      }

      return 'muted'
    },
    flowriteStatusLabel () {
      if (!this.flowrite) {
        return 'Loading'
      }

      if (this.flowrite.reason === 'secure_storage_unavailable') {
        return 'Keychain unavailable'
      }

      if (this.flowrite.status === 'ready' && this.flowrite.enabled) {
        return 'Ready'
      }

      if (this.flowrite.reason === 'offline') {
        return 'Offline'
      }

      if (this.flowrite.reason === 'disabled') {
        return 'Disabled'
      }

      return 'Needs setup'
    },
    flowriteSummary () {
      if (!this.flowrite) {
        return 'Loading Flowrite settings…'
      }

      switch (this.flowrite.reason) {
        case 'secure_storage_unavailable':
          return 'This device cannot encrypt a Claude API key, so Flowrite stays off for safety.'
        case 'offline':
          return 'Flowrite is configured, but the Claude API was unreachable the last time it was checked.'
        case 'disabled':
          return 'Flowrite is turned off until you re-enable a working Claude connection.'
        case 'unconfigured':
          return 'Add your Claude API key below to enable reviews, margin comments, and explicit rewrite suggestions.'
        default:
          return this.flowrite.enabled
            ? 'Flowrite is ready to comment, review, and suggest rewrites without editing silently.'
            : 'Flowrite is not ready yet.'
      }
    },
    flowriteKeyStateMessage () {
      if (this.flowriteClearKeyPending) {
        return 'The saved Claude key will be removed the next time you save Flowrite settings.'
      }

      if (this.flowriteConfigured) {
        return 'A Claude API key is already stored securely in your OS keychain. Enter a new one only if you want to replace it.'
      }

      return 'No Claude API key is saved yet.'
    }
  },
  watch: {
    flowrite: {
      immediate: true,
      deep: true,
      handler () {
        if (!this.flowriteDraftsInitialized || this.flowriteSaving || this.flowriteTesting) {
          this.syncFlowriteDraftsFromState()
        }
      }
    }
  },
  methods: {
    onSelectChange (type, value) {
      this.$store.dispatch('SET_SINGLE_PREFERENCE', { type, value })
    },
    onFlowriteChange (value) {
      this.flowriteFeedback = null
      this.$store.dispatch('SET_USER_DATA', {
        type: 'flowrite',
        value: {
          collaborationMode: value
        }
      })
    },
    selectDefaultDirectoryToOpen () {
      this.$store.dispatch('SELECT_DEFAULT_DIRECTORY_TO_OPEN')
    },
    syncFlowriteDraftsFromState (nextFlowrite = null) {
      const flowrite = nextFlowrite || this.flowrite || {}
      this.flowriteBaseURLDraft = flowrite.baseURL || FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL
      this.flowriteModelDraft = flowrite.model || FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
      this.flowriteDraftsInitialized = true
    },
    normalizeFlowriteInput (value, fallback = '') {
      const trimmed = typeof value === 'string' ? value.trim() : ''
      return trimmed || fallback
    },
    handleFlowriteApiKeyInput () {
      this.flowriteFeedback = null
      if (this.flowriteApiKeyDraft) {
        this.flowriteClearKeyPending = false
      }
    },
    useClaudeDirectDefaults () {
      this.flowriteBaseURLDraft = FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL
      this.flowriteModelDraft = FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
      this.flowriteFeedback = {
        tone: 'info',
        message: 'Direct Claude defaults restored. Test the connection, then save when it looks right.'
      }
    },
    markFlowriteKeyForRemoval () {
      this.flowriteApiKeyDraft = ''
      this.flowriteClearKeyPending = true
      this.flowriteFeedback = {
        tone: 'info',
        message: 'The saved Claude API key will be cleared when you save Flowrite settings.'
      }
    },
    buildFlowritePayload ({ persist = false } = {}) {
      const payload = {
        baseURL: this.normalizeFlowriteInput(this.flowriteBaseURLDraft, FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL),
        model: this.normalizeFlowriteInput(this.flowriteModelDraft, FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL),
        collaborationMode: this.flowriteCollaborationMode
      }
      const apiKey = this.normalizeFlowriteInput(this.flowriteApiKeyDraft)

      if (apiKey) {
        payload.apiKey = apiKey
      } else if (this.flowriteClearKeyPending || (persist && !this.flowriteConfigured)) {
        payload.apiKey = ''
      }

      return payload
    },
    async testFlowriteConnection () {
      if (this.flowriteTesting || this.flowriteSaving) {
        return
      }

      this.flowriteTesting = true
      this.flowriteFeedback = {
        tone: 'info',
        message: 'Testing the Claude connection…'
      }

      try {
        const result = await ipcRenderer.invoke('mt::flowrite:test-api-key', this.buildFlowritePayload())
        if (result && result.valid) {
          this.flowriteFeedback = {
            tone: 'success',
            message: `Connection looks good. Flowrite can reach ${result.flowrite.model} at ${result.flowrite.baseURL}.`
          }
          return
        }

        this.flowriteFeedback = {
          tone: 'error',
          message: result && result.error && result.error.message
            ? result.error.message
            : 'Flowrite could not validate this Claude connection.'
        }
      } catch (error) {
        this.flowriteFeedback = {
          tone: 'error',
          message: error && error.message
            ? error.message
            : 'Flowrite could not validate this Claude connection.'
        }
      } finally {
        this.flowriteTesting = false
      }
    },
    async saveFlowriteSettings () {
      if (this.flowriteSaving || this.flowriteTesting) {
        return
      }

      this.flowriteSaving = true
      this.flowriteFeedback = {
        tone: 'info',
        message: 'Saving Flowrite settings…'
      }

      try {
        const result = await ipcRenderer.invoke('mt::flowrite:update-settings', {
          enabled: true,
          ...this.buildFlowritePayload({ persist: true })
        })

        this.syncFlowriteDraftsFromState(result)
        this.flowriteApiKeyDraft = ''
        this.flowriteClearKeyPending = false

        if (result && result.reason === 'secure_storage_unavailable') {
          this.flowriteFeedback = {
            tone: 'warning',
            message: 'This device could not store the Claude key securely, so Flowrite stayed disabled.'
          }
          return
        }

        this.flowriteFeedback = {
          tone: result && result.enabled ? 'success' : 'warning',
          message: result && result.enabled
            ? 'Flowrite settings saved. The Claude connection is ready to use.'
            : 'Flowrite settings saved, but the connection still needs attention before AI can run.'
        }
      } catch (error) {
        this.flowriteFeedback = {
          tone: 'error',
          message: error && error.message
            ? error.message
            : 'Flowrite settings could not be saved.'
        }
      } finally {
        this.flowriteSaving = false
      }
    }
  }
}
</script>

<style scoped>
  .pref-general {
    & .startup-action-ctrl {
      font-size: 14px;
      user-select: none;
      color: var(--editorColor);
      & .el-button--small {
        margin-left: 25px;
      }
      & label {
        display: block;
        margin: 20px 0;
      }
    }
  }

  .flowrite-settings {
    margin-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    padding-top: 14px;
  }

  .flowrite-settings__status {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .flowrite-settings__badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  .flowrite-settings__badge.is-success {
    background: rgba(112, 181, 142, 0.18);
    color: rgba(39, 94, 63, 0.98);
  }

  .flowrite-settings__badge.is-warning {
    background: rgba(220, 175, 97, 0.18);
    color: rgba(117, 82, 27, 0.98);
  }

  .flowrite-settings__badge.is-muted {
    background: rgba(130, 139, 151, 0.12);
    color: rgba(84, 91, 101, 0.92);
  }

  .flowrite-settings__summary,
  .flowrite-settings__key-state,
  .flowrite-settings__notes,
  .flowrite-settings__feedback {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--editorColor80);
  }

  .flowrite-settings__key-state,
  .flowrite-settings__notes,
  .flowrite-settings__feedback {
    margin-top: 10px;
  }

  .flowrite-settings__field-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  .flowrite-settings__field {
    margin-top: 12px;
  }

  .flowrite-settings__label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--editorColor70);
    margin-bottom: 6px;
  }

  .flowrite-settings__input {
    width: 100%;
    height: 32px;
    border-radius: 9px;
    border: 1px solid var(--editorColor10);
    background: rgba(255, 255, 255, 0.72);
    color: var(--editorColor);
    padding: 0 11px;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;
  }

  .flowrite-settings__input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--editorColor20) 40%, var(--themeColor) 60%);
    box-shadow: 0 0 0 3px rgba(103, 145, 211, 0.08);
  }

  .flowrite-settings__quick-actions,
  .flowrite-settings__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .flowrite-settings__chip,
  .flowrite-settings__button {
    appearance: none;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: transparent;
    color: var(--editorColor80);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    padding: 8px 12px;
  }

  .flowrite-settings__button {
    background: color-mix(in srgb, var(--editorBgColor) 68%, var(--themeColor) 32%);
  }

  .flowrite-settings__button.is-secondary {
    background: transparent;
  }

  .flowrite-settings__button:disabled,
  .flowrite-settings__chip:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .flowrite-settings__feedback.is-success {
    color: rgba(39, 94, 63, 0.98);
  }

  .flowrite-settings__feedback.is-warning {
    color: rgba(117, 82, 27, 0.98);
  }

  .flowrite-settings__feedback.is-error {
    color: #9b4d3a;
  }

  .flowrite-settings__feedback.is-info {
    color: var(--editorColor70);
  }

  @media (max-width: 720px) {
    .flowrite-settings__field-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
