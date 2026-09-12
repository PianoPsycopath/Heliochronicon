// tests/navigation/FleetRuntimeStore.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import { StorageManager } from '@core/storage.js';

describe('FleetRuntimeStore', () => {
    let mockBackend;
    let storage;

    beforeEach(() => {
        const store = {};
        mockBackend = {
            getItem: vi.fn((key) => (key in store ? store[key] : null)),
            setItem: vi.fn((key, value) => {
                store[key] = value.toString();
            }),
            removeItem: vi.fn((key) => {
                delete store[key];
            }),
        };
        storage = new StorageManager(mockBackend);
    });

    it('returns null when nothing has been saved for a fleet', () => {
        const runtimeStore = new FleetRuntimeStore(storage);
        expect(runtimeStore.load('user-fleet')).toBeNull();
    });

    it('round-trips a runtime overlay for a fleet id', () => {
        const runtimeStore = new FleetRuntimeStore(storage);
        const state = {
            fuelRemaining: 43000,
            position: { x: 6778, y: 0, z: 0 },
            velocity: { x: 0, y: 7.6, z: 0 },
            target: null,
            state: 'parked',
        };

        runtimeStore.save('user-fleet', state);
        expect(runtimeStore.load('user-fleet')).toEqual(state);
    });

    it('keys different fleets independently', () => {
        const runtimeStore = new FleetRuntimeStore(storage);

        runtimeStore.save('fleet-a', { state: 'parked' });
        runtimeStore.save('fleet-b', { state: 'inflight' });

        expect(runtimeStore.load('fleet-a')).toEqual({ state: 'parked' });
        expect(runtimeStore.load('fleet-b')).toEqual({ state: 'inflight' });
    });

    it('clear removes the persisted overlay', () => {
        const runtimeStore = new FleetRuntimeStore(storage);

        runtimeStore.save('user-fleet', { state: 'parked' });
        runtimeStore.clear('user-fleet');

        expect(runtimeStore.load('user-fleet')).toBeNull();
        expect(mockBackend.removeItem).toHaveBeenCalledWith(
            FleetRuntimeStore.keyFor('user-fleet')
        );
    });

    it('throws when fleetId is missing', () => {
        const runtimeStore = new FleetRuntimeStore(storage);
        expect(() => runtimeStore.load()).toThrow();
        expect(() => runtimeStore.save(undefined, {})).toThrow();
    });
});
