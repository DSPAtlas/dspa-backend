import { getDifferentialAbundanceByExperimentID, 
    getAssociatedExperimentIDs } from '../models/searchModel.js';

import Joi from 'joi';

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
   

   let differentialAbundanceDataList = [];

   // Loop through each experiment ID to get the differential abundance data
   for (let experimentID of experimentIDsList) {
       const differentialAbundance = await getDifferentialAbundanceByExperimentID(experimentID);
       differentialAbundanceDataList.push({
           experimentID,
           data: differentialAbundance
       });
   }

    if (experimentIDsList) {
        res.json({
            success: true,
            groupData: {
                groupID: groupID, 
                experimentIDsList: experimentIDsList, 
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