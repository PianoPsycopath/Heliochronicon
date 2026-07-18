// js/main.js
const AU_IN_KM = 149597870.7; 
const MAX_WELLS = 35; 

// --- INITIALIZE SCENE MANAGER ---
const sceneManager = new SceneManager('canvas-container');
const scene = sceneManager.scene;
const camera = sceneManager.camera;
const renderer = sceneManager.renderer;
const controls = sceneManager.controls;
const frustumSize = sceneManager.frustumSize;

// --- STATE MANAGEMENT ---
let systemDate = new Date();
let currentTargetData = null;  
let trackingTargetData = null; 

const celestialBodies = []; 
const pickableObjects = []; 
const gpuParticleSystems = []; 
const currentOrigin = new THREE.Vector3(0, 0, 0); 

let assetManifest = null;      
let lookupInFlight = false;    

// --- GLOBAL ASSETS & MEMORY ---
const dotTexture = Shaders.createDotTexture();
const datasetMaterials = {}; 
const savedColors = JSON.parse(localStorage.getItem('tacticalMapColors')) || {}; 

// --- INITIALIZE UI & MATERIALS ---
const gridMaterial = Shaders.getGridMaterial(MAX_WELLS);
const gridPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1000000, 1000000, 4, 4), 
    gridMaterial
);
gridPlane.rotation.x = -Math.PI / 2;
gridPlane.renderOrder = -2;
scene.add(gridPlane);

const equatorialMaterial = Shaders.getEquatorialGridMaterial();
const equatorialGridPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000, 4, 4), 
    equatorialMaterial
);
equatorialGridPlane.visible = false;
equatorialGridPlane.renderOrder = -1; 
scene.add(equatorialGridPlane);

const tacticalMaterial = Shaders.getTacticalMaterial();
const UI = new UIController();

// --- INITIALIZE SUBSYSTEMS ---
const systemBuilder = new SystemBuilder({
    scene, UI, celestialBodies, pickableObjects, gpuParticleSystems,
    datasetMaterials, savedColors, dotTexture, tacticalMaterial, AU_IN_KM,
    getCurrentTarget: () => currentTargetData,
    onClearTarget: () => { 
        currentTargetData = null; 
        trackingTargetData = null; 
    },
    onClearMemory: () => {
        
    }
});

const interactionController = new InteractionController({
    camera, controls, frustumSize, pickableObjects, UI,
    getCurrentTarget: () => currentTargetData,
    onBodyClicked: (data, isHardLock) => { UI.onFocusBody(data, isHardLock); },
    onTrackingBroken: () => { trackingTargetData = null; }
});

const renderPipeline = new RenderPipeline({
    camera, controls, gridMaterial, gpuParticleSystems, UI, savedColors, MAX_WELLS
});

const tacticalScanner = new TacticalScanner({
    scene, camera, UI, celestialBodies, pickableObjects, gpuParticleSystems, currentOrigin, dotTexture, savedColors,
    getSystemDate: () => systemDate,
    getCurrentTarget: () => currentTargetData,
    getJ2000Days: (date) => PhysicsEngine.getJ2000Days(date),
    onTargetPurged: () => {
        currentTargetData = null;
        trackingTargetData = null;
        interactionController.clearTracking();
        UI.updateTargetPanel(null);
        UI.renderBodyList(celestialBodies, null);
    }
});

// --- UI CALLBACKS ---
UI.onTimeChanged = (date) => { systemDate = date; };
UI.onClearData = () => { systemBuilder.clearSolarSystem(); };
UI.onRefreshList = () => { UI.renderBodyList(celestialBodies, currentTargetData); };

// Stateful Toggles
const activeDatasets = new Set(); 

UI.onDatasetVisibilityChanged = async (datasetName, isVisible, chunks) => {
    if (isVisible) {
        if (activeDatasets.has(datasetName)) return; 
        
        try {
            const fetchPromises = chunks.map(async (chunk) => {
                const metadataUrl = `data/${chunk.metadata}`;
                const binaryUrl = `data/${chunk.binary}`;
                
                const metadata = await DataLoader.fetchJSONDataset(metadataUrl);
                const binaryData = await DataLoader.fetchBinaryChunk(binaryUrl);
                
                return { metadata, binaryData };
            });
            
            const chunkResults = await Promise.all(fetchPromises);
            systemBuilder.buildFromBinaryChunks(datasetName, chunkResults); 
            
            activeDatasets.add(datasetName);
        } catch (error) {
            console.error(`Failed to load chunk group for ${datasetName}`, error);
        }
        
    } else {
        // PURGE SEQUENCE
        activeDatasets.delete(datasetName);
        
        for (let i = celestialBodies.length - 1; i >= 0; i--) {
            const b = celestialBodies[i];
            if (b.data.datasetName === datasetName) {
                scene.remove(b.mesh);
                if (b.sprite) scene.remove(b.sprite);
                if (b.orbitLine) scene.remove(b.orbitLine);
                if (b.orbitCurtain) scene.remove(b.orbitCurtain);
                if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
                
                let pIdx = pickableObjects.indexOf(b.mesh);
                if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                pIdx = pickableObjects.indexOf(b.sprite);
                if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                
                celestialBodies.splice(i, 1);
            }
        }
        
        for (let i = gpuParticleSystems.length - 1; i >= 0; i--) {
            const sys = gpuParticleSystems[i];
            if (sys.userData && sys.userData.datasetName === datasetName) {
                scene.remove(sys); 
                if (sys.geometry) sys.geometry.dispose();
                if (sys.material) sys.material.dispose();
                gpuParticleSystems.splice(i, 1);
            }
        }

        if (currentTargetData && currentTargetData.datasetName === datasetName) {
            tacticalScanner.onTargetPurged();
        }
    }
};

UI.onDatasetColorChanged = (datasetName, colorHex) => {
    if (datasetMaterials[datasetName]) {
        if (datasetMaterials[datasetName].uniforms && datasetMaterials[datasetName].uniforms.uColor) {
            datasetMaterials[datasetName].uniforms.uColor.value.set(colorHex);
        } else {
            datasetMaterials[datasetName].color.set(colorHex);
        }
    }
    savedColors[datasetName] = colorHex;
    localStorage.setItem('tacticalMapColors', JSON.stringify(savedColors));
};

UI.onFocusBody = (data, isHardLock = true) => {
    if (data.datasetCategory === 'ASTEROID' || data.datasetCategory === 'RADAR_CONTACT') {
        systemBuilder.promoteAsteroidToCPU(data);
        data = celestialBodies.find(b => b.data.name === data.name && b.data.datasetCategory === 'PROMOTED_ASTEROID').data;
    }

    currentTargetData = data;
    UI.updateTargetPanel(data);
    UI.renderBodyList(celestialBodies, currentTargetData);

    trackingTargetData = isHardLock ? data : null;
    interactionController.triggerFocus(data, isHardLock, AU_IN_KM);
};

UI.onPinRequested = (data) => {
    const b = celestialBodies.find(x => x.data.name === data.name && x.data.datasetCategory === 'PROMOTED_ASTEROID');
    if (b) {
        b.data.isPinned = !b.data.isPinned; 
        UI.updateTargetPanel(b.data); 
    }
};

UI.onPurgeRequested = (data) => {
    const idx = celestialBodies.findIndex(x => x.data.name === data.name && x.data.datasetCategory === 'PROMOTED_ASTEROID');
    if (idx !== -1) {
        const b = celestialBodies[idx];
        scene.remove(b.mesh);
        scene.remove(b.sprite);
        scene.remove(b.orbitLine);
        scene.remove(b.orbitCurtain);
        if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
        
        let pIdx = pickableObjects.indexOf(b.mesh);
        if (pIdx > -1) pickableObjects.splice(pIdx, 1);
        pIdx = pickableObjects.indexOf(b.sprite);
        if (pIdx > -1) pickableObjects.splice(pIdx, 1);
        
        celestialBodies.splice(idx, 1);
    }
    
    currentTargetData = null;
    trackingTargetData = null;
    interactionController.clearTracking();
    UI.updateTargetPanel(null);
    UI.renderBodyList(celestialBodies, currentTargetData);
};

UI.onAsteroidLookup = async (rawQuery) => {
    if (lookupInFlight) return;
    const query = rawQuery.trim();
    if (!query) return;

    const target = DataLoader.normalizeDesignation(query);

    const tracked = celestialBodies.find(b => DataLoader.normalizeDesignation(b.data.name) === target);
    if (tracked) {
        UI.onFocusBody(tracked.data);
        return;
    }

    for (const system of gpuParticleSystems) {
        const source = system.userData && system.userData.sourceData;
        if (!source) continue;
        const hit = source.find(d => DataLoader.normalizeDesignation(d.name) === target);
        if (hit) {
            UI.onFocusBody(hit);
            return;
        }
    }

    lookupInFlight = true;
    UI.showLookupPending(query);
    try {
        const skipGroups = [...activeDatasets, 'planets', 'moons'];
        const found = await DataLoader.findAsteroidInManifest(query, assetManifest, skipGroups);
        if (found) {
            UI.onFocusBody(found);
        } else {
            UI.showLookupNotFound(query);
        }
    } finally {
        lookupInFlight = false;
    }
};

UI.onScanRequested = (isActive) => { 
    if (isActive) {
        tacticalScanner.performTacticalScan(); 
    } else {
        tacticalScanner.purgeTacticalClones();
    }
};
UI.onSearch = (query) => {
    tacticalScanner.executeSearch(query);
};

// ==========================================
// SYSTEM BOOTLOADER
// ==========================================
async function bootEngine() {
    // Load Manifest
    try {
        const manifest = await DataLoader.fetchJSONDataset('data/manifest.json');
        if (manifest && manifest.datasets) {
            assetManifest = manifest;
        }
    } 
    catch (err) {
        console.error("Failed to load manifest.json", err);
    }
    
    // 1. Automatically load Core Datasets through the NEW Binary Pipeline
    const baseDatasets = [
        { name: 'planets', category: 'PLANET', color: '#ffffff', chunks: [{ metadata: 'planets_chunk_0.json', binary: 'planets_chunk_0.bin' }] },
        { name: 'moons',   category: 'MOON',   color: '#aaaaaa', chunks: [{ metadata: 'moons_chunk_0.json', binary: 'moons_chunk_0.bin' }] }
    ];

    for (const ds of baseDatasets) {
        UI.addDatasetToggle(ds.name, ds.category, ds.color, true, ds.chunks);
        // This triggers your UI.onDatasetVisibilityChanged which handles the Binary build logic
        await UI.onDatasetVisibilityChanged(ds.name, true, ds.chunks);
    }

    // 2. Build Asteroid Group Toggles from Manifest
    if (assetManifest && assetManifest.datasets) {
        const defaultColors = ['#ff3333', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff'];
        let colorIdx = 0;

        for (const [groupName, groupData] of Object.entries(assetManifest.datasets)) {
            // Skip the planets and moons as they are already loaded
            if (groupName === 'planets' || groupName === 'moons') continue;
            
            UI.addDatasetToggle(groupName, 'ASTEROID', defaultColors[colorIdx % defaultColors.length], false, groupData.chunks);
            colorIdx++;
        }
    }
}

// ==========================================
// THE MAIN LOOP
// ==========================================
bootEngine();
let lastFrameTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    const deltaSec = (performance.now() - lastFrameTime) / 1000;
    lastFrameTime = performance.now();
    
    // 1. Time Update
    if (UI.isLiveTime) {
        systemDate = new Date(); 
    }
    const timeData = PhysicsEngine.updateSystemTime(UI, systemDate, deltaSec);
    systemDate = timeData.newDate;
    const daysSinceJ2000 = timeData.daysSinceJ2000;
    
    // 2. Physics & Logic Pipelines
    const desiredFrameF1 = SystemBuilder.frameIndexForDaysSinceJ2000(daysSinceJ2000);
    for (const sys of gpuParticleSystems) {
        if (sys.userData && sys.userData.rawSources) {
            systemBuilder.updateFrameWindow(sys, desiredFrameF1);
        }
    }

    PhysicsEngine.calculateKeplerianKinematics(celestialBodies, daysSinceJ2000);
    PhysicsEngine.applyMoonParentOffsets(celestialBodies);
    renderPipeline.processFloatingOrigin(celestialBodies, trackingTargetData, currentOrigin, daysSinceJ2000);
    PhysicsEngine.zSortCelestialBodies(celestialBodies, camera.position, currentOrigin);
    
    // 3. Hardware Updates (Camera, Telemetry, Shaders)
    if (currentTargetData) {
        const tBody = celestialBodies.find(x => x.data.name === currentTargetData.name);
        if (tBody) {
            let wDeg = (tBody.W_current * 180 / Math.PI) % 360;
            if (wDeg < 0) wDeg += 360;
            UI.updateLiveTelemetry(wDeg, tBody.RA_current_deg, tBody.DEC_current_deg);
            interactionController.updateCamera(tBody.mesh.position);
        }
    }
    
    controls.update(); 
    camera.updateMatrixWorld();
    
    // 3. Render Pre-Pass (Projections, Culling, Matrices)
    const trackTargetPos = renderPipeline.processScreenProjectionsAndCulling(celestialBodies, currentTargetData, currentOrigin);
    
    // --- DUAL-GRID ARCHITECTURE LOGIC ---
    
    gridPlane.position.set(0, 0, 0);
    gridPlane.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    
    if (currentTargetData) {
        const tBody = celestialBodies.find(x => x.data.name === currentTargetData.name);
        const isPlanet = !tBody.isMoon && tBody.data.parent === "SUN";
        if (tBody && tBody.data.name !== "SUN" && (isPlanet || tBody.isMoon)) {
            equatorialGridPlane.visible = true;
            let anchorPos = tBody.renderPos;
            let anchorQuat = tBody.poleQuaternion;
            
            let targetMass = tBody.data.mass;

            if (tBody.isMoon) {
                const parentPlanet = celestialBodies.find(x => x.data.name === tBody.data.parent);
                if (parentPlanet) {
                    anchorPos = parentPlanet.renderPos;
                    anchorQuat = parentPlanet.poleQuaternion;
                    targetMass = parentPlanet.data.mass; 
                }
            }
            const massRatio = targetMass / 5.97;
            const dynamicRadius = 0.5 * Math.pow(massRatio, 0.3333);
            equatorialMaterial.uniforms.uGridRadius.value = dynamicRadius;

            equatorialGridPlane.position.lerp(anchorPos, 0.1);
            const eclipticQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            const finalQuat = anchorQuat.clone().multiply(eclipticQuat);
            equatorialGridPlane.quaternion.slerp(finalQuat, 0.1);
            equatorialMaterial.uniforms.cameraPos.value.copy(camera.position);
        } else {
            equatorialGridPlane.visible = false;
        }
    } else {
        equatorialGridPlane.visible = false;
    }
    
    // 6. Final GPU Updates
    renderPipeline.updateGPU(daysSinceJ2000, currentOrigin, gridPlane);
    renderer.render(scene, camera);
}

animate();