// js/TimeThrottle.js

export const timeScaleMap = [
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

export function calculateThrottleState(index) {
    const clampedIndex = Math.max(0, Math.min(20, index));
    const mapping = timeScaleMap[clampedIndex];
    
    return {
        index: clampedIndex,
        multiplier: mapping.mult,
        label: mapping.label,
        isReversed: clampedIndex < 10,
        isPaused: clampedIndex === 10,
        color: clampedIndex <= 10 ? "#ff3333" : "#ffcc00"
    };
}

export class TimeThrottle {
    constructor(domElements) {
        this.timeMultiplier = 1;
        this.isLiveTime = true;

        this.timeSlider = domElements.timeSlider;
        this.throttleLabel = domElements.throttleLabel;
        this.chronoWrapper = domElements.chronoWrapper;
        this.btnRev = domElements.btnRev;
        this.btnFwd = domElements.btnFwd;
        this.btnPause = domElements.btnPause;
        this.btn1x = domElements.btn1x;
        this.btnLive = domElements.btnLive;

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

    applyThrottle(rawIndex) {
        this.isLiveTime = false;
        this.btnLive.classList.remove('active');
        
        // 1. Get pure state
        const state = calculateThrottleState(rawIndex);
        
        // 2. Apply internal data state
        this.timeMultiplier = state.multiplier;
        
        // 3. Apply DOM side-effects
        this.timeSlider.value = state.index;
        this.throttleLabel.innerText = state.label;
        this.throttleLabel.style.color = state.color;

        if (state.isReversed) {
            this.timeSlider.classList.add('reversed');
            this.chronoWrapper.classList.add('reversed');
        } else {
            this.timeSlider.classList.remove('reversed');
            this.chronoWrapper.classList.remove('reversed');
        }
    }

    pauseForManualInput() {
        this.applyThrottle(10);
    }
}