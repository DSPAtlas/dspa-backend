
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

export const getTaxonomyName = (taxId) => {
    // Object mapping taxonomy IDs to their names
    const taxonomyDict = {
        10090: "Mus musculus",
        559292: "Saccharomyces cerevisiae S288C",
        9606: "Homo sapiens"
    };
    
    // Return the name associated with the taxonomy ID, or a default message if not found
    return taxonomyDict[taxId] || "Taxonomy ID not found";
};

export const extractProteinDescription = (inputString) => {
  // Regular expression to capture text between the first space and " OS"
  const regex = /^[^\s]+\s+(.*?)\s+OS=/;
  const match = inputString.match(regex);
  return match ? match[1] : "Description not found";
};

export const extractProteinAccession = (proteinName) => {
  if (typeof proteinName !== 'string') {
      throw new TypeError(`Expected a string but received ${typeof proteinName}`);
  }
  const match = proteinName.match(/^[^|]*\|([^|]+)\|/);
  if (match) {
      return match[1]; 
  } else {
      console.log("No match found. Regex did not match the protein name."); 
      throw new Error(`Protein name "${proteinName}" does not match the expected format.`);
  }
};
