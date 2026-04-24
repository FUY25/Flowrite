<template>
  <section class="flowrite-version-history" data-testid="flowrite-version-history-popover">
    <header class="flowrite-version-history__header">
      <div>
        <h3 class="flowrite-version-history__title">Version history</h3>
        <p class="flowrite-version-history__subtitle">
          Recent saves and AI rewrite checkpoints for this draft.
        </p>
      </div>
      <button
        type="button"
        class="flowrite-version-history__close"
        aria-label="Close version history"
        @click="$emit('close')"
      >
        ×
      </button>
    </header>

    <p
      v-if="loading"
      class="flowrite-version-history__state"
      data-testid="flowrite-version-history-loading"
    >
      Loading version history…
    </p>

    <p
      v-else-if="loadError"
      class="flowrite-version-history__state flowrite-version-history__state--error"
      data-testid="flowrite-version-history-error"
    >
      {{ loadError }}
    </p>

    <p
      v-else-if="!entries.length"
      class="flowrite-version-history__state"
      data-testid="flowrite-version-history-empty"
    >
      Save this document to start building version history.
    </p>

    <div v-else class="flowrite-version-history__body">
      <aside class="flowrite-version-history__list" data-testid="flowrite-version-history-list">
        <button
          v-for="entry in entries"
          :key="entry.id"
          type="button"
          class="flowrite-version-history__entry"
          :class="{ 'is-active': entry.id === selectedId }"
          :data-testid="entry.id === selectedId ? 'flowrite-version-history-entry-active' : null"
          @click="selectEntry(entry.id)"
        >
          <span class="flowrite-version-history__entry-title">{{ formatEntryTitle(entry) }}</span>
          <span class="flowrite-version-history__entry-meta">{{ formatEntryMeta(entry) }}</span>
        </button>
      </aside>

      <section v-if="selectedEntry" class="flowrite-version-history__detail">
        <div class="flowrite-version-history__detail-header">
          <div>
            <h4 class="flowrite-version-history__detail-title">{{ formatEntryTitle(selectedEntry) }}</h4>
            <p class="flowrite-version-history__detail-meta">
              {{ formatEntryMeta(selectedEntry) }}
            </p>
          </div>
          <button
            type="button"
            class="flowrite-version-history__restore"
            data-testid="flowrite-version-history-restore"
            :disabled="!canRestore || restoring"
            @click="restoreSelected"
          >
            {{ restoring ? 'Restoring…' : 'Restore to editor' }}
          </button>
        </div>

        <p class="flowrite-version-history__note">
          Comparing this saved version with the current editor buffer.
          <span v-if="!currentSaved">Save or discard your current edits before restoring an older version.</span>
        </p>

        <p
          v-if="restoreError"
          class="flowrite-version-history__state flowrite-version-history__state--error"
          data-testid="flowrite-version-history-restore-error"
        >
          {{ restoreError }}
        </p>

        <div class="flowrite-version-history__diff" data-testid="flowrite-version-history-diff">
          <div
            v-for="(line, index) in diffLines"
            :key="`${selectedEntry.id}-${index}-${line.type}`"
            class="flowrite-version-history__diff-line"
            :class="[`is-${line.type}`]"
          >
            <span class="flowrite-version-history__diff-marker">{{ line.marker }}</span>
            <pre class="flowrite-version-history__diff-text">{{ line.text }}</pre>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script>
import { buildVersionHistoryDiff } from './versionHistoryDiff'

export default {
  props: {
    currentMarkdown: {
      type: String,
      default: ''
    },
    currentSaved: {
      type: Boolean,
      default: true
    }
  },
  data () {
    return {
      loading: false,
      loadError: '',
      entries: [],
      selectedId: '',
      restoring: false,
      restoreError: ''
    }
  },
  computed: {
    selectedEntry () {
      return this.entries.find(entry => entry.id === this.selectedId) || this.entries[0] || null
    },

    diffLines () {
      if (!this.selectedEntry) {
        return []
      }

      return buildVersionHistoryDiff(this.selectedEntry.markdown || '', this.currentMarkdown || '')
    },

    canRestore () {
      return Boolean(
        this.currentSaved &&
        this.selectedEntry &&
        typeof this.selectedEntry.markdown === 'string' &&
        this.selectedEntry.markdown !== this.currentMarkdown
      )
    }
  },
  mounted () {
    this.loadHistory()
  },
  methods: {
    async loadHistory () {
      this.loading = true
      this.loadError = ''
      this.restoreError = ''

      try {
        const entries = await this.$store.dispatch('LIST_FLOWRITE_VERSION_HISTORY')
        this.entries = Array.isArray(entries) ? entries : []
        this.selectedId = this.entries.length ? this.entries[0].id : ''
      } catch (error) {
        this.entries = []
        this.selectedId = ''
        this.loadError = error && error.message ? error.message : 'Unable to load version history.'
      } finally {
        this.loading = false
      }
    },

    selectEntry (entryId) {
      this.selectedId = entryId
      this.restoreError = ''
    },

    async restoreSelected () {
      if (!this.selectedEntry || !this.canRestore) {
        return
      }

      this.restoring = true
      this.restoreError = ''

      try {
        await this.$store.dispatch('RESTORE_FLOWRITE_VERSION_SNAPSHOT', this.selectedEntry)
        this.$emit('restored', this.selectedEntry)
      } catch (error) {
        this.restoreError = error && error.message ? error.message : 'Unable to restore this version.'
      } finally {
        this.restoring = false
      }
    },

    formatEntryTitle (entry = {}) {
      if (entry.kind === 'accepted_suggestion_pre_save') {
        return 'Before accepted AI rewrite'
      }

      switch (entry.saveReason) {
        case 'autosave':
          return 'Autosave'
        case 'save_as':
          return 'Saved as new file'
        case 'window_close':
          return 'Saved before closing'
        case 'move_to':
          return 'Saved before moving'
        case 'rename':
          return 'Saved before renaming'
        case 'save_all':
          return 'Saved from Save All'
        default:
          return 'Manual save'
      }
    },

    formatEntryMeta (entry = {}) {
      if (!entry.createdAt) {
        return 'Unknown time'
      }

      const date = new Date(entry.createdAt)
      if (Number.isNaN(date.getTime())) {
        return 'Unknown time'
      }

      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    }
  }
}
</script>

<style scoped>
  .flowrite-version-history {
    width: min(760px, 76vw);
    max-width: 760px;
    min-width: 520px;
    border: 1px solid rgba(34, 40, 49, 0.09);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 24px 48px rgba(17, 24, 39, 0.16);
    padding: 16px;
  }

  .flowrite-version-history__header,
  .flowrite-version-history__detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .flowrite-version-history__title,
  .flowrite-version-history__detail-title {
    margin: 0;
    color: #273142;
    font-size: 15px;
    font-weight: 700;
  }

  .flowrite-version-history__subtitle,
  .flowrite-version-history__detail-meta,
  .flowrite-version-history__note,
  .flowrite-version-history__entry-meta,
  .flowrite-version-history__state {
    margin: 4px 0 0;
    color: rgba(92, 100, 112, 0.92);
    font-size: 12px;
    line-height: 1.45;
  }

  .flowrite-version-history__close,
  .flowrite-version-history__restore,
  .flowrite-version-history__entry {
    appearance: none;
    border: none;
    background: transparent;
  }

  .flowrite-version-history__close {
    color: rgba(92, 100, 112, 0.9);
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
    padding: 0;
  }

  .flowrite-version-history__body {
    margin-top: 14px;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 14px;
    min-height: 320px;
  }

  .flowrite-version-history__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 420px;
    overflow: auto;
    padding-right: 4px;
  }

  .flowrite-version-history__entry {
    width: 100%;
    text-align: left;
    cursor: pointer;
    border: 1px solid rgba(34, 40, 49, 0.08);
    border-radius: 12px;
    padding: 11px 12px;
    background: rgba(248, 249, 252, 0.76);
  }

  .flowrite-version-history__entry.is-active {
    border-color: rgba(210, 153, 51, 0.34);
    background: rgba(252, 249, 240, 0.96);
  }

  .flowrite-version-history__entry-title {
    display: block;
    color: #273142;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }

  .flowrite-version-history__detail {
    min-width: 0;
  }

  .flowrite-version-history__restore {
    border-radius: 999px;
    background: rgba(210, 153, 51, 0.94);
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
  }

  .flowrite-version-history__restore:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .flowrite-version-history__diff {
    margin-top: 12px;
    max-height: 360px;
    overflow: auto;
    border: 1px solid rgba(34, 40, 49, 0.08);
    border-radius: 12px;
    background: rgba(250, 251, 253, 0.92);
  }

  .flowrite-version-history__diff-line {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px;
    align-items: flex-start;
    padding: 6px 10px;
    border-top: 1px solid rgba(34, 40, 49, 0.04);
  }

  .flowrite-version-history__diff-line:first-child {
    border-top: none;
  }

  .flowrite-version-history__diff-line.is-add {
    background: rgba(214, 245, 226, 0.54);
  }

  .flowrite-version-history__diff-line.is-remove {
    background: rgba(252, 228, 228, 0.56);
  }

  .flowrite-version-history__diff-marker {
    color: rgba(92, 100, 112, 0.9);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.45;
    padding-top: 2px;
  }

  .flowrite-version-history__diff-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: #273142;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.45;
  }

  .flowrite-version-history__state--error {
    color: #9b4d3a;
  }
</style>
