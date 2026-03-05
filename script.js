// ============================================
// ЗАКЛАДКИ — Версия 6 с режимом редактирования
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
let editMode = false;
let draggedElement = null;
let draggedBookmarkId = null;

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
    editModeToggle: document.getElementById('edit-mode-toggle'),
    editModeLabel: document.getElementById('edit-mode-label'),
    editModeIndicator: document.getElementById('edit-mode-indicator'),
    contextMenu: document.getElementById('context-menu'),
    editModal: document.getElementById('edit-modal'),
    deleteModal: document.getElementById('delete-modal'),
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
        
        // Применяем режим редактирования к новым элементам
        if (editMode) {
            updateEditModeStyles();
        }
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
    
    const savedEditMode = localStorage.getItem('editMode');
    if (savedEditMode === 'true') {
        editMode = true;
        dom.editModeToggle.checked = true;
        updateEditModeUI();
    }
}

function saveSettings() {
    localStorage.setItem('bookmarkColumns', columns);
    localStorage.setItem('bookmarkSort', sortMode);
    localStorage.setItem('bookmarkCardSize', cardSize);
    localStorage.setItem('editMode', editMode);
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

// ============================================
// РЕЖИМ РЕДАКТИРОВАНИЯ
// ============================================

function toggleEditMode() {
    editMode = dom.editModeToggle.checked;
    saveSettings();
    updateEditModeUI();
}

function updateEditModeUI() {
    dom.editModeLabel.textContent = editMode ? 'Включён' : 'Выключен';
    
    if (editMode) {
        dom.editModeIndicator.classList.remove('hidden');
        dom.bookmarksContainer.classList.add('edit-mode');
    } else {
        dom.editModeIndicator.classList.add('hidden');
        dom.bookmarksContainer.classList.remove('edit-mode');
    }
}

function updateEditModeStyles() {
    if (editMode) {
        dom.bookmarksContainer.classList.add('edit-mode');
    } else {
        dom.bookmarksContainer.classList.remove('edit-mode');
    }
}

// ============================================
// DRAG AND DROP
// ============================================

function initDragAndDrop(card, bookmarkId) {
    card.setAttribute('draggable', 'true');
    card.dataset.bookmarkId = bookmarkId;

    card.addEventListener('dragstart', (e) => {
        if (!editMode) {
            e.preventDefault();
            return;
        }
        draggedElement = card;
        draggedBookmarkId = bookmarkId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', bookmarkId);
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedElement = null;
        draggedBookmarkId = null;
    });

    card.addEventListener('dragover', (e) => {
        if (!editMode || !draggedElement || draggedElement === card) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        
        if (!editMode || !draggedBookmarkId || draggedElement === card) return;

        const targetId = card.dataset.bookmarkId;
        if (!targetId) return;

        try {
            // Получаем информацию о целевой закладке
            const targetBookmark = bookmarksMap.get(targetId);
            const draggedBookmark = bookmarksMap.get(draggedBookmarkId);
            
            if (!targetBookmark || !draggedBookmark) return;

            // Перемещаем закладку в ту же папку, после целевой
            await chrome.bookmarks.move(draggedBookmarkId, {
                parentId: targetBookmark.parentId,
                index: targetBookmark.index + 1
            });

            // Обновляем отображение
            await refreshBookmarks();
        } catch (err) {
            console.error('Ошибка при перемещении:', err);
        }
    });
}

async function refreshBookmarks() {
    // Обновляем карту закладок
    bookmarksMap.clear();
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    
    const walk = node => {
        bookmarksMap.set(node.id, node);
        node.children?.forEach(walk);
    };
    walk(root);

    // Обновляем отображение текущей папки
    if (currentFolderId) {
        showFolderContent(currentFolderId);
    }
}

// ============================================
// КОНТЕКСТНОЕ МЕНЮ
// ============================================

function showContextMenu(x, y, bookmark) {
    currentBookmarkNode = bookmark;
    
    // Позиционирование меню
    const menu = dom.contextMenu;
    menu.classList.remove('hidden');
    
    // Корректировка позиции, чтобы меню не выходило за границы экрана
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let posX = x;
    let posY = y;
    
    if (x + menuRect.width > viewportWidth) {
        posX = viewportWidth - menuRect.width - 10;
    }
    if (y + menuRect.height > viewportHeight) {
        posY = viewportHeight - menuRect.height - 10;
    }
    
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
}

function hideContextMenu() {
    dom.contextMenu.classList.add('hidden');
    currentBookmarkNode = null;
}

// ============================================
// МОДАЛЬНЫЕ ОКНА
// ============================================

function showEditModal(mode, bookmark) {
    const modal = dom.editModal;
    const title = document.getElementById('modal-title');
    const nameInput = document.getElementById('edit-name');
    const urlInput = document.getElementById('edit-url');
    const urlField = document.getElementById('url-field');
    
    currentBookmarkNode = bookmark;
    
    if (mode === 'rename') {
        title.textContent = 'Переименовать';
        urlField.style.display = 'none';
        nameInput.value = bookmark.title || '';
    } else {
        title.textContent = 'Изменить URL';
        urlField.style.display = 'block';
        nameInput.value = bookmark.title || '';
        urlInput.value = bookmark.url || '';
    }
    
    modal.classList.remove('hidden');
    nameInput.focus();
}

function hideEditModal() {
    dom.editModal.classList.add('hidden');
    currentBookmarkNode = null;
}

function showDeleteModal(bookmark) {
    currentBookmarkNode = bookmark;
    document.getElementById('delete-bookmark-name').textContent = bookmark.title || 'Без названия';
    dom.deleteModal.classList.remove('hidden');
}

function hideDeleteModal() {
    dom.deleteModal.classList.add('hidden');
    currentBookmarkNode = null;
}

async function saveBookmarkChanges() {
    if (!currentBookmarkNode) return;
    
    const name = document.getElementById('edit-name').value.trim();
    const url = document.getElementById('edit-url').value.trim();
    
    try {
        const changes = {};
        if (name) changes.title = name;
        if (url && document.getElementById('url-field').style.display !== 'none') {
            changes.url = url;
        }
        
        if (Object.keys(changes).length > 0) {
            await chrome.bookmarks.update(currentBookmarkNode.id, changes);
            await refreshBookmarks();
        }
        
        hideEditModal();
    } catch (err) {
        console.error('Ошибка при сохранении:', err);
        alert('Ошибка при сохранении: ' + err.message);
    }
}

async function deleteBookmark() {
    if (!currentBookmarkNode) return;
    
    try {
        await chrome.bookmarks.remove(currentBookmarkNode.id);
        await refreshBookmarks();
        hideDeleteModal();
    } catch (err) {
        console.error('Ошибка при удалении:', err);
        alert('Ошибка при удалении: ' + err.message);
    }
}

// ============================================
// СОЗДАНИЕ КАРТОЧЕК
// ============================================

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
    
    // Chrome favicon API
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

    // Инициализация drag and drop
    initDragAndDrop(card, bookmark.id);

    // Левый клик — открыть в текущей вкладке (только если не в режиме редактирования)
    card.addEventListener('click', (e) => {
        if (e.button !== 0) return;
        
        // В режиме редактирования не открываем ссылку
        if (editMode) return;
        
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
        showContextMenu(e.pageX, e.pageY, bookmark);
    });

    return card;
}

// ============================================
// ОТОБРАЖЕНИЕ СОДЕРЖИМОГО ПАПКИ
// ============================================

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

    // Применяем класс edit-mode если нужно
    updateEditModeStyles();
    
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

// --- Открытие диспетчера закладок Chrome ---
function openBookmarksManager() {
    chrome.tabs.create({ url: 'chrome://bookmarks' });
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

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

// ============================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================

// Папки
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

// Режим редактирования
dom.editModeToggle.addEventListener('change', toggleEditMode);

// Настройки
document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', e => {
        const value = e.currentTarget.dataset.sort;
        if (!value) return;
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

// Диспетчер закладок
document.getElementById('open-bookmarks-manager')?.addEventListener('click', openBookmarksManager);

// Контекстное меню
document.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        hideContextMenu();
        
        if (!currentBookmarkNode) return;
        
        switch (action) {
            case 'rename':
                showEditModal('rename', currentBookmarkNode);
                break;
            case 'edit-url':
                showEditModal('edit-url', currentBookmarkNode);
                break;
            case 'delete':
                showDeleteModal(currentBookmarkNode);
                break;
        }
    });
});

// Закрытие контекстного меню при клике вне его
document.addEventListener('click', (e) => {
    if (!dom.contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// Модальное окно редактирования
document.getElementById('modal-cancel')?.addEventListener('click', hideEditModal);
document.getElementById('modal-save')?.addEventListener('click', saveBookmarkChanges);
dom.editModal.querySelector('.modal-backdrop')?.addEventListener('click', hideEditModal);

// Модальное окно удаления
document.getElementById('delete-cancel')?.addEventListener('click', hideDeleteModal);
document.getElementById('delete-confirm')?.addEventListener('click', deleteBookmark);
dom.deleteModal.querySelector('.modal-backdrop')?.addEventListener('click', hideDeleteModal);

// Закрытие модальных окон по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideContextMenu();
        hideEditModal();
        hideDeleteModal();
    }
});

// Enter в модальном окне редактирования
document.getElementById('edit-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveBookmarkChanges();
    }
});

document.getElementById('edit-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveBookmarkChanges();
    }
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', init);
