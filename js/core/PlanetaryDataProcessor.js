// js/core/PlanetaryDataProcessor.js
/**
 * @typedef {Object} PlanetaryElement
 * @property {string} name - Name of the celestial body
 * @property {string} category - e.g., 'PLANET', 'MOON', 'ASTEROID'
 * @property {string} parent - The parent body it orbits (e.g., 'SUN', 'EARTH')
 * @property {number} a - Semi-major axis (in AU)
 * @property {number} e - Eccentricity
 * @property {number} i - Inclination (degrees)
 * @property {number} w - Argument of periapsis (degrees)
 * @property {number} Node - Longitude of ascending node (degrees)
 * @property {number} M - Mean anomaly (degrees)
 * @property {number} [period_days] - Orbital period in days
 * @property {number} [n] - Mean motion (degrees per day)
 */
import { kmToAU } from '@physics/OrbitalMath.js';

export class PlanetaryDataProcessor {
    static processPlanetaryData(rawData, datasetName = 'UNKNOWN_DATASET') {
        const rad = Math.PI / 180;

        if (rawData.length === 0) {
            return [];
        }

        const processed = rawData.map((row) => {
            const parseF = (val, defaultVal = 0) => {
                if (val === undefined || val === '' || val === null) {
                    return defaultVal;
                }

                const parsed = parseFloat(val);

                return isNaN(parsed) ? defaultVal : parsed;
            };

            const category = (row.category || 'ASTEROID').toUpperCase();
            const isMoon = category === 'MOON';

            const name = (row.name || 'UNKNOWN').toString().toUpperCase();
            const parent = (row.parent || 'SUN').toString().toUpperCase();

            const orbit_model = row.orbit_model || 'KEPLER';

            let a = 0;

            if (isMoon && row.a_km) {
                a = kmToAU(parseF(row.a_km));
            } else {
                a = parseF(row.a_au);
            }

            const e = parseF(row.e);

            const i = parseF(row.i_deg) * rad;
            const w = parseF(row.w_deg) * rad;
            const Node = parseF(row.node_deg) * rad;
            const M0 = parseF(row.m_deg) * rad;

            let period = parseF(row.period_days);

            if (period === 0 && a > 0) {
                period = Math.sqrt(Math.pow(a, 3)) * 365.256;
            }

            const n = period > 0 ? (2 * Math.PI) / period : 0;

            let mass = parseF(row.mass_10_24_kg, 0.000001);

            if (mass === 0) {
                mass = 0.000001;
            }

            let radius_km = parseF(row.radius_km);

            if (radius_km <= 0) {
                radius_km = mass <= 0.000002 ? 1.0 : 0;
            }

            const defaultSymbol = isMoon ? '○' : '•';
            const symbol = row.symbol || defaultSymbol;

            const pole_ra = parseF(row.pole_ra_deg);
            const pole_dec = parseF(row.pole_dec_deg, 90);
            const pole_ra_rate = parseF(row.pole_ra_rate_deg_per_cy);
            const pole_dec_rate = parseF(row.pole_dec_rate_deg_per_cy);
            const pm_w = parseF(row.pm_w_deg);
            const pm_w_rate = parseF(row.pm_w_rate_deg_per_day);

            return {
                name,
                category,
                parent,
                orbit_model,
                a,
                e,
                i,
                w,
                Node,
                M0,
                period,
                n,
                mass,
                radius_km,
                symbol,
                pole_ra,
                pole_dec,
                pole_ra_rate,
                pole_dec_rate,
                pm_w,
                pm_w_rate,
                isTargetable: true,
                datasetName,
                datasetCategory: category,
            };
        });

        processed.sort((a, b) => (b.radius_km || 0) - (a.radius_km || 0));

        return processed;
    }
}
