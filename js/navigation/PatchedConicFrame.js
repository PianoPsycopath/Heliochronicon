// js/navigation/PatchedConicFrame.js

import { AU_IN_KM } from '@core/constants.js';
import { bodySemiMajorAxisKm, sphereOfInfluenceKm } from '@core/BodyPhysicalConstants.js';
import { TRAJECTORY_FRAME, isTrajectoryState } from '@navigation/TrajectoryState.js';


export const HELIOCENTRIC_ROOT_BODY_NAME = 'SUN';

export const EXCLUSION_REASON = Object.freeze({
    UNKNOWN_BODY: 'unknown-body',
    NO_MASS: 'no-mass',
    BROKEN_PARENT_CHAIN: 'broken-parent-chain',
    INVALID_SOI: 'invalid-soi',
    SOI_WITHIN_BODY: 'soi-within-body-radius',
});

function isFiniteVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function normalizeBodyName(name) {
    return String(name).trim().toUpperCase();
}

/**
 * @param {object} bodyData
 * @returns {boolean}
 */
export function isRootBody(bodyData) {
    return !!bodyData && bodyData.parent === bodyData.name;
}

/**
 * @param {object} bodyData
 * @param {(name: string) => object|null} getBodyDataByName
 * @returns {object[]} [body, parent, grandparent, ..., root]
 * @throws when an ancestor is missing from the body data or the chain loops
 */
export function getParentChain(bodyData, getBodyDataByName) {
    const chain = [bodyData];
    const seen = new Set([bodyData.name]);
    let current = bodyData;

    while (!isRootBody(current)) {
        const parent = getBodyDataByName(current.parent);
        if (!parent) {
            throw new Error(
                `PatchedConicFrame: "${current.name}" names unknown parent "${current.parent}"`
            );
        }
        if (seen.has(parent.name)) {
            throw new Error(
                `PatchedConicFrame: parent chain of "${bodyData.name}" loops at "${parent.name}"`
            );
        }
        seen.add(parent.name);
        chain.push(parent);
        current = parent;
    }

    return chain;
}

/**
 * @param {object} bodyData - processed body data
 * @param {(name: string) => object|null} getBodyDataByName
 * @returns {number} km; Infinity for the root body, which has no primary
 */
export function getSphereOfInfluenceKm(bodyData, getBodyDataByName) {
    if (!bodyData || typeof bodyData !== 'object') {
        throw new Error('getSphereOfInfluenceKm requires a bodyData object');
    }
    if (isRootBody(bodyData)) return Infinity;
    if (bodyData.massIsKnown === false) return 0;

    const primaryBodyData = getBodyDataByName(bodyData.parent);
    if (!primaryBodyData) {
        throw new Error(
            `getSphereOfInfluenceKm: "${bodyData.name}" names unknown parent "${bodyData.parent}"`
        );
    }
    if (primaryBodyData.massIsKnown === false) {
        throw new Error(
            `getSphereOfInfluenceKm: parent "${primaryBodyData.name}" of "${bodyData.name}" has no mass`
        );
    }

    return sphereOfInfluenceKm({
        semiMajorAxisKm: bodySemiMajorAxisKm(bodyData),
        bodyData,
        primaryBodyData,
    });
}

/**
 * @param {object} params
 * @param {(name: string) => object|null} params.getBodyDataByName
 * @param {(bodyData: object, epochDaysJ2000: number) => {x:number,y:number,z:number}} params.getPositionAu
 * @returns {(bodyData: object, epochDaysJ2000: number) => {x:number,y:number,z:number}}
 */
export function createHeliocentricPositionResolver({ getBodyDataByName, getPositionAu }) {
    if (typeof getBodyDataByName !== 'function') {
        throw new Error('createHeliocentricPositionResolver requires "getBodyDataByName"');
    }
    if (typeof getPositionAu !== 'function') {
        throw new Error('createHeliocentricPositionResolver requires "getPositionAu"');
    }

    return function heliocentricPositionAu(bodyData, epochDaysJ2000) {
        let x = 0;
        let y = 0;
        let z = 0;

        for (const link of getParentChain(bodyData, getBodyDataByName)) {
            if (isRootBody(link)) break;

            const relative = getPositionAu(link, epochDaysJ2000);
            if (!isFiniteVector3(relative)) {
                throw new Error(
                    `PatchedConicFrame: no finite position for "${link.name}" at epoch ${epochDaysJ2000}`
                );
            }
            x += relative.x;
            y += relative.y;
            z += relative.z;
        }

        return { x, y, z };
    };
}

function shipHeliocentricPositionAu(state, getBodyDataByName, getBodyHeliocentricPositionAu) {
    if (state.frame === TRAJECTORY_FRAME.HELIOCENTRIC) {
        return state.position;
    }

    const parentData = getBodyDataByName(state.parentBody);
    if (!parentData) {
        throw new Error(`resolveCurrentParent: state parent body "${state.parentBody}" is unknown`);
    }

    const parent = getBodyHeliocentricPositionAu(parentData, state.epochDaysJ2000);
    if (!isFiniteVector3(parent)) {
        throw new Error(
            `resolveCurrentParent: no finite heliocentric position for "${state.parentBody}"`
        );
    }

    // km -> AU at the boundary; the state itself stays in km.
    return {
        x: parent.x + state.position.x / AU_IN_KM,
        y: parent.y + state.position.y / AU_IN_KM,
        z: parent.z + state.position.z / AU_IN_KM,
    };
}

/**
 * @param {object} params
 * @param {import('@navigation/TrajectoryState.js').TrajectoryState} params.state
 * @param {string[]} [params.candidateBodyNames] - origin, targets, allowed bodies
 * @param {(name: string) => object|null} params.getBodyDataByName
 * @param {(bodyData: object, epochDaysJ2000: number) => {x:number,y:number,z:number}} params.getBodyHeliocentricPositionAu
 *   - see createHeliocentricPositionResolver
 * @returns {Readonly<{
 *   parentBody: string,
 *   isRoot: boolean,
 *   soiKm: number,
 *   distanceKm: number,
 *   epochDaysJ2000: number,
 *   containing: ReadonlyArray<{bodyName:string, depth:number, soiKm:number, distanceKm:number}>,
 *   excluded: ReadonlyArray<{bodyName:string, reason:string, detail?:string}>
 * }>} `containing` lists every candidate SOI holding the ship, innermost first
 */
export function resolveCurrentParent({
    state,
    candidateBodyNames = [],
    getBodyDataByName,
    getBodyHeliocentricPositionAu,
} = {}) {
    if (!isTrajectoryState(state)) {
        throw new Error('resolveCurrentParent requires a TrajectoryState');
    }
    if (typeof getBodyDataByName !== 'function') {
        throw new Error('resolveCurrentParent requires "getBodyDataByName"');
    }
    if (typeof getBodyHeliocentricPositionAu !== 'function') {
        throw new Error('resolveCurrentParent requires "getBodyHeliocentricPositionAu"');
    }
    if (!Array.isArray(candidateBodyNames)) {
        throw new Error('resolveCurrentParent requires "candidateBodyNames" to be an array');
    }

    const epochDaysJ2000 = state.epochDaysJ2000;
    const ship = shipHeliocentricPositionAu(
        state,
        getBodyDataByName,
        getBodyHeliocentricPositionAu
    );

    const requestedNames = [];
    if (state.frame === TRAJECTORY_FRAME.BODY_CENTERED) requestedNames.push(state.parentBody);
    requestedNames.push(...candidateBodyNames);

    const excluded = [];
    const candidates = new Map();
    let rootBody = null;

    for (const requested of new Set(requestedNames.map(normalizeBodyName))) {
        const bodyData = getBodyDataByName(requested);
        if (!bodyData) {
            excluded.push({ bodyName: requested, reason: EXCLUSION_REASON.UNKNOWN_BODY });
            continue;
        }

        let chain;
        try {
            chain = getParentChain(bodyData, getBodyDataByName);
        } catch (err) {
            excluded.push({
                bodyName: requested,
                reason: EXCLUSION_REASON.BROKEN_PARENT_CHAIN,
                detail: err.message,
            });
            continue;
        }

        rootBody = rootBody ?? chain[chain.length - 1];
        chain.forEach((link, index) => {
            if (isRootBody(link)) return;
            candidates.set(link.name, { bodyData: link, depth: chain.length - 1 - index });
        });
    }

    rootBody = rootBody ?? getBodyDataByName(HELIOCENTRIC_ROOT_BODY_NAME);
    if (!rootBody) {
        throw new Error(
            'resolveCurrentParent could not determine the root body from the candidates'
        );
    }

    const containing = [];

    for (const { bodyData, depth } of candidates.values()) {
        if (bodyData.massIsKnown === false) {
            excluded.push({ bodyName: bodyData.name, reason: EXCLUSION_REASON.NO_MASS });
            continue;
        }

        let soiKm;
        try {
            soiKm = getSphereOfInfluenceKm(bodyData, getBodyDataByName);
        } catch (err) {
            excluded.push({
                bodyName: bodyData.name,
                reason: EXCLUSION_REASON.INVALID_SOI,
                detail: err.message,
            });
            continue;
        }

        const radiusKm =
            Number.isFinite(bodyData.radius_km) && bodyData.radius_km > 0 ? bodyData.radius_km : 0;
        if (!(soiKm > radiusKm)) {
            excluded.push({
                bodyName: bodyData.name,
                reason: EXCLUSION_REASON.SOI_WITHIN_BODY,
                detail: `SOI ${soiKm} km does not clear radius ${radiusKm} km`,
            });
            continue;
        }

        const bodyPosition = getBodyHeliocentricPositionAu(bodyData, epochDaysJ2000);
        if (!isFiniteVector3(bodyPosition)) {
            excluded.push({
                bodyName: bodyData.name,
                reason: EXCLUSION_REASON.INVALID_SOI,
                detail: 'no finite heliocentric position',
            });
            continue;
        }

        const distanceKm =
            Math.hypot(ship.x - bodyPosition.x, ship.y - bodyPosition.y, ship.z - bodyPosition.z) *
            AU_IN_KM;

        if (distanceKm < soiKm) {
            containing.push({ bodyName: bodyData.name, depth, soiKm, distanceKm });
        }
    }

    containing.sort(
        (a, b) =>
            b.depth - a.depth ||
            a.soiKm - b.soiKm ||
            (a.bodyName < b.bodyName ? -1 : a.bodyName > b.bodyName ? 1 : 0)
    );

    const innermost = containing[0];

    return Object.freeze({
        parentBody: innermost ? innermost.bodyName : rootBody.name,
        isRoot: !innermost,
        soiKm: innermost ? innermost.soiKm : Infinity,
        distanceKm: innermost
            ? innermost.distanceKm
            : Math.hypot(ship.x, ship.y, ship.z) * AU_IN_KM,
        epochDaysJ2000,
        containing: Object.freeze(containing.map((entry) => Object.freeze(entry))),
        excluded: Object.freeze(excluded.map((entry) => Object.freeze(entry))),
    });
}