# Production Deployment Guide

Dokumen ini mendeskripsikan langkah-langkah untuk menyebarkan (deploy) backend Node.js Solar Panel IoT ke server production (VPS/Cloud).

---

## 1. Persiapan Environment

Sebelum mendeploy, pastikan server tujuan memiliki:
- **Node.js**: v20.x atau LTS terbaru.
- **NPM**: v10.x atau lebih tinggi.
- **Process Manager**: PM2 (disarankan untuk manajemen proses node).
- **Reverse Proxy**: Nginx (untuk SSL termination dan proxying request ke Node.js port).

---

## 2. Pilihan Cara Deployment

### Cara A: Deployment Tradisional dengan PM2

1. **Clone repository & Install Dependencies**:
   ```bash
   git clone <repo-url> backend
   cd backend
   npm install --omit=dev
   ```

2. **Setup Environment**:
   Salin `.env.example` ke `.env` dan isi dengan nilai produksi asli:
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Build TypeScript**:
   Kompilasi source code TypeScript menjadi file JavaScript murni:
   ```bash
   npm run build
   ```

4. **Jalankan Aplikasi dengan PM2**:
   Jalankan server Node.js menggunakan PM2 untuk memastikan aplikasi otomatis menyala kembali jika terjadi crash atau server reboot.
   ```bash
   pm2 start dist/index.js --name "solar-backend"
   pm2 save
   pm2 startup
   ```

---

### Cara B: Deployment Kontainer (Docker)

Gunakan `Dockerfile` di direktori utama:

```dockerfile
# Build Stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production Run Stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

Jalankan dengan perintah Docker:
```bash
docker build -t solar-backend:latest .
docker run -d -p 5000:5000 --env-file .env --name solar-backend-container solar-backend:latest
```

---

## 3. Konfigurasi Nginx (Reverse Proxy)

Nginx dikonfigurasi sebagai gerbang depan untuk mengarahkan request port `80` / `443` (HTTPS) ke port lokal Node.js `5000`.

```nginx
server {
    listen 80;
    server_name panel-care.allvvnt.my.id;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
Untuk mengaktifkan SSL, gunakan Let's Encrypt / Certbot:
```bash
sudo certbot --nginx -d panel-care.allvvnt.my.id
```
