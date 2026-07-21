const ROOM_DETAIL_CARD_VERSION = "0.3";

const clone = (value) => {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {}
  }
  return JSON.parse(JSON.stringify(value ?? {}));
};

class RoomDetailCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._generatedCard = undefined;
    this._renderToken = 0;
  }

  static getConfigElement() {
    return document.createElement("room-detail-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:room-detail-card",
      sensors_title: "Sensoren",
      sensors_columns: 3,
      lights_title: "Licht",
      switches_title: "Schalter",
      covers_title: "Beschattung",
      heating_title: "Heizung",
      media_title: "Medien",
      misc_title: "Sonstiges",
      misc_columns: 3,
      solar_title: "Solar",
      solar_columns: 3,
      show_back_button: true,
      back_path: "",
      back_icon: "mdi:arrow-left",
      sensors: [],
      lights: [],
      switches: [],
      covers: [],
      climates: [],
      media_players: [],
      misc: [],
      solar: [],
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (this._generatedCard) {
      this._generatedCard.hass = hass;
    }
  }

  setConfig(config) {
    if (!config) throw new Error("Konfiguration fehlt.");

    this._config = {
      sensors_title: "Sensoren",
      sensors_columns: 3,
      lights_title: "Licht",
      switches_title: "Schalter",
      covers_title: "Beschattung",
      heating_title: "Heizung",
      media_title: "Medien",
      misc_title: "Sonstiges",
      misc_columns: 3,
      solar_title: "Solar",
      solar_columns: 3,
      show_back_button: true,
      back_path: "",
      back_icon: "mdi:arrow-left",
      sensors: [],
      lights: [],
      switches: [],
      covers: [],
      climates: [],
      media_players: [],
      misc: [],
      solar: [],
      ...clone(config),
    };

    for (const key of ["sensors", "lights", "switches", "covers", "climates", "media_players", "misc", "solar"]) {
      if (!Array.isArray(this._config[key])) this._config[key] = [];
    }

    this._renderShell();
    this._buildGeneratedCard();
  }

  getCardSize() {
    const itemCount =
      this._config.sensors.length +
      this._config.lights.length +
      this._config.switches.length +
      this._config.covers.length +
      this._config.climates.length +
      this._config.media_players.length +
      this._config.misc.length +
      this._config.solar.length;
    return Math.max(3, itemCount + 4);
  }

  _renderShell() {
    const showBack = this._config.show_back_button !== false;
    const backIcon = this._config.back_icon || "mdi:arrow-left";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
        }

        #content {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding-bottom: 96px;
        }

        .back-button {
          position: fixed;
          right: max(20px, env(safe-area-inset-right));
          bottom: max(20px, env(safe-area-inset-bottom));
          width: 64px;
          height: 64px;
          border: 1px solid rgba(255, 193, 7, 0.35);
          border-radius: 50%;
          display: ${showBack ? "flex" : "none"};
          align-items: center;
          justify-content: center;
          line-height: 0;
          padding: 0;
          cursor: pointer;
          color: rgb(255, 193, 7);
          background: rgba(255, 193, 7, 0.18);
          box-shadow:
            0 6px 18px rgba(0, 0, 0, 0.35),
            0 2px 6px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 10;
          -webkit-tap-highlight-color: transparent;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }

        .back-button:hover {
          transform: translateY(-1px);
          box-shadow:
            0 8px 22px rgba(0, 0, 0, 0.38),
            0 3px 8px rgba(0, 0, 0, 0.24);
        }

        .back-button:active {
          transform: scale(0.96);
        }

        .back-button ha-icon {
          width: 36px;
          height: 36px;
          --mdc-icon-size: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
        }

        .error {
          padding: 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          color: var(--error-color, #db4437);
          background: var(--ha-card-background, var(--card-background-color));
        }
      </style>

      <div id="content"></div>

      <button class="back-button" type="button" aria-label="Zurück">
        <ha-icon icon="${backIcon}"></ha-icon>
      </button>
    `;

    this.shadowRoot
      .querySelector(".back-button")
      ?.addEventListener("click", () => this._goBack());
  }

  _goBack() {
    const path = String(this._config.back_path || "").trim();

    if (path) {
      history.pushState(null, "", path);
      window.dispatchEvent(new Event("location-changed"));
      return;
    }

    window.history.back();
  }

  async _buildGeneratedCard() {
    const token = ++this._renderToken;
    const host = this.shadowRoot?.getElementById("content");
    if (!host) return;

    try {
      if (typeof window.loadCardHelpers !== "function") {
        throw new Error("Home-Assistant Card Helpers sind nicht verfügbar.");
      }

      const helpers = await window.loadCardHelpers();
      if (token !== this._renderToken) return;

      const stackConfig = this._buildStackConfig();
      const card = await helpers.createCardElement(stackConfig);
      if (token !== this._renderToken) return;

      host.replaceChildren(card);
      this._generatedCard = card;

      if (this._hass) {
        card.hass = this._hass;
      }
    } catch (error) {
      console.error("room-detail-card:", error);
      host.innerHTML = `
        <div class="error">
          <strong>Room Detail Card konnte nicht geladen werden.</strong><br>
          ${String(error?.message || error)}
        </div>
      `;
    }
  }

  _sectionTitle(title) {
    return {
      type: "custom:mushroom-template-card",
      primary: title,
      secondary: "",
      icon: "",
      layout: "horizontal",
      fill_container: false,
      multiline_secondary: false,
      tap_action: { action: "none" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    };
  }

  _buildSensorSection(cards) {
    const sensors = this._config.sensors.filter((item) => item?.entity);
    if (!sensors.length) return;

    cards.push(this._sectionTitle(this._config.sensors_title || "Sensoren"));
    cards.push({
      type: "glance",
      columns: Math.max(1, Number(this._config.sensors_columns) || 3),
      show_icon: true,
      show_name: true,
      show_state: true,
      entities: sensors.map((item) => ({
        entity: item.entity,
        ...(item.name ? { name: item.name } : {}),
        ...(item.icon ? { icon: item.icon } : {}),
      })),
      card_mod: {
        style: "div.entities { justify-content: center; }",
      },
    });
  }


  _buildGlanceSection(cards, items, title, columns = 3) {
    const entries = items.filter((item) => item?.entity);
    if (!entries.length) return;

    cards.push(this._sectionTitle(title));
    cards.push({
      type: "glance",
      columns: Math.max(1, Number(columns) || 3),
      show_icon: true,
      show_name: true,
      show_state: true,
      entities: entries.map((item) => ({
        entity: item.entity,
        ...(item.name ? { name: item.name } : {}),
        ...(item.icon ? { icon: item.icon } : {}),
      })),
    });
  }

  _switchRow(item) {
    return {
      type: "horizontal-stack",
      cards: [
        {
          type: "custom:mushroom-entity-card",
          entity: item.entity,
          ...(item.icon ? { icon: item.icon } : {}),
          primary_info: "none",
          secondary_info: "none",
          tap_action: { action: "toggle" },
          hold_action: { action: "none" },
          double_tap_action: { action: "none" },
          card_mod: {
            style:
              "ha-card { width: 65px; transition-property: none !important; }",
          },
        },
        {
          type: "custom:mushroom-entity-card",
          entity: item.entity,
          ...(item.name ? { name: item.name } : {}),
          icon_type: "none",
          tap_action: { action: "more-info" },
          hold_action: { action: "more-info" },
          double_tap_action: { action: "none" },
          card_mod: {
            style:
              "ha-card { margin-left: calc(-100% + 55px); transition-property: none !important; }",
          },
        },
      ],
    };
  }

  _buildSwitchSection(cards) {
    const switches = this._config.switches.filter((item) => item?.entity);
    if (!switches.length) return;

    cards.push(this._sectionTitle(this._config.switches_title || "Schalter"));
    cards.push(...switches.map((item) => this._switchRow(item)));
  }

  _buildCoverSection(cards) {
    const covers = this._config.covers.filter((item) => item?.entity);
    if (!covers.length) return;

    cards.push(this._sectionTitle(this._config.covers_title || "Beschattung"));

    for (const item of covers) {
      cards.push({
        type: "custom:mushroom-cover-card",
        entity: item.entity,
        ...(item.name ? { name: item.name } : {}),
        ...(item.icon ? { icon: item.icon } : {}),
        show_position_control: item.show_position_control !== false,
        show_buttons_control: item.show_buttons_control !== false,
        show_tilt_position_control: item.show_tilt_position_control === true,
        tap_action: { action: "more-info" },
        hold_action: { action: "more-info" },
        double_tap_action: { action: "none" },
      });
    }
  }

  _buildClimateSection(cards) {
    const climates = this._config.climates.filter((item) => item?.entity);
    if (!climates.length) return;

    cards.push(this._sectionTitle(this._config.heating_title || "Heizung"));

    for (const item of climates) {
      cards.push({
        type: "horizontal-stack",
        cards: [
          {
            type: "custom:mushroom-climate-card",
            entity: item.entity,
            name: item.name || "Thermostat",
            primary_info: "none",
            secondary_info: "none",
            show_temperature_control: false,
            tap_action: { action: "more-info" },
            hold_action: { action: "none" },
            double_tap_action: { action: "none" },
            card_mod: {
              style:
                "ha-card { width: 65px; transition-property: none !important; }",
            },
          },
          {
            type: "custom:mushroom-climate-card",
            entity: item.entity,
            name: item.name || "Thermostat",
            icon_type: "none",
            show_temperature_control: item.show_temperature_control !== false,
            tap_action: { action: "more-info" },
            hold_action: { action: "more-info" },
            double_tap_action: { action: "more-info" },
            card_mod: {
              style:
                "ha-card { margin-left: calc(-100% + 55px); transition-property: none !important; }",
            },
          },
        ],
      });
    }
  }

  _lightRow(item) {
    let row;

    if (item.controls_only) {
      row = {
        type: "custom:mushroom-light-card",
        entity: item.entity,
        icon_type: "none",
        primary_info: "none",
        secondary_info: "none",
        fill_container: true,
        tap_action: { action: "none" },
        hold_action: { action: "more-info" },
        double_tap_action: { action: "none" },
        use_light_color: item.use_light_color !== false,
        show_color_temp_control: item.show_color_temp_control !== false,
        collapsible_controls: false,
        show_color_control: item.show_color_control !== false,
        show_brightness_control: item.show_brightness_control !== false,
        card_mod: {
              style:
                "ha-card { margin-left: calc(60px);; transition-property: none !important; margin-top: -5% }",
            },
      };
    } else {
      row = {
        type: "horizontal-stack",
        cards: [
          {
            type: "custom:mushroom-light-card",
            entity: item.entity,
            ...(item.icon ? { icon: item.icon } : {}),
            primary_info: "none",
            secondary_info: "none",
            use_light_color: false,
            tap_action: { action: "toggle" },
            hold_action: { action: "none" },
            double_tap_action: { action: "none" },
            card_mod: {
              style:
                "ha-card { width: 65px; transition-property: none !important; }",
            },
          },
          {
            type: "custom:mushroom-light-card",
            entity: item.entity,
            ...(item.name ? { name: item.name } : {}),
            icon_type: "none",
            fill_container: false,
            tap_action: { action: "more-info" },
            hold_action: { action: "more-info" },
            double_tap_action: { action: "more-info" },
            use_light_color: item.use_light_color !== false,
            show_color_temp_control: item.show_color_temp_control !== false,
            collapsible_controls: item.collapsible_controls !== false,
            show_color_control: item.show_color_control !== false,
            show_brightness_control: item.show_brightness_control !== false,
            card_mod: {
              style:
                "ha-card { margin-left: calc(-100% + 55px); transition-property: none !important; }",
            },
          },
        ],
      };
    }

    if (item.condition_entity) {
      return {
        type: "conditional",
        conditions: [
          {
            condition: "state",
            entity: item.condition_entity,
            state: item.condition_state || "on",
          },
        ],
        card: item.controls_only ? row : row,
      };
    }

    return row;
  }

  _buildLightSection(cards) {
    const lights = this._config.lights.filter((item) => item?.entity);
    if (!lights.length) return;

    cards.push(this._sectionTitle(this._config.lights_title || "Licht"));
    cards.push(...lights.map((item) => this._lightRow(item)));
  }

  _buildMediaSection(cards) {
    const players = this._config.media_players.filter((item) => item?.entity);
    if (!players.length) return;

    cards.push(this._sectionTitle(this._config.media_title || "Medien"));

    for (const item of players) {
      cards.push({
        type: "custom:mushroom-media-player-card",
        entity: item.entity,
        ...(item.name ? { name: item.name } : {}),
        collapsible_controls: item.collapsible_controls === true,
        tap_action: { action: "more-info" },
        hold_action: { action: "more-info" },
        double_tap_action: { action: "more-info" },
        media_controls: ["play_pause_stop"],
        show_volume_level: item.show_volume_level !== false,
        use_media_info: item.use_media_info !== false,
        volume_controls: ["volume_mute", "volume_set", "volume_buttons"],
      });
    }
  }

  _buildStackConfig() {
    const cards = [];

    this._buildSensorSection(cards);
    this._buildLightSection(cards);
    this._buildSwitchSection(cards);
    this._buildCoverSection(cards);
    this._buildClimateSection(cards);
    this._buildMediaSection(cards);
    this._buildGlanceSection(
      cards,
      this._config.misc,
      this._config.misc_title || "Sonstiges",
      this._config.misc_columns
    );
    this._buildGlanceSection(
      cards,
      this._config.solar,
      this._config.solar_title || "Solar",
      this._config.solar_columns
    );

    return {
      type: "custom:stack-in-card",
      mode: "vertical",
      cards,
    };
  }
}

customElements.define("room-detail-card", RoomDetailCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "room-detail-card",
  name: "Room Detail Card",
  description:
    "Konfigurierbare Raumdetailseite mit Sensoren, Licht, Schaltern, Beschattung, Heizung, Medien, Sonstigem, Solar und festem Zurück-Button.",
  preview: true,
  documentationURL: "",
});

class RoomDetailCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = RoomDetailCard.getStubConfig();
    this._hass = undefined;
    this._rendered = false;
    this._openKeys = new Set();
    this._openStateInitialized = false;
    this._emittedHashes = new Set();
  }

  set hass(hass) {
    this._hass = hass;

    if (this._rendered) {
      this.shadowRoot?.querySelectorAll("ha-form").forEach((form) => {
        form.hass = hass;
      });
      return;
    }

    this._render();
  }

  setConfig(config) {
    const nextConfig = {
      ...RoomDetailCard.getStubConfig(),
      ...clone(config || {}),
    };

    for (const key of ["sensors", "lights", "switches", "covers", "climates", "media_players", "misc", "solar"]) {
      if (!Array.isArray(nextConfig[key])) nextConfig[key] = [];
    }

    const hash = JSON.stringify(nextConfig);
    const isOwnEcho = this._emittedHashes.has(hash);
    this._config = nextConfig;

    if (isOwnEcho && this._rendered) {
      this._emittedHashes.delete(hash);
      return;
    }

    this._captureOpenState();
    this._render();
  }

  _fireChanged() {
    const config = clone(this._config);
    const hash = JSON.stringify(config);
    this._emittedHashes.add(hash);

    while (this._emittedHashes.size > 30) {
      this._emittedHashes.delete(this._emittedHashes.values().next().value);
    }

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _labels(schema) {
    const labels = {
      sensors_title: "Überschrift Sensoren",
      sensors_columns: "Spalten bei Sensoren",
      lights_title: "Überschrift Licht",
      switches_title: "Überschrift Schalter",
      covers_title: "Überschrift Beschattung",
      heating_title: "Überschrift Heizung",
      media_title: "Überschrift Medien",
      misc_title: "Überschrift Sonstiges",
      misc_columns: "Spalten bei Sonstiges",
      solar_title: "Überschrift Solar",
      solar_columns: "Spalten bei Solar",
      show_back_button: "Floating Zurück-Button anzeigen",
      back_path: "Fester Zurück-Navigationspfad (leer = Browser zurück)",
      back_icon: "Icon des Zurück-Buttons",
      entity: "Entität",
      name: "Anzeigename",
      icon: "Icon (optional)",
      show_temperature_control: "Temperatursteuerung anzeigen",
      use_light_color: "Lichtfarbe verwenden",
      show_brightness_control: "Helligkeitsregler",
      show_color_temp_control: "Farbtemperaturregler",
      show_color_control: "Farbregler",
      collapsible_controls: "Bedienelemente einklappbar",
      controls_only: "Nur Steuerung (ohne Icon/Name)",
      condition_entity: "Nur anzeigen, wenn Entität ...",
      condition_state: "... diesen Zustand hat",
      show_volume_level: "Lautstärke anzeigen",
      use_media_info: "Medieninformationen anzeigen",
      show_position_control: "Positionsregler anzeigen",
      show_buttons_control: "Auf / Stop / Ab anzeigen",
      show_tilt_position_control: "Lamellenposition anzeigen",
    };
    return labels[schema.name] || schema.name;
  }

  _computeLabel = (schema) => this._labels(schema);

  _captureOpenState() {
    if (!this._rendered || !this.shadowRoot) return;

    const open = new Set();
    this.shadowRoot
      .querySelectorAll("details[data-open-key]")
      .forEach((details) => {
        if (details.open) open.add(details.dataset.openKey);
      });

    if (open.size || this.shadowRoot.querySelector("details[data-open-key]")) {
      this._openKeys = open;
      this._openStateInitialized = true;
    }
  }

  _globalSchema() {
    return [
      { name: "sensors_title", selector: { text: {} } },
      { name: "sensors_columns", selector: { number: { min: 1, max: 8, step: 1, mode: "box" } } },
      { name: "lights_title", selector: { text: {} } },
      { name: "switches_title", selector: { text: {} } },
      { name: "covers_title", selector: { text: {} } },
      { name: "heating_title", selector: { text: {} } },
      { name: "media_title", selector: { text: {} } },
      { name: "misc_title", selector: { text: {} } },
      { name: "misc_columns", selector: { number: { min: 1, max: 8, step: 1, mode: "box" } } },
      { name: "solar_title", selector: { text: {} } },
      { name: "solar_columns", selector: { number: { min: 1, max: 8, step: 1, mode: "box" } } },
      { name: "show_back_button", selector: { boolean: {} } },
      { name: "back_path", selector: { text: {} } },
      { name: "back_icon", selector: { icon: {} } },
    ];
  }

  _schemaFor(key) {
    if (key === "sensors") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
      ];
    }


    if (key === "switches") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
      ];
    }

    if (key === "covers") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "show_position_control", selector: { boolean: {} } },
        { name: "show_buttons_control", selector: { boolean: {} } },
        { name: "show_tilt_position_control", selector: { boolean: {} } },
      ];
    }

    if (key === "misc" || key === "solar") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
      ];
    }

    if (key === "climates") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "show_temperature_control", selector: { boolean: {} } },
      ];
    }

    if (key === "lights") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "controls_only", selector: { boolean: {} } },
        { name: "use_light_color", selector: { boolean: {} } },
        { name: "show_brightness_control", selector: { boolean: {} } },
        { name: "show_color_temp_control", selector: { boolean: {} } },
        { name: "show_color_control", selector: { boolean: {} } },
        { name: "collapsible_controls", selector: { boolean: {} } },
        { name: "condition_entity", selector: { entity: {} } },
        { name: "condition_state", selector: { text: {} } },
      ];
    }

    if (key === "media_players") {
      return [
        { name: "entity", selector: { entity: {} } },
        { name: "name", selector: { text: {} } },
        { name: "show_volume_level", selector: { boolean: {} } },
        { name: "use_media_info", selector: { boolean: {} } },
        { name: "collapsible_controls", selector: { boolean: {} } },
      ];
    }

    return [];
  }

  _defaultItem(key) {
    if (key === "sensors") {
      return { entity: "", name: "", icon: "" };
    }

    if (key === "switches") {
      return { entity: "", name: "", icon: "" };
    }
    if (key === "covers") {
      return {
        entity: "",
        name: "",
        icon: "",
        show_position_control: true,
        show_buttons_control: true,
        show_tilt_position_control: false,
      };
    }
    if (key === "misc" || key === "solar") {
      return { entity: "", name: "", icon: "" };
    }
    if (key === "climates") {
      return {
        entity: "",
        name: "Thermostat",
        show_temperature_control: true,
      };
    }
    if (key === "lights") {
      return {
        entity: "",
        name: "",
        icon: "",
        controls_only: false,
        use_light_color: true,
        show_brightness_control: true,
        show_color_temp_control: true,
        show_color_control: true,
        collapsible_controls: true,
        condition_entity: "",
        condition_state: "on",
      };
    }
    if (key === "media_players") {
      return {
        entity: "",
        name: "",
        show_volume_level: true,
        use_media_info: true,
        collapsible_controls: false,
      };
    }
    return {};
  }

  _collectionLabel(key) {
    return {
      sensors: "Sensoren",
      lights: "Licht",
      switches: "Schalter",
      covers: "Beschattung",
      climates: "Heizungen / Thermostate",
      media_players: "Medien",
      misc: "Sonstiges",
      solar: "Solar",
    }[key] || key;
  }

  _itemLabel(key, item, index) {
    if (item?.name) return item.name;
    if (item?.entity) return item.entity;
    return `${this._collectionLabel(key)} ${index + 1}`;
  }

  _addItem(key) {
    this._captureOpenState();
    const list = [...this._config[key], this._defaultItem(key)];
    this._config[key] = list;

    const newKey = `${key}:${list.length - 1}`;
    this._openKeys.add(newKey);
    this._openStateInitialized = true;

    this._fireChanged();
    this._render();
  }

  _removeItem(key, index) {
    this._captureOpenState();
    this._config[key] = this._config[key].filter((_, i) => i !== index);

    const adjusted = new Set();
    this._openKeys.forEach((openKey) => {
      const [openCollection, rawIndex] = openKey.split(":");
      if (openCollection !== key) {
        adjusted.add(openKey);
        return;
      }

      const openIndex = Number(rawIndex);
      if (openIndex < index) adjusted.add(openKey);
      if (openIndex > index) adjusted.add(`${key}:${openIndex - 1}`);
    });
    this._openKeys = adjusted;

    this._fireChanged();
    this._render();
  }

  _moveItem(key, index, direction) {
    const target = index + direction;
    const list = this._config[key];
    if (target < 0 || target >= list.length) return;

    this._captureOpenState();

    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    this._config[key] = next;

    const currentKey = `${key}:${index}`;
    const targetKey = `${key}:${target}`;
    const currentOpen = this._openKeys.has(currentKey);
    const targetOpen = this._openKeys.has(targetKey);

    this._openKeys.delete(currentKey);
    this._openKeys.delete(targetKey);
    if (currentOpen) this._openKeys.add(targetKey);
    if (targetOpen) this._openKeys.add(currentKey);

    this._fireChanged();
    this._render();
  }

  _render() {
    if (!this.shadowRoot) return;

    if (!this._openStateInitialized) {
      this._openKeys = new Set();
      this._openStateInitialized = true;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }

        .editor {
          display: grid;
          gap: 16px;
        }

        .block {
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          padding: 12px;
        }

        h3 {
          margin: 0 0 12px;
          font-size: 1rem;
        }

        details {
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          margin: 8px 0;
          overflow: hidden;
        }

        summary {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 12px;
          cursor: pointer;
          font-weight: 600;
          background: var(--secondary-background-color);
        }

        .item-body {
          padding: 12px;
        }

        .buttons {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        button {
          border: 0;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
        }

        button.primary {
          color: var(--text-primary-color);
          background: var(--primary-color);
        }

        button.danger {
          color: var(--error-color);
        }

        .empty {
          color: var(--secondary-text-color);
          padding: 4px 0 8px;
        }
      </style>

      <div class="editor">
        <div class="block">
          <h3>Allgemein</h3>
          <div id="global-form"></div>
        </div>

        ${["sensors", "lights", "switches", "covers", "climates", "media_players", "misc", "solar"]
          .map(
            (key) => `
              <div class="block" data-collection="${key}">
                <h3>${this._collectionLabel(key)}</h3>
                <div class="items" id="items-${key}"></div>
                <button class="primary add-item" data-key="${key}" type="button">
                  + Hinzufügen
                </button>
              </div>
            `
          )
          .join("")}
      </div>
    `;

    const globalHost = this.shadowRoot.getElementById("global-form");
    const globalForm = document.createElement("ha-form");
    globalForm.hass = this._hass;
    globalForm.data = {
      sensors_title: this._config.sensors_title,
      sensors_columns: this._config.sensors_columns,
      lights_title: this._config.lights_title,
      switches_title: this._config.switches_title,
      covers_title: this._config.covers_title,
      heating_title: this._config.heating_title,
      media_title: this._config.media_title,
      misc_title: this._config.misc_title,
      misc_columns: this._config.misc_columns,
      solar_title: this._config.solar_title,
      solar_columns: this._config.solar_columns,
      show_back_button: this._config.show_back_button,
      back_path: this._config.back_path,
      back_icon: this._config.back_icon,
    };
    globalForm.schema = this._globalSchema();
    globalForm.computeLabel = this._computeLabel;
    globalForm.addEventListener("value-changed", (event) => {
      this._config = {
        ...this._config,
        ...(event.detail?.value || {}),
      };
      this._fireChanged();
    });
    globalHost.appendChild(globalForm);

    for (const key of ["sensors", "lights", "switches", "covers", "climates", "media_players", "misc", "solar"]) {
      const host = this.shadowRoot.getElementById(`items-${key}`);
      const list = this._config[key];

      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Noch keine Einträge konfiguriert.";
        host.appendChild(empty);
      }

      list.forEach((item, index) => {
        const openKey = `${key}:${index}`;
        const details = document.createElement("details");
        details.dataset.openKey = openKey;
        details.open = this._openKeys.has(openKey);

        const summary = document.createElement("summary");
        const summaryText = document.createElement("span");
        summaryText.textContent = this._itemLabel(key, item, index);
        summary.appendChild(summaryText);

        const body = document.createElement("div");
        body.className = "item-body";

        const form = document.createElement("ha-form");
        form.hass = this._hass;
        form.data = clone(item);
        form.schema = this._schemaFor(key);
        form.computeLabel = this._computeLabel;

        form.addEventListener("value-changed", (event) => {
          const values = event.detail?.value || {};
          const next = [...this._config[key]];
          next[index] = { ...next[index], ...values };
          this._config[key] = next;
          summaryText.textContent = this._itemLabel(key, next[index], index);
          this._fireChanged();
        });

        const buttons = document.createElement("div");
        buttons.className = "buttons";
        buttons.innerHTML = `
          <button type="button" data-action="up">↑ Hoch</button>
          <button type="button" data-action="down">↓ Runter</button>
          <button type="button" class="danger" data-action="remove">Entfernen</button>
        `;

        buttons
          .querySelector('[data-action="up"]')
          .addEventListener("click", () => this._moveItem(key, index, -1));
        buttons
          .querySelector('[data-action="down"]')
          .addEventListener("click", () => this._moveItem(key, index, 1));
        buttons
          .querySelector('[data-action="remove"]')
          .addEventListener("click", () => this._removeItem(key, index));

        details.addEventListener("toggle", () => {
          if (details.open) this._openKeys.add(openKey);
          else this._openKeys.delete(openKey);
        });

        body.appendChild(form);
        body.appendChild(buttons);
        details.appendChild(summary);
        details.appendChild(body);
        host.appendChild(details);
      });
    }

    this.shadowRoot.querySelectorAll(".add-item").forEach((button) => {
      button.addEventListener("click", () => this._addItem(button.dataset.key));
    });

    this._rendered = true;
  }
}

customElements.define("room-detail-card-editor", RoomDetailCardEditor);

console.info(
  `%c ROOM-DETAIL-CARD %c v${ROOM_DETAIL_CARD_VERSION} `,
  "color: white; background: #2196f3; font-weight: 700;",
  "color: #2196f3; background: white; font-weight: 700;"
);
