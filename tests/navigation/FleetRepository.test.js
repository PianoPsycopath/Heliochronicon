// tests/navigation/FleetRepository.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FleetRepository } from '@navigation/FleetRepository.js';
import { DataRepository } from '@core/DataRepository.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

describe('FleetRepository', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetchFleetData delegates to DataRepository.fetchJSONDataset with the default URL', async () => {
        const spy = vi
            .spyOn(DataRepository, 'fetchJSONDataset')
            .mockResolvedValue(userFleetData);

        const data = await FleetRepository.fetchFleetData();

        expect(spy).toHaveBeenCalledWith('data/fleets/userfleet.json');
        expect(data).toEqual(userFleetData);
    });

    it('fetchFleetData forwards a custom URL', async () => {
        const spy = vi
            .spyOn(DataRepository, 'fetchJSONDataset')
            .mockResolvedValue(userFleetData);

        await FleetRepository.fetchFleetData('custom/path.json');

        expect(spy).toHaveBeenCalledWith('custom/path.json');
    });

    it('loadFleet fetches and shapes the data into a validated Fleet', async () => {
        vi.spyOn(DataRepository, 'fetchJSONDataset').mockResolvedValue(userFleetData);

        const fleet = await FleetRepository.loadFleet();

        expect(fleet.id).toBe(userFleetData.id);
        expect(fleet.ships).toHaveLength(userFleetData.ships.length);
    });

    it('propagates fetch/validation errors rather than swallowing them', async () => {
        vi.spyOn(DataRepository, 'fetchJSONDataset').mockRejectedValue(
            new Error('HTTP Error: 404 at data/fleets/userfleet.json')
        );

        await expect(FleetRepository.loadFleet()).rejects.toThrow('HTTP Error');
    });
});
