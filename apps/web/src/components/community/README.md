# Community UI foundation

Import reusable product primitives from `components/community`. The foundation is intentionally built with React and CSS only; it adds no component framework and keeps behavior close to native HTML.

## Conventions

- `.stitch/DESIGN.md` is the canonical visual source. Its color, typography, spacing and radius names map directly to `--color-*`, `--type-*`, `--space-*` and `--radius-*` custom properties in `app/styles.css`. Existing aliases (`--accent`, `--panel`, `--color-brand`, and others) keep current screens compatible while they migrate incrementally.
- Inter is the product body/control font and Source Serif 4 is the editorial heading font. They are loaded through `next/font`; resume templates continue to own their typography independently.
- Use `Button`/`ButtonLink`, `TextField`, `Panel`, `Alert`, `Dialog`, `Tabs`, `StatusState` and `ProgressSteps` rather than creating journey-specific controls.
- `Dialog` composes the existing `AccessibleDialog`, preserving its focus trap, Escape handling, initial focus and focus restoration.
- State components include visible text and semantic roles, so meaning never depends on color. Tabs implement the WAI-ARIA roving-tabindex keyboard pattern.
- Global `:focus-visible` and reduced-motion rules apply to both existing screens and these primitives.

Keep feature copy and business state in the consuming journey. These components own presentation and accessibility behavior only.

## Incremental migration inventory

The shared foundation is canonical, but the complete redesign remains intentionally deferred. Follow-up work should migrate the existing ad-hoc rules in place rather than introduce parallel primitives:

- shell and legacy panel rules (`.panel`, `.import-card`, navigation and owner-access controls);
- import/upload/review state rules, including hard-coded status colors;
- workspace/editor controls and responsive section navigation;
- repeated route-specific button, input, radius and shadow declarations.

Resume renderer styles are excluded from this migration. Templates remain a separate visual system.
