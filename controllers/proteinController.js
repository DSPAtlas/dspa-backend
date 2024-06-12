import Joi from 'joi';
import { getProteinFeatures, getBarcodesequence } from '../models/proteinModel.js';

const querySchema = Joi.object({
  taxonomyID: Joi.number().integer().required(),
  proteinName: Joi.string().trim().required()
});

export const searchProteins = async (req, res) => {
  
    try {
    const { value, error } = querySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        error: error.details[0].message 
    });
    }

    const { taxonomyID, proteinName } = value;

    const result = await getProteinFeatures(taxonomyID, proteinName);
    const barcodesequence = getBarcodesequence(result.differentialAbundanceData);

    console.log(JSON.stringify(result.differentialAbundanceData));
    console.log(barcodesequence);

    // Check if result is not empty
    if (result) {
        res.json({
            success: true,
            proteinData: {
                proteinName: result.proteinName, 
                proteinSequence: result.proteinSequence || "No sequence found",
                differentialAbundanceData: result.differentialAbundanceData,
                proteinStructure: result.proteinStructure,
                barcodesequence: barcodesequence
            }
        });
    } else {
        // Handle case when no results are found
        res.status(404).json({
            success: false,
            message: "No results found for the provided criteria."
        });
    }

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};


// request handling
// routing logic
// input validation
// decoupling business logic and data access from the presentation layer 