---
name: design-system
description: StarterChef brand palette and UI conventions — use when creating or editing any UI
triggers:
  - user
  - model
---

StarterChef follows a 60/30/10 palette. All colors are Tailwind tokens defined
in `src/app/globals.css` (`@theme`) — never write hex values or default Tailwind
colors (`gray-*`, `slate-*`, `blue-*`) in components.

## Tokens

| Token                      | Value | Role                                               |
| -------------------------- | ----- | -------------------------------------------------- |
| `cream` `#FAF7F2`          | 60%   | Page background, open space                        |
| `oat` `#F3E5D2`            | 30%   | Panels, summary cards, selected sections           |
| `oat-dark` `#E9D7BF`       | —     | Oat hover/active                                   |
| `card` `#FFFDFA`           | —     | Raised surfaces                                    |
| `flame` `#F58220`          | 10%   | Logo, primary surfaces, icons                      |
| `flame-ink` `#A34405`      | —     | Flame-coloured text; dark hover for flame surfaces |
| `flame-dark` `#D96E12`     | —     | Decorative deep-orange (pressed states)            |
| `flame-soft` `#FDE9D3`     | —     | Accent tint fills                                  |
| `espresso` `#493326`       | —     | Text, icons, nav                                   |
| `espresso-light` `#8A6F5C` | —     | Secondary text, muted labels                       |

## Conventions

- Cards: `rounded-3xl bg-card ring-1 ring-oat shadow-sm`; info panels: `bg-oat`.
- Buttons: use `<Button>` from `src/components/button.tsx` — `rounded-full`,
  variants `primary | secondary | outline | ghost`.
- Type: Nunito everywhere; headings `font-extrabold`, body `font-semibold`,
  muted `text-espresso-light`.
- Icons: `lucide-react`, `strokeWidth` ~2 (2.5 when active).
- Mobile-first: the cook screen is used one-handed with dirty hands — tap
  targets ≥ 40px, key actions reachable at bottom of screen.
- Voice/camera UI gets `flame` accent; nothing else should compete with it.
- `flame` (`#F58220`) is the brand orange but only ~2.6:1 against white — pair
  `bg-flame` surfaces with `text-espresso`, never `text-white`. For
  flame-coloured text on light surfaces use `text-flame-ink` (~5:1 on
  cream/oat); `flame` itself is for icons and fills only. Dark hover on a
  flame surface: `hover:bg-flame-ink hover:text-white`.
