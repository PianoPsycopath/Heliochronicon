// js/main/DatasetCoordinator.js

import { DataRepository } from '@core/DataRepository.js';
import { PlanetaryDataProcessor } from '@core/PlanetaryDataProcessor.js';
import { PopulationShapeLoader } from '@core/PopulationShapeLoader.js';
import { PopulationDensityFactory } from '@rendering/PopulationDensityFactory.js';
import { TacticalShaders } from '@rendering/shaders/tactical.js';
import { TutorialManager } from '@ui/TutorialManager.js';
import { logger } from '@core/logger.js';
import { LabelFactory } from '@rendering/LabelFactory.js';

const DATA_SOURCE_STORAGE_KEY = 'heliochronicon_dataSourcePath';
const DEFAULT_DATA_BASE_PATH = 'data/';
const DEFAULT_POPULATION_SHAPES_BASE_PATH = 'data/population_shapes/';

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
        scene,
        storage,
        appState,
        systemBuilder,
        bodyRegistry,
        UI,
        datasetMaterials,
        savedColors,
        dataBasePath,
        populationShapesBasePath = DEFAULT_POPULATION_SHAPES_BASE_PATH,
        asteroidPromotionService,
    }) {
        this.scene = scene;
        this.storage = storage;
        this.appState = appState;
        this.systemBuilder = systemBuilder;
        this.bodyRegistry = bodyRegistry;
        this.UI = UI;
        this.datasetMaterials = datasetMaterials;
        this.savedColors = savedColors;
        this.datasetDisplayModes = this.storage.get('datasetDisplayModes', {});
        this.datasetsWithParticles = new Set();
        this.asteroidPromotionService = asteroidPromotionService;

        this.dataBasePath = normalizeDataBasePath(dataBasePath);
        this.populationShapesBasePath = populationShapesBasePath;

        this.assetManifest = null;
        this.populationShapesManifest = null;
        this.datasetDisplayModes = {};
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
        try {
            this.populationShapesManifest = await PopulationShapeLoader.loadManifest(
                this.populationShapesBasePath
            );
        } catch (error) {
            logger.warn(
                `[Heliochronicon] Population density shapes unavailable (${this.populationShapesBasePath}); continuing without density objects.`,
                error
            );
            this.populationShapesManifest = null;
        }

        await this.initializeDatasets();
        this.restorePinnedAsteroids();

        new TutorialManager(this.storage);

        return true;
    }

    async loadManifest() {
        try {
            const manifest = await DataRepository.fetchJSONDataset(
                `${this.dataBasePath}manifest.json`
            );

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
                firstChunkRows = await DataRepository.fetchJSONDataset(chunkUrls[0]);
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
        this.UI.syncMasterToggle();
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
            const shapeEntry = this.populationShapesManifest
                ? PopulationShapeLoader.findShapeEntry(this.populationShapesManifest, datasetName)
                : null;

            if (shapeEntry && this.getDisplayMode(datasetName) === 'shapes') {
                this.loadDensityObjectFor(datasetName);

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

                return;
            }

            const chunks = await Promise.all(
                urlArray.map((url) => DataRepository.fetchJSONDataset(url))
            );

            if (!this.appState.hasInFlightDataset(datasetName)) {
                logger.info(
                    `[Heliochronicon] Load aborted for ${datasetName}; toggled off during fetch.`
                );

                return;
            }

            const mergedJSON = chunks.flat();

            const processedData = PlanetaryDataProcessor.processPlanetaryData(
                mergedJSON,
                datasetName
            );

            if (processedData.length === 0) {
                return;
            }
            this.systemBuilder.buildSolarSystem(processedData);
            this.datasetsWithParticles.add(datasetName);
            this.loadDensityObjectFor(datasetName);

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
    async loadDensityObjectFor(datasetName) {
        if (!this.populationShapesManifest) return;
        if (this.bodyRegistry.getDensityObjectByDataset(datasetName)) return;

        const entry = PopulationShapeLoader.findShapeEntry(
            this.populationShapesManifest,
            datasetName
        );
        if (!entry) return;

        try {
            const shapeDescriptor = await PopulationShapeLoader.loadShape(
                this.populationShapesBasePath,
                entry
            );

            const densityObject = PopulationDensityFactory.buildDensityObject(
                shapeDescriptor,
                datasetName,
                this.savedColors[datasetName]
            );

            const baseComponent = shapeDescriptor.components.find(c => c.isBase) || shapeDescriptor.components[0];
            const meanA = baseComponent?.meanA_au || 2.5;

            const labelMesh = LabelFactory.buildGroupLabel(
                datasetName,
                this.savedColors[datasetName],
                meanA
            );
            
            densityObject.userData.groupLabel = labelMesh;
            densityObject.userData.baseShape = baseComponent; 
            
            this.bodyRegistry.registerDensityObject(densityObject);
            this.bodyRegistry.setDatasetDisplayMode(datasetName, this.getDisplayMode(datasetName));
        } catch (error) {
            logger.warn(
                `[Heliochronicon] Failed to build density object for "${datasetName}"`,
                error
            );
        }
    }
    async setDisplayMode(datasetName, mode) {
        this.datasetDisplayModes[datasetName] = mode;
        this.storage.set('datasetDisplayModes', this.datasetDisplayModes);

        const needsParticles = mode === 'particles' || mode === 'both';

        if (needsParticles && !this.datasetsWithParticles.has(datasetName)) {
            const groupData = this.assetManifest.datasets[datasetName];
            if (groupData) {
                const chunkUrls = (groupData.chunks || []).map(
                    (chunkFile) => `${this.dataBasePath}${chunkFile}`
                );
                this.appState.removeActiveDataset(datasetName);
                await this.loadDataset(datasetName, chunkUrls);
            }
        }
        this.bodyRegistry.setDatasetDisplayMode(datasetName, mode);
    }

    getDisplayMode(datasetName) {
        return (
            this.datasetDisplayModes[datasetName] || this.storage.get('masterDisplayMode', 'shapes')
        );
    }

    async setDatasetVisibility(datasetName, isVisible, urls) {
        if (isVisible) {
            await this.loadDataset(datasetName, urls);
            this.datasetsWithParticles.delete(datasetName);

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

            this.asteroidPromotionService.restorePinned(astData);
        });
    }
}
