// js/main.js
const AU_IN_KM = 149597870.7; 
const MAX_WELLS = 15; 

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


// --- GLOBAL ASSETS & MEMORY ---
const dotTexture = Shaders.createDotTexture();
const datasetMaterials = {}; 
const savedColors = JSON.parse(localStorage.getItem('tacticalMapColors')) || {}; 

// --- INITIALIZE UI & MATERIALS ---
const gridMaterial = Shaders.getGridMaterial(MAX_WELLS);
const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000, 600, 600), gridMaterial);
gridPlane.rotation.x = -Math.PI / 2; gridPlane.renderOrder = 0;
scene.add(gridPlane);

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

UI.onDatasetVisibilityChanged = async (datasetName, isVisible, urls) => {
    if (isVisible) {
        if (activeDatasets.has(datasetName)) return; 
        
        const urlArray = Array.isArray(urls) ? urls : [urls];
        
        try {
            // Fetch all chunks in parallel
            const fetchPromises = urlArray.map(url => DataLoader.fetchJSONDataset(url));
            const chunkResults = await Promise.all(fetchPromises);
            
            // Merge all parsed chunk arrays into single dataset, 
            // TODO: GET RID OF PLANET AND MOON DUPLICATE CHUNKS
            const mergedJSON = chunkResults.flat();
            
            const processedData = DataLoader.processPlanetaryData(mergedJSON, datasetName);
            systemBuilder.buildSolarSystem(processedData);
            activeDatasets.add(datasetName);
        } catch (error) {
            console.error(`Failed to load chunk group for ${datasetName}`, error);
        }
        
    } else {
        // PURGE SEQUENCE
        activeDatasets.delete(datasetName);
        
        // 1. Purge Standard Bodies
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
        
        // 2. BUG FIX: Purge GPU Particle Systems
        for (let i = gpuParticleSystems.length - 1; i >= 0; i--) {
            const sys = gpuParticleSystems[i];
            if (sys.userData && sys.userData.datasetName === datasetName) {
                scene.remove(sys); 
                // Best practice: dispose of GPU memory directly
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

UI.onScanRequested = (isActive) => { 
    if (isActive) {
        tacticalScanner.performTacticalScan(); 
    } else {
        tacticalScanner.purgeTacticalClones();
    }
};

// ==========================================
// SYSTEM BOOTLOADER
// ==========================================
async function bootEngine() {
    // 1. Automatically load Core Datasets
    const baseDatasets = [
        { name: 'Planets', category: 'PLANET', color: '#ffffff', urls: ['data/planets.json'] },
        { name: 'Moons',   category: 'MOON',   color: '#aaaaaa', urls: ['data/moons.json'] }
    ];
    
    for (const ds of baseDatasets) {
        try {
            const rawData = await DataLoader.fetchJSONDataset(ds.urls[0]);
            if (rawData && rawData.length > 0) {
                const processed = DataLoader.processPlanetaryData(rawData, ds.name);
                systemBuilder.buildSolarSystem(processed);
                activeDatasets.add(ds.name);
                UI.addDatasetToggle(ds.name, ds.category, ds.color, true, ds.urls);
            }
        } catch (err) {
            console.error(`Base JSON missing: ${ds.urls[0]}`, err);
        }
    }

    // 2. Fetch Manifest & Build Asteroid Group Toggles
    try {
        const manifest = await DataLoader.fetchJSONDataset('data/manifest.json');
        if (manifest && manifest.datasets) {
            
            
            const defaultColors = ['#ff3333', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff'];
            let colorIdx = 0;

            for (const [groupName, groupData] of Object.entries(manifest.datasets)) {

                const chunkUrls = groupData.chunks.map(chunkFile => `data/${chunkFile}`);
                const assignedColor = defaultColors[colorIdx % defaultColors.length];

                UI.addDatasetToggle(groupName, 'ASTEROID', assignedColor, false, chunkUrls);
                colorIdx++;
            }
        }
    } catch (err) {
        console.error("Failed to load manifest.json from /data/", err);
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
    const timeData = PhysicsEngine.updateSystemTime(UI, systemDate, deltaSec);
    systemDate = timeData.newDate;
    const daysSinceJ2000 = timeData.daysSinceJ2000;
    
    // 2. Physics & Logic Pipelines
    PhysicsEngine.calculateKeplerianKinematics(celestialBodies, daysSinceJ2000);
    PhysicsEngine.applyMoonParentOffsets(celestialBodies);
    renderPipeline.processFloatingOrigin(celestialBodies, trackingTargetData, currentOrigin, daysSinceJ2000);
    PhysicsEngine.zSortCelestialBodies(celestialBodies, camera.position, currentOrigin);
    
    // 3. Render Pre-Pass (Projections, Culling, Matrices)
    const trackTargetPos = renderPipeline.processScreenProjectionsAndCulling(celestialBodies, currentTargetData, currentOrigin);
    
    // 4. Hardware Updates (Camera, Telemetry, Shaders)
    if (currentTargetData) {
        const tBody = celestialBodies.find(x => x.data.name === currentTargetData.name);
        if (tBody) {
            let wDeg = (tBody.W_current * 180 / Math.PI) % 360;
            if (wDeg < 0) wDeg += 360;
            UI.updateLiveTelemetry(wDeg, tBody.RA_current_deg, tBody.DEC_current_deg);
        }
        interactionController.updateCamera(trackTargetPos);
    }
    
    controls.update(); 
    renderPipeline.updateGPU(daysSinceJ2000, currentOrigin);

    renderer.render(scene, camera);
}

animate();