// js/PinnedStarManager.js

import * as THREE from 'three';

const STAR_FAR_PLANE_AU = 1e14; 

export class PinnedStarManager {
    constructor() {
        this.pinned = new Map(); // key -> { data, label }
        this._vec = new THREE.Vector3();
        this._farCamera = null;
    }

    static keyFor(data) {
        return (
            data.name || data.designation || data.proper ||
            data.hip || data.hd || data.hr || data.gl || data.id || ''
        ).toString();
    }

    isPinned(data) {
        return this.pinned.has(PinnedStarManager.keyFor(data));
    }

    pin(data) {
        const key = PinnedStarManager.keyFor(data);
        if (this.pinned.has(key)) return;

        data.isPinned = true;

        const label = document.createElement('div');
        label.className = 'tactical-label pinned-star-label';
        label.innerText = key;
        label.style.color = '#ffcc00';
        label.style.display = 'none';
        document.body.appendChild(label);

        this.pinned.set(key, { data, label });
    }

    unpin(data) {
        const key = PinnedStarManager.keyFor(data);
        const entry = this.pinned.get(key);
        if (!entry) return;

        data.isPinned = false;
        if (entry.label && entry.label.parentNode) entry.label.parentNode.removeChild(entry.label);
        this.pinned.delete(key);
    }

    toggle(data) {
        if (this.isPinned(data)) {
            this.unpin(data);
            return false;
        }
        this.pin(data);
        return true;
    }

    clearAll() {
        this.pinned.forEach(entry => {
            if (entry.label && entry.label.parentNode) entry.label.parentNode.removeChild(entry.label);
        });
        this.pinned.clear();
    }

    // Call once per frame. Mirrors the position math baked into the star
    // field vertex/picking shaders: globalPos = position + velocity * years.
    update(camera, currentOrigin, daysSinceJ2000) {
        if (this.pinned.size === 0) return;
        const years = daysSinceJ2000 / 365.25;

        // Keep a persistent clone in sync with the real camera's transform
        // and zoom, but with far pushed out -- same technique as
        // InteractionController's _pickingCamera.
        if (!this._farCamera) this._farCamera = camera.clone();
        this._farCamera.copy(camera);
        this._farCamera.far = STAR_FAR_PLANE_AU;
        this._farCamera.updateProjectionMatrix();

        this.pinned.forEach(({ data, label }) => {
            const wx = (data.engineX || 0) + (data.engineVx || 0) * years;
            const wy = (data.engineY || 0) + (data.engineVy || 0) * years;
            const wz = (data.engineZ || 0) + (data.engineVz || 0) * years;

            this._vec.set(wx, wy, wz).sub(currentOrigin);
            this._vec.project(this._farCamera);

            if (this._vec.z < 1) {
                label.style.display = 'block';
                label.style.left = `${(this._vec.x * 0.5 + 0.5) * window.innerWidth}px`;
                label.style.top = `${(this._vec.y * -0.5 + 0.5) * window.innerHeight}px`;
            } else {
                label.style.display = 'none';
            }
        });
    }
}