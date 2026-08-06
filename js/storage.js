// js/storage.js
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
            } catch (e) {
                console.warn("localStorage unavailable (disabled or quota exceeded). Using memory fallback.");
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
                console.warn(`Storage set failed for "${key}". Falling back to memory.`, e);
            }
        }
        this.memoryFallback[key] = stringValue;
    }

    get(key, defaultValue = null) {
        let stringValue = null;
        
        if (this.backend) {
            try {
                stringValue = this.backend.getItem(key);
            } catch (e) {
                console.warn(`Storage get failed for "${key}".`);
            }
        }

        if (stringValue === null && this.memoryFallback.hasOwnProperty(key)) {
            stringValue = this.memoryFallback[key];
        }

        if (stringValue === null) return defaultValue;

        try {
            return JSON.parse(stringValue);
        } catch (e) {
            console.error(`Failed to parse JSON for "${key}". Returning default.`, e);
            return defaultValue;
        }
    }
}