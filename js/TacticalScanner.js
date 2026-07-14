// js/TacticalScanner.js
class TacticalScanner {
    constructor(engineContext) {
        // The context provides references to the main engine state and arrays
        this.ctx = engineContext;
    }

    purgeTacticalClones() {
        const { scene, celestialBodies, pickableObjects, UI } = this.ctx;
        const currentTargetData = this.ctx.getCurrentTarget();

        // 1. Sweep and destroy all Radar Contacts and Unpinned Clones
        for (let i = celestialBodies.length - 1; i >= 0; i--) {
            const b = celestialBodies[i];
            const isRadar = b.data.datasetCategory === 'RADAR_CONTACT';
            const isUnpinnedClone = b.data.datasetCategory === 'PROMOTED_ASTEROID' && !b.data.isPinned;
            
            if (isRadar || isUnpinnedClone) {
                scene.remove(b.sprite);
                if (b.mesh) scene.remove(b.mesh);
                if (b.orbitLine) scene.remove(b.orbitLine);
                if (b.orbitCurtain) scene.remove(b.orbitCurtain);
                if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
                
                let pIdx = pickableObjects.indexOf(b.sprite);
                if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                if (b.mesh) {
                    pIdx = pickableObjects.indexOf(b.mesh);
                    if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                }
                
                celestialBodies.splice(i, 1);
            }
        }

        // 2. Break camera tracking if the user was focused on an unpinned clone that just got deleted
        if (currentTargetData && (currentTargetData.datasetCategory === 'RADAR_CONTACT' || 
           (currentTargetData.datasetCategory === 'PROMOTED_ASTEROID' && !currentTargetData.isPinned))) {
            this.ctx.onTargetPurged();
        } else {
            // 3. Reset the UI Panels normally
            UI.updateTargetPanel(currentTargetData);
            UI.renderBodyList(celestialBodies, currentTargetData);
        }
    }

    performTacticalScan() {
        const { UI, scene, camera, currentOrigin, celestialBodies, gpuParticleSystems, pickableObjects, dotTexture, savedColors } = this.ctx;
        const systemDate = this.ctx.getSystemDate();
        const currentTargetData = this.ctx.getCurrentTarget();

        UI.telemetryDataEl.innerHTML = `<p style="color:#00ffff; font-weight:bold; animation: flicker 0.5s infinite;">INITIATING RADAR PING...</p>`;
        
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
            for (let i = celestialBodies.length - 1; i >= 0; i--) {
                const b = celestialBodies[i];
                const isRadar = b.data.datasetCategory === 'RADAR_CONTACT';
                
                // Protect currently targeted objects from the sweep even if unpinned
                const isUnpinnedClone = b.data.datasetCategory === 'PROMOTED_ASTEROID' && !b.data.isPinned && (!currentTargetData || currentTargetData.name !== b.data.name);
                
                if (isRadar || isUnpinnedClone) {
                    scene.remove(b.sprite);
                    if (b.mesh) scene.remove(b.mesh);
                    if (b.orbitLine) scene.remove(b.orbitLine);
                    if (b.orbitCurtain) scene.remove(b.orbitCurtain);
                    if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
                    
                    let pIdx = pickableObjects.indexOf(b.sprite);
                    if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                    if (b.mesh) {
                        pIdx = pickableObjects.indexOf(b.mesh);
                        if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                    }
                    
                    celestialBodies.splice(i, 1);
                }
            }

            gpuParticleSystems.forEach(system => {
                if (!system.visible) return;
                
                const sourceData = system.userData.sourceData;
                const a_arr = system.geometry.attributes.a.array;
                const e_arr = system.geometry.attributes.e.array;
                const i_arr = system.geometry.attributes.i.array;
                const w_arr = system.geometry.attributes.w.array;
                const Node_arr = system.geometry.attributes.Node.array;
                const M0_arr = system.geometry.attributes.M0.array;
                const n_arr = system.geometry.attributes.n.array;

                for (let idx = 0; idx < sourceData.length; idx++) {
                    const M_current = M0_arr[idx] + (n_arr[idx] * currentJ2000Days);
                    const pos = OrbitalMath.calcPosFromM(a_arr[idx], e_arr[idx], i_arr[idx], w_arr[idx], Node_arr[idx], M_current);
                    
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
            closestList.forEach((hit) => {
                const radarData = { ...hit.data, datasetCategory: 'RADAR_CONTACT' };
                
                const datasetColor = savedColors[radarData.datasetName] || '#00ff00';
                const spriteMat = new THREE.SpriteMaterial({ map: dotTexture, depthTest: false }); 
                spriteMat.color.set(datasetColor); 
                const sprite = new THREE.Sprite(spriteMat);
                sprite.userData = radarData;
                sprite.renderOrder = 1400; 
                
                const M_current = radarData.M0 + (radarData.n * currentJ2000Days);
                const absolutePos = OrbitalMath.calcPosFromM(radarData.a, radarData.e, radarData.i, radarData.w, radarData.Node, M_current);
                
                sprite.position.copy(absolutePos.clone().sub(currentOrigin));
                const scale = 35 / camera.zoom;
                sprite.scale.set(scale, scale, 1);
                
                sprite.matrixAutoUpdate = false;
                sprite.updateMatrix();
                sprite.updateMatrixWorld();

                scene.add(sprite);
                pickableObjects.push(sprite);
                
                const dummyMesh = new THREE.Object3D(); 
                const dummyLineMat = new THREE.LineBasicMaterial();
                const dummyLine = new THREE.Line(new THREE.BufferGeometry(), dummyLineMat);
                const dummyCurtain = new THREE.LineSegments(new THREE.BufferGeometry(), dummyLineMat);

                celestialBodies.push({
                    data: radarData, 
                    mesh: dummyMesh, 
                    sprite: sprite, 
                    orbitLine: dummyLine,
                    orbitCurtain: dummyCurtain,
                    isMoon: false, datasetVisible: true, isCulled: false, hideLabel: true,
                    globalPos: absolutePos, renderPos: sprite.position,
                    parentPos: new THREE.Vector3(), W_current: 0,
                    poleQuaternion: new THREE.Quaternion(),
                    scaledA: radarData.a, physicalRadius: 0
                });
            });

            UI.renderScanResults(closestList, referenceName);
        }, 50);
    }
}