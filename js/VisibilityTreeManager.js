// js/VisibilityTreeManager.js
export class VisibilityTreeManager {
    constructor() {
        this.onDatasetVisibilityChanged = null;
        this.onDatasetColorChanged = null;
        this.initMasterToggle();
    }

    initMasterToggle() {
        const rowMaster = document.getElementById('row-master-toggle');
        if (rowMaster) {
            rowMaster.addEventListener('click', async () => {
                if (rowMaster.classList.contains('loading')) return;

                const newState = !rowMaster.classList.contains('checked');

                rowMaster.classList.toggle('checked', newState);
                rowMaster.classList.add('loading');

                const allAsteroids = document.querySelectorAll('#dataset-list-asteroids .magi-row');
                const loadingPromises = [];

                allAsteroids.forEach((row) => {
                    if (row.classList.contains('checked') !== newState) {
                        row.click(); // Programmatically sync children
                        if (row.togglePromise) {
                            loadingPromises.push(row.togglePromise);
                        }
                    }
                });
                await Promise.all(loadingPromises);

                rowMaster.classList.remove('loading');
            });
        }
    }

    addDatasetToggle(datasetName, category, colorHex, isChecked = false, urls = []) {
        const isPlanet = category === 'PLANET';
        const isMoon = category === 'MOON';
        const isRightSide = isPlanet || isMoon;
        const targetListId = isRightSide ? 'dataset-list-planets' : 'dataset-list-asteroids';
        const list = document.getElementById(targetListId);

        if (!list) return;

        const row = document.createElement('div');
        row.className = `magi-row ${isPlanet ? 'planet-row' : ''} ${isMoon ? 'moon-row' : ''} ${isChecked ? 'checked' : ''}`;
        row.dataset.category = category;

        const SVG_NS = 'http://www.w3.org/2000/svg';
        let wire = null;

        if (isMoon) {
            wire = document.createElementNS(SVG_NS, 'svg');
            wire.setAttribute('class', 'magi-svg-wire-moon');
            const poly = document.createElementNS(SVG_NS, 'polyline');
            poly.setAttribute('points', '15,1 0,1 0,-29');
            wire.appendChild(poly);

            [
                [15, 1],
                [0, 1],
                [0, -29],
            ].forEach((coord) => {
                const circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('cx', coord[0]);
                circle.setAttribute('cy', coord[1]);
                circle.setAttribute('r', '1.5');
                wire.appendChild(circle);
            });
        } else if (!isPlanet) {
            wire = document.createElementNS(SVG_NS, 'svg');
            wire.setAttribute('class', 'magi-svg-wire');
            const poly = document.createElementNS(SVG_NS, 'polyline');
            poly.setAttribute('points', '0,1 15,1 15,-29');
            wire.appendChild(poly);

            [
                [0, 1],
                [15, 1],
                [15, -29],
            ].forEach((coord) => {
                const circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('cx', coord[0]);
                circle.setAttribute('cy', coord[1]);
                circle.setAttribute('r', '1.5');
                wire.appendChild(circle);
            });
        }

        const btn = document.createElement('div');
        btn.className = 'magi-btn';

        const status = document.createElement('div');
        status.className = 'magi-status';

        const label = document.createElement('span');
        label.className = 'magi-label';

        let displayName = datasetName.toUpperCase();
        const maxChars = isRightSide ? 14 : 10;
        if (displayName.length > maxChars) {
            displayName = displayName.substring(0, maxChars) + '.';
        }
        label.textContent = displayName;

        let bar = null;
        let colorPicker = null;

        if (!isRightSide) {
            bar = document.createElement('div');
            bar.className = 'magi-bar';
            bar.style.backgroundColor = isChecked ? colorHex : '#330000';
            bar.appendChild(label);

            colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = colorHex || '#ffffff';
            colorPicker.className = 'magi-color-picker';
            bar.appendChild(colorPicker);

            colorPicker.addEventListener('input', (e) => {
                if (row.classList.contains('checked')) {
                    bar.style.backgroundColor = e.target.value;
                }
            });
            colorPicker.addEventListener('change', (e) => {
                if (this.onDatasetColorChanged) {
                    this.onDatasetColorChanged(datasetName, e.target.value);
                }
            });
            btn.appendChild(bar);
            btn.appendChild(status);
        } else {
            status.appendChild(label);
            btn.appendChild(status);
        }

        if (isPlanet) {
            row.appendChild(btn);
        } else if (isMoon) {
            row.appendChild(wire);
            row.appendChild(btn);
        } else {
            row.appendChild(btn);
            row.appendChild(wire);
        }

        row.addEventListener('click', async (e) => {
            if (colorPicker && e.target === colorPicker) return;

            if (row.classList.contains('loading')) return;

            const newState = !row.classList.contains('checked');
            row.classList.toggle('checked', newState);

            if (bar) {
                bar.style.backgroundColor = newState ? colorPicker.value : '#330000';
            }

            row.classList.add('loading');

            row.togglePromise = (async () => {
                try {
                    if (this.onDatasetVisibilityChanged) {
                        await this.onDatasetVisibilityChanged(datasetName, newState, urls);
                    }
                    if (newState && colorPicker && this.onDatasetColorChanged) {
                        this.onDatasetColorChanged(datasetName, colorPicker.value);
                    }

                    if (category === 'PLANET') {
                        const moonRows = document.querySelectorAll(
                            '#dataset-list-planets .moon-row'
                        );
                        moonRows.forEach((mRow) => {
                            if (mRow.classList.contains('checked') !== newState) {
                                mRow.click();
                            }
                        });
                    }
                } finally {
                    row.classList.remove('loading');
                }
            })();

            await row.togglePromise;
        });

        list.appendChild(row);
    }

    clearTrees() {
        const planetList = document.getElementById('dataset-list-planets');
        const asteroidList = document.getElementById('dataset-list-asteroids');
        if (planetList) planetList.innerHTML = '';
        if (asteroidList) asteroidList.innerHTML = '';

        const rowMaster = document.getElementById('row-master-toggle');
        const magiTrunk = document.getElementById('magi-trunk');
        if (rowMaster) rowMaster.classList.remove('checked');
        if (magiTrunk) magiTrunk.classList.remove('checked');
    }
}
