// js/navigation/Burn.js

export class Burn {
    /**
     * @param {object} data
     * @param {number} data.epochDaysJ2000
     * @param {{x:number, y:number, z:number}} data.deltaV
     * @param {{x:number, y:number, z:number}} [data.position]
     * @returns {object} plain Burn object
     */
    static create(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Burn.create requires a data object');
        }

        const { epochDaysJ2000, deltaV, position } = data;

        if (typeof epochDaysJ2000 !== 'number' || Number.isNaN(epochDaysJ2000)) {
            throw new Error('Burn requires a numeric "epochDaysJ2000"');
        }

        if (!Burn.isVector3(deltaV)) {
            throw new Error('Burn requires a "deltaV" vector of { x, y, z } numbers');
        }

        if (position !== undefined && position !== null && !Burn.isVector3(position)) {
            throw new Error('Burn "position", if provided, must be a { x, y, z } vector');
        }

        return {
            epochDaysJ2000,
            deltaV: { x: deltaV.x, y: deltaV.y, z: deltaV.z },
            position: position ? { x: position.x, y: position.y, z: position.z } : null,
        };
    }

    static isVector3(v) {
        return (
            !!v &&
            typeof v.x === 'number' &&
            typeof v.y === 'number' &&
            typeof v.z === 'number'
        );
    }
}
