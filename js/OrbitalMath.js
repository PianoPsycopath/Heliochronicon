// js/OrbitalMath.js
class OrbitalMath {
    static getTacticalA(d, isMoon) {
        if (d.name === "SUN") return 0;
        if (isMoon && d.a > 1000) return d.a / 149597870.7; 
        return d.a;
    }

    static solveKepler(M, e) {
        let E = M;
        for (let i = 0; i < 10; i++) {
            E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        }
        return E;
    }

    static calcPosFromM(scaledA, e, i_deg, w_deg, Node_deg, M) {
        const E = this.solveKepler(M, e);
        const xv = scaledA * (Math.cos(E) - e);
        const yv = scaledA * (Math.sqrt(1 - e * e) * Math.sin(E));
        
        // True Astronomical Ecliptic Coordinates
        const ast_x = (Math.cos(w_deg)*Math.cos(Node_deg) - Math.sin(w_deg)*Math.sin(Node_deg)*Math.cos(i_deg)) * xv + (-Math.sin(w_deg)*Math.cos(Node_deg) - Math.cos(w_deg)*Math.sin(Node_deg)*Math.cos(i_deg)) * yv;
        const ast_y = (Math.cos(w_deg)*Math.sin(Node_deg) + Math.sin(w_deg)*Math.cos(Node_deg)*Math.cos(i_deg)) * xv + (-Math.sin(w_deg)*Math.sin(Node_deg) + Math.cos(w_deg)*Math.cos(Node_deg)*Math.cos(i_deg)) * yv;
        const ast_z = (Math.sin(w_deg)*Math.sin(i_deg)) * xv + (Math.cos(w_deg)*Math.sin(i_deg)) * yv;
        
        //Right-Handed System
        return new THREE.Vector3(ast_x, ast_z, -ast_y);
    }
}