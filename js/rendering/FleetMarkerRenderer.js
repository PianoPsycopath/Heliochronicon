// js/rendering/FleetMarkerRenderer.js

import * as THREE from 'three';

const MARKER_PIXEL_SIZE = 12;
const MARKER_COLOR = 0x66ddff;

let sharedFleetTexture = null;

function getFleetMarkerTexture() {
    if (sharedFleetTexture) return sharedFleetTexture;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(120,230,255,0.95)');
    gradient.addColorStop(1, 'rgba(102,221,255,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    sharedFleetTexture = new THREE.CanvasTexture(canvas);
    return sharedFleetTexture;
}

export class FleetMarkerRenderer {
    /**
     * @param {object} ctx
     * @param {THREE.Scene} ctx.scene
     * @param {THREE.Camera} ctx.camera
     * @param {THREE.WebGLRenderer} ctx.renderer
     * @param {() => {x:number,y:number,z:number}} ctx.getCurrentOrigin
     */
    constructor({ scene, camera, renderer, getCurrentOrigin }) {
        if (!scene) throw new Error('FleetMarkerRenderer requires a THREE.Scene');
        if (!camera) throw new Error('FleetMarkerRenderer requires a THREE.Camera');
        if (!renderer) throw new Error('FleetMarkerRenderer requires a THREE.WebGLRenderer');
        if (typeof getCurrentOrigin !== 'function') {
            throw new Error('FleetMarkerRenderer requires "getCurrentOrigin"');
        }

        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.getCurrentOrigin = getCurrentOrigin;

        this.material = new THREE.SpriteMaterial({
            map: getFleetMarkerTexture(),
            color: MARKER_COLOR,
            transparent: true,
            depthTest: true,
            sizeAttenuation: true,
        });

        this.sprite = new THREE.Sprite(this.material);
        this.sprite.name = 'FleetMarker';
        this.sprite.renderOrder = 900;
        this.sprite.visible = false;
        this.scene.add(this.sprite);

        this.position = null;
    }

    /**
     * @param {{x:number,y:number,z:number}|null} heliocentricPositionAu
     */
    setPosition(heliocentricPositionAu) {
        if (
            !heliocentricPositionAu ||
            !Number.isFinite(heliocentricPositionAu.x) ||
            !Number.isFinite(heliocentricPositionAu.y) ||
            !Number.isFinite(heliocentricPositionAu.z)
        ) {
            this.position = null;
            this.sprite.visible = false;
            return;
        }

        this.position = { ...heliocentricPositionAu };
        this.sprite.visible = true;
        this._applyFrame();
    }

    getScenePosition() {
        if (!this.position) return null;
        const origin = this.getCurrentOrigin() ?? { x: 0, y: 0, z: 0 };
        return {
            x: this.position.x - origin.x,
            y: this.position.y - origin.y,
            z: this.position.z - origin.z,
        };
    }

    update() {
        if (!this.position) return;
        this._applyFrame();
    }

    clear() {
        this.position = null;
        this.sprite.visible = false;
    }

    dispose() {
        this.clear();
        if (this.scene) this.scene.remove(this.sprite);
        this.material.dispose();
    }

    _applyFrame() {
        const scenePosition = this.getScenePosition();
        if (!scenePosition) return;

        this.sprite.position.set(scenePosition.x, scenePosition.y, scenePosition.z);

        const viewportHeightPx = this.renderer.domElement?.clientHeight || 1;
        let worldSize;

        if (this.camera.isOrthographicCamera) {
            const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
            worldSize = (MARKER_PIXEL_SIZE / viewportHeightPx) * worldHeight;
        } else {
            const distance = this.camera.position.distanceTo(this.sprite.position);
            const vFovRad = THREE.MathUtils.degToRad(this.camera.fov ?? 50);
            worldSize = (MARKER_PIXEL_SIZE / viewportHeightPx) * 2 * Math.tan(vFovRad / 2) * distance;
        }

        this.sprite.scale.setScalar(worldSize);
    }
}