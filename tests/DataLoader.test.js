// tests/DataLoader.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataLoader } from '@core/DataLoader.js';
import { AU_IN_KM } from '@core/constants.js';

describe('DataLoader.processPlanetaryData', () => {
    it('returns an empty array for empty input without throwing', () => {
        expect(DataLoader.processPlanetaryData([])).toEqual([]);
    });

    it('converts a_km -> AU for MOON rows but uses a_au directly for non-moons', () => {
        const rows = [
            { name: 'moon', category: 'MOON', parent: 'earth', a_km: '384400' },
            { name: 'earth', category: 'PLANET', parent: 'sun', a_au: '1.0' }
        ];
        const processed = DataLoader.processPlanetaryData(rows);
        const moon = processed.find(r => r.name === 'MOON');
        const earth = processed.find(r => r.name === 'EARTH');

        expect(moon.a).toBeCloseTo(384400 / AU_IN_KM, 6);
        expect(earth.a).toBeCloseTo(1.0, 10);
    });

    it('upper-cases name/parent and normalizes category', () => {
        const [row] = DataLoader.processPlanetaryData([
            { name: 'europa', category: 'moon', parent: 'jupiter', a_km: '671100' }
        ]);
        expect(row.name).toBe('EUROPA');
        expect(row.parent).toBe('JUPITER');
        expect(row.category).toBe('MOON');
    });

    it('defaults category to ASTEROID when missing', () => {
        const [row] = DataLoader.processPlanetaryData([{ name: 'ceres', a_au: '2.77' }]);
        expect(row.category).toBe('ASTEROID');
    });

    it('derives orbital period from Kepler\'s third law when period_days is absent', () => {
        const [row] = DataLoader.processPlanetaryData([{ name: 'x', category: 'PLANET', a_au: '1.0' }]);
        expect(row.period).toBeCloseTo(365.256, 2);
        expect(row.n).toBeCloseTo((2 * Math.PI) / 365.256, 8);
    });

    it('uses the provided period_days verbatim when present', () => {
        const [row] = DataLoader.processPlanetaryData([
            { name: 'moon', category: 'MOON', parent: 'earth', a_km: '384400', period_days: '27.32' }
        ]);
        expect(row.period).toBeCloseTo(27.32, 5);
    });

    it('n stays 0 when both a and period_days are absent/zero', () => {
        const [row] = DataLoader.processPlanetaryData([{ name: 'x', category: 'ASTEROID' }]);
        expect(row.period).toBe(0);
        expect(row.n).toBe(0);
    });

    it('defaults mass to a tiny nonzero value when unset or zero', () => {
        const [a, b] = DataLoader.processPlanetaryData([
            { name: 'a', mass_10_24_kg: undefined },
            { name: 'b', mass_10_24_kg: '0' }
        ]);
        expect(a.mass).toBeCloseTo(0.000001, 10);
        expect(b.mass).toBeCloseTo(0.000001, 10);
    });

    it('defaults radius_km based on mass when radius_km is missing/invalid', () => {
        const [tiny, notTiny] = DataLoader.processPlanetaryData([
            { name: 'tiny', mass_10_24_kg: '0.0000005' },   // <= 0.000002 -> radius default 1.0
            { name: 'notTiny', mass_10_24_kg: '5' }          // > 0.000002 -> radius default 0
        ]);
        expect(tiny.radius_km).toBe(1.0);
        expect(notTiny.radius_km).toBe(0);
    });

    it('keeps an explicitly provided positive radius_km', () => {
        const [row] = DataLoader.processPlanetaryData([{ name: 'earth', radius_km: '6371' }]);
        expect(row.radius_km).toBe(6371);
    });

    it('assigns default symbols based on moon vs non-moon', () => {
        const [moon, planet] = DataLoader.processPlanetaryData([
            { name: 'moon', category: 'MOON', parent: 'earth' },
            { name: 'earth', category: 'PLANET' }
        ]);
        expect(moon.symbol).toBe('○');
        expect(planet.symbol).toBe('•');
    });

    it('defaults pole_dec to 90 when not provided, and other pole fields to 0', () => {
        const [row] = DataLoader.processPlanetaryData([{ name: 'x' }]);
        expect(row.pole_dec).toBe(90);
        expect(row.pole_ra).toBe(0);
        expect(row.pole_ra_rate).toBe(0);
        expect(row.pole_dec_rate).toBe(0);
    });

    it('preserves orbit_model, defaulting to KEPLER when absent', () => {
        const [kepler, meeus, vsop] = DataLoader.processPlanetaryData([
            { name: 'a' },
            { name: 'b', orbit_model: 'MEEUS' },
            { name: 'c', orbit_model: 'VSOP87' }
        ]);
        expect(kepler.orbit_model).toBe('KEPLER');
        expect(meeus.orbit_model).toBe('MEEUS');
        expect(vsop.orbit_model).toBe('VSOP87');
    });

    it('sorts the processed output by radius_km descending', () => {
        const rows = DataLoader.processPlanetaryData([
            { name: 'small', radius_km: '100' },
            { name: 'big', radius_km: '6000' },
            { name: 'mid', radius_km: '2000' }
        ]);
        expect(rows.map(r => r.name)).toEqual(['BIG', 'MID', 'SMALL']);
    });

    it('tags every row with the supplied datasetName', () => {
        const rows = DataLoader.processPlanetaryData([{ name: 'a' }], 'main-belt-chunk-03');
        expect(rows[0].datasetName).toBe('main-belt-chunk-03');
    });
});

describe('DataLoader.normalizeDesignation', () => {
    it('trims, upper-cases, and strips parentheses', () => {
        expect(DataLoader.normalizeDesignation(' (2003 UB313) ')).toBe('2003 UB313');
    });

    it('handles numeric designations', () => {
        expect(DataLoader.normalizeDesignation(433)).toBe('433');
    });
});

describe('DataLoader chunked lookups (fetch mocked)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('scanChunksForDesignation finds a match in a later chunk and stops', () => {
        const chunkA = [{ name: 'FOO' }];
        const chunkB = [{ name: 'ceres', a_au: '2.77' }];
        vi.spyOn(DataLoader, 'fetchJSONDataset')
            .mockImplementationOnce(async () => chunkA)
            .mockImplementationOnce(async () => chunkB);

        return DataLoader.scanChunksForDesignation(['urlA', 'urlB'], 'ceres', 'main-belt', 1).then(hit => {
            expect(hit).not.toBeNull();
            expect(hit.name).toBe('CERES');
        });
    });

    it('binarySearchNumberedChunks narrows to the chunk containing the target number', async () => {
        const chunks = [
            [{ name: 1 }, { name: 2 }, { name: 3 }],
            [{ name: 4 }, { name: 5 }, { name: 6 }],
            [{ name: 7 }, { name: 8 }, { name: 9 }]
        ];
        vi.spyOn(DataLoader, 'fetchJSONDataset').mockImplementation(async (url) => {
            const idx = parseInt(url.replace('chunk', ''), 10);
            return chunks[idx];
        });

        const hit = await DataLoader.binarySearchNumberedChunks(['chunk0', 'chunk1', 'chunk2'], 5, 'main-belt');
        expect(hit).not.toBeNull();
        expect(hit.name).toBe('5');
    });

    it('binarySearchNumberedChunks returns null when the number is out of range', async () => {
        const chunks = [[{ name: 1 }, { name: 2 }]];
        vi.spyOn(DataLoader, 'fetchJSONDataset').mockImplementation(async () => chunks[0]);

        const hit = await DataLoader.binarySearchNumberedChunks(['chunk0'], 999, 'main-belt');
        expect(hit).toBeNull();
    });
});