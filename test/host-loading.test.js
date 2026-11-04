import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('extension loads when the host exports deleteCharacterChatByName without deleteCharacterChat', async () => {
    const originalWindow = globalThis.window;
    const originalTavern = globalThis.SillyTavern;
    let listener;
    globalThis.window = { __TAURITAVERN__: { ready: Promise.resolve() } };
    globalThis.SillyTavern = {
        getContext: () => ({
            eventTypes: { APP_READY: 'app_ready' },
            eventSource: { on(event, callback) { assert.equal(event, 'app_ready'); listener = callback; } },
        }),
    };
    try {
        const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
        const hostSource = (await readFile(new URL('../host.js', import.meta.url), 'utf8'))
            .replace("'/script.js'", JSON.stringify(moduleUrl('export async function deleteCharacterChatByName() {} export async function renameGroupOrCharacterChat() {}')))
            .replace("'/scripts/group-chats.js'", JSON.stringify(moduleUrl('export async function deleteGroupChatByName() {}')));
        const entry = source
            .replace("'./host.js'", JSON.stringify(moduleUrl(hostSource)))
            .replace("'./model.js'", JSON.stringify(new URL('../model.js', import.meta.url).href));
        await import(moduleUrl(entry)).catch(error => { throw new Error(error.message); });
        assert.equal(typeof listener, 'function', 'entrypoint must register its UI after host initialization');
    } finally {
        if (originalWindow === undefined) delete globalThis.window;
        else globalThis.window = originalWindow;
        if (originalTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = originalTavern;
    }
});
