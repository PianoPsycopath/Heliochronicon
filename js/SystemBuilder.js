// js/SystemBuilder.js

const J2000_JD = 2451545.0;
const JD_START = 1721425.5;
const RECORD_STEP_DAYS = 3652.5; // 10 Julian years, matches N-Raw.py's RECORD_STEP_YEARS
const DEFAULT_FRAME_F1 = 202;    // ~"present day" bracket used at initial load

class SystemBuilder {
    constructor(engineContext) {
        this.ctx = engineContext;
    }

    // Days between J2000 and the epoch of frame index f1.
    static frameOffsetDays(f1) {
        return (JD_START + f1 * RECORD_STEP_DAYS) - J2000_JD;
    }

    static frameIndexForDaysSinceJ2000(daysSinceJ2000) {
        const currentJD = J2000_JD + daysSinceJ2000;
        return Math.floor((currentJD - JD_START) / RECORD_STEP_DAYS);
    }

    static extractFrameElements(bin, N, i, f1, f2, epochOffsetF1Days) {
        const floatOffset1 = (f1 * N * 6) + (i * 6);
        const floatOffset2 = (f2 * N * 6) + (i * 6);

        const a1 = bin[floatOffset1];
        const e1 = bin[floatOffset1 + 1];
        const i1 = bin[floatOffset1 + 2];
        const Node1 = bin[floatOffset1 + 3];
        const w1 = bin[floatOffset1 + 4];
        const M0_1 = bin[floatOffset1 + 5];

        const a2 = bin[floatOffset2];
        const e2 = bin[floatOffset2 + 1];
        const i2 = bin[floatOffset2 + 2];
        const Node2 = bin[floatOffset2 + 3];
        const w2 = bin[floatOffset2 + 4];
        const M0_2 = bin[floatOffset2 + 5];

        const GAUSSIAN_K = 0.01720209895;
        const days_between = RECORD_STEP_DAYS; // 10 Julian years between f1 and f2

        let n = 0;
        if (a1 > 0) {
            const n_approx = GAUSSIAN_K / Math.pow(a1, 1.5);

            // --- UNWRAPPING MEAN ANOMALY ---
            const expected_M_diff = n_approx * days_between;
            const delta_M = M0_2 - M0_1;
            const wraps = Math.round((expected_M_diff - delta_M) / (2 * Math.PI));
            const true_delta_M = delta_M + (wraps * 2 * Math.PI);

            n = true_delta_M / days_between;
        }
        // Epoch fix
        let M0_j2000 = M0_1 - n * epochOffsetF1Days;
        M0_j2000 = ((M0_j2000 % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);

        return { a1, e1, i1, Node1, w1, M0_1, M0_j2000, a2, e2, i2, Node2, w2, n };
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
    buildFromBinaryChunks(datasetName, chunkResults) {
        let combinedData = [];

        const f1 = DEFAULT_FRAME_F1;
        const f2 = DEFAULT_FRAME_F1 + 1;
        const epochOffsetF1 = SystemBuilder.frameOffsetDays(f1);

        for (const chunk of chunkResults) {
            const meta = chunk.metadata;
            const bin = chunk.binaryData;
            const N = meta.length;
            
            for (let i = 0; i < N; i++) {
                const m = meta[i];
                const category = (m.category || "ASTEROID").toUpperCase();
                const isStatic = (category === "PLANET" || category === "MOON");
                
                let a1, e1, i1, Node1, w1, M0_j2000, a2, e2, i2, Node2, w2, n;
                let period = m.period_days || 0;

                if (isStatic) {
                    // Planets/Moons only have 1 frame (Frame 0), which IS J2000 --
                    // no epoch back-conversion needed.
                    const floatOffset1 = i * 6;
                    a1 = bin[floatOffset1];
                    e1 = bin[floatOffset1 + 1];
                    i1 = bin[floatOffset1 + 2];
                    Node1 = bin[floatOffset1 + 3];
                    w1 = bin[floatOffset1 + 4];
                    M0_j2000 = bin[floatOffset1 + 5];
                    a2 = a1; e2 = e1; i2 = i1; Node2 = Node1; w2 = w1;

                    if (period === 0 && a1 > 0) {
                        period = Math.sqrt(Math.pow(a1, 3)) * 365.256; 
                    }
                    n = period > 0 ? (2 * Math.PI) / period : 0;
                } else {
                    // Asteroids: sample the "present day" bracket [f1, f2] out of the
                    // 401-frame N-body time series, and back-convert M0 to J2000.
                    const elems = SystemBuilder.extractFrameElements(bin, N, i, f1, f2, epochOffsetF1);
                    a1 = elems.a1; e1 = elems.e1; i1 = elems.i1; Node1 = elems.Node1; w1 = elems.w1;
                    M0_j2000 = elems.M0_j2000;
                    a2 = elems.a2; e2 = elems.e2; i2 = elems.i2; Node2 = elems.Node2; w2 = elems.w2;
                    n = elems.n;
                    period = n > 0 ? (2 * Math.PI) / n : 0;
                }

                let mass = m.mass_10_24_kg || 0.000001;
                if (mass === 0) mass = 0.000001;
                let radius_km = m.radius_km || 0;
                if (radius_km <= 0) radius_km = mass <= 0.000002 ? 1.0 : 0; 

                combinedData.push({
                    name: (m.name || "UNKNOWN").toString().toUpperCase(),
                    parent: (m.parent || "SUN").toString().toUpperCase(),
                    datasetCategory: category,
                    datasetName: datasetName,
                    a: a1,
                    e: e1,
                    i: i1,
                    w: w1,
                    Node: Node1,
                    M0: M0_j2000,
                    n: n, 
                    // Target slice to fade into
                    a2: a2,
                    e2: e2,
                    i2: i2,
                    w2: w2,
                    Node2: Node2,
                    
                    period: period,
                    mass: mass,
                    radius_km: radius_km,
                    symbol: m.symbol || (category === 'MOON' ? "○" : "•"),
                    pole_ra: m.pole_ra_deg || 0,
                    pole_dec: m.pole_dec_deg || 90,
                    pole_ra_rate: m.pole_ra_rate_deg_per_cy || 0,
                    pole_dec_rate: m.pole_dec_rate_deg_per_cy || 0,
                    pm_w: m.pm_w_deg || 0,
                    pm_w_rate: m.pm_w_rate_deg_per_day || 0,
                    isTargetable: true
                });
            }
        }
        
        this.buildSolarSystem(combinedData, chunkResults, { f1, f2, epochOffsetF1 });
    }
    buildSolarSystem(planetaryData, rawSources = null, frameInfo = null) {
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
            
            // NEW: Buffers for the 2030 target slice
            const a2_arr = new Float32Array(count);
            const e2_arr = new Float32Array(count);
            const i2_arr = new Float32Array(count);
            const w2_arr = new Float32Array(count);
            const Node2_arr = new Float32Array(count);
            
            const pos_arr = new Float32Array(count * 3); 

            for (let idx = 0; idx < count; idx++) {
                const d = planetaryData[idx];
                a_arr[idx] = d.a;
                e_arr[idx] = d.e;
                i_arr[idx] = d.i;
                w_arr[idx] = d.w;
                Node_arr[idx] = d.Node;
                M0_arr[idx] = d.M0;
                n_arr[idx] = d.n; // This is now our highly precise empirical_n
                
                a2_arr[idx] = d.a2;
                e2_arr[idx] = d.e2;
                i2_arr[idx] = d.i2;
                w2_arr[idx] = d.w2;
                Node2_arr[idx] = d.Node2;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(pos_arr, 3)); 
            geometry.setAttribute('a', new THREE.BufferAttribute(a_arr, 1));
            geometry.setAttribute('e', new THREE.BufferAttribute(e_arr, 1));
            geometry.setAttribute('i', new THREE.BufferAttribute(i_arr, 1));
            geometry.setAttribute('w', new THREE.BufferAttribute(w_arr, 1));
            geometry.setAttribute('Node', new THREE.BufferAttribute(Node_arr, 1));
            geometry.setAttribute('M0', new THREE.BufferAttribute(M0_arr, 1));
            geometry.setAttribute('n', new THREE.BufferAttribute(n_arr, 1));
            
            geometry.setAttribute('a2', new THREE.BufferAttribute(a2_arr, 1));
            geometry.setAttribute('e2', new THREE.BufferAttribute(e2_arr, 1));
            geometry.setAttribute('i2', new THREE.BufferAttribute(i2_arr, 1));
            geometry.setAttribute('w2', new THREE.BufferAttribute(w2_arr, 1));
            geometry.setAttribute('Node2', new THREE.BufferAttribute(Node2_arr, 1));

            const savedInitialColor = savedColors[datasetName] || '#ffff00';
            const material = Shaders.getAsteroidParticleMaterial(savedInitialColor);
            datasetMaterials[datasetName] = material; 

            let maxF1 = 0;
            if (rawSources && rawSources.length > 0) {
                maxF1 = Math.min(...rawSources.map(src => {
                    const srcN = src.metadata.length;
                    if (srcN === 0) return Infinity;
                    const totalFrames = src.binaryData.length / (srcN * 6);
                    return Math.max(0, totalFrames - 2);
                }));
                if (!isFinite(maxF1)) maxF1 = 0;
            }

            const particleSystem = new THREE.Points(geometry, material);
            particleSystem.frustumCulled = false;
            particleSystem.userData = { 
                datasetName: datasetName, 
                datasetVisible: true, 
                sourceData: planetaryData,
                rawSources: rawSources,
                currentF1: frameInfo ? frameInfo.f1 : DEFAULT_FRAME_F1,
                maxF1: maxF1
            };
            if (frameInfo) {
                material.uniforms.uFrameEpochOffset.value = frameInfo.epochOffsetF1;
            }
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

    updateFrameWindow(particleSystem, newF1) {
        const userData = particleSystem.userData;
        if (!userData || !userData.rawSources) return;

        const clampedF1 = Math.max(0, Math.min(userData.maxF1, newF1));
        if (clampedF1 === userData.currentF1) return;

        const f1 = clampedF1;
        const f2 = f1 + 1;
        const epochOffsetF1 = SystemBuilder.frameOffsetDays(f1);

        const geo = particleSystem.geometry;
        const aAttr = geo.attributes.a, eAttr = geo.attributes.e, iAttr = geo.attributes.i,
              wAttr = geo.attributes.w, NodeAttr = geo.attributes.Node,
              M0Attr = geo.attributes.M0, nAttr = geo.attributes.n,
              a2Attr = geo.attributes.a2, e2Attr = geo.attributes.e2, i2Attr = geo.attributes.i2,
              w2Attr = geo.attributes.w2, Node2Attr = geo.attributes.Node2;

        const sourceData = userData.sourceData;
        const datasetName = userData.datasetName;

        const { celestialBodies } = this.ctx;
        let promotedByName = null;
        if (celestialBodies && celestialBodies.length) {
            for (const b of celestialBodies) {
                if (b.data && b.data.datasetCategory === 'PROMOTED_ASTEROID' && b.data.datasetName === datasetName) {
                    if (!promotedByName) promotedByName = new Map();
                    promotedByName.set(b.data.name, b);
                }
            }
        }

        let idx = 0;
        for (const src of userData.rawSources) {
            const meta = src.metadata;
            const bin = src.binaryData;
            const N = meta.length;

            for (let i = 0; i < N; i++) {
                const category = ((meta[i].category) || "ASTEROID").toUpperCase();
                if (category === "PLANET" || category === "MOON") { idx++; continue; }

                const elems = SystemBuilder.extractFrameElements(bin, N, i, f1, f2, epochOffsetF1);

                aAttr.array[idx] = elems.a1;
                eAttr.array[idx] = elems.e1;
                iAttr.array[idx] = elems.i1;
                wAttr.array[idx] = elems.w1;
                NodeAttr.array[idx] = elems.Node1;
                M0Attr.array[idx] = elems.M0_j2000;
                nAttr.array[idx] = elems.n;

                a2Attr.array[idx] = elems.a2;
                e2Attr.array[idx] = elems.e2;
                i2Attr.array[idx] = elems.i2;
                w2Attr.array[idx] = elems.w2;
                Node2Attr.array[idx] = elems.Node2;

                const sd = sourceData ? sourceData[idx] : null;
                if (sd) {
                    sd.a = elems.a1; sd.e = elems.e1; sd.i = elems.i1;
                    sd.w = elems.w1; sd.Node = elems.Node1; sd.M0 = elems.M0_j2000;
                    sd.n = elems.n;
                    sd.a2 = elems.a2; sd.e2 = elems.e2; sd.i2 = elems.i2;
                    sd.w2 = elems.w2; sd.Node2 = elems.Node2;
                    sd.period = elems.n > 0 ? (2 * Math.PI) / elems.n : 0;

                    if (promotedByName && promotedByName.has(sd.name)) {
                        this.refreshPromotedAsteroid(promotedByName.get(sd.name), sd);
                    }
                }

                idx++;
            }
        }

        aAttr.needsUpdate = true;
        eAttr.needsUpdate = true;
        iAttr.needsUpdate = true;
        wAttr.needsUpdate = true;
        NodeAttr.needsUpdate = true;
        M0Attr.needsUpdate = true;
        nAttr.needsUpdate = true;
        a2Attr.needsUpdate = true;
        e2Attr.needsUpdate = true;
        i2Attr.needsUpdate = true;
        w2Attr.needsUpdate = true;
        Node2Attr.needsUpdate = true;

        userData.currentF1 = f1;
        particleSystem.material.uniforms.uFrameEpochOffset.value = epochOffsetF1;
    }

    refreshPromotedAsteroid(bodyObj, freshData) {
        const { scene } = this.ctx;
        const d = bodyObj.data;

        d.a = freshData.a; d.e = freshData.e; d.i = freshData.i;
        d.w = freshData.w; d.Node = freshData.Node; d.M0 = freshData.M0;
        d.n = freshData.n; d.period = freshData.period;
        d.a2 = freshData.a2; d.e2 = freshData.e2; d.i2 = freshData.i2;
        d.w2 = freshData.w2; d.Node2 = freshData.Node2;

        bodyObj.scaledA = d.a;

        if (bodyObj.orbitLine) {
            const newLine = this.createOrbitPath(bodyObj.scaledA, d.e, d.i, d.w, d.Node, 'PLANET');
            newLine.material.color.copy(bodyObj.orbitLine.material.color);
            newLine.matrixAutoUpdate = false;

            scene.remove(bodyObj.orbitLine);
            bodyObj.orbitLine.geometry.dispose();
            bodyObj.orbitLine.material.dispose();

            scene.add(newLine);
            bodyObj.orbitLine = newLine;
        }
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