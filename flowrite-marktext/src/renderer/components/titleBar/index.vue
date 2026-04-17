<template>
  <div>
    <div
      class="title-bar-editor-bg"
      :style="titleBarBackgroundStyle"
    ></div>
    <div
      class="title-bar"
      :class="[
        { 'active': active },
        { 'frameless': titleBarStyle === 'custom' },
        { 'isOsx': isOsx },
        { 'distraction-hidden': hideForWriting }
      ]"
      :style="titleBarBackgroundStyle"
    >
      <div class="title" :style="{ fontFamily: writingFontFamily }" @dblclick.stop="toggleMaxmizeOnMacOS">
        <span v-if="!filename">MarkText</span>
        <span v-else>
          <span
            v-for="(path, index) of paths"
            :key="index"
          >
            {{ path }}
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-arrow-right"></use>
            </svg>
          </span>
          <span
            class="filename"
            :class="{'isOsx': platform === 'darwin'}"
            @click="rename"
          >
            {{ filename }}
          </span>
          <span class="save-dot" :class="{'show': !isSaved}"></span>
        </span>
      </div>
      <div
        v-if="isOsx"
        class="osx-left-actions title-no-drag"
      >
        <button
          type="button"
          class="osx-sidebar-toggle"
          aria-label="Toggle sidebar"
          @click.stop="toggleSidebar"
        >
          <span class="osx-sidebar-toggle__icon" aria-hidden="true">
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
      <div :class="showCustomTitleBar ? 'left-toolbar title-no-drag' : 'right-toolbar'">
        <flowrite-toolbar
          v-if="isOsx"
          inline
          class="title-no-drag"
        ></flowrite-toolbar>
        <div
          v-if="showCustomTitleBar"
          class="frameless-titlebar-menu title-no-drag"
          @click.stop="handleMenuClick"
        >
          <span class="text-center-vertical">&#9776;</span>
        </div>
        <el-tooltip
          v-if="wordCount"
          class="item"
          :content="`${wordCount[show]} ${HASH[show].full + (wordCount[show] > 1 ? 's' : '')}`"
          placement="bottom-end"
        >
          <div slot="content">
            <div class="title-item">
              <span class="front">Words:</span><span class="text">{{wordCount['word']}}</span>
            </div>
            <div class="title-item">
              <span class="front">Characters:</span><span class="text">{{wordCount['character']}}</span>
            </div>
            <div class="title-item">
              <span class="front">Paragraphs:</span><span class="text">{{wordCount['paragraph']}}</span>
            </div>
          </div>
          <div
            v-if="wordCount"
            class="word-count"
            :class="[{ 'title-no-drag': platform !== 'darwin' }]"
            @click.stop="handleWordClick"
          >
            <span class="text-center-vertical">{{ `${HASH[show].short} ${wordCount[show]}` }}</span>
          </div>
        </el-tooltip>
      </div>
      <div
        v-if="titleBarStyle === 'custom' && !isFullScreen && !isOsx"
        class="right-toolbar"
        :class="[{ 'title-no-drag': titleBarStyle === 'custom' }]"
      >
        <div class="frameless-titlebar-button frameless-titlebar-close" @click.stop="handleCloseClick">
          <div>
            <svg width="10" height="10">
              <path :d="windowIconClose" />
            </svg>
          </div>
        </div>
        <div class="frameless-titlebar-button frameless-titlebar-toggle" @click.stop="handleMaximizeClick">
          <div>
            <svg width="10" height="10">
              <path v-show="!isMaximized" :d="windowIconMaximize" />
              <path v-show="isMaximized" :d="windowIconRestore" />
            </svg>
          </div>
        </div>
        <div class="frameless-titlebar-button frameless-titlebar-minimize" @click.stop="handleMinimizeClick">
          <div>
            <svg width="10" height="10">
              <path :d="windowIconMinimize" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ipcRenderer } from 'electron'
import { getCurrentWindow, Menu as RemoteMenu } from '@electron/remote'
import { mapState, mapGetters } from 'vuex'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR } from '../../config'
import { isOsx } from '@/util'
import { buildWritingFontFamily } from '@/util/typography'
import FlowriteToolbar from '../flowrite/Toolbar.vue'
import bus from '../../bus'

export default {
  components: {
    FlowriteToolbar
  },
  data () {
    this.isOsx = isOsx
    this.HASH = {
      word: {
        short: 'W',
        full: 'word'
      },
      character: {
        short: 'C',
        full: 'character'
      },
      paragraph: {
        short: 'P',
        full: 'paragraph'
      },
      all: {
        short: 'A',
        full: '(with space)character'
      }
    }
    this.windowIconMinimize = minimizePath
    this.windowIconRestore = restorePath
    this.windowIconMaximize = maximizePath
    this.windowIconClose = closePath
    return {
      isFullScreen: getCurrentWindow().isFullScreen(),
      isMaximized: getCurrentWindow().isMaximized(),
      show: 'word',
      topRevealActive: false
    }
  },
  created () {
    ipcRenderer.on('mt::window-maximize', this.onMaximize)
    ipcRenderer.on('mt::window-unmaximize', this.onUnmaximize)
    ipcRenderer.on('mt::window-enter-full-screen', this.onEnterFullScreen)
    ipcRenderer.on('mt::window-leave-full-screen', this.onLeaveFullScreen)
  },
  props: {
    project: Object,
    filename: String,
    pathname: String,
    active: Boolean,
    wordCount: Object,
    platform: String,
    isSaved: Boolean
  },
  computed: {
    ...mapGetters([
      'effectiveSideBarWidth'
    ]),
    ...mapState({
      titleBarStyle: state => state.preferences.titleBarStyle,
      primaryWritingFont: state => state.preferences.primaryWritingFont,
      secondaryWritingFont: state => state.preferences.secondaryWritingFont,
      showSideBar: state => state.layout.showSideBar,
      distractionFreeWriting: state => state.layout.distractionFreeWriting
    }),
    paths () {
      if (!this.pathname) return []
      const pathnameToken = this.pathname.split(PATH_SEPARATOR).filter(i => i)
      return pathnameToken.slice(0, pathnameToken.length - 1).slice(-3)
    },
    showCustomTitleBar () {
      return this.titleBarStyle === 'custom' && !this.isOsx
    },
    titleBarBackgroundStyle () {
      if (!this.showSideBar) {
        return {
          background: 'var(--workspaceHeaderBgColor)'
        }
      }

      const paneWidth = this.effectiveSideBarWidth
      const paneColor = 'var(--workspaceSidebarBgColor)'
      const barColor = 'var(--workspaceHeaderBgColor)'

      return {
        background: `linear-gradient(to right, ${paneColor} 0, ${paneColor} ${paneWidth}px, ${barColor} ${paneWidth}px, ${barColor} 100%)`
      }
    },
    writingFontFamily () {
      return buildWritingFontFamily({
        primaryWritingFont: this.primaryWritingFont,
        secondaryWritingFont: this.secondaryWritingFont
      })
    },
    hideForWriting () {
      return this.distractionFreeWriting && !this.topRevealActive
    }
  },
  watch: {
    filename: function (value) {
      // Set filename when hover on dock
      const hasOpenFolder = this.project && this.project.name
      let title = ''
      if (value) {
        title = hasOpenFolder ? `${value} - ${this.project.name}` : `${value} - MarkText`
      } else {
        title = hasOpenFolder ? this.project.name : 'MarkText'
      }

      document.title = title
    },
    hideForWriting () {
      this.syncMacWindowButtons()
    }
  },
  mounted () {
    this.syncMacWindowButtons()
    document.addEventListener('mousemove', this.handleDocumentMouseMove, true)
  },
  methods: {
    handleWordClick () {
      const ITEMS = ['word', 'paragraph', 'character', 'all']
      const len = ITEMS.length
      let index = ITEMS.indexOf(this.show)
      index += 1
      if (index >= len) index = 0
      this.show = ITEMS[index]
    },

    toggleSidebar () {
      bus.$emit('view:toggle-layout-entry', 'showSideBar')
    },

    updateTopRevealFromPointer (clientY) {
      if (!this.distractionFreeWriting) {
        this.topRevealActive = false
        return
      }

      this.topRevealActive = clientY <= 92
    },

    handleDocumentMouseMove (event) {
      this.updateTopRevealFromPointer(event.clientY)
    },

    syncMacWindowButtons () {
      if (!this.isOsx) {
        return
      }

      const win = getCurrentWindow()
      if (typeof win.setWindowButtonVisibility === 'function') {
        win.setWindowButtonVisibility(!this.hideForWriting)
      }
    },

    handleCloseClick () {
      getCurrentWindow().close()
    },

    handleMaximizeClick () {
      const win = getCurrentWindow()
      if (win.isFullScreen()) {
        win.setFullScreen(false)
      } else if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    },

    toggleMaxmizeOnMacOS () {
      if (this.isOsx) {
        this.handleMaximizeClick()
      }
    },

    handleMinimizeClick () {
      getCurrentWindow().minimize()
    },

    handleMenuClick () {
      const win = getCurrentWindow()
      RemoteMenu.getApplicationMenu().popup({ window: win, x: 23, y: 20 })
    },

    rename () {
      if (this.platform === 'darwin') {
        this.$store.dispatch('RESPONSE_FOR_RENAME')
      }
    },

    onMaximize () {
      this.isMaximized = true
    },
    onUnmaximize () {
      this.isMaximized = false
    },
    onEnterFullScreen () {
      this.isFullScreen = true
    },
    onLeaveFullScreen  () {
      this.isFullScreen = false
    }
  },
  beforeDestroy () {
    document.removeEventListener('mousemove', this.handleDocumentMouseMove, true)
    if (this.isOsx) {
      const win = getCurrentWindow()
      if (typeof win.setWindowButtonVisibility === 'function') {
        win.setWindowButtonVisibility(true)
      }
    }
    ipcRenderer.off('window-maximize', this.onMaximize)
    ipcRenderer.off('window-unmaximize', this.onUnmaximize)
    ipcRenderer.off('window-enter-full-screen', this.onEnterFullScreen)
    ipcRenderer.off('window-leave-full-screen', this.onLeaveFullScreen)
  }
}
</script>

<style scoped>
  .title-bar-editor-bg {
    height: var(--titleBarHeight);
    background: var(--workspaceHeaderBgColor);
    position: relative;
    left: 0;
    top: 0;
    right: 0;
    transition: background .14s linear;
  }
  .title-bar {
    -webkit-app-region: drag;
    user-select: none;
    background: var(--workspaceHeaderBgColor);
    height: var(--titleBarHeight);
    box-sizing: border-box;
    color: var(--editorColor50);
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    z-index: 2;
    transition: background .14s linear, color .4s ease-in-out;
    cursor: default;
  }
  .active {
    color: var(--editorColor);
  }
  img {
    height: 90%;
    margin-top: 1px;
    vertical-align: top;
  }
  .title {
    padding: 0 110px;
    height: 100%;
    line-height: var(--titleBarHeight);
    font-size: 11.5px;
    font-weight: 500;
    text-align: center;
    transition: all .25s ease-in-out;
    & .filename {
      transition: all .25s ease-in-out;
    }
    &::after {
      content: '';
      position: absolute;
      top: 0;
      height: 1px;
      width: 100%;
      z-index: 1;
      -webkit-app-region: no-drag;
    }
  }
  .title,
  .osx-left-actions,
  .right-toolbar {
    transition: opacity .18s ease;
  }

  .title-bar.distraction-hidden .title,
  .title-bar.distraction-hidden .osx-left-actions,
  .title-bar.distraction-hidden .right-toolbar {
    opacity: 0;
    pointer-events: none;
  }
  div.title > span {
    /* Workaround for GH#339 */
    display: block;
    direction: rtl;
    overflow: hidden;
    text-overflow: clip;
    white-space: nowrap;
  }

  .title-bar .title .filename.isOsx:hover {
    color: var(--themeColor);
  }

  .active .save-dot {
    margin-left: 3px;
    width: 6px;
    height: 6px;
    display: inline-block;
    border-radius: 50%;
    background: var(--highlightThemeColor);
    opacity: .7;
    visibility: hidden;
  }
  .active .save-dot.show {
    visibility: visible;
  }
  .title:hover {
    color: var(--sideBarTitleColor);
  }

  .left-toolbar {
    padding: 0 7px;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    width: 108px;
    display: flex;
    flex-direction: row;
  }

  .osx-left-actions {
    position: absolute;
    top: 18px;
    left: 76px;
    height: auto;
    display: flex;
    align-items: center;
    transform: translateY(-50%);
  }

  .osx-sidebar-toggle {
    appearance: none;
    border: 0;
    background: transparent;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--editorColor60);
    cursor: pointer;
  }

  .osx-sidebar-toggle:hover {
    background: rgba(20, 24, 31, 0.05);
    color: var(--editorColor80);
  }

  .osx-sidebar-toggle__icon {
    width: 13px;
    height: 10px;
    border: 1px solid currentColor;
    border-radius: 2px;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .osx-sidebar-toggle__icon span:first-child {
    position: absolute;
    left: 4px;
    top: 1px;
    bottom: 1px;
    width: 1px;
    background: currentColor;
  }
  .right-toolbar {
    height: 100%;
    position: absolute;
    top: 0;
    right: 0;
    width: auto;
    max-width: 420px;
    padding-right: 12px;
    display: flex;
    align-items: center;
    flex-direction: row-reverse;
    gap: 8px;
    & .item {
      margin-right: 0;
    }
  }

  .right-toolbar > * {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
  }

  .word-count {
    cursor: pointer;
    font-size: 14px;
    color: var(--editorColor30);
    text-align: center;
    padding: 0 4px;
    box-sizing: border-box;
    transition: all .25s ease-in-out;
    display: inline-flex;
    align-items: center;
    & > .text-center-vertical {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 6px;
      border-radius: 5px;
    }
    &:hover > span {
      background: var(--sideBarBgColor);
      color: var(--sideBarTitleColor);
    }
  }

  .title-no-drag {
    -webkit-app-region: no-drag;
  }
  /* frameless window controls */
  .frameless-titlebar-button {
    position: relative;
    display: block;
    width: 36px;
    height: var(--titleBarHeight);
  }
  .frameless-titlebar-button > div {
    position: absolute;
    display: inline-flex;
    top: 50%;
    left: 50%;
    transform: translateX(-50%) translateY(-50%);
  }
  .frameless-titlebar-menu {
    color: var(--sideBarColor);
  }
  .frameless-titlebar-close:hover {
    background-color: rgb(228, 79, 79);
  }
  .frameless-titlebar-minimize:hover,
  .frameless-titlebar-toggle:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }
  .frameless-titlebar-button svg {
    fill: #000000
  }
  .frameless-titlebar-close:hover svg {
    fill: #ffffff
  }

  .text-center-vertical {
    display: inline-block;
    vertical-align: middle;
    line-height: normal;
  }
</style>

<style>
.title-item {
  height: 28px;
  line-height: 28px;
  & .front {
    opacity: .7;
  }
  & .text {
    margin-left: 10px;
  }
}
</style>
