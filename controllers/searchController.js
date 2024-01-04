import { query } from '../db/db.js';

export const searchProtein = async (req, res) => {
  const proteinName = req.body.proteinName;

  try {
    const result = await query('SELECT * FROM proteins WHERE name = $1', [proteinName]);

    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.status(404).json({ message: 'Protein not found' });
    }
  } catch (error) {
    console.error('Error executing query:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};