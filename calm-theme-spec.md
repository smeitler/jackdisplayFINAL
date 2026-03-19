# Calm Theme Design Specification
## Extracted from Headspace/Calm app screenshots

### Color Palette

#### Backgrounds
- `background`: `#0d1135` — deep navy (main screen bg)
- `surface`: `#1a2050` — slightly lighter navy (cards, list rows)
- `surfaceElevated`: `#1e2660` — elevated card bg (featured cards)

#### Header Gradients (warm amber → orange → red-orange)
- Header top: `#F5A623` (bright amber/yellow)
- Header mid: `#E8751A` (warm orange)
- Header bottom: `#C0392B` (red-orange, fades into navy)
- Profile header: `#E8751A` → `#C0392B` → `#0d1135`

#### Text
- `foreground`: `#FFFFFF` — primary white text
- `muted`: `#8B9CC8` — muted blue-grey text (subtitles, metadata)
- `mutedLight`: `#B8C4E0` — lighter muted (secondary info)

#### Accent Colors
- `primary`: `#4A90D9` — bright blue (play buttons, CTAs, active tab)
- `amber`: `#F5A623` — warm amber (section headers, highlights)
- `orange`: `#E8751A` — warm orange (gradient, icons)
- `green`: `#27AE60` — success green
- `yellow`: `#F5C518` — gold/yellow (streak, achievements)

#### Tab Bar
- Tab bar bg: `#0d1135` (same as background)
- Tab bar border: `#1a2050` (subtle separator)
- Active tab: `#FFFFFF` (white icon + label)
- Inactive tab: `#4A5580` (muted blue-grey)

#### Cards
- Card bg: `#1a2050`
- Card border: `#252d6e` (subtle border)
- Card radius: 16px
- Featured card: gradient overlay on image

### Typography
- Section headers: 22px bold, white, no letter-spacing
- Card titles: 18px semibold, white
- Subtitles/metadata: 13px regular, `#8B9CC8`
- Tab labels: 11px medium

### Header Shape
- Curved bottom edge (wave/arch shape) — the header bleeds into the dark bg with a concave curve
- Header height: ~200px including status bar
- Content starts below the curve

### Card Styles
- Large cards (2-col grid): 160px tall, rounded 16px, colorful gradient bg
- List row cards: 72px tall, rounded 12px, dark bg `#1a2050`
- Featured banner: full-width, 80px tall, rounded 12px

### Spacing
- Screen horizontal padding: 16px
- Section gap: 24px
- Card gap: 12px
- List row gap: 8px
