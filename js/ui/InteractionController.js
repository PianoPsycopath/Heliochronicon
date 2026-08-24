//js/ui/InteractionController.js
import { Input } from '@camera/Input.js';
import { Picking } from '@camera/Picking.js';
import { CameraFocus } from '@camera/CameraFocus.js';
import { HoverState } from '@camera/HoverState.js';

export class InteractionController {
    constructor({
        camera,
        controls,
        frustumSize,
        pickableObjects,
        gpuParticleSystems = [],
        UI,
        getCurrentTarget,
        onBodyClicked,
        onTrackingBroken,
        onBodyHovered = () => {},
        tooltipManager,
        renderer,
        getDaysSinceJ2000,
        getCurrentOrigin,
    }) {
        this.UI = UI;
        this.getCurrentTarget = getCurrentTarget;
        this.onBodyClicked = onBodyClicked;
        this.onTrackingBroken = onTrackingBroken;

        this.picking = new Picking({
            camera,
            renderer,
            pickableObjects,
            gpuParticleSystems,
            getDaysSinceJ2000,
            getCurrentOrigin,
        });

        this.cameraFocus = new CameraFocus({
            camera,
            controls,
            frustumSize,
        });

        this.hoverState = new HoverState({
            tooltipManager,
            onBodyHovered,
        });

        this.input = new Input({
            controls,
            onPanStart: (isRightClick) => {
                this.cameraFocus.clearTracking();
                if (isRightClick) {
                    if (this.onTrackingBroken) this.onTrackingBroken();
                    const currentTarget = this.getCurrentTarget();
                    if (currentTarget) this.UI.setManualOverride(currentTarget.name);
                }
            },
            onClick: (x, y, isHardLock) => {
                const data = this.picking.pick(x, y);
                if (data) this.onBodyClicked(data, isHardLock);
            },
            onPointerMove: (x, y) => {
                if (this.hoverState._hoverRAFPending) return;
                this.hoverState._hoverRAFPending = true;

                requestAnimationFrame(() => {
                    this.hoverState._hoverRAFPending = false;
                    const data = this.picking.pick(x, y);
                    this.hoverState.updateHover(data, x, y, this);
                });
            },
            onPointerLeave: () => {
                this.hoverState.clearHover(this);
            }
        });
    }

    triggerFocus(data, isHardLock, AU_IN_KM) {
        this.cameraFocus.triggerFocus(data, isHardLock, AU_IN_KM);
    }

    clearTracking() {
        this.cameraFocus.clearTracking();
    }

    updateCamera(trackTargetPos) {
        this.cameraFocus.updateCamera(trackTargetPos);
    }
}