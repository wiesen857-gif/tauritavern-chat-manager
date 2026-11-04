# 角色聊天管理

面向 TauriTavern 2.4.0（构建 `fff9af0333be`）的独立前端扩展，不依赖酒馆助手。

### 1.0.1 更新

修复部分 Android 安装包加载时提示 `/script.js` 没有导出 `deleteCharacterChat` 的问题。改用旧版与新版宿主共有的 `deleteCharacterChatByName(characterId, fileName)`，角色身份先通过精确头像文件名定位，再传入宿主要求的角色索引。

已安装用户在扩展管理中更新本扩展，再重新加载酒馆；若仍显示旧版本，可卸载扩展后使用同一仓库链接重新安装。卸载扩展不会删除聊天。

## 使用

在聊天输入框旁的魔杖扩展菜单点击 **角色聊天管理**。也可以在顶部扩展面板找到 **打开角色聊天管理**。

- 点击角色卡展开或收起它的聊天，群聊独立分类。
- 显示宿主提供的角色图像；JSON 身份、缺失图片或图片读取失败时显示“无”。TauriTavern 可能在导入 JSON 时将其转换为带默认头像的 PNG；这种情况下宿主已不再提供原始 JSON 身份，本扩展会显示宿主转换后的头像。
- 搜索角色、群聊或聊天名称；聊天按最后更新时间排序。
- 打开、重命名、删除聊天。名称与原生聊天列表一致。
- 勾选聊天后可以批量删除。改变搜索条件会清空勾选，避免误删隐藏条目。
- 删除需要再次确认；删除聊天不删除角色卡。删除操作无法撤销。
- 不含复制功能，不调用模型，不向外部服务发送聊天数据。

面板每次打开或点击“刷新”都会重新读取摘要。打开面板后若在其他位置导入角色或修改聊天，请刷新。

## 通过仓库链接安装

安装链接：**https://github.com/wiesen857-gif/tauritavern-chat-manager**

1. 复制上面的仓库链接。
2. 打开 TauriTavern 顶部的扩展面板，选择“安装扩展”。
3. 粘贴仓库链接并安装，然后按提示重新加载酒馆。
4. 在输入框旁的魔杖菜单点击“角色聊天管理”。

输入的是 **GitHub 仓库首页链接**，不是单个 JS 文件、ZIP 下载地址或 Releases 页面地址。仓库应为公开仓库，`manifest.json`、`index.js`、`model.js` 和 `style.css` 必须位于仓库根目录。

以后发布更新时将改动推送到同一仓库，使用者即可通过酒馆的扩展管理检查和安装更新。

## 手动安装与卸载

关闭或刷新酒馆前先保存正在编辑的内容。

将 `manifest.json`、`index.js`、`model.js`、`style.css` 放在实际数据目录的：

`default-user/extensions/tauritavern-chat-manager/`

然后重新加载酒馆。不要放进程序安装目录的 `default/` 资源模板目录。

可在酒馆扩展管理中禁用。卸载仅移除这个扩展目录；扩展没有另存一份聊天，也没有修改聊天格式。

## 开发与验证

无需安装依赖或构建：

```sh
npm run check
npm test
```

`model.js` 处理身份、分组、搜索及名称校验；`index.js` 负责界面与宿主操作。

宿主集成以 v2.4.0 的真实接口为准：

- `POST /api/chats/recent`：无数量上限的聊天摘要列表，不读取完整正文。
- `SillyTavern.getContext()`：角色、群组、头像、打开聊天和就绪事件。
- `/script.js` 的 `renameGroupOrCharacterChat`、`deleteCharacterChatByName`：复用宿主的重命名、删除及切换流程。删除参数为角色索引，不是头像文件名。`deleteCharacterChatByName` 同时见于宿主 v2.3.0 和 v2.4.0 的源码。
- `/scripts/group-chats.js` 的 `deleteGroupChat`：群聊删除及引用更新。

参考：

- https://github.com/Darkatse/TauriTavern/blob/fff9af0333be/src/script.js
- https://github.com/Darkatse/TauriTavern/blob/fff9af0333be/src/tauri/main/routes/chat-recent-routes.js
- https://github.com/Darkatse/TauriTavern/blob/fff9af0333be/src/scripts/st-context.js

升级 TauriTavern 后应重新验证这些接口。普通 SillyTavern 和手机实机未验证。
