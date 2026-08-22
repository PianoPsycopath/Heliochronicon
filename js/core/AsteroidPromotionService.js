// js/core/AsteroidPromotionService.js

import { logger } from '@core/logger.js';

const PROMOTABLE_CATEGORIES = new Set(['ASTEROID', 'RADAR_CONTACT']);

const PROMOTED_CATEGORY = 'PROMOTED_ASTEROID';

export class AsteroidPromotionService {
    constructor({ bodyRegistry, systemBuilder, celestialBodies }) {
        this.bodyRegistry = bodyRegistry;
        this.systemBuilder = systemBuilder;
        this.celestialBodies = celestialBodies;
    }

    /**
     * GPU dataset record / radar contact
     *             ↓
     *      promoted CPU body
     *
     * Policy lives here.
     * THREE construction remains in SystemBuilder.
     */
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

    /**
     * Only GPU asteroid records and radar contacts may cross
     * the promotion boundary.
     */
    canPromote(data) {
        return PROMOTABLE_CATEGORIES.has(data?.datasetCategory);
    }

    /**
     * Returns the CPU representation if it already exists.
     */
    findPromoted(name) {
        return (
            this.celestialBodies.find(
                (body) => body.data.name === name && body.data.datasetCategory === PROMOTED_CATEGORY
            ) || null
        );
    }

    /**
     * Remove a promoted CPU representation.
     *
     * The registry remains responsible for actual lifecycle/disposal.
     */
    purge(name) {
        const promoted = this.findPromoted(name);

        if (!promoted) {
            return false;
        }

        this.bodyRegistry.removeBody(promoted);
        return true;
    }

    /**
     * Remove all temporary promoted bodies while preserving
     * pinned bodies according to registry policy.
     */
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

    /**
     * Rescan policy:
     * remove stale radar contacts and unprotected promoted bodies.
     */
    sweepForRescan(protectedTargetData = null) {
        this.bodyRegistry.sweepForRescan(protectedTargetData);
    }

    isPromoted(name) {
        return !!this.findPromoted(name);
    }
}
