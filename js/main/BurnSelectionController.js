// js/main/BurnSelectionController.js
import * as THREE from 'three';

const CLICK_MOVEMENT_THRESHOLD_PX = 4;
const PICK_TOLERANCE_PX = 10;

export class BurnSelectionController {
    constructor({ camera, renderer, transferRenderer, missionPanel }) {
        this.camera = camera;
        this.renderer = renderer;
        this.transferRenderer = transferRenderer;
        this.missionPanel = missionPanel;

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this._pointerDownPosition = null;

        this._onPointerDown = this._handlePointerDown.bind(this);
        this._onPointerUp = this._handlePointerUp.bind(this);

        this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
        this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);
    }

    _handlePointerDown(event) {
        this._pointerDownPosition = { x: event.clientX, y: event.clientY };
    }

    _handlePointerUp(event) {
        const down = this._pointerDownPosition;
        this._pointerDownPosition = null;
        if (!down) return;

        const movedPx = Math.hypot(event.clientX - down.x, event.clientY - down.y);
        if (movedPx > CLICK_MOVEMENT_THRESHOLD_PX) return;

        const burnMarkers = this.transferRenderer.getBurnMarkerObject3D();
        if (!burnMarkers) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Orthographic camera with a wide zoom range: Points.threshold is a
        // world-space distance, so it must be derived from the camera's
        // current world-units-per-pixel rather than a fixed constant, or it
        // silently becomes unclickable at most zoom levels.
        this.raycaster.params.Points.threshold = this._pixelToleranceToWorldUnits(rect.width);

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObject(burnMarkers, false);
        if (hits.length === 0) return;

        const index = hits[0].index;
        this.transferRenderer.setHighlightedBurnIndex(index);
        this.missionPanel.showBurnDetail(this.transferRenderer.getBurnAt(index));
    }

    _pixelToleranceToWorldUnits(canvasWidthPx) {
        const worldWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
        const worldUnitsPerPixel = worldWidth / canvasWidthPx;
        return worldUnitsPerPixel * PICK_TOLERANCE_PX;
    }

    dispose() {
        this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
        this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    }
}