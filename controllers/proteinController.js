import Joi from 'joi';
import { getProteinFeatures, getUniprotData} from '../models/proteinModel.js';
import { 
  getAssociatedExperimentIDs, 
  getDifferentialAbundanceByAccessionGroup 
} from '../models/searchModel.js';
import {prepareData, getBarcodesequence} from "../models/proteinModel.js";

const querySchema = Joi.object({
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

    const { proteinName } = value;

    const result = await getProteinFeatures(proteinName);
    const featuresData = await getUniprotData(proteinName);

    let lipscoreList = [];
    const experimentIDsList = Object.keys(result.differentialAbundanceData);
    const sequence = result.proteinSequence;

    for (let experimentID of experimentIDsList) {

      const differentialAbundance = await getDifferentialAbundanceByAccessionGroup(proteinName,experimentID);
      const {processedData, b }= prepareData(differentialAbundance, sequence);

      // meanwhile use plDDT scores
      const lipScoreArray = processedData[experimentID].map(item => {
           if (item.score === null) {
               return -1;
           } else if (item.score > 0 && item.score < 2) {
               return 50;
           } else if (item.score >= 2 && item.score < 4) {
               return 70;
           } else if (item.score >= 4 && item.score < 7) {
               return 90;
           } else if (item.score >= 7) {
               return 100;
           }
       });

      lipscoreList.push({
       experimentID,
       data: lipScoreArray
      });
  }

    if (result) {
        res.json({
            success: true,
            proteinData: {
                proteinName: result.proteinName, 
                experimentIDsList: experimentIDsList,
                proteinSequence: result.proteinSequence || "No sequence found",
                differentialAbundanceData: result.differentialAbundanceData,
                differentialAbundanceDataMedian: result.differentialAbundanceDataMedian,
                barcodeSequence: result.barcodeSequence, 
                lipscoreList: lipscoreList,
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