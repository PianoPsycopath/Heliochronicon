// js/TutorialManager.js
class TutorialManager {
    constructor() {
        this.overlay = document.getElementById('tutorial-overlay');
        this.box = document.getElementById('tutorial-box');
        this.title = document.getElementById('tutorial-title');
        this.text = document.getElementById('tutorial-text');
        this.line = document.getElementById('tutorial-line');
        this.dot = document.getElementById('tutorial-dot');
        this.btnSkip = document.getElementById('btn-skip-tutorial');
        this.btnStart = document.getElementById('btn-tutorial');

        this.currentStep = 0;
        this.isActive = false;
        this.currentTargetEl = null;

        this.steps = [
            {
                id: 'bottom-deck',
                title: 'CLOCK',
                text: 'TBA'
            },
            {
                id: 'panel-left',
                title: 'SEARCH AND VISIBILITY',
                text: 'TBA'
            },
            {
                id: 'btn-scan',
                title: 'ASTEROID SCAN',
                text: 'SCAN'
            },
            {
                id: null, 
                title: '3D CONTROLS',
                text: 'Left-click and drag to pan the camera. Scroll to zoom. Click any celestial body or asteroid to lock the camera onto it.'
            }//gif for mobile
        ];
        this.initBindings();
        this.checkFirstRun();
    }
    initBindings() {
        this.btnStart.addEventListener('click', () => this.startTutorial());

        this.box.addEventListener('click', (e) => {
            if (!this.isActive) return; // Safety check to prevent any phantom advances
            if (e.target !== this.btnSkip) {
                this.nextStep();
            }
        });
        this.btnSkip.addEventListener('click', () => this.endTutorial());
    }
    checkFirstRun() {
        const hasSeenTutorial = localStorage.getItem('heliochronicon_tutorial');
        if (!hasSeenTutorial) {
            setTimeout(() => this.startTutorial(), 1000);
        }
    }
    startTutorial() {
        if (this.isActive) return; // Prevent double-starts
        this.currentStep = 0;
        this.isActive = true;
        this.overlay.classList.add('active');
        localStorage.setItem('heliochronicon_tutorial', 'true');
        
        this.renderStep();
        this.trackTarget(); 
    }
    nextStep() {
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.endTutorial();
        } else {
            this.renderStep();
        }
    }
    renderStep() {
        const step = this.steps[this.currentStep];
        
        if (this.currentTargetEl) {
            this.currentTargetEl.classList.remove('tutorial-highlight');
        }
        // --- MOBILE ---
        const isMobile = window.innerWidth <= 768;
        const panelLeft = document.getElementById('panel-left');
        
        if (isMobile && panelLeft) {
            if (step.id === 'panel-left') {
                panelLeft.classList.add('mobile-active');
                document.body.classList.add('panels-open');
            } else {
                panelLeft.classList.remove('mobile-active');
                document.body.classList.remove('panels-open');
            }
        }
        this.title.innerText = step.title;
        this.text.innerText = step.text;

        this.currentTargetEl = step.id ? document.getElementById(step.id) : null;
        
        if (this.currentTargetEl) {
            this.currentTargetEl.classList.add('tutorial-highlight');
        }
    }
    trackTarget() {
        if (!this.isActive) return;
        
        this.positionOverlay();
        this.trackingFrame = requestAnimationFrame(() => this.trackTarget());
    }
    endTutorial() {
        this.isActive = false;
        this.overlay.classList.remove('active');
        if (this.currentTargetEl) {
            this.currentTargetEl.classList.remove('tutorial-highlight');
        }
        if (this.trackingFrame) {
            cancelAnimationFrame(this.trackingFrame);
        }
        // --- MOBILE---
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            const panelLeft = document.getElementById('panel-left');
            if (panelLeft) panelLeft.classList.remove('mobile-active');
            document.body.classList.remove('panels-open');
        }
    }
    positionOverlay() {
        const boxWidth = this.box.offsetWidth || 320;
        const boxHeight = this.box.offsetHeight || 180;

        if (!this.currentTargetEl) {
            this.box.style.left = `${(window.innerWidth / 2) - (boxWidth / 2)}px`;
            this.box.style.top = `${(window.innerHeight / 2) - (boxHeight / 2)}px`;

            this.line.style.display = 'none';
            this.dot.style.display = 'none';
            return;
        }
        this.line.style.display = 'block';
        this.dot.style.display = 'block';

        const targetRect = this.currentTargetEl.getBoundingClientRect();

        const targetX = targetRect.left + (targetRect.width / 2);
        const targetY = targetRect.top + (targetRect.height / 2);

        let boxX = (window.innerWidth / 2) - (boxWidth / 2);
        let boxY = (window.innerHeight / 2) - (boxHeight / 2);

        if (targetY > window.innerHeight / 2) {
            boxY -= 150; 
        } else {
            boxY += 150;
        }
        boxX = Math.max(20, Math.min(boxX, window.innerWidth - boxWidth - 20));
        boxY = Math.max(20, Math.min(boxY, window.innerHeight - boxHeight - 20));

        this.box.style.left = `${boxX}px`;
        this.box.style.top = `${boxY}px`;

        const startX = boxX + (boxWidth / 2);
        const startY = boxY + (boxHeight / 2);

        this.line.setAttribute('x1', startX);
        this.line.setAttribute('y1', startY);
        this.line.setAttribute('x2', targetX);
        this.line.setAttribute('y2', targetY);

        this.dot.setAttribute('cx', targetX);
        this.dot.setAttribute('cy', targetY);
    }
}
