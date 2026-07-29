// js/InteractionController.js
import * as THREE from 'three'
export class InteractionController {
    constructor(ctx) {
        this.camera = ctx.camera;
        this.controls = ctx.controls;
        this.frustumSize = ctx.frustumSize;
        this.pickableObjects = ctx.pickableObjects;
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

        this.initHooks();
    }
    _pickAtScreenPos(clientX, clientY) {
        this._mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this._mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        this._raycaster.setFromCamera(this._mouse, this.camera);

        let intersects = this._raycaster.intersectObjects(this.pickableObjects).filter(ix => ix.object.visible);
        let hit = intersects.length > 0 ? intersects[0] : null;

        if (!hit) {
            const PICK_RADIUS = 30;
            let closestDist = Infinity;

            this.pickableObjects.filter(obj => obj.visible).forEach(obj => {
                const vector = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
                vector.project(this.camera);

                const x = (vector.x + 1) * window.innerWidth / 2;
                const y = -(vector.y - 1) * window.innerHeight / 2;

                const d = Math.hypot(clientX - x, clientY - y);
                if (d < PICK_RADIUS && d < closestDist) {
                    closestDist = d;
                    hit = { object: obj };
                }
            });
        }

        return hit ? hit.object.userData : null;
    }

    _updateHover(clientX, clientY) {
        const newData = this._pickAtScreenPos(clientX, clientY);
        const newName = newData ? newData.name : null;
        const oldName = this._hoveredData ? this._hoveredData.name : null;

        if (newName !== oldName) {
            this._hoveredData = newData;
            this.onBodyHovered(newData);
        }
    }

    clearHover() {
        if (this._hoveredData) {
            this._hoveredData = null;
            this.onBodyHovered(null);
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
    
    window.addEventListener('wheel', () => { currentMouseAction = 1; });

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
        
        // Differentiate Clicks from Drags (10px threshold)
        const dist = Math.hypot(event.clientX - mouseDownPos.x, event.clientY - mouseDownPos.y);
        if (dist > 15) return; 

        const clickedData = this._pickAtScreenPos(event.clientX, event.clientY);

        if (clickedData) {
            const isHardLock = (currentMouseAction === 0 || event.pointerType === 'touch');
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
            this.targetZoom = Math.max(this.controls.minZoom, Math.min(this.targetZoom, this.controls.maxZoom));
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
            const lerpFactor = Math.min(1.0, 0.08 + (this.panFrames * 0.015));
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