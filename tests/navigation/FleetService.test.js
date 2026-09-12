// tests/navigation/FleetService.test.js
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { FleetService } from '@navigation/FleetService.js';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import { DataRepository } from '@core/DataRepository.js';
import { StorageManager } from '@core/storage.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

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
});
