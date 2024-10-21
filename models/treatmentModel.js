export const combineExperiments = (data) => {
    const combinedData = {};

    // Iterate over each experiment (since `data` is an array)
    data.forEach((experiment) => {
        const experimentID = experiment.experimentID;
        const experimentEntries = experiment.data; // Get the experiment data, which is an array

        // Check if experimentEntries is an array
        if (Array.isArray(experimentEntries)) {
            experimentEntries.forEach(entry => {
                const proteinAccession = entry.pg_protein_accessions;
                const cumulativeScore = entry.cumulativeScore;

                // Initialize the protein data if not already present
                if (!combinedData[proteinAccession]) {
                    combinedData[proteinAccession] = {
                        experiments: {},
                        averageScore: 0,
                        count: 0
                    };
                }

                // Add the cumulative score for the experiment
                combinedData[proteinAccession].experiments[experimentID] = cumulativeScore;
                combinedData[proteinAccession].count += 1;
                combinedData[proteinAccession].averageScore += cumulativeScore;
            });
        } else {
            console.error(`Expected array but got ${typeof experimentEntries} for experimentID: ${experimentID}`);
        }
    });

    // Calculate average scores and filter out entries with averageScore 0 or NA
    let filteredData = Object.keys(combinedData).reduce((result, proteinAccession) => {
        const entry = combinedData[proteinAccession];
        entry.averageScore /= entry.count;

        // Filter out entries where averageScore is 0, null, or undefined
        if (entry.averageScore !== 0 && entry.averageScore !== null && entry.averageScore !== undefined) {
            result.push({ proteinAccession, ...entry });
        }

        return result;
    }, []);

    // Sort by averageScore in descending order
    filteredData.sort((a, b) => b.averageScore - a.averageScore);

    return filteredData;
};
