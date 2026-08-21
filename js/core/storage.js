// js/storage.js
import { logger } from '@core/logger.js';

export class StorageManager {
    constructor(backend = null) {
        this.memoryFallback = {};
        this.backend = backend;

        // Use injected backend (for tests) or default to window.localStorage
        if (!this.backend && typeof window !== 'undefined') {
            try {
                const testKey = '__storage_test__';
                window.localStorage.setItem(testKey, testKey);
                window.localStorage.removeItem(testKey);
                this.backend = window.localStorage;
            } catch (_e) {
                logger.warn(
                    'localStorage unavailable (disabled or quota exceeded). Using memory fallback.'
                );
                this.backend = null;
            }
        }
    }

    set(key, value) {
        const stringValue = JSON.stringify(value);
        if (this.backend) {
            try {
                this.backend.setItem(key, stringValue);
                return;
            } catch (e) {
                logger.warn(`Storage set failed for "${key}". Falling back to memory.`, e);
            }
        }
        this.memoryFallback[key] = stringValue;
    }

    get(key, defaultValue = null) {
        let stringValue = null;

        if (this.backend) {
            try {
                stringValue = this.backend.getItem(key);
            } catch (_e) {
                logger.warn(`Storage get failed for "${key}".`);
            }
        }

        if (
            stringValue === null &&
            Object.prototype.hasOwnProperty.call(this.memoryFallback, key)
        ) {
            stringValue = this.memoryFallback[key];
        }

        if (stringValue === null) return defaultValue;

        try {
            return JSON.parse(stringValue);
        } catch (e) {
            logger.error(`Failed to parse JSON for "${key}". Returning default.`, e);
            return defaultValue;
        }
    }

    // NEW: Add a remove method to support resetDataSource()
    remove(key) {
        if (this.backend) {
            try {
                this.backend.removeItem(key);
                return;
            } catch (_e) {
                logger.warn(`Storage remove failed for "${key}".`);
            }
        }
        delete this.memoryFallback[key];
    }
}
