
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
captureCurrentMapUiState();

window.mapViewFilter = { type: 'all', ductId: null }; // 'all' | 'duct'
window.activeDuctLane = null; // 'supply' | 'extract' | null

// 🗺️ Kartan UI-tila (EI DATAA)
window.mapViewState = window.mapViewState || {
    activeValveId: null,
    activeDuctId: null
};
window.mapWorldState = {
    x: 0,
    y: 0,
    scale: 1
};


window.machineZoom = 'all'; 
// arvot: 'all' | 'duct'
window.visualZoom = 'building';
// arvot: 'building' | 'unit' | 'machine'
window.activeDuctLane = null;
// 'supply' | 'extract' | null

window.activeDuctId = null;

// Mode = home/away/boost
window.currentMode = window.currentMode || 'home';

// UI-tila (konevalinta, myöhemmin zoom/scroll yms.)
window.uiState = window.uiState || {
    activeMachineId: null,
    indexLocked: false,
    indexValveId: null
};
// 🗺️ Kartan näkymäsuodatin (vain UI, ei dataa)
captureCurrentMapUiState();

window.mapViewFilter = {
    type: 'all',   // 'all' | 'duct'
    ductId: null
};
window.mapLevel = 'ducts'; 
// 'machines' = konekartta
// 'ducts'    = runko + venttiilit (nykyinen)


// -----------------------
// HELPERS
// -----------------------
function safeJsonParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
}
function roundValveOpening(value, step = 0.5) {
    if (!isFinite(Number(value))) return null;
    return Math.round(Number(value) / step) * step;
}
function getRatioClass(v) {
    if (!isFinite(v._uiRatio)) return 'ratio-none';
    if (v._uiIsIndex) return 'ratio-index';

    if (v._uiRatio < 0.9) return 'ratio-low';     // vajaata
    if (v._uiRatio > 1.1) return 'ratio-high';    // liikaa
    return 'ratio-ok';                             // ok
}
function formatOpening(val) {
    if (!isFinite(val)) return '-';
    return (Math.round(val * 2) / 2).toFixed(1);
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
   // varmista että data on muistissa ja appState synkassa
if (typeof loadData === 'function') loadData();
window.appState = window.appState || {};
window.appState.projects = projects;


    // 🔥 LUODAAN PROJEKTI
    const projectId = window.createProject({ name, systemType });

    console.log('✅ Projekti luotu:', projectId);

    closeModal();

    // 🔑 AVAA PROJEKTI SUORAAN OIKEAAN NÄKYMÄÄN
    activateProject(projectId, 'home');
}
function showRelativeAdjustShortcut() {
    if (!activeProjectId) {
        alert('Luo tai avaa projekti ensin.');
        return;
    }
    // tähän voidaan myöhemmin ohjata suoraan relative-säätö näkymään
    activateProject(activeProjectId, 'home');
}
function applyMapTransform() {
    const world = document.getElementById('mapWorld');
    if (!world) return;

    const { x, y, scale } = window.mapWorldState;
    world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
function ensureMapDom() {
    const containerEl = document.getElementById('visContent');
    if (!containerEl) {
        console.error('❌ ensureMapDom: visContent puuttuu');
        return null;
    }

    // 1) Vaihda visContent "map-tilaan" (CSS:ssä se on flex kerrostaloa varten)
    containerEl.style.display = 'block';
    containerEl.style.padding = '0';
    containerEl.style.minWidth = '0';
    containerEl.style.height = '100%';

    // 2) Luo DOM jos puuttuu
    let viewport = document.getElementById('mapViewport');
    let world = document.getElementById('mapWorld');

    if (!viewport || !world) {
        containerEl.innerHTML = `
            <div id="mapViewport"
                 style="position:relative; width:100%; height:80vh; overflow:hidden; touch-action:none;">
                <div id="mapWorld"
                     style="position:absolute; left:0; top:0; transform-origin:0 0;">
                </div>
            </div>
        `;

        viewport = document.getElementById('mapViewport');
        world = document.getElementById('mapWorld');
    }

    if (!viewport || !world) {
        console.error('❌ ensureMapDom: mapViewport/mapWorld ei saatu luotua');
        return null;
    }

    // 3) world state
    if (!window.mapWorldState) {
        window.mapWorldState = { x: 0, y: 0, scale: 0.7 }; // 0.7 => aloittaa "machines"
    } else {
        if (typeof window.mapWorldState.x !== 'number') window.mapWorldState.x = 0;
        if (typeof window.mapWorldState.y !== 'number') window.mapWorldState.y = 0;
        if (typeof window.mapWorldState.scale !== 'number') window.mapWorldState.scale = 0.7;
    }

    return { viewport, world, containerEl };
}
function fitMapToScreen(padding = 60) {
    const viewport = document.getElementById('mapViewport');
    const world = document.getElementById('mapWorld');
    if (!viewport || !world) return;

    const viewportRect = viewport.getBoundingClientRect();
    const worldRect = world.getBoundingClientRect();

    const contentWidth = worldRect.width;
    const contentHeight = worldRect.height;

    if (contentWidth === 0 || contentHeight === 0) return;

    const scaleX = (viewportRect.width - padding * 2) / contentWidth;
    const scaleY = (viewportRect.height - padding * 2) / contentHeight;

    // Valitaan pienempi → kaikki varmasti näkyy
    let newScale = Math.min(scaleX, scaleY);

    // Rajoitukset (samat kuin zoomissa)
    newScale = Math.min(3, Math.max(0.3, newScale));

    // Keskitys
    const offsetX =
        (viewportRect.width - contentWidth * newScale) / 2;
    const offsetY =
        (viewportRect.height - contentHeight * newScale) / 2;

    window.mapWorldState.scale = newScale;
    window.mapWorldState.x = offsetX;
    window.mapWorldState.y = offsetY;

    applyMapTransform();

    // Päivitä karttataso zoomin mukaan
    const newLevel = resolveMapLevelFromZoom(newScale);
    if (newLevel !== window.mapLevel) {
        window.mapLevel = newLevel;
        renderVisualContent();
    }
}

function enableMapPan() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    viewport.addEventListener('pointerdown', e => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', e => {
        if (!dragging) return;

        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;

        window.mapWorldState.x += dx;
        window.mapWorldState.y += dy;

        lastX = e.clientX;
        lastY = e.clientY;

        applyMapTransform();
    });

    viewport.addEventListener('pointerup', () => {
        dragging = false;
    });

    viewport.addEventListener('pointerleave', () => {
        dragging = false;
    });
}
// ─────────────────────────────────
// ZOOM → KARTTATASO RAJAT (LOD)
// ─────────────────────────────────
const ZOOM_TO_DUCTS  = 0.9;
const ZOOM_TO_VALVES = 1.4;
const ZOOM_TO_VALVE_DOTS = 1.1;

function resolveMapLevelFromZoom(scale) {
    if (scale >= ZOOM_TO_VALVES) return 'valves';
    if (scale >= ZOOM_TO_DUCTS)  return 'ducts';
    return 'machines';
}

function enableMapZoom() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;

    viewport.addEventListener('wheel', e => {
        // 🔒 Estä liian tiheä zoom (yksi per frame)
if (window.__zooming) return;
window.__zooming = true;
requestAnimationFrame(() => {
    window.__zooming = false;
});

        e.preventDefault();

        if (!window.mapWorldState) return;

        // 🧠 Trackpad-ystävällinen zoom
        const zoomSpeed = 0.0008; // säädä tarvittaessa
        const rawDelta = -e.deltaY * zoomSpeed;

        // 🔒 Rajoita yhden tapahtuman vaikutus
        const delta = Math.max(-0.05, Math.min(0.05, rawDelta));

        const prevScale = window.mapWorldState.scale;
        const prevLevel = window.mapLevel || 'machines';

        let newScale = prevScale + delta;
        newScale = Math.min(3, Math.max(0.3, newScale));

        // Jos muutos on mitätön → ei tehdä mitään
        if (Math.abs(newScale - prevScale) < 0.0001) return;

        // 🔍 Päivitä zoom
        // 🔍 ZOOM HIIREN KOHTAAN (ankkuroitu)
const rect = viewport.getBoundingClientRect();
const mx = e.clientX - rect.left;
const my = e.clientY - rect.top;

const prevScale2 = prevScale;
const scaleRatio = newScale / prevScale2;

// Siirrä karttaa niin, että zoom tapahtuu hiiren alla
window.mapWorldState.x =
    mx - scaleRatio * (mx - window.mapWorldState.x);

window.mapWorldState.y =
    my - scaleRatio * (my - window.mapWorldState.y);

window.mapWorldState.scale = newScale;
applyMapTransform();


        // 🗺️ Päätä karttataso zoomin perusteella
        const newLevel = resolveMapLevelFromZoom(newScale);

        // 🔁 Jos karttataso vaihtui
        if (newLevel !== prevLevel) {
            window.mapLevel = newLevel;

            // 🧠 Venttiilitasolla lukitse zoom järkevälle tasolle
            if (newLevel === 'valves') {
                window.mapWorldState.scale = ZOOM_TO_VALVES + 0.15;
                applyMapTransform();
            }

            console.log(
                '🔄 Karttataso vaihtui:',
                newLevel,
                'scale=',
                window.mapWorldState.scale.toFixed(2)
            );

            if (typeof renderVisualContent === 'function') {
                renderVisualContent();
            }

            // 🎯 Sovita kartta näkymään tasovaihdon jälkeen
            if (typeof fitMapToScreen === 'function') {
                requestAnimationFrame(() => {
                    fitMapToScreen(80);
                });
            }
        }
    }, { passive: false });
}


function loadProjectsFromStorage() {
    try {
        const raw = localStorage.getItem('iv_projects');
        const parsed = raw ? JSON.parse(raw) : [];

        // ✅ appState
        if (!window.appState) window.appState = {};
        window.appState.projects = Array.isArray(parsed) ? parsed : [];

        // ✅ legacy/UI
        projects = window.appState.projects;

        console.log('📦 Projektit ladattu:', projects.length);

        // ✅ palauta viimeksi aktiivinen (jos on)
        const last = localStorage.getItem('iv_active_project_id');
        if (last && projects.some(p => p.id === last)) {
            window.appState.activeProjectId = last;
            activeProjectId = last;
        }
    } catch (e) {
        console.error('❌ Projektien lataus epäonnistui', e);
        if (!window.appState) window.appState = {};
        window.appState.projects = [];
        projects = [];
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
    // 🔧 KONEKOHTAINEN UI-TILA
    p.uiState.machines = p.uiState.machines || {};

    // Heijasta projektin uiState globaaliksi (että nykykoodi toimii)
    window.uiState = { ...window.uiState, ...p.uiState };
}
function getMachineUiState(machineId) {
    if (!window.uiState) window.uiState = {};
    if (!window.uiState.machines) window.uiState.machines = {};
    if (!window.uiState.machines[machineId]) {
        window.uiState.machines[machineId] = {
            map: {},
            zoom: null
        };
    }
    return window.uiState.machines[machineId];
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
        // ✅ Kun mennään etusivun projektinäkymään, piirrä lista aina
    if (viewId === 'view-projects') {
        try { renderProjectsHome(); } catch (e) { console.warn(e); }
    }

}

// ===============================
// PROJEKTIN LUONTI (PUHDAS)
// ===============================
 // ===============================
// PROJEKTIN LUONTI (Yksi totuus: projects + saveData)
// ===============================
window.createProject = function ({ name, systemType }) {
    // varmista että data on muistissa (varmistaa projects-taulukon)
    if (typeof loadData === 'function') loadData();

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
        createdAt: Date.now(),
        archived: false
    };

    // ✅ YKSI TOTUUS: globaali projects
    if (!Array.isArray(projects)) projects = [];
    projects.push(project);

    // ✅ aktiiviseksi heti
    activeProjectId = project.id;

    // ✅ appState peilaa projectsiin (ei omaa erillistä listaa)
    window.appState = window.appState || {};
    window.appState.projects = projects;

    // ✅ tallenna aina samaa kautta
    if (typeof saveData === 'function') saveData();

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
window._activeKLibGroup = null;

function klibLoad() {
    // päätallennusavain (yksi totuus)
    const KEY = 'KLIB_V2';

    // legacy (sulla ollut käytössä)
    const LEGACY = 'userKLibraryV2';

    let parsed = null;

    // 1) yritä uusi avain
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) parsed = JSON.parse(raw);
    } catch (e) {
        console.warn('klibLoad: KLIB_V2 parse failed', e);
    }

    // 2) fallback legacyyn + migraa uuteen
    if (!parsed) {
        try {
            const rawLegacy = localStorage.getItem(LEGACY);
            if (rawLegacy) parsed = JSON.parse(rawLegacy);
        } catch (e) {
            console.warn('klibLoad: userKLibraryV2 parse failed', e);
        }

        if (parsed) {
            // migraatio: tallenna myös uuteen avaimeen
            try { localStorage.setItem(KEY, JSON.stringify(parsed)); } catch (e) {}
        }
    }

    // 3) varmista rakenne
    if (!parsed || typeof parsed !== 'object') {
        parsed = { version: 2, entries: [] };
    }
    if (!Array.isArray(parsed.entries)) parsed.entries = [];

    window.userKLibraryV2 = parsed;
    return window.userKLibraryV2;
}

function klibSave() {
    const KEY = 'KLIB_V2';
    const LEGACY = 'userKLibraryV2';

    ensureUserKLibraryReady();

    // siivoa minimirakenne
    if (!window.userKLibraryV2.version) window.userKLibraryV2.version = 2;
    if (!Array.isArray(window.userKLibraryV2.entries)) window.userKLibraryV2.entries = [];

    try {
        const payload = JSON.stringify(window.userKLibraryV2);
        localStorage.setItem(KEY, payload);

        // pidetään legacy mukana vielä hetki (ettei mikään vanha kohta hajoa)
        localStorage.setItem(LEGACY, payload);
    } catch (e) {
        console.error('klibSave failed:', e);
    }
}
function klibApproveAllForCurrent() {
  const ctx = window.__klibDetailCtx;
  if (!ctx) return;

  const lib = window.userKLibraryV2;
  if (!lib || !Array.isArray(lib.entries)) return;

  let changed = false;

  lib.entries.forEach(e => {
    if (
      !e.approved &&
      String((e.kind || '').toLowerCase()) === ctx.kind &&
      String(e.model || '').trim() === ctx.model &&
      String(e.size || '').trim() === ctx.size &&
      String(e.variant || '').trim() === ctx.variant
    ) {
      e.approved = true;
      e.updatedAt = Date.now();
      changed = true;
    }
  });

  if (changed) {
    try {
      localStorage.setItem('KLIB_V2', JSON.stringify(lib));
      localStorage.setItem('userKLibraryV2', JSON.stringify(lib));
    } catch (e) {
      console.warn('K-kirjaston tallennus epäonnistui', e);
    }
  }

  // Päivitä näkymä
  renderKLibDetail();
}
function renderProjectsHome() {
    // varmista uusin data
    if (typeof loadData === 'function') loadData();

    // pidä appState synkassa
    window.appState = window.appState || {};
    window.appState.projects = projects;

    const listEl = document.getElementById('projectsList');
    const msgEl  = document.getElementById('noProjectsMsg');
    if (!listEl) return;

    const active = (activeProjectId != null) ? String(activeProjectId) : '';

    // suodata: etusivulle vain ei-arkistoidut
    const activeProjects = (projects || []).filter(p => !p?.archived);

    if (msgEl) msgEl.style.display = activeProjects.length ? 'none' : 'block';

    listEl.innerHTML = activeProjects.map(p => {
        const isActive = String(p.id) === active;
        return `
          <div style="
              background:#fff;
              border:1px solid #e6e6e6;
              border-radius:14px;
              padding:12px;
              margin:10px 0;
              display:flex;
              gap:10px;
              align-items:center;
              justify-content:space-between;
          ">
            <div style="min-width:0;">
              <div style="font-weight:800; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${p.name || 'Nimetön projekti'}
                ${isActive ? `<span style="margin-left:8px; font-size:11px; color:#2e7d32;">(aktiivinen)</span>` : ``}
              </div>
              <div style="font-size:12px; color:#666; margin-top:4px;">
                ${p.systemType || ''} • ${p.id}
              </div>
            </div>
<div style="display:flex; gap:8px; flex-shrink:0;">
  <button class="btn btn-primary"
          onclick="activateProject('${p.id}','home')">
    Avaa
  </button>

  <button class="btn btn-secondary"
          onclick="archiveProject('${p.id}')">
    Arkistoi
  </button>

  <button class="btn btn-danger"
          onclick="deleteProject('${p.id}')">
    🗑 Poista
  </button>
</div>

          </div>
        `;
    }).join('');
}

function archiveProject(projectId) {
    if (!projectId) return;
    if (typeof loadData === 'function') loadData();

    const p = (projects || []).find(x => String(x.id) === String(projectId));
    if (!p) return;

    if (!confirm(`Arkistoidaanko projekti "${p.name || p.id}"?\n\n(Se ei näy etusivulla, mutta löytyy kansiosta.)`)) return;

    p.archived = true;

    // jos arkistoitiin aktiivinen -> vaihda seuraavaan
    if (String(activeProjectId) === String(projectId)) {
        const next = (projects || []).find(x => !x.archived);
        activeProjectId = next ? next.id : null;
    }

    if (typeof saveData === 'function') saveData();
    renderProjectsHome();
}
function deleteProject(projectId) {
    if (!projectId) return;

    if (typeof loadData === 'function') loadData();

    const p = (projects || []).find(x => String(x.id) === String(projectId));
    if (!p) {
        alert('Projektia ei löytynyt');
        return;
    }

    const label = p.archived ? 'arkistoidun projektin' : 'keskeneräisen projektin';

    const ok = confirm(
        `Poistetaanko ${label}:\n\n"${p.name || p.id}"\n\n` +
        `Tätä toimintoa ei voi perua.`
    );
    if (!ok) return;

    // 🔥 poista listasta
    projects = projects.filter(x => String(x.id) !== String(projectId));

    // jos poistettiin aktiivinen projekti → nollaa
    if (String(activeProjectId) === String(projectId)) {
        activeProjectId = null;
        localStorage.removeItem('iv_active_project_id');
    }

    // tallenna
    if (typeof saveData === 'function') saveData();

    // päivitä näkymät
    try { renderProjectsHome(); } catch {}
    try { renderProjectArchive?.(); } catch {}
}


function klibRebuildIndexSmart() {
    const idx = {};
    const buckets = new Map();

    (window.userKLibraryV2.entries || []).forEach(ent => {
        const key = klibMakeKey(ent);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(ent);
    });

    buckets.forEach((list, key) => {
        const approved = list
            .filter(x => x.approved)
            .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0))[0];

        const latest = list
            .slice()
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

        const chosen = approved || latest;
        if (chosen) idx[key] = chosen.id;
    });

    window.userKLibraryV2.index = idx;
}

// sallii useita entryjä per sama venttiili+asento
function klibUpsertEntry(entry, { warn = true } = {}) {
    if (!entry) return null;

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

    if (!entry.id) entry.id = 'k_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    if (!entry.createdAt) entry.createdAt = Date.now();
    entry.updatedAt = Date.now();

    // ✅ älä pakota hyväksyntää
    entry.approved = !!entry.approved;
    if (entry.approved && !entry.approvedAt) entry.approvedAt = Date.now();

    window.userKLibraryV2.entries.push(entry);

    // ✅ index osoittaa "käytössä olevaan" (viimeisin hyväksytty muuten viimeisin)
    klibRebuildIndexSmart();
    klibSave();

    return entry.id;
}



function klibFindK({ kind, model, size, variant, pos }) {
  const key = klibMakeKey({ kind, model, size, variant, pos });
  const id = window.userKLibraryV2.index[key];
  if (!id) return null;
  return window.userKLibraryV2.entries.find(x => x.id === id) || null;
}
function approveAllInOpenGroup() {
    const g = window._activeKLibGroup;
    if (!g || !Array.isArray(g.entries)) return;

    const now = Date.now();
    let changed = false;

    g.entries.forEach(e => {
        if (!e.approved) {
            e.approved = true;
            e.approvedAt = now;
            e.updatedAt = now;
            changed = true;
        }
    });

    if (!changed) {
        alert('Kaikki rivit on jo hyväksytty.');
        return;
    }

    // 🔑 tallenna + rakenna index uudelleen
    klibSave();

    if (typeof klibRebuildIndexSmart === 'function') {
        klibRebuildIndexSmart();
    }

    // 🔄 päivitä ryhmä heti
    refreshOpenGroup();

    // 🔄 päivitä myös taustalla oleva lista
    if (window.uiState?.currentView === 'view-klib-admin') {
        renderKLibraryAdmin();
    }
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
   const machine = getActiveMachine(p);
if (!machine) return null;

const mode = window.currentMode || 'home';
const mm = machine.modes?.[mode];
if (!mm) return null;

const duct = mm.ducts.find(d => String(d.id) === String(ductEl.value));

    return duct?.type || null; // 'supply' | 'extract'
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
function renderAdjustHint(v) {
    const t = v.adjustTurns;
    if (!Number.isFinite(t)) return '';

    // pyöristys kenttäkäyttöön (1 kierros)
    const turns = Math.round(Math.abs(t));
    if (turns === 0) return ' –';

    return t > 0
        ? ` <span class="adj up">▲${turns}</span>`
        : ` <span class="adj down">▼${turns}</span>`;
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
.map(v => calcPct(getValveFlowEffective(v), v.target))
        .filter(v => v != null);

    if (!vals.length) return;

    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const el = document.getElementById(`duct-${duct.id}-status`);
    if (!el) return;

    el.textContent = `${avg}%`;
    el.className = 'duct-status ' + pctClass(avg);
}
// ✅ FIX: bindMeasurementListV2 – tekee oikeasti asiat (save + draft-promote + rerender)
function bindMeasurementListV2(container) {
    // ❌ POIS KÄYTÖSTÄ – korvattu V3:lla
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
if (isFinite(v.flowEffective)) flow += Number(v.flowEffective);
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
sumFlow: supply.reduce((a, v) => {
    const f = getValveFlowEffective(v);
    return a + (isFinite(f) ? f : 0);
}, 0),
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

function saveKToLibraryV2({ kind, model, size, variant = '', pos, k, source = 'field', note = '' }) {
    ensureUserKLibraryReady();

    const entry = {
        id: (crypto?.randomUUID ? crypto.randomUUID() : 'k_' + Date.now()),
        kind: String(kind || 'other').toLowerCase().trim(),   // supply / extract / damper / other
        model: String(model || '').trim(),
        size: String(size || '').trim(),
        variant: String(variant || '').trim(),
        pos: Number(pos),
        k: Number(k),

        approved: false,               // kenttäarvot aina odottavia
        source: String(source || 'field'),
        note: String(note || ''),

        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    // lisää (EI korvata tässä vaiheessa; käytössä-logiikka hoitaa valinnan)
    window.userKLibraryV2.entries.push(entry);

    // tallenna pysyvästi (yksi totuus)
    klibSave();

    // päivitä näkymä jos auki
    if (typeof renderKLibraryAdmin === 'function') {
        renderKLibraryAdmin();
    }

    console.log('📚 K-arvo tallennettu kirjastoon (V2):', entry);
    return entry;
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

function getIndexValve() {
    return null;
}


function getIndexValveForDuct() {
    return null; // sallittu, mutta EI saa aiheuttaa virhettä
}

function calculateRelativeAdjustmentForDuct() {
    return { action: 'none' }; // EI null
}



/**
 * Laskee suhteellisen K-arvon rungon indeksiventtiilin perusteella
 * @param {string|number} ductId – rungon id
 * @param {number} valveIdx – venttiilin indeksi
 * @returns {number|null}
 */







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
    const pos = parseFloat(document.getElementById('valve-pos')?.value);
    const pa  = parseFloat(document.getElementById('valve-pa')?.value);

    // 🔑 PÄÄTELAITTEEN AVAINLOGIIKKA
    // näkyvä teksti (esim "jorma 125")
    const typeText = document.getElementById('valve-size')?.value;

    // kModel tallennetaan modaalin datasettiin kun päätelaite valitaan kirjastosta
    const kModel = document.getElementById('valve-size')?.dataset?.kModel || null;

    const outEl = document.getElementById('k-source-text');
    const kInp  = document.getElementById('valve-k');

    if (!outEl) return;

    outEl.textContent = '';

    // 🔒 Perustarkistukset
    if ((!typeText && !kModel) || isNaN(pos) || isNaN(pa) || pa <= 0) {
        outEl.textContent = 'Syötä päätelaite, avaus ja paine K-ehdotusta varten';
        return;
    }

    if (typeof resolveKForValve !== 'function') {
        outEl.textContent = 'K-laskentaa ei saatavilla';
        return;
    }

    // 🔑 OIKEA HAKUOBJEKTI:
    // jos kModel on tiedossa → käytä sitä
    const valveForK = {
        type: kModel || typeText,   // 🔥 TÄMÄ ON KORJAUS
        pos,
        measuredP: pa
    };

    let kRes;
    try {
        kRes = resolveKForValve(valveForK);
    } catch (e) {
        outEl.textContent = 'K-laskenta epäonnistui';
        return;
    }

    const k = (kRes && typeof kRes === 'object') ? kRes.value : kRes;

    if (typeof k === 'number' && isFinite(k) && k > 0) {
        outEl.innerHTML = `Ehdotettu K-arvo: <b>${k.toFixed(2)}</b>`;

        // ✨ täytä kenttä vain jos käyttäjä ei ole syöttänyt itse
        if (kInp && (!kInp.value || Number(kInp.value) === 0)) {
            kInp.value = k.toFixed(2);
        }
    } else {
        outEl.textContent = 'K-ehdotusta ei löytynyt tälle avaukselle';
    }
}



function klibResolveActiveEntry(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;

    const approved = entries
        .filter(e => e.approved)
        .sort((a, b) =>
            (b.updatedAt || b.createdAt || 0) -
            (a.updatedAt || a.createdAt || 0)
        );

    if (approved.length) return approved[0];

    return entries
        .slice()
        .sort((a, b) =>
            (b.updatedAt || b.createdAt || 0) -
            (a.updatedAt || a.createdAt || 0)
        )[0];
}
function klibResolveActivePerPos(entries) {
    const byPos = new Map();

    for (const e of entries || []) {
        const pos = String(e.pos);
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos).push(e);
    }

    const activeByPos = new Map();

    for (const [pos, list] of byPos.entries()) {
        // 1️⃣ hyväksytty uusin
        const approved = list
            .filter(x => x.approved)
            .sort((a, b) =>
                (b.updatedAt || b.createdAt || 0) -
                (a.updatedAt || a.createdAt || 0)
            );

        if (approved.length) {
            activeByPos.set(pos, approved[0]);
            continue;
        }

        // 2️⃣ muuten uusin tallennettu
        const latest = list
            .slice()
            .sort((a, b) =>
                (b.updatedAt || b.createdAt || 0) -
                (a.updatedAt || a.createdAt || 0)
            )[0];

        if (latest) activeByPos.set(pos, latest);
    }

    return activeByPos;
}

function hasCompetingEntries(entries) {
    if (!Array.isArray(entries) || entries.length < 2) return false;

    const byPos = new Map();
    for (const e of entries) {
        const key = String(e.pos);
        byPos.set(key, (byPos.get(key) || 0) + 1);
        if (byPos.get(key) > 1) return true;
    }
    return false;
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
        source: payload.source || 'manual',
        approved: false,              // 🔒 EI automaattisesti hyväksytty
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    klibUpsertEntry(entry, { warn: true });

    // suljetaan vain K-arvon lisäysmodaali
    if (typeof closeAddKModal === 'function') {
        closeAddKModal();
    }

    // 🔁 Päivitä UI yhdestä paikasta
   if (typeof renderKLibraryAdmin === 'function') {
    renderKLibraryAdmin();
}

}
window._klibGroupCache = {};
renderKLibraryAdmin();


function renderKLibraryAdmin() {
    // Varmista että kirjastodata on muistissa
    try { if (typeof klibLoad === 'function') klibLoad(); } catch (e) {}

    const infoEl   = document.getElementById('klibAdminInfo');
    const listEl   = document.getElementById('klibAdminCards');
    const searchEl = document.getElementById('klibSearch');
    const viewEl   = document.getElementById('view-klib-admin');

    if (!listEl || !viewEl) return;

    // ===============================
    // UI-tila
    // ===============================
    window.uiState = window.uiState || {};
    if (!window.uiState.klibCategory) window.uiState.klibCategory = 'valve';

    const category = window.uiState.klibCategory;
    const q = (searchEl?.value || '').trim().toLowerCase();

    // ===============================
    // KATEGORIAVALITSIN
    // ===============================
    let tabsEl = document.getElementById('klibCategoryTabs');
    if (!tabsEl) {
        tabsEl = document.createElement('div');
        tabsEl.id = 'klibCategoryTabs';
        tabsEl.style.display = 'flex';
        tabsEl.style.gap = '6px';
        tabsEl.style.marginBottom = '10px';
        tabsEl.style.flexWrap = 'wrap';

        if (searchEl && searchEl.parentElement) {
            searchEl.parentElement.insertBefore(tabsEl, searchEl);
        } else {
            viewEl.prepend(tabsEl);
        }
    }

    const CATS = [
        { id: 'valve',    label: 'Venttiilit' },
        { id: 'damper',   label: 'Säätimet' },
        { id: 'diffuser', label: 'Hajottajat' },
        { id: 'other',    label: 'Muut' },
        { id: 'all',      label: 'Kaikki' }
    ];

    tabsEl.innerHTML = CATS.map(c => `
        <button class="btn ${category === c.id ? 'btn-primary' : 'btn-secondary'}"
                style="font-size:12px; padding:6px 10px;"
                onclick="window.uiState.klibCategory='${c.id}'; renderKLibraryAdmin();">
            ${c.label}
        </button>
    `).join('');

    // ===============================
    // DATA
    // ===============================
    const entries = (window.userKLibraryV2?.entries || []).slice();

    const categoryOf = (e) => {
        const raw = String(e?.kind || '').toLowerCase().trim();

        // suorat osumat
        if (raw === 'supply' || raw === 'extract' || raw === 'valve') return 'valve';
        if (raw === 'damper') return 'damper';
        if (raw === 'diffuser') return 'diffuser';
        if (raw === 'other') return 'other';

        // fallback mallin perusteella
        const model = String(e?.model || '').toLowerCase();
        if (model.includes('pelti') || model.includes('damper')) return 'damper';
        if (model.includes('hajottaja') || model.includes('diffuser')) return 'diffuser';

        return 'valve';
    };

    const norm = (s) => String(s == null ? '' : s).toLowerCase().trim();
    const num = (x) => {
        const n = Number(String(x).replace(',', '.'));
        return isFinite(n) ? n : null;
    };

    // “Windows-tyyli”: ryhmitetään venttiileittäin (malli+koko+variantti+kategoria)
    const groupKeyOf = (e) => {
        const cat = categoryOf(e);
        const model = norm(e.model);
        const size = norm(e.size);
        const variant = norm(e.variant);
        return [cat, model, size, variant].join('|');
    };

    const groupTitleOf = (e) => {
        const model = (e.model || '').trim();
        const size = (e.size || '').toString().trim();
        const variant = (e.variant || '').toString().trim();
        return `${model}${size ? ' Ø' + size : ''}${variant ? ' • ' + variant : ''}`;
    };

    const haystackGroup = (g) => {
        // hae ryhmän nimellä + rivisisällöllä
        const base = `${g.cat} ${g.model} ${g.size} ${g.variant}`.toLowerCase();
        if (!q) return base;
        // nopea: jos osuu baseen → ok, muuten katsotaan entryt
        if (base.includes(q)) return base;
        const deep = g.entries.map(e => [
            e.pos, e.k, e.note, e.source, e.approved ? 'approved' : 'pending'
        ].join(' ')).join(' ').toLowerCase();
        return base + ' ' + deep;
    };

    // ===============================
    // RYHMITTELY
    // ===============================
    const groupsMap = new Map();
    for (const e of entries) {
        if (!e || !e.model) continue;

        const cat = categoryOf(e);
        if (category !== 'all' && cat !== category) continue;

        const key = groupKeyOf(e);
        if (!groupsMap.has(key)) {
            groupsMap.set(key, {
                key,
                cat,
                model: (e.model || '').trim(),
                size: (e.size || '').toString().trim(),
                variant: (e.variant || '').toString().trim(),
                entries: []
            });
        }
        groupsMap.get(key).entries.push(e);
    }

    let groups = Array.from(groupsMap.values());

    // haku
    if (q) {
        groups = groups.filter(g => haystackGroup(g).includes(q));
    }

    // lajittelu: malli, koko(num), variant
    groups.sort((a, b) => {
        const am = a.model.localeCompare(b.model, 'fi');
        if (am !== 0) return am;

        const as = num(a.size), bs = num(b.size);
        if (as != null && bs != null && as !== bs) return as - bs;

        const av = a.variant.localeCompare(b.variant, 'fi');
        if (av !== 0) return av;

        // viimeisin päivitys ensin
        const au = Math.max(...a.entries.map(x => x.updatedAt || x.createdAt || 0), 0);
        const bu = Math.max(...b.entries.map(x => x.updatedAt || x.createdAt || 0), 0);
        return bu - au;
    });

    const totalEntries = entries.length;
    const shownGroups = groups.length;

    const catName =
        category === 'valve' ? 'Venttiilit' :
        category === 'damper' ? 'Säätimet' :
        category === 'diffuser' ? 'Hajottajat' :
        category === 'other' ? 'Muut' : 'Kaikki';

    if (infoEl) {
        infoEl.innerHTML =
            `Kategoria: <b>${catName}</b> • Ryhmiä <b>${shownGroups}</b> • K-rivejä yhteensä <b>${totalEntries}</b> • Haku: <b>${q || '-'}</b>`;
    }

    // tyhjä
    if (!shownGroups) {
        listEl.innerHTML = `
            <div style="padding:12px; background:#fff; border:1px dashed #ddd; border-radius:12px; color:#666;">
                Ei osumia. Kokeile esim. “kso 125”.
            </div>
        `;
        if (searchEl && !searchEl.__klibHooked) {
            searchEl.__klibHooked = true;
            searchEl.addEventListener('input', () => renderKLibraryAdmin());
        }
        return;
    }

    // ===============================
    // TAULUKKO (paljon näkyy kerralla)
    // ===============================
    const esc = (s) => String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const fmtDate = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleString('fi-FI', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return ''; }
    };

    const catBadge = (cat) => {
        if (cat === 'valve') return '🟦 Venttiili';
        if (cat === 'damper') return '🟠 Säädin';
        if (cat === 'diffuser') return '🟣 Hajottaja';
        return '⚪ Muu';
    };

    const latestUpdated = (g) => Math.max(...g.entries.map(x => x.updatedAt || x.createdAt || 0), 0);
    const activeEntryOf = (g) => klibResolveActiveEntry(g.entries);


    // “Avaa” toteutetaan nyt turvallisesti: avataan ensimmäinen entry,
    // mutta myös annetaan groupKey mukaan (jos haluat laajentaa detailia myöhemmin).
    const openBtn = (g) => {
    // luodaan ryhmälle vakaa avain
    const key = `${g.cat}|${g.model}|${g.size}|${g.variant}`;

    // talletetaan ryhmä välimuistiin
    window._klibGroupCache[key] = g;

    return `
      <button class="btn btn-secondary"
              style="padding:6px 10px; font-size:12px;"
              onclick="openKLibGroupByKey('${key}')">
        ⚙️ Avaa
      </button>
    `;
};


    listEl.innerHTML = `
      <div style="overflow:auto; border:1px solid #e6e6e6; border-radius:12px; background:#fff;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f6f7f9; text-align:left;">
              <th style="padding:10px; border-bottom:1px solid #e6e6e6; min-width:220px;">Malli</th>
              <th style="padding:10px; border-bottom:1px solid #e6e6e6; width:120px;">Kansio</th>
              <th style="padding:10px; border-bottom:1px solid #e6e6e6; width:90px;">Rivejä</th>
              <th style="padding:10px; border-bottom:1px solid #e6e6e6; width:110px;">Odottaa</th>
              <th style="padding:10px; border-bottom:1px solid #e6e6e6; width:170px;">Päivitetty</th>
              <th style="padding:10px; border-bottom:1px solid #e6e6e6; width:90px;"></th>
            </tr>
          </thead>
          <tbody>
            ${groups.map(g => {
    const title = esc(groupTitleOf(g));
    const rows = g.entries.length;
    const pending = g.entries.filter(x => !x.approved).length;
    const ts = latestUpdated(g);
    const active = activeEntryOf(g);

                return `
                  <tr style="border-bottom:1px solid #f0f0f0;">
                    <td style="padding:10px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
  ${title}
  ${active ? `
    <div style="font-size:11px; color:#2e7d32; margin-top:2px;">
🟢 käytössä • K ${Number(active.k).toFixed(2)} • avaus ${active.pos}
    </div>
  ` : ''}
</td>

                    <td style="padding:10px; color:#555;">${catBadge(g.cat)}</td>
                    <td style="padding:10px;">${rows}</td>
                    <td style="padding:10px;">
                      ${pending ? `<span style="background:#fff3cd; border-radius:999px; padding:2px 8px; font-size:12px;">⏳ ${pending}</span>` : `0`}
                    </td>
                    <td style="padding:10px; color:#666; font-size:12px;">${esc(fmtDate(ts))}</td>
<td style="padding:10px; text-align:right; white-space:nowrap;">
  ${openBtn(g)}
  <button class="btn btn-danger"
          style="margin-left:6px; padding:6px 10px; font-size:12px;"
          onclick="deleteKLibGroup('${g.key}')">
    🗑️ Poista
  </button>
</td>
                  </tr>
                `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // live-haku vain kerran
    if (searchEl && !searchEl.__klibHooked) {
        searchEl.__klibHooked = true;
        searchEl.addEventListener('input', () => renderKLibraryAdmin());
    }
}
function addKRowToGroup() {
    const g = window._activeKLibGroup;
    if (!g) return;

    const posEl = document.getElementById('klibNewPos');
    const kEl   = document.getElementById('klibNewK');

    const pos = Number(posEl.value);
    const k   = Number(kEl.value);

    if (!Number.isFinite(pos) || !Number.isFinite(k)) {
        alert('Syötä kelvollinen avaus ja K-arvo');
        return;
    }

    confirmSaveKValue({
        kind: g.cat,
        model: g.model,
        size: g.size,
        variant: g.variant,
        pos,
        k,
        source: 'group',
        approved: false
    });

    // tyhjennä kentät seuraavaa riviä varten
    posEl.value = '';
    kEl.value = '';
    posEl.focus();

    // päivitä vain ryhmä
    refreshOpenGroup();
}
function refreshOpenGroup() {
    const g = window._activeKLibGroup;
    if (!g) return;

    const updated = window.userKLibraryV2.entries.filter(e =>
        String(e.model).trim() === String(g.model).trim() &&
        String(e.size).trim() === String(g.size).trim() &&
        String(e.variant || '') === String(g.variant || '') &&
        (String(e.kind) === String(g.cat) || g.cat === 'valve')
    );

    g.entries = updated;
    openKLibGroup(g);
}


function openKLibGroup(group) {
    if (!group || !Array.isArray(group.entries)) return;

    // ✅ FIX: tallenna oikea muuttuja
    window._activeKLibGroup = group;

    const modal   = document.getElementById('klibGroupModal');
    const titleEl = document.getElementById('klibGroupTitle');
    const metaEl  = document.getElementById('klibGroupMeta');
    const rowsEl  = document.getElementById('klibGroupRows');

    if (!modal || !rowsEl) {
        console.warn('KLIB group modal puuttuu index.html:stä (klibGroupModal/klibGroupRows).');
        return;
    }

    if (titleEl) {
        titleEl.textContent =
            `${group.model}${group.size ? ' Ø' + group.size : ''}${group.variant ? ' • ' + group.variant : ''}`;
    }

    if (metaEl) {
        metaEl.textContent =
            `${group.cat === 'valve' ? 'Venttiili' :
              group.cat === 'damper' ? 'Säädin' :
              group.cat === 'diffuser' ? 'Hajottaja' : 'Muu'} • rivejä ${group.entries.length}`;
    }

    const fmtDate = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleString('fi-FI', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return ''; }
    };

    // lajittelu: avaus nousevasti, muuten uusin ensin
    const rows = group.entries.slice().sort((a, b) => {
        const ap = Number(a.pos), bp = Number(b.pos);
        if (isFinite(ap) && isFinite(bp) && ap !== bp) return ap - bp;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });
    const activeByPos = klibResolveActivePerPos(group.entries);


    rowsEl.innerHTML = rows.map(e => `
<tr style="
  border-bottom:1px solid #eee;
  background:${
    activeByPos.get(String(e.pos))?.id === e.id &&
    group.entries.filter(x => String(x.pos) === String(e.pos)).length > 1
      ? '#e8f5e9'
      : (e.approved ? '#f1f8f4' : '#fffbea')
  };
  font-weight:${
    activeByPos.get(String(e.pos))?.id === e.id &&
    group.entries.filter(x => String(x.pos) === String(e.pos)).length > 1
      ? '700'
      : 'normal'
  };
">

        <td style="padding:8px;">${e.pos}</td>
<td style="padding:8px; font-weight:700;">
  ${Number(e.k).toFixed(2)}
  ${
    activeByPos.get(String(e.pos))?.id === e.id &&
    group.entries.filter(x => String(x.pos) === String(e.pos)).length > 1
      ? ' 🟢'
      : ''
  }
</td>


        <td style="padding:8px; text-align:center;">
          ${e.approved ? '✅ Hyväksytty' : '⏳ Odottaa'}
        </td>
        <td style="padding:8px; font-size:12px; color:#666;">
          ${fmtDate(e.updatedAt || e.createdAt)}
        </td>
        <td style="padding:8px; text-align:right;">
          ${!e.approved ? `
            <button class="btn btn-primary" style="font-size:11px; padding:4px 8px;"
                    onclick="approveKEntry('${e.id}')">
              Hyväksy
            </button>
          ` : ''}
          <button class="btn btn-secondary" style="font-size:11px; padding:4px 8px;"
                  onclick="deleteKEntry('${e.id}')">
            Poista
          </button>
        </td>
      </tr>
    `).join('');
modal.scrollTop = 0;

    modal.style.display = 'flex';
}

function openKLibGroupByKey(key) {
    const g = window._klibGroupCache?.[key];
    if (!g) {
        alert('Ryhmää ei löytynyt (päivitä näkymä)');
        return;
    }
    openKLibGroup(g);
}

function approveKEntry(id) {
    const e = window.userKLibraryV2.entries.find(x => x.id === id);
    if (!e) return;

    e.approved = true;
    e.approvedAt = Date.now();
    e.updatedAt = Date.now();

    klibSave();

    // 🔁 rakenna index uudelleen
    if (typeof klibRebuildIndexSmart === 'function') {
        klibRebuildIndexSmart();
    }

    // 🔄 PÄIVITÄ UI HETI
    if (document.getElementById('klibGroupModal')?.style.display === 'flex') {
        refreshOpenGroup();   // päivittää avoimen ryhmän
        return;
    }

    if (window.uiState?.currentView === 'view-klib-admin') {
        renderKLibraryAdmin();
        return;
    }

    // fallback
    renderActiveProject();
}


function deleteKEntry(id) {
  if (!id) return;
  if (!confirm('Poistetaanko tämä K-arvo?')) return;

  const lib = window.userKLibraryV2;
  if (!lib || !Array.isArray(lib.entries)) return;

  // 1️⃣ poista kirjastosta
  lib.entries = lib.entries.filter(e => e.id !== id);

  // 2️⃣ poista indeksistä
  if (lib.index) {
    Object.keys(lib.index).forEach(key => {
      if (lib.index[key] === id) {
        delete lib.index[key];
      }
    });
  }

  klibSave?.();

  // 3️⃣ päivitä AVOIN ryhmä (älä poistu näkymästä)
  if (window._activeKLibGroup) {
    window._activeKLibGroup.entries =
      window._activeKLibGroup.entries.filter(e => e.id !== id);

    if (window._activeKLibGroup.entries.length > 0) {
      openKLibGroup(window._activeKLibGroup); // pysy ryhmässä
    } else {
      closeKLibGroup?.(); // ryhmä tyhjä → sulje
    }
  }

  // 4️⃣ päivitä K-kirjaston lista
  renderKLibraryAdmin();

  console.log('🗑️ K-arvo poistettu:', id);
}

function deleteKLibGroup(groupKey) {
  if (!groupKey) return;

  const group = window._klibGroupCache?.[groupKey];
  if (!group) {
    alert('Ryhmää ei löytynyt');
    return;
  }

  if (!confirm(
    `Poistetaanko K-kirjastosta kokonaan:\n\n` +
    `${group.model}${group.size ? ' Ø' + group.size : ''}\n\n` +
    `Kaikki avaukset ja K-arvot?`
  )) return;

  const lib = window.userKLibraryV2;
  if (!lib) return;

  const ids = new Set(group.entries.map(e => e.id));

  // poista kaikki ryhmän rivit
  lib.entries = lib.entries.filter(e => !ids.has(e.id));

  // siivoa indeksi
  if (lib.index) {
    Object.keys(lib.index).forEach(key => {
      if (ids.has(lib.index[key])) {
        delete lib.index[key];
      }
    });
  }

  klibSave?.();

  // jos tämä ryhmä oli auki → sulje
  if (window._activeKLibGroup &&
      window._activeKLibGroup.key === groupKey) {
    closeKLibGroup?.();
  }

  // päivitä lista
  renderKLibraryAdmin();

  console.log('🗑️ K-ryhmä poistettu:', groupKey);
}

function closeKLibGroup() {
    const modal = document.getElementById('klibGroupModal');
    if (modal) modal.style.display = 'none';
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
function ensureUserKLibraryReady() {
    // 1) luo runko jos puuttuu
    if (!window.userKLibraryV2 || typeof window.userKLibraryV2 !== 'object') {
        window.userKLibraryV2 = { version: 2, entries: [] };
    }
    if (!Array.isArray(window.userKLibraryV2.entries)) {
        window.userKLibraryV2.entries = [];
    }

    // 2) lataa kerran localStoragesta (jos ei vielä ladattu)
    if (!window.userKLibraryV2.__loadedOnce) {
        if (typeof klibLoad === 'function') {
            klibLoad();
        }
        window.userKLibraryV2.__loadedOnce = true;
    }

    return window.userKLibraryV2;
}


function klibAdminDelete(id) {
    if (!id) return;
    if (!confirm('Poistetaanko K-arvo pysyvästi?')) return;

    klibDeleteEntry(id); // 10.3.3
    klibSave();

    renderKLibraryAdmin();
}

function openKLibraryAdmin() {
    showView('view-klib-admin');

    // varmista data
    ensureUserKLibraryReady();

    // renderöi näkymä
    if (typeof renderKLibraryAdmin === 'function') {
        renderKLibraryAdmin();
    }
}

function openAddKModal(prefill = {}) {
  const modal = document.getElementById('addKModal');
  if (!modal) return;

  const kindEl    = document.getElementById('addKKind');
  const modelEl   = document.getElementById('addKModel');
  const sizeEl    = document.getElementById('addKSize');
  const variantEl = document.getElementById('addKVariant');
  const rowsEl    = document.getElementById('addKRows');
  const stepEl    = document.getElementById('addKStep');

  if (!kindEl || !modelEl || !sizeEl || !variantEl || !rowsEl || !stepEl) {
    alert('AddKModal: kenttiä puuttuu.');
    return;
  }

  // esitäytöt
  kindEl.value    = prefill.kind || kindEl.value || 'supply';
  modelEl.value   = prefill.model || '';
  sizeEl.value    = prefill.size || '';
  variantEl.value = prefill.variant || '';

  // 🔒 automaattinen avausvälin oletus (D3)
  if (kindEl.value === 'damper') {
    stepEl.value = 0.5;
  } else {
    stepEl.value = 1;
  }

  // tyhjennä rivit ja lisää yksi lähtörivi
  rowsEl.innerHTML = '';
  addKRow();

  modal.style.display = 'flex';
}

function closeAddKModal() {
    const m = document.getElementById('addKModal');
    if (m) m.style.display = 'none';
}
function parsePastedKList() {
  const ta = document.getElementById('addKPaste');
  const rowsEl = document.getElementById('addKRows');
  if (!ta || !rowsEl) return;

  const lines = ta.value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length);

  if (!lines.length) {
    alert('Lista on tyhjä');
    return;
  }

  rowsEl.innerHTML = '';

  let added = 0;

  lines.forEach(line => {
    // sallitut erottimet: tab, ; tai välilyönti
    const parts = line.split(/[\t; ]+/).filter(Boolean);
    if (parts.length < 2) return;

    const pos = Number(parts[0].replace(',', '.'));
    const k   = Number(parts[1].replace(',', '.'));

    if (isFinite(pos) && isFinite(k)) {
      addKRow(pos, k);
      added++;
    }
  });

  if (!added) {
    alert('Yhtään kelvollista riviä ei löytynyt');
  } else {
    console.log(`📋 Tuotu ${added} riviä listasta`);
  }
}

function addKRow(pos = '', k = '') {
    const rowsEl = document.getElementById('addKRows');
    if (!rowsEl) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="input" type="number" step="0.1" placeholder="0" value="${pos}"></td>
      <td><input class="input" type="number" step="0.01" placeholder="0.00" value="${k}"></td>
      <td style="text-align:right;">
        <button class="btn btn-secondary" type="button">✖</button>
      </td>
    `;

    const delBtn = tr.querySelector('button');
    delBtn.onclick = () => tr.remove();

    rowsEl.appendChild(tr);
}



function saveKRows() {
    const kindEl    = document.getElementById('addKKind');
    const modelEl   = document.getElementById('addKModel');
    const sizeEl    = document.getElementById('addKSize');
    const variantEl = document.getElementById('addKVariant');
    const rowsEl    = document.getElementById('addKRows');

    if (!kindEl || !modelEl || !sizeEl || !variantEl || !rowsEl) return;

    const kind    = (kindEl.value || 'other').trim();
    const model   = (modelEl.value || '').trim();
    const size    = (sizeEl.value || '').trim();
    const variant = (variantEl.value || '').trim();

    if (!model) {
        alert('Anna vähintään malli.');
        return;
    }

    const trs = Array.from(rowsEl.querySelectorAll('tr'));
    if (!trs.length) {
        alert('Lisää vähintään yksi rivi (avaus + K).');
        return;
    }

    // kerää rivit
    const rows = [];
    for (const tr of trs) {
        const inputs = tr.querySelectorAll('input');
        const pos = Number(inputs[0].value);
        const k   = Number(inputs[1].value);

        if (!Number.isFinite(pos) || !Number.isFinite(k)) continue;
        rows.push({ pos, k });
    }

    if (!rows.length) {
        alert('Yhtään kelvollista riviä ei löytynyt.');
        return;
    }

    // tallenna jokainen rivi omana entrynä (odottaa hyväksyntää)
    rows.forEach(r => {
        confirmSaveKValue({
            kind,
            model,
            size,
            variant,
            pos: r.pos,
            k: r.k,
            source: 'manual',
            approved: false
        });
    });

    // pysy K-kirjastossa (älä hyppää etusivulle)
    closeAddKModal();
    if (window.uiState?.currentView === 'view-klib-admin') {
        renderKLibraryAdmin();
    }
}
function generateIntermediateKRows() {
  const rowsEl = document.getElementById('addKRows');
  const stepEl = document.getElementById('addKStep');
  if (!rowsEl || !stepEl) return;

  const step = Number(stepEl.value);
  if (!isFinite(step) || step <= 0) {
    alert('Virheellinen avausväli');
    return;
  }

  // 1️⃣ kerää käyttäjän syöttämät peruspisteet
  const base = Array.from(rowsEl.querySelectorAll('tr'))
    .map(tr => {
      const i = tr.querySelectorAll('input');
      return {
        pos: Number(i[0]?.value),
        k:   Number(i[1]?.value)
      };
    })
    .filter(x => isFinite(x.pos) && isFinite(x.k))
    .sort((a, b) => a.pos - b.pos);

  if (base.length < 2) {
    alert('Tarvitaan vähintään kaksi pistettä');
    return;
  }

  // 2️⃣ tyhjennä nykyiset rivit
  rowsEl.innerHTML = '';

  // 3️⃣ käy välit läpi ja interpoloidaan
  for (let i = 0; i < base.length - 1; i++) {
    const a = base[i];
    const b = base[i + 1];

    const span = b.pos - a.pos;
    if (span <= 0) continue; // suoja

    const steps = Math.floor(span / step);

    for (let j = 0; j <= steps; j++) {
      const pos = a.pos + j * step;
      if (pos > b.pos) continue;

      const t = (pos - a.pos) / span;
      const k = a.k + t * (b.k - a.k);

      addKRow(
        Number(pos.toFixed(3)),
        Number(k.toFixed(2))
      );
    }

    // varmista että viimeinen piste tulee mukaan
    addKRow(
      Number(b.pos.toFixed(3)),
      Number(b.k.toFixed(2))
    );
  }
}

function applyDefaultOpeningStepByKind(kind) {
  const stepEl = document.getElementById('addKStep');
  if (!stepEl) return;

  if (kind === 'damper') {
    stepEl.value = 0.5;
  } else {
    stepEl.value = 1;
  }
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
if (!isFinite(v.flowEffective)) missingFlows++;
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


/**
 * Tallennetaan käyttäjän hyväksymä K tietokantaan.
 * entry: { model: string, size: string, opening: number, k: number }
 */


/**
 * Palauttaa listan käyttäjän arvoista tälle venttiilille (model+size)
 * [{opening, k}, ...] avauksen mukaan.
 */



/**
 * Väli-K / täsmä osuma käyttäjän omista arvoista.
 * Palauttaa:
 *  - {k, source:'user-exact'} tai {k, source:'user-interpolated'} tai null
 */


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
function isDamperModel(model) {
    if (!model) return false;
    return /pelti|damper|mittauspelti|iris/i.test(model);
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
    const p = projects?.find(x => x.id === activeProjectId);
    if (!p) {
        showView('view-projects');
        return;
    }

    // ─────────────────────────────────
    // VISUAALINÄKYMÄN TYYPPI (UI only)
    // ─────────────────────────────────
    const btns = document.getElementById('visModeButtons');
    const sys = p.systemType || 'default';

    if (sys === 'roof') {
        window.activeVisMode = 'vertical';
        if (btns) {
            btns.innerHTML = `
                <button class="btn btn-secondary"
                    style="margin:0; padding:5px 10px; font-size:12px;"
                    onclick="setVisualMode('vertical')">
                    🏢 Pysty
                </button>
            `;
        }
    }
    else if (sys === 'hybrid') {
        window.activeVisMode = window.activeVisMode || 'vertical';
        if (btns) {
            btns.innerHTML = `
                <button class="btn btn-secondary"
                    style="margin:0; padding:5px 10px; font-size:12px;"
                    onclick="setVisualMode('vertical')">
                    🏢 Pysty
                </button>
                <button class="btn btn-secondary"
                    style="margin:0; padding:5px 10px; font-size:12px;"
                    onclick="setVisualMode('horizontal')">
                    🏠 Vaaka
                </button>
            `;
        }
    }
    else {
        window.activeVisMode = 'horizontal';
        if (btns) {
            btns.innerHTML = `
                <button class="btn btn-secondary"
                    style="margin:0; padding:5px 10px; font-size:12px;"
                    onclick="setVisualMode('horizontal')">
                    🏠 Vaaka
                </button>
            `;
        }
    }

    // ─────────────────────────────────
    // 🧭 A-malli: avaa kartta AINA konekartasta
    // ─────────────────────────────────
    window.mapLevel = 'machines';

    renderVisualContent();
    showView('view-visual');

    // ─────────────────────────────────
    // 🗺️ Karttatason valitsin (Koneet / Rungot)
    const selector = document.getElementById('mapViewSelector');
if (selector) {
    const machine = getActiveMachine(p);
    const mode = window.currentMode || 'home';
    const ducts = machine?.modes?.[mode]?.ducts || [];
    renderMapViewSelector(selector, ducts);
}

    // ─────────────────────────────────
    // ❌ Vanha relative adjust -paneeli EI kuulu A-malliin
    // ─────────────────────────────────
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
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = p.machines.find(m => String(m.id) === String(machineId));
    if (!machine) return;

    // 🔒 TALLENNA NYKYISEN KONEEN MAP-UI-TILA
    captureCurrentMapUiState();

    // ✅ AINOA KOHTA missä aktiivinen kone vaihtuu
    window.uiState.activeMachineId = machine.id;

    // 🔁 Päivitä KAIKKI näkymät yhdellä ketjulla
}

function setValveAsIndex({ valve, machineId, ductId }) {
    const project = getActiveProject();
    if (!project) return;

    const machine = project.machines.find(m => m.id === machineId);
    if (!machine) return;

    const duct = machine.ducts.find(d => d.id === ductId);
    if (!duct) return;

    duct.valves.forEach(v => {
        v.isIndex = false;
    });

    valve.isIndex = true;

    saveData();
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
function openCreateDuctModal(arg = null) {
    // Backward compatible:
    // - openCreateDuctModal()                     => ok
    // - openCreateDuctModal(v)                    => vanha false-index varoitus tukena
    // - openCreateDuctModal({ onCreated })        => uusi tapa
    // - openCreateDuctModal(v, { onCreated })     => (ei käytössä täällä, mutta voit laajentaa myöhemmin)

    let v = null;
    let opts = {};

    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        // Jos arg näyttää venttiililtä (sisältää esim id/pos), pidetään se v:nä,
        // mutta jos sisältää onCreated, tulkitaan optsiksi.
        if ('onCreated' in arg) {
            opts = arg;
        } else {
            v = arg;
        }
    } else {
        v = arg;
    }

    const onCreated = (opts && typeof opts.onCreated === 'function') ? opts.onCreated : null;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';

    if (!machine.modes) machine.modes = {};
    if (!machine.modes[mode]) machine.modes[mode] = { ducts: [] };
    if (!Array.isArray(machine.modes[mode].ducts)) machine.modes[mode].ducts = [];

    const ducts = machine.modes[mode].ducts;

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

                    <label>Tyyppi
                        <select id="new-duct-type">
                            <option value="">– valitse –</option>
                            <option value="supply">TULO</option>
                            <option value="extract">POISTO</option>
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

            <div class="modal-actions">
                <button class="btn btn-primary" id="createDuctBtn">💾 Luo runko</button>
                <button class="btn" onclick="closeCreateDuctModal()">Sulje</button>
            </div>
        </div>
    `;

    ov.style.display = 'flex';

    document.getElementById('createDuctBtn').onclick = () => {
        const name = document.getElementById('new-duct-name').value.trim();
        const type = document.getElementById('new-duct-type').value;
        const err  = document.getElementById('duct-create-error');

        if (err) err.style.display = 'none';

        if (!name || !type) {
            if (err) {
                err.textContent = 'Anna rungon nimi ja tyyppi';
                err.style.display = 'block';
            }
            return;
        }

        const newDuct = {
            id: 'duct_' + Date.now(),
            name,
            type,
            valves: []
        };

        ducts.push(newDuct);

        // Sulje runkomodaali
        closeCreateDuctModal();

        // Päivitä näkymä
        saveData?.();
        renderDetailsList?.();

        // ✅ UUSI: jos joku odottaa rungon luontia (esim. venttiilin lisäys), kutsu callback
        try { if (onCreated) onCreated(newDuct); } catch (e) {}
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


// ===============================
// ❌ SULJE RUNKOMODAALI
// ===============================
function closeCreateDuctModal() {
    const ov = document.getElementById('duct-modal-overlay');
    if (ov) ov.style.display = 'none';
}





function activateProject(projectId, mode = 'home') {
    if (!window.appState) window.appState = {};

    // ✅ appState (uusi tapa)
    window.appState.activeProjectId = projectId;
    window.appState.currentMode = mode;
    window.currentMode = mode;

    // ✅ legacy/UI (vanha tapa) – pakko pitää synkassa
    activeProjectId = projectId;

    console.log('📂 Projekti aktivoitu:', projectId, mode);

    renderActiveProject();
}



function renderActiveProject() {
    const projectId = window.appState?.activeProjectId;
    if (!projectId) {
        console.warn('renderActiveProject: ei aktiivista projektia');
        return;
    }

    const p = projects.find(x => x.id === projectId);
    if (!p) {
        console.warn('renderActiveProject: projektia ei löytynyt', projectId);
        return;
    }

    console.log('🎯 Renderöidään aktiivinen projekti');

    // 🔧 LASKE FLOWT ENNEN YHTÄÄN RENDERIÄ
    const machine = getActiveMachine(p);
    recalcAllValveFlows(machine);

    // 🔑 aina sama näkymä
    showView('view-details');

    // 🔑 kutsutaan sitä OIKEAA näkymää
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

            if (modelName.endsWith('-')) {
                modelName = modelName.slice(0, -1);
            }
        }

        if (!valveGroups[modelName]) {
            valveGroups[modelName] = [];
        }

        valveGroups[modelName].push({
            id: key,
            size: sizeText,
            sortSize
        });

        valveIdToModelId[key] = modelName;
    }

    Object.keys(valveGroups).forEach(m => {
        valveGroups[m].sort((a, b) => a.sortSize - b.sortSize);
    });
}

document.addEventListener('DOMContentLoaded', () => {

    // 🔧 VARMISTA, ETTÄ MAP-DOM ON OLEMASSA
    if (typeof ensureMapDom === 'function') {
        ensureMapDom();
    }

    // 🔧 KARTAN PAN & ZOOM KÄYTTÖÖN
    if (typeof enableMapPan === 'function') {
        enableMapPan();
    }
    if (typeof enableMapZoom === 'function') {
        enableMapZoom();
    }
    if (typeof applyMapTransform === 'function') {
        applyMapTransform();
    }

    // 🔒 VARMISTA PUHDAS ALKUTILA
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });

    // 📂 Lataa projektit
    if (typeof loadProjectsFromStorage === 'function') {
        loadProjectsFromStorage();
    }

    // ✅ Näytä aina etusivu aluksi
    const projectsView = document.getElementById('view-projects');
    if (projectsView) {
        projectsView.classList.add('active');
        projectsView.style.display = 'block';
    }

    // 🔧 Alustetaan venttiilimallit
    if (typeof initValveSelectors === 'function') {
        initValveSelectors();
    }

    console.log('✔ valveGroups initialized:', Object.keys(valveGroups || {}));
});


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

function renderValveDot(v) {
    const fs = getValveFlowStatus(v);

    let cls = 'valve-dot';
    if (v._uiIsIndex) cls += ' valve-dot-index';
    if (fs?.color) cls += ` valve-dot-${fs.color}`;

    const label = escapeHtml(v.room || '');

    return `
        <div class="valve-dot-wrap"
             onclick="zoomToValve('${escapeJsString(v.parentDuctId)}','${escapeJsString(v.id)}')"
             title="${label} (${v.flow ?? '-'}/${v.target ?? '-'})">

            <div class="${cls}"></div>

            <div class="valve-dot-label">
                ${label}
            </div>
        </div>
    `;
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
// ✅ FIX: draft → oikeaksi riviksi (antaa ID:n + lisää uuden draftin)
// Korvaa koko promoteDraftIfNeeded(duct, v)
function promoteDraftIfNeeded(duct, v) {
    if (!v || !duct) return false;
    if (!v.__isDraft) return false;

    const hasSomething =
        (v.room && String(v.room).trim() !== '') ||
        (v.type && String(v.type).trim() !== '') ||
        (v.pos != null && String(v.pos).trim() !== '');

    if (!hasSomething) return false;

    // ✅ anna ID heti kun draft promotoidaan
    if (!v.id) {
        v.id = (crypto?.randomUUID
            ? crypto.randomUUID()
            : ('v_' + Date.now() + '_' + Math.random().toString(16).slice(2)));
    }

    delete v.__isDraft;

    // ✅ varmista että rungossa on AINA yksi tyhjä draft lopussa
    createDraftValve(duct);

    return true;
}


// ✅ Päätelaite-autocomplete: hae VAIN käyttäjän K-kirjastosta (userKLibraryV2)
// Palauttaa aina muodossa: [{ type: "Model Size Variant", ... }, ...]
function searchDeviceNames(query = '', opts = {}) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];

    const entries = Array.isArray(window.userKLibraryV2?.entries)
        ? window.userKLibraryV2.entries
        : [];

    const seen = new Set();
    const out = [];

    for (const e of entries) {
        if (!e.model) continue;

        const model = String(e.model).trim();
        if (!model.toLowerCase().includes(q)) continue;
        if (seen.has(model)) continue;
        seen.add(model);

        out.push({
            type: model,        // 🔑 AINOA mitä autocomplete käyttää
            model: model,
            kind: e.kind || '',
            source: 'klib'
        });

        if (out.length >= 20) break;
    }

    return out;
}



// --- PÄIVITETTY INLINE-MUOKKAUS (HUONE MUKANA) ---

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

    // 📍 Talleta scroll ENNEN poistoa
    const listEl = document.getElementById('measurementList');
    const scrollTopBefore = listEl ? listEl.scrollTop : 0;

    // 🗑 POISTO
    foundDuct.valves.splice(foundIndex, 1);

    // 💾 TALLENNUS
    saveData?.();

    // ⛔ Estä focus → kartta -ketju renderin aikana
    window.__suppressFocusScroll = true;

    // 🔄 Pakotettu render (rakenne muuttui)
    requestAnimationFrame(() => {
        renderDetailsList(true);

        requestAnimationFrame(() => {
            if (listEl) {
                // 🔒 Palauta scroll täsmälleen samaan kohtaan
                listEl.scrollTop = scrollTopBefore;
            }

            // 🔓 Vapauta lukitus
            window.__suppressFocusScroll = false;
        });
    });
}

function findDuctByValveId(valveId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return null;

    const machine = getActiveMachine(p);
    if (!machine) return null;

    const mode = window.currentMode || 'home';
    const ducts = machine.modes?.[mode]?.ducts || [];

    for (const duct of ducts) {
        if (!Array.isArray(duct.valves)) continue;
        if (duct.valves.some(v => String(v.id) === String(valveId))) {
            return duct;
        }
    }
    return null;
}
function moveValveUp(valveId) {
    const duct = findDuctByValveId(valveId);
    if (!duct || !Array.isArray(duct.valves)) return;

    const idx = duct.valves.findIndex(v => String(v.id) === String(valveId));
    if (idx <= 0) return; // jo ylhäällä

    // vaihto
    [duct.valves[idx - 1], duct.valves[idx]] =
        [duct.valves[idx], duct.valves[idx - 1]];

    // päivitä order (valinnainen mutta suositeltava)
    duct.valves.forEach((v, i) => v.order = i);

    saveData?.();
    renderDetailsList?.();
}
function moveValveDown(valveId) {
    const duct = findDuctByValveId(valveId);
    if (!duct || !Array.isArray(duct.valves)) return;

    const idx = duct.valves.findIndex(v => String(v.id) === String(valveId));
    if (idx === -1 || idx >= duct.valves.length - 1) return; // jo alhaalla

    // vaihto
    [duct.valves[idx], duct.valves[idx + 1]] =
        [duct.valves[idx + 1], duct.valves[idx]];

    // päivitä order
    duct.valves.forEach((v, i) => v.order = i);

    saveData?.();
    renderDetailsList?.();
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
        // ✅ PÄIVITÄ venttiilien järjestysnumerot
d.valves.forEach((v, index) => {
    v.order = index;
});


        // 💾 Tallenna data
        if (typeof saveData === 'function') {
            saveData();
        }

        // 🔄 Päivitä mittalista (EI renderDetailsList!)
        
        // 🔄 Päivitä kartta
const vis = document.getElementById('visContent');
        if (vis && typeof renderHorizontalMap === 'function') {
            renderHorizontalMap(vis);
        }

        return;
    }

    console.warn('moveValve: venttiiliä ei löytynyt duct.valves[]:sta', valveId);
};



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

function getActiveProject() {
    return window.projects?.find(p => p.id === window.activeProjectId) || null;
}

function getActiveMachine(project) {
    if (!project) return null;
    if (!project.activeMachineId && project.machines?.length) {
        project.activeMachineId = project.machines[0].id;
    }
    return project.machines?.find(m => m.id === project.activeMachineId) || null;
}
function collectValvesFromTree(nodesById, rootId, path = [], out = []) {
    const node = nodesById[rootId];
    if (!node) return out;

    const nextPath = [...path];
    if (node.kind === 'duct' || node.kind === 'branch') {
        nextPath.push(node.name || 'Runko');
    }

    if (node.kind === 'valve') {
        out.push({
            node,
            path: [...nextPath]
        });
    }

    (node.children || []).forEach(childId => {
        collectValvesFromTree(nodesById, childId, nextPath, out);
    });

    return out;
}
function resolveKValueForValve(valve) {
    if (!window.userKLibraryV2) return null;
    if (!valve.device || !valve.size || valve.opening == null) return null;

    const group = window.userKLibraryV2[valve.device];
    if (!group) return null;

    const rows = group.rows?.filter(r =>
        r.size === valve.size &&
        Number(r.opening) === Number(valve.opening) &&
        r.approved
    );

    if (!rows || !rows.length) return null;

    rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return rows[0].k;
}

function renderDetailsList(force = false) {


    // ─────────────────────────────────────────────
    // 🔑 AKTIIVINEN PROJEKTI (YKSINEN TOTUUS)
    // ─────────────────────────────────────────────
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) {
        console.warn('renderDetailsList: ei aktiivista projektia');
        return;
    }

    // ─────────────────────────────────────────────
    // 🔑 AKTIIVINEN KONE
    // ─────────────────────────────────────────────
    const machine = getActiveMachine(project);
    if (!machine) {
        console.warn('renderDetailsList: ei aktiivista konetta');
        return;
    }

    // ─────────────────────────────────────────────
    // 1️⃣ Konevalitsin (yläpalkki / mittalistan header)
    // ─────────────────────────────────────────────
    const machineBar = document.getElementById('detailsMachineBar');
    if (machineBar && typeof renderMachineSelector === 'function') {
        machineBar.innerHTML = '';
        renderMachineSelector(machineBar);
    }

    // ─────────────────────────────────────────────
// 2️⃣ Mittalista (V3 – AINOA TOTUUS)
// ─────────────────────────────────────────────
const listEl = document.getElementById('measurementList');
if (!listEl) {
    console.warn('renderDetailsList: measurementList-elementti puuttuu');
    return;
}

// 🔒 Renderöi AINA V3 (ei fallbackeja)
renderMeasurementListV3(listEl, project, machine);

// 🔗 Bind mittalista V3 vain kerran
if (typeof bindMeasurementListV3 === 'function') {
    if (!listEl.__boundV3) {
        bindMeasurementListV3(listEl);
        listEl.__boundV3 = true;
    }
}


    // ─────────────────────────────────────────────
    // 3️⃣ Workflow-ohje (ei saa kaataa näkymää)
    // ─────────────────────────────────────────────
    if (typeof updateWorkflowHint === 'function') {
        try {
            updateWorkflowHint(project);
        } catch (err) {
            console.warn('updateWorkflowHint epäonnistui', err);
        }
    }

    // ─────────────────────────────────────────────
    // 4️⃣ Visuaalinen näkymä (kartta / puu)
    // ─────────────────────────────────────────────
    const visContainer = document.getElementById('visContent');
    if (visContainer && typeof renderHorizontalMap === 'function') {
        try {
            renderHorizontalMap(visContainer);
        } catch (err) {
            console.warn('renderHorizontalMap epäonnistui', err);
        }
    }
}



function deleteValveById() {
    alert('Venttiilin poisto pois käytöstä (Korjaus 1)');
    return;
}

/**
 * 🔁 Vaihda venttiilin tyyppi (supply ↔ extract)
 * A-MALLI:
 * machine.modes[mode].ducts[].valves[]
 */
function toggleValveSupplyExtractById(ductId, valveId) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const mode = window.currentMode || 'home';
    const machine = getActiveMachine(p);
    if (!machine || !machine.modes?.[mode]) return;

    const ducts = machine.modes[mode].ducts || [];
    const duct = ducts.find(d => String(d.id) === String(ductId));
    if (!duct) return;

    const valve = duct.valves.find(v => String(v.id) === String(valveId));
    if (!valve) return;

    // 🔁 Vaihdetaan tyyppi
    valve.kind = (valve.kind === 'supply') ? 'extract' : 'supply';

    // 🔄 Päivitä UI
    renderDetailsList();
    saveProjects?.();
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

    // 🔒 Varmista UI-tila (aktiivinen kone ym.)
    ensureUiState();

    // 🔧 AKTIIVINEN KONE (AINOA TOTUUS)
    const machine = getActiveMachine(p);
    if (!machine) return;

    const currentMode = window.currentMode || 'home';

    if (!machine.modes) machine.modes = {};
    if (!machine.modes[currentMode]) {
        machine.modes[currentMode] = { ducts: [], fans: [] };
    }

    const ducts = machine.modes[currentMode].ducts || [];

    /* ========= RYHMITTELY + K-LASKENTA (A-malli: ducts[].valves[]) ========= */
    const kFunc = (typeof getK === 'function') ? getK : defaultGetK;
    const supplyValves = [];
    const extractValves = [];

    ducts.forEach(d => {
        const arr = Array.isArray(d.valves) ? d.valves : [];
        arr.forEach(v => {
            // calcK (näytön/ohjeiden mahdollinen käyttö)
            v._calcK = (v.type && v.pos !== null && v.pos !== undefined) ? kFunc(v.type, v.pos) : 0;

            if (d.type === 'supply') supplyValves.push(v);
            else if (d.type === 'extract') extractValves.push(v);
        });
    });

    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
    supplyValves.sort(byOrder);
    extractValves.sort(byOrder);

    /* ========= SUMMAT / KPI ========= */
    const sumSup = supplyValves.reduce((s, v) => s + (parseFloat(v.flow) || 0), 0);
    const sumExt = extractValves.reduce((s, v) => s + (parseFloat(v.flow) || 0), 0);

    const sumValveTargetSup = supplyValves.reduce((s, v) => s + (parseFloat(v.target) || 0), 0);
    const sumValveTargetExt = extractValves.reduce((s, v) => s + (parseFloat(v.target) || 0), 0);

    // 🎯 KONEEN TAVOITEVIRRAT (konekohtainen totuus)
    const finalTargetSup =
        machine.supply?.designFlow && parseFloat(machine.supply.designFlow) > 0
            ? parseFloat(machine.supply.designFlow)
            : sumValveTargetSup;

    const finalTargetExt =
        machine.extract?.designFlow && parseFloat(machine.extract.designFlow) > 0
            ? parseFloat(machine.extract.designFlow)
            : sumValveTargetExt;

    // 📊 PROSENTIT
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
    const u = machine.unit || 'pct';
    const unitLabel = u === 'hz' ? 'Hz' : (u === 'pa' ? 'Pa' : (u === 'speed' ? '' : '%'));

    let machineInfo = "-";
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
            .kpi-val { font-size: 16px; font-weight: 800; line-height: 1.1; }
            .kpi-sub { font-size: 11px; color: #777; margin-top: 2px; }
            .kpi-lbl { font-size: 9px; text-transform: uppercase; color: #777; font-weight: 600; margin-top: 2px; }

            .mode-row { display:flex; gap:8px; margin-bottom:10px; }
            .mode-big { flex:1; padding:10px; border:1px solid #ccc; border-radius:6px; font-weight:bold; cursor:pointer; }

            .tech-box { background:#eef5e9; border:1px solid #c3e6cb; border-radius:6px; padding:15px; margin-bottom:15px; }
            .tech-row { display:flex; flex-wrap:wrap; gap:15px; align-items:center; margin-bottom:10px; }
            .tech-row:last-child { margin-bottom:0; }

            .input-xl { font-size:16px; padding:10px; width:80px; border:1px solid #ccc; border-radius:6px; text-align:center; font-weight:bold; }
            .label-xl { font-size:14px; font-weight:bold; color:#2c3e50; }
            .sel-xl { font-size:14px; padding:8px; border:1px solid #ccc; border-radius:6px; width:100%; }

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
                    <div class="kpi-val" style="color:${supStatus.color};">${sumSup.toFixed(0)}</div>
                    <div class="kpi-sub">/ ${finalTargetSup.toFixed(0)} l/s ${supPct !== null ? `(${supPct}%)` : ''}</div>
                    <div class="kpi-lbl">TULOILMA</div>
                </div>

                <div class="kpi-box" style="border-top:3px solid ${extStatus.color};">
                    <div class="kpi-val" style="color:${extStatus.color};">${sumExt.toFixed(0)}</div>
                    <div class="kpi-sub">/ ${finalTargetExt.toFixed(0)} l/s ${extPct !== null ? `(${extPct}%)` : ''}</div>
                    <div class="kpi-lbl">POISTOILMA</div>
                </div>

                <div class="kpi-box" style="border-top:3px solid ${balanceColor};">
                    <div class="kpi-val" style="color:${balanceColor}; font-size:14px;">${balanceText}</div>
                    <div class="kpi-lbl">PAINESUHDE</div>
                </div>

                <div class="kpi-box" onclick="openEditMachineModal('${machine.id}')" style="cursor:pointer; border-top:3px solid #34495e;">
                    <div class="kpi-val" style="color:#34495e; font-size:16px;">${machineInfo}</div>
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
                <button class="tool-btn" style="background:#e8f5e9; border-color:#4caf50; color:#1b5e20;" onclick="openValvePanel(null)">➕ Lisää Venttiili</button>

                <!-- HUOM: Asunnot-nappi voi jäädä jos haluat, mutta ei liity A-malliin -->
                <button class="tool-btn" onclick="openCreateAptAHUModal()">🏢 Asunnot</button>

                <button class="tool-btn" onclick="showReportExcelStyle()">📄 Pöytäkirjat</button>

                <button class="btn btn-secondary" onclick="openKLibraryAdmin()">📚 K-kirjasto</button>

                <button class="tool-btn" onclick="shareProjectData()">📤 Jaa</button>

                <button class="tool-btn" onclick="openCreateDuctModal()">➕ Luo runko</button>

                <button class="btn btn-secondary" style="margin-left:8px;" onclick="archiveProject(activeProjectId)">📁 Arkistoi projekti</button>
            </div>

            <!-- LISTAT -->
            <h4 style="margin:0; border-bottom:1px solid #ddd; padding-bottom:5px; font-size:14px;">
                Mittauspöytäkirja / Lista (${currentMode})
            </h4>

            <div id="measurementList" style="margin-top:10px;"></div>
        </div>
    `;

    // 🔧 Etusivun konevalitsin (DOM on nyt olemassa)
    const detailsBar = document.getElementById('detailsMachineBar');
    if (detailsBar) {
        detailsBar.innerHTML = '';
        renderMachineSelector(detailsBar);
    }

  // ✅ Renderöi A-mallin mittalista (V3) — turvallisesti, rikkomatta muuta näkymää
requestAnimationFrame(() => {
    // Haetaan nimenomaan tästä viewistä ettei osuta vahingossa väärään elementtiin
    const listContainer = view.querySelector('#measurementList');

    if (!listContainer) {
        console.warn('renderDetailsView: #measurementList ei löytynyt view-details sisältä');
        return;
    }

    try {
        // 🔧 TÄRKEÄ: laske indeksit ja suhteet KAIKILLE rungoille ennen listan renderiä
        const mode = window.currentMode || 'home';
        const ductsForUi = machine?.modes?.[mode]?.ducts || [];

        ductsForUi.forEach(d => {
            if (typeof prepareRelativeUiDataForDuct === 'function') {
                prepareRelativeUiDataForDuct(d);
            }
        });

        // 📋 Renderöi mittalista
        renderMeasurementListV3(listContainer, p, machine);

        // 🔗 Bind vain kerran
        if (!listContainer.__boundV3) {
            bindMeasurementListV3(listContainer);
            listContainer.__boundV3 = true;
        }
    } catch (err) {
        console.error('renderDetailsView: mittalistan render/bind kaatui', err);
    }
});

// 🧭 Päivitä workflow-ohje
updateWorkflowHint(p);

// 🎨 Värit peruuta / sulje / takaisin -napeille
applyCancelButtonStyles(document);


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

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const machineId = machine.id;

    if (!window.uiState.mapUi) window.uiState.mapUi = {};
    if (!window.uiState.mapUi[machineId]) {
        window.uiState.mapUi[machineId] = {};
    }

    const state = window.uiState.mapUi[machineId];

    // 🔎 LUE NYKYINEN KARTTA
    const map = document.getElementById('horizontal-map');
    if (map) {
        state.scrollLeft = map.scrollLeft;
        state.scrollTop = map.scrollTop;
    }

    // 🔍 ZOOM
    if (window.mapWorldState?.scale != null) {
    state.zoom = window.mapWorldState.scale;
}

    // 🎯 AKTIIVISET
     window.mapViewState = window.mapViewState || {};
state.activeValveId = window.mapViewState.activeValveId ?? null; 
state.activeDuctId  = window.mapViewState.activeDuctId ?? null;
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
    if (!p) return { ducts: [], fans: [] };

    const activeMode = mode || window.currentMode || 'home';

    const m = (typeof getActiveMachine === 'function') ? getActiveMachine(p) : null;
    if (!m) return { ducts: [], fans: [] };

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

    // ❌ A-mallissa EI:
    // - migraatiota täällä
    // - mm.valves "virtuaalilistaa"

    return mm;
}

function focusValveOnMap(ductId, valveId) {
    const p = projects.find(x => String(x.id) === String(activeProjectId));
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const ui = getMachineUiState(machine.id);
    if (!ui) return;

    ui.map.activeDuctId  = String(ductId);
    ui.map.activeValveId = String(valveId);
    ui.map.zoom = 'duct';

    persistUiStateToProject();
    renderVisualContent();
    renderDetailsList();
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
function renderProjectArchive() {
    if (typeof loadData === 'function') loadData();

    const el = document.getElementById('projectArchiveList');
    if (!el) return;

    const archived = (projects || []).filter(p => p.archived);

    if (!archived.length) {
        el.innerHTML = `<div style="color:#777; padding:20px;">Arkisto on tyhjä</div>`;
        return;
    }

    el.innerHTML = archived.map(p => `
      <div style="
        background:#fff;
        border:1px solid #ddd;
        border-radius:12px;
        padding:12px;
        margin:10px 0;
        display:flex;
        justify-content:space-between;
        align-items:center;
      ">
        <div>
          <div style="font-weight:700;">${p.name}</div>
          <div style="font-size:12px; color:#666;">${p.systemType || ''}</div>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary"
                  onclick="activateProject('${p.id}','home')">
            Avaa
          </button>
          <button class="btn btn-danger"
                  onclick="deleteProject('${p.id}')">
            🗑 Poista
          </button>
        </div>
      </div>
    `).join('');
}

function openArchiveView() {
    showView('view-project-archive');
    renderProjectArchive();
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

function renderVisualContent() {
    console.log('🔥 renderVisualContent CALLED, mapLevel=', window.mapLevel);

    // 1) VARMISTA MAP DOM
    const dom = ensureMapDom();
    if (!dom) return;

    const { world } = dom;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    // Päivitä kartan valitsin (napit)
    const selector = document.getElementById('mapViewSelector');
    if (selector) {
        const machine = getActiveMachine(p);
        const mode = window.currentMode || 'home';
        const ducts = machine?.modes?.[mode]?.ducts || [];
        renderMapViewSelector(selector, ducts);
    }

    // Yläpalkki (ennallaan)
    const roofBar = document.getElementById('visRoofBar');
    if (roofBar) {
        roofBar.innerHTML = '';

        if (window.activeDuctId) {
            roofBar.innerHTML += `
                <button class="btn btn-secondary"
                        style="margin-right:8px; padding:4px 8px; font-size:12px;"
                        onclick="exitDuctZoom()">
                    ⬅ Takaisin runkoihin
                </button>
            `;
        }

        renderMachineSelector(roofBar);
    }

    // 2) KARTTATASOLOGIIKKA
    if (!window.mapLevel) {
        window.mapLevel = resolveMapLevelFromZoom(window.mapWorldState.scale);
    }

    // 3) RENDERÖINTI WORLDIIN
    world.innerHTML = '';

    if (window.mapLevel === 'machines') {
        renderMachineOverview(world);
        applyMapTransform();
        return;
    }

    // ducts + valves: toistaiseksi sama "runkokartta"
    renderHorizontalMap(dom.containerEl);
    applyMapTransform();

    try {
        applyStoredMapUiState?.();
    } catch (e) {
        console.warn('applyStoredMapUiState failed', e);
    }
}



function prepareRelativeUiDataForDuct(duct) {

    if (!duct || !Array.isArray(duct.valves)) return;

    // 🔧 FIX 1: d → duct
    (duct.valves || []).forEach(v => resolveValveFlow(v));

    duct.valves.forEach(v => {
        delete v._uiRatio;
        delete v._uiRatioClass;
        delete v._uiHint;
        delete v._uiSuggestPos;
        delete v._uiIsIndex;
    });

    const validValves = duct.valves.filter(v =>
        !v.__isDraft &&
        isFinite(v.flowEffective) &&
        isFinite(v.target) &&
        v.target > 0
    );

    if (!validValves.length) return;

    // 🔧 FIX 2: käytä flowEffective
    validValves.forEach(v => {
        v._uiRatio = v.flowEffective / v.target;
    });

    let indexValve = null;

    if (window.uiState?.indexLocked && window.uiState.indexValveId) {
        indexValve = validValves.find(v =>
            String(v.id) === String(window.uiState.indexValveId)
        );
    }

    // 🔧 FIX 3: huonoin suhdeluku
    if (!indexValve) {
        indexValve = validValves.reduce((worst, v) => {
            if (!worst) return v;
            return v._uiRatio < worst._uiRatio ? v : worst;
        }, null);
    }

    if (!indexValve) return;

    indexValve._uiIsIndex = true;

    validValves.forEach(v => {
        if (v === indexValve) {
            v._uiHint = 'INDEKSI';
            v._uiRatioClass = 'ratio-index';
            return;
        }

        const ratio = v._uiRatio;

        if (ratio < 0.95) {
            v._uiHint = 'AVAA';
            v._uiRatioClass = 'ratio-low';
        } else if (ratio > 1.05) {
            v._uiHint = 'KURISTA';
            v._uiRatioClass = 'ratio-high';
        } else {
            v._uiHint = 'OK';
            v._uiRatioClass = 'ratio-ok';
        }

        if (isFinite(v.pos) && isFinite(indexValve.pos) && ratio !== 0) {
            v._uiSuggestPos = roundValveOpening(v.pos / ratio, 0.5);
        }
    });
}


function buildValveGuidance(v) {
    if (!isFinite(v._uiRatio) || !isFinite(v._uiSuggestPos)) {
        return {
            action: null,
            text: null,
            suggested: null
        };
    }

    const rounded = roundValveOpening(v._uiSuggestPos, 0.5);
    const delta = rounded - Number(v.pos || 0);

    // pieni muutos → OK
    if (Math.abs(delta) < 0.25) {
        return {
            action: 'OK',
            text: 'OK',
            suggested: rounded
        };
    }

    if (delta > 0) {
        return {
            action: 'AVAA',
            text: `AVAA → ${rounded}`,
            suggested: rounded
        };
    }

    return {
        action: 'KURISTA',
        text: `KURISTA → ${rounded}`,
        suggested: rounded
    };
}

function exitDuctZoom() {
    captureCurrentMapUiState();

    window.machineZoom = 'all';
    window.activeDuctId = null;
    window.activeDuctLane = null;

    renderVisualContent();
}



function getMachinesForProject() {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return [];
    return p.machines || [];
}



function renderVerticalStackInto(container, p) {
const mm = getActiveMachineMode(p, window.currentMode || 'home');
const ducts = mm.ducts;


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

const ducts = mm.ducts || [];
const valves = ducts.flatMap(d =>
    Array.isArray(d.valves) ? d.valves : []
);

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

  const machine = getActiveMachine(p);
  if (!machine) return;

  const mode = window.currentMode || 'home';
  const ducts = machine.modes?.[mode]?.ducts || [];

  // Etsi runko jossa venttiili sijaitsee
  const duct = ducts.find(d => Array.isArray(d.valves) && d.valves.some(v => String(v.id) === String(valveId)));
  if (!duct) return;

  // Indeksi vain tämän rungon sisällä
  duct.valves.forEach(v => { v.isIndex = (String(v.id) === String(valveId)); });

  // UI-state (valinnainen, mutta ok)
  window.uiState.indexLocked = true;
  window.uiState.indexValveId = valveId;
window.mapViewState = window.mapViewState || {};
window.mapViewState.activeValveId = valveId;

  saveData?.();
  renderActiveProject?.();
};

window.unlockIndexValve = function () {
  const p = projects.find(x => x.id === activeProjectId);
  if (!p) return;

  const machine = getActiveMachine(p);
  if (!machine) return;

  const mode = window.currentMode || 'home';
  const ducts = machine.modes?.[mode]?.ducts || [];

  // Poista indeksit kaikista rungoista (tai tee vain aktiivisesta rungosta jos haluat rajata)
  ducts.forEach(d => {
    if (Array.isArray(d.valves)) d.valves.forEach(v => { v.isIndex = false; });
  });

  window.uiState.indexLocked = false;
  window.uiState.indexValveId = null;

  saveData?.();
  renderActiveProject?.();
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
const container = document.getElementById('visContent');    if (container) {
        renderHorizontalMap(container);
    }
}
function unlockIndexValve() {
    window.uiState.indexValveId = null;
    window.uiState.indexLocked = false;

    // Palataan analyysitilaan (ei indeksiä)
const container = document.getElementById('visContent');    if (container) {
        renderHorizontalMap(container);
    }
}
function renderMachineSelector() {
    const container = document.getElementById('machine-selector-bar');
    if (!container) return;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p || !Array.isArray(p.machines)) {
        container.innerHTML = '';
        return;
    }

    const activeId = window.uiState.activeMachineId;

    container.innerHTML = `
        <div class="machine-selector">
            ${p.machines.map(m => `
                <button
                    class="machine-btn ${String(m.id) === String(activeId) ? 'active' : ''}"
                    data-machine-id="${m.id}">
                    ${m.name || 'Kone'}
                </button>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.machine-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.machineId;
            if (String(id) !== String(window.uiState.activeMachineId)) {
                setActiveMachine(id);
            }
        });
    });
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
setActiveMachine(id);

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

   setActiveMachine(p.machines[0].id);


    saveData?.();
    renderDetailsList?.();
    renderVisualContent?.();
}

function updateVisualView() {
    const vb = document.getElementById('view-building');
    const vu = document.getElementById('view-unit');
    const vm = document.getElementById('view-machine');

    if (!vb || !vu || !vm) {
        console.warn('Visual view containers missing');
        return;
    }

    vb.hidden = window.visualLevel !== 'building';
    vu.hidden = window.visualLevel !== 'unit';
    vm.hidden = window.visualLevel !== 'machine';

    // kun ollaan koneessa, piirretään kartta
    if (window.visualLevel === 'machine') {
        if (typeof renderVisualContent === 'function') {
            renderVisualContent();
        }
    }
}
function renderMachineCardInfo(machine, mode) {
    const mm = machine.modes?.[mode];
    let sumSup = 0;
    let sumExt = 0;

    (mm?.ducts || []).forEach(d => {
        (d.valves || []).forEach(v => {
const f = getValveFlowEffective(v);
if (isFinite(f)) {
    if (d.type === 'supply') sumSup += f;
    if (d.type === 'extract') sumExt += f;
}
            if (d.type === 'supply') sumSup += f;
            if (d.type === 'extract') sumExt += f;
        });
    });

    const unitLabel =
        machine.unit === 'hz' ? 'Hz' :
        machine.unit === 'pa' ? 'Pa' :
        machine.unit === 'ls' ? 'l/s' :
        '%';

    const supSetting = machine?.supply?.setting ?? machine?.settingVal ?? '-';
    const extSetting = machine?.extract?.setting ?? machine?.settingVal ?? '-';

    return `
        <div class="machine-info-card">
            <div class="machine-info-header">
                ⚙️ ${machine.name || machine.id}
                <span class="machine-mode">${mode}</span>
            </div>

            <div class="machine-info-body">
                <div class="mi-row"><b>Säätö:</b> ${machine.unit?.toUpperCase() || '%'} (${unitLabel})</div>
                <div class="mi-row"><b>Tulo:</b> ${sumSup.toFixed(1)} l/s • ${supSetting} ${unitLabel}</div>
                <div class="mi-row"><b>Poisto:</b> ${sumExt.toFixed(1)} l/s • ${extSetting} ${unitLabel}</div>
            </div>
        </div>
    `;
}
function calcFlowFromKP(v) {
    const k = Number(v.kWorking);
    const p = Number(v.measuredP);

    if (!isFinite(k) || !isFinite(p) || p <= 0) return null;
    return k * Math.sqrt(p);
}
// =====================================================
// FLOW-EFFECTIVE: manuaalinen flow voittaa, muuten Pa+K
// =====================================================
function getValveFlowEffective(v) {
    if (!v) return null;

    // 1️⃣ Manuaalinen flow (vain jos oikeasti numero)
    if (v.flow !== '' && v.flow !== null && isFinite(Number(v.flow))) {
        return Number(v.flow);
    }

    // 2️⃣ Laskettu flow
    if (isFinite(Number(v.flowCalc))) {
        return Number(v.flowCalc);
    }

    // 3️⃣ Ei dataa
    return null;
}


function updateValveFlowCalcIfPossible(v) {
    if (!v) return;

    // Jos käyttäjä on syöttänyt manuaalisen flow'n, ei lasketa
    if (v.__manualFlow === true) return;

    const calc = calcFlowFromKP(v);

    if (isFinite(calc)) {
        v.flowCalc = calc;   // 🔥 TÄMÄ PUUTTUI
    } else {
        v.flowCalc = null;
    }
}

function recalcAllValveFlows(machine) {
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    if (!mm?.ducts) return;

    mm.ducts.forEach(d => {
        (d.valves || []).forEach(v => {
            updateValveFlowCalcIfPossible(v);
        });
    });
}

function resolveValveFlow(v) {
    if (!v) return null;

    // 1️⃣ Laske aina teoreettinen virta
    let calculated = null;
    if (isFinite(v.measuredP) && isFinite(v.kWorking)) {
        calculated = calcFlowFromKP(v);
    }

    v.flowCalculated = calculated;

    // 2️⃣ Jos käyttäjä on syöttänyt käsin → käytä sitä
    if (isFinite(v.measuredFlowManual)) {
        v.flowEffective = v.measuredFlowManual;
        v.flowSource = 'manual';
        return v.flowEffective;
    }

    // 3️⃣ Muuten käytä laskettua
    if (isFinite(calculated)) {
        v.flowEffective = calculated;
        v.flowSource = 'calculated';
        return v.flowEffective;
    }

    // 4️⃣ Ei tietoa
    v.flowEffective = null;
    v.flowSource = 'none';
    return null;
}
function renderHorizontalMap(container) {
    const dom = ensureMapDom();
    if (!dom) return;

    const { world } = dom;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    ensureUiState();

    const mode = window.currentMode || 'home';
    const machine = getActiveMachine(p);

    if (!machine) {
        world.innerHTML = '<div style="color:#777;">Ei konetta.</div>';
        applyMapTransform();
        return;
    }

    const mm = machine.modes?.[mode];
    const allDuctsRaw = mm?.ducts || [];

    if (!Array.isArray(allDuctsRaw) || !allDuctsRaw.length) {
        world.innerHTML = `<div class="map-empty">Ei runkoja tälle koneelle (${mode})</div>`;
        applyMapTransform();
        return;
    }

    let allDucts = allDuctsRaw;

    // UI-suodatus
    if (window.mapViewFilter?.type === 'duct' && window.mapViewFilter.ductId) {
        allDucts = allDucts.filter(d =>
            String(d.id) === String(window.mapViewFilter.ductId)
        );
    }

    // Suodata pois rungot joissa ei ole mitään järkevää näytettävää
    const filteredDucts = allDucts.filter(d =>
        Array.isArray(d.valves) &&
        d.valves.some(v =>
            !v.__isDraft &&
            (isFinite(getValveFlowEffective(v)) || isFinite(v.measuredP))
        )
    );

    if (!filteredDucts.length) {
        world.innerHTML = `<div class="map-empty">Ei mitattavia venttiileitä</div>`;
        applyMapTransform();
        return;
    }

    // A-malli UI-data
    filteredDucts.forEach(d => prepareRelativeUiDataForDuct(d));

    const supplyDucts  = filteredDucts.filter(d => d.type === 'supply');
    const extractDucts = filteredDucts.filter(d => d.type === 'extract');

    const renderLane = (laneType, ducts, label) => {
        if (!Array.isArray(ducts) || !ducts.length) return '';

        const trunkBlocks = ducts.map((d, trunkIndex) => {
            const valves = (Array.isArray(d.valves) ? d.valves : []).filter(v =>
                !v.__isDraft &&
                (isFinite(getValveFlowEffective(v)) || isFinite(v.measuredP))
            );

            if (!valves.length) return '';

            const showDots = window.mapWorldState.scale < ZOOM_TO_VALVE_DOTS;

            const cards = valves.map(v => {
                if (showDots) {
                    return `
                        <div class="valve-anchor">
                            ${renderValveDot(v)}
                        </div>
                    `;
                }

                const fs = getValveFlowStatus(v);
                const isActive =
                    String(v.id) === String(window.mapViewState?.activeValveId);

                let cls = 'map-valve clickable';
                if (isActive) cls += ' map-valve-active';
                if (v._uiIsIndex) cls += ' valve-index';
                if (v._uiHint === 'AVAA') cls += ' valve-open';
                if (v._uiHint === 'KURISTA') cls += ' valve-close';
                if (v._uiHint === 'OK') cls += ' valve-ok';

                const effFlow = getValveFlowEffective(v);

                return `
                    <div class="valve-anchor">
                        <div class="${cls}"
                             onclick="captureCurrentMapUiState();
         focusValveOnMap('${escapeJsString(d.id)}','${escapeJsString(v.id)}');
         focusMeasurementListRowByValveId('${escapeJsString(v.id)}')"

                            ${v._uiIsIndex ? `<div class="index-badge">INDEKSI</div>` : ''}

                            <div class="map-valve-top">
                                <div class="map-room">
                                    ${escapeHtml(v.room || '-')}
                                    <span class="valve-flow-dot valve-flow-${fs.color}"
                                          title="${fs.title}"></span>
                                </div>
                            </div>

                            <div class="valve-main">
                                <div class="valve-ratio ${v._uiRatioClass}">
                                    ${v._uiRatio ? v._uiRatio.toFixed(2) : '–'}
                                </div>
                            </div>

                            <div class="valve-flows">
                                <span>
                                    ${isFinite(effFlow) ? effFlow.toFixed(1) : '-'} l/s
                                </span>
                                <span>/ ${v.target ?? '-'} l/s</span>
                            </div>

                            <div class="valve-meta">
                                <span>Av ${isFinite(v.pos) ? Number(v.pos).toFixed(1) : '-'}</span>
                                <span>K ${v.kWorking ?? '-'}</span>
                            </div>

                            ${v._uiHint ? `
                                <div class="valve-hint">
                                    ${v._uiHint}
                                    ${v._uiSuggestPos != null
                                        ? ` → ${formatOpening(v._uiSuggestPos)}`
                                        : ''}
                                </div>
                            ` : ''}

                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="trunk-pipe">
                    <div class="trunk-pipe-line clickable"
                         onclick="captureCurrentMapUiState();
                                  zoomToDuct('${escapeJsString(d.id)}')">
                        <span class="trunk-name">
                            ${escapeHtml(d.name || `Runko ${trunkIndex + 1}`)}
                        </span>
                    </div>

                    <div class="map-valves-row pipe-attached">
                        ${cards}
                    </div>
                </div>
            `;
        }).join('');

        if (!trunkBlocks) return '';

        return `
            <div class="map-lane ${laneType}">
                <div class="map-pipe ${laneType}">
                    <div class="map-lane-label">
                        <span class="tag">${label}</span>
                    </div>
                    <div class="map-lane-trunks">
                        ${trunkBlocks}
                    </div>
                </div>
            </div>
        `;
    };

    // Venttiilitasolla enemmän tilaa
    world.style.padding = (window.mapLevel === 'valves')
        ? '80px 120px'
        : '40px';

    world.innerHTML = `
        <div class="map-wow">
            <div class="map-machine-row">
                ${renderMachineCardInfo(machine, mode)}
            </div>

            <div class="map-area" id="horizontal-map">
                ${renderLane('supply', supplyDucts, 'TULO')}
                ${renderLane('extract', extractDucts, 'POISTO')}
            </div>
        </div>
    `;

    applyMapTransform();
}



function renderMachineOverview(container) {
    if (!container) return;

    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machines = p.machines || [];
    if (!machines.length) {
        container.innerHTML = `<div style="color:#777;">Ei koneita projektissa</div>`;
        return;
    }

    container.innerHTML = `
        <div style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
            gap:16px;
            padding:20px;
        ">
            ${machines.map(m => renderMachineCard(m, p)).join('')}
        </div>
    `;
}
function renderMachineCard(machine, project) {
    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];

    let sumSup = 0;
    let sumExt = 0;

    if (mm?.ducts) {
        mm.ducts.forEach(d => {
            (d.valves || []).forEach(v => {
const f = Number(getValveFlowEffective(v)) || 0;
                if (d.type === 'supply') sumSup += f;
                if (d.type === 'extract') sumExt += f;
            });
        });
    }

    return `
        <div
            onclick="
                setActiveMachine('${machine.id}');
                window.mapLevel='ducts';
                renderVisualContent();
            "
            style="
                cursor:pointer;
                background:#fff;
                border:1px solid #ccc;
                border-radius:10px;
                padding:16px;
                box-shadow:0 2px 6px rgba(0,0,0,0.1);
            "
        >
            <div style="font-size:18px;font-weight:bold;margin-bottom:6px;">
                ⚙️ ${machine.name || machine.id}
            </div>

            <div style="font-size:13px;color:#555;">
                Tila: <b>${mode}</b>
            </div>

            <div style="margin-top:10px;font-size:14px;">
                <div>🔵 Tulo: <b>${sumSup.toFixed(1)} l/s</b></div>
                <div>🔴 Poisto: <b>${sumExt.toFixed(1)} l/s</b></div>
            </div>

            <div style="margin-top:10px;font-size:12px;color:#777;">
                Klikkaa → avaa kartta
            </div>
        </div>
    `;
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

function rerenderMap() {
    const container = document.getElementById('visContent');

    if (!container) {
        console.warn('rerenderMap: kartan containeria ei löytynyt');
        return;
    }

    renderHorizontalMap(container);
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


function getValveById(valveId, options = {}) {
    const {
        projectId = activeProjectId,
        mode = window.currentMode || 'home',
        strict = true
    } = options;

    if (!valveId) return null;

    const p = projects.find(x => x.id === projectId);
    if (!p) return null;

    const machine = getActiveMachine(p);
    if (!machine?.modes?.[mode]) return null;

    const ducts = machine.modes[mode].ducts || [];

    for (const duct of ducts) {
        if (!Array.isArray(duct.valves)) continue;
        const v = duct.valves.find(v => String(v.id) === String(valveId));
        if (v) return v;
    }

    if (strict) console.warn('getValveById: venttiiliä ei löydy', valveId);
    return null;
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
function scrollToElement(el) {
    if (!el) return;

    // ⛔ Automaattinen scroll poistettu
    // Mittalista ei saa hypätä ohjelman toimesta

    // Halutaan silti säilyttää visuaalinen korostus
    el.classList.add('highlight-scroll');
    setTimeout(() => el.classList.remove('highlight-scroll'), 1200);
}



function focusMeasurementListRowByValveId(valveId) {
    const container = document.getElementById('measurementList');
    if (!container || valveId == null) return;

    const row = container.querySelector(`tr[data-id="${String(valveId)}"]`);
    if (!row) return;

    // scroll
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // kevyt visuaalinen korostus
    row.style.outline = '2px solid rgba(33,150,243,0.6)';
    row.style.outlineOffset = '2px';
    setTimeout(() => {
        row.style.outline = '';
        row.style.outlineOffset = '';
    }, 900);

    // fokus ensimmäiseen kenttään
    const firstInput = row.querySelector('input');
    if (firstInput) {
        firstInput.focus();
        firstInput.select?.();
    }
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




function openValvePanel(valveId = null, options = {}) {
    const p = projects.find(x => x.id === activeProjectId);
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    const ducts = mm?.ducts || [];

    // 🔎 etsi venttiili ja sen omistava runko
    let v = null;
    let duct = null;

    for (const d of ducts) {
        for (const valve of (d.valves || [])) {
            if (valveId != null && String(valve.id) === String(valveId)) {
                v = valve;
                duct = d;
                break;
            }
        }
        if (v) break;
    }

    // ─────────────────────────────────────
    // UUSI VENTTIILI (A-malli)
    // ─────────────────────────────────────
    if (!v) {
        // jos ei ole runkoja, ei voida luoda venttiiliä (A-malli)
        if (!ducts.length) {
            alert('Luo ensin vähintään yksi runko (TULO tai POISTO), ennen kuin lisäät venttiilin.');
            if (typeof openCreateDuctModal === 'function') {
                openCreateDuctModal();
            }
            return;
        }

        // valitse runko options.parentDuctId jos annettu, muuten ensimmäinen
        const wantedDuctId = options?.parentDuctId ?? ducts[0].id;
        duct = ducts.find(d => String(d.id) === String(wantedDuctId)) || ducts[0];

        // ✅ luo venttiili A-mallin createValve-funktiolla
        v = createValve(duct, {
            room: '',
            type: '',
            pos: '',
            kWorking: '',
            flow: '',
            target: '',
            measuredP: ''
        });

        saveData?.();
    }

    // ─────────────────────────────────────
    // MODAALI
    // ─────────────────────────────────────
    let ov = document.getElementById('valve-modal-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'valve-modal-overlay';
        ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    ov.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                ${v.room || v.type ? '✏️ Muokkaa venttiiliä' : '➕ Lisää venttiili'}
            </div>

            <div class="modal-content valve-modal-v3">
                <label>Runko
                    <select id="vm-duct"></select>
                    <button
                        type="button"
                        class="btn btn-small"
                        id="vm-new-duct"
                        style="margin-top:6px;">
                        + Luo uusi runko
                    </button>
                </label>

                <div id="vm-new-duct-inline" style="display:none; margin-top:8px; padding:8px; border:1px dashed #ccc;">
                    <label>Rungon tyyppi
                        <select id="vm-new-duct-type">
                            <option value="supply">TULO</option>
                            <option value="extract">POISTO</option>
                        </select>
                    </label>

                    <label>Rungon nimi
                        <input id="vm-new-duct-name" placeholder="Esim. Tulo runko 1">
                    </label>

                    <button class="btn btn-primary" id="vm-create-duct">
                        Luo runko
                    </button>
                </div>

                <label>Huone
                    <input id="vm-room" value="${v.room || ''}">
                </label>

                <label>Päätelaite
                    <input id="vm-type" value="${v.type || ''}">
                </label>

                <label>Avaus
                    <input id="vm-pos" type="number" step="0.5" value="${v.pos ?? ''}">
                </label>

                <label>K-arvo
                    <input id="vm-k" type="number" step="0.01" value="${v.kWorking ?? ''}">
                    <div id="vm-k-hint" class="hint"></div>
                </label>

                <label>Mitattu l/s
                    <input id="vm-flow" type="number" value="${v.flow ?? ''}">
                </label>

                <label>Suunniteltu l/s
                    <input id="vm-target" type="number" value="${v.target ?? ''}">
                </label>

                <label style="margin-top:12px;">
                    <input type="checkbox" id="vm-is-index">
                    Tämä venttiili on indeksi
                </label>

                <div class="hint" style="margin-top:4px;">
                    Indeksiä ei säädetä. Muut venttiilit suhteutetaan tähän.
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn btn-primary" id="vm-save">Tallenna</button>
                <button class="btn" id="vm-cancel">Sulje</button>
            </div>

            <hr style="margin:16px 0; opacity:0.3;">

            <div class="modal-actions">
                <button class="btn" style="background:#c62828; color:#fff;" id="vm-delete">
                    🗑 Poista venttiili
                </button>
            </div>
        </div>
    `;

    ov.style.display = 'flex';

    // ─────────────────────────────────────
    // ELEMENTIT
    // ─────────────────────────────────────
    const ductSelect = document.getElementById('vm-duct');
    const newDuctBtn = document.getElementById('vm-new-duct');

    const roomEl   = document.getElementById('vm-room');
    const typeEl   = document.getElementById('vm-type');
    const posEl    = document.getElementById('vm-pos');
    const kEl      = document.getElementById('vm-k');
    const flowEl   = document.getElementById('vm-flow');
    const targetEl = document.getElementById('vm-target');
    const hintEl   = document.getElementById('vm-k-hint');

    const newDuctBox  = document.getElementById('vm-new-duct-inline');
    const newDuctType = document.getElementById('vm-new-duct-type');
    const newDuctName = document.getElementById('vm-new-duct-name');
    const createDuctBtn = document.getElementById('vm-create-duct');

    const indexEl = document.getElementById('vm-is-index');
    if (indexEl) indexEl.checked = v.isIndex === true;

    // ─────────────────────────────────────
    // Täytä runkolista
    // ─────────────────────────────────────
    ductSelect.innerHTML = '';
    ducts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent =
            (d.type === 'supply' ? 'TULO – ' :
             d.type === 'extract' ? 'POISTO – ' : '') +
            (d.name || d.id);
        ductSelect.appendChild(opt);
    });

    if (duct) ductSelect.value = duct.id;

    // ─────────────────────────────────────
    // Rungon vaihto = siirrä venttiili rungosta toiseen (A-malli)
    // ─────────────────────────────────────
    ductSelect.onchange = () => {
        const selected = ducts.find(d => String(d.id) === String(ductSelect.value));
        if (!selected || !duct || selected === duct) return;

        // poista vanhasta rungosta
        duct.valves = duct.valves || [];
        const idx = duct.valves.findIndex(x => String(x.id) === String(v.id));
        if (idx >= 0) duct.valves.splice(idx, 1);

        // lisää uuteen runkoon
        selected.valves = selected.valves || [];
        selected.valves.push(v);

        // päivitä viite
        duct = selected;

        // päivitä order molemmissa (jos käytössä)
        (duct.valves || []).forEach((vv, i) => vv.order = i);

        saveData?.();
    };

    // ─────────────────────────────────────
    // Uuden rungon luonti modaalista
    // ─────────────────────────────────────
    newDuctBtn.onclick = () => {
        if (newDuctBox) newDuctBox.style.display = 'block';
    };

    if (createDuctBtn) {
        createDuctBtn.onclick = () => {
            const type = newDuctType.value;
            const name = newDuctName.value.trim();
            if (!name) { alert('Anna rungon nimi'); return; }

            const newDuct = { id: 'duct_' + Date.now(), type, name, valves: [] };
            ducts.push(newDuct);

            const opt = document.createElement('option');
            opt.value = newDuct.id;
            opt.textContent = (type === 'supply' ? 'TULO – ' : 'POISTO – ') + name;
            ductSelect.appendChild(opt);

            // valitse ja siirrä venttiili tähän runkoon
            ductSelect.value = newDuct.id;

            // poista vanhasta
            if (duct) {
                duct.valves = duct.valves || [];
                const idx = duct.valves.findIndex(x => String(x.id) === String(v.id));
                if (idx >= 0) duct.valves.splice(idx, 1);
            }

            // lisää uuteen
            newDuct.valves.push(v);
            duct = newDuct;

            if (newDuctBox) newDuctBox.style.display = 'none';

            // order päivitys
            newDuct.valves.forEach((vv, i) => vv.order = i);

            saveData?.();
        };
    }

 
    // ─────────────────────────────────────
    // K-ARVON EHDOTUS
    // ─────────────────────────────────────
    function resolveKind() {
        if (/pelti|damper|mittauspelti|iris/i.test(typeEl.value)) return 'damper';
        if (!duct) return 'valve';
        if (duct.type === 'supply') return 'supply';
        if (duct.type === 'extract') return 'extract';
        return 'valve';
    }

    function suggestK() {
        if (!hintEl) return;
        hintEl.textContent = '';

        const model = typeEl.value;
        const pos = Number(posEl.value);

        if (!model || !Number.isFinite(pos)) return;
        if (typeof klibResolveK !== 'function') return;

        const k = klibResolveK({
            kind: resolveKind(),
            model,
            size: '',
            variant: '',
            pos
        });

        if (Number.isFinite(k)) {
            hintEl.textContent = `📚 Ehdotus kirjastosta: K=${k.toFixed(2)}`;
            if (!kEl.value) kEl.value = k.toFixed(2);
        }
    }

    if (posEl) posEl.addEventListener('input', suggestK);
    if (typeEl) typeEl.addEventListener('blur', suggestK);

    // ─────────────────────────────────────
    // INDEKSIN VAIHTO (vain saman rungon sisällä)
    // ─────────────────────────────────────
    if (indexEl) {
        indexEl.onchange = () => {
            if (!duct) return;
            (duct.valves || []).forEach(x => { x.isIndex = false; });
            v.isIndex = indexEl.checked === true;
        };
    }

    // ─────────────────────────────────────
    // TALLENNUS
    // ─────────────────────────────────────
    document.getElementById('vm-save').onclick = () => {
        const oldK = v.kWorking;

        v.room     = roomEl.value;
        v.type     = typeEl.value;
        v.pos      = posEl.value === '' ? '' : Number(posEl.value);
        v.kWorking = kEl.value === '' ? '' : Number(kEl.value);
        v.flow     = flowEl.value === '' ? '' : Number(flowEl.value);
        v.target   = targetEl.value === '' ? '' : Number(targetEl.value);
        if (indexEl) v.isIndex = indexEl.checked === true;

        // kysy kirjastoon tallennus vain jos K muuttui
        if (
            v.kWorking !== '' &&
            v.kWorking !== oldK &&
            confirm('Tallennetaanko tämä K-arvo K-kirjastoon?')
        ) {
            saveKToLibraryV2({
                kind: resolveKind(),
                model: v.type,
                size: '',
                variant: '',
                pos: v.pos,
                k: v.kWorking,
                source: 'field'
            });
        }

        saveData?.();
        renderDetailsList?.();
        ov.style.display = 'none';
    };

    document.getElementById('vm-cancel').onclick = () => {
        ov.style.display = 'none';
    };

    const deleteBtn = document.getElementById('vm-delete');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            ov.style.display = 'none';
            deleteValve(v.id);
        };
    }
}


function openValveById(valveId) {
    if (!valveId) return;

    // Käytetään samaa logiikkaa kuin mittalistassa
    openValvePanel(valveId);
}

     function toggleIndexInfo() {
    alert(
        'Indeksiventtiili on venttiili, jota ei säädetä.\n\n' +
        'Muut venttiilit suhteutetaan siihen.\n\n' +
        'Valitse indeksi klikkaamalla venttiiliä kartassa ja rastittamalla "Tämä venttiili on indeksi".'
    );
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

    const machine = getActiveMachine(p);
    if (!machine) {
        el.innerText = '➕ Lisää kone';
        return;
    }

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    if (!mm || !Array.isArray(mm.ducts)) {
        el.innerText = '➕ Lisää runko';
        return;
    }

    const valves = mm.ducts.flatMap(d => d.valves || [])
        .filter(v => !v.__isDraft);

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
    document.activeElement?.blur?.();

    const getVal = id => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    // 🔹 Päivitä venttiilin arvot normaalisti
    updateValveInline(idx, 'room',         getVal(`valve-room-${idx}`));
    updateValveInline(idx, 'type',         getVal(`valve-size-${idx}`));
    updateValveInline(idx, 'parentDuctId', getVal('parentDuctId'));
    updateValveInline(idx, 'pos',          getVal(`valve-pos-${idx}`));
    updateValveInline(idx, 'measuredP',    getVal(`valve-pa-${idx}`));
    updateValveInline(idx, 'flow',         getVal(`valve-flow-${idx}`));
    updateValveInline(idx, 'target',       getVal(`valve-target-${idx}`));
    updateValveInline(idx, 'kWorking',     getVal(`valve-k-${idx}`));

    // 🔹 Validointi
    if (typeof updateValveModalValidation === 'function') {
        updateValveModalValidation(idx);
    }

    // ✅ EI AUTOSAVEA K-KIRJASTOON TÄÄLTÄ
    // (K tallennetaan vain käyttäjän omalla päätöksellä: Lisää K-arvo -modaalista tai openValvePanelin confirmista)

    saveData?.();

    if (typeof renderVisualContent === 'function') {
        renderVisualContent();
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

             

// --- KERROSTALO GENERAATTORI ---
function showGenerator() {
    document.getElementById('genModal').style.display = 'flex';
}
function closeGenerator() {
    document.getElementById('genModal').style.display = 'none';
}


function setVisualMode(mode) {
    window.activeVisMode = mode;

    if (mode === 'horizontal') {
        window.visualZoom = 'machine';
    }

    renderVisualContent();
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
function createValve(duct, initial = {}) {
    if (!duct) {
        console.warn('createValve: duct puuttuu');
        return null;
    }

    if (!Array.isArray(duct.valves)) {
        duct.valves = [];
    }

    const valve = {
        id: (crypto?.randomUUID
            ? crypto.randomUUID()
            : ('v_' + Date.now() + '_' + Math.random().toString(16).slice(2))),

        // 🔹 peruskentät
        room: '',
        type: '',
        pos: '',
        kWorking: '',
        kApproved: null,
        flow: '',
        target: '',
        measuredP: '',
        order: duct.valves.length,

        // 🔹 yliajettavat (modalista tms)
        ...initial
    };

    duct.valves.push(valve);

    return valve;
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

// Turvallinen stub asuntomodaalille pystynäkymässä
function openAptModal(aptId){
    try {
        if (window.showAptModal) return window.showAptModal(aptId);
    } catch(e) {}
    alert(`Asunto ${aptId}`);
}

// Apartment modal logic
let _aptModalState = { apt: null, shaftId: null, indices: [] };

function closeApartmentModal(){
    const el = document.getElementById('aptModal');
    if(el) el.style.display = 'none';
}

// Backward-compat: details view delete button calls this
function deleteCurrentProject(){
    const id = activeProjectId;
    if(!id) return;
    deleteProject(id);
}

// Pikapoisto venttiilille vaakavisualista



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
    if (!Array.isArray(userKList) || userKList.length < 1) return null;
    if (opening === null || opening === undefined || opening === '') return null;

    const op = Number(opening);
    if (!isFinite(op)) return null;

    // ✅ HYVÄKSYY SEKÄ {opening,k} ETTÄ {pos,k}
    const points = userKList
        .map(d => ({
            pos: Number(d.opening ?? d.pos),
            k: Number(d.k)
        }))
        .filter(d => isFinite(d.pos) && isFinite(d.k))
        .sort((a, b) => a.pos - b.pos);

    if (!points.length) return null;

    // ✅ Täsmäosuma (toimii vaikka olisi vain 1 piste)
    for (const p of points) {
        if (p.pos === op) return p.k;
    }

    // Ei extrapoloida
    if (points.length < 2) return null;
    if (op < points[0].pos || op > points[points.length - 1].pos) return null;

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (op >= p1.pos && op <= p2.pos) {
            return interpolateLinear(op, p1.pos, p1.k, p2.pos, p2.k);
        }
    }

    return null;
}

function resolveKForValve(v, options = {}) {
    if (!v) {
        return { value: null, source: 'none', note: 'Ei venttiiliä' };
    }

    // 1️⃣ Hyväksytty K – aina etusijalla
    if (typeof v.kApproved === 'number' && isFinite(v.kApproved)) {
        return { value: v.kApproved, source: 'approved', note: 'Hyväksytty K-arvo' };
    }

    const opening = v.pos;
const valveType = (v.kModel || v.type || '').trim();

    if (!valveType) {
        return { value: null, source: 'none', note: 'Venttiilin tyyppi puuttuu' };
    }

    // 2️⃣ Käyttäjän K-kirjasto V2 (AINOA lähde)
    // Rakennetaan käyttäjän pisteet: [{pos,k}, ...]
    const lib = window.userKLibraryV2;
    const all = Array.isArray(lib?.entries) ? lib.entries : [];

    // yritä osua ensisijaisesti samaan kindiin, mutta älä estä jos kind puuttuu
    const wantKind = (options.kind || v.kind || '').trim();

    let entries = all.filter(e =>
        (String(e.model || '').trim().toLowerCase() === valveType.toLowerCase())
    );

    if (wantKind) {
        const kindMatches = entries.filter(e => String(e.kind || '').trim().toLowerCase() === wantKind.toLowerCase());
        if (kindMatches.length) entries = kindMatches;
    }

    // pisteet interpolaatiolle
    const userKList = entries
        .map(e => ({ pos: Number(e.pos), k: Number(e.k), approved: !!e.approved, updatedAt: e.updatedAt || 0 }))
        .filter(x => isFinite(x.pos) && isFinite(x.k));

    const k = getInterpolatedUserK(userKList, opening);

    if (typeof k === 'number' && isFinite(k)) {
        return {
            value: k,
            source: 'user',
            note: 'K-kirjastosta (pos→K)'
        };
    }

    return { value: null, source: 'none', note: 'K-arvo puuttuu – lisää K-kirjastoon' };
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


// Tulosta Huippuimuri-pöytäkirja
// ❌ DEPRECATED
// Vanha jsPDF-pohjainen raportti.
// Ei enää käytössä.
// Korvattu unified-report + print-CSS -ratkaisulla.

function printReport() {
    window.print();
}


// ===============================
// VISUAL: Valve context menu
// ===============================

let activeValveContext = null;

function openValveContextMenu({ valve, machineId, ductId }, x, y) {
    closeValveContextMenu();

    const menu = document.createElement('div');
    menu.className = 'valve-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const isIndex = valve.isIndex === true;

    const openBtn = document.createElement('div');
    openBtn.className = 'vcm-item';
    openBtn.textContent = 'Avaa venttiili';
    openBtn.onclick = () => {
        closeValveContextMenu();
        openValveModal(valve.id); // ← olemassa oleva polku
    };

    menu.appendChild(openBtn);

    if (!isIndex) {
        const indexBtn = document.createElement('div');
        indexBtn.className = 'vcm-item vcm-primary';
        indexBtn.textContent = '⭐ Valitse indeksiksi';
        indexBtn.onclick = () => {
            setValveAsIndex({ valve, machineId, ductId });
            closeValveContextMenu();
            renderVisual(); // päivitä näkymä
        };
        menu.appendChild(indexBtn);
    } else {
        const info = document.createElement('div');
        info.className = 'vcm-item vcm-info';
        info.textContent = 'ⓘ Tämä on indeksiventtiili';
        menu.appendChild(info);
    }

    document.body.appendChild(menu);
    activeValveContext = menu;

    // sulje klikkaamalla muualle
    setTimeout(() => {
        document.addEventListener('click', closeValveContextMenu, { once: true });
    }, 0);
}

function closeValveContextMenu() {
    if (activeValveContext) {
        activeValveContext.remove();
        activeValveContext = null;
    }
}

// Erillinen Hybridi-demo (molemmat järjestelmät)

// Altista demofunktiot globaalisti index.html onclick-kutsuille

// Näytä pöytäkirja: Tulo/Poisto (ruudulla)
// Näytä pöytäkirja: Tulo/Poisto (ruudulla)  + hyväksytty K


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
function renderMapViewSelector(container, ducts = []) {
    if (!container) return;

    // varmista filtteri
    captureCurrentMapUiState();

    if (!window.mapViewFilter) {
        window.mapViewFilter = { type: 'all', ductId: null };
    }

    const isMachines = window.mapLevel === 'machines';
    const isDucts = window.mapLevel === 'ducts';

    const topRow = `
        <button class="btn btn-secondary"
            style="padding:5px 10px; font-size:12px; ${isMachines ? 'background:#2196F3;color:#fff;border-color:#1976D2;' : ''}"
            onclick="
                window.mapLevel='machines';
                renderVisualContent();
            ">
            🧩 Koneet
        </button>

        <button class="btn btn-secondary"
            style="padding:5px 10px; font-size:12px; ${isDucts ? 'background:#2196F3;color:#fff;border-color:#1976D2;' : ''}"
            onclick="
                window.mapLevel='ducts';
                renderVisualContent();
            ">
            🧱 Rungot
        </button>
    `;

    // Runkosuodatin näkyy vain ducts-tilassa
    let filterRow = '';
    if (isDucts) {
        const btnAllActive = window.mapViewFilter.type === 'all';

        filterRow += `
            <button class="btn btn-secondary"
                style="padding:5px 10px; font-size:12px; ${btnAllActive ? 'background:#333;color:#fff;border-color:#222;' : ''}"
                onclick="
                    window.mapViewFilter={type:'all', ductId:null};
                    window.activeDuctLane=null;
                    renderVisualContent();
                ">
                Kaikki rungot
            </button>
        `;

        // Tee nappi jokaiselle rungolle
        ducts.forEach(d => {
            const active =
                window.mapViewFilter.type === 'duct' &&
                String(window.mapViewFilter.ductId) === String(d.id);

            const lane = d.type === 'supply' ? 'supply' : 'extract';
            const labelPrefix = d.type === 'supply' ? 'TULO' : 'POISTO';
            const name = d.name || 'Runko';

            filterRow += `
                <button class="btn btn-secondary"
                    style="padding:5px 10px; font-size:12px; ${active ? 'background:#333;color:#fff;border-color:#222;' : ''}"
                    onclick="
                        window.mapViewFilter={type:'duct', ductId:'${String(d.id)}'};
                        window.activeDuctLane='${lane}';
                        renderVisualContent();
                    ">
                    ${labelPrefix}: ${escapeHtml(name)}
                </button>
            `;
        });
    }

    container.innerHTML = `
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            ${topRow}
        </div>
        ${filterRow ? `
            <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                ${filterRow}
            </div>
        ` : ''}
    `;
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
function insertDraftValveAt(duct, index) {
    if (!duct || !Array.isArray(duct.valves)) return;

    const draft = {
        id: 'draft_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        __isDraft: true,
        room: '',
        type: '',
        pos: '',
        kWorking: '',
        measuredP: '',
        flow: '',
        target: ''
    };

    duct.valves.splice(index, 0, draft);
requestAnimationFrame(() => {
    const rows = document.querySelectorAll('#measurementList tr');
    rows[index]?.querySelector('input')?.focus();
});

    saveData?.();
    renderDetailsList?.();
}

function createDraftValve(duct) {
    if (!duct.valves) duct.valves = [];

    // älä tee toista draftia
    const existing = duct.valves.find(v => v.__isDraft);
    if (existing) return existing;

    const draft = {
        id: null,
        __isDraft: true,
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
        // 🔒 TURVA: suodata rikkinäiset rivit
        list = Array.isArray(list)
            ? list.filter(item => item && typeof item.type === 'string')
            : [];

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
                <span>${typeof formatValveDisplay === 'function'
                    ? formatValveDisplay(item.type)
                    : item.type}</span>
                ${item.source === 'user'
                    ? '<span class="tag tag-user">★</span>'
                    : ''}
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
        const shown = (typeof formatValveDisplay === 'function')
            ? formatValveDisplay(type)
            : type;

        input.value = shown;
        input.dataset.raw = type;
        box.style.display = 'none';
        onSelect(type);
    }

    input.addEventListener('input', () => {
    console.log('⌨️ autocomplete input:', input.value);
    const list = search(input.value);
    console.log('🔍 search result:', list);
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
function addDraftValveRow() {
    const p = projects.find(p => p.id === activeProjectId);
    const machine = p && getActiveMachine(p);
    if (!machine) return;

    const mode = window.currentMode || 'home';
    const duct = machine.modes?.[mode]?.ducts?.[0];
    if (!duct) return;

    duct.valves.push({
        id: 'draft_' + Date.now(),
        __isDraft: true,
        room: '',
        type: '',
        pos: '',
        kWorking: '',
        measuredP: '',
        flow: '',
        target: ''
    });

    saveData?.();
    renderDetailsList?.();
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

    // Koneen mittausblokki
    if (typeof renderMachineMeasurementBlock === 'function') {
        renderMachineMeasurementBlock(machine, wrap);
    }

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

        if (!Array.isArray(duct.valves)) duct.valves = [];

        if (typeof createDraftValve === 'function') {
            createDraftValve(duct);
        }

        duct.valves.forEach(v => {
            const isDraft = !!v.__isDraft;
            const tr = document.createElement('tr');
            tr.className = isDraft ? 'valve-row draft-row' : 'valve-row';
            if (v.id) tr.dataset.id = v.id;

            if (!isDraft) {
                tr.addEventListener('click', e => {
                    if (
                        e.target.tagName === 'INPUT' ||
                        e.target.tagName === 'BUTTON' ||
                        e.target.closest('button')
                    ) return;
                    openValvePanel(v.id);
                });
            }

            const effFlow = getValveFlowEffective(v);

const pct =
    typeof calcPct === 'function' &&
    isFinite(effFlow) &&
    isFinite(v.target)
        ? calcPct(effFlow, v.target)
        : null;

const cls =
    typeof pctClass === 'function' && isFinite(pct)
        ? pctClass(pct)
        : '';


            const showSave =
                !v.__isDraft &&
                !!v.type &&
                Number.isFinite(Number(v.pos)) &&
                Number.isFinite(Number(v.kWorking)) &&
                (typeof isKValueNewForValve === 'function'
                    ? isKValueNewForValve(v)
                    : false);

            tr.innerHTML = `
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

                <td class="huone">
                    <input value="${v.room || ''}" data-f="room">
                </td>

                <td>
                    <input
                        value="${typeof formatValveDisplay === 'function'
                            ? (formatValveDisplay(v.type) || '')
                            : (v.type || '')}"
                        data-f="type"
                        data-raw="${v.type || ''}">
                </td>

                <td class="meta">
                    <input type="number" value="${v.measuredP ?? ''}" data-f="measuredP">
                </td>

                <td class="meta">
                    <input type="number" value="${v.pos ?? ''}" data-f="pos">
                </td>

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
                            ? `<span class="k-lock"
                                    title="Hyväksytty K (avaa klikkaamalla)"
                                    onclick="event.stopPropagation(); openUnlockKConfirm('${v.id}')">🔒</span>`
                            : showSave
                                ? `<span class="k-save-hint"
                                        title="Tallenna K-arvo kirjastoon"
                                        onclick="event.stopPropagation(); openSaveKModal('${v.id}')">💾</span>`
                                : ''
                    }
                </td>

                <td class="flow">
                    ${(() => {
    const eff = getValveFlowEffective(v);
    return `
        <input type="number"
               value="${typeof eff === 'number' && isFinite(eff)
                   ? eff.toFixed(1)
                   : ''}"
               data-f="flow">
    `;
})()}

                </td>

                <td class="flow">
                    <input type="number" value="${v.target ?? ''}" data-f="target">
                </td>

                <td class="pct-cell">
                    ${isDraft ? '-' : (isFinite(pct) ? pct : '')}
                </td>

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
        });

        if (typeof updateDuctStatus === 'function') {
            updateDuctStatus(duct);
        }
    });


}
function renderMeasurementListV3(listEl, project, machine) {
    if (!listEl || !project || !machine) return;

    const mode = window.currentMode || 'home';
    const mm = machine.modes?.[mode];
    const ducts = mm?.ducts || [];

    // apu: prosenttiväri
    const getPctColor = (pct) => {
        if (!Number.isFinite(pct)) return '#999';
        if (pct < 80) return '#c0392b';
        if (pct < 95) return '#e67e22';
        if (pct <= 105) return '#27ae60';
        return '#2980b9';
    };

    let html = `
        <table class="measurement-table">
            <thead>
                <tr>
                    <th>HUONE</th>
                    <th>PÄÄTELAITE</th>
                    <th>PA</th>
                    <th>AVAUS</th>
                    <th>K</th>
                    <th>L/S</th>
                    <th>SUUNN</th>
                    <th>%</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    // ─────────────────────────────────────────────
    // RYHMITELTY RENDER (TULO / POISTO / RUNKO)
    // ─────────────────────────────────────────────
    ducts.forEach(duct => {
        const valves = (duct.valves || []).filter(v => !v.__isDraft);
        if (valves.length === 0) return;

        // ryhmän prosentti
        const sumFlow = valves.reduce((s, v) => {
            const f = (typeof getValveFlowEffective === 'function')
                ? getValveFlowEffective(v)
                : Number(v.flow);
            return s + (Number.isFinite(f) ? f : 0);
        }, 0);

        const sumTarget = valves.reduce((s, v) => s + (Number(v.target) || 0), 0);
        const grpPct = sumTarget > 0 ? Math.round((sumFlow / sumTarget) * 100) : null;

        html += `
            <tr class="group-row ${duct.type}">
                <td colspan="8">
                    ${duct.type === 'supply' ? 'TULO' : 'POISTO'}
                    ${duct.name ? ' – ' + duct.name : ''}
                </td>
                <td style="text-align:right;font-weight:bold;color:${getPctColor(grpPct)}">
                    ${grpPct !== null ? grpPct + ' %' : ''}
                </td>
            </tr>
        `;

        valves.forEach(v => {
            const effFlow = (typeof getValveFlowEffective === 'function')
                ? getValveFlowEffective(v)
                : (Number.isFinite(Number(v.flow)) ? Number(v.flow) : null);

            const percent = (typeof calcPercent === 'function')
                ? calcPercent(effFlow, v.target)
                : null;

            // ⭐ indeksi (totuus vain datasta)
const isIndex =
    v._uiIsIndex === true ||
    v.relativeIndex === true ||
    v.isIndex === true;

// % luokka kenttäkäyttöön
const pctClass =
    !Number.isFinite(percent) ? '' :
    percent < 80 ? 'low' :
    percent < 95 ? 'mid' :
    percent <= 105 ? 'ok' :
    'high';

html += `
    <tr data-id="${v.id}">
        <td class="room-cell">
            ${isIndex ? '<span class="index-star">⭐</span>' : ''}
            <input data-f="room" value="${v.room ?? ''}">
        </td>

        <td>
            <input data-f="type" value="${v.type ?? ''}">
        </td>

        <td>
            <input data-f="measuredP" type="number"
                   value="${Number.isFinite(Number(v.measuredP)) ? v.measuredP : ''}">
        </td>

        <td>
            <input data-f="pos" type="number"
                   value="${Number.isFinite(Number(v.pos)) ? v.pos : ''}">
        </td>

        <td>
            <input data-f="kWorking" type="number" step="0.01"
                   value="${Number.isFinite(Number(v.kWorking)) ? v.kWorking : ''}">
        </td>

        <td>
            <input data-f="flow" type="number" step="0.1"
                   value="${Number.isFinite(Number(effFlow)) ? effFlow.toFixed(1) : ''}">
        </td>

        <td>
            <input data-f="target" type="number" step="0.1"
                   value="${Number.isFinite(Number(v.target)) ? v.target : ''}">
        </td>

        <td class="relative ${pctClass}">
            ${Number.isFinite(percent) ? Math.round(percent) + ' %' : '-'}
        </td>

        <td class="row-actions">
            <button data-act="up" type="button">↑</button>
            <button data-act="down" type="button">↓</button>
            <button data-act="delete" type="button">🗑</button>
        </td>
    </tr>
`;

        });
    });

    // ─────────────────────────────────────────────
    // DRAFT-RIVI (AINA LOPPUUN)
    // ─────────────────────────────────────────────
    html += `
        <tr class="draft-row">
            <td><input data-f="room" value=""></td>
            <td><input data-f="type" value=""></td>
            <td><input data-f="measuredP" type="number"></td>
            <td><input data-f="pos" type="number"></td>
            <td><input data-f="kWorking" type="number" step="0.01"></td>
            <td><input data-f="flow" type="number" step="0.1"></td>
            <td><input data-f="target" type="number" step="0.1"></td>
            <td class="relative">-</td>
            <td></td>
        </tr>
    `;

    html += `
            </tbody>
        </table>
    `;

    listEl.innerHTML = html;
}


function bindMeasurementListV3(container) {
    if (!container) return;

    if (container.__bindV3Active) return;
    container.__bindV3Active = true;

    const numFields = new Set(['measuredP', 'pos', 'kWorking', 'flow', 'target']);

    const parseNum = (v) => {
        const n = parseFloat(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : '';
    };

    const getCtx = () => {
        const p = projects.find(x => x.id === activeProjectId);
        if (!p) return {};
        const machine = getActiveMachine(p);
        const mode = window.currentMode || 'home';
        const ducts = machine?.modes?.[mode]?.ducts || [];
        return { p, machine, ducts, mode };
    };

    const findValveForRow = (tr) => {
        const id = tr?.dataset?.id;
        if (!id) return { duct: null, v: null };

        const { ducts } = getCtx();
        for (const duct of ducts) {
            const v = (duct.valves || []).find(x => String(x.id) === String(id));
            if (v) return { duct, v };
        }
        return { duct: null, v: null };
    };

    const ensureOneDraftRowAtEnd = () => {
        const tbody = container.querySelector('tbody');
        if (!tbody) return;

        const drafts = tbody.querySelectorAll('tr.draft-row');
        drafts.forEach((d, i) => { if (i !== drafts.length - 1) d.remove(); });

        if (!tbody.querySelector('tr.draft-row')) {
            const tr = document.createElement('tr');
            tr.className = 'draft-row';
            tr.innerHTML = `
                <td><input data-f="room"></td>
                <td><input data-f="type"></td>
                <td><input data-f="measuredP" type="number"></td>
                <td><input data-f="pos" type="number"></td>
                <td><input data-f="kWorking" type="number" step="0.01"></td>
                <td><input data-f="flow" type="number" step="0.1"></td>
                <td><input data-f="target" type="number" step="0.1"></td>
                <td class="relative">-</td>
                <td></td>
            `;
            tbody.appendChild(tr);
        }
    };

    const updateRowComputedUI = (tr, v) => {
        try {
            if (typeof resolveValveFlow === 'function') {
                resolveValveFlow(v);
            }

            const eff = typeof getValveFlowEffective === 'function'
                ? getValveFlowEffective(v)
                : v.flow;

            if (!v.__manualFlow) {
                const fInp = tr.querySelector('input[data-f="flow"]');
                if (fInp && Number.isFinite(eff)) {
                    fInp.value = eff.toFixed(1);
                }
            }

            const pct = typeof calcPercent === 'function'
                ? calcPercent(eff, v.target)
                : null;

            const pctCell = tr.querySelector('.relative');
            if (pctCell) {
                pctCell.textContent = Number.isFinite(pct) ? Math.round(pct) + ' %' : '-';
            }
        } catch {}
    };

    const bindSimpleValveAutocomplete = (input) => {
    if (input.__autoBound) return;
    input.__autoBound = true;

    let box;

    input.addEventListener('input', () => {
        const q = input.value.toLowerCase();
        if (!q) {
            if (box) box.remove();
            return;
        }

        const matches = (window.valveGroups || [])
            .filter(v => v.toLowerCase().includes(q))
            .slice(0, 6);

        if (box) box.remove();
        if (!matches.length) return;

        box = document.createElement('div');
        box.className = 'simple-autocomplete';
        box.style.position = 'absolute';
        box.style.background = '#fff';
        box.style.border = '1px solid #ccc';
        box.style.zIndex = 9999;

        matches.forEach(name => {
            const item = document.createElement('div');
            item.textContent = name;
            item.style.padding = '6px';
            item.style.cursor = 'pointer';
            item.onclick = () => {
                input.value = name;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                box.remove();
            };
            box.appendChild(item);
        });

        document.body.appendChild(box);
        const r = input.getBoundingClientRect();
        box.style.left = r.left + 'px';
        box.style.top = (r.bottom + 2) + 'px';
        box.style.width = r.width + 'px';
    });
};


    container.addEventListener('input', (e) => {
        const inp = e.target;
        if (!(inp instanceof HTMLInputElement)) return;

        const tr = inp.closest('tr');
        if (!tr) return;

        const field = inp.dataset.f;
        if (!field) return;
// 🔎 Päätelaite-autocomplete (V3, kevyt)
if (field === 'type') {
    bindSimpleValveAutocomplete(inp);
}

        // ⭐ DRAFT → LIVE HETI
        if (tr.classList.contains('draft-row')) {
            const { ducts } = getCtx();
            const duct = ducts?.[0];
            if (!duct) return;

            const v = {
                id: crypto.randomUUID(),
                room: '',
                type: '',
                measuredP: '',
                pos: '',
                kWorking: '',
                flow: '',
                target: '',
                __manualFlow: false
            };

            duct.valves = duct.valves || [];
            duct.valves.push(v);

            tr.classList.remove('draft-row');
            tr.dataset.id = v.id;

            ensureOneDraftRowAtEnd();
        }

        const { duct, v } = findValveForRow(tr);
        if (!v) return;

        if (numFields.has(field)) {
            v[field] = parseNum(inp.value);
        } else {
            v[field] = inp.value;
        }

        if (field === 'flow') {
            v.__manualFlow = inp.value !== '';
        }

        // 🔁 AVAUS → K automaattisesti
        if (field === 'pos' && v.type && typeof resolveWorkingKForValve === 'function') {
            const k = resolveWorkingKForValve(v);
            if (Number.isFinite(k)) {
                v.kWorking = k;
                const kInp = tr.querySelector('input[data-f="kWorking"]');
                if (kInp) kInp.value = k;
            }
        }

        updateRowComputedUI(tr, v);
        try { recomputeAfterChange?.(duct); } catch {}
        saveData?.();
    });

    ensureOneDraftRowAtEnd();
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
const flow = getValveFlowEffective(v);
if (!isFinite(flow)) return null;
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
if (!isFinite(flow)) {
    return {
        ...v,
        _uiHint: 'EI DATAA',
        _uiRatio: null
    };
}
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

function zoomToDuct(ductId) {
    const p = projects.find(x => String(x.id) === String(activeProjectId));
    if (!p) return;

    const machine = getActiveMachine(p);
    if (!machine) return;

    const ui = getMachineUiState(machine.id);
    if (!ui) return;

    ui.map.activeDuctId  = String(ductId);
    ui.map.activeValveId = null;
    ui.map.zoom = 'duct';

    persistUiStateToProject();
    renderVisualContent();
}

function zoomToValve(ductId, valveId) {
    // 🎯 Aseta aktiivinen venttiili
    window.mapViewState = window.mapViewState || {};
    window.mapViewState.activeValveId = valveId;
    window.mapViewState.activeDuctId = ductId;

    // 🔍 Zoomaa venttiilitasolle
    const targetScale = Math.max(
        window.mapWorldState.scale,
        ZOOM_TO_VALVES + 0.05
    );

    window.mapWorldState.scale = targetScale;
    window.mapLevel = 'valves';

    applyMapTransform();

    // 🔄 Renderöi kartta uudelleen
    if (typeof renderVisualContent === 'function') {
        renderVisualContent();
    }

    // ✅ ODOTA DOMIN VALMISTUMISTA (2 frameä varmuuden vuoksi)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (typeof openValveById === 'function') {
                openValveById(valveId);
            }
        });
    });
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
const flow = getValveFlowEffective(v);
if (!isFinite(flow)) return v;

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
function getValveFlowStatus(v) {
    const f = Number(v.flow);
    const t = Number(v.target);

    // ⚪ Ei suunniteltua tai mitattua
    if (!Number.isFinite(f) || !Number.isFinite(t) || t <= 0) {
        return {
            color: 'gray',
            title: 'Suunniteltu ilmamäärä puuttuu',
            pct: null
        };
    }

    // Saavutusprosentti: mitattu / suunniteltu
    const achievedPct = (f / t) * 100;
    const achieved = Math.round(achievedPct);

    // Poikkeama 100%:sta värikynnyksiä varten
    const diffFrom100 = Math.abs(achievedPct - 100);
    const diff = Math.round(diffFrom100);

    // 🟢 ±10 % (90–110 %)
    if (diffFrom100 <= 10) {
        return {
            color: 'green',
            pct: achieved,
            title: `Saavutus ${achieved}% suunnitellusta (poikkeama ${diff}%)`
        };
    }

    // 🟡 11–20 % (80–89 % tai 111–120 %)
    if (diffFrom100 <= 20) {
        return {
            color: 'yellow',
            pct: achieved,
            title: `Saavutus ${achieved}% suunnitellusta (poikkeama ${diff}%)`
        };
    }

    // 🔴 > 20 %
    return {
        color: 'red',
        pct: achieved,
        title: `Saavutus ${achieved}% suunnitellusta (poikkeama ${diff}%)`
    };
}
function updateSuggestedKInModal(valveId) {
  const v = getValveById(valveId);
  if (!v) return;

  const kInput = document.getElementById('valve-k');
  const kInfo  = document.getElementById('k-source-text');
  const kWarn  = document.getElementById('k-lock-warning');
  if (!kInput || !kInfo) return;

  // 🔒 HYVÄKSYTTY K → EI MUUTETA
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

  // 📚 1) Oma kirjasto (suora)
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

  // 📐 2) Väliarvo omasta kirjastosta
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

  // 🏭 3) Sisäinen (valveDB/getK)
  if (typeof getK === 'function') {
    const k = getK(valveType, Number(opening));
    if (typeof k === 'number' && k > 0) {
      kInput.value = k.toFixed(2);
      v.kWorking = k;
      kInfo.innerHTML = '🏭 Sisäinen K-data';
      return;
    }
  }

  kInfo.innerHTML = 'K-ehdotusta ei löytynyt';
}

function handleMeasurementChange(valveId) {
    const v = getValveById(valveId);
    if (!v) return;

    if (typeof v.kApproved === 'number') {
        const warn = document.getElementById('k-lock-warning');
        if (warn) {
            warn.style.display = 'block';
            warn.innerHTML = '🔒 K-arvo on lukittu';
        }
        return;
    }

    updateSuggestedKInModal(valveId);
}





function approveWorkingK(valveId) {
  const v = getValveById(valveId);
  if (!v) return;

  if (!isFinite(v.kWorking)) return;

  v.kApproved = v.kWorking;

  saveData?.();
  renderDetailsList?.();
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

function saveCurrentKToLibrary() {
    console.warn('saveCurrentKToLibrary: vanha K-kirjastotoiminto poistettu (V2)');
}



function openKLibraryPicker() {
    console.warn('openKLibraryPicker: vanha toiminto poistettu (V2)');
}
// ==============================
// KLIB DETAIL MODAL (K1)
// ==============================

function safeKlibSave() {
  // käytä jos sinulla on jo oma tallennusfunktio
  if (typeof klibSave === 'function') return klibSave();
  if (typeof saveUserKLibraryV2 === 'function') return saveUserKLibraryV2();

  // fallback
  try {
    localStorage.setItem('KLIB_V2', JSON.stringify(window.userKLibraryV2 || {}));
  } catch (e) {
    console.warn('safeKlibSave failed:', e);
  }
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function closeKLibDetail() {
  const m = document.getElementById('klibDetailModal');
  if (m) m.style.display = 'none';

  // 🔁 Tyhjennä detail-konteksti
  window.__klibDetailCtx = null;

  // 🔁 Nollaa K1.5A "näytä vain odottavat"
  const cb = document.getElementById('klibOnlyPending');
  if (cb) cb.checked = false;
}


function openKLibDetail(entryLike) {
  // entryLike voi olla:
  // 1) koko entry-objekti (kortista)
  // 2) id (string)
  // 3) { kind, model, size, variant } objekti
  const lib = window.userKLibraryV2;
  if (!lib || !Array.isArray(lib.entries)) {
    alert('K-kirjasto ei ole vielä valmis / latautunut.');
    return;
  }

  let base = null;

  if (typeof entryLike === 'string') {
    base = lib.entries.find(x => x.id === entryLike) || null;
  } else if (entryLike && typeof entryLike === 'object') {
    if (entryLike.id) base = lib.entries.find(x => x.id === entryLike.id) || entryLike;
    else base = entryLike;
  }

  if (!base) {
    alert('K-merkintää ei löydy.');
    return;
  }

  const ctx = {
    kind: (base.kind || '').toLowerCase(),
    model: String(base.model || '').trim(),
    size: String(base.size || '').trim(),
    variant: String(base.variant || '').trim()
  };

  window.__klibDetailCtx = ctx;

  // otsikot
  const titleEl = document.getElementById('klibDetailTitle');
  const metaEl = document.getElementById('klibDetailMeta');

  if (titleEl) {
    const vtxt = ctx.variant ? ` • ${ctx.variant}` : '';
    titleEl.textContent = `📌 ${ctx.model} Ø${ctx.size}${vtxt}`;
  }
  if (metaEl) {
    metaEl.textContent = `Laji: ${ctx.kind || '-'}  •  Näytetään kaikki K-arvot tälle venttiilille (kaikki avaukset).`;
  }

  // renderöi lista
  renderKLibDetail();

  // avaa modaali
  const modal = document.getElementById('klibDetailModal');
  if (modal) modal.style.display = 'flex';
}

function renderKLibDetail() {
  const ctx = window.__klibDetailCtx;

  const cb = document.getElementById('klibOnlyPending');
  const onlyPending = cb && cb.checked === true;

  const body = document.getElementById('klibDetailBody');
  if (!ctx || !body) return;

  const lib = window.userKLibraryV2 || { entries: [] };
  const allEntries = lib.entries
    .filter(e =>
      String((e.kind || '').toLowerCase()) === ctx.kind &&
      String(e.model || '').trim() === ctx.model &&
      String(e.size || '').trim() === ctx.size &&
      String(e.variant || '').trim() === ctx.variant &&
      (!onlyPending || !e.approved)   // ✅ K2.1
    )
    .sort((a, b) => {
      const ap = Number(a.pos), bp = Number(b.pos);
      if (ap !== bp) return ap - bp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  if (!allEntries.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" style="color:#888; text-align:center; padding:14px;">
          ${onlyPending ? 'Ei odottavia K-arvoja.' : 'Ei K-arvoja tälle venttiilille.'}
        </td>
      </tr>
    `;
    return;
  }

  // 🔑 käytössä-logiikka (kaikista, ei vain filttereistä)
  const latestPerPos = new Map();
  const byPos = new Map();

  (lib.entries || []).forEach(e => {
    const key = String(e.pos);
    if (!byPos.has(key)) byPos.set(key, []);
    byPos.get(key).push(e);
  });

  byPos.forEach((list, pos) => {
    const approved = list.filter(x => x.approved)
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    const latest = list.slice()
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    latestPerPos.set(pos, (approved || latest).id);
  });

  body.innerHTML = allEntries.map(e => {
    const used = latestPerPos.get(String(e.pos)) === e.id;

    const stateText = e.approved ? '✅ Hyväksytty' : '🕒 Odottaa';
    const src = e.source || e.createdBy || '';
    const ts = formatTs(e.createdAt || e.updatedAt);

    const rowStyle = e.approved
      ? 'background:#f1f8f4;'
      : 'background:#fffbea;';

    const usedBadge = used
      ? `<span style="
          display:inline-block;
          padding:2px 6px;
          border-radius:999px;
          background:#e8f5e9;
          font-size:11px;
          margin-left:6px;
        ">käytössä</span>`
      : '';

    const approveBtn = e.approved
      ? `<button class="btn btn-secondary"
                style="padding:6px 10px; font-size:12px;"
                onclick="klibSetApproved('${e.id}', false)">
            Peru
         </button>`
      : `<button class="btn btn-primary"
                style="padding:6px 10px; font-size:12px;"
                onclick="klibSetApproved('${e.id}', true)">
            Hyväksy
         </button>`;

    return `
      <tr style="${rowStyle}">
        <td><b>${e.pos}</b></td>
        <td>${e.k}</td>
        <td>${stateText}${usedBadge}</td>
        <td>${(typeof escapeHtml === 'function') ? escapeHtml(src) : (src || '')}</td>
        <td>${ts}</td>
        <td style="white-space:nowrap; text-align:right;">
          ${approveBtn}
          <button class="btn btn-danger"
                  style="padding:6px 10px; font-size:12px;"
                  onclick="klibDeleteById('${e.id}')">
            Poista
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

let klibActiveCategory = 'all';

function kindToCategory(kind) {
  if (kind === 'supply' || kind === 'extract') return 'valve';
  if (kind === 'damper') return 'damper';
  if (kind === 'diffuser') return 'diffuser';
  return 'other';
}

function renderKLibCategories() {
  const wrap = document.getElementById('klibCategoryTabs');
  if (!wrap) return;

  wrap.innerHTML = KLIB_CATEGORIES.map(cat => `
    <button class="btn ${klibActiveCategory === cat.id ? 'btn-primary' : 'btn-secondary'}"
            style="font-size:12px; padding:6px 10px;"
            onclick="selectKLibCategory('${cat.id}')">
      ${cat.label}
    </button>
  `).join('');
}

function selectKLibCategory(catId) {
  klibActiveCategory = catId;
  renderKLibCategories();
  renderKLibraryAdmin(); // olemassa oleva listausfunktio
}


function klibSetApproved(id, approved) {
  const lib = window.userKLibraryV2;
  if (!lib || !Array.isArray(lib.entries)) return;

  const e = lib.entries.find(x => x.id === id);
  if (!e) return;

  e.approved = !!approved;
  e.updatedAt = Date.now();
  if (e.approved) e.approvedAt = Date.now();

  safeKlibSave();

  // Päivitä molemmat näkymät
  if (typeof renderKLibraryAdmin === 'function') renderKLibraryAdmin();
  renderKLibDetail();
}
function klibApproveAllForCurrent() {
  const ctx = window.__klibDetailCtx;
  if (!ctx) return;

  const lib = window.userKLibraryV2;
  if (!lib || !Array.isArray(lib.entries)) return;

  const targets = lib.entries.filter(e =>
    String((e.kind || '').toLowerCase()) === ctx.kind &&
    String(e.model || '').trim() === ctx.model &&
    String(e.size || '').trim() === ctx.size &&
    String(e.variant || '').trim() === ctx.variant &&
    !e.approved
  );

  if (!targets.length) {
    alert('Ei hyväksymättömiä K-arvoja.');
    return;
  }

  const ok = confirm(
    `Hyväksytäänkö kaikki tämän venttiilin K-arvot?\n\n` +
    `Malli: ${ctx.model}\n` +
    `Koko: ${ctx.size}\n` +
    `Määrä: ${targets.length}`
  );

  if (!ok) return;

  const now = Date.now();

  targets.forEach(e => {
    e.approved = true;
    e.approvedAt = now;
    e.updatedAt = now;
  });

  // 🔒 tallenna turvallisesti
  if (typeof safeKlibSave === 'function') {
    safeKlibSave();
  }

  // 🔄 päivitä näkymät
  if (typeof renderKLibraryAdmin === 'function') {
    renderKLibraryAdmin();
  }
  renderKLibDetail();
}

function klibDeleteById(id) {
  if (!confirm('Poistetaanko tämä K-arvo pysyvästi?')) return;

  const lib = window.userKLibraryV2;
  if (!lib || !Array.isArray(lib.entries)) return;

  lib.entries = lib.entries.filter(x => x.id !== id);

  // jos sinulla on index-rakenne, rebuildataan turvallisesti
  if (typeof klibRebuildIndex === 'function') {
    klibRebuildIndex();
  } else if (lib.index) {
    // fallback: tyhjennä index, jotta ei jää haamuja
    lib.index = {};
  }

  safeKlibSave();

  if (typeof renderKLibraryAdmin === 'function') renderKLibraryAdmin();
  renderKLibDetail();
}


window.openKLibraryPicker = openKLibraryPicker;
window.saveCurrentKToLibrary = saveCurrentKToLibrary;


window.openKLibraryPicker = openKLibraryPicker;
window.saveCurrentKToLibrary = saveCurrentKToLibrary;


