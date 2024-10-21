import { 
    getAssociatedExperimentIDs, 
    getDifferentialAbundanceByAccessionGroup 
} from '../models/searchModel.js';

import Joi from 'joi';
import {prepareData, getBarcodesequence} from "../models/proteinModel.js";

const querySchemaGroup = Joi.object({
    groupID: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
});


export const returnGroup = async(req, res) => {

    try {
        const { value, error } = querySchemaGroup.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });
        }
    
    const { groupID, page, limit } = value;

    const offset = (page - 1) * limit;
    
    const experimentList = await getAssociatedExperimentIDs(groupID);
    const experimentIDsList = experimentList.map(lip_experiment => lip_experiment.lipexperiment_id);
    const doses = experimentList.map(lip_experiment => lip_experiment.dose); 

    const sequence = "MSSKGSVVLAYSGGLDTSCILVWLKEQGYDVIAYLANIGQKEDFEEARKKALKLGAKKVFIEDVSREFVEEFIWPAIQSSALYEDRYLLGTSLARPCIARKQVEIAQREGAKYVSHGATGKGNDQVRFELSCYSLAPQIKVIAPWRMPEFYNRFKGRNDLMEYAKQHGIPIPVTPKNPWSMDENLMHISYEAGILENPKNQAPPGLYTKTQDPAKAPNTPDILEIEFKKGVPVKVTNVKDGTTHQTSLELFMYLNEVAGKHGVGRIDIVENRFIGMKSRGIYETPAGTILYHAHLDIEAFTMDREVRKIKQGLGLKFAELVYTGFWHSPECEFVRHCIAKSQERVEGKVQVSVLKGQVYILGRESPLSLYNEELVSMNVQGDYEPTDATGFININSLRLKEYHRLQSKVTAK"

   let differentialAbundanceDataList = [];
   let barcodeList = [];
   let lipscoreList = [];


   // Loop through each experiment ID to get the differential abundance data
   for (let experimentID of experimentIDsList) {
       const differentialAbundance = await getDifferentialAbundanceByAccessionGroup("P00966",experimentID);
       const {processedData, b }= prepareData(differentialAbundance, sequence);
       const barcode = getBarcodesequence(processedData[experimentID]);

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
    
       console.log(lipScoreArray);
       
       differentialAbundanceDataList.push({
           experimentID,
           data: differentialAbundance
       });

       barcodeList.push({
        experimentID,
        data: barcode
        });

       lipscoreList.push({
        experimentID,
        data: lipScoreArray
       });
   }

    if (experimentIDsList) {
        res.json({
            success: true,
            groupData: {
                groupID: groupID, 
                experimentIDsList: experimentIDsList, 
                barcodeList: barcodeList,
                lipscoreList: lipscoreList,
                differentialAbundanceDataList: differentialAbundanceDataList,
                doses: doses,
                page,
                limit
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