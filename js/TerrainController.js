// js/TerrainController.js
import * as THREE from 'three';
import { Shaders } from './Shaders.js';

export class TerrainController {
    constructor(ctx, manifestUrl = 'data/heightmaps/manifest.json') {
        this.ctx = ctx; // needs ctx.celestialBodies
        this.loader = new THREE.TextureLoader();
        this.cache = new Map();
        this.pending = new Set();
        this.registry = null;

        this.registryPromise = fetch(manifestUrl)
            .then((res) => (res.ok ? res.json() : {}))
            .then((json) => {
                this.registry = json;
            })
            .catch((err) => {
                console.warn(
                    'Terrain manifest missing or failed to load -- terrain stays off until public/data/heightmaps/manifest.json exists.',
                    err
                );
                this.registry = {};
            });
    }

    onMeshVisibilityChange(bodyObj, isVisible) {
        if (!isVisible) return;
        if (!this.registry) {
            this.registryPromise.then(() => this.onMeshVisibilityChange(bodyObj, isVisible));
            return;
        }
        const cfg = this.registry[bodyObj.data.name];
        if (!cfg) return;
        this.ensureLoaded(bodyObj, cfg);
    }

    ensureLoaded(bodyObj, cfg) {
        const name = bodyObj.data.name;
        const cached = this.cache.get(name);

        if (cached) {
            if (bodyObj.mesh.material !== cached.material) bodyObj.mesh.material = cached.material;
            return;
        }
        if (this.pending.has(name)) return;
        this.pending.add(name);

        this.loader.load(
            cfg.url,
            (texture) => {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;

                const material = Shaders.createTerrainContourMat(texture, cfg.elevMin, cfg.elevMax);
                this.cache.set(name, { texture, material });
                this.pending.delete(name);

                if (this.ctx.celestialBodies.includes(bodyObj)) {
                    bodyObj.mesh.material = material;
                }
            },
            undefined,
            (err) => {
                console.error(`Terrain load failed for ${name}:`, err);
                this.pending.delete(name);
            }
        );
    }

    dispose() {
        this.cache.forEach(({ texture, material }) => {
            texture.dispose();
            material.dispose();
        });
        this.cache.clear();
        this.pending.clear();
    }
}
