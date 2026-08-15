// js/EclipseEngine.js
import { OrbitalMath, kmToAU } from './OrbitalMath.js';
import { AU_IN_KM, JULIAN_CENTURY_DAYS, MAX_MOON_MOON_MEMBERS } from './constants.js';
import * as THREE from 'three';

const rad = Math.PI / 180;

export class EclipseEngine {
    static _scaledA(d, isMoon) {
        return (isMoon && d.a > 1000) ? kmToAU(d.a) : d.a;
    }
    static _radiusAU(d) {
        return d.radius_km > 0 ? d.radius_km / AU_IN_KM : (1.0 / AU_IN_KM);
    }
    static _poleQuaternion(d, daysSinceJ2000) {
        const T = daysSinceJ2000 / JULIAN_CENTURY_DAYS;
        const ra = (d.pole_ra + d.pole_ra_rate * T) * rad;
        const dec = (d.pole_dec + d.pole_dec_rate * T) * rad;
        const poleVec = new THREE.Vector3(
            Math.cos(dec) * Math.cos(ra), Math.sin(dec), -Math.cos(dec) * Math.sin(ra)
        ).normalize();
        return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleVec);
    }

    static _buildSnapshot(members, daysSinceJ2000) {
        const snapshot = new Map();
        const resolve = (d) => {
            if (snapshot.has(d.name)) return snapshot.get(d.name);
            let pos;
            if (d.parent === d.name) {
                pos = new THREE.Vector3(0, 0, 0);
            } else {
                // 1. ROUTE THROUGH THE NEW ANALYTICAL ROUTER
                const local = OrbitalMath.calculatePosition(d, daysSinceJ2000);
                let localVec = new THREE.Vector3(local.x, local.y, local.z);
            
                // 2. ONLY APPLY POLE QUATERNION TO STANDARD KEPLER MOONS
                // (Meeus/VSOP87 coordinates are already in Ecliptic space)
                if (d.category === 'MOON' && (!d.orbit_model || d.orbit_model === 'KEPLER')) {
                    localVec.applyQuaternion(this._poleQuaternion(d, daysSinceJ2000));
                }
            
                const parentData = members.find(b => b.name === d.parent);
                const parentPos = parentData ? resolve(parentData) : new THREE.Vector3(0, 0, 0);
                pos = localVec.add(parentPos);
            }
            snapshot.set(d.name, pos);
            return pos;
        };
        members.forEach(resolve);
        return snapshot;
    }

    static _findStar(d, allBodies) {
        let current = d;
        const visited = new Set();
        while (current && !visited.has(current.name)) {
            if (current.parent === current.name) return current;
            visited.add(current.name);
            current = allBodies.find(b => b.name === current.parent);
        }
        return null;
    }

    static _shadowTest(shadowedPos, occPos, occRadius, starPos, starRadius) {
        const axis = occPos.clone().sub(starPos);
        const D = axis.length();
        if (D < 1e-12) return null;
        axis.normalize();

        const rel = shadowedPos.clone().sub(occPos);
        const t = rel.dot(axis); 

        if (t <= 0) return null; 

        if (t > D * 0.10) return null;

        const perp = rel.clone().sub(axis.clone().multiplyScalar(t));
        const perpDist = perp.length();

        const rUmbra = occRadius - t * (starRadius - occRadius) / D;    
        const rPenumbra = occRadius + t * (starRadius + occRadius) / D; 

        return { perpDist, rUmbra, rPenumbra };
    }

    static _signalFromSnapshot(shadowed, occulter, star, snapshot) {
        const sPos = snapshot.get(shadowed.name);
        const oPos = snapshot.get(occulter.name);
        const starPos = snapshot.get(star.name);
        if (!sPos || !oPos || !starPos) return { signal: -1 };

        const starRadius = this._radiusAU(star);
        const result = this._shadowTest(sPos, oPos, this._radiusAU(occulter), starPos, starRadius);
        if (!result) return { signal: -1 };

        const { perpDist, rUmbra, rPenumbra } = result;

        const sRadius = this._radiusAU(shadowed);
        const signal = (rPenumbra + sRadius) - perpDist; // >0 = at least partial eclipse

        let type = 'PARTIAL';

        // Adjust totality/annularity strictness to ensure the whole body fits
        if (rUmbra >= 0 && (perpDist + sRadius) < rUmbra) type = 'TOTAL';
        else if (rUmbra < 0 && (perpDist + sRadius) < -rUmbra) type = 'ANNULAR';

        return { signal, type };
    }

    static getCandidatePairs(targetData, allBodies) {
        const isMoon = targetData.category === 'MOON';
        const systemName = isMoon ? targetData.parent : targetData.name;
        const planet = isMoon ? allBodies.find(b => b.name === systemName) : targetData;
        const moons = allBodies.filter(b => b.category === 'MOON' && b.parent === systemName);

        const moonMoonPool = [...moons]
            .sort((a, b) => (b.radius_km || 0) - (a.radius_km || 0))
            .slice(0, MAX_MOON_MOON_MEMBERS);

        const pairs = [];
        const addPair = (s, o) => { if (s && o && s.name !== o.name) pairs.push({ shadowed: s, occulter: o }); };

        for (const moon of moons) {
            addPair(moon, planet);
            addPair(planet, moon);
        }
        for (const a of moonMoonPool) {
            for (const b of moonMoonPool) {
                if (a.name !== b.name) addPair(a, b);
            }
        }

        if (isMoon) {
            return pairs.filter(p => p.shadowed.name === targetData.name || p.occulter.name === targetData.name);
        }
        return pairs;
    }

    static findNextEclipse(targetData, allBodies, fromDays, direction = 1) {
        const pairs = this.getCandidatePairs(targetData, allBodies);
        if (pairs.length === 0) return null;

        const star = this._findStar(targetData, allBodies);
        if (!star) return null;

        const members = [...new Set(pairs.flatMap(p => [p.shadowed, p.occulter]))];
        members.push(star);

        const periods = members
            .filter(d => d.parent !== d.name)
            .map(d => (2 * Math.PI) / Math.abs(d.n)); 
        const minPeriod = Math.min(...periods, 27);
        const step = Math.min(Math.max(0.005, minPeriod / 200), 0.02) * direction;
        const MAX_HORIZON_DAYS = 1500;

        let t = fromDays, steps = 0;
        t += step;
        steps++;

        let prevSnapshot = this._buildSnapshot(members, t);
        let prevSignals = pairs.map(p => this._signalFromSnapshot(p.shadowed, p.occulter, star, prevSnapshot).signal);
        
        while (Math.abs(t - fromDays) < MAX_HORIZON_DAYS && steps < 100000) {
            t += step;
            steps++;
            const snapshot = this._buildSnapshot(members, t);

            for (let i = 0; i < pairs.length; i++) {
                const { signal, type } = this._signalFromSnapshot(pairs[i].shadowed, pairs[i].occulter, star, snapshot);

                // This will trigger perfectly for the START of any overlapping eclipse
                if (prevSignals[i] <= 0 && signal > 0) {
                    let lo = t - step, hi = t;
                    for (let k = 0; k < 40; k++) {
                        const mid = (lo + hi) / 2;
                        const midSnap = this._buildSnapshot(members, mid);
                        const s = this._signalFromSnapshot(pairs[i].shadowed, pairs[i].occulter, star, midSnap).signal;
                        if (s > 0) hi = mid; else lo = mid;
                    }
                    return { days: direction > 0 ? hi : lo, ...pairs[i], type };
                }
                prevSignals[i] = signal;
            }
        }
        return null;
    }
}