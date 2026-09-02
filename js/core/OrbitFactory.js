// js/core/OrbitFactory.js
import { OrbitalMath, kmToAU } from '@physics/OrbitalMath.js';
import { Shaders } from '@rendering/Shaders.js';
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
            const period = data.period;
            for (let j = 0; j <= ORBIT_RESOLUTION; j++) {
                const days = (j / ORBIT_RESOLUTION) * period;
                const pos = OrbitalMath.calculatePosition(data, days);
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        } else {
            for (let j = 0; j <= ORBIT_RESOLUTION; j++) {
                const f = (j / ORBIT_RESOLUTION) * Math.PI * 2;
                const pos = OrbitalMath.calcPosFromTrueAnomaly(
                    scaledA, data.e, data.i, data.w, data.Node, f
                );
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        OrbitFactory.attachProgressAttribute(geometry);

        const mat = Shaders.createOrbitTrailMaterial({
            color: 0xff1111,
            opacity: 0.5,
            solidFraction: ORBIT_TRAIL_SOLID_FRACTION,
            dashCycles: ORBIT_TRAIL_DASH_CYCLES,
            dashRatio: ORBIT_TRAIL_DASH_RATIO,
        });

        const line = new THREE.Line(geometry, mat);
        line.renderOrder = 2;
        return line;
    }

    static attachProgressAttribute(geometry) {
        const count = geometry.attributes.position.count;
        const progress = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            progress[i] = i / (count - 1);
        }
        geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
    }

    createOrbitCurtain(color = 0x00aaff) {
        const mat = new THREE.LineBasicMaterial({
            color, transparent: true, opacity: 0.2, depthTest: false,
        });
        const curtain = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
        curtain.renderOrder = 1;
        curtain.visible = false;
        return curtain;
    }
}