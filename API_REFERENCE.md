# API Endpoints Reference

## Base URL
- **Local Dev:** `http://127.0.0.1:3000/api`
- **Production:** `https://backend-kelompok-4.vercel.app/api`

## Available Endpoints

### Health Check
```
GET /api/health
```
**Response:**
```json
{"status":"ok"}
```

### Bootstrap Data
```
GET /api/bootstrap
```
Returns KPI, regions, provinces, dan owner aggregates untuk dashboard initialization.

### Region Packages
```
GET /api/regions/:regionKey/packages
Query params: ?severity=&priority=&sort=&page=&limit=
```
Example:
```
https://backend-kelompok-4.vercel.app/api/regions/region-jawa-barat-kota-cimahi/packages
```

### Province Packages
```
GET /api/provinces/:provinceKey/packages
Query params: ?severity=&priority=&sort=&page=&limit=
```

### Owner Packages
```
GET /api/owners/packages
Query params: ?ownerType=&ownerName=&severity=&priority=&sort=&page=&limit=
```
**Required:**
- `ownerType`: Type of owner (e.g., "kementerian", "pemerintah-daerah")
- `ownerName`: Name of owner

---

## CORS Configuration

### Allowed Origins
- `https://nemesis-kelompok-4.vercel.app`

### Allowed Methods
- GET
- POST
- PUT
- DELETE
- OPTIONS

### Allowed Headers
- Content-Type
- Authorization

---

## Testing API Locally

```bash
# Health check
curl http://127.0.0.1:3000/api/health

# Bootstrap
curl http://127.0.0.1:3000/api/bootstrap

# Region packages
curl "http://127.0.0.1:3000/api/regions/region-jawa-barat-kota-cimahi/packages"

# CORS preflight
curl -i -X OPTIONS http://127.0.0.1:3000/api/bootstrap \
  -H "Origin: https://nemesis-kelompok-4.vercel.app"
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| 404 Not Found | Check endpoint path and regionKey/provinceKey |
| 500 Internal Error | Check backend logs: `vercel logs` or `npm run dev` |
| CORS Error | Verify `CORS_ORIGIN` environment variable |
| No Data | Ensure SQLite database is properly initialized |
