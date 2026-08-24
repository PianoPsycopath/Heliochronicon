// js/main/AsteroidController.js

import { DataLoader } from '@core/DataLoader.js';
import { AsteroidLookup } from '@core/AsteroidLookup.js';
import { logger } from '@core/logger.js';

export class AsteroidController {
    constructor({
        appState,
        UI,
        asteroidPromotionService,
        bodyRegistry,
        interactionController,
        seasonMarkerController,
        storage,
        celestialBodies,
        gpuParticleSystems,
        updateCredits,
        getAssetManifest,
        auInKm,
    }) {
        this.appState = appState;
        this.UI = UI;
        this.asteroidPromotionService = asteroidPromotionService;
        this.bodyRegistry = bodyRegistry;
        this.interactionController = interactionController;
        this.seasonMarkerController = seasonMarkerController;
        this.storage = storage;
        this.celestialBodies = celestialBodies;
        this.gpuParticleSystems = gpuParticleSystems;
        this.updateCredits = updateCredits;
        this.getAssetManifest = getAssetManifest;
        this.auInKm = auInKm;
    }

    focus(data, isHardLock = true) {
        if (!data) {
            return;
        }

        if (data.datasetCategory === 'BACKGROUND_STAR') {
            this.UI.showStarSelection(data);
            return;
        }

        if (data.datasetCategory === 'ASTEROID' || data.datasetCategory === 'RADAR_CONTACT') {
            const promoted = this.asteroidPromotionService.promote(data);
            if (!promoted) {
                logger.warn(`Unable to promote asteroid "${data.name}" to CPU`);
                return;
            }
            data = promoted.data;
        }

        this.appState.currentTargetData = data;

        this.UI.updateTargetPanel(data);

        this.UI.renderBodyList(this.celestialBodies, data);

        this.updateCredits();

        this.seasonMarkerController.setTarget(data);

        this.appState.trackingTargetData = isHardLock ? data : null;

        this.interactionController.triggerFocus(data, isHardLock, this.auInKm);
    }

    async lookup(rawQuery) {
        if (this.appState.lookupInFlight) {
            return;
        }

        const query = rawQuery.trim();

        if (!query) {
            return;
        }

        const target = DataLoader.normalizeDesignation(query);

        const tracked = this.findTrackedAsteroid(target);

        if (tracked) {
            this.focus(tracked.data);
            return;
        }

        const gpuHit = this.findInGpuParticleSystems(target);

        if (gpuHit) {
            this.focus(gpuHit);
            return;
        }

        this.appState.lookupInFlight = true;

        this.UI.showLookupPending(query);

        try {
            const skipGroups = this.appState.getActiveDatasets();

            const found = await AsteroidLookup.findAsteroidInManifest(
                query,
                this.assetManifest,
                skipGroups,
                this.dataBasePath
            );

            if (found) {
                this.focus(found);
            } else {
                this.UI.showLookupNotFound(query);
            }
        } catch (error) {
            logger.error('Asteroid lookup failed due to network or parsing error:', error);

            this.UI.showLookupNotFound(`Network error querying ${query}`);
        } finally {
            this.appState.lookupInFlight = false;
        }
    }

    findTrackedAsteroid(target) {
        return this.celestialBodies.find(
            (body) => DataLoader.normalizeDesignation(body.data.name) === target
        );
    }

    findInGpuParticleSystems(target) {
        for (const system of this.gpuParticleSystems) {
            const source = system.userData && system.userData.sourceData;

            if (!source) {
                continue;
            }

            const hit = source.find(
                (data) => DataLoader.normalizeDesignation(data.name) === target
            );

            if (hit) {
                return hit;
            }
        }

        return null;
    }

    togglePin(data) {
        const body = this.asteroidPromotionService.findPromoted(data.name);

        if (!body) {
            return;
        }

        body.data.isPinned = !body.data.isPinned;

        this.UI.updateTargetPanel(body.data);

        let pinned = this.storage.get('pinnedAsteroids', []);

        if (body.data.isPinned) {
            if (!pinned.some((entry) => entry.name === body.data.name)) {
                pinned.push(body.data);
            }
        } else {
            pinned = pinned.filter((entry) => entry.name !== body.data.name);
        }

        this.storage.set('pinnedAsteroids', pinned);
    }

    purge(data) {
        this.asteroidPromotionService.purge(data.name);

        let pinned = this.storage.get('pinnedAsteroids', []);

        const originalLength = pinned.length;

        pinned = pinned.filter((entry) => entry.name !== data.name);

        if (pinned.length !== originalLength) {
            this.storage.set('pinnedAsteroids', pinned);
        }

        this.clearTarget();
    }

    findPromotedBody(name) {
        return this.bodyRegistry.getPromotedBody(name);
    }

    clearTarget() {
        this.appState.currentTargetData = null;
        this.appState.trackingTargetData = null;

        this.interactionController.clearTracking();

        this.UI.updateTargetPanel(null);

        this.UI.renderBodyList(this.celestialBodies, null);

        this.updateCredits();

        this.seasonMarkerController.setTarget(null);
    }
}
