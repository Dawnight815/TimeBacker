/* =========================================================
   时间备忘录 · Bubble Timeline
   输入一段文字 + 可选的自定义时间 → 按时间挂到竖线上
   内容多了可以上下滑动
   ========================================================= */
(() => {
  'use strict';

  /* ---------------- 配置 ---------------- */

  const STORAGE_KEY = 'bubble-wall.timeline.v2';
  const TAG_KEY = 'bubble-wall.tags.v1';
  const LEGACY_KEY = 'bubble-wall.v1';
  const THEME_KEY = 'bubble-wall.theme';
  const SEEN_KEY = 'bubble-wall.timeline.seen';
  const MAX_STORED = 400;
  const MAX_TAGS = 12;
  const TAG_NAME_MAX = 8;

  // 类型标签的调色板（按顺序自动分配）
  const TAG_COLORS = [
    '#6ea8fe', '#f472b6', '#fbbf24', '#34d399',
    '#a78bfa', '#fb7185', '#22d3ee', '#f97316',
  ];

  const DEFAULT_TAGS = [
    { id: 'idea', name: '想法', color: TAG_COLORS[0] },
    { id: 'todo', name: '待办', color: TAG_COLORS[1] },
    { id: 'mood', name: '心情', color: TAG_COLORS[2] },
    { id: 'note', name: '备忘', color: TAG_COLORS[3] },
  ];

  // 每对颜色：起始色 → 结束色（都能和白色文字搭配）
  const PALETTE = [
    ['#ff6b9d', '#c9184a'],
    ['#8b7bff', '#4527a0'],
    ['#22d3ee', '#0e7490'],
    ['#ffa63d', '#c2410c'],
    ['#60a5fa', '#1d4ed8'],
    ['#4ade80', '#15803d'],
    ['#c084fc', '#6d28d9'],
    ['#f472b6', '#9333ea'],
    ['#2dd4bf', '#0f766e'],
    ['#fb7185', '#be123c'],
    ['#38bdf8', '#4338ca'],
    ['#a3e635', '#4d7c0f'],
  ];

  const SEED_LINES = [
    '你好呀 👋',
    '把想说的话打出来，它会按时间挂到这条线上',
    '下方 🕒 可以改成任意时间，补录以前的想法',
  ];

  /* ---------------- 元素 ---------------- */

  const scrollArea = document.getElementById('scrollArea');
  const timelineEl = document.getElementById('timeline');
  const nowMarkEl = document.getElementById('nowMark');
  const nowLabelEl = nowMarkEl ? nowMarkEl.querySelector('.nowmark__label') : null;
  const emptyEl = document.getElementById('empty');
  const emptyTitleEl = emptyEl ? emptyEl.querySelector('.empty__title') : null;
  const emptySubEl = emptyEl ? emptyEl.querySelector('.empty__sub') : null;
  const filterBar = document.getElementById('filterBar');
  const filterChipsEl = document.getElementById('filterChips');
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const searchHint = document.getElementById('searchHint');
  const jumpBtn = document.getElementById('jumpBtn');
  const composer = document.getElementById('composer');
  const composerBox = document.querySelector('.composer__box');
  const input = document.getElementById('input');
  const charsEl = document.getElementById('chars');
  const countEl = document.getElementById('count');
  const timeInput = document.getElementById('timeInput');
  const nowBtn = document.getElementById('nowBtn');
  const tagBar = document.getElementById('tagBar');
  const tagNoneBtn = document.getElementById('tagNone');
  const tagManageBtn = document.getElementById('tagManage');
  const tagSheet = document.getElementById('tagSheet');
  const tagSheetClose = document.getElementById('tagSheetClose');
  const tagListEl = document.getElementById('tagList');
  const tagAddForm = document.getElementById('tagAddForm');
  const tagAddInput = document.getElementById('tagAddInput');
  const tagAddBtn = document.getElementById('tagAddBtn');
  const tagStatusEl = document.getElementById('tagStatus');
  const clearBtn = document.getElementById('clearBtn');
  const themeBtn = document.getElementById('themeBtn');
  const themeIcon = document.getElementById('themeIcon');
  const saveStateEl = document.getElementById('saveState');
  const saveStateText = document.getElementById('saveStateText');
  const moreBtn = document.getElementById('moreBtn');
  const importFile = document.getElementById('importFile');

  /* ---------------- 容错工具 ---------------- */
  /*
    页面元素和脚本版本万一不一致（比如浏览器缓存了旧的 index.html），
    取不到元素时也不能让整页崩掉：能绑的先绑，缺的跳过，并且把错误显示出来。
  */

  function on(el, type, handler, opts) {
    if (!el || typeof el.addEventListener !== 'function') return null;
    el.addEventListener(type, handler, opts);
    return el;
  }

  function showErrorBanner(message) {
    try {
      let bar = document.getElementById('errorBar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'errorBar';
        bar.className = 'errorbar';
        document.body.appendChild(bar);
      }
      bar.textContent = '页面脚本出错了：' + message + '　请按 Ctrl + F5 强制刷新';
      bar.hidden = false;
    } catch (_) { /* 兜底不能再抛错 */ }
  }

  window.addEventListener('error', (e) => {
    showErrorBanner((e && e.message) || '未知错误');
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e && e.reason;
    showErrorBanner((reason && reason.message) || String(reason || '异步操作失败'));
  });

  /* ---------------- 工具 ---------------- */

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad2 = (n) => String(n).padStart(2, '0');
  const opposite = (side) => (side === 'left' ? 'right' : 'left');

  /** 按时间升序排列的全部记录 */
  const records = [];

  function formatTime(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function fullDateTime(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function dayLabel(ts) {
    const now = new Date();
    const d = new Date(ts);
    if (dayKey(ts) === dayKey(now.getTime())) return '今天';
    if (dayKey(ts) === dayKey(now.getTime() - 86400000)) return '昨天';
    const sameYear = d.getFullYear() === now.getFullYear();
    return (sameYear ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /* ---------------- 字号 / 最大宽度 ---------------- */

  function metricsFor(text) {
    const len = text.length;
    let fontSize;
    if (len <= 6) fontSize = 26;
    else if (len <= 14) fontSize = 21;
    else if (len <= 30) fontSize = 17;
    else if (len <= 70) fontSize = 15.5;
    else fontSize = 14.5;

    let maxWidth;
    if (len <= 6) maxWidth = 300;
    else if (len <= 14) maxWidth = 340;
    else if (len <= 70) maxWidth = 380;
    else maxWidth = 420;

    return { fontSize, maxWidth };
  }

  /* ---------------- 构建一个节点 ---------------- */

  function buildNode(rec) {
    const node = document.createElement('article');
    node.className = 'node node--' + rec.side;

    /* 线上的点 + 时间刻度 */
    const rail = document.createElement('div');
    rail.className = 'node__rail';

    const dot = document.createElement('span');
    dot.className = 'node__dot';
    dot.style.setProperty('--c1', rec.colors[0]);
    dot.style.setProperty('--c2', rec.colors[1]);

    const time = document.createElement('time');
    time.className = 'node__time';
    time.dateTime = new Date(rec.ts).toISOString();
    time.textContent = formatTime(rec.ts);
    time.title = fullDateTime(rec.ts);

    rail.append(dot, time);

    /* 气泡 */
    const content = document.createElement('div');
    content.className = 'node__content';

    const { fontSize, maxWidth } = metricsFor(rec.text);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.tabIndex = 0;
    bubble.style.setProperty('--c1', rec.colors[0]);
    bubble.style.setProperty('--c2', rec.colors[1]);
    bubble.style.setProperty('--rot', rec.rot.toFixed(2) + 'deg');
    bubble.style.setProperty('--fs', fontSize + 'px');
    bubble.style.setProperty('--max-w', maxWidth + 'px');
    bubble.title = fullDateTime(rec.ts);

    const inner = document.createElement('div');
    inner.className = 'bubble__inner';

    const row = document.createElement('div');
    row.className = 'bubble__row';

    const span = document.createElement('span');
    span.className = 'bubble__text';
    span.textContent = rec.text;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'bubble__del';
    del.textContent = '×';
    del.setAttribute('aria-label', '删除这条记录');
    del.title = '删除这条记录';

    row.append(span, del);
    inner.append(row);
    bubble.append(inner);
    content.append(bubble);
    node.append(rail, content);

    rec.el = node;
    rec.bubbleEl = bubble;
    rec.innerEl = inner;

    syncBubbleTag(rec);

    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecord(rec);
    });

    bubble.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeRecord(rec);
      }
    });

    rec.el = node;
    rec.bubbleEl = bubble;
    return node;
  }

  /* ---------------- 日期分隔 ---------------- */

  function buildDaybreak(ts) {
    const el = document.createElement('div');
    el.className = 'daybreak';
    const span = document.createElement('span');
    span.textContent = dayLabel(ts);
    el.append(span);
    return el;
  }

  /**
   * 重新铺一遍日期分隔。
   * 因为时间轴是上下翻转的（最新在最上），分隔条要插在「这一天的最后一条之后」，
   * 视觉上才会出现在这一组的上方，像正常的分组标题。
   */
  function syncDividers() {
    timelineEl.querySelectorAll('.daybreak').forEach((el) => el.remove());

    const list = visibleRecords();
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (!rec.el) continue;
      const next = list[i + 1];
      const isLastOfDay = !next || dayKey(next.ts) !== dayKey(rec.ts);
      if (isLastOfDay) rec.el.after(buildDaybreak(rec.ts));
    }
  }

  /* ---------------- 搜索（内容 / 日期） ---------------- */

  let searchRaw = '';    // 输入框里的原始内容
  let dateQuery = null;  // 识别成日期时：{ type: 'day'|'month', key, label }
  let searchText = '';   // 文本搜索词（小写）

  function monthKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1);
  }

  /**
   * 试着把输入理解成日期，认不出来就返回 null（当普通文字搜）。
   * 支持：2026-10-29 / 2026年10月29日 / 10-29 / 10月29日 / 今天 / 昨天 / 前天 / 10月 / 2026-10
   */
  function parseDateQuery(raw) {
    const q = raw.trim();
    if (!q) return null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 86400000;

    if (q === '今天' || q === '今日') return { type: 'day', key: dayKey(todayStart), label: '今天' };
    if (q === '昨天' || q === '昨日') return { type: 'day', key: dayKey(todayStart - DAY), label: '昨天' };
    if (q === '前天') return { type: 'day', key: dayKey(todayStart - 2 * DAY), label: '前天' };

    let m = q.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日号]?$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!Number.isNaN(d.getTime()) && d.getDate() === Number(m[3])) {
        return { type: 'day', key: dayKey(d.getTime()), label: (d.getMonth() + 1) + '月' + d.getDate() + '日' };
      }
    }

    m = q.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!Number.isNaN(d.getTime()) && d.getDate() === Number(m[3])) {
        return { type: 'day', key: dayKey(d.getTime()), label: (d.getMonth() + 1) + '月' + d.getDate() + '日' };
      }
    }

    m = q.match(/^(\d{1,2})[-/.月](\d{1,2})[日号]?$/);
    if (m) {
      const d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
      if (!Number.isNaN(d.getTime()) && d.getDate() === Number(m[2])) {
        return { type: 'day', key: dayKey(d.getTime()), label: (d.getMonth() + 1) + '月' + d.getDate() + '日' };
      }
    }

    m = q.match(/^(\d{4})[-/.年](\d{1,2})月?$/);
    if (m) {
      return { type: 'month', key: m[1] + '-' + Number(m[2]), label: m[1] + '年' + Number(m[2]) + '月' };
    }

    m = q.match(/^(\d{1,2})月份?$/);
    if (m) {
      return { type: 'month', key: now.getFullYear() + '-' + Number(m[1]), label: Number(m[1]) + '月' };
    }

    return null;
  }

  function matchesQuery(rec) {
    if (!searchRaw) return true;
    if (dateQuery) {
      if (dateQuery.type === 'day') return dayKey(rec.ts) === dateQuery.key;
      return monthKey(rec.ts) === dateQuery.key;
    }
    return rec.text.toLowerCase().indexOf(searchText) !== -1;
  }

  function applySearch(raw) {
    searchRaw = String(raw == null ? '' : raw).trim();
    dateQuery = searchRaw ? parseDateQuery(searchRaw) : null;
    searchText = dateQuery ? '' : searchRaw.toLowerCase();

    if (searchInput && searchInput.value.trim() !== searchRaw) searchInput.value = searchRaw;
    if (searchClear) searchClear.hidden = !searchRaw;

    refreshFilterView();
    scrollArea.scrollTop = 0;
  }

  /* ---------------- 按类型归类查看 ---------------- */

  const FILTER_NONE = '__none__'; // “无类型”这个筛选值
  let activeFilter = null;        // null = 全部；否则是 tagId 或 FILTER_NONE

  function matchesFilter(rec) {
    if (!activeFilter) return true;
    if (activeFilter === FILTER_NONE) return !rec.tag;
    return rec.tag === activeFilter;
  }

  function visibleRecords() {
    if (!activeFilter && !searchRaw) return records;
    return records.filter((rec) => matchesFilter(rec) && matchesQuery(rec));
  }

  function renderFilterBar() {
    if (!filterBar || !filterChipsEl) return;

    if (!records.length) {
      filterBar.hidden = true;
      filterChipsEl.textContent = '';
      if (searchHint) searchHint.textContent = '';
      return;
    }
    filterBar.hidden = false;
    filterChipsEl.textContent = '';

    // 计数按“搜索后的结果”统计，筛选时能看到每类还剩多少
    const base = searchRaw ? records.filter(matchesQuery) : records;

    if (searchHint) {
      if (!searchRaw) {
        searchHint.textContent = '';
      } else if (dateQuery) {
        searchHint.textContent = dateQuery.label + ' · ' + base.length + ' 条';
      } else {
        searchHint.textContent = '找到 ' + base.length + ' 条';
      }
    }

    const counts = new Map();
    let noneCount = 0;
    for (const rec of base) {
      if (!rec.tag) {
        noneCount += 1;
      } else {
        counts.set(rec.tag, (counts.get(rec.tag) || 0) + 1);
      }
    }

    const makeChip = (label, value, color, count) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-chip filter-chip';
      if (color) {
        btn.classList.add('filter-chip--tag');
        btn.style.setProperty('--tc', color);
      }
      btn.classList.toggle('is-active', (activeFilter || '') === (value || ''));
      btn.setAttribute('aria-pressed', String((activeFilter || '') === (value || '')));

      btn.append(document.createTextNode(label));

      const badge = document.createElement('i');
      badge.className = 'filter-chip__n';
      badge.textContent = String(count);
      btn.append(badge);

      on(btn, 'click', () => {
        setFilter((activeFilter || '') === (value || '') ? null : value);
      });
      return btn;
    };

    filterChipsEl.append(makeChip('全部', null, null, base.length));

    tags.forEach((tag) => {
      const count = counts.get(tag.id) || 0;
      if (count > 0) filterChipsEl.append(makeChip(tag.name, tag.id, tag.color, count));
    });

    if (noneCount > 0) {
      filterChipsEl.append(makeChip('无类型', FILTER_NONE, null, noneCount));
    }
  }

  /** 重新计算哪些气泡该显示（不滚动） */
  function refreshFilterView() {
    for (const rec of records) {
      if (rec.el) rec.el.classList.toggle('is-filtered-out', !matchesFilter(rec) || !matchesQuery(rec));
    }
    syncDividers();
    updateChrome();
    updateJump();
    scheduleNowMark();
  }

  /** 给当前可见的最新一条加上脉冲标记 */
  function markNewest() {
    const list = visibleRecords();
    for (const rec of records) {
      if (rec.el) rec.el.classList.remove('is-newest');
    }
    const newest = list[list.length - 1];
    if (newest && newest.el) newest.el.classList.add('is-newest');
  }

  function setFilter(value) {
    activeFilter = value || null;
    refreshFilterView();
    scrollArea.scrollTop = 0; // 切换后回到最新那条
  }

  /** 搜索和类型筛选一起复位 */
  function resetSearchAndFilter() {
    activeFilter = null;
    searchRaw = '';
    dateQuery = null;
    searchText = '';
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.hidden = true;
    refreshFilterView();
  }

  /* ---------------- 搜索框交互 ---------------- */

  let searchTimer = 0;

  on(searchInput, 'input', () => {
    if (searchClear) searchClear.hidden = !searchInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applySearch(searchInput.value), 130);
  });

  on(searchInput, 'keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);
      applySearch(searchInput.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearTimeout(searchTimer);
      applySearch('');
    }
  });

  on(searchClear, 'click', () => {
    applySearch('');
    if (searchInput) searchInput.focus();
  });

  /* ---------------- 类型标签 ---------------- */

  const tags = loadTags();   // 可自定义的类型列表
  let activeTagId = null;    // 下一条记录要用哪个类型（null = 无）
  let tagMenuEl = null;      // 气泡上换类型的浮层
  let sheetHighlightId = null; // 刚添加的类型，在管理面板里闪一下

  function loadTags() {
    const data = readJSON(TAG_KEY);
    if (data) {
      return data
        .filter((t) => t && typeof t.name === 'string' && t.name.trim())
        .slice(0, MAX_TAGS)
        .map((t, i) => ({
          id: (typeof t.id === 'string' && t.id) ? t.id : 'tag' + i + '-' + Date.now().toString(36),
          name: String(t.name).trim().slice(0, TAG_NAME_MAX),
          color: (typeof t.color === 'string' && t.color)
            ? t.color
            : TAG_COLORS[i % TAG_COLORS.length],
        }));
    }
    return DEFAULT_TAGS.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  }

  function saveTags() {
    try {
      localStorage.setItem(TAG_KEY, JSON.stringify(tags));
      setSaveState('ok', '已保存');
    } catch (_) {
      storageOK = false;
      setSaveState('off', '无法保存');
    }
  }

  function tagById(id) {
    if (!id) return null;
    return tags.find((t) => t.id === id) || null;
  }

  function newTagId() {
    return 'tag' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function nextTagColor() {
    return TAG_COLORS[tags.length % TAG_COLORS.length];
  }

  /** 把某条记录气泡上的标签画成最新状态（没有就移除） */
  function syncBubbleTag(rec) {
    if (!rec.innerEl) return;

    const old = rec.innerEl.querySelector('.bubble__tag');
    if (old) old.remove();

    const tag = tagById(rec.tag);
    if (!tag) return;

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bubble__tag';
    chip.style.setProperty('--tc', tag.color);
    chip.textContent = tag.name;
    chip.title = '点击更换类型';
    chip.setAttribute('aria-label', '类型：' + tag.name + '，点击更换');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openTagMenu(chip, rec);
    });

    rec.innerEl.insertBefore(chip, rec.innerEl.firstChild);
  }

  /** 输入框下方的类型选择条 */
  function renderTagBar() {
    if (!tagBar) return;
    tagBar.querySelectorAll('.tag-chip--tag').forEach((el) => el.remove());

    tags.forEach((tag) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-chip tag-chip--tag';
      btn.dataset.id = tag.id;
      btn.style.setProperty('--tc', tag.color);
      btn.textContent = tag.name;
      btn.addEventListener('click', () => {
        activeTagId = activeTagId === tag.id ? null : tag.id;
        updateTagBarActive();
      });
      tagBar.insertBefore(btn, tagManageBtn);
    });

    updateTagBarActive();
  }

  /** 只切换高亮，不重建节点（这样过渡动画不会丢） */
  function updateTagBarActive() {
    if (!tagBar) return;
    tagBar.querySelectorAll('.tag-chip--tag').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.id === activeTagId);
    });
    tagNoneBtn.classList.toggle('is-active', !activeTagId);
  }

  /* ---- 气泡上点标签 → 换类型浮层 ---- */

  function onMenuOutside(e) {
    if (tagMenuEl && !tagMenuEl.contains(e.target)) closeTagMenu();
  }

  function onMenuKey(e) {
    if (e.key === 'Escape') closeTagMenu();
  }

  function closeTagMenu() {
    if (!tagMenuEl) return;
    tagMenuEl.remove();
    tagMenuEl = null;
    document.removeEventListener('pointerdown', onMenuOutside, true);
    document.removeEventListener('keydown', onMenuKey, true);
    window.removeEventListener('scroll', closeTagMenu, true);
    window.removeEventListener('resize', closeTagMenu);
  }

  function openTagMenu(anchor, rec) {
    closeTagMenu();

    const menu = document.createElement('div');
    menu.className = 'tagmenu';
    menu.setAttribute('role', 'menu');

    const makeItem = (label, id, color) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tagmenu__item' + (id ? '' : ' tagmenu__item--none');
      item.setAttribute('role', 'menuitem');
      if ((rec.tag || null) === (id || null)) item.classList.add('is-current');

      const dot = document.createElement('span');
      dot.className = 'tagmenu__dot';
      if (color) dot.style.setProperty('--tc', color);

      const txt = document.createElement('span');
      txt.textContent = label;

      item.append(dot, txt);
      item.addEventListener('click', () => {
        rec.tag = id || null;
        syncBubbleTag(rec);
        schedulePersist();
        refreshFilterView(); // 换类型后可能不再属于当前筛选，得重新算一遍
        closeTagMenu();
      });
      return item;
    };

    menu.append(makeItem('无类型', null, null));

    if (tags.length) {
      const sep = document.createElement('div');
      sep.className = 'tagmenu__sep';
      menu.append(sep);
      tags.forEach((t) => menu.append(makeItem(t.name, t.id, t.color)));
    } else {
      const hint = document.createElement('div');
      hint.className = 'taglist__empty';
      hint.textContent = '还没有类型，点下方「＋类型」添加';
      menu.append(hint);
    }

    document.body.append(menu);
    tagMenuEl = menu;

    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const left = Math.min(Math.max(10, r.left), window.innerWidth - mw - 10);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 10) top = Math.max(10, r.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    document.addEventListener('pointerdown', onMenuOutside, true);
    document.addEventListener('keydown', onMenuKey, true);
    window.addEventListener('scroll', closeTagMenu, true);
    window.addEventListener('resize', closeTagMenu);
  }

  /* ---- 类型管理面板 ---- */

  function openTagSheet() {
    if (!tagSheet) return;
    tagSheet.hidden = false;
    tagAddInput.value = '';
    renderTagSheet();
  }

  function closeTagSheet() {
    if (!tagSheet) return;
    tagSheet.hidden = true;
  }

  function renderTagSheet() {
    if (!tagListEl) return;
    tagListEl.textContent = '';

    if (!tags.length) {
      const empty = document.createElement('div');
      empty.className = 'taglist__empty';
      empty.textContent = '还没有类型标签，在下面添加一个吧';
      tagListEl.append(empty);
    }

    tags.forEach((tag) => {
      const row = document.createElement('div');
      row.className = 'tagrow';
      if (sheetHighlightId && tag.id === sheetHighlightId) row.classList.add('is-new');

      const dot = document.createElement('span');
      dot.className = 'tagrow__dot';
      dot.style.setProperty('--tc', tag.color);

      const nameInput = document.createElement('input');
      nameInput.className = 'tagrow__name';
      nameInput.type = 'text';
      nameInput.maxLength = TAG_NAME_MAX;
      nameInput.value = tag.name;
      nameInput.setAttribute('aria-label', '类型名称');

      const commit = () => {
        const name = nameInput.value.trim().slice(0, TAG_NAME_MAX);
        if (!name || name === tag.name) {
          nameInput.value = tag.name;
          return;
        }
        if (tags.some((t) => t.id !== tag.id && t.name === name)) {
          nameInput.value = tag.name; // 重名就还原
          return;
        }
        tag.name = name;
        afterTagChange();
      };

      nameInput.addEventListener('blur', commit);
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          nameInput.blur();
        } else if (e.key === 'Escape') {
          nameInput.value = tag.name;
          nameInput.blur();
        }
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tagrow__del';
      del.textContent = '删除';

      let confirmTimer = 0;
      del.addEventListener('click', () => {
        if (!del.classList.contains('is-confirm')) {
          del.classList.add('is-confirm');
          del.textContent = '确认删除';
          clearTimeout(confirmTimer);
          confirmTimer = setTimeout(() => {
            del.classList.remove('is-confirm');
            del.textContent = '删除';
          }, 2600);
          return;
        }
        clearTimeout(confirmTimer);
        deleteTag(tag.id);
      });

      row.append(dot, nameInput, del);
      tagListEl.append(row);
    });
  }

  function deleteTag(id) {
    const i = tags.findIndex((t) => t.id === id);
    if (i < 0) return;

    tags.splice(i, 1);
    if (activeTagId === id) activeTagId = null;

    records.forEach((rec) => {
      if (rec.tag === id) rec.tag = null;
    });

    afterTagChange();
    schedulePersist();
  }

  /** 类型增删改之后：存盘 + 刷新选择条、管理面板、已有气泡上的标签、筛选条 */
  function afterTagChange() {
    saveTags();
    renderTagBar();
    renderTagSheet();
    records.forEach((rec) => syncBubbleTag(rec));

    // 正在筛选的类型被删掉了，就回到「全部」
    if (activeFilter && activeFilter !== FILTER_NONE && !tagById(activeFilter)) {
      activeFilter = null;
    }
    refreshFilterView();
  }

  on(tagNoneBtn, 'click', () => {
    activeTagId = null;
    updateTagBarActive();
  });

  on(tagManageBtn, 'click', openTagSheet);
  on(tagSheetClose, 'click', closeTagSheet);

  on(tagSheet, 'click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.close) closeTagSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tagSheet && !tagSheet.hidden) closeTagSheet();
  });

  on(tagAddForm, 'submit', (e) => {
    e.preventDefault();
    addTagFromInput();
  });

  // 直接挂在按钮上：即使某些环境不触发隐式提交，点击也一定能添加
  on(tagAddBtn, 'click', (e) => {
    e.preventDefault();
    addTagFromInput();
  });

  /** 添加类型的唯一入口，所有失败分支都会给出提示 */
  function addTagFromInput() {
    const name = tagAddInput.value.trim().replace(/\s+/g, ' ').slice(0, TAG_NAME_MAX);

    if (!name) {
      showTagStatus('先输入一个名字，再点添加', 'warn');
      tagAddInput.focus();
      return;
    }
    if (tags.length >= MAX_TAGS) {
      showTagStatus('最多 ' + MAX_TAGS + ' 个类型，先删掉一个再添加', 'warn');
      return;
    }
    if (tags.some((t) => t.name === name)) {
      showTagStatus('已经有「' + name + '」这个类型了', 'warn');
      tagAddInput.select();
      return;
    }

    const tag = { id: newTagId(), name, color: nextTagColor() };
    tags.push(tag);

    tagAddInput.value = '';
    activeTagId = tag.id;      // 新加的类型直接选中，发下一条就能用上
    sheetHighlightId = tag.id; // 让管理面板里新行闪一下

    afterTagChange();
    scrollTagIntoView(tag.id);
    showTagStatus('已添加「' + name + '」，已经帮你选上了', 'ok');

    // 状态条不打扰输入
    tagAddInput.focus({ preventScroll: true });
  }

  let tagStatusTimer = 0;

  function showTagStatus(text, kind) {
    if (!tagStatusEl) return;
    tagStatusEl.textContent = text;
    tagStatusEl.classList.toggle('is-ok', kind === 'ok');
    tagStatusEl.classList.toggle('is-warn', kind === 'warn');
    tagStatusEl.classList.add('is-shown');

    clearTimeout(tagStatusTimer);
    tagStatusTimer = setTimeout(() => {
      tagStatusEl.classList.remove('is-shown');
    }, 2600);
  }

  /** 让新加的类型在横向滚动的类型条里露出来 */
  function scrollTagIntoView(id) {
    if (!tagBar || !tagManageBtn) return;
    const chip = tagBar.querySelector('.tag-chip--tag[data-id="' + id + '"]');
    if (!chip) return;
    const barRect = tagBar.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const rightLimit = barRect.right - tagManageBtn.offsetWidth - 8;
    const overflowRight = chipRect.right - rightLimit;
    const overflowLeft = barRect.left - chipRect.left;

    if (overflowRight > 0) tagBar.scrollLeft += overflowRight;
    else if (overflowLeft > 0) tagBar.scrollLeft -= overflowLeft;
  }

  /* ---------------- 找到插入位置 ---------------- */

  function insertionIndex(ts) {
    let i = records.length;
    while (i > 0 && records[i - 1].ts > ts) i--;
    return i;
  }

  /* ---------------- 加入一条记录 ---------------- */

  function addRecord(opts) {
    const text = String(opts.text ?? '').trim();
    if (!text) return null;

    const ts = Number.isFinite(opts.ts) ? opts.ts : Date.now();
    const index = insertionIndex(ts);
    const prev = records[index - 1];
    const next = records[index];

    const rec = {
      text: text.slice(0, 300),
      colors: Array.isArray(opts.colors) && opts.colors.length === 2 ? opts.colors : pick(PALETTE),
      rot: Number.isFinite(opts.rot) ? opts.rot : rand(-1.1, 1.1),
      ts,
      tag: opts.tag && tagById(opts.tag) ? opts.tag : null,
      // 左右交错：优先和上一条相反，插在最前面时和后面那条相反
      side: opts.side === 'left' || opts.side === 'right'
        ? opts.side
        : (prev ? opposite(prev.side) : (next ? opposite(next.side) : 'right')),
    };

    const node = buildNode(rec);

    if (next) timelineEl.insertBefore(node, next.el);
    else timelineEl.append(node);

    records.splice(index, 0, rec);

    syncDividers();
    updateChrome();
    schedulePersist();

    return rec;
  }

  /* ---------------- 删除 ---------------- */

  function removeRecord(rec) {
    if (!rec || rec.removing) return;
    rec.removing = true;

    const i = records.indexOf(rec);
    if (i >= 0) records.splice(i, 1);

    // 先把日期分隔重排好（只按还活着的记录算），再让气泡自己消失
    syncDividers();

    const node = rec.el;
    if (node) {
      node.classList.add('is-popping');

      const finalize = () => {
        if (node.isConnected) node.remove();
        syncDividers(); // 真正移除后再算一遍，避免残留分隔
      };

      node.addEventListener('animationend', finalize, { once: true });
      setTimeout(finalize, 460);
    }

    updateChrome();
    schedulePersist();
  }

  /* ---------------- 滚动 ---------------- */
  /* 时间轴是上下翻转的：最新（现在）在上，越往下越旧 */

  function revealLatest(behavior = 'smooth') {
    const go = () => {
      scrollArea.scrollTo({ top: 0, behavior });
      updateJump();
    };
    if (behavior === 'smooth') {
      requestAnimationFrame(go);
    } else {
      scrollArea.scrollTop = 0;
      updateJump();
    }
  }

  /** 把某条记录滚到视野中间（补录旧时间时用） */
  function revealRecord(rec, behavior = 'smooth') {
    if (!rec || !rec.el || !rec.el.isConnected) return;
    requestAnimationFrame(() => {
      const box = scrollArea.getBoundingClientRect();
      const r = rec.el.getBoundingClientRect();
      const target = scrollArea.scrollTop + (r.top - box.top) - (scrollArea.clientHeight - r.height) / 2;
      scrollArea.scrollTo({ top: Math.max(0, target), behavior });
    });
  }

  /** 最新那条（在当前筛选下）是否还在视野里 */
  function atLatest() {
    const list = visibleRecords();
    const newest = list[list.length - 1];
    if (!newest || !newest.el) return true;
    const box = scrollArea.getBoundingClientRect();
    const r = newest.el.getBoundingClientRect();
    return r.top >= box.top - 4;
  }

  function updateJump() {
    if (!jumpBtn) return;
    jumpBtn.classList.toggle('is-shown', visibleRecords().length > 0 && !atLatest());
  }

  // 滚动时同步刷新按钮状态（只是切一个 class，开销可以忽略）
  on(scrollArea, 'scroll', updateJump, { passive: true });

  on(jumpBtn, 'click', () => revealLatest('smooth'));

  /* ---------------- “现在”标记 ---------------- */
  /*
    翻转后的时间轴：越靠上越新。所以“现在”的位置永远在最上面那条的上方，
    并且随着时间流逝越走越高（离最近一次记录越来越远），封顶后停住；
    新增一条记录时它会被“拉回”到新记录旁边。
    如果用户补录了未来时间，“现在”则会落在两条记录之间的对应位置。
  */

  const NOW_MIN_DRIFT = 34;   // 哪怕“现在”和最新记录同一时刻，也要拉开一点距离
  const NOW_MAX_DRIFT = 96;   // 最多再往上飘多少 px
  const NOW_REF_GAP = 120000; // 2 分钟：用来把时间差距映射成视觉距离

  function driftFor(gapMs) {
    const ratio = Math.min(1, Math.log1p(Math.max(0, gapMs) / NOW_REF_GAP) / Math.log1p(28));
    return NOW_MIN_DRIFT + (NOW_MAX_DRIFT - NOW_MIN_DRIFT) * ratio;
  }

  /** 节点中心相对 timeline 顶部的距离 */
  function centerY(el) {
    const r = el.getBoundingClientRect();
    const t = timelineEl.getBoundingClientRect();
    return r.top + r.height / 2 - t.top;
  }

  function updateNowMark() {
    if (!nowMarkEl) return;

    const list = visibleRecords();
    if (!list.length) {
      nowMarkEl.classList.remove('is-shown');
      return;
    }

    const now = Date.now();
    const newest = list[list.length - 1];
    const oldest = list[0];
    const dayMarks = Array.from(timelineEl.querySelectorAll('.daybreak'));
    let y;

    if (now >= newest.ts) {
      // 常规情况：在所有记录之后，飘在最新那条上方。
      // 如果它上面紧挨着一条日期标签，就锚到标签上方，别和标签叠在一起。
      let anchor = centerY(newest.el);
      for (const mark of dayMarks) {
        const mc = centerY(mark);
        if (mc < anchor - 4 && anchor - mc < 110) anchor = mc;
      }
      y = anchor - driftFor(now - newest.ts) - 6;
    } else if (now <= oldest.ts) {
      // 全部都是“未来”的记录：现在落在最老那条下方
      y = centerY(oldest.el) + driftFor(oldest.ts - now);
    } else {
      // 落在两条记录之间（补录了未来时间）：按时间比例插值
      let i = 0;
      for (let k = 0; k < list.length - 1; k++) {
        if (list[k].ts <= now && now < list[k + 1].ts) {
          i = k;
          break;
        }
      }
      const olderRec = list[i];
      const newerRec = list[i + 1];
      const yOlder = centerY(olderRec.el);
      const yNewer = centerY(newerRec.el);
      const t = (now - olderRec.ts) / Math.max(1, newerRec.ts - olderRec.ts);
      y = yOlder + (yNewer - yOlder) * t;
    }

    // 兜底：不管落在哪，都不要和日期标签挤在一起
    for (const mark of dayMarks) {
      const mc = centerY(mark);
      if (Math.abs(mc - y) < 24) {
        y = mc - 28;
        break;
      }
    }

    nowMarkEl.style.setProperty('--y', Math.max(10, y).toFixed(1) + 'px');
    nowMarkEl.classList.add('is-shown');

    const label = '现在 ' + formatTime(now);
    if (nowLabelEl && nowLabelEl.textContent !== label) nowLabelEl.textContent = label;
  }

  // 每秒兜底刷新：滚动位置和“现在”位置即便没有滚动事件也能跟上
  setInterval(() => {
    updateNowMark();
    updateJump();
  }, 1000);

  // 增删记录后短暂合并刷新，避免批量恢复时反复测量
  let nowTimer = 0;
  function scheduleNowMark() {
    clearTimeout(nowTimer);
    nowTimer = setTimeout(updateNowMark, 60);
  }

  /* ---------------- 顶部计数 / 空状态 ---------------- */

  function updateChrome() {
    const total = records.length;
    const shown = visibleRecords().length;
    const changed = countEl.textContent !== String(total);

    countEl.textContent = String(total);
    timelineEl.classList.toggle('is-empty', shown === 0);

    // 空状态分三种：一条都没有 / 搜索没结果 / 筛选下没有
    if (shown === 0) {
      let title = '说一句话，它会按时间挂到这条线上 ✨';
      let sub = '选个类型和时间再发送 · Enter 发送 · Shift + Enter 换行 · 内容多了可以上下滑动';

      if (total > 0 && searchRaw) {
        title = dateQuery ? '这一天没有记录' : '没有找到匹配的内容';
        sub = dateQuery
          ? '换一个日期试试，或者清空搜索框看全部'
          : '换个关键词试试，或者清空搜索框看全部';
      } else if (total > 0) {
        title = '这个类型下还没有内容';
        sub = '点上方「全部」就能看到所有记录';
      }

      if (emptyTitleEl) emptyTitleEl.textContent = title;
      if (emptySubEl) emptySubEl.textContent = sub;
      emptyEl.classList.remove('is-hidden');
    } else {
      emptyEl.classList.add('is-hidden');
    }

    if (changed) {
      countEl.classList.add('is-bump');
      clearTimeout(updateChrome._t);
      updateChrome._t = setTimeout(() => countEl.classList.remove('is-bump'), 320);
    }

    renderFilterBar();
    markNewest();
    scheduleNowMark();
  }

  /* ---------------- 本地存储 ---------------- */

  let persistTimer = 0;
  let storageOK = true;
  let flashUntil = 0;   // 顶栏提示文字的保护期（导出/导入的提示不要被“已保存”顶掉）

  /** 探一下这台浏览器到底能不能写本地存储（file:// 下有些浏览器会直接禁止） */
  function probeStorage() {
    try {
      const key = '__bubble_probe__';
      localStorage.setItem(key, '1');
      const ok = localStorage.getItem(key) === '1';
      localStorage.removeItem(key);
      return ok;
    } catch (_) {
      return false;
    }
  }

  /** 顶栏那个小圆点：绿色=已保存，黄色=这台浏览器不让存 */
  function setSaveState(kind, text) {
    if (!saveStateEl || !saveStateText) return;
    const off = kind === 'off';
    saveStateEl.classList.toggle('is-off', off);

    // 有临时提示（已导出/已导入）正在显示时，不要被普通的“已保存”顶掉
    if (typeof text === 'string' && (off || Date.now() > flashUntil)) {
      saveStateText.textContent = text;
    }

    saveStateEl.classList.remove('is-flash');
    void saveStateEl.offsetWidth;
    saveStateEl.classList.add('is-flash');
    clearTimeout(setSaveState._t);
    setSaveState._t = setTimeout(() => saveStateEl.classList.remove('is-flash'), 520);

    if (off) {
      saveStateEl.title = '这台浏览器不允许本页面自动保存，请用右侧「⋯」导出备份';
    } else {
      const d = new Date();
      saveStateEl.title = '已保存在本机浏览器 · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) +
        '（换浏览器或清理上网数据会丢失，可用「⋯」导出备份）';
    }
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 200);
  }

  function persist() {
    clearTimeout(persistTimer);

    try {
      const data = records.slice(-MAX_STORED).map((r) => ({
        t: r.text,
        c: r.colors,
        ts: r.ts,
        s: r.side,
        r: +r.rot.toFixed(2),
        tg: r.tag || null,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      storageOK = true;
      setSaveState('ok', '已保存');
    } catch (_) {
      storageOK = false;
      setSaveState('off', '无法保存');
    }
  }

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    } catch (_) {
      return null;
    }
  }

  function loadStored() {
    // 只要时间轴自己的键存在（哪怕是空数组），就不再从旧版迁移
    const data = readJSON(STORAGE_KEY);
    if (data) return data;

    // 从旧的“气泡墙”版本迁移：保留文字，按顺序补上时间
    const legacy = readJSON(LEGACY_KEY);
    if (legacy && legacy.length) {
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch (_) { /* 忽略 */ }

      const now = Date.now();
      return legacy
        .slice(-MAX_STORED)
        .map((item, i, arr) => ({
          t: item && item.t,
          c: item && item.c,
          ts: now - (arr.length - i) * 90000,
        }))
        .filter((item) => item.t);
    }
    return null;
  }

  /* ---------------- 备份与恢复（导出一份文件，永远丢不了） ---------------- */

  function exportBackup() {
    persist(); // 先确保最新的已经落盘

    const payload = {
      app: 'bubble-timeline',
      v: 2,
      exportedAt: new Date().toISOString(),
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      records: records.map((r) => ({
        t: r.text,
        c: r.colors,
        ts: r.ts,
        s: r.side,
        r: +r.rot.toFixed(2),
        tg: r.tag || null,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const a = document.createElement('a');
    a.href = url;
    a.download = '时间备忘录备份-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    flashSaveState('已导出 ' + records.length + ' 条');
  }

  function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => {
      let added = 0;
      try {
        added = importData(JSON.parse(String(reader.result)));
      } catch (_) {
        flashSaveState('导入失败：文件读不出来');
        return;
      }
      flashSaveState(added > 0 ? '已导入 ' + added + ' 条' : '没有新的内容可导入');
    };

    reader.onerror = () => flashSaveState('导入失败：文件读不出来');
    reader.readAsText(file);
  }

  /** 合并导入：同时间同内容视为重复，直接跳过；类型按名字对应 */
  function importData(data) {
    if (!data || typeof data !== 'object') throw new Error('bad file');

    const incomingTags = Array.isArray(data.tags) ? data.tags : [];
    const incomingRecords = Array.isArray(data.records) ? data.records : [];
    const idMap = new Map();

    incomingTags.forEach((t) => {
      if (!t || typeof t.name !== 'string' || !t.name.trim()) return;
      const name = t.name.trim().slice(0, TAG_NAME_MAX);
      const existing = tags.find((x) => x.name === name);

      if (existing) {
        if (t.id) idMap.set(t.id, existing.id);
        return;
      }
      if (tags.length >= MAX_TAGS) return;

      const created = {
        id: newTagId(),
        name,
        color: (typeof t.color === 'string' && t.color) ? t.color : nextTagColor(),
      };
      tags.push(created);
      if (t.id) idMap.set(t.id, created.id);
    });

    let added = 0;

    incomingRecords.forEach((item) => {
      if (!item) return;
      const raw = typeof item.t === 'string' ? item.t : (typeof item.text === 'string' ? item.text : '');
      const text = raw.trim().slice(0, 300);
      const ts = Number(item.ts);
      if (!text || !Number.isFinite(ts)) return;
      if (records.some((r) => r.ts === ts && r.text === text)) return; // 已存在

      let tag = null;
      if (item.tg) tag = idMap.get(item.tg) || (tagById(item.tg) ? item.tg : null);

      addRecord({
        text,
        ts,
        colors: Array.isArray(item.c) && item.c.length === 2 ? item.c : undefined,
        side: item.s,
        rot: Number(item.r),
        tag,
      });
      added++;
    });

    if (added || incomingTags.length) {
      saveTags();
      renderTagBar();
      renderTagSheet();
      if (added) revealLatest('auto');
      schedulePersist();
    }

    return added;
  }

  function flashSaveState(text) {
    if (!saveStateEl || !saveStateText) return;
    flashUntil = Date.now() + 2600;
    saveStateText.textContent = text;
    saveStateEl.classList.remove('is-flash');
    void saveStateEl.offsetWidth;
    saveStateEl.classList.add('is-flash');

    clearTimeout(flashSaveState._t);
    flashSaveState._t = setTimeout(() => {
      saveStateText.textContent = storageOK ? '已保存' : '无法保存';
    }, 2600);
  }

  /** 顶栏「⋯」菜单：导出 / 导入 */
  function openSaveMenu() {
    closeTagMenu();

    const menu = document.createElement('div');
    menu.className = 'tagmenu';
    menu.setAttribute('role', 'menu');

    const makeItem = (label, onClick) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tagmenu__item';
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.addEventListener('click', () => {
        closeTagMenu();
        onClick();
      });
      return item;
    };

    menu.append(
      makeItem('导出备份（.json 文件）', exportBackup),
      makeItem('导入备份（选择文件）', () => importFile.click())
    );

    if (!storageOK) {
      const hint = document.createElement('div');
      hint.className = 'taglist__empty';
      hint.textContent = '这台浏览器不允许本页面自动保存，建议定期导出备份';
      menu.append(hint);
    }

    document.body.append(menu);
    tagMenuEl = menu;

    const r = moreBtn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const left = Math.min(Math.max(10, r.right - mw), window.innerWidth - mw - 10);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 10) top = Math.max(10, r.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    document.addEventListener('pointerdown', onMenuOutside, true);
    document.addEventListener('keydown', onMenuKey, true);
    window.addEventListener('scroll', closeTagMenu, true);
    window.addEventListener('resize', closeTagMenu);
  }

  on(moreBtn, 'click', openSaveMenu);
  on(saveStateEl, 'click', openSaveMenu);

  on(importFile, 'change', () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = ''; // 允许重复选同一个文件
    importBackupFile(file);
  });

  // 关页面前把没落盘的改动立刻写掉（防抖里可能还压着最后一次修改）
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });

  /* ---------------- 时间选择器 ---------------- */

  let timeMode = 'now'; // 'now' 跟随当前时间 | 'custom' 用户指定

  function toInputValue(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function parseInputValue(value) {
    if (!value) return null;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  /** 把控件状态画出来：跟随现在 = 灰；用户指定 = 高亮 */
  function renderTimeField() {
    if (!timeInput || !nowBtn) return;
    if (timeMode === 'now') {
      timeInput.value = toInputValue(Date.now());
      timeInput.classList.remove('is-custom');
      nowBtn.classList.add('is-active');
      timeInput.title = '默认跟随当前时间，点开可以改成任意时间';
    } else {
      timeInput.classList.add('is-custom');
      nowBtn.classList.remove('is-active');
      timeInput.title = '这条气泡会挂在你指定的时间上';
    }
  }

  function setTimeMode(mode) {
    timeMode = mode;
    renderTimeField();
  }

  /** 本次要用的时间戳：自定义有效就用自定义，否则用现在 */
  function currentTimestamp() {
    if (timeMode === 'custom') {
      const ts = parseInputValue(timeInput.value);
      if (ts !== null) return ts;
    }
    return Date.now();
  }

  on(timeInput, 'change', () => {
    setTimeMode(timeInput.value ? 'custom' : 'now');
  });

  on(timeInput, 'input', () => {
    if (timeInput.value) setTimeMode('custom');
  });

  on(nowBtn, 'click', () => {
    setTimeMode('now');
    timeInput.blur();
  });

  // 跟随模式：定时把控件刷新成“现在”，用户正在操作时不打扰
  setInterval(() => {
    if (timeMode === 'now' && document.activeElement !== timeInput) renderTimeField();
  }, 20000);

  window.addEventListener('focus', () => {
    if (timeMode === 'now' && document.activeElement !== timeInput) renderTimeField();
    scheduleNowMark();
  });

  /* ---------------- 发送 ---------------- */

  function submitInput() {
    const value = input.value.trim();

    if (!value) {
      input.focus();
      composerBox.classList.remove('is-nudge');
      void composerBox.offsetWidth; // 强制重排，让抖动动画可以重复播放
      composerBox.classList.add('is-nudge');
      return;
    }

    const ts = currentTimestamp();
    const last = records[records.length - 1];
    const becomesNewest = !last || ts >= last.ts;

    const rec = addRecord({ text: value, ts, tag: activeTagId });

    input.value = '';
    autosize();
    input.focus();

    if (!rec) return;

    // 新内容和当前的搜索/筛选对不上时，自动复位，不然发出去看不到
    if (!matchesFilter(rec) || !matchesQuery(rec)) {
      resetSearchAndFilter();
    }

    if (becomesNewest) revealLatest('smooth');
    else revealRecord(rec, 'smooth'); // 补录旧时间：滚到它所在的位置
  }

  /* ---------------- 清空 ---------------- */

  function clearAll() {
    if (!records.length) return;
    const list = records.slice();
    resetSearchAndFilter(); // 清空后搜索和筛选一起复位
    list.forEach((rec, i) => {
      setTimeout(() => removeRecord(rec), Math.min(i * 40, 600));
    });
    setTimeout(() => {
      timelineEl.querySelectorAll('.daybreak').forEach((el) => el.remove());
    }, 700);
  }

  /* ---------------- 主题 ---------------- */

  function applyTheme(dark) {
    document.body.classList.toggle('theme-light', !dark);
    themeIcon.textContent = dark ? '🌙' : '☀️';
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#05070f' : '#eef3fc');
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch (_) { /* 忽略 */ }
  }

  function initTheme() {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (_) { /* 忽略 */ }

    let dark = true;
    if (stored === 'dark' || stored === 'light') {
      dark = stored === 'dark';
    } else if (window.matchMedia) {
      dark = !window.matchMedia('(prefers-color-scheme: light)').matches;
    }
    applyTheme(dark);
  }

  /* ---------------- 输入区 ---------------- */

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 148) + 'px';
    charsEl.textContent = String(input.value.length);
    updateJump();
  }

  on(input, 'input', autosize);

  on(input, 'keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) return; // 中文输入法选词中
    if (e.shiftKey) return; // 换行
    e.preventDefault();
    submitInput();
  });

  on(composer, 'submit', (e) => {
    e.preventDefault();
    submitInput();
  });

  on(clearBtn, 'click', clearAll);

  on(themeBtn, 'click', () => {
    applyTheme(document.body.classList.contains('theme-light'));
  });

  window.addEventListener('resize', () => {
    updateJump();
    scheduleNowMark();
  });

  /* ---------------- 启动 ---------------- */

  function boot() {
    initTheme();
    autosize();
    renderTimeField();
    renderTagBar();

    // 先确认这台浏览器能不能存，能不能存要让用户看得见
    storageOK = probeStorage();
    if (!storageOK) {
      setSaveState('off', '无法保存');
    } else if (saveStateEl && saveStateText) {
      saveStateEl.classList.remove('is-off', 'is-flash');
      saveStateText.textContent = '已保存';
      saveStateEl.title = '数据保存在本机浏览器里（换浏览器或清理上网数据会丢失，可用「⋯」导出备份）';
    }

    const stored = loadStored();

    if (stored && stored.length) {
      const items = stored
        .map((item, i) => ({
          text: item && item.t,
          colors: item && item.c,
          ts: item && Number.isFinite(Number(item.ts)) ? Number(item.ts) : Date.now() + i,
          side: item && item.s,
          rot: item && Number(item.r),
          tag: item && item.tg,
        }))
        .filter((item) => item.text && String(item.text).trim())
        .sort((a, b) => a.ts - b.ts);

      items.forEach((item) => addRecord(item));
      revealLatest('auto');
    } else {
      // 第一次来：放三条示例，时间错开几分钟，一眼就能看出这是时间轴
      let seen = false;
      try {
        seen = localStorage.getItem(SEEN_KEY) === '1';
      } catch (_) { /* 忽略 */ }

      if (!seen) {
        try {
          localStorage.setItem(SEEN_KEY, '1');
        } catch (_) { /* 忽略 */ }

        const now = Date.now();
        SEED_LINES.forEach((text, i) => {
          addRecord({ text, ts: now - (SEED_LINES.length - i) * 130000 });
        });
        revealLatest('auto');
      }
    }

    updateChrome();
    updateJump();

    // 桌面端直接把光标放进输入框；触屏设备不自动聚焦，免得一进页面就弹键盘
    if (!window.matchMedia || window.matchMedia('(hover: hover)').matches) {
      input.focus({ preventScroll: true });
    }
  }

  try {
    boot();
  } catch (err) {
    showErrorBanner(err && err.message ? err.message : String(err));
  }
})();
