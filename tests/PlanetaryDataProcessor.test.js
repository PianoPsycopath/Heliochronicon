//tests/PlanetaryDataProcesser.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AU_IN_KM } from '@core/constants.js';
import { PlanetaryDataProcessor } from '@core/PlanetaryDataProcessor.js';

describe('PlanetaryDataProcessor.processPlanetaryData', () => {
    it('returns an empty array for empty input without throwing', () => {
        expect(PlanetaryDataProcessor.processPlanetaryData([])).toEqual([]);
    });

    it('converts a_km -> AU for MOON rows but uses a_au directly for non-moons', () => {
        const rows = [
            { name: 'moon', category: 'MOON', parent: 'earth', a_km: '384400' },
            { name: 'earth', category: 'PLANET', parent: 'sun', a_au: '1.0' }
        ];
        const processed = PlanetaryDataProcessor.processPlanetaryData(rows);
        const moon = processed.find(r => r.name === 'MOON');
        const earth = processed.find(r => r.name === 'EARTH');

        expect(moon.a).toBeCloseTo(384400 / AU_IN_KM, 6);
        expect(earth.a).toBeCloseTo(1.0, 10);
    });

    it('upper-cases name/parent and normalizes category', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'europa', category: 'moon', parent: 'jupiter', a_km: '671100' }
        ]);
        expect(row.name).toBe('EUROPA');
        expect(row.parent).toBe('JUPITER');
        expect(row.category).toBe('MOON');
    });

    it('defaults category to ASTEROID when missing', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([{ name: 'ceres', a_au: '2.77' }]);
        expect(row.category).toBe('ASTEROID');
    });

    it('derives orbital period from Kepler\'s third law when period_days is absent', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([{ name: 'x', category: 'PLANET', a_au: '1.0' }]);
        expect(row.period).toBeCloseTo(365.256, 2);
        expect(row.n).toBeCloseTo((2 * Math.PI) / 365.256, 8);
    });

    it('uses the provided period_days verbatim when present', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'moon', category: 'MOON', parent: 'earth', a_km: '384400', period_days: '27.32' }
        ]);
        expect(row.period).toBeCloseTo(27.32, 5);
    });

    it('n stays 0 when both a and period_days are absent/zero', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([{ name: 'x', category: 'ASTEROID' }]);
        expect(row.period).toBe(0);
        expect(row.n).toBe(0);
    });

    it('defaults mass to a tiny nonzero value when unset or zero', () => {
        const [a, b] = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'a', mass_10_24_kg: undefined },
            { name: 'b', mass_10_24_kg: '0' }
        ]);
        expect(a.mass).toBeCloseTo(0.000001, 10);
        expect(b.mass).toBeCloseTo(0.000001, 10);
    });

    it('defaults radius_km based on mass when radius_km is missing/invalid', () => {
        const [tiny, notTiny] = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'tiny', mass_10_24_kg: '0.0000005' },   // <= 0.000002 -> radius default 1.0
            { name: 'notTiny', mass_10_24_kg: '5' }          // > 0.000002 -> radius default 0
        ]);
        expect(tiny.radius_km).toBe(1.0);
        expect(notTiny.radius_km).toBe(0);
    });

    it('keeps an explicitly provided positive radius_km', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([{ name: 'earth', radius_km: '6371' }]);
        expect(row.radius_km).toBe(6371);
    });

    it('assigns default symbols based on moon vs non-moon', () => {
        const [moon, planet] = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'moon', category: 'MOON', parent: 'earth' },
            { name: 'earth', category: 'PLANET' }
        ]);
        expect(moon.symbol).toBe('○');
        expect(planet.symbol).toBe('•');
    });

    it('defaults pole_dec to 90 when not provided, and other pole fields to 0', () => {
        const [row] = PlanetaryDataProcessor.processPlanetaryData([{ name: 'x' }]);
        expect(row.pole_dec).toBe(90);
        expect(row.pole_ra).toBe(0);
        expect(row.pole_ra_rate).toBe(0);
        expect(row.pole_dec_rate).toBe(0);
    });

    it('preserves orbit_model, defaulting to KEPLER when absent', () => {
        const [kepler, meeus, vsop] = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'a' },
            { name: 'b', orbit_model: 'MEEUS' },
            { name: 'c', orbit_model: 'VSOP87' }
        ]);
        expect(kepler.orbit_model).toBe('KEPLER');
        expect(meeus.orbit_model).toBe('MEEUS');
        expect(vsop.orbit_model).toBe('VSOP87');
    });

    it('sorts the processed output by radius_km descending', () => {
        const rows = PlanetaryDataProcessor.processPlanetaryData([
            { name: 'small', radius_km: '100' },
            { name: 'big', radius_km: '6000' },
            { name: 'mid', radius_km: '2000' }
        ]);
        expect(rows.map(r => r.name)).toEqual(['BIG', 'MID', 'SMALL']);
    });

    it('tags every row with the supplied datasetName', () => {
        const rows = PlanetaryDataProcessor.processPlanetaryData([{ name: 'a' }], 'main-belt-chunk-03');
        expect(rows[0].datasetName).toBe('main-belt-chunk-03');
    });
});
