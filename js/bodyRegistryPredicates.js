// js/bodyRegistryPredicates.js
//
// Pure decision helpers for CelestialBody lifecycle sweeps. These take plain
// `body.data` objects (or the equivalent target-data shape) and booleans/
// strings only -- no THREE, no DOM, no scene access -- so they can be unit
// tested directly and reused anywhere the same matching logic is needed.
//
// Two purge semantics exist in the app and are intentionally kept distinct
// (see BodyRegistry.purgeTacticalClones vs BodyRegistry.sweepForRescan):
//   - a full sweep (tactical scan toggled off) clears every radar contact
//     and every unpinned promoted-asteroid clone, no exceptions.
//   - a rescan sweep (about to repopulate radar hits) clears radar contacts
//     unconditionally too, but spares an unpinned clone if it's the body
//     currently focused/targeted, so an in-progress focus isn't yanked out
//     from under the user mid-scan.

export function matchesDataset(bodyData, datasetName) {
    return bodyData.datasetName === datasetName;
}

export function matchesNameAndCategory(bodyData, name, category) {
    return bodyData.name === name && bodyData.datasetCategory === category;
}

export function isRadarContact(bodyData) {
    return bodyData.datasetCategory === 'RADAR_CONTACT';
}

export function isUnpinnedPromotedClone(bodyData) {
    return bodyData.datasetCategory === 'PROMOTED_ASTEROID' && !bodyData.isPinned;
}

export function isProtectedTarget(bodyData, protectedTargetData) {
    return !!protectedTargetData && protectedTargetData.name === bodyData.name;
}

// Full, unconditional tactical-clone sweep (scan toggled off / cancelled).
export function shouldPurgeInFullSweep(bodyData) {
    return isRadarContact(bodyData) || isUnpinnedPromotedClone(bodyData);
}

// Sweep immediately before repopulating fresh radar hits during a scan.
export function shouldPurgeInRescan(bodyData, protectedTargetData = null) {
    if (isRadarContact(bodyData)) return true;
    if (!isUnpinnedPromotedClone(bodyData)) return false;
    return !isProtectedTarget(bodyData, protectedTargetData);
}