// tests/navigation/DefaultFleetState.test.js
import { describe, it, expect } from 'vitest';
import { Fleet } from '@navigation/Fleet.js';
import {
    FLEET_STATE,
    totalFuelVolume,
    resolveDefaultAltitudeKm,
    createDefaultRuntimeState,
} from '@navigation/DefaultFleetState.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

describe('DefaultFleetState', () => {
    const fleet = Fleet.create(userFleetData);

    describe('totalFuelVolume', () => {
        it('sums fuelVolume across every ship, not a fixed number', () => {
            const expected = userFleetData.ships.reduce((sum, s) => sum + s.fuelVolume, 0);
            expect(totalFuelVolume(fleet)).toBe(expected);
        });

        it('throws for a fleet with no ships', () => {
            expect(() => totalFuelVolume({ id: 'x', ships: [] })).toThrow();
        });
    });

    describe('resolveDefaultAltitudeKm', () => {
        it('reads defaultOrbit.altitudeKm from the raw fleet data when present', () => {
            const mockFleetData = { id: 'test-fleet', defaultOrbit: { altitudeKm: 400 } };
            expect(resolveDefaultAltitudeKm(mockFleetData)).toBe(400);
        });
    
        it('returns null when the fleet data has no defaultOrbit', () => {
            expect(resolveDefaultAltitudeKm({ id: 'x' })).toBeNull();
        });
    });

    describe('createDefaultRuntimeState', () => {
        it('places the fleet at Earth radius + altitude, fully fueled, parked, no target', () => {
            const state = createDefaultRuntimeState({
                fleet,
                earthRadiusKm: 6378,
                altitudeKm: 400,
            });

            expect(state.position).toEqual({ x: 6778, y: 0, z: 0 });
            expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
            expect(state.fuelRemaining).toBe(totalFuelVolume(fleet));
            expect(state.target).toBeNull();
            expect(state.state).toBe(FLEET_STATE.PARKED);
        });

        it('derives a circular velocity magnitude when earthMuKm3PerS2 is supplied', () => {
            const earthMuKm3PerS2 = 398600.4418;
            const state = createDefaultRuntimeState({
                fleet,
                earthRadiusKm: 6378,
                altitudeKm: 400,
                earthMuKm3PerS2,
            });

            const expectedSpeed = Math.sqrt(earthMuKm3PerS2 / 6778);
            expect(state.velocity.y).toBeCloseTo(expectedSpeed, 6);
            expect(state.velocity.x).toBe(0);
            expect(state.velocity.z).toBe(0);
        });

        it('throws when earthRadiusKm or altitudeKm is missing', () => {
            expect(() => createDefaultRuntimeState({ fleet, altitudeKm: 400 })).toThrow();
            expect(() => createDefaultRuntimeState({ fleet, earthRadiusKm: 6378 })).toThrow();
        });
    });
});
