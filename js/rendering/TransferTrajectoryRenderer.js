// js/rendering/TransferTrajectoryRenderer.js
//
// PLAN_PORKCHOP.md Phase 6b: given an immutable MissionSolution, build one
// reusable 3D transfer arc + simple burn markers. This module performs no
// astrodynamics — it only turns already-computed trajectorySamples/burns
// into geometry, following the BufferGeometry-from-points + progress
// attribute pattern established in js/core/OrbitFactory.js.
//
// Phase 9 adds: exposing the burn markers object + underlying Burn data for
// picking, and a single reusable highlight marker for whichever burn is
// currently selected in the Sensorium panel. No new per-burn objects are
// created — the highlight marker is created once and repositioned.
//
// Positions are consumed as-is, in the same AU heliocentric frame as
// trajectorySamples/burns. This renderer does not apply the floating
// origin itself: like other absolute-frame scene objects, the caller
// (Phase 6d composition wiring / the render loop) is responsible for
// setting getObject3D().position to the current -floatingOrigin each
// frame, mirroring CelestialBody.renderPos.
import * as THREE from 'three';

const TRAJECTORY_COLOR = 0x00ffaa;
const TRAJECTORY_OPACITY = 0.9;
const BURN_MARKER_COLOR = 0xffaa00;
const BURN_MARKER_SIZE = 0.02;
const HIGHLIGHT_MARKER_COLOR = 0xffffff;
const HIGHLIGHT_MARKER_SIZE = 0.035;

function toVector3(v) {
    return new THREE.Vector3(v.x, v.y, v.z);
}

export class TransferTrajectoryRenderer {
    constructor() {
        this.group = new THREE.Group();
        this.line = null;
        this.burnMarkers = null;
        this.burns = [];
        this.highlightMarker = null;
        this.highlightedBurnIndex = null;
    }

    getObject3D() {
        return this.group;
    }

    getBurnMarkerObject3D() {
        return this.burnMarkers;
    }

    getBurnAt(index) {
        return this.burns[index] ?? null;
    }

    setSolution(solution) {
        this.clear();

        if (!solution) {
            return;
        }

        const points = solution.trajectorySamples.map((sample) =>
            toVector3(sample.position ?? sample)
        );

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        TransferTrajectoryRenderer.attachProgressAttribute(geometry);

        const material = new THREE.LineBasicMaterial({
            color: TRAJECTORY_COLOR,
            transparent: true,
            opacity: TRAJECTORY_OPACITY,
        });

        this.line = new THREE.Line(geometry, material);
        this.line.renderOrder = 2;
        this.group.add(this.line);

        this.burns = solution.burns;

        if (solution.burns.length > 0) {
            const burnPoints = solution.burns.map((burn) => toVector3(burn.position));
            const burnGeometry = new THREE.BufferGeometry().setFromPoints(burnPoints);
            const burnMaterial = new THREE.PointsMaterial({
                color: BURN_MARKER_COLOR,
                size: BURN_MARKER_SIZE,
                sizeAttenuation: true,
            });

            this.burnMarkers = new THREE.Points(burnGeometry, burnMaterial);
            this.burnMarkers.renderOrder = 3;
            this.group.add(this.burnMarkers);
        }
    }

    // Phase 9: highlights the burn at `index` (from getBurnAt) by repositioning
    // a single reusable marker rather than creating a new object per selection.
    setHighlightedBurnIndex(index) {
        const burn = this.getBurnAt(index);
        if (!burn) {
            this.clearHighlightedBurn();
            return;
        }

        this.highlightedBurnIndex = index;

        if (!this.highlightMarker) {
            const geometry = new THREE.BufferGeometry().setFromPoints([toVector3(burn.position)]);
            const material = new THREE.PointsMaterial({
                color: HIGHLIGHT_MARKER_COLOR,
                size: HIGHLIGHT_MARKER_SIZE,
                sizeAttenuation: true,
            });
            this.highlightMarker = new THREE.Points(geometry, material);
            this.highlightMarker.renderOrder = 4;
            this.group.add(this.highlightMarker);
        } else {
            const position = this.highlightMarker.geometry.attributes.position;
            position.setXYZ(0, burn.position.x, burn.position.y, burn.position.z);
            position.needsUpdate = true;
        }
    }

    clearHighlightedBurn() {
        this.highlightedBurnIndex = null;
        if (this.highlightMarker) {
            this.group.remove(this.highlightMarker);
            this.highlightMarker.geometry.dispose();
            this.highlightMarker.material.dispose();
            this.highlightMarker = null;
        }
    }

    clear() {
        if (this.line) {
            this.group.remove(this.line);
            this.line.geometry.dispose();
            this.line.material.dispose();
            this.line = null;
        }

        if (this.burnMarkers) {
            this.group.remove(this.burnMarkers);
            this.burnMarkers.geometry.dispose();
            this.burnMarkers.material.dispose();
            this.burnMarkers = null;
        }

        this.burns = [];
        this.clearHighlightedBurn();
    }

    dispose() {
        this.clear();
    }

    static attachProgressAttribute(geometry) {
        const count = geometry.attributes.position.count;
        const progress = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            progress[i] = count > 1 ? i / (count - 1) : 0;
        }
        geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
    }
}