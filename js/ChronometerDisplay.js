// js/ChronometerDisplay.js

const CONFIGURATION = {
    colors: {
        waveForward: '#ffcc00',
        waveReverse: '#ff3333',
        gridForward: '#00ff00',
        gridReverse: '#ff3333',
        labelForward: 'rgba(255, 204, 0, 0.6)',
        labelReverse: 'rgba(255, 51, 51, 0.6)',
        fpsIndicator: '#3399ff',
        loadIndicator: '#33ff88',
        memoryIndicator: 'rgba(51, 255, 136, 0.6)',
        backgroundScanline: 'rgba(255, 255, 255, 0.03)',
        scannerFill: 'rgba(255, 255, 255, 0.8)',
        scannerStroke: 'rgba(255, 255, 255, 0.5)',
    },
    labels: [
        '-100Y',
        '-10Y',
        '-1Y',
        '-6M',
        '-1M',
        '-1W',
        '-1D',
        '-1H',
        '-1M',
        '-1S',
        'PAUSE',
        '+1S',
        '+1M',
        '+1H',
        '+1D',
        '+1W',
        '+1M',
        '+6M',
        '+1Y',
        '+10Y',
        '+100Y',
    ],
    thresholds: {
        fastTimeMinimumMultiplier: 3600,
        thirtyMinutesMilliseconds: 1800000,
        analogGlitchFrameDuration: 30,
    },
};

export class ChronometerDisplay {
    constructor(canvasElement) {
        this.chronoCanvas = canvasElement;
        this.waveBuffer = [];
        this.activeBlips = [];
        this.lastTimeDirection = undefined;
        this.glitchFrames = 0;
        this.lastSimDate = null;

        this.fpsBuffer = [];
        this.loadBuffer = [];
        this.lastPerformanceSample = { fps: 0, loadPct: 0, memory: null };

        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);
        this.handleResize();
    }

    /**
     * Removes event listeners to prevent memory leaks during component destruction.
     */
    dispose() {
        window.removeEventListener('resize', this.handleResize);
    }

    /**
     * Resizes internal canvas dimensions and reallocates memory buffers to match the new width.
     */
    handleResize() {
        if (!this.chronoCanvas) {
            return;
        }

        this.chronoCanvas.width = this.chronoCanvas.clientWidth;
        this.chronoCanvas.height = this.chronoCanvas.clientHeight;

        const canvasWidth = this.chronoCanvas.width;
        this.waveBuffer = new Array(canvasWidth).fill(0);
        this.fpsBuffer = new Array(canvasWidth).fill(0);
        this.loadBuffer = new Array(canvasWidth).fill(0);
    }

    /**
     * Updates the performance sample buffer.
     * Called exclusively by UIController upon receiving a throttled sample from PerformanceMonitor.
     */
    pushPerfSample(sample) {
        if (!sample || typeof sample.fps !== 'number' || typeof sample.loadPct !== 'number') {
            return;
        }
        this.lastPerformanceSample = sample;
    }

    render(currentSimDate, timeMultiplier) {
        if (!this.chronoCanvas || !currentSimDate) {
            return;
        }

        const context = this.chronoCanvas.getContext('2d');
        const canvasWidth = this.chronoCanvas.width;
        const canvasHeight = this.chronoCanvas.height;
        const isReversed = timeMultiplier < 0;

        this._clearCanvas(context, canvasWidth, canvasHeight);
        this._renderGrid(context, canvasWidth, canvasHeight, isReversed);
        this._renderLabels(context, canvasWidth, canvasHeight, isReversed);

        this._detectDirectionFlip(canvasWidth, isReversed);
        this._detectTimeTriggers(currentSimDate, timeMultiplier);

        const currentY = this._calculateSignalShape();
        this._applyAnalogDecay(canvasWidth);
        this._shiftBuffers(currentY, isReversed);

        this._renderWaveform(context, canvasWidth, canvasHeight, isReversed);
        this._renderPerformanceOverlay(context, canvasWidth, canvasHeight);
        this._renderScannerBracket(context, canvasWidth, canvasHeight, isReversed);
    }

    _clearCanvas(context, canvasWidth, canvasHeight) {
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.fillStyle = CONFIGURATION.colors.backgroundScanline;

        for (let index = 0; index < canvasHeight; index += 4) {
            context.fillRect(0, index, canvasWidth, 1);
        }
    }

    _renderGrid(context, canvasWidth, canvasHeight, isReversed) {
        context.fillStyle = isReversed
            ? CONFIGURATION.colors.gridReverse
            : CONFIGURATION.colors.gridForward;
        context.font = '8px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        for (let gridRow = 1; gridRow <= 2; gridRow++) {
            const yPosition = (canvasHeight / 3) * gridRow;
            for (let gridColumn = 0; gridColumn <= 20; gridColumn++) {
                context.fillText('+', (canvasWidth / 20) * gridColumn, yPosition - 5);
            }
        }
    }

    _renderLabels(context, canvasWidth, canvasHeight, isReversed) {
        if (canvasWidth <= 600) {
            return;
        }

        context.fillStyle = isReversed
            ? CONFIGURATION.colors.labelReverse
            : CONFIGURATION.colors.labelForward;
        context.font = 'bold 9px monospace';
        context.textBaseline = 'bottom';

        for (let index = 0; index <= 20; index++) {
            const xPosition = (canvasWidth / 20) * index;

            if (index === 0) {
                context.textAlign = 'left';
            } else if (index === 20) {
                context.textAlign = 'right';
            } else {
                context.textAlign = 'center';
            }

            context.fillText(CONFIGURATION.labels[index], xPosition, canvasHeight - 2);
        }
    }

    _detectDirectionFlip(canvasWidth, isReversed) {
        if (this.lastTimeDirection !== undefined && this.lastTimeDirection !== isReversed) {
            this.activeBlips = [];

            for (let index = 0; index < canvasWidth; index++) {
                this.waveBuffer[index] = (Math.random() - 0.5) * 50;
            }

            this.glitchFrames = CONFIGURATION.thresholds.analogGlitchFrameDuration;
        }
        this.lastTimeDirection = isReversed;
    }

    _detectTimeTriggers(currentSimDate, timeMultiplier) {
        if (!this.lastSimDate) {
            this.lastSimDate = new Date(currentSimDate.getTime());
            return;
        }

        if (currentSimDate.getTime() === this.lastSimDate.getTime()) {
            return;
        }

        const previousTimestampMs = this.lastSimDate.getTime();
        const currentTimestampMs = currentSimDate.getTime();

        const previousYear = this.lastSimDate.getUTCFullYear();
        const currentYear = currentSimDate.getUTCFullYear();
        const previousMonth = this.lastSimDate.getUTCMonth();
        const currentMonth = currentSimDate.getUTCMonth();
        const previousDate = this.lastSimDate.getUTCDate();
        const currentDate = currentSimDate.getUTCDate();

        const absoluteTimeMultiplier = Math.abs(timeMultiplier);
        const isFastTime =
            absoluteTimeMultiplier > CONFIGURATION.thresholds.fastTimeMinimumMultiplier;

        if (isFastTime) {
            this._processFastTimeTriggers(
                previousYear,
                currentYear,
                previousMonth,
                currentMonth,
                previousDate,
                currentDate
            );
        } else {
            this._processSlowTimeTriggers(
                previousTimestampMs,
                currentTimestampMs,
                previousDate,
                currentDate
            );
        }

        this.lastSimDate = new Date(currentSimDate.getTime());
    }

    _processFastTimeTriggers(
        previousYear,
        currentYear,
        previousMonth,
        currentMonth,
        previousDate,
        currentDate
    ) {
        if (previousYear !== currentYear) {
            const isLeapYear =
                currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0);
            this.activeBlips.push({
                life: 1.0,
                amplitude: isLeapYear ? -20 : 20,
                shape: 'peak',
                decay: 0.2,
            });
        } else if (previousMonth !== currentMonth) {
            const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
            this.activeBlips.push({
                life: 1.0,
                amplitude: daysInMonth === 31 ? 8 : -8,
                shape: 'hill',
                decay: 0.1,
            });
        } else if (previousDate !== currentDate) {
            this.activeBlips.push({
                life: 1.0,
                amplitude: currentDate % 2 === 0 ? 4 : -4,
                shape: 'bump',
                decay: 0.25,
            });
        }
    }

    _processSlowTimeTriggers(previousTimestampMs, currentTimestampMs, previousDate, currentDate) {
        const previousHour = new Date(previousTimestampMs).getUTCHours();
        const currentHour = new Date(currentTimestampMs).getUTCHours();
        const previousHalfHour = Math.floor(
            previousTimestampMs / CONFIGURATION.thresholds.thirtyMinutesMilliseconds
        );
        const currentHalfHour = Math.floor(
            currentTimestampMs / CONFIGURATION.thresholds.thirtyMinutesMilliseconds
        );
        const previousSecond = Math.floor(previousTimestampMs / 1000);
        const currentSecond = Math.floor(currentTimestampMs / 1000);

        if (previousDate !== currentDate) {
            this.activeBlips.push({ life: 1.0, amplitude: 20, shape: 'peak', decay: 0.2 });
        } else if (previousHour !== currentHour) {
            this.activeBlips.push({ life: 1.0, amplitude: -12, shape: 'peak', decay: 0.15 });
        } else if (previousHalfHour !== currentHalfHour) {
            this.activeBlips.push({ life: 1.0, amplitude: 8, shape: 'hill', decay: 0.1 });
        } else if (previousSecond !== currentSecond) {
            this.activeBlips.push({
                life: 1.0,
                amplitude: currentSecond % 2 === 0 ? 4 : -4,
                shape: 'bump',
                decay: 0.25,
            });
        }
    }

    _calculateSignalShape() {
        let currentY = 0;

        for (let index = this.activeBlips.length - 1; index >= 0; index--) {
            const blip = this.activeBlips[index];
            const timeFactor = 1.0 - blip.life;

            if (blip.shape === 'peak') {
                currentY += blip.amplitude * Math.pow(Math.sin(timeFactor * Math.PI), 4);
            } else if (blip.shape === 'hill' || blip.shape === 'bump') {
                currentY += blip.amplitude * Math.sin(timeFactor * Math.PI);
            }

            blip.life -= blip.decay;
            if (blip.life <= 0) {
                this.activeBlips.splice(index, 1);
            }
        }

        return currentY;
    }

    _applyAnalogDecay(canvasWidth) {
        if (this.glitchFrames <= 0) {
            return;
        }

        this.glitchFrames--;

        for (let index = 0; index < canvasWidth; index++) {
            this.waveBuffer[index] *= 0.85;
        }

        if (this.glitchFrames === 0) {
            for (let index = 0; index < canvasWidth; index++) {
                if (Math.abs(this.waveBuffer[index]) < 1) {
                    this.waveBuffer[index] = 0;
                }
            }
        }
    }

    _shiftBuffers(currentY, isReversed) {
        if (isReversed) {
            this.waveBuffer.pop();
            this.waveBuffer.unshift(currentY);
        } else {
            this.waveBuffer.shift();
            this.waveBuffer.push(currentY);
        }

        this.fpsBuffer.shift();
        this.fpsBuffer.push(this.lastPerformanceSample.fps);

        this.loadBuffer.shift();
        this.loadBuffer.push(this.lastPerformanceSample.loadPct);
    }

    _renderWaveform(context, canvasWidth, canvasHeight, isReversed) {
        context.beginPath();
        context.strokeStyle = isReversed
            ? CONFIGURATION.colors.waveReverse
            : CONFIGURATION.colors.waveForward;
        context.lineWidth = 1.5;
        context.lineJoin = 'round';

        const centerY = canvasHeight / 2 - 5;

        for (let xPosition = 0; xPosition < canvasWidth; xPosition++) {
            const displayY = isReversed ? -this.waveBuffer[xPosition] : this.waveBuffer[xPosition];
            const drawY = centerY - displayY;

            if (xPosition === 0) {
                context.moveTo(xPosition, drawY);
            } else {
                context.lineTo(xPosition, drawY);
            }
        }

        context.stroke();
    }

    _renderPerformanceOverlay(context, canvasWidth, canvasHeight) {
        context.beginPath();
        context.strokeStyle = CONFIGURATION.colors.fpsIndicator;
        context.lineWidth = 1;
        const fpsScale = canvasHeight / 120;

        for (let xPosition = 0; xPosition < canvasWidth; xPosition++) {
            const fpsValue = this.fpsBuffer[xPosition] || 0;
            const drawY = canvasHeight - fpsValue * fpsScale;

            if (xPosition === 0) {
                context.moveTo(xPosition, drawY);
            } else {
                context.lineTo(xPosition, drawY);
            }
        }
        context.stroke();

        context.beginPath();
        context.strokeStyle = CONFIGURATION.colors.loadIndicator;
        context.lineWidth = 1;
        const loadScale = canvasHeight / 200;

        for (let xPosition = 0; xPosition < canvasWidth; xPosition++) {
            const loadValue = Math.min(this.loadBuffer[xPosition] || 0, 100);
            const drawY = canvasHeight - loadValue * loadScale;

            if (xPosition === 0) {
                context.moveTo(xPosition, drawY);
            } else {
                context.lineTo(xPosition, drawY);
            }
        }
        context.stroke();

        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.font = 'bold 9px monospace';

        context.fillStyle = CONFIGURATION.colors.fpsIndicator;
        context.fillText(`${Math.round(this.lastPerformanceSample.fps)} FPS`, 2, 2);

        context.fillStyle = CONFIGURATION.colors.loadIndicator;
        context.fillText(`${Math.round(this.lastPerformanceSample.loadPct)}% LOAD`, 2, 12);

        if (this.lastPerformanceSample.memory) {
            context.fillStyle = CONFIGURATION.colors.memoryIndicator;
            context.fillText(`${this.lastPerformanceSample.memory.pctOfLimit}% RAM`, 2, 22);
        }
    }

    _renderScannerBracket(context, canvasWidth, canvasHeight, isReversed) {
        const scanXPosition = isReversed ? 1 : canvasWidth - 2;
        const centerY = canvasHeight / 2 - 5;

        context.fillStyle = CONFIGURATION.colors.scannerFill;
        context.fillRect(scanXPosition, 0, 2, canvasHeight - 12);

        context.strokeStyle = CONFIGURATION.colors.scannerStroke;
        context.beginPath();

        const direction = isReversed ? 1 : -1;
        context.moveTo(scanXPosition + direction * 10, centerY - 10);
        context.lineTo(scanXPosition, centerY - 10);
        context.moveTo(scanXPosition + direction * 10, centerY + 10);
        context.lineTo(scanXPosition, centerY + 10);

        context.stroke();
    }
}
