'use strict';

/* ---------- constants ---------- */
const FIELDS = ['species', 'scientific', 'length', 'weight', 'sex', 'colours', 'markings', 'features', 'description'];
const VIEWS = ['side', 'top', 'head', 'tail', 'fins', 'belly', 'other'];
const MAX_DIM = 2048, JPEG_Q = 0.92;

/* ---------- IndexedDB (kept outside Alpine so blobs aren't proxied) ---------- */
let db;
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open('fish-collector', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('fish', { keyPath: 'uid' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = (mode, fn) => new Promise((res, rej) => {
  const t = db.transaction('fish', mode);
  const req = fn(t.objectStore('fish'));
  t.oncomplete = () => res(req && req.result);
  t.onerror = () => rej(t.error);
});
const dbAll = () => tx('readonly', s => s.getAll());
const dbPut = f => tx('readwrite', s => s.put(f));
const dbDel = uid => tx('readwrite', s => s.delete(uid));

/* ---------- helpers ---------- */
// crypto.randomUUID only exists on HTTPS/localhost; fall back so plain-http LAN use works
const uuid = () => crypto.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
const blankFish = (carry = {}) => ({
  uid: uuid(), createdAt: Date.now(), updatedAt: Date.now(), isNew: true, photos: [],
  ...Object.fromEntries(FIELDS.map(k => [k, carry[k] || ''])),
});
const slug = s => (s || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
const csvCell = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sc = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return new Promise(r => c.toBlob(r, 'image/jpeg', JPEG_Q));
}

/* ---------- store-only ZIP writer (no dependencies) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function buildZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
    parts.push(lh.buffer, nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, nm);
    off += 30 + nm.length + sz;
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/* ---------- Alpine component ---------- */
document.addEventListener('alpine:init', () => {
  const urlCache = new WeakMap();

  Alpine.data('fishApp', () => ({
    views: VIEWS,
    records: [],
    cur: blankFish(),
    editing: false,   // narrow screens: show editor instead of list
    search: '',
    busy: false,
    adding: false,    // true while photos are being processed
    toastMsg: '',
    _toastTimer: null,

    async init() {
      db = await openDB();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
      await this.reload();
    },

    /* derived */
    get summary() {
      return this.records.length + ' fish · ' + this.records.reduce((n, f) => n + f.photos.length, 0) + ' photos';
    },
    get filtered() {
      const q = this.search.trim().toLowerCase();
      return this.records.filter(f => !q || [f.species, f.scientific, f.description, f.colours].join(' ').toLowerCase().includes(q));
    },
    get speciesOptions() {
      return [...new Set(this.records.map(f => f.species).filter(Boolean))].sort();
    },

    /* helpers */
    url(blob) {
      const raw = Alpine.raw(blob);
      if (!urlCache.has(raw)) urlCache.set(raw, URL.createObjectURL(raw));
      return urlCache.get(raw);
    },
    toast(msg) {
      this.toastMsg = msg; clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => this.toastMsg = '', 2200);
    },
    plain(f) { // strip Alpine proxies so IndexedDB can clone it
      const out = { uid: f.uid, createdAt: f.createdAt, updatedAt: f.updatedAt };
      FIELDS.forEach(k => out[k] = (f[k] ?? '').toString().trim());
      out.photos = f.photos.map(p => ({ id: p.id, view: p.view, blob: Alpine.raw(p.blob) }));
      return out;
    },

    /* data */
    async reload() {
      this.records = (await dbAll()).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    open(f) {
      const c = Alpine.raw(f);
      this.cur = { ...c, isNew: false, photos: c.photos.map(p => ({ ...p })) };
      this.editing = true;
    },
    startNew(carry) {
      this.cur = blankFish(carry); this.editing = true;
    },
    async addFiles(fileList) {
      this.adding = true;
      for (const f of [...fileList]) {
        try {
          const blob = await shrink(f);
          this.cur.photos.push({ id: uuid(), blob, view: VIEWS[Math.min(this.cur.photos.length, VIEWS.length - 1)] });
        } catch (e) { this.toast('Could not read one image'); }
      }
      this.adding = false;
    },
    async save(addAnother) {
      if (!this.cur.species.trim()) { this.toast('Please enter the species / type'); document.getElementById('species').focus(); return; }
      if (!this.cur.photos.length && !confirm('This fish has no photos. Save anyway?')) return;
      this.cur.updatedAt = Date.now();
      const rec = this.plain(this.cur);
      await dbPut(rec);
      this.toast('Saved');
      if (addAnother) this.cur = blankFish({ species: rec.species, scientific: rec.scientific });
      else this.cur = { ...rec, isNew: false, photos: rec.photos.map(p => ({ ...p })) };
      await this.reload();
    },
    async remove() {
      if (!confirm('Delete this fish and its photos?')) return;
      await dbDel(this.cur.uid);
      this.cur = blankFish(); this.editing = false;
      this.toast('Deleted'); await this.reload();
    },

    /* export */
    async exportDataset() {
      if (!this.records.length) { this.toast('Nothing to export yet'); return; }
      this.busy = true; this.toast('Building ZIP…');
      try {
        const recs = [...this.records].map(r => Alpine.raw(r)).sort((a, b) => a.createdAt - b.createdAt);
        const enc = new TextEncoder(), files = [], json = [];
        const rows = [['image_file', 'fish_id', 'species', 'scientific_name', 'photo_view', 'length_cm', 'weight_g', 'sex', 'body_colours', 'markings', 'fins_tail_mouth', 'description', 'recorded_at'].join(',')];
        for (let i = 0; i < recs.length; i++) {
          const f = recs[i], id = 'fish_' + String(i + 1).padStart(4, '0'), dir = 'images/' + slug(f.species) + '/', imgs = [];
          for (let j = 0; j < f.photos.length; j++) {
            const name = dir + id + '_' + (j + 1) + '.jpg';
            files.push({ name, data: new Uint8Array(await f.photos[j].blob.arrayBuffer()) });
            imgs.push({ file: name, view: f.photos[j].view || '' });
            rows.push([name, id, f.species, f.scientific, f.photos[j].view || '', f.length, f.weight, f.sex, f.colours, f.markings, f.features, f.description, new Date(f.createdAt).toISOString()].map(csvCell).join(','));
          }
          json.push({
            fish_id: id, uid: f.uid, species: f.species, scientific_name: f.scientific,
            length_cm: f.length === '' ? null : Number(f.length), weight_g: f.weight === '' ? null : Number(f.weight),
            sex: f.sex, body_colours: f.colours, markings: f.markings, fins_tail_mouth: f.features,
            description: f.description, recorded_at: new Date(f.createdAt).toISOString(), images: imgs,
          });
        }
        files.push({ name: 'labels.csv', data: enc.encode('﻿' + rows.join('\r\n') + '\r\n') });
        files.push({ name: 'records.json', data: enc.encode(JSON.stringify({ exported_at: new Date().toISOString(), fish_count: recs.length, records: json }, null, 2)) });
        const zip = buildZip(files);
        const p = n => String(n).padStart(2, '0'), d = new Date();
        const fname = `fish-dataset-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        this.toast('Exported ' + fname);
      } catch (e) { console.error(e); this.toast('Export failed: ' + e.message); }
      this.busy = false;
    },
  }));
});
