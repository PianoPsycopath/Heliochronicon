// js/navigation/OsculatingOrbit.js

const NEAR_ZERO = 1e-9;

function isVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function requireVector3(v, label) {
    if (!isVector3(v)) {
        throw new Error(`OsculatingOrbit requires "${label}" to be a finite { x, y, z } vector`);
    }
}

function requirePositiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`OsculatingOrbit requires a positive numeric "${label}"`);
    }
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function magnitude(v) {
    return Math.sqrt(dot(v, v));
}

function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v, label) {
    const length = magnitude(v);
    if (length < NEAR_ZERO) {
        throw new Error(`OsculatingOrbit cannot normalize a zero-length "${label}"`);
    }
    return scale(v, 1 / length);
}

/**
 * @param {object} params
 * @param {{x:number,y:number,z:number}} params.position - relative to the parent
 * @param {{x:number,y:number,z:number}} params.velocity - relative to the parent
 * @param {number} params.muPerUnit - parent's gravitational parameter, in
 *   units consistent with position/velocity
 * @returns {{
 *   eccentricity: number,
 *   semiLatusRectum: number,
 *   semiMajorAxis: number,
 *   isHyperbolic: boolean,
 *   periapsisDirection: {x:number,y:number,z:number},
 *   alongTrackAtPeriapsis: {x:number,y:number,z:number},
 *   orbitNormal: {x:number,y:number,z:number},
 *   currentTrueAnomalyRad: number
 * }}
 */
export function computeOsculatingOrbit({ position, velocity, muPerUnit }) {
    requireVector3(position, 'position');
    requireVector3(velocity, 'velocity');
    requirePositiveNumber(muPerUnit, 'muPerUnit');

    const rMag = magnitude(position);
    requirePositiveNumber(rMag, 'position magnitude');

    const h = cross(position, velocity);
    const hMag = magnitude(h);
    if (hMag < NEAR_ZERO) {
        throw new Error(
            'OsculatingOrbit cannot handle a purely radial state (zero angular momentum): ' +
                'position and velocity are parallel'
        );
    }
    const orbitNormal = scale(h, 1 / hMag);

    const speedSq = dot(velocity, velocity);
    const semiLatusRectum = (hMag * hMag) / muPerUnit;

    // Eccentricity vector: e = ((v^2 - mu/r) r - (r·v) v) / mu — points from
    // the parent toward periapsis, magnitude = eccentricity.
    const eccentricityVector = scale(
        subtract(scale(position, speedSq - muPerUnit / rMag), scale(velocity, dot(position, velocity))),
        1 / muPerUnit
    );
    const eccentricity = magnitude(eccentricityVector);

    const energy = speedSq / 2 - muPerUnit / rMag;
    const isHyperbolic = eccentricity >= 1 || energy > 0;
    const semiMajorAxis = Math.abs(energy) > NEAR_ZERO ? -muPerUnit / (2 * energy) : Infinity;

    const periapsisDirection =
        eccentricity > NEAR_ZERO
            ? normalize(eccentricityVector, 'eccentricity vector')
            : normalize(position, 'position (circular-orbit reference)');
    const alongTrackAtPeriapsis = normalize(cross(orbitNormal, periapsisDirection), 'along-track direction');

    const cosTrueAnomaly = Math.min(1, Math.max(-1, dot(periapsisDirection, position) / rMag));
    const sinSign = dot(alongTrackAtPeriapsis, position) >= 0 ? 1 : -1;
    const currentTrueAnomalyRad = sinSign * Math.acos(cosTrueAnomaly);

    return {
        eccentricity,
        semiLatusRectum,
        semiMajorAxis,
        isHyperbolic,
        periapsisDirection,
        alongTrackAtPeriapsis,
        orbitNormal,
        currentTrueAnomalyRad,
    };
}

export function positionAtTrueAnomaly(orbit, trueAnomalyRad) {
    const { semiLatusRectum, eccentricity, periapsisDirection, alongTrackAtPeriapsis } = orbit;
    const radius = semiLatusRectum / (1 + eccentricity * Math.cos(trueAnomalyRad));
    return add(
        scale(periapsisDirection, radius * Math.cos(trueAnomalyRad)),
        scale(alongTrackAtPeriapsis, radius * Math.sin(trueAnomalyRad))
    );
}

export function trueAnomalyAtRadius(orbit, radius) {
    const { semiLatusRectum, eccentricity } = orbit;
    if (eccentricity < NEAR_ZERO) {
        // Circular: radius is constant: either always at, or never at.
        return Math.abs(semiLatusRectum - radius) < NEAR_ZERO ? 0 : null;
    }
    const cosValue = (semiLatusRectum / radius - 1) / eccentricity;
    if (cosValue < -1 || cosValue > 1) return null;
    return Math.acos(cosValue);
}

/**
 * @param {object} orbit - result of computeOsculatingOrbit
 * @param {object} params
 * @param {number} [params.samples]
 * @param {number} [params.boundaryRadius] - required when orbit.isHyperbolic
 * @returns {{
 *   points: {x:number,y:number,z:number}[],
 *   boundaryPoints: {x:number,y:number,z:number}[] | null
 * }}
 */
export function sampleConic(orbit, { samples = 180, boundaryRadius = null } = {}) {
    if (!orbit.isHyperbolic) {
        const points = [];
        for (let i = 0; i <= samples; i += 1) {
            const trueAnomalyRad = (2 * Math.PI * i) / samples;
            points.push(positionAtTrueAnomaly(orbit, trueAnomalyRad));
        }
        return { points, boundaryPoints: null };
    }

    if (!Number.isFinite(boundaryRadius) || boundaryRadius <= 0) {
        throw new Error('sampleConic requires a positive "boundaryRadius" for a hyperbolic orbit');
    }

    const thetaMax = trueAnomalyAtRadius(orbit, boundaryRadius);
    if (thetaMax === null) {
        throw new Error(
            'sampleConic could not find where this hyperbola crosses the given boundary radius'
        );
    }

    const points = [];
    for (let i = 0; i <= samples; i += 1) {
        const trueAnomalyRad = -thetaMax + (2 * thetaMax * i) / samples;
        points.push(positionAtTrueAnomaly(orbit, trueAnomalyRad));
    }

    const boundaryPoints = [positionAtTrueAnomaly(orbit, -thetaMax), positionAtTrueAnomaly(orbit, thetaMax)];

    return { points, boundaryPoints };
}