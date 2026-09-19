// js/navigation/ArrivalCapture.js

import { TransferAssembler } from '@navigation/TransferAssembler.js';
import { AU_PER_DAY_IN_KM_PER_S } from '@navigation/FleetPropagator.js';
import { AU_IN_KM } from '@core/constants.js';

const NEAR_ZERO = 1e-12;
const ECLIPTIC_NORTH = { x: 0, y: 1, z: 0 };

function isVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function requireVector3(v, label) {
    if (!isVector3(v)) {
        throw new Error(`ArrivalCapture requires "${label}" to be a finite { x, y, z } vector`);
    }
}

function requirePositiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`ArrivalCapture requires a positive numeric "${label}"`);
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

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v, label) {
    const length = magnitude(v);
    if (length < NEAR_ZERO) {
        throw new Error(`ArrivalCapture cannot normalize a zero-length "${label}"`);
    }
    return scale(v, 1 / length);
}

/** Rodrigues rotation of `v` about unit axis `axis` by `angle` radians. */
function rotateAboutAxis(v, axis, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const term = dot(axis, v) * (1 - cosA);
    const perpendicular = cross(axis, v);
    return {
        x: v.x * cosA + perpendicular.x * sinA + axis.x * term,
        y: v.y * cosA + perpendicular.y * sinA + axis.y * term,
        z: v.z * cosA + perpendicular.z * sinA + axis.z * term,
    };
}

/**
 * Solve the capture hyperbola and the resulting circularization burn.
 *
 * @param {object} params
 * @param {{x:number,y:number,z:number}} params.vInfinity - km/s, body-centric.
 *   The velocity the ship has relative to the target body far outside its
 *   sphere of influence (i.e. -1 times the raw arrival burn's implied
 *   relative velocity
 * @param {number} params.muKm3PerS2 - target body's gravitational parameter
 * @param {number} params.parkingRadiusKm - desired circular parking radius
 *   (body radius + altitude)
 * @returns {{
 *   periapsisPosition: {x:number,y:number,z:number},
 *   circularVelocity: {x:number,y:number,z:number},
 *   deltaV: {x:number,y:number,z:number},
 *   deltaVMagnitudeKmS: number,
 *   periapsisSpeedKmS: number,
 *   circularSpeedKmS: number,
 *   eccentricity: number,
 *   orbitNormal: {x:number,y:number,z:number}
 * }}
 */
export function computeCapture({ vInfinity, muKm3PerS2, parkingRadiusKm }) {
    requireVector3(vInfinity, 'vInfinity');
    requirePositiveNumber(muKm3PerS2, 'muKm3PerS2');
    requirePositiveNumber(parkingRadiusKm, 'parkingRadiusKm');

    const vInfSpeed = magnitude(vInfinity);
    if (vInfSpeed < NEAR_ZERO) {
        throw new Error(
            'ArrivalCapture requires a non-zero v-infinity: a transfer that arrives with no ' +
                'excess velocity has no incoming hyperbola to capture from'
        );
    }

    const vInfUnit = normalize(vInfinity, 'vInfinity');
    let orbitNormal;
    const eclipticAlongApproach = dot(ECLIPTIC_NORTH, vInfUnit);
    const eclipticRejection = subtract(ECLIPTIC_NORTH, scale(vInfUnit, eclipticAlongApproach));
    if (magnitude(eclipticRejection) < NEAR_ZERO) {
        const fallbackReference = Math.abs(vInfUnit.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
        orbitNormal = normalize(cross(vInfUnit, fallbackReference), 'capture orbit normal');
    } else {
        orbitNormal = normalize(eclipticRejection, 'capture orbit normal');
    }

    const periapsisSpeedKmS = Math.sqrt(vInfSpeed * vInfSpeed + (2 * muKm3PerS2) / parkingRadiusKm);
    const eccentricity = 1 + (parkingRadiusKm * vInfSpeed * vInfSpeed) / muKm3PerS2;
    const asymptoteTrueAnomalyRad = Math.acos(-1 / eccentricity);

    const asymptoteDirection = scale(vInfUnit, -1);
    const periapsisDirection = rotateAboutAxis(asymptoteDirection, orbitNormal, asymptoteTrueAnomalyRad);
    const periapsisPosition = scale(periapsisDirection, parkingRadiusKm);

    // Prograde in-plane direction at periapsis.
    const alongTrack = normalize(cross(orbitNormal, periapsisDirection), 'along-track direction');

    const circularSpeedKmS = Math.sqrt(muKm3PerS2 / parkingRadiusKm);
    const hyperbolicVelocityAtPeriapsis = scale(alongTrack, periapsisSpeedKmS);
    const circularVelocity = scale(alongTrack, circularSpeedKmS);

    // Retrograde burn
    const deltaV = subtract(circularVelocity, hyperbolicVelocityAtPeriapsis);

    return {
        periapsisPosition,
        circularVelocity,
        deltaV,
        deltaVMagnitudeKmS: periapsisSpeedKmS - circularSpeedKmS,
        periapsisSpeedKmS,
        circularSpeedKmS,
        eccentricity,
        orbitNormal,
    };
}

/**
 * @param {object} params
 * @param {object} params.plan - candidate FlightPlan (AU/day vectors)
 * @param {object} params.fleet - fleet with ships + fuelRemaining (post-
 *   departure
 * @param {number} params.targetRadiusKm - target body's physical radius
 * @param {number} params.parkingAltitudeKm - desired altitude above the
 *   target body's surface for the captured parking orbit
 * @param {number} params.muTargetKm3PerS2 - target body's gravitational parameter
 * @param {number} [params.standardGravityMS2]
 * @returns {object} a new plan; the input is not mutated
 */
export function applyArrivalCapture({
    plan,
    fleet,
    targetRadiusKm,
    parkingAltitudeKm,
    muTargetKm3PerS2,
    standardGravityMS2,
}) {
    if (!plan || !Array.isArray(plan.burns) || plan.burns.length < 2) return plan;

    const arrivalBurn = plan.burns[plan.burns.length - 1];
    if (!isVector3(arrivalBurn?.deltaV)) return plan;
    if (!isVector3(plan.arrivalVelocity)) return plan;
    if (!isVector3(plan.arrivalPosition)) return plan;

    const vInfinity = {
        x: -arrivalBurn.deltaV.x * AU_PER_DAY_IN_KM_PER_S,
        y: -arrivalBurn.deltaV.y * AU_PER_DAY_IN_KM_PER_S,
        z: -arrivalBurn.deltaV.z * AU_PER_DAY_IN_KM_PER_S,
    };

    const parkingRadiusKm = targetRadiusKm + parkingAltitudeKm;

    const capture = computeCapture({
        vInfinity,
        muKm3PerS2: muTargetKm3PerS2,
        parkingRadiusKm,
    });

    const arrivalDv = capture.deltaVMagnitudeKmS;
    const departureDv = (plan.departureDv ?? 0);
    const totalDv = departureDv + arrivalDv;

    const propellantRequired = TransferAssembler.computePropellantRequired({
        fleet,
        totalDeltaV: totalDv,
        standardGravityMS2,
        velocityUnitToMetersPerSecond: 1000,
    });

    const fuelRemaining = fleet.fuelRemaining;
    const isFeasible = propellantRequired <= fuelRemaining;
    const fuelWarning = isFeasible
        ? null
        : `Insufficient fuel: transfer requires ${propellantRequired.toFixed(2)}, ` +
          `fleet has ${fuelRemaining.toFixed(2)} remaining`;

    const captureBurnPositionAu = {
        x: plan.arrivalPosition.x + capture.periapsisPosition.x / AU_IN_KM,
        y: plan.arrivalPosition.y + capture.periapsisPosition.y / AU_IN_KM,
        z: plan.arrivalPosition.z + capture.periapsisPosition.z / AU_IN_KM,
    };

    if (!isVector3(captureBurnPositionAu)) {
        throw new Error(
            'ArrivalCapture produced a non-finite burn position ' +
                '(check AU_IN_KM and plan.arrivalPosition units)'
        );
    }

    const burns = [
        ...plan.burns.slice(0, -1),
        {
            ...arrivalBurn,
            deltaV: {
                x: capture.deltaV.x / AU_PER_DAY_IN_KM_PER_S,
                y: capture.deltaV.y / AU_PER_DAY_IN_KM_PER_S,
                z: capture.deltaV.z / AU_PER_DAY_IN_KM_PER_S,
            },
            position: captureBurnPositionAu,
        },
    ];

    const warnings = [
        ...(Array.isArray(plan.warnings) ? plan.warnings.filter((w) => w !== plan.fuelWarning) : []),
    ];
    if (fuelWarning) warnings.push(fuelWarning);

    return {
        ...plan,
        burns,
        arrivalDv,
        totalDv,
        totalDeltaV: totalDv,
        propellantRequired,
        fuelRemainingAfter: fuelRemaining - propellantRequired,
        isFeasible,
        fuelWarning,
        warnings,
        capture: {
            parentBody: plan.target?.bodyName ?? null,
            positionKm: capture.periapsisPosition,
            velocityKm: capture.circularVelocity,
            parkingRadiusKm,
            eccentricity: capture.eccentricity,
        },
    };
}