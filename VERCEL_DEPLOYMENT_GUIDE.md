# 🚀 Checklist Deployment ke Vercel

## ✅ Perbaikan yang Sudah Dilakukan:

### Backend Fixes:
- [x] Fixed `api/index.js` - menambahkan `const app = createApp(db);`
- [x] Created `vercel.json` dengan konfigurasi serverless
- [x] Added `READ_ONLY_DB` mode untuk filesystem immutable di Vercel
- [x] Updated `src/db.js` untuk support parameter `readOnly`
- [x] Configured CORS untuk frontend URL: `https://nemesis-kelompok-4.vercel.app`
- [x] Set database include files di vercel.json

### Frontend Fixes:
- [x] Updated `index.html` dengan meta tag untuk API URL
- [x] Added script untuk set `window.DASHBOARD_API_BASE_URL`
- [x] Default API URL: `https://backend-kelompok-4.vercel.app/api`
- [x] Created `vercel.json` untuk frontend (static deployment)

---

## 📋 Tahapan Deployment:

### 1. **Backend Deployment** (`https://backend-kelompok-4.vercel.app/`)

**Di Vercel Dashboard:**
1. Import repository: `c:\Users\Ghaida\Documents\Alif Alfarizi\PBP\nemesis`
2. Select Root Directory: `backend`
3. Build Command: `npm ci` (atau biarkan auto-detect)
4. Output Directory: `.` (tidak ada)
5. Environment Variables (tambahkan di Project Settings):
   ```
   PORT=3000
   CORS_ORIGIN=https://nemesis-kelompok-4.vercel.app
   READ_ONLY_DB=1
   AUDIT_DATASET_YEAR=2026
   ```
6. Deploy

**Atau via Vercel CLI:**
```bash
cd backend
vercel deploy --prod --env CORS_ORIGIN=https://nemesis-kelompok-4.vercel.app --env READ_ONLY_DB=1
```

---

### 2. **Frontend Deployment** (`https://nemesis-kelompok-4.vercel.app/`)

**Di Vercel Dashboard:**
1. Import repository: `c:\Users\Ghaida\Documents\Alif Alfarizi\PBP\nemesis`
2. Select Root Directory: `frontend`
3. Build Command: (kosongkan - ini static files)
4. Output Directory: `.` (atau kosongkan)
5. Deploy

**Atau via Vercel CLI:**
```bash
cd frontend
vercel deploy --prod
```

---

## 🔍 Testing Checklist:

### Backend Testing:
- [ ] Health check: `https://backend-kelompok-4.vercel.app/api/health`
  - Expected response: `{"status":"ok"}`
- [ ] Bootstrap data: `https://backend-kelompok-4.vercel.app/api/bootstrap`
  - Should return KPI dan area data
- [ ] Check CORS headers:
  ```bash
  curl -i -X OPTIONS https://backend-kelompok-4.vercel.app/api/bootstrap \
    -H "Origin: https://nemesis-kelompok-4.vercel.app"
  ```

### Frontend Testing:
- [ ] Frontend loads: `https://nemesis-kelompok-4.vercel.app/`
- [ ] Network tab di DevTools - check:
  - Requests ke `https://backend-kelompok-4.vercel.app/api/*` terbuka
  - CORS headers ada di response
  - Status code 200 (bukan 403/500)
- [ ] Map displays
- [ ] KPI data loads
- [ ] Sidebar data loads

---

## ⚠️ Potential Issues & Solutions:

### Issue 1: Database Error pada First Deploy
**Problem:** `Schema not found` atau `sqlite_master table missing`
**Solution:** 
- Pastikan `data/cimahi.sqlite` sudah di-commit ke git
- Jika tidak ada, run locally: `npm run db:reset`

### Issue 2: CORS Error di Frontend
**Problem:** `Access to XMLHttpRequest blocked by CORS policy`
**Solution:**
- Verify backend environment variable: `CORS_ORIGIN=https://nemesis-kelompok-4.vercel.app`
- Check frontend meta tag: `data-api-base-url="https://backend-kelompok-4.vercel.app/api"`
- Backend API response harus include: `Access-Control-Allow-Origin: https://nemesis-kelompok-4.vercel.app`

### Issue 3: API URL Mismatch
**Problem:** Frontend pointing to localhost or wrong backend URL
**Solution:**
- Edit `frontend/index.html` line 6: Update `data-api-base-url` attribute
- Or set via JavaScript: `window.DASHBOARD_API_BASE_URL = 'https://backend-kelompok-4.vercel.app/api'`

### Issue 4: File Not Found (404)
**Problem:** Database file tidak ada di Vercel
**Solution:**
- Verify `vercel.json` includes: `"includeFiles": "data/**,seed/**"`
- Check git status: `git status backend/data/`
- Commit database: `git add backend/data/cimahi.sqlite`

---

## 📝 Environment Variables Summary:

### Backend (.env atau Vercel Settings):
```
PORT=3000
CORS_ORIGIN=https://nemesis-kelompok-4.vercel.app
READ_ONLY_DB=1
AUDIT_DATASET_YEAR=2026
SQLITE_PATH=data/cimahi.sqlite
```

### Frontend:
```
Meta tag: <meta data-api-base-url="https://backend-kelompok-4.vercel.app/api">
```

---

## 🔗 Resources:
- Vercel Docs: https://vercel.com/docs
- SQLite on Vercel: https://vercel.com/guides/how-to-use-sqlite-on-vercel
- CORS Troubleshooting: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

---

**Status:** ✅ Ready for Deployment
**Next Step:** Push ke GitHub dan connect dengan Vercel
