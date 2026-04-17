import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const specDirectory = path.dirname(fileURLToPath(import.meta.url))
const isKarmaRuntime = () => typeof window !== 'undefined' && Boolean(window.__karma__)
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

let preferencesModule

const loadPreferencesModule = async () => {
  if (isKarmaRuntime()) {
    const preferencesStoreModule = await import('../../../src/renderer/store/preferences.js')
    return preferencesStoreModule.default
  }

  try {
    return require('../../../src/renderer/store/preferences.js').default
  } finally {
    if (originalElectronCacheEntry) {
      require.cache[electronEntry] = originalElectronCacheEntry
    } else {
      delete require.cache[electronEntry]
    }

    delete require.cache[preferencesModuleEntry]
  }
}

describe('Renderer editor preferences', function () {
  before(async function () {
    preferencesModule = await loadPreferencesModule()
  })

  it('hydrates migrated typography settings from a legacy editor font family', function () {
    const nextState = JSON.parse(JSON.stringify(preferencesModule.state))

    preferencesModule.mutations.SET_USER_PREFERENCE(nextState, {
      editorFontFamily: 'Times New Roman'
    })

    expect(nextState.primaryWritingFont).to.equal('Times New Roman')
    expect(nextState.secondaryWritingFont).to.equal('Flowrite Source Han Serif SC')
    expect(nextState.discussionFont).to.equal('system-ui')
  })

  it('defaults writing line height to 1.4 in preferences and base editor css', function () {
    const defaultThemeSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/muya/themes/default.css'),
      'utf8'
    )
    const preferenceSchemaSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/main/preferences/schema.json'),
      'utf8'
    )
    const muyaConfigSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/muya/lib/config/index.js'),
      'utf8'
    )

    expect(preferencesModule.state.lineHeight).to.equal(1.4)
    expect(preferencesModule.state.writingFontWeight).to.equal(475)
    expect(defaultThemeSource).to.include('line-height: 1.4;')
    expect(preferenceSchemaSource).to.include('"writingFontWeight"')
    expect(preferenceSchemaSource).to.include('"minimum": 400')
    expect(preferenceSchemaSource).to.include('"maximum": 600')
    expect(preferenceSchemaSource).to.include('"default": 475')
    expect(preferenceSchemaSource).to.include('"maximum": 3')
    expect(preferenceSchemaSource).to.include('"default": 1.4')
    expect(muyaConfigSource).to.include('lineHeight: 1.4')
  })

  it('declares primary, secondary, and discussion font controls in the editor preferences UI', function () {
    const editorPreferencesSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/renderer/prefComponents/editor/index.vue'),
      'utf8'
    )

    expect(editorPreferencesSource).to.include('Line spacing')
    expect(editorPreferencesSource).to.include(':max="3.0"')
    expect(editorPreferencesSource).to.include('Writing font weight')
    expect(editorPreferencesSource).to.include(':value="writingFontWeight"')
    expect(editorPreferencesSource).to.include('Primary Writing Font')
    expect(editorPreferencesSource).to.include('Secondary Writing Font')
    expect(editorPreferencesSource).to.include('Discussion Font')
  })

  it('commits manually typed font values from the shared font input', function () {
    const fontTextBoxSource = fs.readFileSync(
      path.resolve(specDirectory, '../../../src/renderer/prefComponents/common/fontTextBox/index.vue'),
      'utf8'
    )

    expect(fontTextBoxSource).to.include('@change="handleChange"')
    expect(fontTextBoxSource).to.include('handleChange (value)')
  })
})
