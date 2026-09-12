// js/navigation/Fleet.js

import { Ship } from '@navigation/Ship.js';

export class Fleet {
    /**
     * @param {object} data
     * @param {string} data.id
     * @param {string} [data.name]
     * @param {object[]} data.ships
     * @returns {object}
     */
    static create(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Fleet.create requires a data object');
        }

        const { id, name, ships } = data;

        if (!id || typeof id !== 'string') {
            throw new Error('Fleet requires a string "id"');
        }

        if (!Array.isArray(ships) || ships.length === 0) {
            throw new Error(`Fleet "${id}" requires a non-empty "ships" array`);
        }

        return {
            id,
            name: name ?? id,
            ships: ships.map((shipData) => Ship.create(shipData)),
        };
    }

    /**
     * @param {object} fleet
     * @returns {number}
     */
    static worstIsp(fleet) {
        if (!fleet || !Array.isArray(fleet.ships) || fleet.ships.length === 0) {
            throw new Error('Fleet.worstIsp requires a fleet with at least one ship');
        }

        return fleet.ships.reduce(
            (worst, ship) => Math.min(worst, ship.isp),
            Number.POSITIVE_INFINITY
        );
    }
}
