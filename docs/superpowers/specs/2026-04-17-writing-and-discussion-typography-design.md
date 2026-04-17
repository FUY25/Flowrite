# Writing And Discussion Typography Design

## Goal

Add a structured typography system for the writing workspace so the document surface and Flowrite discussion surfaces can use different font strategies.

The writing surface should default to a literary serif experience with strong multilingual support. The discussion surface should default to a neutral communication-oriented font. Users should be able to override both with installed system fonts or custom font-family entries.

## Product Outcome

The app should support three typography preferences:

- `Primary Writing Font`
- `Secondary Writing Font`
- `Discussion Font`

The writing font pair applies to:

- document title area
- editor body text

The discussion font applies to:

- Flowrite global discussion
- Flowrite margin thread cards
- Flowrite replies and comment bodies

Existing `Font size` remains the main size control for the writing surface. Existing `Line height` remains a writing-surface control and does not change discussion UI spacing.

Code block typography remains separate and unchanged.

## Defaults

Bundled built-in defaults:

- primary writing font: `EB Garamond`
- secondary writing font: `Source Han Serif SC`

Default discussion font:

- system UI sans stack

These bundled defaults should be app-owned assets loaded through `@font-face` so the default writing experience is consistent even on a clean machine.

## Non-Goals

This feature does not include:

- changing PDF or export typography
- changing code block font behavior
- changing sidebar typography
- shipping Times New Roman or Founder fonts as bundled assets
- runtime font download or font installation management

## Font Source Model

The typography system uses a hybrid model:

1. The app bundles open, redistributable default fonts for the writing surface.
2. Users can override those defaults with installed system fonts.
3. Users can also enter custom font-family names manually.

This keeps the default writing experience consistent while preserving flexibility for local typography preferences such as `Times New Roman`, `Songti`, or `FZPingXianYaSong`.

## Rendering Model

### Writing Stack

The writing stack is shared by the title area and editor body.

Rendered font-family order:

`primary writing font, secondary writing font, existing writing fallback stack, emoji fallback`

Expected behavior:

- Latin text prefers the primary writing font.
- CJK text falls back to the secondary writing font when needed.
- If a chosen local font is missing, CSS fallback naturally moves to the next entry.
- Multilingual titles and body text use the same typography rules.

### Discussion Stack

The discussion stack is shared by all Flowrite discussion and comment surfaces.

Rendered font-family order:

`discussion font, system UI fallback stack, emoji fallback`

Expected behavior:

- Discussion surfaces read more like communication UI than book typography.
- Missing local discussion fonts degrade safely through system UI fallbacks.
- Discussion/comment typography remains visually distinct from the writing surface.

## Preference Model

### Primary Writing Font

Purpose:

- main Latin-oriented writing font for title and editor body

Default:

- bundled `EB Garamond`

Supported input modes:

- bundled preset
- curated system/font-class presets
- custom font-family entry

### Secondary Writing Font

Purpose:

- multilingual and CJK fallback font for title and editor body

Default:

- bundled `Source Han Serif SC`

Supported input modes:

- bundled preset
- curated system/font-class presets
- custom font-family entry

### Discussion Font

Purpose:

- shared font for Flowrite discussion and comments

Default:

- system UI sans stack

Supported input modes:

- system-font presets
- generic family presets
- custom font-family entry

## Preference UI

Replace the current single editor `Font family` control with a structured typography section:

- `Primary Writing Font`
- `Secondary Writing Font`
- `Discussion Font`
- existing `Font size`
- existing `Line height`

Each font control should support:

- a curated preset list
- manual custom entry

Suggested preset coverage:

- bundled defaults
- `serif`
- `sans-serif`
- `system-ui`
- `Times New Roman`
- `Songti`
- `PingFang SC`

The discussion font does not need a separate secondary fallback preference in this version. System UI fallback is sufficient for V1 and keeps the UI simpler.

## Bundled Font Assets

The app should ship:

- `EB Garamond`
- `Source Han Serif SC`

These fonts should be registered through app-owned CSS with `@font-face` and referenced by stable internal family names.

The app should not bundle:

- `Times New Roman`
- `FZPingXianYaSong`

Those remain optional system-installed overrides only.

## Application Surfaces

### Writing Typography Applies To

- editor title area
- editor body text

### Discussion Typography Applies To

- Flowrite global discussion panel
- Flowrite margin thread cards
- Flowrite comment bodies
- Flowrite reply composer text where it is part of the discussion surface

### Typography That Remains Unchanged

- code blocks
- left sidebar
- unrelated app chrome
- export/print surfaces

## Data And State Changes

Persistent preference additions:

- `primaryWritingFont`
- `secondaryWritingFont`
- `discussionFont`

The existing `editorFontFamily` preference becomes obsolete for the live writing surface once the new model is active.

Migration behavior:

- existing users with `editorFontFamily` set should not lose their preference abruptly
- the first migration should map the old `editorFontFamily` into `primaryWritingFont`
- `secondaryWritingFont` should default to bundled `Source Han Serif SC`
- `discussionFont` should default to system UI sans stack

If migration is ambiguous, preserving the user’s prior editor font in the primary writing slot takes precedence over resetting to defaults.

## Shared Typography Utility

Add a shared utility that builds:

- the writing font-family string
- the discussion font-family string

This utility should centralize:

- bundled font names
- generic fallbacks
- emoji fallbacks
- normalization of empty or missing preference values

This avoids duplicating font stack construction across the editor, title area, and Flowrite discussion surfaces.

## Error Handling And Fallback Behavior

- If a user-selected local font is not installed, the app falls back naturally through the stack.
- If a preference value is empty or malformed, the utility should fall back to the default bundled or system value.
- Missing bundled font asset references should fail back to existing generic fallback stacks rather than leaving the UI without a usable font.

No blocking error UI is needed for missing fonts in this version.

## Verification

Required verification for implementation:

- preference persistence across restart
- migration from existing `editorFontFamily` into the new model
- writing defaults render correctly using bundled fonts
- local overrides like `Times New Roman` or `Songti` work when installed
- missing local custom fonts degrade safely
- title area and editor body share the same writing stack
- Flowrite discussion and comment surfaces share the same discussion font
- code block fonts remain unchanged
- left sidebar typography remains unchanged

## Implementation Boundaries

Expected code areas:

- preference schema
- renderer preference store
- editor preference UI
- shared typography utility
- bundled font asset registration
- title area styling
- editor body styling
- Flowrite discussion and comment styling

No architectural changes are needed beyond preference/schema updates, shared typography utilities, and surface style application.
