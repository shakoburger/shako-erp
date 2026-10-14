import {cookies} from 'next/headers';
export const sessionCookie='shako_agency_session';
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const unhex=(value:string)=>Uint8Array.from(value.match(/../g)||[],x=>parseInt(x,16));
export async function passwordDigest(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),{name:'PBKDF2'},false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:210000},key,256)))}
export async function passwordRecord(password:string){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await passwordDigest(password,salt)}}
export async function passwordMatches(password:string,salt:string,expected:string){const actual=await passwordDigest(password,salt);let difference=actual.length^expected.length;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^(expected.charCodeAt(i)||0);return difference===0}
export async function tokenHash(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
export function newToken(){return hex(crypto.getRandomValues(new Uint8Array(32)))}
export async function currentSession(database:any,user:any,member:any){const token=(await cookies()).get(sessionCookie)?.value;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const hash=await tokenHash(token);const row=await database.prepare('SELECT token_hash FROM agency_sessions WHERE token_hash=? AND user_id=? AND email=? AND password_version=? AND expires_at>?').bind(hash,user.userId,user.email.toLowerCase(),member.password_version,new Date().toISOString()).first();return row?hash:null}
export function cookieHeader(token:string,req:Request,hours:number){return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.round(hours*3600)}${new URL(req.url).protocol==='https:'?'; Secure':''}`}
