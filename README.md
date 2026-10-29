# dspa-backend

[![Run Tests](https://github.com/bourumir-wyngs/dspa-backend/actions/workflows/tests.yml/badge.svg)](https://github.com/bourumir-wyngs/dspa-backend/actions/workflows/tests.yml)

## Function of this subproject

This subproject provides the backend API layer for the DSPAtlas/DynaProt platform. It is responsible for:

- exposing the protein, search, experiment, and condition endpoint modules consumed by the main DSPA server,
- validating incoming query parameters before executing backend logic,
- retrieving experiment, protein, and enrichment data from the DSPA data sources,
- aggregating and reshaping raw database results into frontend-friendly JSON payloads,
- enriching selected responses with UniProt-derived protein feature information and comparison labels.

Within the wider DSPA workspace, `dspa-backend` is the service-side data access and transformation layer that powers the interactive frontend views.

## Technologies

The backend is implemented as Node.js ES modules built around Express 4 routers. It uses Joi for request validation and `mysql2` for data-source connectivity. The main DSPA application owns process startup and HTTP middleware such as CORS, Helmet, and request logging, while this package provides the route, controller, and model modules. Test coverage is currently based on the built-in Node test runner (`node --test`), and the code follows an MVC-inspired layout.

## Database access modes

`DB_USER_CONTEXT_MODE` selects the data-access contract at startup:

- `shared` is the default for existing development and fat deployments. Models use
  the existing promise pool and the backend does not require gateway identity.
  This mode provides no per-user database isolation.
- `per-user` is required by the persistent multi-user stack. Startup rejects an
  incorrect schema, reader account, missing credentials, or an unsupported mode.
  The matched webapp image loads these settings from its generated credential
  file before starting Node.

Per-user mode requires these settings:

| Variable | Purpose |
| --- | --- |
| `DB_USER_CONTEXT_MODE=per-user` | Enable authenticated, owner-scoped reads. |
| `DB_NAME=app` | Read through the database's scoped application views. |
| `DB_USER=dspa_backend_reader`, `DB_PASSWORD` | Read-only data account. |
| `DSPA_IDENTITY_DB_USER`, `DSPA_IDENTITY_DB_PASSWORD` | Separate account allowed to resolve verified OIDC users. |
| `DSPA_CONTEXT_DB_USER`, `DSPA_CONTEXT_DB_PASSWORD` | Separate account allowed to bind and clear data connections. |
| `DSPA_WEBAPP_GATEWAY_TOKEN` | Shared credential proving requests came from the authenticated gateway. |

`DB_HOST` defaults to `localhost`, and `DB_PORT` defaults to `3306`.
`DB_SOCKET_PATH` optionally selects a local MySQL Unix socket.
`DB_CONNECTION_LIMIT` controls each role's pool (default `10`, maximum `100`).
`DB_QUERY_TIMEOUT_MS` bounds individual SQL operations and pool acquisition in
per-user mode (default `30000`, range `1`–`300000`); it is not a total HTTP request
deadline.

## Trusted request identity

The main application mounts `middleware/userContext.js` before every data API
and `/api/v1/user`. In per-user mode it requires exactly one
`X-DSPA-Webapp-Token` matching the configured credential and exactly one
`X-User-ID` containing a canonical `oidc:ISSUER:SUBJECT` principal. The issuer and
subject use the gateway's form percent encoding, including `+` for spaces.
Missing, duplicate, malformed, development, and IP identities are rejected.
The gateway replaces caller-supplied identity and service-token headers.

The middleware resolves the verified issuer and subject with
`dspa_security.ensure_user`; neither request parameters nor JSON bodies select a
numeric owner. Disabled identities are denied. It publishes a frozen
`req.userContext` containing `userId`, `principal`, `issuer`, `subject`, the MySQL
server UUID, and an abort signal. `config/userContext.js` also exposes the same
context through `currentUserContext()` using `AsyncLocalStorage`, so simultaneous
requests retain their own identity. Per-user API responses use
`Cache-Control: private, no-store`.

Static frontend assets remain public at the webapp, and `/api/v1/health` is mounted
before this middleware. Browser login and session verification remain the
gateway's responsibility.

## Scoped pool lifecycle

Models continue to call `db.query(sql, parameters)`.
In per-user mode this method rejects calls without authenticated request context.
For every operation the wrapper acquires a data connection and a separate control
connection, checks both server UUIDs against the server that resolved the identity,
and obtains the data connection's connection ID and Performance Schema thread ID.
The control account binds that exact session to the resolved owner before SQL runs.
The `app` views enforce the owner across experiment, comparison, differential
abundance, protein score, GO analysis, and import records; public reference tables
remain shared.

The wrapper clears the binding before releasing the data connection. Every later
query repeats the verification and binding, including reuse by another user.
Binding errors, SQL errors, timeouts, and request aborts discard the affected data
session. Cleanup ignores the request's abort signal and remains bounded by the SQL
timeout; a cleanup failure destroys the session instead of returning it to the
pool. Cancelled pool acquisitions dispose any connection delivered afterwards.
Any binding that cannot be cleared is attached to the destroyed session's thread
and has an eight-hour lease independent of the SQL timeout.
There is no unbound query fallback.

## Public UniProt cache

`models/searchModel.js` caches only public UniProt feature responses, keyed by
normalized protein accession. It does not cache private SQL results or assembled
per-user API responses. The cache may therefore be shared across users.
`UNIPROT_CACHE_DIR` selects its writable directory; `UNIPROT_CACHE_MAX_BYTES`
defaults to 64 MiB and `UNIPROT_CACHE_TTL_MS` to 30 days. A host directory mounted
there must remain writable by the webapp's runtime user. Public caching behavior
is unchanged by per-user filtering.

## Backend API provided by this subproject

The API routes are mounted under the `/api/v1/` base path from the main application entrypoint, which wires the backend routers into the combined DSPA application.

The backend serves the DSPA frontend by returning protein-centric LiP and differential-abundance data, experiment catalogues and detail views, condition summaries, and GO enrichment results. Some responses are additionally enriched with data fetched from UniProt to provide protein feature annotations used in the frontend visualizations.

## API endpoints exposed by the backend

### Search and protein endpoints

- `GET /api/v1/search?searchTerm=...`
  - Searches proteins by user-supplied term and returns a result table with protein names, descriptions, gene names, taxonomy IDs, and taxonomy labels.
- `GET /api/v1/proteins?proteinName=...`
  - Returns protein sequence data, per-experiment differential-abundance vectors, LiP score summaries, experiment metadata, UniProt feature data, and protein description information.

### Experiment and condition endpoints

- `GET /api/v1/experiments`
  - Returns metadata for all available experiments used by the experiments overview page.
- `GET /api/v1/experiment?experimentID=...`
  - Returns metadata, grouped differential-abundance data, significant proteins, and GO enrichment results for a selected DynaProt experiment.
- `GET /api/v1/experiment?experimentID=...&includeQcPdf=true`
  - Extends the experiment metadata lookup to include the QC PDF payload when requested.
- `GET /api/v1/condition/allconditions`
  - Returns the selectable condition list, including taxonomy-aware labels for the frontend condition picker.
- `GET /api/v1/condition/data?condition=...`
  - Returns the aggregated condition view payload: experiment IDs, grouped differential-abundance data, protein score tables, and GO enrichment results.

## Components overview

### Routing layer

- `routes/searchRoutes.js`
  - Exposes the search endpoint and delegates request handling to `searchController`.
- `routes/proteinRoutes.js`
  - Exposes the protein-detail endpoint.
- `routes/allExperimentsRoutes.js`
  - Exposes the all-experiments catalogue endpoint.
- `routes/experimentRoutes.js`
  - Exposes the single-experiment detail endpoint.
- `routes/conditionRoutes.js`
  - Exposes both the condition list and condition-data endpoints.

### Controller layer

- `controllers/searchController.js`
  - Validates search requests and formats multi-hit protein search responses.
- `controllers/proteinController.js`
  - Validates protein requests, combines processed protein data with UniProt features, and returns the protein view payload.
- `controllers/allExperimentsController.js`
  - Returns the full experiment catalogue.
- `controllers/experimentController.js`
  - Validates experiment requests and assembles experiment metadata, significant proteins, grouped abundance data, enrichment results, and comparison labels.
- `controllers/conditionController.js`
  - Validates condition requests, resolves condition-linked experiments, aggregates scores across experiments, and prepares condition-specific response payloads.

### Model and data-processing layer

- `models/searchModel.js`
  - Central data-access module for search, experiments, conditions, GO enrichment, UniProt fetches, and metadata lookups.
- `models/proteinModel.js`
  - Converts raw peptide-level abundance rows into sequence-position score vectors and builds protein-level payloads for visualization.

### Runtime, testing, and integration points

- `package.json`
  - Defines the backend test command (`node --test`) together with the Express/Joi/database dependencies required by these modules.
- `.github/workflows/tests.yml`
  - GitHub Actions workflow that installs dependencies and runs the backend test suite on `master` and `ames/dev`.
- `tests/proteinModel.test.js`, `tests/searchModel.test.js`
  - Automated tests for protein score preparation and search/experiment data-access helpers.
- `tests/userContext.test.js`
  - Authenticated header handling, immutable request identity, pooled A/B/A reuse,
    concurrent users, missing context, server/thread verification, binding and
    cleanup failures, query timeouts, request aborts, and shared-mode compatibility.

Run the local suite with `npm test`. No database is needed for these unit tests.
The parent `dspa-mcp/tests/test_backend_flow.py` suite additionally exercises the
actual HTTP routers and scoped MySQL accounts, including private experiment and QC
access, search/protein/condition isolation, concurrent users, rejected identities,
and connection-context cleanup.


## Health check

`GET /api/v1/health` calls the explicit `db.healthCheck()` path, which only executes
`SELECT 1` and requires no user context. A working database returns HTTP 200.
Health checks do not authorize arbitrary SQL or private data reads.
