// js/SystemBuilder.js
import { OrbitalMath } from './OrbitalMath.js';
import { Shaders} from './Shaders.js';
import { CelestialBody } from './CelestialBody.js';
import { kmToAU } from './OrbitalMath.js';
import * as THREE from 'three'

export class SystemBuilder {
    constructor(engineContext) {
        this.ctx = engineContext;
    }
    getTacticalA(data, isMoon = false) {
        return (isMoon && data.a > 1000) ? kmToAU(data.a) : data.a;
    }

    createOrbitPath(data, scaledA) {
        const points = [];
        const resolution = 720; // Unified resolution
        
        if (data.orbit_model === 'MEEUS' || data.orbit_model === 'VSOP87') {
            const period = data.period; // Pull dynamically from DataLoader
            for(let j = 0; j <= resolution; j++) {
                const days = (j / resolution) * period;
                const pos = OrbitalMath.calculatePosition(data, days);
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        } else {
            for(let j = 0; j <= resolution; j++) {
                const pos = OrbitalMath.calcPosFromM(scaledA, data.e, data.i, data.w, data.Node, (j / resolution) * Math.PI * 2);
                points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
            }
        }
        
        let lw = 1;
        if (data.datasetCategory === 'PLANET') lw = 3;
        else if (data.datasetCategory === 'MOON') lw = 2;

        const mat = new THREE.LineBasicMaterial({ color: 0xff1111, transparent: true, opacity: 0.5, depthTest: false, linewidth: lw });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
        line.renderOrder = 2; 
        return line;
    }

    createOrbitCurtain() {
        const mat = new THREE.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.2, depthTest: false });
        const curtain = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
        curtain.renderOrder = 1; 
        curtain.visible = false; 
        return curtain;
    }

    clearSolarSystem() {
        const { celestialBodies, pickableObjects, gpuParticleSystems, scene, UI } = this.ctx;
        
        celestialBodies.forEach(b => {
            if (b.mesh) scene.remove(b.mesh);
            if (b.sprite) scene.remove(b.sprite);
            if (b.orbitLine) scene.remove(b.orbitLine);
            if (b.orbitCurtain) scene.remove(b.orbitCurtain);
            if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
        });
        celestialBodies.length = 0;
        pickableObjects.length = 0;

        gpuParticleSystems.forEach(s => {
            scene.remove(s);
            if (s.geometry) s.geometry.dispose();
            if (s.material) s.material.dispose();
            if (s.userData.groupLabel) {
                scene.remove(s.userData.groupLabel);
                s.userData.groupLabel.material.map.dispose();
                s.userData.groupLabel.material.dispose();
                s.userData.groupLabel.geometry.dispose();
            }
        });
        gpuParticleSystems.length = 0;

        this.ctx.onClearTarget();
        UI.updateTargetPanel(null);
        UI.renderBodyList(celestialBodies, null);
        
        this.ctx.onClearMemory();
    }

    buildSolarSystem(planetaryData) {
        if (planetaryData.length === 0) return;
        
        const { scene, celestialBodies, gpuParticleSystems, pickableObjects, UI, datasetMaterials, savedColors, tacticalMaterial, AU_IN_KM } = this.ctx;
        const datasetCategory = planetaryData[0].datasetCategory;
        const datasetName = planetaryData[0].datasetName;
        const currentTargetData = this.ctx.getCurrentTarget();

        // --- PATH A: GPU PARTICLE (ASTEROIDS ONLY) ---
        if (datasetCategory === 'ASTEROID') {
            const count = planetaryData.length;
            const geometry = new THREE.BufferGeometry();
            
            const a_arr = new Float32Array(count);
            const e_arr = new Float32Array(count);
            const i_arr = new Float32Array(count);
            const w_arr = new Float32Array(count);
            const Node_arr = new Float32Array(count);
            const M0_arr = new Float32Array(count);
            const n_arr = new Float32Array(count);
            const pos_arr = new Float32Array(count * 3); 

            for (let idx = 0; idx < count; idx++) {
                const d = planetaryData[idx];
                a_arr[idx] = d.a;
                e_arr[idx] = d.e;
                i_arr[idx] = d.i;
                w_arr[idx] = d.w;
                Node_arr[idx] = d.Node;
                M0_arr[idx] = d.M0;
                n_arr[idx] = d.n;
            }
            let minA = Infinity, maxA = -Infinity, sumA = 0;
            for (let idx = 0; idx < count; idx++) {
                if (a_arr[idx] < minA) minA = a_arr[idx];
                if (a_arr[idx] > maxA) maxA = a_arr[idx];
                sumA += a_arr[idx];
            }
            const aSpread = maxA - minA;
            const meanA = sumA / count;

            geometry.setAttribute('position', new THREE.BufferAttribute(pos_arr, 3)); 
            geometry.setAttribute('a', new THREE.BufferAttribute(a_arr, 1));
            geometry.setAttribute('e', new THREE.BufferAttribute(e_arr, 1));
            geometry.setAttribute('i', new THREE.BufferAttribute(i_arr, 1));
            geometry.setAttribute('w', new THREE.BufferAttribute(w_arr, 1));
            geometry.setAttribute('Node', new THREE.BufferAttribute(Node_arr, 1));
            geometry.setAttribute('M0', new THREE.BufferAttribute(M0_arr, 1));
            geometry.setAttribute('n', new THREE.BufferAttribute(n_arr, 1));

            const savedInitialColor = savedColors[datasetName] || '#ffff00';
            const material = Shaders.getAsteroidParticleMaterial(savedInitialColor);
            datasetMaterials[datasetName] = material; 

            const particleSystem = new THREE.Points(geometry, material);
            particleSystem.frustumCulled = false;
            particleSystem.userData = { 
                datasetName: datasetName, 
                datasetVisible: true, 
                sourceData: planetaryData,
                aSpread: aSpread
            };
            particleSystem.renderOrder = 200; 
            particleSystem.matrixAutoUpdate = false;
            particleSystem.updateMatrix(); 
            
            scene.add(particleSystem);
            gpuParticleSystems.push(particleSystem);

            const groupLabel = this.createGroupLabel(datasetName, savedInitialColor, meanA, aSpread);
            scene.add(groupLabel);
            particleSystem.userData.groupLabel = groupLabel;
            particleSystem.userData.aSpread = aSpread;
            
            UI.renderBodyList(celestialBodies, currentTargetData);
            return; 
        }

        // --- PATH B: CPU LOGIC (PLANETS & MOONS ONLY) ---
        let index = 0;
        const CHUNK_SIZE = 150; 

        const buildChunk = () => {
            const end = Math.min(index + CHUNK_SIZE, planetaryData.length);
            
            for (; index < end; index++) {
                const d = planetaryData[index];
                if (celestialBodies.some(b => b.data.name === d.name)) continue; 

                const isSun = d.parent === d.name;
                const isMoon = !isSun && d.category === 'MOON';

                const scaledA = this.getTacticalA(d, isMoon);

                let physicalRadius = 0;
                if (isSun) {
                    physicalRadius = 696340 / AU_IN_KM; 
                } else if (d.radius_km > 0) {
                    physicalRadius = d.radius_km / AU_IN_KM;
                } else {
                    physicalRadius = 1.0 / AU_IN_KM; 
                }
                
                const geometry = new THREE.SphereGeometry(physicalRadius, 32, 32);
                geometry.rotateY(Math.PI / 2); 
                const mesh = new THREE.Mesh(geometry, tacticalMaterial);
                mesh.userData = d;
                
                let rOrder = 500; 
                if (isSun) rOrder = 2000;
                else if (d.datasetCategory === 'PLANET') rOrder = 1000; 
                else if (d.datasetCategory === 'MOON') rOrder = 800; 

                mesh.renderOrder = rOrder; 
                
                const wireMat = new THREE.MeshBasicMaterial({ color: isSun ? 0xffcc00 : 0xaaaaaa, wireframe: true, transparent: true, opacity: 0.15 });
                const wireMesh = new THREE.Mesh(mesh.geometry, wireMat);
                mesh.add(wireMesh);

                if (!isSun) {
                    const poleMat = new THREE.LineBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.6 });
                    const poleGeo = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(0, physicalRadius * 1.5, 0),
                        new THREE.Vector3(0, -physicalRadius * 1.5, 0)
                    ]);
                    const pole = new THREE.Line(poleGeo, poleMat);
                    mesh.add(pole); 
                }

                scene.add(mesh);
                pickableObjects.push(mesh);
                
                const label = document.createElement('div');
                label.className = 'tactical-label';
                label.innerText = d.name;
                label.style.color = isMoon ? '#aaa' : '#ffcc00'; 
                document.body.appendChild(label);

                const bodyObj = { 
                    data: d, mesh, label, isMoon, scaledA, physicalRadius, 
                    datasetVisible: true, isCulled: false, hideLabel: false, 
                    baseRenderOrder: rOrder,
                    distToCamSq: 0
                };

                let spriteMat;
                if (isSun) {
                    spriteMat = Shaders.createStarSpriteMat();
                } else {
                    spriteMat = Shaders.createDiamondSpriteMat(d.symbol);
                }

                const sprite = new THREE.Sprite(spriteMat);
                sprite.userData = d;
                sprite.renderOrder = rOrder; 
                scene.add(sprite);
                pickableObjects.push(sprite);
                bodyObj.sprite = sprite;

                if (!isSun) {
                    mesh.visible = false; 
                    bodyObj.orbitLine = this.createOrbitPath(d, scaledA);
                    scene.add(bodyObj.orbitLine);
                    
                    bodyObj.orbitCurtain = this.createOrbitCurtain();
                    scene.add(bodyObj.orbitCurtain);
                }

                mesh.matrixAutoUpdate = false;
                sprite.matrixAutoUpdate = false;
                if (bodyObj.orbitLine) bodyObj.orbitLine.matrixAutoUpdate = false;
                if (bodyObj.orbitCurtain) bodyObj.orbitCurtain.matrixAutoUpdate = false;

                celestialBodies.push(bodyObj);
            }
            
            if (index < planetaryData.length) {
                requestAnimationFrame(buildChunk);
            } else {
                UI.renderBodyList(celestialBodies, currentTargetData);
            }
        };
        
        buildChunk();
    }
    createGroupLabel(text, colorHex, meanA, aSpread) {
        const mat = Shaders.createGroupLabelMat(text, colorHex, meanA);
        
        const SPREAD_MIN = 0.05, SPREAD_MAX = 1.5;
        const SIZE_MULT_MIN = 0.8, SIZE_MULT_MAX = 2.0;
        const t = Math.min(1, Math.max(0, (aSpread - SPREAD_MIN) / (SPREAD_MAX - SPREAD_MIN)));
        const multiplier = SIZE_MULT_MIN + t * (SIZE_MULT_MAX - SIZE_MULT_MIN);
        
        const BASE_WORLD_SIZE = 3.0;
        const worldSize = BASE_WORLD_SIZE * multiplier;
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldSize, worldSize), mat);
        mesh.renderOrder = 250;
        mesh.matrixAutoUpdate = false;
        return mesh;
    }

    promoteAsteroidToCPU(d) {
        const { scene, celestialBodies, pickableObjects, savedColors, dotTexture, tacticalMaterial, AU_IN_KM } = this.ctx;

        if (celestialBodies.some(b => b.data.name === d.name && b.data.datasetCategory === 'PROMOTED_ASTEROID')) return;

        const radarIdx = celestialBodies.findIndex(b => b.data.name === d.name && b.data.datasetCategory === 'RADAR_CONTACT');
        if (radarIdx !== -1) {
            const old = celestialBodies[radarIdx];
            scene.remove(old.sprite);
            const pIdx = pickableObjects.indexOf(old.sprite);
            if (pIdx > -1) pickableObjects.splice(pIdx, 1);
            if (old.orbitLine) scene.remove(old.orbitLine);
            if (old.orbitCurtain) scene.remove(old.orbitCurtain);
            if (old.label && old.label.parentNode) old.label.parentNode.removeChild(old.label);
            celestialBodies.splice(radarIdx, 1);
        }

        const promotedData = { ...d, datasetCategory: 'PROMOTED_ASTEROID' };

        const scaledA = this.getTacticalA(promotedData, false); 
        
        const physicalRadius = (promotedData.radius_km > 0) ? (promotedData.radius_km / AU_IN_KM) : (1.0 / AU_IN_KM);

        const geometry = new THREE.SphereGeometry(physicalRadius, 32, 32);
        geometry.rotateY(Math.PI / 2); 
        const mesh = new THREE.Mesh(geometry, tacticalMaterial);
        mesh.userData = promotedData;
        mesh.renderOrder = 1500; 

        const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.4 });
        mesh.add(new THREE.Mesh(mesh.geometry, wireMat));
        const poleMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
        const poleGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, physicalRadius * 1.5, 0),
            new THREE.Vector3(0, -physicalRadius * 1.5, 0)
        ]);
        mesh.add(new THREE.Line(poleGeo, poleMat));

        scene.add(mesh);
        pickableObjects.push(mesh);

        const datasetColor = savedColors[promotedData.datasetName] || '#00ffff';
        const label = document.createElement('div');
        label.className = 'tactical-label';
        label.innerText = promotedData.name;
        label.style.color = datasetColor; 
        document.body.appendChild(label);

        const spriteMat = new THREE.SpriteMaterial({ map: dotTexture, depthTest: false }); 
        spriteMat.color.set(datasetColor);
        const sprite = new THREE.Sprite(spriteMat);
        sprite.userData = promotedData;
        sprite.renderOrder = 1500;
        scene.add(sprite);
        pickableObjects.push(sprite);

        const orbitLine = this.createOrbitPath(promotedData, scaledA);
        orbitLine.material.color.set(datasetColor);
        scene.add(orbitLine);
        
        const orbitCurtain = this.createOrbitCurtain();
        scene.add(orbitCurtain);

        mesh.matrixAutoUpdate = false;
        sprite.matrixAutoUpdate = false;
        orbitLine.matrixAutoUpdate = false;
        orbitCurtain.matrixAutoUpdate = false;

        celestialBodies.push(new CelestialBody({ 
            data: promotedData, 
            mesh: mesh, 
            label: label, 
            sprite: sprite,
            orbitLine: orbitLine,
            orbitCurtain: orbitCurtain,
            isMoon: false, 
            scaledA: scaledA, 
            physicalRadius: physicalRadius, 
            datasetVisible: true, 
            isCulled: false, 
            hideLabel: false 
        }));
    }
}