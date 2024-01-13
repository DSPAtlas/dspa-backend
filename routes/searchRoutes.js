import express from 'express';
import { searchController } from './controllers';

const router = express.Router();

router.get('/search', searchController.searchProteinFunction);

module.exports =  router;