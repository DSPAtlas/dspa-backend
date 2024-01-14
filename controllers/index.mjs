//import { default as searchController} from './searchController.js';
//import { default as tablesController } from './tablesController.js';

//export { searchController, tablesController};

import searchProteinFunction from './searchController.mjs';
import getTableNames from './tablesController.mjs';

export const searchController = {
  searchProteinFunction,
  // ... other controllers if any
};

export const tablesController = {
    getTableNames,
}