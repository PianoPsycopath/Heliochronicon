// js/navigation/FlightPlan.js

import { Burn } from '@navigation/Burn.js';

export class FlightPlan {
    /**
     * @param {object} data
     * @param {string} data.fleetId
     * @param {object} data.target
     * @param {number} [data.departureEpochDaysJ2000]
     * @param {number} [data.arrivalEpochDaysJ2000]
     * @param {object[]} [data.burns]
     * @param {number} [data.totalDeltaV]
     * @param {number} [data.propellantRequired]
     * @param {number|null} [data.fuelRemainingAfter]
     * @param {boolean} [data.isFeasible]
     * @param {{x:number,y:number,z:number}|null} [data.arrivalPosition]
     * @param {{x:number,y:number,z:number}|null} [data.arrivalVelocity]
     * @param {string[]} [data.warnings]
     * @returns {object} plain FlightPlan object
     */
    static create(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('FlightPlan.create requires a data object');
        }

        const { fleetId, target } = data;

        if (!fleetId || typeof fleetId !== 'string') {
            throw new Error('FlightPlan requires a string "fleetId"');
        }

        if (!target || typeof target !== 'object' || !target.bodyName) {
            throw new Error('FlightPlan requires a "target" (see Target.create)');
        }

        const burns = Array.isArray(data.burns)
            ? data.burns.map((burnData) => Burn.create(burnData))
            : [];

        return {
            fleetId,
            target,
            departureEpochDaysJ2000: data.departureEpochDaysJ2000 ?? null,
            arrivalEpochDaysJ2000: data.arrivalEpochDaysJ2000 ?? null,
            burns,
            totalDeltaV: data.totalDeltaV ?? 0,
            propellantRequired: data.propellantRequired ?? 0,
            fuelRemainingAfter: data.fuelRemainingAfter ?? null,
            isFeasible: data.isFeasible ?? true,
            arrivalPosition: data.arrivalPosition ?? null,
            arrivalVelocity: data.arrivalVelocity ?? null,
            warnings: Array.isArray(data.warnings) ? [...data.warnings] : [],
        };
    }
}
