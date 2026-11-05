/*
 * govee-lamp-card — commande du lampadaire Govee Uplighter (H60B0) comme dans l'app Govee Home.
 *
 * Zones, blancs, couleurs, anneau et débit : intégration locale ha-govee-uplighter (domaine
 * govee_uplighter), qui parle à la lampe par le réseau local, zone par zone :
 * - light.<l>                                   marche / arrêt, luminosité générale ;
 * - light.<l>_ondulante, _laterale, _inferieure  une lumière par zone (deux allumées au plus) ;
 * - number.<l>_debit                            vitesse des ondulations ;
 * - govee_uplighter.set_segments                les 8 segments de l'anneau (numérotés 1 à 8).
 * Scènes et musique : intégration cloud lasswellt/govee-homeassistant (domaine govee), facultative :
 * select.<c>_scene, select.<c>_snapshot, switch.<c>_music_mode, select.<c>_music_mode,
 * number.<c>_music_sensitivity.
 *
 * La lampe ne renvoie pas l'état de ses zones : la carte montre le dernier réglage envoyé.
 * JavaScript sans ?. ni ?? ni champs de classe, pour la WebView de l'Echo Show.
 */
const VERSION = "2.0.0";
const SEGMENTS = 8;
const ZONES = [
  { key: "ripple", suffix: "_ondulante", label: "Ondulante", icon: "M2,11C4,9 6,9 8,11C10,13 12,13 14,11C16,9 18,9 20,11L22,13V15L20,13C18,11 16,11 14,13C12,15 10,15 8,13C6,11 4,11 2,13V11M2,5C4,3 6,3 8,5C10,7 12,7 14,5C16,3 18,3 20,5L22,7V9L20,7C18,5 16,5 14,7C12,9 10,9 8,7C6,5 4,5 2,7V5M2,17C4,15 6,15 8,17C10,19 12,19 14,17C16,15 18,15 20,17L22,19V21L20,19C18,17 16,17 14,19C12,21 10,21 8,19C6,17 4,17 2,19V17Z" },
  { key: "side", suffix: "_laterale", label: "Latérale", icon: "M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z" },
  { key: "lower", suffix: "_inferieure", label: "Inférieure", icon: "M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z" },
];
const COLORS = [
  [255, 0, 0], [255, 128, 0], [255, 230, 0], [0, 220, 0],
  [0, 64, 255], [0, 230, 230], [150, 0, 255], [255, 255, 255],
];
const KELVIN_MIN = 2700, KELVIN_MAX = 6500;
const MUSIC_LABELS = {
  "DIY": "DIY", "Stippling": "Pointillé", "Hopping": "Sautillant", "Flowing Light": "Lumière fluide",
  "Luminous": "Lumineux", "Sprouting": "Bourgeonnant", "Rhythm": "Rythme", "Shiny": "Scintillant",
};
const ICONS = {
  power: "M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",
  sun: "M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z",
  flow: "M12,6V9L16,5L12,1V4A8,8 0 0,0 4,12C4,13.57 4.46,15.03 5.24,16.26L6.7,14.8C6.25,13.97 6,13 6,12A6,6 0 0,1 12,6M18.76,7.74L17.3,9.2C17.74,10.04 18,11 18,12A6,6 0 0,1 12,18V15L8,19L12,23V20A8,8 0 0,0 20,12C20,10.43 19.54,8.97 18.76,7.74Z",
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function rgbCss(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(c) {
  return "#" + c.map((v) => (v < 16 ? "0" : "") + v.toString(16)).join("");
}

function sameRgb(a, b) { return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

// Teinte d'affichage d'un blanc (même approximation que l'app Govee)
function kelvinRgb(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255;
  }
  return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

// Govee met des espaces insécables dans certains noms de scène
function clean(s) { return String(s).replace(/ /g, " "); }

// Part i d'un anneau découpé en 8, en partant du haut, dans le sens horaire
function arcPath(i, rOut, rIn) {
  const step = (2 * Math.PI) / SEGMENTS, gap = 0.025;
  const a0 = -Math.PI / 2 + i * step + gap, a1 = a0 + step - 2 * gap;
  const p = (r, a) => (100 + r * Math.cos(a)).toFixed(2) + " " + (100 + r * Math.sin(a)).toFixed(2);
  return "M" + p(rOut, a0) + " A" + rOut + " " + rOut + " 0 0 1 " + p(rOut, a1) +
    " L" + p(rIn, a1) + " A" + rIn + " " + rIn + " 0 0 0 " + p(rIn, a0) + "Z";
}

function svgIcon(d) { return '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg>'; }

function pctOf(attrs) { return attrs && attrs.brightness ? Math.max(1, Math.round(attrs.brightness / 2.55)) : 100; }

class GoveeLampCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "zones";
    this._zone = "ripple";
    this._selected = [];
    for (let i = 0; i < SEGMENTS; i++) this._selected.push(true);
    this._search = "";
    this._message = "";
    this._messageTimer = null;
    this._key = null;
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
  }

  setConfig(config) {
    if (!config || !config.local || config.local.indexOf("light.") !== 0) {
      throw new Error("Indiquer local: light.<lampadaire> (lumière principale de l'intégration Govee Uplighter)");
    }
    this._config = {
      local: config.local,
      lprefix: config.local.slice(6),
      // Intégration cloud, facultative : scènes et musique
      cprefix: config.entity && config.entity.indexOf("light.") === 0 ? config.entity.slice(6) : null,
      title: config.title != null ? config.title : null,
    };
    this._key = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    // Redessiner seulement quand une entité du lampadaire change, pas à chaque état de la maison
    const key = this._ids().map((id) => {
      const s = hass.states[id];
      return s ? s.state + JSON.stringify(s.attributes) : "";
    }).join("|");
    if (key === this._key) return;
    this._key = key;
    this._render();
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: "full", min_rows: 6 }; }
  static getStubConfig() { return { local: "light.lampadaire", entity: "light.salon_wave_lamp" }; }

  // --- Entités -------------------------------------------------------------

  _zoneId(key) {
    const z = ZONES.filter((x) => x.key === key)[0];
    return "light." + this._config.lprefix + z.suffix;
  }

  _flowId() { return "number." + this._config.lprefix + "_debit"; }

  _cloud(domain, suffix) { return this._config.cprefix ? domain + "." + this._config.cprefix + suffix : null; }

  _ids() {
    const ids = [this._config.local, this._flowId()];
    ZONES.forEach((z) => ids.push(this._zoneId(z.key)));
    [["select", "_scene"], ["select", "_snapshot"], ["switch", "_music_mode"], ["select", "_music_mode"],
      ["number", "_music_sensitivity"]].forEach((p) => { const id = this._cloud(p[0], p[1]); if (id) ids.push(id); });
    return ids;
  }

  _st(id) { return id ? this._hass.states[id] : undefined; }

  _on(id) { const s = this._st(id); return !!s && s.state === "on"; }

  _segments() {
    const s = this._st(this._zoneId("side"));
    const segs = s && Array.isArray(s.attributes.segments) ? s.attributes.segments : [];
    const out = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const g = segs[i] || {};
      const rgb = g.mode === "rgb" && g.rgb ? g.rgb : kelvinRgb(g.kelvin || 4000);
      out.push({ rgb: rgb, on: g.on !== false });
    }
    return out;
  }

  // --- Commandes -----------------------------------------------------------

  _call(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((err) => {
      this._toast("Commande refusée : " + ((err && err.message) || "erreur inconnue"));
    });
  }

  _toast(text) {
    this._message = text;
    if (this._messageTimer) clearTimeout(this._messageTimer);
    this._messageTimer = setTimeout(() => { this._message = ""; this._render(); }, 5000);
    this._render();
  }

  // L'intégration éteint d'elle-même la zone allumée depuis le plus longtemps s'il y en a déjà deux
  _toggleZone(key) {
    const id = this._zoneId(key);
    this._call("light", this._on(id) ? "turn_off" : "turn_on", { entity_id: id });
  }

  _selectedSegments() {
    const out = [];
    this._selected.forEach((sel, i) => { if (sel) out.push(i + 1); });
    if (!out.length) this._toast("Sélectionne au moins un segment de l'anneau.");
    return out;
  }

  _setColor(rgb) {
    if (this._zone === "side") {
      const segments = this._selectedSegments();
      if (segments.length) this._call("govee_uplighter", "set_segments", { entity_id: this._zoneId("side"), segments: segments, rgb_color: rgb });
      return;
    }
    this._call("light", "turn_on", { entity_id: this._zoneId(this._zone), rgb_color: rgb });
  }

  _setKelvin(k) {
    if (this._zone === "side") {
      const segments = this._selectedSegments();
      if (segments.length) this._call("govee_uplighter", "set_segments", { entity_id: this._zoneId("side"), segments: segments, color_temp_kelvin: k });
      return;
    }
    this._call("light", "turn_on", { entity_id: this._zoneId(this._zone), color_temp_kelvin: k });
  }

  // --- Événements ----------------------------------------------------------

  _onClick(ev) {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action, v = el.dataset.value;
    if (a === "tab") { this._tab = v; this._render(); }
    else if (a === "zone") { this._zone = v; this._tab = "zones"; this._render(); }
    else if (a === "toggle-zone") { ev.stopPropagation(); this._toggleZone(v); }
    else if (a === "power") {
      this._call("light", this._on(this._config.local) ? "turn_off" : "turn_on", { entity_id: this._config.local });
    }
    else if (a === "color") this._setColor(JSON.parse(v));
    else if (a === "segment") { const i = Number(v); this._selected[i] = !this._selected[i]; this._render(); }
    else if (a === "select-all") { this._selected = this._selected.map(() => true); this._render(); }
    else if (a === "invert") { this._selected = this._selected.map((s) => !s); this._render(); }
    else if (a === "scene" || a === "snapshot") {
      this._call("select", "select_option", { entity_id: this._cloud("select", a === "scene" ? "_scene" : "_snapshot"), option: v });
    }
    else if (a === "music-toggle") {
      const id = this._cloud("switch", "_music_mode");
      this._call("switch", this._on(id) ? "turn_off" : "turn_on", { entity_id: id });
    }
    else if (a === "music-mode") {
      this._call("select", "select_option", { entity_id: this._cloud("select", "_music_mode"), option: v });
    }
  }

  // Les curseurs n'envoient qu'au relâchement
  _onChange(ev) {
    const t = ev.target, a = t.dataset ? t.dataset.action : null, n = Number(t.value);
    if (a === "brightness") this._call("light", "turn_on", { entity_id: this._config.local, brightness_pct: n });
    else if (a === "zone-brightness") this._call("light", "turn_on", { entity_id: this._zoneId(this._zone), brightness_pct: n });
    else if (a === "kelvin") this._setKelvin(n);
    else if (a === "flow") this._call("number", "set_value", { entity_id: this._flowId(), value: n });
    else if (a === "picker") this._setColor(hexToRgb(t.value));
    else if (a === "sensitivity") this._call("number", "set_value", { entity_id: this._cloud("number", "_music_sensitivity"), value: n });
  }

  _onInput(ev) {
    const t = ev.target, a = t.dataset ? t.dataset.action : null;
    if (a === "search") {
      this._search = t.value;
      const grid = this.shadowRoot.getElementById("scenes");
      if (grid) grid.innerHTML = this._sceneButtons();
    } else if (a) {
      const out = this.shadowRoot.getElementById(a + "-value");
      if (out) out.textContent = t.value + (a === "kelvin" ? " K" : " %");
    }
  }

  // --- Rendu ---------------------------------------------------------------

  _render() {
    if (!this._hass || !this._config) return;
    const lamp = this._st(this._config.local);
    if (!lamp) {
      this.shadowRoot.innerHTML = "<style>" + STYLE + '</style><ha-card><div class="empty">Entité ' +
        esc(this._config.local) + " introuvable. L'intégration Govee Uplighter est-elle configurée ?</div></ha-card>";
      return;
    }
    const on = lamp.state === "on";
    const bri = pctOf(lamp.attributes);
    const title = this._config.title != null ? this._config.title : (lamp.attributes.friendly_name || "Lampadaire");
    // Garder la recherche active pendant un redessin
    const active = this.shadowRoot.activeElement;
    const searching = !!active && active.dataset && active.dataset.action === "search";

    let body = "";
    if (this._tab === "zones") body = this._zoneHtml();
    else if (this._tab === "scenes") body = this._scenesHtml();
    else body = this._musicHtml();
    const cloud = !!this._config.cprefix;

    this.shadowRoot.innerHTML = "<style>" + STYLE + "</style>" +
      '<ha-card class="' + (on ? "" : "off") + '">' +
      '<div class="head">' +
        '<div class="title">' + esc(title) + "</div>" +
        '<div role="button" class="power' + (on ? " on" : "") + '" data-action="power" title="Allumer / éteindre">' + svgIcon(ICONS.power) + "</div>" +
      "</div>" +
      this._slider("brightness", 1, 100, bri, " %", svgIcon(ICONS.sun), "Luminosité générale", "bright") +
      '<div class="zones">' + ZONES.map((z) => this._zoneTile(z)).join("") + "</div>" +
      (this._message ? '<div class="toast">' + esc(this._message) + "</div>" : "") +
      (cloud ? '<div class="tabs">' + this._tabBtn("zones", "Réglages") + this._tabBtn("scenes", "Scènes") +
        this._tabBtn("music", "Musique") + "</div>" : "") +
      '<div class="body">' + body + "</div>" +
      "</ha-card>";

    if (searching) {
      const input = this.shadowRoot.querySelector('[data-action="search"]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  }

  _slider(action, min, max, value, unit, icon, label, cls) {
    return '<label class="slider ' + (cls || "") + '">' + (icon ? '<span class="ico">' + icon + "</span>" : "") +
      '<input type="range" min="' + min + '" max="' + max + '" step="' + (action === "kelvin" ? 100 : 1) + '" value="' + value +
      '" data-action="' + action + '" aria-label="' + esc(label) + '">' +
      '<output id="' + action + '-value">' + value + unit + "</output></label>";
  }

  _tabBtn(key, label) {
    return '<div role="button" class="tab' + (this._tab === key ? " active" : "") + '" data-action="tab" data-value="' + key + '">' + label + "</div>";
  }

  _zoneTile(z) {
    const lit = this._on(this._zoneId(z.key));
    const current = this._tab === "zones" && this._zone === z.key;
    return '<div role="button" class="zone' + (current ? " current" : "") + (lit ? " lit" : "") + '" data-action="zone" data-value="' + z.key + '">' +
      '<div role="button" class="switch' + (lit ? " on" : "") + '" data-action="toggle-zone" data-value="' + z.key + '"><span></span></div>' +
      '<div class="zname">' + svgIcon(z.icon) + z.label + "</div></div>";
  }

  _palette(current) {
    return '<div class="label">Couleurs</div><div class="palette">' +
      COLORS.map((c) => '<div role="button" class="swatch' + (sameRgb(c, current) ? " current" : "") +
        '" style="background:' + rgbCss(c) + '" data-action="color" data-value="' + JSON.stringify(c) + '"></div>').join("") +
      '<label class="swatch picker" title="Autre couleur"><input type="color" value="' + rgbToHex(current || [255, 160, 60]) + '" data-action="picker"></label></div>';
  }

  _zoneHtml() {
    const st = this._st(this._zoneId(this._zone));
    if (!st) return '<div class="hint">Entité ' + esc(this._zoneId(this._zone)) + " introuvable.</div>";
    const a = st.attributes;
    const zoneBri = this._slider("zone-brightness", 1, 100, pctOf(a), " %", "", "Luminosité de la zone");
    const kelvin = a.color_temp_kelvin || 4000;
    const white = '<div class="label">Blanc</div>' + this._slider("kelvin", KELVIN_MIN, KELVIN_MAX, kelvin, " K", "", "Température de blanc", "kelvin");
    const off = st.state !== "on" ? '<div class="hint">Zone éteinte : un réglage l\'allume.</div>' : "";

    if (this._zone === "side") {
      const segs = this._segments();
      const paths = segs.map((g, i) => '<path d="' + arcPath(i, 92, 56) + '" fill="' + rgbCss(g.rgb) + '" class="seg' +
        (this._selected[i] ? " sel" : "") + (g.on ? "" : " dark") + '" data-action="segment" data-value="' + i + '"/>').join("");
      const count = this._selected.filter((s) => s).length;
      return '<div class="side">' +
        '<svg class="donut" viewBox="0 0 200 200">' + paths + '<text x="100" y="106" text-anchor="middle">' + count + " / " + SEGMENTS + "</text></svg>" +
        '<div class="side-tools">' +
          '<div class="links"><div role="button" class="link" data-action="select-all">Tout sélectionner</div>' +
          '<div role="button" class="link" data-action="invert">Inverser la sélection</div></div>' +
          this._palette(null) +
          '<div class="label">Blanc des segments choisis</div>' + this._slider("kelvin", KELVIN_MIN, KELVIN_MAX, kelvin, " K", "", "Blanc", "kelvin") +
          '<div class="label">Luminosité de l\'anneau</div>' + zoneBri + off +
        "</div></div>";
    }
    if (this._zone === "lower") {
      return '<div class="panel">' + white + '<div class="label">Luminosité</div>' + zoneBri + off + "</div>";
    }
    const flow = this._st(this._flowId());
    const flowValue = flow ? Math.round(Number(flow.state)) || 0 : 0;
    const rgb = a.color_mode === "rgb" ? a.rgb_color : null;
    return '<div class="panel">' + this._palette(rgb) + white +
      '<div class="label">Luminosité</div>' + zoneBri +
      (flow ? '<div class="label">Débit des ondulations</div>' + this._slider("flow", 0, 100, flowValue, " %", svgIcon(ICONS.flow), "Débit") : "") +
      off + "</div>";
  }

  _sceneButtons() {
    const s = this._st(this._cloud("select", "_scene"));
    if (!s) return '<div class="hint">Sélecteur de scènes absent : activez-le dans les options de l\'intégration Govee.</div>';
    const q = clean(this._search).trim().toLowerCase();
    const opts = (s.attributes.options || []).filter((o) => o !== "None" && (!q || clean(o).toLowerCase().indexOf(q) >= 0));
    if (!opts.length) return '<div class="hint">Aucune scène ne correspond.</div>';
    return opts.map((o) => '<div role="button" class="chip' + (o === s.state ? " current" : "") +
      '" data-action="scene" data-value="' + esc(o) + '">' + esc(clean(o)) + "</div>").join("");
  }

  _scenesHtml() {
    const snap = this._st(this._cloud("select", "_snapshot"));
    const snaps = snap ? (snap.attributes.options || []).filter((o) => o !== "None") : [];
    return '<div class="panel">' +
      (snaps.length ? '<div class="label">Mes instantanés</div><div class="chips">' +
        snaps.map((o) => '<div role="button" class="chip mine" data-action="snapshot" data-value="' + esc(o) + '">' + esc(clean(o)) + "</div>").join("") +
        "</div>" : "") +
      '<input class="search" type="search" placeholder="Rechercher une scène…" value="' + esc(this._search) + '" data-action="search">' +
      '<div class="chips scroll" id="scenes">' + this._sceneButtons() + "</div>" +
      '<div class="hint">Après une scène, l\'état des zones affiché ici n\'est plus à jour : refaites un réglage pour le recaler.</div></div>';
  }

  _musicHtml() {
    const sw = this._cloud("switch", "_music_mode");
    const sel = this._st(this._cloud("select", "_music_mode"));
    const sens = this._st(this._cloud("number", "_music_sensitivity"));
    if (!sel) return '<div class="panel"><div class="hint">Mode musique indisponible pour cette lampe.</div></div>';
    const on = this._on(sw);
    const value = sens ? Math.round(Number(sens.state)) || 50 : 50;
    return '<div class="panel">' +
      '<div class="row"><div class="label">Réagir au son (micro de la lampe)</div>' +
        '<div role="button" class="switch' + (on ? " on" : "") + '" data-action="music-toggle"><span></span></div></div>' +
      '<div class="chips">' + (sel.attributes.options || []).map((o) => '<div role="button" class="chip' +
        (on && o === sel.state ? " current" : "") + '" data-action="music-mode" data-value="' + esc(o) + '">' +
        esc(MUSIC_LABELS[o] || o) + "</div>").join("") + "</div>" +
      (sens ? '<div class="label">Sensibilité</div>' + this._slider("sensitivity", 0, 100, value, " %", "", "Sensibilité") : "") +
      "</div>";
  }
}

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; box-sizing: border-box; }
  ha-card.off .zones, ha-card.off .body { opacity: .45; }
  svg { width: 20px; height: 20px; fill: currentColor; flex: none; }
  [role="button"] { cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; }
  .empty { padding: 8px; color: var(--secondary-text-color); }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .title { flex: 1; font-size: 20px; font-weight: 500; }
  .power { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: var(--secondary-background-color, rgba(127,127,127,.15)); color: var(--secondary-text-color); }
  .power svg { width: 26px; height: 26px; }
  .power.on { background: var(--primary-color, #03a9f4); color: #fff; }
  .slider { display: flex; align-items: center; gap: 10px; margin: 4px 0 10px; }
  .slider input { flex: 1; height: 36px; margin: 0; accent-color: var(--primary-color, #03a9f4); }
  .slider output { min-width: 58px; text-align: right; font-variant-numeric: tabular-nums; color: var(--secondary-text-color); }
  .slider .ico { display: flex; color: var(--secondary-text-color); }
  .bright .ico { color: #f5c518; }
  .kelvin input { -webkit-appearance: none; appearance: none; height: 14px; border-radius: 7px;
    background: linear-gradient(90deg, #ff9a2e, #ffe2b8 45%, #ffffff 60%, #cfe0ff); }
  .kelvin input::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; border-radius: 50%;
    background: #fff; border: 3px solid var(--primary-color, #03a9f4); box-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .zones { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .zone { border-radius: 14px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 10px;
    background: var(--secondary-background-color, rgba(127,127,127,.12)); border: 2px solid transparent; }
  .zone.current { border-color: var(--primary-color, #03a9f4); }
  .zname { display: flex; align-items: center; gap: 6px; font-size: 15px; color: var(--secondary-text-color); }
  .zone.lit .zname { color: var(--primary-text-color); }
  .zone.lit .zname svg { color: var(--primary-color, #03a9f4); }
  .switch { width: 56px; height: 32px; border-radius: 16px; background: rgba(127,127,127,.4); position: relative; flex: none; }
  .switch span { position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff;
    transition: left .2s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
  .switch.on { background: var(--primary-color, #03a9f4); }
  .switch.on span { left: 27px; }
  .tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.3)); margin-bottom: 12px; }
  .tab { padding: 10px 14px; font-size: 15px; color: var(--secondary-text-color); border-bottom: 3px solid transparent; }
  .tab.active { color: var(--primary-color, #03a9f4); border-bottom-color: var(--primary-color, #03a9f4); }
  .label { font-size: 14px; color: var(--secondary-text-color); margin: 6px 0; }
  .palette { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
  .swatch { width: 44px; height: 44px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); box-sizing: border-box; }
  .swatch.current { box-shadow: 0 0 0 3px var(--card-background-color, #1c1c1c), 0 0 0 5px var(--primary-color, #03a9f4); }
  .picker { position: relative; overflow: hidden;
    background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
  .picker input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
  .hint { font-size: 13px; color: var(--secondary-text-color); line-height: 1.4; margin-top: 6px; }
  .side { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .donut { width: 200px; height: 200px; flex: none; }
  .seg { stroke: var(--card-background-color, #1c1c1c); stroke-width: 2; cursor: pointer; opacity: .45; }
  .seg.sel { opacity: 1; stroke: var(--primary-text-color, #fff); stroke-width: 3; }
  .seg.dark { fill: #333; }
  .donut text { fill: var(--secondary-text-color); font-size: 18px; }
  .side-tools { flex: 1; min-width: 220px; }
  .links { display: flex; gap: 16px; margin-bottom: 6px; }
  .link { color: var(--primary-color, #03a9f4); font-size: 14px; padding: 6px 0; }
  .search { width: 100%; box-sizing: border-box; height: 42px; border-radius: 21px; border: 1px solid var(--divider-color, rgba(127,127,127,.4));
    background: transparent; color: var(--primary-text-color); padding: 0 16px; font-size: 15px; margin: 4px 0 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chips.scroll { max-height: 260px; overflow-y: auto; }
  .chip { padding: 10px 14px; border-radius: 18px; font-size: 14px; background: var(--secondary-background-color, rgba(127,127,127,.15)); }
  .chip.current { background: var(--primary-color, #03a9f4); color: #fff; }
  .chip.mine { border: 1px solid var(--primary-color, #03a9f4); }
  .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .toast { margin: 0 0 12px; padding: 12px 14px; border-radius: 10px; font-size: 14px;
    background: var(--warning-color, #ff9800); color: #000; }
`;

// Home Assistant remplace customElements en démarrant. Une carte enregistrée avant ce
// remplacement reste invisible ("Erreur de configuration") : fréquent sur un appareil lent.
function registerCard() {
  if (!customElements.get("home-assistant")) {
    setTimeout(registerCard, 50);
    return;
  }
  if (!customElements.get("govee-lamp-card")) {
    customElements.define("govee-lamp-card", GoveeLampCard);
    console.info("%c govee-lamp-card %c " + VERSION, "background:#7c4dff;color:#fff", "");
  }
}
registerCard();

window.customCards = window.customCards || [];
window.customCards.push({
  type: "govee-lamp-card",
  name: "Lampadaire Govee",
  description: "Zones, blancs, couleurs, anneau segmenté, débit, scènes et musique d'un lampadaire Govee Uplighter.",
});
