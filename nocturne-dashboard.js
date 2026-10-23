/* Nocturne 2.0.0 — standalone Home Assistant dashboard card. No external imports. */
(() => {
  'use strict';
  const VERSION = '2.0.0';
  const unavailable = s => !s || ['unknown', 'unavailable'].includes(s.state);
  const numeric = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const fmt = (v, digits = 1) => numeric(v) ? Number(v).toLocaleString('de-DE', {maximumFractionDigits: digits}) : '—';
  const words = {on:'An',off:'Aus',heat:'Heizen',heating:'Heizt',idle:'Bereit',auto:'Automatik',cool:'Kühlen',cooling:'Kühlt',dry:'Entfeuchten',fan_only:'Lüften',paused:'Pausiert',playing:'Wiedergabe',standby:'Standby',unavailable:'Nicht verfügbar',unknown:'Kein Wert',none:'Bereit',wash:'Waschen',washing:'Waschen',rinse:'Spülen',rinsing:'Spülen',spin:'Schleudern',spinning:'Schleudern',drying:'Trocknen',dryingwrinkleprevent:'Knitterschutz',finished:'Fertig',finish:'Fertig',run:'Läuft',running:'Läuft',stop:'Gestoppt',delaywash:'Startzeitvorwahl',weightSensing:'Beladungserkennung'};
  function el(tag, cls, text) { const n = document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  function icon(name) { const n=el('ha-icon'); n.setAttribute('icon',name || 'mdi:circle-outline'); return n; }
  function button(label, fn, cls='small-button', symbol) { const n=el('button',cls);n.type='button';n.setAttribute('aria-label',label);if(symbol)n.append(icon(symbol));else n.textContent=label;n.addEventListener('click',fn);return n; }
  function put(n,text) { const value=String(text ?? ''); if(n.textContent!==value)n.textContent=value; }
  const CSS = `
    :host{display:block;color:#eff3f8;font-family:var(--ha-font-family-body,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);--mint:#a5f3ce;--lavender:#b6afee;--muted:#9ba8b8;--line:rgba(255,255,255,.075)}
    *{box-sizing:border-box}[hidden]{display:none!important}button,input{font:inherit}button{color:inherit;cursor:pointer}button:disabled,input:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--mint);outline-offset:4px}
    .page{max-width:1320px;margin:0 auto;padding:34px 32px 56px}.hero{margin:0 0 28px}.eyebrow{font-size:12px;color:var(--muted);letter-spacing:.6px;margin:0 0 12px}.hero h1{font-size:clamp(30px,4vw,44px);line-height:1.12;letter-spacing:-1.5px;margin:0 0 12px;font-weight:720}.subtitle{color:var(--muted);font-size:14px;line-height:1.6;margin:0}.hero-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.back{display:inline-flex;align-items:center;gap:7px;padding:8px 0;background:none;border:0;color:var(--muted);font-size:13px;min-height:44px}.back ha-icon{--mdc-icon-size:18px}
    h2{font-size:18px;font-weight:650;letter-spacing:-.3px;margin:0 0 16px}.section{margin-top:30px}.grid{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}.rooms{grid-template-columns:repeat(4,minmax(0,1fr))}.metrics{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:30px}.tech{grid-template-columns:repeat(4,minmax(0,1fr))}.two{grid-template-columns:repeat(2,minmax(0,1fr))}
    .surface{background:linear-gradient(145deg,#1c2330,#151b25);border:1px solid var(--line);border-radius:24px;min-width:0}.nav-tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:22px;min-height:176px;width:100%;transition:transform .15s,border-color .15s,background .15s}.nav-tile.active{background:radial-gradient(ellipse at top right,#a5f3ce16,transparent 85%),#18221f;border-color:#a5f3ce38}.icon{display:grid;place-items:center;border-radius:15px;background:#b6afee19;color:var(--lavender);width:44px;height:44px;flex-shrink:0}.icon ha-icon{--mdc-icon-size:25px}.active .icon{color:var(--mint);background:#a5f3ce20}.tile-title{font-size:16px;font-weight:650;letter-spacing:-.25px;margin-top:20px}.tile-info{font-size:12px;line-height:1.55;color:var(--muted);margin-top:7px;white-space:pre-line;overflow-wrap:anywhere}.corner{position:absolute;top:19px;right:19px;display:flex;gap:5px;align-items:center;color:#f4cc8a}.corner ha-icon{--mdc-icon-size:17px}.presence{color:var(--lavender)}.chevron{position:absolute;right:20px;bottom:20px;color:#677384;--mdc-icon-size:18px}.tech .nav-tile{min-height:130px;flex-direction:row;align-items:center;gap:14px}.tech .tile-title{margin:0}.tech .tile-info{margin-top:4px}.tech .chevron{display:none}
    .metric{padding:17px 19px;display:flex;align-items:center;gap:13px;min-height:94px;text-align:left;width:100%}.metric .icon{width:38px;height:38px;border-radius:13px}.metric .icon ha-icon{--mdc-icon-size:22px}.metric-label{font-size:11px;color:var(--muted);line-height:1.5}.metric-value{font-size:17px;font-weight:600;margin-top:3px;overflow-wrap:anywhere}.metric.warn{border-color:#f4cc8a55}.metric.warn .icon{color:#f4cc8a;background:#f4cc8a15}
    .control-card{padding:21px}.row{display:flex;gap:12px;align-items:center;min-width:0}.grow{flex:1;min-width:0}.title{font-size:15px;font-weight:650;overflow-wrap:anywhere}.state{font-size:12px;color:var(--muted);line-height:1.6;margin-top:4px;overflow-wrap:anywhere}.small-button{border:1px solid var(--line);background:#ffffff06;min-width:44px;min-height:44px;border-radius:14px;padding:10px;display:inline-flex;align-items:center;justify-content:center;gap:8px}.small-button ha-icon{--mdc-icon-size:20px}.small-button.on{background:#a5f3ce1b;color:var(--mint);border-color:#a5f3ce30}.text-button{font-size:12px;padding:11px 14px}.controls{display:flex;gap:10px;align-items:center;margin-top:18px}.controls input{flex:1;min-width:0;accent-color:var(--mint);height:30px}.controls label{font-size:12px;color:var(--muted);min-width:40px;text-align:right}.caption{font-size:11px;line-height:1.6;color:var(--muted);margin-top:14px}.statline{display:flex;justify-content:space-between;align-items:baseline;margin-top:26px;gap:12px}.current-temp{font-size:40px;letter-spacing:-1.5px;font-weight:650}.current-temp small{font-size:18px;font-weight:400;color:var(--muted);letter-spacing:0}.pill{font-size:11px;padding:7px 10px;border:1px solid #ffffff0c;background:#ffffff06;border-radius:30px;color:var(--muted)}.pill.heating{background:#f4cc8a14;color:#f4cc8a;border-color:#f4cc8a22}.stepper{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px;background:#ffffff06;border-radius:18px;margin-top:20px}.target{font-size:20px;font-weight:650;text-align:center;color:var(--mint)}.target small{display:block;font-size:10px;font-weight:400;letter-spacing:.3px;color:var(--muted);margin-bottom:4px}.stepper .small-button{border:0;background:none;font-size:24px}.modes{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.modes button{font-size:11px;min-height:38px;padding:9px 13px}.climate-card .icon{color:#f4cc8a;background:#f4cc8a12}
    .device-title{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.device-name{font-size:22px;font-weight:650;margin-top:22px}.device-state{font-size:28px;letter-spacing:-.7px;margin-top:20px}.device-grid{margin-top:22px;display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.device-stat{padding:14px;background:#ffffff04;border-radius:16px;min-width:0}.device-stat .metric-value{font-size:16px}.details{border-top:1px solid var(--line);margin-top:22px;padding-top:6px}.details summary{cursor:pointer;color:var(--muted);font-size:12px;padding:15px 0;min-height:44px}.details-content{display:grid;gap:10px}.entity-row{background:none;border:0;border-bottom:1px solid #ffffff08;padding:10px 0;text-align:left;width:100%;display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:44px}.entity-row span:first-child{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.entity-row span:last-child{font-size:12px;text-align:right;overflow-wrap:anywhere}.meter{height:5px;border-radius:9px;background:#ffffff0b;margin-top:18px;overflow:hidden}.meter span{display:block;height:100%;background:var(--mint);border-radius:inherit}.low .meter span{background:#f4cc8a}.critical .meter span{background:#ff9c9c}.low{border-color:#f4cc8a45}.critical{border-color:#ff9c9c50}.art{width:58px;height:58px;object-fit:cover;border-radius:16px}.camera{overflow:hidden}.camera-stage{min-height:320px;display:grid;place-items:center;background:radial-gradient(ellipse at center,#b6afee0b,transparent 70%);padding:28px;text-align:center}.camera-stage img{display:block;width:100%;max-height:65vh;object-fit:contain;border-radius:18px}.camera-actions{padding:20px;border-top:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap}.empty{padding:24px;color:var(--muted);font-size:14px}.error{background:#3b232c;color:#ffb6bb;border:1px solid #ff9c9c40;padding:14px 18px;border-radius:16px;margin:0 0 20px;display:flex;justify-content:space-between;gap:16px;align-items:center;font-size:13px;line-height:1.6}.error button{background:none;border:0;color:inherit;min-width:44px;min-height:44px}
    .metric-label{overflow-wrap:anywhere}.room-overview{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:18px;align-items:start}.room-sensors{grid-template-columns:repeat(2,minmax(0,1fr))}.room-overview .climate-grid{display:grid;gap:14px;grid-template-columns:1fr}.device-stat:first-child{grid-column:1/-1}
    @media(max-width:900px){.room-overview{grid-template-columns:1fr}.grid.room-sensors{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(hover:hover) and (pointer:fine){.nav-tile:hover{transform:translateY(-2px);border-color:#b6afee55}.small-button:hover:not(:disabled){background:#ffffff12}}
    @media(max-width:1050px){.rooms{grid-template-columns:repeat(3,minmax(0,1fr))}.grid:not(.rooms):not(.two){grid-template-columns:repeat(2,minmax(0,1fr))}.page{padding:28px 24px 48px}}
    @media(max-width:700px){.page{padding:20px 16px 36px}.grid,.rooms,.metrics,.tech,.grid:not(.rooms):not(.two){grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.two{grid-template-columns:1fr}.nav-tile{min-height:166px;padding:18px 14px}.tile-title{font-size:15px}.tile-info{font-size:11px}.corner{top:14px;right:12px}.tech .nav-tile{min-height:115px;flex-direction:column;align-items:flex-start;gap:12px}.tech .tile-title{font-size:13px}.metric{padding:14px 12px;gap:9px}.metric .icon{width:30px;height:34px;background:none}.metric-value{font-size:14px}.metric-label{font-size:10px}.control-grid{grid-template-columns:1fr!important}.control-card{padding:18px}.section{margin-top:25px}.camera-stage{min-height:230px}.hero h1{letter-spacing:-1px}.climate-grid{grid-template-columns:1fr!important}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
  `;

  class NocturneDashboard extends HTMLElement {
    constructor() { super();this.attachShadow({mode:'open'});this._watchers=[];this._pending=new Set();this._desired=new Map();this._timers=new Set(); }
    static getStubConfig() {return {type:'custom:nocturne-dashboard',page:'home',title:'Zuhause',rooms:[]};}
    setConfig(config) {
      if(!config || !['home','room','climate','household','camera','batteries','router'].includes(config.page))throw new Error('Nocturne: gültige page erforderlich.');
      this._config=config;this._build();
    }
    set hass(value) {this._hass=value;this._update();}
    get hass() {return this._hass;}
    getCardSize() {return 12;}
    connectedCallback() {if(!this._clock)this._clock=setInterval(()=>{if(this._greet)this._greet();},60000);}
    disconnectedCallback() {clearInterval(this._clock);this._clock=null;for(const t of this._timers)clearTimeout(t);this._timers.clear();}
    _s(id) {return this._hass?.states?.[id];}
    _available(id) {return !unavailable(this._s(id));}
    _name(item) {return item.name || this._s(item.entity)?.attributes?.friendly_name || item.entity.replace(/^[^.]+\./,'').replaceAll('_',' ');}
    _iconFor(id) {const a=this._s(id)?.attributes||{};if(a.icon)return a.icon;if(/humidity|feuchtigkeit/.test(id))return 'mdi:water-percent';if(/temperatur/.test(id))return 'mdi:thermometer';if(/batter(y|ie)/.test(id))return 'mdi:battery-70';if(/presence|belegung/.test(id))return 'mdi:motion-sensor';if(/fenster/.test(id))return 'mdi:window-closed-variant';if(/tur/.test(id))return 'mdi:door';if(/power|leistung/.test(id))return 'mdi:flash-outline';if(/energy|energie/.test(id))return 'mdi:lightning-bolt-outline';return 'mdi:information-outline';}
    _value(id) {
      const s=this._s(id);if(!s)return 'Nicht eingerichtet';if(unavailable(s))return words[s.state]||'Kein Wert';
      if(this._hass.formatEntityState) {try{return this._hass.formatEntityState(s);}catch{ /* local fallback */ }}
      const a=s.attributes||{};
      if(id.startsWith('binary_sensor.')) {
        if(['door','window','opening','garage_door'].includes(a.device_class))return s.state==='on'?'Offen':'Geschlossen';
        if(['motion','occupancy','presence'].includes(a.device_class))return s.state==='on'?'Erkannt':'Frei';
      }
      return numeric(s.state)?`${fmt(s.state,2)}${a.unit_of_measurement?' '+a.unit_of_measurement:''}`:(words[s.state]||s.state);
    }
    _watch(ids,fn) {this._watchers.push({ids:[...new Set(ids.filter(Boolean))],fn,refs:null});}
    _update(force=false) {
      if(!this._hass)return;
      for(const w of this._watchers) {const refs=w.ids.map(id=>this._s(id));if(force||!w.refs||refs.some((s,i)=>s!==w.refs[i])) {w.refs=refs;w.fn();}}
      if(this._greet)this._greet();
    }
    _info(id) {this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:id},bubbles:true,composed:true}));}
    _navigate(path) {if(!path)return;const base=new URL(location.href),parts=base.pathname.split('/').filter(Boolean),last=parts.at(-1);if(last===this._config.view_path||/^\d+$/.test(last))parts.pop();base.pathname='/'+parts.join('/')+'/';const u=new URL(path,base);if(u.origin!==location.origin)return;history.pushState(null,'',u.pathname+u.search+u.hash);window.dispatchEvent(new Event('location-changed',{bubbles:true,composed:true}));}
    _error(message) {put(this._errorText,message);this._errorBox.hidden=false;}
    async _call(id,domain,service,data={}) {
      if(!this._available(id)||this._pending.has(id))return false;
      this._pending.add(id);this._update(true);
      try {await this._hass.callService(domain,service,{...data,entity_id:id});return true;}
      catch(e) {this._error(`${this._name({entity:id})}: ${e?.message||'Aktion konnte nicht ausgeführt werden.'}`);return false;}
      finally {this._pending.delete(id);this._update(true);}
    }
    _section(title,gridClass='grid') {const s=el('section','section');s.append(el('h2','',title));const grid=el('div',gridClass);s.append(grid);this._body.append(s);return grid;}
    _build() {
      this._watchers=[];this._greet=null;this.shadowRoot.replaceChildren();const style=el('style');style.textContent=CSS;this.shadowRoot.append(style);
      this._body=el('main','page');this.shadowRoot.append(this._body);
      const hero=el('header','hero');this._body.append(hero);
      if(this._config.page!=='home'){const back=button('Zuhause',()=>this._navigate(this._config.home_path||'home'),'back','mdi:arrow-left');back.append(el('span','','Zuhause'));hero.append(back);} 
      const eyebrow=el('p','eyebrow',this._config.page==='home'?'DEIN ZUHAUSE':'NOCTURNE / '+(this._config.title||'').toLocaleUpperCase('de'));
      const title=el('h1','',this._config.title||'Zuhause');const sub=el('p','subtitle',this._config.subtitle||'');hero.append(eyebrow,title,sub);
      if(this._config.page==='home')this._greet=()=>{const now=new Date();const h=now.getHours();const greeting=h>=5&&h<12?'Guten Morgen':h<18&&h>=12?'Guten Tag':h>=18&&h<23?'Guten Abend':'Gute Nacht';put(title,`${greeting}${this._hass?.user?.name?', '+this._hass.user.name:''}.`);put(eyebrow,now.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long'}));};
      this._errorBox=el('div','error');this._errorBox.hidden=true;this._errorBox.setAttribute('role','alert');this._errorText=el('span');this._errorBox.append(this._errorText,button('Schließen',()=>this._errorBox.hidden=true,'','mdi:close'));this._body.append(this._errorBox);
      ({home:()=>this._home(),room:()=>this._room(),climate:()=>this._climates(),household:()=>this._household(),camera:()=>this._camera(),batteries:()=>this._batteries(),router:()=>this._router()})[this._config.page]();
      this._update(true);
    }
    _metric(parent,label,symbol,ids,value,action) {
      const card=button(label,action||(()=>this._info(ids[0])),'surface metric');card.replaceChildren(iconBadge(symbol));const text=el('div','grow');const title=el('div','metric-label',label),v=el('div','metric-value');text.append(title,v);card.append(text);parent.append(card);this._watch(ids,()=>{const result=value();put(v,result.text??result);card.classList.toggle('warn',!!result.warn);});return card;
    }
    _home() {
      const c=this._config;const metrics=el('div','grid metrics');this._body.append(metrics);
      this._metric(metrics,'Draußen','mdi:thermometer',[c.outdoor_temperature],()=>this._value(c.outdoor_temperature));
      this._metric(metrics,'Luftfeuchtigkeit außen','mdi:water-percent',[c.outdoor_humidity],()=>this._value(c.outdoor_humidity));
      const contacts=c.contacts||[];
      this._metric(metrics,'Fenster & Türen','mdi:window-closed-variant',contacts,()=>{
        const open=contacts.filter(id=>this._s(id)?.state==='on').length,missing=contacts.filter(id=>!this._available(id)).length;
        return {text:open?`${open} offen${missing?' · '+missing+' ohne Wert':''}`:missing?`${missing} ohne Wert`:'Alle geschlossen',warn:!!(open||missing)};
      },()=>this._navigate('kontakte'));
      this._metric(metrics,'Heizung','mdi:radiator',(c.climates||[]).map(x=>x.entity),()=>{
        const all=c.climates||[];const n=all.filter(x=>this._s(x.entity)?.attributes?.hvac_action==='heating').length;const missing=all.filter(x=>!this._available(x.entity)||(!this._s(x.entity)?.attributes?.hvac_action&&this._s(x.entity)?.state!=='off')).length;
        return missing?`${missing} ohne Wert`:`${n} von ${all.length} heizen`;
      },()=>this._navigate('heizungen'));
      const rooms=this._section('Deine Räume','grid rooms');for(const r of c.rooms||[])this._roomTile(rooms,r);
      this._houseTile(rooms,c.appliances||[]);
      const tech=this._section('Alles Weitere','grid tech');
      for(const t of c.shortcuts||[])this._navTile(tech,t,t.entities||[],()=>t.info||'Öffnen');
    }
    _navTile(parent,item,ids,info,updateExtra) {
      const card=button(item.name,()=>this._navigate(item.path||item.navigation_path),'surface nav-tile');const badge=iconBadge(item.icon);const name=el('div','tile-title',item.name),state=el('div','tile-info');const text=el('div','grow');text.append(name,state);
      card.replaceChildren(badge,text,icon('mdi:arrow-top-right'));card.lastChild.classList.add('chevron');parent.append(card);
      this._watch(ids,()=>{put(state,info());if(updateExtra)updateExtra(card);});return card;
    }
    _roomTile(parent,r) {
      const contacts=[...(r.door_entities||[]),...(r.window_entities||[])],motions=r.motion_entities||[],status=r.status_entities||[];
      const ids=[r.climate_entity,r.temperature_entity,r.humidity_entity,...contacts,...motions,...status];
      let extra;
      const card=this._navTile(parent,r,ids,()=>{
        const lines=[];const climate=this._s(r.climate_entity);
        if(r.climate_entity) {
          if(unavailable(climate))lines.push('Klima ohne aktuellen Wert');
          else {const a=climate.attributes;lines.push(`${fmt(a.current_temperature)} ${a.temperature_unit||this._hass?.config?.unit_system?.temperature||'°C'}${numeric(a.temperature)?' · Ziel '+fmt(a.temperature)+'°':''}`);lines.push(a.hvac_action==='heating'?'Heizt gerade':climate.state==='off'?'Heizung aus':a.hvac_action==='idle'?'Ziel halten':words[climate.state]||climate.state);}
        } else if(r.temperature_entity)lines.push(this._value(r.temperature_entity)+(r.humidity_entity?' · '+this._value(r.humidity_entity):''));
        const active=status.filter(id=>this._s(id)?.state==='on').length;
        const missing=status.some(id=>!this._available(id));
        if(!r.climate_entity&&!r.temperature_entity)lines.push(active?`${active} Licht${active===1?'':'er'} an${missing?' · teils ohne Wert':''}`:missing?'Lichtstatus unvollständig':'Licht aus');
        return lines.join('\n');
      },n=>{
        n.classList.toggle('active',status.some(id=>this._s(id)?.state==='on'));
        extra.replaceChildren();
        if(contacts.some(id=>this._s(id)?.state==='on')) {const i=icon('mdi:window-open-variant');i.title='Kontakt offen';extra.append(i);}
        if(motions.some(id=>this._s(id)?.state==='on')) {const i=icon('mdi:motion-sensor');i.classList.add('presence');i.title='Präsenz erkannt';extra.append(i);}
      });extra=el('div','corner');card.append(extra);
    }
    _houseTile(parent,devices) {
      const ids=devices.flatMap(x=>[x.job,x.machine,x.power_switch]);
      this._navTile(parent,{name:'Haushalt',icon:'mdi:washing-machine',path:'haushalt'},ids,()=>devices.map(x=>`${x.name}: ${this._value(x.job)}`).join('\n'));
    }
    _sensor(parent,item) {
      const id=item.entity;const card=button(item.name||id,()=>this._info(id),'surface metric'),badge=iconBadge(item.icon||this._iconFor(id));card.replaceChildren(badge);const content=el('div','grow');const name=el('div','metric-label'),value=el('div','metric-value');content.append(name,value);card.append(content);parent.append(card);
      this._watch([id],()=>{put(name,this._name(item));put(value,this._value(id));badge.firstChild.setAttribute('icon',item.icon||this._iconFor(id));card.setAttribute('aria-label',`${this._name(item)}: ${this._value(id)}`);});return card;
    }
    _room() {
      const c=this._config;
      if(c.sensors?.length&&c.climates?.length){const top=this._section('Im Raum','room-overview'),sensors=el('div','grid room-sensors'),climate=el('div','climate-grid');top.append(sensors,climate);c.sensors.forEach(x=>this._sensor(sensors,x));c.climates.forEach(x=>this._climate(climate,x));}
      else{if(c.sensors?.length){const grid=this._section('Im Raum','grid');c.sensors.forEach(x=>this._sensor(grid,x));}if(c.climates?.length){const grid=this._section('Raumklima','grid climate-grid');c.climates.forEach(x=>this._climate(grid,x));}}
      if(c.lights?.length||c.switches?.length){const grid=this._section('Licht & Strom','grid control-grid');[...(c.lights||[]),...(c.switches||[])].forEach(x=>this._light(grid,x));}
      if(c.media_players?.length){const grid=this._section('Musik & Medien','grid two');c.media_players.forEach(x=>this._media(grid,x));}
    }
    _light(parent,item) {
      const id=item.entity,domain=id.split('.')[0],card=el('article','surface control-card');const row=el('div','row');const badge=iconBadge(item.icon||(domain==='light'?'mdi:lightbulb-outline':'mdi:power-socket-eu'));const content=el('div','grow');const name=el('div','title'),state=el('div','state');content.append(name,state);
      const toggle=button('Schalten',()=>this._call(id,domain,'toggle'),'small-button','mdi:power');const more=button('Details und Farben',()=>this._info(id),'small-button',domain==='light'?'mdi:palette-outline':'mdi:dots-horizontal');row.append(badge,content);if(!item.controls_only)row.append(toggle);row.append(more);card.append(row);
      const controls=el('div','controls'),range=el('input'),value=el('label');range.type='range';range.min='0';range.max='100';range.step='1';range.setAttribute('aria-label','Helligkeit');range.addEventListener('input',()=>put(value,range.value+' %'));range.addEventListener('change',()=>{const n=Number(range.value);this._call(id,'light',n===0?'turn_off':'turn_on',n?{brightness_pct:n}:{});});controls.append(range,value);card.append(controls);parent.append(card);
      this._watch([id,item.condition_entity],()=>{
        const s=this._s(id),a=s?.attributes||{},on=s?.state==='on',busy=this._pending.has(id);
        card.hidden=!!item.condition_entity&&this._s(item.condition_entity)?.state!==(item.condition_state||'on');
        put(name,this._name(item));put(state,this._value(id));toggle.disabled=!this._available(id)||busy;toggle.classList.toggle('on',on);toggle.setAttribute('aria-label',`${this._name(item)} ${on?'ausschalten':'einschalten'}`);toggle.setAttribute('aria-pressed',String(on));badge.classList.toggle('active',on);
        const supported=domain==='light'&&(a.supported_color_modes||[]).some(mode=>!['onoff','unknown'].includes(mode));controls.hidden=!supported||item.show_brightness_control===false;range.disabled=!this._available(id)||busy;
        if(this.shadowRoot.activeElement!==range){range.value=String(on&&numeric(a.brightness)?Math.round(Number(a.brightness)/255*100):0);put(value,range.value+' %');}
      });
    }
    _climates() {const grid=this._section('Wohlfühltemperatur','grid climate-grid');for(const item of this._config.climates||[])this._climate(grid,item);}
    _target(id) {const actual=this._s(id)?.attributes?.temperature;const d=this._desired.get(id);if(d&&(Number(actual)===d.value||Date.now()-d.time>8000))this._desired.delete(id);return this._desired.get(id)?.value??actual;}
    async _step(id,direction) {
      const s=this._s(id),a=s?.attributes||{},current=this._target(id);if(!numeric(current)||!(Number(a.supported_features)&1)||this._pending.has(id))return;
      const step=numeric(a.target_temp_step)&&Number(a.target_temp_step)>0?Number(a.target_temp_step):.5;
      const lower=numeric(a.min_temp)?Number(a.min_temp):-Infinity,upper=numeric(a.max_temp)?Number(a.max_temp):Infinity;
      const value=Number(Math.max(lower,Math.min(upper,Number(current)+direction*step)).toFixed(3));if(value===Number(current))return;
      const request={value,time:Date.now()};this._desired.set(id,request);
      const ok=await this._call(id,'climate','set_temperature',{temperature:value});if(!ok)this._desired.delete(id);
      const timer=setTimeout(()=>{this._timers.delete(timer);if(this._desired.get(id)===request)this._desired.delete(id);this._update(true);},8100);this._timers.add(timer);this._update(true);
    }
    _climate(parent,item) {
      const id=item.entity,card=el('article','surface control-card climate-card');const row=el('div','row'),name=el('div','title grow');row.append(iconBadge('mdi:radiator'),name,button('Thermostatdetails',()=>this._info(id),'small-button','mdi:dots-horizontal'));card.append(row);
      const stat=el('div','statline'),current=el('div','current-temp'),pill=el('span','pill');stat.append(current,pill);card.append(stat);
      const stepper=el('div','stepper'),minus=button('Zieltemperatur senken',()=>this._step(id,-1)),plus=button('Zieltemperatur erhöhen',()=>this._step(id,1)),center=el('div','target'),target=el('span');center.append(el('small','','ZIELTEMPERATUR'),target);minus.textContent='−';plus.textContent='+';stepper.append(minus,center,plus);card.append(stepper);
      const modes=el('div','modes');const modeButtons=new Map();for(const mode of ['off','heat','auto']){const b=button(words[mode],()=>this._call(id,'climate','set_hvac_mode',{hvac_mode:mode}),'small-button');modeButtons.set(mode,b);modes.append(b);}card.append(modes);const note=el('div','caption');card.append(note);parent.append(card);
      this._watch([id],()=>{
        const s=this._s(id),a=s?.attributes||{},ok=this._available(id),busy=this._pending.has(id),t=this._target(id),supported=!!(Number(a.supported_features)&1),unit=a.temperature_unit||this._hass?.config?.unit_system?.temperature||'°C';
        put(name,this._name(item));put(current,ok?`${fmt(a.current_temperature)} ${unit}`:'—');put(pill,!ok?'Ohne Verbindung':s.state==='off'?'Aus':(words[a.hvac_action]||words[s.state]||s.state));pill.classList.toggle('heating',ok&&a.hvac_action==='heating');put(target,ok?`${fmt(t)} ${unit}`:'—');
        minus.disabled=!ok||busy||!supported||!numeric(t)||(numeric(a.min_temp)&&Number(t)<=Number(a.min_temp));plus.disabled=!ok||busy||!supported||!numeric(t)||(numeric(a.max_temp)&&Number(t)>=Number(a.max_temp));
        for(const [mode,b]of modeButtons){b.hidden=!(a.hvac_modes||[]).includes(mode);b.disabled=!ok||busy;b.classList.toggle('on',s?.state===mode);b.setAttribute('aria-pressed',String(s?.state===mode));}
        put(note,!ok?this._value(id):this._desired.has(id)?'Sollwert wird übernommen …':!supported?'Weitere Temperatureinstellungen über Details.':'Aktuelle Raumtemperatur · Sollwert direkt anpassen');
      });
    }
    _media(parent,item) {
      const id=item.entity,card=el('article','surface control-card'),row=el('div','row'),art=el('img','art');art.alt='';art.loading='lazy';const content=el('div','grow'),name=el('div','title'),state=el('div','state');content.append(name,state);const more=button('Mediendetails',()=>this._info(id),'small-button','mdi:dots-horizontal');row.append(art,content,more);card.append(row);
      const controls=el('div','controls');const prev=button('Vorheriger Titel',()=>this._call(id,'media_player','media_previous_track'),'small-button','mdi:skip-previous'),play=button('Wiedergabe',()=>this._call(id,'media_player',this._s(id)?.state==='playing'?'media_pause':'media_play'),'small-button','mdi:play'),next=button('Nächster Titel',()=>this._call(id,'media_player','media_next_track'),'small-button','mdi:skip-next');controls.append(prev,play,next);card.append(controls);
      const volumeRow=el('div','controls'),volume=el('input'),volumeValue=el('label');volume.type='range';volume.min=0;volume.max=100;volume.setAttribute('aria-label','Lautstärke');volume.addEventListener('input',()=>put(volumeValue,volume.value+' %'));volume.addEventListener('change',()=>this._call(id,'media_player','volume_set',{volume_level:Number(volume.value)/100}));volumeRow.append(volume,volumeValue);card.append(volumeRow);parent.append(card);
      this._watch([id],()=>{const s=this._s(id),a=s?.attributes||{},f=Number(a.supported_features)||0,enabled=this._available(id)&&!this._pending.has(id);put(name,a.media_title||this._name(item));put(state,[a.media_artist,this._value(id)].filter(Boolean).join(' · '));art.hidden=!a.entity_picture;if(a.entity_picture&&art.getAttribute('src')!==a.entity_picture)art.src=a.entity_picture;prev.hidden=!(f&16);next.hidden=!(f&32);play.hidden=!(f&(s?.state==='playing'?1:512));[prev,next,play].forEach(b=>b.disabled=!enabled);play.firstChild.setAttribute('icon',s?.state==='playing'?'mdi:pause':'mdi:play');volumeRow.hidden=!(f&4);volume.disabled=!enabled;if(this.shadowRoot.activeElement!==volume){volume.value=String(Math.round((Number(a.volume_level)||0)*100));put(volumeValue,volume.value+' %');}});
    }
    _entityRows(parent,items) {
      for(const raw of items||[]) {const item=typeof raw==='string'?{entity:raw}:raw;const row=button(item.entity,()=>this._info(item.entity),'entity-row');const name=el('span'),value=el('span');row.replaceChildren(name,value);parent.append(row);this._watch([item.entity],()=>{put(name,this._name(item));put(value,this._value(item.entity));});}
    }
    _household() {
      const grid=this._section('Waschen & Trocknen','grid two');
      for(const d of this._config.appliances||[]) {
        const card=el('article','surface control-card'),top=el('div','device-title');top.append(iconBadge(d.icon),button('Gerätedetails',()=>this._info(d.power_switch),'small-button','mdi:dots-horizontal'));card.append(top);card.append(el('div','device-name',d.name));const job=el('div','device-state'),machine=el('div','state');card.append(job,machine);const stats=el('div','device-grid');card.append(stats);
        for(const [label,id]of [['Voraussichtlich fertig',d.completion],['Leistung',d.power],['Energie',d.energy]]){
          const cell=el('div','device-stat'),value=el('div','metric-value');cell.append(el('div','metric-label',label),value);stats.append(cell);this._watch([id,d.job,d.machine],()=>{
            if(id===d.completion){const raw=this._s(id)?.state,date=new Date(raw),done=['finished','finish','none','idle','off','stop'].includes(this._s(d.job)?.state)||['stop','off','idle'].includes(this._s(d.machine)?.state);put(value,!this._available(id)||Number.isNaN(date.getTime())?'—':done?'Kein laufendes Programm':date.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:this._hass?.config?.time_zone||undefined}));}
            else put(value,this._value(id));
          });
        }
        const details=el('details','details'),content=el('div','details-content');details.append(el('summary','','Alle Gerätewerte'),content);this._entityRows(content,d.entities);card.append(details);grid.append(card);
        this._watch([d.job,d.machine],()=>{put(job,this._value(d.job));put(machine,'Gerätestatus: '+this._value(d.machine));});
      }
    }
    _camera() {
      const id=this._config.entity,card=el('section','surface camera'),stage=el('div','camera-stage'),placeholder=el('div');placeholder.append(iconBadge('mdi:cctv'),el('p','subtitle','Das Kamerabild wird erst auf Wunsch geladen.'));stage.append(placeholder);const actions=el('div','camera-actions'),state=el('p','caption');const img=el('img');img.alt='Kamerabild';img.addEventListener('error',()=>{stage.replaceChildren(el('p','subtitle','Bild konnte nicht geladen werden. Öffne die Kamera über „Livebild & Details“.'));});
      const load=button('Standbild laden',()=>{const picture=this._s(id)?.attributes?.entity_picture;if(!picture){this._error('Diese Kamera stellt aktuell kein Standbild bereit. Öffne Livebild & Details.');return;}const url=new URL(picture,location.href);url.searchParams.set('_nocturne',String(Date.now()));img.src=url.href;stage.replaceChildren(img);put(load,'Standbild aktualisieren');},'small-button text-button');
      const live=button('Livebild & Details',()=>this._info(id),'small-button text-button');actions.append(load,live);card.append(stage,actions);this._body.append(card,state);this._watch([id],()=>{load.disabled=!this._available(id);live.disabled=!this._s(id);put(state,'Kamerastatus: '+this._value(id)+' · Liveübertragung und Verbindungsaufbau übernimmt Home Assistant.');});
    }
    _batteries() {
      const grid=this._section('Sensoren & Fernbedienungen','grid');for(const raw of this._config.entities||[]){const item=typeof raw==='string'?{entity:raw}:raw;const card=this._sensor(grid,{...item,icon:'mdi:battery-70'}),meter=el('div','meter'),fill=el('span');meter.append(fill);card.style.flexWrap='wrap';meter.style.width='100%';card.append(meter);this._watch([item.entity],()=>{const s=this._s(item.entity),valid=this._available(item.entity)&&numeric(s.state),n=valid?Math.max(0,Math.min(100,Number(s.state))):0;meter.hidden=!valid;fill.style.width=n+'%';card.classList.toggle('low',valid&&n<=20);card.classList.toggle('critical',valid&&n<=10);});}
    }
    _router() {
      const all=this._config.entities||[],sensors=all.filter(x=>/^(sensor|binary_sensor)\./.test(typeof x==='string'?x:x.entity)),actions=all.filter(x=>!sensors.includes(x));const grid=this._section('Verbindung & Daten','grid');sensors.forEach(x=>this._sensor(grid,typeof x==='string'?{entity:x}:x));
      const details=el('details','surface control-card section'),content=el('div','details-content');details.append(el('summary','','WLAN & Verwaltung'),content);this._entityRows(content,actions);this._body.append(details);
    }
  }
  function iconBadge(name) {const n=el('span','icon');n.append(icon(name));return n;}
  if(!customElements.get('nocturne-dashboard'))customElements.define('nocturne-dashboard',NocturneDashboard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(x=>x.type==='nocturne-dashboard'))window.customCards.push({type:'nocturne-dashboard',name:'Nocturne Dashboard',description:'Einheitliches Dashboard für Räume, Klima und Haushalt.',preview:true});
  console.info(`Nocturne Dashboard ${VERSION}`);
})();
