// js/TimeThrottle.js

export class TimeThrottle {
    constructor() {
        this.timeMultiplier = 1;
        this.isLiveTime = true;

        // DOM Elements
        this.timeSlider = document.getElementById('time-slider');
        this.throttleLabel = document.getElementById('throttle-label');
        this.chronoWrapper = document.getElementById('chrono-slider-wrapper');
        this.btnRev = document.getElementById('btn-time-rev');
        this.btnFwd = document.getElementById('btn-time-fwd');
        this.btnPause = document.getElementById('btn-time-pause');
        this.btn1x = document.getElementById('btn-time-1x');
        this.btnLive = document.getElementById('btn-live');

        // 21 steps (0 to 20). Index 10 is PAUSED. Index 11 is 1x Speed.
        this.timeScaleMap = [
            { label: "-100 YEARS / SEC", mult: -3153600000 },
            { label: "-10 YEARS / SEC", mult: -315360000 },
            { label: "-1 YEAR / SEC", mult: -31536000 },
            { label: "-6 MONTHS / SEC", mult: -15552000 },
            { label: "-1 MONTH / SEC", mult: -2592000 },
            { label: "-1 WEEK / SEC", mult: -604800 },
            { label: "-1 DAY / SEC", mult: -86400 },
            { label: "-1 HOUR / SEC", mult: -3600 },
            { label: "-1 MIN / SEC", mult: -60 },
            { label: "-1 SEC / SEC", mult: -1 },
            { label: "PAUSED", mult: 0 },             // Index 10
            { label: "1 SEC / SEC", mult: 1 },        // Index 11
            { label: "1 MIN / SEC", mult: 60 },
            { label: "1 HOUR / SEC", mult: 3600 },
            { label: "1 DAY / SEC", mult: 86400 },
            { label: "1 WEEK / SEC", mult: 604800 },
            { label: "1 MONTH / SEC", mult: 2592000 },
            { label: "6 MONTHS / SEC", mult: 15552000 },
            { label: "1 YEAR / SEC", mult: 31536000 },
            { label: "10 YEARS / SEC", mult: 315360000 },
            { label: "100 YEARS / SEC", mult: 3153600000 }
        ];

        this.initBindings();
    }

    initBindings() {
        this.timeSlider.addEventListener('input', (e) => this.applyThrottle(parseInt(e.target.value)));
        this.btnRev.addEventListener('click', () => this.applyThrottle(parseInt(this.timeSlider.value) - 1));
        this.btnFwd.addEventListener('click', () => this.applyThrottle(parseInt(this.timeSlider.value) + 1));
        this.btnPause.addEventListener('click', () => this.applyThrottle(10));
        this.btn1x.addEventListener('click', () => this.applyThrottle(11));

        this.btnLive.addEventListener('click', () => {
            this.applyThrottle(11); 
            this.isLiveTime = true;
            this.btnLive.classList.add('active'); 
        });
    }

    applyThrottle(index) {
        this.isLiveTime = false;
        this.btnLive.classList.remove('active');
        
        // Clamp bounds
        index = Math.max(0, Math.min(20, index));
        this.timeSlider.value = index;

        if (index < 10) {
            this.timeSlider.classList.add('reversed');
            this.chronoWrapper.classList.add('reversed');
        } else {
            this.timeSlider.classList.remove('reversed');
            this.chronoWrapper.classList.remove('reversed');
        }
        
        const mapping = this.timeScaleMap[index];
        this.timeMultiplier = mapping.mult;
        this.throttleLabel.innerText = mapping.label;
        
        if (index <= 10) this.throttleLabel.style.color = "#ff3333"; 
        else this.throttleLabel.style.color = "#ffcc00"; 
    }

    pauseForManualInput() {
        this.applyThrottle(10);
    }
}