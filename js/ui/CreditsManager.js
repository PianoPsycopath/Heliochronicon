// js/CreditsManager.js

// Call update() only from discrete trigger points to preserve performance.
export class CreditsManager {
    constructor({ el, assetManifest = null, terrainController = null, starsCredit = null } = {}) {
        this.el = el;
        this.assetManifest = assetManifest;
        // Reuse TerrainController heightmap registry to prevent redundant network requests.
        this.terrainController = terrainController;
        this.starsCredit = starsCredit;
    }

    setAssetManifest(manifest) {
        this.assetManifest = manifest;
    }

    update({ currentTargetData = null, activeTerrainBodyNames = [], starsVisible = false } = {}) {
        if (!this.el) return;

        const parts = new Set();

        // Resolve the dataset group key directly using datasetName.
        const groupName = currentTargetData?.datasetName || null;
        const orbitalCredit = groupName ? this.assetManifest?.datasets?.[groupName]?.credit : null;
        if (orbitalCredit) parts.add(orbitalCredit);

        // Filter terrain credits to the targeted body and its parent.
        const relevantNames = new Set();
        if (currentTargetData) {
            relevantNames.add(currentTargetData.name);
            if (currentTargetData.parent && currentTargetData.parent !== currentTargetData.name) {
                relevantNames.add(currentTargetData.parent);
            }
        }
        const registry = this.terrainController?.registry;
        if (registry) {
            for (const name of activeTerrainBodyNames) {
                if (!relevantNames.has(name)) continue;
                const credit = registry[name]?.credit;
                if (credit) parts.add(credit);
            }
        }

        // Gate background star credit on zoom scale visibility.
        if (starsVisible && this.starsCredit) parts.add(this.starsCredit);

        this.el.textContent = [...parts].join(' \u00b7 ');
    }
}
