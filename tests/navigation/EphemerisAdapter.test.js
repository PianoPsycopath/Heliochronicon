// tests/navigation/EphemerisAdapter.test.js
import { describe, it, expect } from 'vitest';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { OrbitalMath } from '@physics/OrbitalMath.js';

describe('EphemerisAdapter', () => {
    describe('getPosition', () => {
        it('delegates to OrbitalMath.calculatePosition for a VSOP87 body (Earth)', () => {
            const bodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            const days = 321.5;

            expect(EphemerisAdapter.getPosition(bodyData, days)).toEqual(
                OrbitalMath.calculatePosition(bodyData, days)
            );
        });

        it('delegates to OrbitalMath.calculatePosition for the MEEUS moon path', () => {
            const bodyData = { name: 'MOON', orbit_model: 'MEEUS' };
            const days = 42;

            expect(EphemerisAdapter.getPosition(bodyData, days)).toEqual(
                OrbitalMath.calculatePosition(bodyData, days)
            );
        });

        it('delegates to OrbitalMath.calculatePosition for the default Kepler path', () => {
            const bodyData = {
                a: 0.387,
                e: 0.2056,
                i: 0.122,
                w: 1.352,
                Node: 0.843,
                M0: 2.2,
                n: 0.0414,
            };
            const days = 15;

            expect(EphemerisAdapter.getPosition(bodyData, days)).toEqual(
                OrbitalMath.calculatePosition(bodyData, days)
            );
        });

        it('throws on a missing bodyData', () => {
            expect(() => EphemerisAdapter.getPosition(null, 10)).toThrow();
        });

        it('throws on a non-numeric daysSinceJ2000', () => {
            expect(() =>
                EphemerisAdapter.getPosition({ name: 'EARTH', orbit_model: 'VSOP87' }, 'ten')
            ).toThrow();
        });
    });

    describe('getVelocity', () => {
        it('matches the closed-form derivative for a circular, coplanar Kepler orbit', () => {
            // e = 0, i = 0, w = 0, Node = 0 collapses calcPosFromM to
            // { x: a*cos(M), y: 0, z: -a*sin(M) }, whose exact derivative
            // w.r.t. time is { x: -a*n*sin(M), y: 0, z: -a*n*cos(M) }.
            const a = 1;
            const n = 0.0172021; // ~Earth mean motion, rad/day
            const M0 = 0.5;
            const bodyData = { a, e: 0, i: 0, w: 0, Node: 0, M0, n };
            const days = 50;
            const M = M0 + n * days;

            const expected = {
                x: -a * n * Math.sin(M),
                y: 0,
                z: -a * n * Math.cos(M),
            };

            const velocity = EphemerisAdapter.getVelocity(bodyData, days);

            expect(velocity.x).toBeCloseTo(expected.x, 8);
            expect(velocity.y).toBeCloseTo(expected.y, 8);
            expect(velocity.z).toBeCloseTo(expected.z, 8);
        });

        it('produces an Earth-scale orbital speed (~0.017 AU/day) for the VSOP87 path', () => {
            const bodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            const velocity = EphemerisAdapter.getVelocity(bodyData, 0);
            const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);

            expect(speed).toBeGreaterThan(0.014);
            expect(speed).toBeLessThan(0.02);
        });

        it('honors a custom stepDays', () => {
            const bodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            const days = 10;

            const tight = EphemerisAdapter.getVelocity(bodyData, days, { stepDays: 1e-4 });
            const loose = EphemerisAdapter.getVelocity(bodyData, days, { stepDays: 5 });
            expect(tight.x).toBeCloseTo(loose.x, 3);
        });

        it('throws on a non-positive stepDays', () => {
            const bodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            expect(() => EphemerisAdapter.getVelocity(bodyData, 0, { stepDays: 0 })).toThrow();
            expect(() => EphemerisAdapter.getVelocity(bodyData, 0, { stepDays: -1 })).toThrow();
        });

        it('throws on a missing bodyData', () => {
            expect(() => EphemerisAdapter.getVelocity(undefined, 0)).toThrow();
        });
    });

    describe('getState', () => {
        it('returns position and velocity consistent with the individual accessors', () => {
            const bodyData = { name: 'MARS', orbit_model: 'VSOP87' };
            const days = 777;

            const state = EphemerisAdapter.getState(bodyData, days);

            expect(state.position).toEqual(EphemerisAdapter.getPosition(bodyData, days));
            expect(state.velocity).toEqual(EphemerisAdapter.getVelocity(bodyData, days));
        });

        it('works for the MEEUS moon path as a second major body', () => {
            const bodyData = { name: 'MOON', orbit_model: 'MEEUS' };
            const days = 123.4;

            const state = EphemerisAdapter.getState(bodyData, days);

            expect(state.position).toEqual(OrbitalMath.calculatePosition(bodyData, days));
            expect(Number.isFinite(state.velocity.x)).toBe(true);
            expect(Number.isFinite(state.velocity.y)).toBe(true);
            expect(Number.isFinite(state.velocity.z)).toBe(true);
        });

        it('accepts a custom stepDays override', () => {
            const bodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            const days = 0;

            const state = EphemerisAdapter.getState(bodyData, days, { stepDays: 1e-2 });

            expect(state.velocity).toEqual(
                EphemerisAdapter.getVelocity(bodyData, days, { stepDays: 1e-2 })
            );
        });

        it('throws on a non-numeric daysSinceJ2000', () => {
            expect(() =>
                EphemerisAdapter.getState({ name: 'EARTH', orbit_model: 'VSOP87' }, null)
            ).toThrow();
        });
    });
});