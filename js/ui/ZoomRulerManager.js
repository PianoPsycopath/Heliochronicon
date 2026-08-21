// js/ZoomRulerManager.js
export class ZoomRulerManager {
    constructor(ctx) {
        this.camera = ctx.camera;
        this.controls = ctx.controls;

        this.slider = document.getElementById('zoom-slider');
        this.landmarks = document.querySelectorAll('.landmark');
        this.canvas = document.getElementById('tactical-ruler-canvas');
        this.ctx2d = this.canvas.getContext('2d');

        this.AU_IN_KM = 149597870.7;
        this.LY_IN_AU = 63241.1;

        this.minZoom = 0.00001;
        this.maxZoom = 150000000;

        this.logMin = Math.log(this.minZoom);
        this.logMax = Math.log(this.maxZoom);
        this.scale = (this.logMax - this.logMin) / 1000;

        this.isDragging = false;
        this.lastZoom = this.camera.zoom;

        this.initBindings();
        this.updateRuler();
        this.startContinuousTracking();
    }

    startContinuousTracking() {
        // Continuous Sync: By checking the camera every frame, the UI will flawlessly track
        // the depth even when the engine animates the camera programmatically (clicking planets).
        const sync = () => {
            if (this.camera.zoom !== this.lastZoom) {
                this.lastZoom = this.camera.zoom;

                if (!this.isDragging) {
                    const zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.camera.zoom));
                    const sliderVal = (Math.log(zoom) - this.logMin) / this.scale;
                    this.slider.value = sliderVal;
                }
                this.updateRuler();
            }
            requestAnimationFrame(sync);
        };
        sync();
    }

    abortCameraLock() {
        // Ghost Event: Trick the InteractionController into thinking we used the mouse wheel.
        // This instantly aborts the engine's "Focus on Planet" animation loops.
        this.controls.dispatchEvent({ type: 'start' });
        if (this.controls.domElement) {
            const fakeWheel = new window.WheelEvent('wheel', { deltaY: 0, bubbles: true });
            this.controls.domElement.dispatchEvent(fakeWheel);
        }
    }

    initBindings() {
        this.slider.addEventListener('pointerdown', () => {
            this.abortCameraLock();
            this.isDragging = true;
        });

        this.slider.addEventListener('input', (e) => {
            this.isDragging = true;
            const val = parseFloat(e.target.value);
            const targetZoom = Math.exp(this.logMin + val * this.scale);
            this.camera.zoom = targetZoom;
            this.camera.updateProjectionMatrix();
        });

        this.slider.addEventListener('change', () => (this.isDragging = false));
        this.slider.addEventListener('pointerup', () => (this.isDragging = false));

        this.landmarks.forEach((lm) => {
            lm.addEventListener('click', (e) => {
                this.abortCameraLock();
                const targetZoom = parseFloat(e.currentTarget.dataset.val);
                this.camera.zoom = targetZoom;
                this.camera.updateProjectionMatrix();
            });
        });

        window.addEventListener('resize', () => this.updateRuler());
    }

    updateRuler() {
        this.resizeCanvas();
        this.updateLandmarks();
        this.drawTacticalRuler();
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    updateLandmarks() {
        const currentLog = Math.log(this.camera.zoom);
        const range = this.logMax - this.logMin;

        this.landmarks.forEach((lm) => {
            const val = parseFloat(lm.dataset.val);
            const lmLog = Math.log(val);

            const sliderVal = (lmLog - this.logMin) / this.scale;
            const percent = (sliderVal / 1000) * 100;
            lm.style.left = `calc(${percent}% - 12px)`;

            const dist = Math.abs(currentLog - lmLog) / range;
            let opacity = 1.0 - dist * 6;
            opacity = Math.max(0.15, Math.min(1.0, opacity));
            let scale = 0.8 + opacity * 0.4;

            lm.style.opacity = opacity;
            lm.style.transform = `scale(${scale})`;
            lm.style.filter =
                opacity > 0.8 ? `drop-shadow(0 0 10px rgba(255, 255, 255, 0.9))` : 'none';
        });
    }

    drawTacticalRuler() {
        const ctx = this.ctx2d;
        const w = this.canvas.offsetWidth;
        const h = this.canvas.offsetHeight;

        ctx.clearRect(0, 0, w, h);

        const trackY = 15;
        const cx = w / 2;

        const visibleWidthAU = (this.camera.right - this.camera.left) / this.camera.zoom;
        const auPerPixel = visibleWidthAU / window.innerWidth;
        const targetAU = auPerPixel * 150;

        let magnitude, unit, multiplier;

        if (targetAU * this.AU_IN_KM < 1) {
            magnitude = targetAU * this.AU_IN_KM * 1000;
            unit = 'M';
            multiplier = 1 / (this.AU_IN_KM * 1000);
        } else if (targetAU < 0.01) {
            magnitude = targetAU * this.AU_IN_KM;
            unit = 'KM';
            multiplier = 1 / this.AU_IN_KM;
        } else if (targetAU > 1000) {
            magnitude = targetAU / this.LY_IN_AU;
            unit = 'LY';
            multiplier = this.LY_IN_AU;
        } else {
            magnitude = targetAU;
            unit = 'AU';
            multiplier = 1;
        }

        const p10 = Math.pow(10, Math.floor(Math.log10(magnitude)));
        const norm = magnitude / p10;
        let niceNorm = 1;
        if (norm >= 2 && norm < 5) niceNorm = 2;
        else if (norm >= 5 && norm < 10) niceNorm = 5;

        const cleanMagnitude = niceNorm * p10;
        const exactAU = cleanMagnitude * multiplier;
        const tickPx = exactAU / auPerPixel;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, trackY);
        ctx.lineTo(w, trackY);
        ctx.stroke();

        const minorTickPx = tickPx / 5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        for (let i = 1; i * minorTickPx < w / 2; i++) {
            if (i % 5 === 0) continue;
            const xRight = cx + i * minorTickPx;
            const xLeft = cx - i * minorTickPx;
            ctx.moveTo(xRight, trackY - 3);
            ctx.lineTo(xRight, trackY + 3);
            ctx.moveTo(xLeft, trackY - 3);
            ctx.lineTo(xLeft, trackY + 3);
        }
        ctx.stroke();

        ctx.fillStyle = '#00ffff';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '13px "Teko", monospace';
        ctx.textBaseline = 'top';

        ctx.beginPath();
        ctx.moveTo(cx, trackY - 6);
        ctx.lineTo(cx, trackY + 6);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillText('0', cx, trackY + 10);

        const maxTicks = Math.ceil(cx / tickPx);
        for (let i = 1; i <= maxTicks; i++) {
            const xRight = cx + i * tickPx;
            const xLeft = cx - i * tickPx;
            const valText = `${(i * cleanMagnitude).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;

            ctx.beginPath();
            ctx.moveTo(xRight, trackY - 6);
            ctx.lineTo(xRight, trackY + 6);
            ctx.moveTo(xLeft, trackY - 6);
            ctx.lineTo(xLeft, trackY + 6);
            ctx.stroke();

            ctx.fillText(valText, xRight, trackY + 10);
            ctx.fillText(valText, xLeft, trackY + 10);
        }

        const thumbX = (this.slider.value / 1000) * w;

        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(thumbX, trackY - 12);
        ctx.lineTo(thumbX, trackY + 12);
        ctx.moveTo(thumbX - 5, trackY - 12);
        ctx.lineTo(thumbX + 5, trackY - 12);
        ctx.moveTo(thumbX - 5, trackY + 12);
        ctx.lineTo(thumbX + 5, trackY + 12);
        ctx.stroke();
    }
}
