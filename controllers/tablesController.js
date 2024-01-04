import { query } from '../db/db.js';

export const getTableNames = async (req, res) => {
  try {
    const result = await query('SELECT table_name FROM information_schema.tables WHERE table_schema = $1', ['public']);

    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.json({ message: 'No tables found' });
    }
  } catch (error) {
    console.error('Error executing query:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

