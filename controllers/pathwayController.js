import Joi from 'joi';
import { getKGML, extractProteins } from '../models/pathwayModel.js';

const querySchema = Joi.object({
  keggPathway: Joi.string().trim().required()
});

export const getKeggPathwayData = async (req, res) => {
  
    try {
        const { value, error } = querySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        error: error.details[0].message 
    });
    }

    const { keggPathway } = value;

    const kgmlData = getKGML(keggPathway);
    const proteinDict = extractProteins(kgmlData);


    if (kgmlData) {
        res.json({
            success: true,
            keggPathwayData: {
                //pathwayName: pathwayName, 
                barcodeDict: proteinDict,
                kgmlData: kgmlData,
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


