import Vue from 'vue'
import Vuex from 'vuex'
import { expect } from 'chai'
import GlobalComments from '../../../src/renderer/components/flowrite/GlobalComments.vue'

Vue.use(Vuex)

const createStore = (pathname = '/notes/first.md') => {
  return new Vuex.Store({
    modules: {
      editor: {
        state: {
          currentFile: {
            pathname
          }
        },
        mutations: {
          SET_EDITOR_CURRENT_FILE (state, currentFile) {
            state.currentFile = currentFile
          }
        }
      },
      flowrite: {
        state: {
          comments: [],
          availability: {
            enabled: true
          },
          runtime: {
            status: 'idle',
            error: null
          }
        },
        actions: {
          SUBMIT_GLOBAL_COMMENT () {
            return Promise.resolve()
          }
        }
      },
      layout: {
        state: {
          distractionFreeWriting: false
        }
      }
    }
  })
}

const mountGlobalComments = store => {
  const Constructor = Vue.extend({
    store,
    render: h => h(GlobalComments)
  })

  return new Constructor().$mount()
}

describe('Flowrite global comments', function () {
  it('only listens for pointer reveal while distraction-free writing is enabled', async function () {
    const store = createStore()
    const originalAddEventListener = document.addEventListener
    const originalRemoveEventListener = document.removeEventListener
    const addCalls = []
    const removeCalls = []

    document.addEventListener = function (type, listener, options) {
      addCalls.push({ type, listener, options })
    }
    document.removeEventListener = function (type, listener, options) {
      removeCalls.push({ type, listener, options })
    }

    const vm = mountGlobalComments(store)

    try {
      await Vue.nextTick()
      expect(addCalls.filter(call => call.type === 'mousemove')).to.have.length(0)

      store.state.layout.distractionFreeWriting = true
      await Vue.nextTick()
      expect(addCalls.filter(call => call.type === 'mousemove')).to.have.length(1)

      store.state.layout.distractionFreeWriting = false
      await Vue.nextTick()
      expect(removeCalls.filter(call => call.type === 'mousemove')).to.have.length(1)
    } finally {
      vm.$destroy()
      document.addEventListener = originalAddEventListener
      document.removeEventListener = originalRemoveEventListener
    }
  })

  it('clears local draft state when the active document changes', async function () {
    const store = createStore()
    const vm = mountGlobalComments(store)
    const commentsVm = vm.$children[0]

    commentsVm.draft = 'This draft should not leak into another file.'
    commentsVm.submitError = 'Previous submit failed.'
    await Vue.nextTick()

    store.commit('SET_EDITOR_CURRENT_FILE', {
      pathname: '/notes/second.md'
    })
    await Vue.nextTick()

    expect(commentsVm.draft).to.equal('')
    expect(commentsVm.submitError).to.equal('')

    vm.$destroy()
  })

  it('suppresses the discussion chrome during distraction-free writing until revealed', async function () {
    const store = createStore()
    const vm = mountGlobalComments(store)
    const commentsVm = vm.$children[0]

    expect(commentsVm.isSuppressedByWritingMode).to.equal(false)

    store.state.layout.distractionFreeWriting = true
    await Vue.nextTick()

    expect(commentsVm.isSuppressedByWritingMode).to.equal(true)

    commentsVm.isRevealActive = true
    await Vue.nextTick()

    expect(commentsVm.isSuppressedByWritingMode).to.equal(false)

    vm.$destroy()
  })

  it('reveals the discussion when the pointer enters the bottom quarter of the viewport', async function () {
    const store = createStore()
    const vm = mountGlobalComments(store)
    const commentsVm = vm.$children[0]

    store.state.layout.distractionFreeWriting = true
    await Vue.nextTick()

    commentsVm.updateRevealFromPointer(100, 800)
    expect(commentsVm.isRevealActive).to.equal(false)

    commentsVm.updateRevealFromPointer(650, 800)
    expect(commentsVm.isRevealActive).to.equal(true)

    vm.$destroy()
  })

  it('adds breathing room between the Discussion title and the first comment', async function () {
    const store = createStore()
    store.state.flowrite.comments = [{
      id: 'global-thread',
      scope: 'global',
      comments: [{
        id: 'comment-1',
        author: 'assistant',
        body: 'A thoughtful note.',
        createdAt: new Date().toISOString()
      }]
    }]

    const vm = mountGlobalComments(store)
    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()

      const header = vm.$el.querySelector('.flowrite-global-comments__header')
      expect(window.getComputedStyle(header).marginBottom).to.equal('20px')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })
})
