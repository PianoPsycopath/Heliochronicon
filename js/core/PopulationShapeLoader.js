// js/core/PopulationShapeLoader.js
import { DataRepository } from '@core/DataRepository.js';

const DEFAULT_BASE_PATH = 'data/population_shapes/';

function normalizeBasePath(path) {
    const trimmed = (path || '').trim();
    if (!trimmed) return DEFAULT_BASE_PATH;
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export class PopulationShapeLoader {
    static async loadManifest(basePath = DEFAULT_BASE_PATH) {
        const normalized = normalizeBasePath(basePath);
        const manifest = await DataRepository.fetchJSONDataset(`${normalized}manifest.json`);

        if (!manifest || !Array.isArray(manifest.shapes)) {
            throw new Error(`Malformed population shapes manifest at ${normalized}manifest.json`);
        }

        return manifest;
    }
    static findShapeEntry(manifest, datasetName) {
        if (!manifest || !Array.isArray(manifest.shapes)) return null;
        return manifest.shapes.find((entry) => entry.id === datasetName) || null;
    }

    static async loadShape(basePath, entry) {
        const normalized = normalizeBasePath(basePath);
        return DataRepository.fetchJSONDataset(`${normalized}${entry.file}`);
    }
}