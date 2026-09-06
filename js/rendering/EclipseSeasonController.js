import * as THREE from 'three';
import { EclipseSeasonEngine } from '@physics/EclipseSeasonEngine.js';
import { OrbitalMath } from '@physics/OrbitalMath.js';

const MAX_ECLIPSE_SEASONS = 16;
const ECLIPSE_SEASON_COLOR = 0xffff00;
const ECLIPSE_SEASON_OPACITY = 1.0;
const MARKER_SPRITE_SIZE = 3;
const HOVER_PICK_RADIUS_PX = 22;
const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

let startMat = null;
let endMat = null;

function createMarkerSpriteMat(symbol, colorStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorStr;
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 6;
    ctx.fillText(symbol, 32, 34);
    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
}

function formatCountdown(targetDate, now) {
    const ms = targetDate.getTime() - now.getTime();
    if (ms < 0) return 'in progress';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0) return `in ${days} d ${hours} h ${mins} m`;
    if (hours > 0) return `in ${hours} h ${mins} m`;
    return `in ${mins} m`;
}

export class EclipseSeasonController {
    constructor({ bodyRegistry, scene, camera, tooltipManager }) {
        this.bodyRegistry = bodyRegistry;
        this.scene = scene;
        this.camera = camera;
        this.tooltipManager = tooltipManager;

        this._activeParent = null;
        this._lastMoonName = null;
        this._lastDays = null;

        this.markers = [];
        this.sprites = [];
        this._hoveredIndex = -1;
        this._lastClientX = 0;
        this._lastClientY = 0;

        this._onPointerMove = (event) => this._handlePointerMove(event);
        window.addEventListener('pointermove', this._onPointerMove);
    }

    update(currentTargetData, daysSinceJ2000) {
        const target = currentTargetData;

        if (!target || target.category !== 'MOON') {
            this.clear();
            return;
        }

        const moon = this.bodyRegistry.getByName(target.name);
        if (!moon || !moon.isMoon) {
            this.clear();
            return;
        }

        const parent = this.bodyRegistry.getByName(moon.data.parent);
        if (!parent || parent.data.parent === parent.data.name) {
            this.clear();
            return;
        }

        const star = this._findStar(parent.data.name);
        if (!star) {
            this.clear();
            return;
        }

        const systemDate = new Date(J2000_EPOCH_MS + daysSinceJ2000 * 86400000);

        if (
            this._lastMoonName !== moon.data.name ||
            this._lastDays !== daysSinceJ2000 ||
            this._activeParent !== parent
        ) {
            const bodiesByName = new Map();
            for (const body of this.bodyRegistry.getAllBodies()) {
                bodiesByName.set(body.data.name, body.data);
            }

            const intervals = EclipseSeasonEngine.calculate(
                moon.data,
                parent.data,
                star.data,
                bodiesByName,
                daysSinceJ2000
            );

            const mappedIntervals = intervals
                .map((interval) => {
                    const start = EclipseSeasonEngine.getOrbitProgress(parent.data, interval.startDays);
                    const end = EclipseSeasonEngine.getOrbitProgress(parent.data, interval.endDays);
                    if (start === null || end === null) return null;
                    return { start, end };
                })
                .filter(Boolean);

            this._apply(parent, mappedIntervals);

            this.markers = [];
            for (const interval of intervals) {
                const startPos = OrbitalMath.calculatePosition(parent.data, interval.startDays);
                const endPos = OrbitalMath.calculatePosition(parent.data, interval.endDays);

                if (startPos) {
                    this.markers.push({
                        isStart: true,
                        date: new Date(J2000_EPOCH_MS + interval.startDays * 86400000),
                        position: startPos,
                        label: 'Eclipse Season Start'
                    });
                }
                if (endPos) {
                    this.markers.push({
                        isStart: false,
                        date: new Date(J2000_EPOCH_MS + interval.endDays * 86400000),
                        position: endPos,
                        label: 'Eclipse Season End'
                    });
                }
            }

            this._syncSprites();
            this._activeParent = parent;
            this._lastMoonName = moon.data.name;
            this._lastDays = daysSinceJ2000;
        }

        if (this.markers.length) {
            if (!startMat) startMat = createMarkerSpriteMat('○', '#ffff00');
            if (!endMat) endMat = createMarkerSpriteMat('◉', '#ffff00');

            const starRenderPos = star.renderPos || new THREE.Vector3();
            const zoom = this.camera?.zoom || 1;
            const scale = MARKER_SPRITE_SIZE / zoom;
            const localVec = new THREE.Vector3();

            for (let i = 0; i < this.sprites.length; i++) {
                const sprite = this.sprites[i];
                const marker = this.markers[i];
                if (!marker) {
                    sprite.visible = false;
                    continue;
                }

                marker.countdownText = formatCountdown(marker.date, systemDate);
                
                sprite.material = marker.isStart ? startMat : endMat;
                sprite.visible = true;

                localVec.set(marker.position.x, marker.position.y, marker.position.z);
                sprite.position.copy(localVec).add(starRenderPos);
                sprite.scale.set(scale, scale, 1);
                sprite.updateMatrix();
                sprite.updateMatrixWorld();
            }
        } else {
            for (const sprite of this.sprites) sprite.visible = false;
        }

        this._updateTooltip();
    }

    clear() {
        if (this._activeParent) {
            this._setIntervals(this._activeParent.orbitLine, []);
        }
        this._activeParent = null;
        this._lastMoonName = null;
        this._lastDays = null;
        this.markers = [];
        this._hideTooltip();
        for (const sprite of this.sprites) sprite.visible = false;
    }

    _syncSprites() {
        while (this.sprites.length > this.markers.length) {
            const sprite = this.sprites.pop();
            if (this.scene) this.scene.remove(sprite);
        }
        while (this.sprites.length < this.markers.length) {
            const sprite = new THREE.Sprite();
            sprite.renderOrder = 950;
            sprite.matrixAutoUpdate = false;
            sprite.visible = false;
            if (this.scene) this.scene.add(sprite);
            this.sprites.push(sprite);
        }
        if (this._hoveredIndex >= this.sprites.length) {
            this._hoveredIndex = -1;
        }
    }

    _apply(parent, intervals) {
        this._setIntervals(parent.orbitLine, intervals);
    }

    _setIntervals(orbitLine, intervals) {
        const material = orbitLine?.material;
        if (!material?.uniforms?.uEclipseSeasonCount) return;

        const count = Math.min(intervals.length, MAX_ECLIPSE_SEASONS);
        material.uniforms.uEclipseSeasonCount.value = count;

        for (let index = 0; index < MAX_ECLIPSE_SEASONS; index++) {
            const interval = intervals[index];
            material.uniforms.uEclipseSeasonStarts.value[index] = interval?.start ?? 0;
            material.uniforms.uEclipseSeasonEnds.value[index] = interval?.end ?? 0;
        }

        material.uniforms.uEclipseSeasonColor.value.setHex(ECLIPSE_SEASON_COLOR);
        material.uniforms.uEclipseSeasonOpacity.value = ECLIPSE_SEASON_OPACITY;
    }

    _findStar(startName) {
        let current = this.bodyRegistry.getByName(startName);
        const visited = new Set();
        while (current && !visited.has(current.data.name)) {
            if (current.data.parent === current.data.name) {
                return current;
            }
            visited.add(current.data.name);
            current = this.bodyRegistry.getByName(current.data.parent);
        }
        return null;
    }

    _hideTooltip() {
        this._hoveredIndex = -1;
        if (this.tooltipManager) this.tooltipManager.hide(this);
    }

    _handlePointerMove(event) {
        if (event.pointerType === 'touch') return;
        if (event.target.closest && (event.target.closest('.panel') || event.target.closest('button'))) {
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
            if (projected.z > 1) continue;

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

    _updateTooltip() {
        if (!this.tooltipManager) return;
        if (this._hoveredIndex === -1 || !this.markers[this._hoveredIndex]) {
            this.tooltipManager.hide(this);
            return;
        }

        const marker = this.markers[this._hoveredIndex];
        const moonName = (this._lastMoonName || '').toString();
        const dateStr = `${marker.date.toISOString().replace('T', ' ').substring(0, 19)} UTC`;

        const html = `
            <div class="hc-tooltip-title">${moonName} &ndash; ${marker.label}</div>
            <div>${dateStr}</div>
            <div class="hc-tooltip-sub">${marker.countdownText}</div>
        `;
        
        this.tooltipManager.show(this, { html }, this._lastClientX, this._lastClientY, 'marker');
    }

    dispose() {
        window.removeEventListener('pointermove', this._onPointerMove);
        this.clear();
        while (this.sprites.length > 0) {
            const sprite = this.sprites.pop();
            if (this.scene) this.scene.remove(sprite);
        }
    }
}