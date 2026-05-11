# World Cup Sweepstake

A public World Cup sweepstake website for assigning participants to countries, tracking tournament progress, and showing a premium tournament control-room experience.

## Product direction

**Visual thesis:** premium night-match tournament control room with deep green-black pitch surfaces, crisp white type, restrained gold accents, stadium light glows, and bracket lines that make progress feel physical.

**Content plan:** start with the live tournament dashboard, support it with team/person assignments, deepen with group standings and the knockout path, then provide organiser-only actions for sync and draw operations.

**Interaction thesis:** use a floodlight-style entrance for the dashboard, subtle bracket-line movement for progression, and row-level hover reveals for fixture and assignment context.

## Current local application

- React, TypeScript, Vite, Tailwind CSS, and Motion power the web app in `apps/web`.
- Azure Functions TypeScript API lives in `apps/api`.
- Shared domain types, progression helpers, and fixture-only seed data live in `packages/shared`.
- `GET /api/state`, `GET /api/teams`, and `GET /api/fixtures` return normalized public tournament data from the API.
- Organiser endpoints support participant entry/removal before draw, fixture team import, one-time draw locking, and fixture sync through `/api/organiser/*`.
- Local API state persists to `apps/api/data/tournament-state.local.json` by default and is ignored by Git. In Azure, the same state is stored as an ETag-protected JSON blob so draw locking and admin writes remain atomic.
- The browser must never call WC2026 API directly; provider access belongs in the API only.
- Azure Functions reserves built-in admin routes, so organiser write endpoints should use `/api/organiser/*`.
- Organiser write endpoints enforce `ADMIN_SECRET` with the `x-admin-secret` request header; do not rely on Static Web Apps route roles or function keys as the only protection.

## Sweepstake rules

- Full names are shown exactly as entered by the organiser.
- Each participant is randomly assigned one team.
- A team can have at most one participant.
- The draw is a one-time immutable action and is not rerun through the app.
- If fewer than 48 participants enter, unassigned teams remain visible but do not score.
- Progression is stage-based: group stage, Round of 32, Round of 16, quarter-finals, semi-finals, final, champion.

## Data source

WC2026 API is the only football data source. The API will sync and normalize provider data into cached application state, then the public site reads that cache through our API. The WC2026 API key must be stored in Azure Function app settings or GitHub Actions secrets, never in frontend code.

The production timer runs every 20 minutes and gates provider calls by UK local time: `/matches` is synced during the 17:00-05:00 match window, and `/groups/A-L` standings are synced at 17:00, 21:00, 01:00, and 05:00. This keeps the expected daily request count under the WC2026 API free-tier budget.

## Production state storage

Deployed Functions should set `WORLD_CUP_STORAGE_BACKEND=azure-blob`. The API then stores tournament state in Azure Blob Storage using `WORLD_CUP_STORAGE_CONNECTION_STRING` or `AzureWebJobsStorage`, `WORLD_CUP_STATE_CONTAINER`, and `WORLD_CUP_STATE_BLOB`. Writes use blob ETags for optimistic concurrency so a locked draw is updated as one state document rather than being partially written across multiple entities.

## Observability

Set `APPLICATIONINSIGHTS_CONNECTION_STRING` on the deployed Function App to enable Azure Functions host telemetry. The app also emits structured `telemetry_event` traces for backend admin actions and the allowlisted frontend events `page_view`, `organiser_opened`, `sync_clicked`, `draw_clicked`, and `bracket_viewed`. Telemetry properties are sanitized and do not include participant names or admin secrets.

## Flag assets

Country flags are served locally from `apps\web\public\flags`. The SVG set is vendored from the MIT-licensed `flag-icons` package with its license copied alongside the assets.

## Prize and charity model

The planned sweepstake has 48 entries at $10 each. Each entry contributes $5 to the prize pool and $5 to charity, creating a $240 prize pool and a $240 charity contribution. Microsoft matching takes the charity donation to $480 for UNICEF.

Prize split:

| Category | Amount |
|---|---:|
| Winner | $90 |
| Runner-up | $60 |
| Third place | $30 |
| Group Stage Heroes | $30 split across three $10 prizes |
| Wooden Spoon | $30 |

## Local development

Recommended runtime is Node.js 24 for Azure Functions compatibility.

Install dependencies:

```powershell
npm install
```

Run the API locally in one terminal:

```powershell
Copy-Item apps\api\local.settings.example.json apps\api\local.settings.json
npm run dev:api
```

Run the web app in another terminal:

```powershell
npm run dev:web
```

The public board loads at the Vite URL. Organiser controls are hidden by default; use the **Organiser sign-in** button or open `/?organiser=1`, then enter the local `ADMIN_SECRET` value from `apps/api/local.settings.json`.

Set `WORLD_CUP_SEED_MODE` to `demo` in `apps\api\local.settings.json` to open the local app with mocked participants, assignments, and a locked draw. Leave it as `empty` when testing organiser entry and first-draw flows from scratch. If you switch seed modes after the API has already created local data, delete `apps\api\data\tournament-state.local.json` so the next API start can seed the new mode.

To pull real WC2026 data, set `WC2026_API_KEY` in `apps\api\local.settings.json`, start the API, then call `POST /api/organiser/sync` with the `x-admin-secret` header. Use `WORLD_CUP_DATA_PATH` when you want a separate live-data file, for example `apps\api\data\tournament-state.live.local.json`, so demo data stays untouched.

## Validation

```powershell
npm run typecheck
npm run lint
npm run build
npm run package:api
npm run test:e2e
```

The Playwright suite starts the API and web app automatically with isolated local test data. If Chromium is not installed yet, run:

```powershell
npx playwright install --with-deps chromium
```

CI also installs Azure Functions Core Tools and Playwright Chromium before running the same checks.

## Azure notes

Initial deployment should start with a policy and quota validation spike in subscription `ME-MngEnvMCAP520690-joshbetts-1` (`556dc8cb-5da1-41d7-8a10-1be2cd6de16e`). Prove Azure Static Web Apps, Functions, Storage, Application Insights, networking settings, public access settings, and key/local-auth configuration before relying on the final architecture.

Before creating Azure resources or GitHub remote assets, confirm the Azure subscription, GitHub account or organisation, and repository name with the organiser.
