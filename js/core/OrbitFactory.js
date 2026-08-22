// js/core/OrbitFactory.js
import { OrbitalMath, kmToAU } from '@physics/OrbitalMath.js';
import * as THREE from 'three';

const ORBIT_RESOLUTION = 720;

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
                const pos = OrbitalMath.calcPosFromM(
                    scaledA,
                    data.e,
                    data.i,
                    data.w,
                    data.Node,
                    (j / ORBIT_RESOLUTION) * Math.PI * 2
                );
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        }

        let lw = 1;
        if (data.datasetCategory === 'PLANET') lw = 3;
        else if (data.datasetCategory === 'MOON') lw = 2;

        const mat = new THREE.LineBasicMaterial({
            color: 0xff1111,
            transparent: true,
            opacity: 0.5,
            depthTest: false,
            linewidth: lw,
        });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
        line.renderOrder = 2;
        return line;
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
