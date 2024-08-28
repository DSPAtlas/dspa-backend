import Joi from 'joi';
import { findProteinBySearchTerm, 
    getTaxonomyName,
    extractProteinDescription, 
    extractProteinAccession} from '../models/searchModel.js';


const querySchema = Joi.object({
  searchTerm: Joi.string().trim().required()
});


export const searchEntries = async (req, res) => {
    try {
        const { value, error } = querySchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                error: error.details[0].message
            });
        }
        
        const { searchTerm } = value;
        const results = await findProteinBySearchTerm(searchTerm);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No entries found for the given search term.'
            });
        } else {
            const tableData = results.map(entry => ({
                proteinName: extractProteinAccession(entry.protein_name),
                proteinDescription: extractProteinDescription(entry.protein_description),
                taxonomyID: entry.taxonomy_id, 
                taxonomyName: getTaxonomyName(entry.taxonomy_id)
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


