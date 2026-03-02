// ============================================
// ЗАКЛАДКИ — Оптимизированная версия v3
// ============================================

// --- Состояние ---
const bookmarksMap = new Map();
let rootFolders = [];
let bookmarksBarId = null;
let currentFolderId = null;
let sortMode = 'default';
let columns = 3;
let cardSize = 'standard';
let currentBookmarkNode = null;

// --- Оптимизация: Виртуализация ---
const VIRTUALIZATION_CHUNK_SIZE = 50;
let currentChildren = [];
let renderedCount = 0;
let isLoading = false;
let scrollObserver = null;

// --- Кэш DOM-элементов ---
const dom = {
    foldersContainer: document.getElementById('folders-container'),
    bookmarksContainer: document.getElementById('bookmarks-container'),
    folderTitle: document.getElementById('current-folder-title'),
    bookmarksPanel: document.getElementById('bookmarks-panel'),
    settingsPanel: document.getElementById('settings-panel'),
    homeFolder: document.getElementById('home-folder'),
    settingsFolder: document.getElementById('settings-folder'),
    loadMoreIndicator: document.getElementById('load-more-indicator'),
};

// --- Шаблоны ---
const folderTemplate = document.getElementById('folder-template');
const bookmarkTemplate = document.getElementById('bookmark-template');

// ============================================
// ОПТИМИЗАЦИЯ: ВИРТУАЛИЗАЦИЯ
// ============================================

function initScrollObserver() {
    if (scrollObserver) scrollObserver.disconnect();

    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading && renderedCount < currentChildren.length) {
                loadMoreBookmarks();
            }
        });
    }, { root: null, rootMargin: '200px', threshold: 0 });

    if (dom.loadMoreIndicator) {
        scrollObserver.observe(dom.loadMoreIndicator);
    }
}

function loadMoreBookmarks() {
    if (isLoading || renderedCount >= currentChildren.length) return;

    isLoading = true;
    dom.loadMoreIndicator?.classList.remove('hidden');

    requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(renderedCount + VIRTUALIZATION_CHUNK_SIZE, currentChildren.length);
        const isRoot = (currentFolderId === bookmarksBarId);

        for (let i = renderedCount; i < endIndex; i++) {
            const item = currentChildren[i];
            if (!item.url) {
                if (!isRoot && sortMode === 'default') {
                    fragment.appendChild(createFolderCard(item, false));
                }
            } else {
                fragment.appendChild(createBookmarkCard(item));
            }
        }

        dom.bookmarksContainer.appendChild(fragment);
        renderedCount = endIndex;

        if (renderedCount >= currentChildren.length) {
            dom.loadMoreIndicator?.classList.add('hidden');
        }

        isLoading = false;
    });
}

// --- Показ скелетона ---
function showSkeleton() {
    const grid = dom.bookmarksContainer;
    grid.innerHTML = '';
    grid.dataset.columns = columns;
    grid.dataset.size = cardSize;
    for (let i = 0; i < 6; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        grid.appendChild(skeleton);
    }
}

// --- Загрузка/сохранение настроек ---
function loadSettings() {
    const savedColumns = localStorage.getItem('bookmarkColumns');
    if (savedColumns && ['2','3','4'].includes(savedColumns)) {
        columns = parseInt(savedColumns);
        dom.bookmarksContainer.dataset.columns = columns;
    }

    const savedSort = localStorage.getItem('bookmarkSort');
    if (savedSort && ['default', 'name', 'date'].includes(savedSort)) {
        sortMode = savedSort;
    }

    const savedSize = localStorage.getItem('bookmarkCardSize');
    if (savedSize && ['compact', 'standard', 'large'].includes(savedSize)) {
        cardSize = savedSize;
        dom.bookmarksContainer.dataset.size = cardSize;
    }
}

function saveSettings() {
    localStorage.setItem('bookmarkColumns', columns);
    localStorage.setItem('bookmarkSort', sortMode);
    localStorage.setItem('bookmarkCardSize', cardSize);
}

// --- Подсветка активных кнопок в настройках ---
function updateSettingsButtons() {
    document.querySelectorAll('[data-sort]').forEach(btn => {
        btn.classList.toggle('active-btn', btn.dataset.sort === sortMode);
    });
    document.querySelectorAll('[data-columns]').forEach(btn => {
        btn.classList.toggle('active-btn', parseInt(btn.dataset.columns) === columns);
    });
    document.querySelectorAll('[data-size]').forEach(btn => {
        btn.classList.toggle('active-btn', btn.dataset.size === cardSize);
    });
}

// --- Создание карточек из шаблонов ---
function createFolderCard(folderNode, isLeft = true) {
    const clone = folderTemplate.content.cloneNode(true);
    const card = clone.querySelector('.folder-card');
    card.dataset.id = folderNode.id;
    card.querySelector('.folder-name').textContent = folderNode.title || 'Без названия';

    if (!isLeft) {
        card.classList.add('subfolder-card');
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            showFolderContent(folderNode.id);
        });
    } else {
        card.addEventListener('click', () => {
            showBookmarksPanel();
            document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            showFolderContent(folderNode.id);
        });
    }
    return card;
}

function createBookmarkCard(bookmark) {
    const clone = bookmarkTemplate.content.cloneNode(true);
    const card = clone.querySelector('.bookmark-card');
    card.dataset.id = bookmark.id;
    card.dataset.url = bookmark.url;

    const link = card.querySelector('.bookmark-link');
    link.textContent = bookmark.title || bookmark.url;
    link.title = bookmark.url;

    const img = card.querySelector('img');
    
    // Chrome favicon API — самый надёжный источник
    const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=32`;
    img.src = faviconUrl;

    // Fallback при ошибке
    img.onerror = () => {
        img.style.display = 'none';
        const fallback = document.createElement('span');
        fallback.className = 'material-symbols-outlined fallback-icon';
        fallback.textContent = 'link';
        card.querySelector('.favicon-container').appendChild(fallback);
    };

    // Левый клик — открыть в текущей вкладке
    card.addEventListener('click', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (!bookmark.url) return;

        chrome.tabs.getCurrent(tab => {
            if (tab) {
                chrome.tabs.update(tab.id, { url: bookmark.url });
            } else {
                window.location.href = bookmark.url;
            }
        });
    });

    // Средний клик (колёсико) — открыть в новой вкладке
    card.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            if (!bookmark.url) return;
            chrome.tabs.create({ url: bookmark.url, active: false });
        }
    });

    // Контекстное меню (правый клик)
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        currentBookmarkNode = bookmark;
        showContextMenu(e.pageX, e.pageY);
    });

    return card;
}

// --- Отображение содержимого папки ---
function showFolderContent(folderId) {
    const folderNode = bookmarksMap.get(folderId);
    if (!folderNode) return;

    currentFolderId = folderId;
    dom.folderTitle.textContent = folderNode.title || 'Закладки';
    dom.bookmarksContainer.innerHTML = '';
    dom.bookmarksContainer.dataset.columns = columns;
    dom.bookmarksContainer.dataset.size = cardSize;

    const children = folderNode.children || [];
    const isRoot = (folderId === bookmarksBarId);

    currentChildren = [];
    renderedCount = 0;

    if (sortMode === 'default') {
        currentChildren = children;
    } else {
        const subFolders = children.filter(c => !c.url);
        const bookmarks = children.filter(c => c.url);

        const sortByName = (a, b) => (a.title || '').localeCompare(b.title || '');
        const sortByDate = (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0);

        if (sortMode === 'name') {
            subFolders.sort(sortByName);
            bookmarks.sort(sortByName);
        } else if (sortMode === 'date') {
            subFolders.sort(sortByDate);
            bookmarks.sort(sortByDate);
        }

        currentChildren = isRoot ? bookmarks : [...subFolders, ...bookmarks];
    }

    if (currentChildren.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-message';
        emptyMsg.textContent = 'Папка пуста';
        dom.bookmarksContainer.appendChild(emptyMsg);
        dom.loadMoreIndicator?.classList.add('hidden');
        return;
    }

    initScrollObserver();
    loadMoreBookmarks();
}

// --- Построение левой панели ---
function renderLeftPanel() {
    dom.foldersContainer.innerHTML = '';
    rootFolders.forEach(f => dom.foldersContainer.appendChild(createFolderCard(f, true)));
}

// --- Переключение панелей ---
function showBookmarksPanel() {
    dom.bookmarksPanel.classList.remove('hidden');
    dom.settingsPanel.classList.add('hidden');
}

function showSettingsPanel() {
    dom.bookmarksPanel.classList.add('hidden');
    dom.settingsPanel.classList.remove('hidden');
}

// --- Контекстное меню ---
function showContextMenu(x, y) {
    console.log('Context menu:', x, y);
}

// --- Открытие диспетчера закладок Chrome ---
function openBookmarksManager() {
    chrome.tabs.create({ url: 'chrome://bookmarks' });
}

// --- Инициализация ---
async function init() {
    showSkeleton();
    loadSettings();
    updateSettingsButtons();

    try {
        const tree = await chrome.bookmarks.getTree();
        const root = tree[0];

        const walk = node => {
            bookmarksMap.set(node.id, node);
            node.children?.forEach(walk);
        };
        walk(root);

        bookmarksBarId = root.children[0].id;
        const barNode = bookmarksMap.get(bookmarksBarId);
        rootFolders = barNode.children.filter(c => !c.url);

        renderLeftPanel();
        dom.homeFolder.classList.add('active');
        showFolderContent(bookmarksBarId);
    } catch (err) {
        console.error(err);
        dom.bookmarksContainer.innerHTML = '<div class="empty-message">Ошибка загрузки</div>';
    }
}

// --- Обработчики событий ---
dom.homeFolder.addEventListener('click', () => {
    showBookmarksPanel();
    document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('active'));
    dom.homeFolder.classList.add('active');
    showFolderContent(bookmarksBarId);
});

dom.settingsFolder.addEventListener('click', () => {
    showSettingsPanel();
    document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('active'));
    dom.settingsFolder.classList.add('active');
});

// ИСПРАВЛЕНО: Используем e.currentTarget вместо e.target
// e.currentTarget всегда указывает на элемент, к которому привязан обработчик

document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', e => {
        const value = e.currentTarget.dataset.sort;
        if (!value) return; // Защита от пустых значений
        sortMode = value;
        saveSettings();
        updateSettingsButtons();
        if (currentFolderId) showFolderContent(currentFolderId);
    });
});

document.querySelectorAll('[data-columns]').forEach(btn => {
    btn.addEventListener('click', e => {
        const value = e.currentTarget.dataset.columns;
        if (!value) return;
        columns = parseInt(value);
        dom.bookmarksContainer.dataset.columns = columns;
        saveSettings();
        updateSettingsButtons();
    });
});

document.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', e => {
        const value = e.currentTarget.dataset.size;
        if (!value) return;
        cardSize = value;
        dom.bookmarksContainer.dataset.size = cardSize;
        saveSettings();
        updateSettingsButtons();
    });
});

document.getElementById('open-bookmarks-manager')?.addEventListener('click', openBookmarksManager);

document.addEventListener('DOMContentLoaded', init);
