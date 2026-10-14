const tables=new Set(['system_settings','members','agency_sessions','records','audit_log']);
const statements=new WeakMap<object,{namespace:string;raw:D1PreparedStatement}>();
export function tenantSQL(sql:string,namespace:string){
 if(namespace!=='legacy'&&!/^a_[a-f0-9]{32}_$/.test(namespace))throw new Error('Invalid agency namespace');
 return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|--[^\r\n]*|\/\*[\s\S]*?\*\/|\b[a-zA-Z_][a-zA-Z_0-9]*\b/g,token=>{
  if(token.startsWith("'")||token.startsWith('--')||token.startsWith('/*'))return token;
  const quoted=['"','`','['].includes(token[0]),name=(quoted?token.slice(1,-1):token).toLowerCase();
  if(/^a_[a-f0-9]{32}_/.test(name)&&(namespace==='legacy'||!name.startsWith(namespace)))throw new Error('Cross-agency SQL rejected');
  if(namespace==='legacy'||!tables.has(name))return token;
  return quoted?token[0]+namespace+name+token.at(-1):namespace+name;
 });
}
export function tenantDB(raw:D1Database,namespace:string):D1Database{
 tenantSQL('',namespace);
 function wrap(statement:D1PreparedStatement):D1PreparedStatement{
  const result={bind:(...values:any[])=>wrap(statement.bind(...values)),first:<T=unknown>(column?:string)=>column===undefined?statement.first<T>():statement.first<T>(column),all:<T=unknown>()=>statement.all<T>(),run:<T=unknown>()=>statement.run<T>(),raw:<T=unknown>(options?:any)=>statement.raw<T>(options)} as D1PreparedStatement;
  statements.set(result,{namespace,raw:statement});return result;
 }
 return {prepare:(sql:string)=>wrap(raw.prepare(tenantSQL(sql,namespace))),batch:<T=unknown>(items:D1PreparedStatement[])=>raw.batch<T>(items.map(item=>{const entry=statements.get(item);if(!entry||entry.namespace!==namespace)throw new Error('Cross-agency batch rejected');return entry.raw})),exec:()=>{throw new Error('Use agency migration tools')},dump:()=>{throw new Error('Use authorized agency backup')}} as unknown as D1Database;
}
export function agencyDDL(namespace:string){
 if(!/^a_[a-f0-9]{32}_$/.test(namespace))throw new Error('Invalid agency namespace');
 const t=(name:string)=>namespace+name;
 return [
 `CREATE TABLE ${t('system_settings')} (id INTEGER PRIMARY KEY,owner_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)`,
 `CREATE TABLE ${t('members')} (email TEXT PRIMARY KEY,user_id TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'viewer',permissions TEXT,revision INTEGER NOT NULL DEFAULT 1,password_hash TEXT,password_salt TEXT,password_version INTEGER NOT NULL DEFAULT 0,force_password_change INTEGER NOT NULL DEFAULT 1,failed_attempts INTEGER NOT NULL DEFAULT 0,locked_until TEXT)`,
 `CREATE TABLE ${t('agency_sessions')} (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,email TEXT NOT NULL,password_version INTEGER NOT NULL,expires_at TEXT NOT NULL)`,
 `CREATE TABLE ${t('records')} (id TEXT PRIMARY KEY,kind TEXT NOT NULL,module TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,date TEXT NOT NULL,currency TEXT NOT NULL,amount INTEGER NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE UNIQUE INDEX ${namespace}records_kind_code ON ${t('records')} (kind,code)`,
 `CREATE TABLE ${t('audit_log')} (id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,created_at TEXT NOT NULL)`];
}
