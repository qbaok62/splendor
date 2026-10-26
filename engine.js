'use strict';
// Luật Splendor (bản gốc Space Cowboys). Server giữ trạng thái chuẩn, client chỉ nhận "view".
const DATA = require('./public/data.js');
const ORIENT_DATA = require('./public/orient-data.js');
const { tr, normalizeLang } = require('./public/i18n.js');
const COLORS = ['white', 'blue', 'green', 'red', 'black'];
const ALL = [...COLORS, 'gold'];
const ORIENT_CARDS = ORIENT_DATA.cards;
const CARDS = DATA.cards.concat(ORIENT_CARDS);
const NOBLES = DATA.nobles;
const WIN_POINTS = 15;
const MAX_TOKENS = 10;
const MAX_RESERVED = 3;
const MAX_STRONGHOLDS = 3;
const MAX_UNDO_ACTIONS = 64;
const EXPANSIONS = [
  { id: 'cities', name: 'Thành phố', desc: 'Thay quý tộc bằng 3 thành phố; chiếm thành phố để kết thúc ván.', nameKey: 'expansion.cities.name', descKey: 'expansion.cities.desc' },
  { id: 'tradingPosts', name: 'Thương điếm', desc: 'Mở khoá 5 quyền năng khi đủ bộ bonus.', nameKey: 'expansion.tradingPosts.name', descKey: 'expansion.tradingPosts.desc' },
  { id: 'strongholds', name: 'Thành trì', desc: 'Chiếm thẻ, chặn đối thủ và mở nước mua thẻ sau lượt.', nameKey: 'expansion.strongholds.name', descKey: 'expansion.strongholds.desc' },
  { id: 'orient', name: 'Phương Đông', desc: 'Thêm 30 thẻ với hiệu ứng sao chép, nhận thẻ miễn phí, giữ quý tộc và vàng ảo.', nameKey: 'expansion.orient.name', descKey: 'expansion.orient.desc' },
];
const EXPANSION_IDS = EXPANSIONS.map((x) => x.id);
const DEFAULT_EXPANSIONS = Object.fromEntries(EXPANSION_IDS.map((id) => [id, false]));

const CITY_TILES = [
  { id: 0, points: 13, req: { red: 4, black: 3 }, same: 0 },
  { id: 1, points: 13, req: { white: 3, blue: 4 }, same: 0 },
  { id: 2, points: 17, req: {}, same: 0 },
  { id: 3, points: 13, req: { green: 3, black: 4 }, same: 0 },
  { id: 4, points: 13, req: { white: 4, red: 3 }, same: 0 },
  { id: 5, points: 16, req: { white: 1, blue: 1, green: 1, red: 1, black: 1 }, same: 0 },
  { id: 6, points: 11, req: { white: 3, blue: 3, red: 3, black: 3 }, same: 0 },
  { id: 7, points: 12, req: {}, same: 6 },
  { id: 8, points: 14, req: { green: 4 }, same: 4 },
  { id: 9, points: 14, req: { white: 2, blue: 1, green: 1, red: 2, black: 2 }, same: 0 },
  { id: 10, points: 11, req: { white: 3, green: 3, red: 3, black: 3 }, same: 0 },
  { id: 11, points: 15, req: {}, same: 5 },
  { id: 12, points: 13, req: { blue: 3, green: 4 }, same: 0 },
  { id: 13, points: 13, req: { white: 2, blue: 2, green: 2, red: 2, black: 2 }, same: 0 },
  { id: 14, points: 12, req: { white: 3, green: 1, red: 6 }, same: 0 },
];

const TRADING_POSTS = [
  { id: 'purchaseToken', name: 'Thương điếm đỏ', req: { red: 3, white: 1 }, icon: '🪙', text: 'Sau khi mua thẻ, lấy 1 viên không phải vàng — kể cả viên vừa trả.', nameKey: 'tradingPost.purchaseToken.name', textKey: 'tradingPost.purchaseToken.text' },
  { id: 'doubleToken', name: 'Thương điếm trắng', req: { white: 2 }, icon: '💎', text: 'Khi lấy 2 viên cùng màu, lấy thêm 1 viên màu khác.', nameKey: 'tradingPost.doubleToken.name', textKey: 'tradingPost.doubleToken.text' },
  { id: 'goldDouble', name: 'Thương điếm lam', req: { blue: 3, black: 1 }, icon: '🟡', text: 'Mỗi viên vàng có giá trị 2 viên cùng màu khi mua thẻ.', nameKey: 'tradingPost.goldDouble.name', textKey: 'tradingPost.goldDouble.text' },
  { id: 'noblePoints', name: 'Thương điếm lục', req: { green: 5 }, needsNoble: true, icon: '👑', text: 'Nhận ngay 5 điểm (chỉ một lần).', nameKey: 'tradingPost.noblePoints.name', textKey: 'tradingPost.noblePoints.text' },
  { id: 'coatPoints', name: 'Thương điếm hắc', req: { black: 3 }, icon: '🛡️', text: 'Mỗi thương điếm đã chiếm cho 1 điểm.', nameKey: 'tradingPost.coatPoints.name', textKey: 'tradingPost.coatPoints.text' },
];

function msg(g, key, vars) { return tr(g && g.lang, key, vars); }
function colorName(lang, color) { return tr(lang, 'color.' + color); }

function normalizeExpansions(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(EXPANSION_IDS.map((id) => [id, !!src[id]]));
}

function shuffle(a, rnd = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const zero = () => ({ white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 });
const sum = (t) => ALL.reduce((s, c) => s + (t[c] || 0), 0);
function undoStack(g) {
  if (!Object.prototype.hasOwnProperty.call(g, 'undo')) {
    Object.defineProperty(g, 'undo', { value: [], writable: true, enumerable: false, configurable: true });
  }
  return g.undo;
}
function resetUndo(g) { undoStack(g).length = 0; }
function canUndo(g, playerId) {
  return g.phase !== 'over' && g.players[g.turn].id === playerId && undoStack(g).length > 0;
}
function undo(g, playerId) {
  if (g.phase === 'over') throw new Error(msg(g, 'error.gameOver'));
  if (g.players[g.turn].id !== playerId) throw new Error(msg(g, 'error.notYourTurn'));
  const stack = undoStack(g);
  if (!stack.length) throw new Error(msg(g, 'error.noUndo'));
  const before = stack.pop();
  for (const key of Object.keys(g)) delete g[key];
  Object.assign(g, before);
}

function newGame(players, options = {}) {
  if (typeof options === 'function') options = { rnd: options };
  const rnd = options.rnd || Math.random;
  const expansions = normalizeExpansions(options.expansions || options);
  const lang = normalizeLang(options.lang);
  const n = players.length;
  if (n < 2 || n > 4) throw new Error(tr(lang, 'error.players'));
  const per = n === 2 ? 4 : n === 3 ? 5 : 7;
  const bank = zero();
  COLORS.forEach((c) => (bank[c] = per));
  bank.gold = 5;
  const decks = {}, board = {};
  [1, 2, 3].forEach((l) => {
    decks[l] = shuffle(CARDS.filter((c) => c.level === l && !c.orient).map((c) => c.id), rnd);
    board[l] = [];
    for (let i = 0; i < 4; i++) board[l].push(decks[l].pop());
  });
  const orientDecks = {}, orientBoard = {};
  if (expansions.orient) [1, 2, 3].forEach((l) => {
    orientDecks[l] = shuffle(ORIENT_CARDS.filter((c) => c.level === l).map((c) => c.id), rnd);
    orientBoard[l] = [];
    for (let i = 0; i < 2; i++) orientBoard[l].push(orientDecks[l].pop());
  });
  const order = shuffle(players, rnd); // người đi đầu ngẫu nhiên
  const g = {
    players: order.map((p) => ({
      id: p.id, name: p.name, tokens: zero(), cards: [], reserved: [], nobles: [], cities: [], posts: [],
      reservedNobles: [], cardBonuses: {},
      st: { take: 0, reserve: 0, buy: 0 },
    })),
    bank, decks, board,
    orientDecks: expansions.orient ? orientDecks : null,
    orientBoard: expansions.orient ? orientBoard : null,
    nobles: expansions.cities ? [] : shuffle(NOBLES.map((x) => x.id), rnd).slice(0, n + 1),
    cities: expansions.cities ? shuffle(CITY_TILES.map((x) => x.id), rnd).slice(0, 3) : [],
    strongholds: expansions.strongholds ? { 1: Array.from({ length: expansions.orient ? 6 : 4 }, () => []), 2: Array.from({ length: expansions.orient ? 6 : 4 }, () => []), 3: Array.from({ length: expansions.orient ? 6 : 4 }, () => []) } : null,
    pendingRefills: [], expansions, cityClaimed: false,
    lang,
    orientQueue: [], orientMain: false, orientAfterConquest: false, orientFx: null,
    turn: 0, phase: 'main', // main | discard | noble | over
    finalRound: false, winners: null, log: [], round: 1, series: [],
  };
  addLog(g, msg(g, 'log.start', { name: g.players[0].name }));
  const active = EXPANSIONS.filter((x) => expansions[x.id]).map((x) => tr(lang, x.nameKey));
  if (active.length) addLog(g, msg(g, 'log.expansions', { names: active.join(', ') }));
  resetUndo(g);
  return g;
}

function upgradeGame(g) {
  g.lang = normalizeLang(g.lang);
  g.expansions = normalizeExpansions(g.expansions);
  g.cities = g.cities || [];
  g.cityClaimed = !!g.cityClaimed;
  g.pendingRefills = g.pendingRefills || [];
  g.orientQueue = g.orientQueue || [];
  g.orientMain = !!g.orientMain;
  g.orientAfterConquest = !!g.orientAfterConquest;
  for (const p of g.players) {
    p.cities = p.cities || [];
    p.posts = p.posts || [];
    p.reservedNobles = p.reservedNobles || [];
    p.cardBonuses = p.cardBonuses || {};
  }
  if (g.expansions.strongholds && !g.strongholds) {
    const slots = g.expansions.orient ? 6 : 4;
    g.strongholds = { 1: Array.from({ length: slots }, () => []), 2: Array.from({ length: slots }, () => []), 3: Array.from({ length: slots }, () => []) };
  }
  if (g.expansions.orient && !g.orientBoard) upgradeOrient(g);
  resetUndo(g);
  return g;
}

function upgradeOrient(g) {
  const decks = {}, board = {};
  const used = new Set(g.players.flatMap((p) => p.cards.concat(p.reserved.map((r) => r.id))));
  [1, 2, 3].forEach((l) => {
    const pool = shuffle(ORIENT_CARDS.filter((c) => c.level === l && !used.has(c.id)).map((c) => c.id));
    board[l] = [];
    for (let i = 0; i < 2; i++) board[l].push(pool.pop() || null);
    decks[l] = pool;
  });
  g.orientDecks = decks;
  g.orientBoard = board;
  if (g.strongholds && g.strongholds[1].length < 6) {
    for (const l of [1, 2, 3]) while (g.strongholds[l].length < 6) g.strongholds[l].push([]);
  }
}

function stat(p, k, n) { p.st = p.st || { take: 0, reserve: 0, buy: 0 }; p.st[k] = (p.st[k] || 0) + n; }

function addLog(g, text) {
  g.log.push({ r: g.round, t: text });
  if (g.log.length > 120) g.log.shift();
}

function effectiveCardBonus(p, id) {
  const c = CARDS[id];
  if (!c || c.virtualGold) return null;
  if (c.copy) return (p.cardBonuses && p.cardBonuses[id]) || null;
  return COLORS.includes(c.bonus) ? c.bonus : null;
}
function bonuses(p) {
  const b = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  p.cards.forEach((id) => {
    const color = effectiveCardBonus(p, id);
    if (color) b[color] += CARDS[id].bonusCount || 1;
  });
  return b;
}
function points(p) {
  let n = p.cards.reduce((s, id) => s + CARDS[id].points, 0) +
    p.nobles.reduce((s, id) => s + NOBLES[id].points, 0);
  const posts = p.posts || [];
  if (posts.includes('noblePoints')) n += 5;
  if (posts.includes('coatPoints')) n += posts.length;
  return n;
}

function hasVirtualGold(p) {
  return p.cards.some((id) => CARDS[id].virtualGold);
}
function hasBonusCard(p, except) {
  return p.cards.some((id) => id !== except && effectiveCardBonus(p, id));
}
function discardCardsOfColor(p, color) {
  return p.cards.filter((id) => effectiveCardBonus(p, id) === color)
    .sort((a, b) => (CARDS[b].copy ? 1 : 0) - (CARDS[a].copy ? 1 : 0) || CARDS[a].points - CARDS[b].points);
}
function canPayBonusCost(p, card) {
  if (!card.discard) return true;
  return Object.entries(card.discard).every(([color, n]) => discardCardsOfColor(p, color).length >= n);
}
// Chi phí thực tế sau khi trừ bonus; trả về null nếu không đủ tiền.
function payment(p, card, opts = {}) {
  const b = bonuses(p);
  const pay = zero();
  let goldNeeded = 0;
  const goldDouble = (p.posts || []).includes('goldDouble');
  const cap = goldDouble ? 2 : 1;
  COLORS.forEach((c) => {
    const need = Math.max(0, (card.cost[c] || 0) - b[c]);
    const use = Math.min(need, p.tokens[c]);
    pay[c] = use;
    goldNeeded += Math.ceil((need - use) / cap);
  });
  const virtual = opts.virtualGold && hasVirtualGold(p) ? 2 : 0;
  if (goldNeeded > p.tokens.gold + virtual) return null;
  pay.gold = Math.min(goldNeeded, p.tokens.gold);
  pay.virtualGold = goldNeeded - pay.gold;
  return pay;
}

function faceupBoard(g, from) {
  return from === 'orient' ? g.orientBoard : g.board;
}
function strongholdSlot(from, index) {
  return from === 'orient' ? 4 + index : index;
}
function takeFromBoard(g, level, index, from = 'board', refill = true) {
  const board = faceupBoard(g, from);
  const id = board && board[level] && board[level][index];
  if (id == null) throw new Error(msg(g, 'error.emptySlot'));
  releaseStrongholds(g, level, index, from);
  const deck = from === 'orient' ? g.orientDecks[level] : g.decks[level];
  board[level][index] = refill && deck.length ? deck.pop() : null;
  return id;
}

function strongholdOwners(g, level, index, from = 'board') {
  const slot = strongholdSlot(from, index);
  return (g.strongholds && g.strongholds[level] && g.strongholds[level][slot]) || [];
}
function releaseStrongholds(g, level, index, from = 'board') {
  const slot = strongholdSlot(from, index);
  if (g.strongholds && g.strongholds[level]) g.strongholds[level][slot] = [];
}
function placedStrongholds(g, playerId) {
  let n = 0;
  if (!g.strongholds) return n;
  for (const l of [1, 2, 3]) for (const owners of g.strongholds[l]) n += owners.filter((id) => id === playerId).length;
  return n;
}
function strongholdTargets(g, p) {
  const out = [];
  if (!g.strongholds) return out;
  for (const from of g.expansions.orient ? ['board', 'orient'] : ['board']) {
    const rows = faceupBoard(g, from);
    for (const l of [1, 2, 3]) rows[l].forEach((id, index) => {
      if (id == null) return;
      const owners = strongholdOwners(g, l, index, from);
      if (owners.length && owners.some((x) => x !== p.id)) return;
      if (owners.length >= 3) return;
      out.push({ from, level: l, index });
    });
  }
  return out;
}
function strongholdActions(g, p) {
  if (!g.strongholds) return [];
  const out = [];
  const supply = MAX_STRONGHOLDS - placedStrongholds(g, p.id);
  for (const t of strongholdTargets(g, p)) {
    if (supply > 0) out.push({ mode: 'place', from: t.from, level: t.level, index: t.index,
      labelKey: 'stronghold.place', labelVars: { level: t.level }, label: tr(g.lang, 'stronghold.place', { level: t.level }) });
    for (const s of allFaceup(g)) {
      if (s.id == null || (s.from === t.from && s.level === t.level && s.index === t.index)) continue;
      if (strongholdOwners(g, s.level, s.index, s.from).includes(p.id)) {
        out.push({ mode: 'place', from: t.from, level: t.level, index: t.index, sourceFrom: s.from, sourceLevel: s.level, sourceIndex: s.index,
          labelKey: 'stronghold.move', labelVars: { from: s.level, to: t.level },
          label: tr(g.lang, 'stronghold.move', { from: s.level, to: t.level }) });
      }
    }
  }
  for (const s of allFaceup(g)) {
    const owners = strongholdOwners(g, s.level, s.index, s.from);
    if (owners.length === 1 && owners[0] !== p.id) {
      out.push({ mode: 'remove', from: s.from, level: s.level, index: s.index,
        labelKey: 'stronghold.remove', labelVars: { level: s.level }, label: tr(g.lang, 'stronghold.remove', { level: s.level }) });
    }
  }
  return out;
}
function conquestOptions(g, p) {
  if (!g.expansions.strongholds) return [];
  const out = [];
  for (const s of allFaceup(g)) {
    const owners = strongholdOwners(g, s.level, s.index, s.from);
    if (owners.length === 3 && owners.every((x) => x === p.id) && canBuyCard(g, p, s.id)) out.push({ from: s.from, level: s.level, index: s.index, id: s.id });
  }
  return out;
}
function allFaceup(g) {
  const out = [];
  for (const from of g.expansions.orient ? ['board', 'orient'] : ['board']) {
    const rows = faceupBoard(g, from);
    if (!rows) continue;
    for (const level of [1, 2, 3]) rows[level].forEach((id, index) => { if (id != null) out.push({ from, level, index, id }); });
  }
  return out;
}
function cityMet(city, b) {
  if (!Object.entries(city.req).every(([c, n]) => b[c] >= n)) return false;
  if (!city.same) return true;
  return COLORS.some((c) => !city.req[c] && b[c] >= city.same);
}
function eligibleCities(g, p) {
  if (!g.expansions.cities) return [];
  const b = bonuses(p), pts = points(p);
  return g.cities.filter((id) => pts >= CITY_TILES[id].points && cityMet(CITY_TILES[id], b));
}
function eligiblePosts(g, p) {
  if (!g.expansions.tradingPosts) return [];
  const b = bonuses(p), owned = p.posts || [];
  return TRADING_POSTS.filter((post) => !owned.includes(post.id) && (!post.needsNoble || p.nobles.length > 0) &&
    Object.entries(post.req).every(([c, n]) => b[c] >= n)).map((post) => post.id);
}
function postTokenChoices(g, exclude) {
  const ex = new Set(exclude || []);
  return COLORS.filter((c) => g.bank[c] > 0 && !ex.has(c));
}

function availableColors(g) {
  return COLORS.filter((c) => g.bank[c] > 0);
}

function canBuyCard(g, p, id) {
  const card = CARDS[id];
  if (!card) return false;
  if (card.copy && !hasBonusCard(p, id)) return false;
  if (card.discard) return canPayBonusCost(p, card);
  return !!payment(p, card, { virtualGold: hasVirtualGold(p) });
}

function canAct(g, p) {
  if (availableColors(g).length) return true;
  if (p.reserved.length < MAX_RESERVED) {
    for (const l of [1, 2, 3]) if (g.decks[l].length || g.board[l].some((x) => x != null) ||
      (g.orientBoard && g.orientBoard[l].some((x) => x != null))) return true;
  }
  const boardCards = allFaceup(g)
    .filter((x) => !strongholdOwners(g, x.level, x.index, x.from).some((id) => id !== p.id))
    .map((x) => x.id);
  const buyable = [...boardCards, ...p.reserved.map((r) => r.id)];
  return buyable.some((id) => canBuyCard(g, p, id));
}

function apply(g, playerId, a, opts = {}) {
  if (g.phase === 'over') throw new Error(msg(g, 'error.gameOver'));
  const p = g.players[g.turn];
  if (p.id !== playerId) throw new Error(msg(g, 'error.notYourTurn'));
  const turn = g.turn;
  const before = opts.recordUndo ? JSON.parse(JSON.stringify(g)) : null;
  switch (g.phase) {
    case 'main': doMain(g, p, a); break;
    case 'discard': doDiscard(g, p, a); break;
    case 'noble': doNoble(g, p, a); break;
    case 'tradingPost': doTradingPost(g, p, a); break;
    case 'city': doCity(g, p, a); break;
    case 'postToken': doPostToken(g, p, a); break;
    case 'stronghold': doStronghold(g, p, a); break;
    case 'conquest': doConquest(g, p, a); break;
    case 'orientCopy': doOrientCopy(g, p, a); break;
    case 'orientTake': doOrientTake(g, p, a); break;
    case 'orientNoble': doOrientNoble(g, p, a); break;
    default: throw new Error(msg(g, 'error.invalidAction'));
  }
  if (g.phase === 'over' || g.turn !== turn) resetUndo(g);
  else if (before) {
    const stack = undoStack(g);
    stack.push(before);
    if (stack.length > MAX_UNDO_ACTIONS) stack.shift();
  }
}

function doMain(g, p, a) {
  let after;
  switch (a.type) {
    case 'take': {
      const cs = a.colors;
      if (!Array.isArray(cs) || !cs.length || cs.some((c) => !COLORS.includes(c))) throw new Error(msg(g, 'error.invalidChoice'));
      if (cs.length === 2 && cs[0] === cs[1]) {
        if (g.bank[cs[0]] < 4) throw new Error(msg(g, 'error.twoSame'));
      } else {
        if (new Set(cs).size !== cs.length) throw new Error(msg(g, 'error.invalidChoice'));
        if (cs.length > 3) throw new Error(msg(g, 'error.maxThree'));
        if (cs.length !== Math.min(3, availableColors(g).length)) throw new Error(msg(g, 'error.mustThree'));
        if (cs.some((c) => g.bank[c] < 1)) throw new Error(msg(g, 'error.colorEmpty'));
      }
      cs.forEach((c) => { g.bank[c]--; p.tokens[c]++; });
      stat(p, 'take', cs.length);
      addLog(g, msg(g, 'log.take', { name: p.name, colors: cs.map((c) => colorName(g.lang, c)).join(', ') }));
      after = { type: 'take', colors: cs };
      break;
    }
    case 'reserve': {
      if (p.reserved.length >= MAX_RESERVED) throw new Error(msg(g, 'error.reserveLimit'));
      const { level, index } = a;
      const from = a.from === 'orient' ? 'orient' : 'board';
      if (![1, 2, 3].includes(level)) throw new Error(msg(g, 'error.badLevel'));
      let id, fromDeck = false;
      if (index === -1) {
        if (from === 'orient') throw new Error(msg(g, 'error.orientDeckReserve'));
        if (!g.decks[level].length) throw new Error(msg(g, 'error.deckEmpty'));
        id = g.decks[level].pop(); fromDeck = true;
      } else {
        const rows = faceupBoard(g, from);
        if (!rows || rows[level][index] == null) throw new Error(msg(g, 'error.emptySlot'));
        const owners = strongholdOwners(g, level, index, from);
        if (owners.length && !owners.every((x) => x === p.id)) throw new Error(msg(g, 'error.strongholdBlock'));
        id = takeFromBoard(g, level, index, from);
      }
      p.reserved.push({ id, fromDeck });
      stat(p, 'reserve', 1);
      if (g.bank.gold > 0) { g.bank.gold--; p.tokens.gold++; }
      addLog(g, msg(g, fromDeck ? 'log.reserveFaceDown' : 'log.reserveFaceUp', { name: p.name, level }));
      after = { type: 'reserve' };
      break;
    }
    case 'buy': {
      let id, fromReserved = false, from = 'board';
      if (a.from === 'reserved') {
        const i = p.reserved.findIndex((r) => r.id === a.id);
        if (i < 0) throw new Error(msg(g, 'error.reservedMissing'));
        id = a.id; fromReserved = true;
      } else {
        from = a.from === 'orient' ? 'orient' : 'board';
        const rows = faceupBoard(g, from);
        id = rows && rows[a.level] && rows[a.level][a.index];
        if (id == null) throw new Error(msg(g, 'error.emptySlot'));
        const owners = strongholdOwners(g, a.level, a.index, from);
        if (owners.length && !owners.every((x) => x === p.id)) throw new Error(msg(g, 'error.strongholdBlock'));
      }
      const card = CARDS[id];
      if (card.copy && !hasBonusCard(p, id)) throw new Error(msg(g, 'error.copyNeedsBonus'));
      if (card.discard) {
        if (!canPayBonusCost(p, card)) throw new Error(msg(g, 'error.discardBonus'));
        consumeBonusCost(g, p, card);
      } else {
        const pay = payment(p, card, { virtualGold: !!a.virtualGold });
        if (!pay) throw new Error(msg(g, a.virtualGold ? 'error.notEnoughGems' : 'error.notEnoughGemsVirtual'));
        ALL.forEach((c) => { p.tokens[c] -= pay[c]; g.bank[c] += pay[c]; });
        if (pay.virtualGold) {
          const v = p.cards.findIndex((cid) => CARDS[cid].virtualGold);
          if (v < 0) throw new Error(msg(g, 'error.noVirtualGold'));
          const gone = p.cards.splice(v, 1)[0];
          addLog(g, msg(g, 'log.virtualGold', { name: p.name, n: pay.virtualGold }));
          void gone;
        }
      }
      if (fromReserved) p.reserved.splice(p.reserved.findIndex((r) => r.id === id), 1);
      else {
        releaseStrongholds(g, a.level, a.index, from);
        faceupBoard(g, from)[a.level][a.index] = null;
        g.pendingRefills.push({ from, level: a.level, index: a.index });
      }
      p.cards.push(id);
      stat(p, 'buy', 1);
      const cardColor = card.virtualGold ? colorName(g.lang, 'gold') : card.copy ? tr(g.lang, 'orient.copy') : colorName(g.lang, card.bonus);
      addLog(g, msg(g, 'log.buy', { name: p.name, level: card.level, color: cardColor, points: card.points ? tr(g.lang, 'log.buyPoints', { n: card.points }) : '' }));
      after = { type: 'buy', fromBoard: !fromReserved, orient: card.orient };
      break;
    }
    case 'pass': {
      if (canAct(g, p)) throw new Error(msg(g, 'error.movesRemain'));
      addLog(g, msg(g, 'log.pass', { name: p.name }));
      after = { type: 'pass' };
      break;
    }
    default: throw new Error(msg(g, 'error.invalidAction'));
  }
  afterMainAction(g, p, after);
}

function afterMainAction(g, p, action) {
  if (action.type === 'buy') {
    const bought = p.cards[p.cards.length - 1];
    const card = CARDS[bought];
    const effects = [];
    if (card.copy) effects.push({ type: 'copy', id: bought });
    if (card.reserveNoble) effects.push({ type: 'noble', id: bought });
    if (card.freeTier) effects.push({ type: 'take', id: bought, tier: card.freeTier });
    if (effects.length) {
      g.orientQueue = effects;
      g.orientMain = true;
      g.orientFx = null;
      return resolveOrientEffects(g, p);
    }
  }
  if ((p.posts || []).includes('purchaseToken') && action.type === 'buy') {
    const choices = postTokenChoices(g);
    if (choices.length) {
      g.postToken = { exclude: [], after: 'stronghold', strongholdAfter: 'conquest', purchase: true };
      g.phase = 'postToken';
      return;
    }
  }
  if ((p.posts || []).includes('doubleToken') && action.type === 'take' && action.colors.length === 2 && action.colors[0] === action.colors[1]) {
    const choices = postTokenChoices(g, action.colors);
    if (choices.length) {
      g.postToken = { exclude: action.colors, after: 'conquest', purchase: false };
      g.phase = 'postToken';
      return;
    }
  }
  if (action.type === 'buy') return beginStronghold(g, p, 'conquest');
  continueAfterMain(g, p, action);
}

function continueAfterMain(g, p, action) {
  if (g.expansions.strongholds && action.type !== 'pass') return checkConquest(g, p);
  finishAction(g, p);
}

function beginStronghold(g, p, after) {
  if (!g.expansions.strongholds) return after === 'conquest' ? checkConquest(g, p) : finishAction(g, p);
  if (strongholdActions(g, p).length) {
    g.phase = 'stronghold';
    g.strongholdAfter = after;
    return;
  }
  return finishStronghold(g, p, after);
}

function finishStronghold(g, p, after) {
  if (after === 'conquest') {
    finalizeRefills(g);
    return checkConquest(g, p);
  }
  finishAction(g, p);
}

function checkConquest(g, p) {
  if (conquestOptions(g, p).length) { g.phase = 'conquest'; return; }
  finishAction(g, p);
}

function finishAction(g, p) {
  finalizeRefills(g);
  if (sum(p.tokens) > MAX_TOKENS) { g.phase = 'discard'; return; }
  resolveEnd(g, p);
}

function finalizeRefills(g) {
  for (const s of g.pendingRefills || []) {
    const from = s.from || 'board';
    const board = faceupBoard(g, from);
    if (!board) continue;
    const deck = from === 'orient' ? g.orientDecks[s.level] : g.decks[s.level];
    board[s.level][s.index] = deck.length ? deck.pop() : null;
  }
  g.pendingRefills = [];
}

function doDiscard(g, p, a) {
  if (a.type !== 'discard') throw new Error(msg(g, 'error.mustDiscard'));
  const need = sum(p.tokens) - MAX_TOKENS;
  const d = a.tokens || {};
  let tot = 0;
  ALL.forEach((c) => {
    const n = d[c] || 0;
    if (!Number.isInteger(n) || n < 0 || n > p.tokens[c]) throw new Error(msg(g, 'error.invalidCount'));
    tot += n;
  });
  if (tot !== need) throw new Error(msg(g, 'error.discardExactly', { n: need }));
  ALL.forEach((c) => { const n = d[c] || 0; p.tokens[c] -= n; g.bank[c] += n; });
  addLog(g, msg(g, 'log.discard', { name: p.name, n: tot }));
  g.phase = 'main';
  resolveEnd(g, p);
}

function eligibleNobles(g, p) {
  const b = bonuses(p);
  const pool = [...g.nobles, ...((p.reservedNobles || []).filter((id) => !g.nobles.includes(id)))];
  return pool.filter((id) => Object.entries(NOBLES[id].req).every(([c, n]) => b[c] >= n));
}
function doNoble(g, p, a) {
  if (a.type !== 'noble' || !eligibleNobles(g, p).includes(a.id)) throw new Error(msg(g, 'error.chooseNoble'));
  grantNoble(g, p, a.id);
}
function grantNoble(g, p, id) {
  g.nobles = g.nobles.filter((x) => x !== id);
  p.reservedNobles = (p.reservedNobles || []).filter((x) => x !== id);
  p.nobles.push(id);
  addLog(g, msg(g, 'log.noble', { name: p.name, points: NOBLES[id].points }));
  g.phase = 'main';
  resolveEnd(g, p, { nobleDone: true });
}

function doTradingPost(g, p, a) {
  if (a.type !== 'tradingPost' || !eligiblePosts(g, p).includes(a.id)) throw new Error(msg(g, 'error.choosePost'));
  claimPost(g, p, a.id);
}
function claimPost(g, p, id) {
  if (!eligiblePosts(g, p).includes(id)) throw new Error(msg(g, 'error.invalidPost'));
  p.posts.push(id);
  const post = TRADING_POSTS.find((x) => x.id === id);
  addLog(g, msg(g, 'log.post', { name: p.name, post: tr(g.lang, post.nameKey) }));
  g.phase = 'main';
  resolveEnd(g, p, { nobleDone: true, postDone: true });
}

function consumeBonusCost(g, p, card) {
  for (const [color, n] of Object.entries(card.discard)) {
    const ids = discardCardsOfColor(p, color).slice(0, n);
    if (ids.length < n) throw new Error(msg(g, 'error.bonusToPay'));
    for (const id of ids) {
      p.cards.splice(p.cards.indexOf(id), 1);
      delete p.cardBonuses[id];
    }
  }
}

function orientCopyChoices(g, p, effectId) {
  const seen = new Set(), out = [];
  for (const id of p.cards) {
    if (id === effectId) continue;
    const color = effectiveCardBonus(p, id);
    if (color && !seen.has(color)) { seen.add(color); out.push({ cardId: id, color }); }
  }
  return out;
}

function orientTakeChoices(g, p, tier) {
  return allFaceup(g).filter((x) => CARDS[x.id].level === tier)
    .filter((x) => !CARDS[x.id].copy || hasBonusCard(p, x.id))
    .filter((x) => !strongholdOwners(g, x.level, x.index, x.from).some((id) => id !== p.id));
}

function queueCardEffects(g, id, front) {
  const card = CARDS[id], effects = [];
  if (card.copy) effects.push({ type: 'copy', id });
  if (card.reserveNoble) effects.push({ type: 'noble', id });
  if (card.freeTier) effects.push({ type: 'take', id, tier: card.freeTier });
  if (!effects.length) return;
  g.orientQueue = g.orientQueue || [];
  if (front) g.orientQueue.unshift(...effects);
  else g.orientQueue.push(...effects);
}

function resolveOrientEffects(g, p) {
  g.orientQueue = g.orientQueue || [];
  while (g.orientQueue.length) {
    const fx = g.orientQueue.shift();
    if (fx.type === 'copy') {
      const choices = orientCopyChoices(g, p, fx.id);
      if (!choices.length) continue;
      if (choices.length === 1) { p.cardBonuses[fx.id] = choices[0].color; continue; }
      g.orientFx = fx; g.phase = 'orientCopy'; return;
    }
    if (fx.type === 'noble') {
      if (!g.nobles.length && !(p.reservedNobles || []).length) continue;
      if (!g.nobles.length) continue;
      if (g.nobles.length === 1) { reserveNoble(g, p, g.nobles[0]); continue; }
      g.orientFx = fx; g.phase = 'orientNoble'; return;
    }
    if (fx.type === 'take') {
      const choices = orientTakeChoices(g, p, fx.tier);
      if (!choices.length) continue;
      if (choices.length === 1) { takeOrientFree(g, p, choices[0]); continue; }
      g.orientFx = fx; g.phase = 'orientTake'; return;
    }
  }
  g.orientFx = null;
  const main = !!g.orientMain;
  const conquest = !!g.orientAfterConquest;
  g.orientMain = false;
  g.orientAfterConquest = false;
  if (main) return afterMainPurchase(g, p);
  if (conquest) return afterConquestPurchase(g, p);
  finishAction(g, p);
}

function afterMainPurchase(g, p) {
  if ((p.posts || []).includes('purchaseToken')) {
    const choices = postTokenChoices(g);
    if (choices.length) {
      g.postToken = { exclude: [], after: 'stronghold', strongholdAfter: 'conquest', purchase: true };
      g.phase = 'postToken';
      return;
    }
  }
  beginStronghold(g, p, 'conquest');
}

function afterConquestPurchase(g, p) {
  if ((p.posts || []).includes('purchaseToken')) {
    const choices = postTokenChoices(g);
    if (choices.length) {
      g.postToken = { exclude: [], after: 'stronghold', strongholdAfter: 'resolve', purchase: true };
      g.phase = 'postToken';
      return;
    }
  }
  beginStronghold(g, p, 'resolve');
}

function takeOrientFree(g, p, loc) {
  const id = takeFromBoard(g, loc.level, loc.index, loc.from, false);
  g.pendingRefills.push({ from: loc.from, level: loc.level, index: loc.index });
  p.cards.push(id);
  addLog(g, msg(g, 'log.freeOrient', { name: p.name, level: CARDS[id].level }));
  queueCardEffects(g, id, true);
}

function doOrientCopy(g, p, a) {
  if (a.type !== 'orientCopy') throw new Error(msg(g, 'error.chooseCopyColor'));
  const fx = g.orientFx;
  if (!fx) throw new Error(msg(g, 'error.noCopyEffect'));
  const allowed = orientCopyChoices(g, p, fx.id);
  const choice = allowed.find((x) => x.cardId === a.cardId);
  if (!choice) throw new Error(msg(g, 'error.chooseBonusCard'));
  p.cardBonuses[fx.id] = choice.color;
  g.phase = 'main'; g.orientFx = null;
  resolveOrientEffects(g, p);
}

function doOrientTake(g, p, a) {
  if (a.type !== 'orientTake') throw new Error(msg(g, 'error.chooseFreeCard'));
  const fx = g.orientFx;
  if (!fx) throw new Error(msg(g, 'error.noTakeEffect'));
  const loc = orientTakeChoices(g, p, fx.tier).find((x) => x.from === a.from && x.level === a.level && x.index === a.index);
  if (!loc) throw new Error(msg(g, 'error.invalidFreeCard'));
  g.phase = 'main'; g.orientFx = null;
  takeOrientFree(g, p, loc);
  resolveOrientEffects(g, p);
}

function reserveNoble(g, p, id) {
  g.nobles = g.nobles.filter((x) => x !== id);
  p.reservedNobles = p.reservedNobles || [];
  p.reservedNobles.push(id);
  addLog(g, msg(g, 'log.reserveNoble', { name: p.name }));
}

function doOrientNoble(g, p, a) {
  if (a.type !== 'orientNoble' || !g.nobles.includes(a.id)) throw new Error(msg(g, 'error.chooseNoble'));
  reserveNoble(g, p, a.id);
  g.phase = 'main'; g.orientFx = null;
  resolveOrientEffects(g, p);
}

function doCity(g, p, a) {
  if (a.type !== 'city' || !eligibleCities(g, p).includes(a.id)) throw new Error(msg(g, 'error.chooseCity'));
  claimCity(g, p, a.id);
}
function claimCity(g, p, id) {
  g.cities = g.cities.filter((x) => x !== id);
  p.cities.push(id);
  g.cityClaimed = true;
  g.finalRound = true;
  addLog(g, msg(g, 'log.city', { name: p.name, n: id + 1 }));
  g.phase = 'main';
  endTurn(g, p);
}

function resolveEnd(g, p, opts = {}) {
  if (!opts.nobleDone) {
    const nobles = eligibleNobles(g, p);
    if (nobles.length === 1) { grantNoble(g, p, nobles[0]); return; }
    if (nobles.length > 1) { g.phase = 'noble'; return; }
  }
  if (!opts.postDone) {
    const posts = eligiblePosts(g, p);
    if (posts.length === 1) { claimPost(g, p, posts[0]); return; }
    if (posts.length > 1) { g.phase = 'tradingPost'; return; }
  }
  if (!opts.cityDone) {
    const cities = eligibleCities(g, p);
    if (cities.length === 1) { claimCity(g, p, cities[0]); return; }
    if (cities.length > 1) { g.phase = 'city'; return; }
  }
  endTurn(g, p);
}

function doPostToken(g, p, a) {
  if (a.type !== 'postToken') throw new Error(msg(g, 'error.choosePostToken'));
  const info = g.postToken || {};
  const allowed = postTokenChoices(g, info.exclude);
  if (!allowed.includes(a.color)) throw new Error(msg(g, 'error.postTokenUnavailable'));
  g.bank[a.color]--; p.tokens[a.color]++;
  addLog(g, msg(g, 'log.postToken', { name: p.name, color: colorName(g.lang, a.color) }));
  g.phase = 'main';
  const after = info.after;
  g.postToken = null;
  if (after === 'stronghold') return beginStronghold(g, p, info.strongholdAfter || 'conquest');
  if (after === 'conquest') return checkConquest(g, p);
  finishAction(g, p);
}

function doStronghold(g, p, a) {
  if (a.type !== 'stronghold') throw new Error(msg(g, 'error.mustStronghold'));
  const action = strongholdActions(g, p).find((x) => x.mode === a.mode && (x.from || 'board') === (a.from || 'board') && x.level === a.level && x.index === a.index &&
    (x.sourceFrom || 'board') === (a.sourceFrom || 'board') &&
    (x.sourceLevel || 0) === (a.sourceLevel || 0) && (x.sourceIndex ?? -2) === (a.sourceIndex ?? -2));
  if (!action) throw new Error(msg(g, 'error.invalidStronghold'));
  if (action.mode === 'place') {
    let fromSupply = placedStrongholds(g, p.id) < MAX_STRONGHOLDS && a.sourceLevel == null;
    if (fromSupply) {
      g.strongholds[action.level][strongholdSlot(action.from, action.index)].push(p.id);
    } else {
      const owners = strongholdOwners(g, action.sourceLevel, action.sourceIndex, action.sourceFrom);
      const k = owners.indexOf(p.id);
      if (k < 0) throw new Error(msg(g, 'error.noStrongholdToMove'));
      owners.splice(k, 1);
      g.strongholds[action.level][strongholdSlot(action.from, action.index)].push(p.id);
    }
    addLog(g, msg(g, action.labelKey === 'stronghold.remove' ? 'log.strongholdRemove' : action.labelKey === 'stronghold.move' ? 'log.strongholdMove' : 'log.strongholdPlace',
      { name: p.name, ...(action.labelVars || {}) }));
  } else {
    g.strongholds[action.level][strongholdSlot(action.from, action.index)] = [];
    addLog(g, msg(g, 'log.strongholdRemove', { name: p.name, ...(action.labelVars || {}) }));
  }
  g.phase = 'main';
  const after = g.strongholdAfter || 'resolve';
  g.strongholdAfter = null;
  finishStronghold(g, p, after);
}

function doConquest(g, p, a) {
  if (a.type === 'skipConquest') { g.phase = 'main'; return finishAction(g, p); }
  if (a.type !== 'conquest') throw new Error(msg(g, 'error.invalidConquest'));
  const opt = conquestOptions(g, p).find((x) => (x.from || 'board') === (a.from || 'board') && x.level === a.level && x.index === a.index && x.id === a.id);
  if (!opt) throw new Error(msg(g, 'error.cannotConquer'));
  const card = CARDS[opt.id];
  if (card.discard) {
    if (!canPayBonusCost(p, card)) throw new Error(msg(g, 'error.discardBonus'));
    consumeBonusCost(g, p, card);
  } else {
    const pay = payment(p, card, { virtualGold: hasVirtualGold(p) });
    if (!pay) throw new Error(msg(g, 'error.notEnoughGems'));
    ALL.forEach((c) => { p.tokens[c] -= pay[c]; g.bank[c] += pay[c]; });
    if (pay.virtualGold) {
      const v = p.cards.findIndex((cid) => CARDS[cid].virtualGold);
      if (v >= 0) p.cards.splice(v, 1);
    }
  }
  releaseStrongholds(g, opt.level, opt.index, opt.from);
  faceupBoard(g, opt.from)[opt.level][opt.index] = null;
  g.pendingRefills.push({ from: opt.from, level: opt.level, index: opt.index });
  p.cards.push(opt.id);
  stat(p, 'buy', 1);
  addLog(g, msg(g, 'log.conquest', { name: p.name, level: CARDS[opt.id].level }));
  g.phase = 'main';
  const effects = [];
  if (card.copy) effects.push({ type: 'copy', id: opt.id });
  if (card.reserveNoble) effects.push({ type: 'noble', id: opt.id });
  if (card.freeTier) effects.push({ type: 'take', id: opt.id, tier: card.freeTier });
  if (effects.length) {
    g.orientQueue = effects;
    g.orientMain = false;
    g.orientAfterConquest = true;
    g.orientFx = null;
    return resolveOrientEffects(g, p);
  }
  afterConquestPurchase(g, p);
}

function endTurn(g, p) {
  if (!g.expansions.cities && !g.finalRound && points(p) >= WIN_POINTS) {
    g.finalRound = true;
    addLog(g, msg(g, 'log.finalRound', { name: p.name, points: points(p) }));
  }
  g.turn = (g.turn + 1) % g.players.length;
  g.phase = 'main';
  if (g.turn === 0) {
    (g.series = g.series || []).push(g.players.map(points)); // điểm của từng người sau mỗi vòng (vẽ biểu đồ cuối ván)
    g.round++;
    if (g.finalRound) return finish(g);
  }
}

function finish(g) {
  g.phase = 'over';
  const score = (p) => [points(p), -p.cards.length]; // hòa điểm: ít thẻ hơn thắng
  let best = null, winners = [];
  const contenders = g.expansions.cities && g.cityClaimed ? g.players.filter((p) => p.cities.length) : g.players;
  contenders.forEach((p) => {
    const s = score(p);
    if (!best || s[0] > best[0] || (s[0] === best[0] && s[1] > best[1])) { best = s; winners = [p.id]; }
    else if (s[0] === best[0] && s[1] === best[1]) winners.push(p.id);
  });
  g.winners = winners;
  addLog(g, msg(g, 'log.finish', { names: g.players.filter((p) => winners.includes(p.id)).map((p) => p.name).join(', ') }));
}

// Góc nhìn của 1 người chơi: ẩn mọi thẻ đã giữ của người khác, ẩn thứ tự chồng bài.
function viewFor(g, playerId) {
  const current = g.players[g.turn];
  const mine = current.id === playerId;
  return {
    lang: g.lang,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, tokens: p.tokens, cards: p.cards, nobles: p.nobles, cities: p.cities || [], posts: p.posts || [],
      cardBonuses: p.cardBonuses || {}, reservedNobles: p.id === playerId ? (p.reservedNobles || []) : [],
      reservedNobleCount: (p.reservedNobles || []).length,
      strongholdsSupply: MAX_STRONGHOLDS - placedStrongholds(g, p.id), strongholdsPlaced: placedStrongholds(g, p.id),
      points: points(p), bonuses: bonuses(p), st: p.st || { take: 0, reserve: 0, buy: 0 },
      reserved: p.reserved.map((r) =>
        p.id === playerId ? { id: r.id, fromDeck: r.fromDeck } : { hidden: true, level: CARDS[r.id].level }),
    })),
    bank: g.bank,
    deckCounts: { 1: g.decks[1].length, 2: g.decks[2].length, 3: g.decks[3].length },
    orientDeckCounts: g.orientDecks ? { 1: g.orientDecks[1].length, 2: g.orientDecks[2].length, 3: g.orientDecks[3].length } : null,
    board: g.board, nobles: g.nobles, cities: g.cities, cityTiles: CITY_TILES, expansions: g.expansions,
    tradingPosts: TRADING_POSTS.map((post) => ({ ...post, name: tr(g.lang, post.nameKey), text: tr(g.lang, post.textKey) })),
    orientBoard: g.orientBoard,
    strongholds: g.strongholds, cityClaimed: g.cityClaimed,
    turn: g.turn, phase: g.phase, finalRound: g.finalRound, winners: g.winners,
    log: g.log.slice(-120), round: g.round, series: g.series || [],
    eligible: g.phase === 'noble' && mine ? eligibleNobles(g, current) : [],
    cityChoices: g.phase === 'city' && mine ? eligibleCities(g, current) : [],
    postChoices: g.phase === 'tradingPost' && mine ? eligiblePosts(g, current) : [],
    tokenChoices: g.phase === 'postToken' && mine ? postTokenChoices(g, g.postToken && g.postToken.exclude) : [],
    strongholdChoices: g.phase === 'stronghold' && mine ? strongholdActions(g, current) : [],
    conquestChoices: g.phase === 'conquest' && mine ? conquestOptions(g, current) : [],
    orientCopyChoices: g.phase === 'orientCopy' && mine && g.orientFx ? orientCopyChoices(g, current, g.orientFx.id) : [],
    orientTakeChoices: g.phase === 'orientTake' && mine && g.orientFx ? orientTakeChoices(g, current, g.orientFx.tier) : [],
    orientNobleChoices: g.phase === 'orientNoble' && mine ? g.nobles.slice() : [],
    canPass: g.phase === 'main' && mine && !canAct(g, current),
    canUndo: mine && canUndo(g, playerId),
  };
}

module.exports = { newGame, upgradeGame, apply, undo, viewFor, payment, points, bonuses, canAct, addLog, availableColors, sum,
  eligibleNobles, eligibleCities, eligiblePosts, cityMet, strongholdOwners, strongholdActions, conquestOptions, postTokenChoices,
  effectiveCardBonus, hasVirtualGold, canBuyCard, isOrientCard: (id) => !!CARDS[id].orient, allFaceup,
  CARDS, ORIENT_CARDS, NOBLES, CITY_TILES, TRADING_POSTS, EXPANSIONS, DEFAULT_EXPANSIONS, COLORS, MAX_TOKENS, MAX_RESERVED, MAX_STRONGHOLDS, WIN_POINTS };
