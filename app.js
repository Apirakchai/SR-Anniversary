/* ═══════════════════════════════════════════════════════════════
   Safe & Ruang · app.js
   - Login with SHA-256 password
   - Google Sheets + Drive sync (per-user OAuth)
   - LocalStorage cache for offline use
   - Anniversary surprise (8th of every month)
   - Confetti + floating hearts
═══════════════════════════════════════════════════════════════ */

// ───────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────
const CONFIG = {
  // SHA-256 of "080121"
  PASSWORD_HASH: '118d7c585c0ca03cd5fbeb837481aa07cdf151b94714c3a90d4b28ee560540a7',

  // Anniversary date
  ANNIV_DAY: 8,
  ANNIV_MONTH: 1,   // January
  ANNIV_YEAR: 2021,

  // Google Drive folder ID where photos will be stored
  DRIVE_FOLDER_ID: '1p2Njr1sdRxva2wnrpKBJ0eh8mHxpe6WV',

  // Google Sheets — will be created automatically if not set
  SHEET_NAME: 'SafeRuang_Stories',
  SHEET_TAB: 'Stories',

  // Google API scopes
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4',
                   'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
};

const LS = {
  STORIES   : 'sr_stories',
  USER      : 'sr_user',
  CLIENT_ID : 'sr_client_id',
  API_KEY   : 'sr_api_key',
  SHEET_ID  : 'sr_sheet_id',
  TOKEN     : 'sr_token',
  SEEN_ANNIV: 'sr_seen_anniv',
};


// ───────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────
let state = {
  user: null,
  stories: [],
  pendingPhotos: [],   // {file, dataURL, driveId?}
  editingId: null,
  google: {
    tokenClient: null,
    accessToken: null,
    gapiReady: false,
    gisReady: false,
    sheetId: null,
  }
};


// ───────────────────────────────────────────────
// UTILITIES
// ───────────────────────────────────────────────
const $  = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];

async function sha256(text){
  const buf  = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
}

function uid(){ return 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

function toast(msg, type='', ms=2800){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), ms);
}

function loadLS(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveLS(key, val){ localStorage.setItem(key, JSON.stringify(val)); }


// ───────────────────────────────────────────────
// LOGIN
// ───────────────────────────────────────────────
function initLogin(){
  // user pick
  $$('.user-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.user-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.user = btn.dataset.user;
      $('#pinInput').focus();
    });
  });

  // pin enter key
  $('#pinInput').addEventListener('keypress', e=>{
    if (e.key === 'Enter') doLogin();
  });

  $('#loginBtn').addEventListener('click', doLogin);

  // auto-resume if previously logged in this session
  const cached = sessionStorage.getItem(LS.USER);
  if (cached){
    state.user = cached;
    showApp();
  }
}

async function doLogin(){
  const errEl = $('#loginError');
  errEl.textContent = '';

  if (!state.user){
    errEl.textContent = 'กรุณาเลือกชื่อก่อนค่ะ/ครับ';
    return;
  }
  const pin = $('#pinInput').value.trim();
  if (!pin){
    errEl.textContent = 'ใส่รหัสด้วยนะ';
    return;
  }

  const hash = await sha256(pin);
  if (hash !== CONFIG.PASSWORD_HASH){
    errEl.textContent = 'รหัสไม่ถูกต้อง ลองอีกครั้งนะ';
    $('#pinInput').value = '';
    $('#pinInput').focus();
    return;
  }

  sessionStorage.setItem(LS.USER, state.user);
  showApp();
}

function showApp(){
  $('#loginScreen').classList.remove('active');
  $('#appScreen').classList.add('active');
  $('#welcomeUser').textContent = `Hi, ${state.user}`;
  initApp();
}

function logout(){
  sessionStorage.removeItem(LS.USER);
  state.user = null;
  $('#appScreen').classList.remove('active');
  $('#loginScreen').classList.add('active');
  $$('.user-btn').forEach(b=>b.classList.remove('active'));
  $('#pinInput').value = '';
  $('#loginError').textContent = '';
}


// ───────────────────────────────────────────────
// APP INIT
// ───────────────────────────────────────────────
function initApp(){
  // Load cached data
  state.stories = loadLS(LS.STORIES, []);
  state.google.sheetId = localStorage.getItem(LS.SHEET_ID) || null;

  initTabs();
  initForm();
  initSettings();
  initModal();
  initLogout();
  initSync();

  renderAll();
  startCounters();
  checkAnniversary();
  startHeartLayer();

  // Try to auto-sync if we have credentials cached
  if (localStorage.getItem(LS.CLIENT_ID) && localStorage.getItem(LS.API_KEY)){
    initGoogleAPI();
  }
}

function initLogout(){
  $('#logoutBtn').addEventListener('click', ()=>{
    if (confirm('ต้องการออกจากระบบหรือไม่?')) logout();
  });
}


// ───────────────────────────────────────────────
// TABS
// ───────────────────────────────────────────────
function initTabs(){
  $$('.tab').forEach(t=>{
    t.addEventListener('click', ()=>switchTab(t.dataset.tab));
  });
  $$('[data-go]').forEach(b=>b.addEventListener('click', ()=>switchTab(b.dataset.go)));
}
function switchTab(name){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  $$('.tab-panel').forEach(p=>p.classList.toggle('active', p.id===`tab-${name}`));
  if (name === 'add' && !state.editingId) resetForm();
  window.scrollTo({top:0, behavior:'smooth'});
}


// ───────────────────────────────────────────────
// COUNTERS (since 8 Jan 2021)
// ───────────────────────────────────────────────
function startCounters(){
  updateCounters();
  setInterval(updateCounters, 60000);
}

function updateCounters(){
  const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
  const now   = new Date();

  // total days
  const diffMs   = now - start;
  const totalDays = Math.floor(diffMs / 86400000);
  $('#daysTogether').textContent = `${totalDays.toLocaleString()} days together`;

  // years/months/days breakdown
  let years  = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days   = now.getDate() - start.getDate();
  if (days < 0){
    months -= 1;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0){ years -= 1; months += 12; }

  $('#cYears').textContent  = years;
  $('#cMonths').textContent = months;
  $('#cDays').textContent   = days;

  // next monthiversary
  const nextAnniv = new Date(now.getFullYear(), now.getMonth(), CONFIG.ANNIV_DAY);
  if (now.getDate() > CONFIG.ANNIV_DAY) nextAnniv.setMonth(nextAnniv.getMonth()+1);
  if (now.getDate() === CONFIG.ANNIV_DAY){
    $('#nextCount').textContent = '✨ today!';
  } else {
    const dLeft = Math.ceil((nextAnniv - now)/86400000);
    $('#nextCount').textContent = dLeft + ' days';
  }
}


// ───────────────────────────────────────────────
// FORM
// ───────────────────────────────────────────────
function initForm(){
  // Month select
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const sel = $('#storyMonth');
  months.forEach((m,i)=>{
    const opt = document.createElement('option');
    opt.value = i+1; opt.textContent = m;
    sel.appendChild(opt);
  });

  const now = new Date();
  sel.value = now.getMonth()+1;
  $('#storyYear').value = now.getFullYear();

  // Photo upload
  const area = $('#uploadArea');
  const input = $('#storyPhotos');
  area.addEventListener('click', ()=>input.click());
  area.addEventListener('dragover', e=>{e.preventDefault();area.classList.add('dragging')});
  area.addEventListener('dragleave', ()=>area.classList.remove('dragging'));
  area.addEventListener('drop', e=>{
    e.preventDefault();area.classList.remove('dragging');
    handleFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', e=>handleFiles(e.target.files));

  $('#cancelEdit').addEventListener('click', ()=>{
    resetForm();
    switchTab('timeline');
  });

  $('#storyForm').addEventListener('submit', onSaveStory);
}

function resetForm(){
  state.editingId = null;
  state.pendingPhotos = [];
  $('#storyId').value = '';
  $('#storyTitle').value = '';
  $('#storyText').value = '';
  $('#storyPlace').value = '';
  $('#photoPreview').innerHTML = '';
  $('#formTitle').textContent = 'เพิ่มเรื่องราวเดือนใหม่';
  const now = new Date();
  $('#storyMonth').value = now.getMonth()+1;
  $('#storyYear').value = now.getFullYear();
}

function handleFiles(fileList){
  [...fileList].forEach(file=>{
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev=>{
      const photo = { id: uid(), file, dataURL: ev.target.result, driveId: null, name: file.name };
      state.pendingPhotos.push(photo);
      renderPhotoPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreview(){
  const wrap = $('#photoPreview');
  wrap.innerHTML = '';
  state.pendingPhotos.forEach(p=>{
    const el = document.createElement('div');
    el.className = 'pp';
    el.innerHTML = `
      <img src="${p.dataURL || (p.driveId ? driveImageUrl(p.driveId) : '')}" alt=""/>
      <span class="x" data-id="${p.id}">×</span>
    `;
    el.querySelector('.x').addEventListener('click', e=>{
      e.stopPropagation();
      state.pendingPhotos = state.pendingPhotos.filter(x=>x.id !== p.id);
      renderPhotoPreview();
    });
    wrap.appendChild(el);
  });
}

function driveImageUrl(driveId){
  // Public thumbnail URL (works if file is shared)
  return `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
}

async function onSaveStory(e){
  e.preventDefault();

  const id      = $('#storyId').value || uid();
  const month   = parseInt($('#storyMonth').value, 10);
  const year    = parseInt($('#storyYear').value, 10);
  const title   = $('#storyTitle').value.trim();
  const text    = $('#storyText').value.trim();
  const place   = $('#storyPlace').value.trim();

  if (!title){ toast('ใส่หัวข้อด้วยนะ', 'error'); return; }

  toast('กำลังบันทึก...', '', 5000);

  // Upload pending photos to Google Drive (if connected)
  const photos = [];
  for (const p of state.pendingPhotos){
    if (p.driveId){
      photos.push({ id: p.driveId, name: p.name });
    } else if (p.file && state.google.accessToken){
      try{
        const driveId = await uploadToDrive(p.file);
        photos.push({ id: driveId, name: p.name });
      } catch(err){
        console.error(err);
        // fallback: store as data URL locally only
        photos.push({ id: null, name: p.name, dataURL: p.dataURL });
      }
    } else if (p.dataURL){
      // No google connected — store locally only (won't sync)
      photos.push({ id: null, name: p.name, dataURL: p.dataURL });
    }
  }

  const story = {
    id, month, year, title, text, place,
    photos,
    author: state.user,
    updatedAt: new Date().toISOString(),
  };

  // Insert or update
  const existing = state.stories.findIndex(s=>s.id===id);
  if (existing >= 0) state.stories[existing] = story;
  else state.stories.push(story);

  // Sort by year/month
  state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));

  saveLS(LS.STORIES, state.stories);

  // Sync to Sheet if connected
  if (state.google.accessToken){
    try { await syncToSheet(); }
    catch(err){ console.error(err); toast('บันทึกในเครื่องแล้ว แต่ sync ไม่สำเร็จ', 'error', 4000); }
  }

  resetForm();
  renderAll();
  switchTab('timeline');
  toast('บันทึกเรียบร้อย ♥', 'success');
}


// ───────────────────────────────────────────────
// RENDER TIMELINE
// ───────────────────────────────────────────────
function renderAll(){
  const list = $('#timeline');
  const empty = $('#emptyState');

  if (state.stories.length === 0){
    list.innerHTML = '';
    empty.classList.remove('hidden');
    $('#storyCount').textContent = '0 stories';
    return;
  }
  empty.classList.add('hidden');
  $('#storyCount').textContent = `${state.stories.length} stor${state.stories.length===1?'y':'ies'}`;

  const monthsTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  list.innerHTML = state.stories.map((s, idx)=>{
    const num = state.stories.length - idx; // newest gets highest #
    const cover = s.photos && s.photos[0]
      ? (s.photos[0].id ? driveImageUrl(s.photos[0].id) : s.photos[0].dataURL)
      : null;
    return `
      <article class="story-card" data-id="${s.id}">
        <div class="story-cover ${cover ? '' : 'placeholder'}">
          ${cover ? `<img src="${cover}" alt="" loading="lazy"/>` : ''}
          <div class="story-month-tag">${monthsTH[s.month]} · ${s.year}</div>
        </div>
        <div class="story-body">
          <div class="story-num">memory · n° ${String(num).padStart(2,'0')}</div>
          <h4 class="story-title">${escapeHtml(s.title)}</h4>
          <p class="story-snippet">${escapeHtml(s.text || '')}</p>
          <div class="story-meta">
            <span>by ${escapeHtml(s.author || '—')}</span>
            ${s.place ? `<span>· ${escapeHtml(s.place)}</span>` : ''}
            ${s.photos && s.photos.length>0 ? `<span>· ${s.photos.length} 📷</span>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  // click to open
  $$('.story-card').forEach(c=>{
    c.addEventListener('click', ()=>openStory(c.dataset.id));
  });
}

function escapeHtml(str=''){
  return str.replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}


// ───────────────────────────────────────────────
// MODAL
// ───────────────────────────────────────────────
function initModal(){
  $('#modalClose').addEventListener('click', closeModal);
  $('#storyModal .modal-backdrop').addEventListener('click', closeModal);
}

function openStory(id){
  const s = state.stories.find(x=>x.id===id);
  if (!s) return;

  const monthsFull = ['','January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const cover = s.photos && s.photos[0]
    ? (s.photos[0].id ? driveImageUrl(s.photos[0].id) : s.photos[0].dataURL)
    : null;

  const galleryHTML = s.photos && s.photos.length > 1
    ? `<div class="mc-gallery">${s.photos.slice(1).map(p=>{
        const src = p.id ? driveImageUrl(p.id) : p.dataURL;
        return `<img src="${src}" alt="" loading="lazy"/>`;
      }).join('')}</div>`
    : '';

  $('#modalContent').innerHTML = `
    <div class="mc-cover ${cover?'':'placeholder'}">
      ${cover ? `<img src="${cover}" alt=""/>` : ''}
    </div>
    <div class="mc-body">
      <p class="mc-eyebrow">${monthsFull[s.month]} ${s.year}</p>
      <h2 class="mc-title">${escapeHtml(s.title)}</h2>
      <div class="mc-meta">
        <span>by ${escapeHtml(s.author || '—')}</span>
        ${s.place ? `<span>📍 ${escapeHtml(s.place)}</span>` : ''}
        <span>${new Date(s.updatedAt).toLocaleDateString('th-TH')}</span>
      </div>
      <div class="mc-text">${escapeHtml(s.text || '— no story yet —')}</div>
      ${galleryHTML}
      <div class="mc-actions">
        <button class="btn-ghost danger" id="storyDelete">🗑 ลบ</button>
        <button class="btn-primary" id="storyEdit">✎ แก้ไข</button>
      </div>
    </div>
  `;

  $('#storyEdit').addEventListener('click', ()=>editStory(id));
  $('#storyDelete').addEventListener('click', ()=>deleteStory(id));

  $('#storyModal').classList.remove('hidden');
}

function closeModal(){
  $('#storyModal').classList.add('hidden');
}

function editStory(id){
  const s = state.stories.find(x=>x.id===id);
  if (!s) return;
  state.editingId = id;
  state.pendingPhotos = (s.photos||[]).map(p=>({
    id: uid(), driveId: p.id, name: p.name, dataURL: p.dataURL || (p.id ? driveImageUrl(p.id) : '')
  }));
  $('#storyId').value = s.id;
  $('#storyMonth').value = s.month;
  $('#storyYear').value = s.year;
  $('#storyTitle').value = s.title;
  $('#storyText').value = s.text || '';
  $('#storyPlace').value = s.place || '';
  $('#formTitle').textContent = '✎ แก้ไขเรื่องราว';
  renderPhotoPreview();
  closeModal();
  switchTab('add');
}

async function deleteStory(id){
  if (!confirm('ต้องการลบเรื่องราวนี้จริง ๆ ?')) return;
  state.stories = state.stories.filter(s=>s.id!==id);
  saveLS(LS.STORIES, state.stories);
  if (state.google.accessToken){
    try { await syncToSheet(); } catch(e){ console.error(e); }
  }
  closeModal();
  renderAll();
  toast('ลบแล้ว');
}


// ═══════════════════════════════════════════════════════════════
// GOOGLE INTEGRATION
// ═══════════════════════════════════════════════════════════════

function initSettings(){
  // load credentials into inputs
  $('#clientIdInput').value = localStorage.getItem(LS.CLIENT_ID) || '';
  $('#apiKeyInput').value   = localStorage.getItem(LS.API_KEY)   || '';
  $('#sheetIdDisplay').textContent = state.google.sheetId || '— (will be created on first sync)';

  $('#saveCreds').addEventListener('click', ()=>{
    const cid = $('#clientIdInput').value.trim();
    const key = $('#apiKeyInput').value.trim();
    if (!cid || !key){ toast('ต้องใส่ทั้ง Client ID และ API Key', 'error'); return; }
    localStorage.setItem(LS.CLIENT_ID, cid);
    localStorage.setItem(LS.API_KEY, key);
    toast('บันทึกแล้ว — กำลังโหลด Google API...', 'success');
    initGoogleAPI();
  });

  $('#googleConnectBtn').addEventListener('click', connectGoogle);
  $('#googleSyncNow').addEventListener('click', manualSync);
  $('#googleDisconnect').addEventListener('click', disconnectGoogle);

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', ()=>$('#importFile').click());
  $('#importFile').addEventListener('change', importData);
}

function setGoogleStatus(connected){
  const pill = $('#googleStatus');
  pill.textContent = connected ? '✓ เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ';
  pill.className = 'status-pill ' + (connected ? 'on' : 'off');
}

function initGoogleAPI(){
  const cid = localStorage.getItem(LS.CLIENT_ID);
  const key = localStorage.getItem(LS.API_KEY);
  if (!cid || !key) return;

  // Wait for both libraries
  const ready = ()=> typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts;
  if (!ready()){ setTimeout(initGoogleAPI, 400); return; }

  gapi.load('client', async ()=>{
    try {
      await gapi.client.init({
        apiKey: key,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
      });
      state.google.gapiReady = true;

      state.google.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: CONFIG.SCOPES,
        callback: tokenCallback,
      });
      state.google.gisReady = true;

      // Try silent token refresh if we had one
      const cached = localStorage.getItem(LS.TOKEN);
      if (cached){
        try {
          const tk = JSON.parse(cached);
          if (tk.expires_at && tk.expires_at > Date.now()){
            state.google.accessToken = tk.access_token;
            gapi.client.setToken({access_token: tk.access_token});
            setGoogleStatus(true);
            // pull data
            pullFromSheet();
          }
        } catch(e){}
      }
    } catch(err){
      console.error('gapi init error', err);
      toast('โหลด Google API ไม่สำเร็จ', 'error');
    }
  });
}

function connectGoogle(){
  if (!state.google.tokenClient){
    toast('ยังโหลด Google API ไม่เสร็จ — รอสักครู่', 'error');
    initGoogleAPI();
    return;
  }
  state.google.tokenClient.requestAccessToken({prompt: 'consent'});
}

async function tokenCallback(resp){
  if (resp.error){
    console.error(resp);
    toast('เชื่อมต่อ Google ไม่สำเร็จ', 'error');
    return;
  }
  state.google.accessToken = resp.access_token;
  gapi.client.setToken({access_token: resp.access_token});

  // Cache
  localStorage.setItem(LS.TOKEN, JSON.stringify({
    access_token: resp.access_token,
    expires_at: Date.now() + (resp.expires_in||3600)*1000,
  }));
  setGoogleStatus(true);
  toast('เชื่อมต่อสำเร็จ ✓', 'success');

  // Find or create sheet
  await ensureSheetExists();
  // Sync
  await pullFromSheet();
}

function disconnectGoogle(){
  if (state.google.accessToken){
    google.accounts.oauth2.revoke(state.google.accessToken, ()=>{});
  }
  state.google.accessToken = null;
  localStorage.removeItem(LS.TOKEN);
  setGoogleStatus(false);
  toast('ตัดการเชื่อมต่อแล้ว');
}

async function ensureSheetExists(){
  if (state.google.sheetId){
    $('#sheetIdDisplay').textContent = state.google.sheetId;
    return state.google.sheetId;
  }

  // Search Drive for an existing file
  const q = `name='${CONFIG.SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const found = await gapi.client.drive.files.list({ q, fields: 'files(id,name)' });
  if (found.result.files && found.result.files.length > 0){
    state.google.sheetId = found.result.files[0].id;
    localStorage.setItem(LS.SHEET_ID, state.google.sheetId);
    $('#sheetIdDisplay').textContent = state.google.sheetId;
    return state.google.sheetId;
  }

  // Create new spreadsheet
  const res = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: CONFIG.SHEET_NAME },
      sheets: [{ properties: { title: CONFIG.SHEET_TAB } }],
    }
  });
  state.google.sheetId = res.result.spreadsheetId;
  localStorage.setItem(LS.SHEET_ID, state.google.sheetId);
  $('#sheetIdDisplay').textContent = state.google.sheetId;

  // Header row
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.SHEET_TAB}!A1:H1`,
    valueInputOption: 'RAW',
    resource: { values: [['id','year','month','title','text','place','author','photos_json','updatedAt']] }
  });

  toast('สร้าง Google Sheet ใหม่แล้ว ✓', 'success');
  return state.google.sheetId;
}

async function pullFromSheet(){
  if (!state.google.sheetId) await ensureSheetExists();
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.SHEET_TAB}!A2:I`,
    });
    const rows = res.result.values || [];
    const remoteStories = rows.map(r=>({
      id: r[0],
      year: parseInt(r[1],10),
      month: parseInt(r[2],10),
      title: r[3] || '',
      text: r[4] || '',
      place: r[5] || '',
      author: r[6] || '',
      photos: r[7] ? safeJSON(r[7], []) : [],
      updatedAt: r[8] || '',
    })).filter(s=>s.id);

    // Merge with local — newest wins per id
    const merged = mergeStories(state.stories, remoteStories);
    state.stories = merged;
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
    saveLS(LS.STORIES, state.stories);
    renderAll();
  } catch(err){
    console.error('pull error', err);
  }
}

function safeJSON(s, fallback){
  try { return JSON.parse(s); } catch { return fallback; }
}

function mergeStories(local, remote){
  const map = new Map();
  [...local, ...remote].forEach(s=>{
    const ex = map.get(s.id);
    if (!ex || new Date(s.updatedAt||0) > new Date(ex.updatedAt||0)) map.set(s.id, s);
  });
  return [...map.values()];
}

async function syncToSheet(){
  if (!state.google.accessToken) return;
  if (!state.google.sheetId) await ensureSheetExists();

  const values = state.stories.map(s=>[
    s.id, s.year, s.month, s.title || '', s.text || '', s.place || '',
    s.author || '', JSON.stringify(s.photos || []), s.updatedAt || '',
  ]);

  // Clear data rows then write fresh
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.SHEET_TAB}!A2:I`,
  });
  if (values.length > 0){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.SHEET_TAB}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}

async function uploadToDrive(file){
  if (!state.google.accessToken) throw new Error('Not connected');
  const metadata = {
    name: `${Date.now()}_${file.name}`,
    parents: [CONFIG.DRIVE_FOLDER_ID],
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], {type:'application/json'}));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method:'POST',
    headers:{ Authorization: `Bearer ${state.google.accessToken}` },
    body: form,
  });
  if (!res.ok){
    const txt = await res.text();
    throw new Error('Drive upload failed: ' + txt);
  }
  const data = await res.json();

  // Make public so the photo URL works for viewing
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method:'POST',
    headers:{
      Authorization: `Bearer ${state.google.accessToken}`,
      'Content-Type':'application/json',
    },
    body: JSON.stringify({ role:'reader', type:'anyone' }),
  });

  return data.id;
}


// ───────────────────────────────────────────────
// SYNC button
// ───────────────────────────────────────────────
function initSync(){
  $('#syncBtn').addEventListener('click', manualSync);
}

async function manualSync(){
  if (!state.google.accessToken){
    toast('ยังไม่ได้เชื่อมต่อ Google — ไปที่ Settings ก่อน', 'error', 4000);
    switchTab('settings');
    return;
  }
  $('#syncBtn').classList.add('syncing');
  try {
    await pullFromSheet();
    await syncToSheet();
    toast('Sync เรียบร้อย ✓', 'success');
  } catch(err){
    console.error(err);
    toast('Sync ไม่สำเร็จ', 'error');
  } finally {
    $('#syncBtn').classList.remove('syncing');
  }
}


// ───────────────────────────────────────────────
// EXPORT / IMPORT (offline backup)
// ───────────────────────────────────────────────
function exportData(){
  const blob = new Blob([JSON.stringify(state.stories, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `safe-ruang-stories-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importData(e){
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data)) throw new Error('bad format');
      state.stories = mergeStories(state.stories, data);
      state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
      saveLS(LS.STORIES, state.stories);
      renderAll();
      toast('นำเข้าสำเร็จ', 'success');
    } catch(err){ toast('ไฟล์ไม่ถูกต้อง', 'error'); }
  };
  r.readAsText(f);
  e.target.value = '';
}


// ═══════════════════════════════════════════════════════════════
// ANNIVERSARY SURPRISE
// ═══════════════════════════════════════════════════════════════
function checkAnniversary(){
  const today = new Date();
  if (today.getDate() !== CONFIG.ANNIV_DAY) return;

  const key = `${today.getFullYear()}-${today.getMonth()+1}`;
  const seen = JSON.parse(localStorage.getItem(LS.SEEN_ANNIV) || '[]');
  if (seen.includes(key)) return;

  // Calculate "n-th monthiversary"
  const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
  const months = (today.getFullYear() - start.getFullYear())*12 + (today.getMonth() - start.getMonth());
  if (months < 1) return;

  showAnniversary(months, today);

  seen.push(key);
  localStorage.setItem(LS.SEEN_ANNIV, JSON.stringify(seen));
}

function showAnniversary(monthCount, today){
  $('#annivMonths').textContent = monthCount;
  $('#annivDate').textContent =
    today.toLocaleDateString('en-US', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  const messages = [
    'อีกหนึ่งเดือนที่ผ่านไปกับคนที่ใช่ ขอบคุณที่ยังเดินด้วยกันนะ',
    'ทุกวันที่ตื่นมาแล้วมีเธอ คือวันที่ดีที่สุดของฉันแล้ว',
    'นับเดือนได้ แต่ความรู้สึกที่มีให้กัน นับไม่ได้หรอก',
    'รักของเราโตขึ้นทุกเดือน เหมือนต้นไม้ที่ไม่หยุดเขียว',
    'เดือนนี้อีกแล้ว — และฉันยังเลือกเธอ ทุก ๆ วัน',
    'ขอบคุณที่อยู่ ขอบคุณที่รัก ขอบคุณที่เป็นเธอ ♥',
  ];
  $('#annivMsg').textContent = messages[monthCount % messages.length];

  $('#anniversary').classList.remove('hidden');
  startConfetti();

  $('#annivClose').onclick = ()=>{
    $('#anniversary').classList.add('hidden');
    stopConfetti();
  };
}

// Confetti
let confettiAnim = null;
function startConfetti(){
  const cv = $('#confettiCanvas');
  const ctx = cv.getContext('2d');
  const resize = ()=>{ cv.width = innerWidth; cv.height = innerHeight; };
  resize(); window.addEventListener('resize', resize);

  const colors = ['#c9a961','#d9bd7c','#e8d8b0','#d4a5a5','#f7f4ec','#1c3878'];
  const shapes = ['circle','rect','heart'];
  const N = 180;
  const parts = [];
  for (let i=0;i<N;i++){
    parts.push({
      x: Math.random()*cv.width,
      y: -20 - Math.random()*cv.height,
      r: 4 + Math.random()*8,
      vx: -2 + Math.random()*4,
      vy: 2 + Math.random()*4,
      rot: Math.random()*Math.PI*2,
      vr: -.1 + Math.random()*.2,
      color: colors[(Math.random()*colors.length)|0],
      shape: shapes[(Math.random()*shapes.length)|0],
    });
  }

  function tick(){
    ctx.clearRect(0,0,cv.width,cv.height);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > cv.height + 30){ p.y = -20; p.x = Math.random()*cv.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape==='circle'){
        ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill();
      } else if (p.shape==='rect'){
        ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
      } else {
        // heart
        ctx.beginPath();
        const s = p.r/4;
        ctx.moveTo(0, s);
        ctx.bezierCurveTo(s*2, -s*1.5, s*5, s*1.5, 0, s*5);
        ctx.bezierCurveTo(-s*5, s*1.5, -s*2, -s*1.5, 0, s);
        ctx.fill();
      }
      ctx.restore();
    });
    confettiAnim = requestAnimationFrame(tick);
  }
  tick();
}
function stopConfetti(){
  if (confettiAnim){ cancelAnimationFrame(confettiAnim); confettiAnim = null; }
  const cv = $('#confettiCanvas'); cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
}


// Floating hearts on anniversary day (subtle, all-day)
function startHeartLayer(){
  const today = new Date();
  if (today.getDate() !== CONFIG.ANNIV_DAY) return;

  const layer = $('#heartLayer');
  const emojis = ['♥','♡','💕','💗','🌹'];

  const spawn = ()=>{
    const h = document.createElement('span');
    h.className = 'h';
    h.textContent = emojis[(Math.random()*emojis.length)|0];
    h.style.left = (Math.random()*100) + 'vw';
    h.style.fontSize = (16 + Math.random()*22) + 'px';
    h.style.setProperty('--drift', (Math.random()*120-60) + 'px');
    h.style.animationDuration = (6 + Math.random()*5) + 's';
    h.style.color = ['#c9a961','#d4a5a5','#a86a6a','#e8d8b0'][(Math.random()*4)|0];
    layer.appendChild(h);
    setTimeout(()=>h.remove(), 12000);
  };
  // initial burst
  for (let i=0;i<8;i++) setTimeout(spawn, i*400);
  setInterval(spawn, 1800);
}


// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initLogin);
