import { describe, it, expect } from 'vitest';
import { createSpacecraftDefinition } from '../SpacecraftDefinition.js';

describe('createSpacecraftDefinition', () => {
    it('computes wetMass_kg from dry and propellant mass', () => {
        const spacecraft = createSpacecraftDefinition({
            name: 'Voyager-class Probe',
            dryMass_kg: 800,
            propellantMass_kg: 200,
        });
        expect(spacecraft.wetMass_kg).toBe(1000);
        expect(Object.isFrozen(spacecraft)).toBe(true);
    });

    it('defaults propulsion to null when omitted', () => {
        const spacecraft = createSpacecraftDefinition({
            name: 'Probe',
            dryMass_kg: 500,
            propellantMass_kg: 100,
        });
        expect(spacecraft.propulsion).toBeNull();
    });

    it('rejects non-positive dry mass', () => {
        expect(() =>
            createSpacecraftDefinition({ name: 'Probe', dryMass_kg: 0, propellantMass_kg: 100 })
        ).toThrow('dryMass_kg must be positive');
    });

    it('rejects negative propellant mass', () => {
        expect(() =>
            createSpacecraftDefinition({ name: 'Probe', dryMass_kg: 500, propellantMass_kg: -1 })
        ).toThrow('propellantMass_kg must be non-negative');
    });
});
