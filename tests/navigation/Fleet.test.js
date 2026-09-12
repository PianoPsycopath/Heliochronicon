// tests/navigation/Fleet.test.js
import { describe, it, expect } from 'vitest';
import { Fleet } from '@navigation/Fleet.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

describe('Fleet', () => {
    it('constructs a Fleet from data/fleets/userfleet.json', () => {
        const fleet = Fleet.create(userFleetData);

        expect(fleet.id).toBe(userFleetData.id);
        expect(fleet.name).toBe(userFleetData.name);
        expect(fleet.ships).toHaveLength(userFleetData.ships.length);
        expect(fleet.ships[0]).toMatchObject({
            id: userFleetData.ships[0].id,
            isp: userFleetData.ships[0].isp,
        });
    });

    it('throws when ships is missing or empty', () => {
        expect(() => Fleet.create({ id: 'empty-fleet', ships: [] })).toThrow();
        expect(() => Fleet.create({ id: 'no-ships-field' })).toThrow();
    });

    it('throws when id is missing', () => {
        expect(() => Fleet.create({ ships: userFleetData.ships })).toThrow();
    });

    describe('worstIsp', () => {
        it('derives the worst (lowest) Isp from the ships array, not a hard-coded value', () => {
            const fleet = Fleet.create(userFleetData);
            const expectedWorst = Math.min(...userFleetData.ships.map((s) => s.isp));

            expect(Fleet.worstIsp(fleet)).toBe(expectedWorst);
        });

        it('reflects a single-ship fleet correctly', () => {
            const fleet = Fleet.create({
                id: 'solo-fleet',
                ships: [userFleetData.ships[0]],
            });

            expect(Fleet.worstIsp(fleet)).toBe(userFleetData.ships[0].isp);
        });

        it('throws for a fleet with no ships', () => {
            expect(() => Fleet.worstIsp({ id: 'x', ships: [] })).toThrow();
        });
    });
});
