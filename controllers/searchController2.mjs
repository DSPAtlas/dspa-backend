import { query } from '../db/db.js';
import fs from 'fs';


export const searchProteinFunction = async (req, res) => {
  const proteinName = req.body.proteinName;

  if (!proteinName) {
    return res.status(400).json({ message: 'Missing or invalid proteinName in the request body' });
  }

  try {
    const searchProteinSQL = await fs.promises.readFile('./sql/searchProteinNew.sql', 'utf8');

    // Parametrization to prevent SQL injection
    const result = await query(searchProteinSQL, [proteinName]);

    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.status(404).json({ message: 'Protein not found' });
    }
  } catch (error) {
    console.error('Error executing query:', error.message);
    console.error(searchProteinSQL, [proteinName]);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};


