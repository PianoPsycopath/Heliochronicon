import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '@core/storage.js';
import { logger } from '@core/logger.js';

describe('StorageManager Persistence Abstraction', () => {
    let mockBackend;

    beforeEach(() => {
        vi.spyOn(logger, 'warn').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});

        let store = {};
        mockBackend = {
            getItem: vi.fn((key) => store[key] || null),
            setItem: vi.fn((key, value) => {
                if (key === 'quota_fail') throw new Error('QuotaExceededError');
                store[key] = value.toString();
            })
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('safely parses and stringifies JSON automatically', () => {
        const storage = new StorageManager(mockBackend);
        
        storage.set('telemetry', { target: 'MARS', distance: 42 });
        expect(mockBackend.setItem).toHaveBeenCalledWith('telemetry', '{"target":"MARS","distance":42}');
        
        const retrieved = storage.get('telemetry');
        expect(retrieved.target).toBe('MARS');
    });

    it('falls back to memory if backend fails (e.g. Private Browsing)', () => {
        const storage = new StorageManager(mockBackend);
        
        storage.set('quota_fail', 'safe_data');
        const retrieved = storage.get('quota_fail');
        
        expect(retrieved).toBe('safe_data');
        expect(logger.warn).toHaveBeenCalled(); 
    });
});