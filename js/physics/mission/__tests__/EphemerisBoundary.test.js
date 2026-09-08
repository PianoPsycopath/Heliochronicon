import { describe, it, expect } from 'vitest';
import { EphemerisBoundary } from '../EphemerisBoundary.js';
import { OrbitalMath } from '@physics/OrbitalMath.js';

const AU_IN_KM = 149597870.7;
const SECONDS_PER_DAY = 86400;

const SUN = { name: 'SUN', parent: 'SUN', category: 'STAR' };

const EARTH = {
    name: 'EARTH',
    parent: 'SUN',
    category: 'PLANET',
    orbit_model: 'VSOP87',
};

const MARS = {
    name: 'MARS',
    parent: 'SUN',
    category: 'PLANET',
    orbit_model: 'VSOP87',
};

const KEPLER_ASTEROID = {
    name: 'CERES',
    parent: 'SUN',
    category: 'ASTEROID',
    a: 2.7675,
    e: 0.0785,
    i: (10.59 * Math.PI) / 180,
    w: (73.6 * Math.PI) / 180,
    Node: (80.3 * Math.PI) / 180,
    M0: (95.99 * Math.PI) / 180,
    n: (2 * Math.PI) / (4.6 * 365.256),
};

const MEEUS_MOON = {
    name: 'MOON',
    parent: 'EARTH',
    category: 'MOON',
    isMoon: true,
    orbit_model: 'MEEUS',
};

const KEPLER_MOON = {
    name: 'PHOBOS',
    parent: 'MARS',
    category: 'MOON',
    isMoon: true,
    a: 6.26e-5,
    e: 0.0151,
    i: (1.08 * Math.PI) / 180,
    w: 0,
    Node: 0,
    M0: 0,
    n: (2 * Math.PI) / 0.31891,
};

function resolveParent(name) {
    return { SUN, EARTH, MARS }[name] || null;
}

function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

describe('EphemerisBoundary.getState', () => {
    it('returns zero position and velocity for the Sun', () => {
        const state = EphemerisBoundary.getState(SUN, 0, resolveParent);
        expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
        expect(magnitude(state.velocity)).toBeCloseTo(0, 6);
    });

    it('matches OrbitalMath.calculatePosition directly for a Sun-parented body', () => {
        const t = 1234.5;
        const state = EphemerisBoundary.getState(EARTH, t, resolveParent);
        const expected = OrbitalMath.calculatePosition(EARTH, t);
        expect(state.position.x).toBeCloseTo(expected.x, 9);
        expect(state.position.y).toBeCloseTo(expected.y, 9);
        expect(state.position.z).toBeCloseTo(expected.z, 9);
    });

    it('does not mutate existing ephemeris behavior (VSOP87 output unchanged)', () => {
        const t = 9000;
        const before = OrbitalMath.calculatePosition(EARTH, t);
        EphemerisBoundary.getState(EARTH, t, resolveParent);
        const after = OrbitalMath.calculatePosition(EARTH, t);
        expect(after).toEqual(before);
    });

    it("produces Earth's orbital speed within a realistic range (~29-30 km/s)", () => {
        const state = EphemerisBoundary.getState(EARTH, 5000, resolveParent);
        const speedAuPerDay = magnitude(state.velocity);
        const speedKmPerSec = (speedAuPerDay * AU_IN_KM) / SECONDS_PER_DAY;
        expect(speedKmPerSec).toBeGreaterThan(28);
        expect(speedKmPerSec).toBeLessThan(31);
    });

    it('places Earth roughly 1 AU from the Sun', () => {
        const state = EphemerisBoundary.getState(EARTH, 0, resolveParent);
        expect(magnitude(state.position)).toBeGreaterThan(0.98);
        expect(magnitude(state.position)).toBeLessThan(1.02);
    });

    it('resolves a Kepler body parented directly to the Sun without a resolver', () => {
        const state = EphemerisBoundary.getState(KEPLER_ASTEROID, 0);
        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(magnitude(state.position)).toBeGreaterThan(2);
        expect(magnitude(state.position)).toBeLessThan(3.5);
    });

    it('adds parent heliocentric position for a MEEUS moon (Earth + geocentric Moon)', () => {
        const t = 3000;
        const earthState = EphemerisBoundary.getState(EARTH, t, resolveParent);
        const moonState = EphemerisBoundary.getState(MEEUS_MOON, t, resolveParent);

        const distanceFromEarth = magnitude({
            x: moonState.position.x - earthState.position.x,
            y: moonState.position.y - earthState.position.y,
            z: moonState.position.z - earthState.position.z,
        });

        // Earth-Moon distance is roughly 384,400 km -> ~0.00257 AU
        expect(distanceFromEarth).toBeGreaterThan(0.002);
        expect(distanceFromEarth).toBeLessThan(0.0035);
    });

    it('throws a descriptive error for Kepler-model moons requiring parent pole rotation', () => {
        expect(() => EphemerisBoundary.getState(KEPLER_MOON, 0, resolveParent)).toThrow(
            /pole/i
        );
    });

    it('throws when a required parent cannot be resolved', () => {
        const orphanMoon = { ...MEEUS_MOON, parent: 'NOWHERE' };
        expect(() => EphemerisBoundary.getState(orphanMoon, 0, resolveParent)).toThrow(/resolve parent/i);
    });

    it('validates bodyData and daysSinceJ2000', () => {
        expect(() => EphemerisBoundary.getState(null, 0)).toThrow();
        expect(() => EphemerisBoundary.getState(EARTH, NaN)).toThrow();
        expect(() => EphemerisBoundary.getState({ name: 'X' }, 0)).toThrow();
    });
});

describe('EphemerisBoundary.fromElements', () => {
    const elements = [SUN, EARTH, MARS, MEEUS_MOON];
    const ephemeris = EphemerisBoundary.fromElements(elements);

    it('resolves state by body name', () => {
        const state = ephemeris.getStateByName('MARS', 4200);
        const expected = EphemerisBoundary.getState(MARS, 4200, (name) =>
            elements.find((e) => e.name === name)
        );
        expect(state.position).toEqual(expected.position);
    });

    it('throws for an unknown body name', () => {
        expect(() => ephemeris.getStateByName('PLUTO', 0)).toThrow(/unknown body/i);
    });

    it('exposes a bound getState for raw body data using the same resolver', () => {
        const state = ephemeris.getState(MEEUS_MOON, 4200);
        expect(Number.isFinite(state.position.x)).toBe(true);
    });
});

describe('Earth-Mars synodic sanity check (porkchop foundation)', () => {
    it('produces a plausible Earth-Mars separation range over a year', () => {
        const distances = [];
        for (let day = 0; day < 365; day += 30) {
            const earth = EphemerisBoundary.getState(EARTH, day, resolveParent).position;
            const mars = EphemerisBoundary.getState(MARS, day, resolveParent).position;
            distances.push(
                magnitude({ x: mars.x - earth.x, y: mars.y - earth.y, z: mars.z - earth.z })
            );
        }
        distances.forEach((d) => {
            expect(d).toBeGreaterThan(0.3);
            expect(d).toBeLessThan(2.7);
        });
    });
});
