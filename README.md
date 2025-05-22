# dspa-backend
The backend architecture,  follows the MVC-inspired pattern:

- Model: Defines the structure of the data and handles interaction with the database. It represents the business logic and schema for each resource (e.g., User, Experiment).
- Controller: Contains the core logic for handling requests. It processes input, interacts with models, and sends back responses. Controllers act as a bridge between routes and models.
- Routes: Define the endpoints (URLs) of the application and map them to corresponding controller functions. They handle incoming HTTP requests and direct them to the correct controller logic.


## API Routes Overview

- `proteinRoutes`: Returns data for a specific protein, including features, LIP scores, and more.

- `allExperimentRoutes`: Retrieves metadata for all available experiments.

- `experimentRoutes`: Provides GO enrichment results, protein scores, and metadata for a single experiment.

- `conditionRoutes`: Returns all protein data and associated experiment metadata for a specific condition.

- `doseResponseRoutes`: Supplies dose-response data for plotting curves related to a Dynaprot experiment.

