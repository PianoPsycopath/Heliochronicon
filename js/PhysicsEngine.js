// js/PhysicsEngine.js
class PhysicsEngine {
    static getJ2000Days(date) { 
        return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000; 
    }

    static updateSystemTime(UI, currentDate, deltaSec) {
        let newDate = currentDate;
        if (UI.timeMultiplier !== 0) {
            newDate = new Date(currentDate.getTime() + (deltaSec * 1000 * UI.timeMultiplier));
            UI.updateTimeInput(newDate);
        }
        return {
            newDate: newDate,
            daysSinceJ2000: this.getJ2000Days(newDate)
        };
    }

    static calculateKeplerianKinematics(celestialBodies, daysSinceJ2000) {
        const T = daysSinceJ2000 / 36525.0;
        const rad = Math.PI / 180;
        
        celestialBodies.forEach(b => {
            const d = b.data;
            if (b.datasetVisible === false) { b.isCulled = true; return; }
            b.isCulled = false;
            b.hideLabel = false; 
            
            const ra_deg = d.pole_ra + d.pole_ra_rate * T;
            const dec_deg = d.pole_dec + d.pole_dec_rate * T;
            const w_deg = d.pm_w + d.pm_w_rate * daysSinceJ2000;
            
            const RA = ra_deg * rad;
            const DEC = dec_deg * rad;
            const W = w_deg * rad;

            const poleVec = new THREE.Vector3(
                Math.cos(DEC) * Math.cos(RA),
                Math.sin(DEC),
                -Math.cos(DEC) * Math.sin(RA) 
            ).normalize();

            b.poleQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleVec);
            b.W_current = W;
            b.RA_current_deg = ra_deg;
            b.DEC_current_deg = dec_deg;

            if (d.name === "SUN") {
                b.globalPos = new THREE.Vector3(0,0,0);
            } else {
                const M_current = d.M0 + d.n * daysSinceJ2000;
                b.localPos = OrbitalMath.calcPosFromM(b.scaledA, d.e, d.i, d.w, d.Node, M_current);
            }
        });
    }

    static applyMoonParentOffsets(celestialBodies) {
        celestialBodies.forEach(b => {
            const d = b.data;
            if (b.isCulled || d.name === "SUN") return;

            let parentPos = new THREE.Vector3(0,0,0);
            let parentQuat = new THREE.Quaternion(); 

            if (b.isMoon) {
                const pBody = celestialBodies.find(x => x.data.name === d.parent);
                if (pBody) {
                    parentPos = pBody.globalPos.clone();
                    parentQuat = pBody.poleQuaternion.clone();
                    b.localPos.applyQuaternion(parentQuat);
                }
            }
            
            b.globalPos = b.localPos.add(parentPos);
            b.parentPos = parentPos;
            b.parentQuat = parentQuat;
        });
    }

    static zSortCelestialBodies(celestialBodies, cameraPos, currentOrigin) {
        celestialBodies.forEach(b => {
            if (!b.isCulled && b.data.name !== "SUN") {
                b.distToCamSq = cameraPos.distanceToSquared(b.globalPos.clone().sub(currentOrigin));
            }
        });

        celestialBodies.sort((a, b) => {
            const sizeA = a.data.radius_km || 0;
            const sizeB = b.data.radius_km || 0;
            if (sizeA !== sizeB) return sizeB - sizeA; 
            
            const distA = a.distToCamSq || 0;
            const distB = b.distToCamSq || 0;
            if (distA !== distB) return distA - distB;

            return a.data.name.localeCompare(b.data.name);
        });
    }
}