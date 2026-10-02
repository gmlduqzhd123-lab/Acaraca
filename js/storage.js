const PREFIX = 'acaroom:v1:';
const memory = new Map();
const overrides = new Set();
const keyName = (key) => `${PREFIX}${String(key)}`;

/** Storage may be blocked or full. In that case values live safely for this session. */
export function read(key, fallback = null) {
  const name = keyName(key);
  if (overrides.has(name)) return memory.has(name) ? memory.get(name) : fallback;
  try {
    const stored = localStorage.getItem(name);
    if (stored === null) return memory.has(name) ? memory.get(name) : fallback;
    const value = JSON.parse(stored);
    memory.set(name, value);
    return value;
  } catch {
    return memory.has(name) ? memory.get(name) : fallback;
  }
}

export function write(key, value) {
  const name = keyName(key);
  let serialized;
  try {
    serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
  } catch {
    return false;
  }
  memory.set(name, value);
  try {
    localStorage.setItem(name, serialized);
    overrides.delete(name);
    return true;
  } catch {
    overrides.add(name);
    return false;
  }
}

export function remove(key) {
  const name = keyName(key);
  memory.delete(name);
  try {
    localStorage.removeItem(name);
    overrides.delete(name);
    return true;
  } catch {
    // A tombstone prevents a stale persistent value from reappearing later.
    overrides.add(name);
    return false;
  }
}

export function isAvailable() {
  const name = `${PREFIX}availability-probe`;
  try {
    localStorage.setItem(name, '1');
    localStorage.removeItem(name);
    return true;
  } catch {
    return false;
  }
}
