import { describe, it, expect } from 'vitest';
import { propagateStateVector } from '../KeplerPropagator.js';

const GM_SUN = 2.959122082855911e-4; // AU^3/day^2

function magnitude(v) {
    return Math.hypot(v.x, v.y, v.z);
}

function visVivaEnergy(position, velocity, mu) {
    return (velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2) / 2 - mu / magnitude(position);
}

function angularMomentum(position, velocity) {
    return {
        x: position.y * velocity.z - position.z * velocity.y,
        y: position.z * velocity.x - position.x * velocity.z,
        z: position.x * velocity.y - position.y * velocity.x,
    };
}

describe('propagateStateVector', () => {
    it('returns to the same state after one full circular-orbit period', () => {
        const a = 1.0;
        const position = { x: a, y: 0, z: 0 };
        const vCircular = Math.sqrt(GM_SUN / a);
        const velocity = { x: 0, y: vCircular, z: 0 };
        const period = 2 * Math.PI * Math.sqrt(a ** 3 / GM_SUN);

        const state = propagateStateVector(position, velocity, GM_SUN, period);

        expect(state.position.x).toBeCloseTo(position.x, 6);
        expect(state.position.y).toBeCloseTo(position.y, 6);
        expect(state.velocity.x).toBeCloseTo(velocity.x, 6);
        expect(state.velocity.y).toBeCloseTo(velocity.y, 6);
    });

    it('places a circular orbit a quarter-period later at the expected 90-degree point', () => {
        const a = 1.0;
        const position = { x: a, y: 0, z: 0 };
        const vCircular = Math.sqrt(GM_SUN / a);
        const velocity = { x: 0, y: vCircular, z: 0 };
        const period = 2 * Math.PI * Math.sqrt(a ** 3 / GM_SUN);

        const state = propagateStateVector(position, velocity, GM_SUN, period / 4);

        expect(state.position.x).toBeCloseTo(0, 6);
        expect(state.position.y).toBeCloseTo(a, 6);
    });

    it('conserves vis-viva energy and angular momentum on an eccentric ellipse', () => {
        const position = { x: 1.5, y: 0.2, z: 0.05 };
        const velocity = { x: -0.002, y: 0.016, z: 0.001 };

        const energyBefore = visVivaEnergy(position, velocity, GM_SUN);
        const hBefore = magnitude(angularMomentum(position, velocity));

        const state = propagateStateVector(position, velocity, GM_SUN, 137.4);

        const energyAfter = visVivaEnergy(state.position, state.velocity, GM_SUN);
        const hAfter = magnitude(angularMomentum(state.position, state.velocity));

        expect(energyAfter).toBeCloseTo(energyBefore, 10);
        expect(hAfter).toBeCloseTo(hBefore, 10);
    });

    it('is reversible: propagating forward then back by the same interval returns the start state', () => {
        const position = { x: 1.5, y: 0.2, z: 0.05 };
        const velocity = { x: -0.002, y: 0.016, z: 0.001 };
        const dt = 137.4;

        const forward = propagateStateVector(position, velocity, GM_SUN, dt);
        const back = propagateStateVector(forward.position, forward.velocity, GM_SUN, -dt);

        expect(back.position.x).toBeCloseTo(position.x, 6);
        expect(back.position.y).toBeCloseTo(position.y, 6);
        expect(back.position.z).toBeCloseTo(position.z, 6);
        expect(back.velocity.x).toBeCloseTo(velocity.x, 6);
        expect(back.velocity.y).toBeCloseTo(velocity.y, 6);
        expect(back.velocity.z).toBeCloseTo(velocity.z, 6);
    });

    it('converges and conserves energy for a hyperbolic (unbound) trajectory', () => {
        const position = { x: 1.0, y: 0, z: 0 };
        const vEscape = Math.sqrt((2 * GM_SUN) / 1.0);
        const velocity = { x: 0, y: vEscape * 1.2, z: 0 };

        const energyBefore = visVivaEnergy(position, velocity, GM_SUN);
        expect(energyBefore).toBeGreaterThan(0);

        const state = propagateStateVector(position, velocity, GM_SUN, 50);
        const energyAfter = visVivaEnergy(state.position, state.velocity, GM_SUN);

        expect(energyAfter).toBeCloseTo(energyBefore, 8);
    });

    it('returns the input unchanged for dt = 0', () => {
        const position = { x: 1.2, y: -0.3, z: 0.1 };
        const velocity = { x: 0.001, y: 0.014, z: -0.0005 };

        const state = propagateStateVector(position, velocity, GM_SUN, 0);

        expect(state.position).toEqual(position);
        expect(state.velocity).toEqual(velocity);
    });

    it('rejects a non-positive mu', () => {
        expect(() =>
            propagateStateVector({ x: 1, y: 0, z: 0 }, { x: 0, y: 0.01, z: 0 }, 0, 10)
        ).toThrow(/mu must be positive/);
    });

    it('rejects a zero position vector', () => {
        expect(() =>
            propagateStateVector({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.01, z: 0 }, GM_SUN, 10)
        ).toThrow(/position must be non-zero/);
    });
});
