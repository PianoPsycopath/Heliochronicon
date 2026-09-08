import { assertNonEmptyString, assertFiniteNumber, deepFreeze } from './validation.js';

export function createHistoricalMissionRecord({
    name,
    origin,
    target,
    launchTime_daysSinceJ2000,
    arrivalTime_daysSinceJ2000,
    actualDeltaV_kmps,
    spacecraftMass_kg,
    description = '',
    sourceReference = '',
}) {
    assertNonEmptyString(name, 'HistoricalMissionRecord.name');
    assertNonEmptyString(origin, 'HistoricalMissionRecord.origin');
    assertNonEmptyString(target, 'HistoricalMissionRecord.target');
    assertFiniteNumber(launchTime_daysSinceJ2000, 'HistoricalMissionRecord.launchTime_daysSinceJ2000');
    assertFiniteNumber(arrivalTime_daysSinceJ2000, 'HistoricalMissionRecord.arrivalTime_daysSinceJ2000');
    assertFiniteNumber(actualDeltaV_kmps, 'HistoricalMissionRecord.actualDeltaV_kmps');
    assertFiniteNumber(spacecraftMass_kg, 'HistoricalMissionRecord.spacecraftMass_kg');

    return deepFreeze({
        name,
        origin,
        target,
        launchTime_daysSinceJ2000,
        arrivalTime_daysSinceJ2000,
        actualDeltaV_kmps,
        spacecraftMass_kg,
        description,
        sourceReference,
    });
}
