# 💌 Safe & Ruang · Our Story

> A private monthly anniversary diary — built with ♥ for two people only.

[![Live Site](https://img.shields.io/badge/Live-apirakchai.github.io%2FSR--Anniversary-c9a961?style=flat-square)](https://apirakchai.github.io/SR-Anniversary/)

---

## 📖 เกี่ยวกับโปรเจกต์

เว็บไดอารี่ส่วนตัวสำหรับ **Safe & Ruang** — ใช้เก็บความทรงจำรายเดือน เริ่มนับตั้งแต่ **8 มกราคม 2021** (วันครบรอบ)

ทุกอย่างเก็บใน **Google Sheet + Drive** ส่วนตัว — Anthropic, GitHub, หรือใครก็ตามที่บังเอิญเจอเว็บนี้ **ไม่สามารถเข้าถึงข้อมูลได้** เพราะมี 3 ชั้นความปลอดภัย:

1. 🔐 **Password Login** (รหัส `080121`) — เก็บเป็น SHA-256 hash
2. 🔐 **OAuth Test Users** — มีแค่ 2 Gmail ที่ login Google ได้
3. 🔐 **Drive Folder Permission** — รูปอยู่ใน folder ที่ share เฉพาะ 2 คน

---

## ✨ Features

### 📖 Core
- ⏰ **Live counter** — ปี/เดือน/วันที่อยู่ด้วยกัน + นับถอยหลัง next monthiversary
- 📝 **Monthly stories** — เพิ่ม/แก้ไข/ลบ ความทรงจำรายเดือน
- 📷 **Photos** — อัปโหลดได้หลายรูป/story เก็บใน Google Drive
- 🎤 **Voice notes** — บันทึกเสียงสูงสุด 30 วินาที/story
- 😊 **Mood picker** — 6 อารมณ์ (😊 🥰 🥺 ✨ 🌿 🌧️)
- 🔍 **Search & Filter** — ค้นข้อความ + กรองรายปี/เดือน/วัน/อารมณ์

### 📅 Views
- 📖 **Timeline** — รายการ stories ทั้งหมด เรียงล่าสุด → เก่าสุด
- 📅 **Year View** — ปฏิทิน 12 เดือน × ปี เห็นภาพรวมว่าเดือนไหนยังไม่มี
- 🔎 **Story Detail** — modal เต็มจอพร้อมรูป gallery + voice playback
- ⏮ **On This Day** — banner เด้งขึ้นถ้ามี story เก่าในเดือนเดียวกัน

### 💌 Special
- 💌 **Time Capsule** — เขียนข้อความวันนี้ ตั้งเปิดอ่านในอนาคต (3เดือน/6เดือน/1ปี/5ปี)
- 🎉 **Anniversary surprise** — confetti + จดหมายรักทุกวันที่ 8 ของเดือน
- ⏳ **Milestone banner** — แจ้งใกล้ครบ 1 ปี / 5 ปี / 100 เดือน / 10 ปี
- 🌸 **Seasonal effects** — ดอกไม้เมษา / ใบไม้ร่วงตุลา-พฤศจิกา / หิมะธันวา / หัวใจวาเลนไทน์

### 🎨 Customization
- 🌓 **3 Themes** — Navy (default) / Midnight / Sunset
- 🎵 **Background music** — เพลง Lo-fi piano เปิด/ปิดได้
- 📲 **PWA installable** — ติดตั้งเป็น app บน home screen, ใช้ offline ได้

### ☁️ Sync & Backup
- 🔄 **Auto-sync ทุก 30 วินาที** — หยุดตอนกำลังพิมพ์ (ไม่รบกวน)
- 📦 **Auto-backup ทุกเที่ยงคืน** — เก็บ 30 backup ล่าสุด
- 🔄 **Restore** — กู้คืนจาก backup วันใดก็ได้
- 💾 **Export/Import JSON** — backup สำรองในเครื่อง

### 📕 Print
- 📕 **Print as Book (PDF)** — สร้างหนังสือพร้อมปกสวย, สารบัญ, หน้าหลัง
- 3 รูปแบบ: รวมทุกเรื่อง / แยกตามปี / เลือกบางปี

---

## 🚀 Quick Start

### สำหรับ User (Safe / Ruang)

1. เข้า [apirakchai.github.io/SR-Anniversary](https://apirakchai.github.io/SR-Anniversary/)
2. เลือกชื่อ → ใส่รหัส `080121`
3. ไปแท็บ **⚙ Settings** → กด **🔗 เชื่อมต่อ Google**
4. Login ด้วย Gmail ตัวเอง → กด Continue (ผ่านหน้า "Google hasn't verified")
5. เริ่มเก็บความทรงจำ ♥

> 💡 **Tip:** กด Share → Add to Home Screen ใน Safari เพื่อติดตั้งเป็น app บน iPhone

---

## 🛠 ตั้งค่า (สำหรับ Developer)

### Prerequisites

- Google Account (สำหรับ Drive + Sheets API)
- GitHub Account (สำหรับ host เว็บผ่าน Pages)

### Step 1 — ตั้ง Google Cloud Project

1. เข้า [console.cloud.google.com](https://console.cloud.google.com)
2. **New Project** → ชื่ออะไรก็ได้ (เช่น `SR-Anniversary`)
3. **APIs & Services → Library** → enable:
   - Google Sheets API
   - Google Drive API

### Step 2 — สร้าง API Key

1. **APIs & Services → Credentials → Create credentials → API key**
2. กด **Edit** ที่ key ที่เพิ่งสร้าง
3. **Application restrictions:** Websites
   - เพิ่ม: `https://YOUR-USERNAME.github.io/*` และ `http://localhost/*`
4. **API restrictions:** เลือก Google Sheets API + Google Drive API
5. **Save** → copy key ไว้

### Step 3 — สร้าง OAuth Client ID

1. **APIs & Services → OAuth consent screen** → External → Testing
   - เพิ่ม Test users: Gmail ของทั้ง 2 คน (สำคัญมาก ห้ามลืม!)
2. **Credentials → Create credentials → OAuth client ID** → Web application
3. **Authorized JavaScript origins:**
   - `https://YOUR-USERNAME.github.io`
   - `http://localhost:8000`
4. (ไม่ต้องใส่ Authorized redirect URIs)
5. **Create** → copy Client ID

### Step 4 — สร้าง Drive Folder

1. เข้า Google Drive ของคนที่หลัก
2. New Folder → ชื่ออะไรก็ได้ (เช่น `SR-Diary-Photos`)
3. **Share** ให้ Gmail ของอีกคน → role: **Editor**
4. เปิด folder → copy ID จาก URL (`drive.google.com/drive/folders/<ID-อยู่ตรงนี้>`)

### Step 5 — แก้ `app.js`

```javascript
const CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  GOOGLE_API_KEY:   'YOUR_API_KEY',
  PASSWORD_HASH:    'SHA-256_OF_YOUR_PASSWORD',
  ANNIV_DAY:   8,    // วันที่
  ANNIV_MONTH: 1,    // เดือน
  ANNIV_YEAR:  2021, // ปี
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',
  // ... อย่าแตะส่วนอื่น
};
```

### Step 6 — Deploy ผ่าน GitHub Pages

1. **Create new repository** → `SR-Anniversary` (public ก็ได้ เพราะ key restrict by domain)
2. Upload ไฟล์ทั้งหมด (ดูใน [File Structure](#-file-structure))
3. **Settings → Pages → Source:** Deploy from a branch → `main` → `/ (root)`
4. รอ 1-2 นาที → เข้าเว็บได้ที่ `https://YOUR-USERNAME.github.io/REPO-NAME/`

> 💡 **เปลี่ยนรหัส?** หา SHA-256 hash ใหม่ที่ [emn178.github.io/online-tools/sha256.html](https://emn178.github.io/online-tools/sha256.html) แล้ว paste แทนใน `PASSWORD_HASH`

---

## 📁 File Structure

```
SR-Anniversary/
├── index.html          # หน้าเว็บหลัก
├── style.css           # สไตล์ + 3 themes
├── app.js              # Logic ทั้งหมด (~2700 lines) — ⚠️ ใส่ credentials ตรง CONFIG
├── manifest.json       # PWA config (ไม่ต้องแก้)
├── sw.js               # Service Worker (offline caching)
├── icon-192.png        # PWA icon เล็ก
├── icon-512.png        # PWA icon ใหญ่
└── README.md           # ไฟล์นี้
```

---

## 🗄 Data Schema

ข้อมูลเก็บใน Google Sheet ชื่อ **`SafeRuang_Stories`** ที่ระบบสร้างให้อัตโนมัติ มี 4 tabs:

### `Stories` (11 columns)
| col | field | example |
|---|---|---|
| A | id | `st_lz3a_x7y2` |
| B | year | `2024` |
| C | month | `6` |
| D | day | `15` (optional) |
| E | title | `ทริปทะเลกระบี่` |
| F | text | `วันนั้น...` |
| G | place | `อ่าวนาง` |
| H | author | `Safe` หรือ `Ruang` |
| I | mood | `happy` / `love` / `sad` / `excited` / `peaceful` / `bittersweet` |
| J | voice_drive_id | Drive file ID ของไฟล์เสียง |
| K | updatedAt | ISO timestamp |

### `Photos` (5 columns)
| col | field | description |
|---|---|---|
| A | id | unique photo ID |
| B | story_id | FK → Stories.id |
| C | drive_id | Drive file ID ของรูป |
| D | name | ชื่อไฟล์ |
| E | dataURL_fallback | base64 (ถ้า Drive upload fail) |

### `Backups` (4 columns) — เก็บ 30 rows ล่าสุด
| col | field |
|---|---|
| A | date (YYYY-MM-DD) |
| B | timestamp |
| C | story_count |
| D | snapshot_json (full data) |

### `Capsules` (6 columns)
| col | field |
|---|---|
| A | id |
| B | title |
| C | text |
| D | author |
| E | createdAt |
| F | openAt |

---

## 🔐 Security Model

| Layer | What it protects | How to break it |
|---|---|---|
| 1. PIN | หน้า Login | Brute-force 6 หลักตัวเลขล้วน → ทำได้ใน 0.001 วินาที |
| 2. OAuth Test Users | Google connection | ไม่ได้ — Google block ตั้งแต่ขั้น OAuth ถ้า Gmail ไม่อยู่ใน list |
| 3. Drive permissions | รูป + Sheet | ต้องผ่าน 2 ขึ้นก่อน + Gmail นั้นต้องมีสิทธิ์ |

**ความเสี่ยงจริง ๆ:**
- คนเดารหัสได้ → เห็นแค่ UI ว่าง ๆ (localStorage ตัวเองไม่มีข้อมูล)
- คนเดา Drive file ID ของรูป (ยากมาก ~32 chars random)

**ทางเพิ่มความปลอดภัย** (ถ้าอยาก):
- เปลี่ยนรหัสเป็น passphrase ยาว ๆ → update `PASSWORD_HASH`
- ปิด GitHub Pages public + ใช้ Cloudflare Pages with password
- ลบ test users คนใดคนหนึ่งเมื่อไม่ใช้แล้ว

---

## 🐛 Troubleshooting

### `Sync indicator แดง "init failed"`
- เช็ค Client ID + API Key ใน `app.js` ว่าใส่ครบและมี quote `' '` ครอบ
- เช็คว่า API restrictions อนุญาต Google Sheets + Google Drive

### `Error 400 redirect_uri_mismatch`
- เช็ค **Authorized JavaScript origins** ใน OAuth Client → ต้องตรงกับ URL ของเว็บเป๊ะ ๆ
- ห้ามมี `/` ปิดท้าย, ห้ามมี wildcard

### `Access blocked: This app is unverified`
- Gmail ที่ login ไม่อยู่ใน **OAuth consent → Test users**
- เพิ่ม email ใน list → รอ 5 นาที → ลองใหม่

### Sync indicator ค้าง "syncing"
- เปิด DevTools → Console → ส่ง error log มา
- ลอง: Settings → ตัวเลือกขั้นสูง → ตัดการเชื่อมต่อ → เชื่อมใหม่

### Stories เก่าหายหลังอัปเกรด
1. Settings → "🔄 กู้คืนจาก Backup"
2. โหลด list → เลือกวันที่ก่อน upgrade → กู้คืน
3. หรือ Import JSON ที่ export ไว้

### รูปไม่ขึ้นใน timeline
- เช็ค Drive folder permissions: Editor for both Gmails
- เช็ค `DRIVE_FOLDER_ID` ใน `CONFIG` ตรงกับ folder จริง
- เช็ค Drive API enabled ใน Google Cloud

### PWA ไม่ install
- ต้องเข้าเว็บผ่าน HTTPS (GitHub Pages เป็น HTTPS อยู่แล้ว)
- iPhone: ต้อง Safari, ไม่ใช่ Chrome
- Hard refresh ก่อน → กดปุ่ม Share → Add to Home Screen

---

## 🎨 Design

- **Color tokens:**
  - Navy (`#0a1f44`)
  - Gold (`#c9a961`)
  - Ivory (`#f7f4ec`)
- **Fonts:**
  - Display: `Italiana` (heading)
  - Serif: `Cormorant Garamond` (body italic)
  - Sans: `Sarabun` (UI + Thai)
- **Inspired by:** vintage diary, hotel stationery, library bookplates

---

## 🤝 Credits

- Made with ♥ by Safe (with help from Claude AI)
- Background music: [Pixabay Royalty-free Lo-fi Piano](https://pixabay.com/music/)
- Fonts via Google Fonts
- Icons: hand-rolled SVGs

---

## 📜 License

Personal project — not for redistribution. แต่ถ้าจะเอา code ไปดัดแปลงทำของตัวเอง ก็ตามสบายเลยครับ — แค่อย่าเอา content (ข้อความ, รูป, เพลง) ไปใช้ละกัน 💌

---

> *"ทุกเดือนที่ผ่านไป คือเรื่องเล่าที่ไม่อยากให้หาย จึงเก็บไว้ในเล่มนี้ — ให้เธอ"*
> 
> **— Safe ♥ Ruang · since 08·01·2021**
