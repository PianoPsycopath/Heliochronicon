// js/core/DataLoader.js

import { DataRepository } from '@core/DataRepository.js';
import { PlanetaryDataProcessor } from '@core/PlanetaryDataProcessor.js';
import { AsteroidLookup } from '@core/AsteroidLookup.js';

export class DataLoader {
    /**
     * @deprecated Use DataRepository.fetchJSONDataset() instead.
     */
    static fetchJSONDataset(url) {
        return DataRepository.fetchJSONDataset(url);
    }

    /**
     * @deprecated Use PlanetaryDataProcessor.processPlanetaryData() instead.
     */
    static processPlanetaryData(rawData, datasetName = 'UNKNOWN_DATASET') {
        return PlanetaryDataProcessor.processPlanetaryData(rawData, datasetName);
    }

    /**
     * @deprecated Use AsteroidLookup.normalizeDesignation() instead.
     */
    static normalizeDesignation(value) {
        return AsteroidLookup.normalizeDesignation(value);
    }

    /**
     * @deprecated Use AsteroidLookup.scanChunksForDesignation() instead.
     */
    static scanChunksForDesignation(urls, query, datasetName, batchSize = 8) {
        return AsteroidLookup.scanChunksForDesignation(urls, query, datasetName, batchSize);
    }

    /**
     * @deprecated Use AsteroidLookup.binarySearchNumberedChunks() instead.
     */
    static binarySearchNumberedChunks(chunkUrls, targetNumber, datasetName) {
        return AsteroidLookup.binarySearchNumberedChunks(chunkUrls, targetNumber, datasetName);
    }

    /**
     * @deprecated Use AsteroidLookup.findAsteroidInManifest() instead.
     */
    static findAsteroidInManifest(query, manifest, skipGroups = [], dataBasePath = 'data/') {
        return AsteroidLookup.findAsteroidInManifest(query, manifest, skipGroups, dataBasePath);
    }
}
