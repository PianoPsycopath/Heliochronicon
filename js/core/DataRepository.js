// js/core/DataRepository.js

import { logger } from '@core/logger.js';

export class DataRepository {
    static async fetchJSONDataset(url) {
        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status} at ${url}`);
            }

            return await response.json();
        } catch (error) {
            logger.error(`Failed to load dataset from ${url}:`, error);

            throw error instanceof Error ? error : new Error(`Failed to load dataset from ${url}`);
        }
    }
}
