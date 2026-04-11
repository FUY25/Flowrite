<template>
  <div
    class="side-bar-folder"
  >
    <div
      class="folder-name" @click="folderNameClick"
      :style="{'padding-left': `${(depth * 20) + 20}px`}"
      :class="[{ 'active': folder.id === activeItem.id }]"
      :title="folder.pathname"
      ref="folder"
    >
      <svg class="icon" aria-hidden="true">
        <use :xlink:href="`#${folder.isCollapsed ? 'icon-folder-close' : 'icon-folder-open'}`"></use>
      </svg>
      <input
        type="text"
        @click.stop="noop"
        class="rename"
        v-if="renameCache === folder.pathname"
        v-model="newName"
        ref="renameInput"
        @keydown.enter="rename"
      >
      <span v-else class="text-overflow">{{folder.name}}</span>
      <button
        v-if="renameCache !== folder.pathname"
        type="button"
        class="folder-add-button"
        title="New file"
        @click.stop="createFileInFolder"
      >
        +
      </button>
    </div>
    <div
      class="folder-contents"
      v-if="!folder.isCollapsed"
    >
      <folder
        v-for="(childFolder, index) of sortedFolders" :key="index + 'folder'"
        :folder="childFolder"
        :depth="depth + 1"
      ></folder>
      <input
        type="text" v-if="createCache.dirname === folder.pathname"
        class="new-input"
        :style="{'margin-left': `${depth * 5 + 15}px` }"
        ref="input"
        @keydown.enter="handleInputEnter"
        v-model="createName"
      >
      <file
        v-for="(file, index) of sortedFiles" :key="index + 'file'"
        :file="file"
        :depth="depth + 1"
      ></file>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'
import { createFileOrDirectoryMixins } from '../../mixins'
import { sortFilesForSidebar, sortFoldersForSidebar } from '../../store/treeCtrl'

export default {
  mixins: [createFileOrDirectoryMixins],
  name: 'folder',
  data () {
    return {
      createName: '',
      newName: ''
    }
  },
  props: {
    folder: {
      type: Object,
      required: true
    },
    depth: {
      type: Number,
      required: true
    }
  },
  components: {
    File: () => import('./treeFile.vue')
  },
  computed: {
    ...mapState({
      renameCache: state => state.project.renameCache,
      createCache: state => state.project.createCache,
      activeItem: state => state.project.activeItem,
      clipboard: state => state.project.clipboard,
      fileSortBy: state => state.preferences.fileSortBy
    }),
    sortedFolders () {
      return sortFoldersForSidebar(this.folder.folders, this.fileSortBy)
    },
    sortedFiles () {
      return sortFilesForSidebar(this.folder.files, this.fileSortBy)
    }
  },
  created () {
    this.$nextTick(() => {
      this.$refs.folder.addEventListener('contextmenu', event => {
        event.preventDefault()
        this.$store.dispatch('CHANGE_ACTIVE_ITEM', this.folder)
        showContextMenu(event, !!this.clipboard)
      })
      bus.$on('SIDEBAR::show-new-input', this.handleInputFocus)
      bus.$on('SIDEBAR::show-rename-input', this.focusRenameInput)
    })
  },
  methods: {
    folderNameClick () {
      this.folder.isCollapsed = !this.folder.isCollapsed
    },
    createFileInFolder () {
      this.$store.dispatch('CHANGE_ACTIVE_ITEM', this.folder)
      bus.$emit('SIDEBAR::new', 'file')
    },
    noop () {},
    focusRenameInput () {
      this.$nextTick(() => {
        if (this.$refs.renameInput) {
          this.$refs.renameInput.focus()
          this.newName = this.folder.name
        }
      })
    },
    rename () {
      const { newName } = this
      if (newName) {
        this.$store.dispatch('RENAME_IN_SIDEBAR', newName)
      }
    }
  }
}
</script>

<style scoped>
  .side-bar-folder {
    & > .folder-name {
      cursor: default;
      user-select: none;
      display: flex;
      align-items: center;
      height: 30px;
      padding-right: 15px;
      gap: 5px;
      & > svg {
        flex-shrink: 0;
        color: var(--sideBarIconColor);
        margin-right: 5px;
      }
      & > span {
        flex: 1;
        min-width: 0;
      }
      &:hover {
        background: var(--sideBarItemHoverBgColor);
      }
    }
  }

  .folder-add-button {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--sideBarColor);
    width: 18px;
    height: 18px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    line-height: 1;
    opacity: 0;
    cursor: pointer;
    flex-shrink: 0;
  }

  .folder-name:hover .folder-add-button,
  .folder-add-button:focus-visible {
    opacity: 1;
  }

  .folder-add-button:hover {
    background: rgba(20, 24, 31, 0.06);
    color: var(--sideBarTitleColor);
  }

  .new-input, input.rename {
    outline: none;
    height: 22px;
    margin: 5px 0;
    padding: 0 6px;
    color: var(--sideBarColor);
    border: 1px solid var(--floatBorderColor);
    background: var(--floatBorderColor);
    width: 70%;
    border-radius: 3px;
  }
</style>
