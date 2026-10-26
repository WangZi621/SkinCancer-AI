// On-device storage for profiles, patients, lesions and scans.
// Everything lives in this browser's IndexedDB; nothing is sent anywhere.
// A profile can have a passcode. Its records are then encrypted with AES-GCM under a key
// derived from the passcode (PBKDF2, SHA-256), and the key exists only in memory while
// the profile is unlocked.

const DB_NAME = 'skinscan';
const DB_VERSION = 1;
const PBKDF2_ITERATIONS = 210000;
const LEGACY_HISTORY_KEY = 'skinscan.history.v1';
const LAST_PROFILE_KEY = 'skinscan.lastProfile';

const te = new TextEncoder();
const td = new TextDecoder();

// ---------------------------------------------------------------- IndexedDB
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('profiles')) d.createObjectStore('profiles', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('records')) {
          const s = d.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('byProfile', 'profileId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => {
      result = r;
    });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const req2p = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// ---------------------------------------------------------------- crypto
export const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
};

async function deriveKey(passcode, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(value)));
  return { iv, ct: new Uint8Array(ct) };
}
async function unseal(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv }, key, box.ct);
  return JSON.parse(td.decode(pt));
}
const VERIFIER = 'skinscan-profile-ok';

// ---------------------------------------------------------------- profiles
/** Public profile fields shown on the sign-in screen (never the records). */
const publicProfile = (p) => ({
  id: p.id,
  name: p.name,
  role: p.role,
  org: p.org,
  createdAt: p.createdAt,
  locked: !!p.lock,
  settings: p.settings || {},
});

export async function listProfiles() {
  const all = await run('profiles', 'readonly', (s) => req2p(s.getAll()));
  return all.sort((a, b) => a.createdAt - b.createdAt).map(publicProfile);
}

async function getProfile(id) {
  return run('profiles', 'readonly', (s) => req2p(s.get(id)));
}
async function putProfile(p) {
  return run('profiles', 'readwrite', (s) => req2p(s.put(p)));
}

async function makeLock(passcode) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passcode, salt, PBKDF2_ITERATIONS);
  return { lock: { salt, iterations: PBKDF2_ITERATIONS, verifier: await seal(key, VERIFIER) }, key };
}

export async function createProfile({ name, role = '', org = '', passcode = '' }) {
  const p = {
    id: newId(),
    name: name.trim(),
    role: role.trim(),
    org: org.trim(),
    createdAt: Date.now(),
    lock: null,
    settings: { autoLockMinutes: 10, theme: 'system' },
  };
  let key = null;
  if (passcode) ({ lock: p.lock, key } = await makeLock(passcode));
  await putProfile(p);
  await startSession(p, key);
  await importLegacyHistory();
  return publicProfile(p);
}

// ---------------------------------------------------------------- session
const session = { profile: null, key: null, cache: new Map(), listeners: new Set(), timer: null };

export const current = () => (session.profile ? publicProfile(session.profile) : null);
export const onChange = (fn) => session.listeners.add(fn);
const emit = () => session.listeners.forEach((fn) => fn(current()));

async function startSession(profile, key) {
  session.profile = profile;
  session.key = key;
  session.cache = new Map();
  const rows = await run('records', 'readonly', (s) => req2p(s.index('byProfile').getAll(profile.id)));
  for (const row of rows) {
    try {
      session.cache.set(row.id, row.box ? await unseal(key, row.box) : row.value);
    } catch (err) {
      console.error('Could not read a record', row.id, err);
    }
  }
  try {
    localStorage.setItem(LAST_PROFILE_KEY, profile.id);
  } catch {
    /* storage blocked: the profile simply is not remembered */
  }
  armAutoLock();
  emit();
}

/** Open a profile. Throws Error('wrong-passcode') if the passcode does not match. */
export async function unlock(profileId, passcode = '') {
  const p = await getProfile(profileId);
  if (!p) throw new Error('missing-profile');
  let key = null;
  if (p.lock) {
    key = await deriveKey(passcode, p.lock.salt, p.lock.iterations);
    try {
      if ((await unseal(key, p.lock.verifier)) !== VERIFIER) throw new Error();
    } catch {
      throw new Error('wrong-passcode');
    }
  }
  await startSession(p, key);
  return publicProfile(p);
}

/** Sign out of the current profile. Its data stays on the device, encrypted if it has a passcode. */
export function lock() {
  session.profile = null;
  session.key = null;
  session.cache = new Map();
  clearTimeout(session.timer);
  emit();
}

/** Reopen the last profile on this device if it has no passcode. */
export async function resume() {
  let id = null;
  try {
    id = localStorage.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  const p = await getProfile(id);
  if (!p || p.lock) return null;
  await startSession(p, null);
  return publicProfile(p);
}

export async function lastProfileId() {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
}

function armAutoLock() {
  clearTimeout(session.timer);
  const p = session.profile;
  const mins = p?.settings?.autoLockMinutes;
  if (!p || !p.lock || !mins) return;
  session.timer = setTimeout(() => lock(), mins * 60 * 1000);
}
for (const ev of ['pointerdown', 'keydown']) {
  window.addEventListener(ev, () => session.profile && armAutoLock(), { passive: true });
}

export async function updateProfile(fields) {
  const p = await getProfile(session.profile.id);
  Object.assign(p, fields);
  if (fields.settings) p.settings = { ...session.profile.settings, ...fields.settings };
  await putProfile(p);
  session.profile = p;
  armAutoLock();
  emit();
  return publicProfile(p);
}

/** Set, change or remove the passcode. Every record is re-encrypted (or decrypted) in one go. */
export async function setPasscode(newPasscode) {
  const p = await getProfile(session.profile.id);
  let key = null;
  if (newPasscode) ({ lock: p.lock, key } = await makeLock(newPasscode));
  else p.lock = null;
  const rows = [];
  for (const [id, value] of session.cache) rows.push(await encodeRow(id, value, key, p.id));
  const d = await db();
  await new Promise((resolve, reject) => {
    const t = d.transaction(['profiles', 'records'], 'readwrite');
    t.objectStore('profiles').put(p);
    for (const r of rows) t.objectStore('records').put(r);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  session.profile = p;
  session.key = key;
  armAutoLock();
  emit();
}

export async function deleteProfile(id = session.profile?.id) {
  const rows = await run('records', 'readonly', (s) => req2p(s.index('byProfile').getAllKeys(id)));
  const d = await db();
  await new Promise((resolve, reject) => {
    const t = d.transaction(['profiles', 'records'], 'readwrite');
    t.objectStore('profiles').delete(id);
    for (const k of rows) t.objectStore('records').delete(k);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  if (session.profile?.id === id) lock();
  try {
    if (localStorage.getItem(LAST_PROFILE_KEY) === id) localStorage.removeItem(LAST_PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- records
async function encodeRow(id, value, key, profileId) {
  const row = { id, profileId, kind: value.kind, updatedAt: value.updatedAt || Date.now() };
  if (key) row.box = await seal(key, value);
  else row.value = value;
  return row;
}

function need() {
  if (!session.profile) throw new Error('signed-out');
}

export function all(kind) {
  if (!session.profile) return [];
  return [...session.cache.values()].filter((v) => v.kind === kind);
}
export function get(id) {
  return session.profile ? session.cache.get(id) || null : null;
}

export async function save(value) {
  need();
  const v = { ...value, id: value.id || newId(), updatedAt: Date.now() };
  if (!v.createdAt) v.createdAt = v.updatedAt;
  const row = await encodeRow(v.id, v, session.key, session.profile.id);
  await run('records', 'readwrite', (s) => req2p(s.put(row)));
  session.cache.set(v.id, v);
  emit();
  return v;
}

export async function remove(id) {
  need();
  await run('records', 'readwrite', (s) => req2p(s.delete(id)));
  session.cache.delete(id);
  emit();
}

// ---------------------------------------------------------------- queries
export const patients = () => all('patient').sort((a, b) => a.name.localeCompare(b.name));
export const lesionsOf = (patientId) => all('lesion').filter((l) => l.patientId === patientId).sort((a, b) => a.createdAt - b.createdAt);
export const scansOf = (lesionId) => all('scan').filter((s) => s.lesionId === lesionId).sort((a, b) => a.ts - b.ts);
export const scans = () => all('scan').sort((a, b) => b.ts - a.ts);
export const latestScan = (lesionId) => scansOf(lesionId).at(-1) || null;

/** Remove a patient with all their lesions and scans. */
export async function removePatient(id) {
  const ls = lesionsOf(id);
  for (const l of ls) {
    for (const s of scansOf(l.id)) await remove(s.id);
    await remove(l.id);
  }
  for (const s of all('scan').filter((x) => x.patientId === id)) await remove(s.id);
  await remove(id);
}
export async function removeLesion(id) {
  for (const s of scansOf(id)) await remove(s.id);
  await remove(id);
}

// ---------------------------------------------------------------- backup
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function packBox(box) {
  return box ? { iv: b64(box.iv), ct: b64Chunked(box.ct) } : undefined;
}
function b64Chunked(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const unpackBox = (box) => (box ? { iv: unb64(box.iv), ct: unb64(box.ct) } : undefined);

/** The current profile as a file. With a passcode, the records inside stay encrypted. */
export async function exportBackup() {
  need();
  const p = await getProfile(session.profile.id);
  const rows = await run('records', 'readonly', (s) => req2p(s.index('byProfile').getAll(p.id)));
  return JSON.stringify({
    app: 'SkinScan AI',
    format: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      ...p,
      lock: p.lock ? { salt: b64(p.lock.salt), iterations: p.lock.iterations, verifier: packBox(p.lock.verifier) } : null,
    },
    records: rows.map((r) => ({ ...r, box: packBox(r.box) })),
  });
}

/** Restore a backup file as a profile on this device (a new id if one with its id exists). */
export async function importBackup(text) {
  const data = JSON.parse(text);
  if (data.app !== 'SkinScan AI' || data.format !== 1 || !data.profile) throw new Error('not-a-backup');
  const existing = await getProfile(data.profile.id);
  const id = existing ? newId() : data.profile.id;
  const lockInfo = data.profile.lock;
  const p = {
    ...data.profile,
    id,
    lock: lockInfo ? { salt: unb64(lockInfo.salt), iterations: lockInfo.iterations, verifier: unpackBox(lockInfo.verifier) } : null,
  };
  const d = await db();
  await new Promise((resolve, reject) => {
    const t = d.transaction(['profiles', 'records'], 'readwrite');
    t.objectStore('profiles').put(p);
    for (const r of data.records) t.objectStore('records').put({ ...r, profileId: id, box: unpackBox(r.box) });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  return publicProfile(p);
}

// ---------------------------------------------------------------- legacy history
/** Scans saved by the earlier one-page app (localStorage) move into the first profile, unassigned. */
async function importLegacyHistory() {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(items) || !items.length) return;
  for (const e of items) {
    await save({
      kind: 'scan',
      id: `legacy-${e.id}`,
      ts: e.ts,
      thumb: e.thumb,
      image: e.thumb,
      details: e.patient,
      probs: e.probs,
      level: e.level,
      title: e.title,
      finding: e.finding,
      sample: e.sample || null,
      patientId: null,
      lesionId: null,
    });
  }
  try {
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
