import Vue from 'vue'
import Vuex from 'vuex'
import { expect } from 'chai'
import Toolbar from '../../../src/renderer/components/flowrite/Toolbar.vue'

Vue.use(Vuex)

const createStore = ({ runtime = {}, availability = {}, currentFile = {} } = {}) => {
  return new Vuex.Store({
    modules: {
      editor: {
        state: {
          currentFile: {
            pathname: '/notes/draft.md',
            markdown: '# Draft\n',
            ...currentFile
          }
        },
        mutations: {
          SET_EDITOR_CURRENT_FILE (state, nextFile) {
            state.currentFile = nextFile
          }
        }
      },
      layout: {
        state: {
          showSideBar: false
        }
      },
      flowrite: {
        state: {
          showAnnotationsPane: false,
          runtime: {
            status: 'idle',
            phase: 'idle',
            message: '',
            error: null,
            ...runtime
          },
          availability: {
            enabled: true,
            ...availability
          }
        },
        mutations: {
          SET_RUNTIME (state, nextRuntime) {
            state.runtime = {
              ...state.runtime,
              ...nextRuntime
            }
          }
        },
        actions: {
          TOGGLE_FLOWRITE_ANNOTATIONS_PANE () {
            return Promise.resolve()
          },
          RUN_AI_REVIEW () {
            return Promise.resolve()
          }
        }
      }
    }
  })
}

const mountToolbar = store => {
  const Constructor = Vue.extend({
    store,
    render: h => h(Toolbar)
  })

  return new Constructor().$mount()
}

describe('Flowrite Have a Look toolbar', function () {
  it('keeps the mounted Have a Look entry point visibly busy during AI review', async function () {
    const store = createStore()
    const vm = mountToolbar(store)
    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()

      const reviewButton = vm.$el.querySelector('[data-testid="flowrite-have-a-look-button"]')
      expect(reviewButton).to.not.equal(null)
      reviewButton.click()
      await Vue.nextTick()

      store.commit('SET_RUNTIME', {
        status: 'running',
        phase: 'ai_review',
        message: 'Flowrite is reviewing the whole draft...'
      })
      await Vue.nextTick()

      expect(reviewButton.textContent.trim()).to.equal('Reviewing...')
      expect(reviewButton.disabled).to.equal(true)

      const prompt = vm.$el.querySelector('[data-testid="flowrite-have-a-look-prompt"]')
      const cancel = vm.$el.querySelector('[data-testid="flowrite-have-a-look-cancel"]')
      const go = vm.$el.querySelector('[data-testid="flowrite-have-a-look-go"]')
      const status = vm.$el.querySelector('[data-testid="flowrite-have-a-look-status"]')

      expect(prompt.disabled).to.equal(true)
      expect(cancel.disabled).to.equal(true)
      expect(go.disabled).to.equal(true)
      expect(status.textContent).to.include('Flowrite is reviewing the whole draft...')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('keeps the toolbar CTA copy unchanged for non-review runtime phases even when disabled', async function () {
    const store = createStore({
      runtime: {
        status: 'running',
        phase: 'global_comment',
        message: 'Flowrite is replying...'
      }
    })
    const vm = mountToolbar(store)
    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()
      const reviewButton = vm.$el.querySelector('[data-testid="flowrite-have-a-look-button"]')
      expect(reviewButton.textContent.trim()).to.equal('Have a look!')
      expect(reviewButton.disabled).to.equal(true)
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })
})
