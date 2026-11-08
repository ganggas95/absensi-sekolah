# Frontend E2E testing

The browser suite uses Playwright against the real Next.js frontend and FastAPI backend. It creates a separate Docker Compose project and a disposable PostgreSQL container named `absensi-smpi-e2e`; it does not connect to the development database or the Compose stack in `docker-compose.yml`.

## Required for frontend changes

Every frontend feature and bug fix must be covered by Playwright E2E tests before it is considered complete. Add or update tests for the changed user-visible behavior, run the targeted test while iterating, then run the full suite with `npm run e2e`. Fix any product bugs revealed by the tests and rerun the affected test and the full suite. If infrastructure prevents the suite from running, report that limitation explicitly; do not mark E2E verification as passed.

## Requirements

- Node.js 20+ and npm
- Docker with the Compose plugin

## Run

From `apps/frontend`:

```bash
npm ci
npm run e2e:install
npm run e2e
```

`npm run e2e` rebuilds and migrates the isolated test backend, seeds deterministic Admin/Guru accounts and school data, starts the backend, starts the Next.js dev server on `127.0.0.1:3100`, runs Chromium tests, and removes only the `absensi-smpi-e2e` Compose containers afterward. The database is not persisted in a named volume.

To keep the test stack running while debugging:

```bash
npm run e2e:stack:up
npx playwright test --headed
npm run e2e:stack:down
```

Run one suite with `npm run e2e -- e2e/auth.spec.ts` or use Playwright options such as `--ui` and `--grep`. When using Playwright directly, the isolated backend must already be running with `npm run e2e:stack:up`.

Test credentials: `e2e-admin` / `e2e-admin-pass` and `e2e-guru` / `e2e-guru-pass`. They are only created in the disposable E2E database.

## Coverage and limits

The tests cover every implemented frontend route, entry/login and role access, master-data creation and persistence, daily/exam attendance, card previews and PDF downloads, daily/KBM/exam report filters with PDF and Excel downloads, navigation on mobile, and scanner permission/dialog behavior including HTTPS secure-context guidance.

Playwright verifies the scanner UI and camera failure/permission path, not physical QR scanning. It verifies PDF downloads, not printer output. Failure screenshots, traces, video, and the HTML report are written under `test-results/` and `playwright-report/`.
