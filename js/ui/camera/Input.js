//js/ui/camera/Input.js
import * as THREE from 'three';

export class Input {
    constructor({ controls, onPanStart, onClick, onPointerMove, onPointerLeave }) {
        this.controls = controls;
        this.onPanStart = onPanStart;
        this.onClick = onClick;
        this.onPointerMove = onPointerMove;
        this.onPointerLeave = onPointerLeave;

        this._currentMouseAction = null;
        this._mouseDownPos = new THREE.Vector2();

        this.initHooks();
    }

    initHooks() {
        window.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.panel') || e.target.closest('button')) return;
            e.preventDefault();
        });

        window.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.panel') || e.target.closest('button')) return;
            this._currentMouseAction = e.button;
            this._mouseDownPos.set(e.clientX, e.clientY);
        });

        window.addEventListener('wheel', () => {
            this._currentMouseAction = 1;
        });

        this.controls.addEventListener('start', () => {
            this.onPanStart(this._currentMouseAction === 2);
        });

        window.addEventListener('pointerup', (e) => {
            if (e.target.closest('.panel') || e.target.closest('button')) return;
            const dist = Math.hypot(
                e.clientX - this._mouseDownPos.x,
                e.clientY - this._mouseDownPos.y
            );
            if (dist > 15) return;

            const isHardLock = this._currentMouseAction === 0 || e.pointerType === 'touch';
            this.onClick(e.clientX, e.clientY, isHardLock);
        });

        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
            if (e.target.closest('.panel') || e.target.closest('button')) {
                this.onPointerLeave();
                return;
            }
            if (e.buttons !== 0) return;

            this.onPointerMove(e.clientX, e.clientY);
        });

        window.addEventListener('pointerleave', () => this.onPointerLeave());
    }
}
