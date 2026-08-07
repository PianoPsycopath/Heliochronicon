# Contributing to Heliochronicon

This project is maintained primarily by a single developer (portfolio / learning vehicle). These notes exist so that future-you (or any collaborator) can work consistently without rediscovering conventions.

## Development setup

```bash
git clone https://github.com/PianoPsycopath/Heliochronicon.git
cd Heliochronicon
npm install
npm run dev
```

For Python pipeline work:

```bash
pip install -e ".[dev]"
```

## Workflow

1. **Branch** off `main` for any non-trivial change (`feat/…`, `fix/…`, `docs/…`, `refactor/…`).
2. **Keep PRs focused.** Prefer small, reviewable diffs over multi-concern mega-commits.
3. **CI must pass.** Lint, Vitest, production build, and the Python checks all run on push/PR.
4. **Update docs when behavior changes.** If a change affects the runtime model, data shapes, or frame pipeline, update `ARCHITECTURE.md` in the same PR.
5. **Prefer pure, testable units.** New logic that does not need DOM/Three.js should live in modules that can be imported by Vitest without a browser.

## Code conventions

- **Language:** Plain modern JavaScript (ES modules). TypeScript is a possible future migration; do not mix in ad-hoc `.ts` without a project decision.
- **Style:** ESLint + Prettier. Run `npm run lint` and `npm run format` before pushing.
- **Modules:** One primary responsibility per file where practical. Prefer named exports for utilities; classes for stateful subsystems.
- **DI pattern:** Subsystems receive a `ctx` object from `main.js` rather than reaching into globals. Keep that pattern.
- **Units & shapes:** Use the shared conversion helpers and the central `CelestialBody` factory. Do not invent parallel object literals for bodies.
- **Comments:** Prefer explaining *why* and non-obvious constraints. Avoid restating what the code already says.
- **Python:** `ruff` + `black` (line length 100). Golden-file tests for the CSV→JSON path.

## Testing expectations

- Pure math and data-parsing changes should come with Vitest coverage.
- Storage abstraction is designed for an injectable backend — use that in tests rather than touching real `localStorage`.
- Do not add pixel-perfect or full WebGL regression tests unless the project explicitly adopts Playwright (or similar) later.
- Python changes to the conversion pipeline should keep the golden-file tests green.

## Commit messages

Use clear, imperative subjects. Optional conventional prefixes help scanning:

- `feat:` new user-facing capability
- `fix:` bug fix
- `refactor:` internal restructuring without behavior change
- `test:` tests only
- `docs:` documentation
- `chore:` tooling, CI, deps

## Architecture as source of truth

`ARCHITECTURE.md` describes the system *as it is*. When a change makes that document wrong, fix the document in the same session/PR. Do not let it drift.

## Issues & roadmap

Feature ideas and remaining polish items are tracked via GitHub Issues (and optionally a Project board). The long phase lists that used to live in the README belong there, not in the front-page docs.

## License

By contributing, you agree that your contributions are licensed under the MIT License (see `LICENSE`).
