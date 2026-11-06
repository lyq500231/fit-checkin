'use strict';
/* =====================================================================
   FitCheck · 本地健身打卡
   所有数据保存在浏览器 localStorage，纯离线运行，无需服务器
   ===================================================================== */

/* ------------------------- 通用工具 ------------------------- */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
const pad2 = n => (n < 10 ? '0' : '') + n;
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
const uid = () => 'a' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const r1 = v => Math.round(v * 10) / 10;
const r0 = v => Math.round(v);
const fmtDate = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parseDate = s => { const p = String(s).split('-'); return new Date(+p[0], (+p[1]) - 1, +p[2]); };
const todayStr = () => fmtDate(new Date());
const addDaysD = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
const addDays = (s, n) => fmtDate(addDaysD(parseDate(s), n));
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const monthKey = s => String(s).slice(0, 7);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = arr => arr.reduce((a, b) => a + b, 0);
const uniq = arr => arr.filter((v, i) => arr.indexOf(v) === i);

function prettyDate(s) {
  const d = parseDate(s);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK_CN[d.getDay()];
}
function relDay(s) {
  const diff = daysBetween(todayStr(), s);   // diff > 0 表示未来
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff < 7) return diff + '天后';
  if (diff < -1 && diff > -7) return (-diff) + '天前';
  return '';
}
function startOfWeek(s) {
  const ws = (state.settings.weekStart || 0) % 7;
  const d = parseDate(s);
  return fmtDate(addDaysD(d, -((d.getDay() - ws + 7) % 7)));
}
function endOfWeek(s) { return addDays(startOfWeek(s), 6); }
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
}

/* ------------------------- 数据模型 ------------------------- */
const STORAGE_KEY = 'fitcheck.v1';
const METRIC_FIELDS = [
  { key: 'weight',  label: '体重',   unit: 'kg',  icon: '⚖️' },
  { key: 'bodyFat', label: '体脂率', unit: '%',   icon: '🔥' },
  { key: 'waist',   label: '腰围',   unit: 'cm',  icon: '📏' },
  { key: 'chest',   label: '胸围',   unit: 'cm',  icon: '📐' },
  { key: 'hip',     label: '臀围',   unit: 'cm',  icon: '📐' },
  { key: 'arm',     label: '臂围',   unit: 'cm',  icon: '💪' },
  { key: 'thigh',   label: '腿围',   unit: 'cm',  icon: '🦵' }
];
const MOODS = [
  { v: 1, ic: '😖', t: '很吃力' },
  { v: 2, ic: '😕', t: '一般' },
  { v: 3, ic: '😐', t: '还行' },
  { v: 4, ic: '🙂', t: '不错' },
  { v: 5, ic: '😄', t: '状态爆表' }
];

function mkEx(name, sets, reps, weight, rest) {
  return { id: uid(), name: name, sets: sets, reps: reps, weight: weight, rest: rest, note: '' };
}
function defaultPlan() {
  return {
    days: [
      { weekday: 0, name: '休息日 / 拉伸放松', rest: true, exercises: [] },
      { weekday: 1, name: '推日 · 胸 / 肩 / 三头', rest: false, exercises: [
        mkEx('杠铃卧推', 4, '8-12', 40, 120),
        mkEx('上斜哑铃卧推', 3, '10-12', 14, 90),
        mkEx('坐姿哑铃推肩', 4, '8-12', 16, 90),
        mkEx('绳索夹胸', 3, '12-15', 15, 60),
        mkEx('绳索下压', 3, '12-15', 20, 60)
      ] },
      { weekday: 2, name: '有氧 / 核心', rest: false, exercises: [
        mkEx('跑步机或单车', 1, '25分钟', 0, 0),
        mkEx('平板支撑', 3, '60秒', 0, 60),
        mkEx('悬垂举腿', 3, '12-15', 0, 60)
      ] },
      { weekday: 3, name: '拉日 · 背 / 二头', rest: false, exercises: [
        mkEx('引体向上', 4, '6-10', 0, 120),
        mkEx('杠铃划船', 4, '8-12', 40, 120),
        mkEx('高位下拉', 3, '10-12', 35, 90),
        mkEx('坐姿绳索划船', 3, '10-12', 30, 90),
        mkEx('哑铃弯举', 3, '10-15', 10, 60)
      ] },
      { weekday: 4, name: '休息 / 主动恢复', rest: true, exercises: [] },
      { weekday: 5, name: '腿日 · 下肢', rest: false, exercises: [
        mkEx('杠铃深蹲', 5, '6-10', 60, 150),
        mkEx('罗马尼亚硬拉', 4, '8-12', 50, 120),
        mkEx('腿举', 3, '10-15', 90, 90),
        mkEx('腿弯举', 3, '12-15', 25, 60),
        mkEx('站姿提踵', 4, '15-20', 30, 45)
      ] },
      { weekday: 6, name: '全身 / HIIT', rest: false, exercises: [
        mkEx('壶铃摇摆', 4, '15-20', 16, 60),
        mkEx('波比跳', 4, '10-15', 0, 60),
        mkEx('哑铃推举', 3, '10-12', 12, 75),
        mkEx('俄罗斯转体', 3, '20次', 10, 45)
      ] }
    ]
  };
}
function defaultState() {
  return {
    version: 1,
    settings: {
      userName: '',
      unit: 'kg',
      weekStart: 1,
      weeklyGoalDays: 4,
      defaultRest: 90,
      passRatio: 0.6,
      autoRest: true,
      sound: true
    },
    plan: defaultPlan(),
    logs: {},
    metrics: {},
    createdAt: Date.now()
  };
}
let state = null;

function migrate(obj) {
  const d = defaultState();
  const s = Object.assign({}, d, obj || {});
  s.settings = Object.assign({}, d.settings, (obj && obj.settings) || {});
  if (!s.plan || !Array.isArray(s.plan.days) || s.plan.days.length !== 7) s.plan = d.plan;
  s.logs = s.logs || {};
  s.metrics = s.metrics || {};
  return s;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) { console.warn('读取本地数据失败：', e); return null; }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('保存失败：' + e.message, 'bad'); }
  }, 120);
}
function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('保存失败：' + e.message, 'bad'); }
}

/* ------------------------- Toast / 弹窗 ------------------------- */
function toast(msg, type, ms) {
  const wrap = $('#toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms || 2100);
}
function openModal(opts) {
  const mask = $('#modalMask');
  mask.innerHTML =
    '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><div class="modal-title">' + esc(opts.title || '') + '</div>' +
        '<button class="modal-x js-close" title="关闭" aria-label="关闭">×</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.actions ? '<div class="modal-foot">' + opts.actions + '</div>' : '') +
    '</div>';
  mask.hidden = false;
  document.body.style.overflow = 'hidden';
  mask.addEventListener('click', e => { if (e.target === mask) closeModal(); });
  $$('.js-close', mask).forEach(b => b.addEventListener('click', closeModal));
  if (opts.onMount) opts.onMount($('.modal', mask), mask);
  const first = $('.modal input, .modal select, .modal textarea', mask);
  if (first && opts.autofocus !== false) setTimeout(() => { try { first.focus(); first.select && first.select(); } catch (e) {} }, 60);
  return mask;
}
function closeModal() {
  const mask = $('#modalMask');
  mask.hidden = true;
  mask.innerHTML = '';
  document.body.style.overflow = '';
}
function confirmDialog(title, text, onYes, yesLabel) {
  openModal({
    title: title,
    body: '<div style="font-size:13.5px;line-height:1.7">' + text + '</div>',
    actions: '<button class="btn ghost js-close">取消</button><button class="btn danger js-yes">' + esc(yesLabel || '确定') + '</button>',
    onMount: m => { $('.js-yes', m).addEventListener('click', () => { closeModal(); onYes(); }); }
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('#modalMask').hidden) closeModal();
    else if (rest.running) stopRest();
  }
});

/* ------------------------- 提示音 ------------------------- */
let audioCtx = null;
function beep(times) {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const n = times || 2;
    for (let i = 0; i < n; i++) {
      const t0 = audioCtx.currentTime + i * 0.32;
      const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + 0.3);
    }
  } catch (e) {}
  if (navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) {} }
}
/* ------------------------- UI 状态 ------------------------- */
const ui = {
  tab: 'checkin',
  date: todayStr(),
  calMonth: monthKey(todayStr()),
  trendEx: '',
  metric: 'weight',
  trendRange: 'week'
};

/* ------------------------- 计划 / 日志模型 ------------------------- */
function getPlanDay(weekday) {
  let d = null;
  for (let i = 0; i < state.plan.days.length; i++) {
    if (state.plan.days[i].weekday === weekday) { d = state.plan.days[i]; break; }
  }
  return d || { weekday: weekday, name: '未安排', rest: true, exercises: [] };
}
function parseReps(str) {
  const s = String(str == null ? '' : str);
  const m = s.match(/(\d+(?:\.\d+)?)\s*[-~～至到]\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: +m[1], max: +m[2] };
  const n = s.match(/\d+(?:\.\d+)?/);
  return n ? { min: +n[0], max: +n[0] } : { min: 0, max: 0 };
}
function entriesFromPlan(pd) {
  return (pd.exercises || []).map(e => ({
    id: e.id || uid(),
    name: e.name,
    targetSets: Math.max(1, num(e.sets) || 1),
    reps: String(e.reps == null ? '' : e.reps),
    targetWeight: num(e.weight),
    rest: num(e.rest) || state.settings.defaultRest,
    sets: [],
    note: ''
  }));
}
function emptyLog(date) {
  const pd = getPlanDay(parseDate(date).getDay());
  return {
    date: date, planName: pd.name, entries: entriesFromPlan(pd),
    mood: 0, note: '', rest: false, startedAt: 0, lastAt: 0, updatedAt: 0
  };
}
function getLog(date) { return state.logs[date] || emptyLog(date); }
function touchLog(date) {
  let lg = state.logs[date];
  if (!lg) { lg = emptyLog(date); state.logs[date] = lg; }
  lg.updatedAt = Date.now();
  lg.lastAt = Date.now();
  if (!lg.startedAt) lg.startedAt = Date.now();
  return lg;
}
function setOk(entry, s) {
  const r = parseReps(entry.reps);
  const repsOk = r.min > 0 ? num(s.reps) >= r.min : true;
  const wOk = entry.targetWeight > 0 ? num(s.weight) >= entry.targetWeight : true;
  return repsOk && wOk;
}
function setOver(entry, s) {
  const r = parseReps(entry.reps);
  const repsOver = r.max > 0 && num(s.reps) > r.max;
  const wOver = entry.targetWeight > 0 && num(s.weight) > entry.targetWeight;
  return repsOver || wOver;
}
function entryStat(entry) {
  const okSets = entry.sets.filter(s => setOk(entry, s)).length;
  const vol = sum(entry.sets.map(s => num(s.reps) * num(s.weight)));
  return {
    ok: okSets,
    total: entry.targetSets,
    ratio: entry.targetSets ? clamp(okSets / entry.targetSets, 0, 2) : (entry.sets.length ? 1 : 0),
    done: okSets >= entry.targetSets,
    started: entry.sets.length > 0,
    volume: vol
  };
}
function dayStat(log) {
  let ok = 0, tgt = 0, vol = 0, doneEx = 0;
  (log.entries || []).forEach(e => {
    const s = entryStat(e);
    ok += s.ok; tgt += s.total; vol += s.volume;
    if (s.done) doneEx++;
  });
  const ratio = tgt ? ok / tgt : (log.rest ? 1 : 0);
  return {
    okSets: ok, tgtSets: tgt, volume: vol, doneEntries: doneEx,
    entries: (log.entries || []).length, ratio: ratio,
    pass: ratio >= (state.settings.passRatio || 0.6) && (ratio > 0),
    minutes: log.startedAt && log.lastAt ? clamp(r0((log.lastAt - log.startedAt) / 60000), 0, 600) : 0
  };
}
function isActiveDay(log) {
  if (!log) return false;
  return log.rest === true || (log.entries || []).some(e => (e.sets || []).length > 0);
}
function allExerciseNames() {
  const names = [];
  state.plan.days.forEach(d => (d.exercises || []).forEach(e => names.push(e.name)));
  Object.keys(state.logs).forEach(k => (state.logs[k].entries || []).forEach(e => names.push(e.name)));
  return uniq(names.filter(Boolean)).sort();
}

/* ------------------------- 休息计时器 ------------------------- */
const rest = { running: false, end: 0, total: 0, label: '', timer: 0 };
function startRest(sec, label) {
  sec = Math.max(5, Math.round(num(sec) || state.settings.defaultRest));
  rest.running = true; rest.end = Date.now() + sec * 1000; rest.total = sec; rest.label = label || '组间休息';
  clearInterval(rest.timer);
  rest.timer = setInterval(tickRest, 200);
  renderRest();
}
function stopRest() {
  rest.running = false; clearInterval(rest.timer);
  const dock = $('#restDock'); dock.hidden = true; dock.innerHTML = '';
}
function addRest(n) {
  if (!rest.running) return;
  rest.end += n * 1000; rest.total = Math.max(5, rest.total + n);
  renderRest();
}
function tickRest() {
  const left = (rest.end - Date.now()) / 1000;
  if (left <= 0) {
    stopRest(); beep(3); toast('休息结束，继续下一组！', 'ok');
    return;
  }
  const t = $('.rest-time', $('#restDock'));
  if (t) t.textContent = fmtClock(left);
  const c = $('.fgc', $('#restDock'));
  if (c) {
    const len = 2 * Math.PI * 18;
    c.style.strokeDasharray = len;
    c.style.strokeDashoffset = len * (1 - clamp(left / rest.total, 0, 1));
  }
}
function renderRest() {
  const dock = $('#restDock');
  const left = Math.max(0, (rest.end - Date.now()) / 1000);
  dock.hidden = false;
  dock.innerHTML =
    '<svg class="ring" viewBox="0 0 42 42"><circle class="bgc" cx="21" cy="21" r="18"></circle>' +
    '<circle class="fgc" cx="21" cy="21" r="18"></circle></svg>' +
    '<div><div class="rest-time mono">' + fmtClock(left) + '</div><div class="rest-lbl">' + esc(rest.label) + '</div></div>' +
    '<button class="btn xs js-r-15">+15s</button>' +
    '<button class="btn xs js-r-m15">−15s</button>' +
    '<button class="btn xs danger js-r-stop">结束</button>';
  $('.js-r-15', dock).addEventListener('click', () => addRest(15));
  $('.js-r-m15', dock).addEventListener('click', () => addRest(-15));
  $('.js-r-stop', dock).addEventListener('click', stopRest);
  tickRest();
}

/* ------------------------- 打卡视图 ------------------------- */
function exCardHTML(entry, idx) {
  const st = entryStat(entry);
  const r = parseReps(entry.reps);
  const u = state.settings.unit;
  const targetTxt = entry.targetSets + ' 组 × ' + (entry.reps ? esc(entry.reps) + ' 次' : '自定义') +
    (entry.targetWeight > 0 ? ' @ ' + entry.targetWeight + u : '（自重/无负重）');
  let rows = '';
  entry.sets.forEach((s, i) => {
    const ok = setOk(entry, s), over = ok && setOver(entry, s);
    const cls = ok ? (over ? 'over' : 'ok') : 'bad';
    const flag = ok ? (over ? '超额' : '达标') : '未达标';
    rows += '<div class="set-row ' + cls + '" data-row="' + entry.id + ':' + i + '">' +
      '<div class="set-no">' + (i + 1) + '</div>' +
      '<input class="set-in js-set" type="number" inputmode="decimal" min="0" step="1" value="' + num(s.reps) + '" data-e="' + entry.id + '" data-i="' + i + '" data-f="reps" aria-label="第' + (i + 1) + '组次数">' +
      '<input class="set-in js-set" type="number" inputmode="decimal" min="0" step="0.5" value="' + num(s.weight) + '" data-e="' + entry.id + '" data-i="' + i + '" data-f="weight" aria-label="第' + (i + 1) + '组重量(' + u + ')">' +
      '<div class="set-flag ' + cls + '">' + flag + '</div>' +
      '<button class="set-del js-del-set" data-e="' + entry.id + '" data-i="' + i + '" title="删除该组" aria-label="删除该组">×</button>' +
      '</div>';
  });
  if (!entry.sets.length) {
    rows = '<div class="empty" style="padding:14px 8px"><div class="e-d">还没有记录，点下方「+ 添加一组」开始</div></div>';
  }
  const badge = st.done ? '<span class="badge ok">✓ 已完成</span>'
    : st.started ? '<span class="badge warn">' + st.ok + '/' + st.total + ' 组达标</span>'
    : '<span class="badge muted">未开始</span>';
  return '<article class="ex-card' + (st.done ? ' done' : '') + '" data-card="' + entry.id + '">' +
    '<div class="ex-head">' +
      '<div class="ex-idx">' + (idx + 1) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="ex-name">' + esc(entry.name) + '</div>' +
        '<div class="ex-target"><span>🎯 ' + targetTxt + '</span>' +
          (entry.rest ? '<span class="chip" style="padding:1px 8px">⏱ ' + entry.rest + 's</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ex-actions"><span data-badge>' + badge + '</span>' +
        '<button class="icon-btn js-edit-entry" data-e="' + entry.id + '" title="编辑目标" aria-label="编辑目标">✎</button>' +
        '<button class="icon-btn js-del-entry" data-e="' + entry.id + '" title="移除动作" aria-label="移除动作">🗑</button>' +
      '</div>' +
    '</div>' +
    '<div class="ex-body">' +
      (entry.sets.length ? '<div class="set-head"><span>组</span><span class="center">次数</span><span class="center">重量(' + u + ')</span><span class="center">判定</span><span></span></div>' : '') +
      rows +
      '<div class="ex-foot">' +
        '<button class="btn xs js-add-set" data-e="' + entry.id + '">+ 添加一组</button>' +
        '<button class="btn xs ghost js-fill" data-e="' + entry.id + '" title="用目标值填满剩余组数">⚡ 补满</button>' +
        (entry.rest ? '<button class="btn xs ghost js-rest-btn" data-e="' + entry.id + '">⏱ ' + entry.rest + 's</button>' : '') +
        '<input class="input js-exnote" data-e="' + entry.id + '" placeholder="动作备注…" value="' + esc(entry.note || '') + '" style="flex:1;min-width:110px;padding:5px 9px;font-size:12px">' +
        '<div class="ex-vol" data-vol>容量 ' + r0(st.volume) + ' ' + u + '</div>' +
      '</div>' +
      '<div class="ex-foot" style="border:none;padding-top:6px;margin-top:4px;gap:9px">' +
        '<div class="progress thin' + (st.done ? ' ok' : '') + '" style="flex:1" data-prog><i style="width:' + clamp(st.ratio * 100, 0, 100) + '%"></i></div>' +
        '<span class="tiny muted" data-ratio>' + r0(clamp(st.ratio, 0, 2) * 100) + '%</span>' +
      '</div>' +
    '</div>' +
  '</article>';
}

function statusHTML(log, st) {
  let emoji, title, desc, cls;
  if (log.rest) { emoji = '🧘'; title = '休息日'; desc = '恢复也是训练的一部分，好好休息'; cls = 'pass'; }
  else if (!st.entries) { emoji = '📭'; title = '今天没有安排训练'; desc = '可在「计划」里安排，或点下方「添加动作」临时加练'; cls = ''; }
  else if (st.pass && st.ratio >= 1) { emoji = '🏆'; title = '完美达标！'; desc = '所有目标组数全部完成，太棒了'; cls = 'pass'; }
  else if (st.pass) { emoji = '✅'; title = '已达标'; desc = '完成度 ' + r0(st.ratio * 100) + '%，继续保持'; cls = 'pass'; }
  else if (st.okSets > 0) { emoji = '💪'; title = '进行中'; desc = '还差 ' + Math.max(0, st.tgtSets - st.okSets) + ' 组达标（达标线 ' + r0((state.settings.passRatio || 0.6) * 100) + '%）'; cls = 'fail'; }
  else { emoji = '⏰'; title = '还没开始'; desc = '按计划开练吧，第一组最难'; cls = ''; }
  return '<div class="statusbar ' + cls + '" id="dayStatus">' +
    '<div class="status-emoji">' + emoji + '</div>' +
    '<div class="status-text"><div class="status-title">' + title + '</div><div class="status-desc">' + esc(desc) + '</div></div>' +
    '<div class="status-nums">' +
      '<div class="snum"><b>' + st.okSets + '<span class="k-unit">/' + st.tgtSets + '</span></b><span>达标组数</span></div>' +
      '<div class="snum"><b>' + st.doneEntries + '<span class="k-unit">/' + st.entries + '</span></b><span>完成动作</span></div>' +
      '<div class="snum"><b>' + r0(st.volume) + '</b><span>总容量(' + state.settings.unit + ')</span></div>' +
      '<div class="snum"><b>' + st.minutes + '</b><span>时长(分)</span></div>' +
    '</div>' +
    '<div class="progress' + (st.pass ? ' ok' : '') + '" style="width:100%;margin-top:2px"><i style="width:' + clamp(st.ratio * 100, 0, 100) + '%"></i></div>' +
  '</div>';
}

function renderCheckin() {
  const root = $('#view-checkin');
  const date = ui.date;
  const d = parseDate(date);
  const pd = getPlanDay(d.getDay());
  const log = getLog(date);
  const st = dayStat(log);
  const isToday = date === todayStr();

  let cards = '';
  log.entries.forEach((e, i) => { cards += exCardHTML(e, i); });
  if (!log.entries.length) {
    cards = '<div class="card empty"><div class="e-ic">🗓️</div><div class="e-t">' +
      (pd.rest ? '今天是计划休息日' : '今天还没有训练安排') + '</div>' +
      '<div class="e-d">点击下方「+ 添加动作」记录今天的训练，或去「计划」页设置每周分化</div></div>';
  }

  root.innerHTML =
    '<div class="datebar">' +
      '<button class="nav-btn js-prev" title="前一天" aria-label="前一天">‹</button>' +
      '<div class="date-main">' +
        '<div class="date-big"><input type="date" class="js-date" value="' + date + '" max="' + addDays(todayStr(), 1) + '" aria-label="选择日期"></div>' +
        '<div class="date-sub">' + WEEK_CN[d.getDay()] + (relDay(date) ? ' · ' + relDay(date) : '') + ' · ' + esc(pd.name) + (isToday ? '' : ' <span class="badge muted">非今日</span>') + '</div>' +
      '</div>' +
      '<button class="nav-btn js-next" title="后一天" aria-label="后一天">›</button>' +
      '<div class="right">' +
        (isToday ? '' : '<button class="btn sm js-today">回到今天</button>') +
        '<button class="btn sm js-copy" title="把上一次训练的组数/重量复制到今天">📋 复制上次</button>' +
        '<button class="btn sm ' + (log.rest ? 'ok' : '') + ' js-restday">' + (log.rest ? '✓ 已标记休息日' : '🧘 标记休息日') + '</button>' +
      '</div>' +
    '</div>' +
    statusHTML(log, st) +
    '<div id="exList">' + cards + '</div>' +
    '<div class="card" style="margin-top:12px">' +
      '<div class="card-head"><div class="card-title"><span class="ic">➕</span>添加动作</div>' +
        '<div class="spacer"></div>' +
        '<button class="btn sm ghost js-clear-day">清空今日记录</button></div>' +
      '<div class="field-row">' +
        '<div class="field" style="flex:2;min-width:150px"><input class="input js-newname" placeholder="动作名称，如：杠铃卧推 / 跑步机"></div>' +
        '<div class="field" style="max-width:96px"><input class="input js-newsets" type="number" min="1" step="1" placeholder="组数 如 4"></div>' +
        '<div class="field" style="max-width:118px"><input class="input js-newreps" placeholder="次数 如 8-12"></div>' +
        '<div class="field" style="max-width:118px"><input class="input js-newweight" type="number" min="0" step="0.5" placeholder="重量 如 40"></div>' +
        '<div class="field" style="max-width:118px"><input class="input js-newrest" type="number" min="0" step="15" placeholder="休息秒 如 90"></div>' +
        '<button class="btn primary js-addex">添加</button>' +
      '</div>' +
      '<div class="tiny muted" style="margin-top:7px">留空的项会使用默认值：组数 3、重量 0（自重）、休息 ' + state.settings.defaultRest + ' 秒；次数留空则只记录不判定。</div>' +
      '<hr class="divider">' +
      '<div class="card-head" style="margin-bottom:8px"><div class="card-title"><span class="ic">🙂</span>训练感受</div></div>' +
      '<div class="mood-row">' + MOODS.map(m =>
        '<button class="mood js-mood' + (log.mood === m.v ? ' active' : '') + '" data-v="' + m.v + '" title="' + m.t + '">' + m.ic + '</button>').join('') +
        '<span class="tiny muted" style="align-self:center;margin-left:4px" id="moodTxt">' + (((MOODS.filter(m => m.v === log.mood)[0] || {}).t) || '') + '</span>' +
      '</div>' +
      '<div style="margin-top:12px"><textarea class="textarea js-note" placeholder="今日训练小结：状态、疲劳、饮食、睡眠、下次要调整的地方…">' + esc(log.note || '') + '</textarea></div>' +
    '</div>';

  bindCheckin(root, log);
  updateBrandSub();
}
function findEntry(log, id) { return (log.entries || []).filter(e => e.id === id)[0]; }
function midReps(entry) {
  const r = parseReps(entry.reps);
  if (!r.max) return 10;
  return Math.round((r.min + r.max) / 2);
}

function refreshCard(entry) {
  const card = $('[data-card="' + entry.id + '"]');
  if (!card) return;
  entry.sets.forEach((s, i) => {
    const row = $('[data-row="' + entry.id + ':' + i + '"]', card);
    if (!row) return;
    const ok = setOk(entry, s), over = ok && setOver(entry, s);
    const cls = ok ? (over ? 'over' : 'ok') : 'bad';
    row.className = 'set-row ' + cls;
    const f = $('.set-flag', row);
    if (f) { f.className = 'set-flag ' + cls; f.textContent = ok ? (over ? '超额' : '达标') : '未达标'; }
  });
  const st = entryStat(entry);
  card.classList.toggle('done', st.done);
  const badge = $('[data-badge]', card);
  if (badge) badge.innerHTML = st.done ? '<span class="badge ok">✓ 已完成</span>'
    : st.started ? '<span class="badge warn">' + st.ok + '/' + st.total + ' 组达标</span>'
    : '<span class="badge muted">未开始</span>';
  const v = $('[data-vol]', card);
  if (v) v.textContent = '容量 ' + r0(st.volume) + ' ' + state.settings.unit;
  const bar = $('[data-prog]', card);
  if (bar) { bar.classList.toggle('ok', st.done); const i2 = $('i', bar); if (i2) i2.style.width = clamp(st.ratio * 100, 0, 100) + '%'; }
  const rt = $('[data-ratio]', card);
  if (rt) rt.textContent = r0(clamp(st.ratio, 0, 2) * 100) + '%';
}
function refreshDay(log) {
  const st = dayStat(log);
  const el = $('#dayStatus');
  if (el) {
    const tmp = document.createElement('div');
    tmp.innerHTML = statusHTML(log, st);
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
  }
  updateStreakPill();
}

function doAddSet(entryId) {
  const L = touchLog(ui.date);
  const e = findEntry(L, entryId); if (!e) return;
  const last = e.sets[e.sets.length - 1];
  e.sets.push({
    reps: last ? num(last.reps) : midReps(e),
    weight: last ? num(last.weight) : num(e.targetWeight),
    t: Date.now()
  });
  saveNow(); renderCheckin();
  if (state.settings.autoRest && e.rest > 0) startRest(e.rest, e.name + ' · 组间休息');
}
function doFill(entryId) {
  const L = touchLog(ui.date);
  const e = findEntry(L, entryId); if (!e) return;
  if (e.sets.length >= e.targetSets) { toast('该动作组数已满', 'info'); return; }
  const reps = midReps(e), w = num(e.targetWeight);
  const last = e.sets[e.sets.length - 1];
  while (e.sets.length < e.targetSets) {
    e.sets.push({ reps: last ? num(last.reps) : reps, weight: last ? num(last.weight) : w, t: Date.now() });
  }
  saveNow(); renderCheckin(); toast('已按目标补满 ' + e.targetSets + ' 组', 'ok');
  if (state.settings.autoRest && e.rest > 0) startRest(e.rest, e.name + ' · 组间休息');
}
function doDelSet(entryId, i) {
  const L = touchLog(ui.date);
  const e = findEntry(L, entryId); if (!e) return;
  e.sets.splice(i, 1);
  saveNow(); renderCheckin();
}
function doDelEntry(entryId) {
  const log = getLog(ui.date);
  const e = findEntry(log, entryId); if (!e) return;
  confirmDialog('移除动作', '确定把「<b>' + esc(e.name) + '</b>」从今天的记录里移除吗？<div class="tiny muted" style="margin-top:6px">不会影响「计划」页的分化安排。</div>', () => {
    const L = touchLog(ui.date);
    L.entries = L.entries.filter(x => x.id !== entryId);
    saveNow(); renderCheckin(); toast('已移除', 'info');
  }, '移除');
}
function doEditEntry(entryId) {
  const log = getLog(ui.date);
  const e = findEntry(log, entryId); if (!e) return;
  const u = state.settings.unit;
  openModal({
    title: '编辑动作 · ' + e.name,
    body:
      '<div class="field-row"><div class="field"><label class="label">动作名称</label><input class="input js-name" value="' + esc(e.name) + '"></div></div>' +
      '<div class="field-row" style="margin-top:10px">' +
        '<div class="field"><label class="label">目标组数</label><input class="input js-sets" type="number" min="1" step="1" value="' + e.targetSets + '"></div>' +
        '<div class="field"><label class="label">次数 / 时间目标</label><input class="input js-reps" value="' + esc(e.reps) + '" placeholder="如 8-12 或 60秒"></div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:10px">' +
        '<div class="field"><label class="label">目标重量(' + u + ')</label><input class="input js-weight" type="number" min="0" step="0.5" value="' + num(e.targetWeight) + '"></div>' +
        '<div class="field"><label class="label">组间休息(秒)</label><input class="input js-rest" type="number" min="0" step="15" value="' + num(e.rest) + '"></div>' +
      '</div>' +
      '<div class="hr-note" style="margin-top:12px">判定规则：每组<b>次数 ≥ 目标下限</b> 且 <b>重量 ≥ 目标重量</b> 记为「达标」；超过目标上限或目标重量记为「超额」。仅修改今日目标，不影响计划模板。</div>',
    actions: '<button class="btn ghost js-close">取消</button><button class="btn primary js-save">保存</button>',
    onMount: m => {
      $('.js-save', m).addEventListener('click', () => {
        const L = touchLog(ui.date);
        const t = findEntry(L, entryId); if (!t) { closeModal(); return; }
        t.name = $('.js-name', m).value.trim() || t.name;
        t.targetSets = Math.max(1, num($('.js-sets', m).value) || 1);
        t.reps = $('.js-reps', m).value.trim();
        t.targetWeight = Math.max(0, num($('.js-weight', m).value));
        t.rest = Math.max(0, num($('.js-rest', m).value));
        saveNow(); closeModal(); renderCheckin(); toast('已更新目标', 'ok');
      });
    }
  });
}
function doAddExercise() {
  const name = ($('.js-newname') || {}).value;
  if (!name || !name.trim()) { toast('请先填写动作名称', 'bad'); return; }
  const L = touchLog(ui.date);
  L.entries.push({
    id: uid(),
    name: name.trim(),
    targetSets: Math.max(1, num(($('.js-newsets') || {}).value) || 3),
    reps: (($('.js-newreps') || {}).value || '').trim(),
    targetWeight: Math.max(0, num(($('.js-newweight') || {}).value)),
    rest: Math.max(0, num(($('.js-newrest') || {}).value) || state.settings.defaultRest),
    sets: [], note: ''
  });
  saveNow(); renderCheckin(); toast('已添加「' + name.trim() + '」', 'ok');
}
function doCopyPrev() {
  const L = touchLog(ui.date);
  const dates = Object.keys(state.logs).filter(d => d < L.date && isActiveDay(state.logs[d]) && !state.logs[d].rest).sort();
  const prevDate = dates[dates.length - 1];
  if (!prevDate) { toast('还没有可参考的历史训练', 'info'); return; }
  const prev = state.logs[prevDate];
  let copied = 0;
  L.entries.forEach(e => {
    const src = (prev.entries || []).filter(x => x.name === e.name)[0];
    if (src && (src.sets || []).length) {
      e.sets = src.sets.map(s => ({ reps: num(s.reps), weight: num(s.weight), t: Date.now() }));
      copied++;
    }
  });
  if (!copied) { toast('上次训练（' + prevDate + '）没有同名动作可复制', 'info'); return; }
  saveNow(); renderCheckin(); toast('已复制 ' + prevDate + ' 的 ' + copied + ' 个动作', 'ok');
}
function doClearDay() {
  if (!state.logs[ui.date]) { toast('今天还没有记录', 'info'); return; }
  confirmDialog('清空今日记录', '将删除 <b>' + ui.date + '</b> 的全部组数、感受与备注，且无法撤销。', () => {
    delete state.logs[ui.date];
    saveNow(); renderCheckin(); toast('已清空', 'info');
  }, '清空');
}

function bindCheckin(root) {
  $('.js-prev', root).addEventListener('click', () => { ui.date = addDays(ui.date, -1); renderCheckin(); });
  $('.js-next', root).addEventListener('click', () => { ui.date = addDays(ui.date, 1); renderCheckin(); });
  const tb = $('.js-today', root);
  if (tb) tb.addEventListener('click', () => { ui.date = todayStr(); renderCheckin(); });
  $('.js-date', root).addEventListener('change', e => { if (e.target.value) { ui.date = e.target.value; renderCheckin(); } });

  $$('.js-set', root).forEach(inp => {
    inp.addEventListener('input', () => {
      const L = touchLog(ui.date);
      const e = findEntry(L, inp.dataset.e); if (!e) return;
      const s = e.sets[+inp.dataset.i]; if (!s) return;
      s[inp.dataset.f] = num(inp.value);
      s.t = s.t || Date.now();
      save(); refreshCard(e); refreshDay(L);
    });
  });
  $$('.js-add-set', root).forEach(b => b.addEventListener('click', () => doAddSet(b.dataset.e)));
  $$('.js-fill', root).forEach(b => b.addEventListener('click', () => doFill(b.dataset.e)));
  $$('.js-del-set', root).forEach(b => b.addEventListener('click', () => doDelSet(b.dataset.e, +b.dataset.i)));
  $$('.js-del-entry', root).forEach(b => b.addEventListener('click', () => doDelEntry(b.dataset.e)));
  $$('.js-edit-entry', root).forEach(b => b.addEventListener('click', () => doEditEntry(b.dataset.e)));
  $$('.js-rest-btn', root).forEach(b => b.addEventListener('click', () => {
    const e = findEntry(getLog(ui.date), b.dataset.e);
    if (e) startRest(e.rest, e.name + ' · 组间休息');
  }));
  $$('.js-exnote', root).forEach(inp => inp.addEventListener('input', () => {
    const L = touchLog(ui.date);
    const e = findEntry(L, inp.dataset.e); if (!e) return;
    e.note = inp.value; save();
  }));

  const rb = $('.js-restday', root);
  if (rb) rb.addEventListener('click', () => {
    const L = touchLog(ui.date);
    L.rest = !L.rest;
    saveNow(); renderCheckin();
    toast(L.rest ? '已标记为休息日，不会打断连续打卡' : '已取消休息日标记', L.rest ? 'info' : 'ok');
  });
  $('.js-copy', root).addEventListener('click', doCopyPrev);
  $('.js-clear-day', root).addEventListener('click', doClearDay);
  $('.js-addex', root).addEventListener('click', doAddExercise);
  const nn = $('.js-newname', root);
  if (nn) nn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAddExercise(); } });

  $$('.js-mood', root).forEach(b => b.addEventListener('click', () => {
    const L = touchLog(ui.date);
    const v = +b.dataset.v;
    L.mood = L.mood === v ? 0 : v;
    saveNow();
    $$('.js-mood', root).forEach(x => x.classList.toggle('active', +x.dataset.v === L.mood));
    const t = $('#moodTxt', root);
    if (t) t.textContent = (MOODS.filter(m => m.v === L.mood)[0] || {}).t || '';
    refreshDay(L);
  }));
  const note = $('.js-note', root);
  if (note) note.addEventListener('input', () => { const L = touchLog(ui.date); L.note = note.value; save(); });
}
/* ------------------------- 统计计算 ------------------------- */
function activeDates() {
  return Object.keys(state.logs).filter(d => isActiveDay(state.logs[d])).sort();
}
function trainedDates() {
  return Object.keys(state.logs).filter(d => {
    const l = state.logs[d];
    return l && !l.rest && (l.entries || []).some(e => (e.sets || []).length > 0);
  }).sort();
}
function computeStreak(from) {
  let d = from || todayStr();
  if (!isActiveDay(state.logs[d])) d = addDays(d, -1);
  let n = 0;
  while (isActiveDay(state.logs[d])) { n++; d = addDays(d, -1); }
  return n;
}
function computeLongestStreak() {
  const ds = activeDates();
  let best = 0, cur = 0, prev = null;
  ds.forEach(d => {
    cur = (prev && daysBetween(prev, d) === 1) ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = d;
  });
  return best;
}
function rangeStats(start, end) {
  let active = 0, pass = 0, vol = 0, min = 0, trained = 0;
  let d = start;
  while (d <= end) {
    const lg = state.logs[d];
    if (lg) {
      const st = dayStat(lg);
      if (isActiveDay(lg)) active++;
      if (st.pass) pass++;
      if (!lg.rest && st.okSets > 0) trained++;
      vol += st.volume; min += st.minutes;
    }
    d = addDays(d, 1);
  }
  return { active: active, pass: pass, trained: trained, volume: vol, minutes: min };
}
function computePRs() {
  const map = {};
  Object.keys(state.logs).sort().forEach(date => {
    const lg = state.logs[date];
    (lg.entries || []).forEach(e => {
      const m = map[e.name] || (map[e.name] = {
        name: e.name, bestWeight: 0, bwReps: 0, bwDate: '', bestSetVol: 0, bsvDate: '',
        bestReps: 0, brWeight: 0, totalVol: 0, sessions: 0, bestDayVol: 0, sets: 0
      });
      let dayVol = 0;
      (e.sets || []).forEach(s => {
        const w = num(s.weight), r = num(s.reps), v = w * r;
        dayVol += v; m.sets++;
        if (w > m.bestWeight) { m.bestWeight = w; m.bwReps = r; m.bwDate = date; }
        if (v > m.bestSetVol) { m.bestSetVol = v; m.bsvDate = date; }
        if (r > m.bestReps) { m.bestReps = r; m.brWeight = w; }
      });
      m.totalVol += dayVol;
      if ((e.sets || []).length) m.sessions++;
      if (dayVol > m.bestDayVol) m.bestDayVol = dayVol;
    });
  });
  return map;
}
function exerciseSeries(name) {
  const out = [];
  Object.keys(state.logs).sort().forEach(date => {
    const lg = state.logs[date];
    (lg.entries || []).forEach(e => {
      if (e.name !== name || !(e.sets || []).length) return;
      let maxW = 0, bestR = 0, vol = 0;
      e.sets.forEach(s => {
        const w = num(s.weight), r = num(s.reps);
        if (w > maxW) maxW = w;
        if (r > bestR) bestR = r;
        vol += w * r;
      });
      out.push({ date: date, maxWeight: maxW, bestReps: bestR, volume: vol, sets: e.sets.length });
    });
  });
  return out;
}
function computeBadges() {
  const tds = trainedDates(), ads = activeDates();
  const streak = computeStreak(), longest = computeLongestStreak();
  const totalVol = sum(ads.map(d => dayStat(state.logs[d]).volume));
  const prs = computePRs();
  let early = false;
  ads.forEach(d => { const l = state.logs[d]; if (l.startedAt && new Date(l.startedAt).getHours() < 8) early = true; });
  let perfectWeek = 0;
  for (let w = -12; w <= 0; w++) {
    const s = addDays(startOfWeek(todayStr()), w * 7);
    const rs = rangeStats(s, addDays(s, 6));
    if (rs.pass >= Math.max(1, num(state.settings.weeklyGoalDays))) perfectWeek++;
  }
  const names = Object.keys(prs).length;
  return [
    { ic: '🌱', name: '启程', desc: '完成第一次训练打卡', got: tds.length >= 1 },
    { ic: '🔥', name: '三日成习', desc: '连续打卡 3 天', got: streak >= 3 || longest >= 3 },
    { ic: '⚡', name: '七日不辍', desc: '连续打卡 7 天', got: streak >= 7 || longest >= 7 },
    { ic: '🏅', name: '月度铁人', desc: '连续打卡 30 天', got: streak >= 30 || longest >= 30 },
    { ic: '💯', name: '百炼成钢', desc: '累计训练 100 天', got: tds.length >= 100 },
    { ic: '🎖️', name: '半百里程碑', desc: '累计训练 50 天', got: tds.length >= 50 },
    { ic: '🏋️', name: '吨位俱乐部', desc: '累计容量 ≥ 100 吨', got: totalVol >= 100000 },
    { ic: '✨', name: '完美一周', desc: '某周达标天数达到目标', got: perfectWeek >= 1 },
    { ic: '🌅', name: '晨光者', desc: '在早上 8 点前开练', got: early },
    { ic: '🌙', name: '夜行者', desc: '在晚上 9 点后仍在训练', got: ads.some(d => state.logs[d].startedAt && new Date(state.logs[d].startedAt).getHours() >= 21) },
    { ic: '🧬', name: '全能选手', desc: '记录过 15 种以上动作', got: names >= 15 },
    { ic: '📚', name: '记录者', desc: '写过 10 条训练小结', got: Object.keys(state.logs).filter(d => (state.logs[d].note || '').trim().length > 3).length >= 10 }
  ];
}

/* ------------------------- SVG 图表 ------------------------- */
function niceMax(v) {
  if (!(v > 0)) return 10;
  const exp = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}
function yTicks(max) {
  const out = [];
  for (let i = 0; i <= 4; i++) out.push(max * i / 4);
  return out;
}
function shortNum(v) {
  if (Math.abs(v) >= 10000) return r1(v / 1000) + 'k';
  if (Math.abs(v) >= 1000) return r1(v / 1000) + 'k';
  return String(r1(v));
}
function chartBars(items, opts) {
  opts = opts || {};
  const W = 760, H = 240, PL = 46, PR = 12, PT = 18, PB = 40;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = niceMax(Math.max.apply(null, items.map(i => i.value).concat([opts.max || 0])));
  const n = items.length || 1;
  const bw = Math.max(4, Math.min(38, iw / n * 0.62));
  let g = '';
  yTicks(max).forEach(t => {
    const y = PT + ih - ih * (t / max);
    g += '<line x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y + '" stroke="var(--line-soft)" stroke-width="1"/>' +
      '<text x="' + (PL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--muted-2)">' + shortNum(t) + '</text>';
  });
  let bars = '';
  items.forEach((it, i) => {
    const x = PL + iw * (i + 0.5) / n;
    const h = max ? ih * clamp(it.value / max, 0, 1) : 0;
    const y = PT + ih - h;
    const c = it.color || 'var(--brand)';
    bars += '<rect x="' + (x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + Math.max(h, it.value > 0 ? 2 : 0) + '" rx="4" fill="' + c + '" opacity="' + (it.dim ? .38 : .92) + '"><title>' + esc(it.label) + '：' + r1(it.value) + (it.sub || '') + '</title></rect>';
    if (it.value > 0 && h > 16 && bw > 13) {
      bars += '<text x="' + x + '" y="' + (y - 5) + '" text-anchor="middle" font-size="9.5" fill="var(--muted)" font-weight="700">' + shortNum(it.value) + '</text>';
    }
    const showLabel = n <= 16 || i % Math.ceil(n / 12) === 0;
    if (showLabel) {
      bars += '<text x="' + x + '" y="' + (H - PB + 15) + '" text-anchor="middle" font-size="9.5" fill="var(--muted-2)" transform="rotate(0 ' + x + ' ' + (H - PB + 15) + ')">' + esc(it.tick || it.label) + '</text>';
    }
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g +
    '<line x1="' + PL + '" y1="' + (PT + ih) + '" x2="' + (W - PR) + '" y2="' + (PT + ih) + '" stroke="var(--line)" stroke-width="1"/>' + bars + '</svg>';
}
function chartLine(labels, series, opts) {
  opts = opts || {};
  const W = 760, H = 250, PL = 46, PR = 14, PT = 18, PB = 40;
  const iw = W - PL - PR, ih = H - PT - PB;
  let vals = [];
  series.forEach(s => s.points.forEach(p => vals.push(p)));
  if (!vals.length) return '<div class="empty"><div class="e-ic">📈</div><div class="e-t">暂无数据</div><div class="e-d">先在打卡页记录几组数据吧</div></div>';
  const rawMax = Math.max.apply(null, vals), rawMin = Math.min.apply(null, vals);
  let max, min;
  if (opts.zero === false) {
    const pad = ((rawMax - rawMin) || Math.max(1, Math.abs(rawMax) * 0.12)) * 0.18;
    min = Math.floor((rawMin - pad) * 10) / 10;
    max = Math.ceil((rawMax + pad) * 10) / 10;
    if (opts.max) max = opts.max;
    if (min < 0 && rawMin >= 0) min = 0;
  } else {
    max = opts.max || niceMax(rawMax);
    min = 0;
  }
  const span = (max - min) || 1;
  const X = i => PL + (labels.length === 1 ? iw / 2 : iw * i / (labels.length - 1));
  const Y = v => PT + ih - ih * ((v - min) / span);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = min + span * i / 4, y = Y(v);
    g += '<line x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y + '" stroke="var(--line-soft)" stroke-width="1"/>' +
      '<text x="' + (PL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--muted-2)">' + shortNum(v) + '</text>';
  }
  const step = Math.ceil(labels.length / 12);
  labels.forEach((l, i) => {
    if (i % step === 0 || i === labels.length - 1) {
      g += '<text x="' + X(i) + '" y="' + (H - PB + 16) + '" text-anchor="middle" font-size="9.5" fill="var(--muted-2)">' + esc(l) + '</text>';
    }
  });
  let body = '';
  series.forEach(s => {
    const pts = s.points.map((v, i) => X(i) + ',' + Y(v)).join(' ');
    if (s.area && s.points.length > 1) {
      body += '<polygon points="' + X(0) + ',' + (PT + ih) + ' ' + pts + ' ' + X(s.points.length - 1) + ',' + (PT + ih) + '" fill="' + s.color + '" opacity=".13"/>';
    }
    if (s.points.length > 1) {
      body += '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    s.points.forEach((v, i) => {
      body += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="' + (s.points.length > 30 ? 2 : 3.4) + '" fill="var(--card)" stroke="' + s.color + '" stroke-width="2"><title>' + esc(labels[i]) + '：' + r1(v) + '</title></circle>';
    });
  });
  const legend = series.length > 1 ? '<div class="center tiny muted" style="margin-top:6px">' +
    series.map(s => '<span style="margin:0 7px"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + s.color + ';margin-right:4px"></i>' + esc(s.name) + '</span>').join('') + '</div>' : '';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g + body + '</svg>' + legend;
}
function sparkline(vals, color) {
  if (!vals || vals.length < 2) return '<div class="tiny muted" style="height:44px;display:grid;place-items:center">数据不足</div>';
  const W = 220, H = 44, P = 5;
  const max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
  const span = (max - min) || 1;
  const X = i => P + (W - 2 * P) * i / (vals.length - 1);
  const Y = v => H - P - (H - 2 * P) * ((v - min) / span);
  const pts = vals.map((v, i) => X(i) + ',' + Y(v)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    '<polygon points="' + X(0) + ',' + H + ' ' + pts + ' ' + X(vals.length - 1) + ',' + H + '" fill="' + color + '" opacity=".14"/>' +
    '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
    '<circle cx="' + X(vals.length - 1) + '" cy="' + Y(vals[vals.length - 1]) + '" r="2.6" fill="' + color + '"/></svg>';
}
/* ------------------------- 日历热力图 ------------------------- */
function calendarHTML(monthStr) {
  const p = monthStr.split('-');
  const y = +p[0], m = +p[1];
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() - ((state.settings.weekStart || 0) % 7) + 7) % 7;
  const ws = (state.settings.weekStart || 0) % 7;
  let dow = '';
  for (let i = 0; i < 7; i++) dow += '<div class="cal-dow">' + WEEK_SHORT[(ws + i) % 7] + '</div>';
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cal-cell blank"></div>';
  const today = todayStr();
  const passR = state.settings.passRatio || 0.6;
  for (let d = 1; d <= days; d++) {
    const ds = y + '-' + pad2(m) + '-' + pad2(d);
    const lg = state.logs[ds];
    const st = lg ? dayStat(lg) : { ratio: 0, okSets: 0, tgtSets: 0, volume: 0, minutes: 0, pass: false };
    const future = ds > today;
    let lv = '', tip;
    if (lg && lg.rest && st.okSets === 0) { lv = 'restday'; tip = '休息日'; }
    else if (st.ratio >= 1) { lv = 'lv4'; tip = '完美达标 ' + r0(st.ratio * 100) + '%'; }
    else if (st.ratio >= passR) { lv = 'lv3'; tip = '达标 ' + r0(st.ratio * 100) + '%'; }
    else if (st.okSets > 0) { lv = 'lv2'; tip = '部分完成 ' + r0(st.ratio * 100) + '%'; }
    else if (isActiveDay(lg)) { lv = 'lv1'; tip = '有记录 ' + r0(st.ratio * 100) + '%'; }
    else tip = lg ? '未达标' : '无记录';
    cells += '<button class="cal-cell ' + lv + (future ? ' future' : '') + (ds === today ? ' today' : '') +
      '" data-d="' + ds + '" title="' + ds + ' · ' + tip + (st.volume ? ' · 容量 ' + r0(st.volume) : '') + '">' +
      '<b>' + d + '</b>' + (st.volume ? '<span style="font-size:8.5px;opacity:.85">' + shortNum(st.volume) + '</span>' : '') + '</button>';
  }
  return '<div class="cal-grid">' + dow + cells + '</div>';
}

/* ------------------------- 统计视图 ------------------------- */
const STAT_METRICS = [
  { id: 'volume', name: '训练容量', pick: r => r.volume, unit: '' },
  { id: 'pass', name: '达标天数', pick: r => r.pass, unit: ' 天' },
  { id: 'minutes', name: '训练时长', pick: r => r.minutes, unit: ' 分' }
];
const TREND_METRICS = [
  { id: 'maxWeight', name: '最大重量', pick: s => s.maxWeight },
  { id: 'bestReps', name: '最佳次数', pick: s => s.bestReps },
  { id: 'volume', name: '动作总容量', pick: s => s.volume },
  { id: 'sets', name: '完成组数', pick: s => s.sets }
];

function renderStats() {
  const root = $('#view-stats');
  const today = todayStr();
  const u = state.settings.unit;
  const streak = computeStreak(), longest = computeLongestStreak();
  const tds = trainedDates(), ads = activeDates();
  const ws = startOfWeek(today), we = endOfWeek(today);
  const wk = rangeStats(ws, we);
  const goal = Math.max(1, num(state.settings.weeklyGoalDays));
  const mk = monthKey(today);
  const mp = mk.split('-');
  const mStart = mk + '-01';
  const dim = new Date(+mp[0], +mp[1], 0).getDate();
  const mEnd = mk + '-' + pad2(dim);
  const mo = rangeStats(mStart, mEnd);
  const todayNum = +today.slice(8, 10);
  const moGoal = Math.max(1, Math.round(goal / 7 * (mk === monthKey(today) ? todayNum : dim)));
  const totalVol = sum(ads.map(d => dayStat(state.logs[d]).volume));
  const totalMin = sum(ads.map(d => dayStat(state.logs[d]).minutes));

  const kpi =
    '<div class="grid g3">' +
      kpiCard('🔥', '连续打卡', streak, '天', '最长 ' + longest + ' 天 · 达标线 ' + r0((state.settings.passRatio || 0.6) * 100) + '%', 'var(--brand)') +
      kpiCard('📅', '本周达标', wk.pass, '/ ' + goal + ' 天', '本周训练 ' + wk.trained + ' 天 · 休息 ' + Math.max(0, wk.active - wk.trained) + ' 天', 'var(--info)') +
      kpiCard('🗓️', '本月达标', mo.pass, '天', '目标约 ' + moGoal + ' 天 · 完成率 ' + r0(mo.pass / moGoal * 100) + '%', 'var(--ok)') +
      kpiCard('💪', '累计训练', tds.length, '天', '共打卡 ' + ads.length + ' 天（含休息日）', 'var(--warn)') +
      kpiCard('🏋️', '累计容量', r0(totalVol), u, '本周 ' + r0(wk.volume) + u + ' · 本月 ' + r0(mo.volume) + u, '#a78bfa') +
      kpiCard('⏱️', '累计时长', r1(totalMin / 60), '小时', '本周 ' + wk.minutes + ' 分钟', '#f472b6') +
    '</div>';

  /* 每周趋势 */
  const sm = STAT_METRICS.filter(x => x.id === (ui.statMetric || 'volume'))[0] || STAT_METRICS[0];
  const weeks = [];
  for (let w = -11; w <= 0; w++) {
    const s = addDays(startOfWeek(today), w * 7);
    const rs = rangeStats(s, addDays(s, 6));
    const d = parseDate(s);
    weeks.push({
      label: (d.getMonth() + 1) + '/' + d.getDate() + ' 当周',
      tick: (d.getMonth() + 1) + '/' + d.getDate(),
      value: sm.pick(rs),
      sub: sm.unit,
      color: w === 0 ? 'var(--brand)' : 'var(--info)'
    });
  }

  /* 动作趋势 */
  const prMap = computePRs();
  const exNames = Object.keys(prMap).sort();
  if (!ui.trendEx || exNames.indexOf(ui.trendEx) < 0) ui.trendEx = exNames[0] || '';
  const tm = TREND_METRICS.filter(x => x.id === (ui.trendMetric || 'maxWeight'))[0] || TREND_METRICS[0];
  const ser = ui.trendEx ? exerciseSeries(ui.trendEx) : [];
  const last = ser.slice(-24);
  let trendChart = '<div class="empty"><div class="e-ic">📈</div><div class="e-t">还没有动作数据</div><div class="e-d">打卡后这里会显示每个动作的进步曲线</div></div>';
  if (last.length) {
    trendChart = '<div class="chart-box">' + chartLine(
      last.map(s => s.date.slice(5).replace('-', '/')),
      [{ name: tm.name, color: 'var(--brand)', points: last.map(s => tm.pick(s)), area: true }],
      { zero: tm.id === 'maxWeight' ? false : true }
    ) + '</div>';
    const firstV = tm.pick(ser[0]), lastV = tm.pick(ser[ser.length - 1]);
    const delta = lastV - firstV;
    trendChart += '<div class="center tiny" style="margin-top:6px"><span class="muted">首次 ' + r1(firstV) + ' → 最近 ' + r1(lastV) + '　</span>' +
      '<span class="badge ' + (delta > 0 ? 'ok' : delta < 0 ? 'bad' : 'muted') + '">' + (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '＝ ') + r1(Math.abs(delta)) + '</span>' +
      '<span class="muted">　共 ' + ser.length + ' 次训练</span></div>';
  }

  /* PR 表 */
  const prRows = exNames.map(n => prMap[n]).sort((a, b) => b.sessions - a.sessions || b.bestWeight - a.bestWeight);
  let prHTML;
  if (!prRows.length) {
    prHTML = '<div class="empty"><div class="e-ic">🏆</div><div class="e-t">暂无 PR</div><div class="e-d">完成训练后自动统计个人最佳</div></div>';
  } else {
    prHTML = '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>动作</th><th class="num">最大重量</th><th class="num">对应次数</th><th class="num">最佳次数</th>' +
      '<th class="num">单组最大容量</th><th class="num">累计容量</th><th class="num">训练次数</th><th>刷新日期</th>' +
      '</tr></thead><tbody>' +
      prRows.map(m => '<tr><td><b>' + esc(m.name) + '</b></td>' +
        '<td class="num">' + (m.bestWeight ? m.bestWeight + u : '—') + '</td>' +
        '<td class="num">' + (m.bestWeight ? m.bwReps : '—') + '</td>' +
        '<td class="num">' + (m.bestReps ? m.bestReps + (m.brWeight ? ' @' + m.brWeight + u : '') : '—') + '</td>' +
        '<td class="num">' + (m.bestSetVol ? r0(m.bestSetVol) : '—') + '</td>' +
        '<td class="num">' + r0(m.totalVol) + '</td>' +
        '<td class="num">' + m.sessions + '</td>' +
        '<td class="tiny muted">' + (m.bwDate || '—') + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  /* 最近记录 */
  const recent = ads.slice().reverse().slice(0, 12);
  let recentHTML;
  if (!recent.length) {
    recentHTML = '<div class="empty"><div class="e-ic">🗒️</div><div class="e-t">暂无打卡记录</div><div class="e-d">去「打卡」页开始第一次训练</div></div>';
  } else {
    recentHTML = '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>日期</th><th>训练内容</th><th class="num">达标组</th><th class="num">完成度</th><th class="num">容量</th><th class="num">时长</th><th>感受</th><th>小结</th><th></th>' +
      '</tr></thead><tbody>' +
      recent.map(d => {
        const lg = state.logs[d], st = dayStat(lg);
        const mood = MOODS.filter(x => x.v === lg.mood)[0];
        return '<tr><td class="mono">' + d + '<div class="tiny muted">' + WEEK_CN[parseDate(d).getDay()] + '</div></td>' +
          '<td>' + (lg.rest && !st.okSets ? '<span class="badge info">🧘 休息日</span>' : esc(lg.planName || '')) + '</td>' +
          '<td class="num">' + st.okSets + '/' + st.tgtSets + '</td>' +
          '<td class="num"><span class="badge ' + (st.ratio >= 1 ? 'ok' : st.pass ? 'warn' : st.okSets ? 'bad' : 'muted') + '">' + r0(st.ratio * 100) + '%</span></td>' +
          '<td class="num">' + (st.volume ? r0(st.volume) : '—') + '</td>' +
          '<td class="num">' + (st.minutes ? st.minutes + '分' : '—') + '</td>' +
          '<td>' + (mood ? mood.ic : '—') + '</td>' +
          '<td class="tiny muted" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(lg.note || '') + '</td>' +
          '<td><button class="btn xs ghost js-goto" data-d="' + d + '">查看</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* 徽章 */
  const badges = computeBadges();
  const badgeHTML = '<div class="badge-grid">' + badges.map(b =>
    '<div class="ach' + (b.got ? ' got' : '') + '" title="' + esc(b.desc) + '"><div class="a-ic">' + b.ic + '</div>' +
    '<div class="a-name">' + esc(b.name) + '</div><div class="a-desc">' + esc(b.desc) + '</div></div>').join('') + '</div>';

  root.innerHTML =
    kpi +
    '<div class="card" style="margin-top:12px">' +
      '<div class="cal-head">' +
        '<button class="icon-btn js-calprev" title="上个月">‹</button>' +
        '<div style="font-weight:800;font-size:14.5px;min-width:96px;text-align:center">' + (+ui.calMonth.slice(0, 4)) + ' 年 ' + (+ui.calMonth.slice(5, 7)) + ' 月</div>' +
        '<button class="icon-btn js-calnext" title="下个月">›</button>' +
        '<button class="btn xs ghost js-caltoday">回到本月</button>' +
        '<div class="spacer"></div>' +
        '<span class="badge brand">当月达标 ' + calMonthPass(ui.calMonth) + ' 天</span>' +
      '</div>' +
      calendarHTML(ui.calMonth) +
      '<div class="cal-legend">' +
        '<span><i class="sw" style="background:var(--card-2);border:1px solid var(--line-soft)"></i>无记录</span>' +
        '<span><i class="sw" style="background:rgba(255,122,69,.42)"></i>部分完成</span>' +
        '<span><i class="sw" style="background:rgba(61,220,151,.5)"></i>达标</span>' +
        '<span><i class="sw" style="background:linear-gradient(135deg,#1fbf7f,#3ddc97)"></i>完美</span>' +
        '<span><i class="sw" style="background:var(--info-soft);border:1px solid rgba(76,201,240,.3)"></i>休息日</span>' +
        '<span class="spacer"></span><span class="tiny muted">点击日期可跳转打卡</span>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div class="card-title"><span class="ic">📊</span>近 12 周趋势</div>' +
        '<div class="spacer"></div>' +
        '<div class="tabs" style="padding:3px">' + STAT_METRICS.map(m =>
          '<button class="tab sm js-sm' + (m.id === sm.id ? ' active' : '') + '" data-m="' + m.id + '" style="padding:5px 11px;font-size:12px">' + m.name + '</button>').join('') + '</div>' +
      '</div>' +
      '<div class="chart-box">' + chartBars(weeks, {}) + '</div>' +
      '<div class="tiny muted center" style="margin-top:4px">按周一起始的自然周统计（可在设置中修改每周起始日）</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div class="card-title"><span class="ic">📈</span>动作进步曲线</div><div class="spacer"></div>' +
        '<select class="select js-trendex" style="width:auto;min-width:150px;padding:6px 28px 6px 10px;font-size:12.5px">' +
          (exNames.length ? exNames.map(n => '<option value="' + esc(n) + '"' + (n === ui.trendEx ? ' selected' : '') + '>' + esc(n) + '</option>').join('') : '<option value="">暂无动作</option>') +
        '</select>' +
        '<select class="select js-trendm" style="width:auto;min-width:118px;padding:6px 28px 6px 10px;font-size:12.5px">' +
          TREND_METRICS.map(m => '<option value="' + m.id + '"' + (m.id === tm.id ? ' selected' : '') + '>' + m.name + '</option>').join('') +
        '</select>' +
      '</div>' + trendChart +
    '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="ic">🏆</span>个人最佳 PR</div>' +
      '<div class="spacer"></div><span class="tiny muted">共 ' + prRows.length + ' 个动作</span></div>' + prHTML + '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="ic">🗒️</span>最近打卡</div>' +
      '<div class="spacer"></div><span class="tiny muted">最近 ' + recent.length + ' 条</span></div>' + recentHTML + '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="ic">🎖️</span>成就徽章</div>' +
      '<div class="spacer"></div><span class="tiny muted">已解锁 ' + badges.filter(b => b.got).length + ' / ' + badges.length + '</span></div>' + badgeHTML + '</div>';

  bindStats(root);
}
function kpiCard(icon, label, value, unit, sub, color) {
  return '<div class="kpi" style="--kpi-c:' + color + '">' +
    '<div class="k-label">' + icon + ' ' + esc(label) + '</div>' +
    '<div class="k-value">' + value + (unit ? '<span class="k-unit">' + esc(unit) + '</span>' : '') + '</div>' +
    '<div class="k-sub">' + esc(sub) + '</div></div>';
}
function calMonthPass(mk) {
  const p = mk.split('-');
  const dim = new Date(+p[0], +p[1], 0).getDate();
  return rangeStats(mk + '-01', mk + '-' + pad2(dim)).pass;
}
function bindStats(root) {
  const prev = $('.js-calprev', root), next = $('.js-calnext', root);
  if (prev) prev.addEventListener('click', () => { ui.calMonth = shiftMonth(ui.calMonth, -1); renderStats(); });
  if (next) next.addEventListener('click', () => { ui.calMonth = shiftMonth(ui.calMonth, 1); renderStats(); });
  const ct = $('.js-caltoday', root);
  if (ct) ct.addEventListener('click', () => { ui.calMonth = monthKey(todayStr()); renderStats(); });
  $$('.cal-cell[data-d]', root).forEach(c => c.addEventListener('click', () => {
    ui.date = c.dataset.d; setTab('checkin');
  }));
  $$('.js-sm', root).forEach(b => b.addEventListener('click', () => { ui.statMetric = b.dataset.m; renderStats(); }));
  const te = $('.js-trendex', root);
  if (te) te.addEventListener('change', () => { ui.trendEx = te.value; renderStats(); });
  const tmm = $('.js-trendm', root);
  if (tmm) tmm.addEventListener('change', () => { ui.trendMetric = tmm.value; renderStats(); });
  $$('.js-goto', root).forEach(b => b.addEventListener('click', () => { ui.date = b.dataset.d; setTab('checkin'); }));
}
function shiftMonth(mk, n) {
  const p = mk.split('-');
  const d = new Date(+p[0], (+p[1]) - 1 + n, 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}
/* ------------------------- 计划视图 ------------------------- */
function renderPlan() {
  const root = $('#view-plan');
  const u = state.settings.unit;
  const todayDow = new Date().getDay();
  const ws = (state.settings.weekStart || 0) % 7;
  let cols = '';
  for (let k = 0; k < 7; k++) {
    const wd = (ws + k) % 7;
    const day = getPlanDay(wd);
    const totalSets = sum((day.exercises || []).map(e => num(e.sets) || 0));
    let rows = '';
    (day.exercises || []).forEach((e, i) => {
      rows += '<div class="plan-ex" data-e="' + e.id + '">' +
        '<span class="tiny muted" style="width:16px">' + (i + 1) + '</span>' +
        '<span class="pe-name">' + esc(e.name) + '</span>' +
        '<span class="pe-meta">' + (num(e.sets) || 1) + '×' + esc(e.reps || '—') + (num(e.weight) > 0 ? ' @' + num(e.weight) + u : ' 自重') + (num(e.rest) ? ' · ' + num(e.rest) + 's' : '') + '</span>' +
        '<button class="btn xs ghost js-pup" data-wd="' + wd + '" data-i="' + i + '" title="上移" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button class="btn xs ghost js-pdown" data-wd="' + wd + '" data-i="' + i + '" title="下移" ' + (i === (day.exercises || []).length - 1 ? 'disabled' : '') + '>↓</button>' +
        '<button class="btn xs ghost js-pedit" data-wd="' + wd + '" data-e="' + e.id + '" title="编辑">✎</button>' +
        '<button class="btn xs ghost js-pdel" data-wd="' + wd + '" data-e="' + e.id + '" title="删除">🗑</button>' +
      '</div>';
    });
    if (!rows) rows = '<div class="tiny muted" style="padding:12px 0;text-align:center">' + (day.rest ? '🧘 休息日，好好恢复' : '暂无动作，点下方添加') + '</div>';
    cols += '<div class="day-col' + (day.rest ? ' is-rest' : '') + (wd === todayDow ? ' today-col' : '') + '" data-wd="' + wd + '">' +
      '<div class="day-head">' +
        '<span class="day-dow">' + WEEK_CN[wd] + (wd === todayDow ? ' ·今天' : '') + '</span>' +
        '<input class="input js-pname" data-wd="' + wd + '" value="' + esc(day.name || '') + '" placeholder="训练主题，如：推日 · 胸肩三头" style="padding:5px 9px;font-size:12.5px;font-weight:650">' +
        '<button class="btn xs ' + (day.rest ? 'ok' : 'ghost') + ' js-prest" data-wd="' + wd + '" title="切换休息日">' + (day.rest ? '🧘 休息' : '🏋️ 训练') + '</button>' +
      '</div>' +
      '<div class="tiny muted" style="margin-bottom:8px">' + (day.exercises || []).length + ' 个动作 · 计划 ' + totalSets + ' 组</div>' +
      rows +
      '<button class="btn xs block js-padd" data-wd="' + wd + '" style="margin-top:9px">+ 添加动作</button>' +
    '</div>';
  }

  root.innerHTML =
    '<div class="card">' +
      '<div class="card-head"><div class="card-title"><span class="ic">📅</span>每周训练计划</div>' +
        '<div class="spacer"></div>' +
        '<label class="tiny muted" style="display:flex;align-items:center;gap:6px">每周目标达标天数' +
          '<input class="input js-goal" type="number" min="1" max="7" step="1" value="' + num(state.settings.weeklyGoalDays) + '" style="width:64px;padding:5px 8px;text-align:center">' +
        '</label>' +
        '<label class="tiny muted" style="display:flex;align-items:center;gap:6px">每周起始' +
          '<select class="select js-ws" style="width:auto;padding:5px 26px 5px 8px;font-size:12px">' +
            '<option value="1"' + (ws === 1 ? ' selected' : '') + '>周一</option>' +
            '<option value="0"' + (ws === 0 ? ' selected' : '') + '>周日</option>' +
          '</select>' +
        '</label>' +
      '</div>' +
      '<div class="hr-note">计划是<b>每周固定模板</b>：打开打卡页时会自动带入当天对应的动作与目标（组数 / 次数区间 / 重量 / 休息时间）。修改计划<b>不会影响</b>已经保存的历史打卡记录。</div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));margin-top:12px">' + cols + '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div class="card-title"><span class="ic">🧰</span>模板工具</div></div>' +
      '<div class="field-row">' +
        '<button class="btn js-tpl-pushpull">载入「推/拉/腿」经典三分化</button>' +
        '<button class="btn js-tpl-full">载入「全身 3 天」新手计划</button>' +
        '<button class="btn js-tpl-home">载入「居家无器械」计划</button>' +
        '<button class="btn danger js-tpl-clear">清空全部计划</button>' +
      '</div>' +
      '<div class="tiny muted" style="margin-top:9px">载入模板会覆盖现有计划安排（历史记录与身体数据不受影响）。</div>' +
    '</div>';

  bindPlan(root);
}
function bindPlan(root) {
  $$('.js-pname', root).forEach(inp => inp.addEventListener('change', () => {
    getPlanDay(+inp.dataset.wd).name = inp.value.trim();
    saveNow(); renderPlan();
  }));
  $$('.js-prest', root).forEach(b => b.addEventListener('click', () => {
    const d = getPlanDay(+b.dataset.wd);
    d.rest = !d.rest;
    saveNow(); renderPlan();
  }));
  $$('.js-padd', root).forEach(b => b.addEventListener('click', () => planExModal(+b.dataset.wd, null)));
  $$('.js-pedit', root).forEach(b => b.addEventListener('click', () => planExModal(+b.dataset.wd, b.dataset.e)));
  $$('.js-pdel', root).forEach(b => b.addEventListener('click', () => {
    const day = getPlanDay(+b.dataset.wd);
    const e = day.exercises.filter(x => x.id === b.dataset.e)[0];
    if (!e) return;
    confirmDialog('删除动作', '从「' + WEEK_CN[+b.dataset.wd] + ' ' + esc(day.name) + '」中删除 <b>' + esc(e.name) + '</b>？', () => {
      day.exercises = day.exercises.filter(x => x.id !== b.dataset.e);
      saveNow(); renderPlan(); toast('已删除', 'info');
    }, '删除');
  }));
  $$('.js-pup', root).forEach(b => b.addEventListener('click', () => movePlanEx(+b.dataset.wd, +b.dataset.i, -1)));
  $$('.js-pdown', root).forEach(b => b.addEventListener('click', () => movePlanEx(+b.dataset.wd, +b.dataset.i, 1)));
  const gi = $('.js-goal', root);
  if (gi) gi.addEventListener('change', () => { state.settings.weeklyGoalDays = clamp(num(gi.value) || 4, 1, 7); saveNow(); renderPlan(); toast('每周目标已设为 ' + state.settings.weeklyGoalDays + ' 天', 'ok'); });
  const wsel = $('.js-ws', root);
  if (wsel) wsel.addEventListener('change', () => { state.settings.weekStart = +wsel.value; saveNow(); renderPlan(); });
  $('.js-tpl-pushpull', root).addEventListener('click', () => loadTemplate('ppl'));
  $('.js-tpl-full', root).addEventListener('click', () => loadTemplate('fb'));
  $('.js-tpl-home', root).addEventListener('click', () => loadTemplate('home'));
  $('.js-tpl-clear', root).addEventListener('click', () => confirmDialog('清空计划', '将移除全部 7 天的动作安排。历史记录不受影响。', () => {
    state.plan.days.forEach(d => { d.exercises = []; d.rest = true; d.name = '休息日'; });
    saveNow(); renderPlan(); toast('已清空计划', 'info');
  }, '清空'));
}
function movePlanEx(wd, i, dir) {
  const day = getPlanDay(wd);
  const j = i + dir;
  if (j < 0 || j >= day.exercises.length) return;
  const t = day.exercises[i]; day.exercises[i] = day.exercises[j]; day.exercises[j] = t;
  saveNow(); renderPlan();
}
function planExModal(wd, exId) {
  const day = getPlanDay(wd);
  const e = exId ? (day.exercises || []).filter(x => x.id === exId)[0] : null;
  const u = state.settings.unit;
  openModal({
    title: (e ? '编辑动作 · ' : '添加动作 · ') + WEEK_CN[wd] + ' ' + (day.name || ''),
    body:
      '<div class="field"><label class="label">动作名称</label><input class="input js-name" value="' + esc(e ? e.name : '') + '" placeholder="要记录的动作，如：杠铃卧推"></div>' +
      '<div class="field-row" style="margin-top:10px">' +
        '<div class="field"><label class="label">目标组数</label><input class="input js-sets" type="number" min="1" step="1" value="' + (e ? num(e.sets) || 3 : '') + '" placeholder="如 4"></div>' +
        '<div class="field"><label class="label">次数 / 时间目标</label><input class="input js-reps" value="' + esc(e ? e.reps : '') + '" placeholder="如 8-12，或 60秒 / 25分钟"></div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:10px">' +
        '<div class="field"><label class="label">目标重量(' + u + ')</label><input class="input js-weight" type="number" min="0" step="0.5" value="' + (e ? num(e.weight) : '') + '" placeholder="如 40"><div class="tiny muted" style="margin-top:4px">留空或 0 = 自重 / 不校验重量</div></div>' +
        '<div class="field"><label class="label">组间休息(秒)</label><input class="input js-rest" type="number" min="0" step="15" value="' + (e ? num(e.rest) || state.settings.defaultRest : '') + '" placeholder="如 90"></div>' +
      '</div>' +
      (e ? '' : '<div class="hr-note" style="margin-top:12px">留空的项使用默认值：组数 3、重量 0、休息 ' + state.settings.defaultRest + ' 秒。</div>'),
    actions: (e ? '<button class="btn danger js-del" style="margin-right:auto">删除</button>' : '') +
      '<button class="btn ghost js-close">取消</button><button class="btn primary js-save">' + (e ? '保存' : '添加') + '</button>',
    onMount: m => {
      $('.js-save', m).addEventListener('click', () => {
        const name = $('.js-name', m).value.trim();
        if (!name) { toast('请填写动作名称', 'bad'); return; }
        const data = {
          name: name,
          sets: Math.max(1, num($('.js-sets', m).value) || 3),
          reps: $('.js-reps', m).value.trim(),
          weight: Math.max(0, num($('.js-weight', m).value)),
          rest: Math.max(0, num($('.js-rest', m).value) || state.settings.defaultRest)
        };
        if (e) Object.assign(e, data);
        else day.exercises.push(Object.assign({ id: uid(), note: '' }, data));
        if (data.exercises) delete data.exercises;
        day.rest = false;
        saveNow(); closeModal(); renderPlan();
        toast(e ? '已保存' : '已添加「' + name + '」', 'ok');
      });
      const del = $('.js-del', m);
      if (del) del.addEventListener('click', () => {
        day.exercises = day.exercises.filter(x => x.id !== exId);
        saveNow(); closeModal(); renderPlan(); toast('已删除', 'info');
      });
    }
  });
}
function loadTemplate(kind) {
  const blank = () => ({ rest: true, exercises: [], name: '休息日' });
  const days = [blank(), blank(), blank(), blank(), blank(), blank(), blank()];
  const set = (wd, name, list) => { days[wd].name = name; days[wd].rest = false; days[wd].exercises = list; };
  if (kind === 'ppl') {
    set(1, '推日 · 胸 / 肩 / 三头', [mkEx('杠铃卧推', 4, '6-10', 40, 150), mkEx('上斜哑铃卧推', 3, '8-12', 16, 100), mkEx('坐姿哑铃推肩', 4, '8-12', 16, 100), mkEx('侧平举', 3, '12-15', 6, 60), mkEx('绳索下压', 3, '10-15', 20, 70)]);
    set(2, '拉日 · 背 / 二头', [mkEx('引体向上', 4, '5-10', 0, 150), mkEx('杠铃划船', 4, '8-12', 40, 120), mkEx('高位下拉', 3, '10-12', 35, 90), mkEx('面拉', 3, '15-20', 15, 60), mkEx('哑铃弯举', 3, '10-15', 10, 60)]);
    set(3, '腿日 · 下肢', [mkEx('杠铃深蹲', 5, '5-8', 60, 180), mkEx('罗马尼亚硬拉', 4, '8-12', 50, 120), mkEx('腿举', 3, '10-15', 90, 90), mkEx('腿弯举', 3, '12-15', 25, 70), mkEx('站姿提踵', 4, '12-20', 30, 45)]);
    set(4, '推日 · 力量进阶', [mkEx('站姿实力推', 4, '5-8', 30, 150), mkEx('双杠臂屈伸', 3, '8-12', 0, 100), mkEx('哑铃飞鸟', 3, '12-15', 10, 70), mkEx('锤式弯举', 3, '10-12', 10, 60)]);
    set(5, '拉日 · 力量进阶', [mkEx('硬拉', 4, '4-6', 70, 180), mkEx('单臂哑铃划船', 3, '10-12', 24, 90), mkEx('直臂下拉', 3, '12-15', 20, 60), mkEx('反向飞鸟', 3, '12-15', 8, 60)]);
    set(6, '腿日 / 有氧 + 核心', [mkEx('前蹲或哈克蹲', 4, '8-12', 45, 120), mkEx('保加利亚分腿蹲', 3, '10-12', 12, 90), mkEx('跑步机或单车', 1, '20分钟', 0, 0), mkEx('卷腹', 3, '15-20', 0, 45)]);
  } else if (kind === 'fb') {
    const fb = () => [mkEx('杠铃深蹲', 3, '6-10', 50, 150), mkEx('杠铃卧推', 3, '6-10', 35, 150), mkEx('杠铃划船', 3, '8-12', 35, 120), mkEx('坐姿推肩', 3, '8-12', 14, 90), mkEx('高位下拉', 3, '10-12', 30, 90), mkEx('平板支撑', 3, '45秒', 0, 60)];
    set(1, '全身 A', fb('A')); set(3, '全身 B', fb('B')); set(5, '全身 C', fb('C'));
  } else if (kind === 'home') {
    set(1, '居家上肢 + 核心', [mkEx('俯卧撑', 4, '10-20', 0, 60), mkEx('反向划船(桌下)', 3, '10-15', 0, 60), mkEx('派克俯卧撑', 3, '8-12', 0, 60), mkEx('平板支撑', 3, '60秒', 0, 45)]);
    set(3, '居家下肢', [mkEx('深蹲', 4, '15-25', 0, 60), mkEx('保加利亚分腿蹲', 3, '10-15', 0, 75), mkEx('臀桥', 3, '15-20', 0, 45), mkEx('站姿提踵', 3, '20-25', 0, 45)]);
    set(5, '居家全身 HIIT', [mkEx('波比跳', 4, '10-15', 0, 60), mkEx('登山者', 4, '30秒', 0, 45), mkEx('开合跳', 3, '40次', 0, 45), mkEx('死虫式', 3, '12-16', 0, 45)]);
    set(6, '拉伸 / 散步', [mkEx('全身拉伸', 1, '15分钟', 0, 0), mkEx('快走或慢跑', 1, '30分钟', 0, 0)]);
  }
  days.forEach((d, i) => { d.weekday = i; });
  confirmDialog('载入计划模板', '将用模板覆盖当前的每周计划安排（<b>历史打卡记录与身体数据不会改变</b>）。确定继续吗？', () => {
    state.plan.days = days;
    saveNow(); renderPlan(); toast('计划模板已载入', 'ok');
  }, '载入');
}

/* ------------------------- 身体数据视图 ------------------------- */
function metricSeries(key) {
  return Object.keys(state.metrics).sort()
    .map(d => ({ date: d, value: num(state.metrics[d][key]) }))
    .filter(x => x.value > 0);
}
function renderBody() {
  const root = $('#view-body');
  const date = ui.bodyDate || todayStr();
  const rec = state.metrics[date] || {};
  const u = state.settings.unit;

  let inputs = '';
  METRIC_FIELDS.forEach(f => {
    inputs += '<div class="field" style="min-width:112px">' +
      '<label class="label">' + f.icon + ' ' + f.label + '(' + f.unit + ')</label>' +
      '<input class="input js-m" data-k="' + f.key + '" type="number" inputmode="decimal" min="0" step="0.1" ' +
      'value="' + (num(rec[f.key]) ? num(rec[f.key]) : '') + '" placeholder="—"></div>';
  });

  let cards = '';
  METRIC_FIELDS.forEach(f => {
    const ser = metricSeries(f.key);
    if (!ser.length) return;
    const latest = ser[ser.length - 1];
    let prev = null;
    for (let i = ser.length - 2; i >= 0; i--) {
      if (daysBetween(ser[i].date, latest.date) >= 3) { prev = ser[i]; break; }
    }
    if (!prev && ser.length > 1) prev = ser[ser.length - 2];
    const delta = prev ? latest.value - prev.value : 0;
    const cls = Math.abs(delta) < 0.05 ? 'flat' : (f.key === 'weight' || f.key === 'waist' || f.key === 'bodyFat' ? (delta > 0 ? 'up' : 'down') : (delta > 0 ? 'down' : 'up'));
    cards += '<button class="metric-card js-msel" data-k="' + f.key + '" style="text-align:left;' + (ui.metric === f.key ? 'border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)' : '') + '">' +
      '<div class="metric-top"><span class="metric-label">' + f.icon + ' ' + f.label + '</span>' +
        '<span class="metric-val">' + r1(latest.value) + '<span class="metric-unit"> ' + f.unit + '</span></span></div>' +
      '<div class="metric-delta ' + cls + '">' + (prev ? (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '＝ ') + r1(Math.abs(delta)) + ' ' + f.unit + '（对比 ' + prev.date.slice(5) + '）' : '首次记录') + '</div>' +
      sparkline(ser.slice(-20).map(x => x.value), ui.metric === f.key ? 'var(--brand)' : 'var(--info)') +
    '</button>';
  });
  if (!cards) cards = '<div class="empty" style="grid-column:1/-1"><div class="e-ic">⚖️</div><div class="e-t">还没有身体数据</div><div class="e-d">在上方填写体重等数据并保存，即可看到趋势曲线</div></div>';

  const f = METRIC_FIELDS.filter(x => x.key === ui.metric)[0] || METRIC_FIELDS[0];
  const ser = metricSeries(f.key);
  const chart = ser.length > 1
    ? '<div class="chart-box">' + chartLine(ser.map(x => x.date.slice(5).replace('-', '/')), [{ name: f.label, color: 'var(--brand)', points: ser.map(x => x.value), area: true }], { zero: false }) + '</div>'
    : '<div class="empty"><div class="e-ic">📉</div><div class="e-t">' + f.label + ' 数据不足</div><div class="e-d">至少需要 2 条记录才能画出趋势</div></div>';

  const hist = Object.keys(state.metrics).sort().reverse();
  const histHTML = hist.length
    ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>日期</th>' +
      METRIC_FIELDS.map(x => '<th class="num">' + x.label + '</th>').join('') + '<th>备注</th><th></th></tr></thead><tbody>' +
      hist.slice(0, 40).map(d => {
        const r = state.metrics[d];
        return '<tr><td class="mono">' + d + '</td>' +
          METRIC_FIELDS.map(x => '<td class="num">' + (num(r[x.key]) ? r1(num(r[x.key])) : '—') + '</td>').join('') +
          '<td class="tiny muted" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.note || '') + '</td>' +
          '<td><button class="btn xs ghost js-mdel" data-d="' + d + '">删除</button></td></tr>';
      }).join('') + '</tbody></table></div>'
    : '<div class="empty"><div class="e-ic">🗂️</div><div class="e-t">暂无历史记录</div></div>';

  root.innerHTML =
    '<div class="card">' +
      '<div class="card-head"><div class="card-title"><span class="ic">📝</span>记录身体数据</div>' +
        '<div class="spacer"></div>' +
        '<input type="date" class="input js-bdate" value="' + date + '" max="' + todayStr() + '" style="width:auto;padding:6px 9px;font-size:12.5px">' +
        '<button class="btn sm ghost js-btoday">今天</button>' +
      '</div>' +
      '<div class="field-row">' + inputs + '</div>' +
      '<div style="margin-top:10px"><input class="input js-mnote" placeholder="备注：饮食、睡眠、状态、生理期…" value="' + esc(rec.note || '') + '"></div>' +
      '<div class="field-row" style="margin-top:11px">' +
        '<button class="btn primary js-msave">💾 保存记录</button>' +
        (state.metrics[date] ? '<button class="btn danger js-mdel2" data-d="' + date + '">删除该日记录</button>' : '') +
        '<span class="tiny muted" style="align-self:center">建议固定时间测量（如晨起空腹、排便后），数据更可比</span>' +
      '</div>' +
    '</div>' +
    '<div class="sec-title">指标概览（点击卡片查看趋势）</div>' +
    '<div class="grid g4">' + cards + '</div>' +
    '<div class="card" style="margin-top:12px">' +
      '<div class="card-head"><div class="card-title"><span class="ic">📉</span>' + f.icon + ' ' + f.label + '趋势</div>' +
        '<div class="spacer"></div><span class="tiny muted">' + ser.length + ' 条记录 · 单位 ' + f.unit + '</span></div>' +
      chart +
      (ser.length ? '<div class="field-row" style="margin-top:10px;gap:16px">' +
        '<div class="kv" style="flex:1;min-width:120px"><span class="muted">最新</span><b>' + r1(ser[ser.length - 1].value) + ' ' + f.unit + '</b></div>' +
        '<div class="kv" style="flex:1;min-width:120px"><span class="muted">最高</span><b>' + r1(Math.max.apply(null, ser.map(x => x.value))) + '</b></div>' +
        '<div class="kv" style="flex:1;min-width:120px"><span class="muted">最低</span><b>' + r1(Math.min.apply(null, ser.map(x => x.value))) + '</b></div>' +
        '<div class="kv" style="flex:1;min-width:120px"><span class="muted">总变化</span><b>' + (ser[ser.length - 1].value - ser[0].value > 0 ? '+' : '') + r1(ser[ser.length - 1].value - ser[0].value) + '</b></div>' +
      '</div>' : '') +
    '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="ic">🗂️</span>历史记录</div>' +
      '<div class="spacer"></div><span class="tiny muted">共 ' + hist.length + ' 条</span></div>' + histHTML + '</div>';

  bindBody(root);
}
function bindBody(root) {
  $$('.js-m', root).forEach(inp => inp.addEventListener('input', () => {
    const d = ui.bodyDate || todayStr();
    const rec = state.metrics[d] || (state.metrics[d] = {});
    rec.date = d;
    const v = num(inp.value);
    if (inp.value === '' || v <= 0) delete rec[inp.dataset.k]; else rec[inp.dataset.k] = v;
    if (!Object.keys(rec).some(k => k !== 'date' && k !== 'note')) { if (!rec.note) delete state.metrics[d]; }
    save();
  }));
  const nt = $('.js-mnote', root);
  if (nt) nt.addEventListener('input', () => {
    const d = ui.bodyDate || todayStr();
    const rec = state.metrics[d] || (state.metrics[d] = { date: d });
    rec.note = nt.value; save();
  });
  $('.js-msave', root).addEventListener('click', () => { saveNow(); renderBody(); toast('身体数据已保存', 'ok'); });
  const bd = $('.js-bdate', root);
  if (bd) bd.addEventListener('change', () => { ui.bodyDate = bd.value || todayStr(); renderBody(); });
  $('.js-btoday', root).addEventListener('click', () => { ui.bodyDate = todayStr(); renderBody(); });
  $$('.js-msel', root).forEach(b => b.addEventListener('click', () => { ui.metric = b.dataset.k; renderBody(); }));
  const del = d => confirmDialog('删除记录', '确定删除 <b>' + d + '</b> 的身体数据记录吗？', () => {
    delete state.metrics[d]; saveNow(); renderBody(); toast('已删除', 'info');
  }, '删除');
  $$('.js-mdel', root).forEach(b => b.addEventListener('click', () => del(b.dataset.d)));
  const d2 = $('.js-mdel2', root);
  if (d2) d2.addEventListener('click', () => del(d2.dataset.d));
}
/* ------------------------- 导入导出 ------------------------- */
function download(filename, text, mime, bom) {
  const blob = new Blob([(bom ? '\uFEFF' : '') + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportJSON() {
  download('健身打卡备份-' + todayStr() + '.json', JSON.stringify(state, null, 2), 'application/json', false);
  toast('已导出 JSON 备份', 'ok');
}
/* ------------------------- AI 教练数据桥（端侧 llama-server 消费） ------------------------- */
function isoWeekLabel(dateStr) {
  const d = parseDate(dateStr);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dow + 3);
  const first = new Date(t.getFullYear(), 0, 1);
  const wn = 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
  return t.getFullYear() + '-W' + pad2(wn);
}
function coachWeekJSON(weekOffset) {
  const off = num(weekOffset) || 0;
  const ws = addDays(startOfWeek(todayStr()), off * 7);
  const u = state.settings.unit || 'kg';
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const lg = state.logs[d];
    if (!lg) continue;
    const items = [];
    (lg.entries || []).forEach(e => {
      const rec = (e.sets || []).filter(s => num(s.reps) > 0);
      if (!rec.length) return;
      const r = parseReps(e.reps);
      const tgt = r.min || r.max || 0;   // 达标线 = 次数区间下限，保证 done/target 与 pass 语义一致
      const w = num(e.targetWeight) || num(rec[rec.length - 1].weight) || 0;
      items.push({
        name: e.name + (w > 0 ? '（' + w + u + '）' : ''),
        pass: entryStat(e).done,
        reps: e.reps || '',
        targetSets: e.targetSets || 1,
        sets: rec.map(s => ({ done: num(s.reps), target: tgt, weight: num(s.weight) }))
      });
    });
    if (!items.length) continue;
    const dd = parseDate(d);
    days.push({
      date: pad2(dd.getMonth() + 1) + '-' + pad2(dd.getDate()) + ' ' + WEEK_CN[dd.getDay()],
      planName: lg.planName || '',
      rest: lg.rest === true,
      items: items
    });
  }
  return JSON.stringify({
    week: isoWeekLabel(ws),
    days: days,
    settings: { weeklyGoalDays: state.settings.weeklyGoalDays, passRatio: state.settings.passRatio }
  }, null, 2);
}
function coachDumpOverlay(text) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px';
  box.innerHTML =
    '<div style="background:var(--card,#fff);color:inherit;border-radius:14px;padding:14px;max-width:640px;width:100%;display:flex;flex-direction:column;gap:10px">' +
      '<div style="font-weight:700">🤖 教练数据 week.json</div>' +
      '<div class="muted" style="font-size:12px">浏览器把下载写进了私有目录、Termux 读不到时的兜底：复制下面全文，存成手机上的 <code>~/ai-coach/week.json</code>。</div>' +
      '<textarea id="coachDumpText" readonly spellcheck="false" style="width:100%;height:44vh;font-family:ui-monospace,monospace;font-size:11px;white-space:pre"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="coachDumpCopy">复制全文</button>' +
      '<button class="btn" id="coachDumpClose">关闭</button></div>' +
      '<div class="muted" id="coachDumpHint" style="font-size:12px"></div>' +
    '</div>';
  document.body.appendChild(box);
  const ta = $('#coachDumpText', box);
  ta.value = text;
  $('#coachDumpClose', box).addEventListener('click', () => box.remove());
  $('#coachDumpCopy', box).addEventListener('click', () => {
    const hint = $('#coachDumpHint', box);
    const ok = () => { hint.textContent = '已复制 ✔ 在 Termux 里执行：nano ~/ai-coach/week.json 然后长按粘贴，Ctrl+O 保存、Ctrl+X 退出'; };
    ta.focus(); ta.select();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, () => { document.execCommand('copy'); ok(); });
      } else { document.execCommand('copy'); ok(); }
    } catch (err) { hint.textContent = '自动复制失败：请长按文本框手动全选复制'; }
  });
}
function postCoachToTermux(text) {
  /* 自动落盘通道：Termux 里跑 receiver.py 后，点一次按钮文件就写进 ~/ai-coach/week.json。
     https 页面访问 http://127.0.0.1 是否放行取决于浏览器（vivo 已翻过一次车），
     所以这里全程静默失败——失败就退回下载/复制两条路，绝不打断用户。 */
  try {
    fetch('http://127.0.0.1:8099/week.json', {
      method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' }, body: text
    }).then(r => {
      if (r && r.ok) toast('已自动写入 Termux 的 ~/ai-coach/week.json ✔', 'ok');
    }).catch(() => {});
  } catch (e) {}
}
function exportCoachJSON() {
  let text = coachWeekJSON(0);
  if (!JSON.parse(text).days.length) text = coachWeekJSON(-1);
  const n = JSON.parse(text).days.length;
  if (!n) { toast('本周和上周都没有可导出的打卡记录', 'info'); return; }
  if (/[?&]coachdump=1/.test(location.search)) coachDumpOverlay(text);
  postCoachToTermux(text);
  download('week.json', text, 'application/json', false);
  toast('已生成 week.json（' + n + ' 天记录），放到手机 ~/ai-coach/ 后刷新教练页即可', 'ok');
}
function exportSetsCSV() {
  const rows = [['日期', '星期', '训练主题', '动作', '组序', '次数', '重量(' + state.settings.unit + ')', '单组容量', '是否达标', '目标组数', '目标次数', '目标重量', '休息秒', '训练感受', '当日小结']];
  Object.keys(state.logs).sort().forEach(d => {
    const lg = state.logs[d];
    const dow = WEEK_CN[parseDate(d).getDay()];
    const mood = (MOODS.filter(m => m.v === lg.mood)[0] || {}).t || '';
    if (lg.rest && !(lg.entries || []).length) {
      rows.push([d, dow, lg.planName || '', '(休息日)', '', '', '', '', '', '', '', '', '', mood, lg.note || '']);
      return;
    }
    (lg.entries || []).forEach(e => {
      if (!(e.sets || []).length) {
        rows.push([d, dow, lg.planName || '', e.name, '未记录', '', '', '', '否', e.targetSets, e.reps, e.targetWeight, e.rest, mood, lg.note || '']);
        return;
      }
      e.sets.forEach((s, i) => {
        rows.push([d, dow, lg.planName || '', e.name, i + 1, num(s.reps), num(s.weight), r1(num(s.reps) * num(s.weight)),
          setOk(e, s) ? '是' : '否', e.targetSets, e.reps, e.targetWeight, e.rest, mood, lg.note || '']);
      });
    });
  });
  if (rows.length < 2) { toast('还没有可导出的训练数据', 'info'); return; }
  download('健身打卡-训练明细-' + todayStr() + '.csv', rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv', true);
  toast('已导出 ' + (rows.length - 1) + ' 行训练明细', 'ok');
}
function exportMetricsCSV() {
  const rows = [['日期'].concat(METRIC_FIELDS.map(f => f.label + '(' + f.unit + ')')).concat(['备注'])];
  Object.keys(state.metrics).sort().forEach(d => {
    const r = state.metrics[d];
    rows.push([d].concat(METRIC_FIELDS.map(f => (num(r[f.key]) ? r1(num(r[f.key])) : ''))).concat([r.note || '']));
  });
  if (rows.length < 2) { toast('还没有身体数据可导出', 'info'); return; }
  download('健身打卡-身体数据-' + todayStr() + '.csv', rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv', true);
  toast('已导出身体数据', 'ok');
}
function importJSON(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let obj;
    try { obj = JSON.parse(String(fr.result).replace(/^\uFEFF/, '')); }
    catch (e) { toast('导入失败：文件不是有效的 JSON', 'bad'); return; }
    if (!obj || typeof obj !== 'object') { toast('导入失败：数据格式不正确', 'bad'); return; }
    const inc = migrate(obj);
    openModal({
      title: '导入备份数据',
      body: '<div style="font-size:13.5px;line-height:1.8">检测到备份内容：</div>' +
        '<div class="kv"><span class="muted">打卡记录</span><b>' + Object.keys(inc.logs).length + ' 天</b></div>' +
        '<div class="kv"><span class="muted">身体数据</span><b>' + Object.keys(inc.metrics).length + ' 条</b></div>' +
        '<div class="kv"><span class="muted">计划动作</span><b>' + sum(inc.plan.days.map(d => (d.exercises || []).length)) + ' 个</b></div>' +
        '<div class="hr-note" style="margin-top:12px"><b>合并</b>：保留现有数据，同一天以备份内容为准（推荐）。<br><b>覆盖</b>：清空现有数据，完全使用备份。</div>',
      actions: '<button class="btn ghost js-close">取消</button><button class="btn danger js-over">覆盖导入</button><button class="btn primary js-merge">合并导入</button>',
      onMount: m => {
        $('.js-merge', m).addEventListener('click', () => {
          const next = migrate(state);
          next.logs = Object.assign({}, state.logs, inc.logs);
          next.metrics = Object.assign({}, state.metrics, inc.metrics);
          if (sum(inc.plan.days.map(d => (d.exercises || []).length)) > 0) next.plan = inc.plan;
          next.settings = Object.assign({}, state.settings, inc.settings);
          state = next; saveNow(); closeModal(); renderAll(); toast('合并导入完成', 'ok');
        });
        $('.js-over', m).addEventListener('click', () => {
          state = inc; saveNow(); closeModal(); renderAll(); toast('覆盖导入完成', 'ok');
        });
      }
    });
  };
  fr.onerror = () => toast('读取文件失败', 'bad');
  fr.readAsText(file, 'utf-8');
}
function genSample() {
  const logs = {}, metrics = {};
  const today = new Date();
  const base = new Date(today.getTime());
  for (let i = 80; i >= 0; i--) {
    const d = addDaysD(base, -i);
    const ds = fmtDate(d);
    const wd = d.getDay();
    const pd = getPlanDay(wd);
    if (pd.rest || !(pd.exercises || []).length) {
      if (i % 11 === 0) logs[ds] = { date: ds, planName: pd.name, entries: [], mood: 3, note: '主动恢复，散步 30 分钟', rest: true, startedAt: 0, lastAt: 0, updatedAt: d.getTime() };
      continue;
    }
    if (i % 9 === 4) continue;
    const prog = (80 - i) / 80;
    const st = new Date(d); st.setHours(i % 5 === 0 ? 7 : 19, i % 5 === 0 ? 20 : 10, 0, 0);
    const entries = entriesFromPlan(pd);
    let t = st.getTime();
    entries.forEach(e => {
      const r = parseReps(e.reps);
      const nSets = Math.random() < 0.14 ? Math.max(1, e.targetSets - 1) : e.targetSets;
      for (let k = 0; k < nSets; k++) {
        const fatigue = k / Math.max(1, nSets - 1);
        const reps = r.max ? Math.max(1, Math.round((r.min + (r.max - r.min) * 0.55) - fatigue * (r.max - r.min) * 0.35 + (Math.random() * 2 - 1))) : 10;
        const w = num(e.targetWeight) ? Math.max(0, Math.round(num(e.targetWeight) * (0.9 + 0.12 * prog) * 2) / 2 + (Math.random() < 0.1 ? Math.round(num(e.targetWeight) * 0.06) : 0)) : 0;
        e.sets.push({ reps: reps, weight: w, t: t });
        t += (num(e.rest) || 90) * 1000 + 25000;
      }
    });
    logs[ds] = {
      date: ds, planName: pd.name, entries: entries,
      mood: 2 + Math.floor(Math.random() * 4),
      note: Math.random() < 0.3 ? ['睡眠不错，力量有提升', '有点疲劳，降低了重量', '状态很好，尝试加重', '午餐吃得少，后半程乏力'][Math.floor(Math.random() * 4)] : '',
      rest: false, startedAt: st.getTime(), lastAt: t, updatedAt: st.getTime()
    };
  }
  let w0 = 76.4;
  for (let i = 80; i >= 0; i -= 3) {
    const ds = fmtDate(addDaysD(base, -i));
    w0 = Math.max(68, w0 - 0.28 + (Math.random() * 0.34 - 0.17));
    metrics[ds] = {
      date: ds, weight: r1(w0), bodyFat: r1(clamp(22 - (80 - i) * 0.045 + (Math.random() * 0.6 - 0.3), 12, 30)),
      waist: r1(clamp(88 - (80 - i) * 0.05 + (Math.random() * 0.8 - 0.4), 68, 100)),
      arm: r1(clamp(31 + (80 - i) * 0.012, 25, 45)), note: ''
    };
  }
  return { logs: logs, metrics: metrics };
}
function loadSample() {
  const has = Object.keys(state.logs).length > 0 || Object.keys(state.metrics).length > 0;
  confirmDialog('载入示例数据', has ? '当前已有 <b>' + Object.keys(state.logs).length + '</b> 天打卡记录，载入示例数据会<b>覆盖</b>它们（计划模板保持不变）。建议先导出备份。' : '将生成最近 80 天的模拟训练与身体数据，方便你先体验各项统计功能。', () => {
    const s = genSample();
    state.logs = s.logs; state.metrics = s.metrics;
    saveNow(); renderAll(); toast('示例数据已载入', 'ok');
  }, '载入');
}

/* ------------------------- 设置视图 ------------------------- */
function renderSettings() {
  const root = $('#view-settings');
  const s = state.settings;
  const storageSize = (JSON.stringify(state).length / 1024);
  const logCount = Object.keys(state.logs).length;
  const setCount = sum(Object.keys(state.logs).map(d => sum((state.logs[d].entries || []).map(e => (e.sets || []).length))));

  root.innerHTML =
    '<div class="grid g2">' +
      '<div class="card">' +
        '<div class="card-head"><div class="card-title"><span class="ic">👤</span>个人与偏好</div></div>' +
        '<div class="field"><label class="label">昵称（显示在顶部）</label><input class="input js-s-name" value="' + esc(s.userName || '') + '" placeholder="如：阿哲"></div>' +
        '<div class="field-row" style="margin-top:11px">' +
          '<div class="field"><label class="label">重量单位</label><select class="select js-s-unit">' +
            '<option value="kg"' + (s.unit === 'kg' ? ' selected' : '') + '>公斤 kg</option>' +
            '<option value="lb"' + (s.unit === 'lb' ? ' selected' : '') + '>磅 lb</option></select></div>' +
          '<div class="field"><label class="label">每周起始日</label><select class="select js-s-ws">' +
            '<option value="1"' + (s.weekStart === 1 ? ' selected' : '') + '>周一</option>' +
            '<option value="0"' + (s.weekStart === 0 ? ' selected' : '') + '>周日</option></select></div>' +
        '</div>' +
        '<div class="field-row" style="margin-top:11px">' +
          '<div class="field"><label class="label">每周目标达标天数</label><input class="input js-s-goal" type="number" min="1" max="7" step="1" value="' + num(s.weeklyGoalDays) + '"></div>' +
          '<div class="field"><label class="label">默认组间休息（秒）</label><input class="input js-s-rest" type="number" min="0" step="15" value="' + num(s.defaultRest) + '"></div>' +
        '</div>' +
        '<div class="field" style="margin-top:11px">' +
          '<label class="label">达标线：完成度 ≥ <b id="passLbl" style="color:var(--brand)">' + r0((s.passRatio || 0.6) * 100) + '%</b> 记为当天达标</label>' +
          '<input type="range" class="js-s-pass" min="30" max="100" step="5" value="' + r0((s.passRatio || 0.6) * 100) + '" style="width:100%;accent-color:var(--brand)">' +
          '<div class="tiny muted" style="margin-top:4px">调低更容易保持连续记录，调高更严格。默认 60%。</div>' +
        '</div>' +
        '<hr class="divider">' +
        '<label class="kv" style="cursor:pointer"><span><b>完成一组后自动开始休息计时</b><div class="tiny muted">弹出倒计时，可 ±15 秒</div></span>' +
          '<input type="checkbox" class="js-s-autorest"' + (s.autoRest ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--brand)"></label>' +
        '<label class="kv" style="cursor:pointer"><span><b>休息结束提示音</b><div class="tiny muted">浏览器内播放短促提示音（含振动）</div></span>' +
          '<input type="checkbox" class="js-s-sound"' + (s.sound ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--brand)"></label>' +
      '</div>' +
      '<div>' +
        '<div class="card">' +
          '<div class="card-head"><div class="card-title"><span class="ic">💾</span>数据管理</div></div>' +
          '<div class="kv"><span class="muted">打卡天数</span><b>' + logCount + ' 天</b></div>' +
          '<div class="kv"><span class="muted">累计记录组数</span><b>' + setCount + ' 组</b></div>' +
          '<div class="kv"><span class="muted">身体数据条数</span><b>' + Object.keys(state.metrics).length + ' 条</b></div>' +
          '<div class="kv"><span class="muted">本地占用</span><b>' + r1(storageSize) + ' KB</b></div>' +
          '<hr class="divider">' +
          '<div class="field-row">' +
            '<button class="btn js-exp-json">⬇ 导出 JSON 备份</button>' +
            '<button class="btn js-exp-csv">⬇ 训练明细 CSV</button>' +
            '<button class="btn js-exp-mcsv">⬇ 身体数据 CSV</button>' +
            '<button class="btn js-exp-coach">🤖 教练数据 JSON</button>' +
          '</div>' +
          '<div class="field-row" style="margin-top:9px">' +
            '<button class="btn js-imp">⬆ 导入 JSON 备份</button>' +
            '<button class="btn js-sample">✨ 载入示例数据</button>' +
            '<button class="btn danger js-wipe">🗑 清空全部数据</button>' +
          '</div>' +
          '<input type="file" accept="application/json,.json" class="js-file" hidden>' +
          '<div class="hr-note" style="margin-top:11px">数据仅保存在<b>本机浏览器</b>的 localStorage 中，不会上传任何服务器。清除浏览器数据 / 换设备会导致记录丢失，<b>请定期导出 JSON 备份</b>。</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-head"><div class="card-title"><span class="ic">📲</span>安装为 App</div></div>' +
          '<div class="kv"><span class="muted">安卓 APK（约 2.3 MB，签名版）</span><a class="btn sm primary" href="fit-checkin.apk" download>⬇ 下载并安装</a></div>' +
          '<div class="hr-note" style="margin-top:11px">APK 相当于给这个网站套了一层原生外壳：安装后<strong>全屏独立运行、断网也能打卡</strong>；网站更新时 App 自动跟随，无需重装。安装时如提示「允许未知来源应用」，点允许即可。<br>iPhone 无需 APK：Safari 打开本网页 → 分享 → <b>添加到主屏幕</b>，效果相同。</div>' +
        '</div>' +

      '</div>' +
    '</div>';

  bindSettings(root);
}
function bindSettings(root) {
  const s = state.settings;
  const bind = (sel, fn) => { const el = $(sel, root); if (el) el.addEventListener('change', fn); };
  bind('.js-s-name', e => { s.userName = e.target.value.trim(); saveNow(); updateBrandSub(); toast('已保存', 'ok'); });
  bind('.js-s-unit', e => { s.unit = e.target.value; saveNow(); renderAll(); toast('单位已切换为 ' + s.unit, 'ok'); });
  bind('.js-s-ws', e => { s.weekStart = +e.target.value; saveNow(); renderAll(); });
  bind('.js-s-goal', e => { s.weeklyGoalDays = clamp(num(e.target.value) || 4, 1, 7); saveNow(); renderAll(); });
  bind('.js-s-rest', e => { s.defaultRest = Math.max(0, num(e.target.value)); saveNow(); toast('默认休息 ' + s.defaultRest + ' 秒', 'ok'); });
  const pr = $('.js-s-pass', root);
  if (pr) {
    pr.addEventListener('input', () => { const l = $('#passLbl', root); if (l) l.textContent = pr.value + '%'; });
    pr.addEventListener('change', () => { s.passRatio = clamp(num(pr.value) / 100, 0.3, 1); saveNow(); renderAll(); toast('达标线设为 ' + r0(s.passRatio * 100) + '%', 'ok'); });
  }
  const ar = $('.js-s-autorest', root);
  if (ar) ar.addEventListener('change', () => { s.autoRest = ar.checked; saveNow(); });
  const sd = $('.js-s-sound', root);
  if (sd) sd.addEventListener('change', () => { s.sound = sd.checked; saveNow(); if (sd.checked) beep(1); });

  $('.js-exp-json', root).addEventListener('click', exportJSON);
  $('.js-exp-csv', root).addEventListener('click', exportSetsCSV);
  $('.js-exp-mcsv', root).addEventListener('click', exportMetricsCSV);
  const coachBtn = $('.js-exp-coach', root);
  if (coachBtn) coachBtn.addEventListener('click', exportCoachJSON);
  $('.js-sample', root).addEventListener('click', loadSample);
  const fileInp = $('.js-file', root);
  $('.js-imp', root).addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', () => { if (fileInp.files && fileInp.files[0]) importJSON(fileInp.files[0]); fileInp.value = ''; });
  $('.js-wipe', root).addEventListener('click', () => confirmDialog('清空全部数据', '将删除<b>所有</b>打卡记录、身体数据，并把计划恢复为默认模板。<br>此操作<b>不可恢复</b>，建议先导出备份。', () => {
    state = defaultState();
    saveNow(); renderAll(); toast('已清空全部数据', 'info');
  }, '全部清空'));
}

/* ------------------------- 路由与初始化 ------------------------- */
const TABS = [
  { id: 'checkin', name: '打卡', ic: '✅' },
  { id: 'stats', name: '统计', ic: '📊' },
  { id: 'plan', name: '计划', ic: '📅' },
  { id: 'body', name: '身体', ic: '⚖️' },
  { id: 'settings', name: '设置', ic: '⚙️' }
];
function renderTabs() {
  const html = TABS.map(t =>
    '<button class="tab' + (ui.tab === t.id ? ' active' : '') + '" data-tab="' + t.id + '" role="tab" aria-selected="' + (ui.tab === t.id) + '">' +
    '<span class="ic">' + t.ic + '</span>' + t.name + '</button>').join('');
  $('#tabs').innerHTML = html;
  $('#footbar').innerHTML = '<div class="tabs">' + html + '</div>';
  $$('#tabs .tab, #footbar .tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
}
function renderView() {
  if (ui.tab === 'checkin') renderCheckin();
  else if (ui.tab === 'stats') renderStats();
  else if (ui.tab === 'plan') renderPlan();
  else if (ui.tab === 'body') renderBody();
  else renderSettings();
}
function renderAll() { renderTabs(); renderView(); updateStreakPill(); updateBrandSub(); }
function setTab(id) {
  ui.tab = id;
  TABS.forEach(t => { const v = $('#view-' + t.id); if (v) v.hidden = (t.id !== id); });
  renderTabs(); renderView(); updateBrandSub();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
}
function updateStreakPill() {
  const el = $('#streakNum');
  if (el) el.textContent = computeStreak();
}
function updateBrandSub() {
  const el = $('#brandSub');
  if (!el) return;
  const lg = getLog(todayStr()), st = dayStat(lg);
  const name = state.settings.userName ? state.settings.userName : '';
  if (lg.rest && !st.okSets) el.textContent = (name ? name + '，' : '') + '今天是休息日，好好恢复 🧘';
  else if (st.pass) el.textContent = (name ? name + '，' : '') + '今天已达标，干得漂亮 🎉';
  else if (st.okSets > 0) el.textContent = '还差 ' + Math.max(0, st.tgtSets - st.okSets) + ' 组达标，继续！';
  else el.textContent = (name ? name + ' · ' : '') + getPlanDay(new Date().getDay()).name;
}
function onKeydown(e) {
  const t = e.target;
  const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
  if (!$('#modalMask').hidden) return;
  const k = e.key;
  if (ui.tab === 'checkin' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
    e.preventDefault();
    ui.date = addDays(ui.date, k === 'ArrowLeft' ? -1 : 1);
    renderCheckin();
  } else if (k === 't' || k === 'T') { ui.date = todayStr(); setTab('checkin'); }
  else if (k >= '1' && k <= '5') { setTab(TABS[+k - 1].id); }
}
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
function init() {
  state = loadState();
  const fresh = !state;
  if (fresh) state = defaultState();
  ui.bodyDate = todayStr();
  renderAll();
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  saveNow();
  registerSW();
  if (fresh) {
    setTimeout(() => toast('欢迎！先看看「计划」页，或直接开始今天的打卡 💪', 'info', 4200), 500);
  }
}
init();