// js/physics/mission/EphemerisBoundary.js
import { OrbitalMath } from '@physics/OrbitalMath.js';
import { assert, assertFiniteNumber, assertNonEmptyString } from './validation.js';

const VELOCITY_SAMPLE_DAYS = 0.02;

function subtractVec(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addVec(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function requiresParentPoleFrame(bodyData) {
    return bodyData.isMoon === true && (!bodyData.orbit_model || bodyData.orbit_model === 'KEPLER');
}

function assertBodyData(bodyData) {
    assert(bodyData !== null && typeof bodyData === 'object', 'EphemerisBoundary: bodyData must be an object');
    assertNonEmptyString(bodyData.name, 'EphemerisBoundary: bodyData.name');
    assertNonEmptyString(bodyData.parent, 'EphemerisBoundary: bodyData.parent');
}

/**
 * Resolves a body's heliocentric ecliptic position (AU) at a given time by delegating
 * to the existing ephemeris system (OrbitalMath -> VSOP87 / MeeusMoon / Kepler) and,
 * where needed, recursively adding the parent body's heliocentric position.
 *
 * Bodies whose orbital elements are referenced to their parent's equatorial pole
 * (Kepler-model moons) are out of scope for this boundary: resolving them requires the
 * per-frame pole-quaternion rotation currently implemented in PhysicsEngine, which is a
 * Three.js-coupled rendering concern. Such bodies raise a descriptive error instead of
 * silently returning an incorrect heliocentric position.
 *
 * @param {object} bodyData - a PlanetaryElement-shaped object (see PlanetaryDataProcessor)
 * @param {number} daysSinceJ2000
 * @param {(parentName: string) => object|null} resolveParent
 * @returns {{x: number, y: number, z: number}}
 */
function resolveHeliocentricPosition(bodyData, daysSinceJ2000, resolveParent) {
    if (bodyData.parent === bodyData.name) {
        return { x: 0, y: 0, z: 0 };
    }

    if (requiresParentPoleFrame(bodyData)) {
        throw new Error(
            `EphemerisBoundary: body "${bodyData.name}" is a Kepler-model moon referenced to its ` +
                'parent\'s equatorial pole. This boundary only resolves bodies whose ephemeris is ' +
                'already ecliptic-frame (VSOP87, MEEUS, or Kepler bodies parented directly to the Sun).'
        );
    }

    const localPosition = OrbitalMath.calculatePosition(bodyData, daysSinceJ2000);

    if (bodyData.parent === 'SUN') {
        return localPosition;
    }

    const parentData = resolveParent(bodyData.parent);
    assert(
        parentData !== null && parentData !== undefined,
        `EphemerisBoundary: unable to resolve parent body "${bodyData.parent}" for "${bodyData.name}"`
    );

    const parentPosition = resolveHeliocentricPosition(parentData, daysSinceJ2000, resolveParent);
    return addVec(localPosition, parentPosition);
}

export class EphemerisBoundary {
    /**
     * body + time -> position + velocity.
     *
     * Position and velocity are heliocentric ecliptic, in AU and AU/day, derived from the
     * existing ephemeris system. Velocity is obtained by central finite difference around
     * the requested time rather than by re-deriving analytical velocity terms, so VSOP87 and
     * MeeusMoon remain the sole authority on position.
     *
     * @param {object} bodyData - PlanetaryElement-shaped data for the target body
     * @param {number} daysSinceJ2000
     * @param {(parentName: string) => object|null} [resolveParent] - looks up a parent body's
     *        PlanetaryElement data by name; required whenever bodyData.parent !== 'SUN' and
     *        bodyData.parent !== bodyData.name
     * @returns {{position: {x:number,y:number,z:number}, velocity: {x:number,y:number,z:number}}}
     */
    static getState(bodyData, daysSinceJ2000, resolveParent = () => null) {
        assertBodyData(bodyData);
        assertFiniteNumber(daysSinceJ2000, 'EphemerisBoundary.getState.daysSinceJ2000');
        assert(typeof resolveParent === 'function', 'EphemerisBoundary.getState: resolveParent must be a function');

        const position = resolveHeliocentricPosition(bodyData, daysSinceJ2000, resolveParent);

        const halfStep = VELOCITY_SAMPLE_DAYS / 2;
        const before = resolveHeliocentricPosition(bodyData, daysSinceJ2000 - halfStep, resolveParent);
        const after = resolveHeliocentricPosition(bodyData, daysSinceJ2000 + halfStep, resolveParent);
        const velocity = scaleVec(subtractVec(after, before), 1 / VELOCITY_SAMPLE_DAYS);

        return { position, velocity };
    }

    /**
     * Builds a name -> PlanetaryElement lookup from an already-processed planetary dataset
     * (e.g. PlanetaryDataProcessor output) and returns a bound getState(name, daysSinceJ2000)
     * so callers don't need to manage the resolver themselves.
     *
     * @param {object[]} planetaryElements
     */
    static fromElements(planetaryElements) {
        assert(Array.isArray(planetaryElements), 'EphemerisBoundary.fromElements: planetaryElements must be an array');

        const byName = new Map();
        planetaryElements.forEach((element) => byName.set(element.name, element));

        const resolveParent = (parentName) => byName.get(parentName) || null;

        return {
            getStateByName(name, daysSinceJ2000) {
                const bodyData = byName.get(name);
                assert(bodyData !== undefined, `EphemerisBoundary.fromElements: unknown body "${name}"`);
                return EphemerisBoundary.getState(bodyData, daysSinceJ2000, resolveParent);
            },
            getState(bodyData, daysSinceJ2000) {
                return EphemerisBoundary.getState(bodyData, daysSinceJ2000, resolveParent);
            },
        };
    }
}
