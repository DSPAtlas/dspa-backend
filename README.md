# dspa-backend

[![Run Tests](https://github.com/bourumir-wyngs/dspa-backend/actions/workflows/tests.yml/badge.svg)](https://github.com/bourumir-wyngs/dspa-backend/actions/workflows/tests.yml)

## Function of this subproject

This subproject provides the backend API layer for the DSPAtlas/DynaProt platform. It is responsible for:

- exposing the protein, search, experiment, condition, and dose-response endpoints consumed by the frontend,
- validating incoming query parameters before executing backend logic,
- retrieving experiment, protein, and enrichment data from the DSPA data sources,
- aggregating and reshaping raw database results into frontend-friendly JSON payloads,
- enriching selected responses with UniProt-derived protein feature information and comparison labels.

Within the wider DSPA workspace, `dspa-backend` is the service-side data access and transformation layer that powers the interactive frontend views.

## Technologies

The backend is implemented as a Node.js ES module application built around Express 4 routing and middleware. It uses Joi for request validation, CORS and Helmet for HTTP/security middleware, `node-fetch` for external API access, and MySQL/PostgreSQL client libraries for data-source connectivity. Test coverage is currently based on the built-in Node test runner (`node --test`), and the code follows an MVC-inspired layout with routes, controllers, and models.

## Backend API provided by this subproject

The API routes are mounted under the `/api/v1/` base path from the main application entrypoint, which wires the backend routers into the combined DSPA application.

The backend serves the DSPA frontend by returning protein-centric LiP and differential-abundance data, experiment catalogues and detail views, condition summaries, GO enrichment results, and dose-response payloads. Some responses are additionally enriched with data fetched from UniProt to provide protein feature annotations used in the frontend visualizations.

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
  - Returns the aggregated condition view payload: experiment IDs, grouped differential-abundance data, protein score tables, GO enrichment results, and related dose-response experiment references.

### Dose-response endpoint

- `GET /api/v1/doseresponse?dynaprotExperiment=...&proteinName=...`
  - Returns dose-response plot curves and point data for a selected protein within a DynaProt experiment.

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
- `routes/doseResponseRoutes.js`
  - Exposes the dose-response data endpoint.

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
- `controllers/doseResponseController.js`
  - Validates dose-response queries and returns plot-ready curve and point data.

### Model and data-processing layer

- `models/searchModel.js`
  - Central data-access module for search, experiments, conditions, GO enrichment, UniProt fetches, metadata lookups, and dose-response queries.
- `models/proteinModel.js`
  - Converts raw peptide-level abundance rows into sequence-position score vectors and builds protein-level payloads for visualization.
- `models/conditionModel.js`
  - Contains condition-oriented score aggregation helpers covered by the current backend tests.

### Runtime, testing, and integration points

- `package.json`
  - Defines the backend runtime (`node index.mjs`) and test command (`node --test`) together with the Express/Joi/database dependencies.
- `.github/workflows/tests.yml`
  - GitHub Actions workflow that installs dependencies and runs the backend test suite on `master` and `ames/dev`.
- `tests/proteinModel.test.js`, `tests/conditionModel.test.js`
  - Automated tests for the protein score preparation logic and condition score aggregation helpers.

