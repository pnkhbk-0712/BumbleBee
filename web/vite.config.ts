import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// allow usage of Node globals in this dev-only config without requiring @types/node
declare const require: any;
declare const process: any;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // dev-only plugin to allow the frontend to request appending a sample
    // telemetry entry into src/lib/beeData.json while running the Vite dev server.
    // This is intentionally development-only and won't run in production builds.
    {
      name: 'dev-add-beedata',
      configureServer(server) {
        server.middlewares.use(async (req: any, res: any, next: any) => {
          try {
            if (req.url === '/__add-beedata' && req.method === 'POST') {
              const body = await new Promise<string>((resolve) => {
                let data = '';
                req.on('data', (c: any) => (data += c));
                req.on('end', () => resolve(data));
                req.on('error', () => resolve(''));
              });
              const payload = body ? JSON.parse(body) : {};
              const id = payload?.id;
              if (!id) {
                res.statusCode = 400;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ error: 'missing id' }));
                return;
              }

              const fs = require('fs');
              const path = require('path');
              const file = path.resolve(process.cwd(), 'src', 'lib', 'beeData.json');
              let arr: any[] = [];
              try {
                const txt = fs.readFileSync(file, 'utf8');
                arr = JSON.parse(txt || '[]');
              } catch (e) {
                arr = [];
              }
              if (arr.find((x: any) => x.id === id)) {
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ ok: true, message: 'already exists' }));
                return;
              }

              const template = {
                id: String(id),
                temperature: [
                  { time: '08:00', value: 32 },
                  { time: '09:00', value: 33 },
                  { time: '10:00', value: 34 },
                  { time: '11:00', value: 36 },
                  { time: '12:00', value: 35 }
                ],
                humidity: [
                  { time: '08:00', value: 70 },
                  { time: '09:00', value: 68 },
                  { time: '10:00', value: 67 },
                  { time: '11:00', value: 65 },
                  { time: '12:00', value: 66 }
                ]
              };
              arr.push(template);
              try {
                fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8');
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ error: 'unable to write file', detail: String(e) }));
                return;
              }

              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            // simple CRUD endpoints for beehive persistence during development
            // GET    /__beehives           -> returns array
            // POST   /__beehives           -> create (body: { name,lng,lat })
            // PUT    /__beehives/:id       -> update (body: partial)
            // DELETE /__beehives/:id       -> delete
            if (req.url && req.url.startsWith('/__beehives')) {
              const fs = require('fs');
              const path = require('path');
              const file = path.resolve(process.cwd(), 'src', 'lib', 'beeHiveData.json');
              // helper to read array
              const readArr = () => {
                try {
                  const txt = fs.readFileSync(file, 'utf8');
                  return JSON.parse(txt || '[]');
                } catch {
                  return [];
                }
              };

              const urlPath = req.url.split('?')[0];
              const parts = urlPath.split('/').filter(Boolean);
              // parts like ['__beehives'] or ['__beehives','id']
              if (req.method === 'GET' && parts.length === 1) {
                const arr = readArr();
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(arr));
                return;
              }

              if (req.method === 'POST' && parts.length === 1) {
                const body = await new Promise<string>((resolve) => {
                  let data = '';
                  req.on('data', (c: any) => (data += c));
                  req.on('end', () => resolve(data));
                  req.on('error', () => resolve(''));
                });
                const payload = body ? JSON.parse(body) : {};
                const list = readArr();
                const item = {
                  id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
                  name: payload.name || 'Untitled',
                  lng: payload.lng || 0,
                  lat: payload.lat || 0,
                  createdAt: new Date().toISOString(),
                };
                list.push(item);
                try {
                  fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
                } catch (e: any) {
                  res.statusCode = 500;
                  res.setHeader('content-type', 'application/json');
                  res.end(JSON.stringify({ error: 'unable to write file', detail: String(e) }));
                  return;
                }
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(item));
                return;
              }

              // operations with id
              if (parts.length === 2) {
                const id = parts[1];
                if (req.method === 'DELETE') {
                  let list = readArr();
                  list = list.filter((x: any) => x.id !== id);
                  try { fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8'); } catch (e: any) {}
                  res.setHeader('content-type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                  return;
                }
                if (req.method === 'PUT') {
                  const body = await new Promise<string>((resolve) => {
                    let data = '';
                    req.on('data', (c: any) => (data += c));
                    req.on('end', () => resolve(data));
                    req.on('error', () => resolve(''));
                  });
                  const payload = body ? JSON.parse(body) : {};
                  const list = readArr();
                  const idx = list.findIndex((x: any) => x.id === id);
                  if (idx === -1) {
                    res.statusCode = 404;
                    res.setHeader('content-type', 'application/json');
                    res.end(JSON.stringify({ error: 'not found' }));
                    return;
                  }
                  const updated = { ...list[idx], ...payload };
                  list[idx] = updated;
                  try { fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8'); } catch (e: any) {}
                  res.setHeader('content-type', 'application/json');
                  res.end(JSON.stringify(updated));
                  return;
                }
              }
              // if nothing matched, fallthrough
            }
          } catch (err) {
            // fallthrough to next middleware
          }
          next();
        });
      }
    },
    react()
  ],
  server: {
    host: true, // cho phép truy cập từ IP
    port: 5173  // có thể đổi nếu muốn
  }
})
