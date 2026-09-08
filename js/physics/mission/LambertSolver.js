import { createImpulsiveTransferSolver } from './ImpulsiveTransferSolver.js';
import { createSolverDefinition } from './SolverDefinition.js';
import { TARGET_TYPES } from './TargetDefinition.js';
import { assert, assertVector3, assertFiniteNumber, assertOneOf, deepFreeze } from './validation.js';
import { propagateStateVector } from './KeplerPropagator.js';

export const LAMBERT_ROUTES = ['SHORT', 'LONG', 'PROGRADE', 'RETROGRADE'];

function stumpffC(z) {
    if (Math.abs(z) < 1e-6) return 1 / 2 - z / 24 + (z * z) / 720;
    if (z > 0) {
        const sz = Math.sqrt(z);
        return (1 - Math.cos(sz)) / z;
    }
    const sz = Math.sqrt(-z);
    return (Math.cosh(sz) - 1) / (-z);
}

function stumpffS(z) {
    if (Math.abs(z) < 1e-6) return 1 / 6 - z / 120 + (z * z) / 5040;
    if (z > 0) {
        const sz = Math.sqrt(z);
        return (sz - Math.sin(sz)) / (sz * sz * sz);
    }
    const sz = Math.sqrt(-z);
    return (Math.sinh(sz) - sz) / (sz * sz * sz);
}

function mag(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

export function solveLambertMath(pos1, pos2, dt, mu, route = 'PROGRADE') {
    assertVector3(pos1, 'solveLambertMath.pos1');
    assertVector3(pos2, 'solveLambertMath.pos2');
    assertFiniteNumber(dt, 'solveLambertMath.dt');
    assertFiniteNumber(mu, 'solveLambertMath.mu');
    assertOneOf(route, LAMBERT_ROUTES, 'solveLambertMath.route');
    assert(dt > 0, 'solveLambertMath.dt must be positive');

    const r1 = mag(pos1);
    const r2 = mag(pos2);
    const c_vec = cross(pos1, pos2);

    let cos_theta = dot(pos1, pos2) / (r1 * r2);
    cos_theta = Math.max(-1, Math.min(1, cos_theta));
    const theta0 = Math.acos(cos_theta);

    if (Math.abs(Math.sin(theta0)) < 1e-10) {
        throw new Error("Lambert 0 or 180-degree transfer is singular without a specified plane normal.");
    }

    let isLong = false;
    if (route === 'SHORT') {
        isLong = false;
    } else if (route === 'LONG') {
        isLong = true;
    } else if (route === 'PROGRADE') {
        isLong = c_vec.z < 0;
    } else if (route === 'RETROGRADE') {
        isLong = c_vec.z >= 0;
    }

    const dTheta = isLong ? 2 * Math.PI - theta0 : theta0;
    const A = Math.sin(dTheta) * Math.sqrt((r1 * r2) / (1 - Math.cos(dTheta)));

    let z = 0;
    let z_up = 4 * Math.PI * Math.PI;
    let z_low = null;
    let iterations = 0;
    const maxIterations = 1000;
    const tol = 1e-8;
    let y = 0;
    let t = 0;

    while (iterations < maxIterations) {
        const c = stumpffC(z);
        const s = stumpffS(z);
        y = r1 + r2 + A * (z * s - 1) / Math.sqrt(c);

        if (y < 0) {
            z_low = z;
            z = z_up !== null ? (z_low + z_up) / 2 : z + 10;
            iterations++;
            continue;
        }

        const x = Math.sqrt(y / c);
        t = (Math.pow(x, 3) * s + A * Math.sqrt(y)) / Math.sqrt(mu);

        if (Math.abs(t - dt) < tol) {
            break;
        }

        if (t <= dt) {
            z_low = z;
            z = (z_low + z_up) / 2;
        } else {
            z_up = z;
            z = z_low !== null ? (z_low + z_up) / 2 : z - 10;
        }
        iterations++;
    }

    if (iterations >= maxIterations) {
        throw new Error("Lambert solver failed to converge");
    }

    const f = 1 - y / r1;
    const g = A * Math.sqrt(y / mu);
    const gDot = 1 - y / r2;

    const v1 = {
        x: (pos2.x - f * pos1.x) / g,
        y: (pos2.y - f * pos1.y) / g,
        z: (pos2.z - f * pos1.z) / g
    };

    const v2 = {
        x: (gDot * pos2.x - pos1.x) / g,
        y: (gDot * pos2.y - pos1.y) / g,
        z: (gDot * pos2.z - pos1.z) / g
    };

    return { v1, v2, iterations, finalZ: z, residualT: Math.abs(t - dt) };
}

export const lambertSolverDefinition = createSolverDefinition({
    id: 'LAMBERT_UNIVERSAL',
    name: 'Lambert Universal Variables Solver',
    family: 'IMPULSIVE',
    supportedTargetTypes: TARGET_TYPES,
    capabilities: ['INTERCEPT', 'RENDEZVOUS']
});

export const LambertSolver = createImpulsiveTransferSolver({
    definition: lambertSolverDefinition,
    solve: (request) => {
        const { departureState, arrivalState, route = 'PROGRADE', sampleCount = 60 } = request;
        
        assert(departureState !== null && typeof departureState === 'object', 'LambertSolver: departureState is required');
        assert(arrivalState !== null && typeof arrivalState === 'object', 'LambertSolver: arrivalState is required');

        const dt = arrivalState.epoch_daysSinceJ2000 - departureState.epoch_daysSinceJ2000;
        assert(dt > 0, 'LambertSolver: arrival time must be strictly after departure time');
        assert(departureState.mu === arrivalState.mu, 'LambertSolver: mu must match between states');

        const mu = departureState.mu;
        const { v1, v2, iterations, finalZ, residualT } = solveLambertMath(
            departureState.position,
            arrivalState.position,
            dt,
            mu,
            route
        );

        const vSub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
        const vMag = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

        // Calculate Delta-V relative to the bounding orbital states.
        // arrivalDeltaV uses rendezvous form (target velocity minus arrival velocity).
        const departureDeltaV = vSub(v1, departureState.velocity);
        const arrivalDeltaV = vSub(arrivalState.velocity, v2);

        const departureDeltaVMagnitude = vMag(departureDeltaV);
        const arrivalDeltaVMagnitude = vMag(arrivalDeltaV);
        const totalDeltaVMagnitude = departureDeltaVMagnitude + arrivalDeltaVMagnitude;

        const trajectorySamples = [];
        const step = dt / sampleCount;
        for (let i = 0; i <= sampleCount; i++) {
            const t = i * step;
            const state = propagateStateVector(departureState.position, v1, mu, t);
            trajectorySamples.push({
                time_daysSinceJ2000: departureState.epoch_daysSinceJ2000 + t,
                position: state.position,
                velocity: state.velocity
            });
        }

        // Returns an intermediate mapping shape for Phase 1. 
        // Cannot construct a full Phase 1 MissionSolution here as propellant/Isp calculations belong in Phase 5.
        return deepFreeze({
            departureState,
            arrivalState,
            transferDepartureVelocity: v1,
            transferArrivalVelocity: v2,
            departureDeltaV,
            arrivalDeltaV,
            departureDeltaVMagnitude,
            arrivalDeltaVMagnitude,
            totalDeltaVMagnitude,
            trajectorySamples,
            timeOfFlight_days: dt,
            solverMetadata: {
                iterations,
                route,
                converged: true,
                finalZ,
                residualT
            }
        });
    }
});