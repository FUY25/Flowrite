<template>
  <div
    v-show="showSideBar"
    class="side-bar"
    :class="{ 'is-osx': isOsx }"
    ref="sideBar"
    :style="{ 'width': `${finalSideBarWidth}px` }"
  >
    <div class="side-bar__pane">
      <header class="side-bar__header">
        <button
          class="side-bar__header-button"
          :title="normalizedPane === 'toc' ? 'Show files' : 'Show outline'"
          @click="togglePrimaryPane"
        >
          <svg :viewBox="primaryIcon.viewBox">
            <use :xlink:href="primaryIcon.url"></use>
          </svg>
        </button>
        <div class="side-bar__title">
          {{ paneTitle }}
        </div>
        <button
          class="side-bar__header-button"
          :class="{ 'is-active': normalizedPane === 'search' }"
          title="Search"
          @click="toggleSearch"
        >
          <svg :viewBox="SearchIcon.viewBox">
            <use :xlink:href="SearchIcon.url"></use>
          </svg>
        </button>
      </header>

      <div class="right-column">
        <tree
          :project-tree="projectTree"
          :tabs="tabs"
          v-if="normalizedPane === 'files'"
        ></tree>
        <side-bar-search
          v-else-if="normalizedPane === 'search'"
        ></side-bar-search>
        <toc
          v-else-if="normalizedPane === 'toc'"
        ></toc>
      </div>

      <footer class="side-bar__footer">
        <button
          type="button"
          class="side-bar__footer-button"
          title="New file"
          :disabled="!canCreateFile"
          @click="createRootFile"
        >
          +
        </button>

        <div
          class="side-bar__footer-label text-overflow"
          :title="projectTree && projectTree.pathname ? projectTree.pathname : ''"
        >
          {{ footerLabel }}
        </div>

        <div class="side-bar__footer-actions">
          <div
            class="side-bar__sort"
            ref="sort"
          >
            <button
              type="button"
              class="side-bar__footer-button side-bar__footer-button--sort"
              :class="{ 'is-active': showSortMenu }"
              title="Sort items"
              :disabled="!canSortFiles"
              @click="toggleSortMenu"
            >
              <span class="side-bar__sort-icon" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>

            <div
              v-if="showSortMenu"
              class="side-bar__sort-menu"
            >
              <button
                v-for="option in sortOptions"
                :key="option.value"
                type="button"
                class="side-bar__sort-option"
                :class="{ 'is-active': fileSortBy === option.value }"
                @click="selectSort(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
    <div class="drag-bar" ref="dragBar"></div>
  </div>
</template>

<script>
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import { mapState, mapGetters } from 'vuex'
import bus from '../../bus'
import { isOsx } from '@/util'
import FilesIcon from '@/assets/icons/files.svg'
import SearchIcon from '@/assets/icons/search.svg'
import TocIcon from '@/assets/icons/toc.svg'

export default {
  data () {
    this.FilesIcon = FilesIcon
    this.SearchIcon = SearchIcon
    this.TocIcon = TocIcon
    this.isOsx = isOsx
    return {
      showSortMenu: false,
      sortOptions: [
        { label: 'Recently changed', value: 'modified' },
        { label: 'Recently created', value: 'created' },
        { label: 'Title', value: 'title' }
      ]
    }
  },
  components: {
    Tree,
    SideBarSearch,
    Toc
  },
  computed: {
    ...mapGetters([
      'effectiveSideBarWidth'
    ]),
    ...mapState({
      rightColumn: state => state.layout.rightColumn,
      showSideBar: state => state.layout.showSideBar,
      projectTree: state => state.project.projectTree,
      tabs: state => state.editor.tabs,
      fileSortBy: state => state.preferences.fileSortBy
    }),
    normalizedPane () {
      return this.rightColumn || 'files'
    },
    paneTitle () {
      switch (this.normalizedPane) {
        case 'toc':
          return 'Outline'
        case 'search':
          return 'Search'
        default:
          return 'Files'
      }
    },
    primaryIcon () {
      return this.normalizedPane === 'toc' ? this.FilesIcon : this.TocIcon
    },
    finalSideBarWidth () {
      const { showSideBar, effectiveSideBarWidth } = this
      if (!showSideBar) return 0
      return effectiveSideBarWidth
    },
    canCreateFile () {
      return this.normalizedPane === 'files' && Boolean(this.projectTree && this.projectTree.pathname)
    },
    canSortFiles () {
      return this.normalizedPane === 'files' && Boolean(this.projectTree)
    },
    footerLabel () {
      if (this.projectTree && this.projectTree.name) {
        return this.projectTree.name
      }

      return this.normalizedPane === 'toc' ? 'Outline' : 'No Folder'
    }
  },
  created () {
    this.$nextTick(() => {
      const dragBar = this.$refs.dragBar
      let startX = 0
      let sideBarWidth = +this.effectiveSideBarWidth
      let startWidth = sideBarWidth

      const mouseUpHandler = event => {
        document.removeEventListener('mousemove', mouseMoveHandler, false)
        document.removeEventListener('mouseup', mouseUpHandler, false)
        const finalWidth = sideBarWidth < 220 ? 220 : sideBarWidth
        this.$store.dispatch('CHANGE_SIDE_BAR_WIDTH', finalWidth)
        this.$store.dispatch('CHANGE_SIDE_BAR_LIVE_WIDTH', null)
      }

      const mouseMoveHandler = event => {
        const offset = event.clientX - startX
        sideBarWidth = startWidth + offset
        this.$store.dispatch('CHANGE_SIDE_BAR_LIVE_WIDTH', sideBarWidth)
      }

      const mouseDownHandler = event => {
        startX = event.clientX
        startWidth = +this.effectiveSideBarWidth
        document.addEventListener('mousemove', mouseMoveHandler, false)
        document.addEventListener('mouseup', mouseUpHandler, false)
      }

      dragBar.addEventListener('mousedown', mouseDownHandler, false)
    })
  },
  mounted () {
    document.addEventListener('click', this.handleDocumentClick, true)
  },
  beforeDestroy () {
    document.removeEventListener('click', this.handleDocumentClick, true)
  },
  methods: {
    togglePrimaryPane () {
      const nextColumn = this.normalizedPane === 'toc' ? 'files' : 'toc'
      this.$store.commit('SET_LAYOUT', { rightColumn: nextColumn })
      this.$store.dispatch('CHANGE_SIDE_BAR_WIDTH', this.finalSideBarWidth)
      this.$store.dispatch('CHANGE_SIDE_BAR_LIVE_WIDTH', null)
      this.showSortMenu = false
    },

    toggleSearch () {
      const nextColumn = this.normalizedPane === 'search' ? 'files' : 'search'
      this.$store.commit('SET_LAYOUT', { rightColumn: nextColumn })
      this.$store.dispatch('CHANGE_SIDE_BAR_WIDTH', this.finalSideBarWidth)
      this.$store.dispatch('CHANGE_SIDE_BAR_LIVE_WIDTH', null)
      this.showSortMenu = false
    },

    createRootFile () {
      if (!this.canCreateFile) {
        return
      }

      this.$store.dispatch('CHANGE_ACTIVE_ITEM', this.projectTree)
      bus.$emit('SIDEBAR::new', 'file')
    },

    toggleSortMenu () {
      if (!this.canSortFiles) {
        return
      }

      this.showSortMenu = !this.showSortMenu
    },

    selectSort (value) {
      this.$store.commit('SET_USER_PREFERENCE', { fileSortBy: value })
      this.$store.dispatch('SET_SINGLE_PREFERENCE', { type: 'fileSortBy', value })
      this.showSortMenu = false
    },

    handleDocumentClick (event) {
      if (!this.showSortMenu) {
        return
      }

      const root = this.$refs.sort
      if (root && !root.contains(event.target)) {
        this.showSortMenu = false
      }
    }
  }
}
</script>

<style scoped>
  .side-bar {
    display: block;
    flex-shrink: 0;
    flex-grow: 0;
    width: 270px;
    height: 100vh;
    min-width: 220px;
    position: relative;
    color: var(--sideBarColor);
    user-select: none;
    background: var(--workspaceSidebarBgColor);
    transition: background-color .14s linear;
  }

  .side-bar__pane {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .side-bar.is-osx .side-bar__pane {
    padding-top: var(--titleBarHeight);
    box-sizing: border-box;
  }

  .side-bar__header {
    height: 40px;
    padding: 0 10px 0 9px;
    display: grid;
    grid-template-columns: 26px 1fr 26px;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    background: inherit;
  }

  .side-bar__title {
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--sideBarTitleColor);
  }

  .side-bar__header-button {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--sideBarColor);
    cursor: pointer;
    border-radius: 8px;
  }

  .side-bar__header-button svg {
    width: 15px;
    height: 15px;
    fill: currentColor;
  }

  .side-bar__header-button:hover,
  .side-bar__header-button.is-active {
    background: rgba(20, 24, 31, 0.05);
    color: var(--sideBarTitleColor);
  }

  .right-column {
    flex: 1;
    width: 100%;
    overflow: hidden;
  }

  .side-bar__footer {
    min-height: 36px;
    padding: 0 8px;
    display: grid;
    grid-template-columns: 26px 1fr auto;
    align-items: center;
    gap: 8px;
    color: var(--sideBarColor);
  }

  .side-bar__footer-label {
    font-size: 13px;
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    text-align: center;
  }

  .side-bar__footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .side-bar__footer-button {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    color: var(--sideBarColor);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 17px;
    font-weight: 500;
    line-height: 1;
  }

  .side-bar__footer-button:hover,
  .side-bar__footer-button.is-active {
    background: rgba(20, 24, 31, 0.05);
    color: var(--sideBarTitleColor);
  }

  .side-bar__footer-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .side-bar__sort {
    position: relative;
  }

  .side-bar__sort-icon {
    width: 13px;
    height: 13px;
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  .side-bar__sort-icon span {
    height: 1px;
    border-radius: 999px;
    background: currentColor;
  }

  .side-bar__sort-icon span:nth-child(1) {
    width: 12px;
  }

  .side-bar__sort-icon span:nth-child(2) {
    width: 9px;
  }

  .side-bar__sort-icon span:nth-child(3) {
    width: 6px;
  }

  .side-bar__sort-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    min-width: 146px;
    padding: 6px;
    border-radius: 10px;
    border: 1px solid rgba(20, 24, 31, 0.08);
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 30px rgba(20, 24, 31, 0.08);
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 12;
  }

  .side-bar__sort-option {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 6px 8px;
    border-radius: 7px;
    text-align: left;
    font-size: 12px;
    color: var(--sideBarColor);
    cursor: pointer;
  }

  .side-bar__sort-option:hover,
  .side-bar__sort-option.is-active {
    background: rgba(20, 24, 31, 0.05);
    color: var(--sideBarTitleColor);
  }

  .drag-bar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    height: 100%;
    width: 3px;
    cursor: col-resize;
    &:hover {
      background: rgba(20, 24, 31, 0.06);
    }
  }

  .side-bar :deep(.tree-view),
  .side-bar :deep(.side-bar-search),
  .side-bar :deep(.side-bar-toc) {
    height: 100%;
  }

  .side-bar :deep(.tree-view > .title) {
    display: none;
  }

  .side-bar :deep(.project-tree > .title) {
    padding: 8px 16px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--sideBarTitleColor);
  }

  .side-bar :deep(.opened-files) {
    display: none;
  }

  .side-bar :deep(.tree-wrapper) {
    padding-bottom: 14px;
  }

  .side-bar :deep(.side-bar-file),
  .side-bar :deep(.folder),
  .side-bar :deep(.search-result-item),
  .side-bar :deep(.el-tree-node__content) {
    font-size: 13px;
  }

  .side-bar :deep(.side-bar-search .search-wrapper) {
    padding: 10px 14px 0;
  }

  .side-bar :deep(.side-bar-search .search-wrapper input) {
    border-radius: 10px;
    border: 1px solid rgba(20, 24, 31, 0.08);
    background: rgba(255, 255, 255, 0.72);
  }

  .side-bar :deep(.side-bar-toc .el-tree) {
    padding: 10px 14px 16px;
  }

  .side-bar :deep(.side-bar-toc .el-tree-node__content) {
    border-radius: 8px;
  }

  .side-bar :deep(.side-bar-file:hover),
  .side-bar :deep(.opened-file:hover),
  .side-bar :deep(.el-tree-node__content:hover) {
    background: rgba(20, 24, 31, 0.05);
  }

  .side-bar :deep(.side-bar-file.current > span),
  .side-bar :deep(.opened-file.active),
  .side-bar :deep(.el-tree-node.is-current > .el-tree-node__content) {
    color: var(--sideBarTitleColor);
  }

  .side-bar :deep(.side-bar-file.current::before) {
    display: none;
  }

  .side-bar :deep(.project-tree .empty-project) {
    padding: 18px 16px;
  }

  .side-bar :deep(.open-project .centered-group) {
    padding-top: 40px;
  }
</style>
