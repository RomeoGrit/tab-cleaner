let allTabs = [];
let currentSort = 'domain';
let collapsedDomains = new Set();
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  loadTabs();
  document.getElementById('btn-refresh').addEventListener('click', loadTabs);
  document.getElementById('btn-close-all').addEventListener('click', closeAllTabs);
  document.getElementById('btn-sort').addEventListener('click', toggleSortOptions);
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

function groupTabsByDomain(tabs) {
  const groups = {};
  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(tab);
  }
  return groups;
}

function sortGroups(groups) {
  const entries = Object.entries(groups);
  if (currentSort === 'domain') {
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

  const groups = groupTabsByDomain(filtered);
  const sorted = sortGroups(groups);

  container.innerHTML = sorted.map(([domain, tabs]) => {
    const isCollapsed = collapsedDomains.has(domain);
    const favicon = tabs[0] ? getFaviconUrl(tabs[0], 16) : '';
    return `
      <div class="domain-group${isCollapsed ? ' collapsed' : ''}" data-domain="${escapeAttr(domain)}">
        <div class="domain-header" data-domain="${escapeAttr(domain)}">
          <span class="chevron">▼</span>
          ${favicon ? `<img class="domain-favicon" src="${escapeAttr(favicon)}" alt="" onerror="this.style.display='none'">` : `<span class="domain-favicon"></span>`}
          <span class="domain-name">${escapeHtml(domain)}</span>
          <span class="domain-count">${tabs.length}</span>
          <button class="btn-close-domain" data-domain="${escapeAttr(domain)}" title="Uždaryti visus ${escapeAttr(domain)} tabus">✕</button>
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
      const domain = header.dataset.domain;
      toggleDomain(domain);
    });
  });

  document.querySelectorAll('.btn-close-domain').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDomain(btn.dataset.domain);
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

function toggleDomain(domain) {
  if (collapsedDomains.has(domain)) {
    collapsedDomains.delete(domain);
  } else {
    collapsedDomains.add(domain);
  }
  renderTabs();
}

function toggleAllCollapsed() {
  const groups = groupTabsByDomain(filterTabs(allTabs));
  const allCollapsed = Object.keys(groups).every(d => collapsedDomains.has(d));
  if (allCollapsed) {
    Object.keys(groups).forEach(d => collapsedDomains.delete(d));
  } else {
    Object.keys(groups).forEach(d => collapsedDomains.add(d));
  }
  renderTabs();
}

async function closeTab(tabId) {
  await chrome.tabs.remove(tabId);
}

async function closeDomain(domain) {
  const tabs = allTabs.filter(t => getDomain(t.url) === domain);
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

function updateBadges() {
  document.getElementById('tab-count').textContent = allTabs.length;
  const groups = groupTabsByDomain(allTabs);
  document.getElementById('domain-count').textContent = `${Object.keys(groups).length} domen${Object.keys(groups).length === 1 ? 'as' : 'ų'}`;
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
