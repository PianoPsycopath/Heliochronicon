//js/ui/camera/Picking.js
import * as THREE from 'three';
import { logger } from '@core/logger.js';
import { StarFieldShaders } from '@rendering/shaders/starField.js';

export class Picking {
    constructor({ camera, renderer, pickableObjects, gpuParticleSystems, getDaysSinceJ2000, getCurrentOrigin }) {
        this.camera = camera;
        this.renderer = renderer;
        this.pickableObjects = pickableObjects;
        this.gpuParticleSystems = gpuParticleSystems;
        this.getDaysSinceJ2000 = getDaysSinceJ2000;
        this.getCurrentOrigin = getCurrentOrigin;

        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();

        this.pickingScene = new THREE.Scene();
        
        // Fetch the material directly from the rendering layer
        this.pickingMaterial = StarFieldShaders.getStarPickingMaterial();
        
        this.pickingTexture = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
        this.pixelBuffer = new Uint8Array(4);
        this.starMeshClone = null;
        this._pickingCamera = this.camera.clone();
        this._STAR_FAR_PLANE_AU = 1e14;
    }

    pick(clientX, clientY) {
        // CPU Picking
        this._mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this._mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        this._raycaster.setFromCamera(this._mouse, this.camera);

        let intersects = this._raycaster
            .intersectObjects(this.pickableObjects, false)
            .filter((ix) => ix.object.visible);
        let hit = intersects.length > 0 ? intersects[0] : null;

        if (!hit) {
            const PICK_RADIUS = 30;
            let closestDist = Infinity;

            this.pickableObjects
                .filter((obj) => obj.visible)
                .forEach((obj) => {
                    const vector = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
                    vector.project(this.camera);

                    if (vector.z > 1) return;

                    const x = ((vector.x + 1) * window.innerWidth) / 2;
                    const y = (-(vector.y - 1) * window.innerHeight) / 2;

                    const d = Math.hypot(clientX - x, clientY - y);
                    if (d < PICK_RADIUS && d < closestDist) {
                        closestDist = d;
                        hit = { object: obj };
                    }
                });
        }

        const data = hit ? hit.object.userData : null;
        if (data && data.name) return data;

        // GPU Picking Fallback
        if (this.renderer) return this._pickStar(clientX, clientY);
        return null;
    }

    setupPickingScene() {
        if (!this.gpuParticleSystems || this.gpuParticleSystems.length === 0) return;
        const starSystem = this.gpuParticleSystems.find(
            (s) =>
                s.geometry && s.geometry.userData && s.geometry.userData.sourceData &&
                s.geometry.userData.sourceData[0] &&
                s.geometry.userData.sourceData[0].datasetCategory === 'BACKGROUND_STAR'
        );
        if (!starSystem || this.starMeshClone) return;

        if (!starSystem.geometry.getAttribute('pickId')) {
            const count = starSystem.geometry.getAttribute('position').count;
            const ids = new Float32Array(count);
            for (let idx = 0; idx < count; idx++) ids[idx] = idx + 1;
            starSystem.geometry.setAttribute('pickId', new THREE.Float32BufferAttribute(ids, 1));
        }

        this.starMeshClone = new THREE.Points(starSystem.geometry, this.pickingMaterial);
        this.starMeshClone.frustumCulled = false;
        this.pickingScene.add(this.starMeshClone);
    }

    _pickStar(clientX, clientY) {
        if (!this.starMeshClone) this.setupPickingScene();
        if (!this.starMeshClone) return null;

        const pickCam = this._pickingCamera;
        pickCam.copy(this.camera);
        pickCam.setViewOffset(
            this.renderer.domElement.width, this.renderer.domElement.height,
            clientX * window.devicePixelRatio, clientY * window.devicePixelRatio,
            1, 1
        );
        
        const realFar = pickCam.far;
        pickCam.far = this._STAR_FAR_PLANE_AU;
        pickCam.updateProjectionMatrix();

        this.pickingMaterial.uniforms.uTime.value = this.getDaysSinceJ2000();
        this.pickingMaterial.uniforms.uOrigin.value.copy(this.getCurrentOrigin());
        this.pickingMaterial.uniforms.uZoom.value = this.camera.zoom;
        this.pickingMaterial.uniforms.uPixelRatio.value = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
        this.pickingMaterial.uniforms.uStarProjectionMatrix.value.copy(pickCam.projectionMatrix);

        let id = 0;
        try {
            this.renderer.setRenderTarget(this.pickingTexture);
            this.renderer.clear();
            this.renderer.render(this.pickingScene, pickCam);
            this.renderer.readRenderTargetPixels(this.pickingTexture, 0, 0, 1, 1, this.pixelBuffer);
            id = (this.pixelBuffer[0] << 16) | (this.pixelBuffer[1] << 8) | this.pixelBuffer[2];
        } catch (err) {
            logger.warn('Star picking pass failed, skipping this hover:', err);
        } finally {
            this.renderer.setRenderTarget(null);
            pickCam.far = realFar;
            pickCam.clearViewOffset();
            pickCam.updateProjectionMatrix();
        }

        if (id > 0) {
            const source = this.starMeshClone.geometry.userData.sourceData;
            if (source && id - 1 < source.length) return source[id - 1];
        }
        return null;
    }
}