/*
 * Camera Grid Card for Home Assistant
 * Version 1.1.0
 *
 * Configurable camera overview grid supporting:
 * - webrtc (custom:webrtc-camera)
 * - picture-entity (simple live/auto view)
 * - picture-elements (PTZ overlay controls)
 * - conditional visibility per camera
 * - overlay elements (photo/video links)
 * - aspect_ratio for all types
 *
 * Card type: custom:camera-grid-card
 */

const CAMERA_GRID_CARD_VERSION = "1.1.0";

class CameraGridCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._generatedCard = undefined;
    this._renderToken = 0;
  }

  static getConfigElement() {
    return document.createElement("camera-grid-card-editor");
  }

  static getStubConfig() {
    return {
      columns: 2,
      square: false,
      aspect_ratio: "16:9",
      cameras: [
        { type: "picture-entity", entity: "", name: "", camera_view: "auto", fit_mode: "cover" },
      ],
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (this._generatedCard) this._generatedCard.hass = hass;
  }

  setConfig(config) {
    if (!config) throw new Error("Konfiguration fehlt.");
    this._config = {
      columns: 2,
      square: false,
      aspect_ratio: "16:9",
      cameras: [],
      ...JSON.parse(JSON.stringify(config)),
    };
    if (!Array.isArray(this._config.cameras)) this._config.cameras = [];
    this._buildCard();
  }

  getCardSize() {
    const count = this._config.cameras?.length || 0;
    const cols = Math.max(1, this._config.columns || 2);
    return Math.max(2, Math.ceil(count / cols) * 3);
  }

  async _buildCard() {
    const token = ++this._renderToken;
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = "<div id='host'></div>";
    const host = this.shadowRoot.getElementById("host");

    try {
      if (typeof window.loadCardHelpers !== "function") {
        throw new Error("Card Helpers nicht verfügbar.");
      }
      const helpers = await window.loadCardHelpers();
      if (token !== this._renderToken) return;

      const gridConfig = this._buildGridConfig();
      const card = await helpers.createCardElement(gridConfig);
      if (token !== this._renderToken) return;

      host.replaceChildren(card);
      this._generatedCard = card;
      if (this._hass) card.hass = this._hass;
    } catch (e) {
      console.error("camera-grid-card:", e);
      host.innerHTML = `<div style="padding:16px;color:var(--error-color);">
        <strong>Camera Grid Card Fehler:</strong><br>${e.message}</div>`;
    }
  }

  _buildGridConfig() {
    const cards = this._config.cameras.map((cam) => this._buildCameraEntry(cam)).filter(Boolean);
    return {
      type: "grid",
      columns: this._config.columns || 2,
      square: this._config.square || false,
      cards,
    };
  }

  _buildCameraEntry(cam) {
    // If this camera has conditional_cards, build a vertical-stack of conditionals
    if (cam.conditional_cards && cam.conditional_cards.length > 0) {
      const innerCards = cam.conditional_cards.map((cc) => {
        const innerCard = this._buildSingleCamera(cc);
        if (cc.conditions && cc.conditions.length > 0) {
          return { type: "conditional", conditions: cc.conditions, card: innerCard };
        }
        return innerCard;
      });
      return { type: "vertical-stack", cards: innerCards };
    }

    // Build the base camera card
    const card = this._buildSingleCamera(cam);

    // Wrap with conditions if present
    let result = card;
    if (cam.conditions && cam.conditions.length > 0) {
      result = { type: "conditional", conditions: cam.conditions, card };
    }

    // Wrap with overlays if present
    if (cam.overlays && cam.overlays.length > 0) {
      const overlayCards = cam.overlays.map((o) => this._buildOverlay(o));
      if (result.type === "conditional") {
        // Put overlay inside the conditional card as vertical-stack
        result.card = { type: "vertical-stack", cards: [card, ...overlayCards] };
      } else {
        result = { type: "vertical-stack", cards: [result, ...overlayCards] };
      }
    }

    return result;
  }

  _buildSingleCamera(cam) {
    const globalAspect = this._config.aspect_ratio || "16:9";

    switch (cam.type) {
      case "webrtc":
        return {
          type: "custom:webrtc-camera",
          entity: cam.entity,
          ...(cam.url ? { url: cam.url } : {}),
        };

      case "picture-entity":
        return {
          type: "picture-entity",
          entity: cam.entity,
          show_state: false,
          show_name: false,
          camera_view: cam.camera_view || "auto",
          fit_mode: cam.fit_mode || "cover",
          aspect_ratio: cam.aspect_ratio || globalAspect,
          ...(cam.camera_image ? { camera_image: cam.camera_image } : {}),
          ...(cam.image ? { image: cam.image } : {}),
          ...(cam.tap_action ? { tap_action: cam.tap_action } : {}),
          ...(cam.hold_action ? { hold_action: cam.hold_action } : {}),
        };

      case "picture-elements":
        return this._buildPTZCard(cam);

      default:
        return { type: "markdown", content: `Unbekannter Kameratyp: ${cam.type}` };
    }
  }

  _buildPTZCard(cam) {
    const globalAspect = this._config.aspect_ratio || "16:9";
    const elements = [];

    if (cam.ptz) {
      const ptz = cam.ptz;
      const btnStyle = { background: "rgba(255,255,255,1)", color: "rgba(0,0,0,1)" };

      // D-Pad: positioned bottom-right as a cross pattern
      // Center of cross: bottom:25px, right:25px
      if (ptz.up) {
        elements.push({
          type: "icon", icon: "mdi:arrow-up",
          style: { ...btnStyle, bottom: "50px", right: "25px" },
          tap_action: { action: "call-service", service: ptz.up },
        });
      }
      if (ptz.down) {
        elements.push({
          type: "icon", icon: "mdi:arrow-down",
          style: { ...btnStyle, bottom: "0px", right: "25px" },
          tap_action: { action: "call-service", service: ptz.down },
        });
      }
      if (ptz.left) {
        elements.push({
          type: "icon", icon: "mdi:arrow-left",
          style: { ...btnStyle, bottom: "25px", right: "50px" },
          tap_action: { action: "call-service", service: ptz.left },
        });
      }
      if (ptz.right) {
        elements.push({
          type: "icon", icon: "mdi:arrow-right",
          style: { ...btnStyle, bottom: "25px", right: "0px" },
          tap_action: { action: "call-service", service: ptz.right },
        });
      }

      // Fullscreen: center of the D-Pad
      if (cam.entity) {
        elements.push({
          type: "icon", icon: "mdi:fullscreen",
          entity: cam.entity,
          style: { ...btnStyle, bottom: "25px", right: "25px" },
          tap_action: { action: "more-info" },
        });
      }

      // Zoom: bottom-left
      if (ptz.zoom_in) {
        elements.push({
          type: "icon", icon: "mdi:plus",
          style: { ...btnStyle, bottom: "25px", left: "25px" },
          tap_action: { action: "call-service", service: ptz.zoom_in },
        });
      }
      if (ptz.zoom_out) {
        elements.push({
          type: "icon", icon: "mdi:minus",
          style: { ...btnStyle, bottom: "0px", left: "25px" },
          tap_action: { action: "call-service", service: ptz.zoom_out },
        });
      }

      // Presets: positioned along the bottom row and second row next to D-Pad
      if (ptz.presets && Array.isArray(ptz.presets)) {
        ptz.presets.forEach((preset, index) => {
          // Layout: presets go bottom-right, stacking up and to the left of D-Pad arrows
          // Row 0: bottom: 0px, Row 1: bottom: 50px
          // Col 0: right: 50px, Col 1: right: 0px
          const row = Math.floor(index / 2);
          const col = index % 2;
          elements.push({
            type: "icon",
            icon: `mdi:numeric-${index + 1}`,
            style: { ...btnStyle, bottom: `${row * 50}px`, right: `${col * 25 + 50}px` },
            tap_action: { action: "call-service", service: preset.service },
          });
        });
      }
    }

    // Raw elements pass-through
    if (cam.elements && Array.isArray(cam.elements)) {
      elements.push(...cam.elements);
    }

    return {
      type: "picture-elements",
      camera_image: cam.camera_image || cam.entity,
      camera_view: cam.camera_view || "live",
      aspect_ratio: cam.aspect_ratio || globalAspect,
      elements,
    };
  }

  _buildOverlay(overlay) {
    if (overlay.type === "markdown") {
      return {
        type: "markdown",
        content: overlay.content || "",
        ...(overlay.card_mod ? { card_mod: overlay.card_mod } : {}),
      };
    }
    return overlay;
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
    if (this._rendered) {
      this.shadowRoot?.querySelectorAll("ha-form").forEach((f) => { f.hass = hass; });
      return;
    }
    if (this._config && Object.keys(this._config).length) this._render();
  }

  setConfig(config) {
    const next = JSON.parse(JSON.stringify(config || {}));
    if (!Array.isArray(next.cameras)) next.cameras = [];
    const hash = JSON.stringify(next);
    if (this._emittedHashes.has(hash) && this._rendered) {
      this._emittedHashes.delete(hash);
      return;
    }
    this._config = next;
    this._render();
  }

  _fire() {
    const config = JSON.parse(JSON.stringify(this._config));
    const hash = JSON.stringify(config);
    this._emittedHashes.add(hash);
    while (this._emittedHashes.size > 30) {
      this._emittedHashes.delete(this._emittedHashes.values().next().value);
    }
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }

  _globalSchema() {
    return [
      { name: "columns", selector: { number: { min: 1, max: 4, step: 1, mode: "box" } } },
      { name: "square", selector: { boolean: {} } },
      { name: "aspect_ratio", selector: { text: {} } },
    ];
  }

  _cameraSchema(cam) {
    const schema = [
      { name: "type", selector: { select: { options: [
        { value: "webrtc", label: "WebRTC" },
        { value: "picture-entity", label: "Picture Entity" },
        { value: "picture-elements", label: "Picture Elements (PTZ)" },
      ] } } },
      { name: "entity", selector: { entity: { filter: [{ domain: "camera" }] } } },
      { name: "name", selector: { text: {} } },
      { name: "aspect_ratio", selector: { text: {} } },
    ];

    if (cam.type === "picture-entity" || cam.type === "picture-elements") {
      schema.push({ name: "camera_view", selector: { select: { options: [
        { value: "auto", label: "Auto" },
        { value: "live", label: "Live" },
      ] } } });
    }

    if (cam.type === "picture-entity") {
      schema.push({ name: "fit_mode", selector: { select: { options: [
        { value: "cover", label: "Cover" },
        { value: "contain", label: "Contain" },
        { value: "fill", label: "Fill" },
      ] } } });
      schema.push({ name: "image", selector: { text: {} } });
    }

    if (cam.type === "picture-elements") {
      schema.push({ name: "ptz_up", selector: { text: {} } });
      schema.push({ name: "ptz_down", selector: { text: {} } });
      schema.push({ name: "ptz_left", selector: { text: {} } });
      schema.push({ name: "ptz_right", selector: { text: {} } });
      schema.push({ name: "ptz_zoom_in", selector: { text: {} } });
      schema.push({ name: "ptz_zoom_out", selector: { text: {} } });
      schema.push({ name: "presets_yaml", selector: { text: { multiline: true } } });
    }

    if (cam.type === "webrtc") {
      schema.push({ name: "url", selector: { text: {} } });
    }

    return schema;
  }

  _label(schema) {
    const labels = {
      columns: "Spalten",
      square: "Quadratisch",
      aspect_ratio: "Seitenverhältnis (z.B. 16:9)",
      type: "Kameratyp",
      entity: "Kamera-Entität",
      name: "Name",
      camera_view: "Ansicht",
      fit_mode: "Bildanpassung",
      image: "Platzhalterbild (URL)",
      url: "Stream-URL",
      ptz_up: "PTZ Hoch (Service)",
      ptz_down: "PTZ Runter (Service)",
      ptz_left: "PTZ Links (Service)",
      ptz_right: "PTZ Rechts (Service)",
      ptz_zoom_in: "PTZ Zoom+ (Service)",
      ptz_zoom_out: "PTZ Zoom- (Service)",
      presets_yaml: "Presets (je Zeile: - service: ...)",
    };
    return labels[schema.name] || schema.name;
  }

  _addCamera() {
    this._config.cameras.push({ type: "picture-entity", entity: "", name: "", camera_view: "auto", fit_mode: "cover" });
    this._openKeys.add(`cam:${this._config.cameras.length - 1}`);
    this._fire();
    this._render();
  }

  _removeCamera(index) { this._config.cameras.splice(index, 1); this._fire(); this._render(); }

  _moveCamera(index, direction) {
    const target = index + direction;
    const cams = this._config.cameras;
    if (target < 0 || target >= cams.length) return;
    [cams[index], cams[target]] = [cams[target], cams[index]];
    this._fire(); this._render();
  }

  _flattenCam(cam) {
    const flat = { ...cam };
    if (cam.ptz) {
      flat.ptz_up = cam.ptz.up || "";
      flat.ptz_down = cam.ptz.down || "";
      flat.ptz_left = cam.ptz.left || "";
      flat.ptz_right = cam.ptz.right || "";
      flat.ptz_zoom_in = cam.ptz.zoom_in || "";
      flat.ptz_zoom_out = cam.ptz.zoom_out || "";
      if (cam.ptz.presets) flat.presets_yaml = cam.ptz.presets.map((p) => `- service: ${p.service}`).join("\n");
      delete flat.ptz;
    }
    return flat;
  }

  _recomposeCam(flat) {
    const cam = { ...flat };
    if (cam.type === "picture-elements") {
      cam.ptz = {};
      if (cam.ptz_up) cam.ptz.up = cam.ptz_up;
      if (cam.ptz_down) cam.ptz.down = cam.ptz_down;
      if (cam.ptz_left) cam.ptz.left = cam.ptz_left;
      if (cam.ptz_right) cam.ptz.right = cam.ptz_right;
      if (cam.ptz_zoom_in) cam.ptz.zoom_in = cam.ptz_zoom_in;
      if (cam.ptz_zoom_out) cam.ptz.zoom_out = cam.ptz_zoom_out;
      if (cam.presets_yaml) {
        const lines = cam.presets_yaml.split("\n").filter((l) => l.trim());
        cam.ptz.presets = lines.map((l) => {
          const m = l.match(/service:\s*(.+)/);
          return m ? { service: m[1].trim() } : null;
        }).filter(Boolean);
      }
    }
    delete cam.ptz_up; delete cam.ptz_down; delete cam.ptz_left; delete cam.ptz_right;
    delete cam.ptz_zoom_in; delete cam.ptz_zoom_out; delete cam.presets_yaml;
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
        summary { cursor: pointer; padding: 10px 12px; font-weight: 500; background: var(--secondary-background-color); display: flex; align-items: center; gap: 8px; list-style: none; }
        summary::-webkit-details-marker { display: none; }
        .cam-body { padding: 10px 12px; }
        .cam-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        button { border: 1px solid var(--divider-color); background: var(--secondary-background-color); color: var(--primary-text-color); border-radius: 8px; min-height: 34px; padding: 0 10px; cursor: pointer; font: inherit; font-size: 0.85rem; }
        button.primary { background: var(--primary-color); color: var(--text-primary-color, white); border-color: var(--primary-color); }
        button.danger { color: var(--error-color); }
        button:disabled { opacity: 0.4; cursor: default; }
        h3 { margin: 0 0 12px; font-size: 1rem; }
      </style>
      <div class="editor">
        <div class="block"><h3>Allgemein</h3><div id="global-form"></div></div>
        <div class="block"><h3>Kameras</h3><div id="cameras"></div>
          <button class="primary" id="add-cam" type="button">+ Kamera hinzufügen</button>
        </div>
      </div>
    `;

    const globalHost = this.shadowRoot.getElementById("global-form");
    const globalForm = document.createElement("ha-form");
    globalForm.hass = this._hass;
    globalForm.data = { columns: this._config.columns || 2, square: this._config.square || false, aspect_ratio: this._config.aspect_ratio || "16:9" };
    globalForm.schema = this._globalSchema();
    globalForm.computeLabel = (s) => this._label(s);
    globalForm.addEventListener("value-changed", (e) => { this._config = { ...this._config, ...(e.detail?.value || {}) }; this._fire(); });
    globalHost.appendChild(globalForm);

    const camHost = this.shadowRoot.getElementById("cameras");
    cameras.forEach((cam, index) => {
      const key = `cam:${index}`;
      const isOpen = this._openKeys.has(key);
      const label = cam.name || cam.entity || cam.type || `Kamera ${index + 1}`;
      const details = document.createElement("details");
      details.dataset.openKey = key;
      details.open = isOpen;
      details.innerHTML = `<summary>${label}</summary><div class="cam-body"><div class="form-host"></div>
        <div class="cam-actions">
          <button type="button" data-action="up" ${index === 0 ? "disabled" : ""}>&#8593;</button>
          <button type="button" data-action="down" ${index === cameras.length - 1 ? "disabled" : ""}>&#8595;</button>
          <button type="button" class="danger" data-action="remove">Entfernen</button>
        </div></div>`;
      details.addEventListener("toggle", () => { if (details.open) this._openKeys.add(key); else this._openKeys.delete(key); });

      const form = document.createElement("ha-form");
      form.hass = this._hass;
      form.data = this._flattenCam(cam);
      form.schema = this._cameraSchema(cam);
      form.computeLabel = (s) => this._label(s);
      form.addEventListener("value-changed", (e) => { this._config.cameras[index] = this._recomposeCam(e.detail?.value || {}); this._fire(); });
      details.querySelector(".form-host").appendChild(form);

      details.querySelector('[data-action="up"]')?.addEventListener("click", () => this._moveCamera(index, -1));
      details.querySelector('[data-action="down"]')?.addEventListener("click", () => this._moveCamera(index, 1));
      details.querySelector('[data-action="remove"]')?.addEventListener("click", () => this._removeCamera(index));
      camHost.appendChild(details);
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
  window.customCards.push({
    type: "camera-grid-card",
    name: "Camera Grid Card",
    description: "Konfigurierbares Kamera-Grid mit WebRTC, Picture-Entity, PTZ-Steuerung, bedingter Sichtbarkeit und Overlays.",
    preview: true,
  });
}

console.info(
  `%c CAMERA-GRID-CARD %c v${CAMERA_GRID_CARD_VERSION} `,
  "color:white;background:#ff5722;font-weight:bold",
  "color:#ff5722;background:white;font-weight:bold"
);
