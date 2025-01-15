import Joi from 'joi';
import { 
  getProteinFeatures, 
  getUniprotData
} from '../models/proteinModel.js';
import { 
  getDifferentialAbundanceByAccessionGroup, 
  getExperimentsMetaData
} from '../models/searchModel.js';
import { prepareData } from "../models/proteinModel.js";

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
    const experimentMetaData = await getExperimentsMetaData(experimentIDsList);
    const sequence = result.proteinSequence;

    for (let experimentID of experimentIDsList) {

      const differentialAbundance = await getDifferentialAbundanceByAccessionGroup(proteinName,experimentID);
      const {processedData, b }= prepareData(differentialAbundance, sequence);

      // meanwhile use plDDT scores
      const lipScoreArray = processedData[experimentID].map(item => {
        return item.score !== null ? item.score : -1;
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
                experimentMetaData: experimentMetaData,
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

