export interface Area {
  key: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaymentOrderFieldMappings {
  beneficiaryName: string;
  beneficiaryIban: string;
  amount: string;
  referenceNumber: string;
  paymentDescription: string;
  dueDate: string;
}

export interface PaymentOrderConfig {
  payerName: string;
  payerIban: string;
  payerBic: string;
  currency: string;
  fieldMappings: PaymentOrderFieldMappings;
}

export interface Config {
  id: string;
  identifier: string;
  areas: Area[];
  paymentOrder?: PaymentOrderConfig;
}

const STORAGE_KEY = 'openpdh-configs';

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

export function createConfig(identifier: string, areas: Area[], paymentOrder?: PaymentOrderConfig): Config {
  const configs = loadAll();
  if (configs.some(c => c.identifier === identifier)) {
    throw new Error('A configuration with this identifier already exists');
  }
  const config: Config = { id: crypto.randomUUID(), identifier, areas, paymentOrder };
  configs.push(config);
  saveAll(configs);
  return config;
}

export function updateConfig(id: string, identifier: string, areas: Area[], paymentOrder?: PaymentOrderConfig): Config {
  const configs = loadAll();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Configuration not found');
  const duplicate = configs.find(c => c.identifier === identifier && c.id !== id);
  if (duplicate) throw new Error('A configuration with this identifier already exists');
  configs[idx] = { ...configs[idx], identifier, areas, paymentOrder };
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
  const { identifier, areas, paymentOrder } = config;
  return JSON.stringify({ identifier, areas, paymentOrder }, null, 2);
}

export function exportAllConfigs(): string {
  const configs = loadAll().map(({ identifier, areas, paymentOrder }) => ({ identifier, areas, paymentOrder }));
  return JSON.stringify(configs, null, 2);
}

export interface ImportItem {
  identifier: string;
  areas: Area[];
  paymentOrder?: PaymentOrderConfig;
}

function isValidArea(a: unknown): a is Area {
  if (typeof a !== 'object' || a === null) return false;
  const obj = a as Record<string, unknown>;
  return typeof obj.key === 'string' &&
    typeof obj.page === 'number' && Number.isInteger(obj.page) && obj.page >= 1 &&
    typeof obj.x === 'number' && obj.x >= 0 && obj.x <= 100 &&
    typeof obj.y === 'number' && obj.y >= 0 && obj.y <= 100 &&
    typeof obj.width === 'number' && obj.width > 0 && obj.width <= 100 &&
    typeof obj.height === 'number' && obj.height > 0 && obj.height <= 100;
}

export function parseImport(json: string): { items: ImportItem[]; conflicts: string[] } {
  const parsed = JSON.parse(json);
  const rawItems: Omit<Config, 'id'>[] = Array.isArray(parsed) ? parsed : [parsed];
  const configs = loadAll();
  const items: ImportItem[] = [];
  const conflicts: string[] = [];

  for (const item of rawItems) {
    if (!item.identifier || !Array.isArray(item.areas)) continue;
    const validAreas = item.areas.filter(isValidArea);
    if (validAreas.length === 0) continue;
    items.push({ identifier: item.identifier, areas: validAreas, paymentOrder: item.paymentOrder });
    if (configs.find(c => c.identifier === item.identifier)) {
      conflicts.push(item.identifier);
    }
  }

  return { items, conflicts };
}

export function importConfigs(items: ImportItem[]): number {
  const configs = loadAll();

  for (const item of items) {
    const existing = configs.find(c => c.identifier === item.identifier);
    if (existing) {
      existing.areas = item.areas;
      existing.paymentOrder = item.paymentOrder;
    } else {
      configs.push({ id: crypto.randomUUID(), identifier: item.identifier, areas: item.areas, paymentOrder: item.paymentOrder });
    }
  }

  saveAll(configs);
  return items.length;
}

// Payer details cache — prefills new configs from last-used values
const PAYER_STORAGE_KEY = 'openpdh-payer-details';

export interface PayerDetails {
  payerName: string;
  payerIban: string;
  payerBic: string;
}

export function loadPayerDetails(): PayerDetails {
  const raw = localStorage.getItem(PAYER_STORAGE_KEY);
  if (!raw) return { payerName: '', payerIban: '', payerBic: '' };
  try { return JSON.parse(raw); } catch { return { payerName: '', payerIban: '', payerBic: '' }; }
}

export function savePayerDetails(details: PayerDetails): void {
  localStorage.setItem(PAYER_STORAGE_KEY, JSON.stringify(details));
}
