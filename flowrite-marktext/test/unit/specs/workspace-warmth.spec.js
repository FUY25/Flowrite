import { expect } from 'chai'
import {
  buildWorkspaceWarmthCss,
  clampWorkspaceBackgroundWarmth,
  getWorkspaceWarmthMix
} from '../../../src/renderer/util/workspaceWarmth.js'

describe('Workspace warmth utility', function () {
  it('clamps warmth into the supported 0-100 range', function () {
    expect(clampWorkspaceBackgroundWarmth(-5)).to.equal(0)
    expect(clampWorkspaceBackgroundWarmth(42)).to.equal(42)
    expect(clampWorkspaceBackgroundWarmth(125)).to.equal(100)
  })

  it('returns no tint at zero warmth', function () {
    expect(getWorkspaceWarmthMix(0)).to.equal(0)
  })

  it('builds neutral workspace CSS at zero warmth', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'light',
      workspaceBackgroundWarmth: 0
    })

    expect(css).to.include('--workspaceBgColor: var(--editorBgColor);')
    expect(css).to.include('--workspacePanelBgColor: var(--editorBgColor);')
    expect(css).to.include('--workspaceHeaderBgColor: var(--editorBgColor);')
  })

  it('builds light-theme warmth CSS from the editor background', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'light',
      workspaceBackgroundWarmth: 100
    })

    expect(css).to.include('#f4ead8')
    expect(css).to.include('color-mix(in srgb')
    expect(css).to.include('--workspaceBgColor:')
  })

  it('uses darker warm targets for dark themes', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'dark',
      workspaceBackgroundWarmth: 100
    })

    expect(css).to.include('#3a332d')
    expect(css).to.include('--workspacePanelBgColor:')
  })
})
