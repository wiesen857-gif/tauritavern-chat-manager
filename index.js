import * as host from './host.js';
import { buildOwners, chatKey, filterOwners, ownerKey, validateName } from './model.js';

const context = () => SillyTavern.getContext();
const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};
const button = (label, action, className = '') => {
    const node = el('button', `tcm-button ${className}`, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
};

function mount() {
    if (document.getElementById('tcm-dialog')) return;
    const dialog = el('dialog', 'tcm-dialog');
    dialog.id = 'tcm-dialog';
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', 'tcm-title');
    const header = el('header', 'tcm-header');
    const heading = el('div');
    const title = el('h2', '', '角色聊天管理');
    title.id = 'tcm-title';
    heading.append(title, el('p', 'tcm-muted', '点击角色卡，展开属于它的聊天。'));
    const close = button('关闭', () => dialog.close());
    header.append(heading, close);
    const toolbar = el('div', 'tcm-toolbar');
    const searchLabel = el('label', 'tcm-search-label', '搜索');
    const search = el('input', 'tcm-search');
    search.type = 'search';
    search.placeholder = '角色、群聊或聊天名称';
    searchLabel.append(search);
    const refresh = button('刷新', () => refreshList());
    toolbar.append(searchLabel, refresh);
    const status = el('p', 'tcm-status');
    status.tabIndex = -1;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const batch = el('div', 'tcm-batch');
    const list = el('div', 'tcm-list');
    dialog.append(header, toolbar, status, batch, list);
    document.body.append(dialog);

    let owners = [];
    let busy = false;
    let loaded = false;
    let editor = null;
    let batchConfirm = false;
    const selected = new Set();
    const expanded = new Set();
    let opener;

    function tell(message, error = false) {
        status.textContent = message;
        status.classList.toggle('tcm-error', error);
    }

    function setBusy(value) {
        busy = value;
        dialog.setAttribute('aria-busy', String(value));
        for (const node of dialog.querySelectorAll('button,input')) node.disabled = value;
        list.inert = value;
    }

    async function readList() {
        const response = await fetch('/api/chats/recent', {
            method: 'POST', headers: context().getRequestHeaders(),
            body: JSON.stringify({ metadata: false }),
        });
        if (!response.ok) throw new Error(`读取聊天列表失败（${response.status}），请点击刷新重试。`);
        const summaries = await response.json();
        if (!Array.isArray(summaries)) throw new Error('宿主返回的聊天列表格式不正确。');
        const ctx = context();
        owners = buildOwners(ctx.characters, ctx.groups, summaries);
        const existing = new Set(owners.flatMap(owner => owner.chats.map(chat => chatKey(owner, chat.name))));
        for (const key of selected) if (!existing.has(key)) selected.delete(key);
        loaded = true;
    }

    async function refreshList() {
        if (busy) return;
        setBusy(true);
        tell('正在读取聊天列表…');
        try {
            await readList();
            editor = null;
            batchConfirm = false;
            render();
            tell(`共 ${owners.filter(owner => owner.kind === 'character').length} 张角色卡 · ${owners.reduce((n, owner) => n + owner.chats.length, 0)} 条聊天`);
        } catch (error) {
            tell(error.message, true);
            if (!loaded) list.replaceChildren(el('p', 'tcm-empty', '暂时无法加载。请点击上方“刷新”重试。'));
        } finally {
            setBusy(false);
        }
    }

    function renderBatch() {
        batch.replaceChildren();
        batch.hidden = selected.size === 0;
        if (!selected.size) return;
        batch.append(el('span', '', `已选择 ${selected.size} 条聊天`));
        if (batchConfirm) {
            batch.append(el('strong', '', '删除后无法撤销，角色卡保留。'));
            batch.append(button('确认删除所选聊天', () => removeSelected(), 'tcm-danger'));
            batch.append(button('取消', () => { batchConfirm = false; renderBatch(); }));
        } else {
            batch.append(button('删除所选', () => { batchConfirm = true; renderBatch(); }, 'tcm-danger'));
            batch.append(button('取消选择', () => { selected.clear(); batchConfirm = false; render(); }));
        }
    }

    function render() {
        renderBatch();
        list.replaceChildren();
        const visible = filterOwners(owners, search.value);
        if (!visible.length) {
            list.append(el('p', 'tcm-empty', search.value.trim() ? '没有匹配的角色或聊天。' : '还没有角色卡。导入角色卡后，点击刷新。'));
            return;
        }
        for (const owner of visible) {
            const key = ownerKey(owner.kind, owner.id);
            const details = el('details', 'tcm-owner');
            details.open = expanded.has(key) || Boolean(search.value.trim());
            details.addEventListener('toggle', () => {
                if (!search.value.trim()) details.open ? expanded.add(key) : expanded.delete(key);
            });
            const summary = el('summary', 'tcm-card');
            const art = el('span', 'tcm-art');
            const noImage = el('span', 'tcm-no-image', '无');
            noImage.setAttribute('aria-label', '无角色图像');
            art.append(noImage);
            if (owner.avatar) {
                const image = el('img');
                image.alt = `${owner.name}的角色卡`;
                image.loading = 'lazy';
                image.addEventListener('load', () => { noImage.hidden = true; });
                image.addEventListener('error', () => { image.remove(); noImage.hidden = false; });
                image.src = context().getThumbnailUrl('avatar', owner.avatar);
                art.append(image);
            }
            const text = el('span', 'tcm-card-text');
            text.append(el('strong', 'tcm-name', owner.name));
            const kind = owner.kind === 'group' ? '群聊' : owner.kind === 'orphan' ? '只读' : '角色卡';
            text.append(el('span', 'tcm-muted', `${kind} · ${owner.chats.length} 条聊天`));
            const arrow = el('span', 'tcm-chevron');
            arrow.setAttribute('aria-hidden', 'true');
            summary.append(art, text, arrow);
            const chats = el('div', 'tcm-chats');
            if (owner.kind !== 'orphan') chats.append(button('＋ 新建聊天', () => createChat(owner), 'tcm-new-chat tcm-primary'));
            if (!owner.chats.length) chats.append(el('p', 'tcm-empty', '这个角色还没有保存的聊天。'));
            if (owner.kind === 'orphan') chats.append(el('p', 'tcm-muted', '原角色不存在或无法识别，恢复对应角色后才能管理这些聊天。'));
            for (const chat of owner.chats) chats.append(renderChat(owner, chat));
            details.append(summary, chats);
            list.append(details);
        }
    }

    function renderChat(owner, chat) {
        const row = el('article', 'tcm-chat');
        const key = chatKey(owner, chat.name);
        row.dataset.chatKey = key;
        const content = el('div', 'tcm-chat-content');
        content.append(el('h3', '', chat.name));
        const date = chat.time ? new Date(chat.time).toLocaleString() : '时间未知';
        const current = context().chatId === chat.name && (owner.kind === 'group'
            ? String(context().groupId) === owner.id
            : !context().groupId && context().characters[context().characterId]?.avatar === owner.id);
        content.append(el('p', 'tcm-muted', `${chat.count} 条消息 · ${date}${current ? ' · 当前聊天' : ''}`));
        if (chat.preview) content.append(el('p', 'tcm-preview', chat.preview.slice(0, 180)));
        if (owner.kind === 'orphan') { row.append(content); return row; }
        const checkbox = el('input', 'tcm-checkbox');
        checkbox.type = 'checkbox';
        checkbox.checked = selected.has(key);
        checkbox.setAttribute('aria-label', `选择 ${owner.name} 的聊天 ${chat.name}`);
        checkbox.addEventListener('change', () => {
            checkbox.checked ? selected.add(key) : selected.delete(key);
            batchConfirm = false;
            renderBatch();
        });
        const actions = el('div', 'tcm-actions');
        actions.append(
            button('打开', () => openChat(owner, chat), 'tcm-primary'),
            button('重命名', () => { editor = { key, type: 'rename' }; render(); list.querySelector('.tcm-rename-input')?.focus(); }),
            button('删除', () => { editor = { key, type: 'delete' }; render(); list.querySelector('.tcm-confirm-cancel')?.focus(); }, 'tcm-danger'),
        );
        const selectLabel = el('label', 'tcm-select');
        selectLabel.append(checkbox);
        row.append(selectLabel, content, actions);
        if (editor?.key === key) row.append(renderEditor(owner, chat));
        return row;
    }

    function finishEditor(key) {
        editor = null;
        render();
        const row = [...list.querySelectorAll('.tcm-chat')].find(node => node.dataset.chatKey === key);
        row?.querySelector('.tcm-actions button')?.focus();
    }

    function renderEditor(owner, chat) {
        const key = chatKey(owner, chat.name);
        const form = el('form', 'tcm-editor');
        const cancel = button('取消', () => finishEditor(key), 'tcm-confirm-cancel');
        if (editor.type === 'delete') {
            form.append(el('p', '', `确定删除「${owner.name}」的「${chat.name}」？聊天无法恢复，角色卡保留。`));
            form.append(cancel, button('确认删除', () => mutate(async () => {
                await deleteOne(owner, chat);
                return '聊天已删除。';
            }), 'tcm-danger'));
            form.addEventListener('submit', event => event.preventDefault());
            return form;
        }
        const label = el('label', '', '新的聊天名称');
        const input = el('input', 'tcm-rename-input');
        input.value = chat.name;
        input.autocomplete = 'off';
        label.append(input);
        const error = el('p', 'tcm-error');
        error.id = 'tcm-rename-error';
        input.setAttribute('aria-describedby', error.id);
        error.setAttribute('role', 'alert');
        const submit = el('button', 'tcm-button tcm-primary', '保存名称');
        submit.type = 'submit';
        form.append(label, error, submit, cancel);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (busy) return;
            const message = validateName(input.value, chat.name, owner.chats);
            error.textContent = message;
            input.setAttribute('aria-invalid', String(Boolean(message)));
            if (message) { input.focus(); return; }
            const name = input.value.trim();
            input.blur();
            mutate(async () => {
                const committed = await host.renameChat(owner, chat.name, name);
                if (selected.delete(key)) selected.add(chatKey(owner, committed));
                return '聊天已重命名。';
            });
        });
        return form;
    }

    async function mutate(action) {
        if (busy) return;
        setBusy(true);
        tell('正在处理…');
        let result;
        try {
            result = await action();
            editor = null;
            batchConfirm = false;
            await readList();
            render();
            tell(result);
        } catch (error) {
            if (result) {
                owners = [];
                selected.clear();
                renderBatch();
                loaded = false;
                list.replaceChildren(el('p', 'tcm-empty', '操作已完成。请刷新列表后继续管理聊天。'));
            }
            tell(result ? `${result} 列表刷新失败，请点击刷新。` : error.message, true);
        } finally {
            setBusy(false);
            if (!editor) status.focus({ preventScroll: true });
        }
    }

    async function deleteOne(owner, chat) {
        await host.deleteChat(owner, chat.name);
        selected.delete(chatKey(owner, chat.name));
        owner.chats = owner.chats.filter(entry => entry !== chat);
    }

    async function removeSelected() {
        const targets = owners.flatMap(owner => owner.chats
            .filter(chat => selected.has(chatKey(owner, chat.name)))
            .map(chat => ({ owner, chat })));
        await mutate(async () => {
            let deleted = 0;
            for (const { owner, chat } of targets) {
                try { await deleteOne(owner, chat); deleted++; }
                catch (error) {
                    // Successful deletions are removed locally even if the backend is now unavailable.
                    editor = null;
                    batchConfirm = false;
                    render();
                    setBusy(true);
                    throw new Error(`已删除 ${deleted} 条；「${owner.name} / ${chat.name}」删除失败：${error.message}。其余未继续删除，请刷新列表。`);
                }
            }
            return `已删除 ${deleted} 条聊天。`;
        });
    }

    async function openChat(owner, chat) {
        if (busy) return;
        setBusy(true);
        try {
            await host.openChat(owner, chat.name);
            dialog.close();
        } catch (error) { tell(`无法打开聊天：${error.message}`, true); }
        finally { setBusy(false); }
    }

    async function createChat(owner) {
        if (busy) return;
        setBusy(true);
        tell('正在创建聊天…');
        try {
            await host.createChat(owner);
            dialog.close();
        } catch (error) { tell(`新建聊天：${error.message}`, true); }
        finally { setBusy(false); }
    }

    search.addEventListener('input', () => {
        editor = null;
        batchConfirm = false;
        // Selection belongs to the visible search, so hidden chats cannot be deleted by accident.
        selected.clear();
        render();
    });
    dialog.addEventListener('cancel', event => {
        if (busy) event.preventDefault();
        else if (editor) { event.preventDefault(); finishEditor(editor.key); }
    });
    dialog.addEventListener('close', () => { opener?.focus(); });
    const open = event => {
        if (dialog.open) return;
        opener = event.currentTarget;
        selected.clear();
        dialog.showModal();
        close.focus({ preventScroll: true });
        refreshList();
    };
    const menu = button('角色聊天管理', open, 'list-group-item flex-container flexGap5');
    menu.id = 'tcm-menu';
    const icon = el('i', 'fa-solid fa-comments extensionsMenuExtensionButton');
    icon.setAttribute('aria-hidden', 'true');
    menu.prepend(icon);
    document.getElementById('extensionsMenu')?.append(menu);
    const settings = el('div', 'tcm-settings');
    settings.append(button('打开角色聊天管理', open), el('small', '', '按角色卡浏览、重命名和删除聊天。'));
    document.getElementById('extensions_settings2')?.append(settings);
}

await window.__TAURITAVERN__.ready;
context().eventSource.on(context().eventTypes.APP_READY, mount);
