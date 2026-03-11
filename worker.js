const bookmarksCache = {
  map: new Map(),
  rootFolders: [],
  bookmarksBarId: null,
  lastUpdate: 0,
  TTL: 30000
};

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

  // Проверяем API
  if (!chrome?.bookmarks?.getTree) {
    throw new Error('Chrome bookmarks API not available');
  }

  const tree = await chrome.bookmarks.getTree();
  
  if (!tree?.length) {
    throw new Error('Invalid bookmarks tree structure');
  }
  
  const root = tree[0];
  
  // Очищаем и строим карту
  bookmarksCache.map.clear();
  buildBookmarksMap(root);
  
  // Извлекаем данные
  bookmarksCache.bookmarksBarId = root.children?.[0]?.id ?? null;
  const barNode = bookmarksCache.bookmarksBarId 
    ? bookmarksCache.map.get(bookmarksCache.bookmarksBarId) 
    : null;
  
  bookmarksCache.rootFolders = barNode?.children?.filter(c => !c.url) ?? [];
  bookmarksCache.lastUpdate = now;
  
  return {
    map: Object.fromEntries(bookmarksCache.map),
    rootFolders: bookmarksCache.rootFolders,
    bookmarksBarId: bookmarksCache.bookmarksBarId
  };
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
    return true; // Async response
  }
  
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

// ============================================
// ИНВАЛИДАЦИЯ КЭША
// ============================================

const invalidateCache = () => { bookmarksCache.lastUpdate = 0; };

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
