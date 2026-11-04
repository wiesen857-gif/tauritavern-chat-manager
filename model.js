export function chatStem(name) {
    return String(name ?? '').replace(/\.jsonl$/i, '');
}

export function ownerKey(kind, id) {
    return JSON.stringify([kind, String(id)]);
}

export function chatKey(owner, name) {
    return JSON.stringify([owner.kind, owner.id, name]);
}

export function hasImage(avatar) {
    return typeof avatar === 'string' && /\.(png|jpe?g|webp|gif|avif)$/i.test(avatar);
}

// Names are display text; identity always comes from the host's avatar/group ID.
export function buildOwners(characters, groups, summaries) {
    const owners = new Map();
    for (const character of characters) {
        if (!character?.avatar || character.avatar === 'none') continue;
        const id = character.avatar;
        owners.set(ownerKey('character', id), {
            kind: 'character', id, name: character.name || '未命名角色',
            avatar: hasImage(id) ? id : null, chats: [],
        });
    }
    for (const group of groups) {
        if (group?.id == null) continue;
        const id = String(group.id);
        owners.set(ownerKey('group', id), {
            kind: 'group', id, name: group.name || '未命名群聊', avatar: null, chats: [],
        });
    }
    for (const summary of summaries) {
        const name = chatStem(summary.file_name);
        if (!name) continue;
        const key = summary.group != null
            ? ownerKey('group', summary.group)
            : ownerKey('character', summary.avatar);
        let owner = owners.get(key);
        if (!owner) {
            const orphanKey = ownerKey('orphan', '');
            if (!owners.has(orphanKey)) owners.set(orphanKey, {
                kind: 'orphan', id: '', name: '未关联角色的聊天', avatar: null, chats: [],
            });
            owner = owners.get(orphanKey);
        }
        owner.chats.push({
            name, count: Number(summary.chat_items || 0),
            time: Number(summary.last_mes || 0), preview: String(summary.mes || ''),
        });
    }
    for (const owner of owners.values()) owner.chats.sort((a, b) => b.time - a.time || a.name.localeCompare(b.name, 'zh-CN'));
    return [...owners.values()].sort((a, b) =>
        (a.kind === 'orphan') - (b.kind === 'orphan') || a.name.localeCompare(b.name, 'zh-CN'));
}

export function filterOwners(owners, query) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return owners;
    return owners.map(owner => ({
        ...owner,
        chats: owner.name.toLocaleLowerCase().includes(needle)
            ? owner.chats : owner.chats.filter(chat => chat.name.toLocaleLowerCase().includes(needle)),
    })).filter(owner => owner.name.toLocaleLowerCase().includes(needle) || owner.chats.length);
}

export function validateName(input, oldName, chats) {
    const name = input.trim();
    if (!name) return '请输入聊天名称。';
    if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..') {
        return '名称不能包含路径分隔符、特殊文件名字符或以句点结尾。';
    }
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return '这个名称被系统保留，请换一个名称。';
    if (/\.jsonl$/i.test(name)) return '无需填写 .jsonl 后缀。';
    if (new TextEncoder().encode(name).length > 240) return '名称太长，请缩短后重试。';
    const same = value => value.localeCompare(name, undefined, { sensitivity: 'base' }) === 0;
    if (same(oldName)) return '请输入与原名称不同的名称。';
    if (chats.some(chat => same(chat.name))) return '该角色下已有同名聊天，请换一个名称。';
    return '';
}
