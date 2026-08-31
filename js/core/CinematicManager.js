// js/main/CinematicManager.js

import bootAnimConfig from './boot.anim.json';

const EASINGS = {
    linear: (t) => t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function animateValue({ from, to, durationMs, easing = 'linear', onUpdate }) {
    return new Promise((resolve) => {
        const ease = EASINGS[easing] || EASINGS.linear;
        const start = performance.now();

        function step(now) {
            const elapsed = now - start;
            const t = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
            onUpdate(from + (to - from) * ease(t), t);

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(step);
    });
}

function animateZoomValue({ from, to, durationMs, easing = 'linear', onUpdate }) {
    const logFrom = Math.log(from);
    const logTo = Math.log(to);
    return animateValue({
        from: 0,
        to: 1,
        durationMs,
        easing,
        onUpdate: (t) => onUpdate(Math.exp(logFrom + (logTo - logFrom) * t)),
    });
}

export class CinematicManager {
    /**
     * @param {object} deps
     * @param {THREE.OrthographicCamera} deps.camera
     * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} [deps.controls]
     * @param {import('@core/AppState.js').AppState} [deps.appState]
     * @param {Document['body']} [deps.bodyEl]
     * @param {object} [deps.config] override for boot.anim.json (mostly for tests)
     */
    constructor({ camera, controls = null, appState = null, bodyEl = document.body, config = bootAnimConfig }) {
        this.camera = camera;
        this.controls = controls;
        this.appState = appState;
        this.body = bodyEl;
        this.config = config;

        this.defaultZoom = camera.zoom;

        this.bootContainer = document.getElementById('magi-boot-container');
    }

    /**
     * @param {Promise<any>} [dataLoadPromise]
     */
    async run(dataLoadPromise) {
        const { boot, cameraZoom, flip, panelExtend } = this.config;

        this._setPhase('booting');

        this.camera.zoom = cameraZoom.startZoom;
        this.camera.updateProjectionMatrix();
        if (this.controls) this.controls.enabled = false;

        this.body.classList.remove('boot-complete', 'boot-finished');
        this.body.classList.add('boot-active');

        const minWait = delay(boot.minDurationMs);
        const maxWait = delay(boot.maxWaitMs);
        const dataReady = dataLoadPromise ? dataLoadPromise.catch(() => null) : Promise.resolve();

        if (boot.waitStrategy === 'both') {
            await Promise.race([Promise.all([minWait, dataReady]), maxWait]);
        } else {
            await Promise.race([minWait, dataReady, maxWait]);
        }

        this._setPhase('flipping');
        this.body.classList.remove('boot-active');
        this.body.classList.add('boot-complete');

        const zoomAnim = animateZoomValue({
            from: cameraZoom.startZoom,
            to: this.defaultZoom,
            durationMs: cameraZoom.durationMs,
            easing: cameraZoom.easing,
            onUpdate: (zoom) => {
                this.camera.zoom = zoom;
                this.camera.updateProjectionMatrix();
                if (this.controls) this.controls.update();
            },
        });

        const settleMs = Math.max(
            flip.durationMs,
            panelExtend.delayMs + panelExtend.durationMs,
            cameraZoom.durationMs
        );

        await Promise.all([zoomAnim, delay(settleMs)]);

        if (this.bootContainer) {
            this.bootContainer.classList.add('boot-dismissed');
        }
        if (this.controls) this.controls.enabled = true;
        this.body.classList.add('boot-finished');
        this._setPhase('complete');
    }

    _setPhase(phase) {
        if (this.appState && 'bootPhase' in this.appState) {
            this.appState.bootPhase = phase;
        }
    }
}