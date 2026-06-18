import db from '../config/database.js';

export const healthCheck = async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.status(200).type('text/plain').send('OK');
  } catch (error) {
    console.error('Database health check failed:', error.message);
    return res.status(501).type('text/plain').send('database');
  }
};
