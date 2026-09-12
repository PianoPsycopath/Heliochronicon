// js/navigation/FleetRepository.js

import { DataRepository } from '@core/DataRepository.js';
import { Fleet } from '@navigation/Fleet.js';

const DEFAULT_FLEET_DATA_URL = 'data/fleets/userfleet.json';

export class FleetRepository {
    /**
     * @param {string} [url] - defaults to the standard user-fleet data path
     * @returns {Promise<object>}
     */
    static async fetchFleetData(url = DEFAULT_FLEET_DATA_URL) {
        return DataRepository.fetchJSONDataset(url);
    }

    /**
     * Fetch the static fleet definition and build a validated Fleet from it.
     * @param {string} [url]
     * @returns {Promise<object>} a Fleet as returned by Fleet.create()
     */
    static async loadFleet(url = DEFAULT_FLEET_DATA_URL) {
        const data = await FleetRepository.fetchFleetData(url);
        return Fleet.create(data);
    }
}
