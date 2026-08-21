// js/core/AsteroidLookup.js

import { DataRepository } from '@core/DataRepository.js';
import { PlanetaryDataProcessor } from '@core/PlanetaryDataProcessor.js';

export class AsteroidLookup {
    static normalizeDesignation(value) {
        return value.toString().trim().toUpperCase().replace(/[()]/g, '');
    }

    static async scanChunksForDesignation(urls, query, datasetName, batchSize = 8) {
        const target = AsteroidLookup.normalizeDesignation(query);

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);

            const chunks = await Promise.all(
                batch.map((url) => DataRepository.fetchJSONDataset(url))
            );

            for (const rows of chunks) {
                const row = rows.find(
                    (r) =>
                        r &&
                        r.name !== undefined &&
                        AsteroidLookup.normalizeDesignation(r.name) === target
                );

                if (row) {
                    return PlanetaryDataProcessor.processPlanetaryData([row], datasetName)[0];
                }
            }
        }

        return null;
    }

    static async binarySearchNumberedChunks(chunkUrls, targetNumber, datasetName) {
        let lo = 0;
        let hi = chunkUrls.length - 1;

        const cache = new Map();

        const loadChunk = async (idx) => {
            if (!cache.has(idx)) {
                cache.set(idx, DataRepository.fetchJSONDataset(chunkUrls[idx]));
            }

            return cache.get(idx);
        };

        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const rows = await loadChunk(mid);

            if (!rows.length) {
                hi = mid - 1;
                continue;
            }

            const first = rows[0].name;
            const last = rows[rows.length - 1].name;

            if (typeof first !== 'number' || typeof last !== 'number') {
                hi = mid - 1;
                continue;
            }

            if (targetNumber < first) {
                hi = mid - 1;
            } else if (targetNumber > last) {
                lo = mid + 1;
            } else {
                const row = rows.find((r) => r.name === targetNumber);

                return row
                    ? PlanetaryDataProcessor.processPlanetaryData([row], datasetName)[0]
                    : null;
            }
        }

        return null;
    }

    static async findAsteroidInManifest(query, manifest, skipGroups = [], dataBasePath = 'data/') {
        if (!manifest || !manifest.datasets) {
            return null;
        }

        const skip = new Set(skipGroups);

        const isNumeric = /^\d+$/.test(query.toString().trim());

        const entries = Object.entries(manifest.datasets).filter(
            ([groupName]) => !skip.has(groupName)
        );

        const mainBeltEntry = entries.find(([groupName]) => groupName === 'main-belt');

        const otherEntries = entries
            .filter(([groupName]) => groupName !== 'main-belt')
            .sort((a, b) => a[1].totalRecords - b[1].totalRecords);

        const makeUrls = (groupData) => groupData.chunks.map((file) => `${dataBasePath}${file}`);

        if (isNumeric && mainBeltEntry) {
            const [groupName, groupData] = mainBeltEntry;

            const hit = await AsteroidLookup.binarySearchNumberedChunks(
                makeUrls(groupData),
                parseInt(query, 10),
                groupName
            );

            if (hit) {
                return hit;
            }
        }

        for (const [groupName, groupData] of otherEntries) {
            const hit = await AsteroidLookup.scanChunksForDesignation(
                makeUrls(groupData),
                query,
                groupName
            );

            if (hit) {
                return hit;
            }
        }

        // Backup search for unnumbered/provisional main-belt designations.
        if (mainBeltEntry && !isNumeric) {
            const [groupName, groupData] = mainBeltEntry;

            return AsteroidLookup.scanChunksForDesignation(makeUrls(groupData), query, groupName);
        }

        return null;
    }
}
