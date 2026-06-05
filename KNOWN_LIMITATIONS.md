# Known Limitations

## `vendor-pixi` Warning
- Production build still emits a large chunk warning for `vendor-pixi`.
- This is known and unchanged by the viewer freeze.
- It does not block release, but it remains a future optimization target.

## Density Tradeoffs
- `Observe` is intentionally dense and optimized for command-center readability rather than casual browsing.
- `Visualize` and `Command` reuse existing panels to preserve logic contracts, so some cards remain more operational than bespoke.
- The shell favors structured framing over large whitespace, which improves scanning but reduces visual breathing room on smaller screens.

## Responsive Limits
- The frozen shell is strongest at desktop widths.
- At `1280px` and below, the shell stacks to preserve function rather than perfect composition.
- At `900px` and below, the layout remains usable, but the command-center feel is reduced and scrolling increases.

## Regression Boundaries
- The freeze protects shell presence, theme variables, and map framing.
- It does not include pixel-perfect screenshot diffing because live/mock data and replay state change across runs.
- Visual regression is protected through baseline captures plus DOM-structure verification.
