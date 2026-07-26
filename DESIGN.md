# Monad PreFlight — Design System

## 1. Visual Theme & Atmosphere
Avionics instrument panel: calm, dark, precise. The app is a pre-flight checklist
for money, so every surface behaves like a cockpit instrument — quiet until it has
something to tell you, unambiguous when it does. Density is moderate; whitespace
communicates confidence, annunciator lights communicate severity.

## 2. Color Palette & Roles (OKLCH)
| Token | Value | Role |
|---|---|---|
| `--canvas` | `oklch(16% 0.012 285)` | Page canvas — near-black ink tinted toward Monad purple |
| `--surface-1` | `rgba(255,255,255,0.025)` | Panels (flight plan, console) |
| `--surface-2` | `rgba(255,255,255,0.045)` | Elevated rows, inputs |
| `--surface-3` | `rgba(255,255,255,0.065)` | Hover/active surfaces |
| `--line-1` | `rgba(255,255,255,0.06)` | Subtle borders/dividers |
| `--line-2` | `rgba(255,255,255,0.10)` | Standard borders |
| `--text-1` | `oklch(93% 0.005 285)` | Primary text |
| `--text-2` | `oklch(72% 0.01 285)` | Secondary text |
| `--text-3` | `oklch(55% 0.012 285)` | Tertiary/labels |
| `--brand` | `oklch(65% 0.19 285)` (Monad purple family) | Primary action, focus, brand marks — 10% of visual weight |
| `--go` | `oklch(78% 0.16 150)` | "Cleared" — success annunciator, positive deltas |
| `--caution` | `oklch(80% 0.14 85)` | Amber annunciator — caution findings |
| `--danger` | `oklch(66% 0.19 25)` | Red annunciator — danger findings, reverts |

Rules: chroma stays ≤0.02 on neutrals (tinted toward hue 285 for cohesion); never gray
text on colored chips — use darkened background hue.

## 3. Typography
Entire app is set in **B612** — the typeface commissioned by Airbus for cockpit
displays. One family, two voices:
- **B612** (400/700): headings, body, explanations. Display sizes get `-0.012em` tracking.
- **B612 Mono** (400/700): every number, address, amount, hash, and status readout.
  Always `font-variant-numeric: tabular-nums`.

Scale: 13 / 14 / 16 / 20 / 28px. Line-height 1.5 body, 1.15 display. Labels are
11px B612 Mono uppercase, `+0.08em` tracking (instrument-panel labels — the one
place positive tracking is correct).

## 4. Components
- **Buttons**: 6px radius, B612 700. Primary = `--brand` fill, ink text; hover lifts
  lightness +5%; press `scale(0.97)`; disabled 40% opacity. Ghost = transparent,
  `--line-2` border. All transitions `transform, opacity, background-color` 150ms.
- **Inputs**: `--surface-2` fill, `--line-1` border, 6px radius; focus ring 2px
  `--brand` via `outline`, never removed without replacement.
- **Annunciators**: 2px-radius small caps chips with a 7px status dot; dot pulses
  once (400ms) when armed. Green/amber/red per severity.
- **Flight plan panel**: `--surface-1`, 10px radius, `--line-1` border; checklist
  rows stagger in (80ms delay each, translateY(8px)→0 + fade, run-once keyframes).
- **Status strip**: pill radius readouts, B612 Mono.

## 5. Layout
Single column workspace, max-width 720px, generous 24/32px vertical rhythm.
Spacing scale: 4/8/12/16/24/32/48. No marketing hero — the console is the first
element. Asymmetry comes from the left-anchored annunciator rail inside the plan.

## 6. Depth & Elevation
Dark-surface luminance stepping only: canvas → +0.025 → +0.045 → +0.065 white
overlays. No drop shadows (invisible on dark). Borders do separation, never depth.

## 7. Do / Don't
- DO put every number in B612 Mono with tabular-nums.
- DO keep the brand purple to actions and brand marks only — severity owns the plan.
- DON'T use gradients, glassmorphism, or `background-clip: text`.
- DON'T animate anything but `transform`/`opacity`; honor `prefers-reduced-motion`.
- DON'T use modals — settings live in an inline drawer row.
- DON'T let two adjacent surfaces share the same luminance step.

## 8. Responsive
One breakpoint at 560px: paddings tighten, status strip wraps, asset-change rows
stack label-over-value. All hit targets ≥40px. `touch-action: manipulation`.

## 9. Radius scale
`--r-1: 2px` (chips/annunciators) · `--r-2: 6px` (buttons/inputs) ·
`--r-3: 10px` (panels) · `--r-pill: 999px` (status readouts).
