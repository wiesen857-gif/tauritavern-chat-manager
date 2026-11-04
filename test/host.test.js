import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('native host operations preserve openings, identities and failure results', async t => {
    const originals = { window: globalThis.window, SillyTavern: globalThis.SillyTavern, fetch: globalThis.fetch };
    const ctx = { characters: [{ avatar: 'same#1.png' }, { avatar: 'same#2.png' }] };
    const data = new Map([['same#1.png', ['旧聊天']], ['same#2.png', []], ['group-1', []]]);
    const calls = [];
    let generating = false, swallowedDelete = false, failSave = false, failSelect = false;
    const activeId = () => ctx.groupId || ctx.characters[ctx.characterId]?.avatar;
    const fixture = {
        isGenerating: () => generating,
        async doNewChat(options) {
            calls.push(['new', options]); ctx.chatId = `新聊天${calls.length}`;
            ctx.chat = [{ mes: '原生开场白', extra: { initialized: true } }];
        },
        async deleteCharacterChatByName(index, name) {
            calls.push(['delete', index, name]);
            if (!swallowedDelete) data.set(ctx.characters[index].avatar, data.get(ctx.characters[index].avatar).filter(n => n !== name));
        },
        async deleteGroupChatByName(id, name) { if (!swallowedDelete) data.set(id, data.get(id).filter(n => n !== name)); },
        async renameGroupOrCharacterChat() { return '新名称'; },
        async openGroupById(id, { chatId } = {}) {
            ctx.groupId = id; ctx.characterId = undefined;
            ctx.chatId = chatId ?? data.get(id)[0] ?? '群聊开场'; ctx.chat = [{ mes: '群聊原生开场' }];
        },
    };
    ctx.selectCharacterById = async (index, { chatFile } = {}) => {
        calls.push(['select', index]); if (failSelect) return;
        ctx.characterId = index; ctx.groupId = undefined;
        ctx.chatId = chatFile ?? data.get(ctx.characters[index].avatar)[0] ?? '首次开场';
        ctx.chat = [{ mes: '原生开场白', extra: { initialized: true } }];
    };
    // Older TT ignores an extra avatar argument and only opens the selected character.
    ctx.openCharacterChat = async name => {
        if (ctx.characterId === undefined) return;
        await ctx.selectCharacterById(ctx.characterId, { chatFile: name });
    };
    ctx.saveChat = async () => {
        calls.push(['save']); if (failSave) throw new Error('保存失败');
        const names = data.get(activeId()); if (!names.includes(ctx.chatId)) names.push(ctx.chatId);
    };
    ctx.getRequestHeaders = () => ({ 'Content-Type': 'application/json' });
    globalThis.window = { tcmFixture: fixture };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.fetch = async (_, options) => {
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify(data.get(body.avatar_url || body.group_id).map(file_name => ({ file_name }))));
    };
    const url = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
    const source = (await readFile(new URL('../host.js', import.meta.url), 'utf8'))
        .replace("'/script.js'", JSON.stringify(url('export const {isGenerating,doNewChat,deleteCharacterChatByName,renameGroupOrCharacterChat}=window.tcmFixture; export const isChatSaving=false;')))
        .replace("'/scripts/group-chats.js'", JSON.stringify(url('export const {openGroupById,deleteGroupChatByName}=window.tcmFixture;')));
    try {
        const host = await import(url(source));
        const owner = { kind: 'character', id: 'same#1.png' };
        await t.test('older host opens a specific character chat from the welcome page', async () => {
            await host.openChat(owner, '旧聊天');
            assert.equal(ctx.characterId, 0);
            assert.equal(ctx.chatId, '旧聊天');
        });
        await t.test('older host switches away from another role to the exact requested owner', async () => {
            ctx.characterId = 1; ctx.chatId = undefined;
            await host.openChat(owner, '旧聊天');
            assert.equal(ctx.characterId, 0);
            assert.equal(ctx.chatId, '旧聊天');
            assert.deepEqual(data.get('same#2.png'), []);
        });
        await t.test('existing character creates separate persisted chat with native opening', async () => {
            const name = await host.createChat(owner);
            assert.ok(data.get(owner.id).includes(name)); assert.ok(data.get(owner.id).includes('旧聊天'));
            assert.deepEqual(ctx.chat, [{ mes: '原生开场白', extra: { initialized: true } }]);
            assert.deepEqual(calls.find(c => c[0] === 'new')[1], { deleteCurrentChat: false });
        });
        await t.test('empty character creates only one chat under the exact avatar', async () => {
            const before = calls.filter(c => c[0] === 'new').length;
            await host.createChat({ kind: 'character', id: 'same#2.png' });
            assert.equal(ctx.characterId, 1); assert.equal(data.get('same#2.png').length, 1);
            assert.equal(calls.filter(c => c[0] === 'new').length, before);
        });
        await t.test('group creates native opening and persists it', async () => {
            await host.createChat({ kind: 'group', id: 'group-1' });
            assert.equal(ctx.groupId, 'group-1'); assert.equal(data.get('group-1').length, 1);
            assert.equal(ctx.chat[0].mes, '群聊原生开场');
        });
        await t.test('generation blocks creation, rename, deletion and opening before any writes', async () => {
            generating = true; const before = calls.length;
            for (const action of [() => host.createChat(owner), () => host.renameChat(owner, '旧聊天', '新名称'), () => host.deleteChat(owner, '旧聊天'), () => host.openChat(owner, '旧聊天')]) await assert.rejects(action, /停止/);
            assert.equal(calls.length, before); generating = false;
        });
        await t.test('old host swallowed deletion errors cannot produce false success', async () => {
            swallowedDelete = true; await assert.rejects(host.deleteChat(owner, '旧聊天'), /删除未完成/);
            assert.ok(data.get(owner.id).includes('旧聊天')); swallowedDelete = false;
            await host.deleteChat(owner, '旧聊天'); assert.ok(!data.get(owner.id).includes('旧聊天'));
            assert.deepEqual(calls.filter(c => c[0] === 'delete').at(-1), ['delete', 0, '旧聊天']);
        });
        await t.test('failed selection cannot create under the wrong role', async () => {
            failSelect = true; const before = calls.filter(c => c[0] === 'new').length;
            await assert.rejects(host.createChat(owner), /无法切换/);
            assert.equal(calls.filter(c => c[0] === 'new').length, before); failSelect = false;
        });
        await t.test('save error is reported and stops new-chat creation', async () => {
            failSave = true; const before = calls.filter(c => c[0] === 'new').length;
            await assert.rejects(host.createChat(owner), /保存失败/);
            assert.equal(calls.filter(c => c[0] === 'new').length, before); failSave = false;
        });
    } finally {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});
