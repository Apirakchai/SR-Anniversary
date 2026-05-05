# 💌 Safe & Ruang · Our Story — Setup Guide

เว็บ surprise สำหรับเก็บความทรงจำในแต่ละเดือนของคุณ Safe กับ Ruang

---

## ✨ Features

- 🔐 **Login screen** — เลือกชื่อ (Safe / Ruang) + ใส่รหัส 6 หลัก (รหัสเก็บเป็น SHA-256 hash ใน source code, ไม่เห็นรหัสจริง)
- 📖 **Timeline** — เก็บเรื่องราวรายเดือน พร้อมรูปภาพ, สถานที่, จดหมายรัก
- ☁️ **Auto sync** — ข้อมูลซิงค์อัตโนมัติผ่าน Google Sheets + Google Drive ระหว่างเครื่องของ Safe กับ Ruang
- 📱 **Responsive** — ใช้ได้ลื่น iPhone, iPad ทั้งแนวตั้ง/แนวนอน
- 🎉 **Anniversary surprise** — ทุกวันที่ 8 ของเดือน มี confetti + จดหมายรัก + หัวใจลอย + countdown
- 💾 **Offline mode** — เก็บ cache ใน localStorage ดูได้แม้ไม่มีเน็ต
- 🎨 **ธีมน้ำเงินกรม + ทอง** — สวยหรูแบบ editorial

---

## 📁 Files

```
/
├─ index.html      ← หน้าเว็บหลัก
├─ style.css       ← ดีไซน์ทั้งหมด
├─ app.js          ← logic ทั้งหมด (login, sync, anniversary)
├─ SETUP.md        ← ไฟล์นี้
└─ README.md       ← ลิงก์ไปยัง SETUP.md
```

---

## 🚀 Setup ครั้งแรก (ทำครั้งเดียว)

### ขั้นที่ 1 — สร้าง GitHub Repository + เปิด Pages

1. สร้าง repo ใหม่ใน GitHub (ตั้งชื่ออะไรก็ได้ เช่น `safe-ruang`)
2. อัปโหลดไฟล์ทั้ง 3 (`index.html`, `style.css`, `app.js`)
3. ไปที่ **Settings → Pages**
4. เลือก **Source: Deploy from a branch**
5. **Branch: `main`** + **folder: `/ (root)`** → กด Save
6. รอ 1–2 นาที เว็บจะอยู่ที่ `https://<your-username>.github.io/<repo-name>/`

### ขั้นที่ 2 — สร้าง Google Cloud Project

> ⚠️ ขั้นตอนนี้ดูเยอะ แต่ทำครั้งเดียวจริง ๆ และฟรีทั้งหมด

1. เข้า https://console.cloud.google.com/
2. กดมุมบนซ้าย → **New Project** → ตั้งชื่อ (เช่น "Safe Ruang Diary") → กด Create
3. รอประมาณ 30 วินาทีให้สร้างเสร็จ แล้วเลือก project ที่เพิ่งสร้าง

### ขั้นที่ 3 — เปิด API ที่ต้องใช้

1. เมนูซ้าย → **APIs & Services → Library**
2. ค้นหาและเปิด API ต่อไปนี้ (กดปุ่ม **Enable** ทีละอัน):
   - **Google Sheets API**
   - **Google Drive API**

### ขั้นที่ 4 — สร้าง API Key

1. เมนูซ้าย → **APIs & Services → Credentials**
2. กด **+ Create Credentials → API key**
3. คัดลอก key ที่ได้ (ขึ้นต้นด้วย `AIza...`) เก็บไว้
4. กด **Restrict key** เพื่อความปลอดภัย:
   - **Application restrictions**: HTTP referrers (web sites)
   - เพิ่ม referrer ทั้งสองอันนี้:
     - `https://<your-username>.github.io/*`
     - `http://localhost/*` (สำหรับทดสอบในเครื่อง)
   - **API restrictions**: Restrict key → เลือกเฉพาะ Google Sheets API + Google Drive API
   - กด Save

### ขั้นที่ 5 — สร้าง OAuth Client ID

1. ยังที่ **Credentials**
2. กด **+ Create Credentials → OAuth client ID**
3. ถ้ามันบอกให้ configure consent screen ก่อน → กดทำตามนี้:
   - **User Type: External** → Create
   - **App name**: Safe & Ruang Diary
   - **User support email**: อีเมลของคุณ
   - **Developer contact email**: อีเมลของคุณ
   - กด Save and Continue
   - **Scopes**: ข้ามไปก่อน (กด Save and Continue)
   - **Test users**: เพิ่ม email Gmail ของ Safe **และ** Ruang ที่จะใช้เข้าระบบ → Save
   - Summary → Back to Dashboard
4. กลับมา **+ Create Credentials → OAuth client ID** อีกครั้ง
5. **Application type: Web application**
6. **Name**: Safe Ruang Web
7. **Authorized JavaScript origins** — เพิ่ม:
   - `https://<your-username>.github.io`
   - `http://localhost` (ถ้าทดสอบในเครื่อง)
8. กด Create → คัดลอก **Client ID** ที่ได้ (ขึ้นต้นด้วย ตัวเลข แล้ว `.apps.googleusercontent.com`)

### ขั้นที่ 6 — เปิดใช้ Google Drive Folder

ผมเข้าใจว่าคุณมี Drive folder ของคุณอยู่แล้ว:
`https://drive.google.com/drive/folders/1p2Njr1sdRxva2wnrpKBJ0eh8mHxpe6WV`

> ⚠️ **สำคัญ**: ทั้ง Safe และ Ruang ต้องมีสิทธิ์ **Editor** ใน folder นี้
>
> วิธี share:
> 1. เปิด folder นั้นใน Google Drive
> 2. กดปุ่ม **Share** ขวาบน
> 3. ใส่อีเมล Gmail ของอีกฝ่าย (ถ้ายังไม่ได้ share)
> 4. ตั้ง role เป็น **Editor**
> 5. กด Send

Folder ID `1p2Njr1sdRxva2wnrpKBJ0eh8mHxpe6WV` ถูก hard-code ไว้ใน `app.js` แล้ว

### ขั้นที่ 7 — เข้าเว็บแล้ว Configure

1. เปิด `https://<your-username>.github.io/<repo-name>/`
2. **Login**: เลือก Safe หรือ Ruang → ใส่รหัส **`080121`** → เข้าสู่ระบบ
3. ไปที่แท็บ **⚙ Settings**
4. ใส่ **Google Client ID** และ **Google API Key** ที่ได้จากขั้นที่ 4-5
5. กด **บันทึก credentials**
6. กด **🔗 เชื่อมต่อ Google** → popup login Google จะเด้งขึ้น
7. login ด้วยอีเมล Gmail (อันเดียวกับที่ share Drive folder)
8. อนุมัติสิทธิ์ทั้งหมด
9. ระบบจะสร้าง Google Sheet ชื่อ `SafeRuang_Stories` ใน My Drive อัตโนมัติ
10. **เสร็จ!** ตอนนี้กดเพิ่มเรื่องราวได้ — ทุกอย่างจะ sync อัตโนมัติ

> 🔁 **Ruang ต้องทำขั้นที่ 7 ในเครื่องของตัวเองด้วย** (login Gmail ของตัวเอง, ใส่ credentials เดียวกัน, กดเชื่อมต่อ) แล้วทั้งสองคนจะเห็นข้อมูลเดียวกัน

---

## 💡 วิธี Share Sheet ระหว่าง Safe กับ Ruang

หลังจาก Safe กดเชื่อมต่อครั้งแรก ระบบจะสร้าง Google Sheet ใน Google Drive ของ Safe → ต้อง **share Sheet นั้นให้ Ruang ด้วย** (Editor)

วิธี:
1. ในแท็บ Settings ดู **Spreadsheet ID** ที่แสดงไว้
2. ไปที่ Google Drive → ค้นหา `SafeRuang_Stories`
3. กด Share → ใส่อีเมล Ruang → role **Editor**
4. ใน Settings ของเครื่อง Ruang ก็จะเห็น sheet เดียวกัน

> 💡 **Tip**: ใส่ sheet ไว้ใน Drive folder เดียวกัน (`1p2Njr1sdRxva2wnrpKBJ0eh8mHxpe6WV`) จะหาง่าย และทั้งคู่เห็นพร้อมกัน

---

## 🔐 ความปลอดภัย

- รหัส `080121` ถูกเก็บเป็น **SHA-256 hash** (`118d7c585c0ca03cd5fbeb837481aa07cdf151b94714c3a90d4b28ee560540a7`) ใน `app.js`
- ใครเปิด GitHub repo ก็เห็นแค่ hash ไม่เห็นรหัสจริง
- ❗ **อย่าทำให้ repo เป็น public ถ้าใส่ Client ID/API Key ลงไปใน source code**
- Credentials ของ Google ถูกเก็บใน **localStorage ของแต่ละเครื่อง** (ไม่อยู่ใน GitHub)
- การ login Google ใช้ OAuth 2.0 — Google ออก token ให้, ไม่มีรหัสผ่านอะไรอยู่ใน source code

---

## 🎨 Customization

แก้ในไฟล์ `app.js` หัวเรื่อง `CONFIG`:

```js
const CONFIG = {
  PASSWORD_HASH: '...',          // เปลี่ยนรหัสด้วย sha256 ของรหัสใหม่
  ANNIV_DAY: 8,                  // วันครบรอบ (1-31)
  ANNIV_MONTH: 1,                // เดือน (1-12)
  ANNIV_YEAR: 2021,              // ปีที่เริ่มคบกัน
  DRIVE_FOLDER_ID: '...',        // Google Drive folder ID
  SHEET_NAME: 'SafeRuang_Stories'
};
```

วิธีสร้าง SHA-256 ของรหัสใหม่ (ใน browser console):
```js
const txt = '123456';
crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')));
```

แก้สีในไฟล์ `style.css` หัวเรื่อง `:root`:

```css
:root{
  --navy-deep   : #0a1f44;     /* น้ำเงินกรม - หลัก */
  --gold        : #c9a961;     /* ทอง - accent */
  --ivory       : #f7f4ec;     /* พื้นหลัง */
  ...
}
```

---

## 🐛 Troubleshooting

| ปัญหา | วิธีแก้ |
|---|---|
| รูปไม่ขึ้น | เช็คว่า photo upload สำเร็จ (ดู console). เช็คว่า Drive folder share ให้ทั้งคู่ |
| sync ไม่ทำงาน | ไปที่ Settings → กด "ตัดการเชื่อมต่อ" แล้ว "เชื่อมต่อ Google" ใหม่ |
| login ไม่ผ่าน | ตรวจรหัสว่าตรงกับที่ตั้งไว้ใน `CONFIG.PASSWORD_HASH` |
| Anniversary popup ไม่ขึ้น | เช็ควันที่เครื่อง — ขึ้นเฉพาะวันที่ 8 ของเดือน |
| OAuth error 400 | redirect URI ใน Google Console ต้องตรง — เพิ่ม `https://<user>.github.io` ใน Authorized JavaScript origins |

---

Made with ♥ — Safe ♥ Ruang · since 08·01·2021
