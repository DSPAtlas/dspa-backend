import fetch from 'node-fetch';
import db from '../config/database.js';
import { DOMParser } from 'xmldom';

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
        const xmlText = await response.text();

        // Parse the XML text into a DOM Document
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        // Check if there are any parsing errors
        if (xmlDoc.querySelector("parsererror")) {
            throw new Error("Error parsing KGML XML data");
        }

        // Return the parsed XML document
        return xmlDoc;
    } catch (error) {
        console.error("Failed to fetch or parse KGML data:", error);
        throw error;
    }
};

export const extractProteins = (xmlDoc) => {
    if (!xmlDoc) {
        throw new Error("Invalid XML Document");
    }

    const proteins = {};
    const entries = Array.from(xmlDoc.getElementsByTagName("entry"));

    entries.forEach(entry => {
        if (entry.getAttribute("type") === "gene") {
            const geneNames = entry.getAttribute("name").split(" ");
            const firstGene = geneNames[0];
            proteins[firstGene] = { proteinName: "proteinName" };
        }
    });

    return proteins;
};