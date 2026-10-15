import { z } from 'zod';
import { handled, json, body, sameOrigin, APIError } from '@/lib/server';
import { platformContext, platformAudit } from '@/lib/platform';
import { passwordRecord } from '@/lib/agency-security';

export async function GET() {
  return handled(async () => {
    const c = await platformContext();
    const sysRow = (await c.database.prepare('SELECT owner_id, payload FROM system_settings WHERE id = 1').first()) as any;
    let sysPayload: any = {};
    try {
      sysPayload = sysRow?.payload ? JSON.parse(sysRow.payload) : {};
    } catch {}

    const ownerAuth = sysPayload?.ownerAuth || {};

    return json({
      username: ownerAuth.username || 'owner',
      name: ownerAuth.name || c.user.displayName || 'مالك المنصة الأساسي',
      email: ownerAuth.email || c.user.email || 'owner@shako.com',
      phone: ownerAuth.phone || sysPayload.supportPhone || '',
      hasCustomPassword: Boolean(ownerAuth.passwordHash),
      updatedAt: ownerAuth.updatedAt || null,
    });
  });
}

export async function POST(req: Request) {
  return handled(async () => {
    sameOrigin(req);
    const c = await platformContext();

    const schema = z.object({
      username: z.string().trim().min(2, 'اسم المستخدم يجب أن يتكون من حرفين على الأقل').max(50),
      password: z.string().min(6, 'كلمة المرور يجب أن تتكون من 6 أحرف على الأقل').max(128).optional().or(z.literal('')),
      name: z.string().trim().max(100).optional(),
      email: z.string().email('البريد الإلكتروني غير صحيح').optional().or(z.literal('')),
      phone: z.string().trim().max(50).optional().or(z.literal('')),
    });

    const b = schema.parse(await body(req));

    const sysRow = (await c.database.prepare('SELECT owner_id, payload FROM system_settings WHERE id = 1').first()) as any;
    if (!sysRow) {
      throw new APIError(500, 'إعدادات النظام غير مهيأة');
    }

    let payload: any = {};
    try {
      payload = JSON.parse(sysRow.payload);
    } catch {
      payload = {};
    }

    const currentOwnerAuth = payload.ownerAuth || {};
    const newOwnerAuth: any = {
      ...currentOwnerAuth,
      username: b.username.toLowerCase(),
      name: b.name || currentOwnerAuth.name || c.user.displayName || 'مالك المنصة الأساسي',
      email: b.email ? b.email.toLowerCase() : (currentOwnerAuth.email || 'owner@shako.com'),
      phone: b.phone !== undefined ? b.phone.trim() : (currentOwnerAuth.phone || ''),
      updatedAt: new Date().toISOString(),
    };

    if (b.phone !== undefined) {
      payload.supportPhone = b.phone.trim();
      if (!payload.ownerAuth) {
        payload.ownerAuth = {};
      }
      payload.ownerAuth.phone = b.phone.trim();
    }

    let passwordChanged = false;
    if (b.password && b.password.trim()) {
      const pwd = await passwordRecord(b.password.trim());
      newOwnerAuth.passwordHash = pwd.hash;
      newOwnerAuth.passwordSalt = pwd.salt;
      newOwnerAuth.passwordVersion = (currentOwnerAuth.passwordVersion || 0) + 1;
      passwordChanged = true;
    }

    payload.ownerAuth = newOwnerAuth;

    const now = new Date().toISOString();
    await c.database
      .prepare('UPDATE system_settings SET payload = ?, updated_at = ? WHERE id = 1')
      .bind(JSON.stringify(payload), now)
      .run();

    // Mirror to local SQLite file if it exists on disk
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const sqlModule: any = await import('sql.js' as any);
      const initSqlite = sqlModule.default || sqlModule;
      const dbPath = path.resolve(process.cwd(), 'shako.sqlite');
      if (fs.existsSync(dbPath)) {
        const SQL = await initSqlite();
        const diskDb = new SQL.Database(fs.readFileSync(dbPath));
        diskDb.run('UPDATE system_settings SET payload = ?, updated_at = ? WHERE id = 1', [JSON.stringify(payload), now]);
        const data = diskDb.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
      }
    } catch {}

    await platformAudit(
      c.database,
      c.user.email,
      '00000000-0000-4000-8000-000000000001',
      'تحديث بيانات دخول مالك المنصة (اسم المستخدم / كلمة المرور)',
      { username: currentOwnerAuth.username || 'owner' },
      { username: newOwnerAuth.username, passwordChanged, updatedAt: now }
    ).run();

    // Re-issue updated session cookie so the browser session reflects new credentials immediately
    const userSessionObj = {
      userId: c.user.userId,
      email: newOwnerAuth.email,
      displayName: newOwnerAuth.name,
      role: 'owner',
      agencyId: '00000000-0000-4000-8000-000000000001',
      isOwner: true,
      redirectTo: '/',
    };
    const userSessionEncoded = encodeURIComponent(JSON.stringify(userSessionObj));
    const isHttps = new URL(req.url).protocol === 'https:';
    const secureFlag = isHttps ? '; Secure' : '';

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.append(
      'Set-Cookie',
      `shako_auth_user=${userSessionEncoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secureFlag}`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        username: newOwnerAuth.username,
        name: newOwnerAuth.name,
        email: newOwnerAuth.email,
        phone: newOwnerAuth.phone,
        passwordChanged,
      }),
      { status: 200, headers }
    );
  });
}
