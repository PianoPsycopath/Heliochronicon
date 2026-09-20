// tests/navigation/PatchedConicFrame.test.js
import { describe, it, expect, vi } from 'vitest';
import { AU_IN_KM } from '@core/constants.js';
import { PlanetaryDataProcessor } from '@core/PlanetaryDataProcessor.js';
import { bodySemiMajorAxisKm } from '@core/BodyPhysicalConstants.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { TRAJECTORY_FRAME, createTrajectoryState } from '@navigation/TrajectoryState.js';
import {
    EXCLUSION_REASON,
    HELIOCENTRIC_ROOT_BODY_NAME,
    createHeliocentricPositionResolver,
    getParentChain,
    getSphereOfInfluenceKm,
    isRootBody,
    resolveCurrentParent,
} from '@navigation/PatchedConicFrame.js';
import planetsData from '../../public/data/planets.json';
import moonsData from '../../public/data/moons.json';

const realMoonRow = (name) => moonsData.find((row) => row.name === name);

const processed = PlanetaryDataProcessor.processPlanetaryData([
    ...planetsData,
    realMoonRow('MOON'),
    realMoonRow('IO'),
    realMoonRow('PHOBOS'),
]);

const [placeholderMoon] = PlanetaryDataProcessor.processPlanetaryData([
    { ...realMoonRow('MOON'), name: 'MOON_NO_MASS', mass_10_24_kg: null },
]);

const bodiesByName = new Map(processed.map((body) => [body.name, body]));
bodiesByName.set(placeholderMoon.name, placeholderMoon);

const getBodyDataByName = (name) => bodiesByName.get(name) ?? null;

const getPositionAu = vi.fn((bodyData) =>
    bodyData.category === 'MOON' ? { x: 0, y: bodyData.a, z: 0 } : { x: bodyData.a, y: 0, z: 0 }
);
const heliocentricPositionAu = createHeliocentricPositionResolver({
    getBodyDataByName,
    getPositionAu,
});

const EPOCH = 4200;
const ZERO_VELOCITY = { x: 0, y: 0, z: 0 };
const EARTH_AU = bodiesByName.get('EARTH').a;
const JUPITER_AU = bodiesByName.get('JUPITER').a;
const MOON_OFFSET_AU = bodiesByName.get('MOON').a;
const IO_OFFSET_AU = bodiesByName.get('IO').a;

function heliocentricShip(position) {
    return createTrajectoryState({
        epochDaysJ2000: EPOCH,
        position,
        velocity: ZERO_VELOCITY,
        frame: TRAJECTORY_FRAME.HELIOCENTRIC,
    });
}

function bodyCenteredShip(parentBody, positionKm) {
    return createTrajectoryState({
        epochDaysJ2000: EPOCH,
        position: positionKm,
        velocity: ZERO_VELOCITY,
        frame: TRAJECTORY_FRAME.BODY_CENTERED,
        parentBody,
    });
}

const auFromKm = (km) => km / AU_IN_KM;

function resolve(state, candidateBodyNames) {
    return resolveCurrentParent({
        state,
        candidateBodyNames,
        getBodyDataByName,
        getBodyHeliocentricPositionAu: heliocentricPositionAu,
    });
}

describe('bodySemiMajorAxisKm', () => {
    it("turns a planet's processed AU semi-major axis into km", () => {
        expect(bodySemiMajorAxisKm(bodiesByName.get('EARTH'))).toBeCloseTo(
            1.00000261 * AU_IN_KM,
            3
        );
    });

    it("recovers a moon's a_km from the processed AU value", () => {
        expect(bodySemiMajorAxisKm(bodiesByName.get('MOON'))).toBeCloseTo(384400, 0);
    });

    it('refuses a body with no usable semi-major axis (e.g. the Sun)', () => {
        expect(() => bodySemiMajorAxisKm(bodiesByName.get('SUN'))).toThrow(/bodyData\.a/);
        expect(() => bodySemiMajorAxisKm({ a: NaN })).toThrow(/bodyData\.a/);
        expect(() => bodySemiMajorAxisKm(null)).toThrow(/bodyData\.a/);
    });
});

describe('PatchedConicFrame', () => {
    describe('parent chain', () => {
        it('recognises the Sun as the root because it is its own parent', () => {
            expect(isRootBody(bodiesByName.get('SUN'))).toBe(true);
            expect(isRootBody(bodiesByName.get('EARTH'))).toBe(false);
        });

        it('walks a moon up through its planet to the Sun', () => {
            const chain = getParentChain(bodiesByName.get('MOON'), getBodyDataByName);
            expect(chain.map((b) => b.name)).toEqual(['MOON', 'EARTH', 'SUN']);
        });

        it('throws on an unknown ancestor and on a loop', () => {
            const orphan = { name: 'ORPHAN', parent: 'NOWHERE' };
            expect(() => getParentChain(orphan, getBodyDataByName)).toThrow(/NOWHERE/);

            const a = { name: 'A', parent: 'B' };
            const b = { name: 'B', parent: 'A' };
            const lookup = (name) => ({ A: a, B: b })[name] ?? null;
            expect(() => getParentChain(a, lookup)).toThrow(/loops/);
        });
    });

    describe('getSphereOfInfluenceKm', () => {
        it('gives Earth ~924,000 km about the Sun', () => {
            expect(
                getSphereOfInfluenceKm(bodiesByName.get('EARTH'), getBodyDataByName)
            ).toBeCloseTo(924498.136, 0);
        });

        it('gives Jupiter ~48 million km about the Sun', () => {
            expect(
                getSphereOfInfluenceKm(bodiesByName.get('JUPITER'), getBodyDataByName)
            ).toBeCloseTo(48207852.157, 0);
        });

        it("gives the Moon ~66,000 km about Earth, using the moon's own parent-relative axis", () => {
            expect(getSphereOfInfluenceKm(bodiesByName.get('MOON'), getBodyDataByName)).toBeCloseTo(
                66193.297,
                0
            );
        });

        it('has no bound for the Sun', () => {
            expect(getSphereOfInfluenceKm(bodiesByName.get('SUN'), getBodyDataByName)).toBe(
                Infinity
            );
        });

        it('gives a body with no mass in its data an SOI of 0 (null means mass 0)', () => {
            expect(placeholderMoon.massIsKnown).toBe(false);
            expect(getSphereOfInfluenceKm(placeholderMoon, getBodyDataByName)).toBe(0);
        });

        it('refuses to size an SOI about a parent that has no mass', () => {
            const bodies = new Map([
                ['STAR', { name: 'STAR', parent: 'STAR', mass: 1e6, massIsKnown: true }],
                ['GHOST', { name: 'GHOST', parent: 'STAR', a: 1, mass: 1e-6, massIsKnown: false }],
                ['CHILD', { name: 'CHILD', parent: 'GHOST', a: 0.01, mass: 1, massIsKnown: true }],
            ]);
            expect(() =>
                getSphereOfInfluenceKm(bodies.get('CHILD'), (name) => bodies.get(name) ?? null)
            ).toThrow(/no mass/);
        });

        it('throws when the parent is not in the body data', () => {
            expect(() =>
                getSphereOfInfluenceKm(
                    { name: 'X', parent: 'MISSING', a: 1, mass: 1 },
                    getBodyDataByName
                )
            ).toThrow(/MISSING/);
        });
    });

    describe('createHeliocentricPositionResolver', () => {
        it('puts a planet at its own position and the Sun at the origin', () => {
            expect(heliocentricPositionAu(bodiesByName.get('EARTH'), EPOCH)).toEqual({
                x: EARTH_AU,
                y: 0,
                z: 0,
            });
            expect(heliocentricPositionAu(bodiesByName.get('SUN'), EPOCH)).toEqual({
                x: 0,
                y: 0,
                z: 0,
            });
        });

        it("adds a moon's parent-relative position to its planet's", () => {
            const moon = heliocentricPositionAu(bodiesByName.get('MOON'), EPOCH);
            expect(moon.x).toBeCloseTo(EARTH_AU, 12);
            expect(moon.y).toBeCloseTo(MOON_OFFSET_AU, 12);
        });

        it('rejects a non-finite ephemeris result', () => {
            const broken = createHeliocentricPositionResolver({
                getBodyDataByName,
                getPositionAu: () => ({ x: NaN, y: 0, z: 0 }),
            });
            expect(() => broken(bodiesByName.get('EARTH'), EPOCH)).toThrow(/finite position/);
        });
    });

    describe('resolveCurrentParent', () => {
        describe('Sun / outside every SOI', () => {
            it('resolves deep space to the Sun', () => {
                const result = resolve(heliocentricShip({ x: 3, y: 0, z: 0 }), [
                    'EARTH',
                    'JUPITER',
                ]);

                expect(result.parentBody).toBe('SUN');
                expect(result.isRoot).toBe(true);
                expect(result.soiKm).toBe(Infinity);
                expect(result.distanceKm).toBeCloseTo(3 * AU_IN_KM, 0);
                expect(result.containing).toEqual([]);
            });

            it('falls back to the heliocentric root when no candidate is given', () => {
                const result = resolve(heliocentricShip({ x: 3, y: 0, z: 0 }), []);

                expect(result.parentBody).toBe(HELIOCENTRIC_ROOT_BODY_NAME);
                expect(result.isRoot).toBe(true);
            });

            it("resolves a body-centered state that has left its parent's SOI to the Sun", () => {
                const result = resolve(bodyCenteredShip('EARTH', { x: 1.2e6, y: 0, z: 0 }), [
                    'EARTH',
                ]);

                expect(result.parentBody).toBe('SUN');
                expect(result.isRoot).toBe(true);
            });
        });

        describe('Earth', () => {
            it('resolves a low parking orbit to Earth', () => {
                const result = resolve(bodyCenteredShip('EARTH', { x: 6678.137, y: 0, z: 0 }), [
                    'MARS',
                ]);

                expect(result.parentBody).toBe('EARTH');
                expect(result.isRoot).toBe(false);
                expect(result.soiKm).toBeCloseTo(924498.136, 0);
                expect(result.distanceKm).toBeCloseTo(6678.137, 3);
            });

            it('gives the same answer for the same place in a heliocentric state', () => {
                const result = resolve(
                    heliocentricShip({ x: EARTH_AU + auFromKm(500000), y: 0, z: 0 }),
                    ['EARTH']
                );

                expect(result.parentBody).toBe('EARTH');
                expect(result.distanceKm).toBeCloseTo(500000, 2);
            });

            it('puts the boundary at the SOI: just inside is Earth, just outside is the Sun', () => {
                const soiKm = getSphereOfInfluenceKm(bodiesByName.get('EARTH'), getBodyDataByName);

                expect(
                    resolve(bodyCenteredShip('EARTH', { x: soiKm - 1, y: 0, z: 0 }), ['EARTH'])
                        .parentBody
                ).toBe('EARTH');
                expect(
                    resolve(bodyCenteredShip('EARTH', { x: soiKm + 1, y: 0, z: 0 }), ['EARTH'])
                        .parentBody
                ).toBe('SUN');
            });

            it('names the parent from the state and body data, not from a caller default', () => {
                const atMars = resolve(bodyCenteredShip('MARS', { x: 3700, y: 0, z: 0 }), []);

                expect(atMars.parentBody).toBe('MARS');
            });
        });

        describe('Moon (nested)', () => {
            it('resolves to the Moon, the innermost of Moon-inside-Earth, and lists both', () => {
                const state = heliocentricShip({
                    x: EARTH_AU,
                    y: MOON_OFFSET_AU + auFromKm(10000),
                    z: 0,
                });
                const result = resolve(state, ['EARTH', 'MOON']);

                expect(result.parentBody).toBe('MOON');
                expect(result.distanceKm).toBeCloseTo(10000, 1);
                expect(result.containing.map((c) => c.bodyName)).toEqual(['MOON', 'EARTH']);
            });

            it('resolves a Moon-centered state to the Moon', () => {
                const result = resolve(bodyCenteredShip('MOON', { x: 1837.4, y: 0, z: 0 }), [
                    'EARTH',
                ]);

                expect(result.parentBody).toBe('MOON');
            });

            it("resolves to Earth when inside Earth's SOI but outside the Moon's", () => {
                const state = heliocentricShip({
                    x: EARTH_AU,
                    y: MOON_OFFSET_AU + auFromKm(200000),
                    z: 0,
                });

                expect(resolve(state, ['EARTH', 'MOON']).parentBody).toBe('EARTH');
            });

            it("tests a moon candidate's planet too, so a Moon-only candidate list still finds Earth", () => {
                // Heliocentric state: nothing but the candidate list can bring Earth in.
                const result = resolve(
                    heliocentricShip({ x: EARTH_AU + auFromKm(6678.137), y: 0, z: 0 }),
                    ['MOON']
                );

                expect(result.parentBody).toBe('EARTH');
            });

            it('takes innermost to mean deepest in the hierarchy, not merely the smallest SOI', () => {
                // Deliberately bad data: a moon so massive its SOI exceeds its planet's.
                const bodies = new Map([
                    ['STAR', { name: 'STAR', parent: 'STAR', mass: 1e6, radius_km: 1 }],
                    ['PLANETX', { name: 'PLANETX', parent: 'STAR', a: 1, mass: 1, radius_km: 1 }],
                    [
                        'MOONX',
                        { name: 'MOONX', parent: 'PLANETX', a: 0.001, mass: 1000, radius_km: 1 },
                    ],
                ]);
                const lookup = (name) => bodies.get(name) ?? null;
                const position = createHeliocentricPositionResolver({
                    getBodyDataByName: lookup,
                    getPositionAu: (b) => ({ x: b.a, y: 0, z: 0 }),
                });

                expect(getSphereOfInfluenceKm(bodies.get('MOONX'), lookup)).toBeGreaterThan(
                    getSphereOfInfluenceKm(bodies.get('PLANETX'), lookup)
                );

                const result = resolveCurrentParent({
                    state: heliocentricShip({ x: 1.001 + auFromKm(1000), y: 0, z: 0 }),
                    candidateBodyNames: ['PLANETX', 'MOONX'],
                    getBodyDataByName: lookup,
                    getBodyHeliocentricPositionAu: position,
                });

                expect(result.parentBody).toBe('MOONX');
                expect(result.containing.map((c) => c.bodyName)).toEqual(['MOONX', 'PLANETX']);
            });
        });

        describe('Jupiter', () => {
            it("resolves a ship well inside Jupiter's SOI to Jupiter", () => {
                const result = resolve(
                    heliocentricShip({ x: JUPITER_AU + auFromKm(1e7), y: 0, z: 0 }),
                    ['JUPITER']
                );

                expect(result.parentBody).toBe('JUPITER');
                expect(result.soiKm).toBeCloseTo(48207852.157, 0);
            });

            it('resolves to Io near Io, and to Jupiter between Io and the edge of its SOI', () => {
                const nearIo = heliocentricShip({
                    x: JUPITER_AU,
                    y: IO_OFFSET_AU + auFromKm(5000),
                    z: 0,
                });
                const farFromIo = heliocentricShip({
                    x: JUPITER_AU,
                    y: IO_OFFSET_AU + auFromKm(2e6),
                    z: 0,
                });

                expect(resolve(nearIo, ['JUPITER', 'IO']).parentBody).toBe('IO');
                expect(resolve(farFromIo, ['JUPITER', 'IO']).parentBody).toBe('JUPITER');
            });

            it("does not resolve to Jupiter from Earth's neighbourhood", () => {
                const result = resolve(bodyCenteredShip('EARTH', { x: 6678, y: 0, z: 0 }), [
                    'JUPITER',
                ]);

                expect(result.parentBody).toBe('EARTH');
            });
        });

        describe('exclusions', () => {
            it('never selects a moon that has no mass in its data', () => {
                const state = heliocentricShip({
                    x: EARTH_AU,
                    y: placeholderMoon.a + auFromKm(500),
                    z: 0,
                });
                const result = resolve(state, ['EARTH', placeholderMoon.name]);

                expect(result.parentBody).toBe('EARTH');
                expect(result.excluded).toEqual([
                    expect.objectContaining({
                        bodyName: placeholderMoon.name,
                        reason: EXCLUSION_REASON.NO_MASS,
                    }),
                ]);
            });

            it('never selects Phobos: its real mass gives an SOI smaller than the moon itself', () => {
                const phobos = bodiesByName.get('PHOBOS');
                expect(phobos.massIsKnown).toBe(true);
                expect(getSphereOfInfluenceKm(phobos, getBodyDataByName)).toBeLessThan(
                    phobos.radius_km
                );

                const state = heliocentricShip({
                    x: bodiesByName.get('MARS').a,
                    y: phobos.a + auFromKm(5),
                    z: 0,
                });
                const result = resolve(state, ['MARS', 'PHOBOS']);

                expect(result.parentBody).toBe('MARS');
                expect(result.excluded).toEqual([
                    expect.objectContaining({
                        bodyName: 'PHOBOS',
                        reason: EXCLUSION_REASON.SOI_WITHIN_BODY,
                    }),
                ]);
            });

            it('reports an unknown candidate and still resolves from the rest', () => {
                const result = resolve(bodyCenteredShip('EARTH', { x: 6678, y: 0, z: 0 }), [
                    'VULCAN',
                ]);

                expect(result.parentBody).toBe('EARTH');
                expect(result.excluded).toEqual([
                    { bodyName: 'VULCAN', reason: EXCLUSION_REASON.UNKNOWN_BODY },
                ]);
            });

            it('normalises candidate names and ignores duplicates', () => {
                const result = resolve(bodyCenteredShip('EARTH', { x: 6678, y: 0, z: 0 }), [
                    ' earth ',
                    'EARTH',
                ]);

                expect(result.parentBody).toBe('EARTH');
                expect(result.containing).toHaveLength(1);
                expect(result.excluded).toEqual([]);
            });
        });

        describe('contract', () => {
            it("evaluates the ship and every body at the state's own epoch", () => {
                getPositionAu.mockClear();
                const epochs = [];
                const spy = createHeliocentricPositionResolver({
                    getBodyDataByName,
                    getPositionAu: (bodyData, epoch) => {
                        epochs.push(epoch);
                        return getPositionAu(bodyData, epoch);
                    },
                });

                resolveCurrentParent({
                    state: bodyCenteredShip('EARTH', { x: 6678, y: 0, z: 0 }),
                    candidateBodyNames: ['EARTH', 'MARS'],
                    getBodyDataByName,
                    getBodyHeliocentricPositionAu: spy,
                });

                expect(epochs.length).toBeGreaterThan(0);
                expect(new Set(epochs)).toEqual(new Set([EPOCH]));
            });

            it('only touches the candidate bodies (and their ancestors), not the whole registry', () => {
                const visited = new Set();
                const spy = createHeliocentricPositionResolver({
                    getBodyDataByName,
                    getPositionAu: (bodyData, epoch) => {
                        visited.add(bodyData.name);
                        return getPositionAu(bodyData, epoch);
                    },
                });

                resolveCurrentParent({
                    state: bodyCenteredShip('EARTH', { x: 6678, y: 0, z: 0 }),
                    candidateBodyNames: ['MARS'],
                    getBodyDataByName,
                    getBodyHeliocentricPositionAu: spy,
                });

                expect([...visited].sort()).toEqual(['EARTH', 'MARS']);
            });

            it('returns a frozen result', () => {
                const result = resolve(bodyCenteredShip('EARTH', { x: 6678, y: 0, z: 0 }), []);

                expect(Object.isFrozen(result)).toBe(true);
                expect(Object.isFrozen(result.containing)).toBe(true);
                expect(Object.isFrozen(result.excluded)).toBe(true);
            });

            it('requires a TrajectoryState, the lookups, and an array of candidates', () => {
                const base = {
                    state: heliocentricShip({ x: 3, y: 0, z: 0 }),
                    candidateBodyNames: [],
                    getBodyDataByName,
                    getBodyHeliocentricPositionAu: heliocentricPositionAu,
                };

                expect(() =>
                    resolveCurrentParent({ ...base, state: { frame: 'heliocentric' } })
                ).toThrow(/TrajectoryState/);
                expect(() => resolveCurrentParent({ ...base, getBodyDataByName: null })).toThrow(
                    /getBodyDataByName/
                );
                expect(() =>
                    resolveCurrentParent({ ...base, getBodyHeliocentricPositionAu: null })
                ).toThrow(/getBodyHeliocentricPositionAu/);
                expect(() =>
                    resolveCurrentParent({ ...base, candidateBodyNames: 'EARTH' })
                ).toThrow(/array/);
            });

            it('throws when a body-centered state names a parent that is not in the body data', () => {
                expect(() =>
                    resolve(bodyCenteredShip('VULCAN', { x: 100, y: 0, z: 0 }), [])
                ).toThrow(/VULCAN/);
            });
        });
    });

    describe('with the real ephemeris', () => {
        const realHeliocentricAu = createHeliocentricPositionResolver({
            getBodyDataByName,
            getPositionAu: (bodyData, epochDaysJ2000) =>
                EphemerisAdapter.getPosition(bodyData, epochDaysJ2000),
        });
        const EPOCHS = [0, 4200, -3000, 9000];

        function realShip(epochDaysJ2000, bodyName, offsetKm) {
            const body = realHeliocentricAu(bodiesByName.get(bodyName), epochDaysJ2000);
            return createTrajectoryState({
                epochDaysJ2000,
                position: { x: body.x + offsetKm / AU_IN_KM, y: body.y, z: body.z },
                velocity: ZERO_VELOCITY,
                frame: TRAJECTORY_FRAME.HELIOCENTRIC,
            });
        }

        function realResolve(state, candidateBodyNames) {
            return resolveCurrentParent({
                state,
                candidateBodyNames,
                getBodyDataByName,
                getBodyHeliocentricPositionAu: realHeliocentricAu,
            });
        }

        it.each(EPOCHS)('places the Moon a lunar distance from Earth at epoch %i', (epoch) => {
            const earth = realHeliocentricAu(bodiesByName.get('EARTH'), epoch);
            const moon = realHeliocentricAu(bodiesByName.get('MOON'), epoch);
            const km = Math.hypot(moon.x - earth.x, moon.y - earth.y, moon.z - earth.z) * AU_IN_KM;

            expect(km).toBeGreaterThan(356000);
            expect(km).toBeLessThan(407000);
        });

        it.each(EPOCHS)(
            'resolves 10,000 km from the real Moon to the Moon at epoch %i',
            (epoch) => {
                const result = realResolve(realShip(epoch, 'MOON', 10000), ['EARTH', 'MOON']);

                expect(result.parentBody).toBe('MOON');
                expect(result.distanceKm).toBeCloseTo(10000, 1);
                expect(result.containing.map((c) => c.bodyName)).toEqual(['MOON', 'EARTH']);
            }
        );

        it.each(EPOCHS)(
            'resolves a ship 200,000 km from the Moon to Earth at epoch %i',
            (epoch) => {
                expect(
                    realResolve(realShip(epoch, 'MOON', 200000), ['EARTH', 'MOON']).parentBody
                ).toBe('EARTH');
            }
        );

        it.each(EPOCHS)('resolves a low Earth orbit to Earth at epoch %i', (epoch) => {
            const state = createTrajectoryState({
                epochDaysJ2000: epoch,
                position: { x: 6678.137, y: 0, z: 0 },
                velocity: ZERO_VELOCITY,
                frame: TRAJECTORY_FRAME.BODY_CENTERED,
                parentBody: 'EARTH',
            });

            expect(realResolve(state, ['MARS']).parentBody).toBe('EARTH');
        });

        it.each(EPOCHS)(
            'resolves near Io to Io and well off it to Jupiter at epoch %i',
            (epoch) => {
                expect(realResolve(realShip(epoch, 'IO', 5000), ['JUPITER', 'IO']).parentBody).toBe(
                    'IO'
                );
                expect(realResolve(realShip(epoch, 'IO', 3e6), ['JUPITER', 'IO']).parentBody).toBe(
                    'JUPITER'
                );
            }
        );

        it("resolves the Sun's own neighbourhood as the root", () => {
            const state = heliocentricShip({ x: 0.3, y: 0.1, z: 0 });

            expect(realResolve(state, ['EARTH', 'MARS']).parentBody).toBe('SUN');
        });
    });
});
