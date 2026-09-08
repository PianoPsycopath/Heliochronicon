import { describe, it, expect } from 'vitest';
import { createOrbitalState, orbitalStateFromEphemeris, withPropagatedResult } from '../OrbitalState.js';

const GM_SUN = 2.959122082855911e-4;

describe('createOrbitalState', () => {
    it('builds an immutable state from position, velocity, epoch and mu', () => {
        const state = createOrbitalState({
            position: { x: 1, y: 0, z: 0 },
            velocity: { x: 0, y: 0.0172, z: 0 },
            epoch_daysSinceJ2000: 1000,
            mu: GM_SUN,
        });

        expect(state.position).toEqual({ x: 1, y: 0, z: 0 });
        expect(state.velocity).toEqual({ x: 0, y: 0.0172, z: 0 });
        expect(state.epoch_daysSinceJ2000).toBe(1000);
        expect(state.mu).toBe(GM_SUN);
        expect(Object.isFrozen(state)).toBe(true);
        expect(() => {
            state.mu = 1;
        }).toThrow();
    });

    it('rejects a non-positive mu', () => {
        expect(() =>
            createOrbitalState({
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                epoch_daysSinceJ2000: 0,
                mu: -5,
            })
        ).toThrow(/mu must be positive/);
    });

    it('rejects a non-finite epoch', () => {
        expect(() =>
            createOrbitalState({
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                epoch_daysSinceJ2000: NaN,
                mu: GM_SUN,
            })
        ).toThrow(/epoch_daysSinceJ2000 must be a finite number/);
    });

    it('rejects a malformed position vector', () => {
        expect(() =>
            createOrbitalState({
                position: { x: 1, y: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                epoch_daysSinceJ2000: 0,
                mu: GM_SUN,
            })
        ).toThrow();
    });
});

describe('orbitalStateFromEphemeris', () => {
    it('attaches epoch and mu to an EphemerisBoundary-shaped {position, velocity} result', () => {
        const ephemerisState = { position: { x: 1.5, y: 0.1, z: 0 }, velocity: { x: 0, y: 0.01, z: 0 } };
        const state = orbitalStateFromEphemeris(ephemerisState, 2000, GM_SUN);

        expect(state.position).toEqual(ephemerisState.position);
        expect(state.velocity).toEqual(ephemerisState.velocity);
        expect(state.epoch_daysSinceJ2000).toBe(2000);
        expect(state.mu).toBe(GM_SUN);
    });
});

describe('withPropagatedResult', () => {
    it('carries mu forward from the original state onto a new epoch', () => {
        const original = createOrbitalState({
            position: { x: 1, y: 0, z: 0 },
            velocity: { x: 0, y: 0.0172, z: 0 },
            epoch_daysSinceJ2000: 1000,
            mu: GM_SUN,
        });
        const propagated = { position: { x: 0.9, y: 0.2, z: 0 }, velocity: { x: -0.01, y: 0.015, z: 0 } };

        const next = withPropagatedResult(original, propagated, 1030);

        expect(next.position).toEqual(propagated.position);
        expect(next.velocity).toEqual(propagated.velocity);
        expect(next.epoch_daysSinceJ2000).toBe(1030);
        expect(next.mu).toBe(original.mu);
    });
});
