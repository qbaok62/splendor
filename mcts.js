'use strict';
// Máy "Cao thủ": Monte Carlo có xáo lại thông tin ẩn (determinization) + UCB ở gốc.
// Mỗi lần giả lập: xáo lại chồng bài và thẻ úp của đối thủ (máy không được nhìn trộm),
// đi thử 1 nước ở gốc, rồi để máy thường chơi tiếp vài vòng và chấm thế cờ.
// Chạy theo thời gian (ms) nên tự co giãn theo sức CPU của server.
const E = require('./engine');
const B = require('./bot');
const { CARDS, NOBLES, COLORS, WIN_POINTS } = E;

const NOLOG = { push() {}, shift() {}, length: 0 };
const ROLL_STYLES = ['balanced', 'balanced', 'noble', 'rush'];

function clone(g) {
  return {
    players: g.players.map((p) => ({
      id: p.id, name: p.name, tokens: { ...p.tokens }, cards: p.cards.slice(), nobles: p.nobles.slice(),
      cities: (p.cities || []).slice(), posts: (p.posts || []).slice(),
      reservedNobles: (p.reservedNobles || []).slice(), cardBonuses: { ...(p.cardBonuses || {}) },
      reserved: p.reserved.map((r) => ({ id: r.id, fromDeck: r.fromDeck })), st: { take: 0, reserve: 0, buy: 0 },
    })),
    bank: { ...g.bank }, decks: { 1: g.decks[1].slice(), 2: g.decks[2].slice(), 3: g.decks[3].slice() },
    board: { 1: g.board[1].slice(), 2: g.board[2].slice(), 3: g.board[3].slice() },
    orientDecks: g.orientDecks ? { 1: g.orientDecks[1].slice(), 2: g.orientDecks[2].slice(), 3: g.orientDecks[3].slice() } : null,
    orientBoard: g.orientBoard ? { 1: g.orientBoard[1].slice(), 2: g.orientBoard[2].slice(), 3: g.orientBoard[3].slice() } : null,
    nobles: g.nobles.slice(), cities: (g.cities || []).slice(), turn: g.turn, phase: g.phase, finalRound: g.finalRound, winners: null,
    expansions: { ...g.expansions }, cityClaimed: g.cityClaimed,
    strongholds: g.strongholds ? { 1: g.strongholds[1].map((x) => x.slice()), 2: g.strongholds[2].map((x) => x.slice()), 3: g.strongholds[3].map((x) => x.slice()) } : null,
    pendingRefills: (g.pendingRefills || []).map((x) => ({ ...x })), postToken: g.postToken ? { ...g.postToken } : null,
    strongholdAfter: g.strongholdAfter,
    orientQueue: (g.orientQueue || []).map((x) => ({ ...x })), orientMain: g.orientMain, orientAfterConquest: g.orientAfterConquest,
    orientFx: g.orientFx ? { ...g.orientFx } : null,
    log: NOLOG, round: g.round, series: NOLOG,
  };
}

function shuffleIn(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

// Thông tin máy không được biết: thứ tự chồng bài + thẻ úp đối thủ giữ từ chồng.
function determinize(g, meId) {
  const s = clone(g);
  for (const l of [1, 2, 3]) {
    const hidden = [];
    for (const p of s.players) if (p.id !== meId) for (const r of p.reserved) if (r.fromDeck && CARDS[r.id].level === l) hidden.push(r);
    const pool = shuffleIn(s.decks[l].concat(hidden.map((r) => r.id)));
    hidden.forEach((r) => { r.id = pool.pop(); });
    s.decks[l] = pool;
  }
  if (s.orientDecks) for (const l of [1, 2, 3]) s.orientDecks[l] = shuffleIn(s.orientDecks[l]);
  return s;
}

// Các nước đi ở gốc: lấy từ máy thường (đã có điểm sơ bộ) + giữ thẻ úp từ chồng, rồi cắt bớt.
function rootMoves(g, p, k, w) {
  const cs = B.candidates(g, p, B.STYLES.balanced, w);
  if (p.reserved.length < E.MAX_RESERVED) for (const l of [1, 2, 3]) if (g.decks[l].length) cs.push({ s: -0.5, a: { type: 'reserve', level: l, index: -1 } });
  cs.sort((x, y) => y.s - x.s);
  const out = [], seen = new Set();
  for (const c of cs) {
    const key = JSON.stringify(c.a); if (seen.has(key)) continue;
    const t = clone(g);
    try { E.apply(t, p.id, c.a); } catch (e) { continue; }
    seen.add(key); out.push(c.a);
    if (out.length >= k) break;
  }
  return out;
}

// Chấm thế cờ (chưa hết ván): điểm + giá trị bonus/đá/quý tộc sắp đạt, so với đối thủ mạnh nhất.
function strength(g, p) {
  const b = E.bonuses(p);
  let v = E.points(p) + 0.45 * p.cards.length + 0.08 * (E.sum(p.tokens) + p.tokens.gold) + (p.cities || []).length * 4;
  for (const cid of g.cities || []) {
    const city = E.CITY_TILES[cid];
    if (E.cityMet(city, b) && E.points(p) >= city.points) v += 10;
  }
  for (const nid of g.nobles) {
    let miss = 0; for (const [c, n] of Object.entries(NOBLES[nid].req)) miss += Math.max(0, n - b[c]);
    if (miss <= 3) v += (3 - miss) * 0.5;
  }
  for (const r of p.reserved) if (E.payment(p, CARDS[r.id])) v += CARDS[r.id].points * 0.5;
  return v;
}
function evaluate(g, meId) {
  if (g.phase === 'over') return g.winners.includes(meId) ? 1 / g.winners.length : 0;
  let me = 0, best = -Infinity;
  for (const p of g.players) { const v = strength(g, p); if (p.id === meId) me = v; else best = Math.max(best, v); }
  return 1 / (1 + Math.exp(-(me - best) / 2.5));
}

function rollout(s, meId, maxTurns, o) {
  const rs = o.rollStyles || ROLL_STYLES, styleOf = {}; s.players.forEach((p, i) => { styleOf[p.id] = rs[i % rs.length]; });
  let steps = 0;
  while (s.phase !== 'over' && steps++ < maxTurns * 3) {
    const p = s.players[s.turn];
    try { B.play(s, p.id, styleOf[p.id], o.w); } catch (e) { break; }
    if (s.phase === 'main' && steps >= maxTurns && !s.finalRound) break;
  }
  return evaluate(s, meId);
}

function think(g, meId, ms = 1500, opts = {}) {
  const p = g.players[g.turn];
  if (p.id !== meId || g.phase !== 'main') return B.choose(g, meId, 'balanced');
  const moves = rootMoves(g, p, opts.width || 10, opts.w);
  if (moves.length <= 1) return moves[0] || { type: 'pass' };
  // Gần hết ván thì giả lập đến cuối; còn sớm thì nhìn trước ~2 vòng.
  const lead = Math.max(...g.players.map(E.points));
  const depth = opts.depth || (lead >= WIN_POINTS - 5 ? 60 : g.players.length * 2 + 2);
  const n = moves.map(() => 0), w = moves.map(() => 0);
  const end = Date.now() + ms;
  let sims = 0;
  while (Date.now() < end && sims < (opts.maxSims || 1e9)) {
    let bi = 0, bv = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const u = n[i] ? w[i] / n[i] + 0.9 * Math.sqrt(Math.log(sims + 1) / n[i]) : 1e9 - i;
      if (u > bv) { bv = u; bi = i; }
    }
    const s = determinize(g, meId);
    let r;
    try { E.apply(s, meId, moves[bi]); r = rollout(s, meId, depth, opts); } catch (e) { r = 0; }
    n[bi]++; w[bi] += r; sims++;
  }
  let best = 0; for (let i = 1; i < moves.length; i++) if (n[i] > n[best] || (n[i] === n[best] && w[i] > w[best])) best = i;
  if (opts.stats) opts.stats.sims = sims;
  return moves[best];
}

module.exports = { think };
