// js/ChronometerDisplay.js
export class ChronometerDisplay {
    constructor(canvasElement) {
        this.chronoCanvas = canvasElement;
        
        // Internal State
        this.waveBuffer = [];
        this.activeBlips = [];
        this.lastTimeDirection = undefined;
        this.glitchFrames = 0;
        this.lastSimDate = null;
        
        // Handle canvas sizing dynamically
        const resizeCanvas = () => {
            if (this.chronoCanvas) {
                this.chronoCanvas.width = this.chronoCanvas.clientWidth;
                this.chronoCanvas.height = this.chronoCanvas.clientHeight;
            }
        };
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 100);
    }

    render(currentSimDate, timeMultiplier) {
        if (!this.chronoCanvas) return;
        const ctx = this.chronoCanvas.getContext('2d');
        const w = this.chronoCanvas.width;
        const h = this.chronoCanvas.height;

        const isReversed = timeMultiplier < 0;
        
        // --- 1. DYNAMIC COLORING ---
        const waveColor = isReversed ? '#ff3333' : '#ffcc00';
        const crossColor = isReversed ? '#ff3333' : '#00ff00';
        const labelColor = isReversed ? 'rgba(255, 51, 51, 0.6)' : 'rgba(255, 204, 0, 0.6)';
  
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for(let i = 0; i < h; i += 4) ctx.fillRect(0, i, w, 1);
        
        // --- 2. DRAW CRT GRID ---
        ctx.fillStyle = crossColor;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = 1; r <= 2; r++) {
            const yPos = (h / 3) * r;
            for (let c = 0; c <= 20; c++) {
                ctx.fillText('+', (w / 20) * c, yPos - 5);
            }
        }
        
        // --- 3. DRAW BOTTOM LABELS ---
        if (w > 600) {
            const labels = ["-100Y", "-10Y", "-1Y", "-6M", "-1M", "-1W", "-1D", "-1H", "-1M", "-1S", "PAUSE", "+1S", "+1M", "+1H", "+1D", "+1W", "+1M", "+6M", "+1Y", "+10Y", "+100Y"];
            ctx.fillStyle = labelColor;
            ctx.font = 'bold 9px monospace';
            ctx.textBaseline = 'bottom';
            for (let i = 0; i <= 20; i++) {
                let xPos = (w / 20) * i;
                if (i === 0) ctx.textAlign = 'left';
                else if (i === 20) ctx.textAlign = 'right';
                else ctx.textAlign = 'center';
                ctx.fillText(labels[i], xPos, h - 2);
            }
        }
        
        if (!currentSimDate) return;
        
        // --- 4. SYSTEM STATE INITIALIZATION ---
        if (!this.waveBuffer || this.waveBuffer.length !== w) {
            this.waveBuffer = new Array(w).fill(0);
        }
        if (!this.activeBlips) this.activeBlips = [];
        
        // --- 5. DIRECTION FLIP DETECTION (CRT DEGAUSS EFFECT) ---
        if (this.lastTimeDirection !== undefined && this.lastTimeDirection !== isReversed) {
            this.activeBlips = [];
            for (let i = 0; i < w; i++) {
                this.waveBuffer[i] = (Math.random() - 0.5) * 50; 
            }
            this.glitchFrames = 30; // 30 frames of analog decay
        }
        this.lastTimeDirection = isReversed;
        
        // --- 6. DUAL-SCALE HIERARCHICAL TIME TRIGGER DETECTION ---
        if (this.lastSimDate && currentSimDate.getTime() !== this.lastSimDate.getTime()) {
            const t1 = this.lastSimDate.getTime();
            const t2 = currentSimDate.getTime();
            
            const y1 = this.lastSimDate.getUTCFullYear();
            const y2 = currentSimDate.getUTCFullYear();
            const m1 = this.lastSimDate.getUTCMonth();
            const m2 = currentSimDate.getUTCMonth();
            const d1 = this.lastSimDate.getUTCDate();
            const d2 = currentSimDate.getUTCDate();

            // Anything > 3600 (1 Hour/Sec) uses Fast Time. Otherwise, Slow Time.
            const absMult = Math.abs(timeMultiplier);
            const isFastTime = absMult > 3600; 

            if (isFastTime) {
                // === FAST TIME MODE (>= 1 Day/Sec) ===
                if (y1 !== y2) {
                    const isLeap = (y2 % 4 === 0 && (y2 % 100 !== 0 || y2 % 400 === 0));
                    this.activeBlips.push({ life: 1.0, amp: isLeap ? -20 : 20, shape: 'peak', decay: 0.2 });
                } 
                else if (m1 !== m2) {
                    const daysInMonth = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
                    this.activeBlips.push({ life: 1.0, amp: (daysInMonth === 31) ? 8 : -8, shape: 'hill', decay: 0.1 });
                } 
                else if (d1 !== d2) {
                    this.activeBlips.push({ life: 1.0, amp: (d2 % 2 === 0) ? 4 : -4, shape: 'bump', decay: 0.25 });
                }
            } else {
                // === SLOW TIME MODE (<= 1 Hour/Sec) ===
                const h1 = this.lastSimDate.getUTCHours();
                const h2 = currentSimDate.getUTCHours();
                const halfHour1 = Math.floor(t1 / 1800000); // Unix timestamp divided by 30 mins
                const halfHour2 = Math.floor(t2 / 1800000);
                const sec1 = Math.floor(t1 / 1000);
                const sec2 = Math.floor(t2 / 1000);

                if (d1 !== d2) {
                    // Day
                    this.activeBlips.push({ life: 1.0, amp: 20, shape: 'peak', decay: 0.2 });
                }
                else if (h1 !== h2) {
                    // Hour
                    this.activeBlips.push({ life: 1.0, amp: -12, shape: 'peak', decay: 0.15 }); 
                }
                else if (halfHour1 !== halfHour2) {
                    // 30-Minute
                    this.activeBlips.push({ life: 1.0, amp: 8, shape: 'hill', decay: 0.1 });
                }
                else if (sec1 !== sec2) {
                    // 1 Second
                    this.activeBlips.push({ life: 1.0, amp: (sec2 % 2 === 0) ? 4 : -4, shape: 'bump', decay: 0.25 });
                }
            }
        }
        this.lastSimDate = new Date(currentSimDate.getTime());
        
        // --- 7. SIGNAL SHAPE GENERATOR ---
        let currentY = 0;
        for (let i = this.activeBlips.length - 1; i >= 0; i--) {
            const b = this.activeBlips[i];
            const t = 1.0 - b.life; 
            
            if (b.shape === 'peak') currentY += b.amp * Math.pow(Math.sin(t * Math.PI), 4);
            else if (b.shape === 'hill') currentY += b.amp * Math.sin(t * Math.PI);
            else if (b.shape === 'bump') currentY += b.amp * Math.sin(t * Math.PI);

            b.life -= b.decay;
            if (b.life <= 0) this.activeBlips.splice(i, 1);
        }
        
        // --- 8. ANALOG STATIC DECAY ENGINE ---
        if (this.glitchFrames > 0) {
            this.glitchFrames--;
            for (let i = 0; i < w; i++) {
                this.waveBuffer[i] *= 0.85; 
            }
            if (this.glitchFrames === 0) {
                for (let i = 0; i < w; i++) {
                    if (Math.abs(this.waveBuffer[i]) < 1) this.waveBuffer[i] = 0;
                }
            }
        }
        
        // --- 9. CONSTANT REAL-TIME BUFFER SHIFT ---
        if (isReversed) {
            this.waveBuffer.pop(); 
            this.waveBuffer.unshift(currentY); 
        } else {
            this.waveBuffer.shift(); 
            this.waveBuffer.push(currentY); 
        }
        
        // --- 10. RENDER THE WAVEFORM (WITH INVERSION) ---
        ctx.beginPath();
        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        const centerY = (h / 2) - 5; 

        for (let x = 0; x < w; x++) {
            const displayY = isReversed ? -this.waveBuffer[x] : this.waveBuffer[x];
            const drawY = centerY - displayY;
            
            if (x === 0) ctx.moveTo(x, drawY);
            else ctx.lineTo(x, drawY);
        }
        ctx.stroke();
        
        // --- 11. DYNAMIC SCANNER BRACKET ---
        const scanX = isReversed ? 1 : w - 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(scanX, 0, 2, h - 12);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        const dir = isReversed ? 1 : -1;
        ctx.moveTo(scanX + (dir * 10), centerY - 10); ctx.lineTo(scanX, centerY - 10);
        ctx.moveTo(scanX + (dir * 10), centerY + 10); ctx.lineTo(scanX, centerY + 10);
        ctx.stroke();
    }
}