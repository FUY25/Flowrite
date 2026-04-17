import { ipcRenderer } from 'electron'
import bus from '../bus'
import {
  getDefaultDiscussionFont,
  getDefaultPrimaryWritingFont,
  getDefaultSecondaryWritingFont,
  migrateLegacyEditorFontFamily
} from '../util/typography'

// user preference
const state = {
  autoSave: false,
  autoSaveDelay: 5000,
  titleBarStyle: 'custom',
  openFilesInNewWindow: false,
  openFolderInNewWindow: false,
  zoom: 1.0,
  hideScrollbar: false,
  wordWrapInToc: false,
  fileSortBy: 'modified',
  startUpAction: 'lastState',
  defaultDirectoryToOpen: '',
  language: 'en',

  editorFontFamily: 'Open Sans',
  primaryWritingFont: getDefaultPrimaryWritingFont(),
  secondaryWritingFont: getDefaultSecondaryWritingFont(),
  discussionFont: getDefaultDiscussionFont(),
  fontSize: 16,
  writingFontWeight: 475,
  lineHeight: 1.4,
  workspaceBackgroundWarmth: 0,
  codeFontSize: 14,
  codeFontFamily: 'DejaVu Sans Mono',
  codeBlockLineNumbers: true,
  trimUnnecessaryCodeBlockEmptyLines: true,
  editorLineWidth: '',

  autoPairBracket: true,
  autoPairMarkdownSyntax: true,
  autoPairQuote: true,
  endOfLine: 'default',
  defaultEncoding: 'utf8',
  autoGuessEncoding: true,
  trimTrailingNewline: 2,
  textDirection: 'ltr',
  hideQuickInsertHint: false,
  imageInsertAction: 'folder',
  imagePreferRelativeDirectory: false,
  imageRelativeDirectoryName: 'assets',
  hideLinkPopup: false,
  autoCheck: false,

  preferLooseListItem: true,
  bulletListMarker: '-',
  orderListDelimiter: '.',
  preferHeadingStyle: 'atx',
  tabSize: 4,
  listIndentation: 1,
  frontmatterType: '-',
  superSubScript: false,
  footnote: false,
  isHtmlEnabled: true,
  isGitlabCompatibilityEnabled: false,
  sequenceTheme: 'hand',

  theme: 'light',
  autoSwitchTheme: 2,

  spellcheckerEnabled: false,
  spellcheckerNoUnderline: false,
  spellcheckerLanguage: 'en-US',

  // Default values that are overwritten with the entries below.
  sideBarVisibility: false,
  tabBarVisibility: false,
  sourceCodeModeEnabled: false,

  searchExclusions: [],
  searchMaxFileSize: '',
  searchIncludeHidden: false,
  searchNoIgnore: false,
  searchFollowSymlinks: true,

  watcherUsePolling: false,

  // --------------------------------------------------------------------------

  // Edit modes of the current window (not part of persistent settings)
  typewriter: false, // typewriter mode
  focus: false, // focus mode
  sourceCode: false, // source code mode

  // user configration
  imageFolderPath: '',
  webImages: [],
  cloudImages: [],
  currentUploader: 'none',
  githubToken: '',
  imageBed: {
    github: {
      owner: '',
      repo: '',
      branch: ''
    }
  },
  cliScript: '',
  flowrite: {
    enabled: false,
    configured: false,
    online: true,
    firstRun: true,
    status: 'disabled',
    reason: 'unconfigured',
    baseURL: '',
    model: '',
    collaborationMode: 'comment_only'
  }
}

const getters = {}

const applyPreferenceValue = (state, key, value) => {
  if (typeof value !== 'undefined' && typeof state[key] !== 'undefined') {
    state[key] = value
  }
}

const mutations = {
  SET_USER_PREFERENCE (state, preference) {
    Object.keys(preference).forEach(key => {
      applyPreferenceValue(state, key, preference[key])
    })

    const hasLegacyEditorFontFamily = typeof preference.editorFontFamily === 'string' && preference.editorFontFamily.trim() !== ''
    const hasExplicitPrimaryWritingFont = typeof preference.primaryWritingFont === 'string' && preference.primaryWritingFont.trim() !== ''
    const hasExplicitSecondaryWritingFont = typeof preference.secondaryWritingFont === 'string' && preference.secondaryWritingFont.trim() !== ''
    const hasExplicitDiscussionFont = typeof preference.discussionFont === 'string' && preference.discussionFont.trim() !== ''

    if (hasLegacyEditorFontFamily) {
      const migratedTypography = migrateLegacyEditorFontFamily(preference.editorFontFamily)
      if (!hasExplicitPrimaryWritingFont) {
        state.primaryWritingFont = migratedTypography.primaryWritingFont
      }
      if (!hasExplicitSecondaryWritingFont) {
        state.secondaryWritingFont = migratedTypography.secondaryWritingFont
      }
      if (!hasExplicitDiscussionFont) {
        state.discussionFont = migratedTypography.discussionFont
      }
    }
  },
  SET_MODE (state, { type, checked }) {
    state[type] = checked
  },
  TOGGLE_VIEW_MODE (state, entryName) {
    state[entryName] = !state[entryName]
  }
}

const actions = {
  ASK_FOR_USER_PREFERENCE ({ commit }) {
    ipcRenderer.send('mt::ask-for-user-preference')
    ipcRenderer.send('mt::ask-for-user-data')

    ipcRenderer.on('mt::user-preference', (e, preferences) => {
      commit('SET_USER_PREFERENCE', preferences)
    })
  },

  SET_SINGLE_PREFERENCE ({ commit }, { type, value }) {
    // save to electron-store
    ipcRenderer.send('mt::set-user-preference', { [type]: value })
  },

  SET_USER_DATA ({ commit }, { type, value }) {
    ipcRenderer.send('mt::set-user-data', { [type]: value })
  },

  SET_IMAGE_FOLDER_PATH ({ commit }, value) {
    ipcRenderer.send('mt::ask-for-modify-image-folder-path', value)
  },

  SELECT_DEFAULT_DIRECTORY_TO_OPEN ({ commit }) {
    ipcRenderer.send('mt::select-default-directory-to-open')
  },

  LISTEN_FOR_VIEW ({ commit, dispatch }) {
    ipcRenderer.on('mt::show-command-palette', () => {
      bus.$emit('show-command-palette')
    })
    ipcRenderer.on('mt::toggle-view-mode-entry', (event, entryName) => {
      commit('TOGGLE_VIEW_MODE', entryName)
      dispatch('DISPATCH_EDITOR_VIEW_STATE', { [entryName]: state[entryName] })
    })
  },

  // Toggle a view option and notify main process to toggle menu item.
  LISTEN_TOGGLE_VIEW ({ commit, dispatch, state }) {
    bus.$on('view:toggle-view-entry', entryName => {
      commit('TOGGLE_VIEW_MODE', entryName)
      dispatch('DISPATCH_EDITOR_VIEW_STATE', { [entryName]: state[entryName] })
    })
  },

  DISPATCH_EDITOR_VIEW_STATE (_, viewState) {
    const { windowId } = global.marktext.env
    ipcRenderer.send('mt::view-layout-changed', windowId, viewState)
  }
}

const preferences = { state, getters, mutations, actions }

export default preferences
