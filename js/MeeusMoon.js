// js/MeeusMoon.js
export class MeeusMoon {
    static getPosition(daysSinceJ2000) {
        const T = daysSinceJ2000 / 36525.0;

        const L_prime = 218.3164477 + 481267.88123421 * T;
        const D = 297.8501921 + 445267.1114034 * T;
        const M = 357.5291092 + 35999.0502909 * T;
        const M_prime = 134.9633964 + 477198.8675055 * T;
        const F = 93.2720950 + 483202.0175233 * T;

        const rad = Math.PI / 180.0;
        const D_r = D * rad; 
        const M_r = M * rad; 
        const Mp_r = M_prime * rad; 
        const F_r = F * rad;

        let sigma_L = 0.0;
        sigma_L += 6288774 * Math.sin(Mp_r);                     
        sigma_L += 1274027 * Math.sin(2 * D_r - Mp_r);           
        sigma_L += 658314 * Math.sin(2 * D_r);                   
        sigma_L += 213618 * Math.sin(2 * Mp_r);
        sigma_L -= 185116 * Math.sin(M_r);                       
        sigma_L -= 114332 * Math.sin(2 * F_r);                   
        sigma_L += 58793 * Math.sin(2 * D_r - 2 * Mp_r);
        sigma_L += 57066 * Math.sin(2 * D_r - M_r - Mp_r);
        sigma_L += 53322 * Math.sin(2 * D_r + Mp_r);
        sigma_L += 45758 * Math.sin(2 * D_r - M_r);
        sigma_L -= 40923 * Math.sin(Mp_r - M_r);
        sigma_L -= 34720 * Math.sin(D_r);
        sigma_L -= 30383 * Math.sin(M_r + Mp_r);
        sigma_L += 15327 * Math.sin(2 * D_r - 2 * F_r);
        sigma_L -= 12528 * Math.sin(Mp_r + 2 * F_r);

        let sigma_B = 0.0;
        sigma_B += 5128122 * Math.sin(F_r);                      
        sigma_B += 280602 * Math.sin(Mp_r + F_r);
        sigma_B += 277693 * Math.sin(Mp_r - F_r);
        sigma_B += 173237 * Math.sin(2 * D_r - F_r);
        sigma_B += 55413 * Math.sin(2 * D_r - Mp_r + F_r);
        sigma_B += 46271 * Math.sin(2 * D_r - Mp_r - F_r);
        sigma_B += 32573 * Math.sin(2 * D_r + Mp_r - F_r);
        sigma_B += 17198 * Math.sin(2 * D_r + F_r);
        sigma_B += 9266 * Math.sin(2 * D_r + Mp_r + F_r);
        sigma_B += 8822 * Math.sin(2 * Mp_r - F_r);

        let sigma_R = 0.0;
        sigma_R -= 20905 * Math.cos(Mp_r);
        sigma_R -= 3699 * Math.cos(2 * D_r - Mp_r);
        sigma_R -= 2955 * Math.cos(2 * D_r);
        sigma_R -= 569 * Math.cos(2 * Mp_r);
        sigma_R += 246 * Math.cos(2 * D_r - 2 * Mp_r);
        sigma_R -= 204 * Math.cos(M_r - Mp_r);
        sigma_R -= 170 * Math.cos(2 * D_r - M_r - Mp_r);

        const L_date = (L_prime + sigma_L / 1000000.0) * rad;
        const B = (sigma_B / 1000000.0) * rad;
        
        // --- PRECESSION CORRECTION ---
        // Subtract general precession to map Equinox of Date back to J2000
        const precession = (1.396971 * T + 0.0003086 * T * T) * rad;
        const L = L_date - precession;

        const R_km = 385000.56 + sigma_R;
        const R_au = R_km / 149597870.7;

        const ast_x = R_au * Math.cos(B) * Math.cos(L);
        const ast_y = R_au * Math.cos(B) * Math.sin(L);
        const ast_z = R_au * Math.sin(B);

        return { x: ast_x, y: ast_z, z: -ast_y };
    }
}