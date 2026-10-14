import {cookies} from 'next/headers';
import {cleanWhatsAppPhone} from './whatsapp';
import {tenantDB} from './tenant-db';
import {platformDB, selectedAgency, legacyAgencyId, Agency} from './platform';
import {defaults, type Settings, type RecordRow} from './domain';

export const portalCookie = 'shako_portal_session';

const PORTAL_SECRET = 'shako_b2b_portal_secret_key_2026_auth';

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type PortalTokenPayload = {
  customerId: string;
  customerName: string;
  phone: string;
  agencyId: string;
  exp: number;
};

/**
 * Creates a signed JWT-like token for portal session.
 */
export async function createPortalToken(payload: Omit<PortalTokenPayload, 'exp'>, hours = 72): Promise<string> {
  const fullPayload: PortalTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + hours * 3600
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = await hmacSign(body, PORTAL_SECRET);
  return `${body}.${signature}`;
}

/**
 * Verifies and decodes a portal token.
 */
export async function verifyPortalToken(token: string): Promise<PortalTokenPayload | null> {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expectedSig = await hmacSign(body, PORTAL_SECRET);
  if (expectedSig !== signature) return null;

  try {
    const payload: PortalTokenPayload = JSON.parse(base64UrlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function portalCookieHeader(token: string, req: Request, hours = 72): string {
  const isHttps = new URL(req.url).protocol === 'https:';
  return `${portalCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(hours * 3600)}${isHttps ? '; Secure' : ''}`;
}

export function clearPortalCookieHeader(req: Request): string {
  const isHttps = new URL(req.url).protocol === 'https:';
  return `${portalCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`;
}

/**
 * Helper to get active portal context from request cookies or Authorization header.
 */
export async function portalContext(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(portalCookie)?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('يرجى تسجيل الدخول إلى بوابة العملاء');
  }

  const payload = await verifyPortalToken(token);
  if (!payload) {
    throw new Error('انتهت صلاحية جلسة الدخول؛ يرجى تسجيل الدخول مجدداً');
  }

  const rawDB = platformDB();
  const agencyId = payload.agencyId || legacyAgencyId;
  const agencyRow = await rawDB.prepare('SELECT * FROM platform_agencies WHERE id = ?').bind(agencyId).first<Agency>();
  if (!agencyRow) {
    throw new Error('الوكالة غير موجودة أو معطلة');
  }

  const db = tenantDB(rawDB, agencyRow.namespace);
  const sysRow = await db.prepare('SELECT payload FROM system_settings WHERE id = 1').first<any>();
  const settings: Settings = sysRow ? { ...defaults, ...JSON.parse(sysRow.payload) } : defaults;

  const customerRow = await db.prepare("SELECT * FROM records WHERE id = ? AND kind = 'customer'").bind(payload.customerId).first<any>();
  if (!customerRow) {
    throw new Error('حساب العميل غير موجود');
  }

  const customer: RecordRow = {
    ...customerRow,
    payload: JSON.parse(customerRow.payload),
    createdAt: customerRow.created_at,
    updatedAt: customerRow.updated_at
  };

  return {
    customer,
    agency: agencyRow,
    settings,
    database: db,
    rawDatabase: rawDB
  };
}
