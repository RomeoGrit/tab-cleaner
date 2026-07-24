let allTabs = [];
let currentSort = 'domain';
let currentGroupMode = 'domain';
let collapsedDomains = new Set();
let searchQuery = '';

const TIME_BUCKETS = [
  { id: '1h', label: 'Per paskutinę valandą' },
  { id: '1-4h', label: 'Prieš 1–4 val.' },
  { id: '4-8h', label: 'Prieš 4–8 val.' },
  { id: 'today', label: 'Šiandien' },
  { id: 'yesterday', label: 'Vakar' },
  { id: 'week', label: 'Šią savaitę' },
  { id: 'older', label: 'Seniau' },
];
const TIME_BUCKET_ORDER = Object.fromEntries(TIME_BUCKETS.map((b, i) => [b.id, i]));
const TIME_BUCKET_LABELS = Object.fromEntries(TIME_BUCKETS.map(b => [b.id, b.label]));

document.addEventListener('DOMContentLoaded', () => {
  loadTabs();
  document.getElementById('btn-refresh').addEventListener('click', loadTabs);
  document.getElementById('btn-close-all').addEventListener('click', closeAllTabs);
  document.getElementById('btn-sort').addEventListener('click', toggleSortOptions);
  document.getElementById('btn-group').addEventListener('click', toggleGroupOptions);
  document.getElementById('btn-collapse').addEventListener('click', toggleAllCollapsed);
  document.getElementById('search').addEventListener('input', onSearch);

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sort-options').classList.add('hidden');
      renderTabs();
    });
  });

  document.querySelectorAll('[data-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentGroupMode = btn.dataset.group;
      document.querySelectorAll('[data-group]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('group-options').classList.add('hidden');
      collapsedDomains.clear();
      renderTabs();
      updateBadges();
    });
  });

  chrome.tabs.onCreated.addListener(loadTabs);
  chrome.tabs.onUpdated.addListener(loadTabs);
  chrome.tabs.onRemoved.addListener(loadTabs);
  chrome.tabs.onAttached.addListener(loadTabs);
});

async function loadTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    allTabs = tabs.filter(t => !t.pinned);
    updateBadges();
    renderTabs();
  } catch (e) {
    console.error('Failed to load tabs:', e);
  }
}

function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome:' || u.protocol === 'chrome-extension:' || u.protocol === 'about:' || u.protocol === 'edge:') {
      return 'Sistemos';
    }
    return u.hostname || 'Kita';
  } catch {
    return 'Kita';
  }
}

function getFaviconUrl(tab, size) {
  const fallback = '';
  if (tab.favIconUrl && tab.favIconUrl.startsWith('data:')) return tab.favIconUrl;
  if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) return tab.favIconUrl;
  try {
    const u = new URL(tab.url);
    if (u.protocol.startsWith('http')) {
      return `https://www.google.com/s2/favicons?sz=${size || 16}&domain=${u.hostname}`;
    }
  } catch {}
  return fallback;
}

function getTimeBucket(ts) {
  if (!ts) return 'older';
  const now = Date.now();
  const age = now - ts;
  if (age <= 3600000) return '1h';
  if (age <= 4 * 3600000) return '1-4h';
  if (age <= 8 * 3600000) return '4-8h';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tabDate = new Date(ts);
  tabDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((today.getTime() - tabDate.getTime()) / 86400000);
  if (dayDiff <= 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff <= 7) return 'week';
  return 'older';
}

function getGroupKey(tab) {
  if (currentGroupMode === 'time') return getTimeBucket(tab.lastAccessed);
  return getDomain(tab.url);
}

function groupTabs(tabs) {
  const groups = {};
  for (const tab of tabs) {
    const key = getGroupKey(tab);
    if (!groups[key]) groups[key] = [];
    groups[key].push(tab);
  }
  return groups;
}

function getGroupLabel(key) {
  if (currentGroupMode === 'time') return TIME_BUCKET_LABELS[key] || 'Kita';
  return key;
}

function sortGroups(groups) {
  const entries = Object.entries(groups);
  if (currentGroupMode === 'time') {
    entries.sort((a, b) => (TIME_BUCKET_ORDER[a[0]] ?? 99) - (TIME_BUCKET_ORDER[b[0]] ?? 99));
  } else if (currentSort === 'domain') {
    entries.sort((a, b) => a[0].localeCompare(b[0], 'lt', { sensitivity: 'base' }));
  } else if (currentSort === 'count') {
    entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'lt'));
  } else if (currentSort === 'recent') {
    entries.sort((a, b) => {
      const aLast = Math.max(...a[1].map(t => t.lastAccessedMs || 0));
      const bLast = Math.max(...b[1].map(t => t.lastAccessedMs || 0));
      return bLast - aLast;
    });
  }
  // sort tabs inside each group by recent first
  for (const [, tabs] of entries) {
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  }
  return entries;
}

function filterTabs(tabs) {
  if (!searchQuery) return tabs;
  const q = searchQuery.toLowerCase();
  return tabs.filter(t => {
    const title = (t.title || '').toLowerCase();
    const url = (t.url || '').toLowerCase();
    const domain = getDomain(t.url).toLowerCase();
    return title.includes(q) || url.includes(q) || domain.includes(q);
  });
}

function renderTabs() {
  const container = document.getElementById('groups-list');
  const emptyState = document.getElementById('empty-state');
  const noResults = document.getElementById('no-results');

  const filtered = filterTabs(allTabs);

  if (allTabs.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    noResults.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  if (filtered.length === 0) {
    container.innerHTML = '';
    noResults.classList.remove('hidden');
    return;
  }

  noResults.classList.add('hidden');

  const groups = groupTabs(filtered);
  const sorted = sortGroups(groups);

  container.innerHTML = sorted.map(([key, tabs]) => {
    const isCollapsed = collapsedDomains.has(key);
    const label = getGroupLabel(key);
    let faviconHtml;
    if (currentGroupMode === 'time') {
      faviconHtml = `<span class="domain-favicon time-icon">🕒</span>`;
    } else {
      const favicon = tabs[0] ? getFaviconUrl(tabs[0], 16) : '';
      faviconHtml = favicon
        ? `<img class="domain-favicon" src="${escapeAttr(favicon)}" alt="" onerror="this.style.display='none'">`
        : `<span class="domain-favicon"></span>`;
    }
    return `
      <div class="domain-group${isCollapsed ? ' collapsed' : ''}" data-group-key="${escapeAttr(key)}">
        <div class="domain-header" data-group-key="${escapeAttr(key)}">
          <span class="chevron">▼</span>
          ${faviconHtml}
          <span class="domain-name">${escapeHtml(label)}</span>
          <span class="domain-count">${tabs.length}</span>
          <button class="btn-close-domain" data-group-key="${escapeAttr(key)}" title="Uždaryti visus „${escapeAttr(label)}“ tabus">✕</button>
        </div>
        <div class="domain-tabs">
          ${tabs.map(tab => renderTab(tab)).join('')}
        </div>
      </div>
    `;
  }).join('');

  attachRowEvents();
}

function renderTab(tab) {
  const favicon = getFaviconUrl(tab, 16);
  const isActive = tab.active;
  return `
    <div class="tab-row${isActive ? ' active' : ''}" data-tab-id="${tab.id}" title="${escapeAttr(tab.url || '')}">
      ${favicon ? `<img class="tab-favicon" src="${escapeAttr(favicon)}" alt="" onerror="this.style.display='none'">` : `<span class="tab-favicon"></span>`}
      <span class="tab-title">${escapeHtml(tab.title || tab.url || 'Be pavadinimo')}</span>
      <button class="btn-close-tab" data-tab-id="${tab.id}" title="Uždaryti tabą">✕</button>
    </div>
  `;
}

function attachRowEvents() {
  document.querySelectorAll('.domain-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-close-domain')) return;
      const key = header.dataset.groupKey;
      toggleDomain(key);
    });
  });

  document.querySelectorAll('.btn-close-domain').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeGroup(btn.dataset.groupKey);
    });
  });

  document.querySelectorAll('.tab-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-close-tab')) return;
      const tabId = parseInt(row.dataset.tabId, 10);
      chrome.tabs.update(tabId, { active: true });
      const tab = allTabs.find(t => t.id === tabId);
      if (tab && tab.windowId !== undefined) {
        chrome.windows.update(tab.windowId, { focused: true });
      }
      window.close();
    });
  });

  document.querySelectorAll('.btn-close-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(parseInt(btn.dataset.tabId, 10));
    });
  });
}

function toggleDomain(key) {
  if (collapsedDomains.has(key)) {
    collapsedDomains.delete(key);
  } else {
    collapsedDomains.add(key);
  }
  renderTabs();
}

function toggleAllCollapsed() {
  const groups = groupTabs(filterTabs(allTabs));
  const allCollapsed = Object.keys(groups).every(k => collapsedDomains.has(k));
  if (allCollapsed) {
    Object.keys(groups).forEach(k => collapsedDomains.delete(k));
  } else {
    Object.keys(groups).forEach(k => collapsedDomains.add(k));
  }
  renderTabs();
}

async function closeTab(tabId) {
  await chrome.tabs.remove(tabId);
}

async function closeGroup(key) {
  const tabs = allTabs.filter(t => getGroupKey(t) === key);
  const ids = tabs.map(t => t.id);
  if (ids.length === 0) return;
  await chrome.tabs.remove(ids);
}

async function closeAllTabs() {
  if (allTabs.length === 0) return;
  const ids = allTabs.map(t => t.id);
  await chrome.tabs.remove(ids);
}

function onSearch(e) {
  searchQuery = e.target.value.trim();
  renderTabs();
}

function toggleSortOptions() {
  document.getElementById('sort-options').classList.toggle('hidden');
}

function toggleGroupOptions() {
  document.getElementById('group-options').classList.toggle('hidden');
}

function updateBadges() {
  document.getElementById('tab-count').textContent = allTabs.length;
  const groups = groupTabs(allTabs);
  const count = Object.keys(groups).length;
  if (currentGroupMode === 'time') {
    document.getElementById('domain-count').textContent = `${count} grup${count === 1 ? 'ė' : 'ių'}`;
  } else {
    document.getElementById('domain-count').textContent = `${count} domen${count === 1 ? 'as' : 'ų'}`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}
