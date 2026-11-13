'use strict';
/* =====================================================================
   穿搭助手 v2 扩展：统计页（日历/体检/风格记忆/购衣参谋）+ 日程 + 旅行打包 + AI
   依赖 app.js 的全局（state/ui/esc/...），在 app.js 之前加载、之后调用
   ===================================================================== */

let TRIP_TEXT = '';

/* ================= 统计页 ================= */
function renderStats() {
  const el = document.getElementById('page-stats');
  if (!ui.calMonth) ui.calMonth = today().slice(0, 7);

  let html = '';

  /* ---- 穿着日历 ---- */
  const [y, m] = ui.calMonth.split('-').map(Number);
  const startPad = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const wearMap = {};
  state.wearlog.forEach((w) => { wearMap[w.date] = w; });

  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const w = wearMap[ds];
    const dots = w ? w.ids.slice(0, 4).map((id) => {
      const it = findItem(id);
      return it ? '<span class="cal-dot" style="background:' + (HEX_OF[it.color] || it.colorHex || '#ccc') + '"></span>' : '';
    }).join('') : '';
    cells += '<div class="cal-cell' + (ds === today() ? ' today' : '') + (w ? ' has' : '') + '"' +
      (w ? ' data-action="open-day" data-v="' + ds + '"' : '') + '>' +
      '<div class="cal-d">' + d + '</div><div class="cal-dots">' + dots + '</div></div>';
  }

  html += '<div class="section-title">穿着日历' +
    '<span><button class="link-btn" data-action="cal-prev">‹</button> ' + y + ' 年 ' + m + ' 月 ' +
    '<button class="link-btn" data-action="cal-next">›</button></span></div>' +
    '<div class="manual-record"><div class="cal-grid">' +
    ['日', '一', '二', '三', '四', '五', '六'].map((d) => '<div class="cal-head">' + d + '</div>').join('') +
    cells + '</div><div class="muted" style="margin-top:6px">点有色点的日期看当天穿了啥</div></div>';

  /* ---- 衣橱体检 ---- */
  const active = state.items.filter((i) => i.status === 'active');
  const wornIds = new Set();
  state.wearlog.forEach((w) => w.ids.forEach((id) => wornIds.add(id)));
  const util = active.length ? Math.round(wornIds.size / active.length * 100) : 0;

  const counts = {};
  state.wearlog.forEach((w) => w.ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  const top5 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, n]) => ({ it: findItem(id), n })).filter((x) => x.it);

  const dust = active.filter((i) => {
    const never = !i.lastWorn && daysSince(i.createdAt) > 30;
    const old = i.lastWorn && daysSince(i.lastWorn) > 60;
    return never || old;
  });

  const groups = {};
  active.forEach((i) => {
    const k = i.category + '|' + i.subtype + '|' + i.color;
    (groups[k] = groups[k] || []).push(i);
  });
  const similar = Object.values(groups).filter((g) => g.length > 1);

  html += '<div class="section-title">衣橱体检</div><div class="manual-record">' +
    '<div class="kv"><span class="k">利用率</span><span>' + util + '%（' + wornIds.size + ' / ' + active.length + ' 件被穿过）</span></div>' +
    (top5.length ? '<div class="kv"><span class="k">最常穿</span><span>' +
      top5.map((x) => esc(x.it.name) + '×' + x.n).join('，') + '</span></div>' : '') +
    (dust.length ? '<div class="kv"><span class="k">吃灰中</span><span>' +
      dust.slice(0, 6).map((i) => esc(i.name)).join('，') + (dust.length > 6 ? ' 等 ' + dust.length + ' 件' : '') + '</span></div>' : '') +
    (similar.length ? '<div class="kv"><span class="k">有点重复</span><span>' +
      similar.map((g) => esc(g[0].color + g[0].subtype) + '×' + g.length).join('，') + '</span></div>' : '') +
    '</div>';

  /* ---- 风格记忆 ---- */
  const likeF = {}, dislikeF = {};
  Object.entries(state.feedback).forEach(([key, f]) => {
    key.split('|').map(findItem).filter(Boolean).forEach((it) => {
      const t = it.subtype;
      if (f.like) likeF[t] = (likeF[t] || 0) + f.like;
      if (f.dislike) dislikeF[t] = (dislikeF[t] || 0) + f.dislike;
    });
  });
  const wornF = {};
  state.wearlog.forEach((w) => w.ids.map(findItem).filter(Boolean).forEach((it) => {
    wornF[it.subtype] = (wornF[it.subtype] || 0) + 1;
  }));
  const memLines = [];
  const topLike = Object.entries(likeF).sort((a, b) => b[1] - a[1])[0];
  const topDislike = Object.entries(dislikeF).sort((a, b) => b[1] - a[1])[0];
  const topWorn = Object.entries(wornF).sort((a, b) => b[1] - a[1])[0];
  if (topLike) memLines.push('好评里最常出现的是「' + topLike[0] + '」');
  if (topDislike) memLines.push('你点过不喜欢的搭配多带「' + topDislike[0] + '」，往后会少推');
  if (topWorn) memLines.push('实际穿得最多的是「' + topWorn[0] + '」（' + topWorn[1] + ' 次）');
  if (!memLines.length) memLines.push('多用几天（点👍👎、记录穿着），这里会慢慢长出你的风格画像');

  html += '<div class="section-title">风格记忆</div><div class="manual-record">' +
    memLines.map((l) => '<div class="kv"><span>' + esc(l) + '</span></div>').join('') + '</div>';

  /* ---- 购衣参谋 ---- */
  if (typeof gapAdvice === 'function') {
    const gaps = gapAdvice();
    html += '<div class="section-title">购衣参谋</div><div class="manual-record">' +
      (gaps.length
        ? gaps.map((g) => '<div class="kv"><span class="k">' + esc(g.label) + '</span><span>约盘活 ' + g.count + ' 套搭配</span></div>').join('') +
          '<div class="muted" style="margin-top:6px">按你现有衣橱模拟得出，仅供参考——买之前想想是不是真缺。</div>'
        : '<div class="muted">衣橱还太小，先把基础款攒起来再说。</div>') +
      '</div>';
  }

  /* ---- 旅行打包 ---- */
  html += '<div class="section-title">旅行打包</div><div class="manual-record">' +
    '<div class="mr-row">' +
    '<input type="number" id="trip-days" value="3" min="1" max="10" placeholder="天数">' +
    '<input type="number" id="trip-temp" value="' + (tempForDay(0) == null ? 20 : tempForDay(0)) + '" placeholder="目的地温度">' +
    '<select id="trip-occ">' + OCCASIONS.map((o) => '<option value="' + o + '"' + (o === '休闲' ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>' +
    '</div>' +
    '<button class="btn primary" data-action="trip-gen">生成打包清单</button>' +
    '<div id="trip-out"></div></div>';

  el.innerHTML = html;

  if (TRIP_TEXT && document.getElementById('trip-out')) renderTripOut();
}

/* ================= 购衣参谋 ================= */
function gapAdvice() {
  const active = state.items.filter((i) => i.status === 'active');
  const byCat = {};
  CATS.forEach((c) => { byCat[c] = active.filter((i) => i.category === c); });
  const out = [];

  for (const cat of ['top', 'pants', 'shoes', 'outer']) {
    for (const st of (SUBTYPES[cat] || [])) {
      const owned = byCat[cat].some((i) => i.subtype === st.name);
      if (owned) continue;
      const cand = {
        id: 'cand', category: cat, subtype: st.name,
        color: cat === 'shoes' ? '白' : '卡其', colorHex: cat === 'shoes' ? '#f7f7f5' : '#c8b18a',
        formality: st.form, tmin: st.tmin, tmax: st.tmax, tags: ['休闲'], lastWorn: null, like: 0, dislike: 0
      };
      let count = 0;
      for (const t of (cat === 'top' ? [cand] : byCat.top))
        for (const p of (cat === 'pants' ? [cand] : byCat.pants))
          for (const s of (cat === 'shoes' ? [cand] : byCat.shoes)) {
            if (!t || !p || !s) continue;
            const r = scoreCombo(t, p, s, null, '休闲', null);
            if (r.total >= 4.5) count++;
          }
      if (count > 0) out.push({ label: '缺一' + (cat === 'shoes' ? '双' : '件') + st.name + '（' + (cat === 'shoes' ? '白色类' : '卡其类') + '）', count });
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 3);
}

/* ================= 旅行打包 ================= */
function buildTrip(days, temp, occ) {
  const used = new Set();
  const sets = [];
  for (let i = 0; i < days; i++) {
    const got = generateSets(1, used, temp, occ);
    if (!got.length) break;
    sets.push(got[0]);
    used.add(got[0].key);
  }
  return sets;
}
function renderTripOut() {
  const out = document.getElementById('trip-out');
  if (!out) return;
  const sets = ui.tripSets || [];
  let html = '<div class="divider"></div>';
  sets.forEach((set, i) => {
    html += '<div class="outfit-row" style="margin-bottom:6px"><b style="min-width:44px">D' + (i + 1) + '</b>' +
      set.ids.map((id) => {
        const it = findItem(id);
        if (!it) return '';
        const url = imgCache.get(it.id);
        return (url ? '<img src="' + url + '" style="width:42px;height:42px;border-radius:8px;object-fit:cover">' :
          '<div class="noimg" style="width:42px;height:42px;border-radius:8px;font-size:10px">无图</div>') +
          '<span class="muted" style="margin-right:6px">' + esc(it.name) + '</span>';
      }).join('') + '</div>';
  });
  const extraList = ['身份证/护照', '手机+充电器', '充电宝', '洗漱包', '护肤/防晒', '常用药', '纸巾湿巾', '耳机', '伞'];
  html += '<div class="muted" style="margin:8px 0 4px">别忘了：</div>' +
    '<div class="tag-row">' + extraList.map((x, i) =>
      '<button class="tag-btn" data-action="trip-check" data-v="' + i + '">' + x + '</button>').join('') + '</div>' +
    '<div class="sheet-actions"><button class="btn ghost" data-action="trip-copy">复制清单文字</button></div>';
  out.innerHTML = html;
}

/* ================= 日程（场合预设） ================= */
function openScheduleSheet(keepDate) {
  const root = document.getElementById('sheet-root');
  const entries = Object.entries(state.settings.occMap || {}).sort();
  const dateVal = keepDate || dayOffset(1);
  root.innerHTML =
    '<div class="sheet-mask" data-action="close-sheet"><div class="sheet" data-stop="1">' +
    '<h3>日程安排</h3>' +
    '<div class="muted">给某天指定场合，那天的推荐会自动偏向它。</div>' +
    '<label class="fld">日期</label><input type="date" id="sch-date" value="' + dateVal + '">' +
    '<label class="fld">场合</label>' +
    '<div class="tag-row">' + OCCASIONS.map((o) =>
      '<button class="tag-btn' + (o === (ui.schOcc || OCCASIONS[0]) ? ' on' : '') + '" data-action="sch-pick" data-v="' + o + '">' + o + '</button>').join('') + '</div>' +
    '<div class="sheet-actions"><button class="btn primary" data-action="sch-add">添加</button>' +
    '<button class="btn ghost" data-action="close-sheet">完成</button></div>' +
    (entries.length ? '<div class="divider"></div><label class="fld">已安排</label>' +
      entries.map(([d, o]) => '<div class="kv"><span class="k">' + esc(d) + '</span><span>' + esc(o) +
        ' <button class="link-btn" data-action="sch-del" data-v="' + d + '">删除</button></span></div>').join('') : '') +
    '</div></div>';
  if (!ui.schOcc) ui.schOcc = OCCASIONS[0];
}
function openDaySheet(dateStr) {
  const w = state.wearlog.find((x) => x.date === dateStr);
  if (!w) return;
  const root = document.getElementById('sheet-root');
  root.innerHTML =
    '<div class="sheet-mask" data-action="close-sheet"><div class="sheet" data-stop="1">' +
    '<h3>' + esc(dateStr) + ' 穿了</h3>' +
    w.ids.map(itemRow).join('') +
    '<div class="sheet-actions"><button class="btn ghost" data-action="close-sheet">关闭</button></div>' +
    '</div></div>';
}

/* ================= 旅行打包交互 ================= */
function tripGen() {
  const days = Math.max(1, Math.min(10, parseInt(document.getElementById('trip-days').value, 10) || 3));
  const temp = parseInt(document.getElementById('trip-temp').value, 10);
  const occ = document.getElementById('trip-occ').value;
  const sets = buildTrip(days, isNaN(temp) ? tempForDay(0) : temp, occ);
  if (!sets.length) { toast('衣橱里凑不出这么多天，先补几件'); return; }
  ui.tripSets = sets;
  TRIP_TEXT = '打包清单（' + days + ' 天，' + (isNaN(temp) ? '' : temp + '°，') + occ + '）：\n' +
    sets.map((s, i) => 'D' + (i + 1) + '：' + s.ids.map((id) => { const it = findItem(id); return it ? it.name : ''; }).filter(Boolean).join(' + ')).join('\n') +
    '\n别忘了：身份证、手机充电器、充电宝、洗漱包、护肤/防晒、常用药、纸巾、耳机、伞';
  renderTripOut();
  toast('清单已生成，共 ' + sets.length + ' 套');
}

/* ================= AI ================= */
function aiConfigured() {
  const a = state.settings.ai;
  return !!(a.url && a.key && a.model);
}
async function aiFetch(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 60000);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
  } finally { clearTimeout(t); }
}
async function aiChat(messages, maxTokens) {
  const a = state.settings.ai;
  const r = await aiFetch(a.url.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + a.key },
    body: JSON.stringify({ model: a.model, messages, max_tokens: maxTokens || 300 })
  }, 60000);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 80));
  }
  const j = await r.json();
  return j.choices[0].message.content;
}
function blobToDataURL(blob) {
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });
}
async function testAi() {
  if (!aiConfigured()) { toast('先填接口地址、模型和 Key'); return; }
  toast('测试中…');
  try {
    const r = await aiChat([{ role: 'user', content: '回复两个字：正常' }], 10);
    toast('连通 ✓ 返回：' + r.trim().slice(0, 20));
  } catch (e) {
    toast('连不通：' + e.message);
  }
}

async function aiIdentifyDraft() {
  const d = ui.draft;
  if (!d || !d._newPhoto) { toast('先选一张照片'); return; }
  if (!aiConfigured()) { toast('先在设置里配置 AI'); return; }
  toast('AI 识别中…');
  try {
    const dataUrl = await blobToDataURL(d._newPhoto);
    const prompt = '这是一件衣物的照片。识别后只输出一个 JSON 对象（不要代码块标记、不要多余文字），字段：' +
      '{"category":"top|outer|pants|shoes","subtype":"子类型","color":"颜色名","formality":1到5的整数,"tmin":适穿最低温数字,"tmax":适穿最高温数字,"tags":["休闲"/"商务"/"运动"/"街头"]数组}。' +
      '子类型可选：top: T恤/Polo/衬衫/卫衣/毛衣/针织衫；outer: 夹克/风衣/西装外套/大衣/羽绒服；pants: 牛仔裤/休闲裤/西裤/运动裤/短裤；shoes: 运动鞋/板鞋/皮鞋/靴子/凉鞋。' +
      '颜色名从这16个里选最接近的：黑/白/灰/藏青/牛仔蓝/蓝/绿/卡其/米/驼/棕/红/粉/橙/黄/紫。';
    const content = await aiChat([
      { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }
    ], 300);
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('返回格式不对');
    const j = JSON.parse(m[0]);
    if (j.category && CAT[j.category]) d.category = j.category;
    const subs = (SUBTYPES[d.category] || []).map((x) => x.name);
    if (j.subtype && subs.includes(j.subtype)) d.subtype = j.subtype;
    else if (subs.length) d.subtype = subs[0];
    if (j.color && HEX_OF[j.color]) { d.color = j.color; d.colorHex = HEX_OF[j.color]; }
    if (j.formality >= 1 && j.formality <= 5) d.formality = Math.round(j.formality);
    if (typeof j.tmin === 'number') d.tmin = j.tmin;
    if (typeof j.tmax === 'number') d.tmax = j.tmax;
    if (Array.isArray(j.tags)) d.tags = j.tags.filter((t) => TAGS.includes(t));
    renderItemSheet();
    toast('AI 已填好，确认后保存');
  } catch (e) {
    console.error(e);
    toast('AI 识别失败：' + e.message);
  }
}

async function aiReviewSet(set) {
  if (!aiConfigured()) { toast('先在设置里配置 AI（设置页最下面）'); return; }
  if (ui.reviews[set.key]) {
    delete ui.reviews[set.key];
    renderToday();
    return;
  }
  toast('AI 点评中…');
  try {
    const items = set.ids.map(findItem).filter(Boolean);
    const parts = [];
    for (const it of items) {
      const blob = await photoGet(it.id);
      if (blob) parts.push({ type: 'image_url', image_url: { url: await blobToDataURL(blob) } });
    }
    const desc = items.map((x) => x.name + '（' + CAT[x.category] + '，' + x.color + x.subtype + '，正式度' + x.formality + '）').join('；');
    parts.push({
      type: 'text',
      text: '今天气温约' + tempForDay(ui.viewDay) + '°，场合：' + (state.settings.occasion || '通勤') +
        '。这套穿搭：' + desc + '。请用一句口语化中文点评（50字以内），指出一个亮点和一个可改进点。'
    });
    const content = await aiChat([{ role: 'user', content: parts }], 200);
    ui.reviews[set.key] = content.trim();
    renderToday();
  } catch (e) {
    console.error(e);
    toast('AI 点评失败：' + e.message);
  }
}

/* ================= 扩展页自己的事件 ================= */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;
  switch (act) {
    case 'cal-prev':
    case 'cal-next': {
      const [y, m] = ui.calMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + (act === 'cal-next' ? 1 : -1), 1);
      ui.calMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      renderStats();
      break;
    }
    case 'open-day': openDaySheet(el.dataset.v); break;

    case 'sch-pick': {
      const dv = document.getElementById('sch-date') ? document.getElementById('sch-date').value : null;
      ui.schOcc = el.dataset.v;
      openScheduleSheet(dv);
      break;
    }
    case 'sch-add': {
      const dv = document.getElementById('sch-date').value;
      if (!dv) { toast('选个日期'); break; }
      state.settings.occMap[dv] = ui.schOcc || OCCASIONS[0];
      saveAll(); ui.setsFor = null;
      openScheduleSheet();
      toast('已安排 ' + dv + ' → ' + state.settings.occMap[dv]);
      break;
    }
    case 'sch-del':
      delete state.settings.occMap[el.dataset.v];
      saveAll(); ui.setsFor = null;
      openScheduleSheet();
      break;

    case 'trip-gen': tripGen(); break;
    case 'trip-check': el.classList.toggle('on'); break;
    case 'trip-copy':
      try {
        await navigator.clipboard.writeText(TRIP_TEXT);
        toast('已复制到剪贴板');
      } catch (e) {
        toast('复制失败，请手动选择文字');
      }
      break;

    case 'sync-setup': await syncSetup(); break;
    case 'sync-push': await syncPush(); break;
    case 'sync-pull':
    case 'sync-pull-now': await syncPull(); break;
  }
});

/* ================= GitHub 同步（私有仓库） ================= */
function syncConfigured() {
  const s = state.settings.sync;
  return !!(s && s.token && s.repo);
}
function syncRepoPath() {
  const s = state.settings.sync;
  return '/repos/' + (s.owner || '') + '/' + s.repo;
}
function u8ToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}
function b64ToU8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function ghApi(path, opts) {
  const s = state.settings.sync;
  const base = s.apiBase || 'https://api.github.com';
  const r = await aiFetch(base + path, Object.assign({
    headers: {
      'Authorization': 'Bearer ' + s.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }, opts || {}), 30000);
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw new Error('同步口令无效或已过期');
    if (r.status === 409) throw new Error('云端已被更新，先「从云端恢复」再上传');
    throw new Error('GitHub ' + r.status + '：' + (j.message || ''));
  }
  return j;
}

async function syncSetup() {
  const token = document.getElementById('set-sync-token').value.trim();
  const repo = document.getElementById('set-sync-repo').value.trim() || 'outfit-data';
  if (!token) { toast('先填同步口令'); return; }
  state.settings.sync = Object.assign({}, state.settings.sync, { token, repo });
  toast('连接中…');
  try {
    const me = await ghApi('/user');
    if (!me) throw new Error('口令无效');
    state.settings.sync.owner = me.login;
    let repoInfo = await ghApi(syncRepoPath());
    if (!repoInfo) {
      repoInfo = await ghApi('/user/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repo, private: true, auto_init: true, description: '穿搭助手数据（私有）' })
      });
      toast('已创建私有仓库 ' + me.login + '/' + repo);
    }
    saveAll(); renderSettings();
    toast('同步已就绪 ✓');
  } catch (e) {
    console.error(e);
    toast('连接失败：' + e.message);
  }
}

async function syncPush(silent) {
  if (!syncConfigured()) { toast('先在设置里配置同步'); return false; }
  try {
    const blob = await buildZipBlob(true); // 云端同步含 AI 配置（配置随数据走）
    const b64 = u8ToB64(new Uint8Array(await blob.arrayBuffer()));
    const path = syncRepoPath() + '/contents/backup.zip';
    const existing = await ghApi(path);
    const body = {
      message: 'sync ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
      content: b64
    };
    if (existing) body.sha = existing.sha;
    const resp = await ghApi(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const s = state.settings.sync;
    s.lastSyncAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    s.lastRemoteSha = resp && resp.content ? resp.content.sha : null;
    ui.syncNotice = null;
    saveAll();
    if (!silent) { renderSettings(); toast('已上传到云端 ✓'); }
    return true;
  } catch (e) {
    console.error(e);
    if (!silent) toast('上传失败：' + e.message);
    return false;
  }
}

async function syncPull() {
  if (!syncConfigured()) { toast('先在设置里配置同步'); return; }
  try {
    toast('从云端拉取…');
    const f = await ghApi(syncRepoPath() + '/contents/backup.zip');
    if (!f) { toast('云端还没有备份，先点「上传到云端」'); return; }
    const u8 = b64ToU8(f.content);
    const entries = parseZip(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    const raw = entries['library.json'];
    if (!raw) throw new Error('云端文件格式不对');
    const meta = JSON.parse(new TextDecoder().decode(raw));
    if (!confirm('用云端数据替换本机（' + (meta.items || []).length + ' 件衣物）？')) return;
    await applyLibrary(meta, entries);
    const s = state.settings.sync;
    s.lastSyncAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    s.lastRemoteSha = f.sha;
    ui.syncNotice = null;
    saveAll();
    renderAll();
    toast('已同步到本机 ✓');
  } catch (e) {
    console.error(e);
    toast('同步失败：' + e.message);
  }
}

async function syncCheck() {
  if (!syncConfigured()) return;
  try {
    const f = await ghApi(syncRepoPath() + '/contents/backup.zip');
    if (f && f.sha !== state.settings.sync.lastRemoteSha) {
      ui.syncNotice = '云端有新版本，和本机不是同一份';
      renderAll();
    }
  } catch (e) { /* 静默：离线或口令失效不打扰 */ }
}
