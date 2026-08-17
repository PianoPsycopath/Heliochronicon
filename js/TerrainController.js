// js/TerrainController.js
import * as THREE from 'three';
import { Shaders } from './Shaders.js';
import { logger } from './logger.js';

export class TerrainController {
    constructor(ctx, manifestUrl = 'data/heightmaps/manifest.json') {
        this.ctx = ctx; // needs ctx.celestialBodies
        this.loader = new THREE.TextureLoader();
        this.cache = new Map();
        this.pending = new Set();
        this.registry = null;

        // Names of bodies currently textured with a heightmap (planet, and a
        // moon too if both are concurrently visible). Populated/cleared from
        // the SAME per-frame visibility hook RenderPipeline already calls
        // (`onMeshVisibilityChange`) -- no extra wiring needed elsewhere.
        this.activeBodyNames = new Set();
        this.onActiveBodiesChanged = null;

        this.registryPromise = fetch(manifestUrl)
            .then((res) => (res.ok ? res.json() : {}))
            .then((json) => {
                this.registry = json;
            })
            .catch((err) => {
                logger.warn(
                    'Terrain manifest missing or failed to load -- terrain stays off until public/data/heightmaps/manifest.json exists.',
                    err
                );
                this.registry = {};
            });
    }

    onMeshVisibilityChange(bodyObj, isVisible) {
        const name = bodyObj.data.name;

        if (!isVisible) {
            if (this.activeBodyNames.delete(name)) this._notifyActiveBodiesChanged();
            return;
        }
        if (!this.registry) {
            this.registryPromise.then(() => this.onMeshVisibilityChange(bodyObj, isVisible));
            return;
        }
        const cfg = this.registry[name];
        if (!cfg) return;
        this.ensureLoaded(bodyObj, cfg);

        if (!this.activeBodyNames.has(name)) {
            this.activeBodyNames.add(name);
            this._notifyActiveBodiesChanged();
        }
    }

    _notifyActiveBodiesChanged() {
        if (this.onActiveBodiesChanged) this.onActiveBodiesChanged([...this.activeBodyNames]);
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

                // Guard: Was this body purged from the scene during the async texture load?
                if (this.ctx.celestialBodies.includes(bodyObj) && bodyObj.mesh) {
                    this.cache.set(name, { texture, material });
                    bodyObj.mesh.material = material;
                } else {
                    // The body was deleted. Dump the GPU resources.
                    texture.dispose();
                    material.dispose();
                }
                this.pending.delete(name);
            },
            undefined,
            (err) => {
                logger.error(`Terrain load failed for ${name}:`, err);
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

        if (this.activeBodyNames.size > 0) {
            this.activeBodyNames.clear();
            this._notifyActiveBodiesChanged();
        }
    }
}
