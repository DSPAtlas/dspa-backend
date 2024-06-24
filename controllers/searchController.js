import Joi from 'joi';
import { findProteinBySearchTerm } from '../models/searchModel';

const querySchema = Joi.object({
  searchTerm: Joi.string().trim().required()
});

export const searchEntries = async (req, res) => {
    try {
        // Validate the incoming query parameters
        const { value, error } = querySchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.details[0].message
            });
        }
        
        const { searchTerm, taxonomyID } = value;
        const results = await findProteinBySearchTerm(searchTerm);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No entries found for the given search term.'
            });
        } else if (results.length === 1) {
            const { protein_name } = results[0];
            return res.redirect(`/api/v1/proteins?taxonomyID=${encodeURIComponent(taxonomyID)}&proteinName=${encodeURIComponent(protein_name)}`);
        } else {
            // Multiple results found, send a list formatted for table display
            const tableData = results.map(entry => ({
                proteinName: `<a href="/api/v1/proteins?taxonomyID=${encodeURIComponent(taxonomyID)}&proteinName=${encodeURIComponent(entry.protein_name)}">${entry.protein_name}</a>`,
                proteinDescription: entry.protein_description,
                taxonomyID: entry.taxonomy_id
            }));
            return res.status(200).json({
                success: true,
                message: 'Multiple entries found, see the table below for details.',
                table: tableData
            });
        }
    } catch (error) {
        console.error('Error in searchEntries:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};