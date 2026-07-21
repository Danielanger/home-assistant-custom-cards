/*
 * Home Status Card for Home Assistant
 * Version 1.0.0
 *
 * Configurable chip-row overview card showing weather, energy, presence,
 * device counts and more — styled as rounded pill chips.
 * Card type: custom:home-status-card
 */

const HOME_STATUS_CARD_VERSION = "1.0.1";

class HomeStatusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
  }

  static getStubConfig() {
    return {
      rows: [
        {
          chips: [
            { type: "weather", entity: "weather.forecast_zuhause" },
            { type: "entity", entity: "sensor.stromzahler", icon: "mdi:transmission-tower", name: "Aktuell" },
            { type: "entity", entity: "sensor.solar_leistung", icon: "mdi:solar-power-variant" },
          ],
        },
        {
          chips: [
            { type: "template", entity: "sensor.autarkheitsgrad", icon: "mdi:solar-power", template: "Aktuell {{ states.sensor.autarkheitsgrad.state }}% autark" },
          ],
        },
      ],
    };
  }

  static async getConfigElement() {
    return document.createElement("home-status-card-editor");
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Ungültige Konfiguration");
    }
    this._config = {
      rows: [],
      ...config,
    };
    if (!Array.isArray(this._config.rows)) this._config.rows = [];
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot || !this._config) return;
    if (!this.shadowRoot.querySelector(".status-rows")) {
      this._render();
      return;
    }
    this._updateChips();
  }

  getCardSize() {
    return Math.max(1, (this._config.rows || []).length);
  }

  _getState(entityId) {
    return entityId ? this._hass?.states?.[entityId] : undefined;
  }

  _formatNumber(value, decimals = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return value ?? "—";
    return n.toFixed(decimals).replace(".", ",");
  }

  _evalTemplate(template) {
    // Simple template evaluation supporting {{ states.sensor.xyz.state }}
    // and {{ (states.sensor.xyz.state|float)|round(1) }} patterns
    if (!template || !this._hass) return template || "";
    try {
      return template.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
        return this._evalExpression(expr.trim());
      });
    } catch (e) {
      return template;
    }
  }

  _evalExpression(expr) {
    // Handle states.sensor.xyz.state
    const statesMatch = expr.match(/^states\.([\w.]+)\.state$/);
    if (statesMatch) {
      const entityId = statesMatch[1].replace(/\./, ".");
      const state = this._hass?.states?.[entityId];
      return state ? state.state : "?";
    }

    // Handle (states.sensor.xyz.state|float)|round(N)
    const roundMatch = expr.match(/\(?\s*states\.([\w.]+)\.state\s*\|?\s*float\s*\)?\s*\|\s*round\((\d+)\)/);
    if (roundMatch) {
      const entityId = roundMatch[1];
      const decimals = parseInt(roundMatch[2], 10);
      const state = this._hass?.states?.[entityId];
      if (state) {
        const val = parseFloat(state.state);
        return Number.isFinite(val) ? val.toFixed(decimals) : state.state;
      }
      return "?";
    }

    // Handle addition: (states.a.state|float + states.b.state|float)|round(N)
    const addMatch = expr.match(/\(\s*states\.([\w.]+)\.state\s*\|\s*float\s*\+\s*states\.([\w.]+)\.state\s*\|\s*float\s*\)\s*\|\s*round\((\d+)\)/);
    if (addMatch) {
      const a = parseFloat(this._hass?.states?.[addMatch[1]]?.state || "0");
      const b = parseFloat(this._hass?.states?.[addMatch[2]]?.state || "0");
      const decimals = parseInt(addMatch[3], 10);
      return (a + b).toFixed(decimals);
    }

    // Handle expand('group') | selectattr('state', 'eq', 'on') | list | count
    const expandMatch = expr.match(/expand\(['"](.+?)['"]\)\s*\|\s*selectattr\(['"]state['"]\s*,\s*['"]eq['"]\s*,\s*['"](\w+)['"]\)\s*\|\s*list\s*\|\s*count/);
    if (expandMatch) {
      const groupId = expandMatch[1];
      const targetState = expandMatch[2];
      const group = this._hass?.states?.[groupId];
      if (group?.attributes?.entity_id) {
        const count = group.attributes.entity_id.filter(
          (eid) => this._hass?.states?.[eid]?.state === targetState
        ).length;
        return String(count);
      }
      return "0";
    }

    // Handle array selectattr for covers: [...] | selectattr(...) | list | count
    const arraySelectMatch = expr.match(/\[\s*(states\.[\w.]+(?:\s*,\s*states\.[\w.]+)*)\s*\]\s*\|\s*selectattr\(['"]attributes\.(\w+)['"]\s*,\s*['"]([!=<>]+)['"]\s*,\s*(\d+)\)\s*\|\s*list\s*\|\s*count/);
    if (arraySelectMatch) {
      const entities = arraySelectMatch[1].split(",").map((s) => s.trim().replace(/^states\./, ""));
      const attr = arraySelectMatch[2];
      const op = arraySelectMatch[3];
      const val = Number(arraySelectMatch[4]);
      let count = 0;
      for (const eid of entities) {
        const state = this._hass?.states?.[eid];
        const attrVal = state?.attributes?.[attr];
        if (attrVal !== undefined) {
          if (op === "!=" && attrVal !== val) count++;
          else if (op === "<" && attrVal < val) count++;
          else if (op === ">" && attrVal > val) count++;
          else if (op === "==" && attrVal === val) count++;
        }
      }
      return String(count);
    }

    // Fallback: try to resolve simple states.x.state
    const simpleMatch = expr.match(/states\.([\w.]+)\.state/);
    if (simpleMatch) {
      const state = this._hass?.states?.[simpleMatch[1]];
      return state ? state.state : "?";
    }

    return expr;
  }

  _resolveIconColor(chip) {
    // icon_color can be "amber", "white", or a template like {% if ... %} amber {% else %} white {% endif %}
    const raw = chip.icon_color || "";
    if (!raw.includes("{%")) return raw || "";

    // Evaluate simple {% if is_state('entity', 'on') %} color {% else %} color {% endif %}
    const isStateMatch = raw.match(/is_state\(['"](.+?)['"]\s*,\s*['"](.+?)['"]\)/);
    if (isStateMatch) {
      const entity = this._hass?.states?.[isStateMatch[1]];
      const condition = entity?.state === isStateMatch[2];
      const colorMatch = raw.match(/\{%\s*if.*?%\}\s*(\w+)\s*\{%\s*else\s*%\}\s*(\w+)\s*\{%\s*endif\s*%\}/s);
      if (colorMatch) {
        return condition ? colorMatch[1].trim() : colorMatch[2].trim();
      }
    }

    // Evaluate {% if (state_attr('entity', 'attr') < value) %} color {% else %} color {% endif %}
    const attrMatch = raw.match(/state_attr\(['"](.+?)['"]\s*,\s*['"](.+?)['"]\)\s*([<>=!]+)\s*(\d+)/);
    if (attrMatch) {
      const entity = this._hass?.states?.[attrMatch[1]];
      const attrVal = entity?.attributes?.[attrMatch[2]];
      const op = attrMatch[3];
      const target = Number(attrMatch[4]);
      let condition = false;
      if (attrVal !== undefined) {
        if (op === "<") condition = attrVal < target;
        else if (op === ">") condition = attrVal > target;
        else if (op === "==" || op === "===") condition = attrVal === target;
        else if (op === "!=" || op === "!==") condition = attrVal !== target;
      }
      const colorMatch = raw.match(/\{%\s*if.*?%\}\s*(\w+)\s*\{%\s*else\s*%\}\s*(\w+)\s*\{%\s*endif\s*%\}/s);
      if (colorMatch) {
        return condition ? colorMatch[1].trim() : colorMatch[2].trim();
      }
    }

    return "";
  }

  _iconColorToCSS(colorName) {
    const map = {
      amber: "rgb(255, 193, 7)",
      yellow: "rgb(255, 235, 59)",
      red: "rgb(244, 67, 54)",
      green: "rgb(76, 175, 80)",
      blue: "rgb(33, 150, 243)",
      white: "var(--primary-text-color)",
      orange: "rgb(255, 152, 0)",
      purple: "rgb(156, 39, 176)",
      cyan: "rgb(0, 188, 212)",
      "": "var(--primary-text-color)",
    };
    return map[colorName] || colorName || "var(--primary-text-color)";
  }

  _chipContent(chip) {
    if (!this._hass) return "";

    switch (chip.type) {
      case "weather": {
        const state = this._getState(chip.entity);
        if (!state) return "";
        const temp = state.attributes?.temperature ?? "";
        const unit = state.attributes?.temperature_unit || "°C";
        const condition = state.state || "";
        const conditionMap = {
          "clear-night": "Klar", cloudy: "Bewölkt", fog: "Nebel",
          hail: "Hagel", lightning: "Gewitter", partlycloudy: "Teilweise bewölkt",
          pouring: "Starkregen", rainy: "Regen", snowy: "Schnee",
          sunny: "Sonnig", windy: "Windig", exceptional: "Außergewöhnlich",
          "lightning-rainy": "Gewitter mit Regen", "snowy-rainy": "Schneeregen",
          "windy-variant": "Windig",
        };
        const parts = [];
        if (chip.show_conditions !== false) parts.push(conditionMap[condition] || condition);
        if (chip.show_temperature !== false) parts.push(`${temp} ${unit}`);
        return parts.join(" · ");
      }

      case "entity": {
        const state = this._getState(chip.entity);
        if (!state) return chip.name || "";
        const unit = state.attributes?.unit_of_measurement || "";
        const name = chip.name || state.attributes?.friendly_name || "";
        return name ? `${name} ${state.state} ${unit}`.trim() : `${state.state} ${unit}`.trim();
      }

      case "template": {
        return this._evalTemplate(chip.content || chip.template || "");
      }

      default:
        return "";
    }
  }

  _chipIcon(chip) {
    if (chip.icon) return chip.icon;
    if (chip.type === "weather") {
      const state = this._getState(chip.entity);
      const condition = state?.state || "cloudy";
      const iconMap = {
        "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy",
        fog: "mdi:weather-fog", hail: "mdi:weather-hail",
        lightning: "mdi:weather-lightning", partlycloudy: "mdi:weather-partly-cloudy",
        pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy",
        snowy: "mdi:weather-snowy", sunny: "mdi:weather-sunny",
        windy: "mdi:weather-windy", exceptional: "mdi:alert-circle-outline",
        "lightning-rainy": "mdi:weather-lightning-rainy",
        "snowy-rainy": "mdi:weather-snowy-rainy", "windy-variant": "mdi:weather-windy-variant",
      };
      return iconMap[condition] || "mdi:weather-cloudy";
    }
    if (chip.type === "entity") {
      const state = this._getState(chip.entity);
      return state?.attributes?.icon || "mdi:information-outline";
    }
    return "mdi:information-outline";
  }

  _handleChipAction(chip, actionType) {
    const actionConfig = chip[actionType] || chip.tap_action;
    if (!actionConfig || actionConfig.action === "none") return;

    if (actionConfig.action === "navigate" && actionConfig.navigation_path) {
      const path = actionConfig.navigation_path;
      if (/^https?:\/\//i.test(path)) {
        window.location.href = path;
      } else {
        const url = new URL(path, window.location.href);
        window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
        window.dispatchEvent(new Event("location-changed", { bubbles: true, composed: true }));
      }
      return;
    }

    if (actionConfig.action === "more-info" || actionConfig.action === "toggle") {
      const entityId = chip.entity;
      if (entityId) {
        const event = new Event("hass-more-info", { bubbles: true, composed: true });
        event.detail = { entityId };
        this.dispatchEvent(event);
      }
      return;
    }
  }

  _updateChips() {
    const rows = this._config.rows || [];
    const rowElements = this.shadowRoot.querySelectorAll(".chip-row");

    rowElements.forEach((rowEl, rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return;

      const chipElements = rowEl.querySelectorAll(".chip");
      chipElements.forEach((chipEl, chipIndex) => {
        const chip = row.chips?.[chipIndex];
        if (!chip) return;

        const contentEl = chipEl.querySelector(".chip-text");
        if (contentEl) {
          contentEl.textContent = this._chipContent(chip);
        }

        const iconEl = chipEl.querySelector("ha-icon");
        if (iconEl) {
          iconEl.setAttribute("icon", this._chipIcon(chip));
          const color = this._resolveIconColor(chip);
          iconEl.style.color = this._iconColorToCSS(color);
        }
      });
    });
  }

  _renderChip(chip) {
    const icon = this._escapeHtml(this._chipIcon(chip));
    const content = this._escapeHtml(this._chipContent(chip));
    const color = this._resolveIconColor(chip);
    const iconStyle = color ? `color: ${this._iconColorToCSS(color)}` : "";
    const hasTap = chip.tap_action && chip.tap_action.action !== "none";

    return `
      <button class="chip ${hasTap ? "tappable" : ""}" type="button" aria-label="${content}">
        <ha-icon icon="${icon}" style="${iconStyle}"></ha-icon>
        <span class="chip-text">${content}</span>
      </button>
    `;
  }

  _renderRow(row) {
    const chips = Array.isArray(row.chips) ? row.chips : [];
    const alignment = row.alignment || "center";
    return `
      <div class="chip-row" style="justify-content: ${alignment};">
        ${chips.map((chip) => this._renderChip(chip)).join("")}
      </div>
    `;
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const rows = Array.isArray(this._config.rows) ? this._config.rows : [];

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        ha-card {
          background: transparent;
          box-shadow: none;
          border: none;
          overflow: visible;
          padding: 0;
        }

        .status-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 4px 0;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: none;
          background: var(--ha-card-background, var(--card-background-color));
          color: var(--primary-text-color);
          font: inherit;
          font-size: 0.85rem;
          font-weight: 500;
          line-height: 1.2;
          cursor: default;
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.15));
          transition: transform 100ms ease, box-shadow 100ms ease;
          -webkit-tap-highlight-color: transparent;
        }

        .chip.tappable {
          cursor: pointer;
        }

        .chip.tappable:active {
          transform: scale(0.96);
        }

        @media (hover: hover) and (pointer: fine) {
          .chip.tappable:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transform: translateY(-1px);
          }
        }

        .chip ha-icon {
          --mdc-icon-size: 18px;
          flex-shrink: 0;
        }

        .chip-text {
          white-space: nowrap;
        }

        @media (max-width: 520px) {
          .chip-row {
            gap: 6px;
          }
          .chip {
            padding: 7px 11px;
            font-size: 0.8rem;
          }
          .chip ha-icon {
            --mdc-icon-size: 16px;
          }
        }
      </style>

      <ha-card>
        <div class="status-rows">
          ${rows.map((row) => this._renderRow(row)).join("")}
        </div>
      </ha-card>
    `;

    // Bind tap actions
    const rowElements = this.shadowRoot.querySelectorAll(".chip-row");
    rowElements.forEach((rowEl, rowIndex) => {
      const chipElements = rowEl.querySelectorAll(".chip");
      chipElements.forEach((chipEl, chipIndex) => {
        const chip = rows[rowIndex]?.chips?.[chipIndex];
        if (!chip) return;
        chipEl.addEventListener("click", () => this._handleChipAction(chip, "tap_action"));
      });
    });
  }
}

class HomeStatusCardEditor extends HTMLElement {
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
    if (!Array.isArray(next.rows)) next.rows = [];

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

  _chipSchema(chip) {
    const base = [
      { name: "type", selector: { select: { options: [
        { value: "weather", label: "Wetter" },
        { value: "entity", label: "Entität" },
        { value: "template", label: "Template" },
      ] } } },
      { name: "entity", selector: { entity: {} } },
      { name: "icon", selector: { icon: {} } },
    ];

    if (chip.type !== "template") {
      base.push({ name: "name", selector: { text: {} } });
    }

    if (chip.type === "weather") {
      base.push({ name: "show_temperature", selector: { boolean: {} } });
      base.push({ name: "show_conditions", selector: { boolean: {} } });
    }

    if (chip.type === "template") {
      base.push({ name: "content", selector: { text: { multiline: true } } });
      base.push({ name: "icon_color", selector: { text: { multiline: true } } });
    }

    base.push({ name: "tap_action_type", selector: { select: { options: [
      { value: "none", label: "Keine Aktion" },
      { value: "more-info", label: "Mehr Infos" },
      { value: "navigate", label: "Navigieren" },
    ] } } });

    if (chip.tap_action_type === "navigate" || chip.tap_action?.action === "navigate") {
      base.push({ name: "navigation_path", selector: { text: {} } });
    }

    return base;
  }

  _chipLabel(schema) {
    const labels = {
      type: "Typ",
      entity: "Entität",
      icon: "Icon",
      name: "Anzeigename",
      content: "Template-Inhalt ({{ states.sensor.xyz.state }} Syntax)",
      icon_color: "Icon-Farbe (z.B. amber, oder Template)",
      show_temperature: "Temperatur anzeigen",
      show_conditions: "Zustand anzeigen",
      tap_action_type: "Tap-Aktion",
      navigation_path: "Navigationspfad",
    };
    return labels[schema.name] || schema.name;
  }

  _addRow() {
    this._config.rows.push({ chips: [], alignment: "center" });
    this._fire();
    this._render();
  }

  _removeRow(index) {
    this._config.rows.splice(index, 1);
    this._fire();
    this._render();
  }

  _moveRow(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this._config.rows.length) return;
    const rows = this._config.rows;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this._fire();
    this._render();
  }

  _addChip(rowIndex) {
    this._config.rows[rowIndex].chips.push({
      type: "entity", entity: "", icon: "", name: "",
      tap_action: { action: "more-info" },
    });
    this._openKeys.add(`${rowIndex}:${this._config.rows[rowIndex].chips.length - 1}`);
    this._fire();
    this._render();
  }

  _removeChip(rowIndex, chipIndex) {
    this._config.rows[rowIndex].chips.splice(chipIndex, 1);
    this._fire();
    this._render();
  }

  _moveChip(rowIndex, chipIndex, direction) {
    const target = chipIndex + direction;
    const chips = this._config.rows[rowIndex].chips;
    if (target < 0 || target >= chips.length) return;
    [chips[chipIndex], chips[target]] = [chips[target], chips[chipIndex]];
    this._fire();
    this._render();
  }

  _render() {
    if (!this.shadowRoot) return;
    const rows = this._config.rows || [];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .editor { display: flex; flex-direction: column; gap: 16px; }
        .row-block {
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          padding: 12px;
          background: var(--card-background-color);
        }
        .row-header {
          display: flex; align-items: center; gap: 8px;
          font-weight: 600; margin-bottom: 8px;
        }
        .row-header span { flex: 1; }
        details {
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          margin: 6px 0;
          overflow: hidden;
        }
        summary {
          cursor: pointer; padding: 10px 12px; font-weight: 500;
          background: var(--secondary-background-color);
          display: flex; align-items: center; gap: 8px;
          list-style: none;
        }
        summary::-webkit-details-marker { display: none; }
        .chip-body { padding: 10px 12px; }
        .chip-actions {
          display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;
        }
        button {
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          border-radius: 8px; min-height: 34px; padding: 0 10px;
          cursor: pointer; font: inherit; font-size: 0.85rem;
        }
        button.primary {
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          border-color: var(--primary-color);
        }
        button.danger { color: var(--error-color); }
        button:disabled { opacity: 0.4; cursor: default; }
        .empty { color: var(--secondary-text-color); padding: 4px 0; font-size: 0.9rem; }
      </style>

      <div class="editor">
        ${rows.map((row, ri) => this._renderRowEditor(row, ri, rows.length)).join("")}
        <button class="primary" id="add-row" type="button">+ Zeile hinzufügen</button>
      </div>
    `;

    // Bind row-level actions
    this.shadowRoot.getElementById("add-row")?.addEventListener("click", () => this._addRow());

    rows.forEach((row, ri) => {
      const block = this.shadowRoot.querySelector(`[data-row-index="${ri}"]`);
      if (!block) return;

      block.querySelector('[data-action="row-up"]')?.addEventListener("click", () => this._moveRow(ri, -1));
      block.querySelector('[data-action="row-down"]')?.addEventListener("click", () => this._moveRow(ri, 1));
      block.querySelector('[data-action="row-remove"]')?.addEventListener("click", () => this._removeRow(ri));
      block.querySelector('[data-action="add-chip"]')?.addEventListener("click", () => this._addChip(ri));

      // Bind chip-level actions
      const chips = row.chips || [];
      chips.forEach((chip, ci) => {
        const details = block.querySelector(`[data-chip-index="${ci}"]`);
        if (!details) return;

        details.addEventListener("toggle", () => {
          const key = `${ri}:${ci}`;
          if (details.open) this._openKeys.add(key);
          else this._openKeys.delete(key);
        });

        const formHost = details.querySelector(".form-host");
        if (formHost) {
          const form = document.createElement("ha-form");
          form.hass = this._hass;

          // Decompose tap_action into flat fields for the UI
          const tapAction = chip.tap_action || { action: "none" };
          const formData = {
            ...chip,
            tap_action_type: tapAction.action || "none",
            navigation_path: tapAction.navigation_path || "",
          };
          delete formData.tap_action;

          form.data = formData;
          form.schema = this._chipSchema({ ...chip, tap_action_type: formData.tap_action_type });
          form.computeLabel = (s) => this._chipLabel(s);
          form.addEventListener("value-changed", (e) => {
            const val = e.detail?.value || {};

            // Recompose tap_action from flat fields
            const actionType = val.tap_action_type || "none";
            const navPath = val.navigation_path || "";
            const tapActionObj = { action: actionType };
            if (actionType === "navigate") {
              tapActionObj.navigation_path = navPath;
            }

            const chipData = { ...val, tap_action: tapActionObj };
            delete chipData.tap_action_type;
            delete chipData.navigation_path;

            this._config.rows[ri].chips[ci] = chipData;
            this._fire();
          });
          formHost.appendChild(form);
        }

        details.querySelector('[data-action="chip-up"]')?.addEventListener("click", () => this._moveChip(ri, ci, -1));
        details.querySelector('[data-action="chip-down"]')?.addEventListener("click", () => this._moveChip(ri, ci, 1));
        details.querySelector('[data-action="chip-remove"]')?.addEventListener("click", () => this._removeChip(ri, ci));
      });
    });

    this._rendered = true;
  }

  _renderRowEditor(row, rowIndex, totalRows) {
    const chips = row.chips || [];
    return `
      <div class="row-block" data-row-index="${rowIndex}">
        <div class="row-header">
          <span>Zeile ${rowIndex + 1} (${chips.length} Chip${chips.length !== 1 ? "s" : ""})</span>
          <button type="button" data-action="row-up" ${rowIndex === 0 ? "disabled" : ""}>&#8593;</button>
          <button type="button" data-action="row-down" ${rowIndex === totalRows - 1 ? "disabled" : ""}>&#8595;</button>
          <button type="button" class="danger" data-action="row-remove">Entfernen</button>
        </div>
        ${chips.length === 0 ? '<div class="empty">Keine Chips in dieser Zeile.</div>' : ""}
        ${chips.map((chip, ci) => this._renderChipEditor(chip, rowIndex, ci, chips.length)).join("")}
        <button class="primary" type="button" data-action="add-chip">+ Chip hinzufügen</button>
      </div>
    `;
  }

  _renderChipEditor(chip, rowIndex, chipIndex, totalChips) {
    const key = `${rowIndex}:${chipIndex}`;
    const label = chip.name || chip.entity || chip.type || `Chip ${chipIndex + 1}`;
    const isOpen = this._openKeys.has(key);
    return `
      <details data-chip-index="${chipIndex}" ${isOpen ? "open" : ""}>
        <summary>
          <ha-icon icon="${chip.icon || "mdi:circle-outline"}" style="--mdc-icon-size:18px"></ha-icon>
          ${label}
        </summary>
        <div class="chip-body">
          <div class="form-host"></div>
          <div class="chip-actions">
            <button type="button" data-action="chip-up" ${chipIndex === 0 ? "disabled" : ""}>&#8593;</button>
            <button type="button" data-action="chip-down" ${chipIndex === totalChips - 1 ? "disabled" : ""}>&#8595;</button>
            <button type="button" class="danger" data-action="chip-remove">Entfernen</button>
          </div>
        </div>
      </details>
    `;
  }
}


// --- Registration ---

if (!customElements.get("home-status-card")) {
  customElements.define("home-status-card", HomeStatusCard);
}

if (!customElements.get("home-status-card-editor")) {
  customElements.define("home-status-card-editor", HomeStatusCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "home-status-card")) {
  window.customCards.push({
    type: "home-status-card",
    name: "Home Status Card",
    description:
      "Konfigurierbare Chip-Zeilen-Übersicht mit Wetter, Energie, Autarkie, Anwesenheit und Gerätestatus.",
    preview: true,
  });
}

console.info(
  `%c HOME-STATUS-CARD %c v${HOME_STATUS_CARD_VERSION} `,
  "color:white;background:#4caf50;font-weight:bold",
  "color:#4caf50;background:white;font-weight:bold"
);
