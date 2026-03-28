const bookmarksCache = {
  map: new Map(),
  rootFolders: [],
  bookmarksBarId: null,
  lastUpdate: 0,
  TTL: 30000
};

let loadPromise = null;
let isLoading = false;

// ============================================
// ПОСТРОЕНИЕ КАРТЫ ЗАКЛАДОК
// ============================================

function buildBookmarksMap(node) {
  if (!node?.id) return;
  bookmarksCache.map.set(node.id, node);
  node.children?.forEach(buildBookmarksMap);
}

// ============================================
// ЗАГРУЗКА ДЕРЕВА ЗАКЛАДОК
// ============================================

async function loadBookmarksTree() {
  const now = Date.now();
  
  // Возвращаем кэш если актуален
  if (bookmarksCache.lastUpdate && (now - bookmarksCache.lastUpdate) < bookmarksCache.TTL) {
    return {
      map: Object.fromEntries(bookmarksCache.map),
      rootFolders: bookmarksCache.rootFolders,
      bookmarksBarId: bookmarksCache.bookmarksBarId
    };
  }

  // Предотвращаем дублирование запросов
  if (loadPromise) return loadPromise;

  // Проверяем API
  if (!chrome?.bookmarks?.getTree) {
    throw new Error('Chrome bookmarks API not available');
  }

  isLoading = true;
  
  loadPromise = (async () => {
    try {
      const tree = await chrome.bookmarks.getTree();
      
      if (!tree?.length) {
        throw new Error('Invalid bookmarks tree structure');
      }
      
      const root = tree[0];
      
      // Полная очистка перед загрузкой
      bookmarksCache.map.clear();
      bookmarksCache.rootFolders = [];
      bookmarksCache.bookmarksBarId = null;
      
      buildBookmarksMap(root);
      
      bookmarksCache.bookmarksBarId = root.children?.[0]?.id ?? null;
      const barNode = bookmarksCache.bookmarksBarId 
        ? bookmarksCache.map.get(bookmarksCache.bookmarksBarId) 
        : null;
      
      bookmarksCache.rootFolders = barNode?.children?.filter(c => !c.url) ?? [];
      bookmarksCache.lastUpdate = Date.now();
      
      return {
        map: Object.fromEntries(bookmarksCache.map),
        rootFolders: bookmarksCache.rootFolders,
        bookmarksBarId: bookmarksCache.bookmarksBarId
      };
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();
  
  return loadPromise;
}

// ============================================
// ОБРАБОТКА СООБЩЕНИЙ
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  if (message.type === 'LOAD_BOOKMARKS') {
    loadBookmarksTree()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error?.message ?? 'Unknown error' }));
    return true;
  }
  
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

// ============================================
// ИНВАЛИДАЦИЯ КЭША
// ============================================

const invalidateCache = () => {
  if (!isLoading) {
    bookmarksCache.map.clear();
    bookmarksCache.rootFolders = [];
    bookmarksCache.bookmarksBarId = null;
    bookmarksCache.lastUpdate = 0;
  }
};

// Безопасное добавление listeners
[
  chrome?.bookmarks?.onCreated,
  chrome?.bookmarks?.onRemoved,
  chrome?.bookmarks?.onChanged,
  chrome?.bookmarks?.onMoved
].forEach(event => event?.addListener?.(invalidateCache));

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

chrome.runtime.onInstalled?.addListener(async () => {
  try {
    await loadBookmarksTree();
    console.log('🚀 Service Worker initialized');
  } catch (error) {
    console.error('Service Worker initialization failed:', error);
  }
});

// Обработка пробуждения Service Worker
chrome.runtime.onStartup?.addListener(async () => {
  try {
    await loadBookmarksTree();
  } catch (error) {
    console.error('Service Worker startup failed:', error);
  }
});
