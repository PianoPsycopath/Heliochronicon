// js/core/OrbitFactory.js
import { OrbitalMath, kmToAU } from '@physics/OrbitalMath.js';
import * as THREE from 'three';

const ORBIT_RESOLUTION = 720;

const ORBIT_TRAIL_SOLID_FRACTION = 0.25; 
const ORBIT_TRAIL_DASH_CYCLES = 28; 
const ORBIT_TRAIL_DASH_RATIO = 0.55;

export class OrbitFactory {
    getTacticalA(data, isMoon = false) {
        return isMoon && data.a > 1000 ? kmToAU(data.a) : data.a;
    }

    createOrbitPath(data, scaledA) {
        const points = [];

        if (data.orbit_model === 'MEEUS' || data.orbit_model === 'VSOP87') {
            const period = data.period; // Pull dynamically from DataLoader
            for (let j = 0; j <= ORBIT_RESOLUTION; j++) {
                const days = (j / ORBIT_RESOLUTION) * period;
                const pos = OrbitalMath.calculatePosition(data, days);
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        } else {
            for (let j = 0; j <= ORBIT_RESOLUTION; j++) {
                const f = (j / ORBIT_RESOLUTION) * Math.PI * 2;
                const pos = OrbitalMath.calcPosFromTrueAnomaly(
                    scaledA,
                    data.e,
                    data.i,
                    data.w,
                    data.Node,
                    f
                );
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        }

        let lw = 1;
        if (data.datasetCategory === 'PLANET') lw = 3;
        else if (data.datasetCategory === 'MOON') lw = 2;

        const mat = new THREE.LineDashedMaterial({
            color: 0xff1111,
            transparent: true,
            opacity: 0.5,
            depthTest: false,
            linewidth: lw,
            dashSize: ORBIT_TRAIL_DASH_RATIO,
            gapSize: 1 - ORBIT_TRAIL_DASH_RATIO,
            scale: 1,
        });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
        line.computeLineDistances();
        OrbitFactory.applyTrailDashSizing(line);
        line.renderOrder = 2;
        return line;
    }
    static applyTrailDashSizing(line, phaseOffset = 0) {
        const distanceAttr = line.geometry.attributes.lineDistance;
        if (!distanceAttr || distanceAttr.count === 0) return;

        const vertexCount = distanceAttr.count;
        const distances = distanceAttr.array;

        let solidStartIndex = Math.round(vertexCount * (1 - ORBIT_TRAIL_SOLID_FRACTION));
        solidStartIndex = Math.min(Math.max(solidStartIndex, 1), vertexCount - 1);

        for (let i = 0; i < solidStartIndex; i++) {
            const arcFraction = i / (vertexCount - 1);
            // Adding 10000.0 ensures the lineDistance remains deeply positive during backward time travel
            const absolutePhase = 10000.0 + phaseOffset - 1.0 + arcFraction;
            distances[i] = absolutePhase * ORBIT_TRAIL_DASH_CYCLES;
        }

        const boundaryDistance = solidStartIndex > 0 ? distances[solidStartIndex - 1] : 0;
        const cycle = Math.floor(boundaryDistance);
        const frac = boundaryDistance - cycle;

        let frozenDistance;
        if (frac < ORBIT_TRAIL_DASH_RATIO) {
            frozenDistance = boundaryDistance + 0.001; 
        } else {
            frozenDistance = cycle + 1.001; 
        }

        for (let i = solidStartIndex; i < vertexCount; i++) {
            distances[i] = frozenDistance;
        }

        distanceAttr.needsUpdate = true;
        line.material.dashSize = ORBIT_TRAIL_DASH_RATIO;
        line.material.gapSize = 1 - ORBIT_TRAIL_DASH_RATIO;
        line.material.scale = 1;
    }

    createOrbitCurtain(color = 0x00aaff) {
        const mat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.2,
            depthTest: false,
        });
        const curtain = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
        curtain.renderOrder = 1;
        curtain.visible = false;
        return curtain;
    }
}