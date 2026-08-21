// js/main/RenderingLoop.js

import * as THREE from 'three';
import { PhysicsEngine } from '@physics/PhysicsEngine.js';

const STAR_FAR_PLANE_AU = 1e14;

export class RenderingLoop {
    constructor({
        appState,
        UI,
        scene,
        camera,
        renderer,
        controls,
        renderPipeline,
        celestialBodies,
        measurementManager,
        pinnedStarManager,
        seasonMarkerController,
        gridPlane,
        equatorialGridPlane,
        equatorialMaterial,
        interactionController,
        starFieldMaterialRef,
        getStarVisibilityState,
        setStarVisibilityState,
        updateCredits,
    }) {
        this.appState = appState;
        this.UI = UI;

        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;

        this.renderPipeline = renderPipeline;

        this.celestialBodies = celestialBodies;

        this.measurementManager = measurementManager;

        this.pinnedStarManager = pinnedStarManager;

        this.seasonMarkerController = seasonMarkerController;

        this.gridPlane = gridPlane;
        this.equatorialGridPlane = equatorialGridPlane;

        this.equatorialMaterial = equatorialMaterial;

        this.interactionController = interactionController;

        this.starFieldMaterialRef = starFieldMaterialRef;

        this.getStarVisibilityState = getStarVisibilityState;

        this.setStarVisibilityState = setStarVisibilityState;

        this.updateCredits = updateCredits;

        this.lastFrameTime = performance.now();

        this.running = false;
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        requestAnimationFrame(this.animate.bind(this));
    }

    animate() {
        if (!this.running) {
            return;
        }

        requestAnimationFrame(this.animate.bind(this));

        const now = performance.now();

        const deltaSec = (now - this.lastFrameTime) / 1000;

        this.lastFrameTime = now;

        this.updatePerformance(deltaSec);

        this.updateStarVisibility();

        const timeData = this.updateSystemTime(deltaSec);

        const daysSinceJ2000 = timeData.daysSinceJ2000;

        this.runPhysics(daysSinceJ2000);

        this.updateHardware();

        this.runRenderPrePass(daysSinceJ2000);

        this.updateDualGrids();

        this.measurementManager.update(this.camera, this.appState.currentOrigin, daysSinceJ2000);

        this.pinnedStarManager.update(this.camera, this.appState.currentOrigin, daysSinceJ2000);

        this.seasonMarkerController.update(
            this.appState.systemDate,
            daysSinceJ2000,
            this.appState.currentOrigin
        );

        this.executeFinalRender(daysSinceJ2000);
    }

    updatePerformance(deltaSec) {
        const perfSample = this.UI.performanceMonitor.tick(deltaSec);

        if (perfSample) {
            this.UI.updatePerf(perfSample);
        }
    }

    updateStarVisibility() {
        const visibleNow = this.camera.zoom <= 0.075;

        if (visibleNow !== this.getStarVisibilityState()) {
            this.setStarVisibilityState(visibleNow);

            this.updateCredits();
        }
    }

    updateSystemTime(deltaSec) {
        let dateToUse = this.appState.systemDate;

        if (this.UI.timeThrottle.isLiveTime) {
            dateToUse = new Date();
        }

        const timeData = PhysicsEngine.updateSystemTime(this.UI, dateToUse, deltaSec);

        this.appState.systemDate = timeData.newDate;

        return timeData;
    }

    runPhysics(daysSinceJ2000) {
        PhysicsEngine.calculateKeplerianKinematics(this.celestialBodies, daysSinceJ2000);

        PhysicsEngine.applyMoonParentOffsets(this.celestialBodies);

        this.renderPipeline.processFloatingOrigin(
            this.celestialBodies,
            this.appState.trackingTargetData,
            this.appState.currentOrigin,
            daysSinceJ2000
        );

        PhysicsEngine.zSortCelestialBodies(
            this.celestialBodies,
            this.camera.position,
            this.appState.currentOrigin
        );
    }

    updateHardware() {
        const currentTarget = this.appState.currentTargetData;

        if (currentTarget) {
            const targetBody = this.celestialBodies.find(
                (body) => body.data.name === currentTarget.name
            );

            if (targetBody) {
                let wDeg = ((targetBody.W_current * 180) / Math.PI) % 360;

                if (wDeg < 0) {
                    wDeg += 360;
                }

                this.UI.updateLiveTelemetry(
                    wDeg,
                    targetBody.RA_current_deg,
                    targetBody.DEC_current_deg
                );

                this.interactionController.updateCamera(targetBody.mesh.position);
            }
        }

        this.controls.update();
        this.camera.updateMatrixWorld();
    }

    runRenderPrePass(daysSinceJ2000) {
        this.renderPipeline.processScreenProjectionsAndCulling(
            this.celestialBodies,
            this.appState.currentTargetData,
            this.appState.currentOrigin,
            this.appState.previewTargetData,
            daysSinceJ2000
        );
    }

    updateDualGrids() {
        const origin = this.appState.currentOrigin;

        this.gridPlane.position.set(-origin.x, -origin.y, -origin.z);

        this.gridPlane.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

        const currentTarget = this.appState.currentTargetData;

        if (!currentTarget) {
            this.equatorialGridPlane.visible = false;

            return;
        }

        const targetBody = this.celestialBodies.find(
            (body) => body.data.name === currentTarget.name
        );

        if (!targetBody) {
            this.equatorialGridPlane.visible = false;

            return;
        }

        const isPlanet = !targetBody.isMoon && targetBody.data.parent !== targetBody.data.name;

        if (targetBody.data.parent === targetBody.data.name || (!isPlanet && !targetBody.isMoon)) {
            this.equatorialGridPlane.visible = false;

            return;
        }

        this.equatorialGridPlane.visible = true;

        let anchorPos = targetBody.renderPos;

        let anchorQuat = targetBody.poleQuaternion;

        let targetMass = targetBody.data.mass;

        if (targetBody.isMoon) {
            const parentPlanet = this.celestialBodies.find(
                (body) => body.data.name === targetBody.data.parent
            );

            if (parentPlanet) {
                anchorPos = parentPlanet.renderPos;

                anchorQuat = parentPlanet.poleQuaternion;

                targetMass = parentPlanet.data.mass;
            }
        }

        const massRatio = targetMass / 5.97;

        const dynamicRadius = 0.5 * Math.pow(massRatio, 0.3333);

        this.equatorialMaterial.uniforms.uGridRadius.value = dynamicRadius;

        this.equatorialGridPlane.position.lerp(anchorPos, 0.1);

        const eclipticQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            -Math.PI / 2
        );

        const finalQuat = anchorQuat.clone().multiply(eclipticQuat);

        this.equatorialGridPlane.quaternion.slerp(finalQuat, 0.1);

        this.equatorialMaterial.uniforms.cameraPos.value.copy(this.camera.position);
    }

    updateStarFieldFarProjection() {
        const material = this.starFieldMaterialRef();

        if (!material || typeof this.camera.updateProjectionMatrix !== 'function') {
            return;
        }

        const realFar = this.camera.far;

        this.camera.far = STAR_FAR_PLANE_AU;

        this.camera.updateProjectionMatrix();

        material.uniforms.uStarProjectionMatrix.value.copy(this.camera.projectionMatrix);

        this.camera.far = realFar;

        this.camera.updateProjectionMatrix();
    }

    executeFinalRender(daysSinceJ2000) {
        this.renderPipeline.updateGPU(daysSinceJ2000, this.appState.currentOrigin, this.gridPlane);

        this.updateStarFieldFarProjection();

        this.renderer.render(this.scene, this.camera);
    }
}
