/*
 * govee-lamp-card — commande du lampadaire Govee Uplighter (H60B0) comme dans l'app Govee Home.
 *
 * S'appuie sur l'intégration lasswellt/govee-homeassistant (domaine govee) :
 * - light.<p>                      allumage, luminosité, couleur, blanc ;
 * - switch.<p>_{ripple,side,bottom}_light   les trois zones (deux au plus à la fois) ;
 * - govee.set_segment_color        les 8 segments de l'anneau latéral (index 0 à 7) ;
 * - select.<p>_scene, select.<p>_snapshot   scènes Govee et instantanés ;
 * - switch.<p>_music_mode, select.<p>_music_mode, number.<p>_music_sensitivity.
 *
 * Constaté sur le H60B0 (photos du 2026-11-05) :
 * - une couleur RVB colore l'ondulation ET l'anneau latéral, jamais la lampe du bas ;
 * - un blanc (température) s'applique à l'ondulation et au bas ;
 * - les segments ne touchent que l'anneau latéral.
 * Govee ne renvoie ni l'état des zones ni la couleur des segments : la carte affiche la
 * dernière commande connue. Les couleurs de l'anneau sont mémorisées dans le navigateur.
 *
 * JavaScript sans ?. ni ?? ni champs de classe, pour la WebView de l'Echo Show.
 */
const VERSION = "1.0.0";
const SEGMENTS = 8;
const ZONES = [
  { key: "ripple", label: "Ondulante", icon: "M2,11C4,9 6,9 8,11C10,13 12,13 14,11C16,9 18,9 20,11L22,13V15L20,13C18,11 16,11 14,13C12,15 10,15 8,13C6,11 4,11 2,13V11M2,5C4,3 6,3 8,5C10,7 12,7 14,5C16,3 18,3 20,5L22,7V9L20,7C18,5 16,5 14,7C12,9 10,9 8,7C6,5 4,5 2,7V5M2,17C4,15 6,15 8,17C10,19 12,19 14,17C16,15 18,15 20,17L22,19V21L20,19C18,17 16,17 14,19C12,21 10,21 8,19C6,17 4,17 2,19V17Z" },
  { key: "side", label: "Latérale", icon: "M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z" },
  { key: "bottom", label: "Inférieure", icon: "M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z" },
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
    this._ring = null;
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
  }

  setConfig(config) {
    if (!config || !config.entity || config.entity.indexOf("light.") !== 0) {
      throw new Error("Indiquer entity: light.<lampadaire> (lumière principale de l'intégration Govee)");
    }
    this._config = {
      entity: config.entity,
      prefix: config.entity.slice(6),
      title: config.title != null ? config.title : null,
    };
    this._ring = null;
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
  static getStubConfig() { return { entity: "light.salon_wave_lamp" }; }

  // --- Entités -------------------------------------------------------------

  _id(domain, suffix) { return domain + "." + this._config.prefix + (suffix || ""); }

  _ids() {
    const ids = [this._config.entity, this._id("select", "_scene"), this._id("select", "_snapshot"),
      this._id("switch", "_music_mode"), this._id("select", "_music_mode"), this._id("number", "_music_sensitivity")];
    ZONES.forEach((z) => ids.push(this._id("switch", "_" + z.key + "_light")));
    for (let i = 1; i <= SEGMENTS; i++) ids.push(this._id("light", "_segment_" + i));
    return ids;
  }

  _st(id) { return this._hass.states[id]; }

  _on(id) { const s = this._st(id); return !!s && s.state === "on"; }

  _deviceId() {
    const reg = this._hass.entities && this._hass.entities[this._config.entity];
    return reg ? reg.device_id : null;
  }

  // Couleurs de l'anneau : mémoire du navigateur, sinon les entités segment de l'intégration
  _ringColors() {
    if (this._ring) return this._ring;
    let ring = null;
    try { ring = JSON.parse(localStorage.getItem("govee-lamp-card:" + this._config.entity)); } catch (e) { ring = null; }
    if (!Array.isArray(ring) || ring.length !== SEGMENTS) {
      ring = [];
      for (let i = 1; i <= SEGMENTS; i++) {
        const s = this._st(this._id("light", "_segment_" + i));
        ring.push(s && s.attributes.rgb_color ? s.attributes.rgb_color.slice(0, 3) : [255, 255, 255]);
      }
    }
    this._ring = ring;
    return ring;
  }

  _saveRing(ring) {
    this._ring = ring;
    try { localStorage.setItem("govee-lamp-card:" + this._config.entity, JSON.stringify(ring)); } catch (e) { /* navigation privée */ }
  }

  // --- Commandes -----------------------------------------------------------

  _call(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((err) => {
      this._toast("Commande refusée : " + ((err && err.message) || "erreur inconnue"));
      throw err;
    });
  }

  _toast(text) {
    this._message = text;
    if (this._messageTimer) clearTimeout(this._messageTimer);
    this._messageTimer = setTimeout(() => { this._message = ""; this._render(); }, 5000);
    this._render();
  }

  _toggleZone(key) {
    const id = this._id("switch", "_" + key + "_light");
    if (this._on(id)) return this._call("switch", "turn_off", { entity_id: id });
    const lit = ZONES.filter((z) => z.key !== key && this._on(this._id("switch", "_" + z.key + "_light")));
    if (lit.length >= 2) {
      this._toast("Deux zones au plus : éteins d'abord « " + lit[0].label + " » ou « " + lit[1].label + " ».");
      return null;
    }
    const p = this._on(this._config.entity) ? Promise.resolve() : this._call("light", "turn_on", { entity_id: this._config.entity });
    return p.then(() => this._call("switch", "turn_on", { entity_id: id }));
  }

  _setColor(rgb) {
    if (this._zone === "side") {
      const segments = [];
      this._selected.forEach((sel, i) => { if (sel) segments.push(i); });
      if (!segments.length) { this._toast("Sélectionne au moins un segment de l'anneau."); return; }
      const deviceId = this._deviceId();
      if (!deviceId) { this._toast("Appareil Govee introuvable pour " + this._config.entity + "."); return; }
      this._call("govee", "set_segment_color", { device_id: deviceId, segments: segments, rgb_color: rgb }).then(() => {
        const ring = this._ringColors().slice();
        segments.forEach((i) => { ring[i] = rgb; });
        this._saveRing(ring);
        this._render();
      }).catch(() => {});
      return;
    }
    // Une couleur globale recolore aussi l'anneau latéral (constaté sur le H60B0)
    this._call("light", "turn_on", { entity_id: this._config.entity, rgb_color: rgb }).then(() => {
      const ring = [];
      for (let i = 0; i < SEGMENTS; i++) ring.push(rgb);
      this._saveRing(ring);
      this._render();
    }).catch(() => {});
  }

  // --- Événements ----------------------------------------------------------

  _onClick(ev) {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action, v = el.dataset.value;
    if (a === "tab") { this._tab = v; this._render(); }
    else if (a === "zone") { this._zone = v; this._render(); }
    else if (a === "toggle-zone") { ev.stopPropagation(); this._toggleZone(v); }
    else if (a === "power") {
      this._call("light", this._on(this._config.entity) ? "turn_off" : "turn_on", { entity_id: this._config.entity }).catch(() => {});
    }
    else if (a === "color") this._setColor(JSON.parse(v));
    else if (a === "segment") { const i = Number(v); this._selected[i] = !this._selected[i]; this._render(); }
    else if (a === "select-all") { this._selected = this._selected.map(() => true); this._render(); }
    else if (a === "invert") { this._selected = this._selected.map((s) => !s); this._render(); }
    else if (a === "scene" || a === "snapshot") {
      const id = this._id("select", a === "scene" ? "_scene" : "_snapshot");
      this._call("select", "select_option", { entity_id: id, option: v }).catch(() => {});
    }
    else if (a === "music-toggle") {
      const id = this._id("switch", "_music_mode");
      this._call("switch", this._on(id) ? "turn_off" : "turn_on", { entity_id: id }).catch(() => {});
    }
    else if (a === "music-mode") {
      this._call("select", "select_option", { entity_id: this._id("select", "_music_mode"), option: v }).catch(() => {});
    }
  }

  // Les curseurs n'envoient qu'au relâchement : la lampe accepte 2 commandes par seconde
  _onChange(ev) {
    const t = ev.target, a = t.dataset ? t.dataset.action : null;
    if (a === "brightness") {
      this._call("light", "turn_on", { entity_id: this._config.entity, brightness_pct: Number(t.value) }).catch(() => {});
    } else if (a === "kelvin") {
      this._call("light", "turn_on", { entity_id: this._config.entity, color_temp_kelvin: Number(t.value) }).catch(() => {});
    } else if (a === "picker") {
      this._setColor(hexToRgb(t.value));
    } else if (a === "sensitivity") {
      this._call("number", "set_value", { entity_id: this._id("number", "_music_sensitivity"), value: Number(t.value) }).catch(() => {});
    }
  }

  _onInput(ev) {
    const t = ev.target, a = t.dataset ? t.dataset.action : null;
    if (a === "search") {
      this._search = t.value;
      const grid = this.shadowRoot.getElementById("scenes");
      if (grid) grid.innerHTML = this._sceneButtons();
    } else if (a === "brightness" || a === "kelvin" || a === "sensitivity") {
      const out = this.shadowRoot.getElementById(a + "-value");
      if (out) out.textContent = t.value + (a === "kelvin" ? " K" : " %");
    }
  }

  // --- Rendu ---------------------------------------------------------------

  _render() {
    if (!this._hass || !this._config) return;
    const light = this._st(this._config.entity);
    if (!light) {
      this.shadowRoot.innerHTML = "<style>" + STYLE + '</style><ha-card><div class="empty">Entité ' +
        esc(this._config.entity) + " introuvable. L'intégration Govee est-elle chargée ?</div></ha-card>";
      return;
    }
    const on = light.state === "on";
    const bri = light.attributes.brightness ? Math.max(1, Math.round(light.attributes.brightness / 2.55)) : 100;
    const title = this._config.title != null ? this._config.title : (light.attributes.friendly_name || "Lampadaire");
    // Garder la recherche active pendant un redessin
    const active = this.shadowRoot.activeElement;
    const searching = !!active && active.dataset && active.dataset.action === "search";

    let body = "";
    if (this._tab === "zones") body = this._zonesHtml(light);
    else if (this._tab === "scenes") body = this._scenesHtml();
    else body = this._musicHtml();

    this.shadowRoot.innerHTML = "<style>" + STYLE + "</style>" +
      '<ha-card class="' + (on ? "" : "off") + '">' +
      '<div class="head">' +
        '<div class="title">' + esc(title) + "</div>" +
        '<div role="button" class="power' + (on ? " on" : "") + '" data-action="power" title="Allumer / éteindre">' + svgIcon(ICONS.power) + "</div>" +
      "</div>" +
      '<label class="slider bright"><span class="ico">' + svgIcon(ICONS.sun) + "</span>" +
        '<input type="range" min="1" max="100" value="' + bri + '" data-action="brightness" aria-label="Luminosité">' +
        '<output id="brightness-value">' + bri + " %</output></label>" +
      '<div class="zones">' + ZONES.map((z) => this._zoneTile(z)).join("") + "</div>" +
      (this._message ? '<div class="toast">' + esc(this._message) + "</div>" : "") +
      '<div class="tabs">' +
        this._tabBtn("zones", "Réglages") + this._tabBtn("scenes", "Scènes") + this._tabBtn("music", "Musique") +
      "</div>" +
      '<div class="body">' + body + "</div>" +
      "</ha-card>";

    if (searching) {
      const input = this.shadowRoot.querySelector('[data-action="search"]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  }

  _tabBtn(key, label) {
    return '<div role="button" class="tab' + (this._tab === key ? " active" : "") + '" data-action="tab" data-value="' + key + '">' + label + "</div>";
  }

  _zoneTile(z) {
    const lit = this._on(this._id("switch", "_" + z.key + "_light"));
    const current = this._tab === "zones" && this._zone === z.key;
    return '<div role="button" class="zone' + (current ? " current" : "") + (lit ? " lit" : "") + '" data-action="zone" data-value="' + z.key + '">' +
      '<div role="button" class="switch' + (lit ? " on" : "") + '" data-action="toggle-zone" data-value="' + z.key + '"><span></span></div>' +
      '<div class="zname">' + svgIcon(z.icon) + z.label + "</div></div>";
  }

  _zonesHtml(light) {
    if (this._tab === "zones" && !this._zone) this._zone = "ripple";
    const kelvin = light.attributes.color_temp_kelvin || 4000;
    const kelvinSlider = '<div class="label">Température de couleur</div>' +
      '<label class="slider kelvin"><input type="range" min="' + KELVIN_MIN + '" max="' + KELVIN_MAX + '" step="100" value="' + kelvin +
      '" data-action="kelvin" aria-label="Température de couleur"><output id="kelvin-value">' + kelvin + " K</output></label>";
    const palette = (current) => '<div class="label">Couleurs</div><div class="palette">' +
      COLORS.map((c) => '<div role="button" class="swatch' + (sameRgb(c, current) ? " current" : "") +
        '" style="background:' + rgbCss(c) + '" data-action="color" data-value="' + JSON.stringify(c) + '"></div>').join("") +
      '<label class="swatch picker" title="Autre couleur"><input type="color" value="' + rgbToHex(current || [255, 160, 60]) + '" data-action="picker"></label></div>';

    if (this._zone === "side") {
      const ring = this._ringColors();
      const paths = ring.map((c, i) => '<path d="' + arcPath(i, 92, 56) + '" fill="' + rgbCss(c) + '" class="seg' +
        (this._selected[i] ? " sel" : "") + '" data-action="segment" data-value="' + i + '"/>').join("");
      const count = this._selected.filter((s) => s).length;
      return '<div class="side">' +
        '<svg class="donut" viewBox="0 0 200 200">' + paths + '<text x="100" y="106" text-anchor="middle">' + count + " / " + SEGMENTS + "</text></svg>" +
        '<div class="side-tools">' +
          '<div class="links"><div role="button" class="link" data-action="select-all">Tout sélectionner</div>' +
          '<div role="button" class="link" data-action="invert">Inverser la sélection</div></div>' +
          palette(null) +
          '<div class="hint">Touchez les segments à colorer. Une couleur choisie dans « Ondulante » recolore tout l\'anneau.</div>' +
        "</div></div>";
    }
    if (this._zone === "bottom") {
      return '<div class="panel">' + kelvinSlider +
        '<div class="hint">La lampe du bas n\'a que du blanc. Sa température est partagée avec le blanc de l\'ondulation.</div></div>';
    }
    const rgb = light.attributes.color_mode === "rgb" ? light.attributes.rgb_color : null;
    return '<div class="panel">' + palette(rgb) + kelvinSlider +
      '<div class="hint">Une couleur s\'applique aussi à l\'anneau latéral ; ajustez-le ensuite dans « Latérale ». Le débit des ondulations ne se règle que dans l\'app Govee.</div></div>';
  }

  _sceneButtons() {
    const s = this._st(this._id("select", "_scene"));
    if (!s) return '<div class="hint">Sélecteur de scènes absent : activez-le dans les options de l\'intégration Govee.</div>';
    const q = clean(this._search).trim().toLowerCase();
    const opts = (s.attributes.options || []).filter((o) => o !== "None" && (!q || clean(o).toLowerCase().indexOf(q) >= 0));
    if (!opts.length) return '<div class="hint">Aucune scène ne correspond.</div>';
    return opts.map((o) => '<div role="button" class="chip' + (o === s.state ? " current" : "") +
      '" data-action="scene" data-value="' + esc(o) + '">' + esc(clean(o)) + "</div>").join("");
  }

  _scenesHtml() {
    const snap = this._st(this._id("select", "_snapshot"));
    const snaps = snap ? (snap.attributes.options || []).filter((o) => o !== "None") : [];
    return '<div class="panel">' +
      (snaps.length ? '<div class="label">Mes instantanés</div><div class="chips">' +
        snaps.map((o) => '<div role="button" class="chip mine" data-action="snapshot" data-value="' + esc(o) + '">' + esc(clean(o)) + "</div>").join("") +
        "</div>" : "") +
      '<input class="search" type="search" placeholder="Rechercher une scène…" value="' + esc(this._search) + '" data-action="search">' +
      '<div class="chips scroll" id="scenes">' + this._sceneButtons() + "</div></div>";
  }

  _musicHtml() {
    const sw = this._id("switch", "_music_mode");
    const sel = this._st(this._id("select", "_music_mode"));
    const sens = this._st(this._id("number", "_music_sensitivity"));
    if (!sel) return '<div class="panel"><div class="hint">Mode musique indisponible pour cette lampe.</div></div>';
    const on = this._on(sw);
    const value = sens ? Math.round(Number(sens.state)) || 50 : 50;
    return '<div class="panel">' +
      '<div class="row"><div class="label">Réagir au son (micro de la lampe)</div>' +
        '<div role="button" class="switch' + (on ? " on" : "") + '" data-action="music-toggle"><span></span></div></div>' +
      '<div class="chips">' + (sel.attributes.options || []).map((o) => '<div role="button" class="chip' +
        (on && o === sel.state ? " current" : "") + '" data-action="music-mode" data-value="' + esc(o) + '">' +
        esc(MUSIC_LABELS[o] || o) + "</div>").join("") + "</div>" +
      (sens ? '<div class="label">Sensibilité</div><label class="slider"><input type="range" min="0" max="100" value="' + value +
        '" data-action="sensitivity" aria-label="Sensibilité"><output id="sensitivity-value">' + value + " %</output></label>" : "") +
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
  .bright .ico { color: #f5c518; display: flex; }
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
  description: "Zones, couleurs, anneau segmenté, scènes et musique d'un lampadaire Govee Uplighter.",
});
