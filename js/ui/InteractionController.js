// js/InteractionController.js
import * as THREE from 'three';
import { logger } from '@core/logger.js';

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class InteractionController {
    constructor({
        camera,
        controls,
        frustumSize,
        pickableObjects,
        gpuParticleSystems = [],
        UI,
        getCurrentTarget,
        onBodyClicked,
        onTrackingBroken,
        onBodyHovered = () => {},
        tooltipManager,
        renderer,
        getDaysSinceJ2000,
        getCurrentOrigin,
    }) {
        this.camera = camera;
        this.controls = controls;
        this.frustumSize = frustumSize;
        this.pickableObjects = pickableObjects;
        this.gpuParticleSystems = gpuParticleSystems;
        this.UI = UI;

        this.getCurrentTarget = getCurrentTarget;
        this.onBodyClicked = onBodyClicked;
        this.onTrackingBroken = onTrackingBroken;
        this.onBodyHovered = onBodyHovered;

        this.tooltipManager = tooltipManager;
        this.renderer = renderer;
        this.getDaysSinceJ2000 = getDaysSinceJ2000;
        this.getCurrentOrigin = getCurrentOrigin;

        this.isCameraTracking = false;
        this.flyPanActive = false;
        this.panFrames = 0;
        this.autoZoomActive = false;
        this.targetZoom = this.camera.zoom;

        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();

        this._hoveredData = null;
        this._hoverRAFPending = false;
        this._lastHoverClientX = 0;
        this._lastHoverClientY = 0;

        // --- GPU star-field picking infrastructure ---
        // Self-contained here so it never touches Shaders.js/StarLoader.js:
        // the pickId attribute is patched onto the star geometry at runtime
        // (once, lazily, in setupPickingScene) rather than requiring those
        // files to be edited.
        this.pickingScene = new THREE.Scene();
        this.pickingMaterial = this._buildStarPickingMaterial();
        this.pickingTexture = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
        this.pixelBuffer = new Uint8Array(4);
        this.starMeshClone = null;
        // Disposable camera used only for the picking render pass, so the
        // real scene camera (shared with OrbitControls + the main render
        // loop) is never mutated not even transiently.
        this._pickingCamera = this.camera.clone();

        this._STAR_FAR_PLANE_AU = 1e14;

        this.initHooks();
    }
    static starDisplayName(data) {
        if (!data) return 'STAR';
        return (
            data.name ||
            data.designation ||
            data.proper ||
            data.hip ||
            data.hd ||
            data.hr ||
            data.gl ||
            data.id ||
            'STAR'
        ).toString();
    }
    // Local, self-contained picking shader. Mirrors the position/velocity
    // proper-motion math of the visual star shader but outputs an encoded
    // ID color instead. Kept entirely inside this file on purpose.
    _buildStarPickingMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uOrigin: { value: new THREE.Vector3(0, 0, 0) },
                uZoom: { value: 1.0 },
                uPixelRatio: {
                    value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
                },
                uStarProjectionMatrix: { value: new THREE.Matrix4() },
            },
            vertexShader: `
                uniform float uTime;
                uniform vec3 uOrigin;
                uniform float uZoom;
                uniform float uPixelRatio;
                uniform mat4 uStarProjectionMatrix;

                attribute vec3 velocity;
                attribute float pickId;

                varying vec3 vPickColor;

                vec3 packId(float id) {
                    float r = floor(id / 65536.0);
                    float g = floor((id - r * 65536.0) / 256.0);
                    float b = id - r * 65536.0 - g * 256.0;
                    return vec3(r, g, b) / 255.0;
                }

                void main() {
                    float years = uTime / 365.25;
                    vec3 globalPos = position + velocity * years;
                    vec3 renderPos = globalPos - uOrigin;

                    vec4 mvPosition = viewMatrix * vec4(renderPos, 1.0);
                    gl_Position = uStarProjectionMatrix * mvPosition;

                    gl_PointSize = clamp(6.0 / max(uZoom, 0.05), 4.0, 10.0) * uPixelRatio;
                    vPickColor = packId(pickId);
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec3 vPickColor;
                void main() {
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    if (length(coord) > 0.5) discard;
                    gl_FragColor = vec4(vPickColor, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });
    }
    _pickAtScreenPos(clientX, clientY) {
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

                    // Depth check: Ignore objects floating behind the camera
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
        return data && data.name ? data : null;
    }
    setupPickingScene() {
        if (!this.gpuParticleSystems || this.gpuParticleSystems.length === 0) return;
        const starSystem = this.gpuParticleSystems.find(
            (s) =>
                s.geometry &&
                s.geometry.userData &&
                s.geometry.userData.sourceData &&
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

    _updateHover(clientX, clientY) {
        this._lastHoverClientX = clientX;
        this._lastHoverClientY = clientY;

        let newData = this._pickAtScreenPos(clientX, clientY);

        if (!newData && this.renderer) {
            newData = this._pickStar(clientX, clientY);
        }

        const newKey = newData
            ? newData.datasetCategory === 'BACKGROUND_STAR'
                ? 'STAR:' + InteractionController.starDisplayName(newData)
                : newData.name || ''
            : null;
        const oldKey = this._hoveredData
            ? this._hoveredData.datasetCategory === 'BACKGROUND_STAR'
                ? 'STAR:' + InteractionController.starDisplayName(this._hoveredData)
                : this._hoveredData.name || ''
            : null;

        if (newKey !== oldKey) {
            this._hoveredData = newData;
            this.onBodyHovered(newData);
            this._updateHoverTooltip(newData, clientX, clientY);
        } else if (this.tooltipManager && this.tooltipManager.isOwnedBy(this)) {
            // Same object still hovered — just keep the tooltip glued to the cursor.
            this.tooltipManager.move(clientX, clientY);
        }
    }

    static starClass(data) {
        const raw =
            data.spect ??
            data.spectral_class ??
            data.spectralClass ??
            data.st_spectype ??
            data.class ??
            data.sptype ??
            null;
        return raw === null || raw === undefined || raw === '' ? null : String(raw);
    }

    static TACTICAL_HOVER_CATEGORIES = new Set(['RADAR_CONTACT', 'PROMOTED_ASTEROID', 'ASTEROID']);

    _updateHoverTooltip(data, clientX, clientY) {
        if (!this.tooltipManager) return;

        if (!data) {
            this.tooltipManager.hide(this);
            return;
        }

        if (data.datasetCategory === 'BACKGROUND_STAR') {
            const name = InteractionController.starDisplayName(data);
            const cls = InteractionController.starClass(data);
            const suffix = cls ? `  ·  ${cls}` : '';
            const pinMark = data.isPinned ? '  📌' : '';
            this.tooltipManager.show(this, name + suffix + pinMark, clientX, clientY, 'star');
            return;
        }

        if (InteractionController.TACTICAL_HOVER_CATEGORIES.has(data.datasetCategory)) {
            this.tooltipManager.show(
                this,
                this._buildTacticalTooltip(data),
                clientX,
                clientY,
                'tactical'
            );
            return;
        }

        this.tooltipManager.hide(this);
    }

    _buildTacticalTooltip(data) {
        const name = (data.name || 'UNKNOWN CONTACT').toString();
        const category = (data.datasetCategory || '').replace(/_/g, ' ');
        const rows = [`<div class="hc-tooltip-title">${escapeHtml(name)}</div>`];
        if (category) rows.push(`<div class="hc-tooltip-sub">${escapeHtml(category)}</div>`);
        if (typeof data.a === 'number' && isFinite(data.a)) {
            rows.push(`<div>a = ${data.a.toFixed(3)} AU</div>`);
        }
        return { html: rows.join('') };
    }

    _pickStar(clientX, clientY) {
        if (!this.starMeshClone) this.setupPickingScene();
        if (!this.starMeshClone) return null;

        const renderer = this.renderer;
        const daysSinceJ2000 = this.getDaysSinceJ2000();
        const currentOrigin = this.getCurrentOrigin();
        const camera = this.camera;

        this.pickingMaterial.uniforms.uTime.value = daysSinceJ2000;
        this.pickingMaterial.uniforms.uOrigin.value.copy(currentOrigin);
        this.pickingMaterial.uniforms.uZoom.value = camera.zoom;
        this.pickingMaterial.uniforms.uPixelRatio.value =
            (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

        // copy → setViewOffset → raise far → updateProjectionMatrix
        const pickCam = this._pickingCamera;
        pickCam.copy(camera);
        pickCam.setViewOffset(
            renderer.domElement.width,
            renderer.domElement.height,
            clientX * window.devicePixelRatio,
            clientY * window.devicePixelRatio,
            1,
            1
        );
        const realFar = pickCam.far;
        pickCam.far = this._STAR_FAR_PLANE_AU;
        pickCam.updateProjectionMatrix();
        this.pickingMaterial.uniforms.uStarProjectionMatrix.value.copy(pickCam.projectionMatrix);

        let id = 0;
        try {
            renderer.setRenderTarget(this.pickingTexture);
            renderer.clear();
            renderer.render(this.pickingScene, pickCam);
            renderer.readRenderTargetPixels(this.pickingTexture, 0, 0, 1, 1, this.pixelBuffer);
            id = (this.pixelBuffer[0] << 16) | (this.pixelBuffer[1] << 8) | this.pixelBuffer[2];
        } catch (err) {
            logger.warn('Star picking pass failed, skipping this hover:', err);
            id = 0;
        } finally {
            renderer.setRenderTarget(null);
            pickCam.far = realFar;
            pickCam.clearViewOffset();
            pickCam.updateProjectionMatrix();
        }

        if (id > 0) {
            const source = this.starMeshClone.geometry.userData.sourceData;
            if (source && id - 1 < source.length) {
                return source[id - 1];
            }
        }
        return null;
    }
    clearHover() {
        if (this._hoveredData) {
            this._hoveredData = null;
            this.onBodyHovered(null);
        }
        if (this.tooltipManager) this.tooltipManager.hide(this);
    }

    initHooks() {
        let currentMouseAction = null;
        let mouseDownPos = new THREE.Vector2();

        // Prevent default browser context menu for right-click
        window.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.panel') || e.target.closest('button')) return;
            e.preventDefault();
        });

        window.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.panel') || e.target.closest('button')) return;
            currentMouseAction = e.button;
            mouseDownPos.set(e.clientX, e.clientY);
        });

        window.addEventListener('wheel', () => {
            currentMouseAction = 1;
        });

        this.controls.addEventListener('start', () => {
            this.autoZoomActive = false;
            this.flyPanActive = false;

            if (currentMouseAction === 2) {
                this.isCameraTracking = false;
                if (this.onTrackingBroken) this.onTrackingBroken();

                const currentTarget = this.getCurrentTarget();
                if (currentTarget) this.UI.setManualOverride(currentTarget.name);
            }
        });

        window.addEventListener('pointerup', (event) => {
            if (event.target.closest('.panel') || event.target.closest('button')) return;

            const dist = Math.hypot(event.clientX - mouseDownPos.x, event.clientY - mouseDownPos.y);
            if (dist > 15) return;

            let clickedData = this._pickAtScreenPos(event.clientX, event.clientY);
            if (!clickedData && this.renderer) {
                clickedData = this._pickStar(event.clientX, event.clientY);
            }

            if (clickedData) {
                const isHardLock = currentMouseAction === 0 || event.pointerType === 'touch';
                this.onBodyClicked(clickedData, isHardLock);
            }
        });

        window.addEventListener('pointermove', (event) => {
            if (event.pointerType === 'touch') return;

            if (event.target.closest('.panel') || event.target.closest('button')) {
                this.clearHover();
                return;
            }

            if (event.buttons !== 0) return;

            if (this._hoverRAFPending) return;
            this._hoverRAFPending = true;
            const { clientX, clientY } = event;

            requestAnimationFrame(() => {
                this._hoverRAFPending = false;
                this._updateHover(clientX, clientY);
            });
        });

        window.addEventListener('pointerleave', () => this.clearHover());
    }

    triggerFocus(data, isHardLock, AU_IN_KM) {
        if (data && data.datasetCategory === 'BACKGROUND_STAR') {
            return;
        }
        this.panFrames = 0;
        if (isHardLock) {
            this.isCameraTracking = true;
            this.autoZoomActive = true;
            this.flyPanActive = true;

            if (data.radius_km && data.radius_km > 0) {
                const radiusAU = data.radius_km / AU_IN_KM;
                this.targetZoom = (this.frustumSize * 0.15) / radiusAU;
            } else {
                this.targetZoom = data.a === 0 ? 0.5 : 5000000;
            }
            this.targetZoom = Math.max(
                this.controls.minZoom,
                Math.min(this.targetZoom, this.controls.maxZoom)
            );
        } else {
            this.isCameraTracking = false;
            this.autoZoomActive = false;
            this.flyPanActive = true;
        }
    }

    clearTracking() {
        this.isCameraTracking = false;
        this.flyPanActive = false;
        this.autoZoomActive = false;
    }

    updateCamera(trackTargetPos) {
        let delta = trackTargetPos.clone().sub(this.controls.target);
        let applyPan = false;

        if (this.flyPanActive) {
            this.panFrames++;
            const lerpFactor = Math.min(1.0, 0.08 + this.panFrames * 0.015);
            delta.multiplyScalar(lerpFactor);
            applyPan = true;

            if (delta.lengthSq() < 0.000001 || this.panFrames > 60) {
                this.flyPanActive = false;
            }
        } else if (this.isCameraTracking) {
            applyPan = true;
        }

        if (applyPan) {
            this.controls.target.add(delta);
            this.camera.position.add(delta);
        }

        if (this.isCameraTracking && this.autoZoomActive) {
            if (Math.abs(this.camera.zoom - this.targetZoom) > 0.01) {
                this.camera.zoom += (this.targetZoom - this.camera.zoom) * 0.05;
                this.camera.updateProjectionMatrix();
            } else {
                this.autoZoomActive = false;
            }
        }
    }
}
