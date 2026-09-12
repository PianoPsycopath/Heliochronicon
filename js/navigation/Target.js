// js/navigation/Target.js

export class Target {
    /**
     * @param {object} data
     * @param {string} data.bodyName - name of the body being targeted (e.g. "MARS")
     * @param {number} [data.epochDaysJ2000]
     * @param {number} [data.a] - semi-major axis (AU)
     * @param {number} [data.e] - eccentricity
     * @param {number} [data.i] - inclination (rad)
     * @param {number} [data.w] - argument of periapsis (rad)
     * @param {number} [data.node] - longitude of ascending node (rad)
     * @param {number} [data.M0] - mean anomaly at epoch (rad)
     * @returns {object} plain Target object
     */
    static create(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Target.create requires a data object');
        }

        const { bodyName } = data;

        if (!bodyName || typeof bodyName !== 'string') {
            throw new Error('Target requires a string "bodyName"');
        }

        return {
            bodyName,
            epochDaysJ2000: data.epochDaysJ2000 ?? null,
            a: data.a ?? null,
            e: data.e ?? null,
            i: data.i ?? null,
            w: data.w ?? null,
            node: data.node ?? null,
            M0: data.M0 ?? null,
        };
    }
}
