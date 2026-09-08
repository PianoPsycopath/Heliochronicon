import {
    assert,
    assertNonEmptyString,
    assertFiniteNumber,
    assertOneOf,
    assertVector3,
    deepFreeze,
} from './validation.js';

export const TARGET_TYPES = [
    'BODY_CENTER',
    'BODY_ORBIT',
    'STATE_VECTOR',
    'ORBITAL_ELEMENTS',
    'SURFACE_COORDINATE',
    'SURFACE_COORDINATE_ALTITUDE',
];

function validateByType(type, params) {
    switch (type) {
        case 'BODY_CENTER':
            assertNonEmptyString(params.bodyName, 'TargetDefinition.bodyName');
            return { bodyName: params.bodyName };

        case 'BODY_ORBIT':
            assertNonEmptyString(params.bodyName, 'TargetDefinition.bodyName');
            assertFiniteNumber(params.altitude_km, 'TargetDefinition.altitude_km');
            return { bodyName: params.bodyName, altitude_km: params.altitude_km };

        case 'STATE_VECTOR':
            assertVector3(params.position, 'TargetDefinition.position');
            assertVector3(params.velocity, 'TargetDefinition.velocity');
            return { position: params.position, velocity: params.velocity };

        case 'ORBITAL_ELEMENTS':
            ['a', 'e', 'i', 'w', 'Node', 'M0'].forEach((key) =>
                assertFiniteNumber(params[key], `TargetDefinition.${key}`)
            );
            return {
                a: params.a,
                e: params.e,
                i: params.i,
                w: params.w,
                Node: params.Node,
                M0: params.M0,
            };

        case 'SURFACE_COORDINATE':
            assertNonEmptyString(params.bodyName, 'TargetDefinition.bodyName');
            assertFiniteNumber(params.latitude_deg, 'TargetDefinition.latitude_deg');
            assertFiniteNumber(params.longitude_deg, 'TargetDefinition.longitude_deg');
            return {
                bodyName: params.bodyName,
                latitude_deg: params.latitude_deg,
                longitude_deg: params.longitude_deg,
            };

        case 'SURFACE_COORDINATE_ALTITUDE':
            assertNonEmptyString(params.bodyName, 'TargetDefinition.bodyName');
            assertFiniteNumber(params.latitude_deg, 'TargetDefinition.latitude_deg');
            assertFiniteNumber(params.longitude_deg, 'TargetDefinition.longitude_deg');
            assertFiniteNumber(params.altitude_km, 'TargetDefinition.altitude_km');
            return {
                bodyName: params.bodyName,
                latitude_deg: params.latitude_deg,
                longitude_deg: params.longitude_deg,
                altitude_km: params.altitude_km,
            };

        default:
            assert(false, `Unhandled TargetDefinition.type: ${type}`);
            return {};
    }
}

export function createTargetDefinition({ type, ...params }) {
    assertOneOf(type, TARGET_TYPES, 'TargetDefinition.type');
    const fields = validateByType(type, params);
    return deepFreeze({ type, ...fields });
}
