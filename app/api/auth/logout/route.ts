import {sessionCookie} from '@/lib/agency-security';

export async function POST(req: Request) {
  return handleLogout(req);
}

export async function GET(req: Request) {
  return handleLogout(req);
}

function handleLogout(req: Request) {
  const isHttps = new URL(req.url).protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  // Clear shako_auth_user
  headers.append('Set-Cookie', `shako_auth_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);

  // Clear __sites_local_auth
  headers.append('Set-Cookie', `__sites_local_auth=0; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);

  // Clear shako_agency_session
  headers.append('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
}
