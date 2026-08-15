// js/TacticalScanner.js
import { OrbitalMath } from './OrbitalMath.js';
import { CelestialBody } from './CelestialBody.js';
import { shouldPurgeInFullSweep } from './bodyRegistryPredicates.js';
import * as THREE from 'three'

export class TacticalScanner {
    constructor(engineContext) {
        // The context provides references to the main engine state and arrays
        this.ctx = engineContext;
    }

    purgeTacticalClones() {
        const { UI, celestialBodies, bodyRegistry } = this.ctx;
        const currentTargetData = this.ctx.getCurrentTarget();

        // 1. Sweep and destroy all Radar Contacts and Unpinned Clones
        bodyRegistry.purgeTacticalClones();

        // 2. Break camera tracking if the user was focused on an unpinned clone that just got deleted
        if (currentTargetData && shouldPurgeInFullSweep(currentTargetData)) {
            this.ctx.onTargetPurged();
        } else {
            // 3. Reset the UI Panels normally
            UI.updateTargetPanel(currentTargetData);
            UI.renderBodyList(celestialBodies, currentTargetData);
        }
    }

    performTacticalScan() {
        const { UI, scene, camera, currentOrigin, celestialBodies, gpuParticleSystems, dotTexture, savedColors, bodyRegistry } = this.ctx;
        const systemDate = this.ctx.getSystemDate();
        const currentTargetData = this.ctx.getCurrentTarget();

        UI.showScanningStatus();        
        
        setTimeout(() => {
            let scanOrigin = new THREE.Vector3();
            let referenceName = "CAMERA";

            if (currentTargetData) {
                const tBody = celestialBodies.find(x => x.data.name === currentTargetData.name);
                if (tBody) {
                    scanOrigin.copy(tBody.globalPos);
                } else if (currentTargetData.datasetCategory === 'ASTEROID' || currentTargetData.datasetCategory === 'PROMOTED_ASTEROID') {
                    const M_current = currentTargetData.M0 + (currentTargetData.n * this.ctx.getJ2000Days(systemDate));
                    scanOrigin = OrbitalMath.calcPosFromM(currentTargetData.a, currentTargetData.e, currentTargetData.i, currentTargetData.w, currentTargetData.Node, M_current);
                }
                referenceName = currentTargetData.name;
            } else {
                scanOrigin.copy(camera.position).add(currentOrigin);
            }

            const currentJ2000Days = this.ctx.getJ2000Days(systemDate);
            let closestList = []; 

            // 1. Clear old green radar contacts AND unpinned memory clones
            // (protects the currently targeted body's clone from the sweep)
            bodyRegistry.sweepForRescan(currentTargetData);

            gpuParticleSystems.forEach(system => {
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
                    const M_current = M0_arr[idx] + (n_arr[idx] * currentJ2000Days);
                    const rawPos = OrbitalMath.calcPosFromM(a_arr[idx], e_arr[idx], i_arr[idx], w_arr[idx], Node_arr[idx], M_current);
                    let pos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
                    const dx = pos.x - scanOrigin.x;
                    const dy = pos.y - scanOrigin.y;
                    const dz = pos.z - scanOrigin.z;
                    const distSq = dx*dx + dy*dy + dz*dz;

                    if (closestList.length < 20 || distSq < closestList[19].distSq) {
                        closestList.push({ distSq: distSq, data: sourceData[idx] });
                        closestList.sort((a, b) => a.distSq - b.distSq);
                        if (closestList.length > 20) closestList.pop();
                    }
                }
            });

            // 2. Spawn 3D Green Radar Blips
            const systemBuilder = this.ctx.systemBuilder;
            closestList.forEach((hit) => {
                const radarData = { ...hit.data, datasetCategory: 'RADAR_CONTACT' };
                
                const datasetColor = savedColors[radarData.datasetName] || '#00ff00';
                const spriteMat = new THREE.SpriteMaterial({ map: dotTexture, depthTest: false }); 
                spriteMat.color.set(datasetColor); 
                const sprite = new THREE.Sprite(spriteMat);
                sprite.userData = radarData;
                sprite.renderOrder = 1400; 
                
                const M_current = radarData.M0 + (radarData.n * currentJ2000Days);

                const rawPos = OrbitalMath.calcPosFromM(radarData.a, radarData.e, radarData.i, radarData.w, radarData.Node, M_current);
                const absolutePos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
                
                sprite.position.copy(absolutePos.clone().sub(currentOrigin));
                const scale = 35 / camera.zoom;
                sprite.scale.set(scale, scale, 1);
                
                sprite.matrixAutoUpdate = false;
                sprite.updateMatrix();
                sprite.updateMatrixWorld();

                scene.add(sprite);
                
                const dummyMesh = new THREE.Object3D(); 

                const orbitLine = systemBuilder.createOrbitPath(radarData, radarData.a);
                orbitLine.material.color.set(datasetColor);
                orbitLine.visible = false;
                orbitLine.matrixAutoUpdate = false;
                scene.add(orbitLine);

                const dummyLineMat = new THREE.LineBasicMaterial();
                const dummyCurtain = new THREE.LineSegments(new THREE.BufferGeometry(), dummyLineMat);

                const label = document.createElement('div');
                label.className = 'tactical-label';
                label.innerText = radarData.name;
                label.style.color = datasetColor;
                document.body.appendChild(label);

                bodyRegistry.registerBody(new CelestialBody({
                    data: radarData, 
                    mesh: dummyMesh, 
                    sprite: sprite, 
                    orbitLine: orbitLine,
                    orbitCurtain: dummyCurtain,
                    label: label,
                    isMoon: false,
                    datasetVisible: true, 
                    isCulled: false, 
                    hideLabel: true,
                    globalPos: absolutePos, 
                    scaledA: radarData.a, 
                    physicalRadius: 0
                }));
            });

            UI.renderScanResults(closestList, referenceName);
        }, 50);
    }
}