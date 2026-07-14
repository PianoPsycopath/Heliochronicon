// js/SceneManager.js
class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();

        this.aspect = window.innerWidth / window.innerHeight;
        this.frustumSize = 110; 
        this.camera = new THREE.OrthographicCamera(
            -this.frustumSize * this.aspect / 2, 
            this.frustumSize * this.aspect / 2, 
            this.frustumSize / 2, 
            -this.frustumSize / 2, 
            -50000, 
            50000
        );
        
        this.defaultCamPos = new THREE.Vector3(250, 250, 250);
        this.camera.position.copy(this.defaultCamPos);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minZoom = 0.00001;     // Unlocked for deep space
        this.controls.maxZoom = 150000000;   // Unlocked for planetary zoom
        this.controls.mouseButtons = { 
            LEFT: THREE.MOUSE.ROTATE, 
            MIDDLE: THREE.MOUSE.DOLLY, 
            RIGHT: THREE.MOUSE.PAN 
        };

        // Bind resize listener strictly to this class
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.aspect = window.innerWidth / window.innerHeight;
        this.camera.left = -this.frustumSize * this.aspect / 2;
        this.camera.right = this.frustumSize * this.aspect / 2;
        this.camera.top = this.frustumSize / 2;
        this.camera.bottom = -this.frustumSize / 2;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}