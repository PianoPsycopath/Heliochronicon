// js/navigation/EphemerisAdapter.js

import { OrbitalMath } from '@physics/OrbitalMath.js';

const DEFAULT_VELOCITY_STEP_DAYS = 1e-3;

export class EphemerisAdapter {
    /**
     * @param {object} bodyData 
     * @param {number} daysSinceJ2000
     * @param {object} [options]
     * @param {number} [options.stepDays]
     * @returns {{
     *   position: {x:number, y:number, z:number},
     *   velocity: {x:number, y:number, z:number}
     * }}
     */
    static getState(bodyData, daysSinceJ2000, { stepDays = DEFAULT_VELOCITY_STEP_DAYS } = {}) {
        if (!bodyData || typeof bodyData !== 'object') {
            throw new Error('EphemerisAdapter.getState requires a bodyData object');
        }
        if (typeof daysSinceJ2000 !== 'number' || Number.isNaN(daysSinceJ2000)) {
            throw new Error('EphemerisAdapter.getState requires a numeric daysSinceJ2000');
        }
        if (typeof stepDays !== 'number' || Number.isNaN(stepDays) || stepDays <= 0) {
            throw new Error('EphemerisAdapter.getState requires a positive numeric stepDays');
        }

        const position = OrbitalMath.calculatePosition(bodyData, daysSinceJ2000);
        const velocity = EphemerisAdapter.getVelocity(bodyData, daysSinceJ2000, { stepDays });

        return { position, velocity };
    }

    /**
     * @param {object} bodyData
     * @param {number} daysSinceJ2000
     * @returns {{x:number, y:number, z:number}}
     */
    static getPosition(bodyData, daysSinceJ2000) {
        if (!bodyData || typeof bodyData !== 'object') {
            throw new Error('EphemerisAdapter.getPosition requires a bodyData object');
        }
        if (typeof daysSinceJ2000 !== 'number' || Number.isNaN(daysSinceJ2000)) {
            throw new Error('EphemerisAdapter.getPosition requires a numeric daysSinceJ2000');
        }

        return OrbitalMath.calculatePosition(bodyData, daysSinceJ2000);
    }

    /**
     * @param {object} bodyData
     * @param {number} daysSinceJ2000
     * @param {object} [options]
     * @param {number} [options.stepDays]
     * @returns {{x:number, y:number, z:number}}
     */
    static getVelocity(bodyData, daysSinceJ2000, { stepDays = DEFAULT_VELOCITY_STEP_DAYS } = {}) {
        if (!bodyData || typeof bodyData !== 'object') {
            throw new Error('EphemerisAdapter.getVelocity requires a bodyData object');
        }
        if (typeof daysSinceJ2000 !== 'number' || Number.isNaN(daysSinceJ2000)) {
            throw new Error('EphemerisAdapter.getVelocity requires a numeric daysSinceJ2000');
        }
        if (typeof stepDays !== 'number' || Number.isNaN(stepDays) || stepDays <= 0) {
            throw new Error('EphemerisAdapter.getVelocity requires a positive numeric stepDays');
        }

        const before = OrbitalMath.calculatePosition(bodyData, daysSinceJ2000 - stepDays);
        const after = OrbitalMath.calculatePosition(bodyData, daysSinceJ2000 + stepDays);

        return {
            x: (after.x - before.x) / (2 * stepDays),
            y: (after.y - before.y) / (2 * stepDays),
            z: (after.z - before.z) / (2 * stepDays),
        };
    }
}