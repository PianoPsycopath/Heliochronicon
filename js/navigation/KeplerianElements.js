// js/navigation/KeplerianElements.js

const KEPLER_SOLVER_TOLERANCE_RAD = 1e-12;
const KEPLER_SOLVER_MAX_ITERATIONS = 100;

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`KeplerianElements requires a finite numeric "${label}"`);
    }
}

function normalizeAngleRad(angleRad) {
    const twoPi = 2 * Math.PI;
    return ((angleRad % twoPi) + twoPi) % twoPi;
}

/**
 * @param {number} meanAnomalyRad
 * @param {number} eccentricity
 * @returns {number} eccentric anomaly, radians
 */
export function solveEccentricAnomaly(meanAnomalyRad, eccentricity) {
    requireFiniteNumber(meanAnomalyRad, 'meanAnomalyRad');
    requireFiniteNumber(eccentricity, 'eccentricity');
    if (eccentricity < 0 || eccentricity >= 1) {
        throw new Error('solveEccentricAnomaly requires an elliptical eccentricity in [0, 1)');
    }

    const M = normalizeAngleRad(meanAnomalyRad);
    let E = eccentricity < 0.8 ? M : Math.PI;

    for (let i = 0; i < KEPLER_SOLVER_MAX_ITERATIONS; i++) {
        const delta = (E - eccentricity * Math.sin(E) - M) / (1 - eccentricity * Math.cos(E));
        E -= delta;
        if (Math.abs(delta) < KEPLER_SOLVER_TOLERANCE_RAD) break;
    }

    return E;
}

/**
 * @param {object} params
 * @param {number} params.aKm - semi-major axis, km
 * @param {number} params.e - eccentricity, [0, 1)
 * @param {number} params.iRad - inclination, radians
 * @param {number} params.raanRad - right ascension of the ascending node, radians
 * @param {number} params.argPeriapsisRad - argument of periapsis, radians
 * @param {number} params.meanAnomalyRad - mean anomaly at the stated epoch, radians
 * @param {number} params.muKm3PerS2 - parent body's gravitational parameter
 * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
 *   parent-centered, km and km/s
 */
export function stateVectorFromKeplerianElements({
    aKm,
    e,
    iRad,
    raanRad,
    argPeriapsisRad,
    meanAnomalyRad,
    muKm3PerS2,
}) {
    requireFiniteNumber(aKm, 'aKm');
    requireFiniteNumber(e, 'e');
    requireFiniteNumber(iRad, 'iRad');
    requireFiniteNumber(raanRad, 'raanRad');
    requireFiniteNumber(argPeriapsisRad, 'argPeriapsisRad');
    requireFiniteNumber(meanAnomalyRad, 'meanAnomalyRad');
    requireFiniteNumber(muKm3PerS2, 'muKm3PerS2');
    if (aKm <= 0) {
        throw new Error('stateVectorFromKeplerianElements requires a positive "aKm"');
    }
    if (e < 0 || e >= 1) {
        throw new Error('stateVectorFromKeplerianElements requires an elliptical "e" in [0, 1)');
    }
    if (muKm3PerS2 <= 0) {
        throw new Error('stateVectorFromKeplerianElements requires a positive "muKm3PerS2"');
    }

    const E = solveEccentricAnomaly(meanAnomalyRad, e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const oneMinusECosE = 1 - e * cosE;
    const sqrtOneMinusE2 = Math.sqrt(1 - e * e);

    // Perifocal frame (PQW): x toward periapsis, y 90deg ahead in the orbit plane.
    const perifocalPosition = {
        x: aKm * (cosE - e),
        y: aKm * sqrtOneMinusE2 * sinE,
    };

    const meanMotionRadPerSecond = Math.sqrt(muKm3PerS2 / (aKm * aKm * aKm));
    const perifocalVelocity = {
        x: (-aKm * meanMotionRadPerSecond * sinE) / oneMinusECosE,
        y: (aKm * meanMotionRadPerSecond * sqrtOneMinusE2 * cosE) / oneMinusECosE,
    };

    // Rotate perifocal -> parent-centered inertial frame:
    // R3(-raan) * R1(-i) * R3(-argPeriapsis)
    const cosRaan = Math.cos(raanRad);
    const sinRaan = Math.sin(raanRad);
    const cosI = Math.cos(iRad);
    const sinI = Math.sin(iRad);
    const cosArgP = Math.cos(argPeriapsisRad);
    const sinArgP = Math.sin(argPeriapsisRad);

    const r11 = cosRaan * cosArgP - sinRaan * sinArgP * cosI;
    const r12 = -cosRaan * sinArgP - sinRaan * cosArgP * cosI;
    const r21 = sinRaan * cosArgP + cosRaan * sinArgP * cosI;
    const r22 = -sinRaan * sinArgP + cosRaan * cosArgP * cosI;
    const r31 = sinArgP * sinI;
    const r32 = cosArgP * sinI;

    const zeroSafe = (value) => (value === 0 ? 0 : value);

    return {
        position: {
            x: zeroSafe(r11 * perifocalPosition.x + r12 * perifocalPosition.y),
            y: zeroSafe(r21 * perifocalPosition.x + r22 * perifocalPosition.y),
            z: zeroSafe(r31 * perifocalPosition.x + r32 * perifocalPosition.y),
        },
        velocity: {
            x: zeroSafe(r11 * perifocalVelocity.x + r12 * perifocalVelocity.y),
            y: zeroSafe(r21 * perifocalVelocity.x + r22 * perifocalVelocity.y),
            z: zeroSafe(r31 * perifocalVelocity.x + r32 * perifocalVelocity.y),
        },
    };
}