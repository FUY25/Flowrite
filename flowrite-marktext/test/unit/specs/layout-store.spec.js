import { expect } from 'chai'
import layoutModule from '../../../src/renderer/store/layout'

describe('layout store', function () {
  it('uses the live sidebar width while resizing and falls back afterward', function () {
    const state = {
      ...layoutModule.state,
      sideBarWidth: 280,
      sideBarLiveWidth: null
    }

    expect(layoutModule.getters.effectiveSideBarWidth(state)).to.equal(280)

    layoutModule.mutations.SET_SIDE_BAR_LIVE_WIDTH(state, 348)
    expect(layoutModule.getters.effectiveSideBarWidth(state)).to.equal(348)

    layoutModule.mutations.SET_SIDE_BAR_LIVE_WIDTH(state, null)
    expect(layoutModule.getters.effectiveSideBarWidth(state)).to.equal(280)
  })

  it('auto-collapses the left sidebar when annotations would squeeze the writing width below the threshold', function () {
    const localState = {
      showSideBar: true,
      sideBarWidth: 280,
      sideBarLiveWidth: null,
      distractionFreeWriting: false
    }

    layoutModule.mutations.SET_LAYOUT(localState, {
      showSideBar: true,
      marginRailWidth: 280,
      viewportWidth: 1040
    })

    expect(localState.showSideBar).to.equal(false)
  })

  it('still allows collapse after the rail shrinks to the compact desktop width', function () {
    const localState = {
      showSideBar: true,
      sideBarWidth: 280,
      sideBarLiveWidth: null,
      distractionFreeWriting: false
    }

    layoutModule.mutations.SET_LAYOUT(localState, {
      showSideBar: true,
      marginRailWidth: 248,
      viewportWidth: 880
    })

    expect(localState.showSideBar).to.equal(false)
  })
})
