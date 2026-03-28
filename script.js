
// ============================================
// КОНСТАНТЫ
// ============================================

const SORT_FUNCTIONS = {
  name: (a, b) => (a.title ?? '').localeCompare(b.title ?? ''),
  date: (a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0)
};

const DEFAULT_SETTINGS = {
  sortMode: 'default',
  columns: 3,
  cardSize: 'standard'
};

const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'vbscript:'];

// ============================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================

const state = {
  bookmarksMap: new Map(),
  rootFolders: [],
  bookmarksBarId: null,
  currentFolderId: null,
  sortMode: DEFAULT_SETTINGS.sortMode,
  columns: DEFAULT_SETTINGS.columns,
  cardSize: DEFAULT_SETTINGS.cardSize,
  children: [],
  renderedCount: 0,
  isLoading: false,
  isDestroyed: false
};

// ============================================
// DOM КЭШ
// ============================================

const $ = id => document.getElementById(id);

const dom = {
  foldersContainer: $('folders-container'),
  bookmarksContainer: $('bookmarks-container'),
  folderTitle: $('current-folder-title'),
  bookmarksPanel: $('bookmarks-panel'),
  settingsPanel: $('settings-panel'),
  homeFolder: $('home-folder'),
  settingsFolder: $('settings-folder'),
  loadMoreIndicator: $('load-more-indicator'),
};

const templates = {
  folder: document.getElementById('folder-template'),
  bookmark: document.getElementById('bookmark-template'),
  subfolder: document.getElementById('subfolder-template')
};

// ============================================
// UTILITIES
// ============================================

const isChromeApiAvailable = () => 
  typeof chrome !== 'undefined' && chrome?.runtime !== undefined;

const sendMessage = async (type, payload = {}) => {
  if (!isChromeApiAvailable() || !chrome.runtime?.sendMessage) {
    throw new Error('Chrome runtime API not available');
  }
  return chrome.runtime.sendMessage({ type, payload });
};

const cloneTemplate = template => {
  if (!template?.content) throw new Error('Invalid template');
  return template.content.cloneNode(true);
};

const isValidUrl = url => {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase().trim();
  if (BLOCKED_PROTOCOLS.some(p => lower.startsWith(p))) return false;
  try {
    const { protocol } = new URL(url);
    return ['http:', 'https:', 'ftp:'].includes(protocol);
  } catch {
    return false;
  }
};

// ============================================
// ВИРТУАЛИЗАЦИЯ
// ============================================

let scrollObserver = null;
let animationFrameId = null;

function initScrollObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
  
  scrollObserver = new IntersectionObserver(
    entries => {
      if (state.isDestroyed) return;
      for (const entry of entries) {
        if (entry.isIntersecting && !state.isLoading && state.renderedCount < state.children.length) {
          loadMoreBookmarks();
          break;
        }
      }
    },
    { rootMargin: '200px', threshold: 0 }
  );
  
  if (dom.loadMoreIndicator) {
    scrollObserver.observe(dom.loadMoreIndicator);
  }
}

function cleanup() {
  state.isDestroyed = true;
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function loadMoreBookmarks() {
  if (state.isLoading || state.renderedCount >= state.children.length || state.isDestroyed) return;
  
  state.isLoading = true;
  dom.loadMoreIndicator?.classList.remove('hidden');
  
  animationFrameId = requestAnimationFrame(() => {
    if (state.isDestroyed) {
      state.isLoading = false;
      return;
    }
    
    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(state.renderedCount + 50, state.children.length);
    const isRoot = state.currentFolderId === state.bookmarksBarId;
    
    for (let i = state.renderedCount; i < endIndex; i++) {
      const item = state.children[i];
      if (item.url) {
        fragment.appendChild(createBookmarkCard(item));
      } else if (!isRoot && state.sortMode === 'default') {
        fragment.appendChild(createSubfolderCard(item));
      }
    }
    
    dom.bookmarksContainer.appendChild(fragment);
    state.renderedCount = endIndex;
    
    if (state.renderedCount >= state.children.length) {
      dom.loadMoreIndicator?.classList.add('hidden');
    }
    
    state.isLoading = false;
    animationFrameId = null;
  });
}

// ============================================
// СОЗДАНИЕ КАРТОЧЕК
// ============================================

function createFolderCard(folder) {
  const clone = cloneTemplate(templates.folder);
  const card = clone.querySelector('.folder-card');
  card.dataset.folderId = folder.id;
  card.querySelector('.folder-name').textContent = folder.title ?? 'Без названия';
  return card;
}

function createBookmarkCard(bookmark) {
  const clone = cloneTemplate(templates.bookmark);
  const card = clone.querySelector('.bookmark-card');
  const { url } = bookmark;
  
  card.dataset.bookmarkId = bookmark.id;
  card.dataset.url = url;
  card.href = isValidUrl(url) ? url : '#';
  
  card.querySelector('.bookmark-link').textContent = bookmark.title ?? url;
  
  const img = card.querySelector('img');
  
  if (isValidUrl(url) && isChromeApiAvailable() && chrome.runtime?.id) {
    img.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    img.onerror = () => img.replaceWith(createFallbackIcon());
  } else {
    img.replaceWith(createFallbackIcon());
  }
  
  return card;
}

function createSubfolderCard(folder) {
  const clone = cloneTemplate(templates.subfolder);
  const card = clone.querySelector('.subfolder-card');
  card.dataset.folderId = folder.id;
  card.querySelector('.bookmark-link').textContent = folder.title ?? 'Без названия';
  return card;
}

function createFallbackIcon() {
  const span = document.createElement('span');
  span.className = 'material-symbols-outlined fallback-icon';
  span.textContent = 'link';
  span.setAttribute('aria-hidden', 'true');
  return span;
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function showFolderContent(folderId) {
  if (!folderId || state.isDestroyed) return;
  
  const folderNode = state.bookmarksMap.get(folderId);
  if (!folderNode) return;
  
  state.currentFolderId = folderId;
  state.children = folderNode.children ?? [];
  state.renderedCount = 0;
  
  dom.folderTitle.textContent = folderNode.title ?? 'Закладки';
  dom.bookmarksContainer.innerHTML = '';
  dom.bookmarksContainer.dataset.columns = state.columns;
  dom.bookmarksContainer.dataset.size = state.cardSize;
  
  // Сортировка
  if (state.sortMode !== 'default' && SORT_FUNCTIONS[state.sortMode]) {
    const subFolders = state.children.filter(c => !c.url);
    const bookmarks = state.children.filter(c => c.url);
    const sortFn = SORT_FUNCTIONS[state.sortMode];
    
    subFolders.sort(sortFn);
    bookmarks.sort(sortFn);
    
    state.children = folderId === state.bookmarksBarId 
      ? bookmarks 
      : [...subFolders, ...bookmarks];
  }
  
  if (state.children.length === 0) {
    dom.bookmarksContainer.innerHTML = '<div class="empty-message">Папка пуста</div>';
    dom.loadMoreIndicator?.classList.add('hidden');
    return;
  }
  
  initScrollObserver();
  loadMoreBookmarks();
}

function renderFoldersPanel() {
  const fragment = document.createDocumentFragment();
  for (const folder of state.rootFolders) {
    fragment.appendChild(createFolderCard(folder));
  }
  dom.foldersContainer.innerHTML = '';
  dom.foldersContainer.appendChild(fragment);
}

// ============================================
// ПАНЕЛИ
// ============================================

function showBookmarksPanel() {
  dom.bookmarksPanel.classList.remove('hidden');
  dom.settingsPanel.classList.add('hidden');
}

function showSettingsPanel() {
  dom.bookmarksPanel.classList.add('hidden');
  dom.settingsPanel.classList.remove('hidden');
}

function setActiveFolder(activeCard) {
  document.querySelectorAll('.folder-card, #home-folder, #settings-folder')
    .forEach(el => {
      el.classList.remove('active');
      el.setAttribute('aria-pressed', 'false');
    });
  
  activeCard.classList.add('active');
  activeCard.setAttribute('aria-pressed', 'true');
}

// ============================================
// НАСТРОЙКИ
// ============================================

async function loadSettings() {
  if (!isChromeApiAvailable() || !chrome.storage?.local) return;
  
  try {
    const { settings = {} } = await chrome.storage.local.get('settings');
    state.sortMode = settings.sortMode ?? DEFAULT_SETTINGS.sortMode;
    state.columns = settings.columns ?? DEFAULT_SETTINGS.columns;
    state.cardSize = settings.cardSize ?? DEFAULT_SETTINGS.cardSize;
    
    dom.bookmarksContainer.dataset.columns = state.columns;
    dom.bookmarksContainer.dataset.size = state.cardSize;
    updateSettingsButtons();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettings() {
  if (!isChromeApiAvailable() || !chrome.storage?.local) return;
  
  try {
    await chrome.storage.local.set({
      settings: {
        sortMode: state.sortMode,
        columns: state.columns,
        cardSize: state.cardSize
      }
    });
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// Кэш кнопок настроек
let settingsButtonsCache = null;

function updateSettingsButtons() {
  if (!settingsButtonsCache) {
    settingsButtonsCache = {
      sort: document.querySelectorAll('[data-sort]'),
      columns: document.querySelectorAll('[data-columns]'),
      size: document.querySelectorAll('[data-size]')
    };
  }
  
  settingsButtonsCache.sort.forEach(btn => {
    const isActive = btn.dataset.sort === state.sortMode;
    btn.classList.toggle('active-btn', isActive);
    btn.setAttribute('aria-checked', isActive);
  });
  
  settingsButtonsCache.columns.forEach(btn => {
    const isActive = parseInt(btn.dataset.columns) === state.columns;
    btn.classList.toggle('active-btn', isActive);
    btn.setAttribute('aria-checked', isActive);
  });
  
  settingsButtonsCache.size.forEach(btn => {
    const isActive = btn.dataset.size === state.cardSize;
    btn.classList.toggle('active-btn', isActive);
    btn.setAttribute('aria-checked', isActive);
  });
}

// ============================================
// ОТКРЫТИЕ URL
// ============================================

function openBookmarkUrl(url) {
  if (!isValidUrl(url)) {
    console.warn('Invalid URL blocked:', url);
    return;
  }
  
  if (!isChromeApiAvailable() || !chrome.tabs) {
    window.location.href = url;
    return;
  }
  
  chrome.tabs.getCurrent(tab => {
    if (chrome.runtime?.lastError) {
      console.warn('Tab error:', chrome.runtime.lastError.message);
      window.location.href = url;
      return;
    }
    
    if (!tab?.id) {
      window.location.href = url;
      return;
    }
    
    chrome.tabs.update(tab.id, { url }).catch(() => {
      window.location.href = url;
    });
  });
}

// ============================================
// EVENT HANDLERS
// ============================================

dom.foldersContainer?.addEventListener('click', e => {
  if (state.isDestroyed) return;
  
  const card = e.target.closest('.folder-card');
  if (!card?.dataset.folderId) return;
  
  setActiveFolder(card);
  showBookmarksPanel();
  showFolderContent(card.dataset.folderId);
});

dom.bookmarksContainer?.addEventListener('click', e => {
  if (state.isDestroyed) return;
  
  const bookmarkCard = e.target.closest('.bookmark-card');
  const subfolderCard = e.target.closest('.subfolder-card');
  
  if (bookmarkCard && !bookmarkCard.classList.contains('subfolder-card')) {
    const url = bookmarkCard.dataset.url;
    if (url) {
      e.preventDefault();
      openBookmarkUrl(url);
    }
  } else if (subfolderCard || bookmarkCard?.classList.contains('subfolder-card')) {
    e.preventDefault();
    const folderId = (subfolderCard || bookmarkCard).dataset.folderId;
    if (folderId) showFolderContent(folderId);
  }
});

dom.bookmarksContainer?.addEventListener('auxclick', e => {
  if (state.isDestroyed || e.button !== 1) return;
  
  const card = e.target.closest('.bookmark-card[data-url]');
  if (!card || !isValidUrl(card.dataset.url)) return;
  
  e.preventDefault();
  
  if (isChromeApiAvailable() && chrome.tabs) {
    chrome.tabs.create({ url: card.dataset.url, active: false }).catch(console.error);
  } else {
    window.open(card.dataset.url, '_blank');
  }
});

dom.homeFolder?.addEventListener('click', () => {
  if (state.isDestroyed) return;
  setActiveFolder(dom.homeFolder);
  showBookmarksPanel();
  if (state.bookmarksBarId) showFolderContent(state.bookmarksBarId);
});

dom.settingsFolder?.addEventListener('click', () => {
  if (state.isDestroyed) return;
  setActiveFolder(dom.settingsFolder);
  showSettingsPanel();
});

document.addEventListener('click', e => {
  if (state.isDestroyed) return;
  
  const target = e.target;
  
  // Сортировка
  const sortBtn = target.closest('[data-sort]');
  if (sortBtn?.dataset.sort) {
    state.sortMode = sortBtn.dataset.sort;
    saveSettings();
    updateSettingsButtons();
    if (state.currentFolderId) showFolderContent(state.currentFolderId);
    return;
  }
  
  // Колонки
  const colBtn = target.closest('[data-columns]');
  if (colBtn) {
    const value = parseInt(colBtn.dataset.columns);
    if (value && !isNaN(value)) {
      state.columns = value;
      dom.bookmarksContainer.dataset.columns = value;
      settingsButtonsCache = null;
      saveSettings();
      updateSettingsButtons();
    }
    return;
  }
  
  // Размер
  const sizeBtn = target.closest('[data-size]');
  if (sizeBtn?.dataset.size) {
    state.cardSize = sizeBtn.dataset.size;
    dom.bookmarksContainer.dataset.size = sizeBtn.dataset.size;
    settingsButtonsCache = null;
    saveSettings();
    updateSettingsButtons();
    return;
  }
  
  // Диспетчер закладок
  if (target.closest('#open-bookmarks-manager') && isChromeApiAvailable() && chrome.tabs) {
    chrome.tabs.create({ url: 'chrome://bookmarks' }).catch(console.error);
  }
});

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

async function init() {
  if (state.isDestroyed) return;
  
  await loadSettings();
  
  try {
    if (!isChromeApiAvailable()) {
      throw new Error('Chrome runtime API not available');
    }
    
    const response = await sendMessage('LOAD_BOOKMARKS');
    
    if (response?.success && response.data) {
      const { map, rootFolders, bookmarksBarId } = response.data;
      
      state.bookmarksMap = new Map(Object.entries(map));
      state.rootFolders = rootFolders ?? [];
      state.bookmarksBarId = bookmarksBarId;
      
      renderFoldersPanel();
      if (bookmarksBarId) showFolderContent(bookmarksBarId);
    } else {
      throw new Error(response?.error ?? 'Failed to load bookmarks');
    }
  } catch (err) {
    console.error('Initialization error:', err);
    dom.bookmarksContainer.innerHTML = '<div class="empty-message">Ошибка загрузки</div>';
  }
}

// ============================================
// ЗАПУСК
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Обработка изменений закладок
if (isChromeApiAvailable() && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (state.isDestroyed) return false;
    if (message?.type === 'BOOKMARKS_CHANGED') init();
    return false;
  });
}

// Cleanup
window.addEventListener('beforeunload', cleanup);
