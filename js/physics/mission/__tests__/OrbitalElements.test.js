import { describe, it, expect } from 'vitest';
import { stateVectorToElements, elementsToStateVector } from '../OrbitalElements.js';

const GM_SUN = 2.959122082855911e-4; // AU^3/day^2

describe('elementsToStateVector -> stateVectorToElements round trip', () => {
    it('recovers a general inclined elliptical orbit (Mars-like)', () => {
        const elements = {
            a: 1.523679,
            e: 0.0934,
            i: 0.0323,
            Node: 0.8654,
            argPeriapsis: 5.0,
            trueAnomaly: 1.234,
            mu: GM_SUN,
        };

        const { position, velocity } = elementsToStateVector(elements);
        const recovered = stateVectorToElements(position, velocity, GM_SUN);

        expect(recovered.a).toBeCloseTo(elements.a, 8);
        expect(recovered.e).toBeCloseTo(elements.e, 8);
        expect(recovered.i).toBeCloseTo(elements.i, 8);
        expect(recovered.Node).toBeCloseTo(elements.Node, 8);
        expect(recovered.argPeriapsis).toBeCloseTo(elements.argPeriapsis, 8);
        expect(recovered.trueAnomaly).toBeCloseTo(elements.trueAnomaly, 8);
    });

    it('recovers elements whose Node/trueAnomaly land past pi (exercises the quadrant-flip branches)', () => {
        const elements = {
            a: 2.2,
            e: 0.15,
            i: 0.4,
            Node: 4.9,
            argPeriapsis: 1.1,
            trueAnomaly: 3.9,
            mu: GM_SUN,
        };

        const { position, velocity } = elementsToStateVector(elements);
        const recovered = stateVectorToElements(position, velocity, GM_SUN);

        expect(recovered.Node).toBeCloseTo(elements.Node, 8);
        expect(recovered.trueAnomaly).toBeCloseTo(elements.trueAnomaly, 8);
        expect(recovered.argPeriapsis).toBeCloseTo(elements.argPeriapsis, 8);
    });

    it('handles a circular, ecliptic-plane (equatorial) orbit without throwing', () => {
        // The ecliptic plane in this render convention is y = 0 (see the header comment in
        // OrbitalElements.js), so a circular equatorial orbit's velocity lies in the x-z plane.
        const position = { x: 1.0, y: 0, z: 0 };
        const velocity = { x: 0, y: 0, z: -Math.sqrt(GM_SUN / 1.0) };

        const elements = stateVectorToElements(position, velocity, GM_SUN);

        expect(elements.e).toBeCloseTo(0, 8);
        expect(elements.i).toBeCloseTo(0, 8);
        expect(Number.isFinite(elements.Node)).toBe(true);
        expect(Number.isFinite(elements.argPeriapsis)).toBe(true);
        expect(Number.isFinite(elements.trueAnomaly)).toBe(true);
    });
});

describe('elementsToStateVector', () => {
    it('rejects hyperbolic elements (e >= 1), which are out of scope for element-based construction', () => {
        expect(() =>
            elementsToStateVector({
                a: -2.0,
                e: 1.3,
                i: 0.1,
                Node: 0.2,
                argPeriapsis: 0.3,
                trueAnomaly: 0.5,
                mu: GM_SUN,
            })
        ).toThrow(/only elliptical elements/);
    });
});

describe('stateVectorToElements', () => {
    it('rejects a zero position vector', () => {
        expect(() =>
            stateVectorToElements({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.01, z: 0 }, GM_SUN)
        ).toThrow(/position must be non-zero/);
    });

    it('rejects a rectilinear (zero angular momentum) trajectory', () => {
        expect(() =>
            stateVectorToElements({ x: 1, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }, GM_SUN)
        ).toThrow(/rectilinear/);
    });
});
