// js/physics/mission/OrbitalState.js
import { assert, assertFiniteNumber, assertVector3, deepFreeze } from './validation.js';

/**
 * Canonical orbital state-vector shape used by Phase 3+ propagation and solver modules:
 * a position/velocity pair tied to an epoch and a gravitational parameter. mu is carried
 * on the state itself (rather than threaded separately through every call) because a
 * state vector is only physically meaningful relative to the body it is gravitationally
 * bound to, and different legs of a mission (e.g. departure body vs. arrival body) can
 * have different mu.
 */
export function createOrbitalState({ position, velocity, epoch_daysSinceJ2000, mu }) {
    assertVector3(position, 'OrbitalState.position');
    assertVector3(velocity, 'OrbitalState.velocity');
    assertFiniteNumber(epoch_daysSinceJ2000, 'OrbitalState.epoch_daysSinceJ2000');
    assertFiniteNumber(mu, 'OrbitalState.mu');
    assert(mu > 0, 'OrbitalState.mu must be positive');

    return deepFreeze({
        position: { x: position.x, y: position.y, z: position.z },
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
        epoch_daysSinceJ2000,
        mu,
    });
}

/**
 * Builds an OrbitalState from the {position, velocity} shape returned by
 * EphemerisBoundary.getState / getStateByName (Phase 2), attaching the epoch and mu that
 * boundary intentionally does not carry.
 */
export function orbitalStateFromEphemeris(ephemerisState, epoch_daysSinceJ2000, mu) {
    assert(
        ephemerisState !== null && typeof ephemerisState === 'object',
        'orbitalStateFromEphemeris: ephemerisState must be an object'
    );
    return createOrbitalState({
        position: ephemerisState.position,
        velocity: ephemerisState.velocity,
        epoch_daysSinceJ2000,
        mu,
    });
}

/**
 * Returns a new OrbitalState with the same mu, at a new epoch, wrapping a propagated
 * {position, velocity} pair (e.g. the output of KeplerPropagator.propagateStateVector).
 */
export function withPropagatedResult(orbitalState, propagatedResult, newEpoch_daysSinceJ2000) {
    return createOrbitalState({
        position: propagatedResult.position,
        velocity: propagatedResult.velocity,
        epoch_daysSinceJ2000: newEpoch_daysSinceJ2000,
        mu: orbitalState.mu,
    });
}
