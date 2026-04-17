# Workspace Background Warmth Design

## Goal

Add a new appearance control that lets the user warm the writing workspace background without changing the left sidebar or exported output.

The feature should make the central writing experience feel more like warm paper while preserving the existing app theme structure and readability.

## Product Definition

The new control is a slider in Preferences:

- Label: `Workspace Background Warmth`
- Range: `0` to `100`
- Default: `0`

Behavior:

- `0` means the current app appearance is unchanged.
- Increasing the slider progressively warms the writing workspace background.
- The effect is live while adjusting the slider.
- The value persists across restarts.

## Scope

### Surfaces that should warm

- Top title/editor header area in the writing workspace
- Main editor background
- Right-side margin comment pane
- Global discussion surface

### Surfaces that should stay unchanged

- Left sidebar and navigation tree
- App shell outside the writing workspace
- Modal and dialog backgrounds
- Export and print output
- Syntax colors, text colors, and existing semantic UI colors

## Recommended Approach

Use a single normalized preference value and derive warmed workspace background colors from the active theme base colors.

This means:

- store one numeric preference, `workspaceBackgroundWarmth`
- read the current theme background colors
- blend those colors toward warm target tones
- apply the results only to the writing workspace surfaces

This is better than a fixed overlay because it preserves each theme’s identity. A light theme remains light, and a dark theme remains dark, but both become subtly warmer.

## Architecture

The feature should follow the existing preference-to-renderer styling pipeline.

### Preference layer

Add a new persistent preference:

- key: `workspaceBackgroundWarmth`
- type: number
- minimum: `0`
- maximum: `100`
- default: `0`

This belongs with the existing editor appearance preferences.

### Settings UI layer

Add a slider to the Editor preferences section. The control should update the preference immediately as the user drags it.

### Theme computation layer

Add a small color utility that:

- accepts a base background color and normalized warmth amount
- returns a warmed version of that color
- uses different warm targets for light and dark themes

This logic should live in the renderer styling/theme path, not inside individual UI components.

### Rendering layer

Expose warmed background values through dedicated CSS variables for the writing workspace. Components should consume those variables rather than hardcoding warmed colors themselves.

Suggested variables:

- `--workspaceWarmthBackground`
- `--workspaceWarmthPanelBackground`
- `--workspaceWarmthHeaderBackground`

Exact naming can change, but the important part is to centralize the values.

## Visual Behavior

### Light themes

Warmth should move the workspace from neutral white/gray toward a soft paper-like cream. The result should feel subtle and calm, not yellow or sepia.

### Dark themes

Warmth should move the workspace from neutral charcoal toward a slightly warmer dark surface. The result should remain clearly dark and high-contrast, never muddy or brown.

### Intensity

The warmest allowed value should still be restrained. Even at `100`, the app should look intentionally warm, not tinted or stylized.

## Data Flow

1. User adjusts `Workspace Background Warmth` in Preferences.
2. Preference value is persisted through the normal preferences channel.
3. Renderer receives the updated preference state.
4. Theme/style utilities recompute warmed workspace variables from:
   - active theme
   - `workspaceBackgroundWarmth`
5. Writing workspace surfaces re-render using the updated CSS variables.

## Component Boundaries

The warmth computation should be shared, but the application of that warmth should be limited to the writing workspace shell.

Recommended application points:

- editor wrapper / writing workspace root
- title/header area associated with the current editor view
- Flowrite margin annotation pane
- Flowrite global discussion panel

The left sidebar should keep the standard theme variables and should not read the new warmth variables.

## Error Handling

If the preference value is missing, invalid, or outside range:

- clamp to the valid range
- treat invalid or missing values as `0`

If a theme background color cannot be parsed:

- fall back to the existing unmodified background color
- never block rendering

## Accessibility And UX Guardrails

- Text contrast must remain unchanged or effectively unchanged.
- The feature must not reduce readability of selected text, cursor visibility, or annotation affordances.
- The effect must be smooth and immediate while adjusting.
- Theme changes while warmth is non-zero must recompute from the new theme base instead of reusing stale warmed values.

## Testing

### Unit and logic coverage

- preference schema accepts values from `0` to `100`
- invalid values clamp or resolve safely
- warmth color utility returns unchanged base color at `0`
- warmth color utility returns warmer but bounded output at high values

### Renderer behavior coverage

- slider updates the stored preference
- workspace background changes live when the preference changes
- switching themes recomputes warmed backgrounds correctly

### Isolation coverage

- left sidebar background does not change
- export/print styling does not change
- dialog/modal backgrounds do not change
- Flowrite right pane and global discussion do change with workspace warmth

## Rollout Notes

Ship this as a single preference-backed UI feature with no migration complexity beyond adding the new preference key.

The default value should preserve the current appearance exactly, so existing users see no visual change until they opt in.
