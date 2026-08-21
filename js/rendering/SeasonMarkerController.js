// js/SeasonMarkerController.js
import * as THREE from 'three';
import { SeasonMarkerEngine } from '@physics/SeasonMarkerEngine.js';

const MARKER_SPRITE_SIZE = 3;
const RECOMPUTE_FRAME_INTERVAL = 30; // throttle full orbit re-sampling
const HOVER_PICK_RADIUS_PX = 22;

const ELEMENT_COLORS = {
    FIRE: '#ff4444',
    WATER: '#44aaff',
    AIR: '#ffdd44',
    EARTH: '#44ff44',
    PERI: '#ffffff',
    APO: '#aaaaaa',
    PERI_HOT: '#ff4444', // Thermal max
    APO_COLD: '#44aaff', // Thermal min
};

function createTextSpriteMat(symbol, symbolKey) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = ELEMENT_COLORS[symbolKey] || '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Keep glyph readable against dark space background.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 6;

    ctx.fillText(symbol, 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
    });
}

export class SeasonMarkerController {
    constructor(ctx) {
        this.scene = ctx.scene;
        this.celestialBodies = ctx.celestialBodies;
        this.camera = ctx.camera;
        this.tooltipManager = ctx.tooltipManager;

        this.seasonBody = null;
        this.markers = [];
        this.sprites = [];

        this._forceRecompute = false;
        this._frameCounter = 0;

        this._hoveredIndex = -1;
        this._lastClientX = 0;
        this._lastClientY = 0;

        this._onPointerMove = (event) => this._handlePointerMove(event);
        window.addEventListener('pointermove', this._onPointerMove);
    }

    // Pass null to clear. targetBodyData matches UI.onFocusBody shape.
    setTarget(targetBodyData) {
        if (!targetBodyData) {
            this._clearTarget();
            return;
        }

        const targetBody = this.celestialBodies.find((b) => b.data.name === targetBodyData.name);
        const seasonBody = SeasonMarkerEngine.resolveSeasonBody(targetBody, this.celestialBodies);

        if (!seasonBody) {
            this._clearTarget();
            return;
        }

        if (this.seasonBody !== seasonBody) {
            this.seasonBody = seasonBody;
            // Mirror RenderPipeline orbit-line placement so marker.position
            // is valid in world space (parent offset + Kepler moon pole quat).
            this.parentBody =
                this.celestialBodies.find((b) => b.data.name === seasonBody.data.parent) || null;
            this.usesParentPoleRotation =
                seasonBody.isMoon &&
                (!seasonBody.data.orbit_model || seasonBody.data.orbit_model === 'KEPLER');
            this._forceRecompute = true;
            this._hideTooltip();
        }
    }

    _clearTarget() {
        this.seasonBody = null;
        this.parentBody = null;
        this.usesParentPoleRotation = false;
        this.markers = [];
        this._hideAllSprites();
        this._hideTooltip();
    }

    // Call after PhysicsEngine has updated globalPos for this frame.
    update(systemDate, daysSinceJ2000, currentOrigin) {
        if (!this.seasonBody) {
            this._hideAllSprites();
            return;
        }

        this._frameCounter++;
        if (this._forceRecompute || this._frameCounter >= RECOMPUTE_FRAME_INTERVAL) {
            this._forceRecompute = false;
            this._frameCounter = 0;
            this.markers = SeasonMarkerEngine.computeMarkers(
                this.seasonBody.data,
                daysSinceJ2000,
                systemDate
            );
            this._syncSprites();
        } else if (this.markers.length) {
            for (const marker of this.markers) {
                marker.countdownText = SeasonMarkerEngine.formatCountdown(marker.date, systemDate);
            }
        }

        if (!this.markers.length) {
            this._hideAllSprites();
            this._hideTooltip();
            return;
        }

        const parentRenderPos =
            (this.parentBody && this.parentBody.renderPos) ||
            new THREE.Vector3().copy(currentOrigin).negate();
        const parentPoleQuat = this.parentBody && this.parentBody.poleQuaternion;
        const zoom = this.camera.zoom || 1;
        const scale = MARKER_SPRITE_SIZE / zoom;
        const localVec = new THREE.Vector3();

        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];
            const marker = this.markers[i];
            if (!marker) {
                sprite.visible = false;
                continue;
            }
            sprite.visible = true;
            localVec.set(marker.position.x, marker.position.y, marker.position.z);
            if (this.usesParentPoleRotation && parentPoleQuat) {
                localVec.applyQuaternion(parentPoleQuat);
            }
            sprite.position.copy(localVec).add(parentRenderPos);
            sprite.scale.set(scale, scale, 1);
            sprite.updateMatrix();
            sprite.updateMatrixWorld();
        }

        this._updateTooltip();
    }

    // Full rebuild is cheaper than diffing at this cadence (≤4 sprites).
    _syncSprites() {
        for (const sprite of this.sprites) {
            this.scene.remove(sprite);
            if (sprite.material) {
                if (sprite.material.map) sprite.material.map.dispose();
                sprite.material.dispose();
            }
        }
        this.sprites = [];

        for (const marker of this.markers) {
            const mat = createTextSpriteMat(marker.symbol, marker.symbolKey);
            const sprite = new THREE.Sprite(mat);
            sprite.renderOrder = 950;
            sprite.matrixAutoUpdate = false;
            sprite.visible = false;
            this.scene.add(sprite);
            this.sprites.push(sprite);
        }

        if (this._hoveredIndex >= this.sprites.length) {
            this._hoveredIndex = -1;
        }
    }

    _hideAllSprites() {
        for (const sprite of this.sprites) sprite.visible = false;
    }

    _hideTooltip() {
        this._hoveredIndex = -1;
        if (this.tooltipManager) this.tooltipManager.hide(this);
    }

    _handlePointerMove(event) {
        if (event.pointerType === 'touch') return;
        if (
            event.target.closest &&
            (event.target.closest('.panel') || event.target.closest('button'))
        ) {
            this._hideTooltip();
            return;
        }

        this._lastClientX = event.clientX;
        this._lastClientY = event.clientY;

        if (!this.sprites.length) {
            this._hideTooltip();
            return;
        }

        let closestIndex = -1;
        let closestDist = HOVER_PICK_RADIUS_PX;
        const projected = new THREE.Vector3();

        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];
            if (!sprite.visible) continue;

            projected.copy(sprite.position).project(this.camera);
            if (projected.z > 1) continue; // behind camera

            const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
            const dist = Math.hypot(event.clientX - screenX, event.clientY - screenY);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }

        this._hoveredIndex = closestIndex;
        if (closestIndex === -1 && this.tooltipManager) this.tooltipManager.hide(this);
    }

    // Keep countdown ticking while pointer is still.
    _updateTooltip() {
        if (!this.tooltipManager) return;

        if (this._hoveredIndex === -1 || !this.markers[this._hoveredIndex]) {
            this.tooltipManager.hide(this);
            return;
        }

        const marker = this.markers[this._hoveredIndex];
        const bodyName = (this.seasonBody?.data?.name || '').toString();
        const dateStr = `${marker.date.toISOString().replace('T', ' ').substring(0, 19)} UTC`;

        const html = `
            <div class="hc-tooltip-title">${bodyName} &ndash; ${marker.label}</div>
            <div>${dateStr}</div>
            <div class="hc-tooltip-sub">${marker.countdownText}</div>
        `;
        this.tooltipManager.show(this, { html }, this._lastClientX, this._lastClientY, 'marker');
    }

    dispose() {
        window.removeEventListener('pointermove', this._onPointerMove);
        this._clearTarget();
        this._syncSprites();
    }
}
