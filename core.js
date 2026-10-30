(function(root){
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

root.GiveawayCore={emptyState,DrawError,eligible,active,randomIndex,compactRounds,transition};
})(typeof window!=="undefined"?window:globalThis);
