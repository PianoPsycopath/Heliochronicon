// js/InteractionController.js
class InteractionController {
    constructor(ctx) {
        this.camera = ctx.camera;
        this.controls = ctx.controls;
        this.frustumSize = ctx.frustumSize;
        this.pickableObjects = ctx.pickableObjects;
        this.UI = ctx.UI;
        
        this.getCurrentTarget = ctx.getCurrentTarget;
        this.onBodyClicked = ctx.onBodyClicked;
        this.onTrackingBroken = ctx.onTrackingBroken;

        // Internal Camera State previously cluttering main.js
        this.isCameraTracking = false;
        this.flyPanActive = false;
        this.panFrames = 0;
        this.autoZoomActive = false;
        this.targetZoom = this.camera.zoom;

        this.initHooks();
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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointerup', (event) => {
        if (event.target.closest('.panel') || event.target.closest('button')) return;
        
        // Differentiate Clicks from Drags (10px threshold)
        const dist = Math.hypot(event.clientX - mouseDownPos.x, event.clientY - mouseDownPos.y);
        if (dist > 15) return; 

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1; 
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, this.camera);
        
        // 1. Raycaster Click
        let intersects = raycaster.intersectObjects(this.pickableObjects).filter(ix => ix.object.visible);
        let hit = intersects.length > 0 ? intersects[0] : null;

        // 2. FAT FINGER FALLBACK (If Raycaster missed)
        if (!hit) {
            const PICK_RADIUS = 30; // 30 pixels tolerance
            let closestDist = Infinity;
            
            this.pickableObjects.filter(obj => obj.visible).forEach(obj => {
                // Project 3D position to 2D screen space
                const vector = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
                vector.project(this.camera);

                // Convert from (-1 to 1) to screen pixel coordinates
                const x = (vector.x + 1) * window.innerWidth / 2;
                const y = -(vector.y - 1) * window.innerHeight / 2;

                const d = Math.hypot(event.clientX - x, event.clientY - y);
                if (d < PICK_RADIUS && d < closestDist) {
                    closestDist = d;
                    hit = { object: obj };
                }
            });
        }
        
        if (hit) {
            const clickedData = hit.object.userData;
            // Left click (0) or Touch event (pointerType === 'touch') = Hard Lock
            const isHardLock = (currentMouseAction === 0 || event.pointerType === 'touch');
            this.onBodyClicked(clickedData, isHardLock);
        }
    });
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