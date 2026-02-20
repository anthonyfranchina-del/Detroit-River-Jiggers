
/* DetroitRiverJigger - static PWA build 20260220222343
   No serverless functions. All data fetched directly from public sources.
*/
const SETTINGS_KEY = "drj_settings_v1";

function $(id){ return document.getElementById(id); }

function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {mode:"shore", boatPreset:"custom", boatName:"Boat point", boatLat:42.3145, boatLon:-83.078667};
    const s = JSON.parse(raw);
    return {
      mode: s.mode === "boat" ? "boat" : "shore",
      boatPreset: s.boatPreset || "custom",
      boatName: (s.boatName || "Boat point").toString().slice(0,64),
      boatLat: (typeof s.boatLat === "number") ? s.boatLat : 42.3145,
      boatLon: (typeof s.boatLon === "number") ? s.boatLon : -83.078667
    };
  }catch(e){
    return {mode:"shore", boatPreset:"custom", boatName:"Boat point", boatLat:42.3145, boatLon:-83.078667};
  }
}
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

async function fetchText(url) {
  const r = await fetch(url, {cache:"no-store"});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return await r.text();
}
async function fetchJSON(url) {
  const r = await fetch(url, {cache:"no-store"});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return await r.json();
}

function offsetMinutesFromISO(iso){
  // iso like 2026-02-20T07:00:00-05:00
  if (!iso || typeof iso !== "string") return 0;
  const m = iso.match(/([+-])(\d\d):(\d\d)$/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  return sign * (hh*60 + mm);
}

function localMinutesFromUTC(dateUTC, offsetMin){
  // "local clock minutes since midnight" for the offset
  const ms = dateUTC.getTime() + offsetMin*60*1000;
  const d = new Date(ms);
  return d.getUTCHours()*60 + d.getUTCMinutes();
}
function formatLocalHM(mins){
  const h = Math.floor(mins/60);
  const m = mins%60;
  const ampm = h>=12 ? "PM" : "AM";
  const hh = ((h+11)%12)+1;
  return `${hh}:${String(m).padStart(2,"0")} ${ampm}`;
}

function degToRad(d){ return d*Math.PI/180; }
function radToDeg(r){ return r*180/Math.PI; }

// Simple sunrise/sunset calc (NOAA approximation). Returns UTC Date objects.
function calcSunTimes(dateUTC, lat, lon){
  // dateUTC should be a Date near midday UTC of target local date
  const day = Math.floor((Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate()) - Date.UTC(dateUTC.getUTCFullYear(),0,0)) / 86400000);
  const lngHour = lon / 15;

  function calc(isSunrise){
    const t = day + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(degToRad(M))) + (0.020 * Math.sin(degToRad(2*M))) + 282.634;
    L = (L + 360) % 360;
    let RA = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(L))));
    RA = (RA + 360) % 360;
    const Lquadrant  = Math.floor(L/90) * 90;
    const RAquadrant = Math.floor(RA/90) * 90;
    RA = RA + (Lquadrant - RAquadrant);
    RA = RA / 15;
    const sinDec = 0.39782 * Math.sin(degToRad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(degToRad(90.833)) - (sinDec * Math.sin(degToRad(lat)))) / (cosDec * Math.cos(degToRad(lat)));
    if (cosH > 1 || cosH < -1) return null;
    let H = isSunrise ? (360 - radToDeg(Math.acos(cosH))) : radToDeg(Math.acos(cosH));
    H = H / 15;
    const T = H + RA - (0.06571 * t) - 6.622;
    let UT = (T - lngHour) % 24;
    if (UT < 0) UT += 24;
    const hr = Math.floor(UT);
    const mn = Math.floor((UT - hr) * 60);
    return new Date(Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate(), hr, mn, 0));
  }

  return { sunriseUTC: calc(true), sunsetUTC: calc(false) };
}

function summarizePeriods(periods){
  if (!periods || !periods.length) return {wind:"—", wx:"—", precip:null, temp:"—"};
  // wind: take median-ish speed, most common direction text if possible
  const speeds = periods.map(p=>Number(p.windSpeed?.match(/\d+/)?.[0]||0)).filter(n=>!Number.isNaN(n));
  speeds.sort((a,b)=>a-b);
  const med = speeds.length ? speeds[Math.floor(speeds.length/2)] : null;
  const dirs = periods.map(p=>String(p.windDirection||"").trim()).filter(Boolean);
  const dir = dirs.length ? dirs[0] : "";
  const gusts = periods.map(p=>Number(p.windGust?.match(/\d+/)?.[0]||0)).filter(n=>!Number.isNaN(n));
  gusts.sort((a,b)=>a-b);
  const gmed = gusts.length ? gusts[Math.floor(gusts.length/2)] : null;
  const wind = (med!==null && dir) ? `${dir} ${med} mph${gmed?` gust ${gmed}`: ""}` : "—";

  const wx = periods.map(p=>p.shortForecast).filter(Boolean)[0] || "—";
  const precipVals = periods.map(p=>p.probabilityOfPrecipitation?.value).filter(v=>typeof v==="number");
  const precip = precipVals.length ? Math.max(...precipVals) : null;

  const temps = periods.map(p=>p.temperature).filter(v=>typeof v==="number");
  const temp = temps.length ? `${temps[Math.floor(temps.length/2)]}°${periods[0].temperatureUnit||"F"}` : "—";

  return {wind, wx, precip, temp};
}

function interpretTurbidity(ntu){
  if (ntu == null || Number.isNaN(ntu)) return {status:"—", meaning:"No turbidity reading available."};
  if (ntu < 5) return {status:"Very clear", meaning:`${ntu} NTU: very clear. Go subtle/natural; longer casts; lighter line helps.`};
  if (ntu < 15) return {status:"Slight stain", meaning:`${ntu} NTU: slight stain. Great jig water; natural with a small accent works.`};
  if (ntu < 30) return {status:"Stained", meaning:`${ntu} NTU: stained. Prime walleye water—add brighter colors/contrast.`};
  return {status:"Muddy", meaning:`${ntu} NTU: muddy. Slow down; bigger profile; dark silhouettes or glow/contrast.`};
}

function jigWeightSuggestion(dischargeCFS){
  const flow = (typeof dischargeCFS === "number") ? dischargeCFS : null;
  if (flow === null) return {weight:"Start at 1 oz", why:"Flow unavailable. Start 1 oz and adjust to maintain bottom contact."};
  if (flow < 160000) return {weight:"3/4 oz – 1 oz", why:`Lower flow (${flow.toLocaleString()} cfs). Start lighter; increase only if you lose bottom contact.`};
  if (flow < 190000) return {weight:"1 oz", why:`Moderate flow (${flow.toLocaleString()} cfs). 1 oz should hold while keeping natural presentation.`};
  if (flow < 220000) return {weight:"1 oz – 1.25 oz", why:`Strong flow (${flow.toLocaleString()} cfs). Step up if you're getting swept off bottom.`};
  return {weight:"1.25 oz – 1.5 oz", why:`High flow (${flow.toLocaleString()} cfs). Use the lightest weight that still maintains bottom contact.`};
}

function isCloudyForecast(text){
  const t = (text || "").toLowerCase();
  if (!t) return null;
  const cloudyWords = ["cloudy","overcast","showers","rain","snow","thunder","drizzle","spray","flurries","storms"];
  const sunnyWords = ["sunny","clear"];
  if (cloudyWords.some(w=>t.includes(w))) return true;
  if (sunnyWords.some(w=>t.includes(w)) && !t.includes("mostly cloudy") && !t.includes("partly cloudy")) return false;
  return null;
}
function lureColorSuggestion(turbidityNTU, wxText){
  const ntu = (typeof turbidityNTU === "number") ? turbidityNTU : null;
  const cloudy = isCloudyForecast(wxText);

  const clearWater = (ntu !== null) ? (ntu < 15) : null;
  const cloudyWater = (ntu !== null) ? (ntu >= 30) : null;
  const now = new Date();
  const laterSeason = (now.getMonth()+1) >= 4;

  if (cloudyWater) return {suggestion:"Dark colors", why:`Turbidity ${ntu} NTU is muddy. Dark silhouettes (black, purple, dark blue) show best.`};
  if (clearWater && cloudy === true) return {suggestion:"Bright colors", why:`Clear water (${ntu} NTU) + cloudy/low light. Use chartreuse, orange, pink to stand out.`};
  if (clearWater && cloudy === false && laterSeason) return {suggestion:"Natural colors", why:`Clear water (${ntu} NTU) + sunny and later-season. Go natural (olive, silver, smelt/shiner patterns).`};
  if (clearWater && cloudy === false) return {suggestion:"Natural to subtle", why:`Clear water (${ntu} NTU) and sun. Start natural; add a small bright accent if needed.`};
  if (ntu !== null && ntu >= 15 && ntu < 30) return {suggestion:"Bright with contrast", why:`Stained water (${ntu} NTU). Use brighter colors or two-tone contrast for visibility.`};
  return {suggestion:"Start with contrast", why:"If light or clarity is uncertain, start with a high-contrast option (natural body + bright head) and adjust."};
}

function parseWaterTempFromNearshoreText(txt){
  // tries to find "WATER TEMPERATURE" line
  const lines = String(txt||"").split(/\r?\n/);
  for (const line of lines){
    const m = line.match(/WATER TEMPERATURE\.*?(\d+)\s*F/i);
    if (m) return Number(m[1]);
  }
  // fallback: "Water temp ..." anywhere
  const m2 = String(txt||"").match(/water\s+temperature[^\d]*(\d+)\s*F/i);
  if (m2) return Number(m2[1]);
  return null;
}

async function getWaterTemp(){
  // Primary: tgftp nearshore text (may be blocked by CORS in some hosts)
  const tgftp = "https://tgftp.nws.noaa.gov/data/forecasts/marine/near_shore/le/lez444.txt";
  try{
    const txt = await fetchText(tgftp);
    const wt = parseWaterTempFromNearshoreText(txt);
    return {tempF: wt, source: "NOAA nearshore LEZ444 (tgftp)", raw: txt};
  }catch(e){
    // Fallback: api.weather.gov zone forecast text (CORS-friendly)
    try{
      const j = await fetchJSON("https://api.weather.gov/zones/forecast/LEZ444/forecast");
      const text = j?.properties?.periods?.map(p=>p.detailedForecast).join(" ") || "";
      const wt = parseWaterTempFromNearshoreText(text);
      return {tempF: wt, source: "NWS API zone forecast LEZ444 (fallback)", raw: text};
    }catch(e2){
      return {tempF: null, source: "NOAA LEZ444 unavailable (CORS?)", raw: ""};
    }
  }
}

async function fetchUSGS(site, parameterCd){
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=${parameterCd}&siteStatus=all`;
  return await fetchJSON(url);
}
function firstValue(usgsJson){
  try{
    const series = usgsJson.value.timeSeries[0];
    const v = series.values[0].value[0].value;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }catch(e){
    return null;
  }
}

function buildHourlyPrecip(periods, hours=24){
  const out = [];
  for (const p of periods.slice(0,hours)){
    out.push({
      startTime: p.startTime,
      hourLabel: new Date(p.startTime).toLocaleTimeString([], {hour:"numeric"}),
      precip: p.probabilityOfPrecipitation?.value ?? null
    });
  }
  return out;
}

async function getWindWeather(loc){
  const points = await fetchJSON(`https://api.weather.gov/points/${loc.lat},${loc.lon}`);
  const hourlyUrl = points?.properties?.forecastHourly;
  const gridId = points?.properties?.gridId;
  const gridX = points?.properties?.gridX;
  const gridY = points?.properties?.gridY;
  const stationName = points?.properties?.relativeLocation?.properties?.city
    ? `${points.properties.relativeLocation.properties.city}, ${points.properties.relativeLocation.properties.state}`
    : (points?.properties?.cwa || "NWS point");

  const hourly = await fetchJSON(hourlyUrl);
  const periods = hourly?.properties?.periods || [];
  const offsetMin = offsetMinutesFromISO(periods[0]?.startTime);

  // Determine "today" local date from first period
  const firstUTC = new Date(periods[0]?.startTime);
  const localMs0 = firstUTC.getTime() + offsetMin*60*1000;
  const localD0 = new Date(localMs0);
  let Y = localD0.getUTCFullYear();
  let Mn = localD0.getUTCMonth()+1;
  let D = localD0.getUTCDate();

  function addDaysLocal(y,mn,d,add){
    const dt = new Date(Date.UTC(y, mn-1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate()+add);
    return {Y: dt.getUTCFullYear(), Mn: dt.getUTCMonth()+1, D: dt.getUTCDate()};
  }
  function localDateToUTC(y,mn,d,h,mi){
    return new Date(Date.UTC(y, mn-1, d, h, mi, 0) - offsetMin*60*1000);
  }
  function computeWindowsForLocalDate(y,mn,d){
    const noonUTC = new Date(Date.UTC(y, mn-1, d, 12, 0, 0));
    const {sunriseUTC, sunsetUTC} = calcSunTimes(noonUTC, loc.lat, loc.lon);
    const sunrise = sunriseUTC || localDateToUTC(y,mn,d,6,0);
    const sunset  = sunsetUTC  || localDateToUTC(y,mn,d,18,0);
    const amStartUTC = new Date(sunrise.getTime() - 2*3600*1000);
    const amEndUTC   = localDateToUTC(y,mn,d,10,0);
    const pmStartUTC = new Date(sunset.getTime() - 2*3600*1000);
    const pmEndUTC   = new Date(sunset.getTime() + 2*3600*1000);
    return {sunrise, sunset, amStartUTC, amEndUTC, pmStartUTC, pmEndUTC, y, mn, d};
  }
  function pickPeriodsBetween(startUTC, endUTC){
    const s = startUTC.getTime(), e = endUTC.getTime();
    return periods.filter(p=>{
      const t = new Date(p.startTime).getTime();
      return t >= s && t <= e;
    });
  }

  const now = Date.now();
  const wToday = computeWindowsForLocalDate(Y,Mn,D);
  let wAM = wToday;
  let wPM = wToday;
  if (wToday.amEndUTC.getTime() < now){
    const nxt = addDaysLocal(Y,Mn,D,1);
    wAM = computeWindowsForLocalDate(nxt.Y, nxt.Mn, nxt.D);
  }
  if (wToday.pmEndUTC.getTime() < now){
    const nxt = addDaysLocal(Y,Mn,D,1);
    wPM = computeWindowsForLocalDate(nxt.Y, nxt.Mn, nxt.D);
  }

  const amPeriods = pickPeriodsBetween(wAM.amStartUTC, wAM.amEndUTC);
  const pmPeriods = pickPeriodsBetween(wPM.pmStartUTC, wPM.pmEndUTC);

  const am = summarizePeriods(amPeriods);
  const pm = summarizePeriods(pmPeriods);

  const windows = {
    am: {start: formatLocalHM(localMinutesFromUTC(wAM.amStartUTC, offsetMin)), end: formatLocalHM(localMinutesFromUTC(wAM.amEndUTC, offsetMin))},
    pm: {start: formatLocalHM(localMinutesFromUTC(wPM.pmStartUTC, offsetMin)), end: formatLocalHM(localMinutesFromUTC(wPM.pmEndUTC, offsetMin))},
    sunrise: formatLocalHM(localMinutesFromUTC(wToday.sunrise, offsetMin)),
    sunset: formatLocalHM(localMinutesFromUTC(wToday.sunset, offsetMin))
  };

  const windowDates = {
    am: `${wAM.y}-${String(wAM.mn).padStart(2,"0")}-${String(wAM.d).padStart(2,"0")}`,
    pm: `${wPM.y}-${String(wPM.mn).padStart(2,"0")}-${String(wPM.d).padStart(2,"0")}`
  };

  return {
    stationName,
    forecastPoint: {name: loc.name, lat: loc.lat, lon: loc.lon},
    periods,
    am, pm,
    windows,
    windowDates,
    precipHourly: buildHourlyPrecip(periods, 24),
    offsetMin
  };
}

function renderHourlyPrecip(list){
  const wrap = document.getElementById("precipChart");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!list || !list.length){
    wrap.textContent = "—";
    return;
  }
  for (const p of list){
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.margin = "6px 0";

    const label = document.createElement("div");
    label.style.width = "48px";
    label.style.fontSize = "12px";
    label.style.opacity = "0.9";
    label.textContent = p.hourLabel;

    const barWrap = document.createElement("div");
    barWrap.style.flex = "1";
    barWrap.style.height = "10px";
    barWrap.style.borderRadius = "999px";
    barWrap.style.background = "rgba(255,255,255,.08)";
    barWrap.style.overflow = "hidden";

    const bar = document.createElement("div");
    const v = (typeof p.precip === "number") ? p.precip : 0;
    bar.style.width = `${Math.max(0, Math.min(100, v))}%`;
    bar.style.height = "100%";
    bar.style.borderRadius = "999px";
    bar.style.background = "rgba(120,198,163,.85)";

    barWrap.appendChild(bar);

    const val = document.createElement("div");
    val.style.width = "44px";
    val.style.fontSize = "12px";
    val.style.textAlign = "right";
    val.textContent = (typeof p.precip === "number") ? `${p.precip}%` : "—";

    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(val);
    wrap.appendChild(row);
  }
}

function applyModeUI(){
  const modeSelect = document.getElementById("modeSelect");
  const boatControls = document.getElementById("boatControls");
  if (!modeSelect || !boatControls) return;
  const s = loadSettings();
  modeSelect.value = s.mode;
  boatControls.style.display = (s.mode === "boat") ? "block" : "none";
}

function wireControls(){
  const modeSelect = document.getElementById("modeSelect");
  const boatControls = document.getElementById("boatControls");
  const boatPreset = document.getElementById("boatPreset");
  const boatName = document.getElementById("boatName");
  const boatLat = document.getElementById("boatLat");
  const boatLon = document.getElementById("boatLon");
  const applyBoat = document.getElementById("applyBoat");
  if (!modeSelect) return;

  const presets = {
    belleisle: {name:"Belle Isle", lat:42.3390, lon:-82.9800},
    fortwayne: {name:"Fort Wayne", lat:42.3006, lon:-83.0935},
    trenton: {name:"Trenton Channel", lat:42.1380, lon:-83.2200},
    grosseile: {name:"Grosse Ile", lat:42.1296, lon:-83.1450},
    custom: null
  };

  function applyUIFromSettings(){
    const s = loadSettings();
    modeSelect.value = s.mode;
    if (boatControls) boatControls.style.display = (s.mode === "boat") ? "block" : "none";
    if (boatPreset) boatPreset.value = s.boatPreset || "custom";
    if (boatName) boatName.value = s.boatName || "";
    if (boatLat) boatLat.value = String(s.boatLat ?? "");
    if (boatLon) boatLon.value = String(s.boatLon ?? "");
  }

  modeSelect.addEventListener("change", ()=>{
    const s = loadSettings();
    s.mode = modeSelect.value === "boat" ? "boat" : "shore";
    saveSettings(s);
    if (boatControls) boatControls.style.display = (s.mode === "boat") ? "block" : "none";
  });

  if (boatPreset){
    boatPreset.addEventListener("change", ()=>{
      const key = boatPreset.value;
      const p = presets[key];
      const s = loadSettings();
      s.boatPreset = key;
      if (p){
        s.boatName = p.name;
        s.boatLat = p.lat;
        s.boatLon = p.lon;
      }
      saveSettings(s);
      applyUIFromSettings();
    });
  }

  if (applyBoat){
    applyBoat.addEventListener("click", ()=>{
      const s = loadSettings();
      s.mode = modeSelect.value === "boat" ? "boat" : "shore";
      s.boatPreset = boatPreset ? boatPreset.value : "custom";
      s.boatName = (boatName && boatName.value) ? boatName.value : (s.boatName || "Boat point");
      s.boatLat = boatLat ? Number(boatLat.value) : s.boatLat;
      s.boatLon = boatLon ? Number(boatLon.value) : s.boatLon;
      saveSettings(s);
      document.getElementById("refresh")?.click();
    });
  }

  applyUIFromSettings();
}

async function refresh(){
  try{
    $("updated").textContent = "Updating…";
    const s = loadSettings();
    const loc = (s.mode === "boat")
      ? {lat: clamp(s.boatLat, -90, 90), lon: clamp(s.boatLon, -180, 180), name: s.boatName || "Boat point"}
      : {lat: 42.3145, lon: -83.078667, name: "Riverside Park"};

    // Water temp
    const wt = await getWaterTemp();
    $("waterTemp").textContent = (typeof wt.tempF === "number") ? `${wt.tempF}°F` : "—";
    // Air temp will come from AM median temp for now (as in original)
    // Wind / weather
    const ww = await getWindWeather(loc);
    const fp = document.getElementById("forecastPoint");
    if (fp) fp.textContent = `${ww.forecastPoint.name} (${ww.forecastPoint.lat.toFixed(4)}, ${ww.forecastPoint.lon.toFixed(4)})`;
    const ws = document.getElementById("windSource");
    if (ws) ws.textContent = ww.stationName;

    // Fill AM/PM
    $("windAM").textContent = ww.am.wind;
    $("wxAM").textContent = ww.am.wx;
    $("pcpAM").textContent = (typeof ww.am.precip === "number") ? `${ww.am.precip}%` : "—";
    $("windPM").textContent = ww.pm.wind;
    $("wxPM").textContent = ww.pm.wx;
    $("pcpPM").textContent = (typeof ww.pm.precip === "number") ? `${ww.pm.precip}%` : "—";
    // Air temp from AM median temp
    $("airTemp").textContent = ww.am.temp || "—";

    // window times + dates if present
    const w = ww.windows;
    const winEl = document.getElementById("windWindows");
    if (winEl) winEl.textContent = `AM window: ${w.am.start}–${w.am.end} • PM window: ${w.pm.start}–${w.pm.end} • Sunrise: ${w.sunrise} • Sunset: ${w.sunset}`;
    const ad = document.getElementById("amDate");
    const pd = document.getElementById("pmDate");
    if (ad) ad.textContent = ww.windowDates?.am ?? "—";
    if (pd) pd.textContent = ww.windowDates?.pm ?? "—";

    renderHourlyPrecip(ww.precipHourly);

    // USGS
    const [turbJson, flowJson] = await Promise.all([
      fetchUSGS("04166500","63680"), // turbidity NTU
      fetchUSGS("04165710","00060")  // discharge cfs
    ]);
    const turbidityNTU = firstValue(turbJson);
    const dischargeCFS = firstValue(flowJson);

    $("turbidity").textContent = (typeof turbidityNTU === "number") ? `${turbidityNTU.toFixed(1)} NTU` : "—";
    $("discharge").textContent = (typeof dischargeCFS === "number") ? `${Math.round(dischargeCFS).toLocaleString()} cfs` : "—";
    const interp = interpretTurbidity(turbidityNTU);
    $("clarityStatus").textContent = interp.status;
    $("clarityMeaning").textContent = interp.meaning;
    const us = document.getElementById("usgsSource");
    if (us) us.textContent = "USGS IV 04166500 (NTU) + 04165710 (CFS)";

    // Lure + jig
    const ls = document.getElementById("lureSuggestion");
    const lw = document.getElementById("lureWhy");
    if (ls && lw){
      const rec = lureColorSuggestion(turbidityNTU, ww.am.wx);
      ls.textContent = rec.suggestion;
      lw.textContent = rec.why;
    }
    const jw = document.getElementById("jigWeight");
    const jy = document.getElementById("jigWhy");
    if (jw && jy){
      const jrec = jigWeightSuggestion(dischargeCFS);
      jw.textContent = jrec.weight;
      jy.textContent = jrec.why;
    }

    const ts = document.getElementById("tempSource");
    if (ts) ts.textContent = `Water: ${wt.source} • Wind/Precip: NWS hourly via api.weather.gov`;

    $("updated").textContent = `Updated: ${new Date().toLocaleString()}`;
  }catch(err){
    $("updated").textContent = "Error: " + (err?.message || String(err));
  }
}

$("refresh")?.addEventListener("click", refresh);
window.addEventListener("load", ()=>{
  // show build tag if present
  const b = document.getElementById("buildTag");
  if (b) b.textContent = "20260220222343";
  wireControls();
  refresh();
});
