---
name: Controle de Produção
colors:
  surface: '#fff8f7'
  surface-dim: '#ffcfc9'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ee'
  surface-container: '#ffe9e6'
  surface-container-high: '#ffe2de'
  surface-container-highest: '#ffdad5'
  on-surface: '#390b08'
  on-surface-variant: '#5a413d'
  inverse-surface: '#54201a'
  inverse-on-surface: '#ffedea'
  outline: '#8e706b'
  outline-variant: '#e2beb9'
  surface-tint: '#b4271c'
  primary: '#630001'
  on-primary: '#ffffff'
  primary-container: '#8c0303'
  on-primary-container: '#ff9283'
  inverse-primary: '#ffb4a9'
  secondary: '#a43b2f'
  on-secondary: '#ffffff'
  secondary-container: '#fd7d6c'
  on-secondary-container: '#71150f'
  tertiary: '#402800'
  on-tertiary: '#ffffff'
  tertiary-container: '#5d3c00'
  on-tertiary-container: '#eaa224'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4a9'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#910906'
  secondary-fixed: '#ffdad5'
  secondary-fixed-dim: '#ffb4a9'
  on-secondary-fixed: '#410001'
  on-secondary-fixed-variant: '#84231a'
  tertiary-fixed: '#ffddb2'
  tertiary-fixed-dim: '#ffb94e'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#624000'
  background: '#fff8f7'
  on-background: '#390b08'
  surface-variant: '#ffdad5'
  wine-deep: '#590202'
  bordeaux-primary: '#8C0303'
  alert-critical: '#D90404'
  amber-warning: '#D99311'
  ink-text: '#260101'
  text-muted: '#5C5150'
  surface-card: '#FFFFFF'
  surface-canvas: '#F8F6F4'
  border-subtle: '#E8E1DF'
  status-success: '#176B45'
  status-info: '#205A85'
  badge-warning-bg: '#FFF2D6'
  badge-warning-text: '#4A2C00'
  badge-error-bg: '#FDE8E8'
  badge-error-text: '#8C0303'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Work Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Work Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  tabular-data-lg:
    fontFamily: Work Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
  tabular-data-md:
    fontFamily: Work Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
  label-md:
    fontFamily: Work Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Work Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system is engineered for industrial operational control within a food manufacturing environment. Designed explicitly for factory floor touch terminals, ruggedized tablets, and desktop supervisory workstations, the aesthetic merges utilitarian efficiency with traditional charcuterie craftsmanship.

The visual direction follows an **industrial tactile & structured modern** movement:
- **Operational Clarity:** High data density balanced by clear visual hierarchy. Zero ambiguity in batch tracking, weights, cure timers, and production states.
- **Robust Pragmatism:** Ample touch targets (minimum 44–48px), stark contrast borders for low-light or glare factory conditions, and clear color semantics to prevent operational errors.
- **Craft Heritage:** Deep artisanal wine and bordeaux tones anchor the brand shell, offset by warm neutral surfaces that reduce visual fatigue while keeping operational numbers crisp and prominent.

## Colors

The palette operates under strict functional discipline to ensure immediate physical comprehension on the production line:

- **Primary (`#8C0303` - Bordeaux):** Primary actions, active navigation states, critical confirmations, and primary section headers.
- **Secondary (`#590202` - Vinho Profundo):** Structural navigation shell, persistent sidebars, master table headers, and anchored operational panels.
- **Tertiary (`#D99311` - Dourado):** Operational attention, ongoing batch timers, cure phase highlights, and equipment status warnings. Never used for body text on white.
- **Neutral (`#260101` - Quase Preto Avermelhado):** Primary typography, tabular values, units of measure, and deep structural outlines.
- **Alert Critical (`#D90404`):** Strictly reserved for blocking errors, massada overweight warnings, batch stoppage, and emergency operational states. Never diluted as standard UI chrome.
- **Canvas & Surface Neutros:** `#F8F6F4` for background canvas reducing eye strain; `#FFFFFF` for data cards, batch inputs, and modal sheets; `#E8E1DF` for high-durability structure dividers.

## Typography

The typographic hierarchy distinguishes brand craft from high-speed operational scanning:

- **Identity & Section Display:** Uses an authoritative, distinguished serif family for page headers, plant identity titles, and sector badges, reflecting artisanal heritage.
- **Operational Data & UI:** System-aligned, crisp sans-serif with tabular figures (`font-variant-numeric: tabular-nums`) across all weight readouts, lot numbers, batch times, and input fields.
- **Factory Floor Rules:**
  - Tabular values are strictly right-aligned with physical units (`kg`, `g`, `un`) permanently visible.
  - Dates use Brazilian notation: `dd/mm/aaaa hh:mm`.
  - Batch numbers and Order IDs must use semi-bold weights to remain readable under glare.

## Layout & Spacing

The layout is constructed on a 12-column fluid grid system optimized for desktop terminals (1920x1080) and ruggedized floor tablets (1024x768):

- **Sidebar Navigation:** Persistent 260px left rail on desktop (collapsible to an 80px icon-only bar on tablets).
- **Tablet Reflow:** Tables convert into structured, touchable inspection cards below 1024px, preserving lot number, operational status, progress metric, and execution CTA.
- **Touch Ergonomics:** All interactive targets (buttons, batch inputs, status toggles) maintain a physical touch zone of at least 44×44px with a minimum 8px boundary buffer to prevent accidental triggers by gloved hands.

## Elevation & Depth

Visual hierarchy prioritizes tactile containment over decorative drops:

- **Low-Contrast Structured Outlines:** Flat surfaces with solid `1px` borders (`#E8E1DF`) define data cells, card perimeters, and modular blocks.
- **Tonal Layers:** Background canvas rests at `#F8F6F4`, raising cards and data grids to pure `#FFFFFF`.
- **Focused Elevation:** Deep shadows are avoided due to screen reflections in manufacturing environments. Floating modals and popover dialogs employ a disciplined functional shadow: `0 4px 16px rgba(38, 1, 1, 0.12)` bordered by `#E8E1DF`.
- **Active Inspection Tiers:** Active batch cards or selected production orders project an inset border of `2px` in `#8C0303` rather than heavy blur shadows.

## Shapes

Corner radii are standardized to `8px` (`0.5rem`) for cards, input containers, and buttons to convey durability, structure, and functional order without excessive softness:

- **Primary Cards & Modals:** Standard `8px` rounded corners.
- **Input Fields & Steppers:** `6px` to `8px` for clear containment.
- **Badges & Status Chips:** `4px` subtle rounding or full capsule depending on indicator role, ensuring text compactness in high-density tables.

## Components

### Buttons
- **Primary Operational Button:** Background `#8C0303`, text `#FFFFFF`, hover `#590202`, active transform. Min height 44px (48px for production lines). Always uses unambiguous verbs: *"Liberar Embutimento"*, *"Iniciar Massada"*, *"Confirmar Pesagem"*.
- **Secondary / Action Outlined:** Background `#FFFFFF`, text `#590202`, border `1.5px solid #590202`.
- **Critical / Emergency Action:** Background `#D90404`, text `#FFFFFF`. Requires double-step or press-and-hold confirmation.

### Data Tables & Lote Grids
- **Header:** Sticky top, background `#590202` with white typography, or neutral tone `#F0EBE8` with text `#260101`.
- **Rows:** Alternating subtle row zebra styling on dense tables. Numerical weight and tally columns right-aligned with fixed tabular spacing.
- **Inline Actions:** Grouped into clear, high-contrast action chips on the far right.

### Input Fields & Steppers
- **Structure:** Text label strictly positioned above the field in `#260101` with weight/spec guidelines.
- **Field Box:** Background `#FFFFFF`, border `1.5px solid #E8E1DF`, focus state `2px solid #8C0303`.
- **Unit Affix:** Integrated right badge (e.g., `kg`, `°C`) locked inside the input border.

### Status Badges & Chips
- **Em Produção / Cura:** Badge background `#FFF2D6`, text `#4A2C00`, accompanied by an active timer icon.
- **Concluída / Liberado:** Badge background `#E3F3EA`, text `#176B45`.
- **Bloqueio / Erro:** Badge background `#FDE8E8`, text `#8C0303` with a warning icon and explicit textual reason (e.g., *"Excesso de Capacidade"*).
- **Regra Geral:** Never rely exclusively on color. Badges must combine icon, textual state, and relevant numerical progress.

### Production Order Cards (Mobile/Tablet View)
- White container `#FFFFFF`, `1px` border `#E8E1DF`, `8px` radius. Header displays order ID, flavor variant, and status chip. Body shows target weight vs. produced weight progress bar. Bottom edge anchors primary execution CTA.