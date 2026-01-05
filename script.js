
// Turvallinen kaavion näyttö -nappi: kutsuu showChart jos olemassa
/* =====================================================
   IV-MASTER PRO — CORE (Yksi totuus)
   - Pilotissa localStorage
   - Projektit = keskeneräiset työt (ei arkisto)
   - UI-tila erillään laskentadatasta
   ===================================================== */

const STORAGE_KEY = 'iv_projects';

// -----------------------
// YKSI TOTUUS (GLOBAL)
// -----------------------
let projects = [];
let activeProjectId = null;

// Mode = home/away/boost
window.currentMode = window.currentMode || 'home';

// UI-tila (konevalinta, myöhemmin zoom/scroll yms.)
window.uiState = window.uiState || {
    activeMachineId: null,
    indexLocked: false,
    indexValveId: null
};

// -----------------------
// HELPERS
// -----------------------
function safeJsonParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
}

function genId(prefix = 'ID') {
    // crypto.randomUUID jos saatavilla, muuten fallback
    try {
        if (crypto?.randomUUID) return crypto.randomUUID();
    } catch {}
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// -----------------------
// STORAGE
// -----------------------
function loadData() {
    projects = safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(projects)) projects = [];

    // Palauta viimeisin aktiivinen projekti jos tallennettu
    const last = localStorage.getItem('iv_active_project_id');
    if (last && projects.some(p => String(p.id) === String(last))) {
        activeProjectId = last;
    } else {
        activeProjectId = projects[0]?.id || null;
    }

    // Varmista perusrakenne ettei renderit kaadu
    projects.forEach(normalizeProject);
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    if (activeProjectId != null) {
        localStorage.setItem('iv_active_project_id', String(activeProjectId));
    }
}

// -----------------------
// NORMALISOINTI (ei migraatiota, vain turvallisuus)
// -----------------------
function normalizeProject(p) {
    if (!p || typeof p !== 'object') return;

    if (!p.id) p.id = genId('P');
    if (!p.name) p.name = 'Nimetön projekti';

    // Meta / asetukset
    if (!p.meta) p.meta = {};

    // K-kirjasto projektissa (jos käytössä)
    if (!p.kLibrary) p.kLibrary = {};

    // Koneet
    if (!Array.isArray(p.machines)) p.machines = [];

    // Vanhat toteutukset käyttää eri paikkoja:
    // - osa käyttää p.modes[mode] (legacy)
    // - osa käyttää konekohtaisesti machine.modes[mode]
    // Tässä EI muuteta rakennetta, vain varmistetaan ettei mikään ole undefined.
    if (!p.modes || typeof p.modes !== 'object') {
        p.modes = { home: { machines: [], ducts: [], valves: [] } };
    }
    if (!p.modes.home)  p.modes.home  = { machines: [], ducts: [], valves: [] };
    if (!p.modes.away)  p.modes.away  = { machines: [], ducts: [], valves: [] };
    if (!p.modes.boost) p.modes.boost = { machines: [], ducts: [], valves: [] };

    // UI-tila projektin sisään (konekohtainen säilytys myöhemmin laajennettavissa)
    if (!p.uiState || typeof p.uiState !== 'object') p.uiState = {};
}
function confirmCreateProject() {
    console.log('confirmCreateProject called');

    const nameEl = document.getElementById('newProjName');
    const typeEl = document.getElementById('newProjType');

    if (!nameEl || !typeEl) {
        alert('Projektin luonti epäonnistui: kenttiä ei löydy');
        return;
    }

    const name = nameEl.value.trim();
    const systemType = typeEl.value;

    if (!name) {
        alert('Anna kohteen nimi');
        return;
    }

    // 🔑 varmista appState
    if (!window.appState) window.appState = {};
    if (!Array.isArray(window.appState.projects)) {
        window.appState.projects = [];
    }

    // 🔥 LUODAAN PROJEKTI
    const projectId = window.createProject({ name, systemType });

    console.log('✅ Projekti luotu:', projectId);

    closeModal();

    // 🔑 AVAA PROJEKTI SUORAAN OIKEAAN NÄKYMÄÄN
    activateProject(projectId, 'home');
}


function loadProjectsFromStorage() {
    try {
        const raw = localStorage.getItem('iv_projects');
        if (!raw) {
            window.appState.projects = [];
            return;
        }

        const parsed = JSON.parse(raw);
        window.appState.projects = Array.isArray(parsed) ? parsed : [];

        console.log('📦 Projektit ladattu:', window.appState.projects.length);
    } catch (e) {
        console.error('❌ Projektien lataus epäonnistui', e);
        window.appState.projects = [];
    }
}


// -----------------------
// UI STATE (projektiin sidottuna, mutta ei laskentaa)
// -----------------------
function ensureUiState() {
    const p = projects.find(x => String(x.id) === String(activeProjectId));
    if (!p) return;

    if (!p.uiState || typeof p.uiState !== 'object') p.uiState = {};

    // Jos projektilla ei ole aktiivista konetta, mutta koneita on -> valitse eka
    if (!p.uiState.activeMachineId && Array.isArray(p.machines) && p.machines.length) {
        p.uiState.activeMachineId = p.machines[0].id;
    }

    // Heijasta projektin uiState globaaliksi (että nykykoodi toimii)
    window.uiState = { ...window.uiState, ...p.uiState };
}

function persistUiStateToProject() {
    const p = projects.find(x => String(x.id) === String(activeProjectId));
    if (!p) return;
    if (!p.uiState || typeof p.uiState !== 'object') p.uiState = {};

    p.uiState = { ...p.uiState, ...window.uiState };
    saveData();
}

// -----------------------
// KÄYNNISTYS
// -----------------------
loadData();
ensureUiState();


// ---------- VIEW API ----------
// ---------- VIEW API ----------
function showView(viewId) {
    // ✅ pidä molemmat state-maailmat samassa
    window.appState = window.appState || {};
    window.uiState  = window.uiState  || {};

    window.appState.currentView = viewId;
    window.uiState.currentView  = viewId;

    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // jos sinulla on FAB-logiikka, se saa nyt oikean viewn
    if (typeof updateFabVisibility === 'function') {
        try { updateFabVisibility(); } catch (e) {}
    }
}

// ===============================
// PROJEKTIN LUONTI (PUHDAS)
// ===============================
window.createProject = function ({ name, systemType }) {
    const project = {
        id: 'p_' + Date.now(),
        name,
        systemType,
        machines: [
            {
                id: 'TK01',
                name: 'TK01',
                modes: {
                    home:  { ducts: [], valves: [] },
                    away:  { ducts: [], valves: [] },
                    boost: { ducts: [], valves: [] }
                }
            }
        ],
        createdAt: Date.now()
    };

    // CORE v1
    window.appState.projects.push(project);
    localStorage.setItem('iv_projects', JSON.stringify(window.appState.projects));

    return project.id;
};



// ---------- MODALS ----------
function openNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (!modal) {
        alert('Projektimodaalia ei löydy');
        return;
    }
    modal.style.display = 'flex';
}



// ---------- UI HOOKS ----------

// ---------- INIT ----------
loadData();
ensureUiState();
showView('view-projects');

console.log('🧱 CORE v1 loaded');




window.uiState = window.uiState || {};

// olemassa olevat
if (window.uiState.activeKLibraryType === undefined) {
    window.uiState.activeKLibraryType = null;
}

// uudet (indeksilogiikka)
if (window.uiState.indexValveId === undefined) {
    window.uiState.indexValveId = null;
}
if (window.uiState.indexLocked === undefined) {
    window.uiState.indexLocked = false;
}

// ===============================
// K-KIRJASTO: sulje taustaa klikkaamalla
// ===============================
document.addEventListener('click', function (e) {
    const ov = document.getElementById('k-lib-overlay');
    if (!ov) return;

    if (e.target === ov) {
        closeKLibraryModal();
    }
});


/* ================================
   KÄYTTÄJÄTILA (PRO / BASIC)
   ================================ */

// Sallittuja arvoja: 'pro' | 'basic'
// ===============================
// 📚 USER K-LIBRARY (A: useita arvoja / lisätieto)
// Tallennus localStorageen + haku + lisääminen
// ===============================

const USER_KLIB_STORAGE_KEY = 'userKLibrary_v1';

// pidetään kirjastodata muistissa

// ===============================
// K-KIRJASTO (käyttäjäkohtainen)
// ===============================

/* ===============================
   K-LIBRARY v2 (ADMIN)
   - ei jaeta valmistaja-K:ta mukana
   - käyttäjä lisää / tuo itse
   - duplikaatit estetään (B-malli: varoitus + auto-hyväksyntä)
   =============================== */

const KLIB_STORAGE_KEY = 'iv_userKLibrary_v2';

// Yksi totuus:
window.userKLibraryV2 = window.userKLibraryV2 || {
  entries: [],     // lista
  index: {}        // key -> entryId (nopea haku, estää duplikaatit)
};

// key: kind|model|size|variant|pos
function klibMakeKey({ kind, model, size, variant, pos }) {
  const k = (kind || 'other').toLowerCase().trim();
  const m = (model || '').trim();
  const s = (size || '').toString().trim();
  const v = (variant || '').trim();
  const p = Number(pos);
  return `${k}|${m}|${s}|${v}|${isFinite(p) ? p : ''}`;
}

function klibSave() {
  try {
    localStorage.setItem(KLIB_STORAGE_KEY, JSON.stringify(window.userKLibraryV2));
  } catch (e) {
    console.warn('KLIB save failed:', e);
  }
}

function klibLoad() {
  try {
    const raw = localStorage.getItem(KLIB_STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.entries)) return false;

    // varmistetaan index
    obj.index = obj.index && typeof obj.index === 'object' ? obj.index : {};
    window.userKLibraryV2 = obj;

    // jos index puuttuu / rikki → rakennetaan uudelleen
    if (!window.userKLibraryV2.index || Object.keys(window.userKLibraryV2.index).length === 0) {
      klibRebuildIndex();
      klibSave();
    }
    return true;
  } catch (e) {
    console.warn('KLIB load failed:', e);
    return false;
  }
}

function klibRebuildIndex() {
  const idx = {};
  (window.userKLibraryV2.entries || []).forEach(ent => {
    const key = klibMakeKey(ent);
    // jos duplikaatti löytyy jo indexistä, pidetään viimeisin (createdAt) ja varoitetaan
    if (idx[key]) {
      const prevId = idx[key];
      const prev = window.userKLibraryV2.entries.find(x => x.id === prevId);
      const a = prev?.createdAt || 0;
      const b = ent?.createdAt || 0;
      if (b >= a) idx[key] = ent.id;
    } else {
      idx[key] = ent.id;
    }
  });
  window.userKLibraryV2.index = idx;
}

// B-malli: jos sama key löytyy → varoita + korvaa vanha automaattisesti
function klibUpsertEntry(entry, { warn = true } = {}) {
  if (!entry) return null;

  // normalisointi
  entry.kind = (entry.kind || 'other').toLowerCase().trim();
  entry.model = (entry.model || '').trim();
  entry.size = (entry.size || '').toString().trim();
  entry.variant = (entry.variant || '').trim();
  entry.pos = Number(entry.pos);
  entry.k = Number(entry.k);

  if (!entry.model || !isFinite(entry.pos) || !isFinite(entry.k)) {
    console.warn('KLIB upsert: puuttuvat kentät', entry);
    return null;
  }

  const key = klibMakeKey(entry);
  const existingId = window.userKLibraryV2.index[key];

  if (!entry.id) entry.id = 'k_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  entry.createdAt = entry.createdAt || Date.now();
  entry.updatedAt = Date.now();
  entry.approved = true; // B: automaattisesti hyväksytty (admin)

  if (existingId) {
    const old = window.userKLibraryV2.entries.find(x => x.id === existingId);
    if (warn) {
      console.warn('⚠️ KLIB: sama venttiili+variant+asento löytyi, korvataan:', { key, old, entry });
      // tähän voi myöhemmin UI-varoituksen (toast/modal)
    }

    // korvaa vanha: poistetaan vanha entry listasta ja asetetaan uusi tilalle
    window.userKLibraryV2.entries = window.userKLibraryV2.entries.filter(x => x.id !== existingId);
  }

  window.userKLibraryV2.entries.push(entry);
  window.userKLibraryV2.index[key] = entry.id;

  klibSave();
  return entry.id;
}

function klibFindK({ kind, model, size, variant, pos }) {
  const key = klibMakeKey({ kind, model, size, variant, pos });
  const id = window.userKLibraryV2.index[key];
  if (!id) return null;
  return window.userKLibraryV2.entries.find(x => x.id === id) || null;
}

// Pilotin kannalta tärkeä: resolve palauttaa yhden K:n varmasti
function klibResolveK({ kind, model, size, variant, pos }) {
  const ent = klibFindK({ kind, model, size, variant, pos });
  return ent && isFinite(ent.k) ? ent.k : null;
}
function klibFindEntries(filter = {}) {
  return (window.userKLibraryV2.entries || []).filter(e => {
    return Object.entries(filter).every(([k, v]) => e[k] === v);
  });
}
function klibUpdateEntry(id, patch = {}) {
  const lib = window.userKLibraryV2;
  const e = lib.entries.find(x => x.id === id);
  if (!e) return false;

  Object.assign(e, patch, {
    updatedAt: Date.now()
  });

  klibSave();
  return true;
}
function klibDeleteEntry(id) {
  const lib = window.userKLibraryV2;
  const e = lib.entries.find(x => x.id === id);
  if (!e) return false;

  const key = klibMakeKey(e);

  lib.entries = lib.entries.filter(x => x.id !== id);
  delete lib.index[key];

  klibSave();
  return true;
}

// ===============================
// Tallenna K-kirjasto
// ===============================







function applyKFromLibraryToActiveValve(opening, k) {
    // 1️⃣ Yritä mittaus-/venttiilimodaalin kenttiä
    const posEl =
        document.getElementById('currentPos') ||   // mittausnäkymä
        document.getElementById('valve-pos');      // edit valve -modal

    const kEl =
        document.getElementById('manualK') ||      // mittausnäkymä
        document.getElementById('valve-k');         // edit valve -modal

    if (!posEl || !kEl) {
        alert('Aktiivista venttiiliä ei löytynyt.');
        return;
    }

    posEl.value = Number(opening).toFixed(1);
    kEl.value   = Number(k).toFixed(2);

    // 2️⃣ Päivitä live-esikatselut jos olemassa
    if (typeof updateLiveK === 'function') {
        updateLiveK();
    }
    if (typeof updateCalculatedFlowPreview === 'function') {
        updateCalculatedFlowPreview();
    }

    // 3️⃣ Visuaalinen palaute
    try {
        posEl.dispatchEvent(new Event('input', { bubbles: true }));
        kEl.dispatchEvent(new Event('input', { bubbles: true }));
    } catch(e) {}

    // 4️⃣ Sulje vain venttiilimodaali (ei koko K-kirjastoa)
    closeKValveDetailModal();
}


// 🔧 Päättelee venttiilin flowType valitun runkokanavan perusteella
function getSelectedFlowTypeFromDuct() {
    const ductEl = document.getElementById('valve-duct');
    if (!ductEl?.value) return null;

    const p = projects.find(p => p.id === activeProjectId);
    if (!p || !Array.isArray(p.ducts)) return null;

    const duct = p.ducts.find(d => String(d.id) === String(ductEl.value));
    return duct?.type || null; // 'supply' | 'extract'
}



function getActiveValvesForMap(project) {
    if (!project) return [];

    const mode = project.currentMode || project.activeMode;
    if (project.modes && mode && project.modes[mode]?.valves) {
        return project.modes[mode].valves;
    }

    // Fallback vanhoille projekteille
    if (Array.isArray(project.valves)) {
        return project.valves;
    }

    return [];
}

// ✅ Yksi totuus: varmista että mode-valves on aina olemassa ja käytettävä
function ensureModeValves(p, mode) {
    const mm = getActiveMachineMode(p, mode);
    return mm.valves;
}


// ✅ Kartta käyttää aina tätä (mode -> fallback p.valves)
function getActiveValvesForMap(p) {
    const mode = window.currentMode || 'home';
    return ensureModeValves(p, mode);
}

// ✅ JS-stringin turvallinen upotus onclick-attribuuttiin
function escapeJsString(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Varmista että kirjasto on ladattu


// 🔓 Päivittää K-kirjaston hakunapin tilan venttiilimodaalissa
function updateKLibraryButtonState() {
    const btn = document.getElementById('btn-show-user-k');
    if (!btn) return;

    const modelEl = document.getElementById('valve-model');
    const sizeEl  = document.getElementById('valve-size');
    const ductEl  = document.getElementById('valve-duct');

    const hasModel = !!modelEl?.value;
    const hasSize  = !!sizeEl?.value;
    const hasDuct  = !!ductEl?.value;

    if (hasModel && hasSize && hasDuct) {
        btn.disabled = false;
        btn.classList.remove('btn-disabled');
        btn.title = '';
    } else {
        btn.disabled = true;
        btn.classList.add('btn-disabled');
        btn.title = 'Valitse runko, malli ja koko';
    }
}
function findClosestOpening(entries, targetOpening) {
    if (!Array.isArray(entries) || !entries.length) return null;

    let best = null;
    let bestDiff = Infinity;

    entries.forEach(e => {
        const diff = Math.abs(Number(e.opening) - Number(targetOpening));
        if (diff < bestDiff) {
            best = e;
            bestDiff = diff;
        }
    });

    return best;
}

function findMedianEntry(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    const mid = Math.floor(entries.length / 2);
    return entries[mid];
}
function openKLibraryForCurrentValve() {
    const model = document.getElementById('valve-model')?.value || '';
    const size  = document.getElementById('valve-size')?.value || '';
    const pos   = document.getElementById('valve-pos')?.value || '';

    openKLibraryModal({
        prefill: { model, size, pos }
    });
}


// Normalisoi K
function normalizeKValue(k) {
    if (k === null || k === undefined || k === '') return null;
    const n = parseFloat(k);
    return Number.isFinite(n) ? n : null;
}
function parseValveTypeKey(type) {
    if (!type) return null;

    // Odotetut tyypit esim:
    // "f_kso125" "f_kts125" "f_iris160" "kso125" ...
    const s = String(type).toLowerCase();

    // 1) yritä muotoa *_<model><size>
    //    ottaa viimeisimmän <kirjaimet><numerot> -jakson
    const m = s.match(/([a-zåäö]+)\s*[-_]*\s*(\d{2,4})\s*$/i) || s.match(/([a-zåäö]+)(\d{2,4})/i);
    if (!m) return null;

    const model = String(m[1] || '').replace(/[^a-zåäö]/gi, '').toUpperCase();
    const size = Number(m[2]);

    if (!model || !Number.isFinite(size)) return null;

    return { model, size };
}
function getValveCategoryFromType(type) {
    if (!type) return 'other';

    const t = String(type).toLowerCase();

    // Säätöpellit / mittauspellit
    if (
        t.includes('iris') ||
        t.includes('pelti') ||
        t.includes('dru') ||
        t.includes('spm')
    ) {
        return 'damper';
    }

    // Poistoventtiilit (heuristiikka)
    if (
        t.includes('epo') ||
        t.includes('poisto') ||
        t.includes('extract')
    ) {
        return 'extract';
    }

    // Tulo on oletus (valtaosa päätelaitteista)
    return 'supply';
}




// 📌 Palauta K-arvo ja avaus venttiilille
function applyKFromLibrary(entry) {
    const kEl   = document.getElementById('valve-k');
    const posEl = document.getElementById('valve-pos');
    const hint  = document.getElementById('k-hint');

    if (!kEl || !entry) return;

    kEl.value = entry.k;

    if (entry.pos != null && posEl) {
        posEl.value = entry.pos;
    }

    if (hint) {
        hint.textContent = '📚 K valittu K-kirjastosta';
        hint.style.display = 'block';
    }

    if (typeof calcFlowNow === 'function') {
        calcFlowNow();
    }
}



// 🔧 Palauttaa valitun venttiilikoon millimetreinä
function getSelectedValveSizeMm() {
    const sizeEl = document.getElementById('valve-size');
    if (!sizeEl?.value) return null;

    const opt = sizeEl.selectedOptions?.[0];
    if (!opt) return null;

    // opt.textContent esim "Ø125"
    const m = opt.textContent.match(/(\d+)/);
    return m ? Number(m[1]) : null;
}

// Rakennetaan kirjaston avain: "MALLI ØKOKO"


// Hae kaikki rivit yhdelle avaimelle (järjestettynä avauksen mukaan)

/* =====================================================
   VALVE GROUPS – SINGLE INIT SOURCE (ÄLÄ KOSKE MUUALTA)
   ===================================================== */

window.valveGroups = window.valveGroups || [];
window._valveGroupsReady = false;

/**
 * Rakentaa valveGroups TASAN KERRAN
 * Kaikki muut osat vain kutsuvat tätä
 */
function initValveGroupsOnce() {
    if (window._valveGroupsReady) {
        return window.valveGroups;
    }

    window._valveGroupsReady = true;

    // 🔽 TÄHÄN siirretään nykyinen valveGroups build -logiikka
    const groups = [];

    const add = name => {
        if (!groups.includes(name)) groups.push(name);
    };

    [
        'Halton KSO','Halton KTS','Halton URH','Halton URA','Halton TLA','Halton TLD',
        'Halton ULA','Halton UKO','Halton KSP (Sauna)',
        'Fläkt KSO','Fläkt KTS','Fläkt KSOS','Fläkt KGEB','Fläkt E-T','Fläkt RK',
        'Lindab KSU','Lindab KI','Lindab KPF',
        'Climecon RINO','Climecon DINO-A','Climecon DINO-T','Climecon VIP',
        'Climecon ELO','Climecon CLIK','Climecon ECO-1',
        'EH','EHUS',
        'Fincoil VTA','Fincoil VS','Fincoil VK',
        'Lapinleimu Kilsa','Lapinleimu OSO','Lapinleimu OTP',
        'RCL OKI','RCL ELO',
        'Swegon COLIBRI Wall','Swegon COLIBRI Ceiling',
        'Swegon EAGLE Wall','Swegon EAGLE Ceiling',
        'Heatco HTI','Heatco HPI',
        'IRIS-Pelti','SPM Mittauspelti','Lindab DRU'
    ].forEach(add);

    window.valveGroups = groups;

    console.log('✔ valveGroups ready:', groups.length, groups);

    return groups;
}

function valveHasMissingData(v) {
    if (!Number.isFinite(Number(v.flow)) || Number(v.flow) <= 0) return true;
    if (!Number.isFinite(Number(v.measuredP)) || Number(v.measuredP) <= 0) return true;
    if (!Number.isFinite(Number(v.kWorking)) || Number(v.kWorking) <= 0) return true;
    return false;
}

function renderMeasurementList(container) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) {
        container.innerHTML = '<div style="color:#777;padding:10px;">Ei aktiivista konetta.</div>';
        return;
    }

    const mode = window.currentMode || 'home';
    if (!window.currentMode) window.currentMode = mode;

    const mm = machine.modes?.[mode];
    if (!mm) {
        container.innerHTML = '<div style="color:#777;padding:10px;">Ei dataa tälle tilalle.</div>';
        return;
    }

    const ducts = Array.isArray(mm.ducts) ? mm.ducts : [];

    // Kerää venttiilit KONEEN runkojen sisältä (ei koskaan projektitasolta)
    const all = ducts.flatMap(d =>
        (Array.isArray(d.valves) ? d.valves : []).map(v => ({ v, ductType: d.type }))
    );

    const supply = all
        .filter(x => x.ductType === 'supply')
        .map(x => x.v)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const extract = all
        .filter(x => x.ductType === 'extract')
        .map(x => x.v)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const maxRows = Math.max(supply.length, extract.length);

    const pctOf = (flow, target) => {
        const f = Number(flow);
        const t = Number(target);
        if (!Number.isFinite(f) || !Number.isFinite(t) || t <= 0) return null;
        return Math.round((f / t) * 100);
    };

    const fmt = (x) => (x == null || x === '' ? '' : x);
    const fmtN = (x, d = 1) => {
        const n = Number(x);
        return Number.isFinite(n) ? n.toFixed(d) : '';
    };

    const valveTitle = (v) => {
        // Päätelaite isolla: KSO-125 / KTS-100 ...
        return (typeof formatValveDisplay === 'function')
            ? formatValveDisplay(v?.type)
            : (v?.type || '-');
    };

    // UI: otsikko tulee jo näkymästä ("Mittauspöytäkirja / Lista ..."),
    // joten tässä ei tehdä tuplaotsikoita.
    container.innerHTML = `
        <div id="measureListBody"></div>
        <style>
            .pair-row {
                display:flex;
                gap:10px;
                padding:6px 0;
                border-bottom:1px solid #eee;
            }
            .pair-side {
                flex:1;
                min-width:0;
                background:#fff;
                border:1px solid #f0f0f0;
                border-radius:8px;
                padding:8px;
            }
            .pair-empty {
                flex:1;
                min-width:0;
                border:1px dashed #e0e0e0;
                border-radius:8px;
                padding:8px;
                color:#999;
                background:#fafafa;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:12px;
            }
            .mini-grid {
                display:grid;
                grid-template-columns: 1.4fr 0.9fr 0.7fr 0.7fr 0.7fr 0.7fr 0.6fr 0.6fr 0.5fr;
                gap:8px;
                align-items:center;
                font-size:12px;
            }
            .mini-h {
                color:#666;
                font-size:11px;
                font-weight:800;
                text-transform:uppercase;
                letter-spacing:0.02em;
                margin-bottom:6px;
            }
            .cell-strong { font-weight:900; font-size:13px; }
            .cell-muted { color:#777; }
            .cell-right { text-align:right; }
            .inline-pos, .inline-k {
                width:100%;
                box-sizing:border-box;
                padding:6px 6px;
                border:1px solid #ddd;
                border-radius:6px;
                font-size:13px;
            }
            .inline-pos:focus, .inline-k:focus {
                outline:none;
                border-color:#2196F3;
            }
        </style>
    `;

    const body = container.querySelector('#measureListBody');

    const renderSide = (v, sideLabel) => {
        const missing = (typeof valveHasMissingData === 'function') ? valveHasMissingData(v) : false;
        const pct = missing ? null : pctOf(v.flow, v.target);
        const pctCls = (typeof pctClass === 'function') ? pctClass(pct) : '';

        return `
            <div class="pair-side">
                <div class="mini-h">${sideLabel}</div>

                <div class="mini-grid measure-row" data-id="${String(v.id)}">
                    <div style="min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${escapeHtml(v.room || '—')}
                    </div>

                    <div class="cell-strong">
                        ${escapeHtml(valveTitle(v))}
                    </div>

                    <div class="cell-right">
                        <input class="inline-pos" type="number" step="0.5" value="${fmt(v.pos ?? '')}">
                    </div>

                    <div class="cell-right">
                        <input class="inline-k" type="number" step="0.01" value="${fmt(v.kWorking ?? '')}">
                    </div>

                    <div class="cell-right cell-strong">
                        ${fmtN(v.flow, 1)}
                    </div>

                    <div class="cell-right cell-muted">
                        ${fmtN(v.target, 1)}
                    </div>

                    <div class="cell-right ${pctCls}">
                        ${pct == null ? (missing ? '⚠️' : '-') : (pct + '%')}
                    </div>

                    <div class="cell-right">
                        ${v.measuredP ?? '-'}
                    </div>

                    <div class="cell-right">
                        ${v.isIndex ? '🔒' : ''}
                    </div>
                </div>
            </div>
        `;
    };

    let html = '';

    // Header-rivi sarakkeille (tulo/poisto vierekkäin)
    if (maxRows > 0) {
       html += `
<div class="pair-row" style="border-bottom:none; padding-bottom:0;">
    <div>
        <div class="mini-grid-header">
            <div>Huone</div>
            <div>Päätelaite</div>
            <div class="cell-right">Avaus</div>
            <div class="cell-right">K</div>
            <div class="cell-right">Mit</div>
            <div class="cell-right">Suunn</div>
            <div class="cell-right">%</div>
            <div class="cell-right">Pa</div>
            <div class="cell-right">Ind</div>
        </div>
    </div>

    <div>
        <div class="mini-grid-header">
            <div>Huone</div>
            <div>Päätelaite</div>
            <div class="cell-right">Avaus</div>
            <div class="cell-right">K</div>
            <div class="cell-right">Mit</div>
            <div class="cell-right">Suunn</div>
            <div class="cell-right">%</div>
            <div class="cell-right">Pa</div>
            <div class="cell-right">Ind</div>
        </div>
    </div>
</div>
`;

    }

    for (let i = 0; i < maxRows; i++) {
        const sv = supply[i] || null;
        const ev = extract[i] || null;

        html += `<div class="pair-row">`;

        if (sv) html += renderSide(sv, '🔵 TULO');
        else html += `<div class="pair-empty">—</div>`;

        if (ev) html += renderSide(ev, '🔴 POISTO');
        else html += `<div class="pair-empty">—</div>`;

        html += `</div>`;
    }

    body.innerHTML = html || '<div style="color:#777;padding:10px;">Ei venttiileitä.</div>';

    // ✅ Tärkeä: säilyttää vanhan klikki+inline input -logiikan
    bindMeasurementListEvents(container);
}



function calcPct(flow, target) {
    const f = Number(flow);
    const t = Number(target);
    if (!isFinite(f) || !isFinite(t) || t === 0) return null;
    return Math.round((f / t) * 100);
}
function updateDuctStatus(duct) {
    const vals = (duct.valves || [])
        .map(v => calcPct(v.flow, v.target))
        .filter(v => v != null);

    if (!vals.length) return;

    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const el = document.getElementById(`duct-${duct.id}-status`);
    if (!el) return;

    el.textContent = `${avg}%`;
    el.className = 'duct-status ' + pctClass(avg);
}
function bindMeasurementListV2(container) {
    container.addEventListener('input', (e) => {
        const inp = e.target;
        if (!(inp instanceof HTMLInputElement)) return;

        const field = inp.dataset.f;
        if (!field) return;

        const tr = inp.closest('tr');
        if (!tr) return;

        const valveId = tr.dataset.id;

        const p = projects.find(x => x.id === activeProjectId);
        if (!p) return;

        const machine = getActiveMachine(p);
        if (!machine) return;

        const mode = window.currentMode || 'home';
        const ducts = machine.modes?.[mode]?.ducts || [];

        let duct = null;
        let v = null;

        // 🔎 Hae venttiili (myös draft)
        for (const d of ducts) {
            for (const valve of d.valves || []) {
                if (
                    valve.id === valveId ||
                    (valve.__isDraft && tr.classList.contains('draft-row'))
                ) {
                    duct = d;
                    v = valve;
                    break;
                }
            }
            if (v) break;
        }

        if (!v) return;

        // 🔹 Päivitä kenttä dataan
        if (field === 'kWorking') {
            v.kWorking = inp.value === '' ? '' : Number(inp.value);
        } else {
            v[field] = inp.value;
        }

       if (v.__isDraft) {
    const promoted = promoteDraftIfNeeded(duct, v);
    if (promoted) {
        // 🔁 renderöidään KERRAN, turvallisessa kohdassa
        requestAnimationFrame(() => {
         

        });
        return;
    }


}

        // 🔄 Päivitä näkyvä tila kun avaus tai K muuttuu
if (!v.__isDraft && (field === 'pos' || field === 'kWorking')) {
    requestAnimationFrame(() => {
    });
}


        // ✅ 1) KÄSIN SYÖTETTY K → näytä 💾 heti (ei rerenderiä)
        if (field === 'kWorking') {
            // draft-rivillä ei ikonia
            if (v.__isDraft) return;

            const kCell = tr.querySelector('td.k-cell');
            if (!kCell) return;

            // poistetaan vanha ikoni jos on
            const old = kCell.querySelector('.k-save-hint');
            if (old) old.remove();

            // näytä vain jos K on oikeasti syötetty
            if (v.kWorking != null && v.kWorking !== '' && Number.isFinite(Number(v.kWorking))) {
                // (vaihe A logiikka: näytä jos uusi)
                if (typeof isKValueNewForValve === 'function' ? isKValueNewForValve(v) : true) {
                    const span = document.createElement('span');
                    span.className = 'k-save-hint';
                    span.title = 'Tallenna K-arvo kirjastoon';
                    span.textContent = '💾';
                    span.style.position = 'absolute';
                    span.style.right = '6px';
                    span.style.top = '50%';
                    span.style.transform = 'translateY(-50%)';
                    span.style.cursor = 'pointer';
                    span.style.fontSize = '15px';
                    span.style.opacity = '0.8';

                    span.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (typeof openSaveKModal === 'function' && v.id) {
                            openSaveKModal(v.id);
                        }
                    });

                    kCell.appendChild(span);
                }
            }

            return; // ei muuta tässä
        }

        // 🔹 K-ehdotus (päätelaite + avaus)
        if (field === 'type' || field === 'pos') {
            const suggestedK = resolveWorkingKForValve(v);
            if (Number.isFinite(suggestedK)) {
                v.kWorking = suggestedK;
                return;
            }
        }
    });
}


function buildModeSummary(machine, modeKey, label) {
    const mm = machine.modes?.[modeKey];
    if (!mm || !Array.isArray(mm.ducts)) {
        return {
            label,
            supplyPct: null,
            extractPct: null,
            pressurePa: null
        };
    }

    const allValves = mm.ducts.flatMap(d =>
        (Array.isArray(d.valves) ? d.valves.map(v => ({
            ...v,
            ductType: d.type
        })) : [])
    );

    const supply = allValves.filter(v => v.ductType === 'supply' && !v.isIndex);
    const extract = allValves.filter(v => v.ductType === 'extract' && !v.isIndex);

    const sum = (arr, key) =>
        arr.reduce((a, v) => a + (Number(v[key]) || 0), 0);

    const supplyPct = calcPct(
        sum(supply, 'flow'),
        sum(supply, 'target')
    );

    const extractPct = calcPct(
        sum(extract, 'flow'),
        sum(extract, 'target')
    );

    const pressurePa =
        mm.summary?.pressurePa ??
        machine.pressurePa ??
        null;

    return {
        label,
        supplyPct,
        extractPct,
        pressurePa
    };
}

function pctClass(pct) {
    if (pct == null || !isFinite(pct)) return 'pct-none';

    const v = Math.round(pct);

    // Vihreä hyväksyttävä alue
    if (v >= 90 && v <= 110) return 'pct-ok';

    // Keltainen varoitusalue (ala- ja yläpuoli)
    if ((v >= 75 && v < 89) || (v > 110 && v <= 120)) return 'pct-warn';

    // Punainen: selkeä virhe
    return 'pct-bad';
}


function sumFlowAndTarget(valves) {
    let flow = 0;
    let target = 0;

    valves.forEach(v => {
        if (isFinite(v.flow)) flow += Number(v.flow);
        if (isFinite(v.target)) target += Number(v.target);
    });

    return {
        flow,
        target,
        pct: calcPct(flow, target)
    };
}
function createEmptyMachine({ id, name, type = 'ahu' }) {
    return {
        id,
        name,
        type,
        modes: {
            home:   { ducts: [], summary: {} },
            away:   { ducts: [], summary: {} },
            boost:  { ducts: [], summary: {} }
        }
    };
}



// ===============================
// 3.2.1 – PÖYTÄKIRJADATA (YHTEINEN TOTUUS)
// ===============================

// Venttiilin "puuttuu dataa" -tulkinta (käytetään raportoinnissa)
function reportValveHasMissingData(v) {
    // HUOM: flow voi olla 0 vielä mittaamatta; Pa 0; K puuttuu
    const flowOk = Number.isFinite(Number(v.flow)) && Number(v.flow) > 0;
    const paOk   = Number.isFinite(Number(v.measuredP)) && Number(v.measuredP) > 0;
    const kOk    = Number.isFinite(Number(v.kWorking)) && Number(v.kWorking) > 0;

    // Mittaus voidaan sallia ilman K:ta työmaalla, mutta raportissa se on silti "puuttuu"
    // (K voidaan tulla kirjastosta myöhemmin, mutta virallinen raportti kertoo puutteen)
    return !(flowOk && paOk && kOk);
}

function reportPct(flow, target) {
    const f = Number(flow) || 0;
    const t = Number(target) || 0;
    if (!(t > 0)) return null;
    return Math.round((f / t) * 100);
}

function reportValveStatus(pct) {
    // pct null = ei tavoitetta → käsitellään "KESKEN" koska ei voi arvioida OK-tilaa
    if (pct == null) return 'KESKEN';
    if (pct >= 90 && pct <= 110) return 'OK';
    return 'KESKEN';
}

function reportDuctStatus({ hasMissing, validValveStatuses, hasAnyValid }) {
    // jos rungossa on yksikin PUUTTUU → KESKEN
    if (hasMissing) return 'KESKEN';
    // jos rungossa ei ole yhtään "validia" (mitattua + K + Pa) → KESKEN
    if (!hasAnyValid) return 'KESKEN';
    // jos yksikin valid-venttiili ei ole OK → KESKEN
    if (validValveStatuses.some(s => s !== 'OK')) return 'KESKEN';
    return 'OK';
}

function safeNowFiDate() {
    try { return new Date().toLocaleDateString('fi-FI'); } catch { return ''; }
}
function safeNowFiTime() {
    try { return new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

/**
 * buildMeasurementReport({ projectId, machineId, mode })
 * - projectId oletus: activeProjectId
 * - machineId oletus: aktiivinen kone
 * - mode oletus: window.currentMode || 'home'
 *
 * Palauttaa report-olion, jota voidaan käyttää Excel/PDF/Word -exporteissa.
 */
function resolveValveFlowType(valve, duct) {
    if (valve.flowType === 'supply' || valve.flowType === 'extract') {
        return valve.flowType;
    }
    if (duct?.type === 'supply' || duct?.type === 'extract') {
        return duct.type;
    }
    return 'extract'; // turvallinen fallback
}
function getUnifiedReport({ projectId = activeProjectId, machineId = null, mode = null } = {}) {
    const p = projects.find(x => x.id === projectId);
    if (!p) {
        console.warn('getUnifiedReport: projektia ei löydy', projectId);
        return null;
    }

    // Varmista UI-tila (aktiivinen kone)
    if (typeof ensureUiState === 'function') ensureUiState();

    const activeMode = mode || window.currentMode || 'home';

    // Jos koneId ei tule parametrina, otetaan UI-tilasta / aktiivisesta koneesta
    const resolvedMachineId =
        machineId ||
        window.uiState?.activeMachineId ||
        (typeof getActiveMachine === 'function' ? getActiveMachine(p)?.id : null) ||
        null;

    const report = buildMeasurementReport({
        projectId,
        machineId: resolvedMachineId,
        mode: activeMode
    });

    // Debug + jatkokäyttö
    window._lastUnifiedReport = report;

    if (!report) {
        console.warn('getUnifiedReport: buildMeasurementReport palautti null');
        return null;
    }

    return report;
}


function buildMeasurementReport({ projectId = activeProjectId, machineId = null, mode = null } = {}) {
    const p = projects.find(x => x.id === projectId);
    if (!p) return null;

    const activeMode = mode || window.currentMode || 'home';

    if (!Array.isArray(p.machines)) p.machines = [];

    const meta = {
        address: p.meta?.address || p.meta?.kohde || p.meta?.site || p.name || '',
        date: p.meta?.date || (new Date().toLocaleDateString('fi-FI')),
        notes: p.meta?.notes || ''
    };

    const toNum = v => {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const pct = (flow, target) => {
        const f = toNum(flow);
        const t = toNum(target);
        if (!Number.isFinite(f) || !Number.isFinite(t) || t <= 0) return null;
        return (f / t) * 100;
    };

    const sumAgg = (arr) => {
        const sumFlow = arr.reduce((a, v) => a + (toNum(v.flow) || 0), 0);
        const sumTarget = arr.reduce((a, v) => a + (toNum(v.target) || 0), 0);
        const pctTotal = (sumTarget > 0) ? (sumFlow / sumTarget) * 100 : null;
        return { sumFlow, sumTarget, pctTotal };
    };

    const buildAhuPage = (m) => {
        const mm = m.modes?.[activeMode] || {};
        const ducts = Array.isArray(mm.ducts) ? mm.ducts : [];

        // kloonaa kanavat + venttiilit (raportti ei koske käyttödataa)
        const ductsClone = ducts.map(d => ({
            ...d,
            valves: (Array.isArray(d.valves) ? d.valves : []).map(v => ({ ...v }))
        }));

        // 🔑 Aseta venttiileille ductType LASKENNALLISESTI
        ductsClone.forEach(d => {
            d.valves.forEach(v => {
                v.ductType = d.type; // 'supply' | 'extract'
            });
        });

        const allValves = ductsClone.flatMap(d => d.valves || []);

        // 🔹 Erottele (ei indeksiventtiileitä)
        const supply = allValves
            .filter(v => v.ductType === 'supply' && !v.isIndex)
            .map(v => ({ ...v, pct: calcPct(v.flow, v.target) }));

        const extract = allValves
            .filter(v => v.ductType === 'extract' && !v.isIndex)
            .map(v => ({ ...v, pct: calcPct(v.flow, v.target) }));

        // 🔹 Yhteenveto
        const supAgg = {
            sumFlow: supply.reduce((a, v) => a + (Number(v.flow) || 0), 0),
            sumTarget: supply.reduce((a, v) => a + (Number(v.target) || 0), 0)
        };
        supAgg.pct = calcPct(supAgg.sumFlow, supAgg.sumTarget);

        const extAgg = {
            sumFlow: extract.reduce((a, v) => a + (Number(v.flow) || 0), 0),
            sumTarget: extract.reduce((a, v) => a + (Number(v.target) || 0), 0)
        };
        extAgg.pct = calcPct(extAgg.sumFlow, extAgg.sumTarget);

        const totalFlow = supAgg.sumFlow + extAgg.sumFlow;
        const totalTarget = supAgg.sumTarget + extAgg.sumTarget;
        const totalPct = calcPct(totalFlow, totalTarget);

        const summary = {
            supply: supAgg,
            extract: extAgg,
            totalPct,
            d2: (mm.summary?.d2 ?? '-'),
            sfpSup: (mm.summary?.sfpSup ?? '-'),
            sfpExt: (mm.summary?.sfpExt ?? '-')
        };

        const modeRows = [
            buildModeSummary(m, 'home', 'Mitoitus'),
            buildModeSummary(m, 'away', 'Poissa'),
            buildModeSummary(m, 'boost', 'Tehostus')
        ];

        return {
            meta,
            mode: activeMode,

            // Sivun otsikointi (raportin header käyttää näitä)
            deviceType: (m.type || 'ahu'),
            code: m.name || m.code || m.id || '',
            name: m.name || '',

            machine: {
                id: m.id,
                name: m.name || '',
                control: m.unit || m.control || ''
            },

            // Varsinainen taulukko-data (tulo/poisto)
            supply,
            extract,

            // Rakenteet (jos halutaan näyttää myöhemmin rungot ym.)
            ducts: ductsClone,

            summary,
            modeRows
        };

    };

    const pages = [];

    // jos pyydetty tietty kone
    if (machineId != null) {
        const m = p.machines.find(x => String(x.id) === String(machineId) || String(x.name) === String(machineId));
        if (!m) {
            console.warn('buildMeasurementReport: konetta ei löydy, rakennetaan koko raportti', machineId);
        } else {
            pages.push(buildAhuPage(m));
        }
    }

    // jos ei löytynyt tai ei annettu → kaikki koneet
    if (pages.length === 0) {
        p.machines.forEach(m => pages.push(buildAhuPage(m)));
    }

    // ✅ KOHTA D: KOHDEYHTEENVETO (viimeinen sivu)
    const buildSiteSummary = () => {
        const rows = (pages || []).map(pg => {
            const s = pg?.summary?.supply || {};
            const e = pg?.summary?.extract || {};

            const sFlow = Number(s.sumFlow) || 0;
            const sTar  = Number(s.sumTarget) || 0;
            const eFlow = Number(e.sumFlow) || 0;
            const eTar  = Number(e.sumTarget) || 0;

            return {
                code: pg.code || pg.machine?.name || '',
                name: pg.name || pg.machine?.name || '',
                deviceType: pg.deviceType || 'ahu',

                supply: {
                    flow: sFlow,
                    target: sTar,
                    pct: calcPct(sFlow, sTar)
                },
                extract: {
                    flow: eFlow,
                    target: eTar,
                    pct: calcPct(eFlow, eTar)
                }
            };
        });

        const totSupFlow = rows.reduce((a, r) => a + (Number(r.supply?.flow) || 0), 0);
        const totSupTar  = rows.reduce((a, r) => a + (Number(r.supply?.target) || 0), 0);
        const totExtFlow = rows.reduce((a, r) => a + (Number(r.extract?.flow) || 0), 0);
        const totExtTar  = rows.reduce((a, r) => a + (Number(r.extract?.target) || 0), 0);

        return {
            note: 'Kohteen yhteenveto on informatiivinen. Säätö tehdään aina laitekohtaisesti.',
            rows,
            totals: {
                supply: {
                    flow: totSupFlow,
                    target: totSupTar,
                    pct: calcPct(totSupFlow, totSupTar)
                },
                extract: {
                    flow: totExtFlow,
                    target: totExtTar,
                    pct: calcPct(totExtFlow, totExtTar)
                }
            }
        };
    };

    const siteSummary = buildSiteSummary();

    // Unified-report return
    return {
        meta,
        mode: activeMode,
        pages,
        siteSummary
    };
}



function bindMeasurementListEvents(container) {
    container.querySelectorAll('.measure-row').forEach(row => {
        const valveId = row.dataset.id;
        const v = getValveById(valveId, { strict: false });
        if (!v) return;

        // 🔒 varmista mode
        if (!window.currentMode) window.currentMode = 'home';

        // Koko rivi avaa modaalin (paitsi inputit)
        row.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            openValveById(valveId);
        };

        const posEl = row.querySelector('.inline-pos');
        const kEl   = row.querySelector('.inline-k');

        /* =========================
           🔹 AVAUS %
           ========================= */
        if (posEl) {
            posEl.onchange = () => {
                const newPos = parseFloat(posEl.value);
                if (!Number.isFinite(newPos)) return;

                v.pos = newPos;

                // 🔁 yritä hakea K kirjastosta
                const kFromLib = tryGetKFromLibrary?.(v.type, newPos);

                if (Number.isFinite(kFromLib)) {
                    // ✅ löytyi kirjastosta
                    v.kWorking = kFromLib;

                    if (kEl) {
                        kEl.value = kFromLib.toFixed(2);
                        kEl.classList.remove('needs-k-confirm');
                        kEl.classList.add('auto-k');
                    }

                    showInlineNotice?.(
                        row,
                        'K-arvo päivitetty kirjastosta'
                    );
                } else {
                    // ⚠️ ei löytynyt → käyttäjän annettava K
                    if (kEl) {
                        kEl.classList.remove('auto-k');
                        kEl.classList.add('needs-k-confirm');

                        // 🔑 jos K puuttuu kokonaan, anna käyttäjän syöttää se
                        if (!Number.isFinite(v.kWorking)) {
                            kEl.value = '';
                        }
                    }

                    showInlineNotice?.(
                        row,
                        'Avaus muuttui – syötä ja hyväksy K-arvo'
                    );
                }

                updateValveModalFlow(v.id);
                commitValveChanges(v);
            };
        }

        /* =========================
           🔹 K-ARVO (AINA VARMISTUS, MYÖS ENSIMMÄINEN)
           ========================= */
        if (kEl) {
            kEl.onchange = () => {
                const newK = parseFloat(kEl.value);
                if (!Number.isFinite(newK)) return;

                const ok = confirm(
                    'K-arvon muutos vaikuttaa laskentaan.\n' +
                    'Hyväksytäänkö tämä K-arvo tälle venttiilille?'
                );

                if (!ok) {
                    kEl.value = Number.isFinite(v.kWorking) ? v.kWorking.toFixed(2) : '';
                    return;
                }

                // ✅ hyväksytty (myös ensimmäinen K)
                v.kWorking = newK;
                kEl.classList.remove('needs-k-confirm');
                kEl.classList.remove('auto-k');

                // 🔔 tarjoa tallennusta kirjastoon
                if (confirm('Tallennetaanko tämä K-arvo K-kirjastoon?')) {
                    saveKToLibrary?.(v.type, v.pos, newK);
                }

                updateValveModalFlow(v.id);
                commitValveChanges(v);
            };
        }
    });
}
function getKFromLibrary({ model, size, pos }) {
    // ❌ LEGACY K-LIBRARY (DISABLED)
// function getKFromLibrary(type, pos) {
//     ...
// }
}


function tryGetKFromLibrary(type, pos) {
   // ❌ LEGACY K-LIBRARY (DISABLED)
// function tryGetKFromLibrary(...) {
//     ...
// }

}
// 🔒 Varmista että K-kirjasto on AINA taulukko
(function ensureKLibrary() {
   // ❌ LEGACY K-LIBRARY (DISABLED)
// (function ensureKLibrary() {
//     ...
// })();

})();

function saveKToLibrary(entry) {
    // ❌ LEGACY K-LIBRARY (DISABLED)
// function saveKToLibrary(...) {
//     ...
// }

}




// Palauta interpoloitu K käyttäjän omista arvoista (väliarvot)
// HUOM: käyttää olemassa olevaa getInterpolatedUserK(...) jos sinulla on se jo.
// Jos ei ole, tämä toteuttaa minimiversion.
function getInterpolatedUserKFromLibrary(key, opening) {
    const op = normalizeOpening(opening);
    if (op === null) return null;

    const entries = getUserKEntries(key)
        .map(r => [normalizeOpening(r.opening), normalizeKValue(r.k), String(r.note || '')])
        .filter(x => x[0] !== null && x[1] !== null);

    if (entries.length < 2) return null;

    // jos sinulla on jo getInterpolatedUserK(userKList, opening), käytetään sitä
    if (typeof getInterpolatedUserK === 'function') {
        // getInterpolatedUserK odottaa usein listaa tyyliin: [{opening, k}, ...] tai [[opening,k], ...]
        // tehdään sille yhteensopiva muoto: [{opening,k}]
        const list = entries.map(e => ({ opening: e[0], k: e[1] }));
        return getInterpolatedUserK(list, op);
    }

    // minimilineaarinen interpolointi
    entries.sort((a, b) => a[0] - b[0]);

    // jos täsmäosuma avaukselle, palautetaan lähin (A-malli: jos useita, valitaan viimeisin ts:llä myöhemmin vaiheessa)
    for (const e of entries) {
        if (e[0] === op) return e[1];
    }

    // etsi ympäröivät pisteet
    let lower = null, upper = null;
    for (let i = 0; i < entries.length; i++) {
        if (entries[i][0] < op) lower = entries[i];
        if (entries[i][0] > op) { upper = entries[i]; break; }
    }
    if (!lower || !upper) return null;

    const x1 = lower[0], y1 = lower[1];
    const x2 = upper[0], y2 = upper[1];
    if (x2 === x1) return y1;

    const t = (op - x1) / (x2 - x1);
    return y1 + t * (y2 - y1);
}


function isPro() {
    return true;
}
/**
 * Palauttaa true jos venttiiliä saa muokata (avaa modal).
 * Keskitetty työvaihe- ja turvallisuuslogiikka.
 */

/* ================================
   K-ARVON TILA
   ================================ */
   function handleMeasurementChange(idx) {
    const v = getValveByIdx(idx);
    if (!v) return;

    // 🔒 K on lukittu → varoitus
    if (typeof v.kApproved === 'number') {
        const warn = document.getElementById('k-lock-warning');
        if (warn) {
            warn.style.display = 'block';
            warn.innerHTML = `
                🔒 <b>K-arvo on lukittu</b><br>
                Mittaustietoja muutettiin, mutta hyväksytty K ei päivity.
                <br><br>
                <button onclick="unlockK(${idx})"
                        style="
                            padding:4px 8px;
                            border:none;
                            border-radius:4px;
                            background:#f57c00;
                            color:white;
                            cursor:pointer;">
                    🔓 Avaa K-arvon lukitus
                </button>
            `;
        }
        return;
    }

    // 🔁 Normaali ehdotus
    updateSuggestedKInModal(idx);
}
function getIndexValve() {
    return null;
}

function getIndexValveForDuct(ductId, mode = null) {
     return null;
}
function getIndexValveForDuct(ductId, mode) {
     return null;
}
function calculateRelativeAdjustmentForDuct() {
  return null;
}
function ensureValveInDuct(mm, valve) {
    if (!mm || !valve || !valve.parentDuctId) return;

    const duct = mm.ducts?.find(d => d.id === valve.parentDuctId);
    if (!duct) return;

    if (!Array.isArray(duct.valves)) duct.valves = [];

    if (!duct.valves.includes(valve)) {
        duct.valves.push(valve);
    }
}

/**
 * Laskee suhteellisen K-arvon rungon indeksiventtiilin perusteella
 * @param {string|number} ductId – rungon id
 * @param {number} valveIdx – venttiilin indeksi
 * @returns {number|null}
 */




function approveRelativeKsForDuct(ductId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const valves = mm.valves || [];

    const indexValve = valves.find(v =>
        v.parentDuctId === ductId &&
        v.isIndex === true &&
        typeof v.kApproved === 'number'
    );

    if (!indexValve) {
        alert('Rungossa ei ole hyväksyttyä indeksiventtiiliä.');
        return;
    }

    let count = 0;

    valves.forEach(v => {
        if (v.parentDuctId !== ductId) return;
        if (v === indexValve) return;
        if (typeof v.kApproved === 'number') return;
        if (!isFinite(v.target) || v.target <= 0) return;

        const relK = calculateRelativeKSuggestion(ductId, v.id);
        if (!isFinite(relK) || relK <= 0) return;

        v.kWorking = relK;
        v.kApproved = relK;
        count++;
    });

    if (count === 0) {
        alert('Ei hyväksyttäviä venttiileitä tässä rungossa.');
        return;
    }

    saveData();
    renderDetailsList();
    if (window.activeVisMode) renderVisualContent();

    alert(`✅ Hyväksyttiin ${count} suhteellista K-arvoa rungossa.`);
}



function calculateFlowFromK(k, pa) {
    if (!isFinite(k) || !isFinite(pa) || pa <= 0) return null;
    return k * Math.sqrt(pa);
}
function updateCalculatedFlowPreview() {
    const kEl    = document.getElementById('valve-k');
    const paEl   = document.getElementById('valve-pa');
    const flowEl = document.getElementById('valve-flow');
    const outEl  = document.getElementById('calc-flow-preview');

    // Defensiivinen: jos pakolliset puuttuvat, ei tehdä mitään
    if (!kEl || !paEl) return;

    const k  = parseFloat(kEl.value);
    const pa = parseFloat(paEl.value);

    // Jos arvot eivät ole kelvollisia → tyhjennetään näkyvät kentät
    if (!isFinite(k) || !isFinite(pa) || pa <= 0) {
        if (outEl) outEl.innerText = '';
        if (flowEl) flowEl.value = '';
        return;
    }

    // Klassinen kaava: Q = K * sqrt(ΔP)
    const flow = k * Math.sqrt(pa);
    const rounded = Math.round(flow * 10) / 10;

    // Päivitä virtaus-kenttä jos olemassa
    if (flowEl) {
        flowEl.value = rounded.toFixed(1);
    }

    // Päivitä preview jos olemassa
    if (outEl) {
        outEl.innerHTML = `📐 Laskettu virtaus: <b>${rounded.toFixed(1)} l/s</b>`;
    }
}





function applyUserKFromLibrary(index) {
    const kInput = document.getElementById('valve-k');
    if (!kInput) return;

    kInput.value = Number(kInput.value).toFixed(2);
}




function unlockK(idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const v = mm.valves?.[idx];
    if (!v) return;

    delete v.kApproved;

    saveData();
    renderDetailsList();
}

function suggestIndexValve(valves) {
    if (!Array.isArray(valves) || valves.length === 0) return null;

    const candidates = valves
        .filter(v => {
            // erikoisventtiilit pois
            if (v.isSpecial) return false;

            // ilmamäärät (salli eri nimitykset)
            const measured =
                Number(v.measuredFlow ?? v.flow);
            const design =
                Number(v.designFlow);

            if (!isFinite(measured) || !isFinite(design) || design <= 0) return false;

            // mekaaninen ääripää – tarkistetaan vain jos tieto on olemassa
            const pos =
                Number(v.position ?? v.pos);
            const minPos =
                Number(v.minPosition ?? v.minPos);
            const maxPos =
                Number(v.maxPosition ?? v.maxPos);

            if (isFinite(pos) && isFinite(minPos) && isFinite(maxPos)) {
                const range = maxPos - minPos;
                if (range > 0) {
                    const normPos = (pos - minPos) / range;
                    if (normPos < 0.15) return false; // liian kiinni → false indeksi
                }
            }

            return true;
        })
        .map(v => {
            const measured = Number(v.measuredFlow ?? v.flow);
            const design = Number(v.designFlow);

            return {
                ...v,
                ratio: measured / design
            };
        })
        .filter(v => isFinite(v.ratio));

    if (!candidates.length) return null;

    // pienin suhde = heikoin
    candidates.sort((a, b) => a.ratio - b.ratio);

    return {
        primary: candidates[0],
        alternatives: candidates.slice(1, 3)
    };
}

function computeIndexRatios(valves, indexValveId) {
    const indexValve = valves.find(v => v.id === indexValveId);
    const indexFlow = Number(indexValve?.measuredFlow ?? indexValve?.flow);

    if (!indexValve || !isFinite(indexFlow) || indexFlow <= 0) return;

    valves.forEach(v => {
        const f = Number(v.measuredFlow ?? v.flow);
        if (!isFinite(f) || f <= 0) {
            v.indexRatio = null;
            return;
        }

        v.indexRatio = (v.id === indexValveId)
            ? 1.0
            : f / indexFlow;
    });
}

function getIndexRatioColor(ratio) {
    if (!isFinite(ratio)) return '#999';

    if (ratio >= 0.9 && ratio <= 1.1) return '#2ecc71';   // vihreä
    if ((ratio >= 0.8 && ratio < 0.9) || (ratio > 1.1 && ratio <= 1.2)) return '#f1c40f'; // keltainen
    return '#e74c3c'; // punainen
}
function isSuggestedIndex(valve, suggestion) {
    return suggestion && suggestion.primary && valve.id === suggestion.primary.id;
}
function isIndexValve(valve) {
    return window.uiState.indexLocked && valve.id === window.uiState.indexValveId;
}

function updateSuggestedKPreviewFromModal() {
    const pos   = parseFloat(document.getElementById('valve-pos')?.value);
    const pa    = parseFloat(document.getElementById('valve-pa')?.value);
    const type  = document.getElementById('valve-size')?.value;
    const outEl = document.getElementById('k-source-text');
    const kInp  = document.getElementById('valve-k');

    if (!outEl) return;

    outEl.textContent = '';

    if (!type || isNaN(pos) || isNaN(pa) || pa <= 0) {
        outEl.textContent = 'Syötä avaus ja paine K-ehdotusta varten';
        return;
    }

    if (typeof resolveKForValve !== 'function') {
        outEl.textContent = 'K-laskentaa ei saatavilla';
        return;
    }

    const k = resolveKForValve({
        type,
        pos,
        measuredP: pa
    });

    if (typeof k === 'number' && k > 0) {
        outEl.innerHTML = `Ehdotettu K-arvo: <b>${k.toFixed(2)}</b>`;
        if (kInp && !kInp.value) {
            kInp.value = k.toFixed(2);
        }
    } else {
        outEl.textContent = 'K-ehdotusta ei löytynyt tälle avaukselle';
    }
}

function getInterpolatedUserK(userKList, opening) {
    if (!Array.isArray(userKList) || userKList.length < 2) return null;
    if (opening === null || opening === undefined) return null;

    // Järjestä avauksen mukaan
    const sorted = userKList
        .filter(x => typeof x.opening === 'number' && typeof x.k === 'number')
        .sort((a, b) => a.opening - b.opening);

    // Etsi lähimmät alapuoli ja yläpuoli
    let lower = null;
    let upper = null;

    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].opening <= opening) lower = sorted[i];
        if (sorted[i].opening >= opening) {
            upper = sorted[i];
            break;
        }
    }

    // Täsmällinen osuma
    if (lower && lower.opening === opening) {
        return {
            k: lower.k,
            source: 'user-exact'
        };
    }

    // Ei voida interpoloida
    if (!lower || !upper || lower === upper) return null;

    // Lineaarinen interpolointi
    const ratio =
        (opening - lower.opening) /
        (upper.opening - lower.opening);

    const k =
        lower.k + ratio * (upper.k - lower.k);

    return {
        k: Number(k.toFixed(2)),
        source: 'user-interpolated'
    };
}

// ============================
// K-KIRJASTO (projektiin)
// ============================

function ensureProjectKLibrary() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!p.kLibrary || typeof p.kLibrary !== 'object') {
        p.kLibrary = {};
    }
}
function saveKToLibraryFromValve(v) {

    // 🔒 NORMALISOI TYYPPI ENNEN TARKISTUKSIA
    if (v && v.__rowEl) {
        const typeInput = v.__rowEl.querySelector('input[data-f="type"]');
        if (typeInput && typeInput.dataset.raw) {
            v.type = typeInput.dataset.raw;
        }
    }

    // 🔒 VARMISTUS
    if (!v.type || !window.valveDB || !window.valveDB[v.type]) {
        alert(
            'Tätä päätelaitemallia ei tunnistettu.\n' +
            'Valitse päätelaite listasta ennen K-arvon tallennusta.'
        );
        return;
    }

    // ... loput funktiosta ENNALLAAN
}

function openSaveKModal(valveId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const ducts = machine.modes?.[mode]?.ducts || [];

    let v = null;
    for (const d of ducts) {
        v = (d.valves || []).find(x => x.id === valveId);
        if (v) break;
    }
    if (!v) return;

    // pura tyyppi → malli + koko
    const parsed = parseValveTypeKey(v.type);
    if (!parsed) {
        alert('Venttiilin mallia ei voitu tunnistaa.');
        return;
    }

    showSaveKConfirmModal({
        model: parsed.model,
        size: parsed.size,
        opening: Number(v.pos),
        k: Number(v.kWorking),
        valveId: v.id
    });
}
function showSaveKConfirmModal(input) {
    let v = null;

    // 🟢 UUSI TAPA: input on valveId
    if (typeof input === 'string') {
        v = findValveById(input);
    }

    // 🟡 VANHA / LEGACY TAPA: input on objekti jossa valveId
    if (!v && input && typeof input === 'object') {
        if (input.valveId) {
            v = findValveById(input.valveId);
        }
    }

    if (!v) {
        console.warn('showSaveKConfirmModal: valve not found', input);
        return;
    }

    const msg =
        `Tallennetaanko tämä K-arvo kirjastoon?\n\n` +
        `Malli: ${formatValveDisplay(v.type)}\n` +
        `Avaus: ${v.pos}\n` +
        `K: ${v.kWorking}`;

    if (!confirm(msg)) return;

    // 💾 tallenna kirjastoon
    saveKToLibraryFromValve(v);

    // 🔒 lukitse tälle venttiilille
    approveKForValve(v);

    // 🔁 päivitä näkymä
    refreshMeasurementList();
}



function confirmSaveKValue(payload) {
    if (!payload) return;

    const entry = {
        kind: payload.kind || 'other',
        model: payload.model,
        size: payload.size || '',
        variant: payload.variant || '',
        pos: Number(payload.pos),
        k: Number(payload.k),
        note: payload.note || '',
        source: payload.source || 'manual'
    };

    // 🔑 B-malli: varoitus + automaattinen korvaus
    klibUpsertEntry(entry, { warn: true });

    closeModal?.();

    // 🔁 Päivitä UI YHDESTÄ paikasta
    renderActiveProject();
}
function renderKLibraryAdmin() {
    // Varmista että kirjastodata on muistissa (jos load on olemassa)
    try { if (typeof klibLoad === 'function') klibLoad(); } catch (e) {}

    const infoEl  = document.getElementById('klibAdminInfo');
    const listEl  = document.getElementById('klibAdminCards');
    const searchEl = document.getElementById('klibSearch');

    if (!listEl) return;

    // ✅ oletuskategoria
    window.uiState = window.uiState || {};
    if (!window.uiState.klibCategory) window.uiState.klibCategory = 'valve';

    const category = window.uiState.klibCategory || 'valve';
    const q = (searchEl?.value || '').trim().toLowerCase();

    const entries = (window.userKLibraryV2?.entries || []).slice();

    // --- Kategoria: päätellään entry.kind:stä ---
    // Venttiilit: supply/extract (yleisin)
    // Pellit: damper
    // Hajottajat: diffuser (jos joskus lisätään)
    // Muut: other + kaikki muu
    const categoryOf = (e) => {
        const k = String(e?.kind || 'other').toLowerCase().trim();
        if (k === 'damper') return 'damper';
        if (k === 'diffuser') return 'diffuser';
        if (k === 'supply' || k === 'extract') return 'valve';
        if (k === 'valve') return 'valve';
        return 'other';
    };

    // --- Hakuteksti: nopea “yksi kenttä” haku ---
    const haystack = (e) => {
        const parts = [
            e.kind, e.model, e.size, e.variant, e.pos, e.k, e.note, e.source
        ].map(x => (x == null ? '' : String(x)));
        return parts.join(' ').toLowerCase();
    };

    // --- suodatus ---
    let filtered = entries.filter(e => {
        if (!e) return false;

        if (category !== 'all') {
            if (categoryOf(e) !== category) return false;
        }

        if (!q) return true;
        return haystack(e).includes(q);
    });

    // --- lajittelu: malli -> koko -> pos ---
    const num = (x) => {
        const n = Number(String(x).replace(',', '.'));
        return isFinite(n) ? n : null;
    };
    filtered.sort((a, b) => {
        const am = (a.model || '').localeCompare(b.model || '', 'fi');
        if (am !== 0) return am;

        const as = num(a.size); const bs = num(b.size);
        if (as != null && bs != null && as !== bs) return as - bs;

        const ap = num(a.pos); const bp = num(b.pos);
        if (ap != null && bp != null && ap !== bp) return ap - bp;

        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // --- info ---
    const total = entries.length;
    const shown = filtered.length;
    const catName =
        category === 'valve' ? 'Venttiilit' :
        category === 'damper' ? 'Säätimet' :
        category === 'diffuser' ? 'Hajottajat' :
        category === 'other' ? 'Muut' : 'Kaikki';

    if (infoEl) {
        infoEl.innerHTML =
            `Kategoria: <b>${catName}</b> • Näytetään <b>${shown}</b> / ${total} • ` +
            `Haku: <b>${q ? q : '-'}</b>`;
    }

    // --- tyhjä ---
    if (!shown) {
        listEl.innerHTML = `
            <div style="padding:12px; background:#fff; border:1px dashed #ddd; border-radius:12px; color:#666;">
                Ei osumia. Kokeile lyhyempää hakua (esim. “kso 125”).
            </div>
        `;
        // lisää live-haku vain kerran
        if (searchEl && !searchEl.__klibHooked) {
            searchEl.__klibHooked = true;
            searchEl.addEventListener('input', () => renderKLibraryAdmin());
        }
        return;
    }

    // --- kortit ---
    const esc = (s) => String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const fmtDate = (ts) => {
        if (!ts) return '';
        try { return new Date(ts).toLocaleString('fi-FI', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }); }
        catch { return ''; }
    };

    listEl.innerHTML = filtered.map(e => {
        const kind = esc(e.kind || 'other');
        const model = esc(e.model || '');
        const size  = esc(e.size || '');
        const variant = esc(e.variant || '');
        const pos   = (e.pos == null ? '' : esc(e.pos));
        const k     = (isFinite(Number(e.k)) ? Number(e.k).toFixed(2) : esc(e.k));
        const note  = esc(e.note || '');
        const src   = esc(e.source || '');
        const stamp = fmtDate(e.updatedAt || e.createdAt);

        const badge =
            (kind === 'supply') ? '🔵 Tulo' :
            (kind === 'extract') ? '🔴 Poisto' :
            (kind === 'damper') ? '🟠 Pelti' :
            (kind === 'diffuser') ? '🟣 Hajottaja' : '⚪ Muu';

        return `
        <div style="
            background:#fff;
            border:1px solid #e6e6e6;
            border-radius:14px;
            padding:12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        ">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                <div style="min-width:0;">
                    <div style="font-size:14px; font-weight:800; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${model} ${size ? ('Ø' + size) : ''} ${variant ? ('• ' + variant) : ''}
                    </div>
                    <div style="font-size:12px; color:#666; margin-top:4px;">
                        ${badge} • Avaus: <b>${pos}</b> • K: <b style="font-size:14px;">${k}</b>
                    </div>
                    ${note ? `<div style="font-size:12px; color:#444; margin-top:6px;">📝 ${note}</div>` : ''}
                    <div style="font-size:11px; color:#888; margin-top:6px;">
                        ${src ? `Lähde: ${src}` : ''} ${stamp ? ` • ${stamp}` : ''}
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:6px; flex:0 0 auto;">
                    <button class="btn btn-secondary"
        style="padding:6px 10px; font-size:12px;"
        onclick='openKLibDetail(${JSON.stringify(e).replace(/'/g,"&#039;")})'>
    ⚙️ Avaa
</button>

                </div>
            </div>
        </div>`;
    }).join('');

    // ✅ live-haku vain kerran
    if (searchEl && !searchEl.__klibHooked) {
        searchEl.__klibHooked = true;
        searchEl.addEventListener('input', () => renderKLibraryAdmin());
    }
}


function deleteKEntry(id) {
    if (!confirm('Poistetaanko K-arvo pysyvästi?')) return;
    klibDeleteEntry(id);
    renderKLibraryAdmin();
}

function renderKLibRow(e) {
    return `
      <tr>
        <td>${e.kind}</td>
        <td>${escapeHtml(e.model)}</td>
        <td>${escapeHtml(e.size || '')}</td>

        <td>
          <input value="${escapeHtml(e.variant || '')}"
                 onchange="klibAdminUpdate('${e.id}', { variant: this.value })">
        </td>

        <td>${e.pos}</td>

        <td>
          <input type="number" step="0.01"
                 value="${e.k}"
                 onchange="klibAdminUpdate('${e.id}', { k: Number(this.value) })">
        </td>

        <td>
          <input value="${escapeHtml(e.note || '')}"
                 onchange="klibAdminUpdate('${e.id}', { note: this.value })">
        </td>

        <td>
          <button onclick="klibAdminDelete('${e.id}')">🗑️</button>
        </td>
      </tr>
    `;
}
function klibAdminUpdate(id, patch) {
    if (!id || !patch) return;

    klibUpdateEntry(id, patch); // 10.3.3
    klibSave();                 // varmistus
}

function klibAdminDelete(id) {
    if (!id) return;
    if (!confirm('Poistetaanko K-arvo pysyvästi?')) return;

    klibDeleteEntry(id); // 10.3.3
    klibSave();

    renderKLibraryAdmin();
}

function openKLibraryAdmin() {
    // Vaihda näkymä
    showView('view-klib-admin');

    // Turvallinen placeholder: EI kutsu vanhaa K-kirjastoa
    const body = document.getElementById('klibTableBody');
    if (body) {
        body.innerHTML = `
            <tr>
                <td colspan="8" style="padding:20px; text-align:center; color:#777;">
                    K-kirjasto valmis – ei vielä merkintöjä.
                </td>
            </tr>
        `;
    }
}



function openAddKModal() {
    ensureUserKLibraryReady();

    // Ø-koot (80..1250, poista pyydetyt)
    const REMOVED = new Set([355, 450, 560, 710, 1120]);
    const SIZES = [];
    for (let d = 80; d <= 1250; d += 5) {
        if (!REMOVED.has(d)) SIZES.push(d);
    }

    let ov = document.getElementById('add-k-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'add-k-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    ov.innerHTML = `
        <div class="modal">
            <div class="modal-header">➕ Lisää K-arvo (käyttäjäkirjasto)</div>

            <div class="modal-content">
                <label>Ryhmä (tallennuspaikka)
                    <select id="add-k-group">
                        <option value="supply">Tulo</option>
                        <option value="extract">Poisto</option>
                        <option value="damper">Säätöpellit</option>
                        <option value="other">Muut</option>
                    </select>
                </label>

                <label>Malli
                    <input id="add-k-model" placeholder="esim. KSO">
                </label>

                <label>Koko (Ø mm)
                    <select id="add-k-size">
                        ${SIZES.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </label>

                <label>Avaus
                    <input id="add-k-opening" type="number" step="0.5" placeholder="esim. 4.0">
                </label>

                <label>K-arvo
                    <input id="add-k-value" type="number" step="0.01" placeholder="esim. 2.35">
                </label>

                <label>Lisätieto
                    <input id="add-k-note" placeholder="vapaa teksti">
                </label>
            </div>

            <div class="modal-actions">
                <button class="btn btn-primary" onclick="saveUserKFromAddModal()">Tallenna</button>
                <button class="btn" onclick="closeAddKModal()">Peruuta</button>
            </div>
        </div>
    `;

    ov.style.display = 'flex';
    if (typeof applyButtonStyles === 'function') applyButtonStyles(ov);
}
function openAddKForValve(type, model, size) {
    // Täytetään kentät valmiiksi
    document.getElementById('valveType').value = type;

    // Valitse malli jos löytyy
    const modelSelect = document.getElementById('valveModelSelect');
    if (modelSelect) {
        [...modelSelect.options].forEach(opt => {
            if (opt.textContent.trim().toUpperCase() === model.toUpperCase()) {
                modelSelect.value = opt.value;
            }
        });
    }

    // Koko / avaus
    const sizeEl = document.getElementById('valveSizeSelect');
    if (sizeEl) {
        sizeEl.value = size;
    }

    // Tyhjennä K
    const kEl = document.getElementById('manualK');
    if (kEl) kEl.value = '';

    // Sulje venttiilimodaali, avaa lisäys
    closeKValveDetailModal();

    // Avaa normaali K-lisäysmodaali
    openAddKModal(type);
}
function refreshOpenKValveModal(type, model, size) {
    const ov = document.getElementById('k-valve-overlay');
    if (ov && ov.style.display === 'flex') {
        openValveById(buildValveId({ type, model, size }));
    }

    if (window.uiState?.activeKLibraryType) {
        renderKCategoryGroupedList(window.uiState.activeKLibraryType);
    }
}


function closeAddKModal() {
    const ov = document.getElementById('add-k-overlay');
    if (!ov) return;
    ov.style.display = 'none';
}


function closeAddKModal() {
    const ov = document.getElementById('add-k-overlay');
    if (ov) ov.style.display = 'none';
}
function saveManualK() {
    ensureProjectKLibrary();
    const p = projects.find(x => x.id === activeProjectId);

    const model = document.getElementById('add-k-model').value.trim();
    const size  = document.getElementById('add-k-size').value.trim().replace(/^Ø/i,'');
    const opening = parseFloat(document.getElementById('add-k-opening').value);
    const k = parseFloat(document.getElementById('add-k-value').value);
    const note = document.getElementById('add-k-note').value.trim();

    if (!model || !size || !isFinite(opening) || !isFinite(k)) {
        alert('Täytä kaikki pakolliset kentät');
        return;
    }

    const key = `${model} Ø${size}`;
    if (!p.kLibrary[key]) p.kLibrary[key] = [];

    p.kLibrary[key].push({ opening, k, note });

    closeAddKModal();
    renderKLibraryList();
}


// buildKLibKey sinulla jo on – PIDÄ tämä yhden ainoana versiona:
function buildKLibKey(modelName, sizeText) {
    const m = String(modelName || '').trim();
    const s = String(sizeText || '').trim().replace(/^Ø/i, '');
    if (!m || !s) return '';
    return `${m} Ø${s}`;
}

function addUserKEntry({ key, opening, k, note }) {
    ensureProjectKLibrary();
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return { ok:false, msg:'Projektia ei löytynyt' };

    if (!key) return { ok:false, msg:'Key puuttuu' };

    const op = Number(opening);
    const kv = Number(k);
    if (!isFinite(op) || !isFinite(kv)) return { ok:false, msg:'Avaus tai K ei ole numero' };

    if (!p.kLibrary[key]) p.kLibrary[key] = [];

    // Normalisointi + duplikaattien esto (sama avaus -> päivitys)
    const existingIdx = p.kLibrary[key].findIndex(x => Number(x.opening) === op);
    const entry = {
        opening: op,
        k: Number(kv.toFixed(3)),
        note: String(note || '').trim()
    };

    if (existingIdx >= 0) p.kLibrary[key][existingIdx] = entry;
    else p.kLibrary[key].push(entry);

    // järkevä järjestys
    p.kLibrary[key].sort((a,b) => Number(a.opening) - Number(b.opening));

    return { ok:true };
}

function getUserKListForKey(key) {
    ensureProjectKLibrary();
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return [];
    return Array.isArray(p.kLibrary[key]) ? p.kLibrary[key] : [];
}

// Tämä on se mitä sinun modal nappi kutsuu
function renderUserKListForModal(valve, kInputEl, modelName, sizeText) {
    ensureProjectKLibrary();

    if (!valve) return '<div style="color:#999;">Ei venttiiliä</div>';
    if (!modelName || !sizeText) return '<div style="color:#999;">Valitse ensin malli ja koko</div>';

    const key = buildKLibKey(modelName, sizeText);
    if (!key) return '<div style="color:#999;">Valitse ensin malli ja koko</div>';

    const list = getUserKListForKey(key);

    if (!list.length) {
        return '<div style="color:#999;">Ei tallennettuja K-arvoja tälle venttiilille</div>';
    }

    return `
        <div style="font-weight:bold;margin-bottom:6px;">
            Omat K-arvot (${key})
        </div>
        ${list.map(item => `
            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    padding:4px 6px;
                    border-bottom:1px dashed #ddd;
                    cursor:pointer;
                "
                onclick="
    (function(){
        const kEl = document.getElementById('valve-k');
        let kManuallyEdited = false;

kEl.addEventListener('input', () => {
    kManuallyEdited = true;
});

        if(kEl) kEl.value='${item.k}';

        const src = document.getElementById('k-source-text');
        if(src) src.innerText='📚 Oma K-kirjasto (avaus ${item.opening}${item.note ? ', ' + item.note.replace(/'/g,'’') : ''})';

        if (typeof updateCalculatedFlowPreview === 'function') {
            updateCalculatedFlowPreview();
        }
    })();
"

                title="${(item.note || '').replace(/"/g,'&quot;')}"
            >
                <span>Avaus ${item.opening}</span>
                <span><b>K ${item.k}</b></span>
            </div>
        `).join('')}
    `;
}


function updateKLockUI(v) {
    const kInput = document.getElementById('valve-k');
    const warnEl = document.getElementById('k-lock-warning');
    const btnUnlock = document.getElementById('btn-unlock-k');

    if (!kInput || !warnEl || !btnUnlock) return;

    const locked = typeof v.kApproved === 'number';

    if (locked) {
        kInput.disabled = true;
        kInput.style.background = '#f5f5f5';

        warnEl.style.display = 'block';
        warnEl.innerHTML =
            `🔒 K-arvo on hyväksytty (${v.kApproved.toFixed(2)}).  
             Mittaukset eivät muuta K-arvoa ennen lukituksen avaamista.`;

        btnUnlock.style.display = 'inline-block';
    } else {
        kInput.disabled = false;
        kInput.style.background = '';

        warnEl.style.display = 'none';
        warnEl.innerHTML = '';

        btnUnlock.style.display = 'none';
    }
}

/* ================================
   YKSINKERTAINEN ID-GENERAATTORI
   ================================ */

function genId() {
    return Math.floor(Date.now() + Math.random() * 100000);
}



function getPosFromK(type, targetK) {
    if (!type || !valveDB[type] || !valveDB[type].data) return null;
    const data = valveDB[type].data; // [[pos, k], [pos, k]...]
    
    // Järjestetään data varmuuden vuoksi asennon mukaan
    const sorted = data.slice().sort((a,b) => a[0] - b[0]);
    
    // Jos targetK on nolla tai alle, palauta kiinni (tai min asento)
    if (targetK <= 0) return sorted[0][0];

    for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i+1];
        
        // Tarkistetaan onko K välissä
        const kMin = Math.min(p1[1], p2[1]);
        const kMax = Math.max(p1[1], p2[1]);
        
        if (targetK >= kMin && targetK <= kMax) {
            const diffK = p2[1] - p1[1];
            if (diffK === 0) return p1[0];
            
            // Lineaarinen interpolointi
            const pos = p1[0] + (targetK - p1[1]) * (p2[0] - p1[0]) / diffK;
            
            // MUUTOS: Pyöristys kokonaislukuun
            return Math.round(pos);
        }
    }
    
    // Jos menee yli rajojen
    if (targetK < sorted[0][1]) return Math.round(sorted[0][0]);
    return Math.round(sorted[sorted.length-1][0]);
}
// --- APUFUNKTIO: Venttiilin nimen siistiminen (esim. h_kso125 -> KSO-125) ---
function ensureValveIds(project) {
    if (!project || !Array.isArray(project.valves)) return;

    let maxId = 0;

    // Selvitetään suurin olemassa oleva id (jos joitain on)
    project.valves.forEach(v => {
        if (typeof v.id === 'number' && v.id > maxId) {
            maxId = v.id;
        }
    });

    // Annetaan puuttuvat id:t
    project.valves.forEach(v => {
        if (v.id === undefined || v.id === null) {
            maxId += 1;
            v.id = maxId;
        }
    });
}
// 🔑 Normalisoi teksti ID-käyttöön
function normalizeIdPart(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .trim()
        .replace(/[åä]/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// 🔑 Luo venttiilin yksilöllinen ID
function buildValveId({ manufacturer, model, size }) {
    const parts = [];

    if (manufacturer) parts.push(normalizeIdPart(manufacturer));
    if (model) parts.push(normalizeIdPart(model));
    if (size) parts.push(String(size).replace(/\D/g, ''));

    return parts.join('_');
}
function buildValveDisplayName({ manufacturer, model, size }) {
    const parts = [];
    if (manufacturer) parts.push(manufacturer);
    if (model) parts.push(model);
    if (size) parts.push(`Ø${size}`);
    return parts.join(' ');
}

function populateDuctSelectForValve(selectEl, selectedId = null) {
    if (!selectEl) return;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';

    // ✅ UUSI TOTUUS: runkotiedot tulevat mode-kohtaisista ducteista
    const ducts =
        (Array.isArray(p.modes?.[mode]?.ducts) ? p.modes[mode].ducts : null) ||
        // fallback jos vanhaa dataa joskus vielä on
        (Array.isArray(p.ducts) ? p.ducts : []);

    selectEl.innerHTML = '<option value="">– ei valittu –</option>';

    ducts.forEach(d => {
        const icon = d.type === 'supply' ? '🔵' : '🔴';
        const label = `${icon} ${d.name || 'Runko'}`;
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = label;

        if (selectedId && String(d.id) === String(selectedId)) opt.selected = true;
        selectEl.appendChild(opt);
    });
}


function getValveLockInfo(v) {
    if (v.measuredP == null || v.flow == null || v.pos == null) {
        return {
            locked: true,
            text: '🔒 mittaustiedot puuttuvat',
            tip: 'Lisää paine, virtaus ja avaus ennen säätöä.'
        };
    }

    if (typeof v.kApproved === 'number') {
        return {
            locked: true,
            text: '🔒 hyväksytty K',
            tip: 'Tälle venttiilille on hyväksytty K-arvo.'
        };
    }

    if (!v.isIndex) {
        return {
            locked: true,
            text: '🔒 ei indeksiventtiili',
            tip: 'Säädä ensin indeksiventtiili tai kone.'
        };
    }

    if (typeof canEditValve === 'function' && !canEditValve(v)) {
        return {
            locked: true,
            text: '🔒 väärä säätövaihe',
            tip: 'Venttiili ei ole säädettävissä tässä vaiheessa.'
        };
    }

    return { locked: false };
}
function updateValveModalValidation(idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || p.valves;
    if (!valves || !valves[idx]) return;

    const v = valves[idx];

    const msgEl = document.getElementById('valve-validation-msg');
    const approveBtn = document.getElementById('approveKBtn');
    const sourceEl = document.getElementById(`k-source-text-${idx}`);

    if (!msgEl || !approveBtn) return;

    msgEl.innerHTML = '';
    approveBtn.disabled = false;
    approveBtn.style.opacity = '1';
    approveBtn.style.cursor = 'pointer';

    // 1️⃣ Puuttuvat mittaustiedot
    const missing = [];
    if (v.flow == null) missing.push('virtaus');
    if (v.measuredP == null) missing.push('paine');
    if (v.pos == null) missing.push('avaus');

    if (missing.length > 0) {
        msgEl.innerHTML =
            `⚠️ Puuttuvat mittaustiedot: <b>${missing.join(', ')}</b>`;
        approveBtn.disabled = true;
        approveBtn.style.opacity = '0.5';
        approveBtn.style.cursor = 'not-allowed';
        return;
    }

    // 2️⃣ Working K puuttuu
    if (v.kWorking == null || !isFinite(v.kWorking)) {
        msgEl.innerHTML =
            '⚠️ Anna working K-arvo tai käytä ohjelman ehdotusta.';
        approveBtn.disabled = true;
        approveBtn.style.opacity = '0.5';
        approveBtn.style.cursor = 'not-allowed';
        return;
    }

    // 3️⃣ Hyväksytty K vapautettu → selitys
    if (v._kReleaseReason && sourceEl) {
        sourceEl.innerHTML =
            'ℹ️ Mittaustiedot muuttuivat – K-arvo vaatii uuden hyväksynnän.';
    }
}
window.updateValveInline = function (idx, field, value) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const v = mm.valves?.[idx];
    if (!v) return;

    v[field] = value;

    saveData();
    renderDetailsList();
    if (window.activeVisMode) renderVisualContent();
};


function validateValveMeasurements(v) {
    const missing = [];

    if (v.pos == null || v.pos === '') {
        missing.push('Avaus');
    }
    if (v.measuredP == null || v.measuredP === '') {
        missing.push('Paine (Pa)');
    }
    if (v.flow == null || v.flow === '') {
        missing.push('Virtaus (l/s)');
    }

    return {
        valid: missing.length === 0,
        missing
    };
}

// --- ÄLYKÄS SÄÄTÖMOOTTORI (LUKITUS + AUTO-TUNNISTUS) ---
// ⚖️ SUHTEELLINEN SÄÄTÖ – säätöjärjestys
function buildRelativeAdjustmentPlan(p, mode = 'home') {
    const analysis = analyzeRelativeAdjustment(p, mode);
    if (!analysis) return null;

    const plan = {
        ductOrder: [],
        ducts: {}
    };

    // 1️⃣ Rungot järjestykseen suurimman poikkeaman mukaan
    const sortedDucts = Object.values(analysis.byDuct)
        .sort((a, b) => b.maxDeviationPct - a.maxDeviationPct);

    sortedDucts.forEach(duct => {
        const valves = [...duct.valves];

        // 2️⃣ Indeksiventtiili
        let indexValve =
            valves.filter(v => v.deviationPct < 0)
                  .sort((a, b) => a.deviationPct - b.deviationPct)[0];

        if (!indexValve) {
            indexValve = valves
                .sort((a, b) => Math.abs(a.deviationPct) - Math.abs(b.deviationPct))[0];
        }

        // 3️⃣ Muut venttiilit säätöjärjestykseen
        const adjustOrder = valves
            .filter(v => v !== indexValve)
            .sort((a, b) => b.deviationPct - a.deviationPct);

        plan.ductOrder.push(duct.ductId);
        plan.ducts[duct.ductId] = {
            ductName: duct.ductName,
            flowType: duct.flowType,
            indexValve,
            adjustOrder
        };
    });

    return plan;
}

function analyzeSystemState(p) {
    if (!p) return { status: 'unknown' };

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const valves = mm.valves || [];

    if (!valves.length) {
        return { status: 'empty', message: 'Ei venttiileitä.' };
    }

    let missingTargets = 0;
    let missingFlows = 0;

    valves.forEach(v => {
        if (!isFinite(v.target)) missingTargets++;
        if (!isFinite(v.flow)) missingFlows++;
    });

    if (missingTargets > 0) {
        return { status: 'incomplete', message: 'Puuttuvia tavoitearvoja.' };
    }

    if (missingFlows > 0) {
        return { status: 'measuring', message: 'Mittaus kesken.' };
    }

    return { status: 'ready', message: 'Valmis raportointiin.' };
}

// --- APUFUNKTIO: Venttiilin nimen siistiminen (esim. h_kso125 -> KSO-125) ---
function calculateFlowFromK(k, pa) {
    const K = parseFloat(k);
    const P = parseFloat(pa);

    if (!isFinite(K) || !isFinite(P) || P <= 0) return null;

    return K * Math.sqrt(P);
}

function getKStatus(v) {
    if (!v) return 'none';

    if (typeof v.kApproved === 'number' && isFinite(v.kApproved)) {
        return 'approved';
    }

    if (typeof v.kWorking === 'number' && isFinite(v.kWorking)) {
        return 'working';
    }

    return 'none';
}
function renderKBadge(v) {
    const status = getKStatus(v);

    if (status === 'approved') {
        return `<span style="
            background:#2e7d32;
            color:#fff;
            font-size:10px;
            padding:2px 6px;
            border-radius:10px;
            font-weight:bold;
        ">✓ K hyväksytty</span>`;
    }

    if (status === 'working') {
        return `<span style="
            background:#1565c0;
            color:#fff;
            font-size:10px;
            padding:2px 6px;
            border-radius:10px;
            font-weight:bold;
        ">K ehdotus</span>`;
    }

    return `<span style="
        background:#9e9e9e;
        color:#fff;
        font-size:10px;
        padding:2px 6px;
        border-radius:10px;
    ">Ei K</span>`;
}

/**
 * Keskitetty tarkistus:
 * Saako venttiiliä säätää / avata modalin tässä tilanteessa.
 */
function canEditValve(v, analysis) {
    if (!isPro()) return false;
    if (!analysis) return false;

    const res = analysis.valves.find(r => String(r.id) === String(v.id));
    if (!res) return false;

    // Vain kun venttiilejä säädetään
    if (analysis.phase !== 'ADJUST_VALVES') return false;

    // Vain säädettävät
    return res.code === 'ADJUST_OPEN' || res.code === 'ADJUST_CHOKE';
}
function normalizeValveType(t) {
    if (!t) return '';
    return String(t)
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[-_]/g, '');
}

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
/* =========================================================
   K-EHDOTUSLOGIIKKA MODAALIIN (user exact -> user interpolated -> internal)
   - Ei mittaus-K:ta
   - Ei automaattista hyväksyntää
   ========================================================= */

   function getUserKDatabase() {
    try {
        const raw = localStorage.getItem('userKDatabase');
        const arr = JSON.parse(raw || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

/**
 * Tallennetaan käyttäjän hyväksymä K tietokantaan.
 * entry: { model: string, size: string, opening: number, k: number }
 */
function saveUserKEntry(entry) {
    if (!entry || !entry.model || !entry.size) return;
    if (typeof entry.opening !== 'number' || typeof entry.k !== 'number') return;

    const db = getUserKDatabase();

    // Päivitä jos löytyy sama (model+size+opening), muuten lisää
    const i = db.findIndex(e =>
        e.model === entry.model &&
        e.size === entry.size &&
        e.opening === entry.opening
    );

    if (i >= 0) db[i] = entry;
    else db.push(entry);

    localStorage.setItem('userKDatabase', JSON.stringify(db));
}

/**
 * Palauttaa listan käyttäjän arvoista tälle venttiilille (model+size)
 * [{opening, k}, ...] avauksen mukaan.
 */
function getUserKListFor(model, size) {
    const db = getUserKDatabase();
    return db
        .filter(e => e.model === model && e.size === size)
        .filter(e => typeof e.opening === 'number' && typeof e.k === 'number')
        .map(e => ({ opening: e.opening, k: e.k }))
        .sort((a, b) => a.opening - b.opening);
}





/**
 * Väli-K / täsmä osuma käyttäjän omista arvoista.
 * Palauttaa:
 *  - {k, source:'user-exact'} tai {k, source:'user-interpolated'} tai null
 */
function getInterpolatedUserK(userKList, opening) {
    if (!Array.isArray(userKList) || userKList.length < 2) return null;
    if (opening === null || opening === undefined || Number.isNaN(opening)) return null;

    const sorted = userKList
        .filter(x => typeof x.opening === 'number' && typeof x.k === 'number')
        .sort((a, b) => a.opening - b.opening);

    let lower = null;
    let upper = null;

    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].opening <= opening) lower = sorted[i];
        if (sorted[i].opening >= opening) {
            upper = sorted[i];
            break;
        }
    }

    // täsmä
    if (lower && lower.opening === opening) {
        return { k: Number(lower.k.toFixed(2)), source: 'user-exact' };
    }

    // ei väliä
    if (!lower || !upper || lower === upper) return null;

    const ratio = (opening - lower.opening) / (upper.opening - lower.opening);
    const k = lower.k + ratio * (upper.k - lower.k);

    return { k: Number(k.toFixed(2)), source: 'user-interpolated' };
}

/**
 * Yrittää hakea ohjelman sisäisen ehdotuksen sun nykyisestä venttiilidatasta.
 * Tukee kahta yleistä rakennetta:
 *  A) valveDB[model].data = [[opening,k], [opening,k], ...]
 *  B) valveGroups[model] = [{id,size,...}] ja valveDB[sizeId].data = [[opening,k], ...]
 *
 * Palauttaa: {k, source:'internal'} tai null
 */
function getInternalSuggestedK(model, size, opening) {
    const db = (typeof valveDB !== 'undefined') ? valveDB : (window.valveDB || {});
    const groups = (typeof valveGroups !== 'undefined') ? valveGroups : (window.valveGroups || {});
    if (!db || !model || opening === null || opening === undefined || Number.isNaN(opening)) return null;

    // A) valveDB[model].data = [[opening,k], ...]
    const direct = db[model];
    if (direct && Array.isArray(direct.data)) {
        const hit = direct.data.find(pair => Number(pair?.[0]) === opening);
        if (hit && typeof hit[1] !== 'undefined') {
            const k = Number(hit[1]);
            if (!Number.isNaN(k)) return { k: Number(k.toFixed(2)), source: 'internal' };
        }
    }

    // B) valveGroups[model] -> size id -> valveDB[id].data = [[opening,k], ...]
    if (groups && groups[model] && Array.isArray(groups[model])) {
        const candidates = groups[model];

        // size voi olla joko "125" tai suoraan id
        const item =
            candidates.find(x => String(x.id) === String(size)) ||
            candidates.find(x => String(x.size) === String(size));

        if (item && db[item.id] && Array.isArray(db[item.id].data)) {
            const hit = db[item.id].data.find(pair => Number(pair?.[0]) === opening);
            if (hit && typeof hit[1] !== 'undefined') {
                const k = Number(hit[1]);
                if (!Number.isNaN(k)) return { k: Number(k.toFixed(2)), source: 'internal' };
            }
        }
    }

    return null;
}

/**
 * Tämä on se “modaalin K-ehdotuslogiikka”.
 * - hakee model/size/opening modaalista jos löytyy
 * - muuten käyttää v.type/v.size/v.pos
 * - täyttää kWorking- inputin ja lähdetekstin
 */

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
    window._valveHistory = window._valveHistory || {};

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
// 🔐 ALUSTA VENTTIILIMALLIT (YHDEN PORTIN KAUTTA)
initValveGroupsOnce();
initValveSelectors();


// --- NEW LOGIC FOR SPLIT SELECTION ---
/**
 * Tunnistaa onko venttiili fyysisessä rajassa (MIN / MAX)
 * perustaen valveDB:n asento–virta -taulukkoon
 */
function detectValveLimit(valve) {
    if (!valve || !valve.type || valve.pos == null) return null;

    const def = valveDB[valve.type];
    if (!def || !Array.isArray(def.data)) return null;

    const positions = def.data.map(d => d[0]);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);

    if (valve.pos <= minPos) return 'MIN';
    if (valve.pos >= maxPos) return 'MAX';

    return null;
}



function populateValveModelSelect(selectEl) {
    if (!selectEl) return;

    selectEl.innerHTML =
        '<option value="">– valitse –</option>' +
        '<option value="PITOT">Suora mittaus (Pitot)</option>';

    Object.keys(valveGroups)
        .sort()
        .forEach(model => {
            selectEl.innerHTML += `<option value="${model}">${model}</option>`;
        });
}

const WARNING_LIMITS = {
    valve: {
        nearMinPct: 0.1,   // 10 % etäisyys ministä
        nearMaxPct: 0.1
    },
    machine: {
        nearMinPct: 0.1,
        nearMaxPct: 0.1
    }
};


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




// --- NAVIGAATIO ---


// --- NAVIGAATIO (KORJATTU: POISTETTU calcSFP) ---

function updateFabVisibility() {
    const fab = document.getElementById('projectFab');
    if (!fab) return;

    const currentView = window.uiState?.currentView;

    const visibleIn = [
        'view-projects',
        'view-project-create'
    ];

    fab.style.display = visibleIn.includes(currentView)
        ? 'flex'
        : 'none';
}





function showVisual() {
    const p = projects && projects.find ? projects.find(x => x.id === activeProjectId) : null;
    if (!p) { showView('view-projects'); return; }

    // 🔑 VARMISTA VENTTIILI-ID:T (TEHDÄÄN KERRAN)
    ensureValveIds(p);

    // jatkuu normaalisti...

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

    // --- POISTETTU VANHAT OHJETEKSIT ---
    // Tyhjennetään ja piilotetaan yläpaneeli, jotta se ei vie tilaa tai sekoita käyttäjää.
    const adjustPanel = document.getElementById('relativeAdjustPanel');
    if (adjustPanel) {
        adjustPanel.innerHTML = '';
        adjustPanel.style.display = 'none';
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
function openMeasurementView() {
    renderActiveProject(); // 🔑 aina sama entry-point
}


function setMode(mode) {
    if (!window.appState?.activeProjectId) {
        console.warn('Ei aktiivista projektia');
        return;
    }

    window.appState.currentMode = mode;
    window.currentMode = mode;

    console.log('🔄 Tila asetettu:', mode);

    renderActiveProject();
}
function setActiveMachine(machineId) {
    if (!window.uiState) window.uiState = {};
    window.uiState.activeMachineId = machineId;

    console.log('🧭 Aktiivinen kone:', machineId);

    renderActiveProject();
}



function calculateAndSave(saveAndNext = false) {
    const measuredP    = parseFloat(document.getElementById('measuredP')?.value);
    const measuredFlow = parseFloat(document.getElementById('measuredFlow')?.value);
    const currentPos   = parseFloat(document.getElementById('currentPos')?.value);
    const targetQ      = parseFloat(document.getElementById('targetQ')?.value);

    const resultBox = document.getElementById('calcResult');
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }

    const missingRequired = [];
    if (isNaN(measuredP))  missingRequired.push('paine');
    if (isNaN(currentPos)) missingRequired.push('avaus');

    // ✅ Pakolliset vain: paine + avaus
    if (missingRequired.length > 0) {
        if (resultBox) {
            resultBox.style.display = 'none';
            resultBox.innerHTML = '';
        }
        
        return;
    }

    // ✅ Virtaus EI ole pakollinen tallennukseen
    const flowValue = isNaN(measuredFlow) ? null : measuredFlow;

    // (Kevyt huomautus jos tavoite on annettu mutta virtaus puuttuu)
    if (!isNaN(targetQ) && flowValue == null && resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <div style="color:#e65100;font-weight:bold;">
                ℹ️ Virtaus puuttuu – tallennetaan silti.
            </div>
            <div style="font-size:12px;color:#555;">
                Voit syöttää virtausarvon myöhemmin listasta tai modaalista.
            </div>
        `;
    }

    // ✅ Working K lasketaan vain jos virtaus on olemassa
    let k = null;
    if (flowValue != null && typeof calculateKValue === 'function') {
        try {
            k = calculateKValue(flowValue, measuredP);
        } catch (e) {
            k = null;
        }
    }

    if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <div style="font-weight:bold;">
                Tallennetaan${k != null ? ` • Working K = ${k.toFixed(2)}` : ''}
            </div>
            ${flowValue == null ? `<div style="font-size:12px;color:#666;">(Virtaus puuttuu – ei lasketa K-arvoa)</div>` : ''}
        `;
    }

    // ✅ Tallennus sallitaan vaikka flow puuttuu
    saveValveFromModal({
        measuredP,
        measuredFlow: flowValue,
        currentPos,
        targetQ: isNaN(targetQ) ? null : targetQ,
        kWorking: (k != null ? k : null)
    });

    if (saveAndNext) {
        if (document.getElementById('roomName')) document.getElementById('roomName').value = '';
        if (document.getElementById('manualName')) document.getElementById('manualName').value = '';
        if (document.getElementById('measuredP')) document.getElementById('measuredP').value = '';
        if (document.getElementById('currentPos')) document.getElementById('currentPos').value = '';
        // virtaus jätetään tyhjäksi
        if (document.getElementById('measuredFlow')) document.getElementById('measuredFlow').value = '';
        if (typeof updateLiveK === 'function') updateLiveK();
    } else {
        showView('view-details');
    }
}
// ===============================
// ➕ LUO UUSI RUNKO (TULO / POISTO)
// ===============================
function openCreateDuctModal(v = null) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // 🔑 AKTIIVINEN KONE
    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';

    // 🔒 OIKEA DATAKOHTA
    if (!machine.modes) return;
    if (!machine.modes[mode]) return;
    if (!Array.isArray(machine.modes[mode].ducts)) {
        machine.modes[mode].ducts = [];
    }

    const ducts = machine.modes[mode].ducts;

    // Overlay
    let ov = document.getElementById('duct-modal-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'duct-modal-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    const ductRows = ducts.length
        ? ducts.map(d => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid #eee;">
                <div style="font-size:13px;">
                    <b>${d.type === 'supply' ? '🔵' : d.type === 'extract' ? '🔴' : '⚪'}</b>
                    <span style="margin-left:6px;">${d.name || '(nimetön runko)'}</span>
                    <span style="color:#999; font-size:12px; margin-left:6px;">(${d.id})</span>
                </div>
                <button class="btn"
                        style="background:#ffebee;border:1px solid #ef9a9a;color:#b71c1c;"
                        onclick="openDeleteDuctModal('${d.id}')">
                    🗑️ Poista
                </button>
            </div>
        `).join('')
        : `<div style="color:#999; font-size:13px;">Ei runkoja vielä.</div>`;

    ov.innerHTML = `
        <div class="modal">
            <div class="modal-header">🏗️ Rungot</div>

            <div class="modal-content">
                <div class="valve-edit-row">

                    <label>Rungon nimi
                        <input id="new-duct-name"
                               type="text"
                               placeholder="Esim. Tulo runko 1">
                    </label>

                    <label>Rungon tyyppi
                        <select id="new-duct-type">
                            <option value="">– valitse –</option>
                            <option value="supply">🔵 Tulo</option>
                            <option value="extract">🔴 Poisto</option>
                        </select>
                    </label>

                </div>

                <div id="duct-create-error"
                     style="margin-top:8px;color:#c62828;font-size:13px;display:none;">
                </div>

                <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #ddd;">
                    <div style="font-weight:bold; margin-bottom:6px;">Nykyiset rungot</div>
                    ${ductRows}
                </div>
            </div>

            <div id="false-index-warning"
                 style="display:none;
                        margin-top:10px;
                        padding:8px;
                        background:#fff3cd;
                        border:1px solid #ffeeba;
                        border-radius:6px;
                        font-size:13px;">
                ⚠️ <b>Mahdollinen false-indeksi</b><br>
                Venttiili on lähes kiinni – harkitse edustavampaa indeksiä.
            </div>

            <div class="modal-actions">
                <button class="btn btn-primary" id="createDuctBtn">💾 Luo runko</button>
                <button class="btn" onclick="closeCreateDuctModal()">Sulje</button>
            </div>
        </div>
    `;

    // 🔎 False-indeksin varoitus (vain jos v annettu)
    const warningEl = document.getElementById('false-index-warning');
    if (warningEl && v && v.isIndex === true) {
        const minPos = Number(v.minPosition ?? 0);
        const maxPos = Number(v.maxPosition ?? 100);
        const pos = Number(v.pos);

        if (Number.isFinite(pos) && maxPos > minPos) {
            const normPos = (pos - minPos) / (maxPos - minPos);
            warningEl.style.display = normPos < 0.20 ? 'block' : 'none';
        } else {
            warningEl.style.display = 'none';
        }
    }

    ov.style.display = 'flex';

    document.getElementById('createDuctBtn').onclick = () => {
        const name = document.getElementById('new-duct-name').value.trim();
        const type = document.getElementById('new-duct-type').value;
        const err  = document.getElementById('duct-create-error');

        err.style.display = 'none';

        if (!name || !type) {
            err.textContent = 'Anna rungon nimi ja tyyppi';
            err.style.display = 'block';
            return;
        }

        const newDuct = {
            id: 'duct_' + Date.now(),
            name,
            type,
            valves: []
        };

        ducts.push(newDuct);

        // Päivitä modal + näkymät
        openCreateDuctModal();
        renderDetailsList();
    };
}


function openDeleteDuctModal(ductId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!Array.isArray(p.ducts)) p.ducts = [];
    if (!p.modes) return;

    const allDucts = p.ducts;
    const duct = allDucts.find(d => d.id === ductId);
    if (!duct) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || [];

    const affectedValves = valves.filter(v => v.parentDuctId === ductId);
    const affectedCount = affectedValves.length;

    // Overlay
    let ov = document.getElementById('duct-delete-modal-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'duct-delete-modal-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    const otherDuctOptions = allDucts
        .filter(d => d.id !== ductId && d.type === duct.type)
        .map(d => `<option value="${d.id}">${d.name}</option>`)
        .join('');

    ov.innerHTML = `
        <div class="modal">
            <div class="modal-header">🗑️ Poista runko</div>

            <div class="modal-content">
                <div style="font-size:14px;">
                    Olet poistamassa rungon:
                    <div style="margin-top:6px; font-weight:bold;">
                        ${duct.type === 'supply' ? '🔵' : '🔴'} ${duct.name}
                    </div>
                </div>

                <div style="margin-top:10px; font-size:13px; color:#b71c1c;">
                    Tämä runko sisältää <b>${affectedCount}</b> venttiiliä nykyisessä tilassa (${mode}).
                </div>

                <div style="margin-top:12px; padding:10px; background:#f8f9fa; border-radius:8px;">
                    <div style="font-weight:bold; margin-bottom:6px;">Mitä tehdään rungon venttiileille?</div>

                    <label style="display:block; margin-bottom:6px;">
                        <input type="radio" name="ductDelAction" value="move" checked>
                        Siirrä venttiilit toiseen samaa tyyppiä olevaan runkoon
                    </label>

                    <div style="margin-left:20px; margin-bottom:10px;">
                        <select id="moveTargetDuct" style="width:100%; padding:8px;">
                            <option value="">– valitse kohderunko –</option>
                            ${otherDuctOptions}
                        </select>
                        <div style="font-size:12px; color:#666; margin-top:4px;">
                            Näytetään vain saman tyypin rungot (${duct.type})
                        </div>
                    </div>

                    <label style="display:block;">
                        <input type="radio" name="ductDelAction" value="deleteValves">
                        Poista myös kaikki tämän rungon venttiilit
                    </label>
                </div>

                <div id="ductDelErr" style="display:none; margin-top:10px; color:#c62828; font-size:13px;"></div>
            </div>

            <div class="modal-actions">
                <button class="btn" onclick="closeDeleteDuctModal()">Peruuta</button>
                <button class="btn btn-primary"
                        style="background:#c62828;border:1px solid #c62828;"
                        onclick="confirmDeleteDuct('${ductId}')">
                    🗑️ Poista runko
                </button>
            </div>
        </div>
    `;

    ov.style.display = 'flex';
}

function closeDeleteDuctModal() {
    const ov = document.getElementById('duct-delete-modal-overlay');
    if (ov) ov.style.display = 'none';
}

function confirmDeleteDuct(ductId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || [];

    const err = document.getElementById('ductDelErr');
    const action = document.querySelector('input[name="ductDelAction"]:checked')?.value || 'move';

    const affectedIdxs = [];
    for (let i = 0; i < valves.length; i++) {
        if (valves[i] && valves[i].parentDuctId === ductId) affectedIdxs.push(i);
    }

    if (action === 'move') {
        const targetId = document.getElementById('moveTargetDuct')?.value || '';
        if (!targetId) {
            if (err) {
                err.textContent = 'Valitse kohderunko, johon venttiilit siirretään.';
                err.style.display = 'block';
            }
            return;
        }

        // Siirrä venttiilit
        affectedIdxs.forEach(i => {
            if (valves[i]) valves[i].parentDuctId = targetId;
        });
    }

    if (action === 'deleteValves') {
        // Poista venttiilit (takaperin ettei indeksit heitä)
        for (let i = valves.length - 1; i >= 0; i--) {
            if (valves[i] && valves[i].parentDuctId === ductId) {
                valves.splice(i, 1);
            }
        }
    }

    // Poista runko
    if (!Array.isArray(p.ducts)) p.ducts = [];
    p.ducts = p.ducts.filter(d => d.id !== ductId);

    closeDeleteDuctModal();

    // Päivitä rungot-modal + näkymä
    openCreateDuctModal();
    renderDetailsList();
}

// ===============================
// ❌ SULJE RUNKOMODAALI
// ===============================
function closeCreateDuctModal() {
    const ov = document.getElementById('duct-modal-overlay');
    if (ov) ov.style.display = 'none';
}


function deleteValveByIndex(idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const valves = mm.valves || [];

    if (idx < 0 || idx >= valves.length) return;

    if (!confirm('Poistetaanko venttiili tältä koneelta?')) return;

    valves.splice(idx, 1);

    saveData();
    renderDetailsList();
    if (window.activeVisMode) renderVisualContent();
}


function activateProject(projectId, mode = 'home') {
    if (!window.appState) window.appState = {};

    window.appState.activeProjectId = projectId;
    window.appState.currentMode = mode;
    window.currentMode = mode;

    console.log('📂 Projekti aktivoitu:', projectId, mode);

    renderActiveProject();
}


function renderActiveProject() {
    const projectId = window.appState?.activeProjectId;
    if (!projectId) {
        console.warn('renderActiveProject: ei aktiivista projektia');
        return;
    }

    console.log('🎯 Renderöidään aktiivinen projekti');

    // 🔑 aina sama näkymä
    showView('view-details');

    // 🔑 kutsutaan sitä OIKEAA vanhaa näkymää
    renderDetailsView();
}




function openNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (!modal) {
        alert('Projektimodaalia ei löydy');
        console.error('newProjectModal puuttuu DOMista');
        return;
    }
    modal.style.display = 'flex';
}







function initValveSelectors() {
    valveGroups = {};
    valveIdToModelId = {};

    if (!valveDB || Object.keys(valveDB).length === 0) return;

    for (const key in valveDB) {
        const def = valveDB[key];
        const name = def?.name || key;

        const match = name.match(/^(.*?)[\s-]*([0-9]{2,4})(.*)$/);

        let modelName = name.trim();
        let sizeText = '-';
        let sortSize = 0;

        if (match) {
            modelName = match[1].trim();
            sizeText = match[2] + (match[3] || '');
            sortSize = parseInt(match[2], 10) || 0;
            if (modelName.endsWith('-')) modelName = modelName.slice(0, -1);
        }

        if (!valveGroups[modelName]) valveGroups[modelName] = [];
        valveGroups[modelName].push({ id: key, size: sizeText, sortSize });

        valveIdToModelId[key] = modelName;
    }

    Object.keys(valveGroups).forEach(m => {
        valveGroups[m].sort((a, b) => a.sortSize - b.sortSize);
    });
}
document.addEventListener('DOMContentLoaded', () => {
    // 🔒 VARMISTA PUHDAS ALKUTILA
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });

    // 📂 Lataa projektit
    loadProjectsFromStorage();

    // ✅ Näytä aina etusivu aluksi
    const projectsView = document.getElementById('view-projects');
    if (projectsView) {
        projectsView.classList.add('active');
        projectsView.style.display = 'block';
    }

    
    
    // 🔧 Alustukset
    if (typeof initValveSelectors === 'function') {
        initValveSelectors();
    }

    console.log('✔ valveGroups initialized:', Object.keys(valveGroups || {}));
});



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
// ===============================
// Yleinen nappien värityssääntö
// ===============================
function applyButtonStyles(root = document) {
    const buttons = root.querySelectorAll('button');

    buttons.forEach(btn => {
        const text = btn.textContent.toLowerCase();

        // 🔴 Peruuta / Sulje / Takaisin
        if (
            text.includes('peruuta') ||
            text.includes('sulje') ||
            text.includes('takaisin')
        ) {
            btn.style.backgroundColor = '#c62828';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            return;
        }

        // 🟢 Tuo omat K-arvot
        if (text.includes('tuo') && text.includes('k')) {
            btn.style.backgroundColor = '#2e7d32';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            return;
        }

        // 🔵 Tallenna K-kirjastoon
        if (text.includes('tallenna') && text.includes('k')) {
            btn.style.backgroundColor = '#1565c0';
            btn.style.color = '#fff';
            btn.style.border = 'none';
        }
    });
}






// --- UUSI PROJEKTIN PÄÄNÄKYMÄ (SISÄLTÄÄ TILOJEN VALINNAN) ---
// --- APUFUNKTIO: PÄIVITÄ METATIEDOT HETI (D2 ja Otsikkotiedot) ---
// --- APUFUNKTIO: PÄIVITÄ METATIEDOT ---
// --- APUFUNKTIO: PÄIVITÄ JA TALLENNA METATIEDOT ---
// --- APUFUNKTIO: PÄIVITÄ METATIEDOT (SMART SAVE) ---
function releaseApprovedKIfNeeded(v, reason) {
    if (!v || v.kApproved == null) return false;

    // Vapautetaan hyväksytty K
    v.kApproved = null;
    v.kApprovedAt = null;

    // Tyhjennetään working K, jotta uusi ehdotus lasketaan puhtaasti
    v.kWorking = null;

    // Tallennetaan syy (vain UI:ta varten)
    v._kReleaseReason = reason || 'Mittaus muuttui';

    return true;
}


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
function promoteDraftIfNeeded(duct, v) {
    if (!v.__isDraft) return false;

    if (v.room || v.type || v.pos != null) {
        delete v.__isDraft;

        // 🔑 lisää uusi draft datatasolle
        if (!duct.valves.some(x => x.__isDraft)) {
            duct.valves.push(createDraftValve(duct));
        }

        return true;
    }
    return false;
}



// --- PÄIVITETTY INLINE-MUOKKAUS (HUONE MUKANA) ---
// --- PÄIVITETTY INLINE-MUOKKAUS (HUONE MUKANA) ---
window.updateValveInline = function (idx, field, value) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const v = mm.valves?.[idx];
    if (!v) return;

    v[field] = value;

    saveData();
    renderDetailsList();
    if (window.activeVisMode) renderVisualContent();
};


function updateWorkflowHint(p) {
    if (!p) return;

    const state = analyzeSystemState(p);

    const el = document.getElementById('workflowHint');
    if (!el) return;

    el.textContent = state.message || '';
    el.dataset.state = state.status || 'unknown';
}

// valveDB määritelty kokonaan
initValveSelectors();
console.log('✔ valveGroups built:', Object.keys(valveGroups));

function deleteValve(valveId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    if (!mm || !Array.isArray(mm.ducts)) return;

    // 🔎 Etsi venttiili ja sen runko
    let foundDuct = null;
    let foundIndex = -1;

    for (const d of mm.ducts) {
        const idx = (d.valves || []).findIndex(v => String(v.id) === String(valveId));
        if (idx !== -1) {
            foundDuct = d;
            foundIndex = idx;
            break;
        }
    }

    if (!foundDuct || foundIndex === -1) {
        console.warn('deleteValve: venttiiliä ei löydy', valveId);
        return;
    }

    const v = foundDuct.valves[foundIndex];

    // ⚠️ VARMISTUS
    const label = v.room
        ? `${v.room} (${v.type || 'venttiili'})`
        : (v.type || 'venttiili');

    const ok = confirm(`Poistetaanko venttiili:\n\n${label} ?`);
    if (!ok) return;

    // 🗑 POISTO
    foundDuct.valves.splice(foundIndex, 1);

    // 🔁 Jos poistettiin indeksiventtiili, vapautetaan indeksi
    if (v.isIndex) {
        foundDuct.valves.forEach(x => {
            if (x.flowType === v.flowType) {
                x.isIndex = false;
            }
        });
    }

    // 💾 TALLENNUS + PÄIVITYS
    saveData?.();

    // 🔄 Päivitä näkymät
    renderDetailsList?.();

    const vis = document.getElementById('visContent') || document.getElementById('mapContainer');
    if (vis && typeof renderHorizontalMap === 'function') {
        renderHorizontalMap(vis);
    }
}
// ===== VENTTIILIN JÄRJESTYKSEN SIIRTO (YLÖS / ALAS) =====

// Ylös
window.moveValveUp = function (valveId) {
    window._moveValve(valveId, -1);
};

// Alas
window.moveValveDown = function (valveId) {
    window._moveValve(valveId, +1);
};

// Yhteinen toteutus
window._moveValve = function (valveId, dir) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    if (!mm || !Array.isArray(mm.ducts)) return;

    // Käydään rungot läpi
    for (const d of mm.ducts) {
        if (!Array.isArray(d.valves)) continue;

        const i = d.valves.findIndex(v => String(v.id) === String(valveId));
        if (i === -1) continue;

        const ni = i + dir;
        if (ni < 0 || ni >= d.valves.length) return;

        // 🔁 Vaihda paikkaa taulukossa
        const tmp = d.valves[i];
        d.valves[i] = d.valves[ni];
        d.valves[ni] = tmp;

        // 💾 Tallenna data
        if (typeof saveData === 'function') {
            saveData();
        }

        // 🔄 Päivitä mittalista (EI renderDetailsList!)
        const listEl = document.getElementById('measurementList');
        if (listEl && typeof renderMeasurementListV2 === 'function') {
// ❌ EI renderöintiä täällä

        }

        // 🔄 Päivitä kartta
        const vis = document.getElementById('visContent') || document.getElementById('mapContainer');
        if (vis && typeof renderHorizontalMap === 'function') {
            renderHorizontalMap(vis);
        }

        return;
    }

    console.warn('moveValve: venttiiliä ei löytynyt duct.valves[]:sta', valveId);
};

function moveValveUp(valveId) {
    moveValve(valveId, -1);
}

function moveValveDown(valveId) {
    moveValve(valveId, +1);
}

function moveValve(valveId, dir) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    if (!mm || !Array.isArray(mm.ducts)) return;

    for (const d of mm.ducts) {
        if (!Array.isArray(d.valves)) continue;

        const i = d.valves.findIndex(v => String(v.id) === String(valveId));
        if (i === -1) continue;

        const ni = i + dir;
        if (ni < 0 || ni >= d.valves.length) return;

        // 🔁 VAIHDA PAIKKAA
        const tmp = d.valves[i];
        d.valves[i] = d.valves[ni];
        d.valves[ni] = tmp;

        // 💾 TALLENNA
        saveData?.();

        // 🔄 Päivitä näkymät
        renderDetailsList?.();

        const vis = document.getElementById('visContent') || document.getElementById('mapContainer');
        if (vis && typeof renderHorizontalMap === 'function') {
            renderHorizontalMap(vis);
        }

        return;
    }
}

// 🔎 Palauta omat / yrityksen käytetyt venttiilit (prioriteetti 1)
function getUserValveTypes() {
    // Odotettu rakenne: window.kLibrary = [{ type, pos, k, approved, ... }]
    const lib = window.kLibrary || [];
    const set = new Set();

    lib.forEach(x => {
        if (x?.type && x?.approved) set.add(x.type);
    });

    return Array.from(set);
}

// 🔎 Palauta valmistajakirjaston venttiilit (prioriteetti 2)
function getManufacturerValveTypes() {
    const db = window.valveDB || {};
    return Object.keys(db);
}

// 🔎 Yhdistetty haku näkyvästä nimestä (formatValveDisplay)
function searchValveTypes(query) {
    const q = (query || '').toLowerCase();
    if (!q) return [];

    // 🔑 OIKEA TIETOLÄHDE
    const db =
        typeof valveDB !== 'undefined'
            ? valveDB
            : (window.valveDB || {});

    const results = [];
    const seen = new Set();

    Object.keys(db).forEach(type => {
        const label = formatValveDisplay(type).toLowerCase();
        if (label.includes(q)) {
            if (!seen.has(type)) {
                results.push({ type, source: 'manufacturer' });
                seen.add(type);
            }
        }
    });

    return results.slice(0, 15);
}
function resolveWorkingKForValve(v) {
    if (!v) return null;

    // ❌ Ei ehdoteta draftille
    if (v.__isDraft) return null;

    // ❌ Päätelaite pitää olla tunnistettu
    if (!v.type || typeof v.type !== 'string') return null;

    // ❌ Avaus pakollinen ja numeerinen
    const pos = Number(v.pos);
    if (!isFinite(pos)) return null;

    // 🔑 Selvitetään kirjastohakuun tarvittavat kentät
    const kind =
        v.kind ||
        (v.damper ? 'damper' :
         v.supply ? 'supply' :
         v.extract ? 'extract' :
         'other');

    const model = v.type;
    const size = v.size || '';
    const variant = v.variant || '';

    // 🔍 LUETAAN kirjastosta – EI tallenneta
    const k = klibResolveK({
        kind,
        model,
        size,
        variant,
        pos
    });

    return Number.isFinite(k) ? k : null;
}
function canSaveKValue(v) {
    if (!v) return false;

    if (v.__isDraft) return false;
    if (!v.type) return false;

    const pos = Number(v.pos);
    const k = Number(v.kWorking);

    if (!isFinite(pos) || !isFinite(k)) return false;

    if (v.kApproved === true) return false;

    // Ei saa olla jo kirjastossa
    const existing = klibFindK({
        kind: v.kind || 'other',
        model: v.type,
        size: v.size || '',
        variant: v.variant || '',
        pos
    });

    return !existing;
}
function onSaveKClick(v) {
    if (!canSaveKValue(v)) return;

    confirmSaveKValue({
        kind: v.kind || 'other',
        model: v.type,
        size: v.size || '',
        variant: v.variant || '',
        pos: v.pos,
        k: v.kWorking,
        note: '',
        source: 'manual'
    });

    // Lukitse venttiili
    v.kApproved = true;
}

function approveKForValve(v) {
    if (!v) return;
    if (v.kWorking == null || v.kWorking === '') return;

    const k = Number(v.kWorking);
    if (!Number.isFinite(k)) return;

    v.kApproved = k;

    // kun hyväksytään, poistetaan tallennusvihje
    // (lukko kertoo jatkossa tilan)
}
function unapproveKForValve(v) {
    if (!v) return;
    v.kApproved = null;
}
function openApproveKConfirm(valveId) {
    const v = findValveById(valveId);
    if (!v) return;

    if (!confirm('Hyväksytäänkö tämä K-arvo lukituksi venttiilille?')) return;

    approveKForValve(v);
    refreshMeasurementList();
}


function isKValueNewForValve(v) {
    if (!v) return false;
    if (v.kWorking == null || v.kWorking === '') return false;

    // jos kirjastosta löytyy tälle avaukselle sama K → ei ikonia
    const suggested = resolveWorkingKForValve(v);
    if (suggested != null && Number(v.kWorking) === Number(suggested)) return false;

    // jos kirjastossa EI ole mitään osumaa (suggested null),
    // näytetään ikoni vain jos meillä on tyyppi+avaus kunnossa
    if (!v.type || v.pos == null || v.pos === '') return false;

    return true;
}


function deleteValveById() {
    alert('Venttiilin poisto pois käytöstä (Korjaus 1)');
    return;
}

function toggleValveSupplyExtract(idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const v = mm.valves?.[idx];
    if (!v) return;

    v.ductType = (v.ductType === 'supply') ? 'extract' : 'supply';

    saveData();
    renderDetailsList();
    if (window.activeVisMode) renderVisualContent();
}

function applyCancelButtonStyles(root = document) {
    root.querySelectorAll('button').forEach(btn => {
        const txt = btn.innerText.toLowerCase();
        if (
            txt.includes('peruuta') ||
            txt.includes('sulje') ||
            txt.includes('takaisin') ||
            txt.includes('poista')
        ) {
            btn.classList.add('btn-cancel');
        }
    });
}

function calcPercent(actual, target) {
    const a = parseFloat(actual) || 0;
    const t = parseFloat(target) || 0;
    if (t <= 0) return null;
    return Math.round((a / t) * 100);
}
// ===== MIGRAATIO: varmista venttiilien flowType rungon mukaan =====
function migrateValveFlowTypes(project) {
    if (!project || !Array.isArray(project.ducts)) return;

    Object.values(project.modes || {}).forEach(mode => {
        (mode.valves || []).forEach(v => {
            if (!v.flowType && v.parentDuctId) {
                const d = project.ducts.find(x => x.id === v.parentDuctId);
                if (d?.type) {
                    v.flowType = d.type; // 'supply' | 'extract'
                }
            }
        });
    });
}

function getPctStatus(pct) {
    if (pct === null || pct === undefined) {
        return { color: '#9e9e9e', label: '-' };
    }

    if (pct < 80) {
        return { color: '#c62828', label: 'Huono' };        // punainen
    }
    if (pct < 95) {
        return { color: '#f9a825', label: 'Lähes' };       // keltainen
    }
    if (pct <= 105) {
        return { color: '#2e7d32', label: 'OK' };          // vihreä
    }

    return { color: '#1565c0', label: 'Yli' };             // sininen
}
function migrateLegacyDataToActiveMachine(p) {
    if (!p || !Array.isArray(p.machines) || !p.machines.length) return;

    // ✅ Tämä migraatio on tarkoitettu vain vanhan datan siirtoon (1x / projekti)
    if (p.__legacyMigratedOnce) return;

    ensureUiState();
    const mode = window.currentMode || 'home';

    const machine = getActiveMachine(p) || p.machines[0];
    if (!machine) return;

    if (!machine.modes) machine.modes = {};
    if (!machine.modes[mode]) {
        machine.modes[mode] = { ducts: [], fans: [] };
    }

    // Varmista taulukot
    if (!Array.isArray(machine.modes[mode].ducts)) machine.modes[mode].ducts = [];
    // Huom: mm.valves on legacy-yhteensopivuus; getActiveMachineMode tekee siitä virtuaalisen jatkossa
    if (!Array.isArray(machine.modes[mode].valves)) machine.modes[mode].valves = [];

    const mm = machine.modes[mode];

    // ⛔ Jos koneella on jo dataa → ei tehdä mitään
    const alreadyHasData =
        (Array.isArray(mm.ducts) && mm.ducts.length > 0) ||
        (Array.isArray(mm.valves) && mm.valves.length > 0);
    if (alreadyHasData) {
        p.__legacyMigratedOnce = true;
        return;
    }

    // Lähteet (vanhat rakenteet)
    const srcMode = p.modes?.[mode] || null;

    const legacyModeValves = Array.isArray(srcMode?.valves) ? srcMode.valves : [];
    const legacyModeDucts  = Array.isArray(srcMode?.ducts)  ? srcMode.ducts  : [];

    const legacyRootValves = Array.isArray(p.valves) ? p.valves : [];
    const legacyRootDucts  = Array.isArray(p.ducts)  ? p.ducts  : [];

    const hasLegacy =
        legacyModeValves.length || legacyModeDucts.length ||
        legacyRootValves.length || legacyRootDucts.length;

    if (!hasLegacy) {
        p.__legacyMigratedOnce = true;
        return;
    }

    // ✅ Syväkloonaus, ettei synny viitevuotoa koneiden välillä
    const deepClone = (x) => JSON.parse(JSON.stringify(x));

    // Siirrä ensisijaisesti mode-taso, muuten root-taso
    if (legacyModeDucts.length) {
        mm.ducts = deepClone(legacyModeDucts);
        srcMode.ducts = [];
    } else if (legacyRootDucts.length) {
        mm.ducts = deepClone(legacyRootDucts);
        p.ducts = [];
    }

    if (legacyModeValves.length) {
        mm.valves = deepClone(legacyModeValves);
        srcMode.valves = [];
    } else if (legacyRootValves.length) {
        mm.valves = deepClone(legacyRootValves);
        p.valves = [];
    }

    // Migraatiolukko projektille
    p.__legacyMigratedOnce = true;

    console.log('🧬 Legacy-data migroitu projektille (vain kerran) → kone:', machine.id);

    try { saveData?.(); } catch (e) {}
}


function renderDuctBlock(duct, valves) {
    const ductValves = valves.filter(v => v.parentDuctId === duct.id);

    return `
        <div style="border-bottom:1px solid #ddd;">
            
            <!-- RUNGON OTSIKKO -->
            <div style="
                padding:6px 8px;
                background:${duct.type === 'supply' ? '#e3f2fd' : '#fdecea'};
                font-weight:bold;
                font-size:12px;
                display:flex;
                justify-content:space-between;
                align-items:center;
            ">
                <span>
                    ${duct.type === 'supply' ? '🔵' : '🔴'}
                    ${duct.name || 'Nimetön runko'}
                </span>

                <button
                   <tr style="background:${duct.type === 'supply' ? '#e3f2fd' : '#fdecea'};">
    <td colspan="8"
        style="font-weight:bold;padding:6px 8px;">
        ${duct.name || 'Nimetön runko'}
    </td>
</tr>

            </div>

            <!-- VENTTIILIT -->
            <table class="mini-table">
                <tbody>
                    ${
                        ductValves.length
                            ? ductValves.map(renderRow).join('')
                            : `
                                <tr>
                                    <td colspan="8"
                                        style="
                                            text-align:center;
                                            padding:12px;
                                            color:#999;
                                            font-size:12px;
                                        ">
                                        Ei venttiileitä tässä rungossa
                                    </td>
                                </tr>
                              `
                    }
                </tbody>
            </table>
        </div>
    `;
}
function openReportView() {
    const report = getUnifiedReport();
    if (!report) {
        alert('Pöytäkirjaa ei voitu muodostaa (unified report).');
        return;
    }

    // Käytä sovelluksen omaa näkymänvaihtoa
    if (typeof showView === 'function') {
        showView('view-report');
    } else {
        // fallback jos showView puuttuu jostain syystä
        const vr = document.getElementById('view-report');
        if (vr) vr.style.display = 'block';
    }

    // Täytetään vain raporttisisältö (ei rikota allekirjoitus-canvasia tms.)
    const container = document.getElementById('reportContent');
    if (!container) {
        alert("Virhe: reportContent-elementtiä ei löydy view-report-näkymästä.");
        return;
    }

    // Renderöinti unified-raportista
    container.innerHTML = renderOfficialReport(report);

    // Varmistetaan että signature pad init tapahtuu (showView tekee tämän jo)
    if (typeof initSignaturePad === 'function') {
        initSignaturePad();
    }

    console.log('✅ openReportView: unified report käytössä', {
        mode: report.machine?.mode,
        machine: report.machine?.name,
        ducts: report.ducts?.length
    });
}


function renderOfficialReport(report) {
    if (!report) return '';

    const meta = report.meta || {};
    const pages = report.pages || [];
    const siteSummary = report.siteSummary || null;

    const esc = (s) => {
        if (s == null) return '';
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    };

    const fmtNum = (v) => (v == null || v === '' ? '' : v);
    const fmtPct = (v) => (v == null ? '-' : `${v} %`);

    const valveName = (v) => {
        if (!v) return '';
        const t = (v.type || '').toString().toUpperCase();
        const s = (v.size || '').toString();
        return `${t}${t && s ? '-' : ''}${s}`;
    };

    const renderHeaderCommon = (deviceTitle) => `
<header class="report-header">
  <h1>Ilmanvaihdon mittauspöytäkirja</h1>
  <div class="meta">
    <div><b>Kohde:</b> ${esc(meta.address || '')}</div>
    <div><b>Päivä:</b> ${esc(meta.date || '')}</div>
    <div><b>Mittauksen suoritti:</b> ${esc(meta.measurer || '')}</div>
    <div><b>Käytetyt mittarit:</b> ${esc(meta.meters || '')}</div>
    <div><b>Konemalli:</b> ${esc(meta.machineModel || '')}</div>
    <div><b>Laite:</b> ${esc(deviceTitle)}</div>
  </div>
</header>`;

    const renderModeRows = (modeRows) => `
<table class="report-table" style="margin-bottom:10px;">
  <thead>
    <tr>
      <th style="text-align:left;">Tehotila</th>
      <th>Tulo %</th>
      <th>Poisto %</th>
      <th>Kuoripaine (Pa)</th>
    </tr>
  </thead>
  <tbody>
    ${(modeRows || []).map(r => `
<tr>
  <td>${esc(r.label)}</td>
  <td class="pct ${pctClass(r.supplyPct)}">${fmtPct(r.supplyPct)}</td>
  <td class="pct ${pctClass(r.extractPct)}">${fmtPct(r.extractPct)}</td>
  <td>${fmtNum(r.pressurePa)}</td>
</tr>`).join('') || `<tr><td colspan="4">-</td></tr>`}
  </tbody>
</table>`;

    const renderAhuTable = (pg) => {
        const supply = pg.supply || [];
        const extract = pg.extract || [];
        const maxRows = Math.max(supply.length, extract.length);

        const rows = [];
        for (let i = 0; i < maxRows; i++) {
            const s = supply[i];
            const e = extract[i];

            rows.push(`
<tr>
  <td>${esc(s?.room || '')}</td>
  <td>${esc(valveName(s))}</td>
  <td>${fmtNum(s?.kApproved != null ? Number(s.kApproved).toFixed(2) : '')}</td>
  <td>${fmtNum(s?.measuredP)}</td>
  <td>${fmtNum(s?.pos)}</td>
  <td>${fmtNum(s?.flow)}</td>
  <td>${fmtNum(s?.target)}</td>
  <td class="pct ${pctClass(s?.pct)}">${fmtPct(s?.pct)}</td>

  <td>${esc(e?.room || '')}</td>
  <td>${esc(valveName(e))}</td>
  <td>${fmtNum(e?.kApproved != null ? Number(e.kApproved).toFixed(2) : '')}</td>
  <td>${fmtNum(e?.measuredP)}</td>
  <td>${fmtNum(e?.pos)}</td>
  <td>${fmtNum(e?.flow)}</td>
  <td>${fmtNum(e?.target)}</td>
  <td class="pct ${pctClass(e?.pct)}">${fmtPct(e?.pct)}</td>
</tr>`);
        }

        const sTot = pg.summary?.supply || {};
        const eTot = pg.summary?.extract || {};

        rows.push(`
<tr>
  <th colspan="7" style="text-align:left;">Tulo yhteensä</th>
  <th class="pct ${pctClass(sTot.pct)}">${fmtPct(sTot.pct)}</th>

  <th colspan="7" style="text-align:left;">Poisto yhteensä</th>
  <th class="pct ${pctClass(eTot.pct)}">${fmtPct(eTot.pct)}</th>
</tr>
<tr>
  <th colspan="16" style="text-align:left;">
    Koneen kokonais-%:
    <span class="pct ${pctClass(pg.summary?.totalPct)}">
      ${fmtPct(pg.summary?.totalPct)}
    </span>
  </th>
</tr>`);

        return `
<table class="report-table">
  <thead>
    <tr><th colspan="8">TULO</th><th colspan="8">POISTO</th></tr>
    <tr>
      <th>Huone</th><th>Päätelaite</th><th>K</th><th>Pa</th><th>Avaus</th><th>l/s</th><th>Suunn.</th><th>%</th>
      <th>Huone</th><th>Päätelaite</th><th>K</th><th>Pa</th><th>Avaus</th><th>l/s</th><th>Suunn.</th><th>%</th>
    </tr>
  </thead>
  <tbody>${rows.join('')}</tbody>
</table>`;
    };

    const renderFooter = (pg) => `
<div class="report-footer">
  <div>D2 täyttöaste: ${esc(pg.summary?.d2 ?? '-')}</div>
  <div>SFP tulo: ${esc(pg.summary?.sfpSup ?? '-')}</div>
  <div>SFP poisto: ${esc(pg.summary?.sfpExt ?? '-')}</div>
</div>`;

    const renderSiteSummaryPage = (ss) => {
        if (!ss || !Array.isArray(ss.rows)) return '';

        const r = ss.rows;

        const fmtPair = (flow, target) => {
            if (!isFinite(flow) && !isFinite(target)) return '-';
            const f = isFinite(flow) ? Math.round(flow) : '-';
            const t = isFinite(target) ? Math.round(target) : '-';
            return `${f} / ${t}`;
        };

        const rowsHtml = r.map(x => `
<tr>
  <td style="text-align:left;">${esc(x.code || x.name || '-')}${x.name && x.code && x.name !== x.code ? ` – ${esc(x.name)}` : ''}</td>

  <td>${fmtPair(x.supply?.flow, x.supply?.target)}</td>
  <td class="pct ${pctClass(x.supply?.pct)}">${fmtPct(x.supply?.pct)}</td>

  <td>${fmtPair(x.extract?.flow, x.extract?.target)}</td>
  <td class="pct ${pctClass(x.extract?.pct)}">${fmtPct(x.extract?.pct)}</td>
</tr>`).join('');

        const t = ss.totals || {};
        const totRow = `
<tr>
  <th style="text-align:left;">Kaikki laitteet yhteensä</th>
  <th>${fmtPair(t.supply?.flow, t.supply?.target)}</th>
  <th class="pct ${pctClass(t.supply?.pct)}">${fmtPct(t.supply?.pct)}</th>
  <th>${fmtPair(t.extract?.flow, t.extract?.target)}</th>
  <th class="pct ${pctClass(t.extract?.pct)}">${fmtPct(t.extract?.pct)}</th>
</tr>`;

        return `
<div class="report-page">
  ${renderHeaderCommon('Kohdeyhteenveto')}
  <div style="margin:8px 0 12px 0; color:#555; font-size:12px;">
    ${esc(ss.note || '')}
  </div>

  <table class="report-table">
    <thead>
      <tr>
        <th style="text-align:left;">Laite</th>
        <th>Tulo (mit / suunn)</th>
        <th>Tulo %</th>
        <th>Poisto (mit / suunn)</th>
        <th>Poisto %</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      ${totRow}
    </tbody>
  </table>
</div>`;
    };

    const htmlPages = pages.map(pg => `
<div class="report-page">
  ${renderHeaderCommon(pg.code ? `${pg.code} – ${pg.name || ''}` : (pg.name || ''))}
  ${pg.deviceType === 'ahu' ? renderModeRows(pg.modeRows) : ''}
  ${pg.deviceType === 'ahu' ? renderAhuTable(pg) : ''}
  ${renderFooter(pg)}
</div>`).join('');

    const summaryPage = siteSummary ? renderSiteSummaryPage(siteSummary) : '';

    return htmlPages + summaryPage;
}


function openProjectList() {
    showView('view-projects');
}


function renderDetailsView() {

    
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
// 🧬 Legacy-migraatio vain kerran per projekti
if (!p.__legacyMigratedOnce) {
    migrateLegacyDataToActiveMachine(p);
    p.__legacyMigratedOnce = true;
}

    // 🔒 Varmista UI-tila (aktiivinen kone ym.)
    ensureUiState();
    
    // 🔧 AKTIIVINEN KONE (AINOA TOTUUS)
    const machine = getActiveMachine(p);
    if (!machine) return;

    const currentMode = window.currentMode || 'home';

    if (!machine.modes) machine.modes = {};
    if (!machine.modes[currentMode]) {
        machine.modes[currentMode] = { ducts: [], valves: [] };
    }

    const ducts  = machine.modes[currentMode].ducts;
    const valves = machine.modes[currentMode].valves;

    


    

    /* ========= VENTTIILIOPTIOT ========= */
    const db = (typeof valveDB !== 'undefined') ? valveDB : (window.valveDB || {});
    let valveOptionsHTML =
        '<option value="">- Valitse -</option>' +
        '<option value="PITOT">Suora mittaus (Pitot)</option>';

    if (db && Object.keys(db).length > 0) {
        Object.keys(db)
            .sort((a, b) => (db[a].name || '').localeCompare(db[b].name || ''))
            .forEach(k => {
                valveOptionsHTML += `<option value="${k}">${formatValveDisplay(k)}</option>`;
            });
    }

    /* ========= RYHMITTELY + K-LASKENTA ========= */
    const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
    const supplyValves  = [];
    const extractValves = [];

    const isSupplyValve = (v) => {
    const duct = ducts.find(d => String(d.id) === String(v.parentDuctId));
    return duct?.type === 'supply';
};




    (valves || []).forEach((v, idx) => {

        v._origIdx = idx;
        v._calcK = (v.type && v.pos !== null && v.pos !== undefined) ? kFunc(v.type, v.pos) : 0;

        if (isSupplyValve(v)) supplyValves.push(v);
        else extractValves.push(v);
    });

    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

supplyValves.sort(byOrder);
extractValves.sort(byOrder);


   /* ========= SUMMAT / KPI ========= */
const sumSup = supplyValves.reduce(
    (s, v) => s + (parseFloat(v.flow) || 0),
    0
);
const sumExt = extractValves.reduce(
    (s, v) => s + (parseFloat(v.flow) || 0),
    0
);

const sumValveTargetSup = supplyValves.reduce(
    (s, v) => s + (parseFloat(v.target) || 0),
    0
);
const sumValveTargetExt = extractValves.reduce(
    (s, v) => s + (parseFloat(v.target) || 0),
    0
);

const ahu = machine;

// 🎯 KONEEN TAVOITEVIRRAT (konekohtainen totuus)
const finalTargetSup =
    machine.supply?.designFlow &&
    parseFloat(machine.supply.designFlow) > 0
        ? parseFloat(machine.supply.designFlow)
        : sumValveTargetSup;

const finalTargetExt =
    machine.extract?.designFlow &&
    parseFloat(machine.extract.designFlow) > 0
        ? parseFloat(machine.extract.designFlow)
        : sumValveTargetExt;

// 📊 PROSENTIT (TÄMÄ PUUTTUI AIEMMIN)
const supPct = calcPercent(sumSup, finalTargetSup);
const extPct = calcPercent(sumExt, finalTargetExt);

// 🚦 STATUSVÄRIT
const supStatus = getPctStatus(supPct);
const extStatus = getPctStatus(extPct);

// ⚖️ PAINESUHDE
let balanceText = "- %";
let balanceColor = "#7f8c8d";

if (sumExt > 0) {
    const ratio = sumSup / sumExt;
    const diffPct = Math.round((1 - ratio) * 100);

    if (ratio > 1.0) {
        balanceText = `Ylipaine ${Math.abs(diffPct)}%`;
        balanceColor = "#c0392b";
    } else if (ratio < 0.90) {
        balanceText = `Alipaine ${diffPct}% (Vahva)`;
        balanceColor = "#d35400";
    } else {
        balanceText = `Alipaine ${diffPct}% (OK)`;
        balanceColor = "#27ae60";
    }
}


    // Koneen näyttö
    const u = ahu.unit || 'pct';
    const unitLabel = u === 'hz' ? 'Hz' : (u === 'pa' ? 'Pa' : (u === 'speed' ? '' : '%'));

    let machineInfo = "-";

if (machine.type === 'ahu') {
    machineInfo = `T:${machine.supply?.setting || '-'} / P:${machine.extract?.setting || '-'} ${unitLabel}`;
} else if (machine.type === 'supply_only') {
    machineInfo = `T:${machine.supply?.setting || '-'} ${unitLabel}`;
} else if (machine.type === 'extract_only') {
    machineInfo = `P:${machine.extract?.setting || '-'} ${unitLabel}`;
}

if (machine.type === 'ahu') {
    machineInfo = `T:${machine.supply?.setting || '-'} / P:${machine.extract?.setting || '-'} ${unitLabel}`;
} else if (machine.type === 'supply_only') {
    machineInfo = `T:${machine.supply?.setting || '-'} ${unitLabel}`;
} else if (machine.type === 'extract_only') {
    machineInfo = `P:${machine.extract?.setting || '-'} ${unitLabel}`;
}

    // D2 + SFP
    const area = parseFloat(p.meta?.area || 0) || 0;
    const height = parseFloat(p.meta?.height || 2.5) || 2.5;

    let reqFlow = 0;
    let d2Status = `<span style="color:#999;">(Syötä m²)</span>`;
    if (area > 0) {
        reqFlow = (area * height * 0.5) / 3.6;
        const diff = sumExt - reqFlow;
        d2Status = diff >= 0
            ? `<b style="color:#27ae60">OK</b>`
            : `<b style="color:#c0392b">Vajaa ${Math.abs(diff).toFixed(1)} l/s</b>`;
    }

    const powerSup = parseFloat(p.meta?.powerSup || 0) || 0;
    const powerExt = parseFloat(p.meta?.powerExt || 0) || 0;

    let sfpText = "-";
    if (powerSup + powerExt > 0) {
        const maxFlow = Math.max(sumSup, sumExt);
        if (maxFlow > 0) {
            const sfp = ((powerSup + powerExt) / 1000) / (maxFlow / 1000);
            sfpText = sfp.toFixed(2);
        }
    }

    const dateVal = p.meta?.date || new Date().toLocaleDateString('fi-FI');
    const timeVal = p.meta?.time || new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });

    /* ========= INDEKSI (manuaalinen) =========
       Jos sinulla ei ole aiemmin setIndexValve-funktiota, tämä renderöinti olettaa että
       v.isIndex on olemassa. Jos sitä ei ole, nappi toimii silti jos lisäät helperin (annan alla).
    */

    

    const renderDuctSection = (duct, valves) => {
        const ductValves = valves.filter(v => v.parentDuctId == duct.id);
    
        let html = `
            <tr style="background:${duct.type === 'supply' ? '#e3f2fd' : '#fdecea'};">
                <td colspan="8"
                    style="
                        font-weight:bold;
                        padding:6px 8px;
                    ">
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                    ">
                        <span>${duct.name || 'Nimetön runko'}</span>
    
                        <button
                            onclick="openValvePanel(null, { parentDuctId: '${duct.id}' })"
                            style="
                                font-size:11px;
                                padding:2px 6px;
                                border-radius:4px;
                                border:1px solid #ccc;
                                background:#fff;
                                cursor:pointer;
                            "
                            title="Lisää venttiili tähän runkoon"
                        >
                            ➕ Lisää
                        </button>
                    </div>
                </td>
            </tr>
        `;
    
        if (ductValves.length) {
            html += ductValves.map(renderRow).join('');
        } else {
            html += `
                <tr>
                    <td colspan="8"
                        style="text-align:center;padding:10px;color:#999;">
                        Ei venttiileitä tässä rungossa
                    </td>
                </tr>
            `;
        }
    
        return html;
    };
    
    /* ========= RENDERÖINTI: KOKO ETUSIVU (#view-details) ========= */
    const view = document.getElementById('view-details');
    if (!view) return;

    view.innerHTML = `


        <style>
            .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 10px;
    align-items: stretch;
}

.kpi-box {
    background: #fff;
    padding: 6px 4px;
    border-radius: 6px;
    border: 1px solid #ddd;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    min-height: 60px;
}

.kpi-val {
    font-size: 16px;
    font-weight: 800;
    line-height: 1.1;
}

.kpi-sub {
    font-size: 11px;
    color: #777;
    margin-top: 2px;
}

.kpi-lbl {
    font-size: 9px;
    text-transform: uppercase;
    color: #777;
    font-weight: 600;
    margin-top: 2px;
}


            .mode-row { display:flex; gap:8px; margin-bottom:10px; }
            .mode-big { flex:1; padding:10px; border:1px solid #ccc; border-radius:6px; font-weight:bold; cursor:pointer; }

            .tech-box { background:#eef5e9; border:1px solid #c3e6cb; border-radius:6px; padding:15px; margin-bottom:15px; }
            .tech-row { display:flex; flex-wrap:wrap; gap:15px; align-items:center; margin-bottom:10px; }
            .tech-row:last-child { margin-bottom:0; }

            .input-xl { font-size:16px; padding:10px; width:80px; border:1px solid #ccc; border-radius:6px; text-align:center; font-weight:bold; }
            .label-xl { font-size:14px; font-weight:bold; color:#2c3e50; }
            .sel-xl { font-size:14px; padding:8px; border:1px solid #ccc; border-radius:6px; width:100%; }

            .lists-container { display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
            .list-col { flex:1; min-width:320px; background:#fff; border-radius:8px; border:1px solid #ddd; overflow:hidden; }

            .mini-table { width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed; }
            .mini-table th { background:#f9f9f9; padding:6px 4px; text-align:center; font-size:11px; color:#555; }
            .mini-table td { border-bottom:1px solid #eee; vertical-align:middle; }

            .inline-inp { border:1px solid transparent; background:transparent; text-align:center; padding:8px 0; font-size:14px; border-radius:4px; }
            .inline-inp:focus { border:1px solid #2196F3; background:#fff; outline:none; }
            .inline-inp.val-ok { color:#27ae60; }
            .inline-inp.val-err { color:#c0392b; }

            .inline-select { border:1px solid transparent; background:transparent; padding:8px 2px; font-size:12px; color:#444; border-radius:4px; width:100%; cursor:pointer; }
            .inline-select:focus { border:1px solid #2196F3; background:#fff; outline:none; }

            .info-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px; background:#fff; padding:10px; border-radius:6px; border:1px solid #eee; }
            .info-col { display:flex; flex-direction:column; gap:8px; }
            .info-inp { width:100%; border:1px solid #ddd; padding:8px; border-radius:4px; font-size:14px; color:#333; }
            .info-inp:focus { border-color:#2196F3; outline:none; }
            .info-label { font-size:11px; font-weight:bold; color:#666; margin-bottom:2px; }

            .tool-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px; }
            .tool-btn { padding:12px; background:#f8f9fa; border:1px solid #ccc; border-radius:6px; font-weight:bold; color:#444; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; font-size:13px; }

            @media (max-width: 900px){
                .info-grid{ grid-template-columns:1fr; }
                .kpi-row{ grid-template-columns:1fr 1fr; }
            }
        </style>

        <div style="padding:10px; max-width:1200px; margin:0 auto;">

            <!-- OTSIKKO -->
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <h1 style="margin:0; font-size:22px; color:#2c3e50;">${p.name}</h1>
                <button class="list-action-btn" onclick="renameActiveProject()" title="Muokkaa nimeä" style="font-size:16px;">✏️</button>
            </div>
<!-- KONEVALITSIN (ETUSIVU) -->
<div id="detailsMachineBar" style="margin-bottom:10px;"></div>


            <!-- WORKFLOW-HINT -->
            <div id="workflowHint"
                style="margin:10px 0;padding:10px;border-radius:8px;background:#eef2ff;color:#1a237e;font-weight:bold;font-size:13px;">
            </div>

            <!-- META -->
            <div class="info-grid">
                <div class="info-col">
                    <div>
                        <div class="info-label">Kohde (Nimi)</div>
                        <input class="info-inp" type="text" placeholder="Esim. OKT Virtanen"
                            value="${p.meta?.location || ''}"
                            onchange="updateProjectMeta('location', this.value)">
                    </div>
                    <div>
                        <div class="info-label">Kohteen Osoite</div>
                        <input class="info-inp" type="text" placeholder="Esim. Esimerkkitie 1"
                            value="${p.meta?.address || ''}"
                            onchange="updateProjectMeta('address', this.value)">
                    </div>
                </div>
                <div class="info-col">
                    <div>
                        <div class="info-label">Mittaaja (Henkilö)</div>
                        <input class="info-inp" type="text" placeholder="Esim. Matti Meikäläinen"
                            value="${p.meta?.measurer || ''}"
                            onchange="updateProjectMeta('measurer', this.value)">
                    </div>
                    <div>
                        <div class="info-label">Käytetty Mittari</div>
                        <input class="info-inp" type="text" placeholder="Esim. TSI / Swema"
                            value="${p.meta?.device || ''}"
                            onchange="updateProjectMeta('device', this.value)">
                    </div>
                </div>
                <div class="info-col">
                    <div>
                        <div class="info-label">Yritys (Nimi, Y-tunnus)</div>
                        <input class="info-inp" type="text" placeholder="Yritys Oy, 123456-7"
                            value="${p.meta?.company || ''}"
                            onchange="updateProjectMeta('company', this.value)">
                    </div>
                    <div style="display:flex; gap:5px;">
                        <div style="flex:1;">
                            <div class="info-label">Pvm</div>
                            <input class="info-inp" type="text"
                                value="${dateVal}"
                                onchange="updateProjectMeta('date', this.value)">
                        </div>
                        <div style="flex:1;">
                            <div class="info-label">Aika</div>
                            <input class="info-inp" type="text"
                                value="${timeVal}"
                                onchange="updateProjectMeta('time', this.value)">
                        </div>
                    </div>
                </div>
            </div>

            <!-- TILAT -->
            <div class="mode-row">
                <button class="mode-big" onclick="setMode('home'); openMeasurementView()">🏠 Kotona</button>
<button class="mode-big" onclick="setMode('away'); openMeasurementView()">🏃 Poissa</button>
<button class="mode-big" onclick="setMode('boost'); openMeasurementView()">🚀 Tehostus</button>

            </div>

<!-- KPI -->
<div class="kpi-row">

    <div class="kpi-box" style="border-top:3px solid ${supStatus.color};">
        <div class="kpi-val" style="color:${supStatus.color};">
            ${sumSup.toFixed(0)}
        </div>
        <div class="kpi-sub">
            / ${finalTargetSup.toFixed(0)} l/s ${supPct !== null ? `(${supPct}%)` : ''}
        </div>
        <div class="kpi-lbl">TULOILMA</div>
    </div>

    <div class="kpi-box" style="border-top:3px solid ${extStatus.color};">
        <div class="kpi-val" style="color:${extStatus.color};">
            ${sumExt.toFixed(0)}
        </div>
        <div class="kpi-sub">
            / ${finalTargetExt.toFixed(0)} l/s ${extPct !== null ? `(${extPct}%)` : ''}
        </div>
        <div class="kpi-lbl">POISTOILMA</div>
    </div>

    <div class="kpi-box" style="border-top:3px solid ${balanceColor};">
        <div class="kpi-val" style="color:${balanceColor}; font-size:14px;">
            ${balanceText}
        </div>
        <div class="kpi-lbl">PAINESUHDE</div>
    </div>

    <div class="kpi-box"
     onclick="openEditMachineModal('${machine.id}')"
     style="cursor:pointer; border-top:3px solid #34495e;">

        <div class="kpi-val" style="color:#34495e; font-size:16px;">
            ${machineInfo}
        </div>
        <div class="kpi-lbl">KONE (${currentMode})</div>
    </div>

</div>


            <!-- D2 + SFP -->
            <div class="tech-box">
                <div class="tech-row" style="border-bottom:1px solid #ccc; padding-bottom:15px;">
                    <span class="label-xl">D2-Määräys:</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" class="input-xl" placeholder="m²"
                            value="${p.meta?.area || ''}"
                            onchange="updateProjectMeta('area',this.value)"> <span>m²</span>
                    </div>
                    <span style="color:#aaa; font-size:20px;">x</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="number" class="input-xl" placeholder="h"
                            value="${p.meta?.height || '2.5'}"
                            onchange="updateProjectMeta('height',this.value)"> <span>h</span>
                    </div>
                    <div style="margin-left:auto; text-align:right;">
                        <div style="font-size:12px; color:#666;">Tavoite</div>
                        <div style="font-size:18px; font-weight:bold;">${reqFlow.toFixed(0)} l/s</div>
                        <div style="font-size:12px;">${d2Status}</div>
                    </div>
                </div>

                <div class="tech-row" style="align-items:flex-start; padding-top:10px;">
                    <div style="flex:1; min-width:200px;">
                        <div class="label-xl" style="margin-bottom:5px;">SFP-Luku: <span style="color:#2196F3;">${sfpText}</span></div>
                        <div style="display:flex; gap:10px;">
                            <input type="number" class="input-xl" placeholder="Tul W"
                                value="${p.meta?.powerSup || ''}"
                                onchange="updateProjectMeta('powerSup',this.value)">
                            <input type="number" class="input-xl" placeholder="Poi W"
                                value="${p.meta?.powerExt || ''}"
                                onchange="updateProjectMeta('powerExt',this.value)">
                        </div>
                    </div>
                    <div style="flex:1; display:flex; gap:15px; justify-content:flex-end;">
                        <div style="width:140px;">
                            <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">Laakerit Tulo</div>
                            <select onchange="updateProjectMeta('bearingSup',this.value)" class="sel-xl">
                                <option value="-" ${p.meta?.bearingSup==='-'?'selected':''}>-</option>
                                <option value="OK" ${p.meta?.bearingSup==='OK'?'selected':''}>OK</option>
                                <option value="Vaihdettu" ${p.meta?.bearingSup==='Vaihdettu'?'selected':''}>Vaihdettu</option>
                            </select>
                        </div>
                        <div style="width:140px;">
                            <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">Laakerit Poisto</div>
                            <select onchange="updateProjectMeta('bearingExt',this.value)" class="sel-xl">
                                <option value="-" ${p.meta?.bearingExt==='-'?'selected':''}>-</option>
                                <option value="OK" ${p.meta?.bearingExt==='OK'?'selected':''}>OK</option>
                                <option value="Vaihdettu" ${p.meta?.bearingExt==='Vaihdettu'?'selected':''}>Vaihdettu</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TOIMINTONAPIT -->
            <div class="tool-grid">
            

                <button class="tool-btn" style="background:#e3f2fd; border-color:#2196f3; color:#0d47a1;" onclick="showVisual()">🗺️ Avaa Kartta</button>
                <button class="tool-btn" style="background:#e8f5e9; border-color:#4caf50; color:#1b5e20;" onclick="openValvePanel(null)"
>➕ Lisää Venttiili</button>
                <button class="tool-btn" onclick="openCreateAptAHUModal()">🏢 Asunnot</button>
                <button class="tool-btn" onclick="showReportExcelStyle()">📄 Pöytäkirjat</button>
                <button class="btn btn-secondary"
        onclick="openKLibraryAdmin()">
    📚 K-kirjasto
</button>

                <button class="tool-btn" onclick="shareProjectData()">📤 Jaa</button>
                

                <button class="tool-btn" onclick="openCreateDuctModal()">
    ➕ Luo runko
</button>

            </div>

            <!-- LISTAT -->
<h4 style="margin:0; border-bottom:1px solid #ddd; padding-bottom:5px; font-size:14px;">
    Mittauspöytäkirja / Lista (${currentMode})
</h4>

<!-- PÄÄMITTALISTA (nykyinen, ei muutu) -->
<div id="measurementList" style="margin-top:10px;"></div>

<!-- NOPEA SYÖTTÖLISTA (UUSI) -->
<h4 style="margin-top:16px; border-bottom:1px dashed #ddd; padding-bottom:5px; font-size:13px;">
    Nopea mittalista (syöttö)
</h4>


        
    `;
// 🔧 Etusivun konevalitsin (DOM on nyt olemassa)
const detailsBar = document.getElementById('detailsMachineBar');
if (detailsBar) {
    detailsBar.innerHTML = '';
    renderMachineSelector(detailsBar);
    // 🔁 UUSI: Renderöi hybridimittalista
const listContainer = document.getElementById('measurementList');
if (listContainer) {
renderMeasurementListV2(listContainer);

}

}

   // 🧭 Päivitä workflow-ohje
updateWorkflowHint(p);

// 🎨 Värit peruuta / sulje / takaisin -napeille
applyCancelButtonStyles(document);
// ✅ Päivitä myös syöttömittalista aina kun details renderöidään

}
function goBackToProjects() {
    window.appState.activeProjectId = null;
    showView('view-projects');
}

// ⚖️ SUHTEELLINEN SÄÄTÖ – analyysi (EI muuta dataa)
function analyzeRelativeAdjustment(p, mode = 'home') {
    if (!p?.modes?.[mode]) return null;

    const valves = p.modes[mode].valves || [];
    const ducts = p.ducts || [];

    const result = {
        byDuct: {},      // ductId -> analyysi
        summary: {
            totalValves: valves.length,
            readyValves: 0,
            avgDeviationPct: 0
        }
    };

    let deviationSum = 0;
    let deviationCount = 0;

    valves.forEach(v => {
        if (!v.parentDuctId || !v.target || !v.flow) return;

        const deviation = v.flow - v.target;
        const deviationPct = (deviation / v.target) * 100;

        deviationSum += Math.abs(deviationPct);
        deviationCount++;

        if (!result.byDuct[v.parentDuctId]) {
            const duct = ducts.find(d => d.id === v.parentDuctId);
            result.byDuct[v.parentDuctId] = {
                ductId: v.parentDuctId,
                ductName: duct?.name || 'Runkokanava',
                flowType: v.flowType,
                valves: [],
                maxDeviationPct: 0
            };
        }

        result.byDuct[v.parentDuctId].valves.push({
            id: v.id,
            room: v.room,
            flow: v.flow,
            target: v.target,
            deviation,
            deviationPct
        });

        result.byDuct[v.parentDuctId].maxDeviationPct = Math.max(
            result.byDuct[v.parentDuctId].maxDeviationPct,
            Math.abs(deviationPct)
        );
    });

    result.summary.readyValves = deviationCount;
    result.summary.avgDeviationPct =
        deviationCount > 0 ? deviationSum / deviationCount : 0;

    return result;
}
function ensureUiState() {
    if (!window.uiState) window.uiState = {};

    // aktiivinen kone
    if (window.uiState.activeMachineId == null) window.uiState.activeMachineId = null;

    // UI-tila per projekti + kone (myöhemmin laajennettavissa eri näkymille)
    if (!window.uiState.mapUi) window.uiState.mapUi = {};
}

function captureCurrentMapUiState() {
    ensureUiState();

    const projectId = window.activeProjectId;
    const mode = window.currentMode || 'home';
    const machineId = window.uiState.activeMachineId;
    if (!projectId || !machineId) return;

    const scrollEl = document.getElementById('visScrollArea');
    if (!scrollEl) return;

    const zoom =
        typeof window.currentZoom === 'number'
            ? window.currentZoom
            : 1;

    const key = `mapUiState:${projectId}:${mode}:${machineId}`;

    const state = {
        scrollLeft: scrollEl.scrollLeft,
        scrollTop: scrollEl.scrollTop,
        zoom: zoom
    };

    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
        console.warn('mapUiState save failed', e);
    }
}
function applyStoredMapUiState() {
    ensureUiState();

    const projectId = window.activeProjectId;
    const mode = window.currentMode || 'home';
    const machineId = window.uiState.activeMachineId;
    if (!projectId || !machineId) return;

    const key = `mapUiState:${projectId}:${mode}:${machineId}`;

    let state;
    try {
        state = JSON.parse(localStorage.getItem(key));
    } catch (e) {
        state = null;
    }
    if (!state) return;

    const scrollEl = document.getElementById('visScrollArea');
    if (!scrollEl) return;

    // zoom ensin, koska se vaikuttaa scroll-mittoihin
    if (typeof state.zoom === 'number' && typeof window.applyZoom === 'function') {
        window.applyZoom(state.zoom);
    }

    // scroll palautetaan vasta kun DOM on varmasti mitoitettu
    requestAnimationFrame(() => {
        scrollEl.scrollLeft = state.scrollLeft || 0;
        scrollEl.scrollTop = state.scrollTop || 0;
    });
}

// 📊 Live-tilanne suhteelliseen säätöön
function renderRelativeLiveStatus(p, mode = 'home') {
    const panel = document.getElementById('relativeAdjustPanel');
    if (!panel) return;

    const analysis = analyzeRelativeAdjustment(p, mode);
    if (!analysis) return;

    let html = `
        <div style="margin-top:14px;padding:10px;
                    border:1px dashed #bbb;
                    border-radius:8px;
                    background:#f9f9f9;">
            <b>📊 Säätötilanne nyt</b>
            <div style="font-size:12px;color:#555;margin-top:4px;">
                Päivittyy aina, kun tallennat mittauksen
            </div>
    `;

    Object.values(analysis.byDuct).forEach(d => {
        let color = '#ef6c00'; // oletus: kesken
        let status = 'Kesken';

        if (d.maxDeviationPct < 5) {
            color = '#2e7d32';
            status = 'Valmis';
        } else if (d.maxDeviationPct > 25) {
            color = '#c62828';
            status = 'Paljon pielessä';
        }

        html += `
            <div style="margin-top:8px;padding:8px;
                        border-left:4px solid ${color};
                        background:#fff;">
                <b>${d.ductName}</b><br>
                Tila: <b style="color:${color};">${status}</b><br>
                Suurin poikkeama: ${d.maxDeviationPct.toFixed(1)} %
            </div>
        `;
    });

    html += `
            <div style="margin-top:10px;font-size:12px;color:#555;">
                Keskimääräinen poikkeama: 
                <b>${analysis.summary.avgDeviationPct.toFixed(1)} %</b>
            </div>
        </div>
    `;

    panel.innerHTML += html;
}

function setIndexValve(idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || [];
    const v = valves[idx];
    if (!v || !v.parentDuctId) return;

    const ductId = v.parentDuctId;

    // 🔁 Poista indeksi VAIN tästä rungosta
    valves.forEach(valve => {
        if (valve.parentDuctId === ductId) {
            valve.isIndex = false;
        }
    });

    // ⭐ Aseta uusi indeksi
    v.isIndex = true;

    renderDetailsList();
    updateWorkflowHint();
}
function getActiveMachineValves(p, mode = null) {
    const m = getActiveMachine(p);
    if (!m) return [];

    const activeMode = mode || window.currentMode || 'home';
    const ducts = m.modes?.[activeMode]?.ducts || [];

    return ducts.flatMap(d => Array.isArray(d.valves) ? d.valves : []);
}

function getActiveMachine(p) {
    ensureUiState();

    // ✅ Varmista että projektissa on koneet-array
    if (!Array.isArray(p.machines)) p.machines = [];

    // ✅ Jos ei ole yhtään konetta → luo oletuskone
    if (p.machines.length === 0) {
        const newId = (typeof genId === 'function')
            ? genId()
            : (Date.now().toString(36) + Math.random().toString(36).slice(2));

        p.machines.push({
            id: newId,
            name: 'TK01',
            type: 'ahu',
            unit: 'pct',
            modes: {}
        });

        window.uiState.activeMachineId = newId;
        saveData?.();
    }

    // ✅ Varmista että kaikilla koneilla on id
    p.machines.forEach((m, i) => {
        if (m.id == null || m.id === '') {
            m.id = (typeof genId === 'function')
                ? genId()
                : (Date.now().toString(36) + Math.random().toString(36).slice(2));
        }
        if (!m.name) m.name = `TK${String(i + 1).padStart(2, '0')}`;
        if (!m.modes) m.modes = {};
    });

    const id = window.uiState.activeMachineId;

    // ✅ Palauta aktiivinen tai ensimmäinen
    const found = p.machines.find(m => String(m.id) === String(id));
    const active = found || p.machines[0];

    // ✅ Jos uiState oli tyhjä / väärä → korjaa
    window.uiState.activeMachineId = active.id;

    return active;
}

function getActiveMachineMode(p, mode) {
    if (!p) return { ducts: [], valves: [], fans: [] };

    const activeMode = mode || window.currentMode || 'home';

    const m = (typeof getActiveMachine === 'function') ? getActiveMachine(p) : null;
    if (!m) return { ducts: [], valves: [], fans: [] };

    // 1) Varmista modes-rakenne
    if (!m.modes) m.modes = {};
    if (!m.modes[activeMode]) {
        m.modes[activeMode] = { ducts: [], fans: [] };
    }

    const mm = m.modes[activeMode];

    // 2) Varmista taulukot
    if (!Array.isArray(mm.ducts)) mm.ducts = [];
    if (!Array.isArray(mm.fans)) mm.fans = [];

    // 3) Varmista että jokaisella rungolla on valves[]
    mm.ducts.forEach(d => {
        if (!Array.isArray(d.valves)) d.valves = [];
    });

    // 4) MIGRAATIO (vain kerran per moodi):
    //    Jos vanha mm.valves on olemassa -> siirrä rungon alle parentDuctId:n mukaan
    if (!mm.__valvesMovedToDucts) {
        const legacy = Array.isArray(mm.valves) ? mm.valves : [];
        if (legacy.length) {
            legacy.forEach(v => {
                const ductId = String(v.parentDuctId || '');
                if (!ductId) return;

                const duct = mm.ducts.find(d => String(d.id) === ductId);
                if (!duct) return;

                if (!Array.isArray(duct.valves)) duct.valves = [];

                const exists = duct.valves.some(x => String(x.id) === String(v.id));
                if (!exists) duct.valves.push(v);
            });
        }

        mm.__valvesMovedToDucts = true;
    }

    // 5) Virtuaalinen valves-lista (lukemista varten)
    mm.valves = mm.ducts.flatMap(d => Array.isArray(d.valves) ? d.valves : []);

    return mm;
}



function setWorkflowHint(text) {
    const el = document.getElementById('workflowHint');
    if (el) el.innerHTML = text;
}


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
// ... (Muu koodi säilyy ennallaan) ...

// NEW: Huonekohtainen suhteellinen laskenta ja logiikka
// Käsittelee huoneen venttiilit, etsii indeksin ja laskee uudet asennot 1-10 asteikolla.
function calculateRoomRelativeAdjustments(room, valves) {
    // Tarkistukset
    if (!room || !valves || valves.length === 0) {
        return null;
    }

    // 1. Laske suhteet ja etsi indeksi
    // Suhde = Mitattu / Suunniteltu
    let minRatio = Infinity;
    let indexValveId = null;

    // Alustava läpikäynti suhteiden laskemiseksi
    const processedValves = valves.map(v => {
        const flow = parseFloat(v.flow) || 0;
        const target = parseFloat(v.target) || 0; // Käytetään olemassa olevaa target-kenttää
        const ratio = target > 0 ? flow / target : 9999; // Vältetään nollalla jako
        
        return {
            ...v,
            _calcRatio: ratio,
            _calcFlow: flow,
            _calcTarget: target
        };
    });

    // Etsi indeksi: venttiili jolla on pienin suhde
    processedValves.forEach(v => {
        if (v._calcTarget > 0 && v._calcRatio < minRatio) {
            minRatio = v._calcRatio;
            indexValveId = v.id;
        }
    });

    // Varmistus: jos kaikki nollia tai virhe, otetaan ensimmäinen
    if (indexValveId === null && processedValves.length > 0) {
        indexValveId = processedValves[0].id;
        minRatio = processedValves[0]._calcRatio || 0;
    }

    // 2. Laske suositukset ja huoneen summa
    let measuredTotalFlow = 0;
    const resultValves = [];
    const recommendations = [];

    processedValves.forEach(v => {
        measuredTotalFlow += v._calcFlow;
        
        const isIndex = (v.id === indexValveId);
        const currentPos = parseFloat(v.pos) || 0;
        let newPos = currentPos;

        // Lisätään vaadittu kenttä
        v.relativeIndex = isIndex;

        if (isIndex) {
            // Sääntö: Älä koskaan muuta indeksiä ilman käyttäjän käskyä.
            newPos = currentPos; 
        } else {
            // Sääntö: newPos = currentPos * (index.suhde / valve.suhde)
            // Estetään nollalla jako jos valve.suhde on 0
            if (v._calcRatio > 0) {
                const ratio = minRatio / v._calcRatio;
                let calculatedPos = currentPos * ratio;
                
                // Pyöristä newPos 1–10 asteikolle
                calculatedPos = Math.round(calculatedPos);
                newPos = Math.max(1, Math.min(10, calculatedPos));
            }
        }

        // Tallennetaan tulokset
        resultValves.push({
            id: v.id,
            name: v.name || v.room, // Fallback room-kenttään
            model: v.type,
            size: v.size || '', 
            oldPos: currentPos,
            newPos: newPos,
            mitattu: v._calcFlow,
            tarve: v._calcTarget,
            suhde: v._calcRatio,
            isIndex: isIndex,
            relativeIndex: isIndex,
            roomId: room.roomId,      // Vaadittu uusi kenttä
            displayOrder: v.displayOrder || 0 // Vaadittu uusi kenttä
        });

        // Generoi suositusteksti jos asento muuttuu
        if (!isIndex && newPos !== Math.round(currentPos)) {
            recommendations.push(`${v.room || 'Venttiili'}: Säädä asennosta ${Math.round(currentPos)} asentoon ${newPos}`);
        }
    });

    // 3. Huoneen kokonaisvirtaus ja poikkeama
    // Jos targetTotalFlow puuttuu, lasketaan venttiilien summasta
    const targetTotal = room.targetTotalFlow || resultValves.reduce((sum, v) => sum + v.tarve, 0);
    
    let deviationPercent = 0;
    if (targetTotal > 0) {
        deviationPercent = ((measuredTotalFlow - targetTotal) / targetTotal) * 100;
    }

    // 5. Koneen säätö (Huonekohtainen ohje)
    // "Kun kaikki venttiilit ovat suhteessa X ±0.03, nosta koneen tehoa kunnes indeksiventtiilin suhde = 1.00."
    const indexRatioDisplay = minRatio.toFixed(2);
    const machineAdvice = `Kun kaikki venttiilit ovat suhteessa ${indexRatioDisplay} ±0.03, nosta koneen tehoa kunnes indeksiventtiilin suhde = 1.00.`;

    // 4. Palauta vaadittu rakenne
    return {
        roomInfo: {
            roomId: room.roomId,
            roomName: room.roomName,
            roomType: room.roomType, // Tulo/Poisto
            targetTotalFlow: targetTotal,
            measuredTotalFlow: measuredTotalFlow,
            deviationPercent: deviationPercent.toFixed(1) // 1 desimaali
        },
        valves: resultValves,
        recommendations: recommendations,
        machineAdvice: machineAdvice
    };
}
// END NEW

// ... (Muu koodi säilyy ennallaan) ...


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
// ⚖️ Suhteellisen säädön ohjepaneeli
function showRelativeAdjustPanel() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);

    const ducts = mm.ducts || [];
    if (!ducts.length) {
        alert('Ei runkoja suhteellista säätöä varten.');
        return;
    }

    const withIndex = ducts.filter(d =>
        (d.valves || []).some(v => v.isIndex)
    );

    if (!withIndex.length) {
        alert('Yhdessäkään rungossa ei ole indeksiventtiiliä.');
        return;
    }

    openRelativeAdjustModal(withIndex);
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

    const nameInput = document.getElementById('ductName');
    if (nameInput) nameInput.value = "";

    const sizeInput = document.getElementById('ductSize');
    if (sizeInput) sizeInput.value = 125;

    const typeSelect = document.getElementById('ductType');
    if (typeSelect) typeSelect.value = 'supply';

    const groupSelect = document.getElementById('ductGroup');
    if (groupSelect) groupSelect.value = 'ahu';

    showView('view-add-duct');
}



// --- MODAL HANDLING FOR PROJECT CREATION ---
// 🔹 Avaa Uusi projekti -modalin
function showNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (!modal) {
        console.error('❌ newProjectModal puuttuu');
        return;
    }

    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    document.body.classList.add('modal-open');

    modal.style.display = 'flex';
    modal.classList.add('active');

    console.log('✅ newProjectModal fully interactive');
}



function closeModal() {
    const modal = document.getElementById('newProjectModal');
    if (!modal) return;

    modal.style.display = 'none';
    modal.classList.remove('active');

    document.body.classList.remove('modal-open');
}




// 🔹 Turvallinen projektiluonti
// 🔒 Turvakutsu HTML-onclickeille





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


function migrateLegacyValvesToActiveMachine(p, modeOverride = null) {
    ensureUiState();

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = modeOverride || window.currentMode || 'home';

    // ✅ Varmista koneen mode-rakenne
    if (!machine.modes) machine.modes = {};
    if (!machine.modes[mode]) machine.modes[mode] = { ducts: [], valves: [] };

    const mm = machine.modes[mode];

    // ✅ Migraatiolukko: ajetaan vain kerran per kone+mode
    // (idempotentti myös jos joku vanha koodi kutsuu tätä renderissä)
    if (!mm._legacyMigrated) {
        const legacyValves = Array.isArray(p.valves) ? p.valves : [];
        const legacyDucts  = Array.isArray(p.ducts) ? p.ducts : [];

        const pm = (p.modes && p.modes[mode]) ? p.modes[mode] : null;
        const modeValves = Array.isArray(pm?.valves) ? pm.valves : [];
        const modeDucts  = Array.isArray(pm?.ducts) ? pm.ducts : [];

        // ✅ Lähdevalinta: käytä ensisijaisesti p.modes[mode], muuten legacy root
        const srcValves = modeValves.length ? modeValves : legacyValves;
        const srcDucts  = modeDucts.length  ? modeDucts  : legacyDucts;

        // ✅ Siirrä koneelle VAIN jos koneella ei jo ole dataa
        if (mm.valves.length === 0 && srcValves.length) {
            mm.valves = srcValves.map(v => ({ ...v }));
        }
        if (mm.ducts.length === 0 && srcDucts.length) {
            mm.ducts = srcDucts.map(d => ({ ...d }));
        }

        // ✅ Lukitse migraatio
        mm._legacyMigrated = true;

        // ✅ Siivoa legacy-root pois (ettei mikään UI vahingossa käytä sitä myöhemmin)
        if (Array.isArray(p.valves)) delete p.valves;
        if (Array.isArray(p.ducts)) delete p.ducts;
    }

    // ✅ Fallback id-generaattori (ei koskaan vaihda olemassa olevaa id:tä)
    const makeId = () => (typeof genId === 'function')
        ? genId()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));

    // ✅ Pakota runko-ID:t (vain jos puuttuu)
    (mm.ducts || []).forEach(d => {
        if (d.id == null || d.id === '') d.id = makeId();
    });

    // ✅ Pakota venttiili-ID:t (vain jos puuttuu) + peruskentät
    (mm.valves || []).forEach(v => {
        if (v.id == null || v.id === '') v.id = makeId();

        if (v.flow === undefined) v.flow = 0;
        if (v.measuredP === undefined) v.measuredP = 0;
        if (v.pos === undefined) v.pos = null;
        if (v.isIndex === undefined) v.isIndex = false;
    });

    // ✅ Aliasoi projektin modes → samaan lähteeseen kuin koneen modes
    if (!p.modes) p.modes = {};
    if (!p.modes[mode]) p.modes[mode] = {};

    p.modes[mode].valves = mm.valves;
    p.modes[mode].ducts  = mm.ducts;

    // ✅ Turva: jos uiState:ssa on indeksi-id, mutta sitä ei löydy → nollaa lukko
    if (window.uiState?.indexLocked && window.uiState.indexValveId != null) {
        const ok = (mm.valves || []).some(v => String(v.id) === String(window.uiState.indexValveId));
        if (!ok) {
            window.uiState.indexLocked = false;
            window.uiState.indexValveId = null;
            (mm.valves || []).forEach(v => (v.isIndex = false));
        }
    }

    saveData?.();
}

function renderVisualContent() {
    console.log('🔥 renderVisualContent CALLED, mode=', window.activeVisMode);
    console.log('renderVisualContent called');

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
// 🧬 Migroi demo / legacy-data koneelle jos tarpeen

    // Tyhjennä mahdollinen yläpalkki ja näytä suodatinpaluu tarvittaessa
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

    // 👇 KONEVALITSIN LISÄTÄÄN TÄHÄN (AINA VIIMEISENÄ YLÄPALKKIIN)
    renderMachineSelector(roofBar);
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

        // 🔹 VAIHE 1.1: palauta konekohtainen kartan UI-tila
        try {
            applyStoredMapUiState();
        } catch (e) {
            console.warn('applyStoredMapUiState failed', e);
        }
    }
}


window.setIndexValve = function () {
    console.warn('setIndexValve disabled (Korjaus 1): konekohtainen logiikka tulossa');
    return;
};


window.selectMachine = function (id) {
    ensureUiState();

    window.uiState.activeMachineId = id;

    // 🔴 Koneenvaihdossa indeksi nollataan
    window.uiState.indexValveId = null;
    window.uiState.indexLocked = false;

    // 🔑 AINOA renderöintikutsu
    renderActiveProject();
};



function getMachinesForProject() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return [];
    return p.machines || [];
}



function renderVerticalStackInto(container, p) {

    const ducts = p.ducts || [];

    // ✅ Kohta 1: myös pystynäkymä käyttää samaa “aktiivista” venttiililähdettä
    const valves = getActiveValvesForMap(p);

    const currentMode = window.currentMode || 'home';

    const isApt = (p.systemType === 'kerrostalo');
    let shafts = isApt
        ? ducts.filter(d => d.group === 'apt')
        : ducts.filter(d => d.type === 'extract' && d.group === 'roof');

    if (window._visTowerFilter) {
        const one = shafts.find(s => s.id === window._visTowerFilter);
        if (one) shafts = [one];
    }

    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    /* =====================================================
       1️⃣ KONEKORTTI (näkyy aina)
       ===================================================== */
    const machine = p.modes?.[currentMode]?.machines?.[0];

    const machineWrap = document.createElement('div');
    machineWrap.className = 'vis-machine-col';
    machineWrap.innerHTML = `
        <div class="vis-machine-card"
            style="${window.currentPhase !== 'ADJUST_MACHINE'
                ? 'opacity:0.6; cursor:not-allowed; pointer-events:none;'
                : ''}"
            onclick="${window.currentPhase === 'ADJUST_MACHINE'
                ? 'editMachine(0)'
                : 'return false;'}">

            <div class="vis-machine-header">
                <div class="vis-machine-icon">⚙️</div>
                <div class="vis-machine-title">
                    ${machine?.name || 'IV-kone'}
                </div>
            </div>

            <div style="font-size:12px; padding:6px 0;">
                Ilmavirta: ${machine?.flow ?? '-'}
            </div>

            <div style="font-size:10px; color:#aaa; text-transform:uppercase;">
                Tila: ${currentMode}
            </div>
        </div>
    `;
    container.appendChild(machineWrap);

    /* =====================================================
       2️⃣ EI POISTOKANAVIA
       ===================================================== */
    if (shafts.length === 0) {
        const info = document.createElement('div');
        info.style.cssText = 'color:#666; font-size:14px; padding:12px;';
        info.innerHTML =
            "Ei poistokanavia.<br>Luo 'Runkokanava' (esim. A-Rappu Poisto) nähdäksesi tornin.";
        container.appendChild(info);
        return;
    }

    /* =====================================================
       3️⃣ TORNIT + ASUNNOT (EI VENTTIILIKORTTEJA)
       ===================================================== */
    shafts.forEach(shaft => {

        const tower = document.createElement('div');
        tower.className = 'vis-tower';

        const head = document.createElement('div');
        head.className = 'vis-tower-head';
        head.textContent = shaft.name || 'Rappu';
        tower.appendChild(head);

        const pipe = document.createElement('div');
        pipe.className = 'vis-shaft-line';
        tower.appendChild(pipe);

        const floorsContainer = document.createElement('div');
        floorsContainer.className = 'vis-floors-container';

        // Ryhmittele venttiilit asunnoittain
        const shaftValves = valves.filter(v => String(v.parentDuctId) === String(shaft.id));
        const aptGroups = {};

        shaftValves.forEach(v => {
            const apt = v.apartment || 'Muu';
            if (!aptGroups[apt]) {
                aptGroups[apt] = {
                    flow: 0,
                    target: 0,
                    maxPa: 0,
                    avgPos: [],
                };
            }
            aptGroups[apt].flow += parseFloat(v.flow) || 0;
            aptGroups[apt].target += parseFloat(v.target) || 0;
            aptGroups[apt].maxPa = Math.max(
                aptGroups[apt].maxPa,
                parseFloat(v.measuredP) || 0
            );
            if (v.pos !== null && v.pos !== undefined) {
                aptGroups[apt].avgPos.push(parseFloat(v.pos));
            }
        });

        Object.entries(aptGroups).forEach(([apt, data]) => {

            const diff =
                data.target > 0
                    ? Math.abs(data.flow - data.target) / data.target
                    : null;

            let bg = '#f1f1f1';
            if (diff !== null) {
                if (diff < 0.10) bg = '#d6f5d6';
                else if (diff < 0.15) bg = '#fff3cd';
                else bg = '#fde2e1';
            }

            const avgPos = data.avgPos.length
                ? Math.round(data.avgPos.reduce((a, b) => a + b, 0) / data.avgPos.length)
                : '-';

            const box = document.createElement('div');
            box.className = 'vis-apt';
            box.style.background = bg;
            box.innerHTML = `
                <b>${apt}</b><br>
                ${data.flow.toFixed(1)} / ${data.target.toFixed(1)} l/s<br>
                ${data.maxPa || '-'} Pa<br>
                Av: ${avgPos} %
            `;

            box.onclick = () => {
                window.activeApartmentId = apt;
                window.activeVisMode = 'horizontal';
                renderVisualContent();
            };

            floorsContainer.appendChild(box);
        });

        tower.appendChild(floorsContainer);
        container.appendChild(tower);
    });
}

function getAdjustmentProgress(analysis) {
    if (!analysis || !analysis.valves) {
        return { done: 0, total: 0, percent: 0 };
    }

    let done = 0;
    let todo = 0;

    analysis.valves.forEach(v => {
        if (v.code === 'OK') {
            done++;
        } else if (
            v.code === 'ADJUST_OPEN' ||
            v.code === 'ADJUST_CHOKE'
        ) {
            todo++;
        }
        // INDEX, LIMIT_* jätetään huomiotta
    });

    const total = done + todo;
    const percent = total > 0
        ? Math.round((done / total) * 100)
        : 100;

    return { done, total, percent };
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
// --- TOIMINTO: Lukitse/Vapauta Indeksi ---
function toggleIndexLock(valveId, dir) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    if (!p.meta) p.meta = {};

    const key = (dir === 'supply') ? 'manualIndSup' : 'manualIndExt';
    
    // Jos klikataan samaa -> vapauta. Jos uutta -> vaihda.
    if (String(p.meta[key]) === String(valveId)) {
        p.meta[key] = null; 
    } else {
        p.meta[key] = valveId;
    }

    saveData();
    renderHorizontalMap(document.getElementById('visContent')); 
}
// --- UUSI VAAKANÄKYMÄ (KORJATTU NÄYTTÖ: Hz / Pa / %) ---
// NEW: Huonenäkymän logiikka

let activeRoomName = null; // Tallennetaan aktiivinen huone navigointia varten

// Pääfunktio huonenäkymän renderöintiin
// Pääfunktio huonenäkymän renderöintiin
// Pääfunktio huonenäkymän renderöintiin
// Pääfunktio huonenäkymän renderöintiin
function renderRoomView(roomNameIdentifier) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return '';

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);

    const valves = mm.valves || [];

    const filtered = valves.filter(v =>
        (v.room || '').toLowerCase() === (roomNameIdentifier || '').toLowerCase()
    );

    if (!filtered.length) {
        return '<div style="color:#888;">Ei venttiileitä tässä huoneessa.</div>';
    }

    return filtered.map(v => `
        <div class="room-valve-row">
            <b>${v.room || ''}</b> – ${v.type || ''}-${v.size || ''}
            (${v.flow ?? '-'} / ${v.target ?? '-'} l/s)
        </div>
    `).join('');
}

function lockReport() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    p.report = p.report || {};
    p.report.locked = true;
    p.report.lockedBy = p.meta?.measurer || '-';
    p.report.lockedAt = new Date().toISOString();

    renderDetailsList();
    showReportExcelStyle();
}
function unlockReport() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!confirm('Avataanko raportin lukitus muokkausta varten?')) return;

    p.report.locked = false;
    showReportExcelStyle();
}
function getDuctsForActiveMachine(project) {
    const machineId = window.uiState?.activeMachineId;
    if (!machineId) return [];

    const ducts = project.ducts || [];

    return ducts.filter(d =>
        !d.machineId || String(d.machineId) === String(machineId)
    );
}

function getValvesForActiveMachine(project) {
    const machineId = window.uiState?.activeMachineId;
    if (!machineId) return [];

    const valves = project.valves || [];

    return valves.filter(v =>
        !v.machineId || String(v.machineId) === String(machineId)
    );
}
function scrollToElement(el) {
    if (!el) return;
    el.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
    el.classList.add('highlight-scroll');
    setTimeout(() => el.classList.remove('highlight-scroll'), 1200);
}


// END NEW// === 2.6.9.5 HELPERS: Index limit check (MIN/MAX from valveDB) ===
function getValvePosBounds(typeKey) {
    try {
        const db = (typeof valveDB !== 'undefined') ? valveDB : (window.valveDB || null);
        const item = db && typeKey ? db[typeKey] : null;
        const data = item && Array.isArray(item.data) ? item.data : null;
        if (!data || data.length === 0) return null;

        // valveDB.data = [[pos, k], [pos, k]...]
        const positions = data.map(r => Number(r[0])).filter(n => Number.isFinite(n));
        if (positions.length === 0) return null;

        return { min: Math.min(...positions), max: Math.max(...positions) };
    } catch (e) {
        return null;
    }
}
window.lockIndexValve = function (valveId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || [];

    valves.forEach(v => {
        v.isIndex = String(v.id) === String(valveId);
    });

    window.uiState.indexLocked = true;
    window.uiState.indexValveId = valveId;

    saveData();
    renderVisualContent?.();
};

window.unlockIndexValve = function () {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || [];

    valves.forEach(v => {
        v.isIndex = false;
    });

    window.uiState.indexLocked = false;
    window.uiState.indexValveId = null;

    saveData();
    renderVisualContent?.();
};


function getValveLimitState(typeKey, pos) {
    const bounds = getValvePosBounds(typeKey);
    if (!bounds) return null;
    if (pos === null || pos === undefined || pos === '') return null;

    const p = Number(pos);
    if (!Number.isFinite(p)) return null;

    // pientä toleranssia, ettei esim. 9.999999 sekoile
    const eps = 1e-6;

    if (p <= bounds.min + eps) return 'MIN';
    if (p >= bounds.max - eps) return 'MAX';
    return null;
}
function lockIndexValve(valveId) {
    if (!valveId) return;

    window.uiState.indexValveId = valveId;
    window.uiState.indexLocked = true;

    // Renderöidään näkymä uudelleen, jotta lukko + suhteet näkyvät heti
    const container = document.getElementById('mapContainer');
    if (container) {
        renderHorizontalMap(container);
    }
}
function unlockIndexValve() {
    window.uiState.indexValveId = null;
    window.uiState.indexLocked = false;

    // Palataan analyysitilaan (ei indeksiä)
    const container = document.getElementById('mapContainer');
    if (container) {
        renderHorizontalMap(container);
    }
}
function renderMachineSelector(container) {
    if (!container) return;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p || !Array.isArray(p.machines)) return;

    ensureUiState();

    const machines = p.machines;
    const activeId = window.uiState.activeMachineId || machines[0]?.id;

    const buttons = machines.map(m => {
        const isActive = String(m.id) === String(activeId);
        return `
            <button
                class="machine-tab ${isActive ? 'active' : ''}"
                onclick="selectMachine('${escapeJsString(m.id)}')">
                ${escapeHtml(m.name || m.id)}
            </button>
        `;
    }).join('');

    container.innerHTML = `
        <div class="machine-selector" style="display:flex; gap:6px; align-items:center;">
            ${buttons}

            <button class="machine-tab add"
                onclick="addMachine()"
                title="Lisää uusi kone">
                ➕
            </button>

            <button class="machine-tab delete"
                onclick="deleteActiveMachine()"
                title="Poista aktiivinen kone">
                🗑️
            </button>
        </div>
    `;
}
function addMachine() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!Array.isArray(p.machines)) p.machines = [];

    const id = 'M_' + Date.now();

    const machine = {
        id,
        name: '',
        type: 'ahu',
        unit: 'pa',
        modes: {
            home:  { ducts: [], summary: {} },
            away:  { ducts: [], summary: {} },
            boost: { ducts: [], summary: {} }
        }
    };

    // 🔑 LISÄTÄÄN TYHJÄ KONE ENNEN MODAALIA
    p.machines.push(machine);

    window.uiState = window.uiState || {};
    window.uiState.activeMachineId = id;

    saveData?.();

    // avaa muokkaus tälle koneelle
    openEditMachineModal(machine);
}


function deleteActiveMachine() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p || !Array.isArray(p.machines)) return;

    if (p.machines.length <= 1) {
        alert('Projektissa täytyy olla vähintään yksi kone.');
        return;
    }

    ensureUiState();
    const id = window.uiState.activeMachineId;
    const machine = p.machines.find(m => m.id === id);
    if (!machine) return;

    const ok = confirm(
        `Poistetaanko kone "${machine.name || machine.id}"?\n\n` +
        `Kaikki sen venttiilit ja rungot poistuvat pysyvästi.`
    );

    if (!ok) return;

    p.machines = p.machines.filter(m => m.id !== id);

    // Vaihda seuraava aktiiviseksi
    window.uiState.activeMachineId = p.machines[0].id;

    saveData?.();
    renderDetailsList?.();
    renderVisualContent?.();
}



function renderHorizontalMap(container) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    ensureUiState();



    const mode = window.currentMode || 'home';

// 🔧 AKTIIVINEN KONE (AINOA TOTUUS)
const machine = getActiveMachine(p);
if (!machine) {
    container.innerHTML = '<div style="color:#777;">Ei konetta.</div>';
    return;
}

if (!machine.modes) machine.modes = {};
if (!machine.modes[mode]) {
    machine.modes[mode] = { ducts: [], valves: [] };
}

const allDucts   = machine.modes[mode].ducts;
const activeValves = machine.modes[mode].valves;




    /* ===============================
       NORMALISOI KONEEN ARVOT (KORJAUS)
       =============================== */

    const controlUnit = machine.unit || 'pct';
    const unitLabel =
        controlUnit === 'hz' ? 'Hz' :
        controlUnit === 'pa' ? 'Pa' :
        controlUnit === 'ls' ? 'l/s' :
        '%';

    // 🔴 TÄMÄ OLI VARSINAINEN VIKA – nyt kaikki projektiversiot tuettu
    const supSetting =
        machine?.supply?.setting ??
        machine?.supplyVal ??
        machine?.settingVal ??
        '';

    const supDesign =
        machine?.supply?.designFlow ??
        machine?.designFlowSup ??
        '';

    const extSetting =
        machine?.extract?.setting ??
        machine?.extractVal ??
        machine?.settingVal ??
        '';

    const extDesign =
        machine?.extract?.designFlow ??
        machine?.designFlowExt ??
        '';

    const mType = machine.type || 'ahu'; // ahu | supply_only | extract_only
    const showSupply = (mType === 'ahu' || mType === 'supply_only');
    const showExtract = (mType === 'ahu' || mType === 'extract_only');

    /* ===============================
       VENTTIILIT – YKSI TOTUUS
       =============================== */
    

    
    /* ===============================
       RUNKOKANAVAT
       =============================== */

    const supplyDucts = allDucts.filter(d => d.type === 'supply');
    const extractDucts = allDucts.filter(d => d.type === 'extract');

    /* ===============================
       TARKAT SÄÄTÖOHJEET
       =============================== */
    const buildDetailedInstruction = (v, res) => {
        if (!res || !res.code) return '';
        if (res.code === 'INDEX') return 'INDEKSI – älä säädä';
        if (res.code === 'OK') return 'OK';

        const dp = Number(v.measuredP);
        if (
            dp > 0 &&
            v.type &&
            typeof getPosFromK === 'function' &&
            Number(res.relativeTarget) > 0
        ) {
            const desiredK = Number(res.relativeTarget) / Math.sqrt(dp);
            const suggestPos = getPosFromK(v.type, desiredK);
            if (Number.isFinite(Number(suggestPos))) {
                const curPos = v.pos != null ? ` (nyt ${v.pos})` : '';
                return res.code === 'ADJUST_OPEN'
                    ? `AVAA asentoon ${suggestPos}${curPos} → ${res.relativeTarget.toFixed(1)} l/s @ ${dp} Pa`
                    : `KURISTA asentoon ${suggestPos}${curPos} → ${res.relativeTarget.toFixed(1)} l/s @ ${dp} Pa`;
            }
        }

        return res.code === 'ADJUST_OPEN'
            ? `AVAA → ${(res.relativeTarget || 0).toFixed(1)} l/s`
            : `KURISTA → ${(res.relativeTarget || 0).toFixed(1)} l/s`;
    };

/* ===============================
   PUTKILINJA
   =============================== */
console.log('RENDERLANE START');

const renderLane = (laneType, ducts, label) => {
    if (!ducts || !ducts.length) return '';

    // ✅ Fallback id-generaattori (jos genId ei ole käytettävissä)
    const makeId = () => (typeof genId === 'function')
        ? genId()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));

    // ⚠️ TÄRKEÄ: activeValves pitää olla peräisin koneelta: machine.modes[mode].valves
    

    // ✅ Pakota id:t venttiileille (viimeinen turvaverkko)
    // Tämä yksinään usein korjaa: "kaikki indekseinä" + "ei löydy id:llä"
    

    const analyses = {};
    let laneAnalysis = null;

    ducts.forEach(d => {
const dv = Array.isArray(d.valves) ? d.valves : [];
    // ✅ Varmista että rungon venttiileillä on id
    dv.forEach(v => {
        if (v.id == null || v.id === '') {
            v.id = makeId();
        }
    });

        // Ei venttiileitä tai analyysi puuttuu → ei analyysiä
        if (!dv.length || typeof analyzeTrunkRelative !== 'function') {
            analyses[d.id] = null;
            return;
        }

        // ✅ ÄLÄ tee analyysiä / indeksiä jos EI ole mittauksia
        const hasMeasurements = dv.some(v => {
            const f = Number(v.flow);
            const p = Number(v.measuredP);
            return (Number.isFinite(f) && f > 0) || (Number.isFinite(p) && p > 0);
        });

        if (!hasMeasurements) {
            analyses[d.id] = null;

            // ✅ DEMO / tyhjä data → varmista ettei indeksiä jää päälle
            dv.forEach(v => { v.isIndex = false; });

            return;
        }

        // 🔽 VASTA NYT analyysi
        const analysis = analyzeTrunkRelative(dv);

        // 🔹 Selvitetään indeksi-ID (YKSI totuus)
        let indexId = null;

        // 1) jos käyttäjä on manuaalisesti valinnut indeksin
        const storedIndex = dv.find(v => v.isIndex === true && v.id != null && v.id !== '');
        if (storedIndex) {
            indexId = storedIndex.id;
        }
        // 2) muuten ehdota indeksiventtiiliä
        else if (typeof suggestIndexValve === 'function') {
            const suggestion = suggestIndexValve(dv);
            indexId = suggestion?.primary?.id ?? null;
        }

        // ✅ Merkitse vain valittu indeksi (ei "kaikki indekseiksi")
        if (indexId && Array.isArray(analysis?.valves)) {
            analysis.valves = analysis.valves.map(vr => ({
                ...vr,
                isIndex: String(vr.id) === String(indexId)
            }));
        }

        analyses[d.id] = analysis;
    });

    // 🔑 Yhdistä analyysit (modaalia varten)
    window._lastAnalyses = {
        ...(window._lastAnalyses || {}),
        ...analyses
    };

    // Lane-tason badgeihin käytetään 1. rungon analyysiä
    laneAnalysis = analyses[ducts[0]?.id] || null;

    // ===============================
    // RUNKOBLOKIT (jokainen runko erikseen)
    // ===============================
    const trunkBlocks = ducts.map((d, trunkIndex) => {
const trunkValves = Array.isArray(d.valves) ? d.valves : [];

        const cards = trunkValves.map(v => {
            const res = analyses[v.parentDuctId]?.valves?.find(r => String(r.id) === String(v.id));

            const isIndex = res?.isIndex === true;
            const ratio = res?.ratio;

            let ratioText = '';
            let ratioClass = '';
            if (typeof ratio === 'number' && Number.isFinite(ratio)) {
                ratioText = ratio.toFixed(2);
                if (ratio < 0.90) ratioClass = 'ratio-low';
                else if (ratio > 1.10) ratioClass = 'ratio-high';
                else ratioClass = 'ratio-ok';
            }

            const advice = buildDetailedInstruction(v, res);

            // ✅ Klikkaus vain jos id on varmasti olemassa
            const safeId = (v.id != null && v.id !== '') ? String(v.id) : '';
            const onClickAttr = safeId
                ? `onclick="openValveById('${escapeJsString(safeId)}')"`
                : ''; // jos tästä tulee tyhjä, huomaat heti datassa puutteen

            return `
                <div class="map-valve ${isIndex ? 'index' : ''} ${ratioClass} clickable"
                     ${onClickAttr}>

                    ${isIndex ? `
                        <div class="map-index-flag">
                            🔒 INDEKSI
                        </div>
                    ` : ''}

                    <div class="map-valve-top">
                        <div class="map-room">${escapeHtml(v.room || '-')}</div>
                    </div>

                    <div class="map-metrics">
                        <span class="m">${(Number(v.flow) || 0).toFixed(1)} l/s</span>
                        <span class="m">Av ${v.pos ?? '-'}</span>
                        <span class="m">${v.measuredP ?? '-'} Pa</span>
                        <span class="m">K ${v.kWorking ?? '-'}</span>

                    </div>

                    ${ratioText ? `<div class="map-ratio ${ratioClass}">${ratioText}</div>` : ''}
                    ${advice ? `<div class="map-advice">${escapeHtml(advice)}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="trunk-block ${trunkIndex % 2 === 0 ? 'trunk-even' : 'trunk-odd'}">
                <div class="trunk-title">
                    ${escapeHtml(d.name || `Runko ${trunkIndex + 1}`)}
                </div>

                <div class="map-valves-row">
                    ${cards || `<div class="map-empty">Ei venttiileitä</div>`}
                </div>
            </div>
        `;
    }).join('');

    // ✅ Tulostetaan lane
    return `
        <div class="map-lane ${laneType}">
            <div class="map-pipe ${laneType}">
                <div class="map-lane-label">
                    <span class="tag">${label}</span>

                    ${laneAnalysis?.trunkReady ? `
                        <span class="lane-ready" title="Kaikki venttiilit ±10 % tavoitevirrasta">
                            🟢 Valmis
                        </span>
                    ` : ''}

                    ${laneAnalysis?.falseIndex ? `
                        <span class="lane-warning" title="Mahdollinen false-indeksi: ${laneAnalysis.falseIndex.reason}">
                            ⚠️ tarkista indeksi
                        </span>
                    ` : ''}

                    <span class="ducts">
                        ${ducts.map(dd => escapeHtml(dd.name || 'Runko')).join(' • ')}
                    </span>
                </div>

                <div class="map-lane-trunks">
                    ${trunkBlocks || `<div class="map-empty">Ei runkoja</div>`}
                </div>
            </div>
        </div>
    `;
};



    /* ===============================
       VISUAALINEN KONE
       =============================== */
    const machineHtml = `
        <div class="map-machine" onclick="openEditMachineModal('${escapeJsString(machine.id)}')">
            <div class="map-machine-header">
                <div class="map-machine-icon">⚙️</div>
                <div>
                    <div class="map-machine-name">${escapeHtml(machine.name || machine.id)}</div>
                    <div class="map-machine-mode">${escapeHtml(mode)}</div>
                </div>
            </div>

            <div class="map-machine-meta">
    <span class="map-machine-chip">
        Säätö: ${controlUnit.toUpperCase()} (${unitLabel})
    </span>

    ${showSupply ? (
        `<div><b>Tulo</b>: ${supSetting || '-'} ${unitLabel}` +
        (supDesign ? ` • ${supDesign} l/s` : '') +
        `</div>`
    ) : ''}

    ${showExtract ? (
        `<div><b>Poisto</b>: ${extSetting || '-'} ${unitLabel}` +
        (extDesign ? ` • ${extDesign} l/s` : '') +
        `</div>`
    ) : ''}
</div>


            ${showSupply ? `<div class="machine-port supply"></div>` : ''}
            ${showExtract ? `<div class="machine-port extract"></div>` : ''}
        </div>
    `;

    /* ===============================
       KOKO NÄKYMÄ
       =============================== */
    container.innerHTML = `
        <div class="map-wow">
            <div class="map-machine-col">
                ${machineHtml}
            </div>
            <div class="map-area">
                ${showSupply ? renderLane('supply', supplyDucts, 'TULO') : ''}
                ${showExtract ? renderLane('extract', extractDucts, 'POISTO') : ''}
            </div>
        </div>
    `;
}


// --- TOIMINTO: Siirrä venttiiliä sivusuunnassa ---
function moveValve(valveId, delta) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const v = p.valves.find(x => x.id === valveId);
    if (!v) return;

    const prevPos = v.pos;

    // 🔧 varsinainen säätö (olettaa että tämä on jo sinulla)
    v.pos = Math.max(0, Math.min(100, (v.pos || 0) + delta));

    // 🕘 tallenna historia
    window._valveHistory[valveId] = {
        prev: prevPos,
        curr: v.pos,
        delta: v.pos - prevPos
    };

    renderVisualContent();
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
                    if(val){ d.name = val; saveData();
 }
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
                
                function getValveLockReason(v, analysis) {
                    if (!analysis) return 'Analyysi puuttuu';
                
                    // Väärä vaihe
                    if (window.currentPhase !== 'ADJUST_VALVES') {
                        return 'Säätö ei ole aktiivinen';
                    }
                
                    // Indeksiventtiiliä ei säädetä
                    const res = analysis.valves?.find(r => String(r.id) === String(v.id));
                    if (res?.isIndex) {
                        return 'Indeksiventtiiliä ei säädetä';
                    }
                
                    // Ei säätötarvetta
                    if (res?.code === 'OK') {
                        return 'Venttiili on jo tasapainossa';
                    }
                
                    // Fyysinen raja
                    if (res?.code === 'LIMIT_MIN') {
                        return 'Venttiili minimissä';
                    }
                    if (res?.code === 'LIMIT_MAX') {
                        return 'Venttiili maksimissa';
                    }
                
                    // Puuttuvat tiedot
                    if (!v.target || v.target <= 0) {
                        return 'Tavoitevirtaus puuttuu';
                    }
                    if (!v.flow || v.flow <= 0) {
                        return 'Mitattu virtaus puuttuu';
                    }
                
                    return null; // ei lukitusta
                }
                
                function getSuggestedKForValve(v) {
                    if (!v || !v.type || v.pos == null) return null;
                
                    const pos = parseFloat(v.pos);
                    if (isNaN(pos)) return null;
                
                    /* 1️⃣ Käyttäjän oma K-tietokanta (ensisijainen) */
                    const userKDB = JSON.parse(localStorage.getItem('userKDB') || '[]');
                
                    const userMatch = userKDB.find(x =>
                        x.type === v.type &&
                        Math.abs(x.pos - pos) <= 0.01
                    );
                
                    if (userMatch) {
                        return {
                            k: userMatch.k,
                            source: 'user'
                        };
                    }
                
                    /* 2️⃣ Ohjelman sisäinen data (toissijainen) */
                    if (typeof getK === 'function') {
                        const k = getK(v.type, pos);
                        if (typeof k === 'number' && !isNaN(k) && k > 0) {
                            return {
                                k,
                                source: 'internal'
                            };
                        }
                    }
                
                    return null;
                }





function closeKLibraryPicker() {
    const ov = document.getElementById('k-picker-overlay');
    if (ov) ov.style.display = 'none';
}


function deleteUserKEntry(key, idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p || !p.kLibrary[key]) return;

    const ok = confirm('Poistetaanko tämä K-arvo?');
    if (!ok) return;

    p.kLibrary[key].splice(idx, 1);

    if (p.kLibrary[key].length === 0) {
        delete p.kLibrary[key];
    }

    openKLibraryModal(); // päivitä näkymä
}








function closeKValveDetailModal() {
    const ov = document.getElementById('k-valve-overlay');
    if (ov) ov.style.display = 'none';
}

/** Pieni apu: HTML-escape jotta malli/huom eivät riko UI:ta */
function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}



function closeEditK() {
    const ov = document.getElementById('k-edit-overlay');
    if (ov) ov.style.display = 'none';
}




function closeKCategory() {
    const ov = document.getElementById('k-cat-overlay');
    if (ov) ov.style.display = 'none';
}


                function updateSuggestedKInModal(idx) {
                    const p = projects.find(x => x.id === activeProjectId);
                    if (!p) return;
                
                    const mode = window.currentMode || 'home';
                    const valves = p.modes?.[mode]?.valves || [];
                    const v = valves[idx];
                    if (!v) return;
                
                    const kInput = document.getElementById('valve-k');
                    const kInfo  = document.getElementById('k-source-text');
                    const kWarn  = document.getElementById('k-lock-warning');
                
                    if (!kInput || !kInfo) return;
                
                    // 🔒 1. HYVÄKSYTTY K → EI MUUTETA
                    if (typeof v.kApproved === 'number') {
                        kInput.value = v.kApproved.toFixed(2);
                        kInput.disabled = true;
                
                        kInfo.innerHTML = '🔒 Hyväksytty K (lukittu)';
                
                        if (kWarn) {
                            kWarn.style.display = 'block';
                            kWarn.innerHTML =
                                '🔒 Tämä K-arvo on hyväksytty.<br>' +
                                'Mittausten muutokset eivät vaikuta siihen ennen lukituksen avaamista.';
                        }
                        return;
                    }
                
                    // 🔓 Ei lukittu
                    kInput.disabled = false;
                    if (kWarn) kWarn.style.display = 'none';
                
                    const opening = v.pos;
                    const valveType = v.type;
                
                    if (!valveType || opening === null || opening === undefined) {
                        kInfo.innerHTML = '⚠️ Valitse venttiili ja anna avaus';
                        return;
                    }
                
                    // 📚 2. OMA K-KIRJASTO (SUORA)
                    if (typeof getUserKForValve === 'function') {
                        const userK = getUserKForValve(valveType, opening);
                        if (userK && typeof userK.k === 'number') {
                            kInput.value = userK.k.toFixed(2);
                            v.kWorking = userK.k;
                
                            kInfo.innerHTML =
                                `📚 Oma K-kirjasto (avaus ${userK.opening})` +
                                (userK.note ? `<br><i>${userK.note}</i>` : '');
                            return;
                        }
                    }
                
                    // 📐 3. OMAN K-KIRJASTON VÄLIARVO
                    if (typeof getUserKListForValve === 'function') {
                        const list = getUserKListForValve(valveType);
                        const interp = getInterpolatedUserK(list, opening);
                        if (typeof interp === 'number') {
                            kInput.value = interp.toFixed(2);
                            v.kWorking = interp;
                            kInfo.innerHTML = '📐 Väliarvo omasta K-kirjastosta';
                            return;
                        }
                    }
                
                    // 🏭 4. VALMISTAJA (valveDB)
                    if (typeof getK === 'function') {
                        const kFromDb = getK(valveType, opening);
                        if (typeof kFromDb === 'number' && kFromDb > 0) {
                            kInput.value = kFromDb.toFixed(2);
                            v.kWorking = kFromDb;
                            kInfo.innerHTML = '🏭 Valmistajan arvo (laskettu)';
                            return;
                        }
                    }
                
                    // ✍️ 5. EI LÄHDETTÄ
                    kInfo.innerHTML = '✍️ Syötä K-arvo käsin';
                }
                function commitValveChanges(valve, options = {}) {
    if (!valve) {
        console.warn('commitValveChanges: venttiili puuttuu', valve);
        return;
    }

    const {
        projectId = activeProjectId,
        mode = window.currentMode || 'home',
        triggerRender = true,
        triggerSave = true
    } = options;

    const p = projects.find(x => x.id === projectId);
    if (!p) {
        console.warn('commitValveChanges: projektia ei löydy', projectId);
        return;
    }

    const machine = getActiveMachine(p);
    if (!machine) {
        console.warn('commitValveChanges: aktiivista konetta ei löydy');
        return;
    }

    if (!machine.modes) machine.modes = {};
    if (!machine.modes[mode]) machine.modes[mode] = { ducts: [], fans: [] };

    const mm = machine.modes[mode];
    if (!Array.isArray(mm.ducts)) mm.ducts = [];

    // ✅ varmista rungot
    mm.ducts.forEach(d => {
        if (!Array.isArray(d.valves)) d.valves = [];
    });

    // ✅ varmista ID
    if (!valve.id) {
        valve.id = Date.now();
    }

    // 🔴 parentDuctId on PAKOLLINEN
    if (!valve.parentDuctId) {
        console.warn('commitValveChanges: parentDuctId puuttuu', valve);
        return;
    }

    const duct = mm.ducts.find(d => String(d.id) === String(valve.parentDuctId));
    if (!duct) {
        console.warn('commitValveChanges: runkoa ei löydy', valve.parentDuctId);
        return;
    }

    // ✅ lisää tai päivitä venttiili VAIN rungon alle
    const idx = duct.valves.findIndex(v => String(v.id) === String(valve.id));
    if (idx === -1) {
        duct.valves.push(valve);
    } else {
        duct.valves[idx] = valve;
    }

    // ✅ vain yksi indeksiventtiili per runko
    if (valve.isIndex === true) {
        duct.valves.forEach(v => {
            if (String(v.id) !== String(valve.id)) {
                v.isIndex = false;
            }
        });
    }

    if (triggerSave && typeof saveData === 'function') {
        saveData();
    }

    if (triggerRender) {
        if (typeof renderDetailsList === 'function') renderDetailsList();
        if (typeof renderVisualContent === 'function') renderVisualContent();
    }
}


                function getValveById(id, options = {}) {
    const {
        projectId = activeProjectId,
        mode = window.currentMode || 'home',
        strict = true
    } = options;

    if (id == null) {
        if (strict) console.warn('getValveById: id puuttuu');
        return null;
    }

    const p = projects.find(x => x.id === projectId);
    if (!p) {
        if (strict) console.warn('getValveById: projektia ei löydy', projectId);
        return null;
    }

    const machine = getActiveMachine(p);
    if (!machine) {
        if (strict) console.warn('getValveById: aktiivista konetta ei löydy');
        return null;
    }

    const mm = machine.modes?.[mode];
    if (!mm || !Array.isArray(mm.valves)) {
        if (strict) console.warn('getValveById: koneella ei ole venttiilejä', machine.id, mode);
        return null;
    }

    const valve = mm.valves.find(v => String(v.id) === String(id));
    if (!valve && strict) {
        console.warn('getValveById: venttiiliä ei löydy id:llä', id);
    }

    return valve || null;
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
// 🔹 Reaaliaikainen virtauslaskenta venttiilimodaalissa (EI tallenna)
function updateValveModalFlow(valveId) {
    const v = getValveById(valveId, { strict: false });
    if (!v) return;

    // Modaali käyttää näitä id:itä
    const posEl  = document.getElementById('valve-pos');
    const paEl   = document.getElementById('valve-pa');
    const sizeEl = document.getElementById('valve-size');
    const kEl    = document.getElementById('valve-k');
    const flowEl = document.getElementById('valve-flow');

    if (!flowEl) return;

    const pos = parseFloat(posEl?.value);
    const p   = parseFloat(paEl?.value);
    const type = sizeEl?.value || '';
    const kManual = parseFloat(kEl?.value);

    // Jos paine tai tyyppi puuttuu → nollaa virtaus
    if (!Number.isFinite(p) || !type) {
        v.flow = 0;
        flowEl.value = '';
        return;
    }

    // K-arvo: ensin käsin annettu, muuten kirjastosta
    const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
    const k = Number.isFinite(kManual)
        ? kManual
        : kFunc(type, Number.isFinite(pos) ? pos : 0);

    if (!Number.isFinite(k) || k <= 0) {
        v.flow = 0;
        flowEl.value = '';
        return;
    }

    const flow = k * Math.sqrt(Math.max(0, p));

    // ✅ TALLENNA DATAAN
    v.flow = Number.isFinite(flow) ? flow : 0;

    // ✅ NÄYTÄ MODAALISSA
    flowEl.value = Number.isFinite(flow) ? flow.toFixed(1) : '';
}


                // Klikkiapufunktiot
                function editValve(idx) {
                    openValvePanel(idx);
                }
                function normalizeValveSize(sizeId) {
    if (!sizeId) return '';

    // Esim: "h_kso125" → "KSO-125"
    const m = sizeId.match(/([a-z]+)(\d+)/i);
    if (!m) return sizeId;

    return m[1].toUpperCase() + '-' + m[2];
}

function showInlineNotice(row, text) {
    let note = row.querySelector('.inline-notice');
    if (!note) {
        note = document.createElement('div');
        note.className = 'inline-notice';
        note.style.fontSize = '12px';
        note.style.color = '#b26a00';
        note.style.marginTop = '2px';
        row.lastElementChild.appendChild(note);
    }
    note.textContent = text;

    clearTimeout(note._t);
    note._t = setTimeout(() => {
        note.textContent = '';
    }, 4000);
}
function findValveById(id) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return null;
    const m = getActiveMachine(p);
    if (!m) return null;

    const mode = window.currentMode || 'home';
    const ducts = m.modes?.[mode]?.ducts || [];
    for (const d of ducts) {
        for (const v of d.valves || []) {
            if (String(v.id) === String(id)) return v;
        }
    }
    return null;
}

function refreshMeasurementList() {
    renderActiveProject();
}

function openUnlockKConfirm(valveId) {
    const v = findValveById(valveId);
    if (!v) return;

    if (!confirm('Poistetaanko K-arvon lukitus?')) return;

    unapproveKForValve(v);
    refreshMeasurementList();
}


function openValveById(valveId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) {
        console.warn('openValveById: ei aktiivista projektia');
        return;
    }

    const machine = getActiveMachine(p);
    if (!machine) {
        console.warn('openValveById: ei aktiivista konetta');
        return;
    }

    const mode = window.currentMode || 'home';

    // 1️⃣ ENSISIJAINEN: uusi duct-rakenne
    const mm = machine.modes?.[mode];
    if (mm?.ducts) {
        for (const d of mm.ducts) {
            const v = (d.valves || []).find(x => String(x.id) === String(valveId));
            if (v) {
                openValvePanel(v.id);
                return;
            }
        }
    }

    // 2️⃣ FALLBACK: legacy machine.valves (kartta)
    if (Array.isArray(machine.valves)) {
        const v = machine.valves.find(x => String(x.id) === String(valveId));
        if (v) {
            console.warn('openValveById: legacy valve used, migrating', valveId);

            // 👉 TÄSSÄ VAIHEESSA EI MIGROIDA AUTOMAATTISESTI
            // Avataan vain modaali, ettei työ katkea
            openValvePanel(v.id);
            return;
        }
    }

    console.warn('openValveById: venttiiliä ei löydy mistään', valveId);
}


function openValvePanel(idx = null, options = {}) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!window._lastAnalyses) {
        const container = document.getElementById('visContent') || document.getElementById('mapContainer');
        if (container && typeof renderHorizontalMap === 'function') {
            renderHorizontalMap(container);
        }
    }

    const mode = window.currentMode || 'home';
    const machine = getActiveMachine(p);
    if (!machine) return;

    if (!machine.modes) machine.modes = {};
    if (!machine.modes[mode]) machine.modes[mode] = { ducts: [] };

    const mm = machine.modes[mode];
    if (!Array.isArray(mm.ducts)) mm.ducts = [];
    const ducts = mm.ducts;

    let v = null;
    let parentDuct = null;
    let isNew = false;

    if (typeof idx === 'string' || typeof idx === 'number') {
        for (const d of ducts) {
            const found = (d.valves || []).find(x => String(x.id) === String(idx));
            if (found) {
                v = found;
                parentDuct = d;
                break;
            }
        }
    }

    if (!v) {
        isNew = true;
        let parentDuctId = options.parentDuctId || '';
        if (!parentDuctId && ducts.length) parentDuctId = ducts[0].id;

        v = {
            id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
            room: '',
            parentDuctId,
            type: '',
            flowType: '',
            pos: null,
            measuredP: null,
            kWorking: null,
            kApproved: null,
            flow: null,
            target: null,
            isIndex: false
        };

     parentDuct = ducts.find(d => String(d.id) === String(v.parentDuctId));
if (!parentDuct) {

    const create = confirm(
        'Projektissa ei ole vielä runkoa.\n\n' +
        'Haluatko luoda rungon nyt, jotta venttiili voidaan lisätä?'
    );

    if (!create) {
        // ❌ käyttäjä peruutti oikeasti
        return;
    }

    const supply = confirm(
        'Valitse rungon tyyppi:\n\n' +
        'OK = Luo TULOILMAN runko\n' +
        'Peruuta = Luo POISTOILMAN runko'
    );

    parentDuct = {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        name: supply ? 'Tulo – päärunko' : 'Poisto – päärunko',
        type: supply ? 'supply' : 'extract',
        valves: []
    };

    ducts.push(parentDuct);

    v.parentDuctId = parentDuct.id;
    v.flowType = parentDuct.type;
}



        if (!Array.isArray(parentDuct.valves)) parentDuct.valves = [];
        parentDuct.valves.push(v);
    }

    if (!v) return;
    window._lastOpenedValveId = v.id;

    if (!v.flowType && v.parentDuctId) {
        const d = ducts.find(x => String(x.id) === String(v.parentDuctId));
        v.flowType = d?.type || '';
    }

    if (!valveGroups || !Object.keys(valveGroups).length) {
        initValveSelectors?.();
    }

    let ov = document.getElementById('valve-modal-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'valve-modal-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    const currentSizeId = v.type || '';
    const currentModel = valveIdToModelId?.[currentSizeId] || '';

    const modelOptions =
        `<option value="">– valitse –</option>` +
        Object.keys(valveGroups).sort().map(m =>
            `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`
        ).join('');

    ov.innerHTML = `
        <div class="modal">
            <div class="modal-header">${isNew ? '➕ Lisää venttiili' : '✏️ Muokkaa venttiiliä'}</div>
            <div class="modal-content">
                <label>K-arvo
                    <input id="valve-k" type="number" step="0.01" value="${v.kWorking ?? ''}">
                    <div id="k-hint" style="font-size:11px;margin-top:3px;"></div>
                </label>
                <label>Malli <select id="valve-model">${modelOptions}</select></label>
                <label>Koko <select id="valve-size"><option value="">– koko –</option></select></label>
                <label>Avaus <input id="valve-pos" type="number" step="0.5" value="${v.pos ?? ''}"></label>
            </div>
        </div>
    `;

    ov.style.display = 'flex';

    const modelEl = document.getElementById('valve-model');
    const sizeEl  = document.getElementById('valve-size');
    const posEl   = document.getElementById('valve-pos');
    const kEl     = document.getElementById('valve-k');
    const kBadgeEl = document.getElementById('k-hint');

    let kManuallyEdited = false;
    let lastKContextKey = null;

    function setKBadge(type) {
        if (!kBadgeEl) return;
        if (type === 'manual') { kBadgeEl.textContent = '🔒 Manuaalinen K'; }
        else if (type === 'library') { kBadgeEl.textContent = '📚 K kirjastosta'; }
        else if (type === 'missing') { kBadgeEl.textContent = '⚠️ K-arvo puuttuu'; }
        else { kBadgeEl.textContent = ''; }
    }

    function tryAutoFillK() {
        const model = modelEl.value;
        const size  = normalizeValveSize(sizeEl.value);
        const pos   = String(posEl.value);

        const ctxKey = `${model}|${size}|${pos}`;

        if (kManuallyEdited && ctxKey === lastKContextKey) {
            setKBadge('manual');
            return;
        }

        if (kManuallyEdited && ctxKey !== lastKContextKey) {
            kManuallyEdited = false;
            kEl.value = '';
        }

        lastKContextKey = ctxKey;

        const res = resolveKForValveContext({
            kind: v.flowType,
            model,
            size,
            variant: '',
            pos
        });

        if (!res) {
            kEl.value = '';
            setKBadge('missing');
            return;
        }

        kEl.value = res.k;
        setKBadge('library');
    }

    kEl.addEventListener('input', () => {
        kManuallyEdited = true;
        lastKContextKey = `${modelEl.value}|${normalizeValveSize(sizeEl.value)}|${posEl.value}`;
        setKBadge('manual');
    });

    modelEl.onchange = tryAutoFillK;
    sizeEl.onchange  = tryAutoFillK;
    posEl.oninput    = tryAutoFillK;

    setTimeout(tryAutoFillK, 0);
}

               
                
function buildValveId({ type, model, size }) {
    return [
        String(type || '').toLowerCase(),
        String(model || '').trim().toUpperCase(),
        Number(size)
    ].join('::');
}


function updateWorkflowHint(p) {
    const el = document.getElementById('workflowHint');
    if (!el || !p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves || [];

    if (valves.length === 0) {
        el.innerText = '➕ Lisää ensimmäinen venttiili';
        return;
    }

    const noDuct = valves.find(v => !v.parentDuctId);
    if (noDuct) {
        el.innerText = '📌 Valitse venttiileille runkokanava';
        return;
    }

    const noK = valves.find(v => !v.kWorking);
    if (noK) {
        el.innerText = '📚 Syötä tai hae K-arvot venttiileille';
        return;
    }

    const noTarget = valves.find(v => !v.target);
    if (noTarget) {
        el.innerText = '🎯 Syötä tavoitevirrat';
        return;
    }

    el.innerText = '⚖️ Valmis suhteelliseen säätöön';
}


// --- A3.3: Tallennus venttiilimodalista (working K, EI hyväksyntää) ---
// --- A3.3: Tallennus venttiilimodalista (working K, EI hyväksyntää) ---
function saveValveFromModal(idx) {

    // varmista että viimeisin input commitataan
    document.activeElement?.blur?.();

    const getVal = id => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    // 🔹 Reititetään KAIKKI muutokset updateValveInlineen
    updateValveInline(idx, 'room',      getVal(`valve-room-${idx}`));
    updateValveInline(idx, 'type',      getVal(`valve-size-${idx}`));
    updateValveInline(idx, 'parentDuctId', getVal('parentDuctId'));

    updateValveInline(idx, 'pos',        getVal(`valve-pos-${idx}`));
    updateValveInline(idx, 'measuredP',  getVal(`valve-pa-${idx}`));
    updateValveInline(idx, 'flow',       getVal(`valve-flow-${idx}`));
    updateValveInline(idx, 'target',     getVal(`valve-target-${idx}`));
    updateValveInline(idx, 'kWorking',   getVal(`valve-k-${idx}`));

    // 🔹 Nyt validointi ajetaan OIKEAA dataa vasten
    if (typeof updateValveModalValidation === 'function') {
        updateValveModalValidation(idx);
    }

    // 🔹 Tallennus + näkymät
    saveData();

    if (typeof renderVisualContent === 'function') {
        renderVisualContent();
    }

    const map = document.getElementById('mapContainer');
    if (map && typeof renderHorizontalMap === 'function') {
        renderHorizontalMap(map);
    }
}



// ===============================
// Peruuta / Sulje / Takaisin -napit punaisiksi
// ===============================
function applyCancelButtonStyles(root = document) {
    const buttons = root.querySelectorAll('button');

    buttons.forEach(btn => {
        const text = btn.textContent.trim().toLowerCase();

        if (text === 'peruuta' || text === 'sulje' || text === 'takaisin') {
            btn.style.backgroundColor = '#c62828';
            btn.style.color = '#fff';
            btn.style.border = 'none';
        }
    });
}

function closeValvePanel() {
    const ov = document.getElementById('valve-modal-overlay');
    if (ov) {
        ov.style.display = 'none';
    }
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
// --- LISÄÄ VENTTIILI (KORJATTU: ESIVALINTA) ---
function showAddValve(flowType = null) {
    openValvePanel(null, {
        flowType: flowType // 'supply' | 'extract' | null
    });

    applyButtonStyles(document.getElementById('view-measure'));
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

// Täyttää mittausnäkymän runkovalinnan
// --- KONEEN LOGIIKKA (KORJATTU JA SIIVOTTU) ---
function openEditMachineModal(machineId = null) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    if (!Array.isArray(p.machines)) p.machines = [];

    let machine = null;
    let isNew = false;

    if (machineId) {
        machine = p.machines.find(m => String(m.id) === String(machineId));
    }

    if (!machine) {
        isNew = true;

        const nextNum = p.machines.length + 1;
        const newId = `TK${String(nextNum).padStart(2, '0')}`;

        machine = {
            id: newId,
            name: '',
            type: 'ahu',
            unit: 'hz',
            supply: { setting: '', designFlow: '' },
            extract: { setting: '', designFlow: '' }
        };
    }



    const originalType = machine.type;

    let ov = document.getElementById('machine-edit-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'machine-edit-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    ov.innerHTML = `
        <div class="modal" style="max-width:520px;">
            <div class="modal-header">⚙️ Koneen asetukset</div>

            <div class="modal-content">

                <label class="form-label">Koneen nimi</label>
                <input class="form-input" id="m-name" value="${machine.name || ''}" placeholder="Esim. TK01 / Huippuimuri">

                <label class="form-label">Koneen tyyppi</label>
                <select class="form-input" id="m-type">
                    <option value="ahu" ${machine.type === 'ahu' ? 'selected' : ''}>Tulo + Poisto</option>
                    <option value="supply_only" ${machine.type === 'supply_only' ? 'selected' : ''}>Vain tulo</option>
                    <option value="extract_only" ${machine.type === 'extract_only' ? 'selected' : ''}>Vain poisto (huippuimuri)</option>
                </select>

                <div id="machineTypeInfo" style="display:none; margin:8px 0; padding:8px; border-radius:6px; background:#e3f2fd; color:#0d47a1; font-size:12px;">
                    ℹ️ Koneen tyyppi muuttui. Venttiilit ja mittaukset säilyvät.
                </div>

                <label class="form-label">Säätötapa</label>
<select class="form-input" id="m-unit">
    <option value="hz"  ${machine.unit === 'hz'  ? 'selected' : ''}>Hz</option>
    <option value="pa"  ${machine.unit === 'pa'  ? 'selected' : ''}>Pa</option>
    <option value="pct" ${machine.unit === 'pct' ? 'selected' : ''}>%</option>
    <option value="ls"  ${machine.unit === 'ls'  ? 'selected' : ''}>l/s</option>
</select>



                <div id="supplyFields">
                    <label class="form-label">Tulo – nykyinen asetus</label>
                    <input class="form-input" id="m-sup-setting" value="${machine.supply?.setting ?? ''}">
                    <label class="form-label">Tulo – suunnitteluvirta (l/s)</label>
                    <input class="form-input" id="m-sup-design" value="${machine.supply?.designFlow ?? ''}">
                </div>

                <div id="extractFields">
                    <label class="form-label">Poisto – nykyinen asetus</label>
                    <input class="form-input" id="m-ext-setting" value="${machine.extract?.setting ?? ''}">
                    <label class="form-label">Poisto – suunnitteluvirta (l/s)</label>
                    <input class="form-input" id="m-ext-design" value="${machine.extract?.designFlow ?? ''}">
                </div>

            </div>

            <div class="modal-actions">
                <button class="btn btn-primary" onclick="saveMachine()">💾 Tallenna</button>
                <button class="btn btn-cancel" onclick="closeMachineModal()">❌ Sulje</button>
            </div>
        </div>
    `;

    function updateVisibility() {
        const t = document.getElementById('m-type').value;
        document.getElementById('supplyFields').style.display =
            (t === 'ahu' || t === 'supply_only') ? 'block' : 'none';
        document.getElementById('extractFields').style.display =
            (t === 'ahu' || t === 'extract_only') ? 'block' : 'none';
    }

    document.getElementById('m-type').addEventListener('change', () => {
        updateVisibility();
        if (document.getElementById('m-type').value !== originalType) {
            document.getElementById('machineTypeInfo').style.display = 'block';
        }
    });

    updateVisibility();

    window.saveMachine = function () {
        machine.name = document.getElementById('m-name').value.trim();
        machine.type = document.getElementById('m-type').value;
machine.unit = document.getElementById('m-unit').value;

        machine.supply.setting = document.getElementById('m-sup-setting')?.value ?? '';
        machine.supply.designFlow = document.getElementById('m-sup-design')?.value ?? '';
        machine.extract.setting = document.getElementById('m-ext-setting')?.value ?? '';
        machine.extract.designFlow = document.getElementById('m-ext-design')?.value ?? '';


 const list = p.machines;
const idx = list.findIndex(m => String(m.id) === String(machine.id));

// 🔑 kone on jo lisätty addMachine():ssa
if (idx !== -1) {
    list[idx] = machine;
}



        window.uiState = window.uiState || {};
window.uiState.activeMachineId = machine.id;

// 🔴 uusi kone → indeksi nollataan
window.uiState.indexValveId = null;
window.uiState.indexLocked = false;


        saveData?.();
        closeMachineModal();
        renderVisualContent?.();
        renderDetailsList?.();
    };

    window.closeMachineModal = function () {
        ov.style.display = 'none';
    };

    ov.style.display = 'flex';
}


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
/// --- LASKE VAIN KONEEN ASETUKSET (SÄILYTÄ MANUAALISET TAVOITTEET) ---
function calculateOtherModes() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // 1. Haetaan KOTONA-tilan data (Referenssi)
    const homeMode = p.modes['home'];
    const homeMachine = (homeMode.machines || []).find(m => m.type === 'ahu');
    
    if (!homeMachine) {
        alert("Virhe: Kotona-tilan konetta ei ole määritelty.");
        return;
    }

    // Erotellaan tulo ja poisto
    const ducts = p.ducts || [];
    const isSup = (v) => {
        const d = ducts.find(x => x.id === v.parentDuctId);
        if (d && d.type === 'supply') return true;
        if (d && d.type === 'extract') return false;
        return (v.type || '').toLowerCase().includes('tulo');
    };

    const homeValves = homeMode.valves || [];
    
    // Haetaan KOTONA-tilan MITATUT arvot (Tämä on se mitä kone oikeasti tuottaa nyt)
    const homeMeasSup = homeValves.filter(v => isSup(v)).reduce((a,b) => a + (parseFloat(b.flow)||0), 0);
    const homeMeasExt = homeValves.filter(v => !isSup(v)).reduce((a,b) => a + (parseFloat(b.flow)||0), 0);

    if (homeMeasSup === 0 && homeMeasExt === 0) {
        alert("Virhe: Kotona-tilan mittauksia ei löydy (yhteensä 0 l/s). Mittaa ensin!");
        return;
    }

    // Haetaan koneen nykyasetukset (Kotona)
    const setSup = parseFloat(homeMachine.supplyVal) || parseFloat(homeMachine.settingVal) || 0;
    const setExt = parseFloat(homeMachine.extractVal) || parseFloat(homeMachine.settingVal) || 0;
    const unit = homeMachine.unit || 'pct';

    // 2. Käydään läpi muut tilat (Away, Boost)
    let logMsg = "Laskettu uudet koneasetukset:\n";

    ['away', 'boost'].forEach(mode => {
        // Varmistetaan rakenne
        if (!p.modes[mode]) p.modes[mode] = { machines: [], valves: [] };
        if (!p.modes[mode].machines) p.modes[mode].machines = [];
        
        // Etsitään tai luodaan kone
        let m = p.modes[mode].machines.find(x => x.type === 'ahu');
        if (!m) {
            m = JSON.parse(JSON.stringify(homeMachine)); 
            m.settingVal = 0; m.supplyVal = 0; m.extractVal = 0;
            p.modes[mode].machines.push(m);
        }

        // Luetaan käyttäjän syöttämät KONEEN tavoitelitrat tälle tilalle
        const targetSup = parseFloat(m.designFlowSup) || 0;
        const targetExt = parseFloat(m.designFlowExt) || 0;

        // --- LASKETAAN KONEEN ASETUKSET ---
        // (Huom: Emme koske venttiileihin, oletamme että käyttäjä on syöttänyt ne itse)

        // TULO
        if (targetSup > 0 && homeMeasSup > 0 && setSup > 0) {
            const ratio = targetSup / homeMeasSup;
            if (unit === 'pa') m.supplyVal = Math.round(setSup * Math.pow(ratio, 2)); 
            else m.supplyVal = (setSup * ratio).toFixed(1);
            
            if (unit === 'pct' || unit === 'pa') m.supplyVal = Math.round(m.supplyVal);
        }

        // POISTO
        if (targetExt > 0 && homeMeasExt > 0 && setExt > 0) {
            const ratio = targetExt / homeMeasExt;
            if (unit === 'pa') m.extractVal = Math.round(setExt * Math.pow(ratio, 2));
            else m.extractVal = (setExt * ratio).toFixed(1);

            if (unit === 'pct' || unit === 'pa') m.extractVal = Math.round(m.extractVal);
        }

        // Master-arvo
        if (m.supplyVal == m.extractVal) m.settingVal = m.supplyVal;
        
        m.unit = unit;
        
        if (targetSup > 0 || targetExt > 0) {
            logMsg += `- ${mode.toUpperCase()}: Tulo ${m.supplyVal} / Poisto ${m.extractVal} (${unit})\n`;
        }
    });

    saveData();
    alert(logMsg + "\nVenttiilien tavoitteisiin ei koskettu.");
    
    if (document.getElementById('view-add-machine').classList.contains('active')) {
        showAddMachine();
    }
}
// --- KORJAUS: Puuttuva editMachine-funktio ---
function editMachine(index) {
    // Tämä avaa koneen muokkausnäkymän
    showAddMachine();
}
// --- APUFUNKTIO: Rakentaa koneen säätölomakkeen ---
function injectMachineForm() {
    const container = document.getElementById('view-add-machine');
    if (!container) return;
    
    const content = container.querySelector('.content-container') || container;
    const currentMode = window.currentMode || 'home';

    // Lisänappi vain home-tilassa
    let autoCalcBtn = '';
    if (currentMode === 'home') {
        autoCalcBtn = `
        <div style="margin-top:20px; padding:15px; background:#e8f5e9; border:1px solid #c8e6c9; border-radius:8px;">
            <div style="font-weight:bold; color:#2e7d32; margin-bottom:5px;">🤖 Automaattilaskenta</div>
            <div style="font-size:12px; color:#555; margin-bottom:10px;">
                Kun olet säätänyt Kotona-tilan valmiiksi, syötä alle Poissa/Tehostus -tavoitelitrat ja paina tätä. 
                Ohjelma laskee koneen tehot muihin tiloihin.
            </div>
            <button class="btn btn-secondary" onclick="calculateOtherModes()" style="width:100%; border-color:#2e7d32; color:#2e7d32;">Laske Poissa & Tehostus asetukset</button>
        </div>`;
    }
    
    content.innerHTML = `
        <h3 id="machineTitle">IV-Kone</h3>
        
        <label>Koneen Nimi</label>
        <input type="text" id="machineName" class="input" placeholder="Koneen merkki/malli">

        <label>Ohjaustapa / Yksikkö</label>
        <select id="machineUnit" class="input" onchange="updateMachineInputLimits()">
            <option value="pct">Prosenttia (%)</option>
            <option value="hz">Taajuus (Hz)</option>
            <option value="pa">Vakiopaine (Pa)</option>
            <option value="speed">Portaat (1-4 tai 1/2)</option>
        </select>

        <div style="background:#e3f2fd; padding:15px; border-radius:8px; margin:15px 0; border:1px solid #90caf9;">
            <label style="font-weight:bold; color:#1565c0;">Yleisasetus (Koko kone / Huippuimuri)</label>
            <input type="text" id="machineMasterVal" class="input" placeholder="esim. 60 tai 1/1" oninput="syncFromMaster(this.value)">
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
            <div>
                <label id="lblSupVal" style="color:#1976D2; font-weight:bold;">Tulo Puhallin</label>
                <input type="number" id="machineSupplyVal" class="input" step="0.1">
            </div>
            <div>
                <label id="lblExtVal" style="color:#d32f2f; font-weight:bold;">Poisto Puhallin</label>
                <input type="number" id="machineExtractVal" class="input" step="0.1">
            </div>
        </div>

        <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
        
        <label>Suunniteltu kokonaisilmavirta tähän tilaan (${currentMode})</label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
            <div>
                <label style="font-size:12px;">Tulo Tavoite (l/s)</label>
                <input type="number" id="machineDesignSup" class="input" placeholder="l/s">
            </div>
            <div>
                <label style="font-size:12px;">Poisto Tavoite (l/s)</label>
                <input type="number" id="machineDesignExt" class="input" placeholder="l/s">
            </div>
        </div>

        ${autoCalcBtn}

        <div style="margin-top:30px; display:flex; gap:10px;">
            <button class="btn btn-primary" onclick="saveMachine()">Tallenna</button>
            <button class="btn btn-secondary" onclick="showView('view-details')">Peruuta</button>
        </div>
    `;
}
// Synkronointifunktio (Master -> Split)
window.syncFromMaster = function(val) {
    // Jos syötetään murtolukuja kuten 1/2 tai 1/1 huippuimurille
    if(val === "1/2") val = 0.5;
    if(val === "1/1") val = 1;
    
    // Kopioidaan arvo molempiin kenttiin
    const num = parseFloat(val);
    if (!isNaN(num)) {
        document.getElementById('machineSupplyVal').value = num;
        document.getElementById('machineExtractVal').value = num;
    } else {
        // Jos käyttäjä tyhjentää, ei tyhjennetä split-kenttiä väkisin, paitsi jos oli numero
        if(val === "") {
             document.getElementById('machineSupplyVal').value = "";
             document.getElementById('machineExtractVal').value = "";
        }
    }
};

// PÄIVITETÄÄN showAddMachine kutsumaan tätä:
// (Varmista että tämä on koodissa vain kerran)
const _oldShowAddMachine = window.showAddMachine; 
window.showAddMachine = function() {
    injectMachineForm(); // Rakennetaan lomake
    
    // Haetaan tiedot
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    const currentMode = window.currentMode || 'home';
    const m = (p.modes[currentMode].machines || []).find(x => x.type === 'ahu') || { unit: 'pct' };

    // Täytetään arvot
    const setVal = (id, v) => { const e=document.getElementById(id); if(e) e.value=(v!==undefined&&v!==null)?v:''; };
    setVal('machineName', m.name || 'IV-Kone');
    const uSel = document.getElementById('machineUnit'); if(uSel) uSel.value = m.unit||'pct';
    
    setVal('machineSupplyVal', m.supplyVal);
    setVal('machineExtractVal', m.extractVal);
    setVal('machineMasterVal', m.settingVal); // Yleisnopeus
    setVal('machineDesignSup', m.designFlowSup);
    setVal('machineDesignExt', m.designFlowExt);
    
    updateMachineInputLimits();
    showView('view-add-machine');
}
// 3. Tallentaa koneen tiedot
// --- JÄTÄ TÄMÄ (UUSI JA TOIMIVA) ---
// --- 2. TALLENNA KONE (MASTER + SPLIT) ---
function saveMachine() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const currentMode = window.currentMode || 'home';
    if (!p.modes[currentMode].machines) p.modes[currentMode].machines = [];
    const machines = p.modes[currentMode].machines;

    // Haetaan elementit
    const unit = document.getElementById('machineUnit').value;
    const name = document.getElementById('machineName').value;
    
    // Master-arvo (voi olla tekstiäkin huippuimureille, mutta parseataan numeroksi laskentaa varten)
    let masterRaw = document.getElementById('machineMasterVal').value;
    let masterVal = parseFloat(masterRaw);
    
    // Erikoistapaus huippuimureille 1/2 ja 1/1
    if(masterRaw === "1/2") masterVal = 0.5;
    if(masterRaw === "1/1") masterVal = 1.0;

    const supVal = parseFloat(document.getElementById('machineSupplyVal').value);
    const extVal = parseFloat(document.getElementById('machineExtractVal').value);
    
    const desSup = parseFloat(document.getElementById('machineDesignSup').value);
    const desExt = parseFloat(document.getElementById('machineDesignExt').value);

    // Etsitään tai luodaan kone
    let machine = machines.find(m => m.type === 'ahu');
    if (!machine) {
        machine = { type: 'ahu', id: Date.now() };
        machines.push(machine);
    }

    // TALLENNETAAN TIEDOT
    machine.name = name || "IV-Kone";
    machine.unit = unit;
    
    // Tallenna erilliset
    machine.supplyVal = !isNaN(supVal) ? supVal : null;
    machine.extractVal = !isNaN(extVal) ? extVal : null;
    
    // Tallenna yleisnopeus. Jos sitä ei syötetty, käytä tuloa tai poistoa fallbackina.
    machine.settingVal = !isNaN(masterVal) ? masterVal : (!isNaN(supVal) ? supVal : null);

    // Tavoitelitrat
    machine.designFlowSup = !isNaN(desSup) ? desSup : null;
    machine.designFlowExt = !isNaN(desExt) ? desExt : null;

    machine.controlMode = (unit === 'pa') ? 'pressure' : 'speed';

    saveData();
    showView('view-details');
    renderDetailsList();
}
// --- KORJAUS: TÄYTTÄÄ RUNKOVALIKON KAIKILLA RUNGOILLA ---
function populateDuctSelect(preSelectType = null) {
    const p = projects.find(x => x.id === activeProjectId);
    const sel = document.getElementById('parentDuctId');
    if (!sel) return;
    
    // Tyhjennetään valikko
    sel.innerHTML = '';
    
    // 1. Oletusvalinta
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.text = "-- Valitse runko --";
    sel.appendChild(defaultOpt);

    if (!p || !p.ducts) return;
    
    // 2. Listataan KAIKKI olemassa olevat rungot
    // Jos preSelectType on annettu (esim. 'supply'), näytetään ne ensin tai korostettuna, 
    // mutta näytetään silti kaikki jotta käyttäjä voi vaihtaa.
    
    const sortedDucts = p.ducts.slice().sort((a,b) => {
        // Lajitellaan: ensin haluttu tyyppi, sitten aakkosjärjestys
        if (preSelectType) {
            if (a.type === preSelectType && b.type !== preSelectType) return -1;
            if (a.type !== preSelectType && b.type === preSelectType) return 1;
        }
        return (a.name || '').localeCompare(b.name || '');
    });

    sortedDucts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id; 
        const icon = d.type === 'supply' ? '🔵' : '🔴';
        opt.textContent = `${icon} ${d.name} (${d.size})`;
        sel.appendChild(opt);
    });

    // 3. "LUO UUSI" -vaihtoehdot (Varaudutaan tilanteeseen ettei runkoja ole)
    const newGrp = document.createElement('optgroup');
    newGrp.label = "--- Tai luo uusi ---";
    
    const newTulo = document.createElement('option');
    newTulo.value = "CREATE_NEW_SUPPLY";
    newTulo.text = "➕ Luo uusi Tulorunko";
    newGrp.appendChild(newTulo);

    const newPoisto = document.createElement('option');
    newPoisto.value = "CREATE_NEW_EXTRACT";
    newPoisto.text = "➕ Luo uusi Poistorunko";
    newGrp.appendChild(newPoisto);
    
    sel.appendChild(newGrp);
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
    applyCancelButtonStyles(modalElement);

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
function interpolateLinear(x, x1, y1, x2, y2) {
    if (x2 === x1) return y1;
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
}
function getInterpolatedDBK(valveType, opening) {
    if (!valveType || opening === null || opening === undefined) return null;
    if (!window.valveDB || !valveDB[valveType]) return null;

    const def = valveDB[valveType];
    if (!Array.isArray(def.data) || def.data.length < 2) return null;

    // data = [[asento, k], ...]
    const points = def.data
        .map(d => ({ pos: Number(d[0]), k: Number(d[1]) }))
        .filter(d => !isNaN(d.pos) && !isNaN(d.k))
        .sort((a, b) => a.pos - b.pos);

    if (points.length < 2) return null;

    // Alle minimin / yli maksimin → ei extrapoloida
    if (opening < points[0].pos || opening > points[points.length - 1].pos) {
        return null;
    }

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        if (opening >= p1.pos && opening <= p2.pos) {
            return interpolateLinear(opening, p1.pos, p1.k, p2.pos, p2.k);
        }
    }

    return null;
}
function getInterpolatedUserK(userKList, opening) {
    if (!Array.isArray(userKList) || userKList.length < 2) return null;
    if (opening === null || opening === undefined) return null;

    const points = userKList
        .map(d => ({ pos: Number(d.opening), k: Number(d.k) }))
        .filter(d => !isNaN(d.pos) && !isNaN(d.k))
        .sort((a, b) => a.pos - b.pos);

    if (points.length < 2) return null;

    if (opening < points[0].pos || opening > points[points.length - 1].pos) {
        return null;
    }

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        if (opening >= p1.pos && opening <= p2.pos) {
            return interpolateLinear(opening, p1.pos, p1.k, p2.pos, p2.k);
        }
    }

    return null;
}

function resolveKForValve(v, options = {}) {
    if (!v) {
        return { value: null, source: 'none', note: 'Ei venttiiliä' };
    }

    // 1️⃣ Hyväksytty K – aina etusijalla
    if (typeof v.kApproved === 'number') {
        return {
            value: v.kApproved,
            source: 'approved',
            note: 'Hyväksytty K-arvo'
        };
    }

    const opening = v.pos;
    const valveType = v.type;

    // 2️⃣ Käyttäjän oma K-kirjasto
    const userKList = options.userKList || v.userKList || [];
    const userK = getInterpolatedUserK(userKList, opening);

    if (typeof userK === 'number') {
        return {
            value: userK,
            source: 'user',
            note: 'Käyttäjän oma K-kirjasto (interpoloitu)'
        };
    }

    // 3️⃣ Venttiilin tehdasdata (valveDB)
    const dbK = getInterpolatedDBK(valveType, opening);

    if (typeof dbK === 'number') {
        return {
            value: dbK,
            source: 'db',
            note: 'Venttiilidatasta laskettu K (interpoloitu)'
        };
    }

    // 4️⃣ Ei K-arvoa
    return {
        value: null,
        source: 'none',
        note: 'K-arvo puuttuu – syötä tai hyväksy'
    };
}
function getKBadgeInfo(kResult) {
    if (!kResult) return { text: '-', color: '#999' };

    switch (kResult.source) {
        case 'approved':
            return { text: 'Hyväksytty', color: '#2e7d32' };
        case 'user':
            return { text: 'Oma', color: '#1565c0' };
        case 'db':
            return { text: 'DB', color: '#6a1b9a' };
        default:
            return { text: 'Puuttuu', color: '#c62828' };
    }
}


// --- PÖYTÄKIRJAT JA RAPORTOINTI (FINAL VERSION) ---

// --- KORJAUS: Pöytäkirjat lukemaan aktiivista tilaa ---
function buildReportData() {
    console.warn('buildReportData disabled (Korjaus 1): raportti siirtyy konekohtaiseksi');
    return {
        meta: {},
        machine: null,
        ducts: [],
        summary: {}
    };
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
// --- UUSI EXCEL-TYYLINEN PÖYTÄKIRJA (PDF) - FINAL V5 ---
// ❌ DEPRECATED
// Vanha jsPDF-pohjainen raportti.
// Ei enää käytössä.
// Korvattu unified-report + print-CSS -ratkaisulla.
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
function renderEditable(label, value, editable = true) {
    const safeVal = (value !== undefined && value !== null && value !== '')
        ? value
        : '-';

    return `
        <div>
            <div class="label">${label}</div>
            <div class="editable"
                 contenteditable="${editable ? 'true' : 'false'}">
                ${safeVal}
            </div>
        </div>
    `;
}

// --- UUSI: EXCEL-TYYLINEN RAPORTTI NÄYTÖLLE (HTML) ---
// --- UUSI: EXCEL-TYYLINEN RAPORTTI NÄYTÖLLE (PÄIVITETTY HEADER) ---
// --- UUSI: EXCEL-TYYLINEN RAPORTTI NÄYTÖLLE (PÄIVITETTY) ---
// --- NÄYTÄ PÖYTÄKIRJA (KAIKKI TILAT) ---
// --- NÄYTÄ PÖYTÄKIRJA (KAIKKI TILAT) ---
function showReportExcelStyle() {
    // 🔒 RAPORTTIPOLUN LUKITUS:
    // Kaikki vanhat "Excel-style report" -avaamiset ohjataan unified raporttiin.
    openReportView();
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

function exportUnifiedReportToExcel() {
    const report = getUnifiedReport();
    if (!report) {
        alert('Raporttia ei voitu muodostaa.');
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert('XLSX-kirjastoa ei ole ladattu.');
        return;
    }

    const wb = XLSX.utils.book_new();
    const wsData = [];

    /* ===============================
       YLÄOSA – KONEEN TIEDOT
       =============================== */

    const m = report.machine || {};
    const meta = report.meta || {};

    wsData.push(
        ['KOHDE', meta.location || ''],
        ['KONE', m.name || ''],
        ['SÄÄTÖTAPA', `${m.controlMode || ''} ${m.setting ?? ''}`.trim()],
        ['KOKONAISVIRTA (l/s)', m.totalFlow ?? ''],
        []
    );

    if (report.d2) {
        wsData.push(['D2', report.d2.ok ? 'TÄYTTYY' : 'EI TÄYTY']);
    }

    if (Number.isFinite(report.sfp)) {
        wsData.push(['SFP', report.sfp.toFixed(2)]);
    }

    wsData.push([], []);

    /* ===============================
       OTSIKOT
       =============================== */

    wsData.push([
        'HUONE', 'PÄÄTELAITE', 'AS', 'Pa', 'l/s', 'TAV', '%', 'K',
        '', // väli
        'HUONE', 'PÄÄTELAITE', 'AS', 'Pa', 'l/s', 'TAV', '%', 'K'
    ]);

    /* ===============================
       DATA – TULO / POISTO
       =============================== */

    const supply = report.ducts.find(d => d.type === 'supply')?.valves || [];
    const extract = report.ducts.find(d => d.type === 'extract')?.valves || [];

    const maxRows = Math.max(supply.length, extract.length);

    const fmtValveName = v =>
        `${(v.model || v.type || '').toUpperCase()}-${v.size || ''}`;

    for (let i = 0; i < maxRows; i++) {
        const s = supply[i];
        const e = extract[i];

        wsData.push([
            s?.room || '',
            s ? fmtValveName(s) : '',
            s?.pos ?? '',
            s?.pa ?? '',
            s?.flow ?? '',
            s?.target ?? '',
            s?.percent ?? '',
            s?.k ?? '',

            '',

            e?.room || '',
            e ? fmtValveName(e) : '',
            e?.pos ?? '',
            e?.pa ?? '',
            e?.flow ?? '',
            e?.target ?? '',
            e?.percent ?? '',
            e?.k ?? ''
        ]);
    }

    /* ===============================
       LUO EXCEL
       =============================== */

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Pöytäkirja');

    const fileName =
        (meta.location || 'mittaus')
            .replace(/\s+/g, '_')
            .toLowerCase() +
        '_poytakirja.xlsx';

    XLSX.writeFile(wb, fileName);
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

// Erillinen Huippuimuri-demo


// Tulosta AHU-pöytäkirja
// ❌ DEPRECATED
// Vanha jsPDF-pohjainen raportti.
// Ei enää käytössä.
// Korvattu unified-report + print-CSS -ratkaisulla.
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
// ❌ DEPRECATED
// Vanha jsPDF-pohjainen raportti.
// Ei enää käytössä.
// Korvattu unified-report + print-CSS -ratkaisulla.
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
function printReport() {
    window.print();
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

// Altista demofunktiot globaalisti index.html onclick-kutsuille

// Näytä pöytäkirja: Tulo/Poisto (ruudulla)
// Näytä pöytäkirja: Tulo/Poisto (ruudulla)  + hyväksytty K

function showReportRoof(){
    const p = projects.find(x => x.id === activeProjectId);
    if(!p) return;

    const data = buildReportData().roof;
    const container = document.getElementById('reportContent');
    const title = p.name ? `Pöytäkirja: Huippuimuri — ${p.name}` : 'Pöytäkirja: Huippuimuri';
    const dateStr = new Date().toLocaleDateString('fi-FI');

    const kApprovedText = (v) =>
        (typeof v.kApproved === 'number' && isFinite(v.kApproved)) ? v.kApproved.toFixed(2) : '-';

    let html = `<h3>${title}</h3><div style="font-size:12px; color:#666;">Päivämäärä: ${dateStr}</div>`;
    html += `
        <table class="report">
            <thead>
                <tr>
                    <th>Asunto</th>
                    <th>Huone</th>
                    <th>Venttiili</th>
                    <th>K (hyväksytty)</th>
                    <th>Pa (Pa)</th>
                    <th>Avaus</th>
                    <th>Virtaus (l/s)</th>
                    <th>Tavoite (l/s)</th>
                </tr>
            </thead>
            <tbody>
    `;

    html += data.map(v => `
        <tr>
            <td>${v.apartment||''}</td>
            <td>${v.room||''}</td>
            <td>${v.type||''}</td>
            <td style="text-align:center;font-weight:bold;">${kApprovedText(v)}</td>
            <td>${v.measuredP ?? ''}</td>
            <td>${v.pos ?? ''}</td>
            <td>${(parseFloat(v.flow)||0).toFixed(1)}</td>
            <td>${(parseFloat(v.target)||0).toFixed(1)}</td>
        </tr>
    `).join('');

    html += `</tbody></table>`;
    container.innerHTML = html;
    showView('view-report');
}

// Näytä pöytäkirja: Huippuimuri (ruudulla)  + hyväksytty K

// Näytä pöytäkirja: Huippuimuri (ruudulla)

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
    applyCancelButtonStyles(modalElement);

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
function loadUserKDB() {
    try {
        return JSON.parse(localStorage.getItem('userKDB') || '[]');
    } catch {
        return [];
    }
}

function saveUserKDB(db) {
    localStorage.setItem('userKDB', JSON.stringify(db));
}

function findUserKSuggestion(type, pos) {
    const db = loadUserKDB();
    if (!type || pos == null) return null;

    return db.find(x =>
        x.type === type &&
        Math.abs(x.pos - pos) <= 0.01
    ) || null;
}

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

// --- ROOM PANEL LOGIC START ---

let activePanelRoom = null;

// Avaa paneeli tietylle huoneelle (kutsutaan visuaalisesta kartasta)
function openRoomPanel(roomName) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    activePanelRoom = roomName;
    const panel = document.getElementById('room-panel');
    if (panel) {
        panel.classList.remove('hidden');
        renderRoomPanel();
        highlightVisualRoom(roomName);
    }
}

function closeRoomPanel() {
    const panel = document.getElementById('room-panel');
    if (panel) {
        panel.classList.add('hidden');
    }
    // Poista korostukset kartalta
    document.querySelectorAll('.vis-apt').forEach(el => {
        el.classList.remove('active-room');
        el.classList.remove('dimmed');
    });
    activePanelRoom = null;
}
/**
 * Laskee mitatun ja tavoitteen suhteen sekä prosentit
 * Sallii yli- ja alisuorituksen
 *
 * @param {number} measured - mitattu virtaus (l/s)
 * @param {number} target - tavoitevirtaus (l/s)
 * @returns {{
*   measured: number,
*   target: number,
*   ratio: number|null,
*   percent: number|null,
*   status: 'ok'|'low'|'high'|'na'
* }}
*/
function calculateFlowPerformance(measured, target) {
    if (typeof measured !== 'number') return null;
    if (typeof target !== 'number') return null;
    if (target <= 0) return null;

    return Math.round((measured / target) * 100);
}

function renderMeasurementInputList(machine) {
  // ❌ POISTETTU: vanha nopea mittalista (korvattu renderMeasurementListV2)
}
function refreshMeasurementInputList() {
  // ❌ POISTETTU: vanha nopea mittalista (korvattu renderMeasurementListV2)
}

function renderRoomPanel() {
    if (!activePanelRoom) return;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const allValves = p.modes?.[mode]?.valves || [];

    let roomValves = allValves.filter(v => v.apartment === activePanelRoom);
    if (roomValves.length === 0) {
        roomValves = allValves.filter(v => v.room === activePanelRoom);
    }

    roomValves.sort((a,b)=>(a.displayOrder||0)-(b.displayOrder||0));

    const dummyRoom = { roomId: activePanelRoom, roomName: activePanelRoom };
    const data = (typeof calculateRoomRelativeAdjustments === 'function')
        ? calculateRoomRelativeAdjustments(dummyRoom, roomValves)
        : null;

    if (!data) return;

    document.getElementById('rp-title').textContent = activePanelRoom;
    document.getElementById('rp-target').textContent =
        data.roomInfo.targetTotalFlow.toFixed(1) + ' l/s';
    document.getElementById('rp-measured').textContent =
        data.roomInfo.measuredTotalFlow.toFixed(1) + ' l/s';

    const list = document.getElementById('rp-valves-list');
    list.innerHTML = '';

    data.valves.forEach(v => {
        const ratioPct = (v.suhde * 100).toFixed(0);

        let cardClass = 'ok';
        if (v.isIndex) cardClass = 'index';

        const html = `
        <div class="rp-card ${cardClass}"
             onclick="openValveById('${v.id}')"
             style="position:relative;">

            <button
                onclick="event.stopPropagation(); deleteValveById('${v.id}')"
                style="
                    position:absolute;
                    top:5px;
                    left:5px;
                    border:none;
                    background:rgba(244,67,54,0.15);
                    color:#c62828;
                    border-radius:4px;
                    padding:2px 6px;
                    font-size:11px;
                    cursor:pointer;
                ">✖</button>

            <div class="rp-card-header">
                <div class="rp-room-name">${v.name}</div>
                <div class="rp-model-info">${v.model} Ø${v.size}</div>
            </div>

            <div class="rp-data-grid">
                <div><b>Tavoite:</b> ${v.tarve.toFixed(1)}</div>
                <div><b>Mitattu:</b> ${v.mitattu.toFixed(1)}</div>
                <div><b>Suhde:</b> ${ratioPct}%</div>
            </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    });
}
function createDraftValve(duct) {
    if (!duct.valves) duct.valves = [];

    // älä tee toista draftia
    const existing = duct.valves.find(v => v.__isDraft);
    if (existing) return existing;

    const draft = {
        id: null,
        __isDraft: true,
        parentDuctId: duct.id,
        room: '',
        type: '',
        pos: '',
        kWorking: '',
        flow: '',
        target: '',
        measuredP: ''
    };

    duct.valves.push(draft);
    return draft;
}

function attachValveAutocomplete(input, onSelect, opts = {}) {
    const search = opts.search || (() => []);

    let box = document.createElement('div');
    box.className = 'autocomplete-box';
    box.style.display = 'none';
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(box);

    let activeIndex = -1;
    let currentItems = [];

    function renderList(list) {
        box.innerHTML = '';
        currentItems = list;
        activeIndex = -1;

        if (!list.length) {
            box.style.display = 'none';
            return;
        }

        list.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `
                <span>${formatValveDisplay(item.type)}</span>
                ${item.source === 'user' ? '<span class="tag tag-user">★</span>' : ''}
            `;
            div.addEventListener('mousedown', e => {
                e.preventDefault();
                select(item.type);
            });
            box.appendChild(div);
        });

        box.style.display = 'block';
    }

    function select(type) {
        input.value = formatValveDisplay(type);
        input.dataset.raw = type;
        box.style.display = 'none';
        onSelect(type);
    }

    input.addEventListener('input', () => {
        const list = search(input.value);
        renderList(list);
    });

    input.addEventListener('keydown', e => {
        if (!currentItems.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) select(currentItems[activeIndex].type);
        } else if (e.key === 'Escape') {
            box.style.display = 'none';
        }

        [...box.children].forEach((el, i) =>
            el.classList.toggle('active', i === activeIndex)
        );
    });

    document.addEventListener('click', e => {
        if (!box.contains(e.target) && e.target !== input) {
            box.style.display = 'none';
        }
    });
}
function renderMachineMeasurementBlock(machine, container) {
    const mode = window.currentMode || 'home';

    if (!machine.modes[mode].summary) {
        machine.modes[mode].summary = {};
    }

    const s = machine.modes[mode].summary;

    const div = document.createElement('div');
    div.className = 'machine-measure-block';

    div.innerHTML = `
        <h3>IV-Kone ${machine.name}</h3>

        <div class="machine-grid">
            <label>
                Säätötapa
                <select data-f="controlType">
                    <option value="">—</option>
                    <option value="pa" ${s.controlType === 'pa' ? 'selected' : ''}>Pa</option>
                    <option value="hz" ${s.controlType === 'hz' ? 'selected' : ''}>Hz</option>
                    <option value="speed" ${s.controlType === 'speed' ? 'selected' : ''}>%</option>
                </select>
            </label>

            <label>
                Säätöarvo
                <input type="number" data-f="controlValue" value="${s.controlValue ?? ''}">
            </label>

            <label>
                Mitattu Pa
                <input type="number" data-f="measuredPa" value="${s.measuredPa ?? ''}">
            </label>

            <label>
                Tulo (l/s)
                <input type="number" data-f="supplyQ" value="${s.supplyQ ?? ''}">
            </label>

            <label>
                Poisto (l/s)
                <input type="number" data-f="extractQ" value="${s.extractQ ?? ''}">
            </label>
        </div>
    `;

    // 🔑 Bindings
    div.querySelectorAll('[data-f]').forEach(input => {
        const key = input.dataset.f;

        input.addEventListener('input', () => {
            const val = input.value.trim();
            s[key] = val === '' ? null : Number(val);

            saveProjects(); // jos sinulla on tämä, muuten localStorage suoraan
        });
    });

    container.appendChild(div);
}


function renderMeasurementListV2(container) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) {
        container.innerHTML = '<div class="empty">Ei aktiivista konetta</div>';
        return;
    }

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    if (!mm || !Array.isArray(mm.ducts)) {
        container.innerHTML = '<div class="empty">Ei dataa</div>';
        return;
    }

    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'measurelist-v2';
    container.appendChild(wrap);
renderMachineMeasurementBlock(machine, wrap);
    // TULO ensin, sitten POISTO
    const ducts = [
        ...mm.ducts.filter(d => d.type === 'supply'),
        ...mm.ducts.filter(d => d.type === 'extract')
    ];

    ducts.forEach(duct => {
        const header = document.createElement('div');
        header.className = 'duct-header';
        header.innerHTML = `
            <div>
                <b>${duct.name || 'Runko'}</b>
                <span class="duct-type">${duct.type === 'supply' ? 'TULO' : 'POISTO'}</span>
            </div>
            <div class="duct-status" id="duct-${duct.id}-status"></div>
        `;
        wrap.appendChild(header);

        const table = document.createElement('table');
        table.className = 'measure-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th class="status-col"></th>
<th>Huone</th>
<th>Päätelaite</th>
<th>Pa</th>
<th>Avaus</th>
<th>K</th>
<th>l/s</th>
<th>Suunn</th>
<th>%</th>
<th></th>

                </tr>
            </thead>
            <tbody></tbody>
        `;
        wrap.appendChild(table);

        const tbody = table.querySelector('tbody');

const elements = getElementsForDuct(duct, mm);
elements.forEach(el => {
    if (el.kind === 'valve') {
        const v = el.__valve || el;
        // 🔥 KÄYTÄ VANHAA RENDER-KOODIA SELLAISENAAN
    }

    if (el.kind === 'damper') {
        // myöhemmin
    }

    if (el.kind === 'pressure_reg') {
        // myöhemmin
    }
});

// 🔑 varmista yksi tyhjä (draft) rivi rungon loppuun
if (!rows.some(v => v.__isDraft)) {
    rows.push(createDraftValve(duct));
}

rows.forEach(v => {
    const isDraft = !!v.__isDraft;

    const tr = document.createElement('tr');
    v.__rowEl = tr;

    tr.className = isDraft ? 'valve-row draft-row' : 'valve-row';
    if (v.id) tr.dataset.id = v.id;

if (!isDraft) {
    tr.addEventListener('click', (e) => {
        if (
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'BUTTON' ||
            e.target.closest('button')
        ) return;
        openValvePanel(v.id);
    });
}



            const pct = calcPct(v.flow, v.target);
            const cls = pctClass(pct);
            const showSave =
    !v.__isDraft &&
    !!v.type &&
    Number.isFinite(Number(v.pos)) &&
    Number.isFinite(Number(v.kWorking)) &&
    isKValueNewForValve(v);


            tr.innerHTML = `
    <!-- STATUS -->
    <td class="status-col">
        ${
            isDraft
                ? ''
                : `<span class="status-dot ${
                    cls === 'pct-ok'
                        ? 'status-ok'
                        : cls === 'pct-warn'
                        ? 'status-warn'
                        : 'status-bad'
                }"></span>`
        }
    </td>

    <!-- HUONE -->
    <td class="huone">
        <input value="${v.room || ''}" data-f="room">
    </td>

    <!-- PÄÄTELAITE -->
    <td>
        <input
            value="${formatValveDisplay(v.type) || ''}"
            data-f="type"
            data-raw="${v.type || ''}">
    </td>

    <!-- PA -->
    <td class="meta">
        <input type="number" value="${v.measuredP ?? ''}" data-f="measuredP">
    </td>

    <!-- AVAUS -->
    <td class="meta">
        <input type="number" value="${v.pos ?? ''}" data-f="pos">
    </td>

    <!-- K -->
<td class="meta k-cell">
  <input
    type="number"
    step="0.01"
    value="${v.kWorking ?? ''}"
    data-f="kWorking"
    ${v.kApproved != null ? 'disabled' : ''}
  >

  ${
    v.kApproved != null
      ? `<span
            class="k-lock"
            title="Hyväksytty K (avaa klikkaamalla)"
            onclick="event.stopPropagation(); openUnlockKConfirm('${v.id}')"
         >🔒</span>`
      : (
    showSave
      ? `<span
            class="k-save-hint"
            title="Tallenna K-arvo kirjastoon"
            onclick="event.stopPropagation(); openSaveKModal('${v.id}')"
         >💾</span>`
      : ''
  )

  }
</td>






    <!-- MITATTU L/S -->
    <td class="flow">
        <input type="number" value="${v.flow ?? ''}" data-f="flow">
    </td>

    <!-- SUUNNITELTU L/S -->
    <td class="flow">
        <input type="number" value="${v.target ?? ''}" data-f="target">
    </td>

    <!-- % -->
    <td class="pct-cell">
        ${isDraft ? '-' : (pct ?? '')}
    </td>

    <!-- TOIMINNOT -->
    <td class="row-actions">
        ${
            isDraft
                ? ''
                : `
            <button onclick="event.stopPropagation(); moveValveUp('${v.id}')">⬆</button>
            <button onclick="event.stopPropagation(); moveValveDown('${v.id}')">⬇</button>
            <button onclick="event.stopPropagation(); deleteValve('${v.id}')">🗑</button>
        `
        }
    </td>
`;


            tbody.appendChild(tr);
            // 🔍 Päätelaite-autocomplete
const typeInput = tr.querySelector('input[data-f="type"]');
if (typeInput) {
    attachValveAutocomplete(
        typeInput,
        (selectedType) => {
            // 1) päivitä data
            v.type = selectedType;

            // 2) varmista näkyvä arvo inputiin
            typeInput.value = formatValveDisplay(selectedType);
            typeInput.dataset.raw = selectedType;

            // 3) laukaise sama ketju kuin kirjoittaessa (bindMeasurementListV2 kuulee tämän)
            typeInput.dispatchEvent(new Event('input', { bubbles: true }));
        },
        { search: searchValveTypes }
    );
    typeInput.addEventListener('blur', () => {
    const raw = typeInput.dataset.raw;
    if (raw) {
        v.type = raw; // lukitaan tekninen tyyppi
        typeInput.value = formatValveDisplay(raw);
    }
});

}


        });

        updateDuctStatus(duct);
    });

    bindMeasurementListV2(container);
}
function getElementsForDuct(duct, modeData) {
    // 1️⃣ jos uusi malli käytössä
    if (Array.isArray(duct.elements)) {
        return duct.elements;
    }

    // 2️⃣ fallback: vanha malli → elementeiksi
    return (duct.valves || []).map(v => ({
        kind: 'valve',
        role: 'terminal',
        __source: 'legacy',
        __valve: v
    }));
}

function createEmptyMeasurementRow(ductId) {
    // ❌ POISTETTU: legacy mittalista (measurementRows)
    return null;
}

function renderMeasurementInputRow(row, duct) {
  // ❌ POISTETTU: legacy mittalista (measurementRows)

}

function renderMeasurementRow(row, duct) {
    // ❌ POISTETTU: legacy mittalista (measurementRows)

}
function renderMeasurementList(machine) {
    // ❌ POISTETTU: legacy mittalista (measurementRows)

}

// Navigointi seuraavaan huoneeseen/asuntoon paneelissa
function navigateRoomPanel(dir) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;
    const currentMode = window.currentMode || 'home';
    const allValves = p.modes[currentMode].valves || [];
    
    // Etsi kaikki uniikit huoneet/asunnot
    // Käytetään samaa logiikkaa kuin renderöinnissä: ensisijaisesti 'apartment', toissijaisesti 'room'
    const rooms = [...new Set(allValves.map(v => v.apartment || v.room))].filter(Boolean).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
    
    if (rooms.length === 0) return;

    let idx = rooms.indexOf(activePanelRoom);
    if (idx === -1) idx = 0;
    
    let nextIdx = idx + dir;
    // Loop around
    if (nextIdx >= rooms.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = rooms.length - 1;

    openRoomPanel(rooms[nextIdx]);
}
// ✅ FAB: avaa projektinäkymän
window.openProjectList = function () {
    if (typeof window.showView === 'function') {
        window.showView('view-projects');
    } else {
        console.warn('openProjectList: showView ei ole käytettävissä');
    }
};

/* =====================================================
   VENTTIILIN JÄRJESTYKSEN MUUTOS (displayOrder)
   – toimii kartassa + mittauslistassa
   ===================================================== */
window.moveValveOrder = function (valveId, direction) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const valves = p.modes?.[mode]?.valves;
    if (!Array.isArray(valves)) return;

    // 🔧 Varmista että kaikilla venttiileillä on order
    valves.forEach((v, i) => {
        if (v.order == null) v.order = i;
    });

    // 🔀 Järjestetään nykyisen order-arvon mukaan
    const ordered = valves
        .slice()
        .sort((a, b) => a.order - b.order);

    const idx = ordered.findIndex(v => String(v.id) === String(valveId));
    if (idx < 0) return;

    const swapWith =
        (direction === 'left' || direction === 'up')
            ? idx - 1
            : idx + 1;

    if (swapWith < 0 || swapWith >= ordered.length) return;

    // 🔁 Vaihda order-arvot
    const a = ordered[idx];
    const b = ordered[swapWith];

    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;

    // 💾 Tallenna projekti
    saveData();

    // 🔄 Päivitä näkymät heti
    if (typeof renderHorizontalMap === 'function') {
        const container = document.getElementById('visContent');
        if (container) renderHorizontalMap(container);
    }

    if (typeof renderDetailsList === 'function') {
        renderDetailsList();
    }
};


// Visuaalinen korostus kartalla
function highlightVisualRoom(roomName) {
    // Poista vanhat
    document.querySelectorAll('.vis-apt').forEach(el => {
        el.classList.remove('active-room');
        el.classList.remove('dimmed');
    });

    // Etsi ja korosta
    const aptEls = document.querySelectorAll('.vis-apt');
    let found = false;
    aptEls.forEach(el => {
        // Oletetaan että elementin teksti sisältää huoneen/asunnon nimen (esim. "A1")
        const text = el.innerText; 
        if (text.includes(roomName)) {
            el.classList.add('active-room');
            found = true;
        } else {
            el.classList.add('dimmed');
        }
    });
    
    if (!found) {
        document.querySelectorAll('.vis-apt').forEach(el => el.classList.remove('dimmed'));
    }
}
/**
/**
 * RUNGON SUHTEELLISEN SÄÄDÖN ANALYYSI
 * – EI UI-riippuvuuksia
 * – EI globaaleja muuttujia
 *
 * @param {Array} valves  Venttiilit (id, flow, target, locked)
 * @param {number} tolerance Suhdetoleranssi (oletus 5 %)
 * @returns {Object}
 */
function analyzeTrunkRelative(valves, tolerance = 0.05) {

    if (!Array.isArray(valves) || valves.length === 0) {
        return {
            phase: 'ERROR',
            valves: [],
            machineInstruction: '',
            indexSuggestion: null
        };
    }

    /* =====================================================
       1️⃣ ESIVALMISTELU
       ===================================================== */
    const analyzed = valves
        .map(v => {
            const flow = Number(v.flow) || 0;
            const target = Number(v.target) || 0;
            if (target <= 0) return null;

            return {
                ...v,
                _ratio: flow / target   // saavutettu / tavoite
            };
        })
        .filter(Boolean);

    if (analyzed.length === 0) {
        return {
            phase: 'DONE',
            valves: [],
            machineInstruction: '',
            indexSuggestion: null
        };
    }

    /* =====================================================
       2️⃣ INDEKSI
       ===================================================== */
    /* =====================================================
   2️⃣ INDEKSI (EI VAIHDU SÄÄDÖN AIKANA)
   ===================================================== */


// 1️⃣ Käyttäjän valitsema indeksi (ensisijainen)
let indexValve = analyzed.find(v => v.isIndex === true);

// 2️⃣ Jos käyttäjä ei ole valinnut indeksiä → ehdota heikointa
if (!indexValve) {
    indexValve = [...analyzed].sort((a, b) => a._ratio - b._ratio)[0];
}

const indexRatio = indexValve._ratio;

// 🟢 Rungon valmius (päivitetään myöhemmin venttiilikohtaisesti)
let trunkReady = true;

/* =====================================================
   🔎 FALSE-INDEKSIN TUNNISTUS (VAROITUS, EI AUTOMAATTIA)
   ===================================================== */
/* =====================================================
   🔎 FALSE-INDEKSIN TUNNISTUS
   (VAROITUS KÄYTTÄJÄLLE, EI AUTOMAATTISTA PÄÄTÖSTÄ)
   ===================================================== */
let falseIndexReason = null;

// 🔑 YKSINKERTAINEN JA LUOTETTAVA SÄÄNTÖ:
// Jos indeksiventtiili on selvästi kuristettu suhteessa tavoitteeseen,
// näytetään varoitus käyttäjälle.
// (Ei vaadi pos/min/max -tietoja)

if (indexRatio < 0.70) {
    falseIndexReason = 'Indeksiventtiili on voimakkaasti kuristettu eikä välttämättä edusta runkoa luotettavasti';
}

// 🔁 Varsinainen tasapainotus alkaa tästä
let allBalanced = true;


/* =====================================================
   2️⃣A INDEKSISUHDE PER VENTTIILI (VISUAALINEN)
   ===================================================== */
analyzed.forEach(v => {
    v.indexRatio =
        indexRatio > 0
            ? v._ratio / indexRatio
            : null;
});


    /* =====================================================
       3️⃣ VENTTIILIKOHTAISET OHJEET + WORKING K
       ===================================================== */
    const resultValves = analyzed.map(v => {

        const isIndex = String(v.id) === String(indexValve.id);
        const flow = Number(v.flow) || 0;
        const target = Number(v.target) || 0;
        const deltaP = Number(v.measuredP) || null;

        const relativeTarget = target * indexRatio;
        const delta = flow - relativeTarget;

        let code = 'OK';
        let instruction = 'OK';
// 🟢 Rungon valmius (tavoitteen suhteen)
if (v._ratio < 0.90 || v._ratio > 1.10) {
    trunkReady = false;
}

        if (isIndex) {
            code = 'INDEX';
            instruction = 'INDEKSI – älä säädä';
        } else {
            const ratioDiff = Math.abs(v._ratio - indexRatio);
            const withinTolerance =
                ratioDiff <= tolerance || Math.abs(delta) < 0.5;

            if (!withinTolerance) {
                allBalanced = false;
                code = delta > 0 ? 'ADJUST_CHOKE' : 'ADJUST_OPEN';
                instruction = delta > 0 ? 'KURISTA' : 'AVAA';
            }
        }

        /* =====================================================
           🔑 WORKING K – LASKENTA
           ===================================================== */
        let workingK = null;

        if (flow > 0 && deltaP > 0) {
            workingK = Number((flow / Math.sqrt(deltaP)).toFixed(4));
        }

        return {
            id: v.id,
            isIndex,
            code,
            instruction,
            relativeTarget,

            // alkuperäinen suhde (saavutettu / tavoite)
            ratio: v._ratio,

            // 🔑 UUSI: indeksiin suhteutettu arvo (0.75 / 1.00 / 1.15)
            indexRatio: v.indexRatio,

            // 🔑 WORKING K
            workingK,
            hasApprovedK: v.approvedK !== undefined && v.approvedK !== null
        };
    });

    /* =====================================================
       4️⃣ VAIHE
       ===================================================== */
    const phase = allBalanced
        ? 'ADJUST_MACHINE'
        : 'ADJUST_VALVES';

    /* =====================================================
       5️⃣ KONEOHJE
       ===================================================== */
    const machineInstruction =
        phase === 'ADJUST_MACHINE'
            ? 'Venttiilit suhteessa – säädä konetta'
            : 'Tasapainota venttiilit ensin';

    return {
    phase,
    valves: resultValves,
    machineInstruction,
    indexSuggestion: null,
falseIndex: falseIndexReason
    ? {
        id: String(indexValve.id),
        reason: falseIndexReason
    }
    : null,


    trunkReady
};




}


function calculateMachineAdjustment(currentValue, ratio, unit = 'pct') {
    if (
        currentValue == null ||
        !isFinite(currentValue) ||
        !ratio ||
        ratio <= 0
    ) {
        return null;
    }

    const limits = MACHINE_LIMITS[unit] || null;

    // Peruskerroin (indeksisuhde → 1.00)
    const factor = 1 / ratio;
    let rawTarget = currentValue * factor;

    let limited = false;
    let limitType = null;

    // 🔒 Turvarajat
    if (limits) {
        if (rawTarget < limits.min) {
            rawTarget = limits.min;
            limited = true;
            limitType = 'MIN';
        }
        if (rawTarget > limits.max) {
            rawTarget = limits.max;
            limited = true;
            limitType = 'MAX';
        }
    }

    const delta = rawTarget - currentValue;

    // Pyöristys yksikön mukaan
    let displayValue;
    switch (unit) {
        case 'hz':
            displayValue = rawTarget.toFixed(1);
            break;
        case 'pa':
            displayValue = Math.round(rawTarget);
            break;
        case 'speed':
            displayValue = Math.round(rawTarget);
            break;
        case 'pct':
        default:
            displayValue = Math.round(rawTarget);
    }

    let text = `${displayValue} ${unit === 'pct' ? '%' : unit}`;

    if (delta !== 0) {
        text += ` (${delta > 0 ? '+' : ''}${Math.round(delta)})`;
    }

    if (limited) {
        text +=
            limitType === 'MAX'
                ? ' ⚠️ maksimi'
                : ' ⚠️ minimi';
    }

    let warning = null;

    if (limits) {
        const range = limits.max - limits.min;
        const distToMin = rawTarget - limits.min;
        const distToMax = limits.max - rawTarget;
    
        if (!limited) {
            if (distToMin / range < WARNING_LIMITS.machine.nearMinPct) {
                warning = 'lähellä minimiä';
            }
            if (distToMax / range < WARNING_LIMITS.machine.nearMaxPct) {
                warning = 'lähellä maksimia';
            }
        }
    }
    
    if (warning) {
        text += ` ⚠️ ${warning}`;
    }
    
    return {
        targetValue: rawTarget,
        delta,
        factor,
        limited,
        limitType,
        warning,
        text
    };
    
}


/**
 * Valitsee indeksiventtiilin rungolle
 * Säännöt:
 * 1) Lukittu venttiili voittaa, jos EI ole fyysisessä rajassa
 * 2) Muuten valitaan pienin suhdeluku venttiileistä,
 *    jotka eivät ole fyysisessä rajassa (LIMIT_MIN / LIMIT_MAX)
 * 3) Jos kelvollisia ei ole, palautetaan null
 */
function selectIndexValve(valves) {
    if (!Array.isArray(valves) || valves.length === 0) return null;

    // Apufunktio: voiko venttiili toimia indeksinä
    const isIndexEligible = (v) => {
        if (typeof v._ratio !== 'number' || !isFinite(v._ratio)) return false;
        if (v.code === 'LIMIT_MIN' || v.code === 'LIMIT_MAX') return false;
        return true;
    };

    // 1️⃣ Lukittu indeksi, jos kelvollinen
    const locked = valves.find(v => v.locked === true && isIndexEligible(v));
    if (locked) return locked;

    // 2️⃣ Muuten pienin suhdeluku kelvollisista
    const candidates = valves.filter(isIndexEligible);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a._ratio - b._ratio);
    return candidates[0];
}

/**
 /**
 * Laskee venttiilin säätöasennon VIRTAUSTAVOITTEEN perusteella
 * – huomioi k-arvot
 * – ei koskaan ylitä min/max-rajoja
 *
 * @param {string} valveType  esim 'h_kso125'
 * @param {number} targetFlow l/s
 * @returns {Object} {
 *   position,        // laskettu tai rajattu asento
 *   limited,         // true jos osuttiin rajaan
 *   limitType,       // 'MIN' | 'MAX' | null
 *   minPos,
 *   maxPos
 * }
 */
 function calculateTargetPosition(valveType, targetFlow) {
    const entry = valveDB[valveType];
    if (!entry || !Array.isArray(entry.data)) {
        return {
            position: null,
            limited: false,
            limitType: null
        };
    }

    // data = [asento, virtaus]
    const curve = entry.data
        .map(([pos, flow]) => ({ pos, flow }))
        .sort((a, b) => a.flow - b.flow);

    const min = curve[0];
    const max = curve[curve.length - 1];

    // 🔒 Alle minimin
    if (targetFlow <= min.flow) {
        return {
            position: min.pos,
            limited: true,
            limitType: 'MIN'
        };
    }

    // 🔓 Yli maksimin
    if (targetFlow >= max.flow) {
        return {
            position: max.pos,
            limited: true,
            limitType: 'MAX'
        };
    }

    // 🔍 Valitse LÄHIN SALLITTU KOKONAISASENTO
    let best = curve[0];
    let bestDiff = Math.abs(targetFlow - best.flow);

    for (const p of curve) {
        const diff = Math.abs(targetFlow - p.flow);
        if (diff < bestDiff) {
            best = p;
            bestDiff = diff;
        }
    }

    return {
        position: best.pos, // 🔒 aina kokonaisluku
        limited: false,
        limitType: null
    };
}


/**
 * Laskee säätöohjeet ja määrittää onko vuorossa venttiilien vai koneen säätö.
 * Säännöt 5-9.
 */
function generateRelativeAdjustmentInstructions(valves, indexValve, tolerance = 0.05) {
    const indexRatio = indexValve._ratio;
    let allBalanced = true;
    let indexLimit = null; // 'MIN' | 'MAX' | null

    const resultValves = valves.map(v => {
        const isIndex = String(v.id) === String(indexValve.id);

        const target = Number(v.target) || 0;
        const flow = Number(v.flow) || 0;

        const relativeTarget = target * indexRatio;
        const delta = flow - relativeTarget;

        let code = 'OK';
        let instruction = 'OK';

        if (isIndex) {
            code = 'INDEX';
            instruction = 'INDEKSI – älä säädä';
        } else {
            const ratioDiff = Math.abs(v._ratio - indexRatio);
            const withinTolerance =
                ratioDiff <= tolerance || Math.abs(delta) < 0.5;

            if (!withinTolerance) {
                allBalanced = false;

                let posResult = null;
                if (typeof calculateTargetPosition === 'function' && v.type) {
                    posResult = calculateTargetPosition(v.type, relativeTarget);
                }

                if (posResult && posResult.limited) {
                    code = posResult.limitType === 'MIN'
                        ? 'LIMIT_MIN'
                        : 'LIMIT_MAX';

                    instruction =
                        posResult.limitType === 'MIN'
                            ? 'VENTTIILI MINIMISSÄ – ei voi kuristaa enempää'
                            : 'VENTTIILI MAKSIMISSA – ei voi avata enempää';

                    // 🔒 Jos indeksi osuu rajaan, talletetaan tieto
                    if (isIndex) {
                        indexLimit = posResult.limitType;
                    }

                } else if (posResult && posResult.position !== null) {
                    const dir = delta > 0 ? 'KURISTA' : 'AVAA';
                    code = delta > 0 ? 'ADJUST_CHOKE' : 'ADJUST_OPEN';
                
                    instruction = `${dir} → asentoon ${posResult.position}`;
                
                    // 🟡 VAROITUS: lähellä rajaa
                    if (posResult.minPos != null && posResult.maxPos != null) {
                        const range = posResult.maxPos - posResult.minPos;
                        const distToMin = posResult.position - posResult.minPos;
                        const distToMax = posResult.maxPos - posResult.position;
                
                        if (distToMin / range < WARNING_LIMITS.valve.nearMinPct) {
                            instruction += ' ⚠️ lähellä minimiä';
                        }
                        if (distToMax / range < WARNING_LIMITS.valve.nearMaxPct) {
                            instruction += ' ⚠️ lähellä maksimia';
                        }
                    }
                }
                 else {
                    code = delta > 0 ? 'ADJUST_CHOKE' : 'ADJUST_OPEN';
                    instruction =
                        delta > 0
                            ? `KURISTA → ${relativeTarget.toFixed(1)} l/s`
                            : `AVAA → ${relativeTarget.toFixed(1)} l/s`;
                }
            }
        }

        return {
            id: v.id,
            isIndex,
            code,
            instruction,
            relativeTarget,
            delta,
            ratio: v._ratio
        };
    });

    // 🔁 VAIHEEN PÄÄTÖS (YHDESSÄ PAIKASSA)
    let phase;
    let machineInstruction;

    if (indexLimit) {
        phase = 'ADJUST_MACHINE';
        machineInstruction =
            indexLimit === 'MAX'
                ? 'Indeksiventtiili on maksimiavauksella – lisää koneen ilmamäärää'
                : 'Indeksiventtiili on minimissä – vähennä koneen ilmamäärää';
    } else {
        phase = allBalanced ? 'ADJUST_MACHINE' : 'ADJUST_VALVES';
        machineInstruction = allBalanced
            ? 'Venttiilit ovat suhteessa – säädä konetta'
            : 'Älä säädä konetta vielä. Tasapainota venttiilit ensin.';
    }

    return {
        indexValve,
        valves: resultValves,
        phase,
        machineInstruction,
        systemIndexRatio: indexRatio
    };
}
function openKLibDetail(entry) {
    if (!entry) return;

    const modal = document.getElementById('klibDetailModal');
    const titleEl = document.getElementById('klibDetailTitle');
    const listEl  = document.getElementById('klibDetailList');
    const warnEl  = document.getElementById('klibDetailWarning');

    if (!modal || !listEl) return;

    // Key muodostus (sama kuin kirjastossa)
    const key = [
        entry.kind, entry.model, entry.size || '', entry.variant || '', entry.pos || ''
    ].join('|');

    // Hae kaikki saman keyn merkinnät
    const all = (window.userKLibraryV2?.entries || []).filter(e => {
        const k = [e.kind, e.model, e.size || '', e.variant || '', e.pos || ''].join('|');
        return k === key;
    });

    // Otsikko
    titleEl.textContent = `${entry.model} ${entry.size ? 'Ø' + entry.size : ''} ${entry.variant || ''}`.trim();

    // Varoitus jos useita
    warnEl.style.display = all.length > 1 ? 'block' : 'none';

    // Lajittelu: hyväksytyt ensin, uusin ensin
    const sorted = all.slice().sort((a, b) => {
        if (!!a.approved !== !!b.approved) return a.approved ? -1 : 1;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });

    const fmtDate = (ts) => {
        if (!ts) return '';
        try { return new Date(ts).toLocaleString('fi-FI'); } catch { return ''; }
    };

    listEl.innerHTML = sorted.map(e => {
        const status = e.approved ? '✅ Käytössä' : '⏳ Odottaa';
        return `
          <div style="border:1px solid #e6e6e6; border-radius:10px; padding:10px;">
            <div style="display:flex; justify-content:space-between; gap:8px;">
              <div>
                <div style="font-weight:700;">K: ${Number(e.k).toFixed(2)} • Avaus: ${e.pos ?? '-'}</div>
                <div style="font-size:12px; color:#666;">
                  ${status}
                  ${e.source ? ' • ' + e.source : ''}
                  ${e.createdBy ? ' • ' + e.createdBy : ''}
                </div>
                <div style="font-size:11px; color:#888;">${fmtDate(e.updatedAt || e.createdAt)}</div>
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button class="btn btn-secondary" disabled>✅ Hyväksy</button>
                <button class="btn btn-secondary" disabled>🗑 Poista</button>
              </div>
            </div>
          </div>
        `;
    }).join('');

    modal.style.display = 'flex';
}

function closeKLibDetail() {
    const modal = document.getElementById('klibDetailModal');
    if (modal) modal.style.display = 'none';
}

function approveWorkingK(idx) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const mm = getActiveMachineMode(p, mode);
    const v = mm.valves?.[idx];
    if (!v) return;

    if (!isFinite(v.kWorking)) return;

    v.kApproved = v.kWorking;

    saveData();
    renderDetailsList();
}



/* =========================================================
   A4.2 – RAPORTTI (JSON + TEKSTI)
   - Raporttiin vain hyväksytyt K-arvot
   - Ei koskaan valmistaja-lähdettä
   - K-arvot aina kontekstiin sidottuna
   ========================================================= */

/**
 * Palauttaa mittaustavan raporttiin.
 * Voit muuttaa tämän myöhemmin jos teillä on tarkempi tieto.
 */
function getMeasurementMethodForReport(p) {
    // Jos teillä on joku oma flagi, käytä sitä. Muuten oletus:
    // "suhteellinen_säätö" kun trunk-säätö käytössä.
    const rel = !!(p?.meta?.relativeAdjustActive);
    return rel ? 'suhteellinen_säätö' : 'mittaus';
  }
  
  /**
 /* =====================================================
   K-ARVOJEN RAPORTOINTI – OIKEA JA LOPULLINEN TOTEUTUS
   ===================================================== */

/**
 * Palauttaa hyväksytyn K-arvon venttiililtä.
 * Vain käyttäjän hyväksymä arvo kelpaa raporttiin.
 */
function getApprovedK(v) {
    if (v && typeof v.kApproved === 'number' && isFinite(v.kApproved)) {
        return v.kApproved;
    }
    return null;
}

/**
 * Palauttaa raportissa käytettävän lähdetekstin.
 * EI KOSKAAN valmistajaa.
 */
function getKSourceLabelForReport() {
    return 'käyttäjän hyväksymä arvo';
}

/**
 * Palauttaa mittaustavan raporttiin.
 * Voidaan laajentaa myöhemmin.
 */
function getMeasurementMethodForReport(p) {
    if (p?.meta?.relativeAdjustActive) {
        return 'suhteellinen säätö';
    }
    return 'mittaus';
}

/**
 * Rakentaa K-arvon kontekstin (SIDOTTU AINA TAPAUKSEEN).
 */
function buildKContext(v, p, currentMode) {
    return {
        mode: currentMode || 'home',
        method: getMeasurementMethodForReport(p),
        valveId: v.id ?? null,
        room: v.room ?? '',
        type: v.type ?? '',
        opening:
            v.pos === null || v.pos === undefined || v.pos === ''
                ? null
                : Number(v.pos)
    };
}

/**
 * =====================================================
 * PÄÄFUNKTIO – RAPORTTIDATAN RAKENNUS
 * =====================================================
 */
function buildReportDataForActiveProject() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return null;

    const currentMode = window.currentMode || 'home';
    const modeObj = p.modes?.[currentMode] || {};
    const valves = modeObj.valves || [];
    const machine = modeObj.machines?.[0] || null;

    // Menetelmä (voit laajentaa myöhemmin)
    const method = 'suhteellinen_säätö';

    // Kerätään VAIN hyväksytyt K-arvot
    const approvedItems = [];

    valves.forEach(v => {
        if (!v.kApproved || typeof v.kApproved.value !== 'number') return;

        approvedItems.push({
            context: {
                mode: currentMode,
                method,
                valveId: v.id ?? null,
                room: v.room ?? '',
                type: v.type ?? '',
                opening: (v.pos === null || v.pos === undefined) ? null : Number(v.pos)
            },
            kApproved: v.kApproved.value,
            kApprovedAt: v.kApproved.approvedAt ?? null,
            kSource: 'käyttäjän hyväksymä arvo',
            measured: {
                flow_ls: v.flow ?? null,
                target_ls: v.target ?? null,
                pressure_pa: v.measuredP ?? null
            }
        });
    });

    return {
        meta: {
            createdAtISO: new Date().toISOString(),
            projectId: p.id,
            projectName: p.name || '',
            mode: currentMode,
            method,
            disclaimer: [
                'Raporttiin kirjataan vain käyttäjän hyväksymät K-arvot.',
                'K-arvojen lähde on aina ohjelman laskennallinen ehdotus tai aiemmin käyttäjän hyväksymä arvo.',
                'K-arvot ovat aina kontekstiin sidottuja (venttiili, koko/tyyppi, avaus, mittaustapa, tila).'
            ]
        },
        machine: machine ? {
            name: machine.name || 'IV-kone',
            flow: machine.flow ?? null
        } : null,
        results: {
            approvedKCount: approvedItems.length,
            approvedKItems: approvedItems
        }
    };
}
function openAddKModal() {
    document.getElementById('addKModal').style.display = 'flex';
    document.getElementById('addKRows').innerHTML = '';
    addKRow();
}

function closeAddKModal() {
    document.getElementById('addKModal').style.display = 'none';
}

function addKRow() {
    const tbody = document.getElementById('addKRows');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input placeholder="-15" style="width:100%"></td>
      <td><input placeholder="1.25" style="width:100%"></td>
      <td><button onclick="this.closest('tr').remove()">✖</button></td>
    `;
    tbody.appendChild(tr);
}

function saveKRows() {
    const kind = document.getElementById('addKKind').value;
    const model = document.getElementById('addKModel').value.trim();
    const size = document.getElementById('addKSize').value.trim();
    const variant = document.getElementById('addKVariant').value.trim();

    if (!model || !size) {
        alert('Malli ja koko ovat pakollisia');
        return;
    }

    window.userKLibraryV2 = window.userKLibraryV2 || { entries: [] };

    const rows = [...document.querySelectorAll('#addKRows tr')];
    let saved = 0;
    let skipped = 0;

    rows.forEach(r => {
        const pos = r.children[0].querySelector('input').value.trim();
        const k = parseFloat(
            r.children[1].querySelector('input').value.replace(',', '.')
        );

        if (!pos || !isFinite(k)) {
            skipped++;
            return;
        }

        window.userKLibraryV2.entries.push({
            kind,
            model,
            size,
            variant,
            pos,
            k,
            source: 'library',
            createdBy: 'user',
            approved: false,
            createdAt: Date.now()
        });

        saved++;
    });

    closeAddKModal();
    renderKLibraryAdmin();

    alert(`Tallennettu ${saved} K-arvoa, ohitettu ${skipped}`);
}
function resolveKForValveContext(ctx) {
    // ctx = { kind, model, size, variant, pos, manualK }

    // 1️⃣ Manuaalinen K voittaa aina
    if (ctx.manualK != null && isFinite(ctx.manualK)) {
        return {
            k: ctx.manualK,
            source: 'manual'
        };
    }

    // 2️⃣ Hae kirjastosta
    const entries = window.userKLibraryV2?.entries || [];

    const matches = entries.filter(e =>
        e.kind === ctx.kind &&
        e.model === ctx.model &&
        String(e.size) === String(ctx.size) &&
        String(e.variant || '') === String(ctx.variant || '') &&
        String(e.pos) === String(ctx.pos)
    );

    if (!matches.length) {
        return null;
    }

    // hyväksytty ensin, muuten uusin
    const approved = matches
        .filter(e => e.approved)
        .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (approved) {
        return {
            k: approved.k,
            source: 'library-approved'
        };
    }

    const latest = matches
        .sort((a, b) => b.createdAt - a.createdAt)[0];

    return {
        k: latest.k,
        source: 'library-latest'
    };
}
function updateKBadge(badgeEl, state) {
    if (!badgeEl) return;

    if (state === 'manual') {
        badgeEl.textContent = '🔒 Manuaalinen K';
        badgeEl.style.color = '#b26a00';
    }
    else if (state === 'library') {
        badgeEl.textContent = '📚 K kirjastosta';
        badgeEl.style.color = '#2e7d32';
    }
    else if (state === 'missing') {
        badgeEl.textContent = '⚠️ K-arvo puuttuu';
        badgeEl.style.color = '#b00020';
    }
    else {
        badgeEl.textContent = '';
    }
}

  /**
   * Tekee ihmisen luettavan tekstiraportin (suomeksi).
   */
  function reportDataToText(report) {
    if (!report) return 'Ei raporttidataa.';
  
    const lines = [];
    lines.push('IV-MITTAUS / SÄÄTÖRAPORTTI');
    lines.push('='.repeat(28));
    lines.push(`Luotu: ${report.meta.createdAtISO}`);
    lines.push(`Projekti: ${report.meta.projectName || report.meta.projectId}`);
    lines.push(`Tila: ${report.meta.mode}`);
    lines.push(`Menetelmä: ${report.meta.method}`);
    lines.push('');
  
    if (report.machine) {
      lines.push('KONE');
      lines.push(`- Nimi: ${report.machine.name}`);
      lines.push(`- Ilmavirta: ${report.machine.flow ?? '-'} `);
      lines.push('');
    }
  
    lines.push('PERIAATTEET');
    report.meta.disclaimer.forEach(t => lines.push(`- ${t}`));
    lines.push('');
  
    lines.push(`HYVÄKSYTYT K-ARVOT (${report.results.approvedKCount} kpl)`);
    lines.push('-'.repeat(28));
  
    if (!report.results.approvedKItems.length) {
      lines.push('Ei hyväksyttyjä K-arvoja.');
      return lines.join('\n');
    }
  
    report.results.approvedKItems.forEach((it, i) => {
      const c = it.context;
      lines.push(`${i + 1}. ${c.room || '(ei huonetta)'} | ${c.type || '(ei tyyppiä)'}`);
      lines.push(`   - Avaus: ${c.opening ?? '-'}`);
      lines.push(`   - Menetelmä: ${c.method}`);
      lines.push(`   - Tila: ${c.mode}`);
      lines.push(`   - K (hyväksytty): ${it.kApproved}`);
      lines.push(`   - Lähde: ${it.kSource}`); // EI valmistajaa
      const m = it.measured || {};
      lines.push(`   - Mittaus: ${m.flow_ls ?? '-'} l/s, tavoite ${m.target_ls ?? '-'} l/s, paine ${m.pressure_pa ?? '-'} Pa`);
      lines.push('');
    });
  
    return lines.join('\n');
  }
  
  /**
   * Lataa tiedoston (helper).
   */
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  function downloadJsonFile(filename, obj) {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Päätoiminnot:
   * - exportReportJSON()
   * - exportReportText()
   */
  function exportReportJSON() {
    const report = buildReportDataForActiveProject();
    if (!report) return null;

    console.log('📄 Raportti (JSON):', report);
    return report;
}
function saveCurrentKToLibrary() {
    console.warn('saveCurrentKToLibrary: vanha K-kirjastotoiminto poistettu (V2)');
}

function exportReportText() {
    const report = buildReportDataForActiveProject();
    if (!report) return 'Ei raporttidataa.';

    const lines = [];

    lines.push('IV-SÄÄTÖ / MITTAUSRAPORTTI');
    lines.push('='.repeat(30));
    lines.push(`Luotu: ${report.meta.createdAtISO}`);
    lines.push(`Projekti: ${report.meta.projectName || report.meta.projectId}`);
    lines.push(`Tila: ${report.meta.mode}`);
    lines.push(`Menetelmä: ${report.meta.method}`);
    lines.push('');

    if (report.machine) {
        lines.push('KONE');
        lines.push(`- Nimi: ${report.machine.name}`);
        lines.push(`- Ilmavirta: ${report.machine.flow ?? '-'} l/s`);
        lines.push('');
    }

    lines.push('PERIAATTEET');
    report.meta.disclaimer.forEach(t => lines.push(`- ${t}`));
    lines.push('');

    lines.push(`HYVÄKSYTYT K-ARVOT (${report.results.approvedKCount} kpl)`);
    lines.push('-'.repeat(30));

    if (!report.results.approvedKItems.length) {
        lines.push('Ei hyväksyttyjä K-arvoja.');
        return lines.join('\n');
    }

    report.results.approvedKItems.forEach((it, i) => {
        const c = it.context;
        const m = it.measured || {};

        lines.push(`${i + 1}. ${c.room || '(ei huonetta)'} | ${c.type || '(ei tyyppiä)'}`);
        lines.push(`   - Avaus: ${c.opening ?? '-'}`);
        lines.push(`   - Menetelmä: ${c.method}`);
        lines.push(`   - Tila: ${c.mode}`);
        lines.push(`   - K (hyväksytty): ${it.kApproved}`);
        lines.push(`   - Lähde: ${it.kSource}`);
        lines.push(`   - Mittaus: ${m.flow_ls ?? '-'} l/s, tavoite ${m.target_ls ?? '-'} l/s, paine ${m.pressure_pa ?? '-'} Pa`);
        lines.push('');
    });

    const text = lines.join('\n');
    console.log('📄 Raportti (teksti):\n' + text);
    return text;
}
function downloadReportJSON() {
    const report = buildReportDataForActiveProject();
    if (!report) {
        alert('Ei raportoitavaa dataa.');
        return;
    }

    const filename =
        `iv-raportti-${report.meta.projectId}-${report.meta.mode}-${new Date().toISOString().slice(0,10)}.json`;

    downloadJsonFile(filename, report);
}
// 🔁 MIGRAATIO: vanha projekti → modes-rakenne
function migrateProjectToModes(p) {
    if (!p) return;

    // Jos modes on jo olemassa, ei tehdä mitään
    if (p.modes && typeof p.modes === 'object') return;

    // Luo modes ja siirrä vanhat venttiilit home-modeen
    p.modes = {
        home: {
            valves: Array.isArray(p.valves) ? p.valves : [],
            machines: Array.isArray(p.machines) ? p.machines : []
        }
    };

    // Poista vanhat suorat kentät
    delete p.valves;
    delete p.machines;

    console.log('🔁 Projekti migroitu modes-rakenteeseen:', p.name);
}
function openKLibraryPicker() {
    console.warn('openKLibraryPicker: vanha toiminto poistettu (V2)');
}

function downloadReportText() {
    const report = buildReportDataForActiveProject();
    if (!report) {
        alert('Ei raportoitavaa dataa.');
        return;
    }

    const text = reportDataToText(report);
    const filename =
        `iv-raportti-${report.meta.projectId}-${report.meta.mode}-${new Date().toISOString().slice(0,10)}.txt`;

    downloadTextFile(filename, text);
}

window.openKLibraryPicker = openKLibraryPicker;
window.saveCurrentKToLibrary = saveCurrentKToLibrary;


window.openKLibraryPicker = openKLibraryPicker;
window.saveCurrentKToLibrary = saveCurrentKToLibrary;


