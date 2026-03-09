export interface Area {
  key: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Config {
  id: string;
  identifier: string;
  areas: Area[];
}

const STORAGE_KEY = 'invoicereader-configs';

function loadAll(): Config[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveAll(configs: Config[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

export function listConfigs(): { id: string; identifier: string }[] {
  return loadAll().map(c => ({ id: c.id, identifier: c.identifier }));
}

export function getConfig(id: string): Config | null {
  return loadAll().find(c => c.id === id) ?? null;
}

export function createConfig(identifier: string, areas: Area[]): Config {
  const configs = loadAll();
  if (configs.some(c => c.identifier === identifier)) {
    throw new Error('A configuration with this identifier already exists');
  }
  const config: Config = { id: crypto.randomUUID(), identifier, areas };
  configs.push(config);
  saveAll(configs);
  return config;
}

export function updateConfig(id: string, identifier: string, areas: Area[]): Config {
  const configs = loadAll();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Configuration not found');
  const duplicate = configs.find(c => c.identifier === identifier && c.id !== id);
  if (duplicate) throw new Error('A configuration with this identifier already exists');
  configs[idx] = { ...configs[idx], identifier, areas };
  saveAll(configs);
  return configs[idx];
}

export function deleteConfig(id: string): void {
  const configs = loadAll();
  saveAll(configs.filter(c => c.id !== id));
}

export function exportConfig(id: string): string {
  const config = getConfig(id);
  if (!config) throw new Error('Configuration not found');
  const { id: _id, ...data } = config;
  return JSON.stringify(data, null, 2);
}

export function exportAllConfigs(): string {
  const configs = loadAll().map(({ id: _id, ...data }) => data);
  return JSON.stringify(configs, null, 2);
}

export interface ImportItem {
  identifier: string;
  areas: Area[];
}

export function parseImport(json: string): { items: ImportItem[]; conflicts: string[] } {
  const parsed = JSON.parse(json);
  const rawItems: Omit<Config, 'id'>[] = Array.isArray(parsed) ? parsed : [parsed];
  const configs = loadAll();
  const items: ImportItem[] = [];
  const conflicts: string[] = [];

  for (const item of rawItems) {
    if (!item.identifier || !Array.isArray(item.areas)) continue;
    items.push({ identifier: item.identifier, areas: item.areas });
    if (configs.find(c => c.identifier === item.identifier)) {
      conflicts.push(item.identifier);
    }
  }

  return { items, conflicts };
}

export function importConfigs(items: ImportItem[]): number {
  const configs = loadAll();
  let imported = 0;

  for (const item of items) {
    const existing = configs.find(c => c.identifier === item.identifier);
    if (existing) {
      existing.areas = item.areas;
    } else {
      configs.push({ id: crypto.randomUUID(), identifier: item.identifier, areas: item.areas });
    }
    imported++;
  }

  saveAll(configs);
  return imported;
}
