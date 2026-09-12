// tests/navigation/Ship.test.js
import { describe, it, expect } from 'vitest';
import { Ship } from '@navigation/Ship.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

describe('Ship', () => {
    it('constructs a Ship from a raw entry of userfleet.json', () => {
        const raw = userFleetData.ships[0];
        const ship = Ship.create(raw);

        expect(ship).toEqual({
            id: raw.id,
            name: raw.name,
            weight: raw.weight,
            thrust: raw.thrust,
            fuelType: raw.fuelType,
            fuelVolume: raw.fuelVolume,
            shipVolume: raw.shipVolume,
            isp: raw.isp,
        });
    });

    it('defaults name to id when omitted', () => {
        const ship = Ship.create({
            id: 'ship-x',
            weight: 100,
            thrust: 100,
            fuelVolume: 10,
            shipVolume: 20,
            isp: 300,
        });

        expect(ship.name).toBe('ship-x');
    });

    it.each(['weight', 'thrust', 'fuelVolume', 'shipVolume', 'isp'])(
        'throws when "%s" is missing or non-numeric',
        (field) => {
            const raw = { ...userFleetData.ships[0] };
            delete raw[field];

            expect(() => Ship.create(raw)).toThrow();
        }
    );

    it('throws when id is missing', () => {
        const raw = { ...userFleetData.ships[0] };
        delete raw.id;

        expect(() => Ship.create(raw)).toThrow();
    });
});
