const WORKSPACE_WARMTH_MAX_MIX = 18

const LIGHT_TARGETS = Object.freeze({
  workspace: '#f4ead8',
  panel: '#fbf3e4',
  header: '#f8efdf'
})

const DARK_TARGETS = Object.freeze({
  workspace: '#3a332d',
  panel: '#413930',
  header: '#3c352f'
})

export const clampWorkspaceBackgroundWarmth = warmth => {
  const numericWarmth = Number(warmth)

  if (Number.isNaN(numericWarmth)) {
    return 0
  }

  return Math.min(100, Math.max(0, numericWarmth))
}

export const getWorkspaceWarmthMix = warmth => {
  return Math.round((clampWorkspaceBackgroundWarmth(warmth) / 100) * WORKSPACE_WARMTH_MAX_MIX)
}

export const buildWorkspaceWarmthCss = ({ theme, workspaceBackgroundWarmth }) => {
  const mix = getWorkspaceWarmthMix(workspaceBackgroundWarmth)
  if (mix === 0) {
    return `:root {
  --workspaceBgColor: var(--editorBgColor);
  --workspacePanelBgColor: var(--editorBgColor);
  --workspaceHeaderBgColor: var(--editorBgColor);
}`
  }

  const targets = /^(dark|material-dark|one-dark)$/.test(theme) ? DARK_TARGETS : LIGHT_TARGETS

  const baseMix = `${100 - mix}%`
  const warmthMix = `${mix}%`

  return `:root {
  --workspaceBgColor: color-mix(in srgb, var(--editorBgColor) ${baseMix}, ${targets.workspace} ${warmthMix});
  --workspacePanelBgColor: color-mix(in srgb, var(--editorBgColor) ${baseMix}, ${targets.panel} ${warmthMix});
  --workspaceHeaderBgColor: color-mix(in srgb, var(--editorBgColor) ${baseMix}, ${targets.header} ${warmthMix});
}`
}
