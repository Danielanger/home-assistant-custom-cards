/*
 * Camera Grid Card for Home Assistant
 * Version 2.0.0
 *
 * Configurable camera grid with UI editor.
 * Supports: webrtc, picture-entity, picture-elements (PTZ/presets).
 * Per-camera: condition, fallback image, photo/video link overlays.
 * Card type: custom:camera-grid-card
 */
const CAMERA_GRID_CARD_VERSION = "5.0.0";

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
    return { columns: 2, cameras: [{ type: "picture-entity", entity: "" }] };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    // Check if template-relevant states changed
    const hasTemplates = (this._config.cameras || []).some((c) =>
      (c.photo_url && c.photo_url.includes("{{")) || (c.video_url && c.video_url.includes("{{"))
    );

    if (hasTemplates && oldHass) {
      // Extract referenced entity IDs
      const entities = new Set();
      for (const c of this._config.cameras) {
        const urls = [c.photo_url, c.video_url].filter(Boolean).join(" ");
        const matches = urls.matchAll(/\{\{\s*states\.([\w.]+)\.state\s*\}\}/g);
        for (const m of matches) entities.add(m[1]);
      }
      // Rebuild only if one of those states changed
      let changed = false;
      for (const eid of entities) {
        if (oldHass.states?.[eid]?.state !== hass.states?.[eid]?.state) { changed = true; break; }
      }
      if (changed) { this._buildCard(); return; }
    }

    if (this._generatedCard) this._generatedCard.hass = hass;
  }

  setConfig(config) {
    if (!config) throw new Error("Konfiguration fehlt.");
    this._config = { columns: 2, cameras: [], ...JSON.parse(JSON.stringify(config)) };
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
      const card = await helpers.createCardElement(this._gridConfig());
      if (token !== this._renderToken) return;
      host.replaceChildren(card);
      this._generatedCard = card;
      if (this._hass) card.hass = this._hass;
    } catch (e) {
      console.error("camera-grid-card:", e);
      host.innerHTML = `<div style="padding:16px;color:var(--error-color)"><strong>Fehler:</strong> ${e.message}</div>`;
    }
  }

  _gridConfig() {
    const cards = this._config.cameras.map((c) => this._camCard(c)).filter(Boolean);
    return { type: "grid", columns: this._config.columns || 2, square: false, cards };
  }

  _camCard(cam) {
    let card;

    switch (cam.type) {
      case "webrtc":
        card = { type: "custom:webrtc-camera", entity: cam.entity, ...(cam.url ? { url: cam.url } : {}) };
        break;

      case "picture-elements":
        card = this._ptzCard(cam);
        break;

      case "picture-entity":
      default: {
        // If photo_url or video_url is set, render as picture-elements to embed icons
        if (cam.photo_url || cam.video_url) {
          card = this._entityWithOverlays(cam);
        } else {
          card = {
            type: "picture-entity",
            entity: cam.entity,
            show_state: false,
            show_name: false,
            camera_view: cam.camera_view || "auto",
            fit_mode: cam.fit_mode || "cover",
            ...(cam.camera_image ? { camera_image: cam.camera_image } : {}),
            ...(cam.image ? { image: cam.image } : {}),
          };
        }
        break;
      }
    }

    // Wrap with condition: show only when condition_entity has condition_state
    if (cam.condition_entity && cam.condition_state) {
      card = {
        type: "conditional",
        conditions: [{ condition: "state", entity: cam.condition_entity, state: cam.condition_state }],
        card,
      };
    }

    // If fallback_image is set and there's a condition, we need the inverse too
    // Build a vertical-stack: [conditional live, conditional fallback]
    if (cam.fallback_image && cam.condition_entity && cam.condition_state) {
      const fallback = {
        type: "picture-entity",
        entity: cam.condition_entity,
        show_state: false,
        show_name: false,
        image: cam.fallback_image,
        camera_view: "auto",
        tap_action: { action: "none" },
        hold_action: { action: "none" },
      };
      const fallbackWrapped = {
        type: "conditional",
        conditions: [{ condition: "state", entity: cam.condition_entity, state_not: cam.condition_state }],
        card: fallback,
      };
      card = { type: "vertical-stack", cards: [card, fallbackWrapped] };
    }

    return card;
  }

  _entityWithOverlays(cam) {
    // Render as picture-elements with embedded link icons.
    // Tap on image area opens camera more-info via a full-size invisible image element.
    const elements = [];

    // Invisible full-area tap target for more-info
    if (cam.entity) {
      elements.push({
        type: "image",
        entity: cam.entity,
        camera_image: cam.camera_image || cam.entity,
        style: { top: "50%", left: "50%", width: "100%", height: "100%", opacity: "0" },
        tap_action: { action: "more-info" },
      });
    }

    if (cam.photo_url) {
      const url = this._resolveTemplate(cam.photo_url);
      elements.push({
        type: "icon", icon: "mdi:camera",
        style: { color: "white", background: "rgba(0,0,0,0.4)", "border-radius": "50%", padding: "4px", bottom: "40px", left: "20px", "--mdc-icon-size": "22px" },
        tap_action: { action: "url", url_path: url },
      });
    }
    if (cam.video_url) {
      const url = this._resolveTemplate(cam.video_url);
      elements.push({
        type: "icon", icon: "mdi:file-video-outline",
        style: { color: "white", background: "rgba(0,0,0,0.4)", "border-radius": "50%", padding: "4px", bottom: "10px", left: "20px", "--mdc-icon-size": "22px" },
        tap_action: { action: "url", url_path: url },
      });
    }

    return {
      type: "picture-elements",
      camera_image: cam.camera_image || cam.entity,
      camera_view: cam.camera_view || "auto",
      aspect_ratio: "16:9",
      elements,
    };
  }

  _resolveTemplate(str) {
    if (!str || !this._hass) return str || "";
    return str.replace(/\{\{\s*states\.([\w.]+)\.state\s*\}\}/g, (_, entityId) => {
      const state = this._hass?.states?.[entityId];
      return state ? state.state : "";
    });
  }

  _ptzCard(cam) {
    const elements = [];
    const S = { background: "rgba(255,255,255,1)", color: "rgba(0,0,0,1)" };

    if (cam.ptz) {
      const p = cam.ptz;
      // D-Pad cross: center at bottom:25px right:25px
      if (p.up)    elements.push({ type: "icon", icon: "mdi:arrow-up",    style: { ...S, bottom: "50px", right: "25px" }, tap_action: { action: "call-service", service: p.up } });
      if (p.down)  elements.push({ type: "icon", icon: "mdi:arrow-down",  style: { ...S, bottom: "0px",  right: "25px" }, tap_action: { action: "call-service", service: p.down } });
      if (p.left)  elements.push({ type: "icon", icon: "mdi:arrow-left",  style: { ...S, bottom: "25px", right: "50px" }, tap_action: { action: "call-service", service: p.left } });
      if (p.right) elements.push({ type: "icon", icon: "mdi:arrow-right", style: { ...S, bottom: "25px", right: "0px"  }, tap_action: { action: "call-service", service: p.right } });
      // Fullscreen center
      if (cam.entity) elements.push({ type: "icon", icon: "mdi:fullscreen", entity: cam.entity, style: { ...S, bottom: "25px", right: "25px" }, tap_action: { action: "more-info" } });
      // Zoom bottom-left
      if (p.zoom_in)  elements.push({ type: "icon", icon: "mdi:plus",  style: { ...S, bottom: "25px", left: "25px" }, tap_action: { action: "call-service", service: p.zoom_in } });
      if (p.zoom_out) elements.push({ type: "icon", icon: "mdi:minus", style: { ...S, bottom: "0px",  left: "25px" }, tap_action: { action: "call-service", service: p.zoom_out } });
      // Presets at corners of the D-Pad
      const presetPos = [
        { bottom: "0px", right: "50px" },  // 1: bottom-left corner
        { bottom: "0px", right: "0px" },   // 2: bottom-right corner
        { bottom: "50px", right: "50px" }, // 3: top-left corner
        { bottom: "50px", right: "0px" },  // 4: top-right corner
      ];
      (p.presets || []).forEach((pr, i) => {
        if (i < 4) elements.push({ type: "icon", icon: `mdi:numeric-${i + 1}`, style: { ...S, ...presetPos[i] }, tap_action: { action: "call-service", service: pr.service } });
      });
    }

    if (cam.elements?.length) elements.push(...cam.elements);

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

  _schema(cam) {
    const s = [
      { name: "type", selector: { select: { options: [
        { value: "webrtc", label: "WebRTC" },
        { value: "picture-entity", label: "Picture Entity" },
        { value: "picture-elements", label: "Picture Elements (PTZ)" },
      ] } } },
      { name: "entity", selector: { entity: {} } },
      { name: "name", selector: { text: {} } },
    ];

    if (cam.type !== "webrtc") {
      s.push({ name: "camera_view", selector: { select: { options: [{ value: "auto", label: "Auto" }, { value: "live", label: "Live" }] } } });
    }
    if (cam.type === "picture-entity") {
      s.push({ name: "fit_mode", selector: { select: { options: [{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }] } } });
    }
    if (cam.type === "webrtc") {
      s.push({ name: "url", selector: { text: {} } });
    }
    if (cam.type === "picture-elements") {
      s.push({ name: "ptz_up", selector: { text: {} } });
      s.push({ name: "ptz_down", selector: { text: {} } });
      s.push({ name: "ptz_left", selector: { text: {} } });
      s.push({ name: "ptz_right", selector: { text: {} } });
      s.push({ name: "ptz_zoom_in", selector: { text: {} } });
      s.push({ name: "ptz_zoom_out", selector: { text: {} } });
    }

    // Condition fields (all types)
    s.push({ name: "condition_entity", selector: { entity: {} } });
    s.push({ name: "condition_state", selector: { text: {} } });
    s.push({ name: "fallback_image", selector: { text: {} } });

    // Photo/Video link fields (picture-entity + webrtc)
    if (cam.type !== "picture-elements") {
      s.push({ name: "photo_url", selector: { text: {} } });
      s.push({ name: "video_url", selector: { text: {} } });
    }

    return s;
  }

  _label(schema) {
    return {
      columns: "Spalten", type: "Kameratyp", entity: "Entität", name: "Name",
      camera_view: "Ansicht", fit_mode: "Bildanpassung", url: "Stream-URL",
      ptz_up: "PTZ Hoch (Service)", ptz_down: "PTZ Runter", ptz_left: "PTZ Links",
      ptz_right: "PTZ Rechts", ptz_zoom_in: "PTZ Zoom+", ptz_zoom_out: "PTZ Zoom-",
      condition_entity: "Nur anzeigen wenn Entität...", condition_state: "...diesen Zustand hat",
      fallback_image: "Fallback-Bild (wenn Bedingung NICHT erfüllt)",
      photo_url: "Foto-Link URL (Icon auf dem Bild)", video_url: "Video-Link URL (Icon auf dem Bild)",
      service: "Service",
    }[schema.name] || schema.name;
  }

  _addCamera() { this._config.cameras.push({ type: "picture-entity", entity: "" }); this._openKeys.add(`c:${this._config.cameras.length-1}`); this._fire(); this._render(); }
  _removeCamera(i) { this._config.cameras.splice(i, 1); this._fire(); this._render(); }
  _moveCamera(i, d) { const t=i+d, c=this._config.cameras; if(t<0||t>=c.length)return; [c[i],c[t]]=[c[t],c[i]]; this._fire(); this._render(); }
  _addPreset(i) { const c=this._config.cameras[i]; if(!c.ptz)c.ptz={}; if(!c.ptz.presets)c.ptz.presets=[]; if(c.ptz.presets.length>=4)return; c.ptz.presets.push({service:""}); this._fire(); this._render(); }
  _removePreset(ci, pi) { this._config.cameras[ci].ptz.presets.splice(pi,1); this._fire(); this._render(); }

  _flatCam(cam) {
    const f = { ...cam };
    if (cam.ptz) { f.ptz_up=cam.ptz.up||""; f.ptz_down=cam.ptz.down||""; f.ptz_left=cam.ptz.left||""; f.ptz_right=cam.ptz.right||""; f.ptz_zoom_in=cam.ptz.zoom_in||""; f.ptz_zoom_out=cam.ptz.zoom_out||""; delete f.ptz; }
    return f;
  }

  _unflatCam(flat, ci) {
    const cam = { ...flat };
    if (cam.type === "picture-elements") {
      const presets = this._config.cameras[ci]?.ptz?.presets || [];
      cam.ptz = {};
      if(cam.ptz_up)cam.ptz.up=cam.ptz_up; if(cam.ptz_down)cam.ptz.down=cam.ptz_down;
      if(cam.ptz_left)cam.ptz.left=cam.ptz_left; if(cam.ptz_right)cam.ptz.right=cam.ptz_right;
      if(cam.ptz_zoom_in)cam.ptz.zoom_in=cam.ptz_zoom_in; if(cam.ptz_zoom_out)cam.ptz.zoom_out=cam.ptz_zoom_out;
      cam.ptz.presets = presets;
    }
    delete cam.ptz_up; delete cam.ptz_down; delete cam.ptz_left; delete cam.ptz_right; delete cam.ptz_zoom_in; delete cam.ptz_zoom_out;
    return cam;
  }

  _render() {
    if (!this.shadowRoot) return;
    const cams = this._config.cameras || [];
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block} .ed{display:flex;flex-direction:column;gap:16px}
        .blk{border:1px solid var(--divider-color);border-radius:12px;padding:12px;background:var(--card-background-color)}
        details{border:1px solid var(--divider-color);border-radius:10px;margin:6px 0;overflow:hidden}
        summary{cursor:pointer;padding:10px 12px;font-weight:500;background:var(--secondary-background-color);list-style:none}
        summary::-webkit-details-marker{display:none}
        .body{padding:10px 12px} .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
        button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:8px;min-height:34px;padding:0 10px;cursor:pointer;font:inherit;font-size:.85rem}
        button.p{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
        button.d{color:var(--error-color)} button:disabled{opacity:.4;cursor:default}
        h3{margin:0 0 12px;font-size:1rem}
        .pr{display:flex;align-items:center;gap:8px;margin:4px 0}
        .pr span{min-width:65px;font-weight:500;font-size:.85rem}
        .pr input{flex:1;padding:6px;border-radius:6px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:.85rem}
        .lbl{font-size:.85rem;font-weight:600;margin-top:12px;margin-bottom:4px}
      </style>
      <div class="ed">
        <div class="blk"><h3>Allgemein</h3><div id="gf"></div></div>
        <div class="blk"><h3>Kameras</h3><div id="cl"></div><button class="p" id="ac">+ Kamera</button></div>
      </div>`;

    const gf=document.createElement("ha-form"); gf.hass=this._hass;
    gf.data={columns:this._config.columns||2}; gf.schema=[{name:"columns",selector:{number:{min:1,max:4,step:1,mode:"box"}}}];
    gf.computeLabel=(s)=>this._label(s);
    gf.addEventListener("value-changed",(e)=>{this._config={...this._config,...(e.detail?.value||{})};this._fire();});
    this.shadowRoot.getElementById("gf").appendChild(gf);

    const cl=this.shadowRoot.getElementById("cl");
    cams.forEach((cam,i)=>{
      const key=`c:${i}`, lbl=cam.name||cam.entity||cam.type||`Kamera ${i+1}`;
      const det=document.createElement("details"); det.open=this._openKeys.has(key);
      det.addEventListener("toggle",()=>{if(det.open)this._openKeys.add(key);else this._openKeys.delete(key);});

      let presetsHtml="";
      if(cam.type==="picture-elements"){
        const presets=cam.ptz?.presets||[];
        if(presets.length) presetsHtml+=`<div class="lbl">Presets (Ecken des Steuerkreuzes):</div>`;
        presets.forEach((pr,pi)=>{
          presetsHtml+=`<div class="pr"><span>Preset ${pi+1}:</span><input type="text" value="${(pr.service||"").replace(/"/g,"&quot;")}" data-ci="${i}" data-pi="${pi}"/><button type="button" class="d" data-rp data-ci="${i}" data-pi="${pi}">×</button></div>`;
        });
        if(presets.length<4) presetsHtml+=`<button type="button" data-ap data-ci="${i}" style="margin-top:6px">+ Preset</button>`;
      }

      det.innerHTML=`<summary>${lbl}</summary><div class="body"><div class="fh"></div>${presetsHtml}<div class="acts">
        <button type="button" data-a="u" ${i===0?"disabled":""}>↑</button>
        <button type="button" data-a="d" ${i===cams.length-1?"disabled":""}>↓</button>
        <button type="button" class="d" data-a="r">Entfernen</button></div></div>`;

      const form=document.createElement("ha-form"); form.hass=this._hass;
      form.data=this._flatCam(cam); form.schema=this._schema(cam); form.computeLabel=(s)=>this._label(s);
      form.addEventListener("value-changed",(e)=>{this._config.cameras[i]=this._unflatCam(e.detail?.value||{},i);this._fire();});
      det.querySelector(".fh").appendChild(form);

      det.querySelectorAll("input[data-pi]").forEach((inp)=>inp.addEventListener("change",(e)=>{
        this._config.cameras[+e.target.dataset.ci].ptz.presets[+e.target.dataset.pi].service=e.target.value; this._fire();
      }));
      det.querySelectorAll("[data-rp]").forEach((b)=>b.addEventListener("click",(e)=>this._removePreset(+e.target.dataset.ci,+e.target.dataset.pi)));
      det.querySelector("[data-ap]")?.addEventListener("click",(e)=>this._addPreset(+e.target.dataset.ci));
      det.querySelector('[data-a="u"]')?.addEventListener("click",()=>this._moveCamera(i,-1));
      det.querySelector('[data-a="d"]')?.addEventListener("click",()=>this._moveCamera(i,1));
      det.querySelector('[data-a="r"]')?.addEventListener("click",()=>this._removeCamera(i));
      cl.appendChild(det);
    });

    this.shadowRoot.getElementById("ac")?.addEventListener("click",()=>this._addCamera());
    this._rendered=true;
  }
}

// --- Registration ---
if(!customElements.get("camera-grid-card"))customElements.define("camera-grid-card",CameraGridCard);
if(!customElements.get("camera-grid-card-editor"))customElements.define("camera-grid-card-editor",CameraGridCardEditor);
window.customCards=window.customCards||[];
if(!window.customCards.some((c)=>c.type==="camera-grid-card"))window.customCards.push({type:"camera-grid-card",name:"Camera Grid Card",description:"Kamera-Grid mit WebRTC, PTZ, Conditions, Fallback-Bild und Foto/Video-Links.",preview:true});
console.info(`%c CAMERA-GRID-CARD %c v${CAMERA_GRID_CARD_VERSION} `,"color:white;background:#ff5722;font-weight:bold","color:#ff5722;background:white;font-weight:bold");
