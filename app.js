/* ═══════════════════════════════════════════════════════════════
   Safe & Ruang · app.js (v3)
═══════════════════════════════════════════════════════════════ */

// ───────────────────────────────────────────────
// CONFIG  ← ใส่ Client ID + API Key ตรงนี้
// ───────────────────────────────────────────────
const CONFIG = {
  GOOGLE_CLIENT_ID: 'PASTE_YOUR_CLIENT_ID_HERE',
  GOOGLE_API_KEY:   'PASTE_YOUR_API_KEY_HERE',

  PASSWORD_HASH: '118d7c585c0ca03cd5fbeb837481aa07cdf151b94714c3a90d4b28ee560540a7',

  ANNIV_DAY: 8,
  ANNIV_MONTH: 1,
  ANNIV_YEAR: 2021,

  DRIVE_FOLDER_ID: '1p2Njr1sdRxva2wnrpKBJ0eh8mHxpe6WV',

  SHEET_NAME: 'SafeRuang_Stories',
  TAB_STORIES: 'Stories',
  TAB_PHOTOS:  'Photos',
  TAB_BACKUPS: 'Backups',
  TAB_CAPSULES:'Capsules',
  TAB_BUCKETS: 'BucketList',
  TAB_DAILY:   'DailyLines',
  TAB_QOTD:    'QOTD',
  TAB_NOTES:   'Notes',
  TAB_IDEAS:   'DateIdeas',
  TAB_PREFS:   'SharedPrefs',

  AUTO_SYNC_MS: 30 * 1000,
  TYPING_PAUSE_MS: 5 * 1000,
  BACKUP_CHECK_MS: 5 * 60 * 1000,
  MAX_BACKUPS: 30,

  VOICE_MAX_MS: 30 * 1000,

  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4',
                   'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
};

const LS = {
  STORIES        : 'sr_stories',
  PHOTOS         : 'sr_photos',
  CAPSULES       : 'sr_capsules',
  BUCKETS        : 'sr_buckets',
  DAILY          : 'sr_daily',
  QOTD           : 'sr_qotd',
  NOTES          : 'sr_notes',
  IDEAS          : 'sr_ideas',
  HIGHLIGHTS     : 'sr_highlights',
  NOTIF_LAST     : 'sr_notif_last',
  USER           : 'sr_user',
  CLIENT_ID      : 'sr_client_id',
  API_KEY        : 'sr_api_key',
  SHEET_ID       : 'sr_sheet_id',
  TOKEN          : 'sr_token',
  SEEN_ANNIV     : 'sr_seen_anniv',
  LAST_SYNC      : 'sr_last_sync',
  LAST_BACKUP    : 'sr_last_backup',
  BACKUP_DAY     : 'sr_backup_day',
  THEME          : 'sr_theme',
  MUSIC_ON       : 'sr_music_on',
};

const MILESTONES = [
  // [months, label]
  [3,   '🌱 3 เดือน'],
  [6,   '🌿 6 เดือน'],
  [12,  '✨ ครบ 1 ปี'],
  [24,  '✨ ครบ 2 ปี'],
  [36,  '✨ ครบ 3 ปี'],
  [50,  '🎉 50 เดือน'],
  [60,  '✨ ครบ 5 ปี'],
  [100, '💎 100 เดือน'],
  [120, '👑 ครบ 10 ปี'],
];


// ───────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────
let state = {
  user: null,
  stories: [],
  photos: [],
  capsules: [],
  buckets: [],
  daily: [],
  qotdAnswers: [],
  notes: [],
  ideas: [],
  highlights: [],
  notesView: 'inbox',
  mapView: 'map',
  bucketFilter: 'all',
  pendingPhotos: [],
  pendingVoiceBlob: null,
  pendingVoiceDriveId: null,
  editingId: null,
  isTyping: false,
  typingTimer: null,
  syncTimer: null,
  backupTimer: null,
  isSyncing: false,
  selectedMood: null,
  selectedCapsuleMonths: null,
  recordingState: { mediaRecorder: null, chunks: [], startTime: 0, timer: null },
  filters: { year:'', month:'', day:'', mood:'', search:'' },
  recap: { interval: null, slides: [], idx: 0, audio: null },
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
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function uid(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

function toast(msg, type='', ms=2800){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  t.dataset.type = type; // remember last type for auto-dismiss
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), ms);
}

function dismissErrorToast(){
  // Auto-dismiss any persistent error toast (called when sync recovers)
  const t = $('#toast');
  if (t && t.dataset.type === 'error'){
    clearTimeout(toast._t);
    t.classList.remove('show');
    t.dataset.type = '';
  }
}

function loadLS(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveLS(key, val){
  localStorage.setItem(key, JSON.stringify(val));
  if (key === LS.PHOTOS) _invalidatePhotoCache();
}

function escapeHtml(str=''){
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function safeJSON(s, fallback){ try { return JSON.parse(s); } catch { return fallback; } }

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

function monthsSinceStart(d=new Date()){
  const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
  return (d.getFullYear() - start.getFullYear())*12 + (d.getMonth() - start.getMonth());
}

const MOOD_EMOJI = {
  happy:'😊', love:'🥰', sad:'🥺', excited:'✨', peaceful:'🌿', bittersweet:'🌧️'
};


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
  $('#pinInput').addEventListener('keypress', e=>{ if (e.key === 'Enter') doLogin(); });
  $('#loginBtn').addEventListener('click', doLogin);

  // Apply saved theme even on login screen
  applySavedTheme();

  const cached = sessionStorage.getItem(LS.USER);
  if (cached){ state.user = cached; showApp(); }
}

async function doLogin(){
  const errEl = $('#loginError');
  errEl.textContent = '';
  if (!state.user){ errEl.textContent = 'กรุณาเลือกชื่อก่อนค่ะ/ครับ'; return; }
  const pin = $('#pinInput').value.trim();
  if (!pin){ errEl.textContent = 'ใส่รหัสด้วยนะ'; return; }
  const hash = await sha256(pin);
  if (hash !== CONFIG.PASSWORD_HASH){
    errEl.textContent = 'รหัสไม่ถูกต้อง ลองอีกครั้งนะ';
    $('#pinInput').value = ''; $('#pinInput').focus(); return;
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
  stopMusic();
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
  state.stories  = loadLS(LS.STORIES, []);
  state.photos   = loadLS(LS.PHOTOS, []);
  state.capsules = loadLS(LS.CAPSULES, []);
  state.buckets  = loadLS(LS.BUCKETS, []);
  state.daily    = loadLS(LS.DAILY, []);
  state.qotdAnswers = loadLS(LS.QOTD, []);
  state.notes = loadLS(LS.NOTES, []);
  state.ideas = loadLS(LS.IDEAS, []);
  state.highlights = loadLS(LS.HIGHLIGHTS, []);
  state.google.sheetId = localStorage.getItem(LS.SHEET_ID) || null;

  initTabs();
  initForm();
  initSettings();
  initModal();
  initLogout();
  initTypingDetector();
  initSearch();
  initFilters();
  initThemeToggle();
  initMusicToggle();
  initCapsule();
  initPrint();
  initMoodPicker();
  initVoiceRecorder();
  initBucket();
  initDaily();
  initRecap();
  initNotes();
  initIdeas();
  initRoulette();
  initPhotoWall();
  initNotifications();

  renderAll();
  renderYearView();
  renderCapsules();
  startCounters();
  checkAnniversary();
  checkOnThisDay();
  checkMilestones();
  checkUnlockedCapsules();
  startHeartLayer();
  startSeasonalEffects();
  updateSettingsTimes();
  registerServiceWorker();

  const cid = (CONFIG.GOOGLE_CLIENT_ID && !CONFIG.GOOGLE_CLIENT_ID.startsWith('PASTE_'))
              ? CONFIG.GOOGLE_CLIENT_ID : localStorage.getItem(LS.CLIENT_ID);
  const key = (CONFIG.GOOGLE_API_KEY && !CONFIG.GOOGLE_API_KEY.startsWith('PASTE_'))
              ? CONFIG.GOOGLE_API_KEY : localStorage.getItem(LS.API_KEY);

  if (cid && key) initGoogleAPI(cid, key);
  else setSyncIndicator('off', 'no creds');
}

function initLogout(){
  $('#logoutBtn').addEventListener('click', ()=>{
    if (confirm('ต้องการออกจากระบบหรือไม่?')) logout();
  });
}


// ───────────────────────────────────────────────
// PWA SERVICE WORKER
// ───────────────────────────────────────────────
function registerServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed:', err));
}


// ───────────────────────────────────────────────
// THEMES
// ───────────────────────────────────────────────
function applySavedTheme(){
  const t = localStorage.getItem(LS.THEME) || 'navy';
  document.body.setAttribute('data-theme', t);
}

function setTheme(theme){
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem(LS.THEME, theme);
  $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

function initThemeToggle(){
  // Header quick toggle (cycles through themes)
  $('#themeToggle').addEventListener('click', ()=>{
    const themes = ['navy','midnight','sunset'];
    const cur = document.body.getAttribute('data-theme') || 'navy';
    const idx = themes.indexOf(cur);
    const next = themes[(idx+1) % themes.length];
    setTheme(next);
    toast(`ธีม: ${next}`, '', 1500);
  });

  // Settings buttons
  $$('.theme-btn').forEach(btn => {
    btn.addEventListener('click', ()=>setTheme(btn.dataset.theme));
  });
  // Set initial active
  const cur = document.body.getAttribute('data-theme') || 'navy';
  $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === cur));
}


// ───────────────────────────────────────────────
// BACKGROUND MUSIC
// ───────────────────────────────────────────────
function initMusicToggle(){
  const btn = $('#musicToggle');
  const audio = $('#bgMusic');
  audio.volume = 0.25;

  const wasOn = localStorage.getItem(LS.MUSIC_ON) === 'true';
  if (wasOn) btn.classList.add('active');

  btn.addEventListener('click', ()=>{
    if (audio.paused){
      audio.play().then(()=>{
        btn.classList.add('active');
        localStorage.setItem(LS.MUSIC_ON, 'true');
        toast('🎵 เล่นเพลงเบา ๆ', '', 1500);
      }).catch(err=>{
        toast('เล่นเพลงไม่ได้ (อาจ block by browser)', 'error');
      });
    } else {
      stopMusic();
    }
  });
}

function stopMusic(){
  const audio = $('#bgMusic');
  audio.pause();
  audio.currentTime = 0;
  $('#musicToggle').classList.remove('active');
  localStorage.setItem(LS.MUSIC_ON, 'false');
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
  if (name === 'year') renderYearView();
  if (name === 'capsule') renderCapsules();
  if (name === 'map') renderMemoryMap();
  if (name === 'stats') renderStats();
  if (name === 'bucket') renderBucketList();
  if (name === 'daily') renderDaily();
  if (name === 'qotd') renderQOTD();
  if (name === 'notes') renderNotes();
  if (name === 'ideas') renderIdeas();
  window.scrollTo({top:0, behavior:'smooth'});
}


// ───────────────────────────────────────────────
// COUNTERS + MILESTONES
// ───────────────────────────────────────────────
function startCounters(){ updateCounters(); setInterval(updateCounters, 60000); }

function updateCounters(){
  const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
  const now = new Date();
  const totalDays = Math.floor((now - start) / 86400000);
  $('#daysTogether').textContent = `${totalDays.toLocaleString()} days together`;

  let years = now.getFullYear()-start.getFullYear();
  let months = now.getMonth()-start.getMonth();
  let days = now.getDate()-start.getDate();
  if (days < 0){ months -= 1; const pm = new Date(now.getFullYear(), now.getMonth(), 0); days += pm.getDate(); }
  if (months < 0){ years -= 1; months += 12; }

  $('#cYears').textContent = years;
  $('#cMonths').textContent = months;
  $('#cDays').textContent = days;

  const nextAnniv = new Date(now.getFullYear(), now.getMonth(), CONFIG.ANNIV_DAY);
  if (now.getDate() > CONFIG.ANNIV_DAY) nextAnniv.setMonth(nextAnniv.getMonth()+1);
  if (now.getDate() === CONFIG.ANNIV_DAY) $('#nextCount').textContent = '✨ today!';
  else $('#nextCount').textContent = Math.ceil((nextAnniv - now)/86400000) + ' days';
}

function checkMilestones(){
  const months = monthsSinceStart();
  const banner = $('#milestoneBanner');
  banner.classList.add('hidden');

  // Find any milestone within 14 days
  for (const [m, label] of MILESTONES){
    const diff = m - months;
    if (diff > 0 && diff <= 1){
      // Within 1 month
      const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
      const milestone = new Date(start);
      milestone.setMonth(milestone.getMonth() + m);
      const daysLeft = Math.ceil((milestone - new Date()) / 86400000);
      if (daysLeft > 0 && daysLeft <= 60){
        banner.textContent = `${label} · อีก ${daysLeft} วัน!`;
        banner.classList.remove('hidden');
        return;
      }
    }
    if (m === months){
      banner.textContent = `🎉 วันนี้ ${label} แล้ว!`;
      banner.classList.remove('hidden');
      return;
    }
  }
}


// ───────────────────────────────────────────────
// ON THIS DAY
// ───────────────────────────────────────────────
function checkOnThisDay(){
  const today = new Date();
  const m = today.getMonth() + 1;
  // Find stories from prior years in the same month
  const matches = state.stories.filter(s => s.month === m && s.year < today.getFullYear());
  const wrap = $('#onThisDay');
  if (matches.length === 0){ wrap.classList.add('hidden'); return; }

  // Pick the oldest one
  matches.sort((a,b)=> a.year - b.year);
  const story = matches[0];
  const yearsAgo = today.getFullYear() - story.year;

  $('#otdContent').innerHTML = `
    <h4>${escapeHtml(story.title)}</h4>
    <p>${yearsAgo} ปีที่แล้วในเดือนนี้ — by ${escapeHtml(story.author||'—')}</p>
  `;
  wrap.classList.remove('hidden');
  wrap.classList.add('otd-link');
  wrap.onclick = ()=>openStory(story.id);
}


// ───────────────────────────────────────────────
// TYPING DETECTOR
// ───────────────────────────────────────────────
function initTypingDetector(){
  const inputs = ['#storyTitle', '#storyText', '#storyPlace', '#storyMonth', '#storyYear', '#storyDay',
                  '#capsuleTitle', '#capsuleText'];
  inputs.forEach(sel=>{
    const el = $(sel); if (!el) return;
    ['input','keydown','focus'].forEach(ev => el.addEventListener(ev, markTyping));
  });
}

function markTyping(){
  state.isTyping = true;
  if (state.syncTimer && state.google.accessToken) setSyncIndicator('paused', 'paused (typing)');
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(()=>{
    state.isTyping = false;
    if (state.google.accessToken) setSyncIndicator('connected', 'connected');
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

  // Populate day dropdown based on month/year
  const populateDays = ()=>{
    const m = parseInt($('#storyMonth').value, 10);
    const y = parseInt($('#storyYear').value, 10);
    const dayCount = (m && y) ? new Date(y, m, 0).getDate() : 31;
    const daySel = $('#storyDay');
    const cur = daySel.value;
    daySel.innerHTML = '<option value="">— ไม่ระบุ —</option>';
    for (let d=1; d<=dayCount; d++){
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      daySel.appendChild(opt);
    }
    // Restore previous if still valid
    if (cur && parseInt(cur,10) <= dayCount) daySel.value = cur;
  };
  populateDays();
  $('#storyMonth').addEventListener('change', populateDays);
  $('#storyYear').addEventListener('change', populateDays);

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
    resetForm(); switchTab('timeline');
  });

  $('#storyForm').addEventListener('submit', onSaveStory);
}

function resetForm(){
  state.editingId = null;
  state.pendingPhotos = [];
  state.pendingVoiceBlob = null;
  state.pendingVoiceDriveId = null;
  state.selectedMood = null;
  $('#storyId').value = '';
  $('#storyTitle').value = '';
  $('#storyText').value = '';
  $('#storyPlace').value = '';
  $('#storyDay').value = '';
  $('#photoPreview').innerHTML = '';
  $('#formTitle').textContent = 'เพิ่มเรื่องราวเดือนใหม่';
  $$('.mood-btn').forEach(b=>b.classList.remove('active'));
  resetVoiceUI();
  const now = new Date();
  $('#storyMonth').value = now.getMonth()+1;
  $('#storyYear').value = now.getFullYear();
  $('#storyMonth').dispatchEvent(new Event('change')); // trigger day dropdown
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
    const src = p.dataURL || getPhotoSrc(p);
    el.innerHTML = `<img src="${src}" alt=""/><span class="x" data-id="${p.id}">×</span>`;
    el.querySelector('.x').addEventListener('click', e=>{
      e.stopPropagation();
      state.pendingPhotos = state.pendingPhotos.filter(x=>x.id !== p.id);
      renderPhotoPreview();
    });
    wrap.appendChild(el);
  });
}

function getPhotoSrc(photo){
  // Prefer stored thumbnailLink (works without auth, with token), fall back to ID-based URL, then dataURL
  if (!photo) return '';
  if (photo.thumbnail_url) return upgradeThumbnailRes(photo.thumbnail_url);
  if (photo.dataURL) return photo.dataURL;
  if (photo.drive_id) return driveImageUrl(photo.drive_id); // legacy fallback
  return '';
}

// Hydrate img elements with blob URLs (async, after render)
function hydrateImages(rootEl = document){
  const imgs = rootEl.querySelectorAll('img[data-drive-id]');
  imgs.forEach(img => {
    const driveId = img.dataset.driveId;
    if (!driveId || img.dataset.hydrated === '1') return;
    img.dataset.hydrated = '1';
    // Fade in once loaded
    img.style.opacity = '0.3';
    img.style.transition = 'opacity .3s';
    fetchImageBlobUrl(driveId).then(url => {
      if (url){
        img.src = url;
        img.style.opacity = '1';
      }
    }).catch(()=>{ img.style.opacity = '1'; });
  });
}

// Cap caches to prevent unbounded memory growth on iOS PWA
const _MAX_CACHE_SIZE = 60;
function _trimCache(cache){
  while (cache.size > _MAX_CACHE_SIZE){
    const oldestKey = cache.keys().next().value;
    const oldUrl = cache.get(oldestKey);
    if (oldUrl && typeof oldUrl === 'string' && oldUrl.startsWith('blob:')){
      URL.revokeObjectURL(oldUrl);
    }
    cache.delete(oldestKey);
  }
}

function upgradeThumbnailRes(url, size = 1600){
  // Drive thumbnailLink comes back as ".../=s220" by default — upgrade for retina
  if (!url) return url;
  // Replace =s### or =w### with =s{size} for higher resolution
  return url.replace(/=[swh]\d+(-[a-z]+)?$/, `=s${size}`);
}

function driveImageUrl(driveId){
  // Legacy fallback URL — may not always work but kept for backwards compat
  return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`;
}

function driveAudioUrl(driveId){
  // Legacy fallback — may not always work, will be replaced by blob URL via fetchAudioBlob
  return `https://drive.google.com/uc?id=${driveId}&export=download`;
}

// Cache of blob URLs we created so we don't refetch the same file twice in one session
const _audioBlobCache = new Map();
const _imageBlobCache = new Map();

async function fetchAudioBlobUrl(driveId){
  if (!driveId) return '';
  if (_audioBlobCache.has(driveId)){
    return _audioBlobCache.get(driveId);
  }
  if (!state.google.accessToken) return driveAudioUrl(driveId);
  if (!gapi?.client?.drive){
    console.warn('Drive API not loaded yet');
    return driveAudioUrl(driveId);
  }

  try {
    const resp = await gapi.client.drive.files.get({
      fileId: driveId,
      alt: 'media',
    });
    const raw = resp.body;
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;

    const headerMime = resp.headers?.['Content-Type'] || resp.headers?.['content-type'] || '';
    let mime = headerMime;
    if (!mime || mime === 'application/octet-stream' || !mime.startsWith('audio/')){
      mime = 'audio/mp4';
    }
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    _audioBlobCache.set(driveId, url);
    _trimCache(_audioBlobCache);
    return url;
  } catch(err){
    console.warn('fetchAudioBlobUrl failed:', err);
    return driveAudioUrl(driveId);
  }
}

async function fetchImageBlobUrl(driveId){
  if (!driveId) return '';
  if (_imageBlobCache.has(driveId)){
    return _imageBlobCache.get(driveId);
  }
  if (!state.google.accessToken) return '';
  if (!gapi?.client?.drive){
    console.warn('Drive API not loaded yet for image fetch');
    return '';
  }

  try {
    const resp = await gapi.client.drive.files.get({
      fileId: driveId,
      alt: 'media',
    });
    const raw = resp.body;
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;

    const headerMime = resp.headers?.['Content-Type'] || resp.headers?.['content-type'] || '';
    const mime = (headerMime && headerMime.startsWith('image/')) ? headerMime : 'image/jpeg';
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    _imageBlobCache.set(driveId, url);
    _trimCache(_imageBlobCache);
    return url;
  } catch(err){
    console.warn('fetchImageBlobUrl failed:', err);
    return '';
  }
}


// ───────────────────────────────────────────────
// MOOD PICKER
// ───────────────────────────────────────────────
function initMoodPicker(){
  $$('.mood-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const same = btn.classList.contains('active');
      $$('.mood-btn').forEach(b=>b.classList.remove('active'));
      if (!same){
        btn.classList.add('active');
        state.selectedMood = btn.dataset.mood;
      } else {
        state.selectedMood = null;
      }
    });
  });
}


// ───────────────────────────────────────────────
// VOICE RECORDER
// ───────────────────────────────────────────────
function initVoiceRecorder(){
  const btn = $('#recordBtn');
  btn.addEventListener('click', toggleRecord);
  $('#voiceDelete').addEventListener('click', ()=>{
    state.pendingVoiceBlob = null;
    state.pendingVoiceDriveId = null;
    resetVoiceUI();
  });
}

function resetVoiceUI(){
  $('#voiceMeter').classList.add('hidden');
  $('#voicePlayback').classList.add('hidden');
  $('#voiceDelete').classList.add('hidden');
  $('#voiceBarFill').style.width = '0%';
  $('#voiceTime').textContent = '0:00';
  const btn = $('#recordBtn');
  btn.classList.remove('recording');
  btn.querySelector('.voice-icon').textContent = '🎙️';
  btn.querySelector('.voice-label').textContent = 'เริ่มอัด';
}

async function toggleRecord(){
  const rec = state.recordingState;
  const btn = $('#recordBtn');

  if (rec.mediaRecorder && rec.mediaRecorder.state === 'recording'){
    rec.mediaRecorder.stop();
    return;
  }

  // Start recording
  if (!navigator.mediaDevices?.getUserMedia){
    toast('เครื่องนี้ไม่รองรับการอัดเสียง', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    const mimeType = pickAudioMime();
    const options = mimeType ? { mimeType } : undefined;
    const mr = new MediaRecorder(stream, options);
    rec.mediaRecorder = mr;
    rec.chunks = [];
    rec.startTime = Date.now();

    mr.ondataavailable = e => { if (e.data && e.data.size > 0) rec.chunks.push(e.data); };
    mr.onstop = ()=>{
      stream.getTracks().forEach(t=>t.stop());
      clearInterval(rec.timer);
      // Use the actual mime type that was recorded
      const actualMime = mr.mimeType || rec.chunks[0]?.type || 'audio/webm';
      const blob = new Blob(rec.chunks, {type: actualMime});

      btn.classList.remove('recording');

      if (blob.size === 0){
        toast('ไมค์ใน PWA อาจถูกบล็อก — ลองอัดใน Safari แทน หรือ Settings → Safari → Microphone', 'error', 8000);
        $('#voiceMeter').classList.add('hidden');
        btn.querySelector('.voice-icon').textContent = '🎙️';
        btn.querySelector('.voice-label').textContent = 'ลองอีกครั้ง';
        return;
      }

      state.pendingVoiceBlob = blob;
      state.pendingVoiceDriveId = null;
      const audio = $('#voicePlayback');
      // Revoke previous URL if any (prevent memory leak)
      if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.classList.remove('hidden');
      $('#voiceDelete').classList.remove('hidden');
      $('#voiceMeter').classList.add('hidden');
      btn.querySelector('.voice-icon').textContent = '🔄';
      btn.querySelector('.voice-label').textContent = `อัดใหม่ (${(blob.size/1024).toFixed(0)}KB)`;
    };

    mr.onerror = (e)=>{
      console.error('MediaRecorder error', e);
      toast('อัดเสียงผิดพลาด', 'error');
      clearInterval(rec.timer);
      stream.getTracks().forEach(t=>t.stop());
      btn.classList.remove('recording');
    };

    // Use timeslice to get periodic chunks (helps iOS Safari)
    mr.start(1000);
    btn.classList.add('recording');
    btn.querySelector('.voice-icon').textContent = '⏹';
    btn.querySelector('.voice-label').textContent = 'หยุดอัด';
    $('#voiceMeter').classList.remove('hidden');
    $('#voicePlayback').classList.add('hidden');

    // update meter
    rec.timer = setInterval(()=>{
      const elapsed = Date.now() - rec.startTime;
      const pct = Math.min(100, (elapsed / CONFIG.VOICE_MAX_MS) * 100);
      $('#voiceBarFill').style.width = pct + '%';
      const sec = Math.floor(elapsed/1000);
      $('#voiceTime').textContent = `0:${String(sec).padStart(2,'0')}`;
      if (elapsed >= CONFIG.VOICE_MAX_MS && mr.state === 'recording'){
        mr.stop();
      }
    }, 100);
  } catch(err){
    console.error('mic error', err);
    toast('ไม่สามารถเข้าถึงไมค์ได้ — เช็ค permissions', 'error');
  }
}

function pickAudioMime(){
  // iOS Safari prefers audio/mp4 — try that first; webm has spotty support on iOS
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const types = isiOS
    ? ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of types){
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)){
      return t;
    }
  }
  return ''; // browser default
}


// ───────────────────────────────────────────────
// SAVE STORY
// ───────────────────────────────────────────────
async function onSaveStory(e){
  e.preventDefault();
  const id = $('#storyId').value || uid('st');
  const month = parseInt($('#storyMonth').value, 10);
  const year = parseInt($('#storyYear').value, 10);
  const dayVal = $('#storyDay').value;
  const day = dayVal ? parseInt(dayVal, 10) : null;
  const title = $('#storyTitle').value.trim();
  const text = $('#storyText').value.trim();
  const place = $('#storyPlace').value.trim();
  const mood = state.selectedMood || '';

  if (!title){ toast('ใส่หัวข้อด้วยนะ', 'error'); return; }

  toast('กำลังบันทึก...', '', 5000);

  // Upload pending photos
  const newPhotos = [];
  for (const p of state.pendingPhotos){
    if (p.drive_id){
      newPhotos.push({ id: p.id, story_id: id, drive_id: p.drive_id, thumbnail_url: p.thumbnail_url || '', name: p.name, dataURL: null, kind: 'image' });
    } else if (p.file && state.google.accessToken){
      try{
        const result = await uploadToDrive(p.file);
        newPhotos.push({ id: p.id, story_id: id, drive_id: result.id, thumbnail_url: result.thumbnail_url || '', name: p.name, dataURL: null, kind: 'image' });
      } catch(err){
        console.error(err);
        newPhotos.push({ id: p.id, story_id: id, drive_id: null, thumbnail_url: '', name: p.name, dataURL: p.dataURL, kind: 'image' });
      }
    } else if (p.dataURL){
      newPhotos.push({ id: p.id, story_id: id, drive_id: null, thumbnail_url: '', name: p.name, dataURL: p.dataURL, kind: 'image' });
    }
  }

  // Voice note: upload if new blob
  let voiceDriveId = state.pendingVoiceDriveId;
  if (state.pendingVoiceBlob && !voiceDriveId){
    if (!state.google.accessToken){
      toast('ยังไม่ได้เชื่อมต่อ Google — เสียงจะไม่ถูกบันทึก', 'error', 4000);
    } else {
      const blobSize = state.pendingVoiceBlob.size || 0;
      const blobMime = state.pendingVoiceBlob.type || '(no mime)';

      if (blobSize === 0){
        alert(`❌ Voice blob ขนาด 0 byte\n\nสาเหตุ: iOS PWA อาจ block microphone\n\nลองอัดใน Safari ปกติแทน หรือเช็ค Settings → Safari → Microphone`);
      } else if (blobSize < 500){
        alert(`⚠️ Voice file สั้นเกิน (${blobSize} bytes)\n\nลองอัดใหม่`);
      } else {
        try {
          let ext = 'webm';
          if (blobMime.includes('mp4'))  ext = 'm4a';
          else if (blobMime.includes('ogg')) ext = 'ogg';
          else if (blobMime.includes('wav')) ext = 'wav';
          const audioFile = new File([state.pendingVoiceBlob], `${id}_voice.${ext}`, {type: blobMime});
          const result = await uploadToDrive(audioFile);
          voiceDriveId = result.id;
        } catch(err){
          const detail = (err && err.message) ? err.message : String(err);
          // Use alert() so iOS PWA users can see the full error (no console available)
          alert(`❌ อัปเสียงไม่สำเร็จ\n\nขนาดไฟล์: ${(blobSize/1024).toFixed(1)} KB\nMime: ${blobMime}\n\nError:\n${detail}\n\nกด OK เพื่อปิด — story จะถูกบันทึกแบบไม่มีเสียง`);
        }
      }
    }
  }

  // Replace this story's photos
  state.photos = state.photos.filter(p=>p.story_id !== id).concat(newPhotos);

  const story = {
    id, month, year, day, title, text, place, mood,
    voice_drive_id: voiceDriveId || '',
    author: state.user,
    updatedAt: new Date().toISOString(),
  };

  const existing = state.stories.findIndex(s=>s.id===id);
  if (existing >= 0) state.stories[existing] = story;
  else state.stories.push(story);

  state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month) || ((b.day||0) - (a.day||0)));
  saveLS(LS.STORIES, state.stories);
  saveLS(LS.PHOTOS, state.photos);

  let syncOk = true;
  if (state.google.accessToken){
    try {
      await syncToSheet();
      dismissErrorToast();
    }
    catch(err){
      console.error(err);
      syncOk = false;
      toast('บันทึกในเครื่องแล้ว แต่ sync ไม่สำเร็จ', 'error', 4000);
    }
  }

  resetForm();
  renderAll();
  renderYearView();
  refreshFilterOptions();
  switchTab('timeline');
  if (syncOk) toast('บันทึกเรียบร้อย ♥', 'success');
}


// ───────────────────────────────────────────────
// SEARCH + FILTERS
// ───────────────────────────────────────────────
function initSearch(){
  $('#searchInput').addEventListener('input', e=>{
    state.filters.search = e.target.value.trim().toLowerCase();
    applyFiltersAndRender();
  });
}

function initFilters(){
  $('#filterToggle').addEventListener('click', ()=>{
    $('#filterPanel').classList.toggle('hidden');
  });
  $('#filterClose').addEventListener('click', ()=>$('#filterPanel').classList.add('hidden'));

  $('#filterClear').addEventListener('click', ()=>{
    state.filters.year = '';
    state.filters.month = '';
    state.filters.day = '';
    state.filters.mood = '';
    $('#filterYear').value = '';
    $('#filterMonth').value = '';
    $('#filterDay').value = '';
    $$('.filter-mood').forEach(b => b.classList.toggle('active', b.dataset.mood === ''));
    repopulateFilterDays();
    applyFiltersAndRender();
  });

  ['#filterYear', '#filterMonth', '#filterDay'].forEach(sel => {
    $(sel).addEventListener('change', e=>{
      const key = sel.replace('#filter','').toLowerCase();
      state.filters[key] = e.target.value;
      if (sel === '#filterYear' || sel === '#filterMonth') repopulateFilterDays();
      applyFiltersAndRender();
    });
  });

  $$('.filter-mood').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.filter-mood').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.filters.mood = btn.dataset.mood;
      applyFiltersAndRender();
    });
  });

  refreshFilterOptions();
}

function refreshFilterOptions(){
  // Populate years from existing stories
  const years = [...new Set(state.stories.map(s => s.year).filter(y => y))].sort((a,b)=>b-a);
  const yearSel = $('#filterYear');
  const cur = yearSel.value;
  yearSel.innerHTML = '<option value="">ทุกปี</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (cur) yearSel.value = cur;
  repopulateFilterDays();
}

function repopulateFilterDays(){
  const y = parseInt(state.filters.year, 10);
  const m = parseInt(state.filters.month, 10);
  let dayCount = 31;
  if (y && m) dayCount = new Date(y, m, 0).getDate();
  else if (m) dayCount = [31,29,31,30,31,30,31,31,30,31,30,31][m-1] || 31;

  const sel = $('#filterDay');
  const cur = sel.value;
  sel.innerHTML = '<option value="">ทุกวัน</option>';
  for (let d=1; d<=dayCount; d++){
    sel.innerHTML += `<option value="${d}">วันที่ ${d}</option>`;
  }
  if (cur && parseInt(cur,10) <= dayCount) sel.value = cur;
  else { sel.value = ''; state.filters.day = ''; }
}

function countActiveFilters(){
  let n = 0;
  if (state.filters.year) n++;
  if (state.filters.month) n++;
  if (state.filters.day) n++;
  if (state.filters.mood) n++;
  return n;
}

function updateFilterBadge(){
  const n = countActiveFilters();
  const badge = $('#filterBadge');
  const toggle = $('#filterToggle');
  if (n > 0){
    badge.textContent = n;
    badge.classList.remove('hidden');
    toggle.classList.add('active');
  } else {
    badge.classList.add('hidden');
    toggle.classList.remove('active');
  }
}

function applyFilters(stories){
  return stories.filter(s => {
    if (state.filters.year   && s.year != state.filters.year) return false;
    if (state.filters.month  && s.month != state.filters.month) return false;
    if (state.filters.day    && (s.day == null || s.day != state.filters.day)) return false;
    if (state.filters.mood   && s.mood !== state.filters.mood) return false;
    if (state.filters.search){
      const q = state.filters.search;
      if (!(
        (s.title||'').toLowerCase().includes(q) ||
        (s.text||'').toLowerCase().includes(q) ||
        (s.place||'').toLowerCase().includes(q) ||
        (s.author||'').toLowerCase().includes(q)
      )) return false;
    }
    return true;
  });
}

function applyFiltersAndRender(){
  updateFilterBadge();
  renderAll();
}


// ───────────────────────────────────────────────
// RENDER TIMELINE
// ───────────────────────────────────────────────
let _photoCache = null;
function _invalidatePhotoCache(){ _photoCache = null; }
function getStoryPhotos(storyId){
  if (!_photoCache){
    _photoCache = new Map();
    for (const p of state.photos){
      if (!p.story_id) continue;
      if (!_photoCache.has(p.story_id)) _photoCache.set(p.story_id, []);
      _photoCache.get(p.story_id).push(p);
    }
  }
  return _photoCache.get(storyId) || [];
}

function renderAll(){
  const list = $('#timeline');
  const empty = $('#emptyState');

  const stories = applyFilters(state.stories);

  if (state.stories.length === 0){
    list.innerHTML = '';
    empty.classList.remove('hidden');
    $('#storyCount').textContent = '0 stories';
    return;
  }
  empty.classList.add('hidden');

  const hasActiveFilter = state.filters.search || countActiveFilters() > 0;
  if (hasActiveFilter && stories.length === 0){
    list.innerHTML = `<p class="muted" style="grid-column:1/-1;text-align:center;padding:40px">ไม่พบเรื่องราวที่ตรงกับ filter</p>`;
    $('#storyCount').textContent = `0 / ${state.stories.length}`;
    return;
  }
  $('#storyCount').textContent = hasActiveFilter
    ? `${stories.length} / ${state.stories.length}`
    : `${state.stories.length} stor${state.stories.length===1?'y':'ies'}`;

  const monthsTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  list.innerHTML = stories.map((s, idx)=>{
    const num = stories.length - idx;
    const photos = getStoryPhotos(s.id);
    const coverPhoto = photos[0] || null;
    const cover = coverPhoto ? getPhotoSrc(coverPhoto) : null;
    const driveAttr = (coverPhoto && coverPhoto.drive_id) ? ` data-drive-id="${coverPhoto.drive_id}"` : '';
    const moodEmoji = s.mood ? MOOD_EMOJI[s.mood] || '' : '';
    const dateLabel = s.day
      ? `${s.day} ${monthsTH[s.month]} · ${s.year}`
      : `${monthsTH[s.month]} · ${s.year}`;
    return `
      <article class="story-card ${isHighlight(s.id) ? 'is-highlight' : ''}" data-id="${s.id}">
        <div class="story-cover ${cover ? '' : 'placeholder'}">
          ${cover ? `<img src="${cover}" alt="" loading="lazy"${driveAttr}/>` : ''}
          <div class="story-month-tag">${dateLabel}</div>
          ${moodEmoji ? `<div class="story-mood-emoji">${moodEmoji}</div>` : ''}
        </div>
        <div class="story-body">
          <div class="story-num">memory · n° ${String(num).padStart(2,'0')}</div>
          <h4 class="story-title">${escapeHtml(s.title)}</h4>
          <p class="story-snippet">${escapeHtml(s.text || '')}</p>
          <div class="story-meta">
            <span>by ${escapeHtml(s.author || '—')}</span>
            ${s.place ? `<span>· 📍 ${escapeHtml(s.place)}</span>` : ''}
            ${photos.length>0 ? `<span>· ${photos.length} 📷</span>` : ''}
            ${s.voice_drive_id ? `<span>· 🎤</span>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  $$('.story-card').forEach(c=>{
    c.addEventListener('click', ()=>openStory(c.dataset.id));
  });

  // Hydrate images via Drive API blob URLs (handles iOS PWA + desktop without Drive cookies)
  hydrateImages(list);
  renderHighlights();
}


// ───────────────────────────────────────────────
// YEAR VIEW
// ───────────────────────────────────────────────
function renderYearView(){
  const wrap = $('#yearView');
  const monthsTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  // determine year range from anniversary year to current year
  const startYear = CONFIG.ANNIV_YEAR;
  const endYear = new Date().getFullYear();
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;

  let html = '';
  for (let y = endYear; y >= startYear; y--){
    const yearStories = state.stories.filter(s => s.year === y);
    const months = [];
    for (let m = 1; m <= 12; m++){
      // Skip months before anniversary in start year
      if (y === startYear && m < CONFIG.ANNIV_MONTH) continue;
      const found = yearStories.find(s => s.month === m);
      const isFuture = (y > todayY) || (y === todayY && m > todayM);
      months.push({ m, y, story: found, isFuture });
    }

    const filled = months.filter(x => x.story).length;
    const total = months.filter(x => !x.isFuture).length;

    html += `
      <div class="year-block">
        <h3 class="year-title">${y}</h3>
        <p class="year-meta">${filled} / ${total} เดือนที่บันทึกไว้</p>
        <div class="year-grid">
          ${months.map(({m, story, isFuture})=>{
            if (story){
              const moodEm = story.mood ? MOOD_EMOJI[story.mood] || '' : '';
              return `<div class="year-cell filled" data-id="${story.id}">${moodEm ? `<span class="year-mood">${moodEm}</span>`:''}${monthsTH[m]}</div>`;
            } else if (isFuture){
              return `<div class="year-cell future">${monthsTH[m]}</div>`;
            } else {
              return `<div class="year-cell" data-prefill-month="${m}" data-prefill-year="${y}">${monthsTH[m]}</div>`;
            }
          }).join('')}
        </div>
      </div>
    `;
  }
  wrap.innerHTML = html;

  // wire up clicks
  $$('.year-cell.filled').forEach(c=>{
    c.addEventListener('click', ()=>openStory(c.dataset.id));
  });
  $$('.year-cell[data-prefill-month]').forEach(c=>{
    c.addEventListener('click', ()=>{
      resetForm();
      $('#storyMonth').value = c.dataset.prefillMonth;
      $('#storyYear').value = c.dataset.prefillYear;
      switchTab('add');
      $('#storyTitle').focus();
    });
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
  const coverPhoto = photos[0] || null;
  const cover = coverPhoto ? getPhotoSrc(coverPhoto) : null;
  const coverDriveAttr = (coverPhoto && coverPhoto.drive_id) ? ` data-drive-id="${coverPhoto.drive_id}"` : '';
  const moodEmoji = s.mood ? MOOD_EMOJI[s.mood] || '' : '';

  const galleryHTML = photos.length > 1
    ? `<div class="mc-gallery">${photos.slice(1).map(p=>{
        const src = getPhotoSrc(p);
        const dAttr = p.drive_id ? ` data-drive-id="${p.drive_id}"` : '';
        return `<img src="${src}" alt="" loading="lazy"${dAttr}/>`;
      }).join('')}</div>`
    : '';

  const voiceHTML = s.voice_drive_id
    ? `<div class="mc-voice">
         <label class="muted small">🎤 ฟังเสียง <span id="voiceLoadStatus" class="muted small" style="margin-left:8px"></span></label>
         <audio id="modalVoiceAudio" controls preload="none" style="width:100%"></audio>
       </div>`
    : '';

  $('#modalContent').innerHTML = `
    <div class="mc-cover ${cover?'':'placeholder'}">
      ${cover ? `<img src="${cover}" alt=""${coverDriveAttr}/>` : ''}
      ${moodEmoji ? `<div class="mc-mood-emoji">${moodEmoji}</div>` : ''}
    </div>
    <div class="mc-body">
      <p class="mc-eyebrow">${s.day ? `${s.day} ` : ''}${monthsFull[s.month]} ${s.year}</p>
      <h2 class="mc-title">${escapeHtml(s.title)}</h2>
      <div class="mc-meta">
        <span>by ${escapeHtml(s.author || '—')}</span>
        ${s.place ? `<span>📍 ${escapeHtml(s.place)}</span>` : ''}
        <span>${new Date(s.updatedAt).toLocaleDateString('th-TH')}</span>
      </div>
      <div class="mc-text">${escapeHtml(s.text || '— no story yet —')}</div>
      ${voiceHTML}
      ${galleryHTML}
      <div class="mc-actions">
        <button class="btn-ghost danger" id="storyDelete">🗑 ลบ</button>
        <button class="btn-highlight ${isHighlight(id) ? 'active' : ''}" id="storyHighlight">${isHighlight(id) ? '⭐ ยกเลิก pin' : '⭐ Pin Highlight'}</button>
        <button class="btn-primary" id="storyEdit">✎ แก้ไข</button>
      </div>
    </div>
  `;

  $('#storyEdit').addEventListener('click', ()=>editStory(id));
  $('#storyDelete').addEventListener('click', ()=>deleteStory(id));
  $('#storyHighlight').addEventListener('click', ()=>{
    toggleHighlight(id);
    closeModal();
  });
  $('#storyModal').classList.remove('hidden');

  // Hydrate cover + gallery images
  hydrateImages($('#modalContent'));

  // Async load voice file as blob URL (works on iOS PWA)
  if (s.voice_drive_id){
    const audioEl = $('#modalVoiceAudio');
    const statusEl = $('#voiceLoadStatus');
    if (statusEl) statusEl.textContent = '(กำลังโหลด...)';
    fetchAudioBlobUrl(s.voice_drive_id).then(url => {
      if (audioEl){
        audioEl.src = url;
        if (statusEl) statusEl.textContent = '';
      }
    }).catch(err => {
      console.error('voice load error', err);
      if (statusEl) statusEl.textContent = '(โหลดเสียงไม่สำเร็จ)';
    });
  }
}

function closeModal(){ $('#storyModal').classList.add('hidden'); }

function editStory(id){
  const s = state.stories.find(x=>x.id===id);
  if (!s) return;
  state.editingId = id;
  state.pendingPhotos = getStoryPhotos(id).map(p=>({
    id: p.id, drive_id: p.drive_id, thumbnail_url: p.thumbnail_url || '', name: p.name,
    dataURL: p.dataURL || getPhotoSrc(p),
  }));
  state.pendingVoiceBlob = null;
  state.pendingVoiceDriveId = s.voice_drive_id || null;
  state.selectedMood = s.mood || null;

  $('#storyId').value = s.id;
  $('#storyMonth').value = s.month;
  $('#storyYear').value = s.year;
  $('#storyMonth').dispatchEvent(new Event('change')); // populate days for this month
  $('#storyDay').value = s.day || '';
  $('#storyTitle').value = s.title;
  $('#storyText').value = s.text || '';
  $('#storyPlace').value = s.place || '';
  $('#formTitle').textContent = '✎ แก้ไขเรื่องราว';

  $$('.mood-btn').forEach(b => b.classList.toggle('active', b.dataset.mood === s.mood));
  resetVoiceUI();
  if (s.voice_drive_id){
    const audio = $('#voicePlayback');
    audio.classList.remove('hidden');
    $('#voiceDelete').classList.remove('hidden');
    $('#recordBtn').querySelector('.voice-label').textContent = 'อัดใหม่';
    // Async load via blob (works on iOS PWA)
    fetchAudioBlobUrl(s.voice_drive_id).then(url => { audio.src = url; }).catch(err => console.warn(err));
  }

  renderPhotoPreview();
  closeModal();
  switchTab('add');
}

async function deleteStory(id){
  if (!confirm('ต้องการลบเรื่องราวนี้จริง ๆ ?')) return;
  state.stories = state.stories.filter(s=>s.id!==id);
  state.photos = state.photos.filter(p=>p.story_id !== id);
  saveLS(LS.STORIES, state.stories);
  saveLS(LS.PHOTOS, state.photos);
  if (state.google.accessToken){ try { await syncToSheet(); } catch(e){ console.error(e); } }
  closeModal();
  renderAll();
  renderYearView();
  refreshFilterOptions();
  toast('ลบแล้ว');
}


// ───────────────────────────────────────────────
// TIME CAPSULE
// ───────────────────────────────────────────────
function initCapsule(){
  $$('.capsule-when-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.capsule-when-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCapsuleMonths = parseInt(btn.dataset.months,10);
      $('#capsuleMonths').value = state.selectedCapsuleMonths;
    });
  });

  $('#capsuleForm').addEventListener('submit', onSaveCapsule);
}

async function onSaveCapsule(e){
  e.preventDefault();
  const title = $('#capsuleTitle').value.trim();
  const text = $('#capsuleText').value.trim();
  const months = state.selectedCapsuleMonths;
  if (!title || !text){ toast('กรอกให้ครบนะ', 'error'); return; }
  if (!months){ toast('เลือกเวลาเปิดด้วย', 'error'); return; }

  const now = new Date();
  const openAt = new Date(now);
  openAt.setMonth(openAt.getMonth() + months);

  const capsule = {
    id: uid('cap'),
    title, text,
    author: state.user,
    createdAt: now.toISOString(),
    openAt: openAt.toISOString(),
    opened: false,
  };

  state.capsules.push(capsule);
  saveLS(LS.CAPSULES, state.capsules);

  if (state.google.accessToken){
    try { await syncCapsulesToSheet(); }
    catch(err){ console.error(err); }
  }

  $('#capsuleForm').reset();
  $$('.capsule-when-btn').forEach(b=>b.classList.remove('active'));
  state.selectedCapsuleMonths = null;
  renderCapsules();
  toast('🔒 ปิดผนึกเรียบร้อย ♥', 'success');
}

function renderCapsules(){
  const wrap = $('#capsuleList');
  if (state.capsules.length === 0){
    wrap.innerHTML = '<p class="muted small" style="text-align:center;padding:18px">ยังไม่มีแคปซูลเลย เริ่มเขียนถึงตัวเองในอนาคตกันเถอะ</p>';
    return;
  }

  const now = new Date();
  state.capsules.sort((a,b)=> new Date(a.openAt) - new Date(b.openAt));

  wrap.innerHTML = state.capsules.map(c=>{
    const open = new Date(c.openAt);
    const isUnlocked = now >= open;
    const daysLeft = Math.ceil((open - now) / 86400000);
    return `
      <div class="capsule-item ${isUnlocked ? 'unlocked' : ''}" data-id="${c.id}">
        <div class="capsule-icon">${isUnlocked ? '🔓' : '🔒'}</div>
        <div class="capsule-meta">
          <h5>${escapeHtml(c.title)}</h5>
          <p>by ${escapeHtml(c.author||'—')} · ${isUnlocked ? 'เปิดได้แล้ว!' : `อีก ${daysLeft} วัน (${open.toLocaleDateString('th-TH')})`}</p>
        </div>
        <div class="capsule-status">${isUnlocked ? 'OPEN' : 'SEALED'}</div>
      </div>
    `;
  }).join('');

  $$('.capsule-item.unlocked').forEach(el=>{
    el.addEventListener('click', ()=>openCapsule(el.dataset.id));
  });
}

function openCapsule(id){
  const c = state.capsules.find(x=>x.id===id);
  if (!c) return;
  $('#modalContent').innerHTML = `
    <div class="mc-body">
      <p class="mc-eyebrow">💌 Time Capsule · เปิดเมื่อ ${new Date(c.openAt).toLocaleDateString('th-TH')}</p>
      <h2 class="mc-title">${escapeHtml(c.title)}</h2>
      <div class="mc-meta">
        <span>by ${escapeHtml(c.author||'—')}</span>
        <span>เขียนเมื่อ ${new Date(c.createdAt).toLocaleDateString('th-TH')}</span>
      </div>
      <div class="mc-text">${escapeHtml(c.text)}</div>
      <div class="mc-actions">
        <button class="btn-ghost danger" id="capsuleDelete">🗑 ลบ</button>
      </div>
    </div>
  `;
  $('#capsuleDelete').addEventListener('click', async ()=>{
    if (!confirm('ลบแคปซูลนี้?')) return;
    state.capsules = state.capsules.filter(x=>x.id !== id);
    saveLS(LS.CAPSULES, state.capsules);
    if (state.google.accessToken){
      try { await syncCapsulesToSheet(); } catch(e){}
    }
    closeModal();
    renderCapsules();
    toast('ลบแล้ว');
  });
  $('#storyModal').classList.remove('hidden');
}

function checkUnlockedCapsules(){
  const now = new Date();
  const newlyUnlocked = state.capsules.filter(c => !c.opened && now >= new Date(c.openAt));
  if (newlyUnlocked.length > 0){
    setTimeout(()=>{
      toast(`💌 มีแคปซูลที่เปิดได้แล้ว ${newlyUnlocked.length} อัน`, 'success', 4500);
    }, 1500);
  }
}


// ═══════════════════════════════════════════════════════════════
// GOOGLE INTEGRATION
// ═══════════════════════════════════════════════════════════════

function initSettings(){
  $('#googleConnectBtn').addEventListener('click', connectGoogle);
  $('#googleSyncNow').addEventListener('click', manualSync);
  $('#googleDisconnect').addEventListener('click', disconnectGoogle);

  const resetBtn = $('#resetSheetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetSheetId);

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', ()=>$('#importFile').click());
  $('#importFile').addEventListener('change', importData);

  $('#loadBackupsBtn').addEventListener('click', loadBackupList);
  $('#restoreBackupBtn').addEventListener('click', restoreSelectedBackup);
  $('#backupNowBtn').addEventListener('click', ()=>writeBackup(true));
}

async function resetSheetId(){
  if (!confirm('ระบบจะค้นหา Sheet ใหม่จาก Drive ของคุณและ Shared with me\n\nข้อมูลในเครื่องจะไม่หาย — แต่ระบบจะ sync จาก sheet ใหม่ที่เจอ')) return;
  state.google.sheetId = null;
  localStorage.removeItem(LS.SHEET_ID);
  toast('กำลังหา Sheet ใหม่...', '', 4000);
  try {
    await ensureSheetExists();
    await pullFromSheet();
    toast(`เจอ Sheet แล้ว (id: ${state.google.sheetId.slice(0,12)}...)`, 'success', 4000);
  } catch(err){
    console.error(err);
    toast('หา Sheet ไม่เจอ — ขอให้คนแชร์ ส่ง share ให้ก่อน', 'error', 5000);
  }
}

function setGoogleStatus(connected){
  const pill = $('#googleStatus');
  pill.textContent = connected ? '✓ เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ';
  pill.className = 'status-pill ' + (connected ? 'on' : 'off');
}

function setSyncIndicator(stat, label){
  const ind = $('#syncIndicator');
  if (!ind) return;
  ind.className = 'sync-indicator ' + stat;
  const txt = ind.querySelector('.sync-text');
  if (txt) txt.textContent = label || stat;
}

function updateSettingsTimes(){
  $('#lastSyncTime').textContent = formatTime(localStorage.getItem(LS.LAST_SYNC));
  $('#lastBackupTime').textContent = formatTime(localStorage.getItem(LS.LAST_BACKUP));
}

function initGoogleAPI(clientId, apiKey){
  const ready = ()=> typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts;
  if (!ready()){ setTimeout(()=>initGoogleAPI(clientId, apiKey), 400); return; }

  setSyncIndicator('off', 'connecting…');

  gapi.load('client', async ()=>{
    try {
      await gapi.client.init({ apiKey, discoveryDocs: CONFIG.DISCOVERY_DOCS });
      state.google.gapiReady = true;

      state.google.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CONFIG.SCOPES,
        callback: tokenCallback,
      });
      state.google.gisReady = true;

      const cached = localStorage.getItem(LS.TOKEN);
      if (cached){
        try {
          const tk = JSON.parse(cached);
          if (tk.expires_at && tk.expires_at > Date.now() + 60000){
            // Token still valid — use it directly
            state.google.accessToken = tk.access_token;
            gapi.client.setToken({access_token: tk.access_token});
            setGoogleStatus(true);
            setSyncIndicator('connected', 'connected');
            await pullFromSheet();
            startAutoSync();
            startBackupTimer();
            scheduleTokenRefresh(tk.expires_at);
            updateSettingsTimes();
            return;
          } else if (tk.access_token){
            // Token expired — try silent refresh (no popup)
            console.log('Token expired, attempting silent refresh...');
            try {
              await silentRefreshToken();
              return;
            } catch(e){
              console.warn('Silent refresh failed, need user interaction:', e);
            }
          }
        } catch(e){}
      }
      setSyncIndicator('off', 'tap connect');
    } catch(err){
      console.error('gapi init error', err);
      toast('โหลด Google API ไม่สำเร็จ', 'error');
      setSyncIndicator('error', 'init failed');
    }
  });
}

function silentRefreshToken(){
  // Request a new token without consent prompt — works if user already consented before
  return new Promise((resolve, reject)=>{
    if (!state.google.tokenClient){ reject(new Error('No token client')); return; }
    // Override callback temporarily to capture this specific result
    const origCallback = state.google.tokenClient.callback;
    state.google.tokenClient.callback = (resp)=>{
      state.google.tokenClient.callback = origCallback;
      if (resp.error){
        reject(new Error(resp.error));
      } else {
        tokenCallback(resp).then(resolve).catch(reject);
      }
    };
    try {
      // Empty prompt = silent refresh (no UI shown if already authorized)
      state.google.tokenClient.requestAccessToken({prompt: ''});
    } catch(e){
      state.google.tokenClient.callback = origCallback;
      reject(e);
    }
  });
}

let _tokenRefreshTimer = null;
function scheduleTokenRefresh(expiresAt){
  if (_tokenRefreshTimer){ clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  // Refresh 5 minutes before expiry
  const refreshAt = expiresAt - 5 * 60 * 1000;
  const delay = Math.max(10000, refreshAt - Date.now()); // at least 10s
  console.log(`Token refresh scheduled in ${Math.round(delay/60000)} min`);
  _tokenRefreshTimer = setTimeout(async ()=>{
    console.log('Auto-refreshing token...');
    try {
      await silentRefreshToken();
      console.log('Token refreshed silently');
    } catch(err){
      console.warn('Silent refresh failed:', err);
      // Don't bug the user — the existing token might still work for a few more minutes
      // and any operation will trigger a popup if it really fails
    }
  }, delay);
}

function connectGoogle(){
  if (!state.google.tokenClient){
    toast('ยังโหลด Google API ไม่เสร็จ — รอสักครู่', 'error');
    return;
  }
  // First time: use 'consent' to get full grant; subsequent times silent refresh handles it
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

  const expiresAt = Date.now() + (resp.expires_in||3600)*1000;
  localStorage.setItem(LS.TOKEN, JSON.stringify({
    access_token: resp.access_token,
    expires_at: expiresAt,
  }));
  setGoogleStatus(true);
  setSyncIndicator('connected', 'connected');

  // Only show connect toast if it's a fresh connection (not a silent refresh)
  const wasSilent = resp._wasSilent;
  if (!wasSilent) toast('เชื่อมต่อสำเร็จ ✓', 'success');

  scheduleTokenRefresh(expiresAt);

  await ensureSheetExists();
  await pullFromSheet();
  if (!state.syncTimer) startAutoSync();
  if (!state.backupTimer) startBackupTimer();
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

  // Search across My Drive AND Shared with me (default behavior is both)
  const q = `name='${CONFIG.SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  let found;
  try {
    found = await gapi.client.drive.files.list({
      q,
      fields: 'files(id,name,owners,shared,modifiedTime)',
      pageSize: 50,
    });
  } catch(searchErr){
    console.error('Drive search failed', searchErr);
    throw new Error('Drive search failed: ' + (searchErr?.message || 'unknown'));
  }

  const files = found.result?.files || [];
  console.log(`Drive search found ${files.length} matching sheets`);

  if (files.length > 0){
    // Prefer the most recently modified one (likely the real one with data)
    files.sort((a,b) => new Date(b.modifiedTime||0) - new Date(a.modifiedTime||0));

    // If multiple, try each and pick the one with stories
    let chosenFile = files[0];
    if (files.length > 1){
      console.log(`Found ${files.length} matching sheets, picking one with most data`);
      for (const f of files){
        try {
          const r = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: f.id,
            range: `${CONFIG.TAB_STORIES}!A2:A`,
          });
          const rowCount = r.result?.values?.length || 0;
          console.log(`Sheet ${f.id}: ${rowCount} stories`);
          if (rowCount > 0){ chosenFile = f; break; }
        } catch(e){ console.warn('skip sheet', f.id, e); }
      }
    }

    state.google.sheetId = chosenFile.id;
    localStorage.setItem(LS.SHEET_ID, state.google.sheetId);
    const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
    const tabs = (meta.result.sheets||[]).map(s=>s.properties.title);
    await ensureRequiredTabs(tabs);
    return state.google.sheetId;
  }

  const res = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: CONFIG.SHEET_NAME },
      sheets: [
        { properties: { title: CONFIG.TAB_STORIES } },
        { properties: { title: CONFIG.TAB_PHOTOS } },
        { properties: { title: CONFIG.TAB_BACKUPS } },
        { properties: { title: CONFIG.TAB_CAPSULES } },
        { properties: { title: CONFIG.TAB_BUCKETS } },
        { properties: { title: CONFIG.TAB_DAILY } },
        { properties: { title: CONFIG.TAB_QOTD } },
        { properties: { title: CONFIG.TAB_NOTES } },
        { properties: { title: CONFIG.TAB_IDEAS } },
        { properties: { title: CONFIG.TAB_PREFS } },
      ],
    }
  });
  state.google.sheetId = res.result.spreadsheetId;
  localStorage.setItem(LS.SHEET_ID, state.google.sheetId);
  await writeHeaders();
  toast('สร้าง Google Sheet ใหม่แล้ว ✓', 'success');
  return state.google.sheetId;
}

async function ensureRequiredTabs(existingTabs){
  const required = [CONFIG.TAB_STORIES, CONFIG.TAB_PHOTOS, CONFIG.TAB_BACKUPS, CONFIG.TAB_CAPSULES,
                    CONFIG.TAB_BUCKETS, CONFIG.TAB_DAILY, CONFIG.TAB_QOTD,
                    CONFIG.TAB_NOTES, CONFIG.TAB_IDEAS, CONFIG.TAB_PREFS];
  const missing = required.filter(t => !existingTabs.includes(t));

  const renames = [];
  if (!existingTabs.includes(CONFIG.TAB_STORIES) && existingTabs.includes('Sheet1')){
    const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
    const sheet1 = (meta.result.sheets||[]).find(s => s.properties.title === 'Sheet1');
    if (sheet1){
      renames.push({
        updateSheetProperties: {
          properties: { sheetId: sheet1.properties.sheetId, title: CONFIG.TAB_STORIES },
          fields: 'title',
        }
      });
      const idx = missing.indexOf(CONFIG.TAB_STORIES);
      if (idx >= 0) missing.splice(idx, 1);
    }
  }

  if (missing.length > 0 || renames.length > 0){
    const requests = [
      ...renames,
      ...missing.map(title => ({ addSheet: { properties: { title } } })),
    ];
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: state.google.sheetId,
      resource: { requests },
    });
  }

  // Always check if Stories tab has the new "day" column header — if not, migrate
  await migrateStoriesSchema();

  // Always rewrite headers to ensure they're up to date
  await writeHeaders();
}

async function migrateStoriesSchema(){
  // Check current header row of Stories
  try {
    const r = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_STORIES}!A1:K1`,
    });
    const headers = r.result.values?.[0] || [];
    // If column D (index 3) is NOT 'day' — old schema → need to migrate
    if (headers[3] !== 'day' && headers.length > 3){
      console.log('Migrating Stories schema: inserting day column at index 3');
      // Read all existing data rows
      const allRows = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: state.google.sheetId,
        range: `${CONFIG.TAB_STORIES}!A2:J`,  // old schema had 10 cols
      });
      const oldRows = allRows.result.values || [];
      // Insert empty day column at index 3
      const newRows = oldRows.map(row => {
        const r = [...row];
        r.splice(3, 0, ''); // insert empty day at position 3
        return r;
      });
      // Clear and rewrite
      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: state.google.sheetId,
        range: `${CONFIG.TAB_STORIES}!A2:K`,
      });
      if (newRows.length){
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: state.google.sheetId,
          range: `${CONFIG.TAB_STORIES}!A2`,
          valueInputOption: 'RAW',
          resource: { values: newRows },
        });
      }
      console.log(`Migrated ${newRows.length} stories with empty day column`);
    }
  } catch(e){
    console.warn('Schema migration check failed (might be empty sheet):', e);
  }
}

async function writeHeaders(){
  const updates = [
    {range: `${CONFIG.TAB_STORIES}!A1:K1`, values: [['id','year','month','day','title','text','place','author','mood','voice_drive_id','updatedAt']]},
    {range: `${CONFIG.TAB_PHOTOS}!A1:F1`,  values: [['id','story_id','drive_id','name','dataURL_fallback','thumbnail_url']]},
    {range: `${CONFIG.TAB_BACKUPS}!A1:D1`, values: [['date','timestamp','story_count','snapshot_json']]},
    {range: `${CONFIG.TAB_CAPSULES}!A1:F1`,values: [['id','title','text','author','createdAt','openAt']]},
    {range: `${CONFIG.TAB_BUCKETS}!A1:G1`, values: [['id','title','category','done','createdBy','createdAt','doneAt']]},
    {range: `${CONFIG.TAB_DAILY}!A1:H1`,   values: [['id','date','year','month','day','text','author','createdAt']]},
    {range: `${CONFIG.TAB_QOTD}!A1:G1`,    values: [['id','qid','qtext','date','text','author','createdAt']]},
    {range: `${CONFIG.TAB_NOTES}!A1:F1`,   values: [['id','from','to','text','createdAt','readAt']]},
    {range: `${CONFIG.TAB_IDEAS}!A1:E1`,   values: [['id','text','emoji','addedBy','createdAt']]},
    {range: `${CONFIG.TAB_PREFS}!A1:B1`,   values: [['key','value']]},
  ];
  await Promise.all(updates.map(u =>
    gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: u.range,
      valueInputOption: 'RAW',
      resource: { values: u.values },
    })
  ));
}


// ───────────────────────────────────────────────
// SYNC: pull
// ───────────────────────────────────────────────
async function pullFromSheet(){
  if (!state.google.sheetId) await ensureSheetExists();
  if (!state.google.sheetId) return;

  try {
    const meta = await gapi.client.sheets.spreadsheets.get({spreadsheetId: state.google.sheetId});
    const tabs = (meta.result.sheets||[]).map(s=>s.properties.title);
    await ensureRequiredTabs(tabs);
  } catch(e){ console.warn('Cannot validate tabs, proceeding:', e); }

  const safeGet = async (range)=>{
    try {
      const r = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: state.google.sheetId, range,
      });
      return r.result?.values || [];
    } catch(e){
      console.warn(`Fetch failed ${range}:`, e);
      return [];
    }
  };

  try {
    const [storyRows, photoRows, capsuleRows, bucketRows, dailyRows, qotdRows, noteRows, ideaRows, prefRows] = await Promise.all([
      safeGet(`${CONFIG.TAB_STORIES}!A2:K`),
      safeGet(`${CONFIG.TAB_PHOTOS}!A2:F`),
      safeGet(`${CONFIG.TAB_CAPSULES}!A2:F`),
      safeGet(`${CONFIG.TAB_BUCKETS}!A2:G`),
      safeGet(`${CONFIG.TAB_DAILY}!A2:H`),
      safeGet(`${CONFIG.TAB_QOTD}!A2:G`),
      safeGet(`${CONFIG.TAB_NOTES}!A2:F`),
      safeGet(`${CONFIG.TAB_IDEAS}!A2:E`),
      safeGet(`${CONFIG.TAB_PREFS}!A2:B`),
    ]);

    const remoteStories = storyRows.map(r=>({
      id: r[0],
      year: parseInt(r[1],10),
      month: parseInt(r[2],10),
      day: r[3] ? parseInt(r[3],10) : null,
      title: r[4] || '',
      text: r[5] || '',
      place: r[6] || '',
      author: r[7] || '',
      mood: r[8] || '',
      voice_drive_id: r[9] || '',
      updatedAt: r[10] || '',
    })).filter(s=>s.id);

    const remotePhotos = photoRows.map(r=>({
      id: r[0],
      story_id: r[1],
      drive_id: r[2] || null,
      name: r[3] || '',
      dataURL: r[4] || null,
      thumbnail_url: r[5] || '',
    })).filter(p=>p.id && p.story_id);

    const remoteCapsules = capsuleRows.map(r=>({
      id: r[0],
      title: r[1] || '',
      text: r[2] || '',
      author: r[3] || '',
      createdAt: r[4] || '',
      openAt: r[5] || '',
      opened: false,
    })).filter(c=>c.id);

    const remoteBuckets = bucketRows.map(r=>({
      id: r[0],
      title: r[1] || '',
      category: r[2] || 'other',
      done: r[3] === '1' || r[3] === true,
      createdBy: r[4] || '',
      createdAt: r[5] || '',
      doneAt: r[6] || '',
    })).filter(b=>b.id);

    const remoteDaily = dailyRows.map(r=>({
      id: r[0],
      date: r[1] || '',
      year: parseInt(r[2],10),
      month: parseInt(r[3],10),
      day: parseInt(r[4],10),
      text: r[5] || '',
      author: r[6] || '',
      createdAt: r[7] || '',
    })).filter(d=>d.id);

    const remoteQOTD = qotdRows.map(r=>({
      id: r[0],
      qid: r[1] || '',
      qtext: r[2] || '',
      date: r[3] || '',
      text: r[4] || '',
      author: r[5] || '',
      createdAt: r[6] || '',
    })).filter(q=>q.id);

    const remoteNotes = noteRows.map(r=>({
      id: r[0],
      from: r[1] || '',
      to: r[2] || '',
      text: r[3] || '',
      createdAt: r[4] || '',
      readAt: r[5] || '',
    })).filter(n=>n.id);

    const remoteIdeas = ideaRows.map(r=>({
      id: r[0],
      text: r[1] || '',
      emoji: r[2] || '🎲',
      addedBy: r[3] || '',
      createdAt: r[4] || '',
    })).filter(i=>i.id);

    state.stories = mergeStories(state.stories, remoteStories);
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month) || ((b.day||0) - (a.day||0)));
    state.photos = mergePhotos(state.photos, remotePhotos);
    state.capsules = mergeCapsules(state.capsules, remoteCapsules);
    state.buckets = mergeById(state.buckets, remoteBuckets);
    state.daily = mergeById(state.daily, remoteDaily);
    state.qotdAnswers = mergeById(state.qotdAnswers, remoteQOTD);
    state.notes = mergeById(state.notes, remoteNotes);
    state.ideas = mergeById(state.ideas, remoteIdeas);

    // Parse shared prefs (highlights, etc.)
    for (const r of (prefRows || [])){
      if (r[0] === 'highlights' && r[1]){
        try {
          const remoteHighlights = JSON.parse(r[1]);
          if (Array.isArray(remoteHighlights)) state.highlights = remoteHighlights;
        } catch(e){}
      }
    }

    saveLS(LS.STORIES, state.stories);
    saveLS(LS.PHOTOS, state.photos);
    saveLS(LS.CAPSULES, state.capsules);
    saveLS(LS.BUCKETS, state.buckets);
    saveLS(LS.DAILY, state.daily);
    saveLS(LS.QOTD, state.qotdAnswers);
    saveLS(LS.NOTES, state.notes);
    saveLS(LS.IDEAS, state.ideas);
    saveLS(LS.HIGHLIGHTS, state.highlights);
    renderAll();
    renderYearView();
    renderCapsules();
    refreshFilterOptions();
    checkOnThisDay();

    // Backfill missing thumbnail URLs in the background (legacy photos)
    backfillThumbnails();
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
  const map = new Map();
  [...remote, ...local].forEach(p=>{ if (!map.has(p.id)) map.set(p.id, p); });
  return [...map.values()];
}

function mergeCapsules(local, remote){
  const map = new Map();
  [...remote, ...local].forEach(c=>{ if (!map.has(c.id)) map.set(c.id, c); });
  return [...map.values()];
}

function mergeById(local, remote){
  const map = new Map();
  // Prefer items with newer timestamps if both have them
  [...local, ...remote].forEach(item => {
    const ex = map.get(item.id);
    if (!ex){
      map.set(item.id, item);
    } else {
      // Keep the one with later updatedAt or createdAt
      const exTime = new Date(ex.updatedAt || ex.createdAt || 0).getTime();
      const itemTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
      if (itemTime > exTime) map.set(item.id, item);
    }
  });
  return [...map.values()];
}


// ───────────────────────────────────────────────
// SYNC: push
// ───────────────────────────────────────────────
async function syncToSheet(){
  if (!state.google.accessToken) return;
  if (!state.google.sheetId) await ensureSheetExists();
  if (!state.google.sheetId) return;

  const storyValues = state.stories.map(s=>[
    s.id, s.year, s.month, (s.day != null ? s.day : ''),
    s.title || '', s.text || '', s.place || '',
    s.author || '', s.mood || '', s.voice_drive_id || '', s.updatedAt || '',
  ]);

  const photoValues = state.photos.map(p=>{
    // dataURL fallback can be HUGE (base64) — cap at 45000 chars to fit in 1 cell.
    // If too big, drop it (Drive ID is the real source anyway).
    let dataURL = p.dataURL || '';
    if (dataURL.length > 45000) dataURL = ''; // skip if won't fit
    return [p.id, p.story_id, p.drive_id || '', p.name || '', dataURL, p.thumbnail_url || ''];
  });

  await Promise.all([
    gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_STORIES}!A2:K`,
    }),
    gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_PHOTOS}!A2:F`,
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

  // Capsules sync separately
  await syncCapsulesToSheet();
  await syncBucketsToSheet();
  await syncDailyToSheet();
  await syncQOTDToSheet();
  await syncNotesToSheet();
  await syncIdeasToSheet();
  await syncPrefsToSheet();

  localStorage.setItem(LS.LAST_SYNC, new Date().toISOString());
  updateSettingsTimes();
}

async function syncCapsulesToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = state.capsules.map(c=>[
    c.id, c.title||'', c.text||'', c.author||'', c.createdAt||'', c.openAt||'',
  ]);
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_CAPSULES}!A2:F`,
  });
  if (values.length){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_CAPSULES}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}


// ───────────────────────────────────────────────
// AUTO-SYNC
// ───────────────────────────────────────────────
function startAutoSync(){
  stopAutoSync();
  state.syncTimer = setInterval(autoSyncTick, CONFIG.AUTO_SYNC_MS);
  setTimeout(autoSyncTick, 2000);
}

function stopAutoSync(){
  if (state.syncTimer){ clearInterval(state.syncTimer); state.syncTimer = null; }
  if (state.backupTimer){ clearInterval(state.backupTimer); state.backupTimer = null; }
}

async function autoSyncTick(){
  if (!state.google.accessToken) return;
  if (state.isTyping) return;
  if (state.isSyncing) return;
  state.isSyncing = true;
  setSyncIndicator('syncing', 'syncing…');
  try {
    await pullFromSheet();
    await syncToSheet();
    setSyncIndicator('connected', 'connected');
    dismissErrorToast(); // clear stale error toasts on successful recovery
  } catch(err){
    console.warn('auto-sync error', err);
    const status = err?.status || err?.result?.error?.code;
    if (status === 401 || status === 403){
      console.log('Auth error during sync, attempting silent refresh...');
      try {
        await silentRefreshToken();
        await pullFromSheet();
        await syncToSheet();
        setSyncIndicator('connected', 'connected');
        dismissErrorToast();
      } catch(refreshErr){
        console.warn('Silent refresh also failed', refreshErr);
        setSyncIndicator('error', 'sync failed');
      }
    } else {
      setSyncIndicator('error', 'sync failed');
    }
  } finally {
    state.isSyncing = false;
  }
}

async function manualSync(){
  if (!state.google.accessToken){ toast('ยังไม่ได้เชื่อมต่อ Google', 'error', 4000); return; }
  setSyncIndicator('syncing', 'syncing…');
  try {
    await pullFromSheet();
    await syncToSheet();
    setSyncIndicator('connected', 'connected');
    dismissErrorToast();
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

  // Use Blob (works on more iOS versions than File constructor)
  const fileName = file.name || `upload_${Date.now()}`;
  const fileType = file.type || 'application/octet-stream';
  const blob = file instanceof Blob ? file : new Blob([file], { type: fileType });

  const metadata = {
    name: `${Date.now()}_${fileName}`,
    parents: [CONFIG.DRIVE_FOLDER_ID],
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], {type:'application/json'}));
  form.append('file', blob, fileName);

  // Upload file (request thumbnailLink + webContentLink in response)
  let res;
  try {
    res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,thumbnailLink,webContentLink', {
      method:'POST',
      headers:{ Authorization: `Bearer ${state.google.accessToken}` },
      body: form,
    });
  } catch(networkErr){
    throw new Error('Network error: ' + (networkErr.message || 'fetch failed'));
  }

  if (!res.ok){
    let errText = '';
    try { errText = await res.text(); } catch {}
    throw new Error(`Drive upload failed (${res.status}): ${errText.slice(0, 100)}`);
  }
  const data = await res.json();

  // Make file public so thumbnailLink works without auth
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
      method:'POST',
      headers:{ Authorization: `Bearer ${state.google.accessToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ role:'reader', type:'anyone' }),
    });
  } catch(permErr){ console.warn('Permission set failed:', permErr); }

  // Re-fetch metadata after permission change to get the public thumbnailLink
  let thumbnailUrl = data.thumbnailLink || '';
  try {
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}?fields=thumbnailLink,webContentLink`, {
      headers: { Authorization: `Bearer ${state.google.accessToken}` },
    });
    if (metaRes.ok){
      const meta = await metaRes.json();
      if (meta.thumbnailLink) thumbnailUrl = meta.thumbnailLink;
    }
  } catch(e){ console.warn('Could not refetch metadata:', e); }

  return { id: data.id, thumbnail_url: thumbnailUrl };
}

async function fetchDriveThumbnail(driveId){
  // Helper to fetch thumbnail URL for an existing Drive file (used for migration)
  if (!state.google.accessToken) return '';
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=thumbnailLink`, {
      headers: { Authorization: `Bearer ${state.google.accessToken}` },
    });
    if (res.ok){
      const data = await res.json();
      return data.thumbnailLink || '';
    }
  } catch(e){ console.warn('thumbnail fetch failed:', e); }
  return '';
}

async function backfillThumbnails(){
  // Find photos with drive_id but no thumbnail_url and fetch them
  if (!state.google.accessToken) return;
  const need = state.photos.filter(p => p.drive_id && !p.thumbnail_url);
  if (need.length === 0) return;

  console.log(`Backfilling ${need.length} thumbnail URLs...`);
  let updated = 0;
  for (const photo of need){
    const url = await fetchDriveThumbnail(photo.drive_id);
    if (url){
      photo.thumbnail_url = url;
      updated++;
    }
  }
  if (updated > 0){
    saveLS(LS.PHOTOS, state.photos);
    renderAll();
    // Push back to Sheet so it persists
    if (state.google.accessToken){
      try { await syncToSheet(); } catch(e){ console.warn('backfill sync failed', e); }
    }
    console.log(`Backfilled ${updated} thumbnails`);
  }
}


// ═══════════════════════════════════════════════════════════════
// DAILY BACKUP
// ═══════════════════════════════════════════════════════════════
function startBackupTimer(){
  state.backupTimer = setInterval(maybeWriteBackup, CONFIG.BACKUP_CHECK_MS);
  setTimeout(maybeWriteBackup, 8000);
}

async function maybeWriteBackup(){
  if (!state.google.accessToken) return;
  const today = todayStr();
  const lastDay = localStorage.getItem(LS.BACKUP_DAY);
  if (lastDay === today) return;
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
    // Don't include base64 fallback in backups — they're huge and Drive ID is enough
    const slimPhotos = state.photos.map(p => ({
      ...p,
      dataURL: null, // Drop base64 — saves 100s of KB per photo
    }));
    const snapshot = {
      stories: state.stories,
      photos: slimPhotos,
      capsules: state.capsules,
      buckets: state.buckets,
      daily: state.daily,
      qotdAnswers: state.qotdAnswers,
      notes: state.notes,
      ideas: state.ideas,
      highlights: state.highlights,
    };
    const snapStr = JSON.stringify(snapshot);

    // Sheets limit: 50,000 chars/cell. Use 45,000 to be safe, split across columns D-Z.
    const CHUNK = 45000;
    const chunks = [];
    for (let i = 0; i < snapStr.length; i += CHUNK){
      chunks.push(snapStr.slice(i, i + CHUNK));
    }
    if (chunks.length > 23){
      // 23 = Z - D + 1, the columns we have to spare
      throw new Error(`Backup too large (${snapStr.length} chars) — ${chunks.length} chunks > 23 max`);
    }

    const newRow = [today, ts, String(state.stories.length), ...chunks];

    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:Z`,
    });
    let backups = res.result.values || [];
    backups = backups.filter(r => r[0] !== today);
    backups.unshift(newRow);
    backups = backups.slice(0, CONFIG.MAX_BACKUPS);

    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:Z`,
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
    if (showToast) toast(`Backup สำเร็จ (${(snapStr.length/1024).toFixed(0)}KB · ${chunks.length} chunks)`, 'success');
  } catch(err){
    console.error('backup error', err);
    if (showToast) toast('Backup ไม่สำเร็จ: ' + (err.message||'unknown'), 'error', 5000);
  }
}

async function loadBackupList(){
  if (!state.google.accessToken){ toast('ต้องเชื่อมต่อ Google ก่อน', 'error'); return; }
  if (!state.google.sheetId) await ensureSheetExists();
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:Z`,
    });
    const backups = res.result.values || [];
    const sel = $('#backupSelect');
    sel.innerHTML = '';
    if (backups.length === 0){
      sel.innerHTML = '<option value="">— ยังไม่มี backup —</option>';
      toast('ยังไม่มี backup ในระบบ', '', 3000);
      return;
    }
    sel.innerHTML = '<option value="">— เลือกวันที่ —</option>' + backups.map((r,i)=>{
      const niceDate = new Date(r[1]).toLocaleString('th-TH', {dateStyle:'medium', timeStyle:'short'});
      return `<option value="${i}">${r[0]} · ${r[2]} stories · ${niceDate}</option>`;
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
    // Concat columns D-Z (index 3 onwards) — backup may be split into multiple cells
    const jsonStr = row.slice(3).join('');
    const snap = JSON.parse(jsonStr);
    state.stories = snap.stories || [];
    state.photos = snap.photos || [];
    state.capsules = snap.capsules || [];
    state.buckets = snap.buckets || [];
    state.daily = snap.daily || [];
    state.qotdAnswers = snap.qotdAnswers || [];
    state.notes = snap.notes || [];
    state.ideas = snap.ideas || [];
    state.highlights = snap.highlights || [];
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
    saveLS(LS.STORIES, state.stories);
    saveLS(LS.PHOTOS, state.photos);
    saveLS(LS.CAPSULES, state.capsules);
    saveLS(LS.BUCKETS, state.buckets);
    saveLS(LS.DAILY, state.daily);
    saveLS(LS.QOTD, state.qotdAnswers);
    saveLS(LS.NOTES, state.notes);
    saveLS(LS.IDEAS, state.ideas);
    saveLS(LS.HIGHLIGHTS, state.highlights);
    renderAll();
    renderYearView();
    renderCapsules();
    if (state.google.accessToken) await syncToSheet();
    toast('กู้คืนสำเร็จ ✓', 'success');
  } catch(err){
    console.error(err);
    toast('กู้คืนไม่สำเร็จ — backup เสียหาย?', 'error');
  }
}


// ───────────────────────────────────────────────
// EXPORT / IMPORT
// ───────────────────────────────────────────────
function exportData(){
  const payload = {
    stories: state.stories,
    photos: state.photos,
    capsules: state.capsules,
    buckets: state.buckets,
    daily: state.daily,
    qotdAnswers: state.qotdAnswers,
    notes: state.notes,
    ideas: state.ideas,
    highlights: state.highlights,
    exportedAt: new Date().toISOString()
  };
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
      let stories, photos, capsules;
      if (Array.isArray(data)){ stories = data; photos = []; capsules = []; }
      else {
        stories = data.stories || [];
        photos = data.photos || [];
        capsules = data.capsules || [];
      }
      state.stories = mergeStories(state.stories, stories);
      state.photos = mergePhotos(state.photos, photos);
      state.capsules = mergeCapsules(state.capsules, capsules);
      state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
      saveLS(LS.STORIES, state.stories);
      saveLS(LS.PHOTOS, state.photos);
      saveLS(LS.CAPSULES, state.capsules);
      renderAll();
      renderYearView();
      renderCapsules();
      toast('นำเข้าสำเร็จ', 'success');
      if (state.google.accessToken) syncToSheet();
    } catch(err){ toast('ไฟล์ไม่ถูกต้อง', 'error'); }
  };
  r.readAsText(f);
  e.target.value = '';
}


// ═══════════════════════════════════════════════════════════════
// PRINT AS BOOK (PDF)
// ═══════════════════════════════════════════════════════════════
function initPrint(){
  const scope = $('#printScope');
  const yearWrap = $('#printYearWrap');
  const yearChecks = $('#printYearChecks');

  scope.addEventListener('change', ()=>{
    if (scope.value === 'custom'){
      yearWrap.classList.remove('hidden');
      const years = [...new Set(state.stories.map(s=>s.year))].sort((a,b)=>b-a);
      yearChecks.innerHTML = years.map(y=>`<button type="button" class="check-pill" data-year="${y}">${y}</button>`).join('');
      $$('#printYearChecks .check-pill').forEach(p=>{
        p.addEventListener('click', ()=>p.classList.toggle('active'));
      });
    } else {
      yearWrap.classList.add('hidden');
    }
  });

  $('#printBookBtn').addEventListener('click', generateBook);
}

function generateBook(){
  if (state.stories.length === 0){
    toast('ยังไม่มีเรื่องราวเลย', 'error');
    return;
  }
  const scope = $('#printScope').value;
  let books = [];

  if (scope === 'all'){
    books.push({ title: 'Our Story · ' + CONFIG.ANNIV_YEAR + '–' + new Date().getFullYear(), stories: [...state.stories] });
  } else if (scope === 'year'){
    const years = [...new Set(state.stories.map(s=>s.year))].sort((a,b)=>a-b);
    books = years.map(y => ({ title: 'Our Story · ' + y, stories: state.stories.filter(s=>s.year===y) }));
  } else { // custom
    const selectedYears = $$('#printYearChecks .check-pill.active').map(p=>parseInt(p.dataset.year,10));
    if (selectedYears.length === 0){ toast('เลือกปีก่อน', 'error'); return; }
    selectedYears.sort((a,b)=>a-b);
    books.push({
      title: 'Our Story · ' + selectedYears.join(', '),
      stories: state.stories.filter(s => selectedYears.includes(s.year))
    });
  }

  // Generate combined book(s) — open in new window for print
  let combined = books.map(b => buildBookHTML(b)).join('<div style="page-break-after:always"></div>');

  // iOS PWA blocks window.open — use blob URL approach instead
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS && isStandalone){
    // Fall back: download as HTML file user can open externally
    const blob = new Blob([combined], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OurStory_${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('ดาวน์โหลดไฟล์แล้ว — เปิดใน Safari แล้วใช้ Print', 'success', 6000);
    return;
  }

  const w = window.open('', '_blank');
  if (!w){
    // popup blocked — fallback to download
    const blob = new Blob([combined], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OurStory_${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Popup ถูก block — ดาวน์โหลดไฟล์แทน', '', 4000);
    return;
  }
  w.document.write(combined);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 800);
  toast('เปิดหน้าต่างปริ้นแล้ว ✓', 'success');
}

function buildBookHTML(book){
  const monthsTH = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const monthsShort = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const stories = [...book.stories].sort((a,b)=> (a.year - b.year) || (a.month - b.month));

  // Compute period and stats
  const years = [...new Set(stories.map(s=>s.year))].sort();
  const yearRange = years.length === 1 ? `${years[0]}` : `${years[0]} — ${years[years.length-1]}`;
  const totalPhotos = stories.reduce((sum, s) => sum + getStoryPhotos(s.id).length, 0);

  // Pick a hero photo for cover (first story with photos, or null)
  let heroPhotoSrc = null;
  for (const s of stories){
    const ps = getStoryPhotos(s.id);
    if (ps[0]){
      heroPhotoSrc = getPhotoSrc(ps[0]);
      break;
    }
  }

  const css = `
    <style>
      @page { size: A4; margin: 0; }
      @page :first { margin: 0; }
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: 'Sarabun', 'Cormorant Garamond', serif; color: #1a1a1a; line-height: 1.7; }

      /* ═══════ COVER PAGE ═══════ */
      .cover-page {
        position: relative;
        width: 210mm; height: 297mm;
        background:
          radial-gradient(ellipse at 30% 25%, rgba(201,169,97,.18) 0%, transparent 55%),
          radial-gradient(ellipse at 75% 80%, rgba(212,165,165,.10) 0%, transparent 50%),
          linear-gradient(165deg, #122a5e 0%, #0a1f44 50%, #061330 100%);
        color: #f7f4ec;
        page-break-after: always;
        overflow: hidden;
      }
      .cover-page::before {
        content: '';
        position: absolute;
        inset: 12mm;
        border: 1px solid rgba(232,216,176,.35);
        pointer-events: none;
      }
      .cover-page::after {
        content: '';
        position: absolute;
        inset: 13.5mm;
        border: 1px solid rgba(201,169,97,.18);
        pointer-events: none;
      }
      .cover-corner {
        position: absolute;
        width: 28mm; height: 28mm;
        background-image:
          linear-gradient(to right, #c9a961 50%, transparent 50%),
          linear-gradient(to bottom, #c9a961 50%, transparent 50%);
        background-size: 12mm 1px, 1px 12mm;
        background-repeat: no-repeat;
      }
      .cover-corner.tl { top: 18mm; left: 18mm; background-position: 0 0, 0 0; }
      .cover-corner.tr { top: 18mm; right: 18mm; transform: scaleX(-1); }
      .cover-corner.bl { bottom: 18mm; left: 18mm; transform: scaleY(-1); }
      .cover-corner.br { bottom: 18mm; right: 18mm; transform: scale(-1, -1); }

      .cover-inner {
        position: relative;
        z-index: 2;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 44mm 24mm;
        text-align: center;
      }

      .cover-top { display: flex; flex-direction: column; align-items: center; }
      .cover-eyebrow {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        letter-spacing: .55em;
        text-transform: uppercase;
        font-size: 11pt;
        color: #d9bd7c;
        margin: 0 0 16mm;
      }
      .cover-monogram {
        font-family: 'Italiana', serif;
        font-size: 64pt;
        letter-spacing: .35em;
        text-indent: .35em;
        color: #c9a961;
        line-height: 1;
        margin: 0;
        text-shadow: 0 4px 18px rgba(201,169,97,.3);
      }
      .cover-divider {
        width: 56mm;
        margin: 8mm auto 8mm;
        position: relative;
        text-align: center;
        font-family: 'Cormorant Garamond', serif;
        color: #c9a961;
        font-size: 18pt;
      }
      .cover-divider::before, .cover-divider::after {
        content: '';
        position: absolute;
        top: 50%;
        width: 22mm;
        height: 1px;
        background: linear-gradient(to right, transparent, #c9a961);
      }
      .cover-divider::before { left: 0; }
      .cover-divider::after { right: 0; background: linear-gradient(to left, transparent, #c9a961); }

      .cover-couple {
        font-family: 'Italiana', serif;
        font-size: 56pt;
        font-weight: 400;
        line-height: 1;
        margin: 0 0 4mm;
        letter-spacing: .04em;
      }
      .cover-couple .amp {
        color: #c9a961;
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        margin: 0 .15em;
      }

      .cover-middle {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8mm;
      }
      .cover-title {
        font-family: 'Italiana', serif;
        font-size: 28pt;
        font-weight: 400;
        margin: 0;
        letter-spacing: .03em;
        color: #f7f4ec;
      }
      .cover-period {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 16pt;
        color: #d9bd7c;
        margin: 0;
        letter-spacing: .15em;
      }

      .cover-stats {
        display: flex;
        gap: 14mm;
        margin: 4mm 0 0;
      }
      .cover-stat {
        text-align: center;
        font-family: 'Cormorant Garamond', serif;
      }
      .cover-stat-num {
        display: block;
        font-family: 'Italiana', serif;
        font-size: 26pt;
        color: #c9a961;
        line-height: 1;
      }
      .cover-stat-label {
        display: block;
        font-size: 8pt;
        letter-spacing: .35em;
        text-transform: uppercase;
        color: rgba(247,244,236,.55);
        margin-top: 3mm;
      }

      .cover-bottom { display: flex; flex-direction: column; align-items: center; gap: 4mm; }
      .cover-since {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 11pt;
        letter-spacing: .3em;
        text-transform: uppercase;
        color: rgba(247,244,236,.7);
        margin: 0;
      }
      .cover-anniv-date {
        font-family: 'Italiana', serif;
        font-size: 22pt;
        color: #c9a961;
        letter-spacing: .12em;
        margin: 0;
      }
      .cover-credit {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 10pt;
        color: rgba(247,244,236,.45);
        margin: 6mm 0 0;
        letter-spacing: .2em;
      }

      /* ═══════ TITLE PAGE (inside cover) ═══════ */
      .title-page {
        position: relative;
        width: 210mm; height: 297mm;
        background: #faf6ec;
        page-break-after: always;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40mm 30mm;
        text-align: center;
      }
      .title-page::before {
        content: '';
        position: absolute;
        inset: 14mm;
        border: 1px solid rgba(10,31,68,.12);
      }
      .title-mark {
        font-family: 'Italiana', serif;
        font-size: 36pt;
        letter-spacing: .35em;
        text-indent: .35em;
        color: #c9a961;
        margin: 0 0 10mm;
      }
      .title-page h1 {
        font-family: 'Italiana', serif;
        font-size: 48pt;
        font-weight: 400;
        margin: 0 0 6mm;
        letter-spacing: .03em;
        color: #0a1f44;
      }
      .title-period {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 16pt;
        color: #c9a961;
        letter-spacing: .2em;
        margin: 0 0 14mm;
      }
      .title-tagline {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 13pt;
        color: #5a6a8a;
        max-width: 100mm;
        line-height: 1.9;
        margin: 0 auto;
      }
      .title-mini-divider {
        width: 30mm;
        height: 1px;
        background: #c9a961;
        margin: 10mm auto;
        opacity: .5;
      }
      .title-bottom {
        position: absolute;
        bottom: 22mm;
        left: 0; right: 0;
        text-align: center;
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        color: #8896b3;
        font-size: 10pt;
        letter-spacing: .3em;
      }

      /* ═══════ INDEX / TOC ═══════ */
      .index-page {
        padding: 28mm 24mm;
        page-break-after: always;
      }
      .index-head {
        text-align: center;
        margin-bottom: 12mm;
      }
      .index-head h2 {
        font-family: 'Italiana', serif;
        font-weight: 400;
        font-size: 28pt;
        color: #0a1f44;
        margin: 0;
        letter-spacing: .15em;
      }
      .index-head .sub {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 11pt;
        color: #c9a961;
        letter-spacing: .25em;
        text-transform: uppercase;
      }
      .index-divider {
        width: 28mm;
        height: 1px;
        background: #c9a961;
        margin: 4mm auto 10mm;
        opacity: .5;
      }
      .toc-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .toc-item {
        display: flex;
        align-items: baseline;
        font-family: 'Cormorant Garamond', serif;
        font-size: 13pt;
        margin-bottom: 5mm;
        color: #1a2645;
      }
      .toc-num {
        display: inline-block;
        min-width: 16mm;
        font-family: 'Italiana', serif;
        font-size: 11pt;
        color: #c9a961;
        letter-spacing: .15em;
      }
      .toc-title {
        flex: 1;
        font-style: italic;
      }
      .toc-dots {
        flex: 0 0 auto;
        margin: 0 4mm;
        border-bottom: 1px dotted #c9a961;
        flex: 1;
        height: 1px;
        align-self: flex-end;
        margin-bottom: 4pt;
        opacity: .5;
      }
      .toc-date {
        color: #6f7d99;
        letter-spacing: .1em;
        font-size: 11pt;
      }

      /* ═══════ STORY PAGES ═══════ */
      .story-pages {
        padding: 22mm 22mm 26mm;
      }
      .story {
        page-break-inside: avoid;
        padding: 8mm 0 14mm;
        border-bottom: 1px solid rgba(10,31,68,.08);
      }
      .story:last-child { border-bottom: none; }
      .story-meta {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 10pt;
        letter-spacing: .35em;
        text-transform: uppercase;
        color: #c9a961;
        margin-bottom: 2mm;
      }
      .story h2 {
        font-family: 'Italiana', serif;
        font-weight: 400;
        font-size: 24pt;
        margin: 1mm 0 4mm;
        color: #0a1f44;
        letter-spacing: .02em;
      }
      .story-place {
        font-size: 10pt;
        color: #888;
        font-style: italic;
        margin-bottom: 4mm;
        font-family: 'Cormorant Garamond', serif;
        letter-spacing: .1em;
      }
      .story-text {
        font-family: 'Cormorant Garamond', serif;
        font-size: 13pt;
        white-space: pre-wrap;
        margin-bottom: 6mm;
        color: #2a3a5a;
        line-height: 1.85;
      }
      .story-photos {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4mm;
        margin-top: 4mm;
      }
      .story-photos img {
        width: 100%;
        aspect-ratio: 4/3;
        object-fit: cover;
        border-radius: 1mm;
        border: 1px solid rgba(10,31,68,.08);
      }
      .story-mood {
        display: inline-block;
        padding: 1mm 4mm;
        background: #f7f4ec;
        border: 1px solid rgba(201,169,97,.3);
        border-radius: 999px;
        font-size: 10pt;
        color: #8a7647;
        margin-left: 3mm;
        font-family: 'Cormorant Garamond', serif;
        letter-spacing: .08em;
        font-style: italic;
        vertical-align: middle;
      }

      /* ═══════ BACK PAGE ═══════ */
      .back-page {
        position: relative;
        width: 210mm; height: 297mm;
        background: linear-gradient(165deg, #122a5e 0%, #0a1f44 100%);
        color: #f7f4ec;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40mm 30mm;
        text-align: center;
      }
      .back-page::before {
        content: '';
        position: absolute;
        inset: 12mm;
        border: 1px solid rgba(232,216,176,.3);
      }
      .back-mark {
        font-family: 'Italiana', serif;
        font-size: 28pt;
        letter-spacing: .35em;
        color: #c9a961;
        margin: 0 0 8mm;
      }
      .back-quote {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 16pt;
        color: rgba(247,244,236,.85);
        max-width: 110mm;
        line-height: 1.9;
        margin: 0 0 12mm;
      }
      .back-credit {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-size: 11pt;
        color: rgba(247,244,236,.5);
        letter-spacing: .25em;
        margin: 0;
      }
    </style>
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(book.title)}</title>${css}</head><body>`;

  // ───── COVER PAGE ─────
  html += `
    <div class="cover-page">
      <div class="cover-corner tl"></div>
      <div class="cover-corner tr"></div>
      <div class="cover-corner bl"></div>
      <div class="cover-corner br"></div>

      <div class="cover-inner">
        <div class="cover-top">
          <p class="cover-eyebrow">our private diary</p>
          <h1 class="cover-monogram">S · R</h1>
          <div class="cover-divider">❦</div>
          <h2 class="cover-couple">Safe<span class="amp">&amp;</span>Ruang</h2>
        </div>

        <div class="cover-middle">
          <p class="cover-title">Our Story</p>
          <p class="cover-period">${escapeHtml(yearRange)}</p>
          <div class="cover-stats">
            <div class="cover-stat">
              <span class="cover-stat-num">${stories.length}</span>
              <span class="cover-stat-label">stories</span>
            </div>
            <div class="cover-stat">
              <span class="cover-stat-num">${totalPhotos}</span>
              <span class="cover-stat-label">photos</span>
            </div>
            <div class="cover-stat">
              <span class="cover-stat-num">${years.length}</span>
              <span class="cover-stat-label">${years.length === 1 ? 'year' : 'years'}</span>
            </div>
          </div>
        </div>

        <div class="cover-bottom">
          <p class="cover-since">— since —</p>
          <p class="cover-anniv-date">08 · 01 · 2021</p>
          <p class="cover-credit">a love letter, bound</p>
        </div>
      </div>
    </div>
  `;

  // ───── TITLE PAGE ─────
  html += `
    <div class="title-page">
      <div class="title-mark">S · R</div>
      <h1>Our Story</h1>
      <p class="title-period">${escapeHtml(yearRange)}</p>
      <div class="title-mini-divider"></div>
      <p class="title-tagline">
        "ทุกเดือนที่ผ่านไป<br/>
        คือเรื่องเล่าที่ไม่อยากให้หาย<br/>
        จึงเก็บไว้ในเล่มนี้ — ให้เธอ"
      </p>
      <div class="title-bottom">made with ♥ · printed ${new Date().toLocaleDateString('th-TH', {year:'numeric', month:'long'})}</div>
    </div>
  `;

  // ───── INDEX / TOC ─────
  if (stories.length > 0){
    html += `
      <div class="index-page">
        <div class="index-head">
          <p class="sub">— contents —</p>
          <h2>สารบัญ</h2>
          <div class="index-divider"></div>
        </div>
        <ul class="toc-list">
          ${stories.map((s, i)=>`
            <li class="toc-item">
              <span class="toc-num">${String(i+1).padStart(2,'0')}</span>
              <span class="toc-title">${escapeHtml(s.title)}</span>
              <span class="toc-dots"></span>
              <span class="toc-date">${monthsShort[s.month]} ${s.year}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // ───── STORY PAGES ─────
  html += `<div class="story-pages">`;
  for (const s of stories){
    const photos = getStoryPhotos(s.id);
    const moodTxt = s.mood ? ` <span class="story-mood">${MOOD_EMOJI[s.mood]||''} ${s.mood}</span>` : '';
    html += `
      <div class="story">
        <div class="story-meta">${monthsTH[s.month]} · ${s.year} · by ${escapeHtml(s.author||'')}</div>
        <h2>${escapeHtml(s.title)}${moodTxt}</h2>
        ${s.place ? `<div class="story-place">— ${escapeHtml(s.place)} —</div>` : ''}
        <div class="story-text">${escapeHtml(s.text||'')}</div>
        ${photos.length > 0 ? `<div class="story-photos">${photos.slice(0,4).map(p=>{
          const src = getPhotoSrc(p);
          return src ? `<img src="${src}" />` : '';
        }).join('')}</div>` : ''}
      </div>
    `;
  }
  html += `</div>`;

  // ───── BACK PAGE ─────
  html += `
    <div class="back-page">
      <div class="back-mark">S · R</div>
      <p class="back-quote">
        "นับเดือนได้<br/>
        แต่ความรู้สึกที่มีให้กัน<br/>
        นับไม่ได้หรอก"
      </p>
      <p class="back-credit">— end of volume —</p>
    </div>
  `;

  html += '</body></html>';
  return html;
}


// ═══════════════════════════════════════════════════════════════
// ANNIVERSARY SURPRISE + SEASONAL EFFECTS
// ═══════════════════════════════════════════════════════════════
function checkAnniversary(){
  const today = new Date();
  if (today.getDate() !== CONFIG.ANNIV_DAY) return;
  const key = `${today.getFullYear()}-${today.getMonth()+1}`;
  const seen = JSON.parse(localStorage.getItem(LS.SEEN_ANNIV) || '[]');
  if (seen.includes(key)) return;
  const months = monthsSinceStart(today);
  if (months < 1) return;
  showAnniversary(months, today);
  seen.push(key);
  localStorage.setItem(LS.SEEN_ANNIV, JSON.stringify(seen));
}

function showAnniversary(monthCount, today){
  $('#annivMonths').textContent = monthCount;
  $('#annivDate').textContent = today.toLocaleDateString('en-US', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
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
  $('#annivClose').onclick = ()=>{ $('#anniversary').classList.add('hidden'); stopConfetti(); };
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
      x: Math.random()*cv.width, y: -20 - Math.random()*cv.height,
      r: 4 + Math.random()*8, vx: -2 + Math.random()*4, vy: 2 + Math.random()*4,
      rot: Math.random()*Math.PI*2, vr: -.1 + Math.random()*.2,
      color: colors[(Math.random()*colors.length)|0],
      shape: shapes[(Math.random()*shapes.length)|0],
    });
  }
  function tick(){
    ctx.clearRect(0,0,cv.width,cv.height);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > cv.height + 30){ p.y = -20; p.x = Math.random()*cv.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape==='circle'){ ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
      else if (p.shape==='rect'){ ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r); }
      else { ctx.beginPath(); const s=p.r/4;
        ctx.moveTo(0,s); ctx.bezierCurveTo(s*2,-s*1.5,s*5,s*1.5,0,s*5);
        ctx.bezierCurveTo(-s*5,s*1.5,-s*2,-s*1.5,0,s); ctx.fill(); }
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

// Seasonal effects: based on month
function startSeasonalEffects(){
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const layer = $('#seasonalLayer');

  let config = null;
  // February — Valentine month: subtle hearts
  if (month === 2 && day >= 10 && day <= 16){
    config = { emojis: ['💗','💖','💝'], colors:['#ff6b9d','#ffa9c5','#ff85a8'], rate: 4500 };
    document.body.setAttribute('data-month-theme','valentine');
  }
  // December: snowflakes
  if (month === 12){
    config = { emojis: ['❄','❅','❆'], colors:['#fff','#e8f4ff','#cce6ff'], rate: 3000 };
    document.body.setAttribute('data-month-theme','winter');
  }
  // April: cherry blossom
  if (month === 4){
    config = { emojis: ['🌸','🌺'], colors:['#ffc0d8','#ff9fc0'], rate: 5000 };
    document.body.setAttribute('data-month-theme','spring');
  }
  // October: autumn leaves
  if (month === 10 || month === 11){
    config = { emojis: ['🍂','🍁'], colors:['#d97047','#c54f1a','#e0a060'], rate: 5000 };
    document.body.setAttribute('data-month-theme','autumn');
  }

  if (!config) return;

  const spawn = ()=>{
    const s = document.createElement('span');
    s.className = 's';
    s.textContent = config.emojis[(Math.random()*config.emojis.length)|0];
    s.style.left = (Math.random()*100) + 'vw';
    s.style.fontSize = (12 + Math.random()*14) + 'px';
    s.style.color = config.colors[(Math.random()*config.colors.length)|0];
    s.style.opacity = (0.3 + Math.random()*0.4).toFixed(2);
    s.style.setProperty('--drift', (Math.random()*200-100) + 'px');
    s.style.setProperty('--dur', (8 + Math.random()*6) + 's');
    layer.appendChild(s);
    setTimeout(()=>s.remove(), 16000);
  };
  for (let i=0;i<5;i++) setTimeout(spawn, i*800);
  setInterval(spawn, config.rate);
}


// ═══════════════════════════════════════════════════════════════
// MEMORY MAP
// ═══════════════════════════════════════════════════════════════
let _memoryMap = null;
let _mapMarkers = [];
const _geoCache = {};

async function geocodePlace(place){
  if (!place) return null;
  const cached = _geoCache[place];
  if (cached) return cached;
  // Try sessionStorage cache
  try {
    const stored = JSON.parse(sessionStorage.getItem('sr_geo') || '{}');
    if (stored[place]){
      _geoCache[place] = stored[place];
      return stored[place];
    }
  } catch {}

  try {
    // Use Nominatim (free, OpenStreetMap)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&accept-language=th`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
    _geoCache[place] = result;
    try {
      const stored = JSON.parse(sessionStorage.getItem('sr_geo') || '{}');
      stored[place] = result;
      sessionStorage.setItem('sr_geo', JSON.stringify(stored));
    } catch {}
    return result;
  } catch(e){
    console.warn('Geocoding failed for', place, e);
    return null;
  }
}

async function renderMemoryMap(){
  const wrap = $('#memoryMap');
  const empty = $('#mapEmpty');
  if (!wrap) return;

  const placedStories = state.stories.filter(s => s.place && s.place.trim());
  if (placedStories.length === 0){
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  empty.classList.add('hidden');

  if (typeof L === 'undefined'){
    wrap.innerHTML = '<p style="padding:40px;text-align:center" class="muted">กำลังโหลดแผนที่...</p>';
    setTimeout(renderMemoryMap, 800);
    return;
  }

  // Init map once (default Thailand center)
  if (!_memoryMap){
    _memoryMap = L.map(wrap, { scrollWheelZoom: true, attributionControl: true }).setView([13.736, 100.523], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(_memoryMap);
  }

  // Clear old markers
  _mapMarkers.forEach(m => _memoryMap.removeLayer(m));
  _mapMarkers = [];

  toast('กำลังปักหมุด...', '', 2000);

  const monthsTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const bounds = [];
  for (const story of placedStories){
    const geo = await geocodePlace(story.place);
    if (!geo) continue;
    const moodEm = story.mood ? MOOD_EMOJI[story.mood] || '' : '';
    const dateLabel = story.day ? `${story.day} ${monthsTH[story.month]} ${story.year}` : `${monthsTH[story.month]} ${story.year}`;
    const popup = `
      <div>
        <h5>${escapeHtml(story.title)} ${moodEm}</h5>
        <small>${escapeHtml(story.place)} · ${dateLabel}</small>
        <p>${escapeHtml((story.text||'').slice(0, 80))}${story.text && story.text.length > 80 ? '...' : ''}</p>
        <a class="popup-link" data-story-id="${story.id}">เปิดอ่าน →</a>
      </div>`;
    const marker = L.marker([geo.lat, geo.lon]).addTo(_memoryMap).bindPopup(popup);
    marker.on('popupopen', e => {
      const link = e.popup.getElement().querySelector('.popup-link');
      if (link) link.addEventListener('click', () => openStory(story.id));
    });
    _mapMarkers.push(marker);
    bounds.push([geo.lat, geo.lon]);
  }

  if (bounds.length > 0){
    _memoryMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }

  // Refresh map size in case container was hidden when initialized
  setTimeout(() => _memoryMap?.invalidateSize(), 200);
}


// ═══════════════════════════════════════════════════════════════
// STATS DASHBOARD
// ═══════════════════════════════════════════════════════════════
function renderStats(){
  const wrap = $('#statsContent');
  if (!wrap) return;

  const start = new Date(CONFIG.ANNIV_YEAR, CONFIG.ANNIV_MONTH-1, CONFIG.ANNIV_DAY);
  const now = new Date();
  const totalDays = Math.floor((now - start) / 86400000);
  const totalMonths = monthsSinceStart();
  const totalStories = state.stories.length;
  const storiesByAuthor = state.stories.reduce((acc, s) => {
    acc[s.author||'?'] = (acc[s.author||'?']||0)+1; return acc;
  }, {});
  const totalPhotos = state.photos.length;
  const totalVoice = state.stories.filter(s => s.voice_drive_id).length;

  // Mood breakdown
  const moodCount = {};
  state.stories.forEach(s => {
    if (s.mood) moodCount[s.mood] = (moodCount[s.mood]||0)+1;
  });
  const totalMooded = Object.values(moodCount).reduce((a,b)=>a+b,0) || 1;
  const moodLabels = {
    happy:'มีความสุข', love:'หวานชื่น', sad:'เหงาๆ',
    excited:'ตื่นเต้น', peaceful:'สงบ', bittersweet:'เศร้าแต่สวย'
  };
  const moodOrder = Object.keys(moodCount).sort((a,b) => moodCount[b]-moodCount[a]);
  const topMood = moodOrder[0];

  // Top places
  const placeCount = {};
  state.stories.forEach(s => {
    const p = (s.place||'').trim();
    if (p) placeCount[p] = (placeCount[p]||0)+1;
  });
  const topPlaces = Object.entries(placeCount).sort((a,b) => b[1]-a[1]).slice(0, 5);

  // Best month (most stories with photos)
  const monthScore = {};
  state.stories.forEach(s => {
    const photos = getStoryPhotos(s.id).length;
    const key = `${s.year}-${String(s.month).padStart(2,'0')}`;
    monthScore[key] = (monthScore[key]||0) + 1 + photos*0.5 + (s.voice_drive_id?2:0);
  });
  const sweetestMonth = Object.entries(monthScore).sort((a,b)=>b[1]-a[1])[0];
  const monthsTH = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  let sweetestLabel = '—';
  if (sweetestMonth){
    const [y, m] = sweetestMonth[0].split('-');
    sweetestLabel = `${monthsTH[parseInt(m,10)]} ${y}`;
  }

  // Bucket stats
  const totalBuckets = state.buckets.length;
  const doneBuckets = state.buckets.filter(b => b.done).length;

  wrap.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card hero">
        <div class="stat-num">${totalDays.toLocaleString()}</div>
        <div class="stat-label">DAYS TOGETHER</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${totalMonths}</div><div class="stat-label">MONTHIVERSARIES</div></div>
      <div class="stat-card"><div class="stat-num">${totalStories}</div><div class="stat-label">STORIES</div></div>
      <div class="stat-card"><div class="stat-num">${totalPhotos}</div><div class="stat-label">PHOTOS</div></div>
      <div class="stat-card"><div class="stat-num">${totalVoice}</div><div class="stat-label">VOICE NOTES</div></div>
      <div class="stat-card"><div class="stat-num">${storiesByAuthor['Safe']||0}</div><div class="stat-label">BY SAFE</div></div>
      <div class="stat-card"><div class="stat-num">${storiesByAuthor['Ruang']||0}</div><div class="stat-label">BY RUANG</div></div>
    </div>

    <div class="stat-block">
      <h4>💖 Sweetest Month</h4>
      <p class="muted" style="font-family:var(--display);font-size:24px;margin:0;color:var(--gold)">${sweetestLabel}</p>
    </div>

    ${moodOrder.length > 0 ? `
      <div class="stat-block">
        <h4>😊 Mood Breakdown</h4>
        <div class="mood-bar-list">
          ${moodOrder.map(m => {
            const pct = (moodCount[m]/totalMooded*100).toFixed(0);
            return `
              <div class="mood-row">
                <span class="mood-emoji">${MOOD_EMOJI[m]||''}</span>
                <span class="mood-name">${moodLabels[m]||m}</span>
                <div class="mood-bar-track"><div class="mood-bar-fill" style="width:${pct}%"></div></div>
                <span class="mood-count">${moodCount[m]}</span>
              </div>`;
          }).join('')}
        </div>
        ${topMood ? `<p class="muted small" style="margin-top:12px">เดือนหวานที่สุดของเราคือ <b>${moodLabels[topMood]} ${MOOD_EMOJI[topMood]}</b></p>` : ''}
      </div>
    ` : ''}

    ${topPlaces.length > 0 ? `
      <div class="stat-block">
        <h4>📍 Top Places</h4>
        <div class="place-list">
          ${topPlaces.map(([p, c]) => `
            <div class="place-row">
              <span class="place-name">${escapeHtml(p)}</span>
              <span class="place-count">${c}</span>
            </div>`).join('')}
        </div>
      </div>
    ` : ''}

    ${totalBuckets > 0 ? `
      <div class="stat-block">
        <h4>🎯 Bucket List Progress</h4>
        <div class="mood-row">
          <span class="mood-name">${doneBuckets} / ${totalBuckets}</span>
          <div class="mood-bar-track"><div class="mood-bar-fill" style="width:${(doneBuckets/totalBuckets*100).toFixed(0)}%"></div></div>
          <span class="mood-count">${(doneBuckets/totalBuckets*100).toFixed(0)}%</span>
        </div>
      </div>
    ` : ''}

    ${(()=>{const streak = computeLoveStreak(); return streak > 0 ? `
      <div class="stat-block">
        <h4>❤️ Love Streak</h4>
        <div class="streak-display">
          <div class="streak-num"><span class="streak-fire">🔥</span>${streak}</div>
          <div class="streak-label">${streak === 1 ? 'MONTH' : 'CONSECUTIVE MONTHS'}</div>
        </div>
        <p class="muted small" style="margin-top:10px;text-align:center">${streak >= 12 ? '🏆 1 ปีเต็มไม่พลาด!' : streak >= 6 ? '✨ ครึ่งปีเต็ม' : 'เก็บเรื่องราวต่อไปนะ'}</p>
      </div>
    ` : '';})()}

    ${(()=>{const awards = computeAwards(); return awards.length > 0 ? `
      <div class="stat-block">
        <h4>🏆 Memory Awards</h4>
        <div class="awards-grid">
          ${awards.map(a => `
            <div class="award-card">
              <div class="award-icon">${a.icon}</div>
              <div class="award-title">${a.title}</div>
              <div class="award-value">${escapeHtml(a.value)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';})()}
  `;
}


// ═══════════════════════════════════════════════════════════════
// BUCKET LIST
// ═══════════════════════════════════════════════════════════════
function initBucket(){
  const form = $('#bucketForm');
  if (!form) return;
  form.addEventListener('submit', onAddBucket);
  $$('.bucket-filter').forEach(b => {
    b.addEventListener('click', () => {
      $$('.bucket-filter').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.bucketFilter = b.dataset.filter;
      renderBucketList();
    });
  });
}

const BUCKET_CAT_EMOJI = {
  travel: '✈️', food: '🍜', experience: '✨', goal: '🏆', other: '💭'
};

async function onAddBucket(e){
  e.preventDefault();
  const title = $('#bucketTitle').value.trim();
  const cat = $('#bucketCategory').value;
  if (!title){ toast('ใส่สิ่งที่อยากทำก่อน', 'error'); return; }

  const item = {
    id: uid('bk'),
    title, category: cat,
    done: false,
    createdBy: state.user,
    createdAt: new Date().toISOString(),
    doneAt: '',
  };
  state.buckets.push(item);
  saveLS(LS.BUCKETS, state.buckets);
  $('#bucketTitle').value = '';
  renderBucketList();
  if (state.google.accessToken){
    try { await syncBucketsToSheet(); } catch(e){ console.error(e); }
  }
  toast('เพิ่มแล้ว ♥', 'success');
}

function renderBucketList(){
  const wrap = $('#bucketList');
  if (!wrap) return;
  let items = [...state.buckets];
  if (state.bucketFilter === 'pending') items = items.filter(b => !b.done);
  if (state.bucketFilter === 'done') items = items.filter(b => b.done);

  // Sort: pending first, then by createdAt desc
  items.sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (items.length === 0){
    wrap.innerHTML = '<p class="muted small" style="text-align:center;padding:24px">— ยังไม่มี —</p>';
    return;
  }

  wrap.innerHTML = items.map(b => `
    <div class="bucket-item ${b.done ? 'done' : ''}" data-id="${b.id}">
      <div class="bucket-checkbox ${b.done ? 'checked' : ''}" data-toggle="${b.id}"></div>
      <span class="bucket-cat">${BUCKET_CAT_EMOJI[b.category] || '💭'}</span>
      <span class="bucket-text">${escapeHtml(b.title)}</span>
      <span class="bucket-by">by ${escapeHtml(b.createdBy||'—')}</span>
      <button class="bucket-delete" data-delete="${b.id}">✕</button>
    </div>
  `).join('');

  $$('.bucket-checkbox[data-toggle]').forEach(el => {
    el.addEventListener('click', () => toggleBucket(el.dataset.toggle));
  });
  $$('.bucket-delete[data-delete]').forEach(el => {
    el.addEventListener('click', () => deleteBucket(el.dataset.delete));
  });
}

async function toggleBucket(id){
  const item = state.buckets.find(b => b.id === id);
  if (!item) return;
  item.done = !item.done;
  item.doneAt = item.done ? new Date().toISOString() : '';
  saveLS(LS.BUCKETS, state.buckets);
  renderBucketList();
  if (state.google.accessToken){
    try { await syncBucketsToSheet(); } catch(e){}
  }
  if (item.done) toast('🎉 ทำสำเร็จแล้ว!', 'success');
}

async function deleteBucket(id){
  if (!confirm('ลบสิ่งนี้?')) return;
  state.buckets = state.buckets.filter(b => b.id !== id);
  saveLS(LS.BUCKETS, state.buckets);
  renderBucketList();
  if (state.google.accessToken){
    try { await syncBucketsToSheet(); } catch(e){}
  }
}

async function syncBucketsToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = state.buckets.map(b => [
    b.id, b.title||'', b.category||'', b.done?'1':'0',
    b.createdBy||'', b.createdAt||'', b.doneAt||'',
  ]);
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_BUCKETS}!A2:G`,
  });
  if (values.length){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BUCKETS}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// DAILY ONE-LINE JOURNAL
// ═══════════════════════════════════════════════════════════════
function initDaily(){
  const form = $('#dailyForm');
  if (!form) return;
  form.addEventListener('submit', onAddDaily);
  // Show today's date
  const today = new Date();
  const monthsTH = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  $('#dailyDate').textContent = `วันนี้: ${today.getDate()} ${monthsTH[today.getMonth()+1]} ${today.getFullYear()}`;
}

async function onAddDaily(e){
  e.preventDefault();
  const text = $('#dailyText').value.trim();
  if (!text){ toast('เขียนอะไรสักหน่อย', 'error'); return; }

  const today = new Date();
  const dateStr = todayStr(today);
  const item = {
    id: uid('dly'),
    date: dateStr,
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
    text,
    author: state.user,
    createdAt: today.toISOString(),
  };
  state.daily.push(item);
  saveLS(LS.DAILY, state.daily);
  $('#dailyText').value = '';
  renderDaily();
  if (state.google.accessToken){
    try { await syncDailyToSheet(); } catch(e){ console.error(e); }
  }
  toast('บันทึกแล้ว ♥', 'success');
}

function renderDaily(){
  const wrap = $('#dailyList');
  const archive = $('#dailyArchive');
  if (!wrap) return;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  const sorted = [...state.daily].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const thisMonth = sorted.filter(d => d.year === curY && d.month === curM);
  const past = sorted.filter(d => !(d.year === curY && d.month === curM));

  const monthsTH = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  if (thisMonth.length === 0){
    wrap.innerHTML = '<p class="muted small" style="text-align:center;padding:18px">— เริ่มเขียนบรรทัดแรกของเดือนนี้กันเถอะ —</p>';
  } else {
    wrap.innerHTML = thisMonth.map(d => `
      <div class="daily-row">
        <div class="daily-day">${d.day}<em>${monthsTH[d.month].slice(0,3)}</em></div>
        <div class="daily-text-content">
          <p>${escapeHtml(d.text)}</p>
          <span class="daily-by">by ${escapeHtml(d.author||'—')}</span>
        </div>
      </div>
    `).join('');
  }

  // Group past by year-month
  if (archive){
    if (past.length === 0){
      archive.innerHTML = '<p class="muted small" style="padding:8px">— ไม่มีเดือนเก่า —</p>';
    } else {
      const byMonth = {};
      past.forEach(d => {
        const key = `${d.year}-${String(d.month).padStart(2,'0')}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(d);
      });
      const keys = Object.keys(byMonth).sort().reverse();
      archive.innerHTML = keys.map(k => {
        const [y, m] = k.split('-');
        const items = byMonth[k];
        return `
          <div class="daily-month-block">
            <h5>${monthsTH[parseInt(m,10)]} ${y}</h5>
            ${items.map(d => `
              <div class="daily-row">
                <div class="daily-day">${d.day}<em>${monthsTH[d.month].slice(0,3)}</em></div>
                <div class="daily-text-content">
                  <p>${escapeHtml(d.text)}</p>
                  <span class="daily-by">by ${escapeHtml(d.author||'—')}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }).join('');
    }
  }
}

async function syncDailyToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = state.daily.map(d => [
    d.id, d.date, d.year, d.month, d.day, d.text||'', d.author||'', d.createdAt||'',
  ]);
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_DAILY}!A2:H`,
  });
  if (values.length){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_DAILY}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// QUESTION OF THE DAY
// ═══════════════════════════════════════════════════════════════
const QOTD_BANK = [
  'สิ่งที่ทำให้คุณรักเค้ามากที่สุดคืออะไร?',
  'ถ้ามีอำนาจวิเศษ 1 ข้อในความสัมพันธ์ จะใช้ทำอะไร?',
  'นิสัยของอีกฝ่ายที่คุณรักที่สุดคืออะไร?',
  'ความทรงจำเดทแรกที่จำได้ดีที่สุดคืออะไร?',
  'ถ้าวันนี้เป็นวันสุดท้าย คุณอยากบอกเค้าว่าอะไร?',
  'คุณอยากแก่ตัวลงด้วยกันยังไง?',
  'สิ่งที่คุณ "ขอบคุณ" เค้าที่สุดคืออะไร?',
  '5 ปีข้างหน้า คุณอยากเห็นเรา 2 คนเป็นยังไง?',
  'อะไรในความสัมพันธ์นี้ที่ทำให้คุณรู้สึกปลอดภัยที่สุด?',
  'มีเรื่องอะไรที่อยากทำกับเค้าก่อนตาย?',
  'นิยามคำว่า "บ้าน" สำหรับคุณคืออะไร?',
  'สิ่งที่เค้าเปลี่ยนคุณไปในทางที่ดี?',
  'ถ้าเขียนหนังสือเรื่องเรา จะตั้งชื่ออะไร?',
  'เพลงที่คุณนึกถึงเค้าทุกครั้งที่ได้ฟัง?',
  'อาหารที่ทำให้นึกถึงช่วงเวลาดี ๆ ที่อยู่ด้วยกัน?',
  'สิ่งที่เค้าทำให้ คุณยังไม่เคยขอบคุณ?',
  'ถ้าได้กลับไปเลือกเดทแรกใหม่ จะเลือกที่ไหน?',
  'นิสัยเล็ก ๆ ของเค้าที่ขำมากแต่รัก?',
  'อะไรในตัวเองที่อยากพัฒนาเพื่อความสัมพันธ์?',
  'ความฝันร่วมกันที่ยังไม่ได้บอกใคร?',
  'วันที่หวานที่สุดในชีวิตคู่ที่ผ่านมา?',
  'สิ่งที่อยากให้เค้าทำให้บ่อยขึ้น?',
  'ถ้าจะเขียนจดหมายรักให้ตัวเองในอดีต จะเขียนอะไร?',
  'ช่วงเวลาที่รู้สึกว่า "นี่แหละ คนนี้แหละ"?',
  'สิ่งที่อยากให้คนรุ่นหลังจำเกี่ยวกับเรา?',
];

function getTodayQuestion(){
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  const idx = (dayOfYear + today.getFullYear()) % QOTD_BANK.length;
  return { id: `q_${todayStr(today)}`, date: todayStr(today), text: QOTD_BANK[idx] };
}

function renderQOTD(){
  const todayQ = getTodayQuestion();
  const wrap = $('#qotdToday');
  const history = $('#qotdHistory');
  if (!wrap) return;

  const myAnswer = state.qotdAnswers.find(a => a.qid === todayQ.id && a.author === state.user);
  const partnerAnswer = state.qotdAnswers.find(a => a.qid === todayQ.id && a.author !== state.user);

  const otherUser = state.user === 'Safe' ? 'Ruang' : 'Safe';

  if (myAnswer){
    // Already answered — show both (or partner pending)
    wrap.innerHTML = `
      <div class="qotd-eyebrow">— TODAY · ${todayQ.date} —</div>
      <div class="qotd-question">${escapeHtml(todayQ.text)}</div>
      <div class="qotd-answers">
        <div class="qotd-answer-row">
          <div class="author">${state.user} (คุณ)</div>
          <p>${escapeHtml(myAnswer.text)}</p>
        </div>
        ${partnerAnswer ? `
          <div class="qotd-answer-row">
            <div class="author">${escapeHtml(partnerAnswer.author)}</div>
            <p>${escapeHtml(partnerAnswer.text)}</p>
          </div>
        ` : `
          <div class="qotd-answer-row locked">
            <div class="author">${otherUser}</div>
            <p>— ยังไม่ได้ตอบ —</p>
          </div>
        `}
      </div>
    `;
  } else {
    // Not answered yet
    wrap.innerHTML = `
      <div class="qotd-eyebrow">— TODAY · ${todayQ.date} —</div>
      <div class="qotd-question">${escapeHtml(todayQ.text)}</div>
      <div class="qotd-answer-box">
        <label>คำตอบของคุณ</label>
        <textarea id="qotdInput" rows="3" placeholder="เขียนคำตอบ..."></textarea>
        <button type="button" class="qotd-submit" id="qotdSubmit">💾 บันทึกคำตอบ</button>
      </div>
    `;
    $('#qotdSubmit').addEventListener('click', () => submitQOTDAnswer(todayQ));
  }

  // History — past questions both answered
  const allQids = [...new Set(state.qotdAnswers.map(a => a.qid))].filter(qid => qid !== todayQ.id);
  if (history){
    if (allQids.length === 0){
      history.innerHTML = '<p class="muted small" style="text-align:center;padding:14px">— ยังไม่มีคำถามเก่า —</p>';
    } else {
      // Sort by qid (which contains date)
      allQids.sort().reverse();
      history.innerHTML = allQids.map(qid => {
        const answers = state.qotdAnswers.filter(a => a.qid === qid);
        const dateStr = qid.replace('q_', '');
        const qText = answers[0]?.qtext || '?';
        const bothAnswered = answers.length >= 2;
        return `
          <div class="qotd-history-item" data-qid="${qid}">
            <p class="q">${escapeHtml(qText)}</p>
            <div class="meta">
              <span>${dateStr}</span>
              <span>${bothAnswered ? '✓ ทั้งคู่ตอบแล้ว' : `เห็นแค่ ${answers.length}/2`}</span>
            </div>
          </div>
        `;
      }).join('');
      $$('.qotd-history-item').forEach(el => {
        el.addEventListener('click', () => openQOTDHistory(el.dataset.qid));
      });
    }
  }
}

async function submitQOTDAnswer(q){
  const text = $('#qotdInput').value.trim();
  if (!text){ toast('เขียนคำตอบก่อน', 'error'); return; }

  const answer = {
    id: uid('qa'),
    qid: q.id,
    qtext: q.text,
    date: q.date,
    text,
    author: state.user,
    createdAt: new Date().toISOString(),
  };
  state.qotdAnswers.push(answer);
  saveLS(LS.QOTD, state.qotdAnswers);
  renderQOTD();
  if (state.google.accessToken){
    try { await syncQOTDToSheet(); } catch(e){ console.error(e); }
  }
  toast('บันทึกแล้ว ♥', 'success');
}

function openQOTDHistory(qid){
  const answers = state.qotdAnswers.filter(a => a.qid === qid);
  if (answers.length === 0) return;
  const qText = answers[0].qtext || '?';
  const dateStr = qid.replace('q_', '');

  $('#modalContent').innerHTML = `
    <div class="mc-body">
      <p class="mc-eyebrow">${dateStr}</p>
      <h2 class="mc-title">${escapeHtml(qText)}</h2>
      <div style="margin-top:24px;display:flex;flex-direction:column;gap:14px">
        ${answers.map(a => `
          <div style="background:var(--bg-input);border-radius:12px;padding:14px 16px;border-left:3px solid var(--gold)">
            <div style="font-family:var(--serif);font-style:italic;letter-spacing:.2em;text-transform:uppercase;font-size:11px;color:var(--gold);margin-bottom:6px">${escapeHtml(a.author)}</div>
            <p style="margin:0;font-size:15px;line-height:1.7;color:var(--text-main)">${escapeHtml(a.text)}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  $('#storyModal').classList.remove('hidden');
}

async function syncQOTDToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = state.qotdAnswers.map(a => [
    a.id, a.qid, a.qtext||'', a.date, a.text||'', a.author||'', a.createdAt||'',
  ]);
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_QOTD}!A2:G`,
  });
  if (values.length){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_QOTD}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// YEAR-END RECAP
// ═══════════════════════════════════════════════════════════════
function initRecap(){
  const sel = $('#recapYear');
  if (!sel) return;
  populateRecapYears();
  $('#playRecapBtn').addEventListener('click', playRecap);
  $('#recapClose').addEventListener('click', closeRecap);
}

function populateRecapYears(){
  const sel = $('#recapYear');
  if (!sel) return;
  const years = [...new Set(state.stories.map(s=>s.year))].sort((a,b)=>b-a);
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('') || '<option value="">— ยังไม่มีข้อมูล —</option>';
}

async function playRecap(){
  const year = parseInt($('#recapYear').value, 10);
  if (!year){ toast('เลือกปีก่อน', 'error'); return; }

  const yearStories = state.stories.filter(s => s.year === year);
  if (yearStories.length === 0){ toast('ไม่มี story ของปีนี้', 'error'); return; }

  // Sort by month/day
  yearStories.sort((a,b)=>(a.month - b.month) || ((a.day||0) - (b.day||0)));

  // Build slides
  const slides = [];
  // Intro slide
  slides.push({
    type: 'intro',
    eyebrow: '— our year in review —',
    title: `${year}`,
    text: `${yearStories.length} stories ที่เก็บไว้ด้วยกัน`,
    image: null,
  });

  // For each story, add a slide with first photo
  for (const s of yearStories){
    const photos = getStoryPhotos(s.id);
    let imageUrl = null;
    if (photos[0]){
      if (photos[0].drive_id){
        imageUrl = await fetchImageBlobUrl(photos[0].drive_id) || getPhotoSrc(photos[0]);
      } else {
        imageUrl = getPhotoSrc(photos[0]);
      }
    }
    const monthsTH = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    slides.push({
      type: 'story',
      eyebrow: `${monthsTH[s.month]} ${year}${s.day ? ` · ${s.day}` : ''}`,
      title: s.title,
      text: (s.text||'').slice(0, 140) + (s.text && s.text.length > 140 ? '...' : ''),
      image: imageUrl,
    });
  }

  // Outro slide
  slides.push({
    type: 'outro',
    eyebrow: '— forever and always —',
    title: 'Safe & Ruang',
    text: 'ขอบคุณที่ผ่านมาด้วยกัน ♥',
    image: null,
  });

  state.recap.slides = slides;
  state.recap.idx = 0;

  $('#recapModal').classList.remove('hidden');

  // Start music if enabled
  const music = $('#bgMusic');
  if (music && music.paused){
    music.play().catch(()=>{});
  }

  showRecapSlide(0);

  // Auto-advance every 4 seconds
  if (state.recap.interval) clearInterval(state.recap.interval);
  state.recap.interval = setInterval(()=>{
    state.recap.idx++;
    if (state.recap.idx >= slides.length){
      closeRecap();
    } else {
      showRecapSlide(state.recap.idx);
    }
  }, 4500);
}

function showRecapSlide(idx){
  const slide = state.recap.slides[idx];
  if (!slide) return;
  const img = $('#recapImg');
  const eyebrow = $('#recapEyebrow');
  const title = $('#recapTitle');
  const text = $('#recapText');

  // Fade out, swap, fade in
  const wrap = $('#recapSlide');
  wrap.classList.remove('active');
  setTimeout(()=>{
    if (slide.image){
      img.src = slide.image;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
    eyebrow.textContent = slide.eyebrow;
    title.textContent = slide.title;
    text.textContent = slide.text;
    wrap.classList.add('active');
  }, 300);
}

function closeRecap(){
  if (state.recap.interval){ clearInterval(state.recap.interval); state.recap.interval = null; }
  $('#recapModal').classList.add('hidden');
}


// ═══════════════════════════════════════════════════════════════
// LOVE NOTES
// ═══════════════════════════════════════════════════════════════
function initNotes(){
  const form = $('#noteForm');
  if (!form) return;
  form.addEventListener('submit', onSendNote);
  $$('.notes-filter').forEach(b => {
    b.addEventListener('click', () => {
      $$('.notes-filter').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.notesView = b.dataset.view;
      renderNotes();
    });
  });
}

async function onSendNote(e){
  e.preventDefault();
  const text = $('#noteText').value.trim();
  if (!text){ toast('เขียนข้อความก่อน', 'error'); return; }

  const recipient = state.user === 'Safe' ? 'Ruang' : 'Safe';
  const note = {
    id: uid('nt'),
    from: state.user,
    to: recipient,
    text,
    createdAt: new Date().toISOString(),
    readAt: '',
  };
  state.notes.push(note);
  saveLS(LS.NOTES, state.notes);
  $('#noteText').value = '';
  renderNotes();
  if (state.google.accessToken){
    try { await syncNotesToSheet(); } catch(e){ console.error(e); }
  }
  toast('💌 ส่งแล้ว', 'success');
}

function renderNotes(){
  const wrap = $('#notesList');
  const recipientEl = $('#noteRecipient');
  const badge = $('#inboxBadge');
  if (!wrap) return;

  if (recipientEl) recipientEl.textContent = state.user === 'Safe' ? 'Ruang' : 'Safe';

  // Inbox count badge
  const unreadCount = state.notes.filter(n => n.to === state.user && !n.readAt).length;
  if (badge){
    if (unreadCount > 0){
      badge.textContent = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  let items = [...state.notes];
  if (state.notesView === 'inbox'){
    items = items.filter(n => n.to === state.user);
  } else {
    items = items.filter(n => n.from === state.user);
  }
  items.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (items.length === 0){
    wrap.innerHTML = `<p class="muted small" style="text-align:center;padding:24px">— ${state.notesView === 'inbox' ? 'ยังไม่มีข้อความใหม่' : 'ยังไม่ได้ส่งข้อความ'} —</p>`;
    return;
  }

  wrap.innerHTML = items.map(n => `
    <div class="note-item ${state.notesView === 'inbox' && !n.readAt ? 'unread' : ''}" data-id="${n.id}">
      <div class="note-from">${state.notesView === 'inbox' ? `จาก ${escapeHtml(n.from)}` : `ถึง ${escapeHtml(n.to)}`}</div>
      <p class="note-text">${escapeHtml(n.text)}</p>
      <div class="note-time">${formatRelativeTime(n.createdAt)}</div>
      <button class="note-delete" data-del="${n.id}">✕</button>
    </div>
  `).join('');

  $$('.note-delete[data-del]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      deleteNote(el.dataset.del);
    });
  });

  // Mark all visible inbox notes as read after a moment
  if (state.notesView === 'inbox' && unreadCount > 0){
    setTimeout(() => markInboxRead(), 1500);
  }
}

async function markInboxRead(){
  let changed = false;
  state.notes.forEach(n => {
    if (n.to === state.user && !n.readAt){
      n.readAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed){
    saveLS(LS.NOTES, state.notes);
    renderNotes();
    if (state.google.accessToken){
      try { await syncNotesToSheet(); } catch(e){}
    }
  }
}

async function deleteNote(id){
  if (!confirm('ลบข้อความนี้?')) return;
  state.notes = state.notes.filter(n => n.id !== id);
  saveLS(LS.NOTES, state.notes);
  renderNotes();
  if (state.google.accessToken){
    try { await syncNotesToSheet(); } catch(e){}
  }
}

function formatRelativeTime(iso){
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = (now - t) / 1000;
  if (diff < 60) return 'เมื่อกี้นี้';
  if (diff < 3600) return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชม.ที่แล้ว`;
  if (diff < 604800) return `${Math.floor(diff/86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH');
}

async function syncNotesToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = state.notes.map(n => [
    n.id, n.from||'', n.to||'', n.text||'', n.createdAt||'', n.readAt||'',
  ]);
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_NOTES}!A2:F`,
  });
  if (values.length){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_NOTES}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// DATE IDEAS
// ═══════════════════════════════════════════════════════════════
const DEFAULT_IDEAS = [
  { text: 'ทำอาหารเย็นด้วยกัน', emoji: '🍽️' },
  { text: 'ดูพระอาทิตย์ตกที่ริมทะเล', emoji: '💐' },
  { text: 'ดูหนังเก่าที่เคยดูครั้งแรก', emoji: '🎬' },
  { text: 'เดินตลาดนัดกลางคืน', emoji: '🍽️' },
  { text: 'ขี่จักรยานในสวน', emoji: '🎨' },
  { text: 'ทำพิซซ่ากินเองที่บ้าน', emoji: '🏠' },
];

function initIdeas(){
  // Seed default ideas if empty
  if (state.ideas.length === 0){
    state.ideas = DEFAULT_IDEAS.map(i => ({
      id: uid('id'),
      text: i.text,
      emoji: i.emoji,
      addedBy: 'system',
      createdAt: new Date().toISOString(),
    }));
    saveLS(LS.IDEAS, state.ideas);
  }
  const form = $('#ideaForm');
  if (!form) return;
  form.addEventListener('submit', onAddIdea);
  $('#rollIdeaBtn').addEventListener('click', rollIdea);
}

async function onAddIdea(e){
  e.preventDefault();
  const text = $('#ideaInput').value.trim();
  const emoji = $('#ideaCat').value;
  if (!text){ toast('ใส่ไอเดียก่อน', 'error'); return; }

  const idea = {
    id: uid('id'),
    text, emoji,
    addedBy: state.user,
    createdAt: new Date().toISOString(),
  };
  state.ideas.push(idea);
  saveLS(LS.IDEAS, state.ideas);
  $('#ideaInput').value = '';
  renderIdeas();
  if (state.google.accessToken){
    try { await syncIdeasToSheet(); } catch(e){}
  }
  toast('เพิ่มแล้ว ♥', 'success');
}

function renderIdeas(){
  const wrap = $('#ideaList');
  if (!wrap) return;

  if (state.ideas.length === 0){
    wrap.innerHTML = '<p class="muted small" style="text-align:center;padding:14px">— ยังไม่มีไอเดีย —</p>';
    return;
  }

  const sorted = [...state.ideas].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  wrap.innerHTML = sorted.map(i => `
    <div class="idea-row" data-id="${i.id}">
      <span class="iemoji">${i.emoji || '🎲'}</span>
      <span class="itext">${escapeHtml(i.text)}</span>
      <span class="iby">by ${escapeHtml(i.addedBy === 'system' ? '✨' : i.addedBy)}</span>
      <button class="idea-del" data-del="${i.id}">✕</button>
    </div>
  `).join('');

  $$('.idea-del[data-del]').forEach(el => {
    el.addEventListener('click', () => deleteIdea(el.dataset.del));
  });
}

function rollIdea(){
  if (state.ideas.length === 0){
    toast('ยังไม่มีไอเดีย — เพิ่มสักหน่อยก่อน', 'error');
    return;
  }
  const pick = state.ideas[Math.floor(Math.random() * state.ideas.length)];
  const emojiEl = $('#ideaEmoji');
  const textEl = $('#ideaText');
  const metaEl = $('#ideaMeta');

  emojiEl.classList.remove('spinning');
  void emojiEl.offsetWidth; // restart animation
  emojiEl.classList.add('spinning');

  emojiEl.textContent = pick.emoji || '🎲';
  textEl.textContent = pick.text;
  metaEl.textContent = `— ${pick.addedBy === 'system' ? '✨ default' : `by ${pick.addedBy}`} —`;
}

async function deleteIdea(id){
  if (!confirm('ลบไอเดียนี้?')) return;
  state.ideas = state.ideas.filter(i => i.id !== id);
  saveLS(LS.IDEAS, state.ideas);
  renderIdeas();
  if (state.google.accessToken){
    try { await syncIdeasToSheet(); } catch(e){}
  }
}

async function syncIdeasToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = state.ideas.map(i => [
    i.id, i.text||'', i.emoji||'', i.addedBy||'', i.createdAt||'',
  ]);
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_IDEAS}!A2:E`,
  });
  if (values.length){
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_IDEAS}!A2`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// HIGHLIGHTS / FEATURED STORIES
// ═══════════════════════════════════════════════════════════════
function isHighlight(storyId){
  return state.highlights.includes(storyId);
}

async function toggleHighlight(storyId){
  const idx = state.highlights.indexOf(storyId);
  if (idx >= 0){
    state.highlights.splice(idx, 1);
    toast('ลบจาก Highlights', '', 1500);
  } else {
    state.highlights.unshift(storyId);
    toast('⭐ เพิ่มเข้า Highlights', 'success', 1500);
  }
  saveLS(LS.HIGHLIGHTS, state.highlights);
  renderHighlights();
  renderAll();
  if (state.google.accessToken){
    try { await syncPrefsToSheet(); } catch(e){ console.warn(e); }
  }
}

async function syncPrefsToSheet(){
  if (!state.google.accessToken || !state.google.sheetId) return;
  const values = [
    ['highlights', JSON.stringify(state.highlights)],
  ];
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_PREFS}!A2:B`,
  });
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: state.google.sheetId,
    range: `${CONFIG.TAB_PREFS}!A2`,
    valueInputOption: 'RAW',
    resource: { values },
  });
}

function renderHighlights(){
  const section = $('#highlightsSection');
  const row = $('#highlightsRow');
  if (!section || !row) return;

  const hStories = state.highlights
    .map(id => state.stories.find(s => s.id === id))
    .filter(Boolean);

  if (hStories.length === 0){
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const monthsTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  row.innerHTML = hStories.map(s => {
    const photos = getStoryPhotos(s.id);
    const cover = photos[0] ? getPhotoSrc(photos[0]) : null;
    const driveAttr = (photos[0] && photos[0].drive_id) ? ` data-drive-id="${photos[0].drive_id}"` : '';
    const dateLabel = `${monthsTH[s.month]} ${s.year}`;
    return `
      <div class="highlight-card" data-id="${s.id}">
        ${cover ? `<img src="${cover}" alt=""${driveAttr}/>` : '<div style="width:100%;height:100%;background:var(--navy-mid)"></div>'}
        <div class="highlight-overlay">
          <h5>${escapeHtml(s.title)}</h5>
          <div class="h-meta">${dateLabel}${s.place ? ` · ${escapeHtml(s.place)}` : ''}</div>
        </div>
        <div class="highlight-star">⭐</div>
      </div>
    `;
  }).join('');

  $$('.highlight-card').forEach(c => {
    c.addEventListener('click', () => openStory(c.dataset.id));
  });

  hydrateImages(row);
}


// ═══════════════════════════════════════════════════════════════
// MEMORY ROULETTE
// ═══════════════════════════════════════════════════════════════
function initRoulette(){
  const btn = $('#rouletteBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (state.stories.length === 0){
      toast('ยังไม่มี story เลย', 'error');
      return;
    }
    btn.classList.remove('spinning');
    void btn.offsetWidth;
    btn.classList.add('spinning');
    setTimeout(() => {
      const random = state.stories[Math.floor(Math.random() * state.stories.length)];
      openStory(random.id);
    }, 600);
  });
}


// ═══════════════════════════════════════════════════════════════
// PHOTO WALL
// ═══════════════════════════════════════════════════════════════
function initPhotoWall(){
  const buttons = $$('.view-btn[data-view]');
  buttons.forEach(b => {
    b.addEventListener('click', () => {
      buttons.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.mapView = b.dataset.view;
      const map = $('#memoryMap');
      const wall = $('#photoWall');
      if (state.mapView === 'wall'){
        map.classList.add('hidden');
        wall.classList.remove('hidden');
        renderPhotoWall();
      } else {
        map.classList.remove('hidden');
        wall.classList.add('hidden');
        if (_memoryMap) setTimeout(() => _memoryMap.invalidateSize(), 200);
      }
    });
  });
}

function renderPhotoWall(){
  const wall = $('#photoWall');
  if (!wall) return;

  // Get all photos sorted by story date desc
  const photoEntries = [];
  for (const s of state.stories){
    const ps = getStoryPhotos(s.id);
    ps.forEach(p => {
      photoEntries.push({ photo: p, story: s });
    });
  }
  photoEntries.sort((a,b) =>
    (b.story.year - a.story.year) ||
    (b.story.month - a.story.month) ||
    ((b.story.day||0) - (a.story.day||0))
  );

  if (photoEntries.length === 0){
    wall.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:40px">— ยังไม่มีรูปภาพ —</p>';
    return;
  }

  wall.innerHTML = photoEntries.map(({photo, story}) => {
    const src = getPhotoSrc(photo);
    const dAttr = photo.drive_id ? ` data-drive-id="${photo.drive_id}"` : '';
    return `
      <div class="wall-photo" data-story-id="${story.id}" title="${escapeHtml(story.title)}">
        ${src ? `<img src="${src}" alt=""${dAttr} loading="lazy"/>` : ''}
      </div>
    `;
  }).join('');

  $$('.wall-photo[data-story-id]').forEach(el => {
    el.addEventListener('click', () => openStory(el.dataset.storyId));
  });

  // Hydrate images
  hydrateImages(wall);
  // Mark loaded for fade-in
  wall.querySelectorAll('img').forEach(img => {
    if (img.complete) img.classList.add('loaded');
    else img.addEventListener('load', () => img.classList.add('loaded'));
  });
}


// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function initNotifications(){
  const btn = $('#enableNotifBtn');
  const status = $('#notifStatus');
  if (!btn) return;

  function updateStatus(){
    if (!('Notification' in window)){
      status.textContent = 'เครื่องนี้ไม่รองรับ';
      btn.disabled = true;
      return;
    }
    if (Notification.permission === 'granted'){
      status.textContent = '✓ เปิดอยู่';
      btn.textContent = '🔕 ปิดการแจ้งเตือน';
    } else if (Notification.permission === 'denied'){
      status.textContent = '⛔ ถูก block — แก้ใน Browser Settings';
      btn.disabled = true;
    } else {
      status.textContent = '— ยังไม่ได้เปิด';
    }
  }

  btn.addEventListener('click', async () => {
    if (Notification.permission === 'granted'){
      // No native way to revoke from JS — just remind
      toast('ปิดได้ที่ Browser Settings', '', 3000);
      return;
    }
    const result = await Notification.requestPermission();
    updateStatus();
    if (result === 'granted'){
      new Notification('Safe ♥ Ruang', {
        body: 'การแจ้งเตือนเปิดเรียบร้อย — จะเตือนทุกวันที่ 8 ของเดือน',
        icon: 'icon-192.png',
      });
      checkMonthiversaryNotif();
    }
  });

  updateStatus();
  checkMonthiversaryNotif();
}

function checkMonthiversaryNotif(){
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const today = new Date();
  if (today.getDate() !== CONFIG.ANNIV_DAY) return;

  const todayKey = todayStr(today);
  const lastShown = localStorage.getItem(LS.NOTIF_LAST);
  if (lastShown === todayKey) return;

  const months = monthsSinceStart();
  new Notification('💕 Happy Monthiversary!', {
    body: `${months} เดือนแล้วนะ เก็บความทรงจำเดือนนี้กันเถอะ ♥`,
    icon: 'icon-192.png',
  });
  localStorage.setItem(LS.NOTIF_LAST, todayKey);
}


// ═══════════════════════════════════════════════════════════════
// AWARDS & STREAK (extends Stats)
// ═══════════════════════════════════════════════════════════════
function computeLoveStreak(){
  if (state.stories.length === 0) return 0;
  // Get sorted unique year-month combos with stories
  const monthSet = new Set(state.stories.map(s => `${s.year}-${String(s.month).padStart(2,'0')}`));
  const months = [...monthSet].sort().reverse();
  if (months.length === 0) return 0;

  // Count consecutive months back from latest
  let streak = 1;
  for (let i = 0; i < months.length - 1; i++){
    const [y1, m1] = months[i].split('-').map(Number);
    const [y2, m2] = months[i+1].split('-').map(Number);
    // Previous month?
    const expectedY = m1 === 1 ? y1 - 1 : y1;
    const expectedM = m1 === 1 ? 12 : m1 - 1;
    if (y2 === expectedY && m2 === expectedM) streak++;
    else break;
  }
  return streak;
}

function computeAwards(){
  const awards = [];

  // 💖 Sweetest Month
  const monthScore = {};
  state.stories.forEach(s => {
    const photos = getStoryPhotos(s.id).length;
    const key = `${s.year}-${String(s.month).padStart(2,'0')}`;
    monthScore[key] = (monthScore[key]||0) + 1 + photos*0.5 + (s.voice_drive_id?2:0);
  });
  const sw = Object.entries(monthScore).sort((a,b)=>b[1]-a[1])[0];
  if (sw){
    const monthsTH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const [y,m] = sw[0].split('-');
    awards.push({ icon: '💖', title: 'Sweetest Month', value: `${monthsTH[parseInt(m,10)]} ${y}` });
  }

  // 📷 Most Photos in One Story
  const photoCount = state.stories.map(s => ({
    title: s.title,
    count: getStoryPhotos(s.id).length,
  })).sort((a,b) => b.count - a.count)[0];
  if (photoCount && photoCount.count > 0){
    awards.push({ icon: '📷', title: 'Most Photos', value: `${photoCount.count} 📷 — ${photoCount.title}` });
  }

  // 🎤 Most Voice Notes
  const voiceCount = state.stories.filter(s => s.voice_drive_id).length;
  if (voiceCount > 0){
    awards.push({ icon: '🎤', title: 'Voice Notes', value: `${voiceCount} เสียง` });
  }

  // ✍️ Most Active Author
  const byAuthor = state.stories.reduce((acc, s) => {
    acc[s.author||'?'] = (acc[s.author||'?']||0)+1;
    return acc;
  }, {});
  const topAuthor = Object.entries(byAuthor).sort((a,b)=>b[1]-a[1])[0];
  if (topAuthor){
    awards.push({ icon: '✍️', title: 'Most Active', value: `${topAuthor[0]} (${topAuthor[1]} เรื่อง)` });
  }

  // 🌍 Most Visited Place
  const placeCount = {};
  state.stories.forEach(s => {
    const p = (s.place||'').trim();
    if (p) placeCount[p] = (placeCount[p]||0)+1;
  });
  const topPlace = Object.entries(placeCount).sort((a,b)=>b[1]-a[1])[0];
  if (topPlace && topPlace[1] >= 2){
    awards.push({ icon: '📍', title: 'Favorite Place', value: `${topPlace[0]} (${topPlace[1]}×)` });
  }

  // 🌟 First Story
  const oldest = [...state.stories].sort((a,b) =>
    (a.year - b.year) || (a.month - b.month) || ((a.day||0) - (b.day||0))
  )[0];
  if (oldest){
    awards.push({ icon: '🌟', title: 'First Story', value: oldest.title });
  }

  return awards;
}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initLogin);
