// js/rendering/PopulationDensityFactory.js
import * as THREE from 'three';
import { DensityShaders } from '@rendering/shaders/density.js';

const RING_RADIAL_SEGMENTS = 12;
const RING_TUBULAR_SEGMENTS = 128;
const SHELL_WIDTH_SEGMENTS = 48;
const SHELL_HEIGHT_SEGMENTS = 32;
const BUBBLE_WIDTH_SEGMENTS = 32;
const BUBBLE_HEIGHT_SEGMENTS = 24;

const DEFAULT_OPACITY = 0.16;
const DEFAULT_RESONANT_ARC_WIDTH_DEG = 50; // only used if a resonanceLock omits arcWidth_deg

function eclipticVectorToWorld([x, y, z]) {
    return new THREE.Vector3(x, z, -y);
}
function buildOrbitElements(meanOrbit) {
    if (
        !meanOrbit ||
        !Number.isFinite(meanOrbit.a_au) ||
        !Number.isFinite(meanOrbit.e) ||
        !Number.isFinite(meanOrbit.n_deg_per_day)
    ) {
        return null;
    }

    return {
        a: meanOrbit.a_au,
        e: meanOrbit.e,
        i: THREE.MathUtils.degToRad(meanOrbit.i_deg || 0),
        w: THREE.MathUtils.degToRad(meanOrbit.w_deg || 0),
        node: THREE.MathUtils.degToRad(meanOrbit.node_deg || 0),
        m0: THREE.MathUtils.degToRad(meanOrbit.m_deg || 0),
        n: THREE.MathUtils.degToRad(meanOrbit.n_deg_per_day),
    };
}

export class PopulationDensityFactory {
    static buildDensityObject(shapeDescriptor, datasetName, colorHex = '#ffffff') {
        const group = new THREE.Group();
        group.name = `density:${datasetName}`;
        group.userData = {
            datasetName,
            kind: 'densityObject',
            datasetVisible: false, // hidden by default; particle system stays primary
            basePosition: new THREE.Vector3(0, 0, 0),
        };

        shapeDescriptor.components.forEach((component) => {
            const mesh = PopulationDensityFactory._buildComponent(component, colorHex);
            if (mesh) group.add(mesh);
        });

        return group;
    }

    static _buildComponent(component, colorHex) {
        switch (component.type) {
            case 'torus':
                return component.resonanceLock
                    ? PopulationDensityFactory._buildResonantArc(component, colorHex)
                    : PopulationDensityFactory._buildRing(component, colorHex);
            case 'bubble':
                return PopulationDensityFactory._buildBubble(component, colorHex);
            case 'shell':
                return PopulationDensityFactory._buildShell(component, colorHex);
            default:
                return null;
        }
    }
    static _buildRing(component, colorHex) {
        const tubeRadius = component.width_au / 2;
        const geometry = new THREE.TorusGeometry(
            component.meanA_au,
            tubeRadius,
            RING_RADIAL_SEGMENTS,
            RING_TUBULAR_SEGMENTS
        );
        geometry.rotateX(Math.PI / 2); // lie flat in the XZ (ecliptic) plane

        const verticalScale = component.thickness_au / component.width_au;
        geometry.scale(1, verticalScale, 1);

        const material = DensityShaders.getDensitySurfaceMaterial(colorHex, DEFAULT_OPACITY);
        const mesh = new THREE.Mesh(geometry, material);
        PopulationDensityFactory._applyOrbitMotion(
            mesh,
            component,
            new THREE.Vector3(0, component.zCenter_au || 0, 0)
        );
        return mesh;
    }
    static _buildResonantArc(component, colorHex) {
        const {
            lockToBody,
            angularOffset_deg = 0,
            arcWidth_deg = DEFAULT_RESONANT_ARC_WIDTH_DEG,
        } = component.resonanceLock;

        const tubeRadius = component.width_au / 2;
        const arcRad = THREE.MathUtils.degToRad(arcWidth_deg);

        const geometry = new THREE.TorusGeometry(
            component.meanA_au,
            tubeRadius,
            RING_RADIAL_SEGMENTS,
            RING_TUBULAR_SEGMENTS,
            arcRad
        );
        geometry.rotateZ(-arcRad / 2);
        geometry.rotateX(Math.PI / 2);

        const verticalScale = component.thickness_au / component.width_au;
        geometry.scale(1, verticalScale, 1);

        const material = DensityShaders.getDensitySurfaceMaterial(colorHex, DEFAULT_OPACITY * 1.5);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = component.zCenter_au || 0;
        mesh.userData.isResonanceLocked = true;
        mesh.userData.lockToBody = lockToBody;
        mesh.userData.angularOffsetRad = THREE.MathUtils.degToRad(angularOffset_deg);

        const orbitElements = buildOrbitElements(component.meanOrbit);
        if (orbitElements) {
            mesh.userData.orbitsSun = true;
            mesh.userData.orbitElements = orbitElements;
            mesh.rotation.y = orbitElements.m0 + mesh.userData.angularOffsetRad;
        }

        return mesh;
    }
    static _buildBubble(component, colorHex) {
        const geometry = new THREE.SphereGeometry(1, BUBBLE_WIDTH_SEGMENTS, BUBBLE_HEIGHT_SEGMENTS);
        const [sx, sy, sz] = component.semiAxes_au;
        geometry.scale(sx, sz, sy);

        const material = DensityShaders.getDensitySurfaceMaterial(colorHex, DEFAULT_OPACITY);
        const mesh = new THREE.Mesh(geometry, material);
        PopulationDensityFactory._applyOrbitMotion(
            mesh,
            component,
            eclipticVectorToWorld(component.center_au)
        );
        return mesh;
    }
    static _buildShell(component, colorHex) {
        const geometry = new THREE.SphereGeometry(
            component.meanA_au,
            SHELL_WIDTH_SEGMENTS,
            SHELL_HEIGHT_SEGMENTS
        );
        const material = DensityShaders.getDensitySurfaceMaterial(colorHex, DEFAULT_OPACITY * 1.2);
        const mesh = new THREE.Mesh(geometry, material);
        PopulationDensityFactory._applyOrbitMotion(
            mesh,
            component,
            new THREE.Vector3(0, component.zCenter_au || 0, 0)
        );
        return mesh;
    }
    static _applyOrbitMotion(mesh, component, staticFallbackPosition = new THREE.Vector3()) {
        mesh.position.copy(staticFallbackPosition);

        const orbitElements = buildOrbitElements(component.meanOrbit);
        if (!orbitElements) return;

        mesh.userData.orbitsSun = true;
        mesh.userData.orbitElements = orbitElements;
        mesh.rotation.y = orbitElements.m0;
    }

    static disposeDensityObject(object) {
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}
