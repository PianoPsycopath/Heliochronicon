// tests/AsteroidLookup.test.js

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AsteroidLookup } from '@core/AsteroidLookup.js';
import { DataRepository } from '@core/DataRepository.js';

describe('AsteroidLookup.normalizeDesignation', () => {
    it('trims, upper-cases, and strips parentheses', () => {
        expect(
            AsteroidLookup.normalizeDesignation(' (2003 UB313) ')
        ).toBe('2003 UB313');
    });

    it('handles numeric designations', () => {
        expect(
            AsteroidLookup.normalizeDesignation(433)
        ).toBe('433');
    });
});

describe('AsteroidLookup.scanChunksForDesignation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('finds a match in a later chunk', async () => {
        const chunkA = [{ name: 'FOO' }];
        const chunkB = [{ name: 'ceres', a_au: '2.77' }];

        vi.spyOn(DataRepository, 'fetchJSONDataset')
            .mockImplementationOnce(async () => chunkA)
            .mockImplementationOnce(async () => chunkB);

        const hit = await AsteroidLookup.scanChunksForDesignation(
            ['urlA', 'urlB'],
            'ceres',
            'main-belt',
            1
        );

        expect(hit).not.toBeNull();
        expect(hit.name).toBe('CERES');
    });

    it('returns null when no designation exists', async () => {
        vi.spyOn(DataRepository, 'fetchJSONDataset')
            .mockResolvedValue([{ name: 'FOO' }]);

        const hit = await AsteroidLookup.scanChunksForDesignation(
            ['urlA'],
            'ceres',
            'main-belt'
        );

        expect(hit).toBeNull();
    });
});

describe('AsteroidLookup.binarySearchNumberedChunks', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('finds a numbered asteroid in the correct chunk', async () => {
        const chunks = [
            [{ name: 1 }, { name: 2 }, { name: 3 }],
            [{ name: 4 }, { name: 5 }, { name: 6 }],
            [{ name: 7 }, { name: 8 }, { name: 9 }]
        ];

        vi.spyOn(DataRepository, 'fetchJSONDataset')
            .mockImplementation(async (url) => {
                const idx = parseInt(
                    url.replace('chunk', ''),
                    10
                );

                return chunks[idx];
            });

        const hit =
            await AsteroidLookup.binarySearchNumberedChunks(
                ['chunk0', 'chunk1', 'chunk2'],
                5,
                'main-belt'
            );

        expect(hit).not.toBeNull();
        expect(hit.name).toBe('5');
    });

    it('returns null for a number outside the available range', async () => {
        vi.spyOn(DataRepository, 'fetchJSONDataset')
            .mockResolvedValue([
                { name: 1 },
                { name: 2 }
            ]);

        const hit =
            await AsteroidLookup.binarySearchNumberedChunks(
                ['chunk0'],
                999,
                'main-belt'
            );

        expect(hit).toBeNull();
    });
});

describe('AsteroidLookup.findAsteroidInManifest', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the main-belt binary search for numeric designations', async () => {
        const manifest = {
            datasets: {
                'main-belt': {
                    totalRecords: 100,
                    chunks: ['main-belt-0.json']
                }
            }
        };

        vi.spyOn(DataRepository, 'fetchJSONDataset')
            .mockResolvedValue([
                { name: 433, a_au: '2.76' }
            ]);

        const hit =
            await AsteroidLookup.findAsteroidInManifest(
                '433',
                manifest
            );

        expect(hit).not.toBeNull();
        expect(hit.name).toBe('433');
    });
});