//js/ui/camera/CameraFocus.js
export class CameraFocus {
    constructor({ camera, controls, frustumSize }) {
        this.camera = camera;
        this.controls = controls;
        this.frustumSize = frustumSize;

        this.isCameraTracking = false;
        this.flyPanActive = false;
        this.panFrames = 0;
        this.autoZoomActive = false;
        this.targetZoom = this.camera.zoom;
    }

    triggerFocus(data, isHardLock, AU_IN_KM) {
        if (data && data.datasetCategory === 'BACKGROUND_STAR') return;

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
    interruptFlight() {
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
