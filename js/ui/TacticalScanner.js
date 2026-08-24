import { OrbitalMath } from '@physics/OrbitalMath.js';
import { shouldPurgeInFullSweep } from '@core/bodyRegistryPredicates.js';
import * as THREE from 'three';

export class TacticalScanner {
    constructor({
        UI,
        celestialBodies,
        camera,
        currentOrigin,
        gpuParticleSystems,
        bodyRegistry,
        asteroidPromotionService,
        bodyFactory,
        getSystemDate,
        getCurrentTarget,
        getJ2000Days,
        onTargetPurged,
    }) {
        this.UI = UI;
        this.celestialBodies = celestialBodies;
        this.camera = camera;
        this.currentOrigin = currentOrigin;
        this.gpuParticleSystems = gpuParticleSystems;
        this.bodyRegistry = bodyRegistry;
        this.asteroidPromotionService = asteroidPromotionService;
        this.bodyFactory = bodyFactory;
        this.getSystemDate = getSystemDate;
        this.getCurrentTarget = getCurrentTarget;
        this.getJ2000Days = getJ2000Days;
        this.onTargetPurged = onTargetPurged;
    }

    purgeTacticalClones() {
        const currentTargetData = this.getCurrentTarget();
        this.asteroidPromotionService.purgeUnpinned();

        if (currentTargetData && shouldPurgeInFullSweep(currentTargetData)) {
            this.onTargetPurged();
        } else {
            this.UI.updateTargetPanel(currentTargetData);
            this.UI.renderBodyList(this.celestialBodies, currentTargetData);
        }
    }

    performTacticalScan() {
        const currentTargetData = this.getCurrentTarget();
        const systemDate = this.getSystemDate();

        this.UI.showScanningStatus();

        setTimeout(() => {
            let scanOrigin = new THREE.Vector3();
            let referenceName = 'CAMERA';

            if (currentTargetData) {
                const tBody = this.bodyRegistry.getByName(currentTargetData.name);
                if (tBody) {
                    scanOrigin.copy(tBody.globalPos);
                } else if (
                    currentTargetData.datasetCategory === 'ASTEROID' ||
                    currentTargetData.datasetCategory === 'PROMOTED_ASTEROID'
                ) {
                    const M_current =
                        currentTargetData.M0 + currentTargetData.n * this.getJ2000Days(systemDate);
                    scanOrigin = OrbitalMath.calcPosFromM(
                        currentTargetData.a,
                        currentTargetData.e,
                        currentTargetData.i,
                        currentTargetData.w,
                        currentTargetData.Node,
                        M_current
                    );
                }
                referenceName = currentTargetData.name;
            } else {
                scanOrigin.copy(this.camera.position).add(this.currentOrigin);
            }

            const currentJ2000Days = this.getJ2000Days(systemDate);
            let closestList = [];

            this.asteroidPromotionService.sweepForRescan(currentTargetData);

            this.gpuParticleSystems.forEach((system) => {
                if (!system.visible) return;

                const sourceData = system.userData.sourceData;
                if (!sourceData || !system.geometry.attributes.a) return;

                const a_arr = system.geometry.attributes.a.array;
                const e_arr = system.geometry.attributes.e.array;
                const i_arr = system.geometry.attributes.i.array;
                const w_arr = system.geometry.attributes.w.array;
                const Node_arr = system.geometry.attributes.Node.array;
                const M0_arr = system.geometry.attributes.M0.array;
                const n_arr = system.geometry.attributes.n.array;

                for (let idx = 0; idx < sourceData.length; idx++) {
                    const M_current = M0_arr[idx] + n_arr[idx] * currentJ2000Days;
                    const rawPos = OrbitalMath.calcPosFromM(
                        a_arr[idx],
                        e_arr[idx],
                        i_arr[idx],
                        w_arr[idx],
                        Node_arr[idx],
                        M_current
                    );
                    let pos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
                    const dx = pos.x - scanOrigin.x;
                    const dy = pos.y - scanOrigin.y;
                    const dz = pos.z - scanOrigin.z;
                    const distSq = dx * dx + dy * dy + dz * dz;

                    if (closestList.length < 20 || distSq < closestList[19].distSq) {
                        closestList.push({ distSq: distSq, data: sourceData[idx] });
                        closestList.sort((a, b) => a.distSq - b.distSq);
                        if (closestList.length > 20) closestList.pop();
                    }
                }
            });

            // 2. Spawn 3D Green Radar Blips via BodyFactory
            closestList.forEach((hit) => {
                const radarData = { ...hit.data, datasetCategory: 'RADAR_CONTACT' };
                const M_current = radarData.M0 + radarData.n * currentJ2000Days;

                const rawPos = OrbitalMath.calcPosFromM(
                    radarData.a,
                    radarData.e,
                    radarData.i,
                    radarData.w,
                    radarData.Node,
                    M_current
                );
                const absolutePos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);

                // Delegate construction entirely to the Factory
                const body = this.bodyFactory.createRadarContact(radarData, absolutePos, this.camera.zoom, this.currentOrigin);
                this.bodyRegistry.registerBody(body);
            });

            this.UI.renderScanResults(closestList, referenceName);
        }, 50);
    }
}