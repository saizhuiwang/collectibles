const emptyState = () => ({ names: [], remove: true, configRevision: 0, rounds: [], updatedAt: 0 });
class DrawError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
function eligible(s) { const won = new Set(s.rounds.map(r => r.winner)); return s.names.filter(n => !s.remove || !won.has(n)); }
function active(s, now = Date.now()) { const r = s.rounds.at(-1); return r && r.endsAt > now ? r : null; }
function randomIndex(n) { const a = new Uint32Array(1), limit = Math.floor(4294967296 / n) * n; do {
    crypto.getRandomValues(a);
} while (a[0] >= limit); return a[0] % n; }
function compactRounds(rounds) { return rounds.map((r, i) => ({ ...r, participantCount: r.participantCount ?? r.names.length, names: i === rounds.length - 1 ? r.names : [] })); }
function transition(s, input, now = Date.now()) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new DrawError('Invalid request.');
    if (input.action === 'save') {
        if (input.configRevision !== s.configRevision)
            throw new DrawError('The list changed on another device. Reload the latest list before saving.', 409);
        if (!Array.isArray(input.names) || input.names.some((n) => typeof n !== 'string' || n.trim().length > 120))
            throw new DrawError('Each name must be text, up to 120 characters.');
        const names = [...new Set(input.names.map((n) => n.trim()).filter(Boolean))];
        if (!names.length || names.length > 2000)
            throw new DrawError('Enter between 1 and 2,000 unique participants.');
        if (typeof input.remove !== 'boolean')
            throw new DrawError('Invalid repeat-winner setting.');
        return { ...s, rounds: compactRounds(s.rounds), names, remove: input.remove, configRevision: s.configRevision + 1, updatedAt: now };
    }
    if (input.action === 'draw') {
        if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId))
            throw new DrawError('Invalid draw request.');
        if (s.rounds.some(r => r.requestId === input.requestId))
            return s;
        if (active(s, now))
            throw new DrawError('A draw is already in progress. This round’s list is locked.', 409);
        const names = eligible(s);
        if (!names.length)
            throw new DrawError('No eligible participants. Add names in the management page.');
        const selected = randomIndex(names.length);
        const round = { id: crypto.randomUUID(), requestId: input.requestId, names: [...names], selected, winner: names[selected], startedAt: now, endsAt: now + 6500, configRevision: s.configRevision };
        return { ...s, rounds: compactRounds([...s.rounds, round]), updatedAt: now };
    }
    if (input.action === 'reset') {
        if (input.lastRoundId !== (s.rounds.at(-1)?.id ?? null))
            throw new DrawError('A new draw was recorded. Reload before resetting history.', 409);
        if (active(s, now))
            throw new DrawError('Wait for the current draw to finish before resetting.', 409);
        if (input.configRevision !== s.configRevision)
            throw new DrawError('The list changed. Reload before resetting.', 409);
        return { ...s, rounds: [], configRevision: s.configRevision + 1, updatedAt: now };
    }
    throw new DrawError('Unknown action.');
}

class BodyError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
async function readJson(request, limit = 1_000_000) {
    const length = request.headers.get('content-length');
    if (length && Number(length) > limit)
        throw new BodyError('Request is too large.', 413);
    if (!request.body)
        throw new BodyError('Empty request.', 400);
    const reader = request.body.getReader(), decoder = new TextDecoder();
    let bytes = 0, text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            bytes += value.byteLength;
            if (bytes > limit) {
                await reader.cancel();
                throw new BodyError('Request is too large.', 413);
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return JSON.parse(text);
    }
    catch (e) {
        if (e instanceof BodyError)
            throw e;
        throw new BodyError('Invalid JSON request.', 400);
    }
    finally {
        reader.releaseLock();
    }
}


const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, If-None-Match','Access-Control-Expose-Headers':'ETag','Cache-Control':'no-store'};
function reply(value,status=200,extra={}){return new Response(value===null?null:JSON.stringify(value),{status,headers:{...headers,...extra}})}
export default {async fetch(request,env){
 if(request.method==='OPTIONS')return reply(null,204);
 if(new URL(request.url).pathname!=='/api/session')return reply({ok:true,service:'Collectibles shared draw',endpoint:'/api/session'});
 if(!env.DB)return reply({error:'D1 binding DB is not configured.'},503);
 async function read(){const row=await env.DB.prepare('SELECT revision, payload FROM giveaway_state WHERE id = ?').bind('main').first();return row?{revision:row.revision,state:JSON.parse(row.payload)}:{revision:0,state:emptyState()}}
 try{
  if(request.method==='GET'){const row=await read(),etag='W/"state-'+row.revision+'"';if(request.headers.get('if-none-match')===etag)return reply(null,304,{ETag:etag});return reply({...row,canOperate:true,serverNow:Date.now()},200,{ETag:etag})}
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Use JSON.'},415);
  const input=await readJson(request);
  for(let i=0;i<8;i++){const row=await read(),next=transition(row.state,input);if(next===row.state)return reply({...row,canOperate:true,serverNow:Date.now()});const payload=JSON.stringify(next);if(new TextEncoder().encode(payload).length>1800000)return reply({error:'Export results and reset old history before continuing.'},413);const statement=row.revision===0?env.DB.prepare('INSERT OR IGNORE INTO giveaway_state (id, revision, payload) VALUES (?, ?, ?)').bind('main',1,payload):env.DB.prepare('UPDATE giveaway_state SET revision = ?, payload = ? WHERE id = ? AND revision = ?').bind(row.revision+1,payload,'main',row.revision);const result=await statement.run();if(result.meta.changes===1)return reply({revision:row.revision+1,state:next,canOperate:true,serverNow:Date.now()})}
  return reply({error:'Another update is in progress. Retry.'},409);
 }catch(e){if(e instanceof DrawError||e instanceof BodyError)return reply({error:e.message},e.status);return reply({error:'Shared storage unavailable. Use local fallback or check D1 configuration.'},503)}
}};
