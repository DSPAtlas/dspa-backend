import { getAllExperiments } from '../models/searchModel.js';

export const getAllExperimentsHandler = async (req, res) => {
    try {
        const allExperiments = await getAllExperiments();
        
        if (allExperiments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No experiments found.'
            });
        }

        res.json({
            success: true,
            experiments: allExperiments
        });
    } catch (error) {
        console.error('Error in getAllExperimentsHandler:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
