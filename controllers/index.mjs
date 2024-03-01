//import { default as searchController} from './searchController.js';
//import { default as tablesController } from './tablesController.js';

//export { searchController, tablesController};

import { searchProteinFunction } from './searchController2.mjs';
import { getTableNames } from './tablesController.mjs';
import { getProtein } from './proteinController.mjs';
import { getOrganisms } from './organismController.mjs';

export const searchController = {
  searchProteinFunction,
  getProtein,
  getOrganisms
  // ... other controllers if any
};

export const tablesController = {
    getTableNames,
}