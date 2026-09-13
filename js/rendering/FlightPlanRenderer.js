import * as THREE from 'three';

export class FlightPlanRenderer {
    /**
     * @param {object} ctx
     * @param {THREE.Scene} ctx.scene
     */
    constructor({ scene }) {
        if (!scene) {
            throw new Error('FlightPlanRenderer requires a THREE.Scene');
        }
        this.scene = scene;
        this.trajectoryGroup = new THREE.Group();
        this.trajectoryGroup.name = 'FlightPlanGroup';
        this.scene.add(this.trajectoryGroup);

        this.activePlan = null;

        // Shared materials and geometries
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffcc, // Cyan/mint to distinguish from default orbit red
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        this.burnMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3333, // Distinct red marker
            depthTest: false // Ensures burn markers stay visible above lines
        });

        // Small sphere marker scaled appropriately for AU views
        this.burnGeometry = new THREE.SphereGeometry(0.015, 8, 8);
    }

    /**
     * Renders the flight plan trajectory and burns.
     * @param {object} flightPlan
     */
    setPlan(flightPlan) {
        this.clear();
        
        if (!flightPlan) return;
        this.activePlan = flightPlan;

        // 1. Draw Trajectory Line
        if (Array.isArray(flightPlan.trajectorySamples) && flightPlan.trajectorySamples.length > 1) {
            const points = flightPlan.trajectorySamples.map(
                sample => new THREE.Vector3(sample.position.x, sample.position.y, sample.position.z)
            );
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, this.lineMaterial);
            line.renderOrder = 3;
            
            this.trajectoryGroup.add(line);
        }

        // 2. Draw Burn Markers
        if (Array.isArray(flightPlan.burns)) {
            flightPlan.burns.forEach(burn => {
                if (burn.position) {
                    const marker = new THREE.Mesh(this.burnGeometry, this.burnMaterial);
                    marker.position.set(burn.position.x, burn.position.y, burn.position.z);
                    marker.renderOrder = 4;
                    this.trajectoryGroup.add(marker);
                }
            });
        }
    }

    /**
     * Clears the current visual plan and disposes instance-level geometries.
     */
    clear() {
        while (this.trajectoryGroup.children.length > 0) {
            const child = this.trajectoryGroup.children[0];
            this.trajectoryGroup.remove(child);
            if (child.geometry) {
                child.geometry.dispose();
            }
        }
        this.activePlan = null;
    }

    /**
     * Completely removes the renderer group and clears shared GPU memory.
     */
    dispose() {
        this.clear();
        if (this.scene) {
            this.scene.remove(this.trajectoryGroup);
        }
        
        this.lineMaterial.dispose();
        this.burnMaterial.dispose();
        this.burnGeometry.dispose();
    }
}