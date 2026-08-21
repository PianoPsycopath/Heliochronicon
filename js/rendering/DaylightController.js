// js/DaylightController.js

import * as THREE from 'three';
import { Shaders } from '@rendering/Shaders.js';

const OVERLAY_GEOMETRY = new THREE.SphereGeometry(1, 32, 32);
const OVERLAY_SCALE_PAD = 1.004; // pushes the shell just outside the planet mesh/terrain to avoid z-fighting

export class DaylightController {
    constructor(ctx) {
        this.ctx = ctx; // needs ctx.scene, ctx.celestialBodies
        this.overlays = new Map(); // body name -> { mesh, material }
        this.enabled = true;
    }

    // Walks parent -> parent -> ... until it hits a body that is its own
    // parent (the star convention used throughout this codebase), so
    // moons correctly resolve the sun through their host planet.
    _findStarRenderPos(bodyObj) {
        const bodies = this.ctx.celestialBodies;
        let current = bodyObj.data;
        const visited = new Set();
        while (current && !visited.has(current.name)) {
            visited.add(current.name);
            if (current.parent === current.name) {
                const starBody = bodies.find((b) => b.data.name === current.name);
                return starBody ? starBody.renderPos : null;
            }
            const parentBody = bodies.find((b) => b.data.name === current.parent);
            if (!parentBody) return null;
            current = parentBody.data;
        }
        return null;
    }

    _ensureOverlay(bodyObj) {
        const name = bodyObj.data.name;
        let entry = this.overlays.get(name);
        if (!entry) {
            const material = Shaders.createNightShadeMat();
            const mesh = new THREE.Mesh(OVERLAY_GEOMETRY, material);
            mesh.frustumCulled = false;
            mesh.renderOrder = (bodyObj.mesh.renderOrder || 0) + 1;
            entry = { mesh, material };
            this.overlays.set(name, entry);
            this.ctx.scene.add(mesh);
        }
        return entry;
    }

    // Mirrors TerrainController's onMeshVisibilityChange signature/usage so
    // it can be dropped into the same RenderPipeline call site.
    onMeshVisibilityChange(bodyObj, isVisible) {
        if (bodyObj.data.parent === bodyObj.data.name) return; // never shade the star itself

        if (!this.enabled || !isVisible) {
            const entry = this.overlays.get(bodyObj.data.name);
            if (entry) entry.mesh.visible = false;
            return;
        }
        this._ensureOverlay(bodyObj).mesh.visible = true;
    }

    // Called once per visible body per frame, right where RenderPipeline
    // already has renderPos/physicalRadius freshly computed for it.
    updateForBody(bodyObj) {
        if (!this.enabled) return;

        const entry = this.overlays.get(bodyObj.data.name);
        if (!entry || !entry.mesh.visible) return;

        const sunPos = this._findStarRenderPos(bodyObj);
        if (!sunPos) {
            entry.mesh.visible = false;
            return;
        }

        entry.mesh.position.copy(bodyObj.renderPos);
        entry.mesh.scale.setScalar((bodyObj.physicalRadius || 1) * OVERLAY_SCALE_PAD);

        entry.material.uniforms.uPlanetCenter.value.copy(bodyObj.renderPos);
        entry.material.uniforms.uSunDir.value.copy(sunPos).sub(bodyObj.renderPos).normalize();
    }

    removeBody(name) {
        const entry = this.overlays.get(name);
        if (!entry) return;
        this.ctx.scene.remove(entry.mesh);
        entry.material.dispose();
        this.overlays.delete(name);
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.overlays.forEach(({ mesh }) => {
                mesh.visible = false;
            });
        }
        // When re-enabled, overlays repopulate naturally on the next frame
        // via RenderPipeline's per-body onMeshVisibilityChange/updateForBody calls.
    }

    dispose() {
        this.overlays.forEach(({ mesh, material }) => {
            this.ctx.scene.remove(mesh);
            material.dispose();
        });
        this.overlays.clear();
    }
}
