import Joi from 'joi';
import { getProteinFeatures, getBarcodesequence, getUniprotData} from '../models/proteinModel.js';

const querySchema = Joi.object({
  proteinName: Joi.string().trim().required(),
  taxonomyID: Joi.number().integer().required(),
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
    const barcodesequence = await getBarcodesequence(result.differentialAbundanceData);
    const featuresData = await getUniprotData(proteinName);

    if (result) {
        res.json({
            success: true,
            proteinData: {
                proteinName: result.proteinName, 
                proteinSequence: result.proteinSequence || "No sequence found",
                differentialAbundanceData: result.differentialAbundanceData,
                barcodeSequence: barcodesequence, 
                featuresData: featuresData,
                proteinDescription: result.proteinDescription
            }
        });
    } else {
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