// js/main/DatasetCoordinator.js

import { DataLoader } from '../DataLoader.js';
import { TutorialManager } from '../TutorialManager.js';
import { logger } from '../logger.js';

const DATA_SOURCE_STORAGE_KEY = 'heliochronicon_dataSourcePath';
const DEFAULT_DATA_BASE_PATH = 'data/';

const CORE_CATEGORIES = new Set(['STAR', 'PLANET', 'DWARF_PLANET', 'MOON']);

const ASTEROID_TOGGLE_COLORS = ['#ff3333', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff'];

function normalizeDataBasePath(path) {
    const trimmed = (path || '').trim();

    if (!trimmed) {
        return DEFAULT_DATA_BASE_PATH;
    }

    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export class DatasetCoordinator {
    constructor({
        storage,
        appState,
        systemBuilder,
        bodyRegistry,
        UI,
        datasetMaterials,
        savedColors,
        dataBasePath,
    }) {
        this.storage = storage;
        this.appState = appState;
        this.systemBuilder = systemBuilder;
        this.bodyRegistry = bodyRegistry;
        this.UI = UI;
        this.datasetMaterials = datasetMaterials;
        this.savedColors = savedColors;

        this.dataBasePath = normalizeDataBasePath(dataBasePath);

        this.assetManifest = null;
    }

    get manifest() {
        return this.assetManifest;
    }

    get dataSourcePath() {
        return this.dataBasePath;
    }

    configureGlobalDataSourceControls() {
        window.switchDataSource = (path) => {
            this.storage.set(DATA_SOURCE_STORAGE_KEY, normalizeDataBasePath(path));

            window.location.reload();
        };

        window.resetDataSource = () => {
            this.storage.remove(DATA_SOURCE_STORAGE_KEY);

            window.location.reload();
        };
    }

    async initialize() {
        const manifest = await this.loadManifest();

        if (!manifest) {
            new TutorialManager(this.storage);

            return false;
        }

        this.assetManifest = manifest;

        await this.initializeDatasets();
        this.restorePinnedAsteroids();

        new TutorialManager(this.storage);

        return true;
    }

    async loadManifest() {
        try {
            const manifest = await DataLoader.fetchJSONDataset(`${this.dataBasePath}manifest.json`);

            if (!manifest || !manifest.datasets || Object.keys(manifest.datasets).length === 0) {
                logger.error(`No datasets found in manifest at ${this.dataBasePath}manifest.json`);

                return null;
            }

            return manifest;
        } catch (error) {
            logger.error(`Failed to load manifest.json from ${this.dataBasePath}`, error);

            return null;
        }
    }

    async initializeDatasets() {
        const savedActiveDatasets = this.storage.get('activeDatasets', null);

        let asteroidColorIndex = 0;

        for (const [groupName, groupData] of Object.entries(this.assetManifest.datasets)) {
            const chunkUrls = (groupData.chunks || []).map(
                (chunkFile) => `${this.dataBasePath}${chunkFile}`
            );

            if (chunkUrls.length === 0) {
                continue;
            }

            let firstChunkRows = [];

            try {
                firstChunkRows = await DataLoader.fetchJSONDataset(chunkUrls[0]);
            } catch (error) {
                logger.error(`Failed to load first chunk for dataset "${groupName}"`, error);
            }

            if (!firstChunkRows || firstChunkRows.length === 0) {
                continue;
            }

            const categoriesPresent = new Set(
                firstChunkRows.map((row) => (row.category || '').toString().toUpperCase())
            );

            const isCore = [...categoriesPresent].some((category) => CORE_CATEGORIES.has(category));

            const shouldBeActive =
                savedActiveDatasets !== null ? savedActiveDatasets.includes(groupName) : isCore;

            const iconCategory = isCore
                ? categoriesPresent.has('STAR') || categoriesPresent.has('PLANET')
                    ? 'PLANET'
                    : categoriesPresent.has('MOON')
                      ? 'MOON'
                      : 'PLANET'
                : 'ASTEROID';

            this.initializeDatasetColor(groupName, isCore, asteroidColorIndex);

            if (!isCore) {
                asteroidColorIndex++;
            }

            if (shouldBeActive) {
                await this.loadDataset(groupName, chunkUrls, {
                    addToggle: true,
                    iconCategory,
                });
            } else {
                this.UI.addDatasetToggle(
                    groupName,
                    iconCategory,
                    this.savedColors[groupName],
                    false,
                    chunkUrls
                );
            }
        }

        this.storage.set('activeDatasets', this.appState.getActiveDatasets());
    }

    initializeDatasetColor(datasetName, isCore, asteroidColorIndex) {
        if (this.savedColors[datasetName]) {
            return;
        }

        if (isCore) {
            this.savedColors[datasetName] = '#ffffff';

            return;
        }

        this.savedColors[datasetName] =
            ASTEROID_TOGGLE_COLORS[asteroidColorIndex % ASTEROID_TOGGLE_COLORS.length];
    }

    async loadDataset(datasetName, urls, { addToggle = false, iconCategory = 'ASTEROID' } = {}) {
        if (
            this.appState.hasActiveDataset(datasetName) ||
            this.appState.hasInFlightDataset(datasetName)
        ) {
            return;
        }

        this.appState.addInFlightDataset(datasetName);

        try {
            const urlArray = Array.isArray(urls) ? urls : [urls];

            const chunks = await Promise.all(
                urlArray.map((url) => DataLoader.fetchJSONDataset(url))
            );

            if (!this.appState.hasInFlightDataset(datasetName)) {
                logger.info(
                    `[Heliochronicon] Load aborted for ${datasetName}; toggled off during fetch.`
                );

                return;
            }

            const mergedJSON = chunks.flat();

            const processedData = DataLoader.processPlanetaryData(mergedJSON, datasetName);

            if (processedData.length === 0) {
                return;
            }

            this.systemBuilder.buildSolarSystem(processedData);

            this.appState.addActiveDataset(datasetName);

            this.storage.set('activeDatasets', this.appState.getActiveDatasets());

            if (addToggle) {
                this.UI.addDatasetToggle(
                    datasetName,
                    iconCategory,
                    this.savedColors[datasetName],
                    true,
                    urlArray
                );
            }
        } catch (error) {
            logger.error(`Failed to load dataset "${datasetName}"`, error);

            this.UI.showLookupNotFound(`Failed to download ${datasetName} dataset. Check network.`);
        } finally {
            this.appState.removeInFlightDataset(datasetName);
        }
    }

    async setDatasetVisibility(datasetName, isVisible, urls) {
        if (isVisible) {
            await this.loadDataset(datasetName, urls);

            return;
        }

        this.appState.removeInFlightDataset(datasetName);

        this.appState.removeActiveDataset(datasetName);

        this.storage.set('activeDatasets', this.appState.getActiveDatasets());

        this.bodyRegistry.removeByDataset(datasetName);

        delete this.datasetMaterials[datasetName];

        return {
            removedDataset: datasetName,
        };
    }

    clearAll() {
        this.systemBuilder.clearSolarSystem();

        this.appState.clearActiveDatasets();
        this.appState.clearInFlightDatasets();
        this.appState.lookupInFlight = false;

        this.storage.set('activeDatasets', []);
    }

    restorePinnedAsteroids() {
        const pinnedAsteroids = this.storage.get('pinnedAsteroids', []);

        pinnedAsteroids.forEach((astData) => {
            astData.isPinned = true;

            this.systemBuilder.promoteAsteroidToCPU(astData);
        });
    }
}
