
// Turvallinen kaavion näyttö -nappi: kutsuu showChart jos olemassa
function showChartFallback() {
    if (window.showChart && typeof window.showChart === 'function') {
        try { window.showChart(); } catch (e) { alert('Kaavion avaaminen epäonnistui: ' + e.message); }
    } else {
        alert('Kaavion näyttö ei ole vielä käytettävissä.');
    }
}
let projects = JSON.parse(localStorage.getItem('iv_projects')) || [];

let activeProjectId = null;

let editingValveIndex = null;

let returnToVisual = false;

let preSelectedDuctId = null;

let currentPhotoData = null;

let editingMachineIndex = null;

let editingDuctId = null;

let currentMode = 'home';
let activeApartmentId = null; // For per-apartment AHU viewing

let signaturePad = null; // Canvas context



projects.forEach(p => {

if (!p.machines) p.machines = []; if (!p.ducts) p.ducts = []; if (!p.valves) p.valves = [];

if (!p.meta) p.meta = {};

if (!p.modes) { p.modes = { home: { machines: JSON.parse(JSON.stringify(p.machines)), valves: JSON.parse(JSON.stringify(p.valves)) }, away: { machines: [], valves: [] }, boost: { machines: [], valves: [] } }; }

});

// Yleinen ID-generaattori
function genId(){
    return Math.floor(Date.now() + Math.random()*100000);
}
// --- APUFUNKTIO: Venttiilin nimen siistiminen (esim. h_kso125 -> KSO-125) ---
function formatValveDisplay(type) {
    if (!type) return "-";
    if (type === 'PITOT') return "Pitot";
    
    // Poistetaan valmistajan etuliite (h_, c_, l_, f_ jne.)
    let clean = type.replace(/^[a-z]+_/, ''); 
    
    // Muutetaan isoiksi kirjaimiksi
    clean = clean.toUpperCase();
    
    // Lisätään viiva kirjainten ja numeroiden väliin (esim. KSO125 -> KSO-125)
    if (!clean.match(/[- ]/) && clean.match(/[A-Z]/) && clean.match(/[0-9]/)) {
        clean = clean.replace(/([A-Z]+)([0-9]+)/, '$1-$2');
    }
    
    return clean;
}
function returnToKerrostalo(){
    activeApartmentId = null;
    renderVisualContent();
}
// --- UUSI: PROJEKTIN NIMEN MUOKKAUS ---
function renameActiveProject() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    const newName = prompt("Anna projektille uusi nimi:", p.name);
    if (newName && newName.trim() !== "") {
        p.name = newName.trim();
        saveData();
        renderDetailsList(); // Päivittää näkymän
    }
}
// Demo: Tulo/Poisto kerrostalo, luo raput, kerrokset, asunnot, kanavat, venttiilit ja AHU:t
function createDemoTuloPoisto(){
    const proj = {
        id: genId(),
        name: 'Demo: Kerrostalo (KTS/KSO)',
        systemType: 'kerrostalo',
        ducts: [],
        valves: [],
        machines: [],
        meta: { floorMap: {}, aptsPerFloor: 3 }
    };
    
    const letters = ['A','B'];
    const floors = [1,2];
    
    const rnd = (target)=> Number((target + (Math.random()*4.0 - 2.0)).toFixed(1)); 
    const rposT = ()=> Math.round(3 + Math.random()*5); // Tulo 3-8
    const rposP = ()=> Math.round(-5 + Math.random()*10); // Poisto -5 ... 5
    const rpa = ()=> Number((30 + Math.random()*40).toFixed(0));

    letters.forEach(L=>{
        floors.forEach(floor=>{
            for(let i=1;i<=proj.meta.aptsPerFloor;i++){
                const aptCode = `${L}${floor}0${i}`; 
                proj.meta.floorMap[aptCode] = floor;
                
                const supPct = 50; 
                const extPct = 50;
                proj.machines.push({ id: genId(), type:'ahu', group:'apt', apartment:aptCode, name:`AHU ${aptCode}` , supPct, extPct });
                
                const supplyId = genId();
                const extractId = genId();
                proj.ducts.push({ id: supplyId, type:'supply', group:'apt', apartment:aptCode, name:`Tulo ${aptCode}` });
                proj.ducts.push({ id: extractId, type:'extract', group:'apt', apartment:aptCode, name:`Poisto ${aptCode}` });
                
                // TULO: KTS-125
                proj.valves.push({ id: genId(), parentDuctId: supplyId, type:'h_kts125', apartment:aptCode, name:'Tulo', room:'Olohuone', targetFlow: 15.0, flow: rnd(15.0), pos: rposT(), measuredP: rpa() });
                proj.valves.push({ id: genId(), parentDuctId: supplyId, type:'h_kts125', apartment:aptCode, name:'Tulo', room:'Makuuhuone', targetFlow: 12.0, flow: rnd(12.0), pos: rposT(), measuredP: rpa() });
                
                // POISTO: KSO-125
                proj.valves.push({ id: genId(), parentDuctId: extractId, type:'h_kso125', apartment:aptCode, name:'Poisto', room:'WC', targetFlow: 10.0, flow: rnd(10.0), pos: rposP(), measuredP: rpa() });
                proj.valves.push({ id: genId(), parentDuctId: extractId, type:'h_kso125', apartment:aptCode, name:'Poisto', room:'KPH', targetFlow: 15.0, flow: rnd(15.0), pos: rposP(), measuredP: rpa() });
                proj.valves.push({ id: genId(), parentDuctId: extractId, type:'h_kso125', apartment:aptCode, name:'Poisto', room:'Keittiö', targetFlow: 10.0, flow: rnd(10.0), pos: rposP(), measuredP: rpa() });
            }
        });
        // Runkokanava
        proj.ducts.push({ id: genId(), type:'extract', group:'roof', name:`${L}-Rappu Poisto` });
    });
    
    projects.push(proj);
    activeProjectId = proj.id;
    saveData();
    currentMode = 'visual';
    window._aptRappuFilter = null;
    
    // Siirry suoraan visualisointiin
    if (typeof showVisual === 'function') {
        showVisual();
    } else {
        renderVisualContent();
        showView('view-visual');
    }
}

// Poista yksittäinen asunto (kerrostalo): poistaa sen apt-ductit, koneen ja siihen liittyvät venttiilit, sekä floorMap-merkinnän
function deleteApartment(aptCode){
    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
    if(!confirm(`Poistetaanko asunto ${aptCode}?`)) return;
    const aptDuctIds = (p.ducts||[]).filter(d=> d.group==='apt' && d.apartment===aptCode).map(d=>d.id);
    p.valves = (p.valves||[]).filter(v=> !aptDuctIds.includes(v.parentDuctId));
    p.ducts = (p.ducts||[]).filter(d=> !(d.group==='apt' && d.apartment===aptCode));
    p.machines = (p.machines||[]).filter(m=> !(m.type==='ahu' && m.apartment===aptCode));
    if(p.meta && p.meta.floorMap){ delete p.meta.floorMap[aptCode]; }
    saveData(); renderVisualContent();
}

    // Poista koko rappu kerrostalo-näkymässä (poistaa kaikki asunnot ko. kirjaimella)
    function deleteKerrostaloRappu(letter) {
        const p = projects.find(x => x.id === activeProjectId); if(!p) return;
        const l = String(letter).toUpperCase();
        if (!confirm(`Poistetaanko koko rappu ${l}? Kaikki tämän rapun asunnot poistetaan.`)) return;
        const floorMap = (p.meta && p.meta.floorMap) ? p.meta.floorMap : {};
        const apts = Object.keys(floorMap);
        const toDeleteAptCodes = apts.filter(a=> a.toUpperCase().startsWith(l));
        // Poista venttiilit, kanavat ja koneet ko. asunnoilta
        const aptDuctIds = (p.ducts||[])
            .filter(d=> d.group==='apt' && toDeleteAptCodes.includes(String(d.apartment)))
            .map(d=> d.id);
        p.valves = (p.valves||[]).filter(v=> !aptDuctIds.includes(v.parentDuctId));
        p.ducts = (p.ducts||[]).filter(d=> !(d.group==='apt' && toDeleteAptCodes.includes(String(d.apartment))));
        p.machines = (p.machines||[]).filter(m=> !(m.type==='ahu' && toDeleteAptCodes.includes(String(m.apartment))));
        // Poista avaimet floorMapista
        toDeleteAptCodes.forEach(k=>{ delete floorMap[k]; });
        saveData();
        renderVisualContent();
    }

    // Nimeä rappu (vaihda kirjainta), päivittää kaikki avaimet ja komponenttien apartment-kentän
    function renameKerrostaloRappu(oldLetter) {
        const p = projects.find(x => x.id === activeProjectId); if(!p) return;
        const oldL = String(oldLetter).toUpperCase();
        const newL = prompt(`Uusi rapun kirjain (nykyinen ${oldL})`, oldL);
        if (!newL) return;
        const targetL = String(newL).toUpperCase();
        if (targetL===oldL) return;
        const floorMap = (p.meta && p.meta.floorMap) ? p.meta.floorMap : {};
        const existing = Object.keys(floorMap).some(k=>k.startsWith(targetL+':'));
        if (existing && !confirm(`Rappu ${targetL} on jo olemassa. Jatketaanko ja yhdistetään asunnot samaan rappuun?`)) return;
        // päivitä floorMap-avaimet
        const updatedFloorMap = {};
        Object.entries(floorMap).forEach(([key, aptId])=>{
            const [aptCode, floorStr] = key.split(':');
            if (aptCode.toUpperCase()===oldL) {
                const newKey = `${targetL}:${floorStr}`;
                updatedFloorMap[newKey] = aptId;
            } else {
                updatedFloorMap[key] = aptId;
            }
        });
        if (!p.meta) p.meta = {};
        p.meta.floorMap = updatedFloorMap;
        // päivitä komponenttien apartment-kenttä
        (p.ducts||[]).forEach(d=>{
            if (d.group==='apt' && String(d.apartment||'').toUpperCase()===oldL) d.apartment = targetL;
        });
        (p.machines||[]).forEach(m=>{
            if (m.type==='ahu' && String(m.apartment||'').toUpperCase()===oldL) m.apartment = targetL;
        });
        saveData();
        window._aptRappuFilter = targetL;
        renderVisualContent();
    }

// Poista rappu (huippuimuri): poistaa rungon sekä siihen liitetyt venttiilit
function deleteRappu(ductId){
    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
    const duct = (p.ducts||[]).find(d=> d.id===ductId);
    if(!duct) return;
    if(!confirm(`Poistetaanko rappu/runkokanava '${duct.name||''}'?`)) return;
    p.valves = (p.valves||[]).filter(v=> v.parentDuctId !== ductId);
    p.ducts = (p.ducts||[]).filter(d=> d.id !== ductId);
    saveData(); renderVisualContent();
}


// --- TÄYDELLINEN VENTTIILIDATA (V60: Ultimate Database) ---

// Nimeämiskäytäntö: "Valmistaja Malli Koko" (automaattinen ryhmittely)

const valveDB = {

// --- HALTON ---

'h_kso100': { name: 'Halton KSO 100', data: [[-15,0.5],[-10,1.0],[-5,1.5],[0,2.0],[5,2.5],[10,3.0]] },

'h_kso125': { name: 'Halton KSO 125', data: [[-15,0.9],[-10,1.4],[-5,2.1],[0,2.8],[5,3.5],[10,4.2]] },

'h_kso160': { name: 'Halton KSO 160', data: [[-10,2.0],[-5,2.9],[0,3.8],[5,4.8],[10,5.9]] },

'h_kso200': { name: 'Halton KSO 200', data: [[0,6.0],[5,7.3],[10,8.7],[15,10.2],[20,11.7]] },


'h_kts100': { name: 'Halton KTS 100', data: [[2,0.9],[4,1.5],[6,2.1],[8,2.7],[10,3.3],[12,3.9]] },

'h_kts125': { name: 'Halton KTS 125', data: [[2,1.0],[4,1.8],[6,2.6],[8,3.4],[10,4.2],[12,5.0]] },

'h_kts160': { name: 'Halton KTS 160', data: [[4,2.2],[6,3.2],[8,4.3],[10,5.3],[12,6.3]] },



'h_urh100': { name: 'Halton URH 100', data: [[-15,1.0],[-10,1.5],[-5,2.1],[0,2.7],[5,3.2],[10,3.7]] },

'h_urh125': { name: 'Halton URH 125', data: [[-15,1.4],[-10,2.0],[-5,2.8],[0,3.5],[5,4.3],[10,5.0]] },

'h_urh160': { name: 'Halton URH 160', data: [[-10,2.5],[-5,3.5],[0,4.5],[5,5.5],[10,6.5]] },

'h_urh200': { name: 'Halton URH 200', data: [[-5,4.0],[0,5.5],[5,6.8],[10,8.2],[15,9.6]] },



'h_ura100': { name: 'Halton URA 100', data: [[-10,1.2],[-5,1.8],[0,2.5],[5,3.1],[10,3.8]] },

'h_ura125': { name: 'Halton URA 125', data: [[-10,1.5],[-5,2.3],[0,3.1],[5,4.0],[10,4.9]] },



'h_tla100': { name: 'Halton TLA 100', data: [[2,1.0],[4,1.7],[6,2.4],[8,3.1],[10,3.8],[12,4.5]] },

'h_tla125': { name: 'Halton TLA 125', data: [[2,1.1],[4,2.0],[6,2.9],[8,3.8],[10,4.7],[12,5.6]] },

'h_tla160': { name: 'Halton TLA 160', data: [[2,1.5],[4,2.5],[6,3.5],[8,4.6],[10,5.7]] },



'h_tld100': { name: 'Halton TLD 100', data: [[2,1.0],[4,1.8],[6,2.6],[8,3.3],[10,4.1]] },

'h_tld125': { name: 'Halton TLD 125', data: [[2,1.1],[4,2.0],[6,2.9],[8,3.9],[10,4.8]] },


'h_ula100': { name: 'Halton ULA 100', data: [[-15,0.7],[-10,1.1],[-5,1.6],[0,2.1],[5,2.6],[10,3.1]] },

'h_ula125': { name: 'Halton ULA 125', data: [[-15,0.8],[-10,1.4],[-5,2.0],[0,2.6],[5,3.2],[10,3.8]] },

'h_ula160': { name: 'Halton ULA 160', data: [[-15,1.5],[-10,2.1],[-5,3.0],[0,4.0],[5,5.2]] },



'h_uko100': { name: 'Halton UKO 100', data: [[2,0.7],[4,1.3],[6,2.0],[8,2.8],[10,3.5]] },

'h_uko125': { name: 'Halton UKO 125', data: [[2,0.9],[4,1.8],[6,2.8],[8,3.9],[10,5.0]] },

'h_uko160': { name: 'Halton UKO 160', data: [[2,1.5],[4,2.5],[6,3.5],[8,4.5],[10,5.5]] },



'h_ksp100': { name: 'Halton KSP (Sauna) 100', data: [[2,0.8],[4,1.5],[6,2.3],[9,3.3]] },



// --- FLÄKT WOODS / ABB FLÄKT ---

'f_kso100': { name: 'Fläkt KSO 100', data: [[-15,0.5],[-10,1.0],[-5,1.4],[0,1.9],[5,2.3],[10,2.8]] },

'f_kso125': { name: 'Fläkt KSO 125', data: [[-10,1.5],[-5,2.1],[0,2.7],[5,3.3],[10,4.0]] },

'f_kso160': { name: 'Fläkt KSO 160', data: [[-10,2.0],[-5,2.9],[0,3.8],[5,4.7],[10,5.7]] },

'f_kso200': { name: 'Fläkt KSO 200', data: [[-5,3.5],[0,5.0],[5,6.5],[10,8.0],[15,9.5]] },



'f_kts100': { name: 'Fläkt KTS 100', data: [[2,0.7],[4,1.2],[6,1.7],[8,2.3],[10,2.8],[12,3.4]] },

'f_kts125': { name: 'Fläkt KTS 125', data: [[2,0.7],[4,1.5],[6,2.2],[8,2.9],[10,3.7],[12,4.5]] },


'f_ksos100': { name: 'Fläkt KSOS 100', data: [[-5,0.6],[0,1.0],[5,1.4],[10,1.8],[15,2.3]] },

'f_ksos125': { name: 'Fläkt KSOS 125', data: [[-5,1.1],[0,1.7],[5,2.3],[10,2.8],[15,3.4]] },



'f_kgeb100': { name: 'Fläkt KGEB 100', data: [[-10,1.0],[-5,1.5],[0,2.1],[5,2.7],[10,3.3]] },

'f_kgeb125': { name: 'Fläkt KGEB 125', data: [[-10,1.4],[-5,2.1],[0,2.9],[5,3.7],[10,4.5]] },

'f_kgeb160': { name: 'Fläkt KGEB 160', data: [[-10,2.0],[-5,3.0],[0,4.0],[5,5.2],[10,6.5]] },



'f_et100': { name: 'Fläkt E-T 100', data: [[2,0.8],[4,1.4],[6,2.0],[8,2.8]] },

'f_et125': { name: 'Fläkt E-T 125', data: [[2,1.0],[4,1.8],[6,2.6],[8,3.6]] },



'f_rk100': { name: 'Fläkt RK 100', data: [[1,0.5],[2,0.9],[3,1.3],[4,1.7],[5,2.1],[6,2.6]] },

'f_rk125': { name: 'Fläkt RK 125', data: [[1,0.7],[2,1.3],[3,2.0],[4,2.7],[5,3.4],[6,4.1]] },



// --- LINDAB ---

'l_ksu100': { name: 'Lindab KSU 100', data: [[-15,0.5],[-10,0.9],[-5,1.4],[0,1.9],[5,2.4]] },

'l_ksu125': { name: 'Lindab KSU 125', data: [[-10,1.4],[-5,2.0],[0,2.6],[5,3.2]] },

'l_ksu160': { name: 'Lindab KSU 160', data: [[-10,2.2],[-5,3.0],[0,3.8],[5,4.8],[10,6.0]] },



'l_ki100': { name: 'Lindab KI 100', data: [[2,0.6],[4,1.2],[6,1.8],[8,2.4],[10,3.0]] },

'l_ki125': { name: 'Lindab KI 125', data: [[2,0.7],[4,1.5],[6,2.3],[8,3.1],[10,3.9]] },


'l_kpf100': { name: 'Lindab KPF 100', data: [[0,1.5],[3,1.7],[6,2.0],[9,2.5]] },

'l_kpf125': { name: 'Lindab KPF 125', data: [[0,2.2],[3,2.6],[6,3.0],[9,3.5]] },



// --- CLIMECON ---

'c_rino100': { name: 'Climecon RINO 100', data: [[2,0.8],[4,1.5],[6,2.2],[8,2.9]] },

'c_rino125': { name: 'Climecon RINO 125', data: [[2,1.0],[4,1.8],[6,2.6],[8,3.5]] },


'c_dinoa': { name: 'Climecon DINO-A 125', data: [[1,0.8],[2,1.6],[3,2.5],[4,3.4],[5,4.5]] }, // Yleismalli

'c_dinot': { name: 'Climecon DINO-T 125', data: [[1,0.7],[2,1.5],[3,2.4],[4,3.5],[5,4.7]] },



'c_vip100': { name: 'Climecon VIP 100', data: [[-15,0.6],[-10,1.2],[-5,1.9],[0,2.7],[5,3.5]] },

'c_vip125': { name: 'Climecon VIP 125', data: [[-15,0.9],[-10,1.5],[-5,2.2],[0,3.0],[5,3.8]] },



'c_elo100': { name: 'Climecon ELO 100', data: [[-10,1.1],[-5,1.7],[0,2.4],[5,3.1]] },

'c_elo125': { name: 'Climecon ELO 125', data: [[-10,1.5],[-5,2.1],[0,2.8],[5,3.6]] },



'c_clik100': { name: 'Climecon CLIK 100', data: [[2,0.8],[4,1.6],[6,2.5],[8,3.4]] },

'c_clik125': { name: 'Climecon CLIK 125', data: [[2,1.0],[4,1.9],[6,2.9],[8,4.0]] },



'c_eco1': { name: 'Climecon ECO-1 125', data: [[1,0.5],[2,1.0],[3,1.6]] },



// --- EH-MUOVI ---

'eh_30_100': { name: 'EH-30 100', data: [[1,0.4],[3,1.2],[5,2.0],[10,3.8]] },

'eh_100': { name: 'EH-100 100', data: [[3,1.0],[6,2.1],[9,3.2],[12,4.3]] },

'eh_125': { name: 'EHUS 125', data: [[3,1.8],[4,2.5],[5,3.2],[10,5.0]] },

'eh_160': { name: 'EHUS 160', data: [[3,2.5],[4,3.5],[5,4.5],[10,7.5]] },



// --- FINCOIL (HISTORICAL) ---

'fin_vta100': { name: 'Fincoil VTA 100', data: [[2,0.8],[4,1.5],[6,2.3],[8,3.0]] },

'fin_vta125': { name: 'Fincoil VTA 125', data: [[2,1.0],[4,1.8],[6,2.7],[8,3.6]] },

'fin_vta160': { name: 'Fincoil VTA 160', data: [[4,2.5],[6,3.5],[8,4.6],[10,5.8]] },

'fin_vs100': { name: 'Fincoil VS 100', data: [[-10,1.2],[-5,1.8],[0,2.4],[5,3.0]] },

'fin_vs125': { name: 'Fincoil VS 125', data: [[-10,1.6],[-5,2.3],[0,3.1],[5,3.9]] },

'fin_vk100': { name: 'Fincoil VK 100', data: [[-10,1.1],[-5,1.7],[0,2.3],[5,2.9]] },

'fin_vk125': { name: 'Fincoil VK 125', data: [[-10,1.5],[-5,2.2],[0,3.0],[5,3.8]] },



// --- LAPINLEIMU (HISTORICAL) ---

'll_kilsa100': { name: 'Lapinleimu Kilsa 100', data: [[-5,0.5],[0,1.0],[5,1.5],[10,2.0]] },

'll_kilsa125': { name: 'Lapinleimu Kilsa 125', data: [[-5,0.8],[0,1.5],[5,2.2],[10,3.0]] },

'll_oso100': { name: 'Lapinleimu OSO 100', data: [[-12,0.8],[-9,1.1],[-6,1.4],[-3,1.7],[0,2.0],[6,2.6]] },

'll_oso125': { name: 'Lapinleimu OSO 125', data: [[-12,1.2],[-9,1.6],[-6,2.0],[-3,2.4],[0,2.8],[6,3.6]] },

'll_otp100': { name: 'Lapinleimu OTP 100', data: [[3,1.0],[6,1.9],[9,2.8],[12,3.7]] },

'll_otp125': { name: 'Lapinleimu OTP 125', data: [[3,1.2],[6,2.3],[9,3.4],[12,4.5]] },



// --- RCL / RC-LINJA ---

'rcl_oki100': { name: 'RCL OKI 100', data: [[2,0.8],[4,1.4],[6,2.1],[8,2.8],[10,3.6]] },

'rcl_oki125': { name: 'RCL OKI 125', data: [[2,0.9],[4,1.7],[6,2.6],[8,3.6],[10,4.6]] },

'rcl_elo100': { name: 'RCL ELO 100', data: [[-15,0.6],[-10,1.1],[-5,1.6],[0,2.2],[5,2.8]] },

'rcl_elo125': { name: 'RCL ELO 125', data: [[-15,1.0],[-10,1.6],[-5,2.3],[0,3.0],[5,3.7]] },



// --- SWEGON ---

's_colibri_w': { name: 'Swegon COLIBRI Wall 125', data: [[2,0.8],[4,1.5],[6,2.3],[8,3.1]] },

's_colibri_c': { name: 'Swegon COLIBRI Ceiling 125', data: [[2,1.1],[4,2.1],[6,3.2],[8,4.3]] },

's_eagle_w': { name: 'Swegon EAGLE Wall 125', data: [[2,0.9],[4,1.7],[6,2.6],[8,3.5]] },

's_eagle_c': { name: 'Swegon EAGLE Ceiling 125', data: [[2,1.2],[4,2.3],[6,3.5],[8,4.8]] },



// --- HEATCO ---

'heat_hti100': { name: 'Heatco HTI 100', data: [[2,0.92],[4,1.63],[6,2.34],[9,3.40],[12,4.45]] },

'heat_hti125': { name: 'Heatco HTI 125', data: [[2,1.02],[4,1.92],[6,2.81],[9,4.16],[12,5.50]] },

'heat_hpi100': { name: 'Heatco HPI 100', data: [[-12,0.90],[-6,1.60],[0,2.35],[6,3.10]] },

'heat_hpi125': { name: 'Heatco HPI 125', data: [[-12,1.10],[-6,1.85],[0,2.60],[6,3.40]] },



// --- SÄÄTÖPELLIT (IRIS & SPM & DRU) ---

'iris80': { name: 'IRIS-Pelti 80', data: [[1,6.1],[2,4.1],[3,3.2],[4,2.3],[5,1.4],[6,0.9],[7,0.6]] },

'iris100': { name: 'IRIS-Pelti 100', data: [[1,1.9],[1.5,2.4],[2,3.2],[2.5,4.0],[3,4.8],[3.5,6.1],[4,7.5],[4.5,9.2],[5,11.0],[5.5,13.3],[6,16.0],[6.5,19.5],[7,24.0],[7.5,28.0],[8,33.0]] },

'iris125': { name: 'IRIS-Pelti 125', data: [[1,2.5],[1.5,3.3],[2,4.2],[2.5,5.5],[3,7.0],[3.5,9.0],[4,11.5],[4.5,13.8],[5,16.5],[5.5,19.8],[6,23.5],[6.5,28.0],[7,33.5],[7.5,40.5],[8,49.0]] },

'iris160': { name: 'IRIS-Pelti 160', data: [[1,3.6],[1.5,4.9],[2,6.5],[2.5,8.5],[3,11.0],[3.5,14.0],[4,17.5],[4.5,21.0],[5,25.5],[5.5,30.5],[6,36.5],[6.5,43.0],[7,51.0],[7.5,62.0],[8,75.0]] },

'iris200': { name: 'IRIS-Pelti 200', data: [[1,7.3],[1.5,9.8],[2,12.5],[2.5,15.1],[3,18.0],[3.5,21.8],[4,26.0],[4.5,30.8],[5,36.5],[5.5,42.5],[6,50.0],[6.5,58.0],[7,68.0],[7.5,77.5],[8,89.0]] },

'iris250': { name: 'IRIS-Pelti 250', data: [[1,11.5],[2,20.5],[3,29.5],[4,41.5],[5,59.5],[6,84.5],[7,118.0],[8,160.0]] },

'iris315': { name: 'IRIS-Pelti 315', data: [[1,19.0],[2,33.0],[3,47.0],[4,63.5],[5,87.0],[6,116.0],[7,160.0],[8,215.0]] },

'iris400': { name: 'IRIS-Pelti 400', data: [[1,30.0],[2,52.0],[3,76.0],[4,103.0],[5,137.0],[6,182.0],[7,252.0],[8,330.0]] },

'iris500': { name: 'IRIS-Pelti 500', data: [[1,32.0],[2,63.0],[3,95.0],[4,135.0],[5,190.0],[6,260.0],[7,370.0],[8,520.0]] },

'iris630': { name: 'IRIS-Pelti 630', data: [[1,50.0],[2,95.0],[3,145.0],[4,210.0],[5,285.0],[6,385.0],[7,525.0],[8,735.0]] },

'iris800': { name: 'IRIS-Pelti 800', data: [[1,85.0],[2,150.0],[3,225.0],[4,310.0],[5,430.0],[6,590.0],[7,850.0],[8,1180.0]] },


'spm160': { name: 'SPM Mittauspelti 160', data: [[1,3.5],[2,6.1],[3,10.2],[4,16.8],[5,24.0],[6,35.0],[7,49.0],[8,72.0]] },

'spm200': { name: 'SPM Mittauspelti 200', data: [[1,7.0],[2,12.0],[3,17.5],[4,25.5],[5,36.0],[6,49.0],[7,66.0],[8,87.0]] },



'dru100': { name: 'Lindab DRU 100', data: [[1,2.0],[2,4.0],[3,7.0],[4,11.0],[5,16.0]] },

'dru125': { name: 'Lindab DRU 125', data: [[1,2.5],[2,5.0],[3,8.5],[4,13.0],[5,19.0]] },

'dru160': { name: 'Lindab DRU 160', data: [[1,3.5],[2,6.5],[3,11.0],[4,17.0],[5,26.0]] },

};



// --- NEW LOGIC FOR SPLIT SELECTION ---

let valveGroups = {}; // Stores { "Halton KSO": [{size:100, id:'kso100'}, ...] }

let valveIdToModelId = {}; // Stores { 'kso100': 'Halton KSO' }



function initValveSelectors() {
    valveGroups = {};
    valveIdToModelId = {};

    // Group by name pattern
    for (let key in valveDB) {
        let name = valveDB[key].name;
        // Simple regex to split Name and Size (digits at end)
        let match = name.match(/^(.*?)[\s-]*(\d+)(.*)$/);

        let modelName = name;
        let size = "-";

        if (match) {
            modelName = match[1].trim(); // "Halton KSO"
            size = match[2] + match[3]; // "100" or "100h"
            if(modelName.endsWith("-")) modelName = modelName.slice(0,-1);
        }

        if (!valveGroups[modelName]) valveGroups[modelName] = [];
        valveGroups[modelName].push({ id: key, size: size, sortSize: parseInt(match ? match[2] : 0) });
        valveIdToModelId[key] = modelName;
    }

    // Populate Model Select
    const modelSelect = document.getElementById('valveModelSelect');
    // LISÄTTY: Pitot-vaihtoehto listan alkuun
    modelSelect.innerHTML = '<option value="">-- Valitse Malli --</option><option value="PITOT">Suora mittaus (Pitot/Muu)</option>';

    let sortedModels = Object.keys(valveGroups).sort();
    sortedModels.forEach(model => {
        modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
    });
}


// --- UUSI LOGIIKKA (LIVE TAULUKKO & ARVO) ---



function updateSizeSelect() {
    const model = document.getElementById('valveModelSelect').value;
    const sizeSelect = document.getElementById('valveSizeSelect');
    const pressureInput = document.getElementById('measuredP');
    const flowInput = document.getElementById('measuredFlow');
    const table = document.getElementById('valveReferenceTable');
    
    // Tyhjennä kokovalikko oletuksena
    sizeSelect.innerHTML = '<option value="">-- Koko --</option>';

    // LOGIIKKA: Suora mittaus (Pitot)
    if (model === 'PITOT') {
        // 1. Lukitse/Piilota turhat
        if(pressureInput) { pressureInput.value = ""; pressureInput.disabled = true; pressureInput.placeholder = "(Ei painetta)"; }
        if(table) table.style.display = 'none';
        
        // 2. Avaa virtauskenttä manuaaliselle syötölle
        if(flowInput) { 
            flowInput.disabled = false; 
            flowInput.readOnly = false; // Varmista ettei ole read-only
            flowInput.placeholder = "Syötä l/s";
            flowInput.focus();
        }
        
        // 3. Aseta tyyppi piilokenttään
        document.getElementById('valveType').value = 'PITOT';
        
        // 4. Lisää dummy-koko (jotta valinta on validi)
        sizeSelect.innerHTML += '<option value="PITOT" selected>-</option>';
        
        return; // Lopeta tähän
    }

    // LOGIIKKA: Normaali venttiili
    // Palauta kentät normaaleiksi
    if(pressureInput) { pressureInput.disabled = false; pressureInput.placeholder = ""; }
    if(flowInput) { flowInput.readOnly = true; flowInput.placeholder = "Laskettu l/s"; } // Lukitaan, koska se on laskentatulos

    if (model && valveGroups[model]) {
        let sizes = valveGroups[model].sort((a,b) => a.sortSize - b.sortSize);
        sizes.forEach(item => {
            sizeSelect.innerHTML += `<option value="${item.id}">${item.size}</option>`;
        });

        // Valitaan automaattisesti ensimmäinen
        if (sizes.length > 0) {
            sizeSelect.value = sizes[0].id;
            document.getElementById('valveType').value = sizes[0].id;
        }

        // Näytetään taulukko ja päivitetään arvo
        renderValveReference(model);
        updateLiveK();
    } else {
        if(table) table.style.display = 'none';
        document.getElementById('liveKValue').innerText = "";
    }
}


function finalizeValveSelection() {

const val = document.getElementById('valveSizeSelect').value;

document.getElementById('valveType').value = val;

updateLiveK();

}



function updateLiveK() {

const type = document.getElementById('valveType').value;

const posStr = document.getElementById('currentPos').value;

const display = document.getElementById('liveKValue');


if (!valveDB[type]) {

display.innerText = "";

return;

}



if (posStr === "") {

display.innerHTML = `<span style="color:#888; font-size:12px;">(Valittu: ${valveDB[type].name})</span>`;

return;

}



const pos = parseFloat(posStr);

const k = (typeof getK === 'function') ? getK(type, pos) : defaultGetK(type, pos);

display.innerHTML = `K-arvo: <span style="font-size:22px; color:#0066cc; font-weight:bold;">${k.toFixed(2)}</span>`;

}



function renderValveReference(model) {

const container = document.getElementById('valveReferenceTable');

if (!model || !valveGroups[model]) {

container.style.display = 'none';

return;

}



let html = `<strong>${model} - K-kertoimet</strong><br>`;

const sortedSizes = valveGroups[model].sort((a,b) => a.sortSize - b.sortSize);



sortedSizes.forEach(item => {

const dbEntry = valveDB[item.id];

if (dbEntry && dbEntry.data) {

const valString = dbEntry.data.map(d =>

`<span style="white-space:nowrap; margin-right:6px;"><b>${d[0]}</b>=${d[1]}</span>`

).join(' ');

html += `<div style="margin-top:4px; border-bottom:1px solid #e0e0aa; padding-bottom:2px;">

<span style="color:#0066cc; font-weight:bold;">Ø${item.size}:</span> ${valString}

</div>`;

}

});



container.innerHTML = html;

container.style.display = 'block';

}

// Hook into existing code

// Need to run init once

setTimeout(initValveSelectors, 500);



// --- NAVIGAATIO ---

// --- NAVIGAATIO (KORJATTU: POISTETTU calcSFP) ---
function showView(viewId) {
    // 1. Vaihdetaan näkymä
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    
    // 2. Takaisin-napin logiikka
    const backBtn = document.getElementById('backBtn');
    if (viewId === 'view-projects') { 
        backBtn.style.display = 'none'; 
        renderProjects(); 
    } else {
        backBtn.style.display = 'block';
        if (viewId === 'view-visual') backBtn.onclick = () => showView('view-details');
        else if (['view-measure','view-settings','view-report','view-add-duct','view-add-machine'].includes(viewId)) {
             backBtn.onclick = () => showView('view-details');
        } else {
             backBtn.onclick = () => showView('view-projects');
        }
    }
    
    // 3. Päivitetään sisältö tarvittaessa
    if (viewId === 'view-details') {
        renderDetailsList(); // Tämä hoitaa nyt kaiken laskennan (myös SFP)
    }
    
    if (viewId === 'view-report') {
        initSignaturePad();
    }
}

function showVisual() {
    const p = projects && projects.find ? projects.find(x => x.id === activeProjectId) : null;
    if (!p) { showView('view-projects'); return; }

    // Moodilogiikka: roof -> vain pysty; hybrid -> molemmat; ahu -> vaaka
    const btns = document.getElementById('visModeButtons');
    const sys = p.systemType || 'roof';
    if (sys === 'roof') {
        window.activeVisMode = 'vertical';
        if (btns) btns.innerHTML = `<button class="btn btn-secondary" style="margin:0; padding:5px 10px; font-size:12px;" onclick="setVisualMode('vertical')">🏢 Pysty</button>`;
    } else if (sys === 'hybrid') {
        window.activeVisMode = window.activeVisMode || 'vertical';
        if (btns) btns.innerHTML = `
            <button class="btn btn-secondary" style="margin:0; padding:5px 10px; font-size:12px;" onclick="setVisualMode('vertical')">🏢 Pysty</button>
            <button class="btn btn-secondary" style="margin:0; padding:5px 10px; font-size:12px;" onclick="setVisualMode('horizontal')">🏠 Vaaka</button>`;
    } else if (sys === 'kerrostalo') {
        window.activeVisMode = 'vertical';
        if (btns) btns.innerHTML = `<button class="btn btn-secondary" style="margin:0; padding:5px 10px; font-size:12px;" onclick="setVisualMode('vertical')">🏢 Kerrostalo</button>`;
    } else {
        window.activeVisMode = 'horizontal';
        if (btns) btns.innerHTML = `<button class="btn btn-secondary" style="margin:0; padding:5px 10px; font-size:12px;" onclick="setVisualMode('horizontal')">🏠 Vaaka</button>`;
    }

    renderVisualContent();
    showView('view-visual');

    // Automaattinen suhteellisen säädön paneeli
    const adjustPanel = document.getElementById('relativeAdjustPanel');
    if (adjustPanel) {
        if (p.valves && p.valves.length > 0) {
            const suggestions = suggestValveAdjustments(p, p.ducts, p.valves);
            window._lastValveSuggestions = suggestions;
            adjustPanel.innerHTML = createRelativeAdjustPanel(suggestions);
            adjustPanel.style.display = 'block';
        } else {
            adjustPanel.style.display = 'none';
            adjustPanel.innerHTML = '';
        }
    }
}



function calcVelocity(flow, size) {

if(!flow || !size) return 0;

const q = flow / 1000; const r = (size / 2) / 1000; const a = Math.PI * r * r; return (q / a).toFixed(1);

}

function getVelColor(v) { if(v < 6) return 'v-green'; if(v < 9) return 'v-yellow'; return 'v-red'; }

function calcFanLaw() { const hz = parseFloat(document.getElementById('fanHz').value); const q1 = parseFloat(document.getElementById('fanQ').value); const q2 = parseFloat(document.getElementById('fanTarg').value); if(hz && q1 && q2) { const newHz = (q2/q1) * hz; document.getElementById('fanResult').innerText = `Uusi asetus: ${newHz.toFixed(1)}`; } }



// --- TILOJEN HALLINTA & KOPIOINTI ---
// --- TILOJEN HALLINTA JA SYNKRONOINTI (ÄLYKÄS) ---

function setMode(mode) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // Varmistetaan modes-rakenne
    if (!p.modes) p.modes = { home: {}, away: {}, boost: {} };

    // Master-lista on aina 'home'. Jos vaihdetaan muualle, varmistetaan synkronointi.
    const homeValves = p.modes['home'].valves || [];
    let targetValves = p.modes[mode].valves || [];
    
    if (mode !== 'home') {
        // Jos kohdetila on tyhjä tai eri pituinen kuin home, luodaan se uudestaan pohjalta
        if (targetValves.length === 0 || targetValves.length !== homeValves.length) {
            targetValves = homeValves.map(v => ({
                ...v,        // Kopioi kaikki tiedot (nimi, tyyppi, id...)
                flow: 0,     // Nollaa virtaus
                measuredP: 0,// Nollaa paine
                pos: v.pos   // SÄILYTÄ ASENTO (fyysinen vakio)
            }));
        } else {
            // Jos lista on jo olemassa, PÄIVITETÄÄN VAIN ASENNOT ja NIMET Home-tilasta
            targetValves.forEach((v, i) => {
                if (homeValves[i]) {
                    v.pos = homeValves[i].pos;   // Asento synkronoituu
                    v.room = homeValves[i].room; // Nimi synkronoituu
                    v.type = homeValves[i].type; // Tyyppi synkronoituu
                    v.parentDuctId = homeValves[i].parentDuctId;
                    // HUOM: flow ja measuredP EIVÄT muutu!
                }
            });
        }
    }
    
    // Tallennetaan päivitetty lista takaisin mode-objektiin
    p.modes[mode].valves = targetValves;
    
    // Koneen tiedot (jokaisella tilalla oma asetus)
    if (!p.modes[mode].machines || p.modes[mode].machines.length === 0) {
        // Kopioi koneet homesta pohjaksi ensimmäisellä kerralla
        p.modes[mode].machines = JSON.parse(JSON.stringify(p.modes['home'].machines || []));
    }

    // VAIHDETAAN AKTIIVINEN NÄKYMÄ
    window.currentMode = mode;
    p.valves = p.modes[mode].valves;       // p.valves osoittaa nyt valittuun tilaan
    p.machines = p.modes[mode].machines;   // p.machines osoittaa nyt valittuun tilaan

    saveData();
    renderDetailsList();
}

function calculateAndSave(next = false) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // --- 1. HAETAAN LOMAKKEEN ARVOT ---
    const apt = document.getElementById('apartmentName').value || '';
    const room = document.getElementById('roomName').value || 'Huone';
    const type = document.getElementById('valveType').value || '';
    const target = parseFloat(document.getElementById('targetQ').value) || 0;
    
    // Paine ja asento
    const paVal = document.getElementById('measuredP').value;
    const pa = (paVal === "" || paVal === null) ? null : parseFloat(paVal);
    const pos = parseFloat(document.getElementById('currentPos').value) || 0;

    // Runko-valinta
    const selectEl = document.getElementById('parentDuctId');
    const selectedVal = selectEl ? selectEl.value : "";
    let finalParentId = null;

    // --- 2. UUSI LOGIIKKA: VALINNAN KÄSITTELY (Create New Duct) ---
    
    // Tapaus 1: Käyttäjä haluaa luoda uuden rungon valikosta
    if (selectedVal === "CREATE_NEW_SUPPLY" || selectedVal === "CREATE_NEW_EXTRACT") {
        const isSupply = (selectedVal === "CREATE_NEW_SUPPLY");
        const ductType = isSupply ? 'supply' : 'extract';
        
        // Lasketaan numero nimeä varten (varmistetaan ettei tule duplikaatteja)
        const existingDucts = p.ducts.filter(d => d.type === ductType && d.group === 'ahu');
        let maxNum = 0;
        existingDucts.forEach(d => {
            const parts = d.name.split(' ');
            const num = parseInt(parts[parts.length - 1]);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        const newName = `${isSupply ? 'Tulo' : 'Poisto'} ${maxNum + 1}`;
        
        // Luodaan uusi runko
        const newDuct = {
            id: Math.floor(Date.now() + Math.random()*1000),
            name: newName,
            type: ductType,
            size: 125,
            group: 'ahu'
        };
        p.ducts.push(newDuct);
        
        finalParentId = newDuct.id;
        
    } 
    // Tapaus 2: Käyttäjä valitsi olemassa olevan rungon
    else if (selectedVal && selectedVal !== "") {
        finalParentId = Number(selectedVal); // Varmistetaan numero
    }
    
    // Tapaus 3: Valinta tyhjä -> Automaattipäättely (Fallback)
    if (!finalParentId) {
        let isSupply = false;
        // Haetaan mallinimi (esim. "Halton KTS")
        let nameToCheck = (window.valveIdToModelId && window.valveIdToModelId[type]) ? window.valveIdToModelId[type] : type;
        nameToCheck = nameToCheck.toLowerCase();
        
        // Päätellään onko tulo vai poisto
        if (nameToCheck.includes("tulo") || nameToCheck.includes("kts") || nameToCheck.includes("fresh") || nameToCheck.includes("supply") || nameToCheck.includes("korvaus")) {
            isSupply = true;
        }
        
        const ductType = isSupply ? 'supply' : 'extract';
        const ductName = isSupply ? 'Automaatti Tulo' : 'Automaatti Poisto';
        
        // Etsitään tai luodaan automaattirunko
        let autoDuct = p.ducts.find(d => d.group === 'ahu' && d.type === ductType && d.name === ductName);
        if (!autoDuct) {
            autoDuct = { id: Date.now(), name: ductName, type: ductType, size: 125, group: 'ahu' };
            p.ducts.push(autoDuct);
        }
        finalParentId = autoDuct.id;
    }
    
    // --- 3. LASKENTA (Flow) ---
    let flow = 0;
    if (type === 'PITOT') {
        const manualFlow = parseFloat(document.getElementById('measuredFlow').value);
        if (isNaN(manualFlow)) { 
            alert("Virhe: Syötä virtaus manuaalisesti Pitot-mittaukselle!"); 
            return; 
        }
        flow = manualFlow;
    } else {
        // Lasketaan K-arvon ja paineen avulla
        const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
        if(type && !isNaN(pos) && pa !== null){
            flow = kFunc(type, pos) * Math.sqrt(Math.max(0, pa));
        }
    }

    // --- 4. DATAOBJEKTIN LUONTI ---
    const newVal = { 
        apartment: apt || undefined, 
        room, 
        type, 
        target, 
        flow, 
        pos, 
        measuredP: pa, 
        parentDuctId: Number(finalParentId) 
    };

    // --- 5. TALLENNUS JA SYNKRONOINTI TILOJEN VÄLILLÄ ---
    if (editingValveIndex !== null && editingValveIndex >= 0) {
        // 1. Päivitetään nykyinen tila
        p.valves[editingValveIndex] = newVal;

        // 2. Päivitetään muiden tilojen ASENTO (pos) ja PERUSTIEDOT samalle indeksille
        ['home', 'away', 'boost'].forEach(m => {
            if (m !== window.currentMode && p.modes[m] && p.modes[m].valves && p.modes[m].valves[editingValveIndex]) {
                const otherV = p.modes[m].valves[editingValveIndex];
                otherV.pos = pos;        // Asento synkronoituu!
                otherV.room = room;      // Nimi synkronoituu
                otherV.type = type;      // Tyyppi synkronoituu
                otherV.parentDuctId = Number(finalParentId); // Runko synkronoituu
                // Flow ja measuredP EIVÄT muutu muissa tiloissa
            }
        });

        editingValveIndex = null;
    } else {
        // UUSI VENTTIILI: Lisätään se KAIKKIIN tiloihin
        p.valves.push(newVal);
        
        ['home', 'away', 'boost'].forEach(m => {
            if (m !== window.currentMode) {
                // Luodaan kopio nollatuilla mittauksilla muihin tiloihin
                const copyVal = { ...newVal, flow: 0, measuredP: 0 };
                if(!p.modes[m].valves) p.modes[m].valves = [];
                p.modes[m].valves.push(copyVal);
            }
        });
    }

    saveData();
    
    // --- 6. UI PALAUTE JA SEURAAVA VAIHE ---
    const resDiv = document.getElementById('calcResult');
    if(resDiv) { resDiv.style.display = 'block'; resDiv.innerText = `Tallennettu: ${flow.toFixed(1)} l/s`; }

    if(next){
        // Tyhjennetään kentät seuraavaa varten
        document.getElementById('roomName').value = '';
        document.getElementById('measuredP').value = '';
        document.getElementById('currentPos').value = '';
        const flowIn = document.getElementById('measuredFlow');
        if(flowIn) flowIn.value = '';
        
        if(typeof updateLiveK === 'function') updateLiveK();
        
        // PÄIVITETÄÄN VALIKKO, jotta uusi runko näkyy siellä heti
        populateDuctSelect(); 
        
        // Asetetaan valinta äsken luotuun runkoon, jotta seuraava venttiili menee samaan
        document.getElementById('parentDuctId').value = finalParentId;
    } else {
        if(returnToVisual) {
            returnToVisual = false;
            if(typeof showVisual === 'function') showVisual(); 
            else { renderVisualContent(); showView('view-visual'); }
        } else {
            showView('view-details');
            if(typeof renderDetailsList === 'function') renderDetailsList();
        }
    }
}
function deleteValveByIndex(idx){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    if(idx<0 || idx>=p.valves.length) return;
    
    if(confirm('Poistetaanko venttiili kaikista tiloista?')){
        // Poistetaan kaikista moodeista samasta indeksistä, jotta synkka säilyy
        ['home', 'away', 'boost'].forEach(m => {
            if (p.modes[m] && p.modes[m].valves) {
                p.modes[m].valves.splice(idx, 1);
            }
        });
        
        // Päivitetään nykyinen viittaus (varmuuden vuoksi)
        p.valves = p.modes[window.currentMode].valves;
        
        saveData();
        renderDetailsList();
        if(window.activeVisMode) renderVisualContent();
    }
}





function createDemoHybrid(){
    const p = { id: Date.now(), name: 'Demo Hybridi (Standard)', systemType: 'hybrid', ducts: [], valves: [], machines: [], meta: {} };
    
    const supId = Date.now()+11, extAhuId = Date.now()+12;
    p.ducts.push({ id: supId, type: 'supply', name: 'AHU Tulo', size: 160, group:'ahu' });
    p.ducts.push({ id: extAhuId, type: 'extract', name: 'AHU Poisto', size: 160, group:'ahu' });
    
    const roofExtId = Date.now()+13;
    p.ducts.push({ id: roofExtId, type: 'extract', name: 'Huippuimuri Poisto', size: 200, group:'roof' });
    
    p.machines.push({ type:'ahu', name:'IV-Kone', supPct:50, extPct:50 });
    
    const rnd = (target) => Number((target + (Math.random() * 4.0 - 2.0)).toFixed(1));
    const rpos = () => Math.round(2 + Math.random() * 8);
    const rpa = () => Number((30 + Math.random() * 40).toFixed(0));

    // AHU Venttiilit: Tulo (KTS-125) ja Poisto (KSO-125)
    p.valves.push({ room:'OH (AHU)', type:'h_kts125', target:25, flow:rnd(20), pos:rpos(), measuredP:rpa(), parentDuctId: supId });
    p.valves.push({ room:'MH (AHU)', type:'h_kts125', target:12, flow:rnd(10), pos:rpos(), measuredP:rpa(), parentDuctId: supId });
    
    p.valves.push({ room:'WC (AHU)', type:'h_kso125', target:10, flow:rnd(12), pos:rpos(), measuredP:rpa(), parentDuctId: extAhuId });
    p.valves.push({ room:'KPH (AHU)', type:'h_kso125', target:15, flow:rnd(18), pos:rpos(), measuredP:rpa(), parentDuctId: extAhuId });

    // Huippuimuri Venttiilit: Vain KSO-125
    p.valves.push({ apartment:'B1', room:'Keittiö', type:'h_kso125', target:20, flow:rnd(15), pos:rpos(), measuredP:rpa(), parentDuctId: roofExtId });
    p.valves.push({ apartment:'B2', room:'Keittiö', type:'h_kso125', target:20, flow:rnd(25), pos:rpos(), measuredP:rpa(), parentDuctId: roofExtId });

    projects.push(p); saveData(); renderProjects(); activeProjectId = p.id; 
    if (typeof openProject === 'function') openProject(p.id); else { try { window.openProject(p.id); } catch(e) {} } 
    alert('Demo Hybridi luotu');
}
 

function confirmCreateProject() {
    console.log('confirmCreateProject called');
    const name = document.getElementById('newProjName').value;
    const type = document.getElementById('newProjType').value;
    if (!name) {
        alert("Anna projektille nimi!");
        return;
    }
    const newId = Date.now();
    const p = {
        id: newId,
        name: name,
        systemType: type,
        machines: [],
        ducts: [],
        valves: [],
        meta: {},
        modes: { home:{machines:[],valves:[]}, away:{machines:[],valves:[]}, boost:{machines:[],valves:[]} }
    };
    // Lisää rungot automaattisesti tyypin mukaan
    if(type === 'ahu') {
        p.ducts.push({ id: 2, name: "Tulo", type: "supply", size: 125 });
        p.ducts.push({ id: 3, name: "Poisto", type: "extract", size: 125 });
    }
    if(type === 'roof') {
        p.ducts.push({ id: 3, name: "Poisto", type: "extract", size: 125 });
    }
    if(type === 'hybrid') {
        p.ducts.push({ id: 2, name: "Tulo", type: "supply", size: 125 });
        p.ducts.push({ id: 3, name: "Poisto", type: "extract", size: 125 });
    }
    projects.push(p);
    saveData();
    closeModal();
    renderProjects();
    openProject(newId);
}

function renderProjects() {
    const list = document.getElementById('projectsList');
    if (!list) return;
    list.innerHTML = projects.map(p => `<div class="list-item" onclick="openProject(${p.id})"><b>${p.name}</b>
            <button class="list-action-btn" title="Poista projekti" onclick="event.stopPropagation();deleteProject(${p.id})">🗑️</button>
        </div>`).join('');
    const noMsg = document.getElementById('noProjectsMsg');
    if (noMsg) noMsg.style.display = projects.length ? 'none' : 'block';
}

function deleteProject(id){
    const p = projects.find(x => x.id === id);
    if(!p) return;
    if(confirm(`Haluatko varmasti poistaa projektin \"${p.name}\"?`)){
        projects = projects.filter(x => x.id !== id);
        saveData();
        showView('view-projects');
        renderProjects();
    }
}

function openProject(id) {
    activeProjectId = id;
    const p = projects.find(x => x.id === id);
    if (!p) return;
    
    // Tärkeä muutos: Emme enää yritä etsiä 'currentProjectName' elementtiä tässä,
    // koska renderDetailsList luo sen hetken kuluttua uudestaan.
    
    renderDetailsList(); // Tämä funktio piirtää koko Dashboardin otsikkoineen
    showView('view-details');
}

// Varmista globaalit viittaukset onclick-kutsuille
window.openProject = openProject;
window.showView = showView;

// --- UUSI PROJEKTIN PÄÄNÄKYMÄ (SISÄLTÄÄ TILOJEN VALINNAN) ---
// --- APUFUNKTIO: PÄIVITÄ METATIEDOT HETI (D2 ja Otsikkotiedot) ---
// --- APUFUNKTIO: PÄIVITÄ METATIEDOT ---
// --- APUFUNKTIO: PÄIVITÄ JA TALLENNA METATIEDOT ---
// --- APUFUNKTIO: PÄIVITÄ METATIEDOT (SMART SAVE) ---
function updateProjectMeta(field, value) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    if (!p.meta) p.meta = {};

    // 1. Numerokentät tallennetaan numeroina (D2 ja SFP tehot)
    if (['area', 'height', 'powerSup', 'powerExt'].includes(field)) {
        p.meta[field] = parseFloat(value);
    } else {
        // 2. Tekstikentät tallennetaan tekstinä (Osoite, Yritys, Laakerit...)
        p.meta[field] = value;
    }

    saveData(); // Tallenna kantaan

    // 3. PÄIVITÄ NÄKYMÄ VAIN JOS LASKENTA MUUTTUU
    // Tämä on tärkeää: Jos päivittäisimme sivun kun kirjoitat nimeä,
    // tekstikenttä menettäisi fokuksen ("kursori karkaa").
    // Päivitetään vain, jos muutetaan numeroita jotka vaikuttavat laskureihin.
    if (['area', 'height', 'powerSup', 'powerExt'].includes(field)) {
        renderDetailsList();
    }
}
// --- PÄIVITETTY INLINE-MUOKKAUS (HUONE MUKANA) ---
window.updateValveInline = function(idx, field, value) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    
    const currentMode = window.currentMode || 'home';
    const valves = p.modes[currentMode].valves;
    const v = valves[idx];
    if (!v) return;

    let numVal = parseFloat(value);
    
    if (field === 'room') {
        // HUONEEN NIMI MUUTTUU: Synkronoidaan kaikkiin tiloihin
        v.room = value;
        ['home', 'away', 'boost'].forEach(m => {
            if (p.modes[m] && p.modes[m].valves && p.modes[m].valves[idx]) {
                p.modes[m].valves[idx].room = value;
            }
        });
    }
    else if (field === 'pos') {
        if (isNaN(numVal)) numVal = 0;
        v.pos = numVal;
        ['home', 'away', 'boost'].forEach(m => {
            if (p.modes[m] && p.modes[m].valves && p.modes[m].valves[idx]) {
                p.modes[m].valves[idx].pos = numVal;
            }
        });
        if (v.measuredP !== null && v.measuredP !== undefined && v.type !== 'PITOT') {
            const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
            const k = kFunc(v.type, v.pos);
            v.flow = k * Math.sqrt(Math.max(0, v.measuredP));
        }
    } 
    else if (field === 'type') {
        v.type = value;
        ['home', 'away', 'boost'].forEach(m => {
            if (p.modes[m] && p.modes[m].valves && p.modes[m].valves[idx]) {
                p.modes[m].valves[idx].type = value;
            }
        });
        if (v.measuredP !== null && v.measuredP !== undefined && v.type !== 'PITOT') {
            const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
            const currentPos = v.pos || 0;
            const k = kFunc(v.type, currentPos);
            v.flow = k * Math.sqrt(Math.max(0, v.measuredP));
        }
    }
    else if (field === 'measuredP') {
        if (value === "") { v.measuredP = null; v.flow = 0; } 
        else {
            v.measuredP = numVal;
            if (v.type !== 'PITOT') {
                const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
                const k = kFunc(v.type, v.pos || 0);
                v.flow = k * Math.sqrt(Math.max(0, v.measuredP));
            }
        }
    }
    else if (field === 'flow') { if (isNaN(numVal)) numVal = 0; v.flow = numVal; }
    else if (field === 'target') { if (isNaN(numVal)) numVal = 0; v.target = numVal; }

    saveData();
    renderDetailsList(); 
};

function renderDetailsList() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!p.modes) {
        p.modes = { 
            home: { machines: JSON.parse(JSON.stringify(p.machines||[])), valves: JSON.parse(JSON.stringify(p.valves||[])) }, 
            away: { machines: [], valves: [] }, 
            boost: { machines: [], valves: [] } 
        };
    }
    if (!window.currentMode) window.currentMode = 'home';
    const currentMode = window.currentMode; 

    p.valves = p.modes[currentMode].valves;
    p.machines = p.modes[currentMode].machines;

    // 1. OPTIOT
    const db = (typeof valveDB !== 'undefined') ? valveDB : (window.valveDB || {});
    let valveOptionsHTML = '<option value="">- Valitse -</option><option value="PITOT">Suora mittaus (Pitot)</option>';
    if (Object.keys(db).length > 0) {
        Object.keys(db).sort((a,b) => db[a].name.localeCompare(db[b].name)).forEach(k => {
            // Tässä käytetään uutta nimeämistä listassa (KSO-125)
            valveOptionsHTML += `<option value="${k}">${formatValveDisplay(k)}</option>`; 
        });
    }

    // 2. LASKENTA
    let sumSup = 0, sumExt = 0;
    let targetSup = 0, targetExt = 0;
    const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
    const supplyValves = [], extractValves = [];

    (p.valves||[]).forEach((v, trueIdx) => {
        v._origIdx = trueIdx;
        const d = (p.ducts||[]).find(d=>d.id == v.parentDuctId);
        const flow = parseFloat(v.flow||0);
        const target = parseFloat(v.target||0);
        let isSup = false;
        if (d && d.type === 'supply') isSup = true;
        else if (!d && (v.type||'').toLowerCase().includes('tulo')) isSup = true;

        v._calcK = (v.type && v.pos !== null && v.pos !== undefined) ? kFunc(v.type, v.pos) : 0;

        if (isSup) { sumSup += flow; targetSup += target; supplyValves.push(v); }
        else { sumExt += flow; targetExt += target; extractValves.push(v); }
    });

    const sorter = (a,b) => (a.apartment||'').localeCompare(b.apartment||'') || (a.room||'').localeCompare(b.room||'');
    supplyValves.sort(sorter); extractValves.sort(sorter);

    // KPI & INFO
    let balanceText = "- %", balanceColor = "#7f8c8d";
    if (sumExt > 0) {
        const ratio = sumSup / sumExt; 
        const diffPct = Math.round((1 - ratio) * 100); 
        if (ratio > 1.0) { balanceText = `Ylipaine ${Math.abs(diffPct)}%`; balanceColor = "#c0392b"; }
        else if (ratio < 0.90) { balanceText = `Alipaine ${diffPct}% (Vahva)`; balanceColor = "#d35400"; }
        else { balanceText = `Alipaine ${diffPct}% (OK)`; balanceColor = "#27ae60"; }
    }

    const ahu = (p.machines||[]).find(m=>m.type==='ahu') || {name: 'IV-Kone'};
    const u = ahu.unit || 'pct';
    const val = (ahu.settingVal !== undefined && ahu.settingVal !== null && ahu.settingVal !== "") ? ahu.settingVal : '-';
    let machineInfo = u==='pa' ? `${val} Pa` : (u==='hz' ? `${val} Hz` : `${val} %`);

    const area = p.meta.area || 0;
    const height = p.meta.height || 2.5;
    let reqFlow = 0, d2Status = `<span style="color:#999;">(Syötä m²)</span>`;
    if (area > 0) {
        reqFlow = (area * height * 0.5) / 3.6;
        const diff = sumExt - reqFlow;
        d2Status = diff >= 0 ? `<b style="color:#27ae60">OK</b>` : `<b style="color:#c0392b">Vajaa ${Math.abs(diff).toFixed(1)} l/s</b>`;
    }

    const powerSup = p.meta.powerSup || 0;
    const powerExt = p.meta.powerExt || 0;
    let sfpText = "-";
    if (powerSup + powerExt > 0) {
        const maxFlow = Math.max(sumSup, sumExt);
        if (maxFlow > 0) {
            const sfp = ((powerSup + powerExt) / 1000) / (maxFlow / 1000);
            sfpText = sfp.toFixed(2);
        }
    }

    const dateVal = p.meta.date || new Date().toLocaleDateString('fi-FI');
    const timeVal = p.meta.time || new Date().toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'});

    // 3. RENDERÖINTI
    const view = document.getElementById('view-details');
    
    const renderRow = (v) => {
        const idx = v._origIdx; 
        const flow = parseFloat(v.flow||0);
        const target = parseFloat(v.target||0);
        let flowClass = (target > 0 && flow > 0) ? ((Math.abs(flow - target) / target <= 0.10) ? "val-ok" : "val-err") : "";
        
        // HUONEEN MUOKKAUS: Input-kenttä
        const roomVal = v.room || '';
        const aptVal = v.apartment ? `[${v.apartment}] ` : '';
        
        const pos = v.pos !== null && v.pos !== undefined ? Math.round(v.pos) : '';
        const pa = v.measuredP !== null && v.measuredP !== undefined ? v.measuredP : '';
        const kDisplay = (v._calcK > 0) ? v._calcK.toFixed(2) : '-';
        const currentType = v.type || "";
        const rowOptions = valveOptionsHTML.split(`value="${currentType}"`).join(`value="${currentType}" selected`);

        return `<tr onclick="editValve(${idx})">
                    <td style="padding:2px;">
                        ${aptVal ? `<span style="font-size:10px;color:#888;">${aptVal}</span>` : ''}
                        <input type="text" value="${roomVal}" onclick="event.stopPropagation()" onchange="updateValveInline(${idx}, 'room', this.value)" class="inline-inp" style="width:80%; text-align:left; padding-left:4px;">
                    </td>
                    <td style="padding:2px;"><select onclick="event.stopPropagation()" onchange="updateValveInline(${idx}, 'type', this.value)" class="inline-select" style="width:100%;">${rowOptions}</select></td>
                    <td style="font-size:11px; font-weight:bold; color:#0066cc; text-align:center;">${kDisplay}</td>
                    <td style="padding:2px;"><input type="number" step="1" placeholder="-" value="${pos}" onclick="event.stopPropagation()" onchange="updateValveInline(${idx}, 'pos', this.value)" class="inline-inp" style="width:100%;"></td>
                    <td style="padding:2px;"><input type="number" step="1" placeholder="-" value="${pa}" onclick="event.stopPropagation()" onchange="updateValveInline(${idx}, 'measuredP', this.value)" class="inline-inp" style="width:100%;"></td>
                    <td style="padding:2px;"><input type="number" step="0.1" value="${flow.toFixed(1)}" onclick="event.stopPropagation()" onchange="updateValveInline(${idx}, 'flow', this.value)" class="inline-inp ${flowClass}" style="width:100%; font-weight:bold;"></td>
                    <td style="padding:2px;"><input type="number" step="0.1" value="${target.toFixed(1)}" onclick="event.stopPropagation()" onchange="updateValveInline(${idx}, 'target', this.value)" class="inline-inp" style="width:100%; color:#888;"></td>
                </tr>`;
    };

    const activeColor = '#4CAF50'; 
    const getBtnStyle = (m) => `flex:1; padding:10px; border:1px solid #ccc; background: ${currentMode === m ? activeColor : '#f1f1f1'} !important; color: ${currentMode === m ? '#fff' : '#444'} !important; font-weight:bold; cursor:pointer; border-radius:6px; transition:all 0.2s; box-shadow: ${currentMode === m ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)'};`;

    let html = `
        <style>
            .kpi-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
            .kpi-box { background:#fff; padding: 8px 4px; border-radius:6px; border:1px solid #ddd; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
            .kpi-val { font-size: 18px; font-weight:800; }
            .kpi-lbl { font-size: 9px; text-transform:uppercase; color:#777; font-weight:600; }
            .tool-btn { padding:12px; background:#f8f9fa; border:1px solid #ccc; border-radius:6px; font-weight:bold; color:#444; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; font-size:13px; }
            .lists-container { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
            .list-col { flex: 1; min-width: 300px; background: #fff; border-radius: 8px; border: 1px solid #ddd; overflow: hidden; }
            .mini-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
            .mini-table th { background: #f9f9f9; padding: 6px 4px; text-align: center; font-size:11px; color:#555; }
            .mini-table th:nth-child(1) { text-align: left; width: 25%; } 
            .mini-table th:nth-child(2) { text-align: left; width: 30%; } 
            .mini-table td { border-bottom: 1px solid #eee; vertical-align: middle; }
            .inline-inp { border: 1px solid transparent; background: transparent; text-align: center; padding: 8px 0; font-size: 14px; border-radius: 4px; }
            .inline-inp:focus { border: 1px solid #2196F3; background: #fff; outline: none; }
            .inline-inp.val-ok { color: #27ae60; } .inline-inp.val-err { color: #c0392b; }
            .inline-select { border: 1px solid transparent; background: transparent; padding: 8px 2px; font-size: 12px; color: #444; border-radius: 4px; width: 100%; cursor: pointer; }
            .mode-row { display:flex; gap:8px; margin-bottom:15px; background:#fff; padding:5px; border-radius:8px; border:1px solid #eee; }
            .tech-box { background:#eef5e9; border:1px solid #c3e6cb; border-radius:6px; padding:15px; margin-bottom:15px; }
            .tech-row { display:flex; flex-wrap:wrap; gap:15px; align-items:center; margin-bottom:10px; }
            .tech-row:last-child { margin-bottom:0; }
            .input-xl { font-size:16px; padding:10px; width:80px; border:1px solid #ccc; border-radius:6px; text-align:center; font-weight:bold; }
            .label-xl { font-size:14px; font-weight:bold; color:#2c3e50; }
            .sel-xl { font-size:14px; padding:8px; border:1px solid #ccc; border-radius:6px; width:100%; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; background:#fff; padding:10px; border-radius:6px; border:1px solid #eee; }
            .info-col { display: flex; flex-direction: column; gap: 8px; }
            .info-inp { width:100%; border:1px solid #ddd; padding:8px; border-radius:4px; font-size:14px; color:#333; }
            .info-inp:focus { border-color:#2196F3; outline:none; }
            .info-label { font-size: 11px; font-weight: bold; color: #666; margin-bottom: 2px; }
        </style>

        <div style="padding:10px; max-width:1200px; margin:0 auto;">
            
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <h1 style="margin:0; font-size:22px; color:#2c3e50;">${p.name}</h1>
                <button class="list-action-btn" onclick="renameActiveProject()" title="Muokkaa nimeä" style="font-size:16px;">✏️</button>
            </div>

            <div class="info-grid">
                <div class="info-col">
                    <div><div class="info-label">Kohde (Nimi)</div><input class="info-inp" type="text" placeholder="Esim. OKT Virtanen" value="${p.meta.location||''}" onchange="updateProjectMeta('location', this.value)"></div>
                    <div><div class="info-label">Kohteen Osoite</div><input class="info-inp" type="text" placeholder="Esim. Esimerkkitie 1" value="${p.meta.address||''}" onchange="updateProjectMeta('address', this.value)"></div>
                </div>
                <div class="info-col">
                    <div><div class="info-label">Mittaaja (Henkilö)</div><input class="info-inp" type="text" placeholder="Esim. Matti Meikäläinen" value="${p.meta.measurer||''}" onchange="updateProjectMeta('measurer', this.value)"></div>
                    <div><div class="info-label">Käytetty Mittari</div><input class="info-inp" type="text" placeholder="Esim. TSI / Swema" value="${p.meta.device||''}" onchange="updateProjectMeta('device', this.value)"></div>
                </div>
                <div class="info-col">
                    <div><div class="info-label">Yritys (Nimi, Y-tunnus)</div><input class="info-inp" type="text" placeholder="Yritys Oy, 123456-7" value="${p.meta.company||''}" onchange="updateProjectMeta('company', this.value)"></div>
                    <div style="display:flex; gap:5px;">
                        <div style="flex:1;"><div class="info-label">Pvm</div><input class="info-inp" type="text" value="${dateVal}" onchange="updateProjectMeta('date', this.value)"></div>
                        <div style="flex:1;"><div class="info-label">Aika</div><input class="info-inp" type="text" value="${timeVal}" onchange="updateProjectMeta('time', this.value)"></div>
                    </div>
                </div>
            </div>

            <div class="mode-row">
                <button style="${getBtnStyle('home')}" onclick="setMode('home')">🏠 Kotona</button>
                <button style="${getBtnStyle('away')}" onclick="setMode('away')">🏃 Poissa</button>
                <button style="${getBtnStyle('boost')}" onclick="setMode('boost')">🚀 Tehostus</button>
            </div>

            <div class="kpi-row">
                <div class="kpi-box" style="border-top: 3px solid #3498db;"><div><span class="kpi-val" style="color:#3498db;">${sumSup.toFixed(0)}</span> <span style="font-size:11px;color:#999">/ ${targetSup.toFixed(0)}</span></div><div class="kpi-lbl">Tulo l/s</div></div>
                <div class="kpi-box" style="border-top: 3px solid #e74c3c;"><div><span class="kpi-val" style="color:#e74c3c;">${sumExt.toFixed(0)}</span> <span style="font-size:11px;color:#999">/ ${targetExt.toFixed(0)}</span></div><div class="kpi-lbl">Poisto l/s</div></div>
                <div class="kpi-box" style="border-top: 3px solid ${balanceColor};"><span class="kpi-val" style="color:${balanceColor}; font-size:14px;">${balanceText}</span><div class="kpi-lbl" style="margin-top:2px;">Painesuhde</div></div>
                <div class="kpi-box" onclick="editMachine(0)" style="cursor:pointer; border-top: 3px solid #34495e;"><span class="kpi-val" style="color:#34495e; font-size:16px;">${machineInfo}</span><div class="kpi-lbl">Kone (${currentMode})</div></div>
            </div>

            <div class="tech-box">
                <div class="tech-row" style="border-bottom:1px solid #ccc; padding-bottom:15px;">
                    <span class="label-xl">D2-Määräys:</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" class="input-xl" placeholder="m²" value="${p.meta.area||''}" onchange="updateProjectMeta('area',this.value)"> <span>m²</span>
                    </div>
                    <span style="color:#aaa; font-size:20px;">x</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" class="input-xl" placeholder="h" value="${p.meta.height||'2.5'}" onchange="updateProjectMeta('height',this.value)"> <span>h</span>
                    </div>
                    <div style="margin-left:auto; text-align:right;">
                        <div style="font-size:12px; color:#666;">Tavoite</div>
                        <div style="font-size:18px; font-weight:bold;">${reqFlow.toFixed(0)} l/s</div>
                        <div style="font-size:12px;">${d2Status}</div>
                    </div>
                </div>
                
                <div class="tech-row" style="align-items: flex-start; padding-top:10px;">
                    <div style="flex:1; min-width:200px;">
                        <div class="label-xl" style="margin-bottom:5px;">SFP-Luku: <span style="color:#2196F3;">${sfpText}</span></div>
                        <div style="display:flex; gap:10px;">
                            <input type="number" class="input-xl" placeholder="Tul W" value="${p.meta.powerSup||''}" onchange="updateProjectMeta('powerSup',this.value)">
                            <input type="number" class="input-xl" placeholder="Poi W" value="${p.meta.powerExt||''}" onchange="updateProjectMeta('powerExt',this.value)">
                        </div>
                    </div>
                    <div style="flex:1; display:flex; gap:15px; justify-content:flex-end;">
                        <div style="width:120px;">
                            <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">Laakerit Tulo</div>
                            <select onchange="updateProjectMeta('bearingSup',this.value)" class="sel-xl">
                                <option value="-" ${p.meta.bearingSup==='-'?'selected':''}>-</option>
                                <option value="OK" ${p.meta.bearingSup==='OK'?'selected':''}>OK</option>
                                <option value="Vaihdettu" ${p.meta.bearingSup==='Vaihdettu'?'selected':''}>Vaihdettu</option>
                            </select>
                        </div>
                        <div style="width:120px;">
                            <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">Laakerit Poisto</div>
                            <select onchange="updateProjectMeta('bearingExt',this.value)" class="sel-xl">
                                <option value="-" ${p.meta.bearingExt==='-'?'selected':''}>-</option>
                                <option value="OK" ${p.meta.bearingExt==='OK'?'selected':''}>OK</option>
                                <option value="Vaihdettu" ${p.meta.bearingExt==='Vaihdettu'?'selected':''}>Vaihdettu</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:15px;">
                <button class="tool-btn" style="background:#e3f2fd; border-color:#2196f3; color:#0d47a1;" onclick="showVisual()">🗺️ Avaa Kartta</button>
                <button class="tool-btn" style="background:#e8f5e9; border-color:#4caf50; color:#1b5e20;" onclick="showAddValve()">➕ Lisää Venttiili</button>
                <button class="tool-btn" onclick="openCreateAptAHUModal()">🏢 Asunnot</button>
                <button class="tool-btn" onclick="showReportExcelStyle()">📄 Pöytäkirjat</button>
                <button class="tool-btn" onclick="shareProjectData()">📤 Jaa</button>
            </div>

            <h4 style="margin:0; border-bottom:1px solid #ddd; padding-bottom:5px; font-size:14px;">Mittauspöytäkirja / Lista (${currentMode})</h4>
            <div class="lists-container">
                <div class="list-col" style="border-top: 3px solid #3498db;">
                    <div style="padding:8px; background:#3498db; color:white; font-weight:bold; font-size:12px;">Tulo (${supplyValves.length})</div>
                    <table class="mini-table">
                        <thead><tr><th>Huone</th><th>Malli</th><th>K</th><th>As</th><th>Pa</th><th>l/s</th><th>Tav</th></tr></thead>
                        <tbody>${supplyValves.length > 0 ? supplyValves.map(renderRow).join('') : '<tr><td colspan="7" style="text-align:center; padding:15px; color:#ccc;">Ei tuloventtiilejä</td></tr>'}</tbody>
                    </table>
                </div>
                <div class="list-col" style="border-top: 3px solid #e74c3c;">
                    <div style="padding:8px; background:#e74c3c; color:white; font-weight:bold; font-size:12px;">Poisto (${extractValves.length})</div>
                    <table class="mini-table">
                        <thead><tr><th>Huone</th><th>Malli</th><th>K</th><th>As</th><th>Pa</th><th>l/s</th><th>Tav</th></tr></thead>
                        <tbody>${extractValves.length > 0 ? extractValves.map(renderRow).join('') : '<tr><td colspan="7" style="text-align:center; padding:15px; color:#ccc;">Ei poistoventtiilejä</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    view.innerHTML = html;
}
function duplicateValve(index, e) { e.stopPropagation(); const count = prompt("Montako kopiota luodaan?", "1"); if(count && !isNaN(count)) { const p = projects.find(x => x.id === activeProjectId); const original = p.valves[index]; for(let i=0; i<parseInt(count); i++) { const copy = JSON.parse(JSON.stringify(original)); const numMatch = copy.room.match(/\d+$/); if(numMatch) { const nextNum = parseInt(numMatch[0]) + 1 + i; copy.room = copy.room.replace(/\d+$/, nextNum); } else { copy.room += ` (kopio ${i+1})`; } p.valves.push(copy); } saveData(); renderDetailsList(); } }

function previewPhoto() { const file = document.getElementById('valvePhotoInput').files[0]; const preview = document.getElementById('valvePhotoPreview'); if (file) { const reader = new FileReader(); reader.onloadend = function() { const img = new Image(); img.src = reader.result; img.onload = function() { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const MAX_WIDTH = 300; const scaleSize = MAX_WIDTH / img.width; canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); currentPhotoData = canvas.toDataURL('image/jpeg', 0.7); preview.src = currentPhotoData; preview.style.display = 'block'; } }; reader.readAsDataURL(file); } else { preview.src = ""; preview.style.display = 'none'; currentPhotoData = null; } }

function loadBackground(input) { const file = input.files[0]; if(file) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('view-visual').style.backgroundImage = `url('${e.target.result}')`; }; reader.readAsDataURL(file); } }

// --- LOGO HANDLING ---

function handleLogoUpload() {

const file = document.getElementById('logoUpload').files[0];

if(file) {

const reader = new FileReader();

reader.onloadend = function() {

const p = projects.find(x => x.id === activeProjectId);

p.meta.logo = reader.result;

saveData();

document.getElementById('settingsLogoPreview').src = p.meta.logo;

document.getElementById('settingsLogoPreview').style.display = 'block';

}

reader.readAsDataURL(file);

}

}



// --- LISÄTIEDOT-NÄKYMÄ (DYNAAMINEN) ---
function showSettings() {
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    if(!p.meta) p.meta = {};

    // Haetaan oletusarvot (jos tyhjä, tarjotaan nykyhetkeä)
    const now = new Date();
    const dateStr = p.meta.date || now.toLocaleDateString('fi-FI');
    const timeStr = p.meta.time || now.toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'});

    const view = document.getElementById('view-settings');
    view.innerHTML = `
        <div style="padding: 20px; max-width: 600px; margin: 0 auto;">
            <h3>Projektin Lisätiedot</h3>
            <p style="color:#666; font-size:13px; margin-bottom:20px;">Nämä tiedot tulostuvat pöytäkirjan otsikkoon.</p>

            <label>Mittaaja / Yritys</label>
            <input type="text" id="setMeasurer" class="input" value="${p.meta.measurer || ''}" placeholder="Esim. Matti Meikäläinen Oy">

            <label>Käytetty Mittari</label>
            <input type="text" id="setDevice" class="input" value="${p.meta.device || ''}" placeholder="Esim. TSI DP-Calc">

            <label>Paikka / Osoite</label>
            <input type="text" id="setLocation" class="input" value="${p.meta.location || ''}" placeholder="Esim. Esimerkkitie 1 A">

            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label>Päivämäärä</label>
                    <input type="text" id="setDate" class="input" value="${dateStr}">
                </div>
                <div style="flex:1;">
                    <label>Aika</label>
                    <input type="text" id="setTime" class="input" value="${timeStr}">
                </div>
            </div>

            <hr style="margin:20px 0; border:0; border-top:1px solid #eee;">
            
            <h4>Laskenta-asetukset</h4>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <label>Koneen tulo-teho (W): <input type="number" id="setPowerSup" class="input input-sm" value="${p.meta.powerSup||''}"></label>
                <label>Koneen poisto-teho (W): <input type="number" id="setPowerExt" class="input input-sm" value="${p.meta.powerExt||''}"></label>
            </div>

            <div style="margin-top:20px;">
                <label>Logo (valinnainen)</label>
                <input type="file" id="logoUpload" accept="image/*" onchange="handleLogoUpload()">
                <img id="settingsLogoPreview" src="${p.meta.logo||''}" style="max-height:50px; display:${p.meta.logo?'block':'none'}; margin-top:10px;">
            </div>

            <div style="margin-top:30px; display:flex; gap:10px;">
                <button class="btn btn-primary" onclick="saveSettings()">Tallenna & Palaa</button>
            </div>
        </div>
    `;
    
    showView('view-settings');
}

function saveSettings() {
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    if(!p.meta) p.meta = {};

    // Tallennetaan kentät
    p.meta.measurer = document.getElementById('setMeasurer').value;
    p.meta.device = document.getElementById('setDevice').value;     // UUSI
    p.meta.location = document.getElementById('setLocation').value; // UUSI
    p.meta.date = document.getElementById('setDate').value;         // UUSI
    p.meta.time = document.getElementById('setTime').value;         // UUSI
    
    p.meta.powerSup = document.getElementById('setPowerSup').value;
    p.meta.powerExt = document.getElementById('setPowerExt').value;

    saveData();
    showView('view-details');
    renderDetailsList(); // Päivitä etusivu
}
function addDuctFromVisual(type) { const p = projects.find(x => x.id === activeProjectId); const count = p.ducts.filter(d => d.type === type).length + 1; const prefix = type === 'supply' ? 'Tulo' : 'Poisto'; p.ducts.push({ id: Date.now(), type, name: `${prefix} ${count}`, flow: 0, size: 125 }); saveData(); renderVisualDOM(); drawPipes(); }

function deleteDuctFromVisual(id, e) { 
    if(e) e.stopPropagation(); 
    const p = projects.find(x => x.id === activeProjectId); 
    if(!p) return; 
    const skipConfirm = !!(e && e.altKey); 
    if(skipConfirm || confirm("Poistetaanko runko?")) { 
        p.ducts = p.ducts.filter(d => d.id != id); 
        p.valves = p.valves.filter(v => v.parentDuctId != id); 
        saveData(); 
        renderVisualContent(); 
    } 
}
// --- PAINE-ERO LOGIIKKA ---
function showPressureMeasure() {
    document.getElementById('pressureName').value = "";
    document.getElementById('pressureValue').value = "";
    showView('view-pressure');
}

function savePressureDiff() {
    const p = projects.find(x => x.id === activeProjectId);
    const name = document.getElementById('pressureName').value || "Paine-ero";
    const val = document.getElementById('pressureValue').value;
    
    if (!val) return alert("Syötä arvo!");

    // Varmistetaan että lista on olemassa
    if (!p.pressures) p.pressures = [];

    p.pressures.push({
        name: name,
        val: parseFloat(val)
    });

    saveData();
    showView('view-details');
    renderDetailsList();
}

function deletePressure(i) {
    if(confirm("Poista?")) {
        const p = projects.find(x => x.id === activeProjectId);
        p.pressures.splice(i, 1);
        saveData();
        renderDetailsList();
    }
}

function optimizeEnergy() {

const p = projects.find(x => x.id === activeProjectId);

if(!p.valves.length) return alert("Ei venttiileitä optimoitavaksi!");

let worstRatioSup = 2, worstValveSup = null;

let worstRatioExt = 2, worstValveExt = null;

p.valves.forEach(v => {

if(v.target > 0) {

const duct = p.ducts.find(d => d.id == v.parentDuctId);

const ratio = v.flow / v.target;

if (duct && duct.type === 'supply') { if (ratio < worstRatioSup) { worstRatioSup = ratio; worstValveSup = v; } }

else if (duct && duct.type === 'extract') { if (ratio < worstRatioExt) { worstRatioExt = ratio; worstValveExt = v; } }

}

});

if(worstValveSup) alert(`Huonoin SFP (Tulo): ${worstValveSup.room} (Suhde: ${(worstRatioSup*100).toFixed(0)}%)`);

if(worstValveExt) alert(`Huonoin SFP (Poisto): ${worstValveExt.room} (Suhde: ${(worstRatioExt*100).toFixed(0)}%)`);

}

// --- KORJATTU RUNKOKANAVAN LISÄYS ---
function showAddDuct() { 
    editingDuctId = null; 
    document.getElementById('ductName').value = ""; 
    showView('view-add-duct'); 
}

function saveDuct() { 
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    if (!p.ducts) p.ducts = [];
    const nameVal = document.getElementById('ductName').value;
    const typeVal = document.getElementById('ductType').value;
    const sizeVal = document.getElementById('ductSize').value;
    // Ryhmä: mihin kanavistoon runko lisätään (AHU tulo/poisto vs Huippuimuri poistoon)
    const groupEl = document.getElementById('ductGroup');
    let groupVal = groupEl ? groupEl.value : null;
    if (!groupVal) {
        const sel = prompt("Valitse kanavisto: kirjoita 'ahu' (Tulo/Poisto) tai 'roof' (Huippuimuri)", "ahu");
        if (sel === null) return;
        groupVal = (sel||'').toLowerCase()==='roof' ? 'roof' : 'ahu';
    }
    if (!nameVal) {
        alert("Anna rungolle nimi!");
        return;
    }
    const newDuct = { 
         id: Date.now(), 
         name: nameVal, 
         type: typeVal, 
         size: sizeVal,
         group: groupVal 
    };
    p.ducts.push(newDuct);
    saveData(); 
    showView('view-details'); 
    renderDetailsList(); 
}

// --- MODAL HANDLING FOR PROJECT CREATION ---
function showNewProjectModal() {
    document.getElementById('newProjectModal').style.display = 'flex';
}
function closeModal() {
    // Sulje uuden projektin modal, jos auki
    const npm = document.getElementById('newProjectModal');
    if (npm) {
        npm.style.display = 'none';
        const n1 = document.getElementById('newProjName'); if(n1) n1.value='';
        const n2 = document.getElementById('newProjType'); if(n2) n2.value='ahu';
    }
    // Sulje generinen overlay-modal, jos auki
    const ov = document.getElementById('generic-modal-overlay');
    if (ov) { ov.style.display = 'none'; ov.innerHTML=''; }
}

// Yleiskäyttöinen modal-avaaja dynaamiselle sisällölle
function openModal(html) {
    let ov = document.getElementById('generic-modal-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'generic-modal-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="modal">${html}</div>`;
    ov.style.display = 'flex';
}

function saveData() {
    localStorage.setItem('iv_projects', JSON.stringify(projects));
}

function renderVisualContent() {
    // Etsitään piirtoalue (tuki V62 ja V80 ID:lle)
    let container = document.getElementById('visContent');
    if (!container) {
        container = document.getElementById('schematicRoot');
        if (!container) return;
        container.innerHTML = '<div id="visContent"></div>';
        container = document.getElementById('visContent');
    }
    container.innerHTML = "";
    container.style.padding = "10px";

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // Tyhjennä mahdollinen yläpalkki ja näytä suodatinpaluu tarvittaessa
    const roofBar = document.getElementById('visRoofBar');
    if (roofBar) {
        roofBar.innerHTML = '';
        if (window._visTowerFilter) {
            roofBar.innerHTML = `<span style="font-size:12px; color:#555;">Suodatin: Näytetään vain rappu</span>
                                 <button class="btn btn-secondary" style="margin:0; padding:4px 8px; font-size:12px;" onclick="clearTowerFilter()">Näytä kaikki raput</button>`;
        }
        // Lisää kerrostalon luonti -nappi pystynäkymän yläpalkkiin (vain kerrostalo)
        const p2 = projects.find(x => x.id === activeProjectId);
        if (p2 && p2.systemType === 'kerrostalo') {
            roofBar.innerHTML += `<button class="btn btn-secondary" style="margin-left:8px; padding:4px 8px; font-size:12px;" onclick="openCreateAptAHUModal()">+ Luo asuntoja (AHU)</button>`;
            if (activeApartmentId) {
                roofBar.innerHTML += `<button class="btn btn-secondary" style="margin-left:8px; padding:4px 8px; font-size:12px; background:#2196F3; color:#fff; border-color:#1976D2;" onclick="returnToKerrostalo()">← Takaisin kerrostaloon</button>`;
            }
        } else if (p2 && p2.systemType === 'roof') {
            // Huippuimuri-projekteissa: lisää pikapainikkeet poistoon
            roofBar.innerHTML += `<button class="btn btn-secondary" style="margin-left:8px; padding:4px 8px; font-size:12px;" onclick="openAddRoofFansModal()">+ Lisää poisto (rappu)</button>`;
            roofBar.innerHTML += `<button class="btn btn-secondary" style="margin-left:8px; padding:4px 8px; font-size:12px;" onclick="openAddAptsForFanModal()">+ Lisää poisto (asunto)</button>`;
        }
    }

    const mode = window.activeVisMode || 'vertical';
    if (mode === 'vertical') {
        // Use the new CSS-based renderer
        const res = renderVerticalStackInto(container, p);
        applyStoredZoom();
        // Auto-skaalaus: pienennä näkymää kun torneja on paljon
        autoFitVertical();
        return res;
    } else {
        // New AHU schematic horizontal map
        renderHorizontalMap(container);
    }
}

// Dedicated vertical renderer using CSS classes
function renderVerticalStackInto(container, p) {
    const ducts = p.ducts || [];
    const valves = p.valves || [];
    // Kerrostalo: näytä asunnot kerroksittain; Roof: tornit; muuten oletus roof
    const isApt = (p.systemType === 'kerrostalo');
    let shafts = isApt ? ducts.filter(d => d.group==='apt') : ducts.filter(d => d.type === 'extract' && (d.group === 'roof'));
    const totalShafts = shafts.length;
    if (window._visTowerFilter) {
        const one = shafts.find(s => s.id === window._visTowerFilter);
        if (one) shafts = [one];
    }
    if (shafts.length === 0) {
        container.innerHTML = "<div style='color:#666; font-size:14px;'>Ei poistokanavia.<br>Luo 'Runkokanava' (esim. A-Rappu Poisto) nähdäksesi tornin.</div>";
        container.style.display = 'block';
        return;
    }

    // Varmistetaan pääalueen asettelu
    container.style.display = 'flex';
    container.innerHTML = '';

    const APTS_PER_FLOOR = (p.meta && parseInt(p.meta.aptsPerFloor)) || 3;

    // Tab-palkki rappuille, näkyy aina ja näyttää rappujen määrän
    const tabbar = document.createElement('div');
    tabbar.style.cssText = 'display:flex; gap:6px; align-items:center; margin:6px 0; flex-wrap:wrap; justify-content:flex-start;';
    const alph = getFinnishAlphabet();
    const allRoof = ducts.filter(d => d.type === 'extract' && (d.group === 'roof'));
    const letters = isApt ? [] : Array.from(new Set(allRoof.map(s=> (s.name||'').trim().charAt(0).toUpperCase()).filter(Boolean))).sort((a,b)=>alph.indexOf(a)-alph.indexOf(b));
    letters.forEach(L => {
        const b = document.createElement('button');
        b.className = 'btn btn-secondary';
        b.textContent = L;
        b.onclick = () => {
            const target = allRoof.find(s=> (s.name||'').toUpperCase().startsWith(L));
            if(target) filterTower(target.id);
        };
        const active = window._visTowerFilter && (allRoof.find(s=> s.id===window._visTowerFilter)?.name||'').toUpperCase().startsWith(L);
        if (active) {
            b.style.background = '#2196F3';
            b.style.color = '#fff';
            b.style.borderColor = '#1976D2';
        }
        tabbar.appendChild(b);
    });
    container.appendChild(tabbar);

    if (isApt) {
        // Kerrostalo: ryhmittele asunnot kerroksittain p.meta.floorMap:n perusteella ja renderöi laatikot
        const floorMap = (p.meta && p.meta.floorMap) || {};
        const apts = Object.keys(floorMap);
        // Rappu-välilehdet (A, B, C ... Å Ä Ö) kerrostalossa
        const alphKT = getFinnishAlphabet();
        const rappuLettersKT = Array.from(new Set(apts.map(a=> (a.match(/^[A-Za-zÅÄÖåäö]+/)||[''])[0].toUpperCase()).filter(Boolean))).sort((a,b)=>alphKT.indexOf(a)-alphKT.indexOf(b));
        const tabbarKT = document.createElement('div');
        tabbarKT.style.cssText = 'display:flex; gap:6px; align-items:center; margin:6px 0; flex-wrap:wrap; justify-content:flex-start;';
        rappuLettersKT.forEach(L => {
            const b = document.createElement('button');
            b.className = 'btn btn-secondary';
            b.textContent = L;
            b.onclick = () => { window._aptRappuFilter = L; renderVisualContent(); };
            if (window._aptRappuFilter === L) { b.style.background = '#2196F3'; b.style.color = '#fff'; b.style.borderColor = '#1976D2'; }
            tabbarKT.appendChild(b);
        });
        container.appendChild(tabbarKT);
        // Bulk-poisto rappukohtaisesti, kun suodatin on päällä
        if (window._aptRappuFilter) {
            const bulkBar = document.createElement('div');
            bulkBar.style.cssText = 'display:flex; gap:8px; align-items:center; margin:8px 0;';
            const info = document.createElement('span'); info.textContent = `Rappu ${window._aptRappuFilter} — toiminnot:`;
            const bulkDeleteBtn = document.createElement('button');
            bulkDeleteBtn.className = 'btn btn-danger';
            bulkDeleteBtn.textContent = '🗑️ Poista kaikki tämän rapun asunnot';
            bulkDeleteBtn.onclick = (e)=>{ e.stopPropagation(); deleteKerrostaloRappu(window._aptRappuFilter); };
            bulkBar.appendChild(info);
            bulkBar.appendChild(bulkDeleteBtn);
            container.appendChild(bulkBar);
        }

        const floors = Array.from(new Set(apts
            .filter(a=> !window._aptRappuFilter || a.toUpperCase().startsWith(window._aptRappuFilter))
            .map(a=>floorMap[a]))).sort((a,b)=>a-b);
        const tower = document.createElement('div');
        tower.className = 'vis-tower';
        const head = document.createElement('div'); head.className='vis-tower-head';
        const currentRappu = window._aptRappuFilter || null;
        head.innerHTML = `${currentRappu ? 'Kerrostalo — Rappu '+currentRappu : 'Kerrostalo'}`;
        // Nimeä rappu (kerrostalo-suodatin) uudelleen: vaihtaa kirjaimen ja päivittää kaikki ko. asunnot
        if (currentRappu) {
            const renameBtnKT = document.createElement('button');
            renameBtnKT.className = 'btn btn-secondary';
            renameBtnKT.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
            renameBtnKT.textContent = '✏️ Nimeä rappu';
            renameBtnKT.onclick = (e)=>{ e.stopPropagation(); renameKerrostaloRappu(currentRappu); };
            head.appendChild(renameBtnKT);
            const delRappuBtnKT = document.createElement('button');
            delRappuBtnKT.className = 'btn btn-secondary';
            delRappuBtnKT.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
            delRappuBtnKT.textContent = '🗑️ Poista rappu';
            delRappuBtnKT.onclick = (e)=>{ e.stopPropagation(); deleteKerrostaloRappu(currentRappu); };
            head.appendChild(delRappuBtnKT);
        }
        tower.appendChild(head);
        // Lisätään väli, jotta putkilinjat eivät peitä otsikon tai nappien päältä
        const headSpacer = document.createElement('div');
        headSpacer.style.cssText = 'height:14px;';
        tower.appendChild(headSpacer);
        const shaftLine = document.createElement('div'); shaftLine.className='vis-shaft-line'; tower.appendChild(shaftLine);
        const floorsContainer = document.createElement('div'); floorsContainer.className='vis-floors-container'; tower.appendChild(floorsContainer);
        floors.forEach(floorNum=>{
            const floorEl=document.createElement('div'); floorEl.className='vis-floor'; floorEl.setAttribute('data-floor-label', `${floorNum}. krs`);
            const floorApts = apts.filter(a=>floorMap[a]===floorNum && (!window._aptRappuFilter || a.toUpperCase().startsWith(window._aptRappuFilter))).sort();
            floorApts.forEach(aptCode=>{
                const aptEl=document.createElement('div'); aptEl.className='vis-apt';
                // Väri-koodaus: arvioi venttiilien flow vs targetFlow
                const aptDucts = (p.ducts||[]).filter(d=> d.group==='apt' && d.apartment===aptCode);
                const aptValveList = (p.valves||[]).filter(v=> aptDucts.some(d=> d.id===v.parentDuctId));
                let statusClass='ok';
                if (aptValveList.length>0){
                    const diffs = aptValveList.map(v=>{
                        const t = parseFloat(v.targetFlow||v.target||0); const f = parseFloat(v.flow||0);
                        if(!t || !f) return null; const rel = Math.abs(f-t)/(t||1);
                        return rel;
                    }).filter(x=> x!==null);
                    const worst = diffs.length? Math.max(...diffs) : null;
                    if (worst===null){ statusClass='none'; }
                    else if (worst < 0.10){ statusClass='ok'; }
                    else if (worst < 0.15){ statusClass='warn'; }
                    else { statusClass='err'; }
                } else { statusClass='none'; }
                aptEl.setAttribute('data-status', statusClass);
                const bg = statusClass==='ok'?'#d6f5d6': statusClass==='warn'?'#fff3cd': statusClass==='err'?'#fde2e1':'#f1f1f1';
                aptEl.style.background = bg;
                aptEl.innerHTML = `<div class=\"apt-head\"><span>${aptCode}</span>
                    <button class=\"list-action-btn\" title=\"Poista asunto\" onclick=\"event.stopPropagation();deleteApartment('${aptCode}')\">🗑️</button>
                </div>`;
                aptEl.onclick = (e)=>{ e.stopPropagation(); activeApartmentId = aptCode; renderHorizontalMap(container); };
                floorEl.appendChild(aptEl);
            });
            floorsContainer.appendChild(floorEl);
        });
        container.appendChild(tower);
        return;
    }
    shafts.forEach(shaft => {
        // Torni
        const tower = document.createElement('div');
        tower.className = 'vis-tower';

        // Tornin otsikko (rappu/runkonimi)
        const head = document.createElement('div');
        head.className = 'vis-tower-head';
        head.textContent = shaft.name || 'Rappu';
        // Väritä otsikko rappukirjaimen mukaan
        const letter = (shaft.name||'').trim().charAt(0).toUpperCase();
        const palette = {
            'A': {bg:'#e7f1ff', br:'#99c2ff'},
            'B': {bg:'#e9f9ee', br:'#9ddb9d'},
            'C': {bg:'#f3e9ff', br:'#c8a9ff'}
        };
        const colors = palette[letter] || {bg:'#fff', br:'#ccc'};
        head.style.background = colors.bg;
        head.style.border = `1px solid ${colors.br}`;
        head.style.borderRadius = '8px';
        head.style.padding = '4px 8px';
        // Rappunimen muokkaus
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-secondary';
        renameBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
        renameBtn.textContent = '✏️ Nimeä uudelleen';
        renameBtn.onclick = (e) => { e.stopPropagation(); renameRappu(shaft.id); };
        head.appendChild(renameBtn);
        // Poista rappu (poistaa rungon ja siihen liittyvät venttiilit)
        const delRappuBtn = document.createElement('button');
        delRappuBtn.className = 'btn btn-secondary';
        delRappuBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:12px; line-height:1;';
        delRappuBtn.title = 'Poista rappu';
        delRappuBtn.textContent = '🗑️ Rappu';
        delRappuBtn.onclick = (e) => { e.stopPropagation(); deleteRappu(shaft.id); };
        head.appendChild(delRappuBtn);
        // Pikanapit: Poista runko, ja "Vain tämä" -nappi, jos useampi rappu ja ei jo suodatettu
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-secondary';
        delBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:12px; line-height:1;';
        delBtn.title = 'Poista runko (Alt: ilman varmistusta)';
        delBtn.textContent = '🗑️';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteDuctFromVisual(shaft.id, e); };
        head.appendChild(delBtn);

        // Lisää venttiili tähän runkoon (pystynäkymä)
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-secondary';
        addBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
        addBtn.textContent = '+ Lisää venttiili';
        addBtn.onclick = (e) => { e.stopPropagation(); quickAddValveToDuct(shaft.id); };
        head.appendChild(addBtn);

        // Lisää Asunto -nappi (avataan yksinkertainen modal: Rappu, Kerros, Määrä)
        const addSimpleAptBtn = document.createElement('button');
        addSimpleAptBtn.className = 'btn btn-secondary';
        addSimpleAptBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
        addSimpleAptBtn.textContent = '+ Lisää Asunto';
        addSimpleAptBtn.onclick = (e) => { e.stopPropagation(); openAddAptsForFanModal(); };
        head.appendChild(addSimpleAptBtn);

        // Lisää huippuimureita (massa) nappi pystynäkymään asuntojen viereen
        const addFansBtn = document.createElement('button');
        addFansBtn.className = 'btn btn-secondary';
        addFansBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
        addFansBtn.textContent = '+ Lisää huippuimureita';
        addFansBtn.onclick = (e) => { e.stopPropagation(); openAddRoofFansModal(); };
        head.appendChild(addFansBtn);

        // Poistettu pyynnöstä: ei näytetä rikkinäistä "Lisää asuntoja"-nappia pystynäkymässä

        // Lisää "Näytä vain" -nappi suodatukseen
        if (totalShafts > 1) {
            const onlyBtn = document.createElement('button');
            onlyBtn.className = 'btn btn-secondary';
            onlyBtn.style.cssText = 'margin-left:6px; padding:2px 6px; font-size:11px;';
            onlyBtn.textContent = 'Näytä vain';
            onlyBtn.onclick = (e) => { e.stopPropagation(); filterTower(shaft.id); };
            head.appendChild(onlyBtn);
        }
        // Huippuimuri torniin aivan yläpäähän, ennen rappu-otsikkoa
        const roofUnit = document.createElement('div');
        roofUnit.className = 'vis-roof-unit';
        const sumExtract = (p.valves||[]).filter(v=>v.parentDuctId==shaft.id).reduce((a,b)=>a+(parseFloat(b.flow)||0),0);
        roofUnit.innerHTML = `<div style="font-size:20px;">⚙️</div><b>Huippuimuri</b><div class="sum">= Poisto ${sumExtract.toFixed(1)} l/s</div>`;
        roofUnit.onclick = () => editMachine(0);
        tower.appendChild(roofUnit);
        // Otsikko heti huippuimurin alla
        tower.appendChild(head);

        // Pystyhormi: aloita rappu-otsikon alaosasta
        const pipe = document.createElement('div');
        pipe.className = 'vis-shaft-line';
        // Aseta top dynaamisesti vastaamaan otsikon korkeutta
        requestAnimationFrame(() => {
            try {
                const y = (head.offsetTop || 0) + (head.offsetHeight || 0);
                pipe.style.top = (y + 4) + 'px';
            } catch(e) {}
        });
        tower.appendChild(pipe);

        // Kerrossäiliö alhaalta ylös (CSS column-reverse)
        const floorsContainer = document.createElement('div');
        floorsContainer.className = 'vis-floors-container';

        // Haetaan ja ryhmitellään asunnot
        const shaftValves = valves.filter(v => v.parentDuctId == shaft.id);
        if (shaftValves.length > 0) {
            const aptGroups = {};
            shaftValves.forEach(v => {
                const apt = v.apartment || 'Muu';
                if (!aptGroups[apt]) aptGroups[apt] = { totalQ: 0, targetQ: 0 };
                aptGroups[apt].totalQ += (parseFloat(v.flow) || 0);
                aptGroups[apt].targetQ += (parseFloat(v.target) || 0);
            });
            // Manuaalinen kerrosmääritys kartalla?
            const floorMap = (p.meta && p.meta.floorMap) || {};
            const aptList = Object.keys(aptGroups);
            const anyFloors = aptList.some(a => floorMap[a] !== undefined);
            if (anyFloors) {
                const floors = {};
                aptList.forEach(apt => {
                    const f = parseInt(floorMap[apt]);
                    const floorNum = isNaN(f) ? 0 : f;
                    if (!floors[floorNum]) floors[floorNum] = [];
                    floors[floorNum].push(apt);
                });
                const orderedFloors = Object.keys(floors).map(n=>parseInt(n)).sort((a,b)=>a-b);
                orderedFloors.forEach(floorNum => {
                    const floorDiv = document.createElement('div');
                    floorDiv.className = 'vis-floor';
                    floorDiv.setAttribute('data-floor-label', `Krs ${floorNum}`);
                    floors[floorNum].sort((a,b)=>a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }))
                        .forEach(apt => {
                            const data = aptGroups[apt];
                            const diff = Math.abs(data.totalQ - data.targetQ);
                            const hasMeasurement = (data.targetQ > 0) && (data.totalQ > 0);
                            const ratio = hasMeasurement ? (diff / data.targetQ) : null;
                            const statusClass = !hasMeasurement ? 'vis-status-none'
                                : (ratio < 0.10 ? 'vis-status-ok' : 'vis-status-err');
                            const box = document.createElement('div');
                            box.className = `vis-apt ${statusClass}`;
                            box.innerHTML = `<div class="apt-tooltip">= ${data.totalQ.toFixed(1)} / ${data.targetQ.toFixed(1)} l/s</div><b>${apt}</b><br>${data.totalQ.toFixed(1)} / ${data.targetQ.toFixed(1)}`;
                            box.onclick = () => showApartmentModal(apt, shaft.id);
                            floorDiv.appendChild(box);
                        });
                    floorsContainer.appendChild(floorDiv);
                });
            } else {
                // Järjestys: A1, A2, ... (numeric localeCompare)
                const sortedApts = aptList.sort((a,b)=>a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }));
                // Jaetaan kerroksiin aptsPerFloor -asetuksen mukaan
                for (let i=0; i<sortedApts.length; i+=APTS_PER_FLOOR) {
                    const floorDiv = document.createElement('div');
                    floorDiv.className = 'vis-floor';
                    const chunk = sortedApts.slice(i, i+APTS_PER_FLOOR);
                    chunk.forEach(apt => {
                        const data = aptGroups[apt];
                        const diff = Math.abs(data.totalQ - data.targetQ);
                        const hasMeasurement = (data.targetQ > 0) && (data.totalQ > 0);
                        const ratio = hasMeasurement ? (diff / data.targetQ) : null;
                        const statusClass = !hasMeasurement ? 'vis-status-none'
                            : (ratio < 0.10 ? 'vis-status-ok' : 'vis-status-err');
                        const box = document.createElement('div');
                        box.className = `vis-apt ${statusClass}`;
                        box.innerHTML = `<div class="apt-tooltip">= ${data.totalQ.toFixed(1)} / ${data.targetQ.toFixed(1)} l/s</div><b>${apt}</b><br>${data.totalQ.toFixed(1)} / ${data.targetQ.toFixed(1)}`;
                        box.onclick = () => showApartmentModal(apt, shaft.id);
                        floorDiv.appendChild(box);
                    });
                    floorsContainer.appendChild(floorDiv);
                }
            }
        }
        tower.appendChild(floorsContainer);
        container.appendChild(tower);
    });
}

// Manuaalinen asunnon kerroksen määritys
function setApartmentFloorPrompt(p, apt) {
    if (!p) return;
    if (!p.meta) p.meta = {};
    if (!p.meta.floorMap) p.meta.floorMap = {};
    const cur = p.meta.floorMap[apt];
    const input = prompt(`Aseta kerros asunnolle ${apt} (numero)`, cur !== undefined ? String(cur) : "");
    if (input === null) return; // cancel
    const num = parseInt(input);
    if (isNaN(num)) {
        alert("Virhe: syötä kelvollinen kerrosnumero.");
        return;
    }
    p.meta.floorMap[apt] = num;
    try { saveData(); } catch(e) {}
    // Päivitä näkymä
    renderVisualContent();
}

// --- UUSI VAAKANÄKYMÄ (KORJATTU NÄYTTÖ: Hz / Pa / %) ---
function renderHorizontalMap(container) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) { container.innerHTML = ''; return; }
    
    const viewingApt = activeApartmentId || null;
    container.innerHTML = '';
    
    if (viewingApt) {
        const backBar = document.createElement('div');
        backBar.style.cssText = 'display:flex; align-items:center; gap:8px; margin:6px 0;';
        backBar.innerHTML = `<button class="btn btn-secondary" style="padding:4px 8px; font-size:12px; background:#2196F3; color:#fff; border-color:#1976D2;" onclick="returnToKerrostalo()">← Takaisin kerrostaloon</button>
                             <span style="font-size:12px; color:#555;">Asunto ${viewingApt}</span>`;
        container.appendChild(backBar);
    }

    const ahu = (p.machines || []).find(m => m.type === 'ahu' && (!viewingApt || m.apartment === viewingApt)) || {name: (p.machines && p.machines[0]?.name) || 'IV-Kone' };
    
    // --- KONEEN TEKSTIN MUOTOILU (KORJATTU) ---
    let machineInfoText = "-";
    
    // Luetaan tallennetut arvot
    // Jos vanha kone, 'unit' voi puuttua -> käytetään oletusta
    const unit = ahu.unit || 'speed'; 
    const val = ahu.settingVal || ahu.speed || '-';
    
    if (unit === 'pa') {
        machineInfoText = `<b>${val} Pa</b> <span style="font-size:9px; opacity:0.8;">(Vakiopaine)</span>`;
    } else if (unit === 'hz') {
        machineInfoText = `<b>${val} Hz</b> <span style="font-size:9px; opacity:0.8;">(Taajuus)</span>`;
    } else {
        // Oletus / Speed
        machineInfoText = `<b>${val}%</b> <span style="font-size:9px; opacity:0.8;">(Nopeus)</span>`;
    }
    // -----------------------------------------------

    const supplies = (p.ducts || []).filter(d => d.type === 'supply' && ((d.group === 'ahu') || (viewingApt && d.group==='apt' && d.apartment===viewingApt)));
    const extracts = (p.ducts || []).filter(d => d.type === 'extract' && ((d.group === 'ahu') || (viewingApt && d.group==='apt' && d.apartment===viewingApt)));
    
    const sumSupply = (p.valves||[]).filter(v=> supplies.some(d=>d.id===v.parentDuctId)).reduce((a,b)=>a+(parseFloat(b.flow)||0),0);
    const sumExtract = (p.valves||[]).filter(v=> extracts.some(d=>d.id===v.parentDuctId)).reduce((a,b)=>a+(parseFloat(b.flow)||0),0);

    let html = `<div class="ahu-layout">`;
    
            // KONE-LAATIKKO
            html += `<div class="ahu-unit" onclick="editMachine(0)">
                <div style="font-size:20px;">⚙️</div>
                <b>${ahu.name || 'IV-Kone'}</b>
                <div style="font-size:11px; margin-top:4px; line-height:1.2;">${machineInfoText}</div>
             </div>`;
             
          html += `<div class="ahu-manifold">`;
          
          html += `<div class="ahu-orderbar">
                      <span class="badge supply">= Tulo ${sumSupply.toFixed(1)} l/s</span>
                      <span class="badge extract">= Poisto ${sumExtract.toFixed(1)} l/s</span>
                      <button class="btn-order" onclick="toggleValveOrder()">Järjestys: ${getValveOrderLabel()}</button>
                      <button class="btn-order" onclick="openRelativeAdjustPanel()">Ehdota suhteellista säätöä</button>
                  </div>`;
                  
    html += `<div class="ahu-area">
                <div class="ahu-area-title">Tulo</div>
                <div class="ahu-branch-wrap">${supplies.map(d => createBranchHTML(p, d, 'blue')).join('')}
                ${supplies.length === 0 ? '<div style="padding:10px; color:#999; font-size:11px;">Ei tulokanavia</div>' : ''}
                </div>
             </div>`;
             
    html += `<div class="ahu-area">
                <div class="ahu-area-title">Poisto</div>
                <div class="ahu-branch-wrap">${extracts.map(d => createBranchHTML(p, d, 'red')).join('')}
                ${extracts.length === 0 ? '<div style="padding:10px; color:#999; font-size:11px;">Ei poistokanavia</div>' : ''}
                </div>
             </div>`;
             
    html += `</div>`; // manifold
    html += `</div>`; // layout

    container.innerHTML += html;
}
                // Suhteellinen säätö: ehdottaa pieniä muutoksia venttiilien avaukseen
                function openRelativeAdjustPanel(){
                    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
                    const viewingApt = activeApartmentId || null;
                    const relevantDucts = (p.ducts||[]).filter(d=> (d.type==='supply'||d.type==='extract') && (!viewingApt || (d.group==='apt' && d.apartment===viewingApt)));
                    const valves = (p.valves||[]).filter(v=> relevantDucts.some(d=> d.id===v.parentDuctId));
                    const suggestions = suggestValveAdjustments(p, relevantDucts, valves);
                    if (!suggestions.length) { alert('Ei ehdotuksia. Venttiilit jo lähellä pyyntiä.'); return; }
                    const panel = document.getElementById('relativeAdjustPanel');
                    if (panel) {
                        panel.innerHTML = createRelativeAdjustPanel(suggestions);
                        panel.style.display = 'block';
                        window._lastValveSuggestions = suggestions;
                    } else {
                        showRelativeAdjustModal(p, suggestions);
                    }
                }

                // Keskushormin/kanavan virtaus- ja painelaskenta, huomioi venttiili-asetukset
                function calculateDuctFlowAndPressure(p, ductId, valves) {
                    const sumTargetFlow = valves.reduce((a, v) => a + (parseFloat(v.targetFlow || v.target || 0)), 0);
                    if (sumTargetFlow <= 0 || valves.length === 0) return { P_duct: 0, totalFlow: 0, flows: {} };
                    let P_low = 10, P_high = 200, P_duct = 50; 
                    let maxIterations = 50;
                    const tol = 0.1; // 0.1 l/s toleranssi

                    let actualFlow = 0;
                    let flows = {};

                    // Oletus: Vakiopaine, jota kone yrittää pitää (esim. 100 Pa)
                    const P_fan = 100; 

                    for (let i = 0; i < maxIterations; i++) {
                        actualFlow = 0;
                        flows = {};
                        
                        valves.forEach(v => {
                            const pos = parseFloat(v.pos || 0);
                            const type = v.type;
                            const k = (typeof defaultGetK === 'function') ? defaultGetK(type, pos) : 0;
                            const q = k * Math.sqrt(Math.max(0, P_duct));
                            flows[v._idx] = q;
                            actualFlow += q;
                        });

                        const flowError = sumTargetFlow - actualFlow;
                        
                        if (Math.abs(flowError) < tol) {
                            break; 
                        } else if (flowError > 0) {
                            P_low = P_duct; 
                            P_duct = (P_duct + P_high) / 2;
                        } else {
                            P_high = P_duct; 
                            P_duct = (P_duct + P_low) / 2;
                        }
                        
                        P_duct = Math.max(0, Math.min(300, P_duct));
                    }
                    
                    // Rajoitetaan lopputulosta koneen maksipaineeseen
                    P_duct = Math.min(P_duct, P_fan); 
                    
                    // Lasketaan lopulliset virtaukset valitulla P_duct-arvolla
                    actualFlow = 0; 
                    flows = {};
                    valves.forEach(v => {
                        const pos = parseFloat(v.pos || 0);
                        const type = v.type;
                        const k = (typeof defaultGetK === 'function') ? defaultGetK(type, pos) : 0;
                        const q = k * Math.sqrt(Math.max(0, P_duct));
                        flows[v._idx] = q;
                        actualFlow += q;
                    });
                    
                    return { P_duct: P_duct, totalFlow: actualFlow, flows: flows };
                }

                // script.js (Korvaa suggestValveAdjustments-funktio tällä uudella versiolla)
                function suggestValveAdjustments(p, ducts, valves) {
                    const suggestions = [];
                    const ductMap = {};

                    // Ryhmitellään venttiilit runkojen mukaan
                    valves.forEach((v, i) => {
                        if (!v.parentDuctId) return;
                        if (!ductMap[v.parentDuctId]) ductMap[v.parentDuctId] = [];
                        v._idx = i;
                        ductMap[v.parentDuctId].push(v);
                    });

                    for (const ductId in ductMap) {
                        const ductValves = ductMap[ductId];
                        // Lasketaan nykytilanne (paine ja virtaukset)
                        const currentSim = calculateDuctFlowAndPressure(p, ductId, ductValves);

                        // Etsitään venttiilit, joiden virhe on yli 1%
                        const adjustmentCandidates = ductValves
                            .map(v => {
                                const target = parseFloat(v.targetFlow || v.target || 0) || 0;
                                const flow = currentSim.flows[v._idx] || 0;
                                if (target === 0 || flow === 0) return null;
                                const relError = (target - flow) / (target || 1);
                                // Tarvittava K-arvo tavoitteeseen nykypaineella
                                const K_req = currentSim.P_duct > 0 ? target / Math.sqrt(currentSim.P_duct) : 0;
                                return { v, relError, K_req, flow, target };
                            })
                            .filter(x => x !== null && Math.abs(x.relError) > 0.01) // Virhe > 1%
                            .sort((a, b) => Math.abs(b.relError) - Math.abs(a.relError)); // Järjestetään pahin ensin

                        const worstValve = adjustmentCandidates[0];

                        if (worstValve) {
                            const { v, K_req, relError, target, flow } = worstValve;
                            const currentPos = parseFloat(v.pos || 0);

                            // 1. Haetaan venttiilikohtaiset rajat tietokannasta
                            let minPos = -20, maxPos = 100;
                            let isReverse = false; // Tunnistetaan käänteiset venttiilit
                            
                            if (window.valveDB && window.valveDB[v.type]) {
                                const data = window.valveDB[v.type].data;
                                if (data && data.length > 0) {
                                    minPos = data[0][0];
                                    maxPos = data[data.length - 1][0];
                                    // Tarkistetaan nouseeko vai laskeeko K-arvo asennon kasvaessa
                                    if (data.length > 1 && data[0][1] > data[data.length - 1][1]) {
                                        isReverse = true;
                                    }
                                }
                            }

                            // 2. Määritetään säätösuunta
                            const needMoreFlow = relError > 0; // Tarvitaan lisää virtausta
                            const step = (needMoreFlow !== isReverse) ? 1 : -1;
                            
                            // 3. Etsitään paras asento rajojen sisältä
                            let bestPos = currentPos;
                            let bestKDiff = Math.abs(((typeof defaultGetK === 'function' ? defaultGetK(v.type, currentPos) : 0)) - K_req);
                            
                            // Skannataan asentoja suuntaan "step" kunnes raja tulee vastaan tai tulos huononee
                            let testPos = currentPos;
                            for(let i=0; i<200; i++) { 
                                testPos += step; 
                                
                                // Pysähdytään jos mennään rajojen yli
                                if (testPos < minPos || testPos > maxPos) break;
                                
                                const testK = (typeof defaultGetK === 'function') ? defaultGetK(v.type, testPos) : 0;
                                const diff = Math.abs(testK - K_req);
                                
                                // Jos uusi asento on parempi, tallennetaan se
                                if (diff < bestKDiff) {
                                    bestKDiff = diff;
                                    bestPos = testPos;
                                } else {
                                    // Jos tulos alkaa huonontua (mentiin optimaalisen ohi), lopetetaan
                                    break;
                                }
                            }
                            
                            // Varmistus
                            bestPos = Math.max(minPos, Math.min(maxPos, bestPos));

                            // 4. Luodaan ehdotus venttiilille (jos asento muuttuu)
                            if (bestPos !== currentPos) {
                                const newK = (typeof defaultGetK === 'function') ? defaultGetK(v.type, bestPos) : 0;
                                const newSimFlow = newK * Math.sqrt(Math.max(0, currentSim.P_duct));
                                
                                suggestions.push({
                                    idx: v._idx,
                                    room: v.room,
                                    target: target,
                                    flow: flow,
                                    deltaPos: Math.round(bestPos - currentPos),
                                    finalPos: Math.round(bestPos),
                                    simulatedP: currentSim.P_duct,
                                    parentDuctId: ductId,
                                    simFlow: newSimFlow,
                                    type: 'valve'
                                });
                            }

                            // 5. TARKISTUS: Tarvitaanko koneen/paineen säätöä?
                            const finalK = (typeof defaultGetK === 'function') ? defaultGetK(v.type, bestPos) : 0;
                            const finalFlow = finalK * Math.sqrt(Math.max(0, currentSim.P_duct));
                            
                            const isFullyOpen = (!isReverse && bestPos >= maxPos) || (isReverse && bestPos <= minPos);
                            const isFullyClosed = (!isReverse && bestPos <= minPos) || (isReverse && bestPos >= maxPos);
                            
                            if (needMoreFlow && isFullyOpen && finalFlow < target * 0.95) {
                                suggestions.push({
                                    idx: -1, 
                                    room: `Runko: ${(p.ducts||[]).find(d=>d.id==ductId)?.name || 'Nimetön'}`,
                                    target: target,
                                    flow: currentSim.totalFlow,
                                    simulatedP: currentSim.P_duct,
                                    parentDuctId: ductId,
                                    type: 'machine',
                                    advice: `Nosta nopeutta/painetta (Venttiili '${v.room}' on täysin auki [${bestPos}] eikä riitä)`
                                });
                            } else if (!needMoreFlow && isFullyClosed && finalFlow > target * 1.05) {
                                suggestions.push({
                                    idx: -1, 
                                    room: `Runko: ${(p.ducts||[]).find(d=>d.id==ductId)?.name || 'Nimetön'}`,
                                    target: target,
                                    flow: currentSim.totalFlow,
                                    simulatedP: currentSim.P_duct,
                                    parentDuctId: ductId,
                                    type: 'machine',
                                    advice: `Laske nopeutta/painetta (Venttiili '${v.room}' on täysin kiinni [${bestPos}] ja virtaa liikaa)`
                                });
                            }
                        }
                    }
                    
                    return suggestions;
                }

                // Uusi navigointifunktio: suora säätö etusivulta
                function showRelativeAdjustShortcut() {
                    if (!activeProjectId) {
                        alert("Valitse tai luo ensin projekti!");
                        showView('view-projects');
                        return;
                    }
                    // Avaa visualisointi; paneeli renderöityy automaattisesti
                    showVisual();
                    // Vieritä paneelin kohdalle, jos halutaan
                    setTimeout(() => {
                        const panel = document.getElementById('relativeAdjustContainer');
                        if (panel) panel.scrollIntoView({ behavior: 'smooth' });
                    }, 300);
                }

                function showRelativeAdjustModal(p, suggestions){
                    // Luo modaalin sisällön
                    const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.style.display='flex';
                    const box = document.createElement('div'); box.className='modal';
                          box.innerHTML = `<div class="modal-header">Suhteellinen säätö — ehdotukset</div>
                                                 <div class="modal-content">
                                                     <div style="font-size:12px;color:#555;margin-bottom:8px;">Symboli = käytetään summana. Käytämme "=" Tulo/Poisto l/s arvioimaan kokonaisvirtaa vs. pyyntiä.</div>
                                        <table class="report" style="margin-top:4px;">
                                            <thead><tr><th>Kohde</th><th>Tyyppi</th><th>Pyynti (l/s)</th><th>Mitattu Q (l/s)</th><th>Simuloitu P (Pa)</th><th>Uusi Avaus (%)</th><th>Simuloitu Q (l/s)</th></tr></thead>
                                            <tbody>
                                                ${suggestions.map(s=>{
                                                    const isValve = s.type === 'valve';
                                                    const v = isValve ? ((p.valves||[])[s.idx] || {}) : {};
                                                    const flow = isValve ? (parseFloat(v.flow||0)||0) : s.flow || 0;
                                                    const deltaPosStr = isValve ? `${s.finalPos}` : (s.advice||'-');
                                                    return `<tr>
                                                                <td>${s.room||'Kohde'}</td>
                                                                <td>${isValve ? 'Venttiili' : 'IV-Kone'}</td>
                                                                <td>${(s.target||0).toFixed(1)}</td>
                                                                <td>${(flow||0).toFixed(1)}</td>
                                                                <td>${(s.simulatedP||0).toFixed(0)}</td>
                                                                <td style="font-weight:bold; color:${isValve?'#1976D2':'#d35400'};">${deltaPosStr}</td>
                                                                <td>${isValve ? (s.simFlow||0).toFixed(1) : '-'}</td>
                                                            </tr>`;
                                                }).join('')}
                                            </tbody>
                                        </table>
                                        <div style="font-size:12px;color:#d35400;margin-top:10px;">
                                           HUOM: Simuloitu P on arvio runkopaineesta, joka huomioi kaikkien venttiilien säädöt (ristiinlaskenta).
                                           Jos näet IV-Kone-ehdotuksen, korjaa koneen asetuksia ennen venttiilejä!
                                        </div>
                                     </div>
                                                 <div class="modal-actions">
                                                     <button class="btn btn-secondary" onclick="(function(){document.body.removeChild(document.querySelector('.modal-overlay'));})()">Peruuta</button>
                                                     <button class="btn btn-outline" onclick="(function(){ window.revertOriginalPositions && revertOriginalPositions(); })()">Palauta alkuperäinen avaus</button>
                                                     <button class="btn btn-primary" onclick="(function(){ window.applySuggestedAdjustments && applySuggestedAdjustments(); })()">Hyväksy muutokset</button>
                                                 </div>`;
                    overlay.appendChild(box);
                    document.body.appendChild(overlay);
                    // Talleta ehdotukset globaalisti hetkeksi
                    window._lastValveSuggestions = suggestions;
                    window.applySuggestedAdjustments = function(){
                        const p2 = projects.find(x => x.id === activeProjectId); if(!p2) return;
                        (window._lastValveSuggestions||[]).forEach(s=>{
                            const v = (p2.valves||[])[s.idx]; if (!v) return;
                            if (s.type === 'valve' && s.finalPos !== undefined) {
                                v.pos = s.finalPos; // käytä laskettua loppuasentoa
                            }
                        });
                        // Tarkista koneen teho: jos = Tulo < = Pyynti selvästi, ehdota nostoa
                        const viewingApt = activeApartmentId || null;
                        const supplies = (p2.ducts||[]).filter(d=> d.type==='supply' && (!viewingApt || (d.group==='apt' && d.apartment===viewingApt)));
                        const valvesSup = (p2.valves||[]).filter(v=> supplies.some(d=> d.id===v.parentDuctId));
                        const sumTarget = valvesSup.reduce((a,v)=> a + (parseFloat(v.targetFlow||v.target||0)||0), 0);
                        const sumFlow = valvesSup.reduce((a,v)=> a + (parseFloat(v.flow||0)||0), 0);
                        if (sumFlow < 0.9*sumTarget) {
                            alert(`Vinkki: = Tulo ${sumFlow.toFixed(1)} l/s < = Pyynti ${sumTarget.toFixed(1)} l/s. Nosta koneen tulo-tehoa (supPct).`);
                        }
                        try { saveData(); } catch(e) {}
                        renderVisualContent();
                        // Sulje modal
                        if (document.querySelector('.modal-overlay')) document.body.removeChild(document.querySelector('.modal-overlay'));
                    }
                    // Palauta alkuperäiset avaukset (ennen hyväksyntää): käyttää originalPos kenttää
                    window.revertOriginalPositions = function(){
                        const p2 = projects.find(x => x.id === activeProjectId); if(!p2) return;
                        (window._lastValveSuggestions||[]).forEach(s=>{
                            if (s.type === 'valve' && s.originalPos !== undefined) {
                                const v = (p2.valves||[])[s.idx]; if (!v) return;
                                v.pos = Math.max(0, Math.min(100, Math.round(s.originalPos)));
                            }
                        });
                        try { saveData(); } catch(e) {}
                        renderVisualContent();
                        if (document.querySelector('.modal-overlay')) document.body.removeChild(document.querySelector('.modal-overlay'));
                    }
                }

// Pienen haaran HTML tulo/poisto -vaakanäkymään (SISÄLTÄÄ NYT MITTAUS-NAPIN)
function createBranchHTML(p, duct, colorName){
    const valves = (p.valves||[]).filter(v => v.parentDuctId === duct.id && !v.apartment);
    ensureValveOrder(p, duct.id, valves);
    
    // Järjestelylogiikka
    const order = (p.meta && p.meta.valveOrder && Array.isArray(p.meta.valveOrder[duct.id])) ? p.meta.valveOrder[duct.id] : [];
    const mapIndex = v => p.valves.indexOf(v);
    valves.sort((a,b)=>{
        const ia = order.indexOf(mapIndex(a));
        const ib = order.indexOf(mapIndex(b));
        if (ia !== -1 && ib !== -1) return ia - ib;
        return 0;
    });

    const valveCount = Math.max(1, valves.length);
    const branchTitle = duct.name || (duct.type==='supply' ? 'Tulo' : 'Poisto');
    const colorHex = colorName === 'blue' ? '#2196F3' : '#e91e63';
    const grad = colorName === 'blue' ? 'linear-gradient(90deg, #2196F3, #64b5f6)' : 'linear-gradient(90deg, #e91e63, #f48fb1)';
    
    const sumFlow = valves.reduce((acc, v) => acc + (parseFloat(v.flow)||0), 0).toFixed(1);
    
    // --- VUOTOLASKENTA (Näkyy vain jos runko on mitattu) ---
    let measuredInfo = "";
    if (duct.measuredFlow) {
        const diff = duct.measuredFlow - sumFlow;
        const pct = duct.measuredFlow > 0 ? (diff / duct.measuredFlow) * 100 : 0;
        
        // Väri: Vihreä jos OK, Punainen jos yli 10% heitto
        let color = "#4caf50"; 
        let text = "OK";
        if (Math.abs(pct) > 10) { color = "#f44336"; text = "Vuoto?"; }
        
        measuredInfo = `<span style="font-size:11px; color:${color}; margin-left:8px; border:1px solid ${color}; padding:2px 6px; border-radius:4px; background:#fff;">
                        Pitot: ${duct.measuredFlow} l/s (Ero ${diff.toFixed(1)}) <b>${text}</b>
                        </span>`;
    }
    // -----------------------------------------------------------

    const valvesHTML = valves.map((v, i) => {
        const idx = p.valves.indexOf(v);
        const flow = parseFloat(v.flow)||0;
        const pos = (v.pos !== undefined && v.pos !== null) ? v.pos : '-';
        const pa = (v.measuredP !== undefined && v.measuredP !== null) ? v.measuredP : '-';
        const room = v.room || 'Huone';
        const target = (parseFloat(v.target)||0);
        
        // Värikoodaus
        let status = 'none';
        if (target>0 && flow>0) {
            const diff = Math.abs(flow - target);
            if(diff/target < 0.10) status='ok'; else if(diff/target < 0.15) status='warn'; else status='err';
        }
        
        const leftPct = ((i+1)/(valveCount+1))*100;
        
        return `<div class="tap ${status}" style="left:${leftPct}%" onclick="event.stopPropagation();openValvePanel(${idx})">
                    <div class="tap-label">
                        <b>${room}</b> • ${flow.toFixed(1)} l/s
                        <div style="font-size:9px; color:#666;">${pos!=='='?`Pos: ${pos}`:''} ${pa!=='-'?` | ${pa} Pa`:''}</div>
                        <div style="margin-top:2px;">
                             <button class="list-action-btn" onclick="event.stopPropagation();moveValveInDuct(${duct.id}, ${idx}, -1)">◀</button>
                             <button class="list-action-btn" onclick="event.stopPropagation();moveValveInDuct(${duct.id}, ${idx}, 1)">▶</button>
                             <button class="list-action-btn" onclick="event.stopPropagation();deleteValveByIndex(${idx})">🗑️</button>
                             <button class="list-action-btn" onclick="event.stopPropagation();showValveMenu(${idx})">⋮</button>
                        </div>
                    </div>
                </div>`;
    }).join('');

    // RUNGON HEADER - TÄHÄN ON LISÄTTY "MITTAA" NAPPI
    return `
        <div class="ahu-branch" style="border-left: 4px solid ${colorHex};">
            <span class="branch-connector" style="background:${grad};"></span>
            <h4 style="color:${colorHex}; cursor:pointer;" onclick="event.stopPropagation();editDuctInline(${duct.id})">
                ${duct.name} <span style="font-weight:normal; color:#888;">(${duct.size})</span>
                <span style="margin-left:8px; font-weight:normal; color:#666;">= ${sumFlow} l/s</span>
                ${measuredInfo}
                
                <button class="list-action-btn" title="Poista runko" style="float:right; font-size:14px; color:#bbb;" onclick="event.stopPropagation();deleteDuctFromVisual(${duct.id}, event)">🗑️</button>
                
                <button class="list-action-btn" title="Mittaa runko (Pitot)" style="float:right; font-size:12px; background:#e3f2fd; color:#1565c0; margin-right:8px; font-weight:bold; padding:2px 6px; border-radius:4px;" onclick="event.stopPropagation();openDuctMeasureModal(${duct.id})">📊 Mittaa</button>
                
                <button class="list-action-btn" title="Lisää venttiili" style="float:right; font-size:14px; color:${colorHex}; margin-right:8px;" onclick="event.stopPropagation();quickAddValveToDuct(${duct.id})">+ Venttiili</button>
                <button class="list-action-btn" title="Nimeä uudelleen" style="float:right; font-size:14px; color:#666; margin-right:8px;" onclick="event.stopPropagation();renameRappu(${duct.id})">✏️</button>
            </h4>
            
            <div class="branch-summary">= Venttiilejä: ${valves.length}</div>
            ${valves.length ? `<div class="branch-pipe" style="background:${colorName==='blue'?'#64b5f6':'#f48fb1'};">${valvesHTML}</div>` : '<span style="font-size:10px; color:#ccc; padding:10px;">Ei venttiilejä</span>'}
        </div>`;
}
                                // Lisää huippuimuri(t) - valintamodaali
                                function openAddRoofFansModal(){
                                        const p = projects.find(x => x.id === activeProjectId);
                                        if(!p) return;
                                        const roofDucts = (p.ducts||[]).filter(d=> d.group==='roof' && d.type==='extract');
                                    const letters = Array.from(new Set(roofDucts.map(d=> (d.name||'').trim().charAt(0).toUpperCase()).filter(Boolean)));
                                    const nextLetter = nextAlphabetLetter(letters);
                                        const html = `
                                                <div style="padding:8px;">
                                                    <h3>Lisää huippuimureita</h3>
                                                    <label>Alkukirjain:</label>
                                                    <input id="fanStartLetter" type="text" value="${nextLetter}" maxlength="1" style="width:40px;"> 
                                                    <label style="margin-left:8px;">Määrä:</label>
                                                    <select id="fanCount" class="input input-sm" style="width:100px;">
                                                        ${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}">${n}</option>`).join('')}
                                                    </select>
                                                    <div style="margin-top:10px;">
                                                        <button class="btn btn-primary" onclick="confirmAddRoofFans()">Lisää</button>
                                                        <button class="btn btn-secondary" onclick="closeModal()">Peruuta</button>
                                                    </div>
                                                </div>`;
                                        openModal(html);
                                }

                                function confirmAddRoofFans(){
                                        const p = projects.find(x => x.id === activeProjectId);
                                        if(!p) { closeModal(); return; }
                                        if(!p.machines) p.machines = [];
                                        if(!p.ducts) p.ducts = [];
                                    const start = (document.getElementById('fanStartLetter').value||'A').toUpperCase();
                                        const count = Math.max(1, parseInt(document.getElementById('fanCount').value||'1'));
                                    const alph = getFinnishAlphabet();
                                    let idx = alph.indexOf(start); if(idx<0) idx = 0;
                                    for(let i=0;i<count;i++){
                                        const letter = alph[(idx + i) % alph.length];
                                                const name = `${letter} Rappu Poisto`;
                                                // Luo huippuimuri laite
                                                p.machines.push({ name: `Huippuimuri ${letter}`, type: 'roof_fan', speed: '1' });
                                                // Luo kattopoiston runko, jos puuttuu
                                                const exists = (p.ducts||[]).some(d=> d.group==='roof' && d.type==='extract' && (d.name||'').toUpperCase().startsWith(letter));
                                                if(!exists){ p.ducts.push({ id: genId(), name, type: 'extract', group: 'roof', size: 160, flow: 0 }); }
                                        }
                                        saveProjects(); closeModal(); renderVisualContent();
                                }

                // Palaa aktiiviseen projektiin
                function getCurrentProject(){
                    return (projects||[]).find(x => x.id === activeProjectId);
                }

                // Luo kerrostalo-asunnot: start floor, floor count, per-floor count, creates per-apartment AHU ducts/machine
                function openCreateAptAHUModal(){
                    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
                    const alph = getFinnishAlphabet();
                    const letterOpts = alph.map(l=>`<option value="${l}">${l}</option>`).join('');
                    const html = `
                        <div style="padding:8px;">
                            <h3>Kerrostalo: Luo asuntoja</h3>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                <label>Rappu:
                                    <select id="aptRappuKH" class="input input-sm" style="width:100px;">${letterOpts}</select>
                                </label>
                                <label>Alkukerros:
                                    <input id="aptStartFloorKH" type="number" value="1" min="-3" max="99" style="width:90px;">
                                </label>
                                <label>Kerrosmäärä:
                                    <input id="aptFloorCountKH" type="number" value="3" min="1" max="99" style="width:110px;">
                                </label>
                                <label>Asuntoja / kerros:
                                    <input id="aptPerFloorKH" type="number" value="2" min="1" max="20" style="width:130px;">
                                </label>
                            </div>
                            <div style="margin-top:10px;">
                                <button class="btn btn-primary" onclick="confirmCreateAptAHU()">Luo</button>
                                <button class="btn btn-secondary" onclick="closeModal()">Peruuta</button>
                            </div>
                        </div>`;
                    openModal(html);
                }
                function confirmCreateAptAHU(){
                    const p = projects.find(x => x.id === activeProjectId); if(!p){ closeModal(); return; }
                    const rappu = (document.getElementById('aptRappuKH')?.value||'A').toUpperCase();
                    const startFloor = parseInt(document.getElementById('aptStartFloorKH')?.value||'1',10);
                    const floorCount = Math.max(1, parseInt(document.getElementById('aptFloorCountKH')?.value||'1',10));
                    const perFloor = Math.max(1, parseInt(document.getElementById('aptPerFloorKH')?.value||'1',10));
                    if(!p.meta) p.meta={}; if(!p.meta.floorMap) p.meta.floorMap={};
                    for(let f=0; f<floorCount; f++){
                        const floor = startFloor + f;
                        for(let i=1; i<=perFloor; i++){
                            const aptCode = `${rappu}${floor}${i}`;
                            // Create per-apartment AHU ducts and machine
                            const supId = genId(), extId = genId();
                            p.ducts.push({ id: supId, type: 'supply', name: `Tulo ${aptCode}`, size: 125, group:'apt', apartment: aptCode });
                            p.ducts.push({ id: extId, type: 'extract', name: `Poisto ${aptCode}`, size: 125, group:'apt', apartment: aptCode });
                            p.machines.push({ type:'ahu', name:`IV-Kone ${aptCode}`, supPct:50, extPct:50, apartment: aptCode });
                            p.meta.floorMap[aptCode] = floor;
                        }
                    }
                    saveProjects(); closeModal(); renderVisualContent();
                }

                function returnToKerrostalo(){ activeApartmentId = null; setVisualMode('vertical'); renderVisualContent(); }

                                // Luo yhden huippuimurin alle monta asuntoa kerralla
                                function openAddAptsForFanModal(){
                                        const p = projects.find(x => x.id === activeProjectId); if(!p) return;
                                        const roofDucts = (p.ducts||[]).filter(d=> d.group==='roof' && d.type==='extract');
                                        const rappuLetters = Array.from(new Set(roofDucts.map(d=> (d.name||'').trim().charAt(0).toUpperCase()).filter(Boolean))).sort();
                                        const letterOpts = rappuLetters.length? rappuLetters.map(l=>`<option value="${l}">${l}</option>`).join('') : '<option value="">-</option>';
                                        const html = `
                                            <div style="padding:8px;">
                                                <h3>Lisää asuntoja</h3>
                                                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                                    <label>Rappu:
                                                        <select id="aptFanRappu" class="input input-sm" style="width:100px;">${letterOpts}</select>
                                                    </label>
                                                    <label>Alkukerros:
                                                        <input id="aptStartFloor" type="number" value="1" min="-3" max="99" style="width:90px;">
                                                    </label>
                                                    <label>Kerrosmäärä:
                                                        <input id="aptFloorCount" type="number" value="1" min="1" max="99" style="width:110px;">
                                                    </label>
                                                    <label>Määrä / kerros:
                                                        <input id="aptPerFloorCount" type="number" value="3" min="1" max="200" style="width:130px;">
                                                    </label>
                                                </div>
                                                <div style="margin-top:10px;">
                                                    <button class="btn btn-primary" onclick="confirmAddAptsForFan()">Lisää</button>
                                                    <button class="btn btn-secondary" onclick="closeModal()">Peruuta</button>
                                                </div>
                                            </div>`;
                                        openModal(html);
                                }

                                function confirmAddAptsForFan(){
                                        const p = projects.find(x => x.id === activeProjectId); if(!p) { closeModal(); return; }
                                        const rap = (document.getElementById('aptFanRappu')?.value||'').toUpperCase();
                                        const startFloor = parseInt(document.getElementById('aptStartFloor')?.value||'1',10);
                                        const floorCount = Math.max(1, parseInt(document.getElementById('aptFloorCount')?.value||'1',10));
                                        const perFloor = Math.max(1, parseInt(document.getElementById('aptPerFloorCount')?.value||'1',10));
                                        const duct = (p.ducts||[]).find(d=> d.group==='roof' && d.type==='extract' && (d.name||'').toUpperCase().startsWith(rap));
                                        if(!duct){ alert('Valittu rappu puuttuu.'); return; }
                                        p.valves = p.valves||[];
                                        if(!p.meta) p.meta={}; if(!p.meta.floorMap) p.meta.floorMap={};
                                        for(let f=0; f<floorCount; f++){
                                            const floor = startFloor + f;
                                            for(let i=1; i<=perFloor; i++){
                                                const apt = `${rap}${floor}${i}`;
                                                p.valves.push({ id: genId(), parentDuctId: duct.id, apartment: apt, room: 'Asunto', flow: 0, target: 0 });
                                                p.meta.floorMap[apt] = floor;
                                            }
                                        }
                                        saveProjects(); closeModal(); renderVisualContent();
                                }

                function openCreateRaputModal(){
                    const p = getCurrentProject();
                    const existingLetters = (p.ducts||[]).filter(d=>d.group==='roof').map(d=>{
                        const m = (d.name||'').match(/^([A-ZÅÄÖ])/i); return m? m[1].toUpperCase(): null;
                    }).filter(Boolean);
                    const startLetter = nextAlphabetLetter(existingLetters);
                    const html = `
                        <div style="padding:8px;">
                          <h3>Luo useita rappuja</h3>
                          <label>Alkukirjain:</label>
                          <input id="rapuStartLetter" type="text" value="${startLetter}" maxlength="1" style="width:40px;"> 
                          <label style="margin-left:8px;">Määrä:</label>
                          <input id="rapuCount" type="number" value="2" min="1" max="26" style="width:80px;">
                          <div style="margin-top:10px;">
                            <button class="btn btn-primary" onclick="confirmCreateRaput()">Luo</button>
                            <button class="btn btn-secondary" onclick="closeModal()">Peruuta</button>
                          </div>
                        </div>`;
                    openModal(html);
                }

                function getFinnishAlphabet(){
                    // Finnish alphabet order: A..Z, Å, Ä, Ö
                    const base = Array.from({length:26}, (_,i)=>String.fromCharCode('A'.charCodeAt(0)+i));
                    return base.concat(['Å','Ä','Ö']);
                }
                function nextAlphabetLetter(letters){
                    const alph = getFinnishAlphabet();
                    const arr = (letters||[]).filter(Boolean).map(l=>l.toUpperCase()).sort((a,b)=>alph.indexOf(a)-alph.indexOf(b));
                    if(arr.length===0) return 'A';
                    const last = arr[arr.length-1];
                    const idx = alph.indexOf(last);
                    return alph[(idx>=0 && idx<alph.length-1) ? idx+1 : 0];
                }

                function confirmCreateRaput(){
                    const p = getCurrentProject();
                    const start = (document.getElementById('rapuStartLetter').value||'A').toUpperCase();
                    const count = Math.max(1, parseInt(document.getElementById('rapuCount').value||'1'));
                    const alph = getFinnishAlphabet();
                    let idx = alph.indexOf(start); if(idx<0) idx = 0;
                    for(let i=0;i<count;i++){
                        const letter = alph[(idx + i) % alph.length];
                        const name = `${letter} Rappu Poisto`;
                        // Skip if exists (roof extract with same letter)
                        if((p.ducts||[]).some(d=> (d.group==='roof' && d.type==='extract') && ((d.name||'').toUpperCase().startsWith(letter)))){
                            continue;
                        }
                        const newDuct = { id: genId(), group:'roof', type:'extract', name, size:160, flow:0, valves:[] };
                        p.ducts = p.ducts || []; p.ducts.push(newDuct);
                    }
                    saveProjects(); closeModal(); renderVisualContent();
                }

                function renameRappu(ductId){
                    const p = getCurrentProject();
                    const d = (p.ducts||[]).find(x=>x.id===ductId);
                    if(!d){ return; }
                    const current = d.name||'';
                    const html = `
                        <div style="padding:8px;">
                          <h3>Nimeä rappu uudelleen</h3>
                          <label>Uusi nimi:</label>
                          <input id="rapuNewName" type="text" value="${current}" style="width:260px;">
                          <div style="margin-top:10px;">
                            <button class="btn btn-primary" onclick="confirmRenameRappu('${ductId}')">Tallenna</button>
                            <button class="btn btn-secondary" onclick="closeModal()">Peruuta</button>
                          </div>
                        </div>`;
                    openModal(html);
                }

                function confirmRenameRappu(ductId){
                    const p = getCurrentProject();
                    const d = (p.ducts||[]).find(x=>x.id===ductId);
                    if(!d){ closeModal(); return; }
                    const val = (document.getElementById('rapuNewName').value||'').trim();
                    if(val){ d.name = val; saveProjects(); }
                    closeModal(); renderVisualContent();
                }

                function openCopyRappuModal(preselectDst){
                    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
                    const ovId = 'copy-rappu-modal';
                    let ov = document.getElementById(ovId);
                    if(!ov){ ov = document.createElement('div'); ov.id = ovId; ov.className = 'modal-overlay'; document.body.appendChild(ov); }
                    const roofDucts = (p.ducts||[]).filter(d=>d.group==='roof' && d.type==='extract');
                    const rappuLetters = Array.from(new Set(roofDucts.map(d=> (d.name||'').trim().charAt(0).toUpperCase()).filter(Boolean))).sort();
                    const letterOpts = rappuLetters.length? rappuLetters.map(l=>`<option value="${l}">${l}</option>`).join('') : '<option value="">-</option>';
                    ov.innerHTML = `
                        <div class="modal">
                            <div class="modal-header">Kopioi rappujen tiedot</div>
                            <div class="modal-content">
                                <div class="valve-edit-row">
                                    <label>Kopioi rappu
                                        <select id="copySrcRappu" class="input input-sm w-120">${letterOpts}</select>
                                    </label>
                                    <label>Kohderappu
                                        <select id="copyDstRappu" class="input input-sm w-120">${letterOpts}</select>
                                    </label>
                                </div>
                            </div>
                            <div class="modal-actions">
                                <button class="btn btn-primary" onclick="confirmCopyRappu()">Kopioi</button>
                                <button class="btn" onclick="closeCopyRappuModal()">Peruuta</button>
                            </div>
                        </div>`;
                    ov.style.display = 'flex';
                    // Esivalitse kohderappu seuraavaksi kirjaimeksi
                    try{ if(preselectDst){ const dstSel = document.getElementById('copyDstRappu'); if(dstSel) dstSel.value = preselectDst; } }catch(e){}
                }
                function closeCopyRappuModal(){ const el=document.getElementById('copy-rappu-modal'); if(el){ el.style.display='none'; el.innerHTML=''; } }
                function confirmCopyRappu(){
                    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
                    const src = (document.getElementById('copySrcRappu')?.value||'').toUpperCase();
                    const floor = parseInt(document.getElementById('aptFloor')?.value||'1');
                    const count = Math.max(1, parseInt(document.getElementById('aptCount')?.value||'1'));
                    const ductSrc = ducts.find(d=> (d.group==='roof' && d.type==='extract') && (d.name||'').toUpperCase().startsWith(src));
                    let ductDst = ducts.find(d=> (d.group==='roof' && d.type==='extract') && (d.name||'').toUpperCase().startsWith(dst));
                    if(!ductDst){ const id = Date.now(); ducts.push({ id, name: `${dst} Rappu Poisto`, type:'extract', group:'roof', size:160, flow:0 }); ductDst = ducts.find(d=>d.id===id); }
                    if(!ductSrc || !ductDst){ alert('Rappua ei löytynyt. Lisää rungot ensin.'); return; }
                    for(let i=1; i<=count; i++){
                        const apt = `${rap}${floor}${i}`;
                        p.valves.push({ id: genId(), parentDuctId: duct.id, apartment: apt, room: 'Asunto', flow: 0, target: 0 });
                        p.meta.floorMap[apt] = floor;
                    }
                    // Manual per-duct order support with fallback to sort key
                    ensureValveOrder(p, duct.id, valves);
                    const order = (p.meta && p.meta.valveOrder && p.meta.valveOrder[duct.id]) || [];
                    const mapIndex = v => p.valves.indexOf(v);
                    valves = valves.slice().sort((a,b)=>{
                        const ia = order.indexOf(mapIndex(a));
                        const ib = order.indexOf(mapIndex(b));
                        if (ia !== -1 && ib !== -1) return ia - ib;
                        // Fallback to global sort if missing
                        const mode = window._valveSortKey || 'room';
                        if (mode === 'room') return (a.room||'').localeCompare(b.room||'');
                        if (mode === 'flow') return (parseFloat(a.flow)||0) - (parseFloat(b.flow)||0);
                        if (mode === 'pos') return (parseFloat(a.pos)||0) - (parseFloat(b.pos)||0);
                        const ax = (a.apartment||''); const bx = (b.apartment||'');
                        const an = parseInt(ax.replace(/[^0-9]/g,''),10)||0; const bn = parseInt(bx.replace(/[^0-9]/g,''),10)||0;
                        const al = (ax.match(/^[A-Za-z]+/)||[''])[0]; const bl = (bx.match(/^[A-Za-z]+/)||[''])[0];
                        return al.localeCompare(bl) || an - bn;
                    });
                    const colorHex = colorName === 'blue' ? '#2196F3' : '#e91e63';
                    const grad = colorName === 'blue' ? 'linear-gradient(90deg, #2196F3, #64b5f6)' : 'linear-gradient(90deg, #e91e63, #f48fb1)';

                    const sumFlow = valves.reduce((acc, v) => acc + (parseFloat(v.flow)||0), 0).toFixed(1);
                    const paValues = valves.map(v => parseFloat(v.measuredP)).filter(x => !isNaN(x));
                    const paMin = paValues.length ? Math.min(...paValues).toFixed(1) : '-';
                    const paMax = paValues.length ? Math.max(...paValues).toFixed(1) : '-';

                    // Render taps along one horizontal pipe, evenly spaced side-by-side
                    const valveCount = Math.max(1, valves.length);
                    // Näytä vaakanäkymässä vain rungolle lisätyt venttiilit (ei kerrostaloasuntojen)
                    const valvesHTML = valves.filter(v => v.parentDuctId === duct.id && !v.apartment).map((v, i) => {
                        const idx = p.valves.indexOf(v);
                        const flow = parseFloat(v.flow)||0;
                        const pos = (v.pos !== undefined && v.pos !== null) ? v.pos : '-';
                        const pa = (v.measuredP !== undefined && v.measuredP !== null) ? v.measuredP : '-';
                        const room = v.room || 'Huone';
                        const target = (parseFloat(v.target)||0);
                        const hasMeasurement = target>0 && flow>0;
                        const diff = Math.abs(flow - target);
                        const status = !hasMeasurement ? 'none' : (diff/target < 0.10 ? 'ok' : 'err');
                        const leftPct = ((i+1)/(valveCount+1))*100;
                        return `<div class="tap ${status}" style="left:${leftPct}%" onclick="event.stopPropagation();openValvePanel(${idx})">
                                    <div class="tap-label">
                                        <b>${room}</b> • ${flow.toFixed(1)} l/s${target?` / ${target}`:''}${pa!=='-'?` • ${pa} Pa`:''}${pos!=='-'?` • Avaus ${Math.round(pos)}`:''}
                                        <button class="list-action-btn" title="Siirrä vasemmalle" style="margin-left:6px; font-size:14px; color:#666;" onclick="event.stopPropagation();moveValveInDuct(${duct.id}, ${idx}, -1)">◀</button>
                                        <button class="list-action-btn" title="Siirrä oikealle" style="margin-left:2px; font-size:14px; color:#666;" onclick="event.stopPropagation();moveValveInDuct(${duct.id}, ${idx}, 1)">▶</button>
                                        <button class="list-action-btn" title="Poista venttiili" style="margin-left:6px; font-size:14px; color:#bbb;" onclick="event.stopPropagation();deleteValveByIndex(${idx})">🗑️</button>
                                        <button class="list-action-btn" title="Lisää vaihtoehdot" style="margin-left:6px; font-size:14px; color:#999;" onclick="event.stopPropagation();showValveMenu(${idx})">⋮</button>
                                    </div>
                                </div>`;
                    }).join('');

                    return `
                        <div class="ahu-branch" style="border-left: 4px solid ${colorHex};">
                            <span class="branch-connector" style="background:${grad};"></span>
                            <h4 style="color:${colorHex}; cursor:pointer;" onclick="event.stopPropagation();editDuctInline(${duct.id})">
                                ${duct.name} <span style="font-weight:normal; color:#888;">(${duct.size})</span>
                                <span style="margin-left:8px; font-weight:normal; color:#666;">= mitattu: ${(duct.flow||0).toFixed ? (duct.flow||0).toFixed(1) : (parseFloat(duct.flow)||0).toFixed(1)} l/s</span>
                                <button class="list-action-btn" title="Poista runko" style="float:right; font-size:14px; color:#bbb;" onclick="event.stopPropagation();deleteDuctFromVisual(${duct.id}, event)">🗑️</button>
                                <button class="list-action-btn" title="Lisää venttiili tähän runkoon" style="float:right; font-size:14px; color:${colorHex}; margin-right:8px;" onclick="event.stopPropagation();quickAddValveToDuct(${duct.id})">+ Lisää venttiili</button>
                                <button class="list-action-btn" title="Lisää asunto (massa)" style="float:right; font-size:14px; color:${colorHex}; margin-right:8px;" onclick="event.stopPropagation();openAddApartmentModal()">+ Lisää asunto</button>
                                <button class="list-action-btn" title="Nimeä runko uudelleen" style="float:right; font-size:14px; color:#666; margin-right:8px;" onclick="event.stopPropagation();renameRappu(${duct.id})">✏️ Nimeä uudelleen</button>
                            </h4>
                            ${window._editingDuctId===duct.id?`
                            <div class="duct-edit-box" style="background:#fafafa; border:1px solid #ddd; border-radius:6px; padding:10px; margin:6px 0 10px 0;">
                                <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                                    <label style="color:#444;">Rungon koko (mm)
                                        <input id="duct-size-${duct.id}" type="number" min="50" step="10" value="${duct.size!==undefined?duct.size:''}" style="margin-left:6px; width:90px; padding:4px 6px;">
                                    </label>
                                    <label style="color:#444;">Mitattu virtaus (l/s)
                                        <input id="duct-flow-${duct.id}" type="number" min="0" step="0.1" value="${duct.flow!==undefined?duct.flow:''}" style="margin-left:6px; width:110px; padding:4px 6px;">
                                    </label>
                                    <span style="flex:1 1 auto;"></span>
                                    <button class="list-action-btn" style="background:#1976d2; color:#fff; padding:6px 10px; border-radius:4px;" onclick="event.stopPropagation();saveDuctInline(${duct.id})">Tallenna</button>
                                    <button class="list-action-btn" style="background:#eee; color:#444; padding:6px 10px; border-radius:4px;" onclick="event.stopPropagation();cancelDuctInline()">Peruuta</button>
                                </div>
                            </div>`:''}
                            <div class="branch-summary">= l/s: ${sumFlow} • Pa: ${paMin}…${paMax} • Venttiilejä: ${valves.length}</div>
                            ${valves.filter(v => v.parentDuctId === duct.id && !v.apartment).length?`<div class=\"branch-pipe\" style=\"background:${colorName==='blue'?'#64b5f6':'#f48fb1'};\">${valvesHTML}</div>`:'<span style="font-size:10px; color:#ccc;">Tyhjä</span>'}
                        </div>`;
                }

                function getValveOrderLabel(){
                    const m = window._valveSortKey || (localStorage.getItem('valveSortKey') || 'apt');
                    return m==='apt'?'Asunto':m==='room'?'Huone':m==='flow'?'Virtaus':m==='pos'?'Avaus':'Asunto';
                }
                function toggleValveOrder(){
                    const seq = ['apt','room','flow','pos'];
                    const cur = window._valveSortKey || (localStorage.getItem('valveSortKey') || 'apt');
                    const idx = seq.indexOf(cur);
                    window._valveSortKey = seq[(idx+1)%seq.length];
                    try { localStorage.setItem('valveSortKey', window._valveSortKey); } catch(e) {}
                    renderVisualContent();
                }

                // Klikkiapufunktiot
                function editValve(idx) {
                    const p = projects.find(x => x.id === activeProjectId);
                    if (!p || idx < 0 || idx >= p.valves.length) return;
                    showEditValve(p.valves[idx]);
                }
                function openValvePanel(idx){
                    const p = projects.find(x => x.id === activeProjectId);
                    if (!p || idx < 0 || idx >= p.valves.length) return;
                    const v = p.valves[idx];
                    const overlayId = 'valve-modal-overlay';
                    let ov = document.getElementById(overlayId);
                    if(!ov){
                        ov = document.createElement('div');
                        ov.id = overlayId;
                        ov.className = 'modal-overlay';
                        document.body.appendChild(ov);
                    }
                    // Malli/koko valinnat
                    const type = v.type || '';
                    const modelName = valveIdToModelId[type] || '';
                    const models = Object.keys(valveGroups).sort();
                    const modelOptions = ['<option value="">-- Valitse Malli --</option>'].concat(models.map(m=>`<option value="${m}" ${m===modelName?'selected':''}>${m}</option>`)).join('');
                    const sizes = modelName && valveGroups[modelName] ? valveGroups[modelName].sort((a,b)=>a.sortSize-b.sortSize) : [];
                    const sizeOptions = ['<option value="">-- Koko --</option>'].concat(sizes.map(s=>`<option value="${s.id}" ${s.id===type?'selected':''}>${s.size}</option>`)).join('');
                    ov.innerHTML = `
                        <div class="modal">
                            <div class="modal-header">Muokkaa venttiiliä</div>
                            <div class="modal-content">
                                <div class="valve-edit-row">
                                    <label>Huone
                                        <input id="valve-room-${idx}" type="text" value="${v.room||''}" class="input input-text input-sm w-140">
                                    </label>
                                    <label>Malli
                                        <select id="valve-model-${idx}" class="input input-sm w-160" onchange="updateValveModalSizes(${idx})">${modelOptions}</select>
                                    </label>
                                    <label>Koko
                                        <select id="valve-size-${idx}" class="input input-sm w-120">${sizeOptions}</select>
                                    </label>
                                    <label>Virtaus (l/s)
                                        <input id="valve-flow-${idx}" type="number" min="0" step="0.1" value="${(parseFloat(v.flow)||0).toFixed(1)}" class="input input-number input-sm w-110">
                                    </label>
                                    <label>Tavoite (l/s)
                                        <input id="valve-target-${idx}" type="number" min="0" step="0.1" value="${v.target!==undefined?v.target:''}" class="input input-number input-sm w-110">
                                    </label>
                                    <label>Paine (Pa)
                                        <input id="valve-pa-${idx}" type="number" step="1" value="${v.measuredP!==undefined&&v.measuredP!==null?v.measuredP:''}" class="input input-number input-sm w-100">
                                    </label>
                                    <label>Avaus
                                        <input id="valve-pos-${idx}" type="number" step="1" value="${v.pos!==undefined&&v.pos!==null?Math.round(v.pos):''}" class="input input-number input-sm w-80">
                                    </label>
                                </div>
                            </div>
                            <div class="modal-actions">
                                <button class="btn btn-primary" onclick="saveValveFromModal(${idx})">Tallenna</button>
                                <button class="btn" onclick="closeValvePanel()">Peruuta</button>
                            </div>
                        </div>`;
                    ov.style.display = 'flex';
                }
                // Päivitä modalin koko-lista valitun mallin perusteella
                function updateValveModalSizes(idx){
                    const modelSel = document.getElementById(`valve-model-${idx}`);
                    const sizeSel = document.getElementById(`valve-size-${idx}`);
                    if(!modelSel || !sizeSel) return;
                    const model = modelSel.value;
                    const sizes = model && valveGroups[model] ? valveGroups[model].sort((a,b)=>a.sortSize-b.sortSize) : [];
                    sizeSel.innerHTML = '<option value="">-- Koko --</option>' + sizes.map(s=>`<option value="${s.id}">${s.size}</option>`).join('');
                }
                function closeValvePanel(){
                    const ov = document.getElementById('valve-modal-overlay');
                    if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
                }
                // --- KORJAUS: Tallennus visuaalisesta popupista aktiiviseen tilaan ---
function saveValveFromModal(idx){
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // Varmistetaan tila
    const currentMode = window.currentMode || 'home';
    const valves = p.modes[currentMode].valves;

    if (idx < 0 || idx >= valves.length) return;
    const v = valves[idx];

    // Haetaan arvot popupista
    const roomEl = document.getElementById(`valve-room-${idx}`);
    const flowEl = document.getElementById(`valve-flow-${idx}`);
    const targetEl = document.getElementById(`valve-target-${idx}`);
    const paEl = document.getElementById(`valve-pa-${idx}`);
    const posEl = document.getElementById(`valve-pos-${idx}`);
    const modelSel = document.getElementById(`valve-model-${idx}`);
    const sizeSel = document.getElementById(`valve-size-${idx}`);

    // Päivitetään venttiili
    if(roomEl) v.room = roomEl.value || '';
    if(flowEl){ const f = parseFloat(flowEl.value); if(!isNaN(f)) v.flow = f; }
    if(targetEl){ const t = parseFloat(targetEl.value); if(!isNaN(t)) v.target = t; }
    
    if(paEl){ 
        const pval = parseFloat(paEl.value); 
        v.measuredP = !isNaN(pval) ? pval : null; 
    }
    
    if(posEl){ 
        let pos = parseFloat(posEl.value); 
        if(!isNaN(pos)) { 
            v.pos = Math.round(pos); 
            
            // Synkronoidaan asento muihin tiloihin (Jäätymisen esto)
            ['home', 'away', 'boost'].forEach(m => {
                if (p.modes[m] && p.modes[m].valves && p.modes[m].valves[idx]) {
                    p.modes[m].valves[idx].pos = v.pos;
                }
            });
        } 
    }

    if(sizeSel){ const newType = sizeSel.value; if(newType) v.type = newType; }

    // Lasketaan virtaus uudestaan, jos paine ja asento löytyy (Automaattilaskenta popupissa)
    if (v.type && v.type !== 'PITOT' && v.pos !== undefined && v.measuredP !== null) {
        const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
        const k = kFunc(v.type, v.pos);
        v.flow = k * Math.sqrt(Math.max(0, v.measuredP));
    }

    saveData();
    
    // Sulje popup ja päivitä KAIKKI näkymät
    closeValvePanel();
    renderVisualContent(); // Päivittää kartan
    renderDetailsList();   // Päivittää taustalla olevan listan, jos se näkyy
}

                function showValveMenu(idx){
                    const p = projects.find(x => x.id === activeProjectId);
                    if (!p || idx<0 || idx>=p.valves.length) return;
                    const v = p.valves[idx];
                    const choice = prompt(`Valinta venttiilille ${v.room} [${v.apartment||''}]\n1) Muokkaa venttiiliä\n2) Aseta asunnon kerros`);
                    if (choice===null) return;
                    if (choice.trim()==='1') { editValve(idx); return; }
                    if (choice.trim()==='2') { if(v.apartment) setApartmentFloorPrompt(p, v.apartment); return; }
                }

// --- KERROSTALO GENERAATTORI ---
function showGenerator() {
    document.getElementById('genModal').style.display = 'flex';
}
function closeGenerator() {
    document.getElementById('genModal').style.display = 'none';
}
function runGenerator() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    const floors = parseInt(document.getElementById('genFloors').value);
    const aptsPerFloor = parseInt(document.getElementById('genApts').value);
    let aptNum = parseInt(document.getElementById('genStart').value);
    const prefix = document.getElementById('genPrefix').value;
    // Tallenna per-kerros asuntojen määrä projektiin, jotta pystynäkymä tietää rivittää oikein
    if (!p.meta) p.meta = {};
    p.meta.aptsPerFloor = aptsPerFloor;
    // Etsi RAPPU-kohtainen poistokanava (prefix), luo jos puuttuu
    let extObj = (p.ducts||[]).find(d => d.type === 'extract' && (d.group==='roof') && (d.name||'').toUpperCase().startsWith((prefix||'').toUpperCase()));
    if (!extObj) {
        extObj = { id: Date.now()+Math.floor(Math.random()*1000), type: 'extract', name: `${prefix}-Rappu Poisto`, size: 125, group: 'roof' };
        if (!p.ducts) p.ducts = [];
        p.ducts.push(extObj);
    }
    let extDuct = extObj.id || "";
    let supDuct = p.ducts.find(d => d.type === 'supply' && d.group==='ahu')?.id || "";
    // Varoitus jos kanavia ei ole
    if (!extDuct) {
        if(!confirm("Huom: Projektissa ei ole poistokanavaa. Venttiilit luodaan ilman runkoa. Jatketaanko?")) return;
    }
    let count = 0;
    // SILMUKKA: Kerrokset
    for (let f = 1; f <= floors; f++) {
        // SILMUKKA: Asunnot tässä kerroksessa
        for (let a = 1; a <= aptsPerFloor; a++) {
            const aptName = `${prefix}${aptNum}`; // Esim. A1
            // Lisätään venttiilit valintojen mukaan
            if (document.getElementById('chkK').checked) addGenValve(p, aptName, "Keittiö", "h_kso125", extDuct);
            if (document.getElementById('chkKPH').checked) addGenValve(p, aptName, "KPH", "h_kso100", extDuct);
            if (document.getElementById('chkVH').checked) addGenValve(p, aptName, "VH", "h_kso100", extDuct);
            if (document.getElementById('chkWC')?.checked) addGenValve(p, aptName, "WC", "h_kso100", extDuct);
            if (document.getElementById('chkMH')?.checked) addGenValve(p, aptName, "MH", "fresh100", supDuct);
            if (document.getElementById('chkOH')?.checked) addGenValve(p, aptName, "OH", "fresh125", supDuct);
            if (document.getElementById('chkSA')?.checked) addGenValve(p, aptName, "Sauna", "h_kso125", extDuct);
            if (document.getElementById('chkKHH')?.checked) addGenValve(p, aptName, "KHH", "h_kso100", extDuct);
            if (document.getElementById('chkFresh').checked) addGenValve(p, aptName, "Korvausilma", "fresh100", supDuct);
            // Manuaalinen lisäys
            if (document.getElementById('chkCustom')?.checked) {
                const name = (document.getElementById('genCustomName').value||'').trim();
                const typeSel = document.getElementById('genCustomType').value;
                const model = document.getElementById('genCustomModel').value;
                if (name) {
                    const ductId = typeSel === 'extract' ? extDuct : supDuct;
                    addGenValve(p, aptName, name, model, ductId);
                }
            }
            aptNum++;
            count++;
        }
    }
    saveData();
    closeGenerator();
    showView('view-details');
    renderDetailsList();
    alert(`Luotu ${count} asuntoa ja venttiilit!`);
}
function addGenValve(p, apt, room, type, ductId) {
    p.valves.push({
        apartment: apt,
        room: room,
        type: type,
        target: 0,
        flow: 0,
        pos: 0,
        parentDuctId: ductId
    });
}

function setVisualMode(mode) {
    window.activeVisMode = mode;
    // Throttle to next frame for smoother updates
    if (!window._visRenderScheduled) {
        window._visRenderScheduled = true;
        requestAnimationFrame(() => {
            window._visRenderScheduled = false;
            renderVisualContent();
        });
    }
}

// Zoom controls for visual view
function zoomVisual(delta){
    const el = document.getElementById('visContent');
    if(!el) return;
    const cur = parseFloat(localStorage.getItem('visZoom')||'1');
    const next = Math.max(0.6, Math.min(2.0, cur + delta));
    const auto = parseFloat(sessionStorage.getItem('visAutoScale')||'1');
    el.style.transform = `scale(${next * auto})`;
    try { localStorage.setItem('visZoom', String(next)); } catch(e) {}
}
// Apply stored zoom on visual show
function applyStoredZoom(){
    const el = document.getElementById('visContent');
    if(!el) return;
    const cur = parseFloat(localStorage.getItem('visZoom')||'1');
    const auto = parseFloat(sessionStorage.getItem('visAutoScale')||'1');
    el.style.transform = `scale(${cur * auto})`;
}

// Auto-skaalaa pystynäkymä, jotta kaikki rappujen tornit mahtuvat vaakaan
function autoFitVertical(){
    try {
        const area = document.getElementById('visScrollArea');
        const el = document.getElementById('visContent');
        if(!area || !el) return;
        const contentWidth = el.scrollWidth;
        const availWidth = area.clientWidth - 24;
        if (contentWidth <= 0 || availWidth <= 0) return;

        // Ehdot: yli 2 rappua TAI elementtien (asunnot) päällekkäisyys
        const towerCount = el.querySelectorAll('.vis-tower').length;
        const apts = Array.from(el.querySelectorAll('.vis-apt'));
        let overlaps = false;
        for (let i = 0; i < apts.length && !overlaps; i++) {
            const ri = apts[i].getBoundingClientRect();
            for (let j = i + 1; j < apts.length; j++) {
                const rj = apts[j].getBoundingClientRect();
                const separated = (ri.right <= rj.left) || (ri.left >= rj.right) || (ri.bottom <= rj.top) || (ri.top >= rj.bottom);
                if (!separated) { overlaps = true; break; }
            }
        }

        let auto = 1.0;
        if (towerCount > 2 || overlaps) {
            if (contentWidth > availWidth) {
                auto = Math.max(0.50, Math.min(1.0, availWidth / contentWidth));
            }
        }
        sessionStorage.setItem('visAutoScale', String(auto));
        // Yhdistä manuaalinen zoomi ja automaattinen
        const manual = parseFloat(localStorage.getItem('visZoom')||'1');
        el.style.transform = `scale(${manual * auto})`;
    } catch(e) {
        // Älä häiritse käyttäjää virheistä
    }
}

// Rappusuodatin
function filterTower(shaftId){
    window._visTowerFilter = shaftId;
    renderVisualContent();
}
function clearTowerFilter(){
    window._visTowerFilter = null;
    renderVisualContent();
}

// --- LISÄÄ VENTTIILI ---
// --- LISÄÄ VENTTIILI (KORJATTU: Tyhjentää myös asunnon) ---
function showAddValve() {
    // Nollataan kentät
    document.getElementById('apartmentName').value = ""; // <--- TÄMÄ PUUTTUI
    document.getElementById('roomName').value = "";
    document.getElementById('measuredP').value = "";
    document.getElementById('currentPos').value = "";
    
    const live = document.getElementById('liveKValue'); if(live) live.innerText = "";
    const res = document.getElementById('calcResult'); if(res) res.style.display = 'none';
    const table = document.getElementById('valveReferenceTable'); if(table) table.style.display = 'none';
    
    editingValveIndex = null;
    
    populateDuctSelect();
    populateRappuSelect();
    
    // Nollataan valinta "Tyhjä" -kohtaan
    const sel = document.getElementById('parentDuctId');
    if(sel) {
        if(preSelectedDuctId) sel.value = preSelectedDuctId;
        else sel.value = ""; 
    }
    preSelectedDuctId = null; 

    showView('view-measure');
}

// Pikanappi: Lisää venttiili suoraan tiettyyn runkoon
function quickAddValveToDuct(ductId){
    preSelectedDuctId = ductId;
    showAddValve();
    const sel = document.getElementById('parentDuctId');
    if(sel) sel.value = String(ductId);
    // Huippuimuri/pystynäkymä: avaa valintamodal kerros + rappu
    try {
        const p = projects.find(x => x.id === activeProjectId);
        const duct = p && (p.ducts||[]).find(d=>d.id==ductId);
        if (duct && duct.group === 'roof') {
            openAptFloorDialog(ductId);
        }
    } catch(e) {}
}

// Valintamodal: Kerros + Rappu (Huippuimuri)
function openAptFloorDialog(ductId){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const ovId = 'apt-floor-modal-overlay';
    let ov = document.getElementById(ovId);
    if(!ov){ ov = document.createElement('div'); ov.id = ovId; ov.className = 'modal-overlay'; document.body.appendChild(ov); }
    const roofDucts = (p.ducts||[]).filter(d=>d.group==='roof' && d.type==='extract');
    const rappuLetters = Array.from(new Set(roofDucts.map(d=> (d.name||'').trim().charAt(0).toUpperCase()).filter(x=>x))).sort();
    const rappuOpts = rappuLetters.length ? rappuLetters.map(l=>`<option value="${l}">${l}</option>`).join('') : '<option value="">-</option>';
    const floors = Array.from({length:10}, (_,i)=>i+1);
    const floorOpts = floors.map(f=>`<option value="${f}">${f}</option>`).join('');
    const aptCountOpts = [1,2,3,4,5,6,8,10].map(n=>`<option value="${n}">${n}</option>`).join('');
    const valvesPerAptOpts = [1,2,3,4].map(n=>`<option value="${n}">${n}</option>`).join('');
    ov.innerHTML = `
        <div class="modal">
            <div class="modal-header">Lisää venttiili — valitse rappu ja kerros</div>
            <div class="modal-content">
                <div class="valve-edit-row">
                    <label>Rappu
                        <select id="selRappu" class="input input-sm w-120">${rappuOpts}</select>
                    </label>
                    <label>Kerros
                        <select id="selKerros" class="input input-sm w-120">${floorOpts}</select>
                    </label>
                    <label>Asunto (tunnus)
                        <input id="selApt" type="text" placeholder="Esim. A1" class="input input-text input-sm w-140">
                    </label>
                </div>
                <hr style="border:1px solid #eee; margin:10px 0;">
                <div style="font-weight:bold; margin-bottom:6px;">Massalisäys</div>
                <div class="valve-edit-row">
                    <label>Asuntoja yhteensä
                        <select id="selAptCount" class="input input-sm w-120">${aptCountOpts}</select>
                    </label>
                    <label>Venttiilejä / asunto
                        <select id="selValvesPerApt" class="input input-sm w-140">${valvesPerAptOpts}</select>
                    </label>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="confirmAptFloor(${ductId})">Jatka</button>
                <button class="btn" onclick="closeAptFloorDialog()">Peruuta</button>
            </div>
        </div>`;
    ov.style.display = 'flex';
}
function closeAptFloorDialog(){ const ov = document.getElementById('apt-floor-modal-overlay'); if(ov){ ov.style.display='none'; ov.innerHTML=''; } }
function confirmAptFloor(ductId){
    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
    const rappu = (document.getElementById('selRappu')?.value || '').trim().toUpperCase();
    const floorStr = document.getElementById('selKerros')?.value || '';
    let apt = (document.getElementById('selApt')?.value || '').trim();
    // Jos asuntoa ei annettu, muodostetaan esim. "A" + kerros
    if(!apt && rappu){ apt = `${rappu}${floorStr}`; }
    // Esitäytä mittauslomakkeen kenttä
    const aptEl = document.getElementById('apartmentName'); if(aptEl) aptEl.value = apt;
    // Tallenna kerroskarttaan
    const num = parseInt(floorStr,10);
    if(!isNaN(num) && apt){ if(!p.meta) p.meta={}; if(!p.meta.floorMap) p.meta.floorMap={}; p.meta.floorMap[apt]=num; try{ saveData(); }catch(e){} }
    // Tallenna massalisäyksen asetukset sessioon myöhempää käyttöä varten
    const aptCount = parseInt(document.getElementById('selAptCount')?.value||'1',10) || 1;
    const valvesPerApt = parseInt(document.getElementById('selValvesPerApt')?.value||'1',10) || 1;
    try { sessionStorage.setItem('roofBatchSettings', JSON.stringify({ ductId, rappu, floor:num, aptBase:apt, aptCount, valvesPerApt })); } catch(e) {}
    closeAptFloorDialog();
}

// Muokkaa venttiiliä: esitäytä mittauslomake ja mene mittausnäkymään
// --- KORJAUS: Avaa muokkausikkuna oikeasta tilasta ---
function showEditValve(v_ref) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // 1. Selvitetään mikä tila on päällä
    const currentMode = window.currentMode || 'home';
    const valves = p.modes[currentMode].valves;

    // 2. Etsitään oikea venttiili aktiivisesta listasta
    // (Visuaalinen näkymä saattaa antaa viittauksen vanhaan listaan, joten haemme indeksillä tai ID:llä)
    let idx = -1;
    
    // Yritetään löytää venttiili, joka vastaa klikattua (verrataan ID:tä jos on, tai viittausta)
    if (v_ref.id) {
        idx = valves.findIndex(x => x.id === v_ref.id);
    } 
    // Jos ID puuttuu (vanhat projektit), yritetään täsmätä ominaisuudet
    if (idx === -1) {
        idx = valves.findIndex(x => x.room === v_ref.room && x.parentDuctId === v_ref.parentDuctId);
    }
    
    // Jos ei vieläkään löydy (harvinaista), oletetaan että v_ref on jo oikeasta listasta
    if (idx === -1) idx = valves.indexOf(v_ref);

    editingValveIndex = idx >= 0 ? idx : null;
    const v = (idx >= 0) ? valves[idx] : v_ref;

    // Kentät
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    set('roomName', v.room || '');
    set('apartmentName', v.apartment || '');
    set('currentPos', v.pos);
    set('measuredP', v.measuredP);
    set('targetFlow', v.target);
    set('measuredFlow', v.flow);
    
    populateDuctSelect();
    const ductSel = document.getElementById('parentDuctId'); 
    if (ductSel && v.parentDuctId) ductSel.value = v.parentDuctId;
    
    // Malli/koko valinta
    const modelSel = document.getElementById('valveModelSelect');
    const sizeSel = document.getElementById('valveSizeSelect');
    const typeHidden = document.getElementById('valveType');
    
    if (typeHidden) typeHidden.value = v.type || '';
    
    if (modelSel && sizeSel && v.type) {
        const modelName = window.valveIdToModelId ? window.valveIdToModelId[v.type] : '';
        if (modelName) {
            modelSel.value = modelName;
            updateSizeSelect(); // Päivittää koot
            sizeSel.value = v.type;
        } else if (v.type === 'PITOT') {
             modelSel.value = 'PITOT';
             updateSizeSelect();
        }
        if(typeof updateLiveK === 'function') updateLiveK();
    }
    
    // Näytetään mittausnäkymä ja palataan visuaaliin tallennuksen jälkeen
    returnToVisual = true;
    showView('view-measure');
}

// --- LISÄÄ KONE (TALLENTAA YKSIKÖN) ---
function saveMachine() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    if (!p.machines) p.machines = [];
    
    const elUnit = document.getElementById('machineUnit');
    const elVal = document.getElementById('machineValue');
    const elName = document.getElementById('machineName');

    if (!elUnit || !elVal) {
        alert("Virhe: Kenttiä ei löytynyt. Päivitä sivu (F5).");
        return;
    }

    const unit = elUnit.value; 
    const val = elVal.value;
    const type = document.getElementById('machineType') ? document.getElementById('machineType').value : '';
    
    // Laskentamoodi fysiikkaa varten (Pa = pressure, muut = speed)
    let calcMode = 'speed';
    if (unit === 'pa') calcMode = 'pressure';

    p.machines.push({
        name: elName.value || "IV-Kone",
        type: type,
        unit: unit,          // TÄRKEÄ: Tallennetaan onko 'hz', 'pa' vai 'speed'
        settingVal: val,     // Tallennetaan arvo (esim. 122)
        controlMode: calcMode,
        
        // Vanhat kentät yhteensopivuuden vuoksi
        supQ: document.getElementById('machineSupplyQ') ? document.getElementById('machineSupplyQ').value : '',
        extQ: document.getElementById('machineExtractQ') ? document.getElementById('machineExtractQ').value : '',
        speed: val 
    });

    if (type === 'roof_fan') {
        if (!p.ducts) p.ducts = [];
        const hasFresh = p.ducts.find(d => (d.name||'').includes("Korvausilma"));
        if (!hasFresh) {
            p.ducts.push({ id: Date.now(), name: "Korvausilma", type: "supply", size: 0 });
        }
    }
    
    saveData();
    showView('view-details');
    renderDetailsList();
}

// Täyttää mittausnäkymän runkovalinnan
// --- KONEEN LOGIIKKA (KORJATTU JA SIIVOTTU) ---

// 1. Päivittää rajat ja tekstit (Hz/Pa/%)
function updateMachineInputLimits() {
    const sel = document.getElementById('machineUnit');
    const label = document.getElementById('machineValueLabel');
    const input = document.getElementById('machineValue');
    
    if (!sel || !label || !input) return;

    const unit = sel.value;
    input.min = 0;
    
    if (unit === 'pa') {
        label.innerText = "Tavoitepaine (Pa)";
        input.placeholder = "esim. 150";
        input.max = 10000;
    } else if (unit === 'hz') {
        label.innerText = "Taajuus (Hz)";
        input.placeholder = "esim. 50";
        input.max = 500;
    } else {
        label.innerText = "Nopeus / Teho (0-100%)";
        input.placeholder = "esim. 60";
        input.max = 100;
    }
}

// 2. Avaa ikkunan ja nollaa kentät (TÄMÄ PUUTTUI AIEMMIN)
function showAddMachine() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // Varmistetaan tila
    const currentMode = window.currentMode || 'home';
    const machines = p.modes[currentMode].machines || [];
    
    // Haetaan nykyinen kone (tai luodaan oletus)
    const m = machines.find(x => x.type === 'ahu') || machines[0] || { unit: 'pa', settingVal: '' };

    const title = document.getElementById('machineTitle'); 
    if (title) title.innerText = `IV-Kone (${currentMode})`; // Näytetään mitä tilaa muokataan
    
    // Apufunktio arvon asettamiseen
    const setVal = (id, val) => { 
        const el = document.getElementById(id); 
        if (el) el.value = (val !== undefined && val !== null) ? val : ''; 
    };
    
    setVal('machineName', m.name || 'IV-Kone');
    setVal('machineValue', m.settingVal); 
    
    // Aseta yksikkö
    const unitSel = document.getElementById('machineUnit');
    if(unitSel) {
        unitSel.value = m.unit || 'pa'; 
        // Päivitetään placeholderit heti
        updateMachineInputLimits();
    }

    showView('view-add-machine');
}
// 3. Tallentaa koneen tiedot
function saveMachine() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // Varmistetaan aktiivinen tila
    const currentMode = window.currentMode || 'home';
    
    // Varmistetaan, että tilalla on omat koneet -lista
    if (!p.modes[currentMode].machines) {
        // Jos puuttuu, kopioidaan pohjaksi tyhjä tai olemassa oleva rakenne
        p.modes[currentMode].machines = []; 
    }
    const machines = p.modes[currentMode].machines;

    // Haetaan HTML-elementit
    const elUnit = document.getElementById('machineUnit');
    const elVal = document.getElementById('machineValue');
    const elName = document.getElementById('machineName');

    if (!elUnit || !elVal) {
        alert("Virhe: Kenttiä ei löytynyt.");
        return;
    }

    const unit = elUnit.value; 
    let val = parseFloat(elVal.value); // Muutetaan numeroksi
    const name = elName.value || "IV-Kone";

    // Jos kenttä on tyhjä, tallennetaan null eikä NaN
    if (elVal.value === "") val = null;

    // Etsitään tämän tilan kone tai luodaan uusi
    let machine = machines.find(m => m.type === 'ahu');
    if (!machine) {
        machine = { type: 'ahu', id: Date.now() };
        machines.push(machine);
    }

    // Päivitetään arvot VAIN tähän tilaan
    machine.name = name;
    machine.unit = unit;          // 'pa', 'hz', tai 'pct'
    machine.settingVal = val;     // Tallennettu arvo (voi olla null)
    machine.controlMode = (unit === 'pa') ? 'pressure' : 'speed';

    saveData();
    
    // Päivitetään näkymät
    showView('view-details');
    renderDetailsList();
}
/// Täyttää valikon (PIILOTTAA VANHAT "TULO"/"POISTO" RUNGOT)
function populateDuctSelect() {
    const p = projects.find(x => x.id === activeProjectId);
    const sel = document.getElementById('parentDuctId');
    if (!sel) return;
    
    // Tyhjennetään valikko
    sel.innerHTML = '';
    
    // 1. Tyhjä vaihtoehto (Automaatiolle)
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.text = "-- Valitse tai jätä tyhjäksi (Autom.) --";
    sel.appendChild(defaultOpt);

    if (!p || !p.ducts) return;
    
    // 2. Olemassa olevat rungot (SUODATETTU)
    p.ducts.forEach(d => {
        // --- SUODATIN: Älä näytä pelkkiä "Tulo" tai "Poisto" nimisiä runkoja ---
        if (d.name === "Tulo" || d.name === "Poisto") {
            return; // Hypätään yli, ei lisätä listaan
        }
        // -----------------------------------------------------------------------

        const opt = document.createElement('option');
        opt.value = d.id; 
        opt.textContent = `${d.name} (${d.type === 'supply' ? 'Tulo' : 'Poisto'})`;
        sel.appendChild(opt);
    });

    // 3. "LUO UUSI" -vaihtoehdot
    const tuloCount = p.ducts.filter(d => d.type === 'supply' && d.group === 'ahu').length;
    const poistoCount = p.ducts.filter(d => d.type === 'extract' && d.group === 'ahu').length;
    
    const newTulo = document.createElement('option');
    newTulo.value = "CREATE_NEW_SUPPLY";
    newTulo.text = `➕ Luo uusi: Tulo ${tuloCount + 1}`;
    newTulo.style.fontWeight = "bold";
    newTulo.style.color = "blue";
    sel.appendChild(newTulo);

    const newPoisto = document.createElement('option');
    newPoisto.value = "CREATE_NEW_EXTRACT";
    newPoisto.text = `➕ Luo uusi: Poisto ${poistoCount + 1}`;
    newPoisto.style.fontWeight = "bold";
    newPoisto.style.color = "red";
    sel.appendChild(newPoisto);
}
// Turvallinen stub asuntomodaalille pystynäkymässä
function openAptModal(aptId){
    try {
        if (window.showAptModal) return window.showAptModal(aptId);
    } catch(e) {}
    alert(`Asunto ${aptId}`);
}

// Apartment modal logic
let _aptModalState = { apt: null, shaftId: null, indices: [] };
function showApartmentModal(apt, shaftId){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const tbody = document.querySelector('#aptValveTable tbody');
    const title = document.getElementById('aptModalTitle');
    if(!tbody || !title) return;
    const valves = (p.valves||[]).map((v,i)=> ({...v, _idx:i}))
        .filter(v=> v.apartment===apt && (!shaftId || v.parentDuctId==shaftId));
    _aptModalState = { apt, shaftId, indices: valves.map(v=>v._idx) };
    title.textContent = `Asunto ${apt}`;
    tbody.innerHTML = valves.map(v=> `
        <tr data-idx="${v._idx}">
            <td>${v.room||''}</td>
            <td>${v.type||''}</td>
            <td><input type="number" step="0.1" value="${v.measuredP||''}" style="width:80px"></td>
            <td><input type="number" step="0.1" value="${v.pos||''}" style="width:80px"></td>
            <td><input type="number" step="0.1" value="${v.flow||''}" style="width:80px"></td>
            <td><input type="number" step="0.1" value="${v.target||''}" style="width:80px"></td>
        </tr>
    `).join('');
    document.getElementById('aptModal').style.display = 'flex';
}
function closeApartmentModal(){
    const el = document.getElementById('aptModal');
    if(el) el.style.display = 'none';
}
function saveApartmentEdits(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const rows = Array.from(document.querySelectorAll('#aptValveTable tbody tr'));
    rows.forEach(row => {
        const idx = parseInt(row.getAttribute('data-idx'));
        const inputs = row.querySelectorAll('input');
        const measuredP = parseFloat(inputs[0].value);
        let pos = parseFloat(inputs[1].value);
        const flow = parseFloat(inputs[2].value);
        const target = parseFloat(inputs[3].value);
        const v = p.valves[idx];
        if(!v) return;
        if(!isNaN(measuredP)) v.measuredP = measuredP;
        if(!isNaN(pos)) {
            // Clamp and round to degrees between -20 and 20
            pos = Math.max(-20, Math.min(20, Math.round(pos)));
            v.pos = pos;
        }
        if(!isNaN(flow)) v.flow = flow;
        if(!isNaN(target)) v.target = target;
    });
    saveData();
    closeApartmentModal();
    renderVisualContent();
    renderDetailsList();
}

// Backward-compat: details view delete button calls this
function deleteCurrentProject(){
    const id = activeProjectId;
    if(!id) return;
    deleteProject(id);
}

// Pikapoisto venttiilille vaakavisualista

// Initialize order array for a duct if missing; store indices of project-level valves
function ensureValveOrder(p, ductId, valves){
    if(!p.meta) p.meta = {};
    if(!p.meta.valveOrder) p.meta.valveOrder = {};
    if(!p.meta.valveOrder[ductId]){
        p.meta.valveOrder[ductId] = valves.map(v => p.valves.indexOf(v));
        try { saveData(); } catch(e) {}
    } else {
        // Keep order in sync by appending any new valves not present
        const order = p.meta.valveOrder[ductId];
        const current = valves.map(v => p.valves.indexOf(v));
        current.forEach(idx => { if(!order.includes(idx)) order.push(idx); });
        // Remove indices that no longer belong to this duct
        p.meta.valveOrder[ductId] = order.filter(idx => current.includes(idx));
    }
}

// Move a valve left/right within a duct's order
function moveValveInDuct(ductId, valveIdx, dir){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    // Build order array on the fly if missing so arrows always respond
    const valves = (p.valves||[]).filter(v => v.parentDuctId === ductId && !v.apartment);
    ensureValveOrder(p, ductId, valves);
    const order = p.meta.valveOrder && p.meta.valveOrder[ductId];
    if(!order) return;
    const pos = order.indexOf(valveIdx);
    if(pos === -1) return;
    const swapWith = pos + (dir < 0 ? -1 : 1);
    if(swapWith < 0 || swapWith >= order.length) return;
    const tmp = order[pos]; order[pos] = order[swapWith]; order[swapWith] = tmp;
    try { saveData(); } catch(e) {}
    renderHorizontalMap(document.getElementById('visContent'));
}

// Inline edit for duct: measured total flow and size
function editDuctInline(ductId){
    window._editingDuctId = ductId;
    renderVisualContent();
}

function cancelDuctInline(){
    window._editingDuctId = null;
    renderVisualContent();
}

function saveDuctInline(ductId){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const d = (p.ducts||[]).find(dd => dd.id === ductId);
    if(!d) return;
    const sizeEl = document.getElementById(`duct-size-${duct.id}`);
    const flowEl = document.getElementById(`duct-flow-${duct.id}`);
    if(sizeEl){
        const s = parseInt(sizeEl.value,10);
        if(!isNaN(s)) d.size = s;
    }
    if(flowEl){
        const f = parseFloat(flowEl.value);
        if(!isNaN(f)) d.flow = f;
    }
    window._editingDuctId = null;
    saveData();
    renderVisualContent();
    renderDetailsList();
}
// --- RUNKOMITTAUS LOGIIKKA (ALKU) ---

function openDuctMeasureModal(ductId) {
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const d = (p.ducts || []).find(d => d.id === ductId);
    if (!d) return;

    // Aseta ID piilokenttään jotta tiedämme mitä runkoa muokataan
    document.getElementById('measureDuctId').value = ductId;
    
    // Hae vanha arvo kenttään, jos sellainen on jo tallennettu
    const flowInput = document.getElementById('ductMeasuredFlow');
    flowInput.value = (d.measuredFlow !== undefined) ? d.measuredFlow : '';
    
    // Avaa ikkuna
    document.getElementById('ductMeasureModal').style.display = 'flex';
    setTimeout(() => flowInput.focus(), 100);
}

function closeDuctMeasureModal() {
    document.getElementById('ductMeasureModal').style.display = 'none';
}

function saveDuctMeasurement() {
    const p = projects.find(x => x.id === activeProjectId);
    const ductId = parseInt(document.getElementById('measureDuctId').value);
    const d = (p.ducts || []).find(d => d.id === ductId);
    
    const val = document.getElementById('ductMeasuredFlow').value;
    
    if (d) {
        if (val === "") {
            delete d.measuredFlow; // Poista tieto jos kenttä tyhjä
        } else {
            d.measuredFlow = parseFloat(val);
        }
        saveData(); // Tallenna projekti
        renderVisualContent(); // Päivitä näkymä jotta uusi luku näkyy
    }
    closeDuctMeasureModal();
}

function clearDuctMeasurement() {
    document.getElementById('ductMeasuredFlow').value = "";
    saveDuctMeasurement(); // Tallentaa tyhjän -> poistaa tiedon
}

// --- RUNKOMITTAUS LOGIIKKA (LOPPU) ---
// Yksinkertainen varafunktio K-arvon laskentaan, jos getK puuttuu
function defaultGetK(type, pos){
    const db = valveDB[type];
    if(!db || !db.data || !Array.isArray(db.data)) return 0;
    // Etsi lähin kahden pisteen väli ja interpoloidaan lineaarisesti
    const points = db.data.slice().sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]));
    let prev = points[0], next = points[points.length-1];
    for(let i=1;i<points.length;i++){
        if(pos <= parseFloat(points[i][0])) { next = points[i]; prev = points[i-1]; break; }
    }
    const x1 = parseFloat(prev[0]), y1 = parseFloat(prev[1]);
    const x2 = parseFloat(next[0]), y2 = parseFloat(next[1]);
    if(x2 === x1) return y1;
    const t = Math.min(1, Math.max(0, (pos - x1)/(x2 - x1)));
    return y1 + t*(y2 - y1);
}



// --- PÖYTÄKIRJAT JA RAPORTOINTI (FINAL VERSION) ---

// --- KORJAUS: Pöytäkirjat lukemaan aktiivista tilaa ---
function buildReportData(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return { ahu: [], roof: [], measuredDucts: [] };
    
    // 1. Määritetään aktiivinen tila
    const currentMode = window.currentMode || 'home';
    
    // 2. Haetaan venttiilit TÄSTÄ tilasta
    const valves = (p.modes && p.modes[currentMode]) ? p.modes[currentMode].valves : (p.valves || []);
    
    const ducts = p.ducts||[];
    
    // Erotellaan ryhmät
    const ahuDuctIds = ducts.filter(d=>d.group==='ahu' || d.group==='apt').map(d=>d.id);
    const roofDuctIds = ducts.filter(d=>d.group==='roof').map(d=>d.id);
    
    // Venttiilit ryhmittäin
    const ahuValves = valves.filter(v=>ahuDuctIds.includes(v.parentDuctId));
    const roofValves = valves.filter(v=>roofDuctIds.includes(v.parentDuctId));
    
    // Rungot, joissa on mittausdataa
    const measuredDucts = ducts.filter(d => d.measuredFlow !== undefined && d.measuredFlow !== null && d.measuredFlow !== "");
    
    return { ahu: ahuValves, roof: roofValves, measuredDucts: measuredDucts };
}
// Apufunktio: Muotoile rivi raporttiin (käsittelee Pitot-erikoistapaukset)
function formatReportRow(v, p) {
    const isPitot = v.type === 'PITOT';
    const ductName = (p.ducts.find(d=>d.id==v.parentDuctId)||{}).name || '-';
    
    // Mallin nimi
    let modelName = v.type;
    if (isPitot) modelName = "Suora/Pitot";
    else if (window.valveIdToModelId && window.valveIdToModelId[v.type]) {
        // Siistitään nimi (poistetaan valmistaja jos halutaan lyhyempi)
        modelName = window.valveIdToModelId[v.type]; 
    }
    
    // Paine (jos Pitot, ei painetta)
    const paStr = isPitot ? "-" : (v.measuredP !== null && v.measuredP !== undefined ? v.measuredP : '-');
    
    // Asento (Pitotilla voi olla tekstiä tai tyhjä)
    let posStr = '-';
    if (v.pos !== null && v.pos !== undefined) {
        posStr = isPitot ? String(v.pos) : Math.round(v.pos);
    }

    return {
        duct: ductName,
        room: v.room || '',
        model: modelName,
        pa: paStr,
        pos: posStr,
        flow: (parseFloat(v.flow)||0).toFixed(1),
        target: (parseFloat(v.target)||0).toFixed(1)
    };
}

// Apufunktio: PDF-otsikon luonti (Lisätiedot)
function addReportHeader(doc, p) {
    const meta = p.meta || {};
    
    // Otsikko
    doc.setFontSize(18);
    doc.text(p.name || 'IV-Mittauspöytäkirja', 10, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(60); // Tummanharmaa
    
    let y = 25;
    const dateStr = meta.date || new Date().toLocaleDateString('fi-FI');
    const timeStr = meta.time || '';
    
    // Tulostetaan tiedot allekkain
    doc.text(`Päiväys: ${dateStr} ${timeStr}`, 10, y); y += 5;
    
    if (meta.location) {
        doc.text(`Kohde: ${meta.location}`, 10, y); y += 5;
    }
    if (meta.measurer) {
        doc.text(`Mittaaja: ${meta.measurer}`, 10, y); y += 5;
    }
    if (meta.device) {
        doc.text(`Mittari: ${meta.device}`, 10, y); y += 5;
    }
    
    // Logo (jos on)
    if (meta.logo) {
        try {
            // Lisätään logo oikeaan yläkulmaan
            doc.addImage(meta.logo, 'JPEG', 150, 10, 40, 15); 
        } catch(e) {}
    }
    
    doc.setTextColor(0); // Musta väri takaisin taulukoita varten
    return y + 5; // Palauttaa Y-koordinaatin mistä taulukko alkaa
}
// --- UUSI EXCEL-TYYLINEN PÖYTÄKIRJA (MATRIISI) ---
// --- UUSI EXCEL-TYYLINEN PÖYTÄKIRJA (PDF) - PÄIVITETTY ---
// --- UUSI EXCEL-TYYLINEN PÖYTÄKIRJA (PDF) - FINAL ---
// --- UUSI EXCEL-TYYLINEN PÖYTÄKIRJA (PDF) - FINAL V4 ---
function printReportExcelStyle() {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) { alert('PDF-kirjasto puuttuu'); return; }

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const currentMode = window.currentMode || 'home';
    const valves = (p.modes && p.modes[currentMode]) ? p.modes[currentMode].valves : (p.valves || []);
    const meta = p.meta || {};
    
    // Kone
    const machine = (p.modes && p.modes[currentMode] && p.modes[currentMode].machines) 
                    ? p.modes[currentMode].machines.find(m => m.type === 'ahu') 
                    : (p.machines || []).find(m => m.type === 'ahu');
    let machineSetting = "-";
    if (machine) {
        const u = machine.unit || '%';
        const v = machine.settingVal || '-';
        if (u === 'pa') machineSetting = `${v} Pa`;
        else if (u === 'hz') machineSetting = `${v} Hz`;
        else machineSetting = `${v} %`;
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("ILMAMÄÄRIEN MITTAUSPÖYTÄKIRJA", pageWidth / 2, 15, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 40, 16, pageWidth / 2 + 40, 16);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    let y = 30;
    const col1 = 20, col2 = 80, col3 = 160, col4 = 220;

    // Vasen
    doc.text("Kohde:", col1, y);      doc.text(meta.location || "-", col2, y);
    doc.line(col2, y + 1, col3 - 10, y + 1);
    y += 7;
    doc.text("Osoite:", col1, y);     doc.text(meta.address || "-", col2, y);
    doc.line(col2, y + 1, col3 - 10, y + 1);
    y += 7;
    doc.text("Konemalli:", col1, y);  doc.text((machine ? machine.name : "IV-Kone"), col2, y);
    doc.line(col2, y + 1, col3 - 10, y + 1);

    // Oikea
    y = 30;
    doc.text("Mittaaja:", col3, y);   doc.text(meta.measurer || "-", col4, y);
    doc.line(col4, y + 1, pageWidth - 20, y + 1);
    y += 7;
    doc.text("Yritys:", col3, y);     doc.text(meta.company || "-", col4, y);
    doc.line(col4, y + 1, pageWidth - 20, y + 1);
    y += 7;
    doc.text("Mittari:", col3, y);    doc.text(meta.device || "-", col4, y);
    doc.line(col4, y + 1, pageWidth - 20, y + 1);
    y += 7;
    doc.text("Päivämäärä:", col3, y); doc.text(meta.date || new Date().toLocaleDateString('fi-FI'), col4, y);
    doc.line(col4, y + 1, pageWidth - 20, y + 1);

    // Data
    const rooms = {};
    const ducts = p.ducts || [];
    const getDir = (v) => {
        const d = ducts.find(d => d.id == v.parentDuctId);
        if (d && d.type === 'supply') return 'supply';
        if (d && d.type === 'extract') return 'extract';
        const name = (v.type || '').toLowerCase();
        if (name.includes('tulo') || name.includes('kts') || name.includes('supply')) return 'supply';
        return 'extract';
    };
    valves.forEach(v => {
        let uniqueName = v.room || "Muu tila";
        if (v.apartment) uniqueName = `${v.apartment} ${uniqueName}`;
        uniqueName = uniqueName.trim();
        if (!rooms[uniqueName]) rooms[uniqueName] = { label: uniqueName, supply: [], extract: [] };
        const dir = getDir(v);
        rooms[uniqueName][dir].push(v);
    });

    const tableBody = [];
    let grandTotSupFlow = 0, grandTotSupTarget = 0, grandTotExtFlow = 0, grandTotExtTarget = 0;
    const sortedRooms = Object.keys(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    sortedRooms.forEach(key => {
        const r = rooms[key];
        const rowsNeeded = Math.max(r.supply.length, r.extract.length, 1);
        for (let i = 0; i < rowsNeeded; i++) {
            const sup = r.supply[i] || null;
            const ext = r.extract[i] || null;
            let sModel="", sK="", sPa="", sPos="", sFlow="", sTarget="", sPct="";
            if (sup) {
                sModel = formatValveDisplay(sup.type);
                sPos = (sup.pos !== null) ? Math.round(sup.pos) : "-";
                sPa = (sup.measuredP !== null) ? sup.measuredP : "-";
                if(sup._calcK) sK = sup._calcK.toFixed(2);
                else { const kFunc = (typeof getK === 'function') ? getK : defaultGetK; sK = (sup.type && sup.pos!==null) ? kFunc(sup.type, sup.pos).toFixed(2) : "-"; }
                const f = parseFloat(sup.flow)||0; const t = parseFloat(sup.target)||0;
                sFlow = f.toFixed(1); sTarget = t > 0 ? t.toFixed(1) : "-"; sPct = (t > 0 && f > 0) ? Math.round((f/t)*100) + " %" : "-";
                grandTotSupFlow += f; grandTotSupTarget += t;
            }
            let eModel="", eK="", ePa="", ePos="", eFlow="", eTarget="", ePct="";
            if (ext) {
                eModel = formatValveDisplay(ext.type);
                ePos = (ext.pos !== null) ? Math.round(ext.pos) : "-";
                ePa = (ext.measuredP !== null) ? ext.measuredP : "-";
                if(ext._calcK) eK = ext._calcK.toFixed(2);
                else { const kFunc = (typeof getK === 'function') ? getK : defaultGetK; eK = (ext.type && ext.pos!==null) ? kFunc(ext.type, ext.pos).toFixed(2) : "-"; }
                const f = parseFloat(ext.flow)||0; const t = parseFloat(ext.target)||0;
                eFlow = f.toFixed(1); eTarget = t > 0 ? t.toFixed(1) : "-"; ePct = (t > 0 && f > 0) ? Math.round((f/t)*100) + " %" : "-";
                grandTotExtFlow += f; grandTotExtTarget += t;
            }
            tableBody.push([ (i === 0) ? r.label : "", sup ? "1" : "", sModel, sK, sPa, sPos, sFlow, sTarget, sPct, ext ? "1" : "", eModel, eK, ePa, ePos, eFlow, eTarget, ePct ]);
        }
    });

    const totSupPct = grandTotSupTarget > 0 ? Math.round((grandTotSupFlow/grandTotSupTarget)*100) + " %" : "-";
    const totExtPct = grandTotExtTarget > 0 ? Math.round((grandTotExtFlow/grandTotExtTarget)*100) + " %" : "-";
    const totalRow = [ "Yhteensä", "", "", "", "", "", grandTotSupFlow.toFixed(1), grandTotSupTarget.toFixed(1), totSupPct, "", "", "", "", "", grandTotExtFlow.toFixed(1), grandTotExtTarget.toFixed(1), totExtPct ];

    doc.autoTable({
        startY: 65,
        head: [ [{ content: 'Huonetila', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } }, { content: 'Tulo', colSpan: 8, styles: { halign: 'center', fillColor: [220, 230, 241], textColor:0 } }, { content: 'Poisto', colSpan: 8, styles: { halign: 'center', fillColor: [242, 220, 219], textColor:0 } }], ['kpl', 'Päätelaite', 'K', 'Pa', 'As', 'Mit', 'Suun', '%', 'kpl', 'Päätelaite', 'K', 'Pa', 'As', 'Mit', 'Suun', '%'] ],
        body: [...tableBody, totalRow],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0,0,0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 1: { cellWidth: 7, halign: 'center' }, 2: { cellWidth: 18 }, 3: { cellWidth: 9, halign: 'center' }, 4: { cellWidth: 9, halign: 'center' }, 5: { cellWidth: 9, halign: 'center' }, 6: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, 7: { cellWidth: 12, halign: 'center' }, 8: { cellWidth: 10, halign: 'center' }, 9: { cellWidth: 7, halign: 'center' }, 10: { cellWidth: 18 }, 11: { cellWidth: 9, halign: 'center' }, 12: { cellWidth: 9, halign: 'center' }, 13: { cellWidth: 9, halign: 'center' }, 14: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, 15: { cellWidth: 12, halign: 'center' }, 16: { cellWidth: 10, halign: 'center' } },
        didParseCell: function(data) { if (data.row.index === tableBody.length) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [230, 230, 230]; } }
    });

    // --- ALAPALKKI ---
    let sfpStr = "-";
    if ((meta.powerSup||0) + (meta.powerExt||0) > 0) {
        const maxQ = Math.max(grandTotSupFlow, grandTotExtFlow);
        if (maxQ > 0) sfpStr = (((meta.powerSup||0) + (meta.powerExt||0)) / 1000 / (maxQ/1000)).toFixed(2);
    }
    
    let d2Str = "-";
    if (meta.area > 0) {
        const req = (meta.area * (meta.height||2.5) * 0.5) / 3.6;
        const pct = (grandTotExtFlow / req) * 100;
        d2Str = `${pct.toFixed(0)}%`;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Mitattu teholla: ${machineSetting}`, 14, 63);

    let bottomY = doc.lastAutoTable.finalY + 10;
    
    doc.text(`SFP-luku: ${sfpStr} kW/(m³/s)`, 14, bottomY);
    doc.text(`D2-täyttöaste: ${d2Str}`, 80, bottomY);
    doc.text(`Laakerit (Tulo): ${meta.bearingSup || '-'}`, 140, bottomY);
    doc.text(`Laakerit (Poisto): ${meta.bearingExt || '-'}`, 200, bottomY);

    // Muuta huomioitavaa
    if (meta.remarks) {
        bottomY += 8;
        doc.text("Muuta huomioitavaa:", 14, bottomY);
        doc.setFont("helvetica", "normal");
        // Split text to fit
        const splitText = doc.splitTextToSize(meta.remarks, pageWidth - 30);
        doc.text(splitText, 14, bottomY + 5);
        bottomY += (splitText.length * 5) + 5;
    } else {
        bottomY += 10;
    }

    // Allekirjoitus (otetaan esikatselu-ikkunan canvasista joka on näkyvillä)
    const canvas = document.getElementById('signaturePadReportView');
    if (canvas) {
        try {
            const imgData = canvas.toDataURL('image/png');
            const blank = document.createElement('canvas');
            blank.width = canvas.width; blank.height = canvas.height;
            if (canvas.toDataURL() !== blank.toDataURL()) {
                if (bottomY + 30 > 200) { doc.addPage(); bottomY = 20; }
                doc.setFont("helvetica", "bold");
                doc.text("Allekirjoitus:", 14, bottomY + 5);
                doc.addImage(imgData, 'PNG', 14, bottomY + 8, 50, 20);
            }
        } catch(e) {}
    }

    doc.save(`Poytakirja_${p.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}
// --- UUSI: EXCEL-TYYLINEN RAPORTTI NÄYTÖLLE (HTML) ---
// --- UUSI: EXCEL-TYYLINEN RAPORTTI NÄYTÖLLE (PÄIVITETTY HEADER) ---
// --- UUSI: EXCEL-TYYLINEN RAPORTTI NÄYTÖLLE (PÄIVITETTY) ---
function showReportExcelStyle() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const currentMode = window.currentMode || 'home';
    const valves = (p.modes && p.modes[currentMode]) ? p.modes[currentMode].valves : (p.valves || []);
    const meta = p.meta || {};
    
    const machine = (p.modes && p.modes[currentMode] && p.modes[currentMode].machines) 
                    ? p.modes[currentMode].machines.find(m => m.type === 'ahu') 
                    : (p.machines || []).find(m => m.type === 'ahu');
    let machineSetting = "-";
    if (machine) {
        const u = machine.unit || '%';
        const v = machine.settingVal || '-';
        if (u === 'pa') machineSetting = `${v} Pa`;
        else if (u === 'hz') machineSetting = `${v} Hz`;
        else machineSetting = `${v} %`;
    }

    const dateStr = meta.date || new Date().toLocaleDateString('fi-FI');
    const container = document.getElementById('reportContent');

    // SFP ja D2 (Näytölle)
    const reqFlow = (meta.area > 0) ? (meta.area * (meta.height||2.5) * 0.5) / 3.6 : 0;
    
    // Lasketaan kokonaisvirtaama (jotta SFP voidaan laskea tässä näkymässä)
    let gSup=0, gExt=0;
    valves.forEach(v=>{
        const d = (p.ducts||[]).find(d=>d.id==v.parentDuctId);
        let isSup = false;
        if(d && d.type==='supply') isSup=true;
        else if((v.type||'').toLowerCase().includes('tulo')) isSup=true;
        if(isSup) gSup+=(parseFloat(v.flow)||0); else gExt+=(parseFloat(v.flow)||0);
    });

    let sfpStr = "-";
    if ((meta.powerSup||0) + (meta.powerExt||0) > 0) {
        const maxQ = Math.max(gSup, gExt);
        if (maxQ > 0) sfpStr = (((meta.powerSup||0) + (meta.powerExt||0)) / 1000 / (maxQ/1000)).toFixed(2);
    }
    let d2Str = "-";
    if (reqFlow > 0) {
        const pct = (gExt / reqFlow) * 100;
        d2Str = `${pct.toFixed(0)}% (Tavoite ${reqFlow.toFixed(0)} l/s)`;
    }

    let html = `
        <div style="background:#fff; padding:20px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align:center; margin-bottom:20px; border-bottom:2px solid #333; padding-bottom:10px;">
                <h2 style="margin:0;">ILMAMÄÄRIEN MITTAUSPÖYTÄKIRJA</h2>
            </div>
            
            <div style="display:flex; gap:40px; margin-bottom:20px; font-size:13px;">
                <div style="flex:1;">
                    <div style="display:grid; grid-template-columns: 80px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Kohde:</b> <span>${meta.location || '-'}</span></div>
                    <div style="display:grid; grid-template-columns: 80px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Osoite:</b> <span>${meta.address || '-'}</span></div>
                    <div style="display:grid; grid-template-columns: 80px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Konemalli:</b> <span>${machine ? machine.name : 'IV-Kone'}</span></div>
                    <div style="display:grid; grid-template-columns: 80px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Teho:</b> <span>${machineSetting}</span></div>
                </div>
                <div style="flex:1;">
                    <div style="display:grid; grid-template-columns: 100px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Mittaaja:</b> <span>${meta.measurer || '-'}</span></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Yritys:</b> <span>${meta.company || '-'}</span></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Mittari:</b> <span>${meta.device || '-'}</span></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr; gap:5px; border-bottom:1px solid #eee; padding:2px 0;"><b>Päivämäärä:</b> <span>${dateStr}</span></div>
                </div>
            </div>

            <style>
                .rep-table { width:100%; border-collapse:collapse; font-size:11px; }
                .rep-table th, .rep-table td { border:1px solid #ccc; padding:4px; text-align:center; }
                .rep-table th { background:#f0f0f0; }
                .rep-head-sup { background:#e1f5fe !important; }
                .rep-head-ext { background:#ffebee !important; }
                .rep-bold { font-weight:bold; }
                .rep-left { text-align:left !important; }
            </style>

            <table class="rep-table">
                <thead>
                    <tr>
                        <th rowspan="2" class="rep-left" style="width:150px;">Huonetila</th>
                        <th colspan="8" class="rep-head-sup">Tulo</th>
                        <th colspan="8" class="rep-head-ext">Poisto</th>
                    </tr>
                    <tr>
                        <th style="width:20px;">kpl</th> <th>Päätelaite</th> <th>K</th> <th>Pa</th> <th>As</th> <th>Mit</th> <th>Suun</th> <th>%</th>
                        <th style="width:20px;">kpl</th> <th>Päätelaite</th> <th>K</th> <th>Pa</th> <th>As</th> <th>Mit</th> <th>Suun</th> <th>%</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Datankäsittely
    const rooms = {};
    const ducts = p.ducts || [];
    const getDir = (v) => {
        const d = ducts.find(d => d.id == v.parentDuctId);
        if (d && d.type === 'supply') return 'supply';
        if (d && d.type === 'extract') return 'extract';
        const name = (v.type || '').toLowerCase();
        if (name.includes('tulo') || name.includes('kts') || name.includes('supply')) return 'supply';
        return 'extract';
    };
    valves.forEach(v => {
        let uniqueName = v.room || "Muu tila";
        if (v.apartment) uniqueName = `${v.apartment} ${uniqueName}`;
        uniqueName = uniqueName.trim();
        if (!rooms[uniqueName]) rooms[uniqueName] = { label: uniqueName, supply: [], extract: [] };
        const dir = getDir(v);
        rooms[uniqueName][dir].push(v);
    });

    const sortedRooms = Object.keys(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    let gSupFlow2=0, gSupTarget=0, gExtFlow2=0, gExtTarget=0;

    sortedRooms.forEach(key => {
        const r = rooms[key];
        const rowsNeeded = Math.max(r.supply.length, r.extract.length, 1);

        for (let i = 0; i < rowsNeeded; i++) {
            const sup = r.supply[i];
            const ext = r.extract[i];

            let sHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
            if (sup) {
                const model = formatValveDisplay(sup.type); // UUSI: Käytä siistijää
                let kVal = "-";
                if(sup._calcK) kVal = sup._calcK.toFixed(2);
                else {
                    const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
                    kVal = (sup.type && sup.pos!==null) ? kFunc(sup.type, sup.pos).toFixed(2) : "-";
                }
                const f = parseFloat(sup.flow)||0; const t = parseFloat(sup.target)||0;
                const pct = (t>0 && f>0) ? Math.round((f/t)*100)+"%" : "-";
                gSupFlow2 += f; gSupTarget += t;
                sHTML = `<td>1</td><td class="rep-left">${model}</td><td>${kVal}</td><td>${sup.measuredP||'-'}</td><td>${(sup.pos!==null)?Math.round(sup.pos):'-'}</td><td class="rep-bold">${f.toFixed(1)}</td><td>${t>0?t.toFixed(1):'-'}</td><td>${pct}</td>`;
            }

            let eHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
            if (ext) {
                const model = formatValveDisplay(ext.type); // UUSI: Käytä siistijää
                let kVal = "-";
                if(ext._calcK) kVal = ext._calcK.toFixed(2);
                else {
                    const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
                    kVal = (ext.type && ext.pos!==null) ? kFunc(ext.type, ext.pos).toFixed(2) : "-";
                }
                const f = parseFloat(ext.flow)||0; const t = parseFloat(ext.target)||0;
                const pct = (t>0 && f>0) ? Math.round((f/t)*100)+"%" : "-";
                gExtFlow2 += f; gExtTarget += t;
                eHTML = `<td>1</td><td class="rep-left">${model}</td><td>${kVal}</td><td>${ext.measuredP||'-'}</td><td>${(ext.pos!==null)?Math.round(ext.pos):'-'}</td><td class="rep-bold">${f.toFixed(1)}</td><td>${t>0?t.toFixed(1):'-'}</td><td>${pct}</td>`;
            }
            html += `<tr><td class="rep-left rep-bold">${(i===0) ? r.label : ''}</td>${sHTML}${eHTML}</tr>`;
        }
    });

    const totSupPct = gSupTarget > 0 ? Math.round((gSupFlow2/gSupTarget)*100) + " %" : "-";
    const totExtPct = gExtTarget > 0 ? Math.round((gExtFlow2/gExtTarget)*100) + " %" : "-";

    html += `<tr style="background:#f0f0f0; font-weight:bold;"><td class="rep-left">Yhteensä</td>
             <td></td><td></td><td></td><td></td><td></td><td>${gSupFlow2.toFixed(1)}</td> <td>${gSupTarget.toFixed(1)}</td> <td>${totSupPct}</td>
             <td></td><td></td><td></td><td></td><td></td><td>${gExtFlow2.toFixed(1)}</td> <td>${gExtTarget.toFixed(1)}</td> <td>${totExtPct}</td></tr>`;

    html += `</tbody></table>
    
            <div style="margin-top:20px; font-size:12px; display:flex; gap:40px;">
                <div><b>SFP-Luku:</b> ${sfpStr} kW/(m³/s)</div>
                <div><b>D2-Täyttöaste:</b> ${d2Str}</div>
                <div><b>Laakerit (Tulo):</b> ${meta.bearingSup||'-'}</div>
                <div><b>Laakerit (Poisto):</b> ${meta.bearingExt||'-'}</div>
            </div>
            
            <div style="margin-top:15px; font-size:12px;">
                <b>Muuta huomioitavaa:</b><br>
                <textarea style="width:100%; height:50px; border:1px solid #ccc; font-family:sans-serif; padding:5px;" onchange="updateProjectMeta('remarks',this.value)">${p.meta.remarks || ''}</textarea>
            </div>
    
            <div style="margin-top:30px; display:flex; gap:20px; align-items:flex-end;">
                <div style="flex:1;">
                    <div style="font-size:12px; margin-bottom:5px;">Allekirjoitus:</div>
                    <div class="signature-wrapper" style="border:1px solid #ccc; background:#fff;"><canvas id="signaturePadReportView"></canvas></div>
                    <button class="btn btn-secondary btn-sm" onclick="clearSignatureReport('signaturePadReportView')" style="margin-top:5px;">Tyhjennä</button>
                </div>
                <div>
                    <button class="btn btn-primary" onclick="printReportExcelStyle()" style="padding:10px 20px; font-size:16px;">🖨️ Lataa PDF</button>
                </div>
            </div>
    </div>`;

    container.innerHTML = html;
    showView('view-report');
    setTimeout(() => {
        const c = document.getElementById('signaturePadReportView');
        if(c) {
            const ctx = c.getContext('2d');
            c.width = c.parentElement.clientWidth; c.height = 120;
            ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle='#000';
            let drawing=false;
            const getPos=(e)=>{const r=c.getBoundingClientRect(); return {x:(e.touches?e.touches[0].clientX:e.clientX)-r.left, y:(e.touches?e.touches[0].clientY:e.clientY)-r.top}};
            c.onmousedown=(e)=>{drawing=true; ctx.beginPath(); const p=getPos(e); ctx.moveTo(p.x,p.y); e.preventDefault();};
            c.onmousemove=(e)=>{if(!drawing)return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault();};
            window.addEventListener('mouseup', ()=>{drawing=false;});
            c.ontouchstart=(e)=>{drawing=true; ctx.beginPath(); const p=getPos(e); ctx.moveTo(p.x,p.y); e.preventDefault();};
            c.ontouchmove=(e)=>{if(!drawing)return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault();};
        }
    }, 200);
}

// Apufunktio allekirjoituksen lisäämiseen PDF:ään
function addSignatureToPDF(doc) {
    const canvas = document.getElementById('signaturePadReport1') || document.getElementById('signaturePadReport2') || document.getElementById('signaturePad');
    if (canvas) {
        const blank = document.createElement('canvas');
        blank.width = canvas.width; blank.height = canvas.height;
        if (canvas.toDataURL() !== blank.toDataURL()) {
            try {
                const imgData = canvas.toDataURL('image/png');
                let finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 150;
                if (finalY > 250) { doc.addPage(); finalY = 20; }
                doc.text("Allekirjoitus:", 10, finalY);
                doc.addImage(imgData, 'PNG', 10, finalY + 5, 50, 20);
            } catch(e) {}
        }
    }
}

// --- NÄYTÖLLE TULEVAT RAPORTIT (PREVIEW) ---

function showReportSupplyExtract(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const data = buildReportData();
    const container = document.getElementById('reportContent');
    const title = `Pöytäkirja: Tulo/Poisto — ${p.name}`;
    
    let html = `<h3>${title}</h3>`;
    
    // Rungot
    const ahDucts = data.measuredDucts.filter(d => d.group === 'ahu');
    if(ahDucts.length > 0) {
        html += `<h4>Runkokanavien mittaukset (Pitot)</h4>
        <table class="report" style="margin-bottom:20px;">
            <thead><tr><th>Runko</th><th>Mitattu</th><th>Venttiilit yht.</th><th>Ero</th></tr></thead>
            <tbody>`;
        html += ahDucts.map(d => {
            const sum = p.valves.filter(v=>v.parentDuctId===d.id).reduce((a,b)=>a+(parseFloat(b.flow)||0),0);
            const diff = d.measuredFlow - sum;
            return `<tr><td>${d.name}</td><td><b>${d.measuredFlow} l/s</b></td><td>${sum.toFixed(1)} l/s</td><td>${diff.toFixed(1)} l/s</td></tr>`;
        }).join('');
        html += `</tbody></table>`;
    }

    // Venttiilit
    html += `<h4>Venttiilit</h4>
    <table class="report"><thead><tr><th>Huone</th><th>Runko</th><th>Malli</th><th>Pa</th><th>Asento</th><th>L/s</th><th>Tavoite</th></tr></thead><tbody>`;
    html += data.ahu.map(v=>{
        const r = formatReportRow(v, p);
        return `<tr><td>${r.room}</td><td>${r.duct}</td><td>${r.model}</td><td>${r.pa}</td><td>${r.pos}</td><td><b>${r.flow}</b></td><td>${r.target}</td></tr>`;
    }).join('');
    html += `</tbody></table>`;
    
    html += getSignatureHtml('signaturePadReport1', 'printReportAHU');
    container.innerHTML = html;
    showView('view-report');
    setTimeout(()=>initSignaturePad(), 100);
}

function showReportRoof(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const data = buildReportData();
    const container = document.getElementById('reportContent');
    const title = `Pöytäkirja: Huippuimuri — ${p.name}`;
    
    let html = `<h3>${title}</h3>`;
    
    // Rungot
    const rDucts = data.measuredDucts.filter(d => d.group === 'roof');
    if(rDucts.length > 0) {
        html += `<h4>Rappujen tarkistusmittaukset</h4>
        <table class="report" style="margin-bottom:20px;">
            <thead><tr><th>Rappu</th><th>Mitattu (Pitot)</th><th>Venttiilit yht.</th><th>Ero</th></tr></thead>
            <tbody>`;
        html += rDucts.map(d => {
            const sum = p.valves.filter(v=>v.parentDuctId===d.id).reduce((a,b)=>a+(parseFloat(b.flow)||0),0);
            return `<tr><td>${d.name}</td><td><b>${d.measuredFlow}</b></td><td>${sum.toFixed(1)}</td><td>${(d.measuredFlow-sum).toFixed(1)}</td></tr>`;
        }).join('');
        html += `</tbody></table>`;
    }

    html += `<h4>Asunnot / Venttiilit</h4>
    <table class="report"><thead><tr><th>Asunto</th><th>Huone</th><th>Malli</th><th>Pa</th><th>Asento</th><th>L/s</th><th>Tavoite</th></tr></thead><tbody>`;
    html += data.roof.map(v=>{
        const r = formatReportRow(v, p);
        return `<tr><td>${v.apartment||'-'}</td><td>${r.room}</td><td>${r.model}</td><td>${r.pa}</td><td>${r.pos}</td><td><b>${r.flow}</b></td><td>${r.target}</td></tr>`;
    }).join('');
    html += `</tbody></table>`;
    
    html += getSignatureHtml('signaturePadReport2', 'printReportRoof');
    container.innerHTML = html;
    showView('view-report');
    setTimeout(()=>initSignaturePad(), 100);
}

function getSignatureHtml(id, printFunc){
    return `<div style="margin-top:20px; padding:15px; background:#f9f9f9; border-radius:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div style="flex:1;">
            <div style="font-size:12px; color:#666; margin-bottom:4px;">Allekirjoitus:</div>
            <div class="signature-wrapper" style="background:white; border:1px solid #ccc;"><canvas id="${id}"></canvas></div>
            <button class="btn btn-secondary btn-sm" onclick="clearSignatureReport('${id}')" style="margin-top:4px;">Tyhjennä</button>
        </div>
        <div>
            <button class="btn btn-primary" style="padding:10px 20px; font-size:16px;" onclick="${printFunc}()">🖨️ Lataa PDF</button>
        </div>
    </div>`;
}
// Erillinen AHU-demo
function createDemoAHU(){
    const p = { id: Date.now(), name: 'Demo AHU (KTS/KSO)', systemType: 'ahu', ducts: [], valves: [], machines: [], meta: {} };
    const supId = Date.now()+1, extId = Date.now()+2;
    
    p.ducts.push({ id: supId, type: 'supply', name: 'Tulo', size: 160, group:'ahu' });
    p.ducts.push({ id: extId, type: 'extract', name: 'Poisto', size: 160, group:'ahu' });
    p.machines.push({ type:'ahu', name:'IV-Kone', supPct:50, extPct:50 });
    
    const rnd = (target) => Number((target + (Math.random() * 6.0 - 3.0)).toFixed(1));
    const rpos = () => Math.round(2 + Math.random() * 8);
    const rpa = () => Number((30 + Math.random() * 40).toFixed(0));
    
    // TULO: KTS-125
    p.valves.push({ room:'Olohuone', type:'h_kts125', target:20, flow:rnd(15), pos:rpos(), measuredP:rpa(), parentDuctId: supId });
    p.valves.push({ room:'Makuuhuone 1', type:'h_kts125', target:12, flow:rnd(8), pos:rpos(), measuredP:rpa(), parentDuctId: supId });
    p.valves.push({ room:'Makuuhuone 2', type:'h_kts125', target:12, flow:rnd(8), pos:rpos(), measuredP:rpa(), parentDuctId: supId });
    
    // POISTO: KSO-125
    p.valves.push({ room:'Keittiö', type:'h_kso125', target:20, flow:rnd(25), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    p.valves.push({ room:'KPH', type:'h_kso125', target:15, flow:rnd(18), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    p.valves.push({ room:'WC', type:'h_kso125', target:10, flow:rnd(12), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    p.valves.push({ room:'VH', type:'h_kso125', target:8, flow:rnd(10), pos:rpos(), measuredP:rpa(), parentDuctId: extId });

    projects.push(p); saveData(); renderProjects(); activeProjectId = p.id; 
    if (typeof openProject === 'function') openProject(p.id); else { try { window.openProject(p.id); } catch(e) {} } 
    alert('Demo AHU luotu (Venttiilit: KTS-125 & KSO-125)');
}

// Erillinen Huippuimuri-demo
function createDemoRoof(){
    const p = { id: Date.now(), name: 'Demo Huippuimuri (KSO)', systemType: 'roof', ducts: [], valves: [], machines: [], meta: {} };
    const extId = Date.now()+3;
    
    p.ducts.push({ id: extId, type: 'extract', name: 'A-Rappu Poisto', size: 200, group:'roof' });
    
    const rnd = (target) => Number((target + (Math.random() * 5.0 - 2.5)).toFixed(1));
    const rpos = () => Math.round(-5 + Math.random() * 10); // KSO voi olla miinuksella (-5 ... 5)
    const rpa = () => Number((40 + Math.random() * 30).toFixed(0));

    // POISTO: Vain KSO-125
    p.valves.push({ apartment:'A1', room:'Keittiö', type:'h_kso125', target:20, flow:rnd(15), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    p.valves.push({ apartment:'A1', room:'KPH', type:'h_kso125', target:15, flow:rnd(10), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    
    p.valves.push({ apartment:'A2', room:'Keittiö', type:'h_kso125', target:20, flow:rnd(22), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    p.valves.push({ apartment:'A2', room:'KPH', type:'h_kso125', target:15, flow:rnd(18), pos:rpos(), measuredP:rpa(), parentDuctId: extId });

    p.valves.push({ apartment:'A3', room:'Keittiö', type:'h_kso125', target:20, flow:rnd(12), pos:rpos(), measuredP:rpa(), parentDuctId: extId });
    p.valves.push({ apartment:'A3', room:'KPH', type:'h_kso125', target:15, flow:rnd(8), pos:rpos(), measuredP:rpa(), parentDuctId: extId });

    projects.push(p); saveData(); renderProjects(); activeProjectId = p.id; 
    if (typeof openProject === 'function') openProject(p.id); else { try { window.openProject(p.id); } catch(e) {} } 
    alert('Demo Huippuimuri luotu (Venttiilit: KSO-125)');
}

// Tulosta AHU-pöytäkirja
function printReportAHU(){
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF){ alert('PDF-kirjasto puuttuu'); return; }
    const data = buildReportData().ahu;
    const doc = new jsPDF();
    doc.text('Pöytäkirja: AHU', 10, 10);
    const rows = data.map(v=>[v.room||'', v.type||'', v.measuredP??'', Math.round(v.pos??0), (parseFloat(v.flow)||0).toFixed(1), (parseFloat(v.target)||0).toFixed(1)]);
    doc.autoTable({ head: [['Huone','Malli','Pa (Pa)','Avaus','Virtaus (l/s)','Tavoite (l/s)']], body: rows, startY: 20 });
    doc.save('poytakirja_ahu.pdf');
}

// Tulosta Huippuimuri-pöytäkirja
function printReportRoof(){
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF){ alert('PDF-kirjasto puuttuu'); return; }
    const data = buildReportData().roof;
    const doc = new jsPDF();
    doc.text('Pöytäkirja: Huippuimuri', 10, 10);
    const rows = data.map(v=>[v.apartment||'', v.room||'', v.type||'', v.measuredP??'', Math.round(v.pos??0), (parseFloat(v.flow)||0).toFixed(1), (parseFloat(v.target)||0).toFixed(1)]);
    doc.autoTable({ head: [['Asunto','Huone','Malli','Pa (Pa)','Avaus','Virtaus (l/s)','Tavoite (l/s)']], body: rows, startY: 20 });
    doc.save('poytakirja_huippuimuri.pdf');
}

// --- KORJATTU SUHTEELLINEN SÄÄTÖ (OHJAUSTAPA: Hz vs Pa & ÄLYKÄS INDEKSI) ---
function createRelativeAdjustPanel(suggestions, p=null, ducts=[]) {
    const num = (v, d=1) => (isFinite(v) ? Number(v).toFixed(d) : '-');
    const ductTypeMap = {}; (ducts||[]).forEach(d=>{ ductTypeMap[d.id] = d.type; });
    const valves = (p && p.valves) ? p.valves : [];

    // --- Vaihe 1: Laske Lambdat ---
    const withLambda = valves.map(v=>{
        const target = parseFloat(v.targetFlow || v.target || 0);
        const flow = parseFloat(v.flow || 0);
        const lam = target>0 ? (flow/target) : null;
        return { ...v, _lambda: lam };
    }).filter(v=>v._lambda!==null);

    const splitByDir = (dir)=>withLambda.filter(v=>ductTypeMap[v.parentDuctId]===dir);
    const supplyVals = splitByDir('supply');
    const extractVals = splitByDir('extract');

    const dirIndex = (arr)=> {
        if(!arr.length) return {lambda:null, v:null};
        // Etsitään pienin lambda (heikoin lenkki)
        const v = arr.reduce((m,x)=> (m===null || x._lambda < m._lambda) ? x : m, null);
        return { lambda: v? v._lambda : null, v };
    };
    const idxSup = dirIndex(supplyVals);
    const idxExt = dirIndex(extractVals);

    // --- Vaihe 2: Ryhmittely rungoittain ---
    const byDuct = {};
    withLambda.forEach(v=>{
        const d = v.parentDuctId;
        if(!byDuct[d]) byDuct[d] = [];
        byDuct[d].push(v);
    });

    const ductSummaries = Object.entries(byDuct).map(([ductId, arr])=>{
        const lamMin = Math.min(...arr.map(a=>a._lambda));
        const lamMax = Math.max(...arr.map(a=>a._lambda));
        const lamAvg = arr.reduce((a,b)=>a+b._lambda,0)/arr.length;
        const dir = ductTypeMap[ductId];
        const targetSum = arr.reduce((a,b)=>a+(parseFloat(b.targetFlow||b.target||0)||0),0);
        const flowSum = arr.reduce((a,b)=>a+(parseFloat(b.flow||0)||0),0);
        return {ductId, dir, lamMin, lamMax, lamAvg, targetSum, flowSum};
    });

    // --- Vaihe 3: Venttiiliehdotukset ---
    const ventSuggestions = [];
    ductSummaries.forEach(ds=>{
        const targetLam = ds.lamMin; 
        const maxLamInBranch = ds.lamMax; 

        (byDuct[ds.ductId]||[]).forEach(v=>{
            const isIndex = Math.abs(v._lambda - targetLam) < 0.001;
            const desiredFlow = (parseFloat(v.targetFlow||v.target||0)||0) * targetLam;
            const currentPos = (v.pos !== undefined && v.pos !== null) ? Math.round(v.pos) : null;
            
            let advice = "";
            let type = "info"; 

            if (isIndex) {
                // Vale-indeksi tarkistus (jos asento < 5 ja ei ole Pitot-mittaus)
                if (currentPos !== null && currentPos < 5 && v.type !== 'PITOT') {
                    advice = "⚠️ AVAA VENTTIILIÄ! (Mahdollinen vale-indeksi)";
                    type = "warn";
                } else {
                    advice = "✅ INDEKSI (Jätä täysin auki)";
                }
            } else {
                advice = `Kurista: virtaus ${desiredFlow.toFixed(1)} l/s`;
            }

            ventSuggestions.push({
                type: type,
                room: v.room || 'Venttiili',
                dir: ds.dir,
                parentDuctId: ds.ductId,
                currentLambda: v._lambda,
                targetLambda: targetLam,
                maxBranchLambda: maxLamInBranch,
                targetFlow: desiredFlow,
                flow: parseFloat(v.flow||0)||0,
                isIndex: isIndex,
                advice: advice
            });
        });
    });

    // --- Vaihe 4: Koneen säätö (ÄLYKÄS NOPEUS VS PAINE) ---
    const machine = p && (p.machines||[]).find(m=>m.type==='ahu') || (p && (p.machines||[])[0]) || null;
    
    // Luetaan ohjaustapa (oletus speed)
    const controlMode = machine ? (machine.controlMode || 'speed') : 'speed';
    
    // Koneen nykyarvo (riippuu moodista: % tai Pa)
    let currentSetting = 0;
    let maxSetting = 100; // % tai Pa (Pa voi olla enemmän)
    
    if (machine) {
        const raw = String(machine.speed || machine.supPct || "").replace(/[^0-9.,]/g, "");
        const val = parseFloat(raw);
        if (!isNaN(val)) {
            currentSetting = val;
            // Jos paineohjaus, maksimi voi olla esim 500 Pa. Jos nopeus, 100% tai 4.
            if (controlMode === 'pressure') maxSetting = 500; 
            else if (val <= 4) maxSetting = 4;
            else maxSetting = 100;
        }
    }

    const machineAdvice = [];

    const analyzeCapacity = (dir, idxLam) => {
        if(idxLam===null || !isFinite(idxLam) || idxLam<=0) return;
        
        const dirName = dir==='supply'?'Tulo':'Poisto';
        let scaleNeeded = 1.0;
        let unit = "";
        let adviceType = "";

        if (controlMode === 'pressure') {
            // VAKIOPAINE (PA): Paine kasvaa neliössä (Fan Law 2)
            scaleNeeded = Math.pow((1 / idxLam), 2);
            unit = "Pa";
            adviceType = "painetta";
        } else {
            // VAKIONOPEUS (%, HZ): Virtaus kasvaa lineaarisesti (Fan Law 1)
            scaleNeeded = 1 / idxLam;
            unit = (maxSetting===4) ? "nop" : "%";
            adviceType = "nopeutta";
        }

        // Lasketaan uusi asetusarvo
        let newSetting = currentSetting * scaleNeeded;
        
        // Värit ja tekstit
        let action = "OK";
        let color = "green";
        
        if (scaleNeeded > 1.05) { 
            action = "NOSTA"; 
            color = "#d35400"; // Oranssi
            if (currentSetting > 0 && newSetting > maxSetting) color = "red"; // Punainen jos yli maksimin
        } else if (scaleNeeded < 0.95) { 
            action = "LASKE"; 
            color = "#d35400"; 
        }

        let note = `<b style="color:${color}">${action}</b> koneen ${adviceType} (${dirName})`;
        
        // Lisätään tarkempi ohje jos meillä on lähtöarvo
        if (currentSetting > 0) {
            note += `: aseta n. <b>${newSetting.toFixed(0)} ${unit}</b> (kerroin ${scaleNeeded.toFixed(2)}x)`;
            if (newSetting > maxSetting) {
                note += `<br><span style="color:red; font-size:11px;">VAROITUS: Kapasiteetti voi loppua! (Max ${maxSetting})</span>`;
            }
        } else {
            note += `: kerroin ${scaleNeeded.toFixed(2)}x`;
        }

        machineAdvice.push({dir, note});
    };

    analyzeCapacity('supply', idxSup.lambda);
    analyzeCapacity('extract', idxExt.lambda);

    // --- RENDERÖINTI ---
    
    const renderVentTable = (dir, color) => {
        const rows = ventSuggestions.filter(v=>v.dir===dir);
        if(!rows.length) return '';
        const globalMaxLam = Math.max(...rows.map(r=>r.currentLambda), 0.1);

        return `
            <h4 style="margin:10px 0 4px 0; color:${color}; border-bottom:2px solid ${color}; padding-bottom:4px;">
                ${dir==='supply'?'Tulo':'Poisto'} - Tasapainotus
            </h4>
            <table class="report" style="width:100%; border-collapse: collapse;">
                <thead style="background:#f5f5f5;">
                    <tr>
                        <th style="padding:6px;">Huone</th>
                        <th>Nykyinen</th>
                        <th style="width:40%;">Tasapaino</th>
                        <th>Ohje</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(v=>{
                        const pctCurrent = (v.currentLambda / globalMaxLam) * 100;
                        const pctTarget = (v.targetLambda / globalMaxLam) * 100;
                        const barColor = v.isIndex ? '#4caf50' : '#ff9800';
                        const diff = v.currentLambda - v.targetLambda;
                        
                        const barHtml = `
                            <div style="position:relative; width:100%; height:18px; background:#e0e0e0; border-radius:3px;">
                                <div style="position:absolute; left:${pctTarget}%; top:0; bottom:0; width:2px; background:#000; z-index:2;" title="Tavoite"></div>
                                <div style="position:absolute; left:0; top:2px; bottom:2px; width:${pctCurrent}%; background:${barColor}; border-radius:2px; opacity:0.8; z-index:1;"></div>
                            </div>
                            <div style="font-size:10px; color:#666; display:flex; justify-content:space-between;">
                                <span>λ:${v.currentLambda.toFixed(2)}</span>
                                ${!v.isIndex ? `<span>Kurista ${(diff*100).toFixed(0)}% pts</span>` : '<span style="font-weight:bold; color:green;">INDEKSI</span>'}
                            </div>`;

                        return `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:6px;"><b>${v.room}</b><br><span style="font-size:11px; color:#888;">${(p.ducts.find(d=>d.id==v.parentDuctId)||{}).name}</span></td>
                            <td style="text-align:center;">${(v.flow).toFixed(1)}</td>
                            <td style="padding:4px 8px; vertical-align:middle;">${barHtml}</td>
                            <td style="font-size:12px;">${v.advice}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    };

    const renderMachineBox = () => {
        if(!machineAdvice.length) return '';
        const modeText = controlMode === 'pressure' ? 'Vakiopaine (Pa)' : 'Vakionopeus';
        return `
            <div style="margin-top:15px; padding:10px; background:#fff; border-left:4px solid #d35400; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                <h4 style="margin:0 0 5px 0; color:#d35400;">Koneen säätö (${modeText})</h4>
                <div style="font-size:13px; color:#333;">
                    Kun venttiilit on tasapainotettu (λ-arvot samat), säädä konetta näin:
                </div>
                <ul style="margin:5px 0 0 0; padding-left:20px; font-size:13px;">
                    ${machineAdvice.map(m=>`<li style="margin-bottom:8px;">${m.note}</li>`).join('')}
                </ul>
            </div>`;
    };

    return `
        <div id="relativeAdjustContainer" style="padding: 15px; background: #fffdf7; border: 1px solid #e0e0e0; border-radius: 8px; margin-top: 15px;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">⚖️ Suhteellinen säätö</h3>
            <div style="font-size:12px; color:#666; margin-bottom:12px; line-height:1.4;">
                1. Etsi <b>INDEKSI</b> (vihreä). Jos se on kuristettu, <b>AVAA</b> sitä.<br>
                2. Kurista muut (oranssit) mustan viivan tasolle.<br>
                3. Säädä konetta ohjeen mukaan.
            </div>
            ${renderVentTable('supply', '#1976D2')}
            ${renderVentTable('extract', '#d63384')}
            ${renderMachineBox()}
        </div>`;
}
// Erillinen Hybridi-demo (molemmat järjestelmät)
function createDemoHybrid(){
    const p = { id: Date.now(), name: 'Demo Hybridi', systemType: 'hybrid', ducts: [], valves: [], machines: [], meta: {} };
    // AHU-kanavat
    const supId = Date.now()+11, extAhuId = Date.now()+12;
    p.ducts.push({ id: supId, type: 'supply', name: 'Tulo', size: 160, group:'ahu' });
    p.ducts.push({ id: extAhuId, type: 'extract', name: 'Poisto', size: 160, group:'ahu' });
    // Huippuimurin poistokanava
    const roofExtId = Date.now()+13;
    p.ducts.push({ id: roofExtId, type: 'extract', name: 'A-Rappu Poisto', size: 160, group:'roof' });
    // Kone
    p.machines.push({ type:'ahu', name:'IV-Kone', supPct:50, extPct:50 });
    // Hybridi: tahallinen epätasapaino
    const rndH = (base)=> Number((base + (Math.random()*4.0 - 2.0)).toFixed(1));
    const rposH = ()=> Math.round(10 + Math.random()*50);
    const rpaH = ()=> Number((50 + Math.random()*50).toFixed(0));
    p.valves.push({ room:'Olohuone', type:'fresh125', target:30, flow:rndH(30), pos:rposH(), measuredP:rpaH(), parentDuctId: supId });
    p.valves.push({ room:'Makuuhuone', type:'fresh100', target:15, flow:rndH(15), pos:rposH(), measuredP:rpaH(), parentDuctId: supId });
    p.valves.push({ room:'Työhuone', type:'c_dinoa', target:12, flow:rndH(12), pos:rposH(), measuredP:rpaH(), parentDuctId: supId });
    p.valves.push({ room:'Keittiö', type:'c_clik125', target:18, flow:rndH(18), pos:rposH(), measuredP:rpaH(), parentDuctId: supId });
    p.valves.push({ room:'WC', type:'h_kso100', target:10, flow:rndH(10), pos:rposH(), measuredP:rpaH(), parentDuctId: extAhuId });
    p.valves.push({ room:'KPH', type:'h_kso125', target:20, flow:rndH(20), pos:rposH(), measuredP:rpaH(), parentDuctId: extAhuId });
    // Huippuimuriin asuntojen venttiileitä (näkyvät pystynäkymässä), vähintään 4
    const rndHR = (base)=> Number((base + (Math.random()*2.0 - 1.0)).toFixed(1));
    const rposHR = ()=> Math.round(10 + Math.random()*80);
    const rpaHR = ()=> Number((20 + Math.random()*90).toFixed(0));
    p.valves.push({ apartment:'A1', room:'KPH', type:'h_kso100', target:15, flow:rndHR(15), pos:rposHR(), measuredP:rpaHR(), parentDuctId: roofExtId });
    p.valves.push({ apartment:'A2', room:'WC', type:'h_kso100', target:10, flow:rndHR(10), pos:rposHR(), measuredP:rpaHR(), parentDuctId: roofExtId });
    p.valves.push({ apartment:'A3', room:'Keittiö', type:'h_kso125', target:20, flow:rndHR(20), pos:rposHR(), measuredP:rpaHR(), parentDuctId: roofExtId });
    p.valves.push({ apartment:'A4', room:'Siivous', type:'l_ksu125', target:12, flow:rndHR(12), pos:rposHR(), measuredP:rpaHR(), parentDuctId: roofExtId });
    projects.push(p); saveData(); renderProjects(); activeProjectId = p.id; if (typeof openProject === 'function') openProject(p.id); else { try { window.openProject(p.id); } catch(e) {} } alert('Demo Hybridi luotu');
}
// Altista demofunktiot globaalisti index.html onclick-kutsuille
window.createDemoAHU = createDemoAHU;
window.createDemoRoof = createDemoRoof;
window.createDemoHybrid = createDemoHybrid;

// Näytä pöytäkirja: Tulo/Poisto (ruudulla)
function showReportSupplyExtract(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const data = buildReportData().ahu;
    const container = document.getElementById('reportContent');
    const title = p.name ? `Pöytäkirja: Tulo/Poisto — ${p.name}` : 'Pöytäkirja: Tulo/Poisto';
    const dateStr = new Date().toLocaleDateString('fi-FI');
    let html = `<h3>${title}</h3><div style="font-size:12px; color:#666;">Päivämäärä: ${dateStr}</div>`;
    html += `<table class="report"><thead><tr><th>Huone</th><th>Malli</th><th>Pa (Pa)</th><th>Avaus</th><th>Virtaus (l/s)</th><th>Tavoite (l/s)</th></tr></thead><tbody>`;
    html += data.map(v=>`<tr><td>${v.room||''}</td><td>${v.type||''}</td><td>${v.measuredP??''}</td><td>${Math.round(v.pos??0)}</td><td>${(parseFloat(v.flow)||0).toFixed(1)}</td><td>${(parseFloat(v.target)||0).toFixed(1)}</td></tr>`).join('');
    html += `</tbody></table>`;
    html += `<div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
                <span style="font-size:12px; color:#666;">Allekirjoitus:</span>
                <div class="signature-wrapper"><canvas id="signaturePadReport1"></canvas><button class="clear-sig-btn" onclick="clearSignatureReport('signaturePadReport1')">Tyhjennä</button></div>
               <button class="btn btn-primary" onclick="printReportExcelStyle()">Tulosta PDF</button>
            </div>`;
    container.innerHTML = html;
    showView('view-report');
}

// Näytä pöytäkirja: Huippuimuri (ruudulla)
function showReportRoof(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    const data = buildReportData().roof;
    const container = document.getElementById('reportContent');
    const title = p.name ? `Pöytäkirja: Huippuimuri — ${p.name}` : 'Pöytäkirja: Huippuimuri';
    const dateStr = new Date().toLocaleDateString('fi-FI');
    let html = `<h3>${title}</h3><div style="font-size:12px; color:#666;">Päivämäärä: ${dateStr}</div>`;
    html += `<table class="report"><thead><tr><th>Asunto</th><th>Huone</th><th>Venttiili</th><th>Pa (Pa)</th><th>Avaus</th><th>Virtaus (l/s)</th><th>Tavoite (l/s)</th></tr></thead><tbody>`;
    html += data.map(v=>`<tr><td>${v.apartment||''}</td><td>${v.room||''}</td><td>${v.type||''}</td><td>${v.measuredP??''}</td><td>${Math.round(v.pos??0)}</td><td>${(parseFloat(v.flow)||0).toFixed(1)}</td><td>${(parseFloat(v.target)||0).toFixed(1)}</td></tr>`).join('');
    html += `</tbody></table>`;
    html += `<div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
                <span style="font-size:12px; color:#666;">Allekirjoitus:</span>
                <div class="signature-wrapper"><canvas id="signaturePadReport2"></canvas><button class="clear-sig-btn" onclick="clearSignatureReport('signaturePadReport2')">Tyhjennä</button></div>
              <button class="btn btn-primary" onclick="printReportExcelStyle()">Tulosta PDF</button>
            </div>`;
    container.innerHTML = html;
    showView('view-report');
}

function clearSignatureReport(canvasId){
    const c = document.getElementById(canvasId);
    if(!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
}

// --- Allekirjoituspadin alustus ja tyhjennys ---
function initSignaturePad(){
    const ids = ['signaturePad','signaturePadReport1','signaturePadReport2'];
    ids.forEach(id=>{
        const c = document.getElementById(id);
        if(!c) return;
        const parent = c.parentElement;
        const w = Math.min(400, parent ? parent.clientWidth - 40 : 300);
        const h = 120;
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#222';
        let drawing = false;
        let last = null;
        const getPos = (e) => {
            const rect = c.getBoundingClientRect();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
            return {x, y};
        };
        const start = (e) => { drawing = true; last = getPos(e); e.preventDefault(); };
        const move = (e) => {
            if(!drawing) return; const p = getPos(e);
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; e.preventDefault();
        };
        const end = () => { drawing = false; };
        c.onmousedown = start; c.onmousemove = move; window.onmouseup = end;
        c.ontouchstart = start; c.ontouchmove = move; window.ontouchend = end;
    });
}

function clearSignature(){
    const c = document.getElementById('signaturePad');
    if(!c) return; const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
}

// Täyttää rappu-valinnan
function populateRappuSelect(){
    const p = projects.find(x => x.id === activeProjectId);
    const sel = document.getElementById('rappuSelect'); if(!sel) return;
    sel.innerHTML = '';
    const roofDucts = (p?.ducts||[]).filter(d=>d.group==='roof' && d.type==='extract');
    const letters = Array.from(new Set(roofDucts.map(d=> (d.name||'').trim().charAt(0).toUpperCase()).filter(Boolean))).sort();
    if(letters.length===0){ sel.innerHTML = '<option value="">-</option>'; return; }
    letters.forEach(l=>{ const opt=document.createElement('option'); opt.value=l; opt.textContent=l; sel.appendChild(opt); });
}

// Lisää asunto -modal
function openAddApartmentModal(){
    const p = projects.find(x => x.id === activeProjectId);
    const rappuSel = document.getElementById('aptModalRappu');
    const kerrosSel = document.getElementById('aptModalKerros');
    const modal = document.getElementById('addApartmentModal');
    if(!rappuSel || !kerrosSel || !modal) return;
    // Rappu kirjaimet roof-rungoista
    const roofDucts = (p?.ducts||[]).filter(d=>d.group==='roof' && d.type==='extract');
    const letters = Array.from(new Set(roofDucts.map(d=> (d.name||'').trim().charAt(0).toUpperCase()).filter(Boolean))).sort();
    rappuSel.innerHTML = letters.length? letters.map(l=>`<option value="${l}">${l}</option>`).join('') : '<option value="">-</option>';
    // Kerros 1..20
    kerrosSel.innerHTML = Array.from({length:20},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    modal.style.display = 'flex';
}
function closeAddApartmentModal(){ const m=document.getElementById('addApartmentModal'); if(m){ m.style.display='none'; } }
function confirmAddApartments(){
    const p = projects.find(x => x.id === activeProjectId); if(!p) return;
    const rappu = (document.getElementById('aptModalRappu')?.value||'').trim().toUpperCase();
    const floorStr = document.getElementById('aptModalKerros')?.value||'';
    const count = parseInt(document.getElementById('aptModalCount')?.value||'1',10)||1;
    const perRappu = parseInt(document.getElementById('aptModalPerRappu')?.value||'1',10)||1;
    if(!p.meta) p.meta={}; if(!p.meta.floorMap) p.meta.floorMap={};
    let created = 0; let aptNum = 1;
    while(created < count){
        const aptId = `${rappu}${aptNum}`;
        const floor = parseInt(floorStr,10);
        if(!isNaN(floor)) p.meta.floorMap[aptId]=floor;
        // Luodaan placeholder-venttiilit määrällä perRappu (vain apartment-tunnus, käyttäjä valitsee mallin mittauslomakkeella)
        for(let i=0;i<perRappu;i++){
            (p.valves|| (p.valves=[])).push({ apartment: aptId, room: '', type: '', target: 0, flow: 0, pos: null, measuredP: null, parentDuctId: null });
        }
        created++; aptNum++;
    }
    try{ saveData(); }catch(e){}
    closeAddApartmentModal();
    renderDetailsList();
}

// Varmista, että funktio on globaalisti saatavilla onclick-kutsuille
window.showVisual = showVisual;
// --- KORJAUS 1: PUUTTUVAT ASETUSFUNKTIOT ---

function showSettings() {
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    if(!p.meta) p.meta = {};

    const now = new Date();
    const dateVal = p.meta.date || now.toLocaleDateString('fi-FI');
    const timeVal = p.meta.time || now.toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'});

    // Varmistetaan että view-settings on olemassa
    let view = document.getElementById('view-settings');
    if (!view) {
        // Jos HTML puuttuu, luodaan hätävarana (tätä ei pitäisi tarvita jos HTML on kunnossa)
        alert("Virhe: view-settings elementtiä ei löydy HTML:stä."); 
        return;
    }

    view.innerHTML = `
        <div style="padding: 20px; max-width: 600px; margin: 0 auto;">
            <h3>Projektin Lisätiedot</h3>
            
            <label>Mittaaja / Yritys</label>
            <input type="text" id="setMeasurer" class="input" value="${p.meta.measurer || ''}" placeholder="Esim. Yritys Oy">

            <label>Käytetty Mittari</label>
            <input type="text" id="setDevice" class="input" value="${p.meta.device || ''}" placeholder="Esim. TSI / Swema">

            <label>Paikka / Osoite</label>
            <input type="text" id="setLocation" class="input" value="${p.meta.location || ''}">

            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label>Päivämäärä</label>
                    <input type="text" id="setDate" class="input" value="${dateVal}">
                </div>
                <div style="flex:1;">
                    <label>Aika</label>
                    <input type="text" id="setTime" class="input" value="${timeVal}">
                </div>
            </div>

            <div style="margin-top:30px;">
                <button class="btn btn-primary" onclick="saveSettings()">Tallenna tiedot</button>
            </div>
        </div>
    `;
    showView('view-settings');
}

function saveSettings() {
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;
    if(!p.meta) p.meta = {};

    // Tallennetaan kentät turvallisesti
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

    p.meta.measurer = getVal('setMeasurer');
    p.meta.device = getVal('setDevice');
    p.meta.location = getVal('setLocation');
    p.meta.date = getVal('setDate');
    p.meta.time = getVal('setTime');

    saveData(); // Tallennetaan kantaan
    showView('view-details'); // Palataan etusivulle
    renderDetailsList(); // Päivitetään etusivu näyttämään uudet tiedot
}

// Varmistetaan myös tallennusfunktio
function saveData() {
    localStorage.setItem('iv_projects', JSON.stringify(projects));
}