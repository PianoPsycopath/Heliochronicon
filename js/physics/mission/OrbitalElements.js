// js/physics/mission/OrbitalElements.js
import { OrbitalMath } from '@physics/OrbitalMath.js';
import { assert, assertFiniteNumber, assertVector3, deepFreeze } from './validation.js';

// This module works in the same right-handed (x, y, z) convention already produced by
// OrbitalMath.calcPosFromTrueAnomaly / calcPosFromM: ecliptic (X, Y, Z) is stored as
// (x, y, z) = (X, Z, -Y). That remapping is a fixed +90 degree rotation about the ecliptic
// X axis and is itself a proper (determinant +1) rotation, so classical vector-algebra
// element formulas apply unchanged provided the reference pole/direction are expressed in
// the same convention: K (orbital/ecliptic pole) = (0, 1, 0), I (reference/vernal-equinox
// direction) = (1, 0, 0), J = K x I = (0, 0, -1).
const K = { x: 0, y: 1, z: 0 };
const I = { x: 1, y: 0, z: 0 };

const EPSILON = 1e-10;

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

function scale(a, s) {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function magnitude(a) {
    return Math.sqrt(dot(a, a));
}

function normalize(a) {
    const m = magnitude(a);
    assert(m > EPSILON, 'OrbitalElements: cannot normalize a near-zero vector');
    return scale(a, 1 / m);
}

/**
 * Converts a heliocentric-style state vector (position, velocity, mu) into classical
 * orbital elements. Angles are returned in radians, consistent with how bodyData.w /
 * bodyData.Node / bodyData.i are already consumed by OrbitalMath (no separate deg-to-rad
 * step at the dispatch site).
 *
 * Degenerate geometries (equatorial and/or circular orbits) fall back to a defined
 * reference angle of 0 for the otherwise-undefined element rather than throwing, since
 * those cases are legitimate physical orbits.
 */
export function stateVectorToElements(position, velocity, mu) {
    assertVector3(position, 'stateVectorToElements.position');
    assertVector3(velocity, 'stateVectorToElements.velocity');
    assertFiniteNumber(mu, 'stateVectorToElements.mu');
    assert(mu > 0, 'stateVectorToElements.mu must be positive');

    const r = magnitude(position);
    const v = magnitude(velocity);
    assert(r > EPSILON, 'stateVectorToElements: position must be non-zero');

    const h_vec = cross(position, velocity);
    const h = magnitude(h_vec);
    assert(h > EPSILON, 'stateVectorToElements: degenerate (rectilinear) orbit is not supported');

    const n_vec = cross(K, h_vec);
    const n = magnitude(n_vec);

    const e_vec = sub(scale(cross(velocity, h_vec), 1 / mu), scale(position, 1 / r));
    const e = magnitude(e_vec);

    const energy = (v * v) / 2 - mu / r;
    const isParabolic = Math.abs(e - 1) < EPSILON;
    const a = isParabolic ? Infinity : -mu / (2 * energy);

    const i = Math.acos(Math.min(1, Math.max(-1, h_vec.y / h)));

    let Node = 0;
    if (n > EPSILON) {
        Node = Math.acos(Math.min(1, Math.max(-1, n_vec.x / n)));
        // Quadrant check uses the J axis, which is (0, 0, -1) in this convention (see the
        // comment above), so "n . J < 0" becomes "n_vec.z > 0" rather than the more familiar
        // "n_vec.y < 0" from a standard (I, J, K) = (x, y, z) frame.
        if (n_vec.z > 0) Node = 2 * Math.PI - Node;
    }

    let argPeriapsis = 0;
    if (n > EPSILON && e > EPSILON) {
        argPeriapsis = Math.acos(Math.min(1, Math.max(-1, dot(n_vec, e_vec) / (n * e))));
        if (e_vec.y < 0) argPeriapsis = 2 * Math.PI - argPeriapsis;
    }

    let trueAnomaly = 0;
    if (e > EPSILON) {
        trueAnomaly = Math.acos(Math.min(1, Math.max(-1, dot(e_vec, position) / (e * r))));
        if (dot(position, velocity) < 0) trueAnomaly = 2 * Math.PI - trueAnomaly;
    } else {
        // Circular: measure from the node (or from I when also equatorial) toward position.
        const reference = n > EPSILON ? normalize(n_vec) : I;
        trueAnomaly = Math.acos(Math.min(1, Math.max(-1, dot(reference, position) / r)));
        if (position.y < 0) trueAnomaly = 2 * Math.PI - trueAnomaly;
    }

    return deepFreeze({ a, e, i, Node, argPeriapsis, trueAnomaly, mu });
}

/**
 * Converts classical orbital elements back into a state vector (position and velocity).
 * Position is delegated to the existing OrbitalMath.calcPosFromTrueAnomaly so the
 * elements -> position math has a single authority; velocity is derived here via the
 * standard perifocal velocity components rotated through the same rotation this module
 * documents above (OrbitalMath does not expose the rotation as a standalone function, so
 * the rotation coefficients are necessarily restated for the velocity half).
 */
export function elementsToStateVector({ a, e, i, Node, argPeriapsis, trueAnomaly, mu }) {
    assertFiniteNumber(a, 'elementsToStateVector.a');
    assertFiniteNumber(e, 'elementsToStateVector.e');
    assertFiniteNumber(i, 'elementsToStateVector.i');
    assertFiniteNumber(Node, 'elementsToStateVector.Node');
    assertFiniteNumber(argPeriapsis, 'elementsToStateVector.argPeriapsis');
    assertFiniteNumber(trueAnomaly, 'elementsToStateVector.trueAnomaly');
    assertFiniteNumber(mu, 'elementsToStateVector.mu');
    assert(mu > 0, 'elementsToStateVector.mu must be positive');
    assert(e < 1, 'elementsToStateVector: only elliptical elements (e < 1) are supported');

    const position = OrbitalMath.calcPosFromTrueAnomaly(a, e, i, argPeriapsis, Node, trueAnomaly);

    const p = a * (1 - e * e);
    assert(p > EPSILON, 'elementsToStateVector: semi-latus rectum must be positive');
    const h = Math.sqrt(mu * p);

    const xv_dot = (-mu / h) * Math.sin(trueAnomaly);
    const yv_dot = (mu / h) * (e + Math.cos(trueAnomaly));

    const cosW = Math.cos(argPeriapsis);
    const sinW = Math.sin(argPeriapsis);
    const cosNode = Math.cos(Node);
    const sinNode = Math.sin(Node);
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);

    const ast_x = (cosW * cosNode - sinW * sinNode * cosI) * xv_dot +
        (-sinW * cosNode - cosW * sinNode * cosI) * yv_dot;
    const ast_y = (cosW * sinNode + sinW * cosNode * cosI) * xv_dot +
        (-sinW * sinNode + cosW * cosNode * cosI) * yv_dot;
    const ast_z = sinW * sinI * xv_dot + cosW * sinI * yv_dot;

    const velocity = { x: ast_x, y: ast_z, z: -ast_y };

    return deepFreeze({ position, velocity });
}
