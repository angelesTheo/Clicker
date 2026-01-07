/* ==========================================================
   Aurelia Capital — Incremental (Gameplay Only)
   - Click trading with Flow/Heat + slippage + crit
   - Buildings + Upgrades
   - Prestige total + shop (spent/available)
   - Regulations (challenges)
   - Career chapters + claim (persistent)
   - Achievements (~50) + passive permanent bonuses + pro UI
   - Offline progress + save
   - Theme toggle (light/dark)
   - Trades log (scrollable, no page jump)
   - ✅ FIX: refresh enable/disable buttons even on passive income
   - ✨ PLUS: notify + highlight when new upgrade becomes available
   ========================================================== */

const $ = (id) => document.getElementById(id);

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

const DIFFICULTY = {
  costMult: 6,
  gainMult: 0.50,
  upgradeCostMult: 4,
  prestigeScale: 25,
  prestigeShopCostMult: 3,
  careerTargetMult: 3,
  achTargetMult: 3,
};

function scaleTarget(n, mult){
  return Math.ceil(n * mult);
}

function format(n){
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1) {
    return sign + abs.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }
  const units = [[1e12,"T"],[1e9,"B"],[1e6,"M"],[1e3,"K"]];
  for (const [v, s] of units){
    if (abs >= v) return sign + (abs / v).toFixed(2).replace(/\.00$/,"") + s;
  }
  return sign + Math.floor(abs).toString();
}

function toast(msg){
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.classList.remove("show"), 2200);
}

function showOfflineModal(amount){
  const modal = $("offlineModal");
  const amt = $("offlineAmount");
  if (!modal || !amt) return;
  amt.textContent = format(amount);
  modal.classList.add("show");
}

function hideOfflineModal(){
  const modal = $("offlineModal");
  if (!modal) return;
  modal.classList.remove("show");
}

function claimOfflineGains(){
  const amt = state.ui?.offlinePending || 0;
  if (amt <= 0){
    hideOfflineModal();
    return;
  }
  state.gold += amt;
  state.totalEarned += amt;
  state.stats.offlineGained = (state.stats.offlineGained || 0) + amt;
  state.ui.offlinePending = 0;
  hideOfflineModal();
  toast(`Offline: +${format(amt)} €`);
  save();
  render(true);
}

/* -------------------------
   Theme
-------------------------- */
function nowLabel(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getTheme(){ return localStorage.getItem("ac_theme") || "light"; }
function setTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("ac_theme", theme);
  const btn = $("themeToggle");
  if (btn) btn.textContent = "Mode: " + (theme === "dark" ? "Dark" : "Light");
}

/* -------------------------
   Game Data (Finance Skin)
-------------------------- */
const BUILDINGS = [
  { id:"intern",  name:"Stagiaire Excel", baseCost: 15,        costMult: 1.15, baseGps: 1.2,      desc:"Nettoie les données, prépare des rapports." },
  { id:"news",    name:"Flux News",       baseCost: 120,       costMult: 1.16, baseGps: 7.5,      desc:"Scanne les breaking news." },
  { id:"analyst", name:"Analyste",        baseCost: 900,       costMult: 1.17, baseGps: 45,       desc:"Modèles et thèses d’investissement." },
  { id:"signals", name:"Moteur de Signaux", baseCost: 6500,    costMult: 1.18, baseGps: 260,      desc:"Data → entrées/sorties." },
  { id:"bot",     name:"Bot de Trading",  baseCost: 42000,     costMult: 1.19, baseGps: 1400,     desc:"Exécute des stratégies." },
  { id:"hft",     name:"Serveur HFT",     baseCost: 260000,    costMult: 1.20, baseGps: 8200,     desc:"Latence réduite." },
  { id:"mm",      name:"Desk Market Making", baseCost: 1_400_000, costMult: 1.205, baseGps: 42000, desc:"Capture le spread." },
  { id:"quant",   name:"Équipe Quant",    baseCost: 7_500_000, costMult: 1.21, baseGps: 210000,   desc:"Recherche avancée." },
  { id:"fund",    name:"Fonds Multi-Strategies", baseCost: 38_000_000, costMult: 1.215, baseGps: 1_000_000, desc:"Diversifie et scale." },
  { id:"prime",   name:"Prime Brokerage", baseCost: 180_000_000, costMult: 1.22, baseGps: 4_500_000, desc:"Meilleures conditions." },
];

const UPGRADES = [
  { id:"u_click_1", name:"Hotkeys & DOM", cost: 60,   desc:"x2 clic.", req:{}, apply:(s)=>{ s.mods.clickMult *= 2; } },
  { id:"u_click_2", name:"Order Templates", cost: 650, desc:"x2 clic.", req:{ upgrades:["u_click_1"], buildings:{ intern: 5 } }, apply:(s)=>{ s.mods.clickMult *= 2; } },

  { id:"u_global_1", name:"Pipeline de Data", cost: 900, desc:"x1.25 P&L/sec global.", req:{ buildings:{ intern: 10 } }, apply:(s)=>{ s.mods.globalGpsMult *= 1.25; } },
  { id:"u_global_2", name:"Feature Store", cost: 12000, desc:"x1.3 P&L/sec global.", req:{ upgrades:["u_global_1"], buildings:{ analyst: 8 } }, apply:(s)=>{ s.mods.globalGpsMult *= 1.3; } },

  { id:"u_crit_1", name:"Catalyseurs", cost: 14000, desc:"Crit: 5% chance x10 au clic.", req:{ upgrades:["u_click_2"], buildings:{ signals: 5 } },
    apply:(s)=>{ s.mods.critChance += 0.05; s.mods.critMult = Math.max(s.mods.critMult, 10); } },
  { id:"u_crit_2", name:"Momentum Explosif", cost: 220000, desc:"+5% chance crit, crit x15.", req:{ upgrades:["u_crit_1","u_global_2"], buildings:{ hft: 2 } },
    apply:(s)=>{ s.mods.critChance += 0.05; s.mods.critMult = Math.max(s.mods.critMult, 15); } },
];

const PRESTIGE_SHOP = [
  { id:"ps_start", name:"Capital initial", desc:"+ cash au démarrage après prestige.", max: 10,
    cost:(lvl)=> 1 + lvl, apply:(s,lvl)=>{ s.mods.startCash += 250 * lvl; } },

  { id:"ps_global", name:"Infrastructure permanente", desc:"+ production globale permanente.", max: 50,
    cost:(lvl)=> 2 + Math.floor(lvl/2), apply:(s,lvl)=>{ s.mods.globalGpsMult *= (1 + 0.03 * lvl); } },

  { id:"ps_click", name:"Exécution manuelle", desc:"+ puissance de clic permanente.", max: 50,
    cost:(lvl)=> 2 + Math.floor(lvl/2), apply:(s,lvl)=>{ s.mods.clickMult *= (1 + 0.04 * lvl); } },

  { id:"ps_cost", name:"Frais réduits", desc:"Réduit les coûts des bâtiments (permanent).", max: 25,
    cost:(lvl)=> 3 + lvl, apply:(s,lvl)=>{
      const factor = Math.pow(0.98, lvl);
      for (const b of BUILDINGS) s.mods.buildingCostMult[b.id] *= factor;
    } },

  { id:"ps_offline", name:"Intérêts overnight", desc:"Boost des gains offline (permanent).", max: 20,
    cost:(lvl)=> 3 + Math.floor(lvl/2), apply:(s,lvl)=>{ s.mods.offlineMult *= (1 + 0.10 * lvl); } },

  { id:"ps_mit_tax", name:"Optimisation fiscale", desc:"Réduit le malus de la Taxe.", max: 10,
    cost:(lvl)=> 2 + lvl, apply:(s,lvl)=>{ s.mods.regMit.tax = Math.min(0.75, 0.08 * lvl); } },
  { id:"ps_mit_fees", name:"Négociation des fees", desc:"Réduit le malus Frais & spread.", max: 10,
    cost:(lvl)=> 2 + lvl, apply:(s,lvl)=>{ s.mods.regMit.fees = Math.min(0.75, 0.08 * lvl); } },
  { id:"ps_mit_lev", name:"Structuration levier", desc:"Réduit le malus Limite de levier.", max: 10,
    cost:(lvl)=> 3 + lvl, apply:(s,lvl)=>{ s.mods.regMit.leverage = Math.min(0.75, 0.07 * lvl); } },
  { id:"ps_mit_data", name:"Stack compliance", desc:"Réduit le malus Compliance data.", max: 10,
    cost:(lvl)=> 2 + lvl, apply:(s,lvl)=>{ s.mods.regMit.data = Math.min(0.75, 0.08 * lvl); } },
];

const REGULATIONS = [
  { id:"tax", name:"Taxe sur transactions", unlockAt: 5, max: 10, bonusPerLevel: 0.10, penaltyPerLevel: 0.03,
    desc:"Moins de cash, mais plus de prestige.",
    applyPenalty:(s, lvl, eff)=>{ s.mods.clickMult *= (1 - eff); s.mods.globalGpsMult *= (1 - eff); } },
  { id:"fees", name:"Frais & spread élargis", unlockAt: 10, max: 10, bonusPerLevel: 0.10, penaltyPerLevel: 0.025,
    desc:"Les coûts d’exécution mangent ton P&L.",
    applyPenalty:(s, lvl, eff)=>{ s.mods.globalGpsMult *= (1 - eff); } },
  { id:"leverage", name:"Limite de levier", unlockAt: 20, max: 10, bonusPerLevel: 0.12, penaltyPerLevel: 0.028,
    desc:"Moins de scaling, plus de discipline.",
    applyPenalty:(s, lvl, eff)=>{ s.mods.globalGpsMult *= (1 - eff); } },
  { id:"data", name:"Compliance data (coûts)", unlockAt: 30, max: 10, bonusPerLevel: 0.10, penaltyPerLevel: 0.03,
    desc:"Infra plus chère, prestige plus rapide.",
    applyPenalty:(s, lvl, eff)=>{
      const factor = 1 + eff;
      for (const b of BUILDINGS) s.mods.buildingCostMult[b.id] *= factor;
    } },
];

/* -------------------------
   State
-------------------------- */
function defaultState(){
  const baseMods = {
    clickMult: 1,
    globalGpsMult: 1,
    buildingGpsMult: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),
    buildingCostMult: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),

    critChance: 0,
    critMult: 2,

    prestigePerPoint: 0.04,
    prestigeGainMult: 1,

    startCash: 0,
    offlineMult: 1,
    regMit: { tax: 0, fees: 0, leverage: 0, data: 0 },

    streakWindowMs: 1400,
    streakPerStack: 0.04,
    streakMaxBonus: 2.0,
    riskHeat: 0.035,
    riskCool: 0.18,
    slipStart: 0.70,
    slipMaxPenalty: 0.50,
  };

  return {
    gold: 0,
    totalEarned: 0,
    lastSave: Date.now(),

    buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
    upgrades: {},

    buyMode: 1,

    prestigeTotal: 0,
    prestigeSpent: 0,
    prestigeUp: {},

    regs: { tax:0, fees:0, leverage:0, data:0 },

    stats: { clicks: 0, crits: 0, maxStreak: 0, playTimeSec: 0, offlineGained: 0, tradesLoggedTotal: 0 },

    regUsage: { tax:0, fees:0, leverage:0, data:0 },

    order: { streak: 0, lastClickAt: 0, risk: 0 },

    career: { chapter: 0, step: 0, points: 0, completed: 0 },

    ach: {
      claimed: {},
      bonuses: {
        clickPct: 0,
        gpsPct: 0,
        critChance: 0,
        offlinePct: 0,
        costMult: 1,
        riskCoolAdd: 0,
        slipPenaltyMult: 1,
        streakMaxBonusAdd: 0,
        prestigeGainPct: 0,
      }
    },

    ui: {
      achFilter: "all",
      achSearch: "",
      achOpenCats: {},
      achSort: "default",
      offlinePending: 0
    },

    trades: [],

    mods: JSON.parse(JSON.stringify(baseMods)),
  };
}



let state = defaultState();

/* ✅ évite de rerender le log en boucle */
let tradeLogDirty = true;

/* ✅ throttle pour refresh boutons sans coût */
let _lastAffordUpdate = 0;

const CLICK_GAIN_WINDOW_MS = 2000;
let _recentClickGains = [];

/* ✨ PLUS: tracking upgrades nouveaux */
let _lastUpgradeAvailSet = new Set();
let _lastUpgradeNotifyAt = 0;

// ✅ Fix: éviter de rerender Achievements/Career en boucle (sinon clics ratés)
let achDirty = true;
let _lastAchRender = 0;
let _lastCareerRender = 0;


/* -------------------------
   Derived / Mechanics
-------------------------- */
function hasUp(id){ return !!state.upgrades?.[id]; }

function prestigeAvailable(){
  return Math.max(0, (state.prestigeTotal || 0) - (state.prestigeSpent || 0));
}

function prestigeMult(){
  return 1 + (state.prestigeTotal || 0) * (state.mods.prestigePerPoint || 0.04);
}

function careerMult(){
  const pts = state.career?.points || 0;
  return 1 + pts * 0.03;
}

function upgradeCost(up){
  return Math.ceil((up?.cost || 0) * DIFFICULTY.upgradeCostMult);
}

function prestigeShopCost(it, lvl){
  return Math.ceil(it.cost(lvl) * DIFFICULTY.prestigeShopCostMult);
}

function careerTarget(n){
  return scaleTarget(n, DIFFICULTY.careerTargetMult);
}

function achTarget(n){
  return scaleTarget(n, DIFFICULTY.achTargetMult);
}

function clickPower(){
  return 1 * state.mods.clickMult * prestigeMult() * careerMult() * DIFFICULTY.gainMult;
}

function clickGainPerSec(){
  const now = Date.now();
  _recentClickGains = _recentClickGains.filter(x => now - x.t <= CLICK_GAIN_WINDOW_MS);
  if (_recentClickGains.length === 0) return 0;
  const sum = _recentClickGains.reduce((acc, x) => acc + x.gain, 0);
  return sum / (CLICK_GAIN_WINDOW_MS / 1000);
}

function buildingCost(bid, countOverride = null){
  const b = BUILDINGS.find(x => x.id === bid);
  const owned = (countOverride == null) ? (state.buildings?.[bid] || 0) : countOverride;
  const base = b.baseCost * Math.pow(b.costMult, owned);
  const mult = state.mods.buildingCostMult?.[bid] ?? 1;
  return base * mult * DIFFICULTY.costMult;
}

function buildingGpsSingle(bid){
  const b = BUILDINGS.find(x => x.id === bid);
  const m = state.mods.buildingGpsMult?.[bid] ?? 1;
  return b.baseGps * m * state.mods.globalGpsMult * prestigeMult() * careerMult() * DIFFICULTY.gainMult;
}

function gps(){
  let total = 0;
  for (const b of BUILDINGS){
    total += (state.buildings?.[b.id] || 0) * b.baseGps * (state.mods.buildingGpsMult?.[b.id] ?? 1);
  }
  total *= state.mods.globalGpsMult * prestigeMult() * careerMult() * DIFFICULTY.gainMult;
  return total;
}

function meetsReq(req){
  if (!req) return true;
  if (req.prestige != null){
    if ((state.prestigeTotal || 0) < req.prestige) return false;
  }
  if (req.upgrades){
    for (const u of req.upgrades){
      if (!hasUp(u)) return false;
    }
  }
  if (req.buildings){
    for (const k of Object.keys(req.buildings)){
      if ((state.buildings?.[k] || 0) < req.buildings[k]) return false;
    }
  }
  return true;
}

function renderSidePanels(full){
  const now = Date.now();

  // Career: throttlé
  if (full || now - _lastCareerRender > 600){
    _lastCareerRender = now;
    renderCareer();
  }

  // Achievements: throttlé + "dirty" quand on change filtres/recherche
  if (full || achDirty || now - _lastAchRender > 800){
    _lastAchRender = now;
    achDirty = false;

    renderAchievements();

    // resync des inputs (si présents)
    if ($("achSearch")) $("achSearch").value = state.ui?.achSearch || "";
    if ($("achSort")) $("achSort").value = state.ui?.achSort || "default";
    highlightAchFilter();
  }
}


/* -------------------------
   Recompute Mods
-------------------------- */
function recomputeAllMods(){
  const base = defaultState().mods;
  state.mods = JSON.parse(JSON.stringify(base));

  for (const it of PRESTIGE_SHOP){
    const lvl = state.prestigeUp?.[it.id] || 0;
    if (lvl > 0) it.apply(state, lvl);
  }

  for (const up of UPGRADES){
    if (hasUp(up.id)) up.apply(state);
  }

  let bonus = 1;
  const playSec = state.stats?.playTimeSec || 0;
  for (const r of REGULATIONS){
    const lvl = state.regs?.[r.id] || 0;
    if (lvl <= 0) continue;

    const weightedSec = state.regUsage?.[r.id] || 0;
    const avgLvl = playSec > 0 ? (weightedSec / playSec) : 0;
    const effLvl = lvl > 0 ? Math.min(avgLvl, lvl) : 0;
    bonus *= (1 + r.bonusPerLevel * effLvl);

    const mit = clamp(state.mods.regMit?.[r.id] || 0, 0, 0.75);
    const eff = r.penaltyPerLevel * lvl * (1 - mit);

    r.applyPenalty(state, lvl, eff);
  }
  state.mods.prestigeGainMult = bonus;

  const ab = state.ach?.bonuses || {};
  state.mods.clickMult *= (1 + (ab.clickPct || 0));
  state.mods.globalGpsMult *= (1 + (ab.gpsPct || 0));
  state.mods.critChance += (ab.critChance || 0);
  state.mods.offlineMult *= (1 + (ab.offlinePct || 0));
  state.mods.riskCool += (ab.riskCoolAdd || 0);
  state.mods.slipMaxPenalty *= (ab.slipPenaltyMult || 1);
  state.mods.streakMaxBonus += (ab.streakMaxBonusAdd || 0);
  state.mods.prestigeGainMult *= (1 + (ab.prestigeGainPct || 0));

  const costMult = (ab.costMult || 1);
  for (const b of BUILDINGS) state.mods.buildingCostMult[b.id] *= costMult;
}

/* -------------------------
   Prestige gain
-------------------------- */
function prestigeBaseTotal(){
  return Math.floor(Math.sqrt((state.totalEarned || 0) / (5e6 * DIFFICULTY.prestigeScale)));
}

function prestigeGain(){
  const base = prestigeBaseTotal();
  const boosted = Math.floor(base * (state.mods.prestigeGainMult || 1));
  return Math.max(0, boosted - (state.prestigeTotal || 0));
}

function prestigeGainBase(){
  const base = prestigeBaseTotal();
  return Math.max(0, base - (state.prestigeTotal || 0));
}

function nextPrestigeTarget(){
  // Next target should not be reduced by regulation difficulty bonus.
  const needTotal = (state.prestigeTotal || 0) + 1;
  const needBase = needTotal;
  return (needBase ** 2) * 5e6 * DIFFICULTY.prestigeScale;
}

function doPrestige(){
  const gain = prestigeGain();
  if (gain <= 0) return;

  const keep = {
    prestigeTotal: (state.prestigeTotal || 0) + gain,
    prestigeSpent: state.prestigeSpent || 0,
    prestigeUp: { ...(state.prestigeUp || {}) },
    regs: { ...(state.regs || {}) },
    ui: { ...(state.ui || {}) },
    career: { ...(state.career || {}) },
    ach: { ...(state.ach || {}) },
  };

  state = defaultState();
  state.prestigeTotal = keep.prestigeTotal;
  state.prestigeSpent = keep.prestigeSpent;
  state.prestigeUp = keep.prestigeUp;
  state.regs = keep.regs;
  state.ui = keep.ui;
  state.career = keep.career;
  state.ach = keep.ach;

  recomputeAllMods();
  if (state.mods.startCash > 0){
    state.gold = state.mods.startCash;
    state.totalEarned += state.mods.startCash;
  }

  toast(`Nouveau fonds: +${gain} prestige (total ${state.prestigeTotal})`);
  save();
  render(true);
}

/* -------------------------
   Buy logic
-------------------------- */
function buyBuilding(bid){
  const mode = state.buyMode || 1;
  let bought = 0;

  if (mode === "max"){
    while (true){
      const cost = buildingCost(bid);
      if (state.gold < cost) break;
      state.gold -= cost;
      state.buildings[bid] = (state.buildings[bid] || 0) + 1;
      bought++;
    }
  } else {
    for (let i=0;i<mode;i++){
      const cost = buildingCost(bid);
      if (state.gold < cost) break;
      state.gold -= cost;
      state.buildings[bid] = (state.buildings[bid] || 0) + 1;
      bought++;
    }
  }

  if (bought > 0){
    toast(`Achat: ${bought} × ${BUILDINGS.find(b=>b.id===bid).name}`);
    save();
    render(true);
  }
}

function buyUpgrade(up){
  if (!up) return;
  if (hasUp(up.id)) return;
  if (!meetsReq(up.req)) return;
  const price = upgradeCost(up);
  if (state.gold < price) return;

  state.gold -= price;
  state.upgrades[up.id] = true;
  recomputeAllMods();
  toast(`Upgrade: ${up.name}`);
  save();
  render(true);
}

function buyPrestigeItem(id){
  const it = PRESTIGE_SHOP.find(x => x.id === id);
  if (!it) return;

  const lvl = state.prestigeUp?.[id] || 0;
  if (lvl >= it.max) return;

  const price = prestigeShopCost(it, lvl);
  if (prestigeAvailable() < price) return;

  state.prestigeUp[id] = lvl + 1;
  state.prestigeSpent = (state.prestigeSpent || 0) + price;

  recomputeAllMods();
  toast(`Boutique: ${it.name} (lvl ${lvl+1})`);
  save();
  render(true);
}

/* -------------------------
   Regulations
-------------------------- */
function isRegUnlocked(r){
  return (state.prestigeTotal || 0) >= (r.unlockAt || 0);
}

function setRegLevel(id, delta){
  const r = REGULATIONS.find(x => x.id === id);
  if (!r) return;

  if (!isRegUnlocked(r)){
    toast(`Débloqué à Prestige total ${r.unlockAt}.`);
    return;
  }

  const cur = state.regs?.[id] || 0;
  const next = clamp(cur + delta, 0, r.max);
  if (next === cur) return;

  state.regs[id] = next;
  recomputeAllMods();
  toast(`Régulation: ${r.name} niveau ${next}`);
  save();
  render(true);
}

/* -------------------------
   Trades log
-------------------------- */
function tradeTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function tradeSideFromGain(g){ return g >= 0 ? "BUY" : "SELL"; }

function addTradeLog(entry){
  if (!state.trades) state.trades = [];
  state.trades.unshift(entry);
  state.trades = state.trades.slice(0, 60);
  state.stats.tradesLoggedTotal = (state.stats.tradesLoggedTotal || 0) + 1;

  tradeLogDirty = true;
}

function renderTradeLog(){
  const el = $("tradeLog");
  if (!el) return;

  const rows = (state.trades || []);
  if (!rows.length){
    el.innerHTML = `<div class="muted">Aucune exécution notable pour le moment.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="list">
      ${rows.slice(0, 18).map(r => {
        const tags = [
          r.crit ? `CRIT x${r.critMult}` : null,
          r.streakMult ? `Flow x${r.streakMult.toFixed(2)}` : null,
          r.slippageMult ? `Slip x${r.slippageMult.toFixed(2)}` : null,
          (r.risk != null) ? `Heat ${Math.round(r.risk*100)}%` : null,
        ].filter(Boolean).join(" • ");

        return `
          <div class="item">
            <div class="left">
              <div class="name" style="font-family:var(--mono);">${tradeTime(r.ts)} • ${r.side} • ${r.symbol}</div>
              <div class="desc">Qty ${r.qty} @ ${r.price} • ${r.pnlText}</div>
              <div class="meta">${tags || "—"}</div>
            </div>
            <div class="right"></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* -------------------------
   ✅ IMPORTANT: refresh boutons en "render(false)"
-------------------------- */
function refreshAffordability(){
  const now = Date.now();
  if (now - _lastAffordUpdate < 180) return; // throttle
  _lastAffordUpdate = now;

  // Buildings
  document.querySelectorAll('button[data-buyb]').forEach(btn=>{
    const id = btn.getAttribute('data-buyb');
    const cost = buildingCost(id);
    btn.disabled = !(state.gold >= cost);
  });

  // Upgrades (ceux affichés)
  document.querySelectorAll('button[data-buyu]').forEach(btn=>{
    const id = btn.getAttribute('data-buyu');
    const up = UPGRADES.find(u=>u.id===id);
    const ok = up && !hasUp(id) && meetsReq(up.req) && (state.gold >= upgradeCost(up));
    btn.disabled = !ok;
  });

  // Prestige shop
  document.querySelectorAll('button[data-ps]').forEach(btn=>{
    const id = btn.getAttribute('data-ps');
    const it = PRESTIGE_SHOP.find(x=>x.id===id);
    if (!it) return;
    const lvl = state.prestigeUp?.[id] || 0;
    const done = lvl >= it.max;
    const price = prestigeShopCost(it, lvl);
    btn.disabled = done || !(prestigeAvailable() >= price);
  });
}

/* ✨ PLUS: notification quand un nouvel upgrade devient dispo */
function flashUpgrades(){
  const el = $("upgrades");
  if (!el) return;
  el.classList.add("flash");
  clearTimeout(flashUpgrades._tm);
  flashUpgrades._tm = setTimeout(()=> el.classList.remove("flash"), 900);
}

function checkNewUpgradeAvailability(){
  const now = Date.now();
  // pas trop souvent + évite spam au chargement
  if (now - _lastUpgradeNotifyAt < 600) return;

  const avail = UPGRADES.filter(u => !hasUp(u.id) && meetsReq(u.req));
  const availIds = new Set(avail.map(u => u.id));

  // premier passage: initialise sans notifier
  if (_lastUpgradeAvailSet.size === 0 && (state.stats?.playTimeSec || 0) < 2){
    _lastUpgradeAvailSet = availIds;
    return;
  }

  // nouvelles entrées
  const newly = [];
  for (const u of avail){
    if (!_lastUpgradeAvailSet.has(u.id)) newly.push(u);
  }

  if (newly.length){
    _lastUpgradeNotifyAt = now;
    const u = newly[0];
    const canBuy = state.gold >= upgradeCost(u);
    toast(canBuy ? `✨ Upgrade achetable: ${u.name}` : `✨ Nouvel upgrade: ${u.name}`);
    flashUpgrades();
    // re-render complet pour que la section Upgrades apparaisse si elle était vide
    render(true);
  }

  _lastUpgradeAvailSet = availIds;
}

/* -------------------------
   Click trading (Flow/Heat)
-------------------------- */
function doClick(){
  const now = Date.now();
  state.stats.clicks = (state.stats.clicks || 0) + 1;

  const windowMs = state.mods.streakWindowMs;
  if (state.order.lastClickAt && (now - state.order.lastClickAt) <= windowMs) {
    state.order.streak = Math.min(200, state.order.streak + 1);
  } else {
    state.order.streak = 0;
  }
  state.order.lastClickAt = now;
  state.stats.maxStreak = Math.max(state.stats.maxStreak || 0, state.order.streak || 0);

  const streakBonus = Math.min(state.mods.streakMaxBonus, state.order.streak * state.mods.streakPerStack);
  const streakMult = 1 + streakBonus;

  state.order.risk = Math.min(1, state.order.risk + state.mods.riskHeat);

  let slippageMult = 1;
  if (state.order.risk > state.mods.slipStart){
    const t = (state.order.risk - state.mods.slipStart) / (1 - state.mods.slipStart);
    slippageMult = 1 - state.mods.slipMaxPenalty * clamp(t, 0, 1);
  }

  let gain = clickPower() * streakMult * slippageMult;

  let crit = false;
  if (state.mods.critChance > 0 && Math.random() < state.mods.critChance){
    gain *= state.mods.critMult;
    crit = true;
    state.stats.crits = (state.stats.crits || 0) + 1;
  }

  const base = clickPower();
  const notable = crit || (gain >= base * 6);
  if (notable){
    const symbols = ["AURX", "GLD", "EURUSD", "UST10Y", "ALT-LS"];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const qty = Math.max(1, Math.floor(gain / Math.max(1, base)));
    const price = (100 + Math.random() * 40).toFixed(2);

    addTradeLog({
      ts: Date.now(),
      side: tradeSideFromGain(gain),
      symbol,
      qty,
      price,
      pnl: gain,
      pnlText: "+" + format(gain) + " €",
      crit,
      critMult: state.mods.critMult,
      streakMult,
      slippageMult,
      risk: state.order.risk
    });
  }

  state.gold += gain;
  state.totalEarned += gain;
  _recentClickGains.push({ t: now, gain });

  if ($("critInfo")) $("critInfo").textContent = crit ? `x${state.mods.critMult}` : "—";
  render(false);
}

/* -------------------------
   Tick loop + offline + save
-------------------------- */
let lastTick = Date.now();

function tick(){
  const now = Date.now();
  const dt = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;

  state.stats.playTimeSec = (state.stats.playTimeSec || 0) + dt;
  if (!state.regUsage) state.regUsage = { tax:0, fees:0, leverage:0, data:0 };
  for (const r of REGULATIONS){
    const lvl = state.regs?.[r.id] || 0;
    if (lvl > 0){
      state.regUsage[r.id] = (state.regUsage[r.id] || 0) + (lvl * dt);
    }
  }

  const g = gps() * dt;
  state.gold += g;
  state.totalEarned += g;

  state.order.risk = Math.max(0, state.order.risk - state.mods.riskCool * dt);

  render(false);
}

function save(){
  state.lastSave = Date.now();
  localStorage.setItem("aurelia_save_v3", JSON.stringify(state));
}

function load(){
  const raw = localStorage.getItem("aurelia_save_v3");
  if (!raw){
    state = defaultState();
    recomputeAllMods();
    return;
  }

  try{
    const loaded = JSON.parse(raw);
    const base = defaultState();

    state = base;
    state.gold = loaded.gold ?? base.gold;
    state.totalEarned = loaded.totalEarned ?? base.totalEarned;
    state.lastSave = loaded.lastSave ?? base.lastSave;

    state.buildings = { ...base.buildings, ...(loaded.buildings || {}) };
    state.upgrades = { ...(loaded.upgrades || {}) };
    state.buyMode = loaded.buyMode ?? base.buyMode;

    state.prestigeTotal = loaded.prestigeTotal ?? base.prestigeTotal;
    state.prestigeSpent = loaded.prestigeSpent ?? base.prestigeSpent;
    state.prestigeUp = { ...(loaded.prestigeUp || {}) };

    state.regs = { ...base.regs, ...(loaded.regs || {}) };
    state.stats = { ...base.stats, ...(loaded.stats || {}) };
    state.regUsage = { ...base.regUsage, ...(loaded.regUsage || {}) };
    state.order = { ...base.order, ...(loaded.order || {}) };
    state.ui = { ...base.ui, ...(loaded.ui || {}) };
    state.career = { ...base.career, ...(loaded.career || {}) };
    state.ach = { ...base.ach, ...(loaded.ach || {}) };

    state.trades = Array.isArray(loaded.trades) ? loaded.trades.slice(0,60) : [];
    tradeLogDirty = true;

    recomputeAllMods();

    const now = Date.now();
    const pending = state.ui?.offlinePending || 0;
    if (pending > 0){
      state.lastSave = now;
      save();
      showOfflineModal(pending);
      return;
    }

    const awaySec = clamp((now - (loaded.lastSave || now)) / 1000, 0, 60 * 60 * 12);
    const offGain = gps() * awaySec * (state.mods.offlineMult || 1);
    if (offGain > 0){
      state.ui.offlinePending = offGain;
      state.lastSave = now;
      save();
      showOfflineModal(offGain);
    }

  }catch(e){
    console.error(e);
    state = defaultState();
    recomputeAllMods();
  }
}

/* -------------------------
   Career
-------------------------- */
const CHAPTERS = [
  {
    name: "Chapitre 1 — Onboarding",
    desc: "Prise en main du trading manuel et premiers investissements.",
    reward: { points: 1 },
    steps: [
      { name:`Faire ${careerTarget(50)} trades manuels`, desc:`Exécute ${careerTarget(50)} clics sur Trader.`,
        check: ()=>{ const cur=state.stats?.clicks||0, target=careerTarget(50); return {cur,target,done:cur>=target,prog:`${cur}/${target}`}; } },
      { name:`Atteindre ${format(careerTarget(500))}€ de Cash`, desc:`Accumule ${format(careerTarget(500))}€ (cash disponible).`,
        check: ()=>{ const cur=Math.floor(state.gold||0), target=careerTarget(500); return {cur,target,done:cur>=target,prog:`${format(cur)}€ / ${format(target)}€`}; } },
      { name:`Acheter ${careerTarget(10)} “Stagiaire Excel”`, desc:"Base de production.",
        check: ()=>{ const cur=state.buildings?.intern||0, target=careerTarget(10); return {cur,target,done:cur>=target,prog:`${cur}/${target}`}; } },
    ]
  },
  {
    name: "Chapitre 2 — Desk Setup",
    desc: "Structurer un desk : analyse + pipeline + premiers boosts.",
    reward: { points: 2 },
    steps: [
      { name:`Atteindre ${format(careerTarget(100))}€/sec`, desc:"Augmente ta production passive.",
        check: ()=>{ const cur=gps(), target=careerTarget(100); return {cur,target,done:cur>=target,prog:`${format(cur)}/sec / ${format(target)}/sec`}; } },
      { name:`Acheter ${careerTarget(5)} Analystes`, desc:"Renforce la thèse.",
        check: ()=>{ const cur=state.buildings?.analyst||0, target=careerTarget(5); return {cur,target,done:cur>=target,prog:`${cur}/${target}`}; } },
      { name:"Acheter “Pipeline de Data”", desc:"Boost global de production.",
        check: ()=>{ const done=!!state.upgrades?.u_global_1; return {cur:done?1:0,target:1,done,prog:done?"OK":"Non acheté"}; } },
    ]
  },
  {
    name: "Chapitre 3 — Automation",
    desc: "Passer du manuel vers l’automatisé (bots, signaux).",
    reward: { points: 3 },
    steps: [
      { name:`Acheter ${careerTarget(5)} “Moteur de Signaux”`, desc:"Industrialise les entrées.",
        check: ()=>{ const cur=state.buildings?.signals||0, target=careerTarget(5); return {cur,target,done:cur>=target,prog:`${cur}/${target}`}; } },
      { name:`Acheter ${careerTarget(3)} “Bot de Trading”`, desc:"Automatise l’exécution.",
        check: ()=>{ const cur=state.buildings?.bot||0, target=careerTarget(3); return {cur,target,done:cur>=target,prog:`${cur}/${target}`}; } },
      { name:`Atteindre ${format(careerTarget(5000))}€/sec`, desc:"Scale ta production.",
        check: ()=>{ const cur=gps(), target=careerTarget(5000); return {cur,target,done:cur>=target,prog:`${format(cur)}/sec / ${format(target)}/sec`}; } },
    ]
  },
];

function currentChapter(){ return CHAPTERS[state.career?.chapter || 0] || null; }
function currentStep(){
  const chap = currentChapter();
  if (!chap) return null;
  return chap.steps[state.career?.step || 0] || null;
}

function claimCareerStep(){
  const chap = currentChapter();
  const step = currentStep();
  if (!chap || !step) return;

  const status = step.check();
  if (!status.done) return;

  state.career.step += 1;

  if (state.career.step >= chap.steps.length){
    state.career.chapter += 1;
    state.career.step = 0;
    state.career.completed = (state.career.completed || 0) + 1;

    const pts = chap.reward?.points || 0;
    state.career.points = (state.career.points || 0) + pts;

    toast(`✅ Chapitre terminé: ${chap.name} (+${pts} points carrière)`);
  } else {
    toast(`✅ Objectif validé: ${step.name}`);
  }

  save();
  render(true);
}

function renderCareer(){
  if (!$("careerChapterName")) return;

  const chap = currentChapter();
  if (!chap){
    $("careerChapterName").textContent = "Carrière terminée";
    $("careerChapterDesc").textContent = "Bravo — d’autres chapitres arriveront.";
    $("careerStepIdx").textContent = "—";
    $("careerReward").textContent = "—";
    $("careerStepName").textContent = "Objectif: —";
    $("careerStepDesc").textContent = "—";
    $("careerStepProg").textContent = "—";
    $("careerBar").style.width = "100%";
    $("careerClaim").disabled = true;
    $("careerPoints").textContent = format(state.career?.points || 0);
    $("careerMult").textContent = "x" + careerMult().toFixed(2);
    return;
  }

  const step = currentStep();
  const stepIndex = (state.career?.step || 0) + 1;
  const totalSteps = chap.steps.length;

  $("careerChapterName").textContent = chap.name;
  $("careerChapterDesc").textContent = chap.desc;
  $("careerStepIdx").textContent = `${stepIndex}/${totalSteps}`;
  $("careerReward").textContent = `+${chap.reward?.points || 0} points`;

  if (step){
    const s = step.check();
    $("careerStepName").textContent = `Objectif: ${step.name}`;
    $("careerStepDesc").textContent = step.desc;
    $("careerStepProg").textContent = s.prog;
    $("careerClaim").disabled = !s.done;
  } else {
    $("careerClaim").disabled = true;
  }

  const doneSteps = (state.career?.step || 0);
  const pct = Math.round((doneSteps / totalSteps) * 100);
  $("careerBar").style.width = pct + "%";

  $("careerPoints").textContent = format(state.career?.points || 0);
  $("careerMult").textContent = "x" + careerMult().toFixed(2);
}

/* -------------------------
   Achievements (~50) + UI pro
-------------------------- */
function achBonusAdd(rew){
  const b = state.ach.bonuses;
  b.clickPct += (rew.clickPct || 0);
  b.gpsPct += (rew.gpsPct || 0);
  b.critChance += (rew.critChance || 0);
  b.offlinePct += (rew.offlinePct || 0);
  b.riskCoolAdd += (rew.riskCoolAdd || 0);
  b.streakMaxBonusAdd += (rew.streakMaxBonusAdd || 0);
  b.prestigeGainPct += (rew.prestigeGainPct || 0);
  b.costMult *= (rew.costMult || 1);
  b.slipPenaltyMult *= (rew.slipPenaltyMult || 1);
}

function sumBuildings(){ return Object.values(state.buildings || {}).reduce((a,b)=>a+(b||0),0); }
function sumShopLevels(){ return Object.values(state.prestigeUp || {}).reduce((a,b)=>a+(b||0),0); }
function sumRegLevels(){ return Object.values(state.regs || {}).reduce((a,b)=>a+(b||0),0); }
function upgradesCount(){ return Object.keys(state.upgrades || {}).length; }

function mkMilestone(cat, id, name, desc, getCur, target, reward, rewardText){
  return {
    cat, id, name, desc, reward, rewardText,
    check: () => {
      const cur = getCur();
      const scaledTarget = achTarget(target);
      const done = cur >= scaledTarget;
      return { done, cur, target: scaledTarget, prog: `${format(cur)} / ${format(scaledTarget)}` };
    }
  };
}
function mkMilestonePct(cat, id, name, desc, getCur, target, fmtProg, reward, rewardText){
  return {
    cat, id, name, desc, reward, rewardText,
    check: () => {
      const cur = getCur();
      const scaledTarget = achTarget(target);
      const done = cur >= scaledTarget;
      return { done, cur, target: scaledTarget, prog: fmtProg(cur, scaledTarget) };
    }
  };
}

const ACH = [];

// Click milestones
[10,50,200,1000,5000,20000,100000].forEach((t,i)=>{
  ACH.push(mkMilestone(
    "Trading",
    `ach_click_${t}`,
    `Main rapide ${i+1}`,
    `Effectuer ${t} trades manuels.`,
    ()=> (state.stats?.clicks || 0),
    t,
    { clickPct: 0.01 + i*0.005 },
    `+${(1 + i*0.5).toFixed(1)}% puissance de clic`
  ));
});

// Cash milestones
[
  {t:1e3,  r:{gpsPct:0.01}, txt:"+1% P&L/sec global"},
  {t:1e4,  r:{gpsPct:0.015}, txt:"+1.5% P&L/sec global"},
  {t:1e6,  r:{costMult:0.99}, txt:"-1% coût bâtiments"},
  {t:1e9,  r:{costMult:0.985}, txt:"-1.5% coût bâtiments"},
  {t:1e12, r:{gpsPct:0.03}, txt:"+3% P&L/sec global"},
].forEach((x,idx)=>{
  ACH.push(mkMilestonePct(
    "Capital",
    `ach_cash_${idx}`,
    `Capital milestone ${idx+1}`,
    `Atteindre ${format(x.t)}€ de Cash.`,
    ()=> (state.gold || 0),
    x.t,
    (cur,t)=> `${format(cur)}€ / ${format(t)}€`,
    x.r,
    x.txt
  ));
});

// GPS milestones
[
  {t:10, r:{gpsPct:0.01}, txt:"+1% P&L/sec global"},
  {t:100, r:{gpsPct:0.015}, txt:"+1.5% P&L/sec global"},
  {t:1000, r:{gpsPct:0.02}, txt:"+2% P&L/sec global"},
  {t:10000, r:{gpsPct:0.03}, txt:"+3% P&L/sec global"},
  {t:100000, r:{gpsPct:0.04}, txt:"+4% P&L/sec global"},
  {t:1000000, r:{gpsPct:0.05}, txt:"+5% P&L/sec global"},
].forEach((x,idx)=>{
  ACH.push(mkMilestonePct(
    "Production",
    `ach_gps_${idx}`,
    `Scaling ${idx+1}`,
    `Atteindre ${format(x.t)}/sec.`,
    ()=> gps(),
    x.t,
    (cur,t)=> `${format(cur)}/sec / ${format(t)}/sec`,
    x.r,
    x.txt
  ));
});

// Crit milestones
[
  {t:1,   r:{critChance:0.01}, txt:"+1% crit"},
  {t:25,  r:{critChance:0.01}, txt:"+1% crit"},
  {t:250, r:{critChance:0.02}, txt:"+2% crit"},
].forEach((x,idx)=>{
  ACH.push(mkMilestone(
    "Trading",
    `ach_crits_${idx}`,
    `Catalyseur ${idx+1}`,
    `Déclencher ${x.t} crit(s).`,
    ()=> (state.stats?.crits || 0),
    x.t,
    x.r,
    x.txt
  ));
});

// Streak milestones
[
  {t:10,  r:{streakMaxBonusAdd:0.15}, txt:"+0.15 cap Flow"},
  {t:25,  r:{streakMaxBonusAdd:0.20}, txt:"+0.20 cap Flow"},
  {t:50,  r:{streakMaxBonusAdd:0.25}, txt:"+0.25 cap Flow"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Trading",
    id:`ach_streak_${idx}`,
    name:`Flow master ${idx+1}`,
    desc:`Atteindre un streak max de ${x.t}.`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = state.stats?.maxStreak || 0;
      return { done: cur >= x.t, cur, target: x.t, prog: `${cur}/${x.t}` };
    }
  });
});

// Total buildings milestones
[
  {t:10,  r:{gpsPct:0.01}, txt:"+1% P&L/sec global"},
  {t:50,  r:{costMult:0.99}, txt:"-1% coût bâtiments"},
  {t:200, r:{gpsPct:0.02}, txt:"+2% P&L/sec global"},
  {t:1000,r:{costMult:0.985}, txt:"-1.5% coût bâtiments"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Infrastructure",
    id:`ach_build_total_${idx}`,
    name:`Expansion ${idx+1}`,
    desc:`Posséder ${x.t} bâtiments au total.`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = sumBuildings();
      return { done: cur >= x.t, cur, target: x.t, prog: `${cur}/${x.t}` };
    }
  });
});

// Upgrades milestones
[
  {t:1, r:{clickPct:0.02}, txt:"+2% click"},
  {t:3, r:{gpsPct:0.02}, txt:"+2% global"},
  {t:UPGRADES.length, r:{critChance:0.01, gpsPct:0.03}, txt:"+1% crit +3% global"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Infrastructure",
    id:`ach_up_${idx}`,
    name:`Optimisation ${idx+1}`,
    desc:`Acheter ${x.t === UPGRADES.length ? "tous" : x.t} upgrade(s) de run.`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = upgradesCount();
      const tgt = x.t;
      return { done: cur >= tgt, cur, target: tgt, prog: `${cur}/${tgt}` };
    }
  });
});

// Prestige milestones
[
  {t:1,   r:{prestigeGainPct:0.03}, txt:"+3% gain prestige"},
  {t:5,   r:{prestigeGainPct:0.04}, txt:"+4% gain prestige"},
  {t:25,  r:{prestigeGainPct:0.05}, txt:"+5% gain prestige"},
  {t:100, r:{prestigeGainPct:0.07}, txt:"+7% gain prestige"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Prestige",
    id:`ach_prest_${idx}`,
    name:`Track record ${idx+1}`,
    desc:`Atteindre Prestige total ${x.t}.`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = state.prestigeTotal || 0;
      return { done: cur >= x.t, cur, target: x.t, prog: `${cur}/${x.t}` };
    }
  });
});

// Prestige shop milestones
[
  {t:1,   r:{gpsPct:0.01}, txt:"+1% global"},
  {t:10,  r:{offlinePct:0.10}, txt:"+10% offline"},
  {t:30,  r:{clickPct:0.04}, txt:"+4% click"},
  {t:100, r:{costMult:0.98}, txt:"-2% coût bâtiments"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Prestige",
    id:`ach_shop_${idx}`,
    name:`Héritage ${idx+1}`,
    desc:`Total de niveaux achetés en boutique prestige: ${x.t}.`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = sumShopLevels();
      return { done: cur >= x.t, cur, target: x.t, prog: `${cur}/${x.t}` };
    }
  });
});

// Regulations milestones
ACH.push({
  cat:"Risk & Compliance",
  id:"ach_reg_unlock",
  name:"Compliance aware",
  desc:"Débloquer au moins 1 régulation (Prestige requis).",
  reward:{riskCoolAdd:0.04},
  rewardText:"+ refroidissement Heat",
  check: ()=>{
    const unlocked = REGULATIONS.some(r => (state.prestigeTotal || 0) >= (r.unlockAt || 0));
    return { done: unlocked, prog: unlocked ? "OK" : "Non" };
  }
});
ACH.push({
  cat:"Risk & Compliance",
  id:"ach_reg_lvl5",
  name:"Sous contrainte",
  desc:"Mettre une régulation au niveau 5.",
  reward:{prestigeGainPct:0.04},
  rewardText:"+4% gain prestige",
  check: ()=>{
    const done = Object.values(state.regs || {}).some(v => (v||0) >= 5);
    return { done, prog: done ? "OK" : "—" };
  }
});
ACH.push({
  cat:"Risk & Compliance",
  id:"ach_reg_total20",
  name:"Cadre strict",
  desc:"Total de niveaux de régulations ≥ 20.",
  reward:{slipPenaltyMult:0.95},
  rewardText:"Slippage moins violent",
  check: ()=>{
    const cur = sumRegLevels();
    return { done: cur >= 20, cur, target: 20, prog: `${cur}/20` };
  }
});
ACH.push({
  cat:"Risk & Compliance",
  id:"ach_reg_max10",
  name:"Hard mode",
  desc:"Mettre une régulation au niveau max (10).",
  reward:{prestigeGainPct:0.06},
  rewardText:"+6% gain prestige",
  check: ()=>{
    const done = Object.values(state.regs || {}).some(v => (v||0) >= 10);
    return { done, prog: done ? "OK" : "—" };
  }
});

// Trades logged milestones
[
  {t:10,  r:{critChance:0.005}, txt:"+0.5% crit"},
  {t:50,  r:{gpsPct:0.015}, txt:"+1.5% global"},
  {t:200, r:{clickPct:0.03}, txt:"+3% click"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Trading",
    id:`ach_trades_${idx}`,
    name:`Journal d’exécution ${idx+1}`,
    desc:`Avoir ${x.t} exécutions notables dans le log (total).`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = state.stats?.tradesLoggedTotal || 0;
      return { done: cur >= x.t, cur, target: x.t, prog: `${cur}/${x.t}` };
    }
  });
});

// Playtime milestones
[
  {t:10*60, r:{gpsPct:0.01}, txt:"+1% global"},
  {t:60*60, r:{clickPct:0.02}, txt:"+2% click"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Meta",
    id:`ach_time_${idx}`,
    name:`Présence ${idx+1}`,
    desc:`Jouer ${idx===0 ? "10 minutes" : "1 heure"} (cumuls).`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = Math.floor(state.stats?.playTimeSec || 0);
      const done = cur >= x.t;
      const mm = Math.floor(cur/60);
      const tgtm = Math.floor(x.t/60);
      return { done, cur, target: x.t, prog: `${mm}m / ${tgtm}m` };
    }
  });
});

// Offline gain milestones
[
  {t:1e5, r:{offlinePct:0.15}, txt:"+15% offline"},
  {t:1e8, r:{offlinePct:0.25}, txt:"+25% offline"},
].forEach((x,idx)=>{
  ACH.push({
    cat:"Meta",
    id:`ach_off_${idx}`,
    name:`Overnight ${idx+1}`,
    desc:`Gains offline cumulés ≥ ${format(x.t)}€.`,
    reward:x.r,
    rewardText: x.txt,
    check: ()=>{
      const cur = state.stats?.offlineGained || 0;
      return { done: cur >= x.t, cur, target: x.t, prog: `${format(cur)}€ / ${format(x.t)}€` };
    }
  });
});

function isAchClaimed(id){ return !!state.ach?.claimed?.[id]; }

function claimAchievement(id){
  const a = ACH.find(x => x.id === id);
  if (!a) return;
  if (isAchClaimed(id)) return;

  const st = a.check();
  if (!st.done) return;

  state.ach.claimed[id] = true;
  achBonusAdd(a.reward || {});
  recomputeAllMods();

  toast(`🏆 Exploit: ${a.name}`);
  save();
  render(true);
}

function achProgressScore(st){
  if (!st) return 0;
  if (st.done) return 1;
  if (typeof st.cur === "number" && typeof st.target === "number" && st.target > 0){
    return clamp(st.cur / st.target, 0, 0.9999);
  }
  return 0;
}

function achRewardScore(rew){
  if (!rew) return 0;
  let s = 0;
  s += (rew.clickPct || 0) * 100;
  s += (rew.gpsPct || 0) * 100;
  s += (rew.critChance || 0) * 250;
  s += (rew.offlinePct || 0) * 80;
  s += (rew.riskCoolAdd || 0) * 120;
  s += (rew.streakMaxBonusAdd || 0) * 120;
  if (rew.costMult && rew.costMult < 1) s += (1 - rew.costMult) * 250;
  if (rew.slipPenaltyMult && rew.slipPenaltyMult < 1) s += (1 - rew.slipPenaltyMult) * 220;
  s += (rew.prestigeGainPct || 0) * 160;
  return s;
}

function claimAllAchievements(ids){
  if (!ids.length) return;

  for (const id of ids){
    const a = ACH.find(x => x.id === id);
    if (!a) continue;
    if (isAchClaimed(id)) continue;

    const st = a.check();
    if (!st.done) continue;

    state.ach.claimed[id] = true;
    achBonusAdd(a.reward || {});
  }

  recomputeAllMods();
  toast(`🏆 Exploits réclamés: ${ids.length}`);
  save();
  render(true);
}

function highlightAchFilter(){
  const cur = state.ui?.achFilter || "all";
  document.querySelectorAll("button[data-achfilter]").forEach(btn=>{
    btn.classList.toggle("active", (btn.getAttribute("data-achfilter") === cur));
  });
}

function renderAchievements(){
  const wrap = $("achList");
  if (!wrap) return;

  const total = ACH.length;
  let doneCount = 0;
  let claimable = 0;

  const filter = state.ui?.achFilter || "all";
  const q = (state.ui?.achSearch || "").trim().toLowerCase();
  const sortMode = state.ui?.achSort || "default";

  const prepared = ACH.map(a => {
    const claimed = isAchClaimed(a.id);
    const st = a.check();
    const canClaim = st.done && !claimed;

    if (claimed) doneCount++;
    if (canClaim) claimable++;

    const textBlob = `${a.name} ${a.desc} ${a.rewardText}`.toLowerCase();
    const matchSearch = q ? textBlob.includes(q) : true;

    let matchFilter = true;
    if (filter === "completed") matchFilter = claimed;
    else if (filter === "claimable") matchFilter = canClaim;
    else if (filter === "inprogress") matchFilter = !st.done;

    return {
      a, claimed, st, canClaim,
      match: matchSearch && matchFilter,
      pScore: achProgressScore(st),
      rScore: achRewardScore(a.reward),
    };
  });

  const shown = prepared.filter(x => x.match).length;

  $("achTotal").textContent = total;
  $("achDone").textContent = doneCount;
  $("achClaimable").textContent = claimable;
  $("achShown").textContent = shown;

  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  $("achPct").textContent = pct + "%";
  $("achBar").style.width = pct + "%";

  function sortPrepared(arr){
    if (sortMode === "default") return arr;
    const copy = arr.slice();
    if (sortMode === "progress"){
      copy.sort((x,y)=>{
        const ax = x.canClaim ? 2 : (x.claimed ? 0 : 1);
        const ay = y.canClaim ? 2 : (y.claimed ? 0 : 1);
        if (ay !== ax) return ay - ax;
        return (y.pScore - x.pScore) || (y.rScore - x.rScore);
      });
    } else if (sortMode === "reward"){
      copy.sort((x,y)=>{
        const ax = x.canClaim ? 1 : 0;
        const ay = y.canClaim ? 1 : 0;
        if (ay !== ax) return ay - ax;
        return (y.rScore - x.rScore) || (y.pScore - x.pScore);
      });
    }
    return copy;
  }

  const order = ["Trading", "Production", "Infrastructure", "Capital", "Prestige", "Risk & Compliance", "Meta"];
  const groups = new Map();
  for (const x of sortPrepared(prepared)){
    if (!x.match) continue;
    const cat = x.a.cat || "Autres";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(x);
  }

  const cats = Array.from(groups.keys()).sort((a,b)=>{
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  if (!cats.length){
    wrap.innerHTML = `<div class="muted">Aucun exploit ne correspond à ce filtre / cette recherche.</div>`;
    return;
  }

  wrap.innerHTML = cats.map(cat => {
    const rows = groups.get(cat);

    const catTotal = rows.length;
    const catDone = rows.filter(x => x.claimed).length;
    const catClaim = rows.filter(x => x.canClaim).length;

    const open = (state.ui?.achOpenCats?.[cat] ?? (catClaim > 0));
    const openAttr = open ? "open" : "";

    const inner = rows.map(x => {
      const a = x.a;
      const st = x.st;
      const claimed = x.claimed;
      const canClaim = x.canClaim;

      const statusTxt = claimed ? "OK" : (st.done ? "Réclamable" : "En cours");
      const btn = claimed
        ? `<button class="smallbtn" disabled>OK</button>`
        : `<button class="smallbtn btn-good" data-ach="${a.id}" ${canClaim ? "" : "disabled"}>Réclamer</button>`;

      return `
        <div class="item achItem">
          <div class="left">
            <div class="name">${a.name} <span class="pill">${statusTxt}</span></div>
            <div class="desc">${a.desc}</div>
            <div class="meta">Progression: <b>${st.prog}</b> • Récompense: <b>${a.rewardText}</b></div>
          </div>
          <div class="right">${btn}</div>
        </div>
      `;
    }).join("");

    return `
      <details class="achGroup" data-cat="${cat}" ${openAttr}>
        <summary>
          <div class="sumLeft">
            <div class="sumTitle">${cat}</div>
            <span class="pill">OK <b>${catDone}</b>/${catTotal}</span>
            ${catClaim > 0 ? `<span class="pill">Réclamables <b>${catClaim}</b></span>` : ``}
          </div>
          <div class="sumMeta"><span class="pill">Sections</span></div>
        </summary>
        <div class="content">${inner}</div>
      </details>
    `;
  }).join("");

  wrap.querySelectorAll("button[data-ach]").forEach(b=>{
    b.addEventListener("click", ()=> claimAchievement(b.getAttribute("data-ach")));
  });

  wrap.querySelectorAll("details.achGroup").forEach(d => {
    d.addEventListener("toggle", ()=>{
      const cat = d.getAttribute("data-cat");
      state.ui.achOpenCats = state.ui.achOpenCats || {};
      state.ui.achOpenCats[cat] = d.open;
      save();
    });
  });
}

/* -------------------------
   Rendering core lists
-------------------------- */
function setBuyMode(mode){
  state.buyMode = mode;
  if ($("buyModeLbl")){
    $("buyModeLbl").textContent = (mode === "max") ? "MAX" : ("x" + mode);
  }
  save();
  render(true);
}

function renderBuildings(){
  const wrap = $("buildings");
  wrap.innerHTML = "";

  for (const b of BUILDINGS){
    const count = state.buildings?.[b.id] || 0;
    const cost = buildingCost(b.id);
    const can = state.gold >= cost;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="left">
        <div class="name">${b.name} <span class="pill">x<b>${count}</b></span></div>
        <div class="desc">${b.desc}</div>
        <div class="meta">Coût: <b>${format(cost)} €</b> • +<b>${format(buildingGpsSingle(b.id))}</b>/sec</div>
      </div>
      <div class="right">
        <button ${can ? "" : "disabled"} data-buyb="${b.id}" class="btn-good">Acheter</button>
      </div>
    `;
    wrap.appendChild(div);
  }

  wrap.querySelectorAll("button[data-buyb]").forEach(btn=>{
    btn.addEventListener("click", ()=> buyBuilding(btn.getAttribute("data-buyb")));
  });
}

function renderUpgrades(){
  const wrap = $("upgrades");
  wrap.innerHTML = "";

  const avail = UPGRADES.filter(u => !hasUp(u.id) && meetsReq(u.req)).sort((a,b)=>a.cost-b.cost);
  if (!avail.length){
    wrap.innerHTML = `<div class="muted">Aucun upgrade disponible pour l’instant.</div>`;
    return;
  }

  for (const u of avail.slice(0, 18)){
    const price = upgradeCost(u);
    const can = state.gold >= price;
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="left">
        <div class="name">${u.name}</div>
        <div class="desc">${u.desc}</div>
        <div class="meta">Coût: <b>${format(price)} €</b></div>
      </div>
      <div class="right">
        <button ${can ? "" : "disabled"} data-buyu="${u.id}">Acheter</button>
      </div>
    `;
    wrap.appendChild(div);
  }

  wrap.querySelectorAll("button[data-buyu]").forEach(btn=>{
    const id = btn.getAttribute("data-buyu");
    const up = UPGRADES.find(x=>x.id===id);
    btn.addEventListener("click", ()=> buyUpgrade(up));
  });
}

function renderPrestigeShop(){
  const wrap = $("prestigeShop");
  wrap.innerHTML = "";

  for (const it of PRESTIGE_SHOP){
    const lvl = state.prestigeUp?.[it.id] || 0;
    const done = lvl >= it.max;
    const price = prestigeShopCost(it, lvl);
    const can = !done && prestigeAvailable() >= price;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="left">
        <div class="name">${it.name} <span class="muted">(lvl ${lvl}/${it.max})</span></div>
        <div class="desc">${it.desc}</div>
        <div class="meta">Coût: <b>${done ? "—" : (price + " PP")}</b></div>
      </div>
      <div class="right">
        <button ${can ? "" : "disabled"} data-ps="${it.id}" class="btn-good">${done ? "MAX" : "Acheter"}</button>
      </div>
    `;
    wrap.appendChild(div);
  }

  wrap.querySelectorAll("button[data-ps]").forEach(btn=>{
    btn.addEventListener("click", ()=> buyPrestigeItem(btn.getAttribute("data-ps")));
  });
}

function renderRegs(){
  const wrap = $("regs");
  wrap.innerHTML = "";

  $("regBonus").textContent = "x" + (state.mods.prestigeGainMult || 1).toFixed(2);

  for (const r of REGULATIONS){
    const lvl = state.regs?.[r.id] || 0;
    const mit = Math.round((state.mods.regMit?.[r.id] || 0) * 100);
    const unlocked = isRegUnlocked(r);
    const playSec = state.stats?.playTimeSec || 0;
    const weighted = state.regUsage?.[r.id] || 0;
    const avgLvl = playSec > 0 ? (weighted / playSec) : 0;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="left">
        <div class="name">
          ${r.name}
          ${unlocked ? "" : `<span class="pill" style="margin-left:8px;">LOCKED</span>`}
          <span class="muted"> (lvl ${lvl}/${r.max})</span>
        </div>
        <div class="desc">${r.desc}${unlocked ? "" : ` • Débloque à Prestige ${r.unlockAt}`}</div>
        <div class="meta">Mitigation: <b>${mit}%</b> • Bonus prestige: <b>+${Math.round(r.bonusPerLevel*100)}%/lvl</b> • Niveau moyen: <b>${avgLvl.toFixed(2)}</b></div>
      </div>
      <div class="right">
        <button ${( !unlocked || lvl<=0 ) ? "disabled" : ""} data-reg-dec="${r.id}">-</button>
        <button ${( !unlocked || lvl>=r.max ) ? "disabled" : ""} data-reg-inc="${r.id}">+</button>
      </div>
    `;
    wrap.appendChild(div);
  }

  wrap.querySelectorAll("button[data-reg-inc]").forEach(b => {
    b.addEventListener("click", () => setRegLevel(b.getAttribute("data-reg-inc"), +1));
  });
  wrap.querySelectorAll("button[data-reg-dec]").forEach(b => {
    b.addEventListener("click", () => setRegLevel(b.getAttribute("data-reg-dec"), -1));
  });
}

/* -------------------------
   Main render
-------------------------- */
function render(full = true){
  $("pbDate").textContent = nowLabel();

  $("gold").textContent = format(state.gold) + " €";
  $("gps").textContent = format(gps() + clickGainPerSec());
  $("total").textContent = format(state.totalEarned);

  $("ppTotal").textContent = format(state.prestigeTotal || 0);
  $("ppAvail").textContent = format(prestigeAvailable());
  $("prestMult").textContent = "x" + prestigeMult().toFixed(2);

  $("clickPower").textContent = format(clickPower());
  $("critChance").textContent = Math.round((state.mods.critChance || 0) * 100) + "%";

  const streakBonus = Math.min(state.mods.streakMaxBonus, state.order.streak * state.mods.streakPerStack);
  $("streak").textContent = "x" + (1 + streakBonus).toFixed(2);
  $("risk").textContent = Math.round((state.order.risk || 0) * 100) + "%";

  const gain = prestigeGain();
  $("ppGain").textContent = format(gain);
  const baseGain = prestigeGainBase();
  if ($("ppGainBase")) $("ppGainBase").textContent = format(baseGain);
  $("ppNext").textContent = format(nextPrestigeTarget()) + " total";

  $("buyModeLbl").textContent = (state.buyMode === "max") ? "MAX" : ("x" + (state.buyMode || 1));

  if (full){
    renderBuildings();
    renderUpgrades();
    renderPrestigeShop();
    renderRegs();
  }

  if (full || tradeLogDirty){
    renderTradeLog();
    tradeLogDirty = false;
  }

  renderSidePanels(full);

  // ✅ key fix
  refreshAffordability();

  // ✨ plus
  checkNewUpgradeAvailability();
}

/* -------------------------
   Wire UI
-------------------------- */
function wire(){
  $("clickBtn")?.addEventListener("click", doClick);
  $("prestigeBtn")?.addEventListener("click", doPrestige);

  $("buy1")?.addEventListener("click", ()=> setBuyMode(1));
  $("buy10")?.addEventListener("click", ()=> setBuyMode(10));
  $("buyMax")?.addEventListener("click", ()=> setBuyMode("max"));

  $("saveBtn")?.addEventListener("click", ()=> { save(); toast("Sauvegarde OK"); });
  $("wipeBtn")?.addEventListener("click", ()=>{
    localStorage.removeItem("aurelia_save_v3");
    state = defaultState();
    recomputeAllMods();
    toast("Reset OK");
    save();
    render(true);
  });

  $("themeToggle")?.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(cur === "dark" ? "light" : "dark");
  });

  $("careerClaim")?.addEventListener("click", claimCareerStep);
  $("offlineClaim")?.addEventListener("click", claimOfflineGains);

  document.querySelectorAll("button[data-achfilter]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.ui.achFilter = btn.getAttribute("data-achfilter") || "all";
      save();
      renderAchievements();
      highlightAchFilter();
    });
  });

  $("achSearch")?.addEventListener("input", ()=>{
    state.ui.achSearch = $("achSearch").value || "";
    save();
    renderAchievements();
    highlightAchFilter();
  });

  $("achSort")?.addEventListener("change", ()=>{
    state.ui.achSort = $("achSort").value || "default";
    save();
    renderAchievements();
  });

  $("achClaimAll")?.addEventListener("click", ()=>{
    const filter = state.ui?.achFilter || "all";
    const q = (state.ui?.achSearch || "").trim().toLowerCase();

    const claimIds = [];
    for (const a of ACH){
      if (isAchClaimed(a.id)) continue;
      const st = a.check();
      const canClaim = st.done;

      const textBlob = `${a.name} ${a.desc} ${a.rewardText}`.toLowerCase();
      const matchSearch = q ? textBlob.includes(q) : true;

      let matchFilter = true;
      if (filter === "completed") matchFilter = false;
      else if (filter === "claimable") matchFilter = canClaim;
      else if (filter === "inprogress") matchFilter = !st.done;

      if (matchSearch && matchFilter && canClaim) claimIds.push(a.id);
    }

    if (!claimIds.length){
      toast("Aucun exploit réclamable (dans ce filtre).");
      return;
    }
    claimAllAchievements(claimIds);
  });

  $("achExpandAll")?.addEventListener("click", ()=>{
    state.ui.achOpenCats = state.ui.achOpenCats || {};
    document.querySelectorAll("details.achGroup").forEach(d=>{
      const cat = d.getAttribute("data-cat");
      d.open = true;
      state.ui.achOpenCats[cat] = true;
    });
    save();
  });

  $("achCollapseAll")?.addEventListener("click", ()=>{
    state.ui.achOpenCats = state.ui.achOpenCats || {};
    document.querySelectorAll("details.achGroup").forEach(d=>{
      const cat = d.getAttribute("data-cat");
      d.open = false;
      state.ui.achOpenCats[cat] = false;
    });
    save();
  });
}

/* -------------------------
   Start
-------------------------- */
function startGame(){
  setTheme(getTheme());
  load();
  recomputeAllMods();
  wire();

  setBuyMode(state.buyMode === "max" ? "max" : (state.buyMode || 1));
  render(true);

  lastTick = Date.now();
  setInterval(tick, 100);
  setInterval(save, 5000);

  toast("Prêt. Trading + Progression.");
}

window.addEventListener("DOMContentLoaded", startGame);
