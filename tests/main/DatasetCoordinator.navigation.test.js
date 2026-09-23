// tests/main/DatasetCoordinator.navigation.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@ui/TutorialManager.js', () => ({ TutorialManager: class {} }));
vi.mock('@rendering/PopulationDensityFactory.js', () => ({ PopulationDensityFactory: {} }));
vi.mock('@rendering/LabelFactory.js', () => ({ LabelFactory: {} }));
vi.mock('@core/PopulationShapeLoader.js', () => ({
    PopulationShapeLoader: {
        loadManifest: vi.fn().mockResolvedValue(null),
        findShapeEntry: vi.fn().mockReturnValue(null),
    },
}));

import { DatasetCoordinator } from '@main/DatasetCoordinator.js';
import { DataRepository } from '@core/DataRepository.js';
import { NavigationBodyCatalog } from '@navigation/NavigationBodyCatalog.js';
import planetsData from '../../public/data/planets.json';
import moonsData from '../../public/data/moons.json';

const BASE = 'data/';

const asteroidChunk = [
    {
        name: 'ROCK_1',
        category: 'ASTEROID',
        parent: 'SUN',
        a_au: 2.5,
        e: 0.1,
        i_deg: 1,
        w_deg: 1,
        node_deg: 1,
        m_deg: 1,
    },
];

const FILES = {
    [`${BASE}manifest.json`]: {
        datasets: {
            PLANETS: { chunks: ['planets.json'] },
            MOONS: { chunks: ['moons_a.json', 'moons_b.json'] },
            MAIN_BELT: { chunks: ['belt_1.json', 'belt_2.json'] },
        },
    },
    [`${BASE}planets.json`]: planetsData,
    [`${BASE}moons_a.json`]: moonsData.slice(0, 200),
    [`${BASE}moons_b.json`]: moonsData.slice(200),
    [`${BASE}belt_1.json`]: asteroidChunk,
    [`${BASE}belt_2.json`]: asteroidChunk,
};

function buildCoordinator({ activeDatasets = null } = {}) {
    const active = new Set();
    const inFlight = new Set();
    const storageBacking = { activeDatasets };
    const storage = {
        get: vi.fn((key, fallback) => (storageBacking[key] !== undefined ? storageBacking[key] : fallback)),
        set: vi.fn((key, value) => {
            storageBacking[key] = value;
        }),
        remove: vi.fn(),
    };
    const appState = {
        getActiveDatasets: () => [...active],
        hasActiveDataset: (name) => active.has(name),
        addActiveDataset: (name) => active.add(name),
        removeActiveDataset: (name) => active.delete(name),
        clearActiveDatasets: () => active.clear(),
        hasInFlightDataset: (name) => inFlight.has(name),
        addInFlightDataset: (name) => inFlight.add(name),
        removeInFlightDataset: (name) => inFlight.delete(name),
        clearInFlightDatasets: () => inFlight.clear(),
    };
    const buildOrder = [];
    const systemBuilder = {
        buildSolarSystem: vi.fn(() => buildOrder.push('build')),
        clearSolarSystem: vi.fn(),
    };
    const bodyRegistry = {
        removeByDataset: vi.fn(),
        getDensityObjectByDataset: vi.fn(),
    };
    const UI = {
        addDatasetToggle: vi.fn(),
        syncMasterToggle: vi.fn(),
        showLookupNotFound: vi.fn(),
    };
    const navigationBodyCatalog = new NavigationBodyCatalog();
    const registerMany = navigationBodyCatalog.registerMany.bind(navigationBodyCatalog);
    navigationBodyCatalog.registerMany = (rows) => {
        buildOrder.push('register');
        return registerMany(rows);
    };

    const coordinator = new DatasetCoordinator({
        scene: {},
        storage,
        appState,
        systemBuilder,
        bodyRegistry,
        UI,
        datasetMaterials: {},
        savedColors: {},
        dataBasePath: BASE,
        asteroidPromotionService: { restorePinned: vi.fn() },
        navigationBodyCatalog,
    });

    return { coordinator, navigationBodyCatalog, systemBuilder, bodyRegistry, buildOrder };
}

describe('DatasetCoordinator navigation data (Phase B2)', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi
            .spyOn(DataRepository, 'fetchJSONDataset')
            .mockImplementation(async (url) => FILES[url]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers navigation data for active core datasets before any mesh is built', async () => {
        const { coordinator, navigationBodyCatalog, buildOrder } = buildCoordinator();

        await coordinator.initialize();

        expect(navigationBodyCatalog.has('EARTH')).toBe(true);
        expect(navigationBodyCatalog.has('IO')).toBe(true);
        expect(buildOrder.slice(0, 2)).toEqual(['register', 'build']);
    });

    it('keeps moons navigable when the moons dataset is not active, without building meshes', async () => {
        const { coordinator, navigationBodyCatalog, systemBuilder } = buildCoordinator({
            activeDatasets: ['PLANETS'],
        });

        await coordinator.initialize();

        // Both chunks of the hidden dataset are present (first chunk reused, rest fetched).
        expect(navigationBodyCatalog.getByName('MOON')?.parent).toBe('EARTH');
        expect(navigationBodyCatalog.getByName(moonsData[moonsData.length - 1].name)).not.toBeNull();

        const builtDatasets = systemBuilder.buildSolarSystem.mock.calls.map(
            ([rows]) => rows[0].datasetName
        );
        expect(builtDatasets).toEqual(['PLANETS']);
    });

    it('does not load asteroid populations into the catalog, or fetch their extra chunks', async () => {
        const { coordinator, navigationBodyCatalog } = buildCoordinator({
            activeDatasets: ['PLANETS', 'MOONS'],
        });

        await coordinator.initialize();

        expect(navigationBodyCatalog.has('ROCK_1')).toBe(false);
        expect(fetchSpy).toHaveBeenCalledWith(`${BASE}belt_1.json`);
        expect(fetchSpy).not.toHaveBeenCalledWith(`${BASE}belt_2.json`);
    });

    it('keeps navigation data when a dataset is hidden, while the visual bodies are removed', async () => {
        const { coordinator, navigationBodyCatalog, bodyRegistry } = buildCoordinator();
        await coordinator.initialize();

        await coordinator.setDatasetVisibility('MOONS', false);

        expect(bodyRegistry.removeByDataset).toHaveBeenCalledWith('MOONS');
        expect(navigationBodyCatalog.has('IO')).toBe(true);
    });

    it('builds meshes only when a hidden dataset is shown, without growing the catalog', async () => {
        const { coordinator, navigationBodyCatalog, systemBuilder } = buildCoordinator({
            activeDatasets: ['PLANETS'],
        });
        await coordinator.initialize();
        const held = navigationBodyCatalog.size;

        await coordinator.setDatasetVisibility('MOONS', true, [
            `${BASE}moons_a.json`,
            `${BASE}moons_b.json`,
        ]);

        expect(navigationBodyCatalog.size).toBe(held);
        expect(systemBuilder.buildSolarSystem).toHaveBeenCalledTimes(2);
    });

    it('clears navigation data with the rest of the system', async () => {
        const { coordinator, navigationBodyCatalog } = buildCoordinator();
        await coordinator.initialize();

        coordinator.clearAll();

        expect(navigationBodyCatalog.size).toBe(0);
    });

    it('survives a failed hidden-dataset fetch: the boot continues and only that data is missing', async () => {
        const { coordinator, navigationBodyCatalog, systemBuilder } = buildCoordinator({
            activeDatasets: ['PLANETS'],
        });
        fetchSpy.mockImplementation(async (url) => {
            if (url === `${BASE}moons_b.json`) throw new Error('offline');
            return FILES[url];
        });

        await expect(coordinator.initialize()).resolves.toBe(true);

        expect(navigationBodyCatalog.has('EARTH')).toBe(true);
        expect(navigationBodyCatalog.has('MOON')).toBe(false);
        expect(systemBuilder.buildSolarSystem).toHaveBeenCalledTimes(1);
    });
});