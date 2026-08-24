// js/core/AsteroidPromotionService.js

import { logger } from '@core/logger.js';

const PROMOTABLE_CATEGORIES = new Set(['ASTEROID', 'RADAR_CONTACT']);

export class AsteroidPromotionService {
    constructor({ bodyRegistry, systemBuilder }) {
        this.bodyRegistry = bodyRegistry;
        this.systemBuilder = systemBuilder;
    }

    promote(data) {
        if (!data || !this.canPromote(data)) {
            return null;
        }

        const existing = this.findPromoted(data.name);

        if (existing) {
            return existing;
        }

        const body = this.systemBuilder.createPromotedAsteroidBody(data);

        if (!body) {
            logger.warn(`Unable to construct promoted asteroid "${data.name}"`);
            return null;
        }

        return this.bodyRegistry.promote(body, {
            name: data.name,
            category: data.datasetCategory,
        });
    }

    canPromote(data) {
        return PROMOTABLE_CATEGORIES.has(data?.datasetCategory);
    }

    findPromoted(name) {
        return this.bodyRegistry.getPromotedBody(name);
    }

    purge(name) {
        const promoted = this.findPromoted(name);

        if (!promoted) {
            return false;
        }

        this.bodyRegistry.removeBody(promoted);
        return true;
    }

    purgeUnpinned() {
        this.bodyRegistry.purgeTacticalClones();
    }
    restorePinned(data) {
        if (!data || !data.name) {
            return null;
        }

        const existing = this.findPromoted(data.name);

        if (existing) {
            existing.data.isPinned = true;
            return existing;
        }

        const restoredData = {
            ...data,
            datasetCategory: 'PROMOTED_ASTEROID',
            isPinned: true,
        };

        const body = this.systemBuilder.createPromotedAsteroidBody(restoredData);

        if (!body) {
            logger.warn(`Unable to restore pinned asteroid "${data.name}"`);
            return null;
        }

        return this.bodyRegistry.registerBody(body);
    }

    sweepForRescan(protectedTargetData = null) {
        this.bodyRegistry.sweepForRescan(protectedTargetData);
    }

    isPromoted(name) {
        return !!this.findPromoted(name);
    }
}
