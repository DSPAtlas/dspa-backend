
import db from '../config/database.js';

export const findProteinBySearchTerm = async (searchTerm) => {
    try {
      const query = `
        SELECT seq, protein_name, protein_description, taxonomy_id 
        FROM organism_proteome_entries 
        WHERE protein_name LIKE ? OR protein_description LIKE ?
      `;

      const params = [`%${searchTerm}%`, `%${searchTerm}%`];
      const [rows] = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error("Error in findProteinBySearchTerm:", error);
      throw error; 
    }
  };