// tests/navigation/DefaultFleetState.test.js
import { describe, it, expect } from 'vitest';
import { Fleet } from '@navigation/Fleet.js';
import {
    FLEET_STATE,
    REFERENCE_FRAME,
    totalFuelVolume,
    resolveDefaultAltitudeKm,
    resolveDefaultOrbit,
    createDefaultRuntimeState,
    createRuntimeStateFromOrbitalElements,
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
            expect(state.velocity.z).toBeCloseTo(-expectedSpeed, 6);
            expect(state.velocity.x).toBe(0);
            expect(state.velocity.y).toBe(0);
        });

        it('throws when earthRadiusKm or altitudeKm is missing', () => {
            expect(() => createDefaultRuntimeState({ fleet, altitudeKm: 400 })).toThrow();
            expect(() => createDefaultRuntimeState({ fleet, earthRadiusKm: 6378 })).toThrow();
        });
    });

    describe('resolveDefaultOrbit (Phase B1 data contract)', () => {
        it('reads the full Keplerian contract from the real fleet data file', () => {
            const orbit = resolveDefaultOrbit(userFleetData);

            expect(orbit).toEqual({
                epochDaysJ2000: 0,
                parentBody: 'EARTH',
                aKm: 6678.137,
                e: 0,
                iRad: 0,
                raanRad: 0,
                argPeriapsisRad: 0,
                meanAnomalyRad: 0,
            });
        });

        it('fills in omitted optional fields with zero', () => {
            const orbit = resolveDefaultOrbit({
                defaultOrbit: { parentBody: 'MARS', aKm: 4000 },
            });

            expect(orbit).toEqual({
                epochDaysJ2000: 0,
                parentBody: 'MARS',
                aKm: 4000,
                e: 0,
                iRad: 0,
                raanRad: 0,
                argPeriapsisRad: 0,
                meanAnomalyRad: 0,
            });
        });

        it('returns null for the legacy altitude-only shape (no parentBody/aKm)', () => {
            expect(resolveDefaultOrbit({ defaultOrbit: { altitudeKm: 400 } })).toBeNull();
        });

        it('returns null when there is no defaultOrbit at all', () => {
            expect(resolveDefaultOrbit({ id: 'x' })).toBeNull();
            expect(resolveDefaultOrbit(null)).toBeNull();
        });
    });

    describe('createRuntimeStateFromOrbitalElements (Phase B1 data contract)', () => {
        const EARTH_MU_KM3_S2 = 398600.4418;

        it('builds a body-centered, fully fueled, parked runtime state from the orbit contract', () => {
            const orbit = resolveDefaultOrbit(userFleetData);
            const state = createRuntimeStateFromOrbitalElements({
                fleet,
                orbit,
                muKm3PerS2: EARTH_MU_KM3_S2,
            });

            expect(state.frame).toBe(REFERENCE_FRAME.BODY_CENTERED_KM);
            expect(state.parentBody).toBe('EARTH');
            expect(state.epochDaysJ2000).toBe(0);
            expect(state.fuelRemaining).toBe(totalFuelVolume(fleet));
            expect(state.target).toBeNull();
            expect(state.state).toBe(FLEET_STATE.PARKED);

            const r = Math.hypot(state.position.x, state.position.y, state.position.z);
            const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
            expect(r).toBeCloseTo(6678.137, 6);
            expect(speed).toBeCloseTo(Math.sqrt(EARTH_MU_KM3_S2 / 6678.137), 6);
        });

        it('throws when no orbit contract is supplied', () => {
            expect(() =>
                createRuntimeStateFromOrbitalElements({ fleet, orbit: null, muKm3PerS2: EARTH_MU_KM3_S2 })
            ).toThrow(/orbit/);
        });
    });
});