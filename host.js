import * as core from '/script.js';
import * as groups from '/scripts/group-chats.js';

const context = () => SillyTavern.getContext();

function requireFunction(object, name) {
    if (typeof object[name] !== 'function') throw new Error(`当前 TT 缺少 ${name} 接口，请更新 TT 后重试。`);
    return object[name];
}

export function assertIdle() {
    if (requireFunction(core, 'isGenerating')()) throw new Error('请先停止正在进行的生成，再管理聊天。');
    if (core.isChatSaving) throw new Error('聊天正在保存，请稍后重试。');
}

function characterIndex(owner) {
    const index = context().characters.findIndex(character => character.avatar === owner.id);
    if (index < 0) throw new Error('角色已不存在，请刷新列表。');
    return index;
}

function isSelected(owner) {
    const ctx = context();
    return owner.kind === 'group' ? String(ctx.groupId) === owner.id
        : !ctx.groupId && ctx.characters[ctx.characterId]?.avatar === owner.id;
}

async function chatNames(owner) {
    const ctx = context();
    const response = await fetch('/api/chats/search', {
        method: 'POST', headers: ctx.getRequestHeaders(),
        body: JSON.stringify(owner.kind === 'group' ? { group_id: owner.id, query: '' } : { avatar_url: owner.id, query: '' }),
    });
    if (!response.ok) throw new Error(`无法核对聊天保存结果（${response.status}），请刷新列表确认。`);
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('宿主返回的聊天列表格式不正确。');
    return result.map(chat => String(chat.file_name).replace(/\.jsonl$/i, ''));
}

export async function openChat(owner, name) {
    assertIdle();
    const ctx = context();
    if (ctx.chatId) await ctx.saveChat();
    assertIdle();
    if (owner.kind === 'group') await requireFunction(groups, 'openGroupById')(owner.id, { chatId: name });
    else await requireFunction(ctx, 'selectCharacterById')(characterIndex(owner), { switchMenu: false, chatFile: name });
    if (!isSelected(owner) || context().chatId !== name) throw new Error('宿主未能打开该聊天，请稍后重试。');
}

export async function renameChat(owner, oldName, newName) {
    assertIdle();
    const committed = await requireFunction(core, 'renameGroupOrCharacterChat')({
        characterId: owner.kind === 'character' ? characterIndex(owner) : undefined,
        groupId: owner.kind === 'group' ? owner.id : undefined,
        oldFileName: oldName, newFileName: newName, loader: false,
    });
    if (!committed) throw new Error('宿主未完成重命名，请查看提示并重试。');
    return committed;
}

export async function deleteChat(owner, name) {
    assertIdle();
    if (owner.kind === 'group') await requireFunction(groups, 'deleteGroupChatByName')(owner.id, name);
    else await requireFunction(core, 'deleteCharacterChatByName')(characterIndex(owner), name);
    // Older TT functions can report an error without rejecting their Promise.
    if ((await chatNames(owner)).includes(name)) throw new Error('聊天仍然存在，删除未完成。请刷新列表后重试。');
}

export async function createChat(owner) {
    assertIdle();
    const create = requireFunction(core, 'doNewChat');
    const select = owner.kind === 'group' ? requireFunction(groups, 'openGroupById')
        : requireFunction(context(), 'selectCharacterById');
    const alreadySelected = isSelected(owner);
    if (context().chatId) await context().saveChat();
    const existing = await chatNames(owner);
    if (owner.kind === 'group') await select(owner.id);
    else await select(characterIndex(owner), { switchMenu: false });
    if (!isSelected(owner)) throw new Error('无法切换到所选角色或群聊，未创建新聊天。');
    assertIdle();
    // Selecting a character with no saved chats already initializes its first opening.
    if (existing.length || alreadySelected) await create({ deleteCurrentChat: false });
    const ctx = context();
    if (!isSelected(owner) || !ctx.chatId || existing.includes(ctx.chatId)) {
        throw new Error('宿主未创建独立的新聊天，原聊天已保留，请稍后重试。');
    }
    await ctx.saveChat();
    if (!(await chatNames(owner)).includes(ctx.chatId)) throw new Error('新聊天尚未保存，请在酒馆中确认保存结果后再试。');
    return ctx.chatId;
}
