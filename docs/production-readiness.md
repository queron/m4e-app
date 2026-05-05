# Production Readiness

This app is a Next.js App Router deployment with local JSON data and no database, auth layer, or external backend service.

## Runtime

- Node.js: use Node 22, matching `.github/workflows/ci.yml`.
- Package manager: npm with `package-lock.json`.
- Install: `npm ci`.
- Build: `npm run build`.
- Start: `npm run start`.

## CI Gates

Pull requests and pushes to `main` run:

- `npm ci`
- `npm run validate:data`
- `npm run lint`
- `npm run build`
- `npm run check:size-budgets`
- `npm run benchmark:analysis`

Treat CI failures as release blockers. Data validation warnings may be tracked separately when they do not fail the validation scripts.

## Size Budgets

`npm run check:size-budgets` enforces:

- Client route bundle for `/`: 800 KiB raw JavaScript/CSS from the built route manifest.
- Serialized `/api/cards` response: 7 MiB raw JSON from a production Next server.

If either budget fails, reduce shipped client code or the card payload before raising the threshold.

## Deployment Assumptions

- Deploy the built Next.js app as a Node server.
- Serve only same-origin app, API, manifest, icon, and service-worker assets.
- Security headers are defined in `next.config.mjs`.
- API routes read from local bundled JSON files and do not need database migrations.

## Card Data Updates

1. Update `src/data/m4e_cards.json` and related local JSON files.
2. Run `npm run validate:data`.
3. Run `npm run build`.
4. Review validation warnings and either fix them or track them explicitly.

## Service Worker Updates

`npm run dev` and `npm run build` run `scripts/write-service-worker-version.mjs`. The script writes `public/sw-version.js` using the package version plus a hash of `src/data/m4e_cards.json`.

When card data changes, the service worker cache name changes automatically. On activation, the new worker deletes old `m4e-crew-optimizer-*` caches, which invalidates stale `/api/cards` responses.

## Dependency Audit

Run audits before production releases:

```bash
npm audit
```

Handle high and critical advisories before release. For lower-severity advisories, document the affected package, exploitability in this app, and planned upgrade path.
