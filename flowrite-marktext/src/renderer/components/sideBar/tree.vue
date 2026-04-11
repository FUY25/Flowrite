<template>
  <div class="tree-view">
    <div
      class="project-tree" v-if="projectTree"
    >
      <div class="tree-wrapper">
        <folder
          v-for="(folder, index) of sortedFolders" :key="index + 'folder'"
          :folder="folder"
          :depth="depth"
        ></folder>
        <input
          type="text" class="new-input" v-show="createCache.dirname === projectTree.pathname"
          :style="{'margin-left': `${depth * 5 + 15}px` }"
          ref="input"
          v-model="createName"
          @keydown.enter="handleInputEnter"
        >
        <file
          v-for="(file, index) of sortedFiles" :key="index + 'file'"
          :file="file"
          :depth="depth"
        ></file>
        <div class="empty-project" v-if="projectTree.files.length === 0 && projectTree.folders.length === 0">
          <span>Empty project</span>
          <a href="javascript:;" @click.stop="createFile">Create File</a>
        </div>
      </div>
    </div>
    <div v-else class="open-project">
      <div class="centered-group">
        <svg aria-hidden="true" :viewBox="FolderIcon.viewBox">
          <use :xlink:href="FolderIcon.url"></use>
        </svg>
        <button class="button-primary" @click="openFolder">
          Open Folder
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import { mapState } from 'vuex'
import bus from '../../bus'
import { createFileOrDirectoryMixins } from '../../mixins'
import FolderIcon from '@/assets/icons/undraw_folder.svg'
import { sortFilesForSidebar, sortFoldersForSidebar } from '../../store/treeCtrl'

export default {
  mixins: [createFileOrDirectoryMixins],
  data () {
    this.depth = 0
    this.FolderIcon = FolderIcon
    return {
      showNewInput: false,
      createName: ''
    }
  },
  props: {
    projectTree: {
      validator: function (value) {
        return typeof value === 'object'
      },
      required: true
    },
    tabs: Array
  },
  components: {
    Folder,
    File
  },
  computed: {
    ...mapState({
      createCache: state => state.project.createCache,
      fileSortBy: state => state.preferences.fileSortBy
    }),
    sortedFolders () {
      return this.projectTree ? sortFoldersForSidebar(this.projectTree.folders, this.fileSortBy) : []
    },
    sortedFiles () {
      return this.projectTree ? sortFilesForSidebar(this.projectTree.files, this.fileSortBy) : []
    }
  },
  created () {
    this.$nextTick(() => {
      bus.$on('SIDEBAR::show-new-input', this.handleInputFocus)
      // hide rename or create input if needed
      document.addEventListener('click', event => {
        const target = event.target
        if (
          target.tagName !== 'INPUT' &&
          !target.closest('.side-bar__footer-button') &&
          !target.closest('.folder-add-button')
        ) {
          this.$store.dispatch('CHANGE_ACTIVE_ITEM', {})
          this.$store.commit('CREATE_PATH', {})
          this.$store.commit('SET_RENAME_CACHE', null)
        }
      })
      document.addEventListener('contextmenu', event => {
        const target = event.target
        if (target.tagName !== 'INPUT') {
          this.$store.commit('CREATE_PATH', {})
          this.$store.commit('SET_RENAME_CACHE', null)
        }
      })
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          this.$store.commit('CREATE_PATH', {})
          this.$store.commit('SET_RENAME_CACHE', null)
        }
      })
    })
  },
  methods: {
    openFolder () {
      this.$store.dispatch('ASK_FOR_OPEN_PROJECT')
    },
    createFile () {
      this.$store.dispatch('CHANGE_ACTIVE_ITEM', this.projectTree)
      bus.$emit('SIDEBAR::new', 'file')
    }
  }
}
</script>

<style scoped>
  .list-item {
    display: inline-block;
    margin-right: 10px;
  }

  .list-enter-active, .list-leave-active {
    transition: all .2s;
  }
  .list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
    opacity: 0;
    transform: translateX(-50px);
  }
  .tree-view {
    font-size: 14px;
    color: var(--sideBarColor);
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .project-tree {
    display: flex;
    flex-direction: column;
    overflow: auto;
    & > .tree-wrapper {
      overflow: auto;
      flex: 1;
      &::-webkit-scrollbar:vertical {
        width: 8px;
      }
    }
    flex: 1;
  }
  .open-project {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: center;
    padding-bottom: 100px;
    & .centered-group {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    & svg {
      width: 120px;
      fill: var(--themeColor);
    }
    & button.button-primary {
      display: block;
      margin-top: 20px;
    }
  }
  .new-input {
    outline: none;
    height: 22px;
    margin: 5px 0;
    padding: 0 6px;
    color: var(--sideBarColor);
    border: 1px solid var(--floatBorderColor);
    background: var(--floatBorderColor);
    width: calc(100% - 45px);
    border-radius: 3px;
  }
  .tree-wrapper {
    position: relative;
  }
  .empty-project {
    position: absolute;
    top: 0;
    left: 0;
    font-size: 14px;
    display: flex;
    flex-direction: column;
    padding-top: 40px;
    align-items: center;
    & > a {
      color: var(--highlightThemeColor);
      text-align: center;
      margin-top: 15px;
      text-decoration: none;
    }
  }
  .bold {
    font-weight: 600;
  }
</style>
