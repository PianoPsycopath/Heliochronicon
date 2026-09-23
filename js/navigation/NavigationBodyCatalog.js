// js/navigation/NavigationBodyCatalog.js

const NAVIGATION_CATEGORIES = new Set(['STAR', 'PLANET', 'DWARF_PLANET', 'MOON']);

function normalizeName(name) {
    return String(name).trim().toUpperCase();
}

/**
 * @param {object} bodyData - processed body data
 * @returns {boolean} true when the row is a body navigation may resolve
 */
export function isNavigationBody(bodyData) {
    return (
        !!bodyData &&
        typeof bodyData === 'object' &&
        typeof bodyData.name === 'string' &&
        bodyData.name.trim().length > 0 &&
        NAVIGATION_CATEGORIES.has(bodyData.category)
    );
}

export class NavigationBodyCatalog {
    constructor() {
        /** @type {Map<string, object>} */
        this._byName = new Map();
    }

    get size() {
        return this._byName.size;
    }

    /**
     * @param {object[]} rows - processed body data
     * @returns {number} how many rows are held after this call
     */
    registerMany(rows) {
        if (!Array.isArray(rows)) {
            throw new Error('NavigationBodyCatalog.registerMany requires an array of rows');
        }

        let registered = 0;

        for (const row of rows) {
            if (!isNavigationBody(row)) continue;

            const key = normalizeName(row.name);
            const existing = this._byName.get(key);

            if (existing && existing.datasetName !== row.datasetName) continue;

            this._byName.set(key, row);
            registered++;
        }

        return registered;
    }

    /**
     * @param {string} name
     * @returns {object|null}
     */
    getByName(name) {
        if (typeof name !== 'string') return null;

        return this._byName.get(normalizeName(name)) ?? null;
    }

    /**
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
        return this.getByName(name) !== null;
    }

    /**
     * Direct children of a body (a planet's moons). The root is never its own child.
     *
     * @param {string} parentName
     * @returns {object[]}
     */
    getByParent(parentName) {
        if (typeof parentName !== 'string') return [];

        const parentKey = normalizeName(parentName);
        const children = [];

        for (const [key, bodyData] of this._byName) {
            if (key !== parentKey && bodyData.parent === parentKey) children.push(bodyData);
        }

        return children;
    }

    /**
     * @param {string} datasetName
     * @returns {number} entries removed
     */
    removeByDataset(datasetName) {
        let removed = 0;

        for (const [key, bodyData] of this._byName) {
            if (bodyData.datasetName === datasetName) {
                this._byName.delete(key);
                removed++;
            }
        }

        return removed;
    }

    clear() {
        this._byName.clear();
    }

    /**
     * Builds the `getBodyDataByName` function navigation consumes: catalog first, then
     * an optional fallback for bodies that exist only as visuals (promoted asteroids,
     * radar contacts).
     *
     * @param {(name: string) => object|null} [fallback]
     * @returns {(name: string) => object|null}
     */
    asLookup(fallback = null) {
        return (name) => this.getByName(name) ?? (fallback ? fallback(name) : null) ?? null;
    }
}