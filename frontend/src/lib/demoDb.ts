/**
 * demoDb.ts — a compact, dependency-free query engine over `demoData`.
 *
 * It implements just the slice of the supabase-js builder surface the app
 * uses (select/insert/update/upsert/delete, filters, ordering, limits,
 * single/maybeSingle, count/head, nested relation selects, RPC, storage and
 * realtime channels). The goal is not to be a complete PostgREST clone — it
 * is to let every existing page run unmodified when live Supabase data is
 * unavailable.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  clone, demoTable, getDemoDb, nextDemoId, saveDemoDb, type DemoRow, type DemoTable,
} from './demoData';

export interface DemoError {
  message: string;
  code?: string;
  details?: string;
}

export interface DemoResponse<T = any> {
  data: T;
  error: DemoError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

type FilterKind = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'like' | 'ilike' | 'not';
interface Filter {
  kind: FilterKind;
  column: string;
  value: unknown;
  extra?: string;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
}

interface SelectOptions {
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
}

type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

const ID_FIELDS: Record<string, string> = {
  profiles: 'id', stores: 'store_id', medicines: 'medicine_id', stock: 'stock_id',
  cart_items: 'cart_item_id', orders: 'order_id', order_items: 'order_item_id',
  prescriptions: 'prescription_id', coupons: 'coupon_id', wishlists: 'wishlist_id',
  reviews: 'review_id', notifications: 'notification_id', doctors: 'doctor_id',
  doctor_availability: 'slot_id', appointments: 'appointment_id', patients: 'patient_id',
  vitals: 'vital_id', tasks: 'task_id', notes: 'note_id', symptom_checks: 'check_id',
  emergency_contacts: 'contact_id', audit_logs: 'log_id', e_prescriptions: 'e_prescription_id',
};

const TABLE_NAMES = new Set([
  'profiles', 'stores', 'medicines', 'stock', 'cart_items', 'orders', 'order_items',
  'prescriptions', 'coupons', 'wishlists', 'reviews', 'notifications', 'doctors',
  'doctor_availability', 'appointments', 'patients', 'vitals', 'tasks', 'notes',
  'symptom_checks', 'emergency_contacts', 'audit_logs', 'e_prescriptions',
]);

/** alias -> { table, foreign key on the base row, cardinality } for each base table. */
const RELATIONS: Record<string, Record<string, { table: string; fk: string; many?: boolean }>> = {
  orders: {
    customer: { table: 'profiles', fk: 'user_id' },
    store: { table: 'stores', fk: 'store_id' },
  },
  cart_items: { stock: { table: 'stock', fk: 'stock_id' } },
  stock: {
    medicine: { table: 'medicines', fk: 'medicine_id' },
    store: { table: 'stores', fk: 'store_id' },
  },
  medicines: { stock: { table: 'stock', fk: 'medicine_id', many: true } },
  reviews: { reviewer: { table: 'profiles', fk: 'user_id' } },
  appointments: {
    patient: { table: 'profiles', fk: 'patient_id' },
    doctor: { table: 'doctors', fk: 'doctor_id' },
  },
  tasks: { patient: { table: 'patients', fk: 'patient_id' } },
  notes: { author: { table: 'profiles', fk: 'created_by' } },
  doctors: { profile: { table: 'profiles', fk: 'user_id' } },
  stores: { owner: { table: 'profiles', fk: 'owner_id' } },
  prescriptions: {
    customer: { table: 'profiles', fk: 'customer_id' },
    order: { table: 'orders', fk: 'order_id' },
    store: { table: 'stores', fk: 'store_id' },
  },
  order_items: {
    order: { table: 'orders', fk: 'order_id' },
    medicine: { table: 'medicines', fk: 'medicine_id' },
  },
  patients: { profile: { table: 'profiles', fk: 'profile_id' } },
  doctor_availability: { doctor: { table: 'doctors', fk: 'doctor_id' } },
  e_prescriptions: {
    doctor: { table: 'doctors', fk: 'doctor_id' },
    appointment: { table: 'appointments', fk: 'appointment_id' },
    patient: { table: 'patients', fk: 'patient_id' },
  },
  wishlists: { medicine: { table: 'medicines', fk: 'medicine_id' } },
  profiles: {},
  notifications: {},
};

const TABLE_ALIASES: Record<string, string> = {
  profiles: 'profiles', profile: 'profiles', customer: 'profiles', patient: 'profiles',
  owner: 'profiles', reviewer: 'profiles', author: 'profiles', user: 'profiles',
  stores: 'stores', store: 'stores', medicines: 'medicines', medicine: 'medicines',
  stock: 'stock', orders: 'orders', order: 'orders', order_items: 'order_items',
  doctors: 'doctors', doctor: 'doctors', patients: 'patients', vitals: 'vitals',
  prescriptions: 'prescriptions', appointments: 'appointments',
  e_prescriptions: 'e_prescriptions',
};

function idField(table: string): string {
  return ID_FIELDS[table] ?? 'id';
}

function rowsOf(table: string): DemoTable {
  return demoTable(table);
}

function applyFilterValue(rowValue: unknown, filter: Filter): boolean {
  const v = filter.value;
  switch (filter.kind) {
    case 'eq': return rowValue === v || String(rowValue) === String(v);
    case 'neq': return !(rowValue === v || String(rowValue) === String(v));
    case 'gt': return Number(rowValue) > Number(v);
    case 'gte': return Number(rowValue) >= Number(v);
    case 'lt': return Number(rowValue) < Number(v);
    case 'lte': return Number(rowValue) <= Number(v);
    case 'in': return Array.isArray(v) && v.some((x) => x === rowValue || String(x) === String(rowValue));
    case 'is': return v === null ? rowValue === null || rowValue === undefined : rowValue === v;
    case 'like':
    case 'ilike': {
      const pattern = String(v ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('%', '.*').replaceAll('_', '.');
      return new RegExp(`^${pattern}$`, filter.kind === 'ilike' ? 'i' : '').test(String(rowValue ?? ''));
    }
    case 'not': {
      // Supports .not(col, 'in', '(a,b,c)') and .not(col, 'is', null)
      if (filter.extra === 'in') {
        const list = String(v ?? '').replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
        return !list.includes(String(rowValue ?? ''));
      }
      if (filter.extra === 'is') return rowValue !== v;
      if (filter.extra === 'eq') return String(rowValue) !== String(v);
      return true;
    }
    default: return true;
  }
}

function getRelation(baseTable: string, row: DemoRow, alias: string, relName: string) {
  const explicit = RELATIONS[baseTable]?.[alias];
  if (explicit) return explicit;
  const target = TABLE_ALIASES[relName] ?? relName;
  if (!TABLE_NAMES.has(target)) return null;

  const baseSingular = baseTable.replace(/s$/, '');
  const targetSingular = target.replace(/s$/, '');
  const directFk = `${targetSingular}_id`;
  if (directFk in row) return { table: target, fk: directFk };

  // Reverse one-to-many (e.g. medicines -> stock).
  const reverseFk = `${baseSingular}_id`;
  const targetSample = rowsOf(target)[0];
  if (targetSample && reverseFk in targetSample) return { table: target, fk: reverseFk, many: true };

  return { table: target, fk: directFk };
}

function resolveRelation(baseTable: string, row: DemoRow, alias: string, relName: string): DemoRow | DemoRow[] | null {
  const rel = getRelation(baseTable, row, alias, relName);
  if (!rel) return null;
  const targetRows = rowsOf(rel.table);
  if (rel.many) {
    const baseId = row[idField(baseTable)];
    return targetRows.filter((r) => String(r[rel.fk]) === String(baseId));
  }
  const fkValue = row[rel.fk];
  if (fkValue === null || fkValue === undefined) return null;
  return targetRows.find((r) => String(r[idField(rel.table)]) === String(fkValue)) ?? null;
}

function resolvePath(baseTable: string, row: DemoRow, path: string): unknown {
  if (!path.includes('.')) return row[path];
  const [head, ...rest] = path.split('.');
  if (!head) return undefined;
  const related = resolveRelation(baseTable, row, head, head);
  if (!related || Array.isArray(related)) return undefined;
  return resolvePath(getRelation(baseTable, row, head, head)?.table ?? head, related, rest.join('.'));
}

function matchFilters(baseTable: string, row: DemoRow, filters: Filter[]): boolean {
  for (const f of filters) {
    if (f.kind === 'not') {
      const rel = f.column.includes('.') ? resolvePath(baseTable, row, f.column) : row[f.column];
      if (!applyFilterValue(rel, f)) return false;
      continue;
    }
    if (f.column.includes('.')) {
      const val = resolvePath(baseTable, row, f.column);
      if (f.kind === 'eq' && val === undefined) return false;
      if (!applyFilterValue(val, f)) return false;
    } else if (!applyFilterValue(row[f.column], f)) {
      return false;
    }
  }
  return true;
}

interface SelectPart {
  kind: 'star' | 'column' | 'relation';
  alias: string;
  relName?: string;
  inner?: boolean;
  columns?: SelectPart[];
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(select: string): SelectPart[] {
  return splitTopLevel(select).map((raw) => {
    if (raw === '*') return { kind: 'star', alias: '*' };
    const paren = raw.indexOf('(');
    if (paren === -1) {
      if (raw.includes(':')) {
        const [alias, rel] = raw.split(':');
        return { kind: 'relation', alias: alias ?? raw, relName: rel ?? alias, inner: raw.includes('!inner') };
      }
      return { kind: 'column', alias: raw.replace(/!.*$/, '') };
    }
    const head = raw.slice(0, paren);
    const inner = raw.slice(paren + 1, raw.lastIndexOf(')'));
    const cleanHead = head.replace(/!inner/g, '');
    if (cleanHead.includes(':')) {
      const [alias, rel] = cleanHead.split(':');
      return {
        kind: 'relation', alias: alias ?? cleanHead, relName: rel ?? alias ?? cleanHead,
        inner: head.includes('!inner'), columns: parseSelect(inner),
      };
    }
    return {
      kind: 'relation', alias: cleanHead, relName: cleanHead,
      inner: head.includes('!inner'), columns: parseSelect(inner),
    };
  });
}

function projectRow(baseTable: string, row: DemoRow, parts: SelectPart[]): DemoRow | null {
  const out: DemoRow = {};
  for (const part of parts) {
    if (part.kind === 'star') {
      Object.assign(out, row);
      continue;
    }
    if (part.kind === 'column') {
      out[part.alias] = row[part.alias];
      continue;
    }
    const related = resolveRelation(baseTable, row, part.alias, part.relName ?? part.alias);
    const isEmpty = related === null || (Array.isArray(related) && related.length === 0);
    if (part.inner && isEmpty) return null;
    if (Array.isArray(related)) {
      const relTable = getRelation(baseTable, row, part.alias, part.relName ?? part.alias)?.table ?? part.relName ?? part.alias;
      out[part.alias] = related.map((r) => projectRow(relTable, r, part.columns ?? [{ kind: 'star', alias: '*' }]));
    } else if (related) {
      const relTable = getRelation(baseTable, row, part.alias, part.relName ?? part.alias)?.table ?? part.relName ?? part.alias;
      out[part.alias] = projectRow(relTable, related, part.columns ?? [{ kind: 'star', alias: '*' }]);
    } else {
      out[part.alias] = null;
    }
  }
  return out;
}

function projectTable(baseTable: string, rows: DemoTable, select: string): DemoTable {
  const parts = parseSelect(select || '*');
  return rows.map((r) => projectRow(baseTable, r, parts)).filter((r): r is DemoRow => r !== null);
}

function sortRows(rows: DemoTable, orders: OrderSpec[]): DemoTable {
  if (orders.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      const av = a[o.column];
      const bv = b[o.column];
      if (av === bv) continue;
      if (av === null || av === undefined) return o.ascending ? -1 : 1;
      if (bv === null || bv === undefined) return o.ascending ? 1 : -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      if (cmp !== 0) return o.ascending ? cmp : -cmp;
    }
    return 0;
  });
}

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

interface ChannelHandler {
  event: string;
  config: { table?: string; filter?: string };
  callback: () => void;
}

const channels = new Set<DemoChannel>();

export class DemoChannel {
  readonly name: string;
  handlers: ChannelHandler[] = [];

  constructor(name: string) {
    this.name = name;
  }

  on(event: string, config: { table?: string; filter?: string }, callback: () => void): this {
    this.handlers.push({ event, config, callback });
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    channels.add(this);
    callback?.('SUBSCRIBED');
    return this;
  }

  unsubscribe(): void {
    channels.delete(this);
  }
}

function emitChange(table: string): void {
  for (const channel of channels) {
    for (const h of channel.handlers) {
      if (h.config.table !== table) continue;
      try {
        h.callback();
      } catch {
        // A listener throwing must never break the write.
      }
    }
  }
}

export function removeDemoChannel(channel: DemoChannel): void {
  channels.delete(channel);
}

/* ------------------------------------------------------------------ */
/* Query builder                                                       */
/* ------------------------------------------------------------------ */

export class DemoQuery<T = any> implements PromiseLike<DemoResponse<T>> {
  private readonly table: string;
  private operation: Operation = 'select';
  private selectString = '*';
  private selectOptions: SelectOptions = {};
  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitCount: number | null = null;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private payload: DemoRow[] | null = null;
  private conflictCols: string[] = [];

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', options: SelectOptions = {}): this {
    this.selectString = columns;
    this.selectOptions = options;
    if (this.operation === 'insert' || this.operation === 'update' || this.operation === 'upsert' || this.operation === 'delete') {
      // keep the mutation, but remember to project its result
      return this;
    }
    this.operation = 'select';
    return this;
  }

  insert(values: DemoRow | DemoRow[]): this {
    this.operation = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: DemoRow): this {
    this.operation = 'update';
    this.payload = [values];
    return this;
  }

  upsert(values: DemoRow | DemoRow[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}): this {
    this.operation = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    this.conflictCols = (options.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this { this.filters.push({ kind: 'eq', column, value }); return this; }
  neq(column: string, value: unknown): this { this.filters.push({ kind: 'neq', column, value }); return this; }
  gt(column: string, value: unknown): this { this.filters.push({ kind: 'gt', column, value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ kind: 'gte', column, value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ kind: 'lt', column, value }); return this; }
  lte(column: string, value: unknown): this { this.filters.push({ kind: 'lte', column, value }); return this; }
  in(column: string, values: unknown[]): this { this.filters.push({ kind: 'in', column, value: values }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ kind: 'is', column, value }); return this; }
  like(column: string, value: string): this { this.filters.push({ kind: 'like', column, value }); return this; }
  ilike(column: string, value: string): this { this.filters.push({ kind: 'ilike', column, value }); return this; }

  not(column: string, operator: string, value: unknown): this {
    this.filters.push({ kind: 'not', column, value, extra: operator });
    return this;
  }

  or(expression: string): this {
    // Supports the simple `col.op.value,col.op.value` shape used by the app.
    const clauses = splitTopLevel(expression).map((clause) => {
      const [col, op, ...rest] = clause.split('.');
      return { col: col ?? '', op: op ?? 'eq', value: rest.join('.') };
    });
    if (clauses.length === 0) return this;
    const rows = rowsOf(this.table);
    const matching = new Set<DemoRow>();
    for (const row of rows) {
      for (const c of clauses) {
        const val = row[c.col];
        const f: Filter = { kind: (c.op as FilterKind) ?? 'eq', column: c.col, value: c.value };
        if (applyFilterValue(val, f)) {
          matching.add(row);
          break;
        }
      }
    }
    // Encode the matching set as a filter on the identity field.
    this.filters.push({
      kind: 'in', column: idField(this.table),
      value: [...matching].map((r) => r[idField(this.table)]),
    });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.limitCount = to - from + 1;
    return this;
  }

  single(): this { this.singleMode = 'single'; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }

  private finish(data: any, error: DemoError | null = null, count: number | null = null): DemoResponse<T> {
    if (error) return { data: null as T, error, count, status: 400, statusText: 'Bad Request' };
    if (this.singleMode === 'single' && Array.isArray(data)) {
      if (data.length === 0) {
        return { data: null as T, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count, status: 406, statusText: 'Not Acceptable' };
      }
      return { data: data[0] as T, error: null, count, status: 200, statusText: 'OK' };
    }
    if (this.singleMode === 'maybe' && Array.isArray(data)) {
      return { data: (data[0] ?? null) as T, error: null, count, status: 200, statusText: 'OK' };
    }
    return { data: data as T, error: null, count, status: 200, statusText: 'OK' };
  }

  private normaliseInsert(values: DemoRow): DemoRow {
    const row = { ...values };
    if (row[idField(this.table)] === undefined) row[idField(this.table)] = nextDemoId(this.table);
    if (this.table === 'orders' && row.created_at === undefined) row.created_at = new Date().toISOString();
    if (this.table === 'profiles' && row.created_at === undefined) row.created_at = new Date().toISOString();
    return row;
  }

  private execute(): DemoResponse<T> {
    const rows = rowsOf(this.table);
    const id = idField(this.table);

    try {
      if (this.operation === 'insert') {
        const inserted: DemoRow[] = [];
        for (const raw of this.payload ?? []) {
          const row = this.normaliseInsert(raw);
          if (this.table === 'cart_items') {
            const existing = rows.find((r) => r.user_id === row.user_id && r.stock_id === row.stock_id);
            if (existing) {
              existing.quantity = (existing.quantity ?? 0) + (row.quantity ?? 1);
              inserted.push(existing);
              continue;
            }
          }
          if (this.table === 'wishlists') {
            const existing = rows.find((r) => r.user_id === row.user_id && r.medicine_id === row.medicine_id);
            if (existing) {
              inserted.push(existing);
              continue;
            }
          }
          rows.push(row);
          inserted.push(row);
        }
        saveDemoDb(getDemoDb());
        emitChange(this.table);
        return this.finish(this.selectString ? projectTable(this.table, inserted, this.selectString) : null);
      }

      if (this.operation === 'update') {
        const patch = this.payload?.[0] ?? {};
        const matched = rows.filter((r) => matchFilters(this.table, r, this.filters));
        for (const row of matched) Object.assign(row, patch);
        saveDemoDb(getDemoDb());
        emitChange(this.table);
        return this.finish(projectTable(this.table, matched, this.selectString));
      }

      if (this.operation === 'upsert') {
        const result: DemoRow[] = [];
        for (const raw of this.payload ?? []) {
          const conflict = this.conflictCols.length > 0
            ? (r: DemoRow) => this.conflictCols.every((c) => String(r[c]) === String(raw[c]))
            : (r: DemoRow) => (raw[id] !== undefined ? r[id] === raw[id] : false);
          const existing = rows.find(conflict);
          if (existing) {
            Object.assign(existing, raw);
            result.push(existing);
          } else {
            const row = this.normaliseInsert(raw);
            rows.push(row);
            result.push(row);
          }
        }
        saveDemoDb(getDemoDb());
        emitChange(this.table);
        return this.finish(projectTable(this.table, result, this.selectString));
      }

      if (this.operation === 'delete') {
        const matched = rows.filter((r) => matchFilters(this.table, r, this.filters));
        for (const row of matched) {
          const idx = rows.indexOf(row);
          if (idx >= 0) rows.splice(idx, 1);
        }
        saveDemoDb(getDemoDb());
        emitChange(this.table);
        return this.finish(null);
      }

      // select
      let matched = rows.filter((r) => matchFilters(this.table, r, this.filters));
      const count = this.selectOptions.count === 'exact' ? matched.length : null;
      matched = sortRows(matched, this.orders);
      if (this.limitCount !== null) matched = matched.slice(0, this.limitCount);
      if (this.selectOptions.head) return this.finish(null, null, count);
      return this.finish(projectTable(this.table, matched, this.selectString), null, count);
    } catch (err) {
      return this.finish(null, { message: err instanceof Error ? err.message : 'Demo database error' });
    }
  }

  then<TResult1 = DemoResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: DemoResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

/* ------------------------------------------------------------------ */
/* RPC / storage / functions                                           */
/* ------------------------------------------------------------------ */

interface CouponRow extends DemoRow {
  coupon_id: number; store_id: number; code: string; discount_type: 'percentage' | 'fixed';
  discount_value: number; min_order_amount: number; max_discount: number | null;
  start_date: string | null; end_date: string | null; usage_limit: number | null;
  used_count: number; is_active: boolean;
}

function evaluateCoupon(storeId: number, code: string, amount: number, redeem: boolean) {
  const coupons = rowsOf('coupons') as CouponRow[];
  const coupon = coupons.find((c) => c.store_id === storeId && c.code.toUpperCase() === code.toUpperCase());
  if (!coupon) return { success: false, message: 'Coupon code not found for this store.', discount_amount: 0 };
  if (!coupon.is_active) return { success: false, message: 'This coupon is no longer active.', discount_amount: 0 };
  if (coupon.start_date && new Date(coupon.start_date) > new Date()) return { success: false, message: 'This coupon is not active yet.', discount_amount: 0 };
  if (coupon.end_date && new Date(coupon.end_date) < new Date()) return { success: false, message: 'This coupon has expired.', discount_amount: 0 };
  if (amount < coupon.min_order_amount) return { success: false, message: `Minimum order value for this coupon is ₹${coupon.min_order_amount}.`, discount_amount: 0 };
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) return { success: false, message: 'This coupon has reached its usage limit.', discount_amount: 0 };

  let discount = coupon.discount_type === 'percentage'
    ? Math.round((amount * coupon.discount_value) / 100)
    : coupon.discount_value;
  if (coupon.max_discount !== null) discount = Math.min(discount, coupon.max_discount);
  discount = Math.min(discount, amount);

  if (redeem) {
    coupon.used_count += 1;
    saveDemoDb(getDemoDb());
    emitChange('coupons');
  }
  return { success: true, message: 'Coupon applied.', discount_amount: discount };
}

export function demoRpc(name: string, args: Record<string, any> = {}): Promise<DemoResponse<any[] | null>> {
  if (name === 'preview_coupon' || name === 'redeem_coupon') {
    const result = evaluateCoupon(Number(args.p_store_id), String(args.p_code ?? ''), Number(args.p_order_amount ?? 0), name === 'redeem_coupon');
    return Promise.resolve({ data: [result], error: null });
  }
  if (name === 'expire_stale_prescriptions') return Promise.resolve({ data: null, error: null });
  return Promise.resolve({ data: null, error: { message: `RPC ${name} is not available in demo mode.` } });
}

const demoFiles = new Map<string, { name: string; mime: string }>();

function prescriptionPreviewSvg(name: string): string {
  const safe = name.replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="840" viewBox="0 0 640 840">
  <rect width="640" height="840" fill="#f8fafc"/>
  <rect x="28" y="28" width="584" height="784" rx="18" fill="#ffffff" stroke="#c7d7f5" stroke-width="3"/>
  <text x="60" y="88" font-family="Georgia,serif" font-size="30" font-weight="bold" fill="#173e93">MediConnect</text>
  <text x="60" y="116" font-family="Arial,sans-serif" font-size="14" fill="#5b7088">Digital prescription · demo preview</text>
  <line x1="60" y1="140" x2="580" y2="140" stroke="#dbe6f7" stroke-width="2"/>
  <text x="60" y="190" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#0f2340">Rx</text>
  <text x="60" y="230" font-family="Arial,sans-serif" font-size="15" fill="#33475b">Paracetamol 500mg — 1-0-1 — 3 days</text>
  <text x="60" y="262" font-family="Arial,sans-serif" font-size="15" fill="#33475b">Cetirizine 10mg — 0-0-1 — 5 days</text>
  <text x="60" y="740" font-family="Arial,sans-serif" font-size="13" fill="#5b7088">Attached file: ${safe}</text>
  <text x="60" y="766" font-family="Arial,sans-serif" font-size="13" fill="#5b7088">This preview simulates a signed prescription file.</text>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export const demoStorage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File) {
        demoFiles.set(path, { name: file.name, mime: file.type || 'application/octet-stream' });
        return { data: { path }, error: null };
      },
      async createSignedUrl(path: string, _expires: number) {
        const entry = demoFiles.get(path);
        return { data: { signedUrl: prescriptionPreviewSvg(entry?.name ?? path.split('/').pop() ?? 'prescription.pdf') }, error: null };
      },
      async download(path: string) {
        return { data: new Blob([`demo:${path}`], { type: 'text/plain' }), error: null };
      },
    };
  },
};

export const demoFunctions = {
  async invoke(name: string, _options?: { body?: unknown }) {
    return {
      data: null,
      error: { message: `${name} is not configured in demo mode.`, name: 'DemoFunctionsUnavailable', context: undefined } as unknown as Error,
    };
  },
};

/** Used by the "Reset demo data" control. */
export function clearDemoChannels(): void {
  channels.clear();
}

export function demoClone<T>(value: T): T {
  return clone(value);
}
