import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwners, filterOwners, hasImage, validateName, chatStem } from '../model.js';

test('same-name character cards keep separate histories and exact avatar identities', () => {
    const owners = buildOwners([{ name: '同名', avatar: 'Alice#1.png' }, { name: '同名', avatar: 'Alice#2.png' }], [], [
        { avatar: 'Alice#1.png', file_name: '第一局.jsonl', chat_items: 3, last_mes: 100 },
        { avatar: 'Alice#2.png', file_name: '第二局.jsonl', chat_items: 7, last_mes: 200 },
    ]);
    assert.deepEqual(owners.map(owner => [owner.id, owner.chats.map(chat => chat.name)]), [
        ['Alice#1.png', ['第一局']], ['Alice#2.png', ['第二局']],
    ]);
});

test('JSON and missing portraits show no image; PNG cards retain their own image', () => {
    assert.equal(hasImage('角色.json'), false);
    assert.equal(hasImage(undefined), false);
    assert.equal(hasImage('none'), false);
    assert.equal(hasImage('Alice#1.png'), true);
    const owners = buildOwners([{ avatar: '角色.json', name: '无图角色' }], [], []);
    assert.equal(owners[0].avatar, null);
    assert.deepEqual(owners[0].chats, []);
});

test('group chats are distinct from character chats and missing owners remain visible', () => {
    const owners = buildOwners([{ avatar: '1.png', name: '角色' }], [{ id: '1', name: '群聊' }], [
        { avatar: '1.png', file_name: '同名.jsonl' },
        { group: '1', file_name: '同名.jsonl' },
        { avatar: '', file_name: '遗留聊天.jsonl' },
    ]);
    assert.equal(owners.length, 3);
    assert.equal(owners.find(owner => owner.kind === 'character').chats.length, 1);
    assert.equal(owners.find(owner => owner.kind === 'group').chats.length, 1);
    assert.equal(owners.find(owner => owner.kind === 'orphan').chats[0].name, '遗留聊天');
});

test('search finds unopened chats and leaves the complete source list intact', () => {
    const owners = buildOwners([{ avatar: 'a.png', name: '角色甲' }], [], [
        { avatar: 'a.png', file_name: '春日.jsonl', last_mes: 10 },
        { avatar: 'a.png', file_name: '夏日.jsonl', last_mes: 20 },
    ]);
    assert.deepEqual(filterOwners(owners, ' 春日 ')[0].chats.map(chat => chat.name), ['春日']);
    assert.equal(filterOwners(owners, '不存在').length, 0);
    assert.equal(filterOwners(owners, '角色甲')[0].chats.length, 2);
    assert.deepEqual(owners[0].chats.map(chat => chat.name), ['夏日', '春日']);
});

test('rename rejects empty, path-like, reserved and duplicate names', () => {
    for (const name of ['', '  ', '../bad', 'folder/name', 'x\\y', 'a:b', 'nul', 'COM1.txt', 'a.', 'new.jsonl', '旧名', 'EXISTING']) {
        assert.notEqual(validateName(name, '旧名', [{ name: 'existing' }]), '', name);
    }
    assert.equal(validateName(' 新的一局 #2 ', '旧名', []), '');
    assert.notEqual(validateName('字'.repeat(100), '旧名', []), '');
    assert.equal(chatStem('name.jsonl.jsonl'), 'name.jsonl');
});

test('untrusted display text stays unchanged as data, never interpreted by the model', () => {
    const name = '<img src=x onerror=alert(1)>';
    const owners = buildOwners([{ avatar: 'a.png', name }], [], [{ avatar: 'a.png', file_name: '聊天.jsonl', mes: name }]);
    assert.equal(owners[0].name, name);
    assert.equal(owners[0].chats[0].preview, name);
});
