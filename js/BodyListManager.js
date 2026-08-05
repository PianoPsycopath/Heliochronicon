// js/BodyListManager.js

export function getFilteredAndSortedBodies(bodies, currentTargetData, searchStr, sortMode) {
    let targetList = [];
    const query = (searchStr || '').toLowerCase();

    // Filtering
    if (query) {
        targetList = bodies.filter(b => b.data.name.toLowerCase().includes(query));
    } else if (currentTargetData && currentTargetData.name !== "SUN") {
        const activeSystemName = currentTargetData.isMoon ? currentTargetData.parent : currentTargetData.name;
        targetList = bodies.filter(b => b.data.parent === activeSystemName);
    } else {
        targetList = bodies.filter(b => !b.isMoon && b.data.name !== "SUN");
    }

    return targetList.sort((a, b) => {
        if (sortMode === 'distance') {
            return a.data.a - b.data.a;
        } else {
            const sizeA = a.data.radius_km || (a.data.mass * 1000) || 0;
            const sizeB = b.data.radius_km || (b.data.mass * 1000) || 0;
            return sizeB - sizeA;
        }
    });
}

export class BodyListManager {
    constructor(domElements) {
        this.currentSortMode = 'distance';
        
        // Injected DOM Elements
        this.listContainer = domElements.listContainer;
        this.searchEl = domElements.searchEl;
        this.sortToggleEl = domElements.sortToggleEl;
        
        // External callbacks
        this.onFocusBody = null;
        this.onRefreshList = null;
        this.onAsteroidLookup = null;
        
        this.initBindings();
    }
    
    initBindings() {
        this.sortToggleEl.addEventListener('click', (e) => {
            this.currentSortMode = this.currentSortMode === 'distance' ? 'size' : 'distance';
            e.target.innerText = `SORT: ${this.currentSortMode.toUpperCase()}`;
            if (this.onRefreshList) this.onRefreshList();
        });

        this.searchEl.addEventListener('input', () => {
            if (this.onRefreshList) this.onRefreshList();
        });

        this.searchEl.addEventListener('keypress', (e) => {
            if (e.key !== 'Enter') return;
            const query = this.searchEl.value.trim();
            if (query && this.onAsteroidLookup) this.onAsteroidLookup(query);
        });
    }

    render(bodies, currentTargetData) {
        // 1. Get pure data
        const searchStr = this.searchEl.value;
        const sortedAndFiltered = getFilteredAndSortedBodies(bodies, currentTargetData, searchStr, this.currentSortMode);
        
        // 2. Perform DOM mutations
        this.listContainer.innerHTML = '';
        const MAX_DOM_ITEMS = 100;
        const displayList = sortedAndFiltered.slice(0, MAX_DOM_ITEMS);
        
        displayList.forEach(b => {
            const div = document.createElement('div');
            div.className = 'list-item';
            const stat = this.currentSortMode === 'distance' ? `${b.data.a.toFixed(4)} AU` : `${(b.data.radius_km||0).toFixed(1)} KM`;
            div.innerHTML = `<span>${b.data.name}</span> <span style="color:#aaa;">[${stat}]</span>`;
            
            div.addEventListener('click', () => {
                if (this.onFocusBody) this.onFocusBody(b.data);
            });
            this.listContainer.appendChild(div);
        });

        if (sortedAndFiltered.length > MAX_DOM_ITEMS) {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.justifyContent = 'center';
            div.style.color = '#ff5555';
            div.style.pointerEvents = 'none';
            div.innerHTML = `<i>[+ ${sortedAndFiltered.length - MAX_DOM_ITEMS} HIDDEN IN LIST]</i>`;
            this.listContainer.appendChild(div);
        }
    }
}