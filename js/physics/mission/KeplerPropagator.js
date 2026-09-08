// js/physics/mission/KeplerPropagator.js
import { assert, assertFiniteNumber, assertVector3, deepFreeze } from './validation.js';

const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-8;

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(a) {
    return Math.sqrt(dot(a, a));
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a, s) {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/**
 * Stumpff functions C(z) and S(z), with series fallbacks near z = 0 to avoid the 0/0
 * indeterminate form in the closed-form branches.
 */
function stumpffC(z) {
    if (Math.abs(z) < 1e-6) {
        return 1 / 2 - z / 24 + (z * z) / 720;
    }
    if (z > 0) {
        const sz = Math.sqrt(z);
        return (1 - Math.cos(sz)) / z;
    }
    const sz = Math.sqrt(-z);
    return (Math.cosh(sz) - 1) / -z;
}

function stumpffS(z) {
    if (Math.abs(z) < 1e-6) {
        return 1 / 6 - z / 120 + (z * z) / 5040;
    }
    if (z > 0) {
        const sz = Math.sqrt(z);
        return (sz - Math.sin(sz)) / Math.pow(sz, 3);
    }
    const sz = Math.sqrt(-z);
    return (Math.sinh(sz) - sz) / Math.pow(sz, 3);
}

/**
 * Propagates a state vector (position, velocity) forward or backward by dt using the
 * universal-variable formulation of Kepler's equation (Curtis, "Orbital Mechanics for
 * Engineering Students", Algorithm 3.3). Unlike OrbitalMath.solveKepler, this handles
 * elliptical, parabolic, and hyperbolic orbits uniformly via a single universal anomaly,
 * which impulsive transfer solvers need for both bound and unbound (flyby / escape)
 * trajectory arcs. It intentionally does not reuse OrbitalMath.solveKepler, which is
 * elliptical-only (it caps eccentricity at 0.9999) and works from mean anomaly rather
 * than from an (r, v) state vector.
 *
 * @param {{x:number,y:number,z:number}} position - initial position vector
 * @param {{x:number,y:number,z:number}} velocity - initial velocity vector
 * @param {number} mu - gravitational parameter, in units consistent with position/velocity/dt
 * @param {number} dt - propagation interval, in the same time unit implied by mu (may be negative)
 * @returns {{position:{x,y,z}, velocity:{x,y,z}}}
 */
export function propagateStateVector(position, velocity, mu, dt) {
    assertVector3(position, 'propagateStateVector.position');
    assertVector3(velocity, 'propagateStateVector.velocity');
    assertFiniteNumber(mu, 'propagateStateVector.mu');
    assert(mu > 0, 'propagateStateVector.mu must be positive');
    assertFiniteNumber(dt, 'propagateStateVector.dt');

    if (dt === 0) {
        return deepFreeze({ position: { ...position }, velocity: { ...velocity } });
    }

    const r0 = magnitude(position);
    const v0 = magnitude(velocity);
    assert(r0 > 1e-10, 'propagateStateVector: position must be non-zero');

    const vr0 = dot(position, velocity) / r0;
    const alpha = 2 / r0 - (v0 * v0) / mu;
    const sqrtMu = Math.sqrt(mu);

    let chi = sqrtMu * Math.abs(alpha) * dt;
    if (Math.abs(alpha) < 1e-10) {
        // Near-parabolic: fall back to an angular-momentum based initial guess.
        const h_vec = { x: position.y * velocity.z - position.z * velocity.y,
            y: position.z * velocity.x - position.x * velocity.z,
            z: position.x * velocity.y - position.y * velocity.x };
        const h = magnitude(h_vec);
        const p = (h * h) / mu;
        chi = Math.sign(dt) * Math.sqrt(p);
    }

    let ratio = Infinity;
    let iterations = 0;
    while (Math.abs(ratio) > TOLERANCE && iterations < MAX_ITERATIONS) {
        const z = alpha * chi * chi;
        const C = stumpffC(z);
        const S = stumpffS(z);

        const f = (r0 * vr0 / sqrtMu) * chi * chi * C +
            (1 - alpha * r0) * chi * chi * chi * S +
            r0 * chi - sqrtMu * dt;
        const fPrime = (r0 * vr0 / sqrtMu) * chi * (1 - alpha * chi * chi * S) +
            (1 - alpha * r0) * chi * chi * C + r0;

        ratio = f / fPrime;
        chi -= ratio;
        iterations += 1;
    }
    assert(iterations < MAX_ITERATIONS, 'propagateStateVector: universal anomaly failed to converge');

    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);

    const f = 1 - (chi * chi / r0) * C;
    const g = dt - (Math.pow(chi, 3) / sqrtMu) * S;

    const newPosition = add(scale(position, f), scale(velocity, g));
    const r = magnitude(newPosition);
    assert(r > 1e-10, 'propagateStateVector: propagated position degenerated to zero');

    const fDot = (sqrtMu / (r * r0)) * (alpha * Math.pow(chi, 3) * S - chi);
    const gDot = 1 - (chi * chi / r) * C;

    const newVelocity = add(scale(position, fDot), scale(velocity, gDot));

    return deepFreeze({ position: newPosition, velocity: newVelocity });
}
