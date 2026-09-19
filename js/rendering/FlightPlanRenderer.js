import * as THREE from 'three';

export const BURN_MARKER_PIXEL_SIZE = 14;

function isFiniteVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}


let sharedBurnDotTexture = null;
function getBurnDotTexture() {
    if (sharedBurnDotTexture) return sharedBurnDotTexture;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,80,80,0.95)');
    gradient.addColorStop(1, 'rgba(255,51,51,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    sharedBurnDotTexture = new THREE.CanvasTexture(canvas);
    return sharedBurnDotTexture;
}

export class FlightPlanRenderer {
    /**
     * @param {object} ctx
     * @param {THREE.Scene} ctx.scene
     * @param {THREE.Camera} ctx.camera - used to keep burn-marker sprites a
     *   constant apparent size regardless of zoom/distance.
     * @param {THREE.WebGLRenderer} ctx.renderer - used to read the current
     *   viewport height in pixels for that same sizing calculation.
     * @param {() => {x:number,y:number,z:number}} ctx.getCurrentOrigin -
     *   returns the app's current floating-origin offset
     */
    constructor({ scene, camera, renderer, getCurrentOrigin }) {
        if (!scene) {
            throw new Error('FlightPlanRenderer requires a THREE.Scene');
        }
        if (!camera) {
            throw new Error('FlightPlanRenderer requires a THREE.Camera');
        }
        if (!renderer) {
            throw new Error('FlightPlanRenderer requires a THREE.WebGLRenderer');
        }
        if (typeof getCurrentOrigin !== 'function') {
            throw new Error('FlightPlanRenderer requires "getCurrentOrigin"');
        }
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.getCurrentOrigin = getCurrentOrigin;

        this.trajectoryGroup = new THREE.Group();
        this.trajectoryGroup.name = 'FlightPlanGroup';
        this.scene.add(this.trajectoryGroup);

        this.activePlan = null;
        this._burnMarkers = [];
        this._billboardLoopId = null;
        this._markerWorldPosition = new THREE.Vector3();

        this.lastPlanReport = null;

        // Shared materials for the trajectory line
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });


        this.burnMaterial = new THREE.SpriteMaterial({
            map: getBurnDotTexture(),
            color: 0xff3333,
            transparent: true,
            depthTest: false, // Ensures burn markers stay visible above lines
            sizeAttenuation: true,
        });
    }

    /**
     * Renders the flight plan trajectory and burns.
     * @param {object} flightPlan
     */
    setPlan(flightPlan) {
        this.clear();

        if (!flightPlan) {
            this.lastPlanReport = null;
            return;
        }
        this.activePlan = flightPlan;

        const report = {
            trajectoryPoints: 0,
            burnsTotal: 0,
            burnMarkersShown: 0,
            burnsWithoutPosition: 0,
            burnsWithNonFinitePosition: 0,
        };

        if (Array.isArray(flightPlan.trajectorySamples) && flightPlan.trajectorySamples.length > 1) {
            const points = flightPlan.trajectorySamples.map(
                sample => new THREE.Vector3(sample.position.x, sample.position.y, sample.position.z)
            );
            report.trajectoryPoints = points.length;

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, this.lineMaterial);
            line.renderOrder = 3;

            this.trajectoryGroup.add(line);
        }

        if (Array.isArray(flightPlan.burns)) {
            report.burnsTotal = flightPlan.burns.length;

            flightPlan.burns.forEach(burn => {
                if (!burn.position) {
                    report.burnsWithoutPosition++;
                    return;
                }
                if (!isFiniteVector3(burn.position)) {
                    report.burnsWithNonFinitePosition++;
                    return;
                }

                const marker = new THREE.Sprite(this.burnMaterial);
                marker.position.set(burn.position.x, burn.position.y, burn.position.z);
                marker.renderOrder = 4;

                this.trajectoryGroup.add(marker);
                this._burnMarkers.push(marker);
                report.burnMarkersShown++;
            });
        }

        this.lastPlanReport = report;

        if (this.activePlan) {
            this._updateFrame();
            this._startRenderLoop();
        }
    }

    clear() {
        this._stopRenderLoop();

        while (this.trajectoryGroup.children.length > 0) {
            const child = this.trajectoryGroup.children[0];
            this.trajectoryGroup.remove(child);
            if (child.geometry && !child.isSprite) {
                child.geometry.dispose();
            }
        }
        this._burnMarkers = [];
        this.activePlan = null;
    }

    dispose() {
        this.clear();
        if (this.scene) {
            this.scene.remove(this.trajectoryGroup);
        }

        this.lineMaterial.dispose();
        this.burnMaterial.dispose();

    }

    _startRenderLoop() {
        if (this._billboardLoopId !== null) return;
        const tick = () => {
            this._updateFrame();
            this._billboardLoopId = requestAnimationFrame(tick);
        };
        this._billboardLoopId = requestAnimationFrame(tick);
    }

    _stopRenderLoop() {
        if (this._billboardLoopId !== null) {
            cancelAnimationFrame(this._billboardLoopId);
            this._billboardLoopId = null;
        }
    }

    _updateFrame() {
        this._applyOriginOffset();
        this._updateBillboardScales();
    }

    _applyOriginOffset() {
        const origin = this.getCurrentOrigin();
        if (!origin) return;
        this.trajectoryGroup.position.set(-origin.x, -origin.y, -origin.z);
    }

    _updateBillboardScales() {
        if (this._burnMarkers.length === 0) return;

        const viewportHeightPx = this.renderer.domElement.clientHeight || 1;

        for (const marker of this._burnMarkers) {
            let worldSize;

            if (this.camera.isOrthographicCamera) {
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                worldSize = (BURN_MARKER_PIXEL_SIZE / viewportHeightPx) * worldHeight;
            } else {
                const distance = this.camera.position.distanceTo(
                    this._markerWorldPosition
                        .copy(marker.position)
                        .add(this.trajectoryGroup.position)
                );
                const vFovRad = THREE.MathUtils.degToRad(this.camera.fov ?? 50);
                const worldHeightAtDistance = 2 * Math.tan(vFovRad / 2) * distance;
                worldSize = (BURN_MARKER_PIXEL_SIZE / viewportHeightPx) * worldHeightAtDistance;
            }

            marker.scale.setScalar(worldSize);
        }
    }
}