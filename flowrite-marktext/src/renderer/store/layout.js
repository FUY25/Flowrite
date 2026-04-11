import { ipcRenderer } from 'electron'
import bus from '../bus'

const width = localStorage.getItem('side-bar-width')
const sideBarWidth = typeof +width === 'number' ? Math.max(+width, 220) : 280
export const MIN_COMFORTABLE_WRITING_WIDTH = 720
export const DESKTOP_MARGIN_RAIL_WIDTH = 280
export const COMPACT_MARGIN_RAIL_WIDTH = 248
export const COMPACT_MARGIN_RAIL_BREAKPOINT = 900

export const getMarginRailWidthForViewport = viewportWidth => {
  const numericViewportWidth = Number(viewportWidth)
  if (!Number.isFinite(numericViewportWidth)) {
    return DESKTOP_MARGIN_RAIL_WIDTH
  }

  return numericViewportWidth < COMPACT_MARGIN_RAIL_BREAKPOINT
    ? COMPACT_MARGIN_RAIL_WIDTH
    : DESKTOP_MARGIN_RAIL_WIDTH
}

export const shouldCollapseSidebarForAnnotations = ({ showSideBar, sideBarWidth, marginRailWidth, viewportWidth } = {}) => {
  const numericViewportWidth = Number(viewportWidth)
  const numericSideBarWidth = Number(sideBarWidth)
  const numericMarginRailWidth = Number(marginRailWidth)

  if (!showSideBar || !Number.isFinite(numericViewportWidth) || !Number.isFinite(numericSideBarWidth) || !Number.isFinite(numericMarginRailWidth)) {
    return false
  }

  return (numericViewportWidth - numericSideBarWidth - numericMarginRailWidth) < MIN_COMFORTABLE_WRITING_WIDTH
}

// messages from main process, and do not change the state
const state = {
  rightColumn: 'files',
  showSideBar: true,
  sideBarWidth,
  sideBarLiveWidth: null,
  distractionFreeWriting: false
}

const getWindowId = () => {
  return global.marktext && global.marktext.env
    ? global.marktext.env.windowId
    : null
}

const getters = {
  effectiveSideBarWidth: state => {
    const width = state.sideBarLiveWidth == null ? state.sideBarWidth : state.sideBarLiveWidth
    return Math.max(+width || 220, 220)
  }
}

const mutations = {
  TOGGLE_LAYOUT_ENTRY (state, entryName) {
    state[entryName] = !state[entryName]
    if (entryName === 'showSideBar' && state.showSideBar) {
      state.distractionFreeWriting = false
    }
  },
  SET_SIDE_BAR_WIDTH (state, width) {
    // TODO: Add side bar to session (GH#732).
    const normalizedWidth = Math.max(+width, 220)
    localStorage.setItem('side-bar-width', normalizedWidth)
    state.sideBarWidth = normalizedWidth
  },
  SET_SIDE_BAR_LIVE_WIDTH (state, width) {
    state.sideBarLiveWidth = width == null ? null : Math.max(+width, 220)
  },
  SET_DISTRACTION_FREE_WRITING (state, value) {
    state.distractionFreeWriting = !!value
  },
  SET_LAYOUT (state, layout) {
    const {
      marginRailWidth,
      viewportWidth,
      ...nextLayout
    } = layout || {}

    Object.assign(state, nextLayout)

    const shouldCollapseSidebar = shouldCollapseSidebarForAnnotations({
      showSideBar: state.showSideBar,
      sideBarWidth: state.sideBarWidth,
      marginRailWidth,
      viewportWidth
    })

    if (shouldCollapseSidebar) {
      state.showSideBar = false
    }

    if (Object.prototype.hasOwnProperty.call(nextLayout, 'showSideBar') || shouldCollapseSidebar) {
      const windowId = getWindowId()
      if (windowId != null) {
        ipcRenderer.send('mt::update-sidebar-menu', windowId, !!state.showSideBar)
      }
    }

    if (state.showSideBar) {
      state.distractionFreeWriting = false
    }
  }
}

const actions = {
  LISTEN_FOR_LAYOUT ({ state, commit, dispatch }) {
    ipcRenderer.on('mt::set-view-layout', (e, layout) => {
      if (layout.rightColumn) {
        commit('SET_LAYOUT', {
          ...layout,
          rightColumn: layout.rightColumn === state.rightColumn ? '' : layout.rightColumn,
          showSideBar: true
        })
      } else {
        commit('SET_LAYOUT', layout)
      }
      dispatch('DISPATCH_LAYOUT_MENU_ITEMS')
    })

    ipcRenderer.on('mt::toggle-view-layout-entry', (event, entryName) => {
      commit('TOGGLE_LAYOUT_ENTRY', entryName)
      dispatch('DISPATCH_LAYOUT_MENU_ITEMS')
    })

    bus.$on('view:toggle-layout-entry', entryName => {
      commit('TOGGLE_LAYOUT_ENTRY', entryName)
      const windowId = getWindowId()
      if (windowId != null) {
        ipcRenderer.send('mt::view-layout-changed', windowId, { [entryName]: state[entryName] })
      }
    })
  },

  DISPATCH_LAYOUT_MENU_ITEMS ({ state }) {
    const windowId = getWindowId()
    if (windowId == null) {
      return
    }
    const { showSideBar } = state
    ipcRenderer.send('mt::view-layout-changed', windowId, { showSideBar })
  },

  CHANGE_SIDE_BAR_WIDTH ({ commit }, width) {
    commit('SET_SIDE_BAR_WIDTH', width)
  },

  CHANGE_SIDE_BAR_LIVE_WIDTH ({ commit }, width) {
    commit('SET_SIDE_BAR_LIVE_WIDTH', width)
  },

  SET_DISTRACTION_FREE_WRITING ({ commit }, value) {
    commit('SET_DISTRACTION_FREE_WRITING', value)
  }
}

export default { state, getters, mutations, actions }
