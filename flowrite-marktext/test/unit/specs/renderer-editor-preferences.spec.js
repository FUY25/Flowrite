import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronEntry = require.resolve('electron')
const preferencesModuleEntry = require.resolve('../../../src/renderer/store/preferences.js')
const originalElectronCacheEntry = require.cache[electronEntry]

require.cache[electronEntry] = {
  id: electronEntry,
  filename: electronEntry,
  loaded: true,
  exports: {
    ipcRenderer: {
      on: () => {},
      send: () => {}
    }
  }
}

const preferencesModule = require('../../../src/renderer/store/preferences.js').default

if (originalElectronCacheEntry) {
  require.cache[electronEntry] = originalElectronCacheEntry
} else {
  delete require.cache[electronEntry]
}

delete require.cache[preferencesModuleEntry]

describe('Renderer editor preferences', function () {
  it('hydrates migrated typography settings from a legacy editor font family', function () {
    const nextState = JSON.parse(JSON.stringify(preferencesModule.state))

    preferencesModule.mutations.SET_USER_PREFERENCE(nextState, {
      editorFontFamily: 'Times New Roman'
    })

    expect(nextState.primaryWritingFont).to.equal('Times New Roman')
    expect(nextState.secondaryWritingFont).to.equal('Flowrite Source Han Serif SC')
    expect(nextState.discussionFont).to.equal('system-ui')
  })
})
