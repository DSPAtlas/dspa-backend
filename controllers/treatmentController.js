import { 
    getExperimentsByTreatment,
    getDifferentialAbundanceByExperimentID, 
    getDifferentialAbundanceByAccessionGroup,
    getGoEnrichmentResultsByExperimentID,
    findProteinByName
} from '../models/searchModel.js';

import { 
    getProteinScoreforSingleExperiment 
} from '../models/experimentModel.js';

import { 
    combineExperiments
} from '../models/treatmentModel.js';

import {
    prepareData, 
    getBarcodesequence
} from "../models/proteinModel.js";

import Joi from 'joi';

const queryTreatment = Joi.object({
    treatment: Joi.string().trim().required()
});

export const returnTreatmentGroup = async(req, res) => {
    try {
        const { value, error } = queryTreatment.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });
        }
    
    const { treatment } = value;
    const experimentIDsList = await getExperimentsByTreatment(treatment);
    
    let differentialAbundanceDataList = [];
    let proteinScoresList = [];
    let goEnrichmentList = [];

    for (let experiment of experimentIDsList) {
        const experimentID = experiment.lipexperiment_id; 
        const differentialAbundance = await getDifferentialAbundanceByExperimentID(experimentID);
        const proteinScores = await getProteinScoreforSingleExperiment(differentialAbundance);
        const goEnrichmentResults = await getGoEnrichmentResultsByExperimentID(experimentID);
        
        differentialAbundanceDataList.push({
            experimentID,
            data: differentialAbundance
        });

        proteinScoresList.push({
         experimentID,
         data: proteinScores
         });
 
        goEnrichmentList.push({
         experimentID,
         data: goEnrichmentResults
        });
    }

    console.log("proteinscoreli", proteinScoresList);
    const proteinScoresTable = combineExperiments(proteinScoresList);
    console.log("proteinstable", proteinScoresTable);

    if (experimentIDsList) {
         res.json({
             success: true,
             treatmentData: {
                treatment: treatment, 
                experimentIDsList: experimentIDsList, 
                differentialAbundanceDataList: differentialAbundanceDataList,
                proteinScoresTable: proteinScoresTable,
                goEnrichmentList: goEnrichmentList
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


 const queryProteinForTreatmentGroup = Joi.object({
    treatment: Joi.string().trim().required(),
    proteinName: Joi.string().trim().required()
});

 export const returnProteinForTreatmentGroup = async(req, res) => {
    try {
        const { value, error } = queryProteinForTreatmentGroup.validate(req.query);
        if (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Validation error', 
            error: error.details[0].message 
        });}
    
    const { treatment, proteinName } = value;

    const experimentList = await getExperimentsByTreatment(treatment);
    const experimentIDsList = experimentList.map(lip_experiment => lip_experiment.lipexperiment_id);
    const sequence = await findProteinByName(proteinName); // extract seq

    let differentialAbundanceDataList = [];
    let barcodeList = [];
    let lipscoreList = [];
 
    // Loop through each experiment ID to get the differential abundance data
    for (let experimentID of experimentIDsList) {
        const differentialAbundance = await getDifferentialAbundanceByAccessionGroup(proteinName,experimentID);

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
             treamentProteinData: {
                 treatment: treatment, 
                 experimentIDsList: experimentIDsList, 
                 barcodeList: barcodeList,
                 lipscoreList: lipscoreList,
                 differentialAbundanceDataList: differentialAbundanceDataList
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