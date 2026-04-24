import Vue from 'vue'
import Vuex from 'vuex'
import { ipcRenderer } from 'electron'
import { expect } from 'chai'
import GeneralPreferences from '../../../src/renderer/prefComponents/general/index.vue'
import {
  FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL,
  FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
} from '../../../src/flowrite/constants'

Vue.use(Vuex)

const originalInvoke = ipcRenderer.invoke

const createStore = ({ flowrite = {}, collaborationMode = 'comment_only' } = {}) => {
  return new Vuex.Store({
    modules: {
      preferences: {
        state: {
          autoSave: false,
          autoSaveDelay: 5000,
          titleBarStyle: 'custom',
          defaultDirectoryToOpen: '',
          openFilesInNewWindow: false,
          openFolderInNewWindow: false,
          zoom: 1,
          hideScrollbar: false,
          wordWrapInToc: false,
          fileSortBy: 'modified',
          startUpAction: 'newFile',
          language: 'en',
          flowrite: {
            enabled: false,
            configured: false,
            online: true,
            firstRun: false,
            status: 'disabled',
            reason: 'unconfigured',
            baseURL: '',
            model: '',
            collaborationMode,
            ...flowrite
          }
        },
        actions: {
          SET_SINGLE_PREFERENCE () {
            return Promise.resolve()
          },
          SET_USER_DATA () {
            return Promise.resolve()
          },
          SELECT_DEFAULT_DIRECTORY_TO_OPEN () {
            return Promise.resolve()
          }
        }
      }
    }
  })
}

const mountPreferences = store => {
  const Constructor = Vue.extend({
    store,
    render: h => h(GeneralPreferences)
  })

  return new Constructor().$mount()
}

describe('Flowrite general preferences panel', function () {
  beforeEach(function () {
    ipcRenderer.invoke = async () => ({})
  })

  afterEach(function () {
    ipcRenderer.invoke = originalInvoke
  })

  it('restores direct Claude defaults from the quick action', async function () {
    const store = createStore({
      flowrite: {
        baseURL: 'https://example.invalid',
        model: 'claude-custom'
      }
    })
    const vm = mountPreferences(store)
    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()

      vm.$children[0].flowriteBaseURLDraft = 'https://example.invalid'
      vm.$children[0].flowriteModelDraft = 'claude-custom'
      await Vue.nextTick()

      const button = vm.$el.querySelector('[data-testid="flowrite-settings-direct-defaults"]')
      expect(button).to.not.equal(null)
      button.click()
      await Vue.nextTick()

      const component = vm.$children[0]
      expect(component.flowriteBaseURLDraft).to.equal(FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL)
      expect(component.flowriteModelDraft).to.equal(FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL)
      expect(component.flowriteFeedback.message).to.include('Direct Claude defaults restored')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })

  it('saves Flowrite settings with the explicit Claude payload', async function () {
    const invocations = []
    ipcRenderer.invoke = async (channel, payload) => {
      invocations.push({ channel, payload })
      if (channel === 'mt::flowrite:update-settings') {
        return {
          enabled: true,
          configured: true,
          online: true,
          status: 'ready',
          reason: null,
          baseURL: payload.baseURL,
          model: payload.model,
          collaborationMode: payload.collaborationMode
        }
      }
      return {}
    }

    const store = createStore()
    const vm = mountPreferences(store)
    document.body.appendChild(vm.$el)

    try {
      await Vue.nextTick()

      const component = vm.$children[0]
      component.flowriteApiKeyDraft = 'sk-ant-test'
      component.flowriteBaseURLDraft = FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL
      component.flowriteModelDraft = FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL
      await Vue.nextTick()

      const saveButton = vm.$el.querySelector('[data-testid="flowrite-settings-save"]')
      expect(saveButton).to.not.equal(null)
      saveButton.click()
      await Vue.nextTick()
      await Vue.nextTick()

      expect(invocations).to.have.lengthOf(1)
      expect(invocations[0].channel).to.equal('mt::flowrite:update-settings')
      expect(invocations[0].payload).to.deep.equal({
        enabled: true,
        apiKey: 'sk-ant-test',
        baseURL: FLOWRITE_DEFAULT_DIRECT_CLAUDE_BASE_URL,
        model: FLOWRITE_DEFAULT_DIRECT_CLAUDE_MODEL,
        collaborationMode: 'comment_only'
      })
      expect(component.flowriteFeedback.message).to.include('settings saved')
      expect(component.flowriteApiKeyDraft).to.equal('')
    } finally {
      if (vm.$el && vm.$el.parentNode === document.body) {
        document.body.removeChild(vm.$el)
      }
      vm.$destroy()
    }
  })
})
