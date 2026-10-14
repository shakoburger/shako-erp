// Universal mock for cloudflare:workers when running in Next.js / Node.js / Vercel
export const env: any = (globalThis as any).env || {};
export class WorkerEntrypoint {}
export default { env };
