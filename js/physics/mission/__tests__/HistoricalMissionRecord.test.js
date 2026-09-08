import { describe, it, expect } from 'vitest';
import { createHistoricalMissionRecord } from '../HistoricalMissionRecord.js';

describe('createHistoricalMissionRecord', () => {
    it('constructs an immutable historical record with default description/source', () => {
        const record = createHistoricalMissionRecord({
            name: 'Voyager 2',
            origin: 'EARTH',
            target: 'NEPTUNE',
            launchTime_daysSinceJ2000: -8000,
            arrivalTime_daysSinceJ2000: -4000,
            actualDeltaV_kmps: 15.2,
            spacecraftMass_kg: 825,
        });
        expect(record.description).toBe('');
        expect(Object.isFrozen(record)).toBe(true);
    });

    it('rejects a missing target', () => {
        expect(() =>
            createHistoricalMissionRecord({
                name: 'Voyager 2',
                origin: 'EARTH',
                target: '',
                launchTime_daysSinceJ2000: -8000,
                arrivalTime_daysSinceJ2000: -4000,
                actualDeltaV_kmps: 15.2,
                spacecraftMass_kg: 825,
            })
        ).toThrow('HistoricalMissionRecord.target must be a non-empty string');
    });
});
