// js/CelestialBody.js
import * as THREE from 'three';

export class CelestialBody {
    constructor(params = {}) {
        this.data = params.data || {};
        this.isMoon = params.isMoon || false;

        this.mesh = params.mesh || null;
        this.sprite = params.sprite || null;
        this.orbitLine = params.orbitLine || null;
        this.orbitCurtain = params.orbitCurtain || null;
        this.orbitCurtainEcliptic = params.orbitCurtainEcliptic || null;

        this.label = params.label || null;

        this.datasetVisible = params.datasetVisible !== undefined ? params.datasetVisible : true;
        this.isCulled = params.isCulled || false;
        this.hideLabel = params.hideLabel || false;

        this.globalPos = params.globalPos || new THREE.Vector3();
        // Link renderPos to sprite.position when a sprite is supplied.
        this.renderPos =
            params.renderPos || (this.sprite ? this.sprite.position : new THREE.Vector3());
        this.parentPos = params.parentPos || new THREE.Vector3();

        this.W_current = params.W_current || 0;
        this.poleQuaternion = params.poleQuaternion || new THREE.Quaternion();

        this.scaledA = params.scaledA || 0;
        this.physicalRadius = params.physicalRadius || 0;

        // Seeded early by planet/moon build-out so the first frame has sane
        // values; radar contacts and promotions attach them later per-frame.
        this.baseRenderOrder = params.baseRenderOrder !== undefined ? params.baseRenderOrder : 0;
        this.distToCamSq = params.distToCamSq !== undefined ? params.distToCamSq : 0;

        // Populated lazily by SeasonMarkerController only while this body is
        // the active season-defining target; left null otherwise.
        this.seasonMarkers = params.seasonMarkers || null;
    }
}
