import Vue from 'vue'
import Vuex from 'vuex'
import { expect } from 'chai'
import MarginThreadComposer from '../../../src/renderer/components/flowrite/MarginThreadComposer.vue'

Vue.use(Vuex)

const createStore = ({ submitAction, closeAction } = {}) => {
  return new Vuex.Store({
    modules: {
      flowrite: {
        namespaced: false,
        state: {
          comments: []
        },
        mutations: {
          SET_COMMENTS (state, comments) {
            state.comments = comments
          }
        },
        actions: {
          SUBMIT_MARGIN_COMMENT () {
            if (typeof submitAction === 'function') {
              return submitAction(...arguments)
            }
            return Promise.resolve()
          },
          CLOSE_FLOWRITE_MARGIN_COMPOSER () {
            if (typeof closeAction === 'function') {
              return closeAction(...arguments)
            }
            return Promise.resolve()
          }
        }
      }
    }
  })
}

const mountComposer = (store, anchor) => {
  const Constructor = Vue.extend({
    store,
    render: h => h(MarginThreadComposer, {
      props: {
        anchor
      }
    })
  })

  return new Constructor().$mount()
}

describe('Flowrite margin composer', function () {
  it('keeps composer keydown events from bubbling into the editor shell', async function () {
    const store = createStore()
    const vm = mountComposer(store, {
      quote: 'reflective paragraph'
    })
    document.body.appendChild(vm.$el)

    let bubbledKeydowns = 0
    const listener = () => {
      bubbledKeydowns += 1
    }
    document.addEventListener('keydown', listener)

    try {
      await Vue.nextTick()
      const textarea = vm.$el.querySelector('[data-testid="flowrite-margin-thread-input"]')
      expect(textarea).to.not.equal(null)

      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true
      }))

      expect(bubbledKeydowns).to.equal(0)
    } finally {
      document.removeEventListener('keydown', listener)
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('closes once the user comment is persisted without waiting for the full AI roundtrip', async function () {
    let resolveSubmit
    let closeCalls = 0
    const submitPromise = new Promise(resolve => {
      resolveSubmit = resolve
    })
    const store = createStore({
      submitAction: () => submitPromise,
      closeAction: () => {
        closeCalls += 1
        return Promise.resolve()
      }
    })
    const vm = mountComposer(store, {
      quote: 'reflective paragraph'
    })
    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()
      const textarea = vm.$el.querySelector('[data-testid="flowrite-margin-thread-input"]')
      expect(textarea).to.not.equal(null)
      textarea.value = 'Can you sharpen this passage?'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Vue.nextTick()

      const submitButton = vm.$el.querySelector('[data-testid="flowrite-margin-thread-submit"]')
      expect(submitButton).to.not.equal(null)
      submitButton.click()
      await Vue.nextTick()

      expect(closeCalls).to.equal(0)

      store.commit('SET_COMMENTS', [{
        id: 'thread-margin-1',
        scope: 'margin',
        anchor: {
          quote: 'reflective paragraph'
        },
        comments: [{
          id: 'comment-user-1',
          author: 'user',
          body: 'Can you sharpen this passage?'
        }]
      }])
      await Vue.nextTick()

      expect(closeCalls).to.equal(1)

      resolveSubmit()
      await submitPromise
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })
})
