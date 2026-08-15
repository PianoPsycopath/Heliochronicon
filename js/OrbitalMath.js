// js/OrbitalMath.js
import { MeeusMoon } from './MeeusMoon.js';
import { VSOP87 } from './vsop87.js';
import { AU_IN_KM, EARTH_MOON_MASS_RATIO } from './constants.js';

export function kmToAU(km) {
    return km / AU_IN_KM;
}
export class OrbitalMath {
    static calculatePosition(bodyData, daysSinceJ2000) {
        if (bodyData.orbit_model === 'MEEUS') {
            return MeeusMoon.getPosition(daysSinceJ2000);
        }

        if (bodyData.orbit_model === 'VSOP87') {
            const pos = VSOP87.getPosition(bodyData.name, daysSinceJ2000);

            // --- DYNAMIC BARYCENTER CORRECTION ---
            if (bodyData.barycenter_model === 'MEEUS') {
                const moonGeo = MeeusMoon.getPosition(daysSinceJ2000);
                const massRatio = bodyData.barycenter_mass_ratio || 1.0 / EARTH_MOON_MASS_RATIO;

                return {
                    x: pos.x - moonGeo.x * massRatio,
                    y: pos.y - moonGeo.y * massRatio,
                    z: pos.z - moonGeo.z * massRatio,
                };
            }
            return pos;
        }

        const current_w = bodyData.w + (bodyData.w_rate || 0) * daysSinceJ2000;
        const current_Node = bodyData.Node + (bodyData.node_rate || 0) * daysSinceJ2000;
        const M_current = bodyData.M0 + bodyData.n * daysSinceJ2000;

        return this.calcPosFromM(
            bodyData.a,
            bodyData.e,
            bodyData.i,
            current_w,
            current_Node,
            M_current
        );
    }
    static solveKepler(M, e) {
        const M_norm = M % (2 * Math.PI);
        const e_capped = Math.min(e, 0.9999);

        let E = M_norm + e_capped * Math.sin(M_norm) * (1.0 + e_capped * Math.cos(M_norm));

        for (let i = 0; i < 30; i++) {
            const f = E - e_capped * Math.sin(E) - M_norm;
            const fPrime = 1 - e_capped * Math.cos(E);

            let delta = f / fPrime;

            delta = Math.max(-1.0, Math.min(1.0, delta));

            E -= delta;

            if (Math.abs(delta) < 1e-6) break;
        }
        return E;
    }

    static calcPosFromM(scaledA, e, i_deg, w_deg, Node_deg, M) {
        const E = this.solveKepler(M, e);
        const xv = scaledA * (Math.cos(E) - e);
        const yv = scaledA * (Math.sqrt(1 - e * e) * Math.sin(E));

        // True Astronomical Ecliptic Coordinates
        const ast_x =
            (Math.cos(w_deg) * Math.cos(Node_deg) -
                Math.sin(w_deg) * Math.sin(Node_deg) * Math.cos(i_deg)) *
                xv +
            (-Math.sin(w_deg) * Math.cos(Node_deg) -
                Math.cos(w_deg) * Math.sin(Node_deg) * Math.cos(i_deg)) *
                yv;
        const ast_y =
            (Math.cos(w_deg) * Math.sin(Node_deg) +
                Math.sin(w_deg) * Math.cos(Node_deg) * Math.cos(i_deg)) *
                xv +
            (-Math.sin(w_deg) * Math.sin(Node_deg) +
                Math.cos(w_deg) * Math.cos(Node_deg) * Math.cos(i_deg)) *
                yv;
        const ast_z =
            Math.sin(w_deg) * Math.sin(i_deg) * xv + Math.cos(w_deg) * Math.sin(i_deg) * yv;

        //Right-Handed System
        return { x: ast_x, y: ast_z, z: -ast_y };
    }
}
