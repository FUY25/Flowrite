<template>
  <div
    class="editor-with-tabs"
    :style="{'max-width': showSideBar ? `calc(100vw - ${effectiveSideBarWidth}px)` : '100vw' }"
  >
    <div class="container">
      <editor
        ref="editor"
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
        :platform="platform"
        @flowrite-scroll-container-ready="attachFlowriteFooter"
      ></editor>
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
      ></source-code>
    </div>
    <div
      ref="flowriteFooterHost"
      class="editor-with-tabs__flowrite-footer"
      :class="{ 'is-attached': isFooterAttached }"
    >
      <global-comments :key="flowriteDocumentKey"></global-comments>
    </div>
    <tab-notifications></tab-notifications>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import GlobalComments from '../flowrite/GlobalComments.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'

export default {
  data () {
    return {
      flowriteScrollContainer: null,
      isFooterAttached: false
    }
  },
  props: {
    markdown: {
      type: String,
      required: true
    },
    cursor: {
      validator (value) {
        return typeof value === 'object'
      },
      required: true
    },
    sourceCode: {
      type: Boolean,
      required: true
    },
    textDirection: {
      type: String,
      required: true
    },
    platform: {
      type: String,
      required: true
    }
  },
  components: {
    Editor,
    SourceCode,
    GlobalComments,
    TabNotifications
  },
  computed: {
    ...mapGetters([
      'effectiveSideBarWidth'
    ]),
    ...mapState({
      showSideBar: state => state.layout.showSideBar,
      currentFilePathname: state => (state.editor.currentFile ? state.editor.currentFile.pathname || '' : '')
    }),

    flowriteDocumentKey () {
      return this.currentFilePathname || 'flowrite-no-document'
    }
  },
  watch: {
    currentFilePathname () {
      this.$nextTick(() => {
        this.attachFlowriteFooter()
      })
    }
  },
  mounted () {
    this.$nextTick(() => {
      this.attachFlowriteFooter()
    })
  },
  methods: {
    attachFlowriteFooter (container = null) {
      if (container) {
        this.flowriteScrollContainer = container
      }

      const target = container || this.flowriteScrollContainer
      const footer = this.$refs.flowriteFooterHost
      if (!target || !footer) {
        return
      }

      if (footer.parentNode !== target) {
        target.appendChild(footer)
      }

      this.isFooterAttached = true
    }
  }
}
</script>

<style scoped>
  .editor-with-tabs {
    position: relative;
    height: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--workspaceBgColor);
    transition: background-color .14s linear;
    & > .container {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
  }

  .editor-with-tabs__flowrite-footer {
    display: none;
  }

  .editor-with-tabs__flowrite-footer.is-attached {
    display: block;
    width: 100%;
    flex: none;
  }
</style>
