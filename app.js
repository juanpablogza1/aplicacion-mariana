/* La cocina de Mariana — app principal (sin dependencias). */
(() => {
  "use strict";

  // ---------- Utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const canonWord = (w) => { if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1); if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1); return w; };
  const canon = (s) => strip(s).split(" ").filter(Boolean).map(canonWord).join(" ");
  const fmtQty = (q) => (Math.round(q * 100) / 100).toString();
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const daysUntil = (iso) => { if (!iso) return null; const d = new Date(iso + "T00:00:00"); const t = new Date(todayISO() + "T00:00:00"); return Math.round((d - t) / 86400000); };

  const CATS = ["Frutas y verduras", "Carnes", "Lácteos y huevo", "Despensa", "Congelados", "Bebidas", "Limpieza", "Otros"];
  const CAT_EMOJI = { "Frutas y verduras": "🥕", "Carnes": "🍗", "Lácteos y huevo": "🥚", "Despensa": "🫙", "Congelados": "🧊", "Bebidas": "🧃", "Limpieza": "🧽", "Otros": "🛍️" };
  const UNITS = ["pza", "kg", "g", "l", "ml", "paquete", "lata", "bolsa", "caja", "manojo", "docena"];
  const FILTERS = [["desayuno", "Desayuno"], ["comida", "Comida"], ["cena", "Cena"], ["rapido", "Rápido"], ["ninos", "Para niños"], ["saludable", "Saludable"], ["sopa", "Sopa"], ["postre", "Postre"]];
  const WORD_TAGS = { rapido: "rapido", rapida: "rapido", facil: "rapido", ninos: "ninos", nino: "ninos", nina: "ninos", gabriel: "ninos", sano: "saludable", sana: "saludable", saludable: "saludable", ligero: "saludable", ligera: "saludable", sopa: "sopa", caldo: "sopa", crema: "sopa", dulce: "dulce", postre: "postre", desayuno: "desayuno", almuerzo: "desayuno", comida: "comida", cena: "cena", vegetariano: "vegetariano", vegetariana: "vegetariano" };

  const RECIPES = window.RECIPES || [];
  const STAPLES = new Set((window.STAPLES || []).map(canon));
  const KEYSET = new Set(RECIPES.flatMap((r) => r.i.map((x) => canon(x.k))));
  const QUICK = window.QUICK_ITEMS || [];
  const QUICK_UNIT = { "Pollo": "kg", "Carne molida": "kg", "Pescado": "kg", "Leche": "l", "Arroz": "kg", "Frijol": "kg", "Harina": "kg", "Azúcar": "kg", "Tortilla": "kg", "Jitomate": "kg", "Papa": "kg", "Tomate verde": "kg", "Huevo": "pza", "Queso": "pza", "Atún": "lata", "Fideo": "paquete", "Espagueti": "paquete", "Pan": "bolsa", "Avena": "bolsa", "Consomé": "caja" };

  // ---------- Estado ----------
  const KEY = "cocina-mariana-v1";
  const defaults = () => ({ inv: [], shop: [], prefs: { likes: [], dislikes: [], veg: false, gf: false }, favs: [], history: [], ai: { key: "", model: "claude-sonnet-5-5" }, aiRecipes: [], ui: { tab: "ideas", filters: [], query: "" } });
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = defaults(); }
  S.prefs = Object.assign(defaults().prefs, S.prefs);
  S.ai = Object.assign(defaults().ai, S.ai);
  S.ui = Object.assign(defaults().ui, S.ui);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("No se pudo guardar: el almacenamiento está lleno."); } };

  // ---------- Coincidencia de ingredientes ----------
  function matches(invName, key) {
    const a = canon(invName), b = canon(key);
    if (!a || !b) return false;
    if (a === b) return true;
    if (KEYSET.has(a)) return false; // el nombre ya es un ingrediente distinto (p. ej. "leche condensada")
    return a.startsWith(b + " ") || b.startsWith(a + " ");
  }
  const findInv = (key) => S.inv.find((it) => it.qty > 0 && matches(it.name, key));
  const isStaple = (key) => STAPLES.has(canon(key));
  const guessEmoji = (name) => { const q = QUICK.find((x) => matches(x[0], name) || canon(x[0]) === canon(name)); return q ? q[1] : "🍽️"; };
  const guessCat = (name) => { const q = QUICK.find((x) => matches(x[0], name) || canon(x[0]) === canon(name)); return q ? q[2] : "Otros"; };

  // ---------- Motor de ideas ----------
  function analyze(r) {
    const req = r.i.filter((x) => !x.opt && !isStaple(x.k));
    const have = [], miss = [], optHave = [];
    for (const x of r.i) {
      if (isStaple(x.k)) continue;
      const it = findInv(x.k);
      if (it) (x.opt ? optHave : have).push({ ...x, inv: it });
      else if (!x.opt) miss.push(x);
    }
    return { req: req.length, have, miss, optHave };
  }

  function scoreRecipes() {
    const qWords = strip(S.ui.query).split(" ").filter((w) => w.length > 2);
    const qTags = new Set(qWords.map((w) => WORD_TAGS[w]).filter(Boolean));
    const qIngr = qWords.filter((w) => !WORD_TAGS[w]);
    const likes = S.prefs.likes, dislikes = S.prefs.dislikes;
    const recent = new Set(S.history.filter((h) => (Date.now() - h.t) < 3 * 86400000).map((h) => h.id));
    const pool = RECIPES.concat(S.aiRecipes || []);
    const out = [];
    for (const r of pool) {
      if (r.pin) { const a = analyze(r); out.push({ r, a, ratio: a.req ? a.have.length / a.req : 1, score: Infinity, reasons: ["la favorita de siempre"] }); continue; }
      if (S.prefs.veg && !r.tags.includes("vegetariano")) continue;
      if (S.prefs.gf && !r.tags.includes("sin-gluten")) continue;
      if (S.ui.filters.length && !S.ui.filters.every((f) => r.tags.includes(f) || (f === "postre" && r.tags.includes("dulce")))) continue;
      if (r.i.some((x) => !x.opt && dislikes.some((d) => matches(d, x.k) || canon(d) === canon(x.k)))) continue;
      const a = analyze(r);
      const ratio = a.req ? a.have.length / a.req : 1;
      let score = ratio * 100 + (ratio === 1 ? 30 : 0) + a.optHave.length * 3;
      let reasons = [];
      const liked = r.i.filter((x) => likes.some((l) => matches(l, x.k) || canon(l) === canon(x.k) || strip(r.n).includes(strip(l))));
      if (liked.length) { score += 8 * Math.min(liked.length, 2); reasons.push("le gusta"); }
      if (S.favs.includes(r.id)) { score += 8; reasons.push("favorita"); }
      const expiring = a.have.filter((h) => { const d = daysUntil(h.inv.exp); return d !== null && d <= 3; });
      if (expiring.length) { score += 10 * expiring.length; reasons.push("usa lo que vence pronto"); }
      if (recent.has(r.id)) score -= 20;
      if (qWords.length) {
        let qs = 0;
        for (const t of qTags) if (r.tags.includes(t)) qs += 25;
        for (const w of qIngr) if (r.i.some((x) => canon(x.k).includes(canonWord(w))) || strip(r.n).includes(w)) qs += 35;
        if (!qs) score -= 40; else { score += qs; reasons.push("coincide con tu antojo"); }
      }
      out.push({ r, a, ratio, score, reasons });
    }
    return out.sort((x, y) => y.score - x.score);
  }

  // ---------- Inventario / súper ----------
  function addInv({ name, qty = 1, unit = "pza", cat, emoji, min = 0, exp = "" }) {
    name = name.trim(); if (!name) return;
    const ex = S.inv.find((it) => canon(it.name) === canon(name) && it.unit === unit);
    if (ex) { ex.qty += Number(qty) || 0; if (exp) ex.exp = exp; }
    else S.inv.push({ id: uid(), name, qty: Number(qty) || 0, unit, cat: cat || guessCat(name), emoji: emoji || guessEmoji(name), min: Number(min) || 0, exp });
  }
  function addShop({ name, qty = 1, unit = "pza", cat, emoji, src = "" }) {
    name = name.trim(); if (!name) return false;
    if (S.shop.some((s) => !s.done && canon(s.name) === canon(name))) return false;
    S.shop.push({ id: uid(), name, qty: Number(qty) || 1, unit, cat: cat || guessCat(name), emoji: emoji || guessEmoji(name), done: false, src });
    return true;
  }
  const lowStock = () => S.inv.filter((it) => it.qty <= (it.min || 0));
  function checkLow(it) {
    if (it.qty <= (it.min || 0)) {
      if (addShop({ name: it.name, unit: it.unit, cat: it.cat, emoji: it.emoji, src: "Se acabó" })) toast(`${it.name} se agregó al súper`);
    }
  }
  function cleanName(t) { // "2 jitomates" -> "jitomates"
    return t.replace(/^[\d\s\/.,]+/, "").replace(/^(de |tazas? de |cdas? de |g de |kg de |latas? de |paquetes? de )/i, "").replace(/^\w/, (c) => c.toUpperCase());
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
      : `<ellipse class="eye" cx="46" cy="70" rx="5" ry="6.5" fill="#5A3426"/><ellipse class="eye" cx="74" cy="70" rx="5" ry="6.5" fill="#5A3426"/><circle cx="48" cy="67" r="2" fill="#fff"/><circle cx="76" cy="67" r="2" fill="#fff"/><path d="M52 84q8 9 16 0" stroke="#5A3426" stroke-width="4" fill="#C2344F" stroke-linecap="round" stroke-linejoin="round"/>`}
    <ellipse cx="34" cy="82" rx="7" ry="4.5" fill="#FFB3C4"/><ellipse cx="86" cy="82" rx="7" ry="4.5" fill="#FFB3C4"/>
  </svg>`;

  function tip() {
    const exp = S.inv.filter((it) => { const d = daysUntil(it.exp); return it.qty > 0 && d !== null && d <= 2; });
    const low = lowStock();
    if (!S.inv.length) return ["Hola, Mariana. Empieza llenando tu despensa y yo te digo qué cocinar.", "happy"];
    if (exp.length) return [`Ojo: ${exp.slice(0, 3).map((x) => x.name).join(", ")} ${exp.length > 1 ? "vencen" : "vence"} pronto. Te puse recetas que los usan.`, "happy"];
    if (low.length) return [`Se está acabando: ${low.slice(0, 3).map((x) => x.name).join(", ")}.`, "sad"];
    const h = new Date().getHours();
    return [h < 11 ? "Buenos días. ¿Qué desayunamos hoy?" : h < 17 ? "¿Qué hacemos de comer?" : "¿Algo rico para cenar?", "happy"];
  }

  // ---------- Render ----------
  const main = $("#main");
  function render() {
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === S.ui.tab ? "page" : "false"));
    const shopCount = S.shop.filter((s) => !s.done).length;
    $("#shopBadge").textContent = shopCount || "";
    $("#shopBadge").hidden = !shopCount;
    const [msg, mood] = tip();
    $("#mascot").innerHTML = TOMATINA(mood, 64);
    $("#bubble").textContent = msg;
    main.innerHTML = ({ ideas: viewIdeas, despensa: viewDespensa, super: viewSuper, gustos: viewGustos })[S.ui.tab]();
    main.scrollTop = 0;
  }

  function viewIdeas() {
    const list = scoreRecipes();
    const ready = list.filter((x) => x.ratio === 1);
    const top = list.slice(0, 25);
    return `
    <section class="panel antojo">
      <label for="q" class="h2">¿Qué se te antoja?</label>
      <div class="row">
        <input id="q" type="search" enterkeyhint="search" placeholder="Ej. algo rápido con pollo para Gabriel" value="${esc(S.ui.query)}" autocomplete="off">
        <button class="btn" data-act="search">Dame ideas</button>
      </div>
      <div class="chips" role="group" aria-label="Filtros">
        ${FILTERS.map(([k, l]) => `<button class="chip ${S.ui.filters.includes(k) ? "on" : ""}" data-act="filter" data-k="${k}" aria-pressed="${S.ui.filters.includes(k)}">${l}</button>`).join("")}
      </div>
      ${S.ai.key ? `<button class="btn btn-mint wide" data-act="ai">Pedir ideas nuevas a la IA</button>` : ""}
    </section>
    <p class="count">${S.inv.length ? `${ready.length} ${ready.length === 1 ? "receta lista" : "recetas listas"} con lo que tienes` : "Agrega ingredientes en Despensa para ver qué puedes cocinar"}</p>
    <div class="recipes">
      ${top.length ? top.map(cardRecipe).join("") : `<div class="empty">${TOMATINA("sad", 90)}<p>No encontré recetas con esos filtros. Quita alguno o cambia tu antojo.</p></div>`}
    </div>`;
  }

  function stars(ratio) {
    const n = Math.round(ratio * 5);
    return `<span class="stars" aria-label="${n} de 5">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
  }

  function cardRecipe({ r, a, ratio, reasons }) {
    const fav = S.favs.includes(r.id);
    return `
    <article class="rcard ${ratio === 1 ? "ready" : ""}">
      <button class="rcard-main" data-act="open" data-id="${esc(r.id)}">
        <span class="remoji">${esc(r.e || "🍽️")}</span>
        <span class="rbody">
          <span class="rname">${esc(r.n)}${r.ai ? ` <span class="tag-ai">IA</span>` : ""}</span>
          <span class="rmeta">${stars(ratio)} <span>${r.min} min</span></span>
          <span class="rhave">${ratio === 1 ? "Tienes todo" : `Tienes ${a.have.length} de ${a.req}`}${reasons.length ? ` · ${esc(reasons[0])}` : ""}</span>
          ${a.miss.length ? `<span class="rmiss">Falta: ${a.miss.map((m) => esc(cleanName(m.t))).join(", ")}</span>` : ""}
        </span>
      </button>
      <button class="heart ${fav ? "on" : ""}" data-act="fav" data-id="${esc(r.id)}" aria-label="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}" aria-pressed="${fav}">♥</button>
    </article>`;
  }

  function viewDespensa() {
    const f = strip(S.ui.invFilter || "");
    const items = S.inv.filter((it) => !f || strip(it.name).includes(f));
    const groups = CATS.map((c) => [c, items.filter((it) => (it.cat || "Otros") === c).sort((a, b) => a.name.localeCompare(b.name))]).filter(([, l]) => l.length);
    return `
    <div class="toolbar">
      <input id="invSearch" type="search" placeholder="Buscar en la despensa" value="${esc(S.ui.invFilter || "")}" autocomplete="off">
      <button class="btn" data-act="addInv">Agregar</button>
    </div>
    ${!S.inv.length ? `<div class="empty">${TOMATINA("happy", 100)}<p>Tu despensa está vacía. Toca <b>Agregar</b> y pon lo que tienes en el refri y la alacena.</p></div>` : ""}
    ${groups.map(([c, l]) => `
      <section class="group">
        <h2 class="gtitle"><span>${CAT_EMOJI[c]}</span>${c}</h2>
        <ul class="items">${l.map(itemRow).join("")}</ul>
      </section>`).join("")}`;
  }

  function itemRow(it) {
    const d = daysUntil(it.exp);
    const badge = d === null ? "" : d < 0 ? `<span class="badge bad">Venció</span>` : d <= 2 ? `<span class="badge warn">${d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : "Vence en 2 días"}</span>` : "";
    const low = it.qty <= (it.min || 0);
    const step = ["kg", "l"].includes(it.unit) ? 0.25 : ["g", "ml"].includes(it.unit) ? 100 : 1;
    return `
    <li class="item ${low ? "low" : ""}">
      <button class="item-main" data-act="editInv" data-id="${it.id}">
        <span class="iemoji">${esc(it.emoji)}</span>
        <span class="iname">${esc(it.name)} ${badge}</span>
        <span class="iqty">${fmtQty(it.qty)} ${esc(it.unit)}</span>
      </button>
      <span class="stepper">
        <button data-act="dec" data-id="${it.id}" data-step="${step}" aria-label="Quitar ${step} ${esc(it.unit)} de ${esc(it.name)}">−</button>
        <button data-act="inc" data-id="${it.id}" data-step="${step}" aria-label="Agregar ${step} ${esc(it.unit)} de ${esc(it.name)}">+</button>
      </span>
    </li>`;
  }

  function viewSuper() {
    const pending = S.shop.filter((s) => !s.done), done = S.shop.filter((s) => s.done);
    const low = lowStock().filter((it) => !S.shop.some((s) => !s.done && canon(s.name) === canon(it.name)));
    const groups = CATS.map((c) => [c, pending.filter((s) => (s.cat || "Otros") === c)]).filter(([, l]) => l.length);
    return `
    <form class="toolbar" data-form="shopAdd">
      <input id="shopInput" placeholder="Agregar a la lista" autocomplete="off" enterkeyhint="done">
      <button class="btn" type="submit">Agregar</button>
    </form>
    ${low.length ? `<section class="panel suggest"><p><b>Se está acabando:</b> ${low.map((x) => esc(x.name)).join(", ")}</p><button class="btn btn-mint" data-act="addLow">Agregar al súper</button></section>` : ""}
    ${!S.shop.length ? `<div class="empty">${TOMATINA("happy", 100)}<p>Tu lista está vacía. Agrega cosas aquí o desde una receta con <b>Agregar lo que falta</b>.</p></div>` : ""}
    ${groups.map(([c, l]) => `
      <section class="group">
        <h2 class="gtitle"><span>${CAT_EMOJI[c]}</span>${c}</h2>
        <ul class="items">${l.map(shopRow).join("")}</ul>
      </section>`).join("")}
    ${done.length ? `
      <section class="group done-group">
        <h2 class="gtitle"><span>🧺</span>En el carrito (${done.length})</h2>
        <ul class="items">${done.map(shopRow).join("")}</ul>
        <button class="btn wide" data-act="toPantry">Guardar comprados en la despensa</button>
      </section>` : ""}
    ${S.shop.length ? `<div class="row end"><button class="btn btn-ghost" data-act="share">Compartir lista</button><button class="btn btn-ghost" data-act="clearShop">Vaciar lista</button></div>` : ""}`;
  }

  function shopRow(s) {
    return `
    <li class="item shop ${s.done ? "checked" : ""}">
      <label class="check">
        <input type="checkbox" data-act="toggleShop" data-id="${s.id}" ${s.done ? "checked" : ""}>
        <span class="box" aria-hidden="true"></span>
        <span class="iemoji">${esc(s.emoji)}</span>
        <span class="iname">${esc(s.name)}${s.src ? `<small>${esc(s.src)}</small>` : ""}</span>
      </label>
      <button class="qtybtn" data-act="shopQty" data-id="${s.id}" aria-label="Cambiar cantidad">${fmtQty(s.qty)} ${esc(s.unit)}</button>
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
        <input placeholder="${kind === "likes" ? "Ej. pollo, pasta, aguacate" : "Ej. hígado, brócoli"}" autocomplete="off">
        <button class="btn btn-small" type="submit">Agregar</button>
      </form>
    </section>`;
  }

  function viewGustos() {
    return `
    ${tagList("likes", "Lo que le encanta", "Las recetas con estos ingredientes salen primero.")}
    ${tagList("dislikes", "Lo que no le gusta", "Nunca te voy a sugerir recetas que los lleven.")}
    <section class="panel">
      <h2 class="h2">Alimentación</h2>
      <label class="switch"><input type="checkbox" data-act="pref" data-k="veg" ${S.prefs.veg ? "checked" : ""}><span></span>Solo vegetariano</label>
      <label class="switch"><input type="checkbox" data-act="pref" data-k="gf" ${S.prefs.gf ? "checked" : ""}><span></span>Sin gluten</label>
    </section>
    <section class="panel">
      <h2 class="h2">Ideas con IA (opcional)</h2>
      <p class="hint">Con una clave de API de Anthropic, la app inventa recetas nuevas con lo que tienes y tus gustos. La clave se guarda solo en este teléfono.</p>
      <form class="stack" data-form="ai">
        <input id="aiKey" type="password" placeholder="sk-ant-..." value="${esc(S.ai.key)}" autocomplete="off">
        <input id="aiModel" placeholder="Modelo" value="${esc(S.ai.model)}" autocomplete="off">
        <button class="btn btn-small" type="submit">Guardar clave</button>
      </form>
    </section>
    <section class="panel">
      <h2 class="h2">Respaldo</h2>
      <p class="hint">Todo se guarda en este teléfono. Descarga un respaldo para pasarlo a otro.</p>
      <div class="row wrap">
        <button class="btn btn-small" data-act="export">Descargar respaldo</button>
        <label class="btn btn-small btn-ghost">Cargar respaldo<input type="file" accept="application/json" data-act="import" hidden></label>
        <button class="btn btn-small btn-ghost" data-act="reset">Borrar todo</button>
      </div>
    </section>
    <p class="foot">${S.history.length ? `Has cocinado ${S.history.length} ${S.history.length === 1 ? "vez" : "veces"} con la app.` : ""}</p>`;
  }

  // ---------- Hojas (modales) ----------
  const sheet = $("#sheet"), sheetBody = $("#sheetBody");
  function openSheet(html) {
    sheetBody.innerHTML = html;
    if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", "");
    const f = sheetBody.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 50);
  }
  const closeSheet = () => { if (sheet.open) sheet.close(); };
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

  function getRecipe(id) { return RECIPES.find((r) => r.id === id) || (S.aiRecipes || []).find((r) => r.id === id); }

  function openRecipe(id) {
    const r = getRecipe(id); if (!r) return;
    const a = analyze(r);
    const haveKeys = new Set([...a.have, ...a.optHave].map((h) => h.k));
    openSheet(`
      <div class="sheet-head"><span class="bigemoji">${esc(r.e || "🍽️")}</span><div><h2>${esc(r.n)}</h2><p class="rmeta">${stars(a.req ? a.have.length / a.req : 1)} ${r.min} min</p></div></div>
      <h3>Ingredientes</h3>
      <ul class="ing">${r.i.map((x) => { const st = isStaple(x.k) || haveKeys.has(x.k); return `<li class="${st ? "ok" : x.opt ? "opt" : "no"}"><span aria-hidden="true">${st ? "✓" : x.opt ? "·" : "✗"}</span>${esc(x.t)}${x.opt ? " <small>(opcional)</small>" : ""}${!st && !x.opt ? " <small>te falta</small>" : ""}</li>`; }).join("")}</ul>
      <h3>Pasos</h3>
      <ol class="steps">${r.s.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <div class="sheet-actions">
        ${a.miss.length ? `<button class="btn btn-mint" data-act="missToShop" data-id="${esc(r.id)}">Agregar lo que falta al súper (${a.miss.length})</button>` : ""}
        <button class="btn" data-act="cook" data-id="${esc(r.id)}">Ya la cociné</button>
        <button class="btn btn-ghost" data-act="close">Cerrar</button>
      </div>`);
  }

  function openCook(id) {
    const r = getRecipe(id); const a = analyze(r);
    const used = [...a.have, ...a.optHave];
    if (!used.length) { logCook(r); closeSheet(); toast("¡Buen provecho!"); return; }
    openSheet(`
      <h2>¿Cuánto te quedó?</h2>
      <p class="hint">Ajusta lo que queda de cada ingrediente después de cocinar.</p>
      <form data-form="cook" data-id="${esc(r.id)}">
        <ul class="items">${used.map((h) => {
          const it = h.inv; const step = ["kg", "l"].includes(it.unit) ? 0.25 : ["g", "ml"].includes(it.unit) ? 100 : 1;
          const left = Math.max(0, it.qty - step);
          return `<li class="item"><span class="iemoji">${esc(it.emoji)}</span><span class="iname">${esc(it.name)}<small>tenías ${fmtQty(it.qty)} ${esc(it.unit)}</small></span>
            <span class="numwrap"><input type="number" inputmode="decimal" min="0" step="any" name="${it.id}" value="${fmtQty(left)}" aria-label="Queda de ${esc(it.name)}"><span>${esc(it.unit)}</span></span></li>`;
        }).join("")}</ul>
        <div class="sheet-actions"><button class="btn" type="submit">Actualizar despensa</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div>
      </form>`);
  }
  function logCook(r) { S.history.push({ id: r.id, t: Date.now() }); S.history = S.history.slice(-200); save(); }

  function openItemForm(it) {
    const isNew = !it;
    it = it || { name: "", qty: 1, unit: "pza", cat: "Otros", emoji: "", min: 0, exp: "" };
    openSheet(`
      <h2>${isNew ? "Agregar a la despensa" : "Editar"}</h2>
      ${isNew ? `<div class="quick" aria-label="Agregar rápido">${QUICK.map((q) => `<button type="button" class="qchip" data-act="quick" data-name="${esc(q[0])}" data-emoji="${q[1]}" data-cat="${esc(q[2])}">${q[1]} ${esc(q[0])}</button>`).join("")}</div>` : ""}
      <form class="stack" data-form="item" data-id="${isNew ? "" : it.id}">
        <label>Nombre<input name="name" required value="${esc(it.name)}" ${isNew ? "" : "autofocus"} autocomplete="off" placeholder="Ej. Pechuga de pollo"></label>
        <div class="row">
          <label class="grow">Cantidad<input name="qty" type="number" inputmode="decimal" min="0" step="any" value="${fmtQty(it.qty)}"></label>
          <label class="grow">Unidad<select name="unit">${UNITS.map((u) => `<option ${u === it.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label>
        </div>
        <label>Categoría<select name="cat">${CATS.map((c) => `<option ${c === it.cat ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <div class="row">
          <label class="grow">Avisar cuando queden<input name="min" type="number" inputmode="decimal" min="0" step="any" value="${fmtQty(it.min || 0)}"></label>
          <label class="grow">Caduca<input name="exp" type="date" value="${esc(it.exp || "")}"></label>
        </div>
        <input type="hidden" name="emoji" value="${esc(it.emoji)}">
        <div class="sheet-actions">
          <button class="btn" type="submit">${isNew ? "Agregar" : "Guardar"}</button>
          ${isNew ? "" : `<button class="btn btn-ghost" type="button" data-act="delInv" data-id="${it.id}">Eliminar</button>`}
          <button class="btn btn-ghost" type="button" data-act="close">Cancelar</button>
        </div>
      </form>`);
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
    toast("Pensando recetas…", 8000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": S.ai.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: S.ai.model || "claude-sonnet-5-5", max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status}`);
      const text = (data.content || []).map((c) => c.text || "").join("");
      const json = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
      const recs = json.filter((r) => r && r.n && Array.isArray(r.i) && Array.isArray(r.s)).map((r) => ({ id: "ai-" + uid(), n: String(r.n), e: r.e || "✨", min: Number(r.min) || 30, tags: Array.isArray(r.tags) ? r.tags : [], i: r.i.map((x) => ({ k: String(x.k || x.t || ""), t: String(x.t || x.k || ""), opt: !!x.opt })), s: r.s.map(String), ai: true }));
      if (!recs.length) throw new Error("La respuesta no traía recetas.");
      S.aiRecipes = recs.concat(S.aiRecipes || []).slice(0, 12);
      save(); render(); toast(`${recs.length} recetas nuevas de la IA`);
    } catch (e) {
      toast(`No se pudieron pedir ideas: ${e.message}. Revisa la clave en Gustos.`, 5000);
    }
  }

  // ---------- Toast ----------
  let tTimer;
  function toast(msg, ms = 2600, undo) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button id="undoBtn">Deshacer</button>` : ""}`;
    t.classList.add("show");
    if (undo) $("#undoBtn").onclick = () => { undo(); t.classList.remove("show"); };
    clearTimeout(tTimer); tTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "INPUT") return;
    const id = b.dataset.id, act = b.dataset.act;
    const it = S.inv.find((x) => x.id === id), sh = S.shop.find((x) => x.id === id);
    switch (act) {
      case "tab": S.ui.tab = b.dataset.tab; save(); render(); break;
      case "filter": { const k = b.dataset.k; S.ui.filters = S.ui.filters.includes(k) ? S.ui.filters.filter((f) => f !== k) : [...S.ui.filters, k]; save(); render(); break; }
      case "search": S.ui.query = $("#q").value; save(); render(); break;
      case "ai": S.ui.query = $("#q").value; save(); askAI(); break;
      case "open": openRecipe(id); break;
      case "fav": S.favs = S.favs.includes(id) ? S.favs.filter((f) => f !== id) : [...S.favs, id]; save(); render(); break;
      case "close": closeSheet(); break;
      case "missToShop": {
        const r = getRecipe(id); const a = analyze(r); let n = 0;
        a.miss.forEach((m) => { if (addShop({ name: cleanName(m.t), src: r.n })) n++; });
        save(); closeSheet(); render(); toast(n ? `${n} ${n === 1 ? "cosa agregada" : "cosas agregadas"} al súper` : "Ya estaba en tu lista"); break;
      }
      case "cook": openCook(id); break;
      case "addInv": openItemForm(); break;
      case "editInv": openItemForm(it); break;
      case "quick": { const f = sheetBody.querySelector('[data-form="item"]'); f.name.value = b.dataset.name; f.cat.value = b.dataset.cat; f.unit.value = QUICK_UNIT[b.dataset.name] || "pza"; f.emoji.value = b.dataset.emoji; f.qty.focus(); f.qty.select(); break; }
      case "inc": case "dec": {
        const step = Number(b.dataset.step) * (act === "inc" ? 1 : -1);
        it.qty = Math.max(0, Math.round((it.qty + step) * 100) / 100);
        if (act === "dec") checkLow(it);
        save(); render(); break;
      }
      case "delInv": { const copy = { ...it }; S.inv = S.inv.filter((x) => x.id !== id); save(); closeSheet(); render(); toast(`${copy.name} eliminado`, 4000, () => { S.inv.push(copy); save(); render(); }); break; }
      case "delShop": S.shop = S.shop.filter((x) => x.id !== id); save(); render(); break;
      case "shopQty": { const v = prompt(`Cantidad de ${sh.name} (${sh.unit})`, fmtQty(sh.qty)); if (v !== null && !isNaN(parseFloat(v))) { sh.qty = Math.max(0, parseFloat(v)); save(); render(); } break; }
      case "addLow": { let n = 0; lowStock().forEach((x) => { if (addShop({ name: x.name, unit: x.unit, cat: x.cat, emoji: x.emoji, src: "Se acabó" })) n++; }); save(); render(); toast(`${n} agregados al súper`); break; }
      case "toPantry": {
        const done = S.shop.filter((s) => s.done);
        done.forEach((s) => addInv({ name: s.name, qty: s.qty, unit: s.unit, cat: s.cat, emoji: s.emoji }));
        S.shop = S.shop.filter((s) => !s.done); save(); render(); toast(`${done.length} guardados en la despensa`); break;
      }
      case "clearShop": if (confirm("¿Vaciar toda la lista del súper?")) { S.shop = []; save(); render(); } break;
      case "share": {
        const txt = "Lista del súper\n" + S.shop.filter((s) => !s.done).map((s) => `• ${s.name} — ${fmtQty(s.qty)} ${s.unit}`).join("\n");
        if (navigator.share) navigator.share({ title: "Lista del súper", text: txt }).catch(() => {});
        else navigator.clipboard?.writeText(txt).then(() => toast("Lista copiada"));
        break;
      }
      case "delPref": S.prefs[b.dataset.kind].splice(Number(b.dataset.i), 1); save(); render(); break;
      case "export": {
        const blob = new Blob([JSON.stringify({ ...S, ai: { ...S.ai, key: "" } }, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cocina-mariana-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); break;
      }
      case "reset": if (confirm("Esto borra despensa, lista y gustos de este teléfono. ¿Continuar?")) { S = defaults(); save(); render(); } break;
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target, act = el.dataset.act;
    if (act === "toggleShop") { const s = S.shop.find((x) => x.id === el.dataset.id); s.done = el.checked; save(); render(); }
    if (act === "pref") { S.prefs[el.dataset.k] = el.checked; save(); }
    if (act === "import" && el.files[0]) {
      el.files[0].text().then((t) => { const d = JSON.parse(t); const key = S.ai.key; S = Object.assign(defaults(), d); S.ai.key = S.ai.key || key; save(); render(); toast("Respaldo cargado"); }).catch(() => toast("Ese archivo no es un respaldo válido"));
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "invSearch") {
      S.ui.invFilter = e.target.value; const pos = e.target.selectionStart; render();
      const n = $("#invSearch"); n.focus(); n.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "q") { e.preventDefault(); S.ui.query = e.target.value; save(); render(); } });

  document.addEventListener("submit", (e) => {
    const f = e.target; const kind = f.dataset.form; if (!kind) return;
    e.preventDefault();
    if (kind === "shopAdd") { const v = $("#shopInput").value; if (addShop({ name: v })) { save(); render(); $("#shopInput").focus(); } else if (v.trim()) toast("Eso ya está en la lista"); }
    if (kind === "pref") { const inp = f.querySelector("input"); const vals = inp.value.split(",").map((x) => x.trim()).filter(Boolean); const arr = S.prefs[f.dataset.kind]; vals.forEach((v) => { if (!arr.some((a) => canon(a) === canon(v))) arr.push(v); }); save(); render(); }
    if (kind === "ai") { S.ai.key = $("#aiKey").value.trim(); S.ai.model = $("#aiModel").value.trim() || "claude-sonnet-5-5"; save(); toast(S.ai.key ? "Clave guardada. Ya puedes pedir ideas en la pestaña Ideas." : "Clave borrada"); }
    if (kind === "item") {
      const fd = Object.fromEntries(new FormData(f));
      const data = { name: fd.name.trim(), qty: parseFloat(fd.qty) || 0, unit: fd.unit, cat: fd.cat, emoji: fd.emoji || guessEmoji(fd.name), min: parseFloat(fd.min) || 0, exp: fd.exp };
      if (f.dataset.id) { const it = S.inv.find((x) => x.id === f.dataset.id); Object.assign(it, data); checkLow(it); toast("Guardado"); }
      else { addInv(data); toast(`${data.name} agregado`); }
      save(); closeSheet(); render();
    }
    if (kind === "cook") {
      const r = getRecipe(f.dataset.id); const prev = JSON.parse(JSON.stringify(S.inv)); const prevShop = JSON.parse(JSON.stringify(S.shop));
      for (const [id, v] of new FormData(f)) { const it = S.inv.find((x) => x.id === id); if (it) { it.qty = Math.max(0, parseFloat(v) || 0); checkLow(it); } }
      logCook(r); save(); closeSheet(); render();
      toast("Despensa actualizada. ¡Buen provecho!", 4500, () => { S.inv = prev; S.shop = prevShop; S.history.pop(); save(); render(); });
    }
  });

  // ---------- Inicio ----------
  render();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
