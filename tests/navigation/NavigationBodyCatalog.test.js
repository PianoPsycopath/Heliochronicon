// tests/navigation/NavigationBodyCatalog.test.js
import { describe, it, expect, vi } from 'vitest';
import { PlanetaryDataProcessor } from '@core/PlanetaryDataProcessor.js';
import { getParentChain } from '@navigation/PatchedConicFrame.js';
import { NavigationBodyCatalog, isNavigationBody } from '@navigation/NavigationBodyCatalog.js';
import planetsData from '../../public/data/planets.json';
import moonsData from '../../public/data/moons.json';

const planets = PlanetaryDataProcessor.processPlanetaryData(planetsData, 'PLANETS');
const moons = PlanetaryDataProcessor.processPlanetaryData(moonsData, 'MOONS');

const asteroidRow = {
    name: 'CERES_LIKE',
    category: 'ASTEROID',
    parent: 'SUN',
    datasetName: 'MAIN_BELT',
};

function loadedCatalog() {
    const catalog = new NavigationBodyCatalog();
    catalog.registerMany(planets);
    catalog.registerMany(moons);
    return catalog;
}

describe('isNavigationBody', () => {
    it('accepts stars, planets, dwarf planets and moons', () => {
        for (const category of ['STAR', 'PLANET', 'DWARF_PLANET', 'MOON']) {
            expect(isNavigationBody({ name: 'X', category })).toBe(true);
        }
    });

    it('rejects asteroids, promoted/radar clones, nameless rows and non-objects', () => {
        expect(isNavigationBody(asteroidRow)).toBe(false);
        expect(isNavigationBody({ name: 'X', category: 'PROMOTED_ASTEROID' })).toBe(false);
        expect(isNavigationBody({ name: '  ', category: 'MOON' })).toBe(false);
        expect(isNavigationBody(null)).toBe(false);
        expect(isNavigationBody('MOON')).toBe(false);
    });
});

describe('NavigationBodyCatalog', () => {
    describe('resolving without any visual body', () => {

        it('resolves moons of every planet from data alone', () => {
            const catalog = loadedCatalog();

            expect(catalog.getByName('MOON')?.parent).toBe('EARTH');
            expect(catalog.getByName('IO')?.parent).toBe('JUPITER');
            expect(catalog.getByName('PHOBOS')?.parent).toBe('MARS');
        });

        it('normalises case and whitespace, and returns null for unknown or non-string names', () => {
            const catalog = loadedCatalog();

            expect(catalog.getByName('  io ')).toBe(catalog.getByName('IO'));
            expect(catalog.getByName('NOT_A_BODY')).toBeNull();
            expect(catalog.getByName(undefined)).toBeNull();
            expect(catalog.has('MOON')).toBe(true);
            expect(catalog.has('NOT_A_BODY')).toBe(false);
        });

        it('returns the very same data object it was given, not a copy', () => {
            const catalog = loadedCatalog();

            expect(catalog.getByName('EARTH')).toBe(planets.find((b) => b.name === 'EARTH'));
        });

        it("lets PatchedConicFrame walk a moon's parent chain through the catalog", () => {
            const lookup = loadedCatalog().asLookup();

            const chain = getParentChain(lookup('IO'), lookup);

            expect(chain.map((body) => body.name)).toEqual(['IO', 'JUPITER', 'SUN']);
        });
    });

    describe('eligibility', () => {
        it('keeps asteroids out of CPU memory', () => {
            const catalog = new NavigationBodyCatalog();

            const held = catalog.registerMany([...planets, asteroidRow]);

            expect(held).toBe(planets.length);
            expect(catalog.has('CERES_LIKE')).toBe(false);
        });

        it('rejects a non-array input loudly', () => {
            expect(() => new NavigationBodyCatalog().registerMany(null)).toThrow(/array/);
        });
    });

    describe('name collisions', () => {
        it('lets the same dataset replace its own entry (live objects supersede preload copies)', () => {
            const catalog = new NavigationBodyCatalog();
            const preload = { ...moons.find((m) => m.name === 'MOON') };
            const live = { ...preload };

            catalog.registerMany([preload]);
            catalog.registerMany([live]);

            expect(catalog.getByName('MOON')).toBe(live);
            expect(catalog.size).toBe(1);
        });

        it('keeps the first dataset to claim a name, like the registry does', () => {
            const catalog = new NavigationBodyCatalog();
            const first = { name: 'TWIN', category: 'MOON', parent: 'EARTH', datasetName: 'A' };
            const second = { name: 'TWIN', category: 'MOON', parent: 'MARS', datasetName: 'B' };

            catalog.registerMany([first]);
            catalog.registerMany([second]);

            expect(catalog.getByName('TWIN')).toBe(first);
        });
    });

    describe('getByParent', () => {
        it("lists a planet's moons and never lists the root as its own child", () => {
            const catalog = loadedCatalog();

            const jovian = catalog.getByParent('JUPITER');
            expect(jovian.length).toBeGreaterThan(0);
            expect(jovian.every((body) => body.parent === 'JUPITER')).toBe(true);
            expect(jovian.map((body) => body.name)).toContain('IO');

            expect(catalog.getByParent('SUN').map((body) => body.name)).not.toContain('SUN');
            expect(catalog.getByParent('NOT_A_BODY')).toEqual([]);
            expect(catalog.getByParent(undefined)).toEqual([]);
        });
    });

    describe('removal', () => {
        it('removes one dataset without touching the others', () => {
            const catalog = loadedCatalog();
            const planetCount = planets.length;
            const uniqueMoons = new Set(moons.map((moon) => moon.name)).size;

            const removed = catalog.removeByDataset('MOONS');

            expect(removed).toBe(uniqueMoons);
            expect(catalog.has('IO')).toBe(false);
            expect(catalog.size).toBe(planetCount);
            expect(catalog.has('EARTH')).toBe(true);
        });

        it('clears everything', () => {
            const catalog = loadedCatalog();

            catalog.clear();

            expect(catalog.size).toBe(0);
            expect(catalog.getByName('EARTH')).toBeNull();
        });
    });

    describe('asLookup', () => {
        it('prefers the catalog and never consults the fallback for a catalog hit', () => {
            const fallback = vi.fn(() => ({ name: 'FROM_REGISTRY' }));
            const lookup = loadedCatalog().asLookup(fallback);

            expect(lookup('IO').name).toBe('IO');
            expect(fallback).not.toHaveBeenCalled();
        });

        it('falls back for bodies that exist only as visuals (e.g. a promoted asteroid)', () => {
            const promoted = { name: 'PROMOTED_ONE', datasetCategory: 'PROMOTED_ASTEROID' };
            const lookup = loadedCatalog().asLookup((name) =>
                name === 'PROMOTED_ONE' ? promoted : null
            );

            expect(lookup('PROMOTED_ONE')).toBe(promoted);
        });

        it('returns null when neither source knows the body, with or without a fallback', () => {
            expect(loadedCatalog().asLookup((name) => undefined)('NOPE')).toBeNull();
            expect(loadedCatalog().asLookup()('NOPE')).toBeNull();
        });
    });
});