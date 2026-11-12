/* La cocina de Mariana — app principal (sin dependencias). */
(() => {
  "use strict";

  // ---------- Utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const canonWord = (w) => { if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1); if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1); return w; };
  const SYN = [
    [/\bblanquillos?\b/g, "huevo"],
    [/\b(ketchup|salsa catsup|salsa de tomate catsup)\b/g, "catsup"],
    [/\btomatillos?\b/g, "tomate verde"],
    [/\btomates? rojos?\b/g, "jitomate"],
    [/\btomate(s?)\b(?! verde)/g, "jitomate$1"],
    [/\bpechugas?( de pollo)?\b/g, "pollo"],
    [/\b(muslos?|piernas?|alas?|alitas?) de pollo\b/g, "pollo"],
    [/\bcarne picada\b/g, "carne molida"],
    [/\bspaghetti\b/g, "espagueti"],
    [/\byogur\b/g, "yogurt"],
    [/\bknorr\b/g, "consome"],
    [/\bfrijoles? de la olla\b/g, "frijol"],
    [/\bchampis?\b/g, "champinon"],
    [/\bmedia crema\b/g, "crema"],
  ];
  const syn = (s) => SYN.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
  const norm = (s) => syn(strip(s)).split(" ").filter(Boolean).map(canonWord).join(" ");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtQty = (q) => (Math.round(q * 100) / 100).toString();
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const daysUntil = (iso) => { if (!iso) return null; return Math.round((new Date(iso + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000); };
  const vib = (p = 8) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* sin vibración */ } };
  const stepFor = (unit) => (["kg", "l"].includes(unit) ? 0.25 : ["g", "ml"].includes(unit) ? 100 : 1);

  const CATS = ["Frutas y verduras", "Carnes", "Lácteos y huevo", "Despensa", "Congelados", "Bebidas", "Limpieza", "Otros"];
  const CAT_EMOJI = { "Frutas y verduras": "🥕", "Carnes": "🍗", "Lácteos y huevo": "🥚", "Despensa": "🫙", "Congelados": "🧊", "Bebidas": "🧃", "Limpieza": "🧽", "Otros": "🛍️" };
  const UNITS = ["pza", "kg", "g", "l", "ml", "paquete", "lata", "bolsa", "caja", "manojo"];
  const FILTERS = [["desayuno", "Desayuno"], ["comida", "Comida"], ["cena", "Cena"], ["rapido", "Rápido"], ["ninos", "Para niños"], ["saludable", "Saludable"], ["sopa", "Sopa"], ["postre", "Postre"]];
  const FORM_TAGS = FILTERS.concat([["vegetariano", "Vegetariano"], ["sin-gluten", "Sin gluten"]]);
  const WORD_TAGS = { rapido: "rapido", rapida: "rapido", facil: "rapido", ninos: "ninos", nino: "ninos", nina: "ninos", gabriel: "ninos", sano: "saludable", sana: "saludable", saludable: "saludable", ligero: "saludable", ligera: "saludable", sopa: "sopa", caldo: "sopa", dulce: "dulce", postre: "postre", desayuno: "desayuno", almuerzo: "desayuno", comida: "comida", cena: "cena", vegetariano: "vegetariano", vegetariana: "vegetariano" };
  const QUICK_UNIT = { "Pollo": "kg", "Carne molida": "kg", "Pescado": "kg", "Leche": "l", "Arroz": "kg", "Frijol": "kg", "Harina": "kg", "Azúcar": "kg", "Tortilla": "kg", "Jitomate": "kg", "Papa": "kg", "Tomate verde": "kg", "Atún": "lata", "Fideo": "paquete", "Espagueti": "paquete", "Pan": "bolsa", "Avena": "bolsa", "Consomé": "caja" };

  const RECIPES = window.RECIPES || [];
  const PIN = RECIPES.find((r) => r.pin);
  const STAPLES = new Set((window.STAPLES || []).map(norm));
  const KEYSET = new Set(RECIPES.flatMap((r) => r.i.map((x) => norm(x.k))));
  const QUICK = window.QUICK_ITEMS || [];

  // ---------- Estado ----------
  const KEY = "cocina-mariana-v1";
  const defaults = () => ({
    inv: [], shop: [], prefs: { likes: [], dislikes: [], veg: false, gf: false }, favs: [], history: [],
    ai: { key: "", model: "claude-sonnet-5-5" }, aiRecipes: [], myRecipes: [], plan: [], buyCount: {},
    ui: { tab: "ideas", filters: [], query: "", invFilter: "", showAll: false, installDismissed: false },
  });
  let S;
  function load(obj) {
    S = Object.assign(defaults(), obj || {});
    S.prefs = Object.assign(defaults().prefs, S.prefs);
    S.ai = Object.assign(defaults().ai, S.ai);
    S.ui = Object.assign(defaults().ui, S.ui);
    if (!S.buyCount || typeof S.buyCount !== "object") S.buyCount = {};
    for (const k of ["inv", "shop", "favs", "history", "aiRecipes", "myRecipes", "plan"]) if (!Array.isArray(S[k])) S[k] = [];
  }
  try { load(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { load({}); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast("No se pudo guardar: el almacenamiento del teléfono está lleno."); } };

  const urlTab = new URLSearchParams(location.search).get("tab");
  if (["ideas", "despensa", "super", "gustos"].includes(urlTab)) S.ui.tab = urlTab;

  // ---------- Coincidencia de ingredientes ----------
  function matches(invName, key) {
    const a = norm(invName), b = norm(key);
    if (!a || !b) return false;
    if (a === b) return true;
    if (KEYSET.has(a)) return false; // ya es otro ingrediente (p. ej. "leche condensada" no cuenta como "leche")
    return a.startsWith(b + " ") || b.startsWith(a + " ");
  }
  const findInv = (key) => S.inv.find((it) => it.qty > 0 && matches(it.name, key));
  function isStaple(key) {
    const w = norm(key).split(" ").filter((x) => !["y", "de", "al", "gusto"].includes(x));
    return w.length > 0 && w.every((x) => STAPLES.has(x) || x === "oliva");
  }
  const quickFor = (name) => QUICK.find((x) => norm(x[0]) === norm(name)) || QUICK.find((x) => matches(name, x[0]));
  const guessEmoji = (name) => (quickFor(name) || [0, "🍽️"])[1];
  const guessCat = (name) => (quickFor(name) || [0, 0, "Otros"])[2];
  const guessUnit = (name) => { const q = quickFor(name); return (q && QUICK_UNIT[q[0]]) || "pza"; };

  const UNIT_WORDS = "tazas?|cdas?|cditas?|cucharadas?|cucharaditas?|piezas?|pzas?|gramos?|gr|g|kilos?|kg|ml|litros?|lts?|l|rebanadas?|dientes?|manojos?|puños?|latas?|paquetes?|sobres?|pizcas?|chorritos?|bolsas?|cajas?|tiras?|filetes?|rajas?|hojas?";
  function cleanName(t) { // "2 tazas de arroz (lavado)" -> "Arroz"
    let s = String(t).trim().replace(/^[\d\s/.,½¼¾]+/, "");
    s = s.replace(new RegExp(`^(?:(?:${UNIT_WORDS})\\.?\\s+)?(?:de\\s+)?`, "i"), "");
    s = s.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+al gusto$/i, "").replace(/\s+para acompañar$/i, "").trim();
    return cap(s);
  }

  function parseLine(line) { // "2 kg pollo", "una docena de huevos", "leche"
    const m = line.trim().match(/^(\d+\/\d+|\d+(?:[.,]\d+)?|(?:medio|media)(?=\s+(?:kilos?|kg|litros?|l|docenas?)\b)|una?(?=\s))?\s*(?:(kg|kilos?|gramos?|gr|g|litros?|lts?|l|ml|pzas?|piezas?|paquetes?|latas?|bolsas?|cajas?|docenas?|manojos?)\.?\s+)?(?:de\s+)?(.+)$/i);
    if (!m || !m[3]) return null;
    let qty = 1; const q = (m[1] || "").toLowerCase();
    if (/^\d+\/\d+$/.test(q)) { const [a, b] = q.split("/"); qty = a / b; } else if (q === "medio" || q === "media") qty = 0.5; else if (q && !/^una?$/.test(q)) qty = parseFloat(q.replace(",", "."));
    let unit = (m[2] || "").toLowerCase();
    const U = { kilo: "kg", kilos: "kg", kg: "kg", gramo: "g", gramos: "g", gr: "g", g: "g", litro: "l", litros: "l", lt: "l", lts: "l", l: "l", ml: "ml", pza: "pza", pzas: "pza", pieza: "pza", piezas: "pza", paquete: "paquete", paquetes: "paquete", lata: "lata", latas: "lata", bolsa: "bolsa", bolsas: "bolsa", caja: "caja", cajas: "caja", manojo: "manojo", manojos: "manojo" };
    if (/^docenas?$/.test(unit)) { qty *= 12; unit = "pza"; } else unit = U[unit] || "";
    const name = cap(m[3].trim());
    return { name, qty: qty || 1, unit: unit || (q ? "pza" : guessUnit(name)), simple: !q && !unit };
  }

  // ---------- Recetas ----------
  const allRecipes = () => RECIPES.filter((r) => !r.pin).concat(S.myRecipes, S.aiRecipes);
  const getRecipe = (id) => RECIPES.find((r) => r.id === id) || S.myRecipes.find((r) => r.id === id) || S.aiRecipes.find((r) => r.id === id);

  function analyze(r) {
    const have = [], miss = [], optHave = [];
    let req = 0;
    for (const x of r.i) {
      if (isStaple(x.k)) continue;
      if (!x.opt) req++;
      const it = findInv(x.k);
      if (it) (x.opt ? optHave : have).push({ ...x, inv: it });
      else if (!x.opt) miss.push(x);
    }
    return { req, have, miss, optHave, ratio: req ? have.length / req : 1 };
  }

  function scoreRecipes() {
    const qWords = strip(S.ui.query).split(" ").filter((w) => w.length > 2);
    const qTags = new Set(qWords.map((w) => WORD_TAGS[w]).filter(Boolean));
    const qIngr = qWords.filter((w) => !WORD_TAGS[w] && !["algo", "con", "para", "que", "sin", "unos", "unas", "hoy"].includes(w));
    const { likes, dislikes } = S.prefs;
    const recent = new Set(S.history.filter((h) => Date.now() - h.t < 3 * 86400000).map((h) => h.id));
    const out = [];
    for (const r of allRecipes()) {
      if (S.prefs.veg && !r.tags.includes("vegetariano")) continue;
      if (S.prefs.gf && !r.tags.includes("sin-gluten")) continue;
      const ok = S.ui.filters.every((f) => (f === "favoritas" ? S.favs.includes(r.id) : f === "mias" ? r.mine : r.tags.includes(f) || (f === "postre" && r.tags.includes("dulce"))));
      if (!ok) continue;
      if (r.i.some((x) => !x.opt && dislikes.some((d) => matches(d, x.k)))) continue;
      const a = analyze(r);
      let score = a.ratio * 100 + (a.ratio === 1 ? 30 : 0) + a.optHave.length * 3;
      const reasons = [];
      if (likes.some((l) => r.i.some((x) => matches(l, x.k)) || strip(r.n).includes(strip(l)))) { score += 10; reasons.push("le gusta"); }
      if (S.favs.includes(r.id)) { score += 8; reasons.push("favorita"); }
      const expiring = a.have.concat(a.optHave).filter((h) => { const d = daysUntil(h.inv.exp); return d !== null && d <= 3; });
      if (expiring.length) { score += 12 * expiring.length; reasons.unshift("usa lo que vence"); }
      if (recent.has(r.id)) { score -= 25; reasons.push("la hiciste hace poco"); }
      if (qWords.length) {
        let qs = 0;
        for (const t of qTags) if (r.tags.includes(t)) qs += 25;
        for (const w of qIngr) if (r.i.some((x) => norm(x.k).includes(norm(w))) || strip(r.n).includes(w)) qs += 40;
        if (!qs) continue;
        score += qs;
      }
      out.push({ r, a, score, reasons });
    }
    return out.sort((x, y) => y.score - x.score);
  }

  // ---------- Inventario / súper ----------
  function addInv({ name, qty = 1, unit = "pza", cat, emoji, min = 0, exp = "", simple }) {
    name = String(name || "").trim(); if (!name) return;
    const ex = S.inv.find((it) => norm(it.name) === norm(name) && (it.unit === unit || it.simple || it.qty <= 0));
    if (ex) {
      if (ex.qty <= 0 || ex.simple) { ex.qty = 0; ex.unit = unit; }
      ex.qty = Math.round((ex.qty + (Number(qty) || 0)) * 100) / 100;
      ex.simple = simple ?? (ex.unit === "pza" && ex.qty === 1 && !ex.exp);
      if (exp) { ex.exp = exp; ex.simple = false; }
    } else {
      S.inv.push({ id: uid(), name, qty: Number(qty) || 0, unit, cat: cat || guessCat(name), emoji: emoji || guessEmoji(name), min: Number(min) || 0, exp, simple: simple ?? (unit === "pza" && Number(qty) === 1 && !exp) });
    }
  }
  function addShop({ name, qty = 1, unit, cat, emoji, src = "" }) {
    name = String(name || "").trim(); if (!name) return false;
    if (S.shop.some((s) => !s.done && norm(s.name) === norm(name))) return false;
    const inv = S.inv.find((it) => norm(it.name) === norm(name));
    S.shop.push({ id: uid(), name, qty: Number(qty) || 1, unit: unit || inv?.unit || guessUnit(name), cat: cat || inv?.cat || guessCat(name), emoji: emoji || inv?.emoji || guessEmoji(name), done: false, src });
    return true;
  }
  const lowStock = () => S.inv.filter((it) => it.qty <= (it.min || 0));
  function markOut(it) { if (it.qty > 0) it.lastQty = it.qty; it.qty = 0; }
  function shopOne(it) { return addShop({ name: it.name, unit: it.simple ? undefined : it.unit, cat: it.cat, emoji: it.emoji, src: "Se acabó" }); }
  function checkLow(it) {
    if (it.qty <= 0) toast(`Ya no hay ${it.name}`, 4500, () => { shopOne(it); save(); render(); toast("Agregado a la lista del súper"); }, "Al súper");
  }

  // ---------- Hablarle a la despensa ----------
  // "huevos, salchicha y leche"  ·  "ya no hay salchicha"  ·  "se acabaron los huevos"  ·  "2 kg pollo"
  const ADD_WORDS = new Set(["ya", "hay", "tengo", "tenemos", "compre", "traje", "agrega", "agregar", "agregale", "pon", "ponle", "anota", "tambien", "y"]);
  const OUT_RES = [
    /^(?:ya\s+)?no\s+(?:hay|tengo|tenemos|queda|quedan)\s+(?:mas\s+)?(.+)$/,
    /^(?:ya\s+)?se\s+(?:acabo|acabaron|termino|terminaron|gasto|gastaron)\s+(.+)$/,
    /^(?:quita|quitale|quitar|borra|borrar|elimina)\s+(.+)$/,
    /^(.+?)\s+(?:ya\s+)?(?:se\s+acabo|se\s+acabaron|se\s+termino|se\s+terminaron|no\s+hay|ya\s+no\s+hay|ya\s+no|se\s+gasto)$/,
  ];
  const ARTICLES = /^(?:el|la|los|las|un|unos|unas|mas|de|del)\s+/i;
  function vocab() { return new Set([...QUICK.map((q) => norm(q[0])), ...KEYSET, ...S.inv.map((i) => norm(i.name)), ...Object.keys(S.buyCount || {})]); }
  function splitKnown(seg) { // "huevos salchicha leche" -> 3 cosas, solo si todas se reconocen
    const words = seg.split(/\s+/); if (words.length < 2) return [seg];
    const V = vocab(); const out = []; let i = 0;
    while (i < words.length) {
      let n = Math.min(3, words.length - i);
      while (n > 0 && !V.has(norm(words.slice(i, i + n).join(" ")))) n--;
      if (!n) return [seg];
      out.push(words.slice(i, i + n).join(" ")); i += n;
    }
    return out;
  }
  function itemsOf(text) {
    return text.split(/,|\s+y\s+|\s+e\s+|\s+ni\s+/i).map((x) => { let s = x.trim(); while (ARTICLES.test(s)) s = s.replace(ARTICLES, ""); return s; })
      .filter(Boolean).flatMap((s) => (/^(\d|medio|media|una?\s)/i.test(s) ? [s] : splitKnown(s)));
  }
  function understand(text) {
    const added = [], already = [], out = [], missing = [];
    for (const sentence of String(text).split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean)) {
      const t = strip(sentence);
      const outMatch = OUT_RES.map((re) => t.match(re)).find(Boolean);
      if (outMatch) {
        for (const term of itemsOf(outMatch[1])) {
          const hits = S.inv.filter((it) => it.qty > 0 && (norm(it.name) === norm(term) || matches(it.name, term)));
          if (hits.length) hits.forEach((it) => { markOut(it); out.push(it); }); else missing.push(term);
        }
        continue;
      }
      const words = sentence.split(/\s+/);
      while (words.length > 1 && ADD_WORDS.has(strip(words[0]))) words.shift();
      for (const raw of itemsOf(words.join(" "))) {
        const r = parseLine(raw); if (!r) continue;
        const ex = S.inv.find((it) => norm(it.name) === norm(r.name));
        if (r.simple && ex && ex.qty > 0) { already.push(ex.name); continue; }
        if (r.simple && ex) { ex.qty = ex.simple || !ex.lastQty ? 1 : ex.lastQty; added.push(ex.name); continue; }
        addInv(r); added.push(r.name);
      }
    }
    return { added, already, out, missing };
  }

  // ---------- Mascota ----------
  const TOMATINA = (mood = "happy", size = 72) => `
  <svg class="tomatina ${mood}" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="112" rx="34" ry="5" fill="#5A3426" opacity=".15"/>
    <path d="M60 30c-30 0-46 20-46 44 0 22 20 36 46 36s46-14 46-36c0-24-16-44-46-44z" fill="#FF5E7E" stroke="#5A3426" stroke-width="4"/>
    <path d="M32 58c4-10 12-16 20-18" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>
    <path d="M60 34l-12-8 4 12-14 0 12 8M60 34l12-8-4 12 14 0-12 8" fill="#5FCB8A" stroke="#5A3426" stroke-width="3.5" stroke-linejoin="round"/>
    <g transform="translate(4 6) rotate(8 60 14)"><rect x="44" y="4" width="32" height="18" rx="6" fill="#fff" stroke="#5A3426" stroke-width="3.5"/>
    <circle cx="48" cy="8" r="8" fill="#fff" stroke="#5A3426" stroke-width="3.5"/><circle cx="60" cy="4" r="9" fill="#fff" stroke="#5A3426" stroke-width="3.5"/><circle cx="72" cy="8" r="8" fill="#fff" stroke="#5A3426" stroke-width="3.5"/>
    <rect x="46" y="10" width="28" height="10" fill="#fff"/></g>
    ${mood === "sad"
      ? `<path d="M40 70q6-5 12 0M68 70q6-5 12 0" stroke="#5A3426" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M52 90q8-6 16 0" stroke="#5A3426" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : mood === "joy"
      ? `<path d="M39 72q7-9 14 0M67 72q7-9 14 0" stroke="#5A3426" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M48 82q12 16 24 0z" stroke="#5A3426" stroke-width="4" fill="#C2344F" stroke-linejoin="round"/>`
      : `<ellipse class="eye" cx="46" cy="70" rx="5" ry="6.5" fill="#5A3426"/><ellipse class="eye" cx="74" cy="70" rx="5" ry="6.5" fill="#5A3426"/><circle cx="48" cy="67" r="2" fill="#fff"/><circle cx="76" cy="67" r="2" fill="#fff"/><path d="M52 84q8 9 16 0" stroke="#5A3426" stroke-width="4" fill="#C2344F" stroke-linecap="round" stroke-linejoin="round"/>`}
    <ellipse cx="34" cy="82" rx="7" ry="4.5" fill="#FFB3C4"/><ellipse cx="86" cy="82" rx="7" ry="4.5" fill="#FFB3C4"/>
  </svg>`;

  let bubbleOverride = null;
  function tip() {
    if (bubbleOverride) return bubbleOverride;
    const exp = S.inv.filter((it) => { const d = daysUntil(it.exp); return it.qty > 0 && d !== null && d <= 2; });
    const low = lowStock();
    if (!S.inv.length) return ["Hola, Mariana. Llena tu despensa y yo te digo qué cocinar.", "happy"];
    if (exp.length) return [`${exp.slice(0, 3).map((x) => x.name).join(", ")} ${exp.length > 1 ? "vencen" : "vence"} pronto. Ya subí las recetas que ${exp.length > 1 ? "los" : "lo"} usan.`, "happy"];
    if (S.ui.tab === "despensa" && low.length) return [`Ya no hay: ${low.slice(0, 3).map((x) => x.name).join(", ")}${low.length > 3 ? " y más" : ""}. Lo ves en Súper.`, "sad"];
    const h = new Date().getHours();
    return [(h < 11 ? "Buenos días. ¿Qué desayunamos?" : h < 17 ? "¿Qué hacemos de comer?" : "¿Algo rico para cenar?") + " Tócame para una sorpresa.", "happy"];
  }

  // ---------- Render ----------
  const main = $("#main");
  let lastTab = null;
  function render() {
    const y = main.scrollTop;
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === S.ui.tab ? "page" : "false"));
    const shopCount = S.shop.filter((s) => !s.done).length;
    $("#shopBadge").textContent = shopCount || "";
    $("#shopBadge").hidden = !shopCount;
    const [msg, mood] = tip();
    $("#mascot").innerHTML = TOMATINA(mood, 64);
    $("#bubble").textContent = msg;
    main.innerHTML = ({ ideas: viewIdeas, despensa: viewDespensa, super: viewSuper, gustos: viewGustos })[S.ui.tab]();
    main.scrollTop = lastTab === S.ui.tab ? y : 0;
    lastTab = S.ui.tab;
  }

  // Instalación
  let deferredPrompt = null;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; if (S.ui.tab === "ideas") render(); });
  function installBanner() {
    if (isStandalone() || S.ui.installDismissed) return "";
    if (deferredPrompt) return `<div class="banner"><p>Instala la app para abrirla como cualquier otra y usarla sin internet.</p><button class="btn btn-small" data-act="install">Instalar</button><button class="x" data-act="dismissInstall" aria-label="Cerrar aviso">×</button></div>`;
    if (isIOS) return `<div class="banner"><p>Para instalarla: toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.</p><button class="x" data-act="dismissInstall" aria-label="Cerrar aviso">×</button></div>`;
    return "";
  }

  function heroCard() {
    if (!PIN) return "";
    const a = analyze(PIN);
    return `
    <article class="hero">
      <span class="ribbon">Recomendado</span>
      <button class="hero-main" data-act="open" data-id="${PIN.id}">
        <span class="plate"><span>${esc(PIN.e)}</span></span>
        <span class="rbody">
          <span class="hero-name">${esc(PIN.n)}</span>
          <span class="rmeta">${stars(a.ratio)} <span>${PIN.min} min</span></span>
          <span class="rhave">${a.ratio === 1 ? "Tienes todo para hacerlo" : `Falta: ${a.miss.map((m) => esc(cleanName(m.t))).join(", ")}`}</span>
        </span>
      </button>
    </article>`;
  }

  function planPanel() {
    const rs = S.plan.map(getRecipe).filter(Boolean);
    if (!rs.length) return "";
    const missing = rs.reduce((n, r) => n + analyze(r).miss.length, 0);
    return `
    <section class="panel plan">
      <h2 class="h2">Mi menú <small>${rs.length} ${rs.length === 1 ? "plato" : "platos"}</small></h2>
      <ul class="plan-list">${rs.map((r) => { const a = analyze(r); return `
        <li><button class="plan-item" data-act="open" data-id="${esc(r.id)}"><span aria-hidden="true">${esc(r.e || "🍽️")}</span><span class="pname">${esc(r.n)}</span><span class="pstat ${a.miss.length ? "no" : "ok"}">${a.miss.length ? `faltan ${a.miss.length}` : "lista"}</span></button>
        <button class="x" data-act="unplan" data-id="${esc(r.id)}" aria-label="Quitar ${esc(r.n)} del menú">×</button></li>`; }).join("")}</ul>
      ${missing ? `<button class="btn btn-mint wide" data-act="planToShop">Agregar lo que falta del menú al súper</button>` : ""}
    </section>`;
  }

  function section(title, hint, shown, total, extra = "") {
    if (!shown.length) return "";
    return `<section class="rsec"><h2 class="sec-title">${title} <span class="cnt">${total}</span></h2>${hint ? `<p class="sec-hint">${hint}</p>` : ""}<div class="recipes">${shown.map(cardRecipe).join("")}</div>${extra}</section>`;
  }

  function viewIdeas() {
    const list = scoreRecipes();
    const ready = list.filter((x) => x.a.ratio === 1);
    const close = list.filter((x) => x.a.ratio < 1 && x.a.miss.length <= 2 && x.a.have.length > 0);
    const rest = list.filter((x) => !ready.includes(x) && !close.includes(x));
    const all = S.ui.showAll;
    const closeShown = all ? close : close.slice(0, 6);
    const restShown = all ? rest : rest.slice(0, ready.length + close.length ? 0 : 6);
    const hidden = close.length - closeShown.length + rest.length - restShown.length;
    const chips = FILTERS.concat([["favoritas", "Favoritas"]], S.myRecipes.length ? [["mias", "Mis recetas"]] : []);
    const filtered = S.ui.filters.length || S.ui.query;
    return `
    ${installBanner()}
    ${heroCard()}
    ${planPanel()}
    <section class="panel antojo">
      <label for="q" class="h2">¿Qué se te antoja?</label>
      <form class="row" data-form="search">
        <input id="q" type="search" enterkeyhint="search" placeholder="Ej. rápido con pollo" value="${esc(S.ui.query)}" autocomplete="off">
        <button class="btn" type="submit">Buscar</button>
      </form>
      <div class="chips" role="group" aria-label="Filtros">
        ${chips.map(([k, l]) => `<button class="chip ${S.ui.filters.includes(k) ? "on" : ""}" data-act="filter" data-k="${k}" aria-pressed="${S.ui.filters.includes(k)}">${l}</button>`).join("")}
      </div>
      ${filtered ? `<button class="linkbtn" data-act="clearFilters">Quitar filtros y búsqueda</button>` : ""}
      ${S.ai.key ? `<button class="btn btn-mint wide" data-act="ai">Pedir ideas nuevas a la IA</button>` : ""}
    </section>
    ${!S.inv.length ? `<p class="note">Agrega lo que tienes en <b>Despensa</b> y aquí verás qué puedes cocinar ya.</p>` : ""}
    ${section("Listas para hacer", "Tienes todo lo necesario.", ready, ready.length)}
    ${section("Te falta poquito", "Con 1 o 2 cosas del súper las haces.", closeShown, close.length)}
    ${section(ready.length || close.length ? "Más ideas" : "Ideas", "", restShown, rest.length)}
    ${hidden > 0 ? `<button class="btn btn-ghost wide" data-act="showAll">Ver ${hidden} recetas más</button>` : ""}
    ${!list.length ? `<div class="empty">${TOMATINA("sad", 90)}<p>No encontré recetas con esa búsqueda. Prueba otra palabra o quita filtros.</p></div>` : ""}
    <button class="btn btn-ghost wide addmine" data-act="newRecipe">Agregar una receta mía</button>`;
  }

  function stars(ratio) {
    const n = Math.round(ratio * 5);
    return `<span class="stars" role="img" aria-label="Tienes ${n} de 5">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
  }

  function cardRecipe({ r, a, reasons }) {
    const fav = S.favs.includes(r.id);
    const planned = S.plan.includes(r.id);
    return `
    <article class="rcard ${a.ratio === 1 ? "ready" : ""}">
      <button class="rcard-main" data-act="open" data-id="${esc(r.id)}">
        <span class="remoji" aria-hidden="true">${esc(r.e || "🍽️")}</span>
        <span class="rbody">
          <span class="rname">${esc(r.n)}${r.ai ? ` <span class="tag-mini ai">IA</span>` : ""}${r.mine ? ` <span class="tag-mini">Mía</span>` : ""}${planned ? ` <span class="tag-mini menu">En menú</span>` : ""}</span>
          <span class="rmeta">${stars(a.ratio)} <span>${r.min} min</span></span>
          <span class="rhave">${a.ratio === 1 ? "Tienes todo" : `Tienes ${a.have.length} de ${a.req}`}${reasons.length ? ` · ${esc(reasons[0])}` : ""}</span>
          ${a.miss.length ? `<span class="rmiss">Falta: ${a.miss.map((m) => esc(cleanName(m.t))).join(", ")}</span>` : ""}
        </span>
      </button>
      <button class="heart ${fav ? "on" : ""}" data-act="fav" data-id="${esc(r.id)}" aria-label="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}" aria-pressed="${fav}">♥</button>
    </article>`;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function viewDespensa() {
    const have = S.inv.filter((it) => it.qty > 0);
    const gone = S.inv.filter((it) => it.qty <= 0).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const groups = CATS.map((c) => [c, have.filter((it) => (CATS.includes(it.cat) ? it.cat : "Otros") === c).sort((a, b) => a.name.localeCompare(b.name, "es"))]).filter(([, l]) => l.length);
    const soon = have.filter((it) => { const d = daysUntil(it.exp); return d !== null && d <= 3; }).sort((a, b) => a.exp.localeCompare(b.exp));
    const quick = QUICK.filter((q) => !have.some((it) => norm(it.name) === norm(q[0])));
    return `
    <form class="panel say" data-form="say">
      <label for="say" class="h2">¿Qué hay en tu casa?</label>
      <div class="row">
        <input id="say" placeholder="Ej. huevos, salchicha, leche" autocomplete="off" enterkeyhint="done">
        ${SR ? `<button type="button" class="btn btn-mint mic" data-act="mic" aria-label="Decirlo con la voz"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg></button>` : ""}
        <button class="btn" type="submit">Listo</button>
      </div>
      <p class="hint">Cuando algo se termine, escribe <b>ya no hay salchicha</b>.</p>
      ${quick.length ? `<div class="quick" aria-label="Agregar con un toque">${quick.map((q) => `<button type="button" class="qchip" data-act="quickHave" data-name="${esc(q[0])}">${q[1]} ${esc(q[0])}</button>`).join("")}</div>` : ""}
    </form>
    ${soon.length ? `<section class="panel soon"><h2 class="h2">Vence pronto</h2><p>${soon.map((it) => { const d = daysUntil(it.exp); return `<b>${esc(it.name)}</b> ${d < 0 ? "(ya venció)" : d === 0 ? "(hoy)" : d === 1 ? "(mañana)" : `(en ${d} días)`}`; }).join(", ")}</p><button class="btn btn-small" data-act="tab" data-tab="ideas">Ver recetas para usarlo</button></section>` : ""}
    ${!S.inv.length ? `<div class="empty">${TOMATINA("happy", 100)}<p>Escribe arriba lo que hay en tu casa, separado por comas, o toca los botoncitos.</p></div>` : ""}
    ${have.length ? `<p class="count">Tienes ${have.length} ${have.length === 1 ? "cosa" : "cosas"}</p>` : ""}
    ${groups.map(([c, l]) => `
      <section class="group">
        <h2 class="gtitle"><span aria-hidden="true">${CAT_EMOJI[c]}</span>${c}</h2>
        <ul class="items">${l.map(itemRow).join("")}</ul>
      </section>`).join("")}
    ${gone.length ? `
      <section class="group gone">
        <h2 class="gtitle"><span aria-hidden="true">🫙</span>Ya no hay <span class="cnt">${gone.length}</span></h2>
        <ul class="items">${gone.map((it) => { const inList = S.shop.some((s) => !s.done && norm(s.name) === norm(it.name)); return `
          <li class="item"><span class="iemoji" aria-hidden="true">${esc(it.emoji)}</span><span class="iname">${esc(it.name)}</span>
            ${inList ? `<span class="inlist">En la lista</span>` : `<button class="pill" data-act="outToShop" data-id="${it.id}">Al súper</button>`}
            <button class="pill pill-mint" data-act="haveAgain" data-id="${it.id}">Ya hay</button>
            <button class="x" data-act="delInv" data-id="${it.id}" aria-label="Borrar ${esc(it.name)} de la despensa">×</button></li>`; }).join("")}</ul>
      </section>` : ""}
    <button class="linkbtn center" data-act="addInv">Agregar con cantidad o fecha de caducidad</button>`;
  }

  function itemRow(it) {
    const d = daysUntil(it.exp);
    const badge = d === null ? "" : d < 0 ? `<span class="badge bad">Venció</span>` : d <= 2 ? `<span class="badge warn">${d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : "Vence en 2 días"}</span>` : "";
    const step = stepFor(it.unit);
    return `
    <li class="item">
      <button class="item-main" data-act="editInv" data-id="${it.id}" aria-label="Detalles de ${esc(it.name)}">
        <span class="iemoji" aria-hidden="true">${esc(it.emoji)}</span>
        <span class="iname">${esc(it.name)} ${badge}</span>
        ${it.simple ? "" : `<span class="iqty">${fmtQty(it.qty)} ${esc(it.unit)}</span>`}
      </button>
      ${it.simple ? `<button class="pill" data-act="out" data-id="${it.id}">Se acabó</button>` : `
      <span class="stepper">
        <button data-act="dec" data-id="${it.id}" aria-label="Quitar ${step} ${esc(it.unit)} de ${esc(it.name)}">−</button>
        <button data-act="inc" data-id="${it.id}" aria-label="Agregar ${step} ${esc(it.unit)} de ${esc(it.name)}">+</button>
      </span>`}
    </li>`;
  }

  function frequent() {
    return Object.values(S.buyCount || {}).filter((b) => b.n >= 2 && !S.shop.some((s) => !s.done && norm(s.name) === norm(b.name))).sort((a, b) => b.n - a.n).slice(0, 10);
  }

  function viewSuper() {
    const pending = S.shop.filter((s) => !s.done), done = S.shop.filter((s) => s.done);
    const low = lowStock().filter((it) => !S.shop.some((s) => !s.done && norm(s.name) === norm(it.name)));
    const groups = CATS.map((c) => [c, pending.filter((s) => (CATS.includes(s.cat) ? s.cat : "Otros") === c)]).filter(([, l]) => l.length);
    const freq = frequent();
    return `
    <form class="toolbar" data-form="shopAdd">
      <input id="shopInput" placeholder="Ej. 2 kg tortilla, leche, jabón" autocomplete="off" enterkeyhint="done" aria-label="Agregar a la lista">
      <button class="btn" type="submit">Agregar</button>
    </form>
    ${low.length ? `<section class="panel suggest"><p><b>Ya no hay:</b> ${low.map((x) => esc(x.name)).join(", ")}</p><button class="btn btn-mint btn-small" data-act="addLow">Agregar a la lista</button></section>` : ""}
    ${freq.length ? `<section class="freq"><h2 class="sec-title">Lo que compras seguido</h2><div class="chips">${freq.map((b) => `<button class="chip" data-act="addFreq" data-name="${esc(b.name)}">+ ${esc(b.name)}</button>`).join("")}</div></section>` : ""}
    ${!S.shop.length ? `<div class="empty">${TOMATINA("happy", 100)}<p>Tu lista está vacía. Escribe arriba o, desde una receta, toca <b>Agregar lo que falta al súper</b>.</p></div>` : ""}
    ${groups.map(([c, l]) => `
      <section class="group">
        <h2 class="gtitle"><span aria-hidden="true">${CAT_EMOJI[c]}</span>${c}</h2>
        <ul class="items">${l.map(shopRow).join("")}</ul>
      </section>`).join("")}
    ${done.length ? `
      <section class="group done-group">
        <h2 class="gtitle"><span aria-hidden="true">🧺</span>En el carrito <span class="cnt">${done.length}</span></h2>
        <ul class="items">${done.map(shopRow).join("")}</ul>
        <button class="btn wide" data-act="toPantry">Guardar comprados en la despensa</button>
      </section>` : ""}
    ${S.shop.length ? `<div class="row end"><button class="btn btn-ghost btn-small" data-act="share">Enviar lista</button><button class="btn btn-ghost btn-small" data-act="clearShop">Vaciar lista</button></div>` : ""}`;
  }

  function shopRow(s) {
    return `
    <li class="item shop ${s.done ? "checked" : ""}">
      <label class="check">
        <input type="checkbox" data-act="toggleShop" data-id="${s.id}" ${s.done ? "checked" : ""}>
        <span class="box" aria-hidden="true"></span>
        <span class="iemoji" aria-hidden="true">${esc(s.emoji)}</span>
        <span class="iname">${esc(s.name)}${s.src ? `<small>${esc(s.src)}</small>` : ""}</span>
      </label>
      <button class="qtybtn" data-act="shopQty" data-id="${s.id}" aria-label="Cambiar cantidad de ${esc(s.name)}">${fmtQty(s.qty)} ${esc(s.unit)}</button>
      <button class="x" data-act="delShop" data-id="${s.id}" aria-label="Quitar ${esc(s.name)}">×</button>
    </li>`;
  }

  function tagList(kind, label, hint) {
    const arr = S.prefs[kind];
    return `
    <section class="panel">
      <h2 class="h2">${label}</h2>
      <p class="hint">${hint}</p>
      <div class="chips">${arr.map((x, i) => `<span class="chip on ${kind === "dislikes" ? "no" : ""}">${esc(x)}<button data-act="delPref" data-kind="${kind}" data-i="${i}" aria-label="Quitar ${esc(x)}">×</button></span>`).join("") || `<span class="hint">Nada todavía.</span>`}</div>
      <form class="row" data-form="pref" data-kind="${kind}">
        <input placeholder="${kind === "likes" ? "Ej. pollo, pasta, aguacate" : "Ej. hígado, brócoli"}" autocomplete="off" aria-label="${label}">
        <button class="btn btn-small" type="submit">Agregar</button>
      </form>
    </section>`;
  }

  function viewGustos() {
    const cooked = S.history.slice(-5).reverse().map((h) => getRecipe(h.id)).filter(Boolean);
    return `
    ${tagList("likes", "Lo que le encanta", "Las recetas con estos ingredientes salen primero.")}
    ${tagList("dislikes", "Lo que no le gusta", "Nunca te voy a sugerir recetas que los lleven.")}
    <section class="panel">
      <h2 class="h2">Alimentación</h2>
      <label class="switch"><input type="checkbox" data-act="pref" data-k="veg" ${S.prefs.veg ? "checked" : ""}><span></span>Solo vegetariano</label>
      <label class="switch"><input type="checkbox" data-act="pref" data-k="gf" ${S.prefs.gf ? "checked" : ""}><span></span>Sin gluten</label>
    </section>
    ${cooked.length ? `<section class="panel"><h2 class="h2">Lo último que cocinaste</h2><ul class="plan-list">${cooked.map((r) => `<li><button class="plan-item" data-act="open" data-id="${esc(r.id)}"><span aria-hidden="true">${esc(r.e || "🍽️")}</span><span class="pname">${esc(r.n)}</span></button></li>`).join("")}</ul></section>` : ""}
    <section class="panel">
      <h2 class="h2">Ideas con IA (opcional)</h2>
      <p class="hint">Con una clave de API de Anthropic, la app inventa recetas nuevas con lo que tienes y tus gustos. La clave se guarda solo en este teléfono.</p>
      <form class="stack" data-form="ai">
        <input id="aiKey" type="password" placeholder="sk-ant-..." value="${esc(S.ai.key)}" autocomplete="off" aria-label="Clave de API">
        <input id="aiModel" placeholder="Modelo" value="${esc(S.ai.model)}" autocomplete="off" aria-label="Modelo">
        <button class="btn btn-small" type="submit">Guardar clave</button>
      </form>
    </section>
    <section class="panel">
      <h2 class="h2">Respaldo</h2>
      <p class="hint">Todo se guarda en este teléfono. Descarga un respaldo para no perderlo o pasarlo a otro.</p>
      <div class="row wrap">
        <button class="btn btn-small" data-act="export">Descargar respaldo</button>
        <label class="btn btn-small btn-ghost">Cargar respaldo<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        <button class="btn btn-small btn-ghost" data-act="reset">Borrar todo</button>
      </div>
    </section>
    <p class="foot">${S.history.length ? `Has cocinado ${S.history.length} ${S.history.length === 1 ? "vez" : "veces"} con la app.` : ""}</p>`;
  }

  // ---------- Hojas (modales) ----------
  const sheet = $("#sheet"), sheetBody = $("#sheetBody");
  function openSheet(html) {
    sheetBody.innerHTML = html;
    sheetBody.scrollTop = 0;
    if (!sheet.open) { if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", ""); }
    const f = sheetBody.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 60);
  }
  const closeSheet = () => { if (sheet.open) sheet.close(); };
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

  // Pantalla encendida mientras se ve una receta
  let wake = null;
  async function keepAwake() { try { if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch { wake = null; } }
  function releaseWake() { try { if (wake) wake.release(); } catch { /* nada */ } wake = null; }
  sheet.addEventListener("close", releaseWake);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && sheet.open && sheetBody.querySelector(".steps")) keepAwake(); });

  const timeIn = (s) => { const m = s.match(/(\d+(?:[.,]\d+)?)\s*(minutos?|min\b|horas?)/i); if (!m) return 0; const n = parseFloat(m[1].replace(",", ".")); return /hora/i.test(m[2]) ? n * 60 : n; };

  function openRecipe(id) {
    const r = getRecipe(id); if (!r) return;
    const a = analyze(r);
    const haveKeys = new Set([...a.have, ...a.optHave].map((h) => h.k));
    const fav = S.favs.includes(r.id), planned = S.plan.includes(r.id);
    openSheet(`
      <div class="sheet-head">
        <span class="bigemoji" aria-hidden="true">${esc(r.e || "🍽️")}</span>
        <div class="grow"><h2>${esc(r.n)}</h2><p class="rmeta">${stars(a.ratio)} ${r.min} min${r.pin ? " · Recomendado" : ""}</p></div>
        <button class="heart ${fav ? "on" : ""}" data-act="fav" data-id="${esc(r.id)}" data-insheet="1" aria-label="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}" aria-pressed="${fav}">♥</button>
      </div>
      <h3>Ingredientes</h3>
      <ul class="ing">${r.i.map((x) => { const st = isStaple(x.k) || haveKeys.has(x.k); return `<li class="${st ? "ok" : x.opt ? "opt" : "no"}"><span aria-hidden="true">${st ? "✓" : x.opt ? "·" : "✗"}</span><span>${esc(x.t)}${x.opt ? " <small>(opcional)</small>" : ""}${!st && !x.opt ? " <small>te falta</small>" : ""}</span></li>`; }).join("")}</ul>
      <h3>Pasos</h3>
      <p class="hint">Toca un paso para tacharlo. La pantalla se queda encendida mientras ves la receta.</p>
      <ol class="steps">${r.s.map((s) => { const t = timeIn(s); return `<li><button class="step" data-act="stepDone">${esc(s)}</button>${t ? `<button class="timerbtn" data-act="timer" data-min="${t}" data-label="${esc(r.n)}">⏲ Temporizador ${t >= 60 && t % 60 === 0 ? `${t / 60} h` : `${t} min`}</button>` : ""}</li>`; }).join("")}</ol>
      <div class="sheet-actions">
        <button class="btn" data-act="cook" data-id="${esc(r.id)}">Ya la cociné</button>
        ${a.miss.length ? `<button class="btn btn-mint" data-act="missToShop" data-id="${esc(r.id)}">Agregar lo que falta al súper (${a.miss.length})</button>` : ""}
        <button class="btn btn-ghost" data-act="${planned ? "unplan" : "plan"}" data-id="${esc(r.id)}" data-insheet="1">${planned ? "Quitar de mi menú" : "Agregar a mi menú"}</button>
        ${r.ai ? `<button class="btn btn-ghost" data-act="saveAi" data-id="${esc(r.id)}">Guardar en mis recetas</button>` : ""}
        ${r.mine ? `<div class="row"><button class="btn btn-ghost grow" data-act="editRecipe" data-id="${esc(r.id)}">Editar</button><button class="btn btn-ghost grow" data-act="delRecipe" data-id="${esc(r.id)}">Borrar</button></div>` : ""}
        <button class="btn btn-ghost" data-act="close">Cerrar</button>
      </div>`);
    keepAwake();
  }

  // Cuánto se gasta de un artículo según el texto de la receta ("500 g de carne", "4 huevos", "1 cda de consomé")
  function estimateUse(text, it) {
    const m = String(text).trim().match(/^(\d+\/\d+|\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)?/i);
    const u = it.unit, step = stepFor(u);
    const isCont = ["paquete", "lata", "caja", "bolsa", "manojo"].includes(u);
    if (!m) return isCont || u === "pza" ? 0 : step;
    const n = m[1].includes("/") ? m[1].split("/")[0] / m[1].split("/")[1] : parseFloat(m[1].replace(",", "."));
    const w = strip(m[2] || "");
    const is = (re) => re.test(w);
    if (u === "pza") return is(/^(g|gr|gramos?|kg|kilos?|ml|l|litros?|tazas?|cdas?|cditas?|cucharadas?|cucharaditas?|latas?|paquetes?|cajas?|bolsas?)$/) ? 0 : n;
    if (u === "kg") return is(/^(kg|kilos?)$/) ? n : is(/^(g|gr|gramos?)$/) ? n / 1000 : 0.25;
    if (u === "g") return is(/^(g|gr|gramos?)$/) ? n : is(/^(kg|kilos?)$/) ? n * 1000 : 100;
    if (u === "l") return is(/^(l|litros?)$/) ? n : is(/^ml$/) ? n / 1000 : is(/^tazas?$/) ? n * 0.25 : 0.25;
    if (u === "ml") return is(/^ml$/) ? n : is(/^(l|litros?)$/) ? n * 1000 : is(/^tazas?$/) ? n * 250 : 100;
    if (isCont) return w.startsWith(u.slice(0, 3)) || w.startsWith(u) ? n : 0;
    return step;
  }

  function openCook(id) {
    const r = getRecipe(id); const a = analyze(r);
    const used = [...a.have, ...a.optHave].filter((h, i, arr) => arr.findIndex((x) => x.inv.id === h.inv.id) === i);
    if (!used.length) { finishCook(r); return; }
    const simple = used.filter((h) => h.inv.simple), qtyd = used.filter((h) => !h.inv.simple);
    openSheet(`
      <h2>${qtyd.length ? "¿Cuánto te quedó?" : "¿Se acabó algo?"}</h2>
      <p class="hint">${qtyd.length ? "Ajusta lo que queda. " : ""}Marca lo que ya se terminó; lo demás sigue en tu despensa.</p>
      <form data-form="cook" data-id="${esc(r.id)}">
        <ul class="items">
        ${simple.map((h) => { const it = h.inv; return `<li class="item"><label class="check"><input type="checkbox" name="out" value="${it.id}"><span class="box" aria-hidden="true"></span><span class="iemoji" aria-hidden="true">${esc(it.emoji)}</span><span class="iname">${esc(it.name)}<small>se acabó</small></span></label></li>`; }).join("")}
        ${qtyd.map((h) => {
          const it = h.inv; const left = Math.max(0, Math.round((it.qty - Math.min(it.qty, estimateUse(h.t, it))) * 100) / 100);
          return `<li class="item"><span class="iemoji" aria-hidden="true">${esc(it.emoji)}</span><span class="iname">${esc(it.name)}<small>tenías ${fmtQty(it.qty)} ${esc(it.unit)}</small></span>
            <span class="numwrap"><input type="number" inputmode="decimal" min="0" step="any" name="${it.id}" value="${fmtQty(left)}" aria-label="Queda de ${esc(it.name)}"><span>${esc(it.unit)}</span></span></li>`;
        }).join("")}
        </ul>
        <div class="sheet-actions"><button class="btn" type="submit">Listo</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div>
      </form>`);
  }
  function finishCook(r, undo) {
    S.history.push({ id: r.id, t: Date.now() }); S.history = S.history.slice(-200);
    S.plan = S.plan.filter((p) => p !== r.id);
    save(); closeSheet(); render(); celebrate();
    setTimeout(() => toast(undo ? "Despensa actualizada" : "¡Buen provecho!", 4500, undo), 1500);
  }

  function openItemForm(it) {
    const isNew = !it;
    it = it || { name: "", qty: 1, unit: "pza", cat: "Otros", emoji: "", min: 0, exp: "" };
    openSheet(`
      <h2>${isNew ? "Agregar a la despensa" : "Editar"}</h2>
      ${isNew ? `<div class="quick" aria-label="Agregar rápido">${QUICK.map((q) => `<button type="button" class="qchip" data-act="quick" data-name="${esc(q[0])}" data-emoji="${q[1]}" data-cat="${esc(q[2])}">${q[1]} ${esc(q[0])}</button>`).join("")}</div>` : ""}
      <form class="stack" data-form="item" data-id="${isNew ? "" : it.id}">
        <div class="row">
          <label class="emo">Ícono<input name="emoji" value="${esc(it.emoji)}" maxlength="4" placeholder="🍽️" autocomplete="off"></label>
          <label class="grow">Nombre<input name="name" required value="${esc(it.name)}" autocomplete="off" placeholder="Ej. Pechuga de pollo"></label>
        </div>
        <div class="row">
          <label class="grow">Cantidad<input name="qty" type="number" inputmode="decimal" min="0" step="any" value="${fmtQty(it.qty)}"></label>
          <label class="grow">Unidad<select name="unit">${UNITS.map((u) => `<option ${u === it.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label>
        </div>
        <label>Categoría<select name="cat">${CATS.map((c) => `<option ${c === it.cat ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <label>Caduca <small>opcional</small><input name="exp" type="date" value="${esc(it.exp || "")}"></label>
        <div class="sheet-actions">
          <button class="btn" type="submit">${isNew ? "Agregar" : "Guardar"}</button>
          ${isNew ? "" : `<button class="btn btn-ghost" type="button" data-act="toShop" data-id="${it.id}">Agregar al súper</button><button class="btn btn-ghost" type="button" data-act="delInv" data-id="${it.id}">Borrar de la despensa</button>`}
          <button class="btn btn-ghost" type="button" data-act="close">Cancelar</button>
        </div>
      </form>`);
  }

  function openShopQty(s) {
    openSheet(`
      <h2>${esc(s.name)}</h2>
      <form class="stack" data-form="shopQty" data-id="${s.id}">
        <div class="row">
          <label class="grow">Cantidad<input name="qty" type="number" inputmode="decimal" min="0" step="any" value="${fmtQty(s.qty)}" autofocus></label>
          <label class="grow">Unidad<select name="unit">${UNITS.map((u) => `<option ${u === s.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label>
        </div>
        <div class="sheet-actions"><button class="btn" type="submit">Guardar</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div>
      </form>`);
  }

  function openRecipeForm(r) {
    r = r || { n: "", e: "", min: 20, tags: [], i: [], s: [] };
    openSheet(`
      <h2>${r.id ? "Editar receta" : "Mi receta"}</h2>
      <form class="stack" data-form="recipe" data-id="${esc(r.id || "")}">
        <div class="row">
          <label class="emo">Ícono<input name="e" value="${esc(r.e)}" maxlength="4" placeholder="🍲" autocomplete="off"></label>
          <label class="grow">Nombre<input name="n" required value="${esc(r.n)}" placeholder="Ej. Sopa de mi mamá" autocomplete="off"></label>
        </div>
        <label>Minutos<input name="min" type="number" inputmode="numeric" min="1" value="${r.min}"></label>
        <fieldset class="tagset"><legend>Tipo</legend><div class="chips">${FORM_TAGS.map(([k, l]) => `<label class="chip-check"><input type="checkbox" name="tags" value="${k}" ${r.tags.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
        <label>Ingredientes <small>uno por renglón; pon "(opcional)" si no es indispensable</small><textarea name="i" rows="6" required placeholder="2 huevos&#10;1 jitomate&#10;Queso (opcional)">${esc(r.i.map((x) => x.t + (x.opt && !/opcional/i.test(x.t) ? " (opcional)" : "")).join("\n"))}</textarea></label>
        <label>Pasos <small>uno por renglón</small><textarea name="s" rows="6" required placeholder="Bate los huevos.&#10;Cocina 5 minutos.">${esc(r.s.join("\n"))}</textarea></label>
        <div class="sheet-actions"><button class="btn" type="submit">Guardar receta</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div>
      </form>`);
  }
  const keyFrom = (line) => cleanName(line.replace(/\(.*?\)/g, "").split(/,| para /)[0]).toLowerCase();

  // ---------- Voz ----------
  let rec = null;
  function listen(btn) {
    if (!SR) return;
    if (rec) { rec.stop(); return; }
    try {
      rec = new SR(); rec.lang = "es-MX"; rec.interimResults = false; rec.maxAlternatives = 1;
      btn.classList.add("listening"); toast("Te escucho… di por ejemplo: huevos, salchicha y leche", 6000);
      rec.onresult = (e) => { const txt = e.results[0][0].transcript; const inp = $("#say"); if (inp) { inp.value = txt; inp.form.requestSubmit(); } };
      rec.onerror = (e) => { toast(e.error === "not-allowed" ? "Permite el micrófono en la configuración del navegador para dictar." : "No te escuché bien. Intenta otra vez o escríbelo.", 4500); };
      rec.onend = () => { rec = null; const m = document.querySelector('[data-act="mic"]'); if (m) m.classList.remove("listening"); };
      rec.start();
    } catch { rec = null; btn.classList.remove("listening"); toast("El dictado no está disponible en este navegador."); }
  }

  // ---------- Temporizadores ----------
  const timers = [];
  let audioCtx = null;
  function ensureAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.resume) audioCtx.resume(); } catch { audioCtx = null; } }
  function beep() {
    if (!audioCtx) return;
    for (let i = 0; i < 4; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.35;
      o.type = "triangle"; o.frequency.value = i % 2 ? 1046 : 880;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.3);
    }
  }
  function startTimer(min, label) { ensureAudio(); timers.push({ id: uid(), label, end: Date.now() + min * 60000 }); renderTimers(); vib(); toast(`Temporizador de ${min} min iniciado`); }
  function renderTimers() {
    const box = $("#timers");
    document.body.classList.toggle("has-timers", timers.length > 0);
    box.innerHTML = timers.map((t) => { const s = Math.max(0, Math.round((t.end - Date.now()) / 1000)); return `<button class="timer" data-act="stopTimer" data-id="${t.id}" aria-label="Detener temporizador de ${esc(t.label)}"><b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}</b><span>${esc(t.label)}</span><i aria-hidden="true">×</i></button>`; }).join("");
  }
  setInterval(() => {
    if (!timers.length) return;
    const now = Date.now();
    for (const t of [...timers]) if (t.end <= now) { timers.splice(timers.indexOf(t), 1); vib([300, 150, 300, 150, 300]); beep(); toast(`¡Tiempo! ${t.label}`, 7000); }
    renderTimers();
  }, 1000);

  // ---------- Celebración ----------
  function celebrate() {
    vib([20, 40, 20]);
    const d = document.createElement("div");
    d.className = "party";
    d.innerHTML = `<div class="party-card">${TOMATINA("joy", 130)}<p>¡Buen provecho!</p></div>${Array.from({ length: 10 }, (_, i) => `<span class="spark" style="--a:${i * 36}deg;--d:${i % 2 ? 120 : 165}px" aria-hidden="true">★</span>`).join("")}`;
    d.addEventListener("click", () => d.remove());
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  // ---------- IA ----------
  async function askAI() {
    const inv = S.inv.filter((i) => i.qty > 0).map((i) => `${i.name} (${fmtQty(i.qty)} ${i.unit}${i.exp ? `, caduca ${i.exp}` : ""})`);
    const prompt = `Eres una chef mexicana casera. Sugiere 4 recetas para Mariana.
Despensa: ${inv.join("; ") || "casi vacía"}.
Le encanta: ${S.prefs.likes.join(", ") || "sin datos"}. No le gusta (nunca lo uses): ${S.prefs.dislikes.join(", ") || "nada"}.
${S.prefs.veg ? "Debe ser vegetariano. " : ""}${S.prefs.gf ? "Debe ser sin gluten. " : ""}Antojo: ${S.ui.query || "lo que sea"}. Filtros: ${S.ui.filters.join(", ") || "ninguno"}.
Prioriza usar lo que tiene, sobre todo lo que caduca pronto; máximo 2 ingredientes faltantes por receta. Asume sal, pimienta, aceite y agua.
Responde SOLO con un arreglo JSON, sin texto extra: [{"n":"nombre","e":"un emoji","min":minutos,"tags":["desayuno|comida|cena|rapido|ninos|saludable|sopa|postre|vegetariano|sin-gluten"],"i":[{"k":"ingrediente base en singular sin acentos","t":"cantidad y descripción","opt":false}],"s":["paso corto"]}]`;
    toast("Pensando recetas…", 15000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": S.ai.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: S.ai.model || "claude-sonnet-5-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status}`);
      const text = (data.content || []).map((c) => c.text || "").join("");
      const json = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
      const recs = json.filter((r) => r && r.n && Array.isArray(r.i) && Array.isArray(r.s)).map((r) => ({ id: "ai-" + uid(), n: String(r.n), e: r.e || "✨", min: Number(r.min) || 30, tags: Array.isArray(r.tags) ? r.tags : [], i: r.i.map((x) => ({ k: String(x.k || x.t || ""), t: String(x.t || x.k || ""), opt: !!x.opt })), s: r.s.map(String), ai: true }));
      if (!recs.length) throw new Error("La respuesta no traía recetas.");
      S.aiRecipes = recs.concat(S.aiRecipes).slice(0, 12);
      save(); render(); toast(`${recs.length} recetas nuevas de la IA`);
    } catch (e) {
      toast(`No se pudieron pedir ideas: ${e.message}. Revisa la clave en Gustos.`, 6000);
    }
  }

  // ---------- Toast ----------
  let tTimer;
  function toast(msg, ms = 2600, action, label = "Deshacer") {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button id="undoBtn">${esc(label)}</button>` : ""}`;
    t.classList.add("show");
    if (action) $("#undoBtn").onclick = () => { t.classList.remove("show"); action(); };
    clearTimeout(tTimer); tTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- Eventos ----------
  const snapshot = () => JSON.stringify({ inv: S.inv, shop: S.shop, plan: S.plan, history: S.history, buyCount: S.buyCount });
  const restore = (snap) => { Object.assign(S, JSON.parse(snap)); save(); render(); };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "INPUT") return;
    const id = b.dataset.id, act = b.dataset.act;
    const it = S.inv.find((x) => x.id === id), sh = S.shop.find((x) => x.id === id);
    switch (act) {
      case "tab": S.ui.tab = b.dataset.tab; closeSheet(); save(); render(); break;
      case "filter": { const k = b.dataset.k; S.ui.filters = S.ui.filters.includes(k) ? S.ui.filters.filter((f) => f !== k) : [...S.ui.filters, k]; S.ui.showAll = false; vib(); save(); render(); break; }
      case "clearFilters": S.ui.filters = []; S.ui.query = ""; S.ui.showAll = false; save(); render(); break;
      case "showAll": S.ui.showAll = true; save(); render(); break;
      case "ai": S.ui.query = $("#q").value; save(); askAI(); break;
      case "open": openRecipe(id); break;
      case "surprise": {
        const list = scoreRecipes(); const ready = list.filter((x) => x.a.ratio === 1);
        const cand = ready.length ? ready : list.slice(0, 8);
        const pick = cand[Math.floor(Math.random() * cand.length)];
        if (!pick) { toast("Agrega cosas a tu despensa y te sorprendo."); break; }
        bubbleOverride = [`¿Y si hacemos ${pick.r.n.toLowerCase()}?`, "joy"]; render(); bubbleOverride = null;
        vib(15); setTimeout(() => openRecipe(pick.r.id), 450); break;
      }
      case "fav": {
        S.favs = S.favs.includes(id) ? S.favs.filter((f) => f !== id) : [...S.favs, id]; vib(); save();
        if (b.dataset.insheet) { const on = S.favs.includes(id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Quitar de favoritas" : "Guardar en favoritas"); }
        render(); break;
      }
      case "plan": case "unplan":
        S.plan = act === "plan" ? [...new Set([...S.plan, id])] : S.plan.filter((p) => p !== id); save(); render();
        if (b.dataset.insheet) openRecipe(id);
        toast(act === "plan" ? "Agregada a tu menú (arriba en Ideas)" : "Quitada de tu menú"); break;
      case "planToShop": {
        let n = 0; S.plan.map(getRecipe).filter(Boolean).forEach((r) => analyze(r).miss.forEach((m) => { if (addShop({ name: cleanName(m.t), src: r.n })) n++; }));
        save(); render(); toast(n ? `${n} ${n === 1 ? "cosa agregada" : "cosas agregadas"} al súper` : "Ya estaba todo en tu lista"); break;
      }
      case "close": closeSheet(); break;
      case "stepDone": b.classList.toggle("done"); vib(); break;
      case "timer": startTimer(Number(b.dataset.min), b.dataset.label); break;
      case "stopTimer": { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); renderTimers(); break; }
      case "missToShop": {
        const r = getRecipe(id); let n = 0;
        analyze(r).miss.forEach((m) => { if (addShop({ name: cleanName(m.t), src: r.n })) n++; });
        save(); closeSheet(); render(); toast(n ? `${n} ${n === 1 ? "cosa agregada" : "cosas agregadas"} al súper` : "Ya estaba en tu lista"); break;
      }
      case "cook": openCook(id); break;
      case "newRecipe": openRecipeForm(); break;
      case "editRecipe": openRecipeForm(getRecipe(id)); break;
      case "delRecipe": if (confirm("¿Borrar esta receta?")) { S.myRecipes = S.myRecipes.filter((r) => r.id !== id); S.plan = S.plan.filter((p) => p !== id); save(); closeSheet(); render(); toast("Receta borrada"); } break;
      case "saveAi": { const r = getRecipe(id); const copy = { ...JSON.parse(JSON.stringify(r)), id: "my-" + uid(), ai: false, mine: true }; S.myRecipes.push(copy); S.aiRecipes = S.aiRecipes.filter((x) => x.id !== id); S.plan = S.plan.map((p) => (p === id ? copy.id : p)); save(); closeSheet(); render(); toast("Guardada en tus recetas"); break; }
      case "addInv": openItemForm(); break;
      case "out": { const snap = snapshot(); markOut(it); vib(); save(); render(); toast(`Ya no hay ${it.name}`, 4500, () => { shopOne(it); save(); render(); toast("Agregado a la lista del súper", 3000, () => restore(snap)); }, "Al súper"); break; }
      case "haveAgain": it.qty = it.simple || !it.lastQty ? 1 : it.lastQty; vib(); save(); render(); break;
      case "outToShop": shopOne(it); vib(); save(); render(); toast(`Se agregó al súper: ${it.name}`); break;
      case "quickHave": { const r = understand(b.dataset.name); vib(); save(); render(); if (r.added.length) toast(`Se agregó: ${r.added.join(", ")}`); break; }
      case "mic": listen(b); break;
      case "editInv": openItemForm(it); break;
      case "toShop": if (addShop({ name: it.name, unit: it.unit, cat: it.cat, emoji: it.emoji })) { save(); render(); toast(`Se agregó al súper: ${it.name}`); } else toast("Ya está en la lista"); closeSheet(); break;
      case "quick": { const f = sheetBody.querySelector('[data-form="item"]'); f.name.value = b.dataset.name; f.cat.value = b.dataset.cat; f.emoji.value = b.dataset.emoji; f.unit.value = QUICK_UNIT[b.dataset.name] || "pza"; f.qty.focus(); f.qty.select(); break; }
      case "inc": case "dec": {
        const step = stepFor(it.unit) * (act === "inc" ? 1 : -1);
        it.qty = Math.max(0, Math.round((it.qty + step) * 100) / 100);
        if (act === "dec") checkLow(it);
        vib(); save(); render(); break;
      }
      case "delInv": { const snap = snapshot(); const name = it.name; S.inv = S.inv.filter((x) => x.id !== id); save(); closeSheet(); render(); toast(`Se quitó: ${name}`, 4500, () => restore(snap)); break; }
      case "delShop": { const snap = snapshot(); const name = sh.name; S.shop = S.shop.filter((x) => x.id !== id); save(); render(); toast(`Se quitó: ${name}`, 4000, () => restore(snap)); break; }
      case "shopQty": openShopQty(sh); break;
      case "addLow": { let n = 0; lowStock().forEach((x) => { if (shopOne(x)) n++; }); save(); render(); toast(`${n} ${n === 1 ? "agregado" : "agregados"} a la lista`); break; }
      case "addFreq": { const bc = Object.values(S.buyCount).find((x) => x.name === b.dataset.name); if (bc) addShop({ name: bc.name, unit: bc.unit, cat: bc.cat, emoji: bc.emoji, qty: bc.qty || 1 }); vib(); save(); render(); break; }
      case "toPantry": {
        const snap = snapshot(); const done = S.shop.filter((s) => s.done);
        done.forEach((s) => {
          addInv({ name: s.name, qty: s.qty, unit: s.unit, cat: s.cat, emoji: s.emoji });
          const k = norm(s.name); const prev = S.buyCount[k];
          S.buyCount[k] = { name: s.name, unit: s.unit, cat: s.cat, emoji: s.emoji, qty: s.qty, n: (prev?.n || 0) + 1 };
        });
        S.shop = S.shop.filter((s) => !s.done); save(); render(); toast(`${done.length} ${done.length === 1 ? "cosa guardada" : "cosas guardadas"} en la despensa`, 4500, () => restore(snap)); break;
      }
      case "clearShop": if (confirm("¿Vaciar toda la lista del súper?")) { const snap = snapshot(); S.shop = []; save(); render(); toast("Lista vacía", 4000, () => restore(snap)); } break;
      case "share": {
        const pend = S.shop.filter((s) => !s.done);
        const txt = "Lista del súper\n" + CATS.map((c) => { const l = pend.filter((s) => (CATS.includes(s.cat) ? s.cat : "Otros") === c); return l.length ? `\n${c}\n` + l.map((s) => `- ${s.name} (${fmtQty(s.qty)} ${s.unit})`).join("\n") : ""; }).join("");
        if (navigator.share) navigator.share({ title: "Lista del súper", text: txt }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast("Lista copiada; pégala en WhatsApp"));
        break;
      }
      case "delPref": S.prefs[b.dataset.kind].splice(Number(b.dataset.i), 1); save(); render(); break;
      case "install": if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; render(); }); } break;
      case "dismissInstall": S.ui.installDismissed = true; save(); render(); break;
      case "export": {
        const blob = new Blob([JSON.stringify({ ...S, ai: { ...S.ai, key: "" } }, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cocina-mariana-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); break;
      }
      case "reset": if (confirm("Esto borra despensa, lista, menú, recetas propias y gustos de este teléfono. ¿Continuar?")) { load({}); save(); render(); } break;
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target, act = el.dataset.act;
    if (act === "toggleShop") { const s = S.shop.find((x) => x.id === el.dataset.id); s.done = el.checked; vib(); save(); render(); }
    if (act === "pref") { S.prefs[el.dataset.k] = el.checked; save(); }
    if (act === "import" && el.files[0]) {
      el.files[0].text().then((t) => { const d = JSON.parse(t); if (!d || !Array.isArray(d.inv)) throw new Error("formato"); const key = S.ai.key; load(d); S.ai.key = S.ai.key || key; save(); render(); toast("Respaldo cargado"); }).catch(() => toast("Ese archivo no es un respaldo de esta app"));
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target; const kind = f.dataset.form; if (!kind) return;
    e.preventDefault();
    if (kind === "search") { S.ui.query = $("#q").value.trim(); S.ui.showAll = false; save(); render(); }
    if (kind === "shopAdd") {
      const parts = $("#shopInput").value.split(/\n|,(?!\d)/).map((x) => x.trim()).filter(Boolean);
      let n = 0; parts.forEach((p) => { const r = parseLine(p); if (r && addShop({ ...r, unit: /\d|kilo|litro|docena|medio|media/i.test(p) ? r.unit : undefined })) n++; });
      if (n) { save(); render(); $("#shopInput").focus(); } else if (parts.length) toast("Eso ya está en la lista");
    }
    if (kind === "pref") { const inp = f.querySelector("input"); const vals = inp.value.split(",").map((x) => x.trim()).filter(Boolean); const arr = S.prefs[f.dataset.kind]; vals.forEach((v) => { if (!arr.some((a) => norm(a) === norm(v))) arr.push(v); }); save(); render(); }
    if (kind === "ai") { S.ai.key = $("#aiKey").value.trim(); S.ai.model = $("#aiModel").value.trim() || "claude-sonnet-5-5"; save(); render(); toast(S.ai.key ? "Clave guardada. El botón de IA ya aparece en Ideas." : "Clave borrada"); }
    if (kind === "item") {
      const fd = Object.fromEntries(new FormData(f));
      const data = { name: fd.name.trim(), qty: parseFloat(fd.qty) || 0, unit: fd.unit, cat: fd.cat, emoji: fd.emoji.trim() || guessEmoji(fd.name), exp: fd.exp };
      data.simple = data.unit === "pza" && data.qty === 1 && !data.exp;
      if (f.dataset.id) { const it = S.inv.find((x) => x.id === f.dataset.id); Object.assign(it, data); if (it.qty <= 0) markOut(it); toast("Guardado"); }
      else { addInv(data); toast(`Se agregó: ${data.name}`); }
      save(); closeSheet(); render();
    }
    if (kind === "say") {
      const inp = $("#say"); const txt = inp.value.trim(); if (!txt) return;
      const snap = snapshot(); const r = understand(txt);
      save(); render(); vib();
      const parts = [];
      if (r.added.length) parts.push(`Se agregó: ${r.added.join(", ")}`);
      if (r.out.length) parts.push(`Ya no hay: ${r.out.map((x) => x.name).join(", ")}`);
      if (r.already.length) parts.push(`Ya tenías: ${r.already.join(", ")}`);
      if (r.missing.length) parts.push(`No encontré: ${r.missing.join(", ")}`);
      if (r.out.length && !r.added.length) toast(parts.join(". "), 5000, () => { r.out.forEach(shopOne); save(); render(); toast("Agregado a la lista del súper"); }, "Al súper");
      else toast(parts.join(". ") || "No entendí. Escribe por ejemplo: huevos, salchicha", 4500, r.added.length || r.out.length ? () => restore(snap) : undefined);
      setTimeout(() => { const n = $("#say"); if (n) n.focus(); }, 50);
    }
    if (kind === "shopQty") { const s = S.shop.find((x) => x.id === f.dataset.id); s.qty = Math.max(0, parseFloat(f.qty.value) || 0); s.unit = f.unit.value; save(); closeSheet(); render(); }
    if (kind === "recipe") {
      const fd = new FormData(f);
      const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
      const r = {
        id: f.dataset.id || "my-" + uid(), mine: true,
        n: String(fd.get("n")).trim(), e: String(fd.get("e")).trim() || "🍽️", min: parseInt(fd.get("min"), 10) || 20,
        tags: fd.getAll("tags"),
        i: lines(fd.get("i")).map((t) => ({ k: keyFrom(t), t: t.replace(/\s*\(opcional\)\s*/i, " ").trim(), opt: /opcional/i.test(t) })),
        s: lines(fd.get("s")).map((x) => x.replace(/^\d+[.)-]\s*/, "")),
      };
      const i = S.myRecipes.findIndex((x) => x.id === r.id);
      if (i >= 0) S.myRecipes[i] = r; else S.myRecipes.push(r);
      save(); render(); openRecipe(r.id); toast("Receta guardada");
    }
    if (kind === "cook") {
      const r = getRecipe(f.dataset.id); const snap = snapshot();
      for (const [k, v] of new FormData(f)) {
        if (k === "out") { const it = S.inv.find((x) => x.id === v); if (it) markOut(it); continue; }
        const it = S.inv.find((x) => x.id === k); if (it) { const q = Math.max(0, parseFloat(v) || 0); if (q <= 0) markOut(it); else it.qty = q; }
      }
      finishCook(r, () => restore(snap));
    }
  });

  // ---------- Inicio ----------
  render();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
