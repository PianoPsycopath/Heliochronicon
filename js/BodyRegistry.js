// js/BodyRegistry.js
//
// Owns the full lifecycle of a CelestialBody's scene-graph/GPU/DOM footprint:
// registration, targeted removal, and dispose. This is the single place body
// add/remove bookkeeping happens; callers (SystemBuilder, TacticalScanner,
// main.js) construct the THREE objects and hand them off here rather than
// duplicating scene.remove()/dispose()/splice() sequences at each call site.
import {
    matchesDataset,
    matchesNameAndCategory,
    shouldPurgeInFullSweep,
    shouldPurgeInRescan,
} from './bodyRegistryPredicates.js';

export class BodyRegistry {
    constructor(ctx) {
        this.scene = ctx.scene;
        this.celestialBodies = ctx.celestialBodies;
        this.pickableObjects = ctx.pickableObjects;
        this.gpuParticleSystems = ctx.gpuParticleSystems;
        this.daylightController = ctx.daylightController;
        this.eclipseShadowController = ctx.eclipseShadowController;
    }

    registerBody(body) {
        this.celestialBodies.push(body);
        if (body.mesh) this.pickableObjects.push(body.mesh);
        if (body.sprite) this.pickableObjects.push(body.sprite);
        return body;
    }

    // Atomically swap out a previous body (matched by name + datasetCategory,
    // if given) for a newly-constructed one. Used for promotion paths (radar
    // contact -> promoted asteroid, asteroid -> radar contact) where the old
    // entry must be fully disposed before the new one is registered.
    promote(newBody, previous = null) {
        if (previous) {
            this.removeByNameAndCategory(previous.name, previous.category);
        }
        return this.registerBody(newBody);
    }

    disposeBody(body) {
        if (body.mesh) {
            this.scene.remove(body.mesh);
            if (body.mesh.geometry) body.mesh.geometry.dispose();
            // Note: Not disposing body.mesh.material as it uses the shared tacticalMaterial
        }
        if (body.sprite) {
            this.scene.remove(body.sprite);
            if (body.sprite.material) body.sprite.material.dispose();
        }
        if (body.orbitLine) {
            this.scene.remove(body.orbitLine);
            if (body.orbitLine.geometry) body.orbitLine.geometry.dispose();
            if (body.orbitLine.material) body.orbitLine.material.dispose();
        }
        if (body.orbitCurtain) {
            this.scene.remove(body.orbitCurtain);
            if (body.orbitCurtain.geometry) body.orbitCurtain.geometry.dispose();
            if (body.orbitCurtain.material) body.orbitCurtain.material.dispose();
        }
        if (body.label && body.label.parentNode) {
            body.label.parentNode.removeChild(body.label);
        }

        if (this.daylightController) this.daylightController.removeBody(body.data.name);
        if (this.eclipseShadowController) this.eclipseShadowController.removeBody(body.data.name);

        const meshIdx = this.pickableObjects.indexOf(body.mesh);
        if (meshIdx > -1) this.pickableObjects.splice(meshIdx, 1);

        const spriteIdx = this.pickableObjects.indexOf(body.sprite);
        if (spriteIdx > -1) this.pickableObjects.splice(spriteIdx, 1);
    }

    removeBody(body) {
        this.disposeBody(body);
        const idx = this.celestialBodies.indexOf(body);
        if (idx > -1) this.celestialBodies.splice(idx, 1);
    }

    removeByNameAndCategory(name, category) {
        const idx = this.celestialBodies.findIndex((x) =>
            matchesNameAndCategory(x.data, name, category)
        );
        if (idx !== -1) {
            this.removeBody(this.celestialBodies[idx]);
        }
    }

    removeByDataset(datasetName) {
        // 1. Purge Standard Bodies
        for (let i = this.celestialBodies.length - 1; i >= 0; i--) {
            const b = this.celestialBodies[i];
            if (matchesDataset(b.data, datasetName)) {
                this.removeBody(b);
            }
        }

        // 2. Handle GPU particle systems
        for (let i = this.gpuParticleSystems.length - 1; i >= 0; i--) {
            const sys = this.gpuParticleSystems[i];
            if (sys.userData && sys.userData.datasetName === datasetName) {
                this.scene.remove(sys);
                if (sys.geometry) sys.geometry.dispose();
                if (sys.material) sys.material.dispose();

                if (sys.userData.groupLabel) {
                    this.scene.remove(sys.userData.groupLabel);
                    if (sys.userData.groupLabel.material.map)
                        sys.userData.groupLabel.material.map.dispose();
                    sys.userData.groupLabel.material.dispose();
                    sys.userData.groupLabel.geometry.dispose();
                }
                this.gpuParticleSystems.splice(i, 1);
            }
        }
    }

    // Full sweep: every radar contact and every unpinned promoted-asteroid
    // clone, unconditionally. Used when tactical scanning is toggled off.
    purgeTacticalClones() {
        for (let i = this.celestialBodies.length - 1; i >= 0; i--) {
            const b = this.celestialBodies[i];
            if (shouldPurgeInFullSweep(b.data)) {
                this.removeBody(b);
            }
        }
    }

    // Rescan sweep: same as above, but spares an unpinned clone if it's the
    // currently protected/targeted body (radar contacts are still always
    // cleared -- a fresh one gets re-added by the scan if still in range).
    sweepForRescan(protectedTargetData = null) {
        for (let i = this.celestialBodies.length - 1; i >= 0; i--) {
            const b = this.celestialBodies[i];
            if (shouldPurgeInRescan(b.data, protectedTargetData)) {
                this.removeBody(b);
            }
        }
    }

    clearAll() {
        for (let i = this.celestialBodies.length - 1; i >= 0; i--) {
            this.removeBody(this.celestialBodies[i]);
        }

        for (let i = this.gpuParticleSystems.length - 1; i >= 0; i--) {
            const sys = this.gpuParticleSystems[i];
            this.scene.remove(sys);
            if (sys.geometry) sys.geometry.dispose();
            if (sys.material) sys.material.dispose();

            if (sys.userData.groupLabel) {
                this.scene.remove(sys.userData.groupLabel);
                if (sys.userData.groupLabel.material.map)
                    sys.userData.groupLabel.material.map.dispose();
                sys.userData.groupLabel.material.dispose();
                sys.userData.groupLabel.geometry.dispose();
            }
            this.gpuParticleSystems.splice(i, 1);
        }
    }
}
