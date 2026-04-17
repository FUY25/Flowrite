import { expect } from 'chai'
import { buildBundledFontFaceText, buildCommonStyleText } from '../../../src/renderer/util/commonStyle.js'
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

  it('reaches the stronger top-end warmth mix at 100', function () {
    expect(getWorkspaceWarmthMix(100)).to.equal(80)
  })

  it('builds neutral workspace CSS at zero warmth', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'light',
      workspaceBackgroundWarmth: 0
    })

    expect(css).to.include('--workspaceBgColor: var(--editorBgColor);')
    expect(css).to.include('--workspacePanelBgColor: var(--editorBgColor);')
    expect(css).to.include('--workspaceHeaderBgColor: var(--editorBgColor);')
    expect(css).to.include('--workspaceSidebarBgColor:')
  })

  it('builds light-theme warmth CSS from the editor background', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'light',
      workspaceBackgroundWarmth: 100
    })

    expect(css).to.include('#f4ead8')
    expect(css).to.include('var(--editorBgColor) 20%')
    expect(css).to.include('#f4ead8 80%')
    expect(css).to.include('color-mix(in srgb')
    expect(css).to.include('--workspaceBgColor:')
    expect(css).to.include('--workspacePanelBgColor:')
    expect(css).to.include('--workspaceHeaderBgColor:')
    expect(css).to.include('--workspaceSidebarBgColor:')
    expect(css).to.include('#e7dfd3')
  })

  it('uses darker warm targets for dark themes', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'dark',
      workspaceBackgroundWarmth: 100
    })

    expect(css).to.include('#3a332d')
    expect(css).to.include('--workspacePanelBgColor:')
    expect(css).to.include('#322c27')
  })

  it('derives the sidebar from the shared warmth variables too', function () {
    const css = buildWorkspaceWarmthCss({
      theme: 'light',
      workspaceBackgroundWarmth: 60
    })

    expect(css).to.include('--workspaceBgColor:')
    expect(css).to.include('--workspaceSidebarBgColor:')
    expect(css).to.include('var(--sideBarBgColor)')
  })

  it('registers bundled writing font faces separately from dynamic common styles', function () {
    const fontCss = buildBundledFontFaceText()
    const commonCss = buildCommonStyleText({
      codeFontFamily: 'Menlo',
      codeFontSize: 14,
      hideScrollbar: false,
      theme: 'light',
      workspaceBackgroundWarmth: 0
    })

    expect(fontCss).to.include('@font-face')
    expect(fontCss).to.include('font-family: "Flowrite EB Garamond"')
    expect(fontCss).to.include('font-weight: 400 800;')
    expect(fontCss).to.include('font-family: "Flowrite Source Han Serif SC"')
    expect(fontCss).to.include('font-weight: 500;')
    expect(fontCss).to.include('font-weight: 600;')
    expect(commonCss).to.not.include('@font-face')
    expect(commonCss).to.include('--defaultWritingFontFamily:')
    expect(commonCss).to.include('--defaultDiscussionFontFamily:')
  })
})
