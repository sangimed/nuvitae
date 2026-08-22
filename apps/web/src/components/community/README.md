# Community UI foundation

Import reusable product primitives from `components/community`. The foundation is intentionally built with React and CSS only; it adds no component framework and keeps behavior close to native HTML.

## Conventions

- Tokens in `app/styles.css` are the source of truth for color, type, spacing, radius, elevation, control size and interaction timing. Existing aliases (`--accent`, `--panel`, and others) keep current screens compatible while they migrate incrementally.
- Use `Button`/`ButtonLink`, `TextField`, `Panel`, `Alert`, `Dialog`, `Tabs`, `StatusState` and `ProgressSteps` rather than creating journey-specific controls.
- `Dialog` composes the existing `AccessibleDialog`, preserving its focus trap, Escape handling, initial focus and focus restoration.
- State components include visible text and semantic roles, so meaning never depends on color. Tabs implement the WAI-ARIA roving-tabindex keyboard pattern.
- Global `:focus-visible` and reduced-motion rules apply to both existing screens and these primitives.

Keep feature copy and business state in the consuming journey. These components own presentation and accessibility behavior only.
