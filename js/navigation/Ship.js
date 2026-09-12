// js/navigation/Ship.js

const REQUIRED_NUMERIC_FIELDS = ['weight', 'thrust', 'fuelVolume', 'shipVolume', 'isp'];

export class Ship {
    /**
     * @param {object} data
     * @param {string} data.id
     * @param {string} [data.name]
     * @param {number} data.weight
     * @param {number} data.thrust
     * @param {string} data.fuelType
     * @param {number} data.fuelVolume
     * @param {number} data.shipVolume
     * @param {number} data.isp
     * @returns {object} plain Ship object
     */
    static create(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Ship.create requires a data object');
        }

        const { id, name, fuelType } = data;

        if (!id || typeof id !== 'string') {
            throw new Error('Ship requires a string "id"');
        }

        for (const field of REQUIRED_NUMERIC_FIELDS) {
            const value = data[field];
            if (typeof value !== 'number' || Number.isNaN(value)) {
                throw new Error(`Ship "${id}" requires a numeric "${field}"`);
            }
        }

        return {
            id,
            name: name ?? id,
            weight: data.weight,
            thrust: data.thrust,
            fuelType: fuelType ?? null,
            fuelVolume: data.fuelVolume,
            shipVolume: data.shipVolume,
            isp: data.isp,
        };
    }
}
