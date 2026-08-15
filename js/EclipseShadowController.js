import * as THREE from 'three';
import { Shaders } from './Shaders.js';
import { EclipseEngine } from './EclipseEngine.js';
import { MAX_SHADOWS } from './constants.js';

const OVERLAY_GEOMETRY = new THREE.SphereGeometry(1, 32, 32);
const OVERLAY_SCALE_PAD = 1.006;

export class EclipseShadowController {
    constructor(ctx) {
        this.ctx = ctx;
        this.overlays = new Map();
    }

    _findStarBody(bodyObj) {
        const bodies = this.ctx.celestialBodies;
        let current = bodyObj.data;
        const visited = new Set();
        while (current && !visited.has(current.name)) {
            visited.add(current.name);
            if (current.parent === current.name)
                return bodies.find((b) => b.data.name === current.name) || null;
            current = bodies.find((b) => b.data.name === current.parent)?.data;
        }
        return null;
    }

    _candidates(bodyObj) {
        const systemName = bodyObj.isMoon ? bodyObj.data.parent : bodyObj.data.name;
        return this.ctx.celestialBodies.filter(
            (b) =>
                b !== bodyObj &&
                b.data.parent !== b.data.name &&
                (b.data.name === systemName || b.data.parent === systemName)
        );
    }

    _ensureOverlay(bodyObj) {
        let entry = this.overlays.get(bodyObj.data.name);
        if (!entry) {
            const material = Shaders.createEclipseShadowMat(MAX_SHADOWS);
            const mesh = new THREE.Mesh(OVERLAY_GEOMETRY, material);
            mesh.frustumCulled = false;
            mesh.renderOrder = (bodyObj.mesh.renderOrder || 0) + 2;
            entry = { mesh, material };
            this.overlays.set(bodyObj.data.name, entry);
            this.ctx.scene.add(mesh);
        }
        return entry;
    }

    onMeshVisibilityChange(bodyObj, isVisible) {
        if (bodyObj.data.parent === bodyObj.data.name) return;
        if (!isVisible) {
            const e = this.overlays.get(bodyObj.data.name);
            if (e) e.mesh.visible = false;
            return;
        }
    }

    updateForBody(bodyObj) {
        const starBody = this._findStarBody(bodyObj);
        if (!starBody) return;

        const validCandidates = [];

        for (const occ of this._candidates(bodyObj)) {
            if (!occ.renderPos || !bodyObj.renderPos || !starBody.renderPos) continue;

            const result = EclipseEngine._shadowTest(
                bodyObj.renderPos,
                occ.renderPos,
                occ.physicalRadius,
                starBody.renderPos,
                starBody.physicalRadius
            );

            if (result && result.perpDist < result.rPenumbra + bodyObj.physicalRadius) {
                const margin = result.rPenumbra + bodyObj.physicalRadius - result.perpDist;
                validCandidates.push({ occ, margin });
            }
        }

        const entry = this._ensureOverlay(bodyObj);

        if (validCandidates.length === 0) {
            entry.mesh.visible = false;
            return;
        }

        // Sort by how deep the shadow cuts into the planet, take the top MAX_SHADOWS
        validCandidates.sort((a, b) => b.margin - a.margin);
        const activeCount = Math.min(validCandidates.length, MAX_SHADOWS);

        entry.mesh.visible = true;
        entry.mesh.position.copy(bodyObj.renderPos);
        entry.mesh.scale.setScalar(bodyObj.physicalRadius * OVERLAY_SCALE_PAD);

        entry.material.uniforms.uStarPos.value.copy(starBody.renderPos);
        entry.material.uniforms.uStarRadius.value = starBody.physicalRadius;
        entry.material.uniforms.uPlanetCenter.value.copy(bodyObj.renderPos);

        // Populate the Multi-Shadow Arrays
        for (let i = 0; i < activeCount; i++) {
            entry.material.uniforms.uOccPositions.value[i].copy(validCandidates[i].occ.renderPos);
            entry.material.uniforms.uOccRadii.value[i] = validCandidates[i].occ.physicalRadius;
        }

        // Tell the shader exactly how many array indices to process
        entry.material.uniforms.uShadowCount.value = activeCount;
    }

    removeBody(name) {
        const e = this.overlays.get(name);
        if (!e) return;
        this.ctx.scene.remove(e.mesh);
        e.material.dispose();
        this.overlays.delete(name);
    }
    dispose() {
        this.overlays.forEach(({ mesh, material }) => {
            this.ctx.scene.remove(mesh);
            material.dispose();
        });
        this.overlays.clear();
    }
}
