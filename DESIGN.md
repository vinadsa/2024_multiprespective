---
name: Cupertino Native
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9df'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1b1f'
  on-surface-variant: '#414755'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#717786'
  outline-variant: '#c1c6d7'
  surface-tint: '#005bc1'
  primary: '#0058bc'
  on-primary: '#ffffff'
  primary-container: '#0070eb'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#006e28'
  on-secondary: '#ffffff'
  secondary-container: '#6ffb85'
  on-secondary-container: '#00732a'
  tertiary: '#894d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ac6300'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#72fe88'
  secondary-fixed-dim: '#53e16f'
  on-secondary-fixed: '#002107'
  on-secondary-fixed-variant: '#00531c'
  tertiary-fixed: '#ffdcbf'
  tertiary-fixed-dim: '#ffb874'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6a3b00'
  background: '#faf9fe'
  on-background: '#1a1b1f'
  surface-variant: '#e3e2e7'
  system-red: '#FF3B30'
  system-indigo: '#5856D6'
  system-purple: '#AF52DE'
  system-teal: '#30B0C7'
  system-fill: rgba(120, 120, 128, 0.2)
typography:
  large-title:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 41px
  large-title-mobile:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
  title-1:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  title-2:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  title-3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 25px
  headline:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
  body:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 22px
  callout:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 21px
  subheadline:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
  footnote:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  caption-1:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  caption-2:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 13px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.25rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an authentic, native platform presence rooted in Apple's Human Interface Guidelines (HIG). The design movement blends **Modern Platform Minimalist** precision with refined **Liquid Glass and Materials** depth. It feels effortless, restrained, and deeply integrated into iOS, iPadOS, macOS, and visionOS surfaces.

The visual narrative prioritizes content over decoration. Interface chromes defer to the media, actions, and data beneath them through responsive material translucency, optical vibrancy, and fluid continuous-curve geometry. The interface instills calm confidence, instant familiarity, and accessible clarity.

## Colors

Color is applied functionally rather than ornamentally. Tint colors denote interactivity, states, and selection, preserving high signal-to-noise ratios across surfaces.

- **Primary (`#007AFF` System Blue)**: Directs primary user intent, active navigation states, action items, and focus indicators.
- **Secondary (`#34C759` System Green)**: Communicates successful states, confirmations, positive numeric deltas, and enabled connectivity.
- **Tertiary (`#FF9500` System Orange)**: Serves transactional alerts, pending states, cautionary prompts, and badge notifications.
- **Neutral (`#8E8E93` System Gray)**: Anchors non-interactive labels, borders, subtle glyphs, and structural separators.

### Dynamic Appearance & Translucency
Surfaces must support dynamic system appearance modes:
- **Light Mode**: High-key, clean backgrounds utilizing translucent materials over white canvas foundations.
- **Dark Mode**: OLED-optimized deep surfaces using layered elevated dark materials (`#000000`, `#1C1C1E`, `#2C2C2E`) to maintain contrast without harsh borders.
- **Materials**: Toolbars, navigation bars, and modals employ Liquid Glass materials (Backdrop Filter with 20px–30px blur and dynamic saturation boosts) rather than opaque fills, allowing underlying content to show through.

## Typography

The typographic hierarchy implements the canonical Apple Human Interface Guidelines text styles. Standardizing on native platform sizing ensures optical balance, rhythm, and accessible legibility.

- **Baseline Scale**: Default body text is set to 17pt (`1.0625rem`) with 22pt leading for body reading ease.
- **Dynamic Type & Legibility**: Scales adapt gracefully under accessibility magnifications (AX settings) without text clipping. Horizontal groupings collapse into vertical stacks when space diminishes.
- **Weights**: Typography avoids thin or hairline weights at small scales, utilizing Medium, Semibold, and Bold weights to maintain crisp contrast and immediate hierarchy.

## Layout & Spacing

Layout adheres to a fluid grid model driven by Safe Areas and Apple Size Classes (Compact vs. Regular) rather than hardware device limits.

### Safe Areas & Ergonomics
- Layout respects system chrome boundaries, accommodating Dynamic Islands, home indicators, status bars, and hardware sensor housings.
- Primary navigation bars and modal sheets float with safe inset margins, keeping touch interactions centered in accessible reach zones.

### Breakpoints & Adaptability
- **Compact (Mobile < 768px)**: Single-column stacked lists, full-width inset grouped cards, fixed tab bars, and sticky bottom sheets. Outer margin: `1rem` (16pt).
- **Regular (Tablet 768px–1024px)**: Split-view navigation with primary sidebar and detail pane. Outer margin: `1.25rem` (20pt).
- **Expanded (Desktop/Mac > 1024px)**: Multi-column sidebars, persistent toolbars, and contextual inspector panes. Gutter: `1.5rem` (24pt), outer margin: `2rem` (32pt).

## Elevation & Depth

Visual hierarchy uses material translucency, layered surface tiers, and diffused ambient shadows:

1. **Base Layer (Canvas)**: Background tint (`#FFFFFF` in light mode, `#000000` in dark mode).
2. **Secondary Layer (Grouped Cards & Modules)**: Solid elevated fills (`#F2F2F7` light, `#1C1C1E` dark) or subtle frosted cards with low-contrast hair-thin borders (`rgba(0, 0, 0, 0.05)` light, `rgba(255, 255, 255, 0.08)` dark).
3. **Floating & Navigation (Liquid Glass Chrome)**: Navigation bars, toolbars, and tab bars use backdrop blurs (`backdrop-filter: blur(24px) saturate(180%)`) with semi-transparent tinted fills (`rgba(255, 255, 255, 0.72)` light, `rgba(30, 30, 30, 0.75)` dark).
4. **Modals & Overlays (Top Elevation)**: Elevated sheets and contextual popovers sit above blurred scrims, accompanied by soft ambient shadows: `box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04)`.

## Shapes

Corner geometry applies continuous-curvature squircles (Apple-style superellipses) rather than circular arcs, ensuring organic transitions into straight edges.

- Standard cards, interactive controls, and list containers employ `0.625rem` to `1rem` continuous corner radii.
- Badges, segmented picker pills, and compact utility tags feature full-pill geometry (`9999px`).
- Form elements, list items, and modal dialogs use uniform corner continuity across parent and nested child elements.

## Components

### Buttons & Interactive Controls
- **Hit Targets**: Every interactive target maintains a strict minimum bounding size of `44x44pt` (iOS/iPadOS) and `28x28pt` (macOS), even when visible glyphs are smaller.
- **Filled / Primary**: Solid `#007AFF` fill, white bold label, `0.75rem` radius, minimum height of 44px, dynamic pressed scale (`transform: scale(0.97)`).
- **Tonal / Gray**: Subtle neutral fill (`rgba(120, 120, 128, 0.12)`), tinted primary label, providing low-prominence actions.
- **Bordered Prominent / Clear**: Translucent glass backgrounds for auxiliary actions inside navigation bars and toolbars.

### Lists & Inset Grouped Tables
- Content lists utilize standard Apple Inset Grouped styling.
- Cards maintain safe horizontal insets with rounded corners (`1rem`), containing divider lines inset by leading text alignment (`1rem`).
- Rows include disclosure chevrons for hierarchy depth and detail access.

### Input Fields & Controls
- **Inputs**: Minimized height of 44px, enclosed within frosted rounded fields with subtle baseline borders or light fill tints. Clear buttons ("X") are vertically centered on the trailing edge.
- **Switches & Segmented Controls**: System-style toggle switches featuring green active states (`#34C759`) and smooth spring transitions. Segmented controls feature a sliding elevated white/glass pill indicator over a sunken neutral tray.

### Cards & Sheets
- Surface cards feature clean padding (`1rem` to `1.25rem`), clear title hierarchy, and content grouped into logical chunks.
- Bottom presentation sheets include standard top grabber indicators (`36x5px` rounded pill in `#C7C7CC`) and support interactive pan-to-dismiss gestures.