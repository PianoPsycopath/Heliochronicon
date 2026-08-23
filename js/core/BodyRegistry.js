// js/core/BodyRegistry.js
import {
    matchesDataset,
    matchesNameAndCategory,
    shouldPurgeInFullSweep,
    shouldPurgeInRescan,
} from '@core/bodyRegistryPredicates.js';

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

    promote(newBody, previous = null) {
        if (!newBody) {
            throw new Error('BodyRegistry.promote requires a body');
        }
        if (previous) {
            this.removeByNameAndCategory(previous.name, previous.category);
        }
        return this.registerBody(newBody);
    }

    disposeBody(body) {
        if (body.mesh) {
            this.scene.remove(body.mesh);
            if (body.mesh.geometry) body.mesh.geometry.dispose();
            // Shared tacticalMaterial is not disposed here.
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
        for (let i = this.celestialBodies.length - 1; i >= 0; i--) {
            const b = this.celestialBodies[i];
            if (matchesDataset(b.data, datasetName)) {
                if (b.data.datasetCategory === 'PROMOTED_ASTEROID' && b.data.isPinned) {
                    continue;
                }
                this.removeBody(b);
            }
        }

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

    // Radar contacts + unpinned promoted asteroids. Used when scanning is toggled off.
    purgeTacticalClones() {
        for (let i = this.celestialBodies.length - 1; i >= 0; i--) {
            const b = this.celestialBodies[i];
            if (shouldPurgeInFullSweep(b.data)) {
                this.removeBody(b);
            }
        }
    }

    // Same as purgeTacticalClones, but keeps the currently protected/targeted body.
    // Radar contacts are still always cleared.
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
    getByName(name) {
        return this.celestialBodies.find((b) => b.data.name === name) || null;
    }

    getByCategory(category) {
        return this.celestialBodies.filter((b) => b.data.datasetCategory === category);
    }

    getPromotedBody(name) {
        return (
            this.celestialBodies.find(
                (b) => b.data.name === name && b.data.datasetCategory === 'PROMOTED_ASTEROID'
            ) || null
        );
    }

    hasBody(name) {
        return this.celestialBodies.some((b) => b.data.name === name);
    }

    registerParticleSystem(system) {
        this.gpuParticleSystems.push(system);
        return system;
    }
}
