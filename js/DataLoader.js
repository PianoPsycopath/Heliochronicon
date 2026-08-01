// js/DataLoader.js
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
import { kmToAU } from './OrbitalMath.js';

export class DataLoader {
    
    static async fetchJSONDataset(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to load dataset from ${url}:`, error);
            return [];
        }
    }
    static processPlanetaryData(rawData, datasetName = "UNKNOWN_DATASET") {
        const rad = Math.PI / 180;
        if (rawData.length === 0) return [];
        
        const processed = rawData.map(row => {
            const parseF = (val, defaultVal = 0) => {
                if (val === undefined || val === "" || val === null) return defaultVal;
                const parsed = parseFloat(val);
                return isNaN(parsed) ? defaultVal : parsed;
            };

            const category = (row.category || 'ASTEROID').toUpperCase();
            const isMoon = category === 'MOON';
            
            const name = (row.name || "UNKNOWN").toString().toUpperCase();
            const parent = (row.parent || "SUN").toString().toUpperCase();

            // --- Orbital Elements ---
            let a = 0;
            if (isMoon && row.a_km) {
                a = kmToAU(parseF(row.a_km));
            } else {
                a = parseF(row.a);
            }

            const e = parseF(row.e);
            
            const i = parseF(row.i_deg) * rad;
            const w = parseF(row.w_deg) * rad;
            const Node = parseF(row.node_deg) * rad;
            const M0 = parseF(row.m_deg) * rad;

            // --- Physical & Kinematic Properties ---
            let period = parseF(row.period_days);

            if (period === 0 && a > 0) {
                period = Math.sqrt(Math.pow(a, 3)) * 365.256; 
            }
            const n = period > 0 ? (2 * Math.PI) / period : 0;

            let mass = parseF(row.mass_10_24_kg, 0.000001);
            if (mass === 0) mass = 0.000001; 

            let radius_km = parseF(row.radius_km);
            if (radius_km <= 0) {
                radius_km = mass <= 0.000002 ? 1.0 : 0; 
            }

            const defaultSymbol = isMoon ? "○" : "•"; 
            const symbol = row.symbol || defaultSymbol;

            const pole_ra = parseF(row.pole_ra_deg);
            const pole_dec = parseF(row.pole_dec_deg, 90); 
            const pole_ra_rate = parseF(row.pole_ra_rate_deg_per_cy);
            const pole_dec_rate = parseF(row.pole_dec_rate_deg_per_cy);
            const pm_w = parseF(row.pm_w_deg);
            const pm_w_rate = parseF(row.pm_w_rate_deg_per_day);

            return { 
                name, parent, category, parent, a, e, i, w, Node, M0, period, n, mass, radius_km, symbol, 
                pole_ra, pole_dec, pole_ra_rate, pole_dec_rate, pm_w, pm_w_rate, isTargetable: true,
                datasetName, datasetCategory: category
            };
        });

        // Sort bodies by size descending so large rocks are evaluated first for rendering
        processed.sort((a, b) => (b.radius_km || 0) - (a.radius_km || 0));
        return processed;
    }
    // ==========================================
    // ASTEROID LOOKUP 
    // ==========================================
    // TODO: Move to separate module. Needs cheaper lookup
    static normalizeDesignation(value) {
        return value.toString().trim().toUpperCase().replace(/[()]/g, '');
    }

    static async scanChunksForDesignation(urls, query, datasetName, batchSize = 8) {
        const target = DataLoader.normalizeDesignation(query);

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            const chunks = await Promise.all(batch.map(url => DataLoader.fetchJSONDataset(url)));

            for (const rows of chunks) {
                const row = rows.find(r => r && r.name !== undefined &&
                    DataLoader.normalizeDesignation(r.name) === target);
                if (row) return DataLoader.processPlanetaryData([row], datasetName)[0];
            }
        }
        return null;
    }

    static async binarySearchNumberedChunks(chunkUrls, targetNumber, datasetName) {
        let lo = 0, hi = chunkUrls.length - 1;
        const cache = new Map();

        const loadChunk = async (idx) => {
            if (!cache.has(idx)) cache.set(idx, await DataLoader.fetchJSONDataset(chunkUrls[idx]));
            return cache.get(idx);
        };

        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const rows = await loadChunk(mid);
            if (!rows.length) { hi = mid - 1; continue; }

            const first = rows[0].name;
            const last = rows[rows.length - 1].name;

            if (typeof first !== 'number' || typeof last !== 'number') {
                hi = mid - 1;
                continue;
            }

            if (targetNumber < first) hi = mid - 1;
            else if (targetNumber > last) lo = mid + 1;
            else {
                const row = rows.find(r => r.name === targetNumber);
                return row ? DataLoader.processPlanetaryData([row], datasetName)[0] : null;
            }
        }
        return null;
    }

    static async findAsteroidInManifest(query, manifest, skipGroups = []) {
        if (!manifest || !manifest.datasets) return null;

        const skip = new Set(skipGroups);
        const isNumeric = /^\d+$/.test(query.toString().trim());
        const entries = Object.entries(manifest.datasets).filter(([groupName]) => !skip.has(groupName));

        const mainBeltEntry = entries.find(([groupName]) => groupName === 'main-belt');
        const otherEntries = entries
            .filter(([groupName]) => groupName !== 'main-belt')
            .sort((a, b) => a[1].totalRecords - b[1].totalRecords);

        if (isNumeric && mainBeltEntry) {
            const [groupName, groupData] = mainBeltEntry;
            const urls = groupData.chunks.map(file => `data/${file}`);
            const hit = await DataLoader.binarySearchNumberedChunks(urls, parseInt(query, 10), groupName);
            if (hit) return hit;
        }

        for (const [groupName, groupData] of otherEntries) {
            const urls = groupData.chunks.map(file => `data/${file}`);
            const hit = await DataLoader.scanChunksForDesignation(urls, query, groupName);
            if (hit) return hit;
        }

        // Backup search function for unnumbered main-belt objects (provisional designations) that are stored in the trailing chunks of the main-belt dataset. 
        // This is a linear scan, but it's only for a small fraction of the total records and future NASA additions.
        if (mainBeltEntry && !isNumeric) {
            const [groupName, groupData] = mainBeltEntry;
            const urls = groupData.chunks.map(file => `data/${file}`);
            return await DataLoader.scanChunksForDesignation(urls, query, groupName);
        }

        return null;
    }
}