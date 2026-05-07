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

  AUTO_SYNC_MS: 30 * 1000,
  TYPING_PAUSE_MS: 5 * 1000,
  BACKUP_CHECK_MS: 5 * 60 * 1000,
  MAX_BACKUPS: 30,

  VOICE_MAX_MS: 30 * 1000,

  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4',
                   'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
};

const LS = {
  STORIES        : 'sr_stories',
  PHOTOS         : 'sr_photos',
  CAPSULES       : 'sr_capsules',
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
function saveLS(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

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
  return `https://drive.google.com/uc?id=${driveId}&export=download`;
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
      const url = URL.createObjectURL(blob);
      const audio = $('#voicePlayback');
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
      // Diagnostic: check blob is valid
      const blobSize = state.pendingVoiceBlob.size || 0;
      if (blobSize === 0){
        toast('เสียงที่อัดได้ขนาด 0 — iOS PWA อาจ block ไมค์ ลองอัดใน Safari แทน', 'error', 7000);
      } else if (blobSize < 500){
        toast(`เสียงที่อัดสั้นเกินไป (${blobSize} bytes) — ลองอัดใหม่`, 'error', 5000);
      } else {
        try {
          const mime = state.pendingVoiceBlob.type || 'audio/webm';
          let ext = 'webm';
          if (mime.includes('mp4'))  ext = 'm4a';
          else if (mime.includes('ogg')) ext = 'ogg';
          else if (mime.includes('wav')) ext = 'wav';
          const audioFile = new File([state.pendingVoiceBlob], `${id}_voice.${ext}`, {type: mime});
          const result = await uploadToDrive(audioFile);
          voiceDriveId = result.id;
        } catch(err){
          console.error('voice upload', err);
          const detail = (err && err.message) ? err.message.slice(0, 100) : 'unknown';
          toast(`อัปเสียงไม่สำเร็จ: ${detail}`, 'error', 8000);
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
function getStoryPhotos(storyId){ return state.photos.filter(p=>p.story_id === storyId); }

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
    const cover = photos[0] ? getPhotoSrc(photos[0]) : null;
    const moodEmoji = s.mood ? MOOD_EMOJI[s.mood] || '' : '';
    const dateLabel = s.day
      ? `${s.day} ${monthsTH[s.month]} · ${s.year}`
      : `${monthsTH[s.month]} · ${s.year}`;
    return `
      <article class="story-card" data-id="${s.id}">
        <div class="story-cover ${cover ? '' : 'placeholder'}">
          ${cover ? `<img src="${cover}" alt="" loading="lazy"/>` : ''}
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
  const cover = photos[0] ? getPhotoSrc(photos[0]) : null;
  const moodEmoji = s.mood ? MOOD_EMOJI[s.mood] || '' : '';

  const galleryHTML = photos.length > 1
    ? `<div class="mc-gallery">${photos.slice(1).map(p=>{
        const src = getPhotoSrc(p);
        return `<img src="${src}" alt="" loading="lazy"/>`;
      }).join('')}</div>`
    : '';

  const voiceHTML = s.voice_drive_id
    ? `<div class="mc-voice"><label class="muted small">🎤 ฟังเสียง</label><audio controls src="${driveAudioUrl(s.voice_drive_id)}"></audio></div>`
    : '';

  $('#modalContent').innerHTML = `
    <div class="mc-cover ${cover?'':'placeholder'}">
      ${cover ? `<img src="${cover}" alt=""/>` : ''}
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
        <button class="btn-primary" id="storyEdit">✎ แก้ไข</button>
      </div>
    </div>
  `;

  $('#storyEdit').addEventListener('click', ()=>editStory(id));
  $('#storyDelete').addEventListener('click', ()=>deleteStory(id));
  $('#storyModal').classList.remove('hidden');
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
    audio.src = driveAudioUrl(s.voice_drive_id);
    audio.classList.remove('hidden');
    $('#voiceDelete').classList.remove('hidden');
    $('#recordBtn').querySelector('.voice-label').textContent = 'อัดใหม่';
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

  const res = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: CONFIG.SHEET_NAME },
      sheets: [
        { properties: { title: CONFIG.TAB_STORIES } },
        { properties: { title: CONFIG.TAB_PHOTOS } },
        { properties: { title: CONFIG.TAB_BACKUPS } },
        { properties: { title: CONFIG.TAB_CAPSULES } },
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
  const required = [CONFIG.TAB_STORIES, CONFIG.TAB_PHOTOS, CONFIG.TAB_BACKUPS, CONFIG.TAB_CAPSULES];
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
    const [storyRows, photoRows, capsuleRows] = await Promise.all([
      safeGet(`${CONFIG.TAB_STORIES}!A2:K`),
      safeGet(`${CONFIG.TAB_PHOTOS}!A2:F`),
      safeGet(`${CONFIG.TAB_CAPSULES}!A2:F`),
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

    state.stories = mergeStories(state.stories, remoteStories);
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month) || ((b.day||0) - (a.day||0)));
    state.photos = mergePhotos(state.photos, remotePhotos);
    state.capsules = mergeCapsules(state.capsules, remoteCapsules);

    saveLS(LS.STORIES, state.stories);
    saveLS(LS.PHOTOS, state.photos);
    saveLS(LS.CAPSULES, state.capsules);
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

  const photoValues = state.photos.map(p=>[
    p.id, p.story_id, p.drive_id || '', p.name || '', p.dataURL || '', p.thumbnail_url || '',
  ]);

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
    const snapshot = { stories: state.stories, photos: state.photos, capsules: state.capsules };
    const snapStr = JSON.stringify(snapshot);

    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.google.sheetId,
      range: `${CONFIG.TAB_BACKUPS}!A2:D`,
    });
    let backups = res.result.values || [];
    backups = backups.filter(r => r[0] !== today);
    backups.unshift([today, ts, String(state.stories.length), snapStr]);
    backups = backups.slice(0, CONFIG.MAX_BACKUPS);

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
  if (!state.google.accessToken){ toast('ต้องเชื่อมต่อ Google ก่อน', 'error'); return; }
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
    const snap = JSON.parse(row[3]);
    state.stories = snap.stories || [];
    state.photos = snap.photos || [];
    state.capsules = snap.capsules || [];
    state.stories.sort((a,b)=> (b.year - a.year) || (b.month - a.month));
    saveLS(LS.STORIES, state.stories);
    saveLS(LS.PHOTOS, state.photos);
    saveLS(LS.CAPSULES, state.capsules);
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
    stories: state.stories, photos: state.photos, capsules: state.capsules,
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

  const w = window.open('', '_blank');
  if (!w){ toast('กรุณาอนุญาต popup', 'error'); return; }
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
// BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initLogin);
