'use strict';
/* =====================================================================
   穿搭助手 v2 —— 本地衣橱 + 每日穿搭建议
   核心：存储 / 取色 / 天气 / 打分推荐 / 今天 / 衣橱 / 设置 / 备份
   统计页与 AI 功能在 extra.js
   ===================================================================== */

/* ================= 常量 ================= */
const CAT = { top: '上衣', outer: '外套', pants: '裤子', shoes: '鞋子' };
const CATS = ['top', 'outer', 'pants', 'shoes'];

const SUBTYPES = {
  top: [
    { name: 'T恤', form: 2, tmin: 20, tmax: 38 },
    { name: 'Polo', form: 3, tmin: 18, tmax: 32 },
    { name: '衬衫', form: 3, tmin: 15, tmax: 30 },
    { name: '卫衣', form: 2, tmin: 8, tmax: 22 },
    { name: '毛衣', form: 3, tmin: 5, tmax: 18 },
    { name: '针织衫', form: 3, tmin: 10, tmax: 25 }
  ],
  outer: [
    { name: '夹克', form: 3, tmin: 8, tmax: 22 },
    { name: '风衣', form: 4, tmin: 8, tmax: 20 },
    { name: '西装外套', form: 4, tmin: 10, tmax: 24 },
    { name: '大衣', form: 4, tmin: -2, tmax: 15 },
    { name: '羽绒服', form: 2, tmin: -10, tmax: 10 }
  ],
  pants: [
    { name: '牛仔裤', form: 2, tmin: 0, tmax: 30 },
    { name: '休闲裤', form: 3, tmin: 2, tmax: 28 },
    { name: '西裤', form: 4, tmin: 2, tmax: 25 },
    { name: '运动裤', form: 1, tmin: 5, tmax: 32 },
    { name: '短裤', form: 1, tmin: 24, tmax: 38 }
  ],
  shoes: [
    { name: '运动鞋', form: 2, tmin: -5, tmax: 32 },
    { name: '板鞋', form: 3, tmin: 0, tmax: 30 },
    { name: '皮鞋', form: 4, tmin: 0, tmax: 28 },
    { name: '靴子', form: 3, tmin: -10, tmax: 18 },
    { name: '凉鞋', form: 1, tmin: 22, tmax: 38 }
  ]
};

const PALETTE = [
  ['黑', '#222222'], ['白', '#f7f7f5'], ['灰', '#9aa0a6'], ['藏青', '#26364f'],
  ['牛仔蓝', '#4a6fa5'], ['蓝', '#2e6fd9'], ['绿', '#3e8e5a'], ['卡其', '#c8b18a'],
  ['米', '#ece3d2'], ['驼', '#b98a5e'], ['棕', '#7a5230'], ['红', '#c73e3e'],
  ['粉', '#e59aa8'], ['橙', '#e07b39'], ['黄', '#e6c23c'], ['紫', '#8a5bb5']
];
const HEX_OF = Object.fromEntries(PALETTE);
const NEUTRAL = new Set(['黑', '白', '灰', '藏青', '牛仔蓝', '卡其', '米', '驼', '棕']);

const MATRIX = {
  '牛仔裤': { '运动鞋': 2, '板鞋': 2, '皮鞋': 1, '靴子': 2, '凉鞋': 1 },
  '休闲裤': { '运动鞋': 1.5, '板鞋': 2, '皮鞋': 1.5, '靴子': 1.5, '凉鞋': 1 },
  '西裤':   { '运动鞋': 0, '板鞋': 0.5, '皮鞋': 2, '靴子': 1, '凉鞋': 0 },
  '运动裤': { '运动鞋': 2, '板鞋': 1, '皮鞋': 0, '靴子': 0, '凉鞋': 1 },
  '短裤':   { '运动鞋': 1.5, '板鞋': 1.5, '皮鞋': 0.5, '靴子': 0, '凉鞋': 2 }
};

const TAGS = ['休闲', '商务', '运动', '街头'];
const OCCASIONS = ['通勤', '休闲', '运动', '正式'];
const STATUS = { active: '可穿', laundry: '在洗', stored: '收纳', retired: '退役' };

/* ================= 状态 ================= */
let state = {
  items: [],          // {id,category,subtype,name,color,colorHex,formality,tmin,tmax,tags,status,lastWorn,wearCount,like,dislike,createdAt}
  wearlog: [],        // {date, ids:[...], key, feedback}
  feedback: {},       // key -> {like,dislike}
  settings: {
    city: '上海', lat: 31.23, lon: 121.47,
    manualTemp: null, weather: null,      // weather: {temp,feels,min,max,desc,date,forecast:[{date,min,max,desc}]}
    lastBackup: null, occasion: null,
    occMap: {},                           // 'YYYY-MM-DD' -> 场合
    plan: null,                           // {date, ids} 昨晚挑好的明早方案
    ai: { url: '', key: '', model: '' }   // 可选：OpenAI 兼容接口
  }
};
let ui = {
  tab: 'today',
  viewDay: 0,          // 0=今天 1=明天
  closetFilter: { cat: 'all', status: 'active' },
  sets: [],
  setsFor: null,       // 当前 sets 对应的日期
  reviews: {},         // set.key -> 点评文字
  draft: null,
  batchQueue: [],      // 批量录入待处理照片
  calMonth: null       // 统计页日历月份 'YYYY-MM'
};
const imgCache = new Map(); // itemId -> objectURL

/* ================= 存储 ================= */
function loadAll() {
  try {
    const it = JSON.parse(localStorage.getItem('outfit.items') || '[]');
    const wl = JSON.parse(localStorage.getItem('outfit.wearlog') || '[]');
    const fb = JSON.parse(localStorage.getItem('outfit.feedback') || '{}');
    const st = JSON.parse(localStorage.getItem('outfit.settings') || '{}');
    if (Array.isArray(it)) state.items = it;
    if (Array.isArray(wl)) state.wearlog = wl;
    if (fb && typeof fb === 'object') state.feedback = fb;
    if (st && typeof st === 'object') {
      state.settings = Object.assign(state.settings, st);
      state.settings.ai = Object.assign({ url: '', key: '', model: '' }, st.ai || {});
      state.settings.occMap = st.occMap || {};
    }
  } catch (e) { console.warn('读取本地数据失败', e); }
}
function saveAll() {
  localStorage.setItem('outfit.items', JSON.stringify(state.items));
  localStorage.setItem('outfit.wearlog', JSON.stringify(state.wearlog));
  localStorage.setItem('outfit.feedback', JSON.stringify(state.feedback));
  localStorage.setItem('outfit.settings', JSON.stringify(state.settings));
}

/* IndexedDB：照片 */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('outfitDB', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('photos'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function photoPut(id, blob) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(blob, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function photoGet(id) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readonly');
    const rq = tx.objectStore('photos').get(id);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => rej(rq.error);
  });
}
async function photoDel(id) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function preloadPhotos() {
  for (const it of state.items) {
    if (!imgCache.has(it.id)) {
      const b = await photoGet(it.id);
      if (b) imgCache.set(it.id, URL.createObjectURL(b));
    }
  }
}

/* ================= 工具 ================= */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function today(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return today(d);
}
function daysSince(dateStr) {
  if (!dateStr) return 14;
  return Math.round((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000);
}
function findItem(id) { return state.items.find((i) => i.id === id); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}
function hexLightness(hex) {
  if (!hex || hex[0] !== '#') return 0.5;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/* ================= 图片：压缩 + 取色 ================= */
async function compressImage(file, maxSide, quality) {
  maxSide = maxSide || 720; quality = quality || 0.82;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  const d = mx - mn;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function rgbToFamily(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.14) {
    if (l < 0.16) return '黑';
    if (l > 0.86) return '白';
    return l > 0.62 ? '米' : '灰';
  }
  if (h < 16 || h >= 345) return l > 0.68 ? '粉' : '红';
  if (h < 38) {
    if (l > 0.62 && s < 0.55) return '驼';
    if (l > 0.55) return '橙';
    return '棕';
  }
  if (h < 65) return l > 0.6 ? '黄' : '驼';
  if (h < 165) return '绿';
  if (h < 200) return l > 0.55 ? '绿' : '牛仔蓝';
  if (h < 255) return l < 0.38 ? '藏青' : (s < 0.45 ? '灰' : '蓝');
  if (h < 290) return '紫';
  return l > 0.65 ? '粉' : '紫';
}
async function extractColors(blob) {
  const bmp = await createImageBitmap(blob);
  const S = 80;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, S, S);
  const data = ctx.getImageData(0, 0, S, S).data;
  const buckets = new Map();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const cx = Math.abs(x - S / 2) / (S / 2), cy = Math.abs(y - S / 2) / (S / 2);
      const weight = (cx < 0.65 && cy < 0.65) ? 2 : 1;
      const key = (r >> 5) + '_' + (g >> 5) + '_' + (b >> 5);
      let e = buckets.get(key);
      if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; buckets.set(key, e); }
      e.n += weight; e.r += r * weight; e.g += g * weight; e.b += b * weight;
    }
  }
  const top = [...buckets.values()].sort((a, b2) => b2.n - a.n).slice(0, 6);
  const out = [];
  for (const e of top) {
    const r = Math.round(e.r / e.n), g = Math.round(e.g / e.n), b = Math.round(e.b / e.n);
    const fam = rgbToFamily(r, g, b);
    if (out.some((o) => o.family === fam)) continue;
    out.push({ family: fam, hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') });
    if (out.length >= 3) break;
  }
  return out;
}

/* ================= 天气 ================= */
async function fetchWithTimeout(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 6000);
  try { return await fetch(url, { signal: ctl.signal }); }
  finally { clearTimeout(t); }
}
function parseWttr(j) {
  const cur = j.current_condition[0];
  const forecast = (j.weather || []).map((w) => ({
    date: w.date,
    min: parseInt(w.mintempC, 10),
    max: parseInt(w.maxtempC, 10),
    desc: (w.hourly && w.hourly[4] && w.hourly[4].weatherDesc) ? w.hourly[4].weatherDesc[0].value : ''
  }));
  return {
    temp: parseInt(cur.temp_C, 10),
    feels: parseInt(cur.FeelsLikeC, 10),
    min: forecast[0] ? forecast[0].min : null,
    max: forecast[0] ? forecast[0].max : null,
    desc: cur.weatherDesc ? cur.weatherDesc[0].value : '',
    forecast, date: today()
  };
}
async function refreshWeather() {
  const s = state.settings;
  try {
    const r = await fetchWithTimeout('https://wttr.in/' + encodeURIComponent(s.city) + '?format=j1', 6000);
    s.weather = parseWttr(await r.json());
    saveAll(); renderAll();
    return true;
  } catch (e) {
    try {
      const r2 = await fetchWithTimeout(
        'https://api.open-meteo.com/v1/forecast?latitude=' + s.lat + '&longitude=' + s.lon +
        '&current=temperature_2m&daily=temperature_2m_min,temperature_2m_max,weather_code&timezone=auto&forecast_days=4', 5000);
      const j2 = await r2.json();
      s.weather = {
        temp: Math.round(j2.current.temperature_2m),
        min: Math.round(j2.daily.temperature_2m_min[0]),
        max: Math.round(j2.daily.temperature_2m_max[0]),
        desc: '', date: today(),
        forecast: j2.daily.time.map((d, i) => ({
          date: d, min: Math.round(j2.daily.temperature_2m_min[i]),
          max: Math.round(j2.daily.temperature_2m_max[i]), desc: ''
        }))
      };
      saveAll(); renderAll();
      return true;
    } catch (e2) {
      return false;
    }
  }
}
function tempForDay(offset) {
  const s = state.settings;
  if (offset === 0 && s.manualTemp != null) return s.manualTemp;
  const fc = s.weather && s.weather.forecast && s.weather.forecast[offset];
  if (fc && fc.max != null) return Math.round((fc.min + fc.max) / 2);
  if (s.weather && s.weather.temp != null && offset === 0) return s.weather.temp;
  return s.manualTemp;
}
function occasionForDate(dateStr) {
  const s = state.settings;
  if (s.occMap && s.occMap[dateStr]) return s.occMap[dateStr];
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return (day === 0 || day === 6) ? '休闲' : '通勤';
}

/* ================= 打分与推荐 ================= */
function tempOk(item, temp) {
  return temp >= item.tmin - 1 && temp <= item.tmax + 1;
}
function hasOuterItems() {
  return state.items.some((i) => i.category === 'outer' && i.status === 'active');
}

function scoreCombo(t, p, s, temp, occ, o) {
  let total = 0;
  const reasons = [];
  const present = [t, p, s].concat(o ? [o] : []);

  /* 正式度一致（含外套） */
  const forms = present.map((x) => x.formality);
  const spread = Math.max.apply(null, forms) - Math.min.apply(null, forms);
  if (spread === 0) { total += 2; reasons.push('整体正式度一致（' + forms[0] + ' 级）'); }
  else if (spread === 1) { total += 1; }
  else { total -= spread; reasons.push('正式度跨度 ' + spread + ' 级，略违和'); }
  const avgF = forms.reduce((a, b) => a + b, 0) / forms.length;
  if (occ === '通勤' && avgF >= 3) total += 0.6;
  if (occ === '正式' && avgF >= 4) total += 0.8;
  if (occ === '休闲' && avgF <= 3) total += 0.6;
  if (occ === '运动' && avgF <= 2) total += 0.8;

  /* 颜色 */
  const fams = present.map((x) => x.color);
  const distinct = new Set(fams).size;
  if (distinct <= 2) { total += 1.5; reasons.push('配色干净：' + [...new Set(fams)].join(' + ')); }
  else if (distinct === 3) { total += 0.5; }
  else { total -= 1; }
  const allNeutral = fams.every((f) => NEUTRAL.has(f));
  if (allNeutral) {
    total += 1;
    if (distinct === 3) reasons.push(fams.join(' + ') + ' 都是安全中性色');
  }
  if (!NEUTRAL.has(t.color) && !NEUTRAL.has(p.color) && t.color !== p.color) {
    total -= 1; reasons.push('上衣和裤子都带彩色，容易打架');
  }
  if (t.color === p.color) total += 0.8;
  if (s.color === '白' || s.color === '黑') total += 0.4;
  if (s.color === t.color || s.color === p.color) { total += 0.5; reasons.push('鞋子和衣服顺色呼应'); }

  /* 上浅下深 */
  const lt = hexLightness(t.colorHex), lp = hexLightness(p.colorHex);
  if (lt >= lp + 0.1) { total += 0.5; reasons.push('上浅下深，比例舒服'); }

  /* 季节感：夏天偏轻薄明亮，冬天偏沉稳 */
  const month = new Date().getMonth() + 1;
  const avgL = present.reduce((a, x) => a + hexLightness(x.colorHex), 0) / present.length;
  if ((month >= 4 && month <= 9 && avgL >= 0.45) || ((month <= 3 || month >= 10) && avgL <= 0.55)) total += 0.4;

  /* 裤×鞋类型矩阵 */
  const m = (MATRIX[p.subtype] || {})[s.subtype];
  if (m != null) total += m;

  /* 风格标签 */
  const tagSets = present.map((x) => new Set(x.tags || []));
  let common = null;
  for (const tag of tagSets[0]) if (tagSets.every((st) => st.has(tag))) common = tag;
  if (common) { total += 0.8; reasons.push('整体都是' + common + '风'); }
  const allTags = [].concat(...present.map((x) => x.tags || []));
  if (allTags.includes('运动') && allTags.includes('商务')) {
    total -= 0.8; reasons.push('风格标签冲突（运动×商务）');
  }

  /* 叠穿层逻辑 */
  if (temp != null && hasOuterItems()) {
    if (temp <= 12) {
      if (o) { total += 1.5; reasons.push('天冷，加件外套刚好'); }
      else total -= 1.2;
    } else if (temp <= 17 && o) {
      total += 0.5;
    } else if (temp >= 22 && o) {
      total -= 0.5;
    }
  }

  /* 轮换 */
  for (const it of present) total += Math.min(daysSince(it.lastWorn), 10) * 0.08;

  /* 历史反馈 */
  const key = present.map((x) => x.id).sort().join('|');
  const fb = state.feedback[key];
  if (fb) {
    total += (fb.like || 0) * 0.9 - (fb.dislike || 0) * 1.2;
    if (fb.like && !fb.dislike) reasons.push('你上次给过好评');
    if (fb.dislike) reasons.push('这套曾被你点过不喜欢，谨慎');
  }
  for (const it of present) total += (it.like || 0) * 0.15 - (it.dislike || 0) * 0.25;

  if (temp != null) reasons.unshift(temp + '°，都在适穿区间');

  total += Math.random() * 0.5;
  return { total, reasons, key, ids: present.map((x) => x.id) };
}

function generateSets(n, excludeKeys, dayTemp, dayOcc) {
  n = n || 3; excludeKeys = excludeKeys || new Set();
  const items = state.items.filter((i) => i.status === 'active');
  const tops = items.filter((i) => i.category === 'top');
  const outers = items.filter((i) => i.category === 'outer');
  const pants = items.filter((i) => i.category === 'pants');
  const shoes = items.filter((i) => i.category === 'shoes');
  const temp = dayTemp != null ? dayTemp : tempForDay(0);
  const occ = dayOcc || occasionForDate(dayOffset(ui.viewDay));

  const combos = [];
  for (const t of tops) for (const p of pants) for (const s of shoes) {
    if (temp != null && (!tempOk(t, temp) || !tempOk(p, temp) || !tempOk(s, temp))) continue;
    const outerChoices = [null].concat(outers.filter((o) => temp == null || tempOk(o, temp)));
    for (const o of outerChoices) {
      const r = scoreCombo(t, p, s, temp, occ, o);
      if (excludeKeys.has(r.key)) continue;
      combos.push(r);
    }
  }
  combos.sort((a, b) => b.total - a.total);

  const picked = [];
  const overlap = (a, b) => a.ids.filter((id) => b.ids.includes(id)).length;
  for (const pass of [(a, b) => overlap(a, b) <= 1, (a, b) => overlap(a, b) <= 2]) {
    for (const c of combos) {
      if (picked.includes(c)) continue;
      if (picked.every((o) => pass(o, c))) picked.push(c);
      if (picked.length >= n) return picked;
    }
  }
  for (const c of combos) { if (!picked.includes(c)) { picked.push(c); if (picked.length >= n) break; } }
  return picked;
}

/* ================= 穿着记录与反馈 ================= */
function recordWear(ids, dateStr) {
  const d = dateStr || today();
  const key = ids.slice().sort().join('|');
  const existing = state.wearlog.find((w) => w.date === d);
  if (existing) {
    if (existing.key !== key) { existing.ids = ids; existing.key = key; }
  } else {
    state.wearlog.push({ date: d, ids: ids.slice(), key, feedback: null });
    for (const id of ids) {
      const it = findItem(id);
      if (it) { it.lastWorn = d; it.wearCount = (it.wearCount || 0) + 1; }
    }
  }
  saveAll();
}
function setFeedback(key, kind) {
  const f = state.feedback[key] || (state.feedback[key] = { like: 0, dislike: 0 });
  if (kind === 'like') f.like++; else f.dislike++;
  for (const id of key.split('|')) {
    const it = findItem(id);
    if (it) { if (kind === 'like') it.like = (it.like || 0) + 1; else it.dislike = (it.dislike || 0) + 1; }
  }
  saveAll();
}

/* ================= 渲染：今天 ================= */
function itemRow(id) {
  const it = findItem(id);
  if (!it) return '';
  const url = imgCache.get(it.id);
  return '<div class="outfit-row">' +
    (url ? '<img src="' + url + '" alt="">' : '<div class="noimg">无图</div>') +
    '<div><div class="item-name">' + esc(it.name) + '</div>' +
    '<div class="item-sub"><span class="swatch" style="background:' + (HEX_OF[it.color] || it.colorHex || '#ccc') + '"></span>' +
    esc(it.color) + ' · ' + esc(it.subtype) + ' · 正式度 ' + it.formality + '</div></div></div>';
}

function renderToday() {
  const el = document.getElementById('page-today');
  const s = state.settings;
  const off = ui.viewDay;
  const dateStr = dayOffset(off);
  const temp = tempForDay(off);
  const occ = s.occasion && off === 0 ? s.occasion : occasionForDate(dateStr);
  const w = s.weather;

  let html = '';
  if (ui.syncNotice) {
    html += '<div class="banner">☁️ ' + esc(ui.syncNotice) +
      ' <button class="link-btn" data-action="sync-pull-now">立即同步到本机</button></div>';
  }
  /* 今明切换 + 天气 + 场合 */
  html += '<div class="ctx-row">' +
    '<button class="ctx-pill' + (off === 0 ? ' on' : '') + '" data-action="set-viewday" data-v="0">今天</button>' +
    '<button class="ctx-pill' + (off === 1 ? ' on' : '') + '" data-action="set-viewday" data-v="1">明天</button>' +
    '<button class="ctx-pill" data-action="edit-temp"><b>' + esc(s.city) + ' · ' + (temp == null ? '温度未知' : temp + '°') + '</b> · 改</button>' +
    '</div>';

  /* 3 天预报 */
  if (w && w.forecast && w.forecast.length) {
    html += '<div class="forecast-row">' + w.forecast.slice(0, 3).map((f, i) =>
      '<div class="fc-chip' + (i === off ? ' on' : '') + '">' +
      '<div class="fc-day">' + ['今天', '明天', '后天'][i] + '</div>' +
      '<div class="fc-t">' + f.min + '~' + f.max + '°</div>' +
      '<div class="fc-d">' + esc(f.desc || '') + '</div></div>').join('') + '</div>';
  }

  html += '<div class="ctx-row">' +
    '<span class="muted">场合：</span>' +
    OCCASIONS.map((o) => '<button class="occ-chip' + (o === occ ? ' on' : '') + '" data-action="set-occ" data-v="' + o + '">' + o + '</button>').join('') +
    '<button class="link-btn" data-action="open-schedule">📅 日程</button>' +
    '</div>';
  if (s.occMap && s.occMap[dateStr] && off !== 0) {
    html += '<div class="banner">📅 这天有日程安排：' + esc(s.occMap[dateStr]) + '</div>';
  }

  if (state.items.length === 0) {
    el.innerHTML = html + '<div class="empty"><div class="big">👔</div>衣橱还是空的<br>去「衣橱」拍几件衣服进来（支持连拍）</div>';
    return;
  }

  /* 昨晚挑好的明早方案 */
  if (off === 1 && s.plan && s.plan.date === dateStr) {
    html += '<div class="manual-record"><div class="kv"><span class="k">已定方案</span><span>' +
      s.plan.ids.map((id) => { const it = findItem(id); return it ? esc(it.name) : '?'; }).join(' + ') +
      '</span></div><button class="link-btn" data-action="clear-plan">取消方案</button></div>';
  }

  /* 候选 */
  const genKey = dateStr + '|' + occ + '|' + temp;
  if (ui.setsFor !== genKey) {
    ui.sets = generateSets(3, new Set(), temp, occ);
    ui.setsFor = genKey;
    ui.reviews = {};
  }
  if (!ui.sets.length) {
    html += '<div class="empty"><div class="big">🌡️</div>当前 ' + (temp == null ? '' : temp + '° ') +
      '没有满足适穿温度的组合<br><button class="link-btn" data-action="edit-temp">改一下温度</button></div>';
  } else {
    html += '<div class="section-title">' + (off === 1 ? '明早候选' : '今日候选') +
      ' <button class="link-btn" data-action="regen">换一批 ⟳</button></div>';
    html += '<div class="cards">' + ui.sets.map((set, idx) => {
      const rows = set.ids.map(itemRow).join('');
      const rv = ui.reviews[set.key];
      return '<div class="outfit-card">' +
        '<div class="outfit-rows">' + rows + '</div>' +
        '<div class="reason">' + set.reasons.slice(0, 3).map(esc).join('；') + '</div>' +
        (rv ? '<div class="ai-review">' + esc(rv) + '</div>' : '') +
        '<div class="card-actions">' +
        (off === 1
          ? '<button class="btn primary" data-action="plan-set" data-i="' + idx + '">定为明早方案</button>'
          : '<button class="btn primary" data-action="wear-set" data-i="' + idx + '">就穿这套</button>') +
        '<button class="icon-btn" data-action="fb" data-i="' + idx + '" data-k="like">👍</button>' +
        '<button class="icon-btn" data-action="fb" data-i="' + idx + '" data-k="dislike">👎</button>' +
        '<button class="icon-btn" data-action="ai-review" data-i="' + idx + '" title="AI 点评">💬</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* 今天穿了啥 */
  if (off === 0) {
    const rec = state.wearlog.find((w2) => w2.date === today());
    if (rec) {
      const names = rec.ids.map((id) => { const it = findItem(id); return it ? it.name : '?'; }).join(' + ');
      html += '<div class="section-title">今日记录</div><div class="manual-record">' +
        '<div class="kv"><span class="k">已记录</span><span>' + esc(names) + '</span></div>' +
        '<button class="link-btn" data-action="manual-record">改记别的</button></div>';
    } else {
      const opts = (cat) => state.items.filter((i) => i.category === cat && i.status === 'active')
        .map((i) => '<option value="' + i.id + '">' + esc(i.name) + '</option>').join('');
      html += '<div class="section-title">没穿推荐的？手动记录今天</div>' +
        '<div class="manual-record">' +
        '<div class="mr-row"><select id="mr-top"><option value="">上衣*</option>' + opts('top') + '</select>' +
        '<select id="mr-outer"><option value="">外套(可选)</option>' + opts('outer') + '</select></div>' +
        '<div class="mr-row"><select id="mr-pants"><option value="">裤子*</option>' + opts('pants') + '</select>' +
        '<select id="mr-shoes"><option value="">鞋子*</option>' + opts('shoes') + '</select></div>' +
        '<button class="btn primary" data-action="save-manual-record">记录今天穿了啥</button></div>';
    }
  }

  el.innerHTML = html;
}

/* ================= 渲染：衣橱 ================= */
function renderCloset() {
  const el = document.getElementById('page-closet');
  const f = ui.closetFilter;
  let items = state.items.slice();
  if (f.cat !== 'all') items = items.filter((i) => i.category === f.cat);
  if (f.status !== 'all') items = items.filter((i) => (f.status === 'active' ? i.status === 'active' : i.status !== 'active'));

  const chip = (v, label, cur, action) =>
    '<button class="filter-chip' + (cur === v ? ' on' : '') + '" data-action="' + action + '" data-v="' + v + '">' + label + '</button>';

  let html = '<div class="filter-row">' +
    [['all', '全部'], ['top', '上衣'], ['outer', '外套'], ['pants', '裤子'], ['shoes', '鞋子']].map(([v, l]) => chip(v, l, f.cat, 'filter-cat')).join('') +
    '</div><div class="filter-row">' +
    chip('active', '只看可穿', f.status, 'filter-status') +
    chip('all', '含在洗/收纳/退役', f.status, 'filter-status') +
    '</div>';

  if (!items.length) {
    html += '<div class="empty"><div class="big">📷</div>这里还没有衣物<br>点右下角「＋ 添加」或「📷 连拍」</div>';
  } else {
    html += '<div class="grid">' + items.map((it) => {
      const url = imgCache.get(it.id);
      return '<div class="closet-item" data-action="open-item" data-id="' + it.id + '">' +
        (url ? '<img src="' + url + '" alt="">' : '<div class="noimg">无图</div>') +
        '<div class="ci-meta"><div class="ci-name">' + esc(it.name) + '</div>' +
        '<div class="ci-sub"><span class="status-dot dot-' + it.status + '"></span>' +
        '<span class="swatch" style="background:' + (HEX_OF[it.color] || it.colorHex || '#ccc') + '"></span>' +
        esc(it.color) + ' · ' + esc(it.subtype) + '</div></div></div>';
    }).join('') + '</div>';
  }
  html += '<button class="fab" data-action="add-item">＋ 添加</button>' +
    '<button class="fab fab2" data-action="batch-add">📷 连拍</button>';
  el.innerHTML = html;
}

/* ================= 渲染：设置 ================= */
function renderSettings() {
  const el = document.getElementById('page-settings');
  const s = state.settings;
  const lb = s.lastBackup;
  const days = lb ? daysSince(lb) : null;

  el.innerHTML =
    '<div class="section-title">备份</div>' +
    '<div class="manual-record">' +
    '<div class="kv"><span class="k">上次备份</span><span>' + (lb ? esc(lb) + '（' + days + ' 天前）' : '从未备份') + '</span></div>' +
    '<div class="kv"><span class="k">库内</span><span>' + state.items.length + ' 件 · ' + imgCache.size + ' 张照片 · ' + state.wearlog.length + ' 条穿着记录</span></div>' +
    '<div class="muted" style="margin:8px 0">导出的 zip 包含全部照片和记录。iPhone 点导出后在分享面板里可直接发到微信「文件传输助手」。清了浏览器数据就靠它恢复。</div>' +
    '<div class="sheet-actions">' +
    '<button class="btn primary" data-action="export">导出备份</button>' +
    '<button class="btn ghost" data-action="import">导入恢复</button>' +
    '</div></div>' +

    '<div class="section-title">天气</div>' +
    '<div class="manual-record">' +
    '<label class="fld">城市（用于自动取天气）</label>' +
    '<input type="text" id="set-city" value="' + esc(s.city) + '">' +
    '<div class="kv"><span class="k">当前缓存</span><span>' + (s.weather ? s.weather.temp + '°（' + esc(s.weather.desc || '自动') + '）' : '无') + '</span></div>' +
    '<div class="sheet-actions">' +
    '<button class="btn ghost" data-action="save-city">保存</button>' +
    '<button class="btn ghost" data-action="refresh-weather">重新取天气</button>' +
    '</div></div>' +

    '<div class="section-title">AI 点评 / 识别（可选）</div>' +
    '<div class="manual-record">' +
    '<div class="muted" style="margin-bottom:6px">接任意 OpenAI 兼容接口。密钥只存在本机浏览器，照片只发给你配置的接口。接口需支持 https（浏览器限制）。不配置也能正常使用其他功能。</div>' +
    '<label class="fld">接口地址（到 /v1 结尾）</label>' +
    '<input type="text" id="set-ai-url" value="' + esc(s.ai.url) + '" placeholder="https://api.xxx.com/v1">' +
    '<label class="fld">模型名</label>' +
    '<input type="text" id="set-ai-model" value="' + esc(s.ai.model) + '" placeholder="如 gpt-4o-mini / qwen-vl-plus">' +
    '<label class="fld">API Key</label>' +
    '<input type="password" id="set-ai-key" value="' + esc(s.ai.key) + '" placeholder="sk-...">' +
    '<div class="sheet-actions"><button class="btn ghost" data-action="save-ai">保存 AI 配置</button>' +
    '<button class="btn ghost" data-action="test-ai">测试连通</button></div></div>' +

    '<div class="section-title">同步（跨设备）</div>' +
    '<div class="manual-record">' +
    '<div class="muted" style="margin-bottom:6px">把数据和 AI 配置同步到你自己的 GitHub 私有仓库，电脑、手机就是同一份。同步口令只存本机、不进云端。</div>' +
    '<label class="fld">同步口令（GitHub Personal Access Token，权限勾选 repo）</label>' +
    '<input type="password" id="set-sync-token" value="' + esc((s.sync || {}).token || '') + '" placeholder="ghp_... 或 github_pat_...">' +
    '<label class="fld">仓库名（不存在会自动创建为私有仓库）</label>' +
    '<input type="text" id="set-sync-repo" value="' + esc((s.sync || {}).repo || 'outfit-data') + '">' +
    '<div class="kv"><span class="k">状态</span><span>' +
      (s.sync && s.sync.token
        ? (esc(s.sync.owner || '') + '/' + esc(s.sync.repo || '') + (s.sync.lastSyncAt ? ' · 上次同步 ' + esc(s.sync.lastSyncAt) : ' · 未同步过'))
        : '未配置') + '</span></div>' +
    '<div class="sheet-actions">' +
    '<button class="btn ghost" data-action="sync-setup">保存并连接</button>' +
    '<button class="btn primary" data-action="sync-push">上传到云端</button>' +
    '<button class="btn ghost" data-action="sync-pull">从云端恢复</button>' +
    '</div></div>' +

    '<div class="section-title">数据</div>' +
    '<div class="manual-record">' +
    '<div class="kv"><span class="k">手动温度</span><span>' + (s.manualTemp == null ? '未设置（自动）' : s.manualTemp + '°') + '</span></div>' +
    '<button class="link-btn" data-action="clear-temp">恢复自动温度</button>' +
    '<div class="divider"></div>' +
    '<button class="btn danger" data-action="clear-all">清空全部数据（危险）</button>' +
    '</div>' +

    '<div class="section-title">关于</div>' +
    '<div class="manual-record"><div class="muted">穿搭助手 v2.0 —— 数据全部存在本机浏览器（照片 IndexedDB，记录 localStorage），不上传任何服务器。建议加到主屏幕使用，并养成定期导出备份的习惯。</div></div>';
}

function renderBackupChip() {
  const chip = document.getElementById('backup-chip');
  const lb = state.settings.lastBackup;
  const days = lb ? daysSince(lb) : null;
  chip.classList.remove('hidden', 'warn');
  if (!lb) { chip.textContent = '⚠ 未备份'; chip.classList.add('warn'); }
  else if (days > 14) { chip.textContent = '⚠ ' + days + ' 天没备份'; chip.classList.add('warn'); }
  else { chip.textContent = '备份 ' + (days === 0 ? '今天' : days + ' 天前'); }
}

function renderAll() {
  renderBackupChip();
  if (ui.tab === 'today') renderToday();
  if (ui.tab === 'closet') renderCloset();
  if (ui.tab === 'stats' && typeof renderStats === 'function') renderStats();
  if (ui.tab === 'settings') renderSettings();
}

/* ================= 衣物表单（添加 / 编辑 / 批量） ================= */
function openItemSheet(id) {
  const it = id ? findItem(id) : null;
  ui.draft = it ? Object.assign({}, it, { tags: (it.tags || []).slice(), _newPhoto: null, _suggestions: [] }) : {
    id: null, category: 'top', subtype: 'T恤', name: '', color: '黑', colorHex: '#222222',
    formality: 2, tmin: 20, tmax: 38, tags: [], status: 'active', _newPhoto: null, _suggestions: []
  };
  renderItemSheet();
}

function renderItemSheet() {
  const d = ui.draft;
  const root = document.getElementById('sheet-root');
  const url = d._newPhoto ? URL.createObjectURL(d._newPhoto) : (d.id ? imgCache.get(d.id) : null);
  const subList = SUBTYPES[d.category] || [];
  const qLeft = ui.batchQueue.length;

  const suggestions = d._suggestions || [];
  const sugRow = suggestions.map((sg, i) =>
    '<button class="swatch-btn' + (d.color === sg.family ? ' on' : '') + '" data-action="pick-color" data-v="' + sg.family + '" data-hex="' + sg.hex + '">' +
    '<span class="sw" style="background:' + sg.hex + '"></span>' + sg.family + (i === 0 ? '（识别）' : '') + '</button>').join('');

  const paletteRow = PALETTE.map(([name, hex]) =>
    '<button class="swatch-btn' + (d.color === name ? ' on' : '') + '" data-action="pick-color" data-v="' + name + '" data-hex="' + hex + '">' +
    '<span class="sw" style="background:' + hex + '"></span>' + name + '</button>').join('');

  root.innerHTML =
    '<div class="sheet-mask" data-action="close-sheet"><div class="sheet" data-stop="1">' +
    '<h3>' + (d.id ? '编辑衣物' : (qLeft ? '批量录入（还剩 ' + (qLeft + 1) + ' 张）' : '添加衣物')) + '</h3>' +

    '<div class="photo-drop" data-action="pick-photo">' +
    (url ? '<img src="' + url + '" alt="">' : '<div class="hint">📷 点击拍照或选照片<br><span style="font-size:11px">拍平整、光线均匀，取色更准</span></div>') +
    '</div>' +
    '<div class="photo-btns">' +
    '<button class="btn ghost" data-action="pick-photo" data-capture="1">拍照</button>' +
    '<button class="btn ghost" data-action="pick-photo">从相册选</button>' +
    (state.settings.ai.url && state.settings.ai.key ? '<button class="btn ghost" data-action="ai-identify">🤖 AI 识别</button>' : '') +
    (d.id || d._newPhoto ? '<button class="btn danger" data-action="remove-photo">删照片</button>' : '') +
    '</div>' +

    '<label class="fld">类别</label>' +
    '<div class="tag-row">' + CATS.map((c) =>
      '<button class="tag-btn' + (d.category === c ? ' on' : '') + '" data-action="set-cat" data-v="' + c + '">' + CAT[c] + '</button>').join('') +
    '</div>' +

    '<label class="fld">子类型（决定温度和正式度默认值，也参与搭配打分）</label>' +
    '<select id="f-subtype">' + subList.map((st) =>
      '<option value="' + st.name + '"' + (d.subtype === st.name ? ' selected' : '') + '>' + st.name + '</option>').join('') + '</select>' +

    '<label class="fld">颜色（自动识别，不对就点色卡改）</label>' +
    (sugRow ? '<div class="swatch-row">' + sugRow + '</div>' : '') +
    '<div class="swatch-row">' + paletteRow + '</div>' +

    '<label class="fld">名称（自己一眼认得出就行）</label>' +
    '<input type="text" id="f-name" value="' + esc(d.name) + '" placeholder="如：藏青薄夹克">' +

    '<label class="fld">正式度 1–5（1 运动居家 … 5 正装）</label>' +
    '<select id="f-form">' + [1, 2, 3, 4, 5].map((v) =>
      '<option value="' + v + '"' + (d.formality === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>' +

    '<label class="fld">适穿温度区间（°C）</label>' +
    '<div class="mr-row">' +
    '<input type="number" id="f-tmin" value="' + d.tmin + '" placeholder="最低">' +
    '<input type="number" id="f-tmax" value="' + d.tmax + '" placeholder="最高">' +
    '</div>' +

    '<label class="fld">风格标签</label>' +
    '<div class="tag-row">' + TAGS.map((t) =>
      '<button class="tag-btn' + (d.tags.includes(t) ? ' on' : '') + '" data-action="toggle-tag" data-v="' + t + '">' + t + '</button>').join('') + '</div>' +

    (d.id ? '<label class="fld">状态</label><select id="f-status">' + Object.entries(STATUS).map(([k, v]) =>
      '<option value="' + k + '"' + (d.status === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>' : '') +

    '<div class="sheet-actions">' +
    '<button class="btn primary" data-action="save-item">' + (d.id ? '保存修改' : (qLeft ? '保存，拍下一件' : '加入衣橱')) + '</button>' +
    (qLeft ? '<button class="btn ghost" data-action="skip-batch">跳过这张</button>' : '') +
    '<button class="btn ghost" data-action="close-sheet">' + (qLeft ? '结束批量' : '取消') + '</button>' +
    (d.id ? '<button class="btn danger" data-action="delete-item">删除</button>' : '') +
    '</div></div></div>';
}

async function saveDraft(andNext) {
  const d = ui.draft;
  const nameEl = document.getElementById('f-name');
  const name = (nameEl && nameEl.value.trim()) || '';
  if (!name) { toast('给它起个名字吧'); return; }
  d.name = name;
  d.subtype = document.getElementById('f-subtype').value;
  d.formality = parseInt(document.getElementById('f-form').value, 10);
  d.tmin = parseInt(document.getElementById('f-tmin').value, 10);
  d.tmax = parseInt(document.getElementById('f-tmax').value, 10);
  if (document.getElementById('f-status')) d.status = document.getElementById('f-status').value;
  if (isNaN(d.tmin) || isNaN(d.tmax) || d.tmin > d.tmax) { toast('温度区间不对'); return; }

  if (d.id) {
    const it = findItem(d.id);
    Object.assign(it, {
      category: d.category, subtype: d.subtype, name: d.name, color: d.color, colorHex: d.colorHex,
      formality: d.formality, tmin: d.tmin, tmax: d.tmax, tags: d.tags.slice(), status: d.status
    });
    if (d._newPhoto) {
      await photoPut(it.id, d._newPhoto);
      imgCache.set(it.id, URL.createObjectURL(d._newPhoto));
    }
    if (d._photoRemoved) {
      await photoDel(it.id);
      imgCache.delete(it.id);
    }
  } else {
    const it = {
      id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      category: d.category, subtype: d.subtype, name: d.name, color: d.color, colorHex: d.colorHex,
      formality: d.formality, tmin: d.tmin, tmax: d.tmax, tags: d.tags.slice(), status: 'active',
      lastWorn: null, wearCount: 0, like: 0, dislike: 0, createdAt: today()
    };
    state.items.push(it);
    if (d._newPhoto) {
      await photoPut(it.id, d._newPhoto);
      imgCache.set(it.id, URL.createObjectURL(d._newPhoto));
    }
  }
  saveAll();
  ui.setsFor = null;
  toast('已保存 ✓');

  /* 批量模式：接着处理队列里的下一张 */
  if (andNext && ui.batchQueue.length) {
    const next = ui.batchQueue.shift();
    ui.draft = null;
    openItemSheet(null);
    await applyPhotoToDraft(next);
    renderItemSheet();
    return;
  }
  if (andNext && !ui.batchQueue.length) {
    closeSheet(); renderAll();
    toast('批量录入完成 ✓');
    return;
  }
  closeSheet();
  renderAll();
}

async function applyPhotoToDraft(file) {
  const blob = await compressImage(file);
  const sugg = await extractColors(blob);
  if (!ui.draft) return;
  ui.draft._newPhoto = blob;
  ui.draft._photoRemoved = false;
  if (sugg.length) {
    ui.draft._suggestions = sugg;
    ui.draft.color = sugg[0].family;
    ui.draft.colorHex = sugg[0].hex;
  }
}

async function deleteDraftItem() {
  const d = ui.draft;
  if (!d || !d.id) return;
  if (!confirm('删除「' + d.name + '」？它的照片和穿着记录也会清理。')) return;
  await photoDel(d.id);
  imgCache.delete(d.id);
  state.items = state.items.filter((i) => i.id !== d.id);
  state.wearlog.forEach((w) => { w.ids = w.ids.filter((x) => x !== d.id); w.key = w.ids.slice().sort().join('|'); });
  state.wearlog = state.wearlog.filter((w) => w.ids.length > 0);
  saveAll(); closeSheet(); ui.setsFor = null; renderAll();
  toast('已删除');
}

function closeSheet() {
  document.getElementById('sheet-root').innerHTML = '';
  ui.draft = null;
  ui.batchQueue = [];
}

/* ================= 导出 / 导入（zip，纯 JS） ================= */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const dt = dosDateTime(new Date());
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const lh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, dt.time, true); dv.setUint16(12, dt.date, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    parts.push(lh, data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dt.time, true); cv.setUint16(14, dt.date, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    central.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
}
function parseZip(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const dec = new TextDecoder();
  const out = {};
  let p = 0;
  while (p + 30 <= u8.length) {
    const sig = dv.getUint32(p, true);
    if (sig !== 0x04034b50) break;
    const method = dv.getUint16(p + 8, true);
    if (method !== 0) throw new Error('暂只支持本应用导出的 zip');
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const name = dec.decode(u8.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extraLen;
    out[name] = u8.slice(start, start + size);
    p = start + size;
  }
  return out;
}

async function buildZipBlob(includeSecrets) {
  const meta = {
    app: 'outfit', version: 2, exportedAt: new Date().toISOString(),
    items: state.items, wearlog: state.wearlog, feedback: state.feedback,
    settings: Object.assign({}, state.settings)
  };
  delete meta.settings.sync;                       // 同步令牌永不出本机
  if (!includeSecrets) delete meta.settings.ai;    // 发微信的备份不含 AI 密钥；云端同步含（配置随数据走）
  const files = [{ name: 'library.json', data: new TextEncoder().encode(JSON.stringify(meta)) }];
  for (const it of state.items) {
    const b = await photoGet(it.id);
    if (b) files.push({ name: 'photos/' + it.id + '.jpg', data: new Uint8Array(await b.arrayBuffer()) });
  }
  return makeZip(files);
}

async function doExport() {
  try {
    const blob = await buildZipBlob();
    const fname = '衣橱备份-' + today() + '.zip';
    const file = new File([blob], fname, { type: 'application/zip' });

    state.settings.lastBackup = today();
    saveAll(); renderBackupChip();

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '穿搭助手备份' });
        toast('已打开分享面板');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') { toast('已取消分享（备份时间已更新）'); return; }
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast('已导出到下载');
  } catch (e) {
    console.error(e);
    toast('导出失败：' + e.message);
  }
}

/* 把一份库数据应用到本机（导入/云端恢复共用） */
async function applyLibrary(meta, photoEntries) {
  if (photoEntries) {
    for (const it of (meta.items || [])) {
      const pb = photoEntries['photos/' + it.id + '.jpg'];
      if (pb) await photoPut(it.id, new Blob([pb], { type: 'image/jpeg' }));
    }
  }
  state.items = meta.items || [];
  state.wearlog = meta.wearlog || [];
  state.feedback = meta.feedback || {};
  /* meta.settings 里没有的键保持本机现状（比如同步令牌）；有的键随数据走（含 AI 配置） */
  state.settings = Object.assign(state.settings, meta.settings || {});
  saveAll();
  imgCache.clear();
  await preloadPhotos();
  ui.setsFor = null;
  renderAll();
}

async function doImport(file) {
  try {
    let meta = null;
    let photoEntries = null;
    const buf = await file.arrayBuffer();
    if (file.name.toLowerCase().endsWith('.zip')) {
      photoEntries = parseZip(buf);
      const raw = photoEntries['library.json'];
      if (!raw) throw new Error('zip 里没有 library.json');
      meta = JSON.parse(new TextDecoder().decode(raw));
    } else {
      meta = JSON.parse(new TextDecoder().decode(buf));
      if (!meta || !Array.isArray(meta.items)) throw new Error('文件格式不对');
    }
    if (!confirm('导入将替换当前全部数据（' + (meta.items || []).length + ' 件衣物），继续？')) return;
    await applyLibrary(meta, photoEntries);
    toast('导入成功 ✓');
  } catch (e) {
    console.error(e);
    toast('导入失败：' + e.message);
  }
}

/* ================= 事件 ================= */
function bindEvents() {
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const act = el.dataset.action;
    const d = ui.draft;

    if (act === 'close-sheet' && el.classList.contains('sheet-mask') && ev.target !== el) return;

    switch (act) {
      case 'close-sheet': closeSheet(); renderAll(); break;

      case 'set-viewday':
        ui.viewDay = parseInt(el.dataset.v, 10);
        ui.setsFor = null;
        renderToday();
        break;

      case 'set-occ':
        state.settings.occasion = el.dataset.v; saveAll(); ui.setsFor = null; renderAll(); break;

      case 'open-schedule':
        if (typeof openScheduleSheet === 'function') openScheduleSheet();
        break;

      case 'edit-temp': {
        const v = prompt('今天温度（°C）？留空恢复自动', tempForDay(0) == null ? '' : String(tempForDay(0)));
        if (v === null) break;
        const n = parseInt(v, 10);
        state.settings.manualTemp = isNaN(n) ? null : n;
        saveAll(); ui.setsFor = null; renderAll();
        break;
      }
      case 'clear-temp':
        state.settings.manualTemp = null; saveAll(); renderAll(); toast('已恢复自动温度'); break;

      case 'regen':
        ui.sets = generateSets(3, new Set(ui.sets.map((s) => s.key)), tempForDay(ui.viewDay), null);
        ui.reviews = {};
        renderToday();
        break;

      case 'wear-set': {
        const set = ui.sets[parseInt(el.dataset.i, 10)];
        if (set) {
          recordWear(set.ids);
          state.settings.plan = null;
          ui.setsFor = null;
          renderAll();
          toast('已记录今天穿了这套 ✓');
        }
        break;
      }
      case 'plan-set': {
        const set = ui.sets[parseInt(el.dataset.i, 10)];
        if (set) {
          state.settings.plan = { date: dayOffset(1), ids: set.ids };
          saveAll(); renderToday();
          toast('已定为明早方案 ✓');
        }
        break;
      }
      case 'clear-plan':
        state.settings.plan = null; saveAll(); renderToday(); break;

      case 'fb': {
        const set = ui.sets[parseInt(el.dataset.i, 10)];
        if (set) {
          setFeedback(set.key, el.dataset.k);
          el.classList.add(el.dataset.k === 'like' ? 'on-good' : 'on-bad');
          toast(el.dataset.k === 'like' ? '记住了，这类搭配加权' : '记住了，这类搭配降权');
        }
        break;
      }
      case 'ai-review': {
        const set = ui.sets[parseInt(el.dataset.i, 10)];
        if (set && typeof aiReviewSet === 'function') aiReviewSet(set, el);
        break;
      }
      case 'ai-identify':
        if (typeof aiIdentifyDraft === 'function') aiIdentifyDraft();
        break;

      case 'manual-record': {
        state.wearlog = state.wearlog.filter((w) => w.date !== today());
        saveAll(); renderToday();
        break;
      }
      case 'save-manual-record': {
        const ids = ['mr-top', 'mr-pants', 'mr-shoes', 'mr-outer']
          .map((x) => document.getElementById(x) ? document.getElementById(x).value : '')
          .filter(Boolean);
        if (ids.length < 3) { toast('上衣、裤子、鞋子都要选哦'); break; }
        recordWear(ids);
        renderAll();
        toast('已记录 ✓');
        break;
      }

      case 'filter-cat': ui.closetFilter.cat = el.dataset.v; renderCloset(); break;
      case 'filter-status': ui.closetFilter.status = el.dataset.v; renderCloset(); break;
      case 'add-item': openItemSheet(null); break;
      case 'open-item': openItemSheet(el.dataset.id); break;

      case 'batch-add': {
        const inp = document.getElementById('photo-input');
        inp.setAttribute('capture', 'environment');
        inp.setAttribute('multiple', 'multiple');
        inp.value = '';
        inp.dataset.mode = 'batch';
        inp.click();
        break;
      }
      case 'set-cat': {
        if (!d) break;
        d.category = el.dataset.v;
        const def = SUBTYPES[d.category][0] || {};
        d.subtype = def.name;
        if (def.name) { d.formality = def.form; d.tmin = def.tmin; d.tmax = def.tmax; }
        renderItemSheet();
        break;
      }
      case 'pick-color':
        if (d) { d.color = el.dataset.v; d.colorHex = el.dataset.hex || HEX_OF[d.color]; }
        renderItemSheet();
        break;
      case 'toggle-tag': {
        if (!d) break;
        const t = el.dataset.v;
        const i = d.tags.indexOf(t);
        if (i >= 0) d.tags.splice(i, 1); else d.tags.push(t);
        renderItemSheet();
        break;
      }
      case 'pick-photo': {
        const inp = document.getElementById('photo-input');
        if (el.dataset.capture) inp.setAttribute('capture', 'environment');
        else inp.removeAttribute('capture');
        inp.removeAttribute('multiple');
        inp.dataset.mode = 'single';
        inp.value = '';
        inp.click();
        break;
      }
      case 'remove-photo':
        if (d) { d._newPhoto = null; if (d.id) d._photoRemoved = true; }
        renderItemSheet();
        break;
      case 'save-item': await saveDraft(!!ui.batchQueue.length); break;
      case 'skip-batch': {
        if (ui.batchQueue.length) {
          const next = ui.batchQueue.shift();
          ui.draft = null;
          openItemSheet(null);
          await applyPhotoToDraft(next);
          renderItemSheet();
        }
        break;
      }
      case 'delete-item': await deleteDraftItem(); break;

      case 'export': await doExport(); break;
      case 'import': {
        const inp = document.getElementById('import-input');
        inp.value = ''; inp.click();
        break;
      }
      case 'save-city': {
        const v = document.getElementById('set-city').value.trim();
        if (v) { state.settings.city = v; saveAll(); toast('已保存城市'); }
        break;
      }
      case 'refresh-weather':
        toast('正在取天气…');
        if (!(await refreshWeather())) toast('取天气失败，可用手动温度');
        else { ui.setsFor = null; renderAll(); toast('天气已更新'); }
        break;
      case 'save-ai': {
        state.settings.ai = {
          url: document.getElementById('set-ai-url').value.trim(),
          model: document.getElementById('set-ai-model').value.trim(),
          key: document.getElementById('set-ai-key').value.trim()
        };
        saveAll(); toast('AI 配置已保存');
        break;
      }
      case 'test-ai':
        if (typeof testAi === 'function') testAi();
        break;
      case 'clear-all':
        if (confirm('确定清空全部数据？此操作不可恢复（除非有备份）。')) {
          if (prompt('输入「清空」确认') === '清空') {
            localStorage.clear();
            const db = await idb();
            db.transaction('photos', 'readwrite').objectStore('photos').clear();
            state.items = []; state.wearlog = []; state.feedback = {};
            imgCache.clear(); ui.setsFor = null;
            renderAll(); toast('已清空');
          }
        }
        break;
      case 'goto-settings':
        switchTab('settings');
        break;
    }
  });

  /* 表单变化 */
  document.addEventListener('change', async (ev) => {
    const d = ui.draft;
    if (ev.target.id === 'f-subtype' && d) {
      d.subtype = ev.target.value;
      const def = (SUBTYPES[d.category] || []).find((x) => x.name === d.subtype);
      if (def) { d.formality = def.form; d.tmin = def.tmin; d.tmax = def.tmax; }
      renderItemSheet();
    }
    if (ev.target.id === 'photo-input' && ev.target.files && ev.target.files.length) {
      const files = [...ev.target.files];
      try {
        if (ev.target.dataset.mode === 'batch') {
          ui.batchQueue = files.slice(1);
          openItemSheet(null);
          toast('处理照片中…');
          await applyPhotoToDraft(files[0]);
          renderItemSheet();
          toast('确认属性后点「保存，拍下一件」');
        } else {
          toast('处理照片中…');
          await applyPhotoToDraft(files[0]);
          if (ui.draft) {
            renderItemSheet();
            toast('照片好了，确认一下颜色');
          }
        }
      } catch (e) {
        console.error(e);
        toast('照片处理失败：' + e.message);
      }
    }
    if (ev.target.id === 'import-input' && ev.target.files && ev.target.files[0]) {
      await doImport(ev.target.files[0]);
    }
  });

  /* 表单输入同步到 draft */
  document.addEventListener('input', (ev) => {
    const d = ui.draft;
    if (!d) return;
    if (ev.target.id === 'f-tmin') d.tmin = parseInt(ev.target.value, 10);
    if (ev.target.id === 'f-tmax') d.tmax = parseInt(ev.target.value, 10);
    if (ev.target.id === 'f-name') d.name = ev.target.value;
    if (ev.target.id === 'f-form') d.formality = parseInt(ev.target.value, 10);
  });
}

function switchTab(tab) {
  ui.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ['today', 'closet', 'stats', 'settings'].forEach((t) => {
    document.getElementById('page-' + t).classList.toggle('hidden', tab !== t);
  });
  renderAll();
  window.scrollTo(0, 0);
}

/* ================= 启动 ================= */
async function init() {
  loadAll();
  await preloadPhotos();

  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  bindEvents();
  renderAll();

  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  refreshWeather();

  /* 云端有新版本时提示 */
  if (typeof syncCheck === 'function') syncCheck();
}
init();
