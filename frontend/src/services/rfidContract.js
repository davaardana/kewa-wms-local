export function normalizeEpc(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeEpcList(values) {
  return Array.from(new Set((values || []).map(normalizeEpc).filter(Boolean)));
}

export function isValidEpc(value) {
  const epc = normalizeEpc(value);
  return /^[0-9A-F]{8,64}$/.test(epc);
}
