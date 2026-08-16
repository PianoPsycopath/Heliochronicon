## Summary

<!-- What changed and why (1–3 sentences). -->

## Checklist

- [ ] One logical change per PR; commits stay scoped (refactor vs behavior change split if both are present)
- [ ] Conventions followed (`ctx` DI, no new module-level mutable globals, body factory only, unit conversions via `OrbitalMath`)
- [ ] `StorageManager` remains the only `localStorage` touch point
      (search `localStorage` excluding `node_modules` / `dist` / `public/data` —
      hits should only be `js/storage.js` plus docs / ESLint globals)
- [ ] Diagnostics go through `logger`, not raw `console.*`
- [ ] Pure logic covered by Vitest where practical; `npm run lint` / `npm test` / `npm run build` pass
- [ ] `ARCHITECTURE.md` updated if frame pipeline, body schema, module inventory, or async-loading policy changed

## Test plan

<!-- How you verified (manual steps, commands run, edge cases). -->

-
-