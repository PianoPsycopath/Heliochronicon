// js/BodyListManager.js
export class BodyListManager {
    constructor() {
        this.currentSortMode = 'distance';
        
        this.listContainer = document.getElementById('body-list');
        this.searchEl = document.getElementById('search-input');
        this.sortToggleEl = document.getElementById('sort-toggle');
        
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
        const searchStr = this.searchEl.value.toLowerCase();
        this.listContainer.innerHTML = '';
        
        let targetList = [];
        if (searchStr) {
            targetList = bodies.filter(b => b.data.name.toLowerCase().includes(searchStr));
        } else if (currentTargetData && currentTargetData.parent !== "SUN" && currentTargetData.name !== "SUN") {
            const activeSystemName = currentTargetData.isMoon ? currentTargetData.parent : currentTargetData.name;
            targetList = bodies.filter(b => b.data.parent === activeSystemName);
        } else {
            targetList = bodies.filter(b => !b.isMoon && b.data.name !== "SUN");
        }
        
        targetList.sort((a, b) => {
            if (this.currentSortMode === 'distance') {
                return a.data.a - b.data.a;
            } else {
                const sizeA = a.data.radius_km || (a.data.mass * 1000) || 0;
                const sizeB = b.data.radius_km || (b.data.mass * 1000) || 0;
                return sizeB - sizeA;
            }
        });
        
        const MAX_DOM_ITEMS = 100;
        const displayList = targetList.slice(0, MAX_DOM_ITEMS);
        
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

        if (targetList.length > MAX_DOM_ITEMS) {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.justifyContent = 'center';
            div.style.color = '#ff5555';
            div.style.pointerEvents = 'none';
            div.innerHTML = `<i>[+ ${targetList.length - MAX_DOM_ITEMS} HIDDEN IN LIST]</i>`;
            this.listContainer.appendChild(div);
        }
    }
}