/*
 * Room Navigation Card for Home Assistant
 * Version 0.3.1
 *
 * Reusable room / navigation overview card with visual editor.
 * Card type: custom:room-navigation-card
 */

const ROOM_NAV_CARD_VERSION = "0.5.0";
const ACTIVE_STATES = new Set([
  "on",
  "open",
  "opening",
  "unlocked",
  "home",
  "playing",
  "heat",
  "heating",
]);

class RoomNavigationCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
  }

  static getStubConfig() {
    return {
      title: "Räume",
      columns: 3,
      show_greeting: false,
      show_title: true,
      show_info: true,
      rooms: [
        {
          name: "Wohnzimmer",
          icon: "mdi:sofa",
          navigation_path: "wohnzimmer",
          status_entities: [],
          climate_entity: "",
          temperature_entity: "",
          humidity_entity: "",
          door_entities: [],
          window_entities: [],
          heating_entities: [],
          electric_heating_entities: [],
          fan_entities: [],
          motion_entities: [],
        },
      ],
    };
  }

  static async getConfigElement() {
    await ensureEditorDependencies();
    return document.createElement("room-navigation-card-editor");
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Ungültige Konfiguration");
    }

    this._config = {
      title: "Räume",
      columns: 3,
      show_greeting: false,
      show_title: true,
      show_info: true,
      rooms: [],
      ...config,
    };

    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot || !this._config) return;

    // If not rendered yet, do a full render
    if (!this.shadowRoot.querySelector(".grid")) {
      this._render();
      return;
    }

    // Incremental update: only update dynamic content
    this._updateRoomStates();
  }

  _updateRoomStates() {
    const rooms = Array.isArray(this._config.rooms) ? this._config.rooms : [];
    const tiles = this.shadowRoot.querySelectorAll(".room-tile");

    tiles.forEach((tile, index) => {
      const room = rooms[index];
      if (!room) return;

      const isActive = this._anyActive(room.status_entities || room.status_entity);
      tile.classList.toggle("active", isActive);
      tile.classList.toggle("inactive", !isActive);

      // Update info text
      const showInfo = this._config.show_info !== false;
      if (showInfo) {
        const infoEl = tile.querySelector(".room-info");
        if (infoEl) {
          const info = this._roomInfo(room);
          infoEl.innerHTML = info ? escapeHtml(info) : "&nbsp;";
        }
      }

      // Update status icons
      const oldOpenings = tile.querySelector(".openings");
      const oldActivity = tile.querySelector(".activity-icons");
      if (oldOpenings) oldOpenings.remove();
      if (oldActivity) oldActivity.remove();

      const statusHtml = this._renderStatusIcons(room);
      if (statusHtml.trim()) {
        tile.insertAdjacentHTML("afterbegin", statusHtml);
      }
    });

    // Update greeting if shown
    if (this._config.show_greeting) {
      const greetingEl = this.shadowRoot.querySelector(".greeting");
      if (greetingEl) {
        greetingEl.textContent = this._greeting();
      }
    }
  }

  getCardSize() {
    const roomCount = Array.isArray(this._config.rooms)
      ? this._config.rooms.length
      : 0;
    const columns = Math.max(1, Number(this._config.columns) || 3);

    return Math.max(
      2,
      Math.ceil(roomCount / columns) * 3 +
        (this._config.show_greeting ? 2 : 1)
    );
  }

  _isActive(entityId) {
    const stateObj = entityId ? this._hass?.states?.[entityId] : undefined;
    if (!stateObj) return false;

    return ACTIVE_STATES.has(String(stateObj.state).toLowerCase());
  }

  _anyActive(entityIds) {
    return normalizeEntityList(entityIds).some((entityId) =>
      this._isActive(entityId)
    );
  }

  _formatNumber(value, decimals = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value ?? "—";

    return numeric.toFixed(decimals).replace(".", ",");
  }

  _unit(entityId) {
    return (
      this._hass?.states?.[entityId]?.attributes?.unit_of_measurement || ""
    );
  }

  _roomInfo(room) {
    if (!this._hass) return "";

    if (room.climate_entity) {
      const climate = this._hass.states[room.climate_entity];

      if (climate) {
        const current = climate.attributes?.current_temperature;
        const target = climate.attributes?.temperature;
        const unit =
          this._hass.config?.unit_system?.temperature || "°C";

        if (
          current !== undefined &&
          target !== undefined &&
          target !== null
        ) {
          return `${this._formatNumber(current)}${unit} → ${this._formatNumber(
            target
          )}${unit}`;
        }

        if (current !== undefined) {
          return `${this._formatNumber(current)}${unit}`;
        }
      }
    }

    if (room.temperature_entity || room.humidity_entity) {
      const values = [];

      if (room.temperature_entity) {
        const state = this._hass.states[room.temperature_entity];

        if (state) {
          const unit = this._unit(room.temperature_entity) || "°C";
          values.push(`${this._formatNumber(state.state, 2)}${unit}`);
        }
      }

      if (room.humidity_entity) {
        const state = this._hass.states[room.humidity_entity];

        if (state) {
          const unit = this._unit(room.humidity_entity) || "%";
          values.push(`${this._formatNumber(state.state, 2)}${unit}`);
        }
      }

      return values.join(" / ");
    }

    if (room.info_entity) {
      const state = this._hass.states[room.info_entity];

      if (state) {
        return `${state.state}${this._unit(room.info_entity)}`;
      }
    }

    return "";
  }

  _greeting() {
    const hour = new Date().getHours();
    const userName = this._hass?.user?.name || "";

    if (hour >= 18) {
      return `Guten Abend${userName ? `, ${userName}` : ""}!`;
    }

    if (hour >= 12) {
      return `Hallo${userName ? `, ${userName}` : ""}!`;
    }

    if (hour >= 5) {
      return `Guten Morgen${userName ? `, ${userName}` : ""}!`;
    }

    return `Hallo${userName ? `, ${userName}` : ""}!`;
  }

  _renderStatusIcons(room) {
    const doorsOpen = this._anyActive(
      room.door_entities || room.door_entity
    );
    const windowsOpen = this._anyActive(
      room.window_entities || room.window_entity
    );
    const heatingActive = this._anyActive(
      room.heating_entities || room.heating_entity
    );
    const electricHeatingActive = this._anyActive(
      room.electric_heating_entities || room.electric_heating_entity
    );
    const fanActive = this._anyActive(
      room.fan_entities || room.fan_entity
    );
    const motionActive = this._anyActive(
      room.motion_entities || room.motion_entity
    );

    const leftIcons = [
      doorsOpen
        ? '<ha-icon icon="mdi:door-open" title="Tür offen"></ha-icon>'
        : "",
      windowsOpen
        ? '<ha-icon icon="mdi:window-open" title="Fenster offen"></ha-icon>'
        : "",
    ]
      .filter(Boolean)
      .join("");

    const rightIcons = [
      heatingActive
        ? '<ha-icon icon="mdi:heat-wave" title="Heizungsanforderung aktiv"></ha-icon>'
        : "",
      electricHeatingActive
        ? '<ha-icon icon="mdi:flash" title="Elektrische Heizung aktiv"></ha-icon>'
        : "",
      fanActive
        ? '<ha-icon icon="mdi:fan" title="Lüfter aktiv"></ha-icon>'
        : "",
      motionActive
        ? '<ha-icon icon="mdi:run" title="Bewegung erkannt"></ha-icon>'
        : "",
    ]
      .filter(Boolean)
      .join("");

    if (!leftIcons && !rightIcons) return "";

    return `
      ${
        leftIcons
          ? `<div class="openings" aria-label="Offene Fenster oder Türen">${leftIcons}</div>`
          : ""
      }
      ${
        rightIcons
          ? `<div class="activity-icons" aria-label="Aktive Raumstatus">${rightIcons}</div>`
          : ""
      }
    `;
  }

  _resolveColor(room) {
    // Support fixed icon_color per tile (e.g. "red", "green", "amber")
    // Also supports a color_entity: if that entity is active, use active color
    const colorMap = {
      amber: { fg: "rgb(255, 193, 7)", bg: "rgba(255, 193, 7, 0.2)" },
      yellow: { fg: "rgb(255, 235, 59)", bg: "rgba(255, 235, 59, 0.2)" },
      red: { fg: "rgb(244, 67, 54)", bg: "rgba(244, 67, 54, 0.2)" },
      green: { fg: "rgb(76, 175, 80)", bg: "rgba(76, 175, 80, 0.2)" },
      blue: { fg: "rgb(33, 150, 243)", bg: "rgba(33, 150, 243, 0.2)" },
      orange: { fg: "rgb(255, 152, 0)", bg: "rgba(255, 152, 0, 0.2)" },
      purple: { fg: "rgb(156, 39, 176)", bg: "rgba(156, 39, 176, 0.2)" },
      cyan: { fg: "rgb(0, 188, 212)", bg: "rgba(0, 188, 212, 0.2)" },
    };
    if (room.icon_color && colorMap[room.icon_color]) {
      return colorMap[room.icon_color];
    }
    return null;
  }

  _renderRoom(room, index) {
    const isActive = this._anyActive(
      room.status_entities || room.status_entity
    );
    const showInfo = this._config.show_info !== false;
    const info = showInfo ? escapeHtml(this._roomInfo(room)) : "";
    const name = escapeHtml(room.name || `Raum ${index + 1}`);
    const icon = escapeHtml(room.icon || "mdi:home-outline");
    const path = escapeHtml(room.navigation_path || "");

    // Custom icon color override
    const fixedColor = this._resolveColor(room);
    let iconCellStyle = "";
    if (fixedColor) {
      iconCellStyle = `style="color: ${fixedColor.fg}; background: ${fixedColor.bg};"`;
    }

    return `
      <button
        class="room-tile ${isActive ? "active" : "inactive"} ${
      showInfo ? "" : "compact"
    } ${fixedColor ? "custom-color" : ""}"
        type="button"
        data-room-index="${index}"
        data-navigation-path="${path}"
        aria-label="${name} öffnen"
      >
        ${this._renderStatusIcons(room)}
        <div class="icon-cell" ${iconCellStyle}><ha-icon icon="${icon}"></ha-icon></div>
        <div class="room-name">${name}</div>
        ${
          showInfo
            ? `<div class="room-info">${info || "&nbsp;"}</div>`
            : ""
        }
      </button>
    `;
  }

  _navigate(path) {
    if (!path) return;

    if (/^https?:\/\//i.test(path)) {
      window.location.href = path;
      return;
    }

    const url = new URL(path, window.location.href);
    window.history.pushState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    window.dispatchEvent(
      new Event("location-changed", {
        bubbles: true,
        composed: true,
      })
    );
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const rooms = Array.isArray(this._config.rooms)
      ? this._config.rooms
      : [];
    const columns = Math.max(
      1,
      Math.min(6, Number(this._config.columns) || 3)
    );
    const title = escapeHtml(this._config.title || "Räume");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;

          --room-nav-active: rgb(255, 193, 7);
          --room-nav-active-bg: rgba(255, 193, 7, 0.2);

          --room-nav-inactive: rgb(33, 150, 243);
          --room-nav-inactive-bg: rgba(33, 150, 243, 0.2);

          --room-nav-card-bg: var(
            --ha-card-background,
            var(--card-background-color)
          );
        }

        ha-card {
          background: transparent;
          box-shadow: none;
          border: none;
          overflow: visible;
        }

        .wrapper,
        .grid {
          overflow: visible;
        }

        .wrapper {
          padding: 0;
        }

        .greeting {
          background: var(--room-nav-card-bg);
          border-radius: 999px;
          padding: 16px 24px;
          margin: 0 0 20px;
          text-align: center;
          font-size: 1.05rem;
          font-weight: 600;
          box-shadow: var(--ha-card-box-shadow, none);
          border:
            var(--ha-card-border-width, 0)
            solid
            var(--ha-card-border-color, transparent);
        }

        .title {
          margin: 4px 0 18px;
          text-align: center;
          font-size: clamp(2rem, 4vw, 2.8rem);
          font-weight: 700;
          line-height: 1.1;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(${columns}, minmax(0, 1fr));
          gap: 8px;
        }

        .room-tile {
          position: relative;
          z-index: 1;
          box-sizing: border-box;

          min-height: 110px;
          padding: 9px 6px 6px;

          border:
            var(--ha-card-border-width, 0)
            solid
            var(--ha-card-border-color, transparent);
          border-radius: var(--ha-card-border-radius, 16px);

          background: var(--room-nav-card-bg);
          color: var(--primary-text-color);
          font: inherit;

          cursor: pointer;
          box-shadow: var(--ha-card-box-shadow, none);

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;

          transition:
            transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1),
            box-shadow 120ms ease,
            filter 120ms ease,
            background-color 120ms ease;

          will-change: transform;
          -webkit-tap-highlight-color: transparent;

          /* 3D perspective for icon badge tilt */
          perspective: 200px;
        }

        .room-tile:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }

        .icon-cell {
          width: 40px;
          height: 40px;
          border-radius: 20px;

          display: grid;
          place-items: center;

          margin: 0 0 7px;

          color: var(--room-nav-inactive);
          background: var(--room-nav-inactive-bg);

          transition:
            transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
            box-shadow 180ms ease;

          /* 3D tilt: child receives perspective from parent */
          transform-style: preserve-3d;
        }

        .active .icon-cell {
          color: var(--room-nav-active);
          background: var(--room-nav-active-bg);
        }

        .custom-color .icon-cell {
          /* When icon_color is set, inline style takes precedence;
             prevent active/inactive from overriding it */
        }

        .active.custom-color .icon-cell {
          color: inherit;
          background: inherit;
        }

        .icon-cell ha-icon {
          --mdc-icon-size: 25px;
        }

        .room-name {
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.15;
          text-align: center;
        }

        .room-info {
          min-height: 1.2em;
          margin-top: 5px;

          color: var(--secondary-text-color);
          font-size: 0.86rem;
          line-height: 1.15;
          text-align: center;
          white-space: nowrap;
        }

        .room-tile.compact {
          min-height: 96px;
          padding-top: 7px;
          padding-bottom: 7px;
          justify-content: center;
        }

        .room-tile.compact .icon-cell {
          margin-bottom: 7px;
        }

        .openings {
          position: absolute;
          top: 7px;
          left: 7px;

          display: flex;
          flex-direction: column;
          gap: 1px;

          color: #ffd363;
          pointer-events: none;
        }

        .openings ha-icon {
          --mdc-icon-size: 18px;
        }

        .activity-icons {
          position: absolute;
          top: 7px;
          right: 7px;

          display: flex;
          flex-direction: column;
          gap: 1px;

          color: var(--error-color, red);
          pointer-events: none;
        }

        .activity-icons ha-icon {
          --mdc-icon-size: 18px;
        }

        /*
         * Desktop / Laptop hover effect.
         * Only enabled for devices that really support hovering with a fine
         * pointer (mouse/trackpad), so touch devices are unaffected.
         */
        @media (hover: hover) and (pointer: fine) {
          .room-tile:hover {
            z-index: 50;

            transform: translateY(-3px) scale(1.02);

            box-shadow:
              0 8px 20px rgba(0, 0, 0, 0.18),
              0 4px 10px rgba(0, 0, 0, 0.12);

            filter: brightness(1.04);
          }

          .room-tile:hover .icon-cell {
            box-shadow:
              0 4px 12px rgba(0, 0, 0, 0.16);
            /* transform is applied dynamically via JS for 3D tilt */
          }
        }

        .room-tile:active {
          transform: translateY(-1px) scale(0.99);
          box-shadow:
            0 4px 10px rgba(0, 0, 0, 0.16),
            0 2px 4px rgba(0, 0, 0, 0.10);
          transition-duration: 60ms;
        }

        @media (max-width: 520px) {
          .grid {
            gap: 7px;
          }

          .room-tile {
            min-height: 106px;
            padding: 8px 4px 6px;
          }

          .room-tile.compact {
            min-height: 92px;
            padding-top: 6px;
            padding-bottom: 6px;
          }

          .room-name {
            font-size: 0.92rem;
          }

          .room-info {
            font-size: 0.82rem;
          }
        }
      </style>

      <ha-card>
        <div class="wrapper">
          ${
            this._config.show_greeting
              ? `<div class="greeting">${escapeHtml(
                  this._greeting()
                )}</div>`
              : ""
          }

          ${
            this._config.show_title === false
              ? ""
              : `<div class="title">${title}</div>`
          }

          <div class="grid">
            ${rooms
              .map((room, index) => this._renderRoom(room, index))
              .join("")}
          </div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll(".room-tile").forEach((element) => {
      element.addEventListener("click", () =>
        this._navigate(element.dataset.navigationPath)
      );

      // 3D tilt effect on the icon badge
      const iconCell = element.querySelector(".icon-cell");
      if (iconCell) {
        element.addEventListener("mousemove", (e) => {
          const rect = iconCell.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Distance from cursor to icon center
          const deltaX = e.clientX - centerX;
          const deltaY = e.clientY - centerY;

          // Normalize to a max tilt of ~20 degrees, based on distance
          const maxTilt = 20;
          const maxDistance = 80;

          const tiltX = Math.max(-maxTilt, Math.min(maxTilt, (deltaY / maxDistance) * maxTilt));
          const tiltY = Math.max(-maxTilt, Math.min(maxTilt, (-deltaX / maxDistance) * maxTilt));

          // Scale up slightly when hovered
          iconCell.style.transform =
            `translateY(-1px) scale(1.13) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        });

        element.addEventListener("mouseleave", () => {
          iconCell.style.transform = "";
        });
      }
    });
  }
}

class RoomNavigationCardEditor extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: "open" });

    this._config = {};
    this._hass = undefined;

    this._rendered = false;
    this._openRoomIndexes = new Set();
    this._openStateInitialized = false;

    // Prevent Home Assistant from immediately re-rendering the whole editor
    // when it sends our own config-changed event back through setConfig().
    this._emittedConfigHashes = new Set();
  }

  set hass(hass) {
    this._hass = hass;

    if (this._rendered) {
      this.shadowRoot?.querySelectorAll("ha-form").forEach((form) => {
        form.hass = hass;
      });

      return;
    }

    if (this._config && Object.keys(this._config).length) {
      this._render();
    }
  }

  setConfig(config) {
    const nextConfig = structuredCloneSafe(config || {});

    if (!Array.isArray(nextConfig.rooms)) {
      nextConfig.rooms = [];
    }

    const configHash = JSON.stringify(nextConfig);
    const isEchoOfOwnChange =
      this._emittedConfigHashes.has(configHash);

    this._config = nextConfig;

    if (isEchoOfOwnChange && this._rendered) {
      this._emittedConfigHashes.delete(configHash);
      return;
    }

    this._captureOpenState();
    this._render();
  }

  _fireConfigChanged() {
    const config = structuredCloneSafe(this._config);
    const configHash = JSON.stringify(config);

    this._emittedConfigHashes.add(configHash);

    while (this._emittedConfigHashes.size > 25) {
      this._emittedConfigHashes.delete(
        this._emittedConfigHashes.values().next().value
      );
    }

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _captureOpenState() {
    if (!this._rendered || !this.shadowRoot) return;

    const detailsElements = [
      ...this.shadowRoot.querySelectorAll(
        ".room details[data-room-index]"
      ),
    ];

    if (!detailsElements.length) return;

    this._openRoomIndexes = new Set(
      detailsElements
        .filter((details) => details.open)
        .map((details) => Number(details.dataset.roomIndex))
        .filter(Number.isInteger)
    );

    this._openStateInitialized = true;
  }

  _topSchema() {
    return [
      {
        name: "title",
        selector: { text: {} },
      },
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "columns",
            selector: {
              number: {
                min: 1,
                max: 6,
                step: 1,
                mode: "box",
              },
            },
          },
          {
            name: "show_greeting",
            selector: { boolean: {} },
          },
          {
            name: "show_title",
            selector: { boolean: {} },
          },
          {
            name: "show_info",
            selector: { boolean: {} },
          },
        ],
      },
    ];
  }

  _roomSchema() {
    return [
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "name",
            required: true,
            selector: { text: {} },
          },
          {
            name: "icon",
            selector: { icon: {} },
          },
        ],
      },
      {
        name: "navigation_path",
        selector: { text: {} },
      },
      {
        name: "icon_color",
        selector: { select: { options: [
          { value: "", label: "Standard (blau/gelb)" },
          { value: "red", label: "Rot" },
          { value: "green", label: "Grün" },
          { value: "orange", label: "Orange" },
          { value: "purple", label: "Lila" },
          { value: "cyan", label: "Cyan" },
          { value: "amber", label: "Amber" },
          { value: "blue", label: "Blau (fest)" },
        ], mode: "dropdown" } },
      },
      {
        name: "status_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              { domain: "light" },
              { domain: "switch" },
              { domain: "input_boolean" },
              { domain: "group" },
            ],
          },
        },
      },
      {
        name: "climate_entity",
        selector: {
          entity: {
            filter: [{ domain: "climate" }],
          },
        },
      },
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "temperature_entity",
            selector: {
              entity: {
                filter: [
                  {
                    domain: "sensor",
                    device_class: "temperature",
                  },
                ],
              },
            },
          },
          {
            name: "humidity_entity",
            selector: {
              entity: {
                filter: [
                  {
                    domain: "sensor",
                    device_class: "humidity",
                  },
                ],
              },
            },
          },
        ],
      },
      {
        name: "door_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              {
                domain: "binary_sensor",
                device_class: "door",
              },
              {
                domain: "binary_sensor",
                device_class: "opening",
              },
            ],
          },
        },
      },
      {
        name: "window_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              {
                domain: "binary_sensor",
                device_class: "window",
              },
              {
                domain: "binary_sensor",
                device_class: "opening",
              },
            ],
          },
        },
      },
      {
        name: "heating_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              { domain: "binary_sensor" },
              { domain: "switch" },
              { domain: "input_boolean" },
            ],
          },
        },
      },
      {
        name: "electric_heating_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              { domain: "binary_sensor" },
              { domain: "switch" },
              { domain: "input_boolean" },
            ],
          },
        },
      },
      {
        name: "fan_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              { domain: "binary_sensor" },
              { domain: "switch" },
              { domain: "fan" },
              { domain: "input_boolean" },
            ],
          },
        },
      },
      {
        name: "motion_entities",
        selector: {
          entity: {
            multiple: true,
            reorder: true,
            filter: [
              {
                domain: "binary_sensor",
                device_class: "motion",
              },
              {
                domain: "binary_sensor",
                device_class: "occupancy",
              },
              { domain: "input_boolean" },
            ],
          },
        },
      },
    ];
  }

  _label(schema) {
    const labels = {
      title: "Überschrift",
      columns: "Spalten",
      show_greeting: "Begrüßung anzeigen",
      show_title: "Überschrift anzeigen",
      show_info:
        "Informationszeile anzeigen (Temperatur / Status)",
      name: "Raumname",
      icon: "Icon",
      navigation_path: "Navigationspfad",
      icon_color: "Feste Icon-Farbe",
      status_entities: "Status-/Licht-Entitäten",
      climate_entity: "Thermostat / Climate-Entität",
      temperature_entity: "Temperatursensor",
      humidity_entity: "Luftfeuchtesensor",
      door_entities: "Türkontakte",
      window_entities: "Fensterkontakte",
      heating_entities: "Heizungsanforderung",
      electric_heating_entities:
        "E-Heizung / elektrische Heizungsanforderung",
      fan_entities: "Lüfter / Heizlüfter",
      motion_entities: "Bewegung / Belegung",
    };

    return labels[schema.name] || schema.name;
  }

  _helper(schema) {
    const helpers = {
      status_entities:
        "Sobald mindestens eine dieser Entitäten aktiv ist, wird das Haupticon gelb statt blau.",
      climate_entity:
        "Zeigt automatisch Ist- und Solltemperatur als 'Ist → Soll'.",
      temperature_entity:
        "Alternative für Räume ohne Climate-Entität, z. B. Balkon.",
      humidity_entity:
        "Wird zusammen mit dem Temperatursensor als zweite Information angezeigt.",
      door_entities:
        "Bei offenem Kontakt erscheint oben links ein Türsymbol.",
      window_entities:
        "Bei offenem Kontakt erscheint oben links ein Fenstersymbol.",
      heating_entities:
        "Wenn mindestens eine Entität aktiv ist, erscheint oben rechts ein rotes Heizungs-Icon.",
      electric_heating_entities:
        "Wenn mindestens eine Entität aktiv ist, erscheint oben rechts ein rotes Blitz-Icon.",
      fan_entities:
        "Wenn mindestens eine Entität aktiv ist, erscheint oben rechts ein rotes Lüfter-Icon.",
      motion_entities:
        "Wenn mindestens eine Entität aktiv ist, erscheint oben rechts ein rotes Bewegungs-Icon.",
      navigation_path:
        "Zum Beispiel: schlafzimmer oder /lovelace/schlafzimmer",
    };

    return helpers[schema.name];
  }

  _addRoom() {
    this._captureOpenState();

    const newIndex = (this._config.rooms || []).length;

    this._config.rooms = [
      ...(this._config.rooms || []),
      {
        name: "Neuer Raum",
        icon: "mdi:home-outline",
        navigation_path: "",
        status_entities: [],
        climate_entity: "",
        temperature_entity: "",
        humidity_entity: "",
        door_entities: [],
        window_entities: [],
        heating_entities: [],
        electric_heating_entities: [],
        fan_entities: [],
        motion_entities: [],
      },
    ];

    this._openRoomIndexes.add(newIndex);
    this._openStateInitialized = true;

    this._fireConfigChanged();
    this._render();
  }

  _removeRoom(index) {
    this._captureOpenState();

    this._config.rooms = this._config.rooms.filter(
      (_, roomIndex) => roomIndex !== index
    );

    const adjustedOpenIndexes = new Set();

    this._openRoomIndexes.forEach((openIndex) => {
      if (openIndex < index) {
        adjustedOpenIndexes.add(openIndex);
      }

      if (openIndex > index) {
        adjustedOpenIndexes.add(openIndex - 1);
      }
    });

    this._openRoomIndexes = adjustedOpenIndexes;

    this._fireConfigChanged();
    this._render();
  }

  _moveRoom(index, direction) {
    const targetIndex = index + direction;

    if (
      targetIndex < 0 ||
      targetIndex >= this._config.rooms.length
    ) {
      return;
    }

    this._captureOpenState();

    const rooms = [...this._config.rooms];

    [rooms[index], rooms[targetIndex]] = [
      rooms[targetIndex],
      rooms[index],
    ];

    this._config.rooms = rooms;

    const sourceWasOpen = this._openRoomIndexes.has(index);
    const targetWasOpen =
      this._openRoomIndexes.has(targetIndex);

    this._openRoomIndexes.delete(index);
    this._openRoomIndexes.delete(targetIndex);

    if (sourceWasOpen) {
      this._openRoomIndexes.add(targetIndex);
    }

    if (targetWasOpen) {
      this._openRoomIndexes.add(index);
    }

    this._fireConfigChanged();
    this._render();
  }

  _render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .editor {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .section-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-top: 4px;
        }

        .room {
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          overflow: hidden;
          background: var(--card-background-color);
        }

        details > summary {
          cursor: pointer;
          padding: 13px 14px;

          font-weight: 600;

          display: flex;
          align-items: center;
          gap: 8px;

          list-style: none;
        }

        details > summary::-webkit-details-marker {
          display: none;
        }

        .room-content {
          padding: 0 14px 14px;
        }

        .room-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 10px;
        }

        button {
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
          color: var(--primary-text-color);

          border-radius: 10px;
          min-height: 38px;
          padding: 0 12px;

          cursor: pointer;
          font: inherit;
        }

        button.primary {
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          border-color: var(--primary-color);
        }

        button:disabled {
          opacity: 0.45;
          cursor: default;
        }

        .empty {
          color: var(--secondary-text-color);
          padding: 8px 0;
        }
      </style>

      <div class="editor">
        <div id="global-form"></div>

        <div class="section-title">Kacheln</div>

        <div id="rooms"></div>

        <button
          class="primary"
          id="add-room"
          type="button"
        >
          + Kachel hinzufügen
        </button>
      </div>
    `;

    const globalHost =
      this.shadowRoot.getElementById("global-form");

    const globalForm =
      document.createElement("ha-form");

    globalForm.hass = this._hass;
    globalForm.data = {
      title: this._config.title ?? "Räume",
      columns: this._config.columns ?? 3,
      show_greeting:
        this._config.show_greeting ?? false,
      show_title: this._config.show_title ?? true,
      show_info: this._config.show_info ?? true,
    };
    globalForm.schema = this._topSchema();
    globalForm.computeLabel = (schema) =>
      this._label(schema);

    globalForm.addEventListener(
      "value-changed",
      (event) => {
        const value = event.detail?.value || {};

        this._config = {
          ...this._config,
          ...value,
        };

        this._fireConfigChanged();
      }
    );

    globalHost.appendChild(globalForm);

    const roomsHost =
      this.shadowRoot.getElementById("rooms");
    const rooms = this._config.rooms || [];

    if (!this._openStateInitialized) {
      this._openRoomIndexes = new Set(
        rooms.length ? [0] : []
      );
      this._openStateInitialized = true;
    }

    if (!rooms.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent =
        "Noch keine Kacheln konfiguriert.";
      roomsHost.appendChild(empty);
    }

    rooms.forEach((room, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "room";

      wrapper.innerHTML = `
        <details
          data-room-index="${index}"
          ${
            this._openRoomIndexes.has(index)
              ? "open"
              : ""
          }
        >
          <summary>
            <ha-icon
              class="summary-icon"
              icon="${escapeHtml(
                room.icon || "mdi:home-outline"
              )}"
            ></ha-icon>

            <span class="summary-name">
              ${escapeHtml(
                room.name || `Kachel ${index + 1}`
              )}
            </span>
          </summary>

          <div class="room-content">
            <div class="form-host"></div>

            <div class="room-actions">
              <button
                type="button"
                data-action="up"
                ${index === 0 ? "disabled" : ""}
              >
                ↑
              </button>

              <button
                type="button"
                data-action="down"
                ${
                  index === rooms.length - 1
                    ? "disabled"
                    : ""
                }
              >
                ↓
              </button>

              <button
                type="button"
                data-action="remove"
              >
                Entfernen
              </button>
            </div>
          </div>
        </details>
      `;

      const form =
        document.createElement("ha-form");

      form.hass = this._hass;
      form.data = {
        name: room.name ?? "",
        icon: room.icon ?? "mdi:home-outline",
        navigation_path:
          room.navigation_path ?? "",
        icon_color: room.icon_color ?? "",
        status_entities: normalizeEntityList(
          room.status_entities ||
            room.status_entity
        ),
        climate_entity:
          room.climate_entity ?? "",
        temperature_entity:
          room.temperature_entity ?? "",
        humidity_entity:
          room.humidity_entity ?? "",
        door_entities: normalizeEntityList(
          room.door_entities ||
            room.door_entity
        ),
        window_entities: normalizeEntityList(
          room.window_entities ||
            room.window_entity
        ),
        heating_entities: normalizeEntityList(
          room.heating_entities ||
            room.heating_entity
        ),
        electric_heating_entities:
          normalizeEntityList(
            room.electric_heating_entities ||
              room.electric_heating_entity
          ),
        fan_entities: normalizeEntityList(
          room.fan_entities ||
            room.fan_entity
        ),
        motion_entities: normalizeEntityList(
          room.motion_entities ||
            room.motion_entity
        ),
      };

      form.schema = this._roomSchema();
      form.computeLabel = (schema) =>
        this._label(schema);
      form.computeHelper = (schema) =>
        this._helper(schema);

      form.addEventListener(
        "value-changed",
        (event) => {
          const changedValues =
            event.detail?.value || {};

          const newRooms = [
            ...this._config.rooms,
          ];

          newRooms[index] = {
            ...newRooms[index],
            ...changedValues,
          };

          this._config.rooms = newRooms;

          if (
            Object.prototype.hasOwnProperty.call(
              changedValues,
              "name"
            )
          ) {
            const summaryName =
              wrapper.querySelector(
                ".summary-name"
              );

            if (summaryName) {
              summaryName.textContent =
                changedValues.name ||
                `Kachel ${index + 1}`;
            }
          }

          if (
            Object.prototype.hasOwnProperty.call(
              changedValues,
              "icon"
            )
          ) {
            const summaryIcon =
              wrapper.querySelector(
                ".summary-icon"
              );

            if (summaryIcon) {
              summaryIcon.setAttribute(
                "icon",
                changedValues.icon ||
                  "mdi:home-outline"
              );
            }
          }

          this._fireConfigChanged();
        }
      );

      const details =
        wrapper.querySelector("details");

      details.addEventListener("toggle", () => {
        if (details.open) {
          this._openRoomIndexes.add(index);
        } else {
          this._openRoomIndexes.delete(index);
        }

        this._openStateInitialized = true;
      });

      wrapper
        .querySelector(".form-host")
        .appendChild(form);

      wrapper
        .querySelector('[data-action="up"]')
        .addEventListener("click", () =>
          this._moveRoom(index, -1)
        );

      wrapper
        .querySelector('[data-action="down"]')
        .addEventListener("click", () =>
          this._moveRoom(index, 1)
        );

      wrapper
        .querySelector('[data-action="remove"]')
        .addEventListener("click", () =>
          this._removeRoom(index)
        );

      roomsHost.appendChild(wrapper);
    });

    this.shadowRoot
      .getElementById("add-room")
      .addEventListener("click", () =>
        this._addRoom()
      );

    this._rendered = true;
  }
}

function normalizeEntityList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return [value].filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

async function ensureEditorDependencies() {
  if (customElements.get("ha-form")) {
    return;
  }

  const entitiesCard =
    customElements.get("hui-entities-card");

  if (entitiesCard?.getConfigElement) {
    await entitiesCard.getConfigElement();
  }

  if (customElements.whenDefined) {
    try {
      await customElements.whenDefined("ha-form");
    } catch (_error) {
      // Home Assistant will show an editor error if ha-form is unavailable.
    }
  }
}

if (!customElements.get("room-navigation-card")) {
  customElements.define(
    "room-navigation-card",
    RoomNavigationCard
  );
}

if (
  !customElements.get(
    "room-navigation-card-editor"
  )
) {
  customElements.define(
    "room-navigation-card-editor",
    RoomNavigationCardEditor
  );
}

window.customCards = window.customCards || [];

if (
  !window.customCards.some(
    (card) =>
      card.type === "room-navigation-card"
  )
) {
  window.customCards.push({
    type: "room-navigation-card",
    name: "Room Navigation Card",
    description:
      "Wiederverwendbare Kachelübersicht mit Navigation, Statusfarbe, Klima sowie Fenster-, Tür-, Heizungs-, Lüfter- und Bewegungsstatus.",
    preview: true,
  });
}

console.info(
  `%c ROOM-NAVIGATION-CARD %c v${ROOM_NAV_CARD_VERSION} `,
  "color:white;background:#03a9f4;font-weight:bold",
  "color:#03a9f4;background:white;font-weight:bold"
);
