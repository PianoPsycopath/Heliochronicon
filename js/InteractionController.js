// js/InteractionController.js
import * as THREE from 'three';
import { logger } from './logger.js';
export class InteractionController {
    constructor(ctx) {
        this.ctx = ctx;
        this.camera = ctx.camera;
        this.controls = ctx.controls;
        this.frustumSize = ctx.frustumSize;
        this.pickableObjects = ctx.pickableObjects;
        this.gpuParticleSystems = ctx.gpuParticleSystems || [];
        this.UI = ctx.UI;

        this.getCurrentTarget = ctx.getCurrentTarget;
        this.onBodyClicked = ctx.onBodyClicked;
        this.onTrackingBroken = ctx.onTrackingBroken;
        this.onBodyHovered = ctx.onBodyHovered || (() => {});

        this.isCameraTracking = false;
        this.flyPanActive = false;
        this.panFrames = 0;
        this.autoZoomActive = false;
        this.targetZoom = this.camera.zoom;

        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();

        this._hoveredData = null;
        this._hoverRAFPending = false;

        this._starHoverLabel = document.createElement('div');
        this._starHoverLabel.className = 'star-hover-label';
        Object.assign(this._starHoverLabel.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '9999',
            padding: '4px 10px',
            background: 'rgba(0, 0, 0, 0.82)',
            border: '1px solid #ffcc00',
            color: '#ffcc00',
            fontFamily: "monospace, 'Courier New', Courier",
            fontSize: '12px',
            fontWeight: 'bold',
            letterSpacing: '0.04em',
            borderRadius: '2px',
            display: 'none',
            whiteSpace: 'nowrap',
            textShadow: '0 0 6px rgba(255,204,0,0.45)',
            transform: 'translate(12px, 14px)',
        });
        document.body.appendChild(this._starHoverLabel);
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

        if (!newData && this.ctx.renderer) {
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
            this._updateStarHoverLabel(newData, clientX, clientY);
        } else if (newData && newData.datasetCategory === 'BACKGROUND_STAR') {
            this._positionStarHoverLabel(clientX, clientY);
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
    _updateStarHoverLabel(data, clientX, clientY) {
        if (data && data.datasetCategory === 'BACKGROUND_STAR') {
            const name = InteractionController.starDisplayName(data);
            const cls = InteractionController.starClass(data);
            const suffix = cls ? `  ·  ${cls}` : '';
            const pinMark = data.isPinned ? '  📌' : '';
            this._starHoverLabel.textContent = name + suffix + pinMark;
            this._starHoverLabel.style.display = 'block';
            this._positionStarHoverLabel(clientX, clientY);
        } else {
            this._starHoverLabel.style.display = 'none';
        }
    }
    _positionStarHoverLabel(clientX, clientY) {
        this._starHoverLabel.style.left = `${clientX}px`;
        this._starHoverLabel.style.top = `${clientY}px`;
    }

    _pickStar(clientX, clientY) {
        if (!this.starMeshClone) this.setupPickingScene();
        if (!this.starMeshClone) return null;

        const renderer = this.ctx.renderer;
        const daysSinceJ2000 = this.ctx.getDaysSinceJ2000();
        const currentOrigin = this.ctx.getCurrentOrigin();
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
        if (this._starHoverLabel) {
            this._starHoverLabel.style.display = 'none';
        }
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
            if (!clickedData && this.ctx.renderer) {
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
