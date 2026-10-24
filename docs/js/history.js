// Saved scans live only in this browser (localStorage). Nothing is uploaded.
const KEY = 'skinscan.history.v1';
const LIMIT = 40;

export function list() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function add(entry) {
  const items = list().filter((e) => e.id !== entry.id);
  items.unshift(entry);
  return write(items);
}

export function remove(id) {
  return write(list().filter((e) => e.id !== id));
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export function find(id) {
  return list().find((e) => e.id === id);
}

export function toCSV(items) {
  const cols = ['date', 'suggestion', 'finding', 'melanoma', 'benign', 'other_skin_cancer', 'age', 'sex', 'body_site', 'fitzpatrick', 'diameter_mm', 'melanocytic', 'sample_id', 'biopsy_result'];
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((e) => [
    new Date(e.ts).toISOString(),
    e.title,
    e.finding,
    e.probs[0].toFixed(4),
    e.probs[1].toFixed(4),
    e.probs[2].toFixed(4),
    e.patient.age ?? '',
    e.patient.sex ?? '',
    e.patient.site ?? '',
    e.patient.fitzpatrick ?? '',
    e.patient.diameterMm ?? '',
    e.patient.melanocytic ?? '',
    e.sample?.id ?? '',
    e.sample?.diagnosis ?? '',
  ]);
  return [cols, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
