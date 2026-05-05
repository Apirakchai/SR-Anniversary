/* ═══════════════════════════════════════════════════════════════
   Safe & Ruang · app.js  (v2)
   Features:
   - Embedded Google credentials (no manual setup)
   - Auto-sync every 30s (paused when typing in form)
   - Photos as separate rows in Sheet "Photos" (no cell limit)
   - Daily auto-backup at midnight (1 row/day, max 30 rows)
   - Restore from backup
   - LocalStorage cache for offline use
   - Anniversary surprise (8th of every month)
   - Confetti + floating hearts
═══════════════════════════════════════════════════════════════ */

// ───────────────────────────────────────────────
// CONFIG  ← ใส่ Client ID + API Key ของคุณตรงนี้
// ───────────────────────────────────────────────
const CONFIG = {
  // Google credentials (embedded — restricted to apirakchai.github.io only)
  GOOGLE_CLIENT_ID: 'PASTE_YOUR_CLIENT_ID_HERE',
  GOOGLE_API_KEY:   'PASTE_YOUR_API_KEY_HERE',

  // SHA-256 of "080121"
  PASSWORD_HASH: '118d7c585c0ca03cd5fbeb837481aa07cdf151b94714c3a90d4b28ee560540a7',

  // Anniversary date
  ANNIV_DAY: 8,
  ANNIV_MONTH: 1,
  ANNIV_YEAR: 2021,

  // Google Drive folder ID for photos
  DRIVE_FOLDER_ID: '1p2Njr1sdRxva2wnrpKBJ0eh8mHxpe6WV',

  // Sheet structure
  SHEET_NAME: 'SafeRuang_Stories',
  TAB_STORIES: 'Stories',
  TAB_PHOTOS:  'Photos',
  TAB_BACKUPS: 'Backups',

  // Sync intervals
  AUTO_SYNC_MS: 30 * 1000,         // 30 seconds
  TYPING_PAUSE_MS: 5 * 1000,       // pause sync 5s after last keystroke
  BACKUP_CHECK_MS: 5 * 60 * 1000,  // check for daily backup every 5 minutes
  MAX_BACKUPS: 30,

  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4',
                   'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
};

const LS = {
  STORIES        : 'sr_stories',
  PHOTOS         : 'sr_photos',          // separate from stories
  USER           : 'sr_user',
  CLIENT_ID      : 'sr_client_id',       // legacy override (still respected)
  API_KEY        : 'sr_api_key',         // legacy override (still respected)
  SHEET_ID       : 'sr_sheet_id',
  TOKEN          : 'sr_token',
  SEEN_ANNIV     : 'sr_seen_anniv',
  LAST_SYNC      : 'sr_last_sync',
  LAST_BACKUP    : 'sr_last_backup',
  BACKUP_DAY     : 'sr_backup_day',      // YYYY-MM-DD of last backup written
};


// ───────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────
let state = {
  user: null,
  stories: [],
  photos: [],          // {id, story_id, drive_id, name, dataURL?}
  pendingPhotos: [],   // staged for current form
  editingId: null,
  isTyping: false,     // pauses auto-sync
  typingTimer: null,
  syncTimer: null,
  backupTimer: null,
  isSyncing: false,
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

function uid(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

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

function escapeHtml(str=''){
  return str.replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function safeJSON(s, fallback){
  try { return JSON.parse(s); } catch { return fallback; }
}

function formatTime(iso){
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'เมื่อกี้';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  if (diffMin < 1440) return `${Math.floor(diffMin/60)} ชั่วโมงที่แล้ว`;
  return d.toLocaleString('th-TH', {dateStyle:'short', timeStyle:'short'});
}

function todayStr(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}


// ───────────────────────────────────────────────
// LOGIN
// ───────────────────────────────────────────────
function initLogin(){
  $$('.user-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.user-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.user = btn.dataset.user;
      $('#pinInput').focus();
    });
  });

  $('#pinInput').addEventListener('keypress', e=>{
    if (e.key === 'Enter') doLogin();
  });

  $('#loginBtn').addEventListener('click', doLogin);

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
  stopAutoSync();
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
  state.stories = loadLS(LS.STORIES, []);
  state.photos  = loadLS(LS.PHOTOS, []);
  state.google.sheetId = localStorage.getItem(LS.SHEET_ID) || null;

  initTabs();
  initForm();
  initSettings();
  initModal();
  initLogout();
  initTypingDetector();

  renderAll();
  startCounters();
  checkAnniversary();
  startHeartLayer();
  updateSettingsTimes();

  // Determine credentials (CONFIG first, then localStorage as fallback)
  const cid = (CONFIG.GOOGLE_CLIENT_ID && !CONFIG.GOOGLE_CLIENT_ID.startsWith('PASTE_'))
              ? CONFIG.GOOGLE_CLIENT_ID
              : localStorage.getItem(LS.CLIENT_ID);
  const key = (CONFIG.GOOGLE_API_KEY && !CONFIG.GOOGLE_API_KEY.startsWith('PASTE_'))
              ? CONFIG.GOOGLE_API_KEY
              : localStorage.getItem(LS.API_KEY);

  if (cid && key){
    initGoogleAPI(cid, key);
  } else {
    setSyncIndicator('off', 'no creds');
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
// COUNTERS
// ───────────────────────────────────────────────
function startCounters(){
  updateCounters();
  setInterval(updateCounters, 60000);
}

function updateCounters(){
  const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
  const now   = new Date();

  const totalDays = Math.floor((now - start) / 86400000);
  $('#daysTogether').textContent = `${totalDays.toLocaleString()} days together`;

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
// TYPING DETECTOR  (pauses auto-sync while user is editing)
// ───────────────────────────────────────────────
function initTypingDetector(){
  const formInputs = ['#storyTitle', '#storyText', '#storyPlace', '#storyMonth', '#storyYear'];
  formInputs.forEach(sel=>{
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', markTyping);
    el.addEventListener('keydown', markTyping);
    el.addEventListener('focus', markTyping);
  });
}

function markTyping(){
  state.isTyping = true;
  if (state.syncTimer && state.google.accessToken){
    setSyncIndicator('paused', 'paused (typing)');
  }
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(()=>{
    state.isTyping = false;
    if (state.google.accessToken){
      setSyncIndicator('connected', 'connected');
    }
  }, CONFIG.TYPING_PAUSE_MS);
}


// ───────────────────────────────────────────────
// FORM
// ───────────────────────────────────────────────
function initForm(){
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
      const photo = { id: uid('ph'), file, dataURL: ev.target.result, drive_id: null, name: file.name };
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
    const src = p.dataURL || (p.drive_id ? driveImageUrl(p.drive_id) : '');
    el.innerHTML = `
      <img src="${src}" alt=""/>
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
  return `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
}

async function onSaveStory(e){
  e.preventDefault();

  const id      = $('#storyId').value || uid('st');
  const month   = parseInt($('#storyMonth').value, 10);
  const year    = parseInt($('#storyYear').value, 10);
  const title   = $('#storyTitle').value.trim();
  const text    = $('#storyText').value.trim();
  const place   = $('#storyPlace').value.trim();

  if (!title){ toast('ใส่หัวข้อด้วยนะ', 'error'); return; }

  toast('กำลังบันทึก...', '', 5000);

  // Upload pending photos to Drive (if connected)
  const newPhotos = [];
  for (const p of state.pendingPhotos){
    if (p.drive_id){
      // already uploaded (kept from edit)
      newPhotos.push({ id: p.id, story_id: id, drive_id: p.drive_id, name: p.name, dataURL: null });
    } else if (p.file && state.google.accessToken){
      try{
        const driveId = await uploadToDrive(p.file);
        newPhotos.push({ id: p.id, story_id: id, drive_id: driveId, name: p.name, dataURL: null });
      } catch(err){
        console.error(err);
        // fallback: keep dataURL local
        newPhotos.push({ id: p.id, story_id: id, drive_id: null, name: p.name, dataURL: p.dataURL });
      }
    } else if (p.dataURL){
      newPhotos.push({ id: p.id, story_id: id, drive_id: null, name: p.name, dataURL: p.dataURL });
    }
  }

  // Replace this story's photos
  state.photos = state.photos.filter(p=>p.story_id !== id).concat(newPhotos);

  const story = {
    id, month, year, title, text, place,
    author: state.user,
    updatedAt: new Date().toISOString(),
  };

  const existing = state.stories.findIndex(s=>s.id===id);
  if (existing >= 0) state.stories[existing] = story;
  else state.stories.push(story);

  state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));

  saveLS(LS.STORIES, state.stories);
  saveLS(LS.PHOTOS, state.photos);

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
function getStoryPhotos(storyId){
  return state.photos.filter(p=>p.story_id === storyId);
}

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
    const num = state.stories.length - idx;
    const photos = getStoryPhotos(s.id);
    const cover = photos[0]
      ? (photos[0].drive_id ? driveImageUrl(photos[0].drive_id) : photos[0].dataURL)
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
            ${photos.length>0 ? `<span>· ${photos.length} 📷</span>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  $$('.story-card').forEach(c=>{
    c.addEventListener('click', ()=>openStory(c.dataset.id));
  });
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
  const photos = getStoryPhotos(id);
  const cover = photos[0]
    ? (photos[0].drive_id ? driveImageUrl(photos[0].drive_id) : photos[0].dataURL)
    : null;

  const galleryHTML = photos.length > 1
    ? `<div class="mc-gallery">${photos.slice(1).map(p=>{
        const src = p.drive_id ? driveImageUrl(p.drive_id) : p.dataURL;
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
  state.pendingPhotos = getStoryPhotos(id).map(p=>({
    id: p.id,
    drive_id: p.drive_id,
    name: p.name,
    dataURL: p.dataURL || (p.drive_id ? driveImageUrl(p.drive_id) : ''),
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
  state.photos  = state.photos.filter(p=>p.story_id !== id);
  saveLS(LS.STORIES, state.stories);
  saveLS(LS.PHOTOS, state.photos);
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
  $('#googleConnectBtn').addEventListener('click', connectGoogle);
  $('#googleSyncNow').addEventListener('click', manualSync);
  $('#googleDisconnect').addEventListener('click', disconnectGoogle);

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', ()=>$('#importFile').click());
  $('#importFile').addEventListener('change', importData);

  $('#loadBackupsBtn').addEventListener('click', loadBackupList);
  $('#restoreBackupBtn').addEventListener('click', restoreSelectedBackup);
  $('#backupNowBtn').addEventListener('click', ()=>writeBackup(true));
}

function setGoogleStatus(connected){
  const pill = $('#googleStatus');
  pill.textContent = connected ? '✓ เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ';
  pill.className = 'status-pill ' + (connected ? 'on' : 'off');
}

function setSyncIndicator(state, label){
  const ind = $('#syncIndicator');
  if (!ind) return;
  ind.className = 'sync-indicator ' + state;
  const txt = ind.querySelector('.sync-text');
  if (txt) txt.textContent = label || state;
}

function updateSettingsTimes(){
  $('#lastSyncTime').textContent   = formatTime(localStorage.getItem(LS.LAST_SYNC));
  $('#lastBackupTime').textContent = formatTime(localStorage.getItem(LS.LAST_BACKUP));
}

function initGoogleAPI(clientId, apiKey){
  const ready = ()=> typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts;
  if (!ready()){ setTimeout(()=>initGoogleAPI(clientId, apiKey), 400); return; }

  setSyncIndicator('off', 'connecting…');

  gapi.load('client', async ()=>{
    try {
      await gapi.client.init({
        apiKey,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
      });
      state.google.gapiReady = true;

      state.google.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CONFIG.SCOPES,
        callback: tokenCallback,
      });
      state.google.gisReady = true;

      // Try silent token refresh
      const cached = localStorage.getItem(LS.TOKEN);
      if (cached){
        try {
          const tk = JSON.parse(cached);
          if (tk.expires_at && tk.expires_at > Date.now() + 60000){
            state.google.accessToken = tk.access_token;
            gapi.client.setToken({access_token: tk.access_token});
            setGoogleStatus(true);
            setSyncIndicator('connected', 'connected');
            await pullFromSheet();
            startAutoSync();
            startBackupTimer();
            updateSettingsTimes();
            return;
          }
        } catch(e){}
      }
      // need user to click connect
      setSyncIndicator('off', 'tap connect');
    } catch(err){
      console.error('gapi init error', err);
      toast('โหลด Google API ไม่สำเร็จ', 'error');
      setSyncIndicator('error', 'init failed');
    }
  });
}

function connectGoogle(){
  if (!state.google.tokenClient){
    toast('ยังโหลด Google API ไม่เสร็จ — รอสักครู่', 'error');
    return;
  }
  state.google.tokenClient.requestAccessToken({prompt: 'consent'});
}

async function tokenCallback(resp){
  if (resp.error){
    console.error(resp);
    toast('เชื่อมต่อ Google ไม่สำเร็จ', 'error');
    setSyncIndicator('error', 'auth failed');
    return;
  }
  state.google.accessToken = resp.access_token;
  gapi.client.setToken({access_token: resp.access_token});

  localStorage.setItem(LS.TOKEN, JSON.stringify({
    access_token: resp.access_token,
    expires_at: Date.now() + (resp.expires_in||3600)*1000,
  }));
  setGoogleStatus(true);
  setSyncIndicator('connected', 'connected');
  toast('เชื่อมต่อสำเร็จ ✓', 'success');

  await ensureSheetExists();
  await pullFromSheet();
  startAutoSync();
  startBackupTimer();
  updateSettingsTimes();
}

function disconnectGoogle(){
  if (state.google.accessToken){
    google.accounts.oauth2.revoke(state.google.accessToken, ()=>{});
  }
  state.google.accessToken = null;
  localStorage.removeItem(LS.TOKEN);
  setGoogleStatus(false);
  setSyncIndicator('off', 'disconnected');
  stopAutoSync();
  toast('ตัดการเชื่อมต่อแล้ว');
}

async function ensureSheetExists(){
  if (state.google.sheetId){
    // Verify it's still accessible & has all required tabs
    try {
      const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
      const tabs = (meta.result.sheets||[]).map(s=>s.properties.title);
      await ensureRequiredTabs(tabs);
      return state.google.sheetId;
    } catch(err){
      console.warn('Sheet validation failed, will recreate:', err);
      state.google.sheetId = null;
      localStorage.removeItem(LS.SHEET_ID);
    }
  }

  const q = `name='${CONFIG.SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const found = await gapi.client.drive.files.list({ q, fields: 'files(id,name)' });
  if (found.result.files && found.result.files.length > 0){
    state.google.sheetId = found.result.files[0].id;
    localStorage.setItem(LS.SHEET_ID, state.google.sheetId);
    const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
    const tabs = (meta.result.sheets||[]).map(s=>s.properties.title);
    await ensureRequiredTabs(tabs);
    return state.google.sheetId;
  }

  // Create new spreadsheet with all 3 tabs
  const res = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: CONFIG.SHEET_NAME },
      sheets: [
        { properties: { title: CONFIG.TAB_STORIES } },
        { properties: { title: CONFIG.TAB_PHOTOS } },
        { properties: { title: CONFIG.TAB_BACKUPS } },
      ],
    }
  });
  state.google.sheetId = res.result.spreadsheetId;
  localStorage.setItem(LS.SHEET_ID, state.google.sheetId);

  // Write headers
  await writeHeaders();

  toast('สร้าง Google Sheet ใหม่แล้ว ✓', 'success');
  return state.google.sheetId;
}

async function ensureRequiredTabs(existingTabs){
  const required = [CONFIG.TAB_STORIES, CONFIG.TAB_PHOTOS, CONFIG.TAB_BACKUPS];
  const missing = required.filter(t => !existingTabs.includes(t));

  // If we have "Sheet1" or other default tab and no "Stories" tab → rename it (migration from v1)
  const renames = [];
  if (!existingTabs.includes(CONFIG.TAB_STORIES) && existingTabs.includes('Sheet1')){
    // Get sheet IDs to rename Sheet1 -> Stories
    const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
    const sheet1 = (meta.result.sheets||[]).find(s => s.properties.title === 'Sheet1');
    if (sheet1){
      renames.push({
        updateSheetProperties: {
          properties: { sheetId: sheet1.properties.sheetId, title: CONFIG.TAB_STORIES },
          fields: 'title',
        }
      });
      // Remove from missing list since we'll have it after rename
      const idx = missing.indexOf(CONFIG.TAB_STORIES);
      if (idx >= 0) missing.splice(idx, 1);
    }
  }

  if (missing.length === 0 && renames.length === 0) return;

  const requests = [
    ...renames,
    ...missing.map(title => ({ addSheet: { properties: { title } } })),
  ];
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: state.google.sheetId,
    resource: { requests },
  });
  await writeHeaders();
}

async function writeHeaders(){
  await Promise.all([
    gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_STORIES}!A1:H1`,
      valueInputOption: 'RAW',
      resource: { values: [['id','year','month','title','text','place','author','updatedAt']] },
    }),
    gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_PHOTOS}!A1:E1`,
      valueInputOption: 'RAW',
      resource: { values: [['id','story_id','drive_id','name','dataURL_fallback']] },
    }),
    gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A1:D1`,
      valueInputOption: 'RAW',
      resource: { values: [['date','timestamp','story_count','snapshot_json']] },
    }),
  ]);
}


// ───────────────────────────────────────────────
// SYNC: pull from Sheet
// ───────────────────────────────────────────────
async function pullFromSheet(){
  if (!state.google.sheetId) await ensureSheetExists();
  if (!state.google.sheetId) return;

  // Always make sure tabs exist before reading
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
    const tabs = (meta.result.sheets||[]).map(s=>s.properties.title);
    await ensureRequiredTabs(tabs);
  } catch(e){
    console.warn('Cannot validate tabs, proceeding anyway:', e);
  }

  // Helper: gapi requests aren't standard Promises, wrap them so we can catch
  const safeGet = async (range)=>{
    try {
      const r = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: state.google.sheetId,
        range,
      });
      return r.result?.values || [];
    } catch(e){
      console.warn(`Fetch failed for ${range}:`, e);
      return [];
    }
  };

  try {
    const [storyRows, photoRows] = await Promise.all([
      safeGet(`${CONFIG.TAB_STORIES}!A2:H`),
      safeGet(`${CONFIG.TAB_PHOTOS}!A2:E`),
    ]);

    const remoteStories = storyRows.map(r=>({
      id: r[0],
      year: parseInt(r[1],10),
      month: parseInt(r[2],10),
      title: r[3] || '',
      text: r[4] || '',
      place: r[5] || '',
      author: r[6] || '',
      updatedAt: r[7] || '',
    })).filter(s=>s.id);

    const remotePhotos = photoRows.map(r=>({
      id: r[0],
      story_id: r[1],
      drive_id: r[2] || null,
      name: r[3] || '',
      dataURL: r[4] || null,
    })).filter(p=>p.id && p.story_id);

    state.stories = mergeStories(state.stories, remoteStories);
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
    state.photos = mergePhotos(state.photos, remotePhotos);

    saveLS(LS.STORIES, state.stories);
    saveLS(LS.PHOTOS, state.photos);
    renderAll();
  } catch(err){
    console.error('pull error', err);
    throw err;
  }
}

function mergeStories(local, remote){
  const map = new Map();
  [...local, ...remote].forEach(s=>{
    const ex = map.get(s.id);
    if (!ex || new Date(s.updatedAt||0) > new Date(ex.updatedAt||0)) map.set(s.id, s);
  });
  return [...map.values()];
}

function mergePhotos(local, remote){
  // photos are immutable once uploaded — just dedupe by id
  const map = new Map();
  [...remote, ...local].forEach(p=>{ if (!map.has(p.id)) map.set(p.id, p); });
  return [...map.values()];
}


// ───────────────────────────────────────────────
// SYNC: push to Sheet
// ───────────────────────────────────────────────
async function syncToSheet(){
  if (!state.google.accessToken) return;
  if (!state.google.sheetId) await ensureSheetExists();
  if (!state.google.sheetId) return;

  const storyValues = state.stories.map(s=>[
    s.id, s.year, s.month, s.title || '', s.text || '', s.place || '',
    s.author || '', s.updatedAt || '',
  ]);

  const photoValues = state.photos.map(p=>[
    p.id, p.story_id, p.drive_id || '', p.name || '', p.dataURL || '',
  ]);

  // Clear & rewrite both tabs (use individual calls for reliability)
  await Promise.all([
    gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_STORIES}!A2:H`,
    }),
    gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_PHOTOS}!A2:E`,
    }),
  ]);

  const updates = [];
  if (storyValues.length){
    updates.push(gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_STORIES}!A2`,
      valueInputOption: 'RAW',
      resource: { values: storyValues },
    }));
  }
  if (photoValues.length){
    updates.push(gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_PHOTOS}!A2`,
      valueInputOption: 'RAW',
      resource: { values: photoValues },
    }));
  }
  if (updates.length) await Promise.all(updates);

  localStorage.setItem(LS.LAST_SYNC, new Date().toISOString());
  updateSettingsTimes();
}


// ───────────────────────────────────────────────
// AUTO-SYNC LOOP
// ───────────────────────────────────────────────
function startAutoSync(){
  stopAutoSync();
  state.syncTimer = setInterval(autoSyncTick, CONFIG.AUTO_SYNC_MS);
  setTimeout(autoSyncTick, 2000); // initial tick soon
}

function stopAutoSync(){
  if (state.syncTimer){
    clearInterval(state.syncTimer);
    state.syncTimer = null;
  }
  if (state.backupTimer){
    clearInterval(state.backupTimer);
    state.backupTimer = null;
  }
}

async function autoSyncTick(){
  if (!state.google.accessToken) return;
  if (state.isTyping) return;       // user is editing — skip
  if (state.isSyncing) return;       // already in flight

  state.isSyncing = true;
  setSyncIndicator('syncing', 'syncing…');

  try {
    await pullFromSheet();
    await syncToSheet();
    setSyncIndicator('connected', 'connected');
  } catch(err){
    console.warn('auto-sync error', err);
    setSyncIndicator('error', 'sync failed');
  } finally {
    state.isSyncing = false;
  }
}

async function manualSync(){
  if (!state.google.accessToken){
    toast('ยังไม่ได้เชื่อมต่อ Google', 'error', 4000);
    return;
  }
  setSyncIndicator('syncing', 'syncing…');
  try {
    await pullFromSheet();
    await syncToSheet();
    setSyncIndicator('connected', 'connected');
    toast('Sync เรียบร้อย ✓', 'success');
  } catch(err){
    console.error(err);
    setSyncIndicator('error', 'sync failed');
    toast('Sync ไม่สำเร็จ', 'error');
  }
}


// ───────────────────────────────────────────────
// DRIVE UPLOAD
// ───────────────────────────────────────────────
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

  // Public read
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


// ═══════════════════════════════════════════════════════════════
// DAILY BACKUP
// ═══════════════════════════════════════════════════════════════

function startBackupTimer(){
  // Check every 5 minutes if today's backup needs to be written
  state.backupTimer = setInterval(maybeWriteBackup, CONFIG.BACKUP_CHECK_MS);
  setTimeout(maybeWriteBackup, 8000); // initial check shortly after load
}

async function maybeWriteBackup(){
  if (!state.google.accessToken) return;
  const today = todayStr();
  const lastDay = localStorage.getItem(LS.BACKUP_DAY);
  if (lastDay === today) return;  // already backed up today
  await writeBackup(false);
}

async function writeBackup(showToast){
  if (!state.google.accessToken){
    if (showToast) toast('ต้องเชื่อมต่อ Google ก่อนถึงจะ backup ได้', 'error');
    return;
  }
  if (!state.google.sheetId) await ensureSheetExists();

  try {
    const today = todayStr();
    const ts = new Date().toISOString();
    const snapshot = {
      stories: state.stories,
      photos: state.photos,
    };
    const snapStr = JSON.stringify(snapshot);

    // Fetch existing backups
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:D`,
    });
    let backups = res.result.values || [];

    // Remove any existing entry for today (replace if double-backup same day)
    backups = backups.filter(r => r[0] !== today);

    // Prepend new entry
    backups.unshift([today, ts, String(state.stories.length), snapStr]);

    // Keep only the most recent N
    backups = backups.slice(0, CONFIG.MAX_BACKUPS);

    // Clear & rewrite
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:D`,
    });
    if (backups.length){
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: state.google.sheetId,
        range: `${CONFIG.TAB_BACKUPS}!A2`,
        valueInputOption: 'RAW',
        resource: { values: backups },
      });
    }

    localStorage.setItem(LS.BACKUP_DAY, today);
    localStorage.setItem(LS.LAST_BACKUP, ts);
    updateSettingsTimes();

    if (showToast) toast(`Backup สำเร็จ (เก็บไว้ ${backups.length} วัน)`, 'success');
  } catch(err){
    console.error('backup error', err);
    if (showToast) toast('Backup ไม่สำเร็จ', 'error');
  }
}

async function loadBackupList(){
  if (!state.google.accessToken){
    toast('ต้องเชื่อมต่อ Google ก่อน', 'error');
    return;
  }
  if (!state.google.sheetId) await ensureSheetExists();

  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:D`,
    });
    const backups = res.result.values || [];
    const sel = $('#backupSelect');
    sel.innerHTML = '';
    if (backups.length === 0){
      sel.innerHTML = '<option value="">— ยังไม่มี backup —</option>';
      toast('ยังไม่มี backup ในระบบ', '', 3000);
      return;
    }
    sel.innerHTML = '<option value="">— เลือกวันที่ —</option>' + backups.map((r, i)=>{
      const date = r[0];
      const ts = r[1];
      const count = r[2];
      const niceDate = new Date(ts).toLocaleString('th-TH', {dateStyle:'medium', timeStyle:'short'});
      return `<option value="${i}">${date} · ${count} stories · ${niceDate}</option>`;
    }).join('');
    sel.dataset.backups = JSON.stringify(backups);
    toast(`โหลด backup ${backups.length} รายการ ✓`, 'success');
  } catch(err){
    console.error(err);
    toast('โหลด backup ไม่สำเร็จ', 'error');
  }
}

async function restoreSelectedBackup(){
  const sel = $('#backupSelect');
  const idx = sel.value;
  if (!idx){ toast('เลือกวันที่ก่อน', 'error'); return; }
  const backups = safeJSON(sel.dataset.backups, []);
  const row = backups[parseInt(idx,10)];
  if (!row){ toast('ไม่พบ backup ที่เลือก', 'error'); return; }

  if (!confirm(`กู้คืนข้อมูลของวันที่ ${row[0]}?\n(${row[2]} stories)\n\nข้อมูลปัจจุบันจะถูกแทนที่`)) return;

  try {
    const snapshot = JSON.parse(row[3]);
    state.stories = snapshot.stories || [];
    state.photos  = snapshot.photos  || [];
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
    saveLS(LS.STORIES, state.stories);
    saveLS(LS.PHOTOS, state.photos);
    renderAll();

    // Push restored data to Sheet
    if (state.google.accessToken){
      await syncToSheet();
    }
    toast('กู้คืนสำเร็จ ✓', 'success');
  } catch(err){
    console.error(err);
    toast('กู้คืนไม่สำเร็จ — backup เสียหาย?', 'error');
  }
}


// ───────────────────────────────────────────────
// EXPORT / IMPORT (offline backup)
// ───────────────────────────────────────────────
function exportData(){
  const payload = { stories: state.stories, photos: state.photos, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `safe-ruang-backup-${todayStr()}.json`;
  a.click();
}

function importData(e){
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try {
      const data = JSON.parse(r.result);
      // Support both old (array) and new (object) formats
      let stories, photos;
      if (Array.isArray(data)){
        stories = data; photos = [];
      } else {
        stories = data.stories || [];
        photos  = data.photos  || [];
      }
      state.stories = mergeStories(state.stories, stories);
      state.photos  = mergePhotos(state.photos, photos);
      state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
      saveLS(LS.STORIES, state.stories);
      saveLS(LS.PHOTOS, state.photos);
      renderAll();
      toast('นำเข้าสำเร็จ', 'success');
      if (state.google.accessToken) syncToSheet();
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


// Floating hearts on anniversary day
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
  for (let i=0;i<8;i++) setTimeout(spawn, i*400);
  setInterval(spawn, 1800);
}


// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initLogin);
