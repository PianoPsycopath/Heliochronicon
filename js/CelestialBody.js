// js/CelestialBody.js
import * as THREE from 'three';

export class CelestialBody {
    constructor(params = {}) {
        // Source Data
        this.data = params.data || {};
        this.isMoon = params.isMoon || false;
        
        // 3D Objects
        this.mesh = params.mesh || null;
        this.sprite = params.sprite || null;
        this.orbitLine = params.orbitLine || null;
        this.orbitCurtain = params.orbitCurtain || null;
        
        // HTML UI Elements
        this.label = params.label || null;
        
        // Visibility Flags
        this.datasetVisible = params.datasetVisible !== undefined ? params.datasetVisible : true;
        this.isCulled = params.isCulled || false;
        this.hideLabel = params.hideLabel || false;
        
        // Kinematics & Positions
        this.globalPos = params.globalPos || new THREE.Vector3();
        // If a sprite is provided, link renderPos directly to its position vector
        this.renderPos = params.renderPos || (this.sprite ? this.sprite.position : new THREE.Vector3());
        this.parentPos = params.parentPos || new THREE.Vector3();
        
        this.W_current = params.W_current || 0;
        this.poleQuaternion = params.poleQuaternion || new THREE.Quaternion();
        
        // Physical Properties
        this.scaledA = params.scaledA || 0;
        this.physicalRadius = params.physicalRadius || 0;
    }
}