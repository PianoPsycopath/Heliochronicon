// tests/navigation/FleetService.test.js
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { FleetService } from '@navigation/FleetService.js';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import { DataRepository } from '@core/DataRepository.js';
import { StorageManager } from '@core/storage.js';
import { REFERENCE_FRAME } from '@navigation/DefaultFleetState.js';
import { bodyMuKm3PerS2 } from '@core/BodyPhysicalConstants.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

const MOCK_EARTH_BODY_DATA = { name: 'EARTH', mass: 5.972 };

describe('FleetService.loadFleetWithState', () => {
    let mockBackend;
    let store;

    beforeEach(() => {
        const mockFleetData = { ...userFleetData, defaultOrbit: { altitudeKm: 400 } };
        vi.spyOn(DataRepository, 'fetchJSONDataset').mockResolvedValue(mockFleetData);

        const backingStore = {};
        mockBackend = {
            getItem: vi.fn((key) => (key in backingStore ? backingStore[key] : null)),
            setItem: vi.fn((key, value) => {
                backingStore[key] = value.toString();
            }),
            removeItem: vi.fn((key) => {
                delete backingStore[key];
            }),
        };
        store = new FleetRuntimeStore(new StorageManager(mockBackend));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('computes and persists a default Earth-LEO state on first load (no save exists)', async () => {
        const result = await FleetService.loadFleetWithState({
            store,
            earthRadiusKm: 6378,
            fallbackAltitudeKm: 500,
        });
    
        expect(result.id).toBe(userFleetData.id);
        expect(result.ships).toHaveLength(userFleetData.ships.length);
        expect(result.runtimeState.state).toBe('parked');
        expect(result.runtimeState.target).toBeNull();
        
        // 6378 + mocked defaultOrbit.altitudeKm (400), not the fallback (500)
        expect(result.runtimeState.position.x).toBe(6378 + 400);
    
        // and it was persisted, so a second load restores rather than recomputes
        expect(store.load(userFleetData.id)).toEqual(result.runtimeState);
    });

    it('uses fallbackAltitudeKm only when the fleet data has no defaultOrbit', async () => {
        const dataWithoutDefaultOrbit = { ...userFleetData };
        delete dataWithoutDefaultOrbit.defaultOrbit;
        vi.spyOn(DataRepository, 'fetchJSONDataset').mockResolvedValue(dataWithoutDefaultOrbit);

        const result = await FleetService.loadFleetWithState({
            store,
            earthRadiusKm: 6378,
            fallbackAltitudeKm: 500,
        });

        expect(result.runtimeState.position.x).toBe(6378 + 500);
    });

    it('restores a persisted runtime state on a subsequent load instead of recomputing', async () => {
        const persisted = {
            fuelRemaining: 1234,
            position: { x: 1, y: 2, z: 3 },
            velocity: { x: 0, y: 0, z: 0 },
            target: 'MARS',
            state: 'inflight',
        };
        store.save(userFleetData.id, persisted);

        const result = await FleetService.loadFleetWithState({
            store,
            earthRadiusKm: 6378,
            fallbackAltitudeKm: 400,
        });

        expect(result.runtimeState).toEqual(persisted);
    });

    describe('Phase B1 — Keplerian defaultOrbit contract', () => {
        beforeEach(() => {
            vi.spyOn(DataRepository, 'fetchJSONDataset').mockResolvedValue(userFleetData);
        });

        it('builds the runtime state from the data contract when getBodyDataByName resolves the parent', async () => {
            const getBodyDataByName = vi.fn((name) =>
                name === 'EARTH' ? MOCK_EARTH_BODY_DATA : null
            );

            const result = await FleetService.loadFleetWithState({
                store,
                getBodyDataByName,
                earthRadiusKm: 6378,
                fallbackAltitudeKm: 500,
            });

            expect(getBodyDataByName).toHaveBeenCalledWith('EARTH');
            expect(result.runtimeState.frame).toBe(REFERENCE_FRAME.BODY_CENTERED_KM);
            expect(result.runtimeState.parentBody).toBe('EARTH');
            expect(result.runtimeState.epochDaysJ2000).toBe(0);

            const muKm3PerS2 = bodyMuKm3PerS2(MOCK_EARTH_BODY_DATA);
            const { position, velocity } = result.runtimeState;
            const r = Math.hypot(position.x, position.y, position.z);
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            expect(r).toBeCloseTo(6678.137, 6);
            expect(speed).toBeCloseTo(Math.sqrt(muKm3PerS2 / 6678.137), 6);

            // Persisted, so a second load restores rather than recomputes.
            expect(store.load(userFleetData.id)).toEqual(result.runtimeState);
        });

        it('falls back to the legacy altitude default when getBodyDataByName is not supplied', async () => {
            const result = await FleetService.loadFleetWithState({
                store,
                earthRadiusKm: 6378,
                fallbackAltitudeKm: 500,
            });

            expect(result.runtimeState.frame).toBe(REFERENCE_FRAME.EARTH_CENTERED_KM);
            expect(result.runtimeState.position.x).toBe(6378 + 500);
        });

        it('falls back to the legacy altitude default when the named parent cannot be resolved', async () => {
            const result = await FleetService.loadFleetWithState({
                store,
                getBodyDataByName: () => null,
                earthRadiusKm: 6378,
                fallbackAltitudeKm: 500,
            });

            expect(result.runtimeState.frame).toBe(REFERENCE_FRAME.EARTH_CENTERED_KM);
            expect(result.runtimeState.position.x).toBe(6378 + 500);
        });

        it('still lets a persisted runtime state take precedence over the data contract', async () => {
            const persisted = {
                fuelRemaining: 999,
                position: { x: 9, y: 8, z: 7 },
                velocity: { x: 0, y: 0, z: 0 },
                target: null,
                state: 'parked',
            };
            store.save(userFleetData.id, persisted);

            const result = await FleetService.loadFleetWithState({
                store,
                getBodyDataByName: (name) => (name === 'EARTH' ? MOCK_EARTH_BODY_DATA : null),
                earthRadiusKm: 6378,
                fallbackAltitudeKm: 500,
            });

            expect(result.runtimeState).toEqual(persisted);
        });
    });
});