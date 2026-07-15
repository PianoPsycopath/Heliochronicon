// js/SystemBuilder.js
class SystemBuilder {
    constructor(engineContext) {
        this.ctx = engineContext;
    }

    createOrbitPath(scaledA, e, i, w, Node, category) {
        const points = [];
        for(let j=0; j<=128; j++) {
            points.push(OrbitalMath.calcPosFromM(scaledA, e, i, w, Node, (j / 128) * Math.PI * 2));
        }
        
        let lw = 1;
        if (category === 'PLANET') lw = 3;
        else if (category === 'MOON') lw = 2;

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
                sourceData: planetaryData 
            };
            particleSystem.renderOrder = 200; 
            particleSystem.matrixAutoUpdate = false;
            particleSystem.updateMatrix(); 
            
            scene.add(particleSystem);
            gpuParticleSystems.push(particleSystem);
            
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

                const isSun = d.name === "SUN";
                const isMoon = d.parent !== "SUN";
                
                const scaledA = isMoon && d.a > 1000 ? d.a / AU_IN_KM : d.a;

                let physicalRadius = 0;
                if (isSun) {
                    physicalRadius = 696340 / AU_IN_KM; 
                } else if (d.radius_km > 0) {
                    physicalRadius = d.radius_km / AU_IN_KM;
                } else {
                    physicalRadius = 1.0 / AU_IN_KM; 
                }
                
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(physicalRadius, 32, 32), tacticalMaterial);
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
                    bodyObj.orbitLine = this.createOrbitPath(scaledA, d.e, d.i, d.w, d.Node, d.datasetCategory);
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

    promoteAsteroidToCPU(d) {
        const { scene, celestialBodies, pickableObjects, savedColors, dotTexture, tacticalMaterial, AU_IN_KM } = this.ctx;

        if (celestialBodies.some(b => b.data.name === d.name && b.data.datasetCategory === 'PROMOTED_ASTEROID')) return;

        const radarIdx = celestialBodies.findIndex(b => b.data.name === d.name && b.data.datasetCategory === 'RADAR_CONTACT');
        if (radarIdx !== -1) {
            const old = celestialBodies[radarIdx];
            scene.remove(old.sprite);
            const pIdx = pickableObjects.indexOf(old.sprite);
            if (pIdx > -1) pickableObjects.splice(pIdx, 1);
            celestialBodies.splice(radarIdx, 1);
        }

        const promotedData = { ...d, datasetCategory: 'PROMOTED_ASTEROID' };
        const scaledA = promotedData.a; 
        const physicalRadius = (promotedData.radius_km > 0) ? (promotedData.radius_km / AU_IN_KM) : (1.0 / AU_IN_KM);

        const mesh = new THREE.Mesh(new THREE.SphereGeometry(physicalRadius, 32, 32), tacticalMaterial);
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

        const orbitLine = this.createOrbitPath(scaledA, promotedData.e, promotedData.i, promotedData.w, promotedData.Node, 'PLANET');
        orbitLine.material.color.set(datasetColor);
        scene.add(orbitLine);
        
        const orbitCurtain = this.createOrbitCurtain();
        scene.add(orbitCurtain);

        mesh.matrixAutoUpdate = false;
        sprite.matrixAutoUpdate = false;
        orbitLine.matrixAutoUpdate = false;
        orbitCurtain.matrixAutoUpdate = false;

        celestialBodies.push({ 
            data: promotedData, mesh, label, isMoon: false, scaledA, physicalRadius, 
            datasetVisible: true, isCulled: false, hideLabel: false, 
            baseRenderOrder: 1500, distToCamSq: 0,
            sprite, orbitLine, orbitCurtain, parentPos: new THREE.Vector3()
        });
    }
}