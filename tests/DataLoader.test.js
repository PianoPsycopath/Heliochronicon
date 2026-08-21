// tests/DataLoader.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataLoader } from '@core/DataLoader.js';

describe('DataLoader compatibility facade', () => {
    it('delegates dataset fetching to DataRepository', async () => {
        const { DataRepository } =
            await import('@core/DataRepository.js');

        const spy = vi
            .spyOn(DataRepository, 'fetchJSONDataset')
            .mockResolvedValue({ test: true });

        await expect(
            DataLoader.fetchJSONDataset('test.json')
        ).resolves.toEqual({ test: true });

        expect(spy).toHaveBeenCalledWith('test.json');
    });
});