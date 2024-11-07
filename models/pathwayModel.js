import fetch from 'node-fetch';
import { DOMParser } from 'xmldom';
import xml2js from 'xml2js';

const parser = new xml2js.Parser({ explicitArray: false });

export const getKGML = async (pathwayID) => {
    try {
        // Fetch the KGML data from KEGG using the pathway ID
        const response = await fetch(`https://rest.kegg.jp/get/${pathwayID}/kgml`, {
            headers: {
                'Accept': 'application/xml',
            }
        });

        // Check if the response is successful
        if (!response.ok) {
            throw new Error(`Error fetching KGML data: ${response.statusText}`);
        }

        // Get the text of the response (KGML XML)
        let xmlText = await response.text();

        // Remove DOCTYPE declaration
        xmlText = xmlText.replace(/<!DOCTYPE[^>]*>/, '');
        console.log("Fetched XML:", xmlText);

        // Parse XML to JSON
        const xmlDoc = await parser.parseStringPromise(xmlText);

        // Return parsed JSON object
        return xmlDoc;
    } catch (error) {
        console.error("Failed to fetch or parse KGML data:", error);
        throw error;
    }
};



export const extractProteins = (xmlText) => {
    // Regular expression to match entries with type "gene"
    const geneEntryRegex = /<entry[^>]*type="gene"[^>]*name="([^"]+)"[^>]*>/g;
    const proteins = {};

    let match;
    while ((match = geneEntryRegex.exec(xmlText)) !== null) {
        // Split gene names by spaces
        const geneNames = match[1].split(" ");
        const firstGene = geneNames[0];
        
        // Store the first gene name in the proteins object
        proteins[firstGene] = { proteinName: "proteinName" };
    }

    return proteins;
};

