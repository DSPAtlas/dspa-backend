/**
 * Combines protein scores from multiple experiments into a summarized table.
 * @param {Array} proteinScoresList - An array of objects with each containing an experiment ID and an array of score data.
 * @returns {Array} An array of objects, each representing a protein with its average score and the list of experiments contributing to that score.
 */
export function combineProteinScores(proteinScoresList) {
    const proteinScoresMap = {};

    // Aggregate scores by protein accession
    proteinScoresList.forEach(entry => {
        entry.data.forEach(scoreDetail => {
            const { proteinAccession, score } = scoreDetail;
            
            if (!proteinScoresMap[proteinAccession]) {
                proteinScoresMap[proteinAccession] = {
                    totalScore: 0,
                    count: 0,
                    experiments: []
                };
            }

            proteinScoresMap[proteinAccession].totalScore += score;
            proteinScoresMap[proteinAccession].count++;
            proteinScoresMap[proteinAccession].experiments.push({
                experimentID: entry.experimentID,
                score: score
            });
        });
    });

    // Convert the map to an array and calculate average scores
    const proteinScoresTable = Object.keys(proteinScoresMap).map(accession => {
        const { totalScore, count, experiments } = proteinScoresMap[accession];
        return {
            proteinAccession: accession,
            averageScore: totalScore / count,
            details: experiments
        };
    });

    return proteinScoresTable;
}


