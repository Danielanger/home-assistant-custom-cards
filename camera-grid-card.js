/*
 * Camera Grid Card for Home Assistant
 * Version 1.2.0
 *
 * Configurable camera grid. Supports webrtc, picture-entity, picture-elements (PTZ).
 * Card type: custom:camera-grid-card
 */
const CAMERA_GRID_CARD_VERSION = "1.2.0";

class CameraGridCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._generatedCard = undefined;
    this._renderToken = 0;
  }

  static getConfigElement() { return document.createElement("camera-grid-card-editor"); }

  static getStubConfig() {
    return { columns: 2, square: false, cameras: [{ type: "picture-entity", entity: "", camera_view: "auto" }] };
  }

  set hass(hass) { this._hass = hass; if (this._generatedCard) this._generatedCard.hass = hass; }

  setConfig(config) {
    if (!config) throw new Error("Konfiguration fehlt.");
    this._config = { columns: 2, square: false, cameras: [], ...JSON.parse(JSON.stringify(config)) };
    if (!Array.isArray(this._config.cameras)) this._config.cameras = [];
    this._buildCard();
  }

  getCardSize() {
    const cols = Math.max(1, this._config.columns || 2);
    return Math.max(2, Math.ceil((this._config.cameras?.length || 0) / cols) * 3);
  }

  async _buildCard() {
    const token = ++this._renderToken;
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = "<div id='host'></div>";
    const host = this.shadowRoot.getElementById("host");
    try {
      if (typeof window.loadCardHelpers !== "function") throw new Error("Card Helpers nicht verfügbar.");
      const helpers = await window.loadCardHelpers();
      if (token !== this._renderToken) return;
      const card = await helpers.createCardElement(this._buildGridConfig());
      if (token !== this._renderToken) return;
      host.replaceChildren(card);
      this._generatedCard = card;
      if (this._hass) card.hass = this._hass;
    } catch (e) {
      console.error("camera-grid-card:", e);
      host.innerHTML = `<div style="padding:16px;color:var(--error-color);"><strong>Fehler:</strong><br>${e.message}</div>`;
    }
  }

  _buildGridConfig() {
    const cards = [];
    for (const cam of this._config.cameras) {
      const entry = this._buildEntry(cam);
      if (entry) cards.push(entry);
      // Overlays as separate grid items (they use translateY to overlay the previous card)
      if (cam.overlays?.length > 0) {
        for (const overlay of cam.overlays) {
          cards.push(overlay);
        }
      }
    }
    return {
      type: "grid",
      columns: this._config.columns || 2,
      square: this._config.square || false,
      cards,
    };
  }

  _buildEntry(cam) {
    // conditional_cards: multiple cards with their own conditions in a vertical-stack
    if (cam.conditional_cards && cam.conditional_cards.length > 0) {
      return {
        type: "vertical-stack",
        cards: cam.conditional_cards.map((cc) => {
          const inner = this._buildSingle(cc);
          return cc.conditions?.length ? { type: "conditional", conditions: cc.conditions, card: inner } : inner;
        }),
      };
    }

    let card = this._buildSingle(cam);

    // Wrap with conditions
    if (cam.conditions?.length > 0) {
      card = { type: "conditional", conditions: cam.conditions, card };
    }

    return card;
  }

  _buildSingle(cam) {
    switch (cam.type) {
      case "webrtc":
        return { type: "custom:webrtc-camera", entity: cam.entity, ...(cam.url ? { url: cam.url } : {}) };

      case "picture-entity":
        return {
          type: "picture-entity",
          entity: cam.entity,
          show_state: false,
          show_name: false,
          camera_view: cam.camera_view || "auto",
          fit_mode: cam.fit_mode || "cover",
          ...(cam.camera_image ? { camera_image: cam.camera_image } : {}),
          ...(cam.image ? { image: cam.image } : {}),
          ...(cam.tap_action ? { tap_action: cam.tap_action } : {}),
          ...(cam.hold_action ? { hold_action: cam.hold_action } : {}),
        };

      case "picture-elements":
        return this._buildPTZ(cam);

      default:
        return { type: "markdown", content: `Unbekannter Typ: ${cam.type}` };
    }
  }

  _buildPTZ(cam) {
    const elements = [];
    const S = { background: "rgba(255,255,255,1)", color: "rgba(0,0,0,1)" };

    if (cam.ptz) {
      const p = cam.ptz;

      // D-Pad: cross pattern, bottom-right corner
      if (p.up) elements.push({ type: "icon", icon: "mdi:arrow-up", style: { ...S, bottom: "50px", right: "25px" }, tap_action: { action: "call-service", service: p.up } });
      if (p.down) elements.push({ type: "icon", icon: "mdi:arrow-down", style: { ...S, bottom: "0px", right: "25px" }, tap_action: { action: "call-service", service: p.down } });
      if (p.left) elements.push({ type: "icon", icon: "mdi:arrow-left", style: { ...S, bottom: "25px", right: "50px" }, tap_action: { action: "call-service", service: p.left } });
      if (p.right) elements.push({ type: "icon", icon: "mdi:arrow-right", style: { ...S, bottom: "25px", right: "0px" }, tap_action: { action: "call-service", service: p.right } });

      // Fullscreen: center of the D-Pad cross
      if (cam.entity) {
        elements.push({ type: "icon", icon: "mdi:fullscreen", entity: cam.entity, style: { ...S, bottom: "25px", right: "25px" }, tap_action: { action: "more-info" } });
      }

      // Zoom: bottom-left, stacked vertically
      if (p.zoom_in) elements.push({ type: "icon", icon: "mdi:plus", style: { ...S, bottom: "25px", left: "25px" }, tap_action: { action: "call-service", service: p.zoom_in } });
      if (p.zoom_out) elements.push({ type: "icon", icon: "mdi:minus", style: { ...S, bottom: "0px", left: "25px" }, tap_action: { action: "call-service", service: p.zoom_out } });

      // Presets: placed at the 4 corners of the D-Pad cross (the diagonal positions)
      // Corner positions: top-right, top-left, bottom-left, bottom-right of the D-Pad
      // D-Pad center is at bottom:25px, right:25px
      // Corners: (bottom:50px, right:0px), (bottom:50px, right:50px), (bottom:0px, right:50px), (bottom:0px, right:0px)
      const presetPositions = [
        { bottom: "0px", right: "50px" },   // Preset 1: bottom-left of D-Pad
        { bottom: "0px", right: "0px" },    // Preset 2: bottom-right of D-Pad
        { bottom: "50px", right: "50px" },  // Preset 3: top-left of D-Pad
        { bottom: "50px", right: "0px" },   // Preset 4: top-right of D-Pad
      ];

      if (p.presets?.length > 0) {
        p.presets.forEach((preset, i) => {
          if (i < presetPositions.length) {
            elements.push({
              type: "icon",
              icon: `mdi:numeric-${i + 1}`,
              style: { ...S, ...presetPositions[i] },
              tap_action: { action: "call-service", service: preset.service },
            });
          }
        });
      }
    }

    // Raw elements pass-through
    if (cam.elements?.length > 0) elements.push(...cam.elements);

    return {
      type: "picture-elements",
      camera_image: cam.camera_image || cam.entity,
      camera_view: cam.camera_view || "live",
      aspect_ratio: "16:9",
      elements,
    };
  }
}

class CameraGridCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._rendered = false;
    this._openKeys = new Set();
    this._emittedHashes = new Set();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) { this.shadowRoot?.querySelectorAll("ha-form").forEach((f) => { f.hass = hass; }); return; }
    if (this._config && Object.keys(this._config).length) this._render();
  }

  setConfig(config) {
    const next = JSON.parse(JSON.stringify(config || {}));
    if (!Array.isArray(next.cameras)) next.cameras = [];
    const hash = JSON.stringify(next);
    if (this._emittedHashes.has(hash) && this._rendered) { this._emittedHashes.delete(hash); return; }
    this._config = next;
    this._render();
  }

  _fire() {
    const config = JSON.parse(JSON.stringify(this._config));
    const hash = JSON.stringify(config);
    this._emittedHashes.add(hash);
    while (this._emittedHashes.size > 30) this._emittedHashes.delete(this._emittedHashes.values().next().value);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _globalSchema() {
    return [
      { name: "columns", selector: { number: { min: 1, max: 4, step: 1, mode: "box" } } },
      { name: "square", selector: { boolean: {} } },
    ];
  }

  _cameraSchema(cam) {
    const s = [
      { name: "type", selector: { select: { options: [
        { value: "webrtc", label: "WebRTC" },
        { value: "picture-entity", label: "Picture Entity" },
        { value: "picture-elements", label: "Picture Elements (PTZ)" },
      ] } } },
      { name: "entity", selector: { entity: { filter: [{ domain: "camera" }] } } },
      { name: "name", selector: { text: {} } },
    ];
    if (cam.type === "picture-entity" || cam.type === "picture-elements") {
      s.push({ name: "camera_view", selector: { select: { options: [{ value: "auto", label: "Auto" }, { value: "live", label: "Live" }] } } });
    }
    if (cam.type === "picture-entity") {
      s.push({ name: "fit_mode", selector: { select: { options: [{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "fill", label: "Fill" }] } } });
      s.push({ name: "image", selector: { text: {} } });
    }
    if (cam.type === "picture-elements") {
      s.push({ name: "ptz_up", selector: { text: {} } });
      s.push({ name: "ptz_down", selector: { text: {} } });
      s.push({ name: "ptz_left", selector: { text: {} } });
      s.push({ name: "ptz_right", selector: { text: {} } });
      s.push({ name: "ptz_zoom_in", selector: { text: {} } });
      s.push({ name: "ptz_zoom_out", selector: { text: {} } });
    }
    if (cam.type === "webrtc") s.push({ name: "url", selector: { text: {} } });
    return s;
  }

  _presetSchema() {
    return [
      { name: "service", selector: { text: {} } },
    ];
  }

  _label(schema) {
    const l = { columns: "Spalten", square: "Quadratisch", type: "Kameratyp", entity: "Kamera-Entität", name: "Name",
      camera_view: "Ansicht", fit_mode: "Bildanpassung", image: "Platzhalterbild", url: "Stream-URL",
      ptz_up: "PTZ Hoch (script/service)", ptz_down: "PTZ Runter", ptz_left: "PTZ Links", ptz_right: "PTZ Rechts",
      ptz_zoom_in: "PTZ Zoom+", ptz_zoom_out: "PTZ Zoom-", service: "Service (z.B. rest_command.xyz)" };
    return l[schema.name] || schema.name;
  }

  _addCamera() {
    this._config.cameras.push({ type: "picture-entity", entity: "", name: "", camera_view: "auto", fit_mode: "cover" });
    this._openKeys.add(`cam:${this._config.cameras.length - 1}`);
    this._fire(); this._render();
  }
  _removeCamera(i) { this._config.cameras.splice(i, 1); this._fire(); this._render(); }
  _moveCamera(i, d) {
    const t = i + d; const c = this._config.cameras;
    if (t < 0 || t >= c.length) return;
    [c[i], c[t]] = [c[t], c[i]]; this._fire(); this._render();
  }
  _addPreset(camIdx) {
    const cam = this._config.cameras[camIdx];
    if (!cam.ptz) cam.ptz = {};
    if (!cam.ptz.presets) cam.ptz.presets = [];
    if (cam.ptz.presets.length >= 4) return; // max 4 presets (4 corners)
    cam.ptz.presets.push({ service: "" });
    this._fire(); this._render();
  }
  _removePreset(camIdx, presetIdx) {
    this._config.cameras[camIdx].ptz.presets.splice(presetIdx, 1);
    this._fire(); this._render();
  }

  _flattenCam(cam) {
    const flat = { ...cam };
    if (cam.ptz) {
      flat.ptz_up = cam.ptz.up || ""; flat.ptz_down = cam.ptz.down || "";
      flat.ptz_left = cam.ptz.left || ""; flat.ptz_right = cam.ptz.right || "";
      flat.ptz_zoom_in = cam.ptz.zoom_in || ""; flat.ptz_zoom_out = cam.ptz.zoom_out || "";
      delete flat.ptz;
    }
    return flat;
  }
  _recomposeCam(flat, camIdx) {
    const cam = { ...flat };
    if (cam.type === "picture-elements") {
      const oldPresets = this._config.cameras[camIdx]?.ptz?.presets || [];
      cam.ptz = {};
      if (cam.ptz_up) cam.ptz.up = cam.ptz_up;
      if (cam.ptz_down) cam.ptz.down = cam.ptz_down;
      if (cam.ptz_left) cam.ptz.left = cam.ptz_left;
      if (cam.ptz_right) cam.ptz.right = cam.ptz_right;
      if (cam.ptz_zoom_in) cam.ptz.zoom_in = cam.ptz_zoom_in;
      if (cam.ptz_zoom_out) cam.ptz.zoom_out = cam.ptz_zoom_out;
      cam.ptz.presets = oldPresets; // preserve presets (edited separately)
    }
    delete cam.ptz_up; delete cam.ptz_down; delete cam.ptz_left; delete cam.ptz_right;
    delete cam.ptz_zoom_in; delete cam.ptz_zoom_out;
    return cam;
  }

  _render() {
    if (!this.shadowRoot) return;
    const cameras = this._config.cameras || [];
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .editor { display: flex; flex-direction: column; gap: 16px; }
        .block { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; background: var(--card-background-color); }
        details { border: 1px solid var(--divider-color); border-radius: 10px; margin: 6px 0; overflow: hidden; }
        summary { cursor: pointer; padding: 10px 12px; font-weight: 500; background: var(--secondary-background-color); list-style: none; }
        summary::-webkit-details-marker { display: none; }
        .cam-body { padding: 10px 12px; }
        .actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        button { border: 1px solid var(--divider-color); background: var(--secondary-background-color); color: var(--primary-text-color); border-radius: 8px; min-height: 34px; padding: 0 10px; cursor: pointer; font: inherit; font-size: 0.85rem; }
        button.primary { background: var(--primary-color); color: var(--text-primary-color, white); border-color: var(--primary-color); }
        button.danger { color: var(--error-color); }
        button:disabled { opacity: 0.4; cursor: default; }
        h3 { margin: 0 0 12px; font-size: 1rem; }
        .preset-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
        .preset-row span { min-width: 70px; font-weight: 500; font-size: 0.85rem; }
        .preset-label { font-size: 0.85rem; font-weight: 600; margin-top: 12px; margin-bottom: 4px; }
      </style>
      <div class="editor">
        <div class="block"><h3>Allgemein</h3><div id="global-form"></div></div>
        <div class="block"><h3>Kameras</h3><div id="cameras"></div>
          <button class="primary" id="add-cam" type="button">+ Kamera hinzufügen</button></div>
      </div>`;

    // Global
    const gf = document.createElement("ha-form");
    gf.hass = this._hass;
    gf.data = { columns: this._config.columns || 2, square: this._config.square || false };
    gf.schema = this._globalSchema();
    gf.computeLabel = (s) => this._label(s);
    gf.addEventListener("value-changed", (e) => { this._config = { ...this._config, ...(e.detail?.value || {}) }; this._fire(); });
    this.shadowRoot.getElementById("global-form").appendChild(gf);

    // Cameras
    const camHost = this.shadowRoot.getElementById("cameras");
    cameras.forEach((cam, idx) => {
      const key = `cam:${idx}`;
      const label = cam.name || cam.entity || cam.type || `Kamera ${idx + 1}`;
      const det = document.createElement("details");
      det.open = this._openKeys.has(key);
      det.addEventListener("toggle", () => { if (det.open) this._openKeys.add(key); else this._openKeys.delete(key); });

      let presetsHtml = "";
      if (cam.type === "picture-elements" && cam.ptz?.presets?.length > 0) {
        presetsHtml = `<div class="preset-label">Presets (max. 4, an den Ecken des Steuerkreuzes):</div>`;
        cam.ptz.presets.forEach((pr, pi) => {
          presetsHtml += `<div class="preset-row"><span>Preset ${pi + 1}:</span>
            <input type="text" value="${(pr.service || "").replace(/"/g, "&quot;")}" data-cam="${idx}" data-preset="${pi}" style="flex:1;padding:6px;border-radius:6px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:0.85rem;" />
            <button type="button" class="danger" data-action="rm-preset" data-cam="${idx}" data-preset="${pi}">×</button></div>`;
        });
      }
      const canAddPreset = cam.type === "picture-elements" && (!cam.ptz?.presets || cam.ptz.presets.length < 4);

      det.innerHTML = `<summary>${label}</summary><div class="cam-body"><div class="form-host"></div>
        ${presetsHtml}
        ${canAddPreset ? `<button type="button" data-action="add-preset" data-cam="${idx}" style="margin-top:8px;">+ Preset hinzufügen</button>` : ""}
        <div class="actions">
          <button type="button" data-action="up" ${idx === 0 ? "disabled" : ""}>&#8593;</button>
          <button type="button" data-action="down" ${idx === cameras.length - 1 ? "disabled" : ""}>&#8595;</button>
          <button type="button" class="danger" data-action="remove">Entfernen</button>
        </div></div>`;

      // Camera form
      const form = document.createElement("ha-form");
      form.hass = this._hass;
      form.data = this._flattenCam(cam);
      form.schema = this._cameraSchema(cam);
      form.computeLabel = (s) => this._label(s);
      form.addEventListener("value-changed", (e) => { this._config.cameras[idx] = this._recomposeCam(e.detail?.value || {}, idx); this._fire(); });
      det.querySelector(".form-host").appendChild(form);

      // Preset inputs
      det.querySelectorAll("input[data-preset]").forEach((input) => {
        input.addEventListener("change", (e) => {
          const ci = parseInt(e.target.dataset.cam, 10);
          const pi = parseInt(e.target.dataset.preset, 10);
          this._config.cameras[ci].ptz.presets[pi].service = e.target.value;
          this._fire();
        });
      });

      det.querySelectorAll('[data-action="rm-preset"]').forEach((btn) => {
        btn.addEventListener("click", (e) => { this._removePreset(parseInt(e.target.dataset.cam, 10), parseInt(e.target.dataset.preset, 10)); });
      });

      det.querySelector('[data-action="add-preset"]')?.addEventListener("click", (e) => { this._addPreset(parseInt(e.target.dataset.cam, 10)); });
      det.querySelector('[data-action="up"]')?.addEventListener("click", () => this._moveCamera(idx, -1));
      det.querySelector('[data-action="down"]')?.addEventListener("click", () => this._moveCamera(idx, 1));
      det.querySelector('[data-action="remove"]')?.addEventListener("click", () => this._removeCamera(idx));

      camHost.appendChild(det);
    });

    this.shadowRoot.getElementById("add-cam")?.addEventListener("click", () => this._addCamera());
    this._rendered = true;
  }
}

// --- Registration ---
if (!customElements.get("camera-grid-card")) customElements.define("camera-grid-card", CameraGridCard);
if (!customElements.get("camera-grid-card-editor")) customElements.define("camera-grid-card-editor", CameraGridCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "camera-grid-card")) {
  window.customCards.push({ type: "camera-grid-card", name: "Camera Grid Card",
    description: "Konfigurierbares Kamera-Grid mit WebRTC, Picture-Entity, PTZ und Presets.", preview: true });
}
console.info(`%c CAMERA-GRID-CARD %c v${CAMERA_GRID_CARD_VERSION} `, "color:white;background:#ff5722;font-weight:bold", "color:#ff5722;background:white;font-weight:bold");
