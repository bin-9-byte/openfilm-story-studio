# 浏览器本地版与 Vercel 部署

这个版本直接在浏览器运行剧本导演工作台。Vercel 只发送网页、脚本、字体等静态资源；剧本、场次、分镜图和视频保存在当前浏览器的 IndexedDB，不上传到 Vercel。无需启动 OpenFilm Node 服务。

## 启动与部署

需要 Node.js 22.18+、pnpm 9.15.9。

```sh
pnpm install --frozen-lockfile
pnpm --filter openfilm build:browser
pnpm --filter openfilm exec vite preview --config studio/ui/vite.config.ts --mode browser --host 127.0.0.1 --port 4750
```

在 Vercel 导入 `bin-9-byte/openfilm-story-studio`，根目录保持仓库根目录。根目录 `vercel.json` 已指定安装命令、浏览器版构建命令、静态输出目录、工程路由回退及 Service Worker 的缓存头。不需要云数据库、服务端密钥或 Vercel Functions。

正式网址：https://openfilm-story-studio.vercel.app/

首次联网安装仅预缓存编辑器所需的 39 项资源（约 5.5 MB 未压缩，传输会压缩），显示下载进度；内置教程预览图、视频等在使用后缓存，用户工程素材独立存入 IndexedDB。界面出现“离线就绪”后可以断网刷新、从已访问的工程网址打开、关闭浏览器后重开，并继续创作。新版本准备好后提供“保存并更新”，不会在写作中自动刷新。

## 使用

1. 打开网页，新建工程。默认提供 A、B 两条剧本线和一条场次划分轨，也可以新增并命名其他剧本线。
2. 在剧本线新增节拍并填写正文；「按段落编辑与引用」编辑稳定段落，「关联到另一条故事线」复用同一正文。片段可独立拖拽，正文共享。
3. 选中节拍或时间范围划为场次；也可直接「新建空场次」，无需先写节拍。场次的「编辑来源关联」可分别选择来源段落。
4. 进入场内分镜，填写镜头、景别、运镜、备注和关联节拍，添加本机分镜图；素材库可以导入本机图片、视频并拖入时间轴。
5. 保留原版时间轴拖拽、留空、修边、吸附、分割、轨道操作和整次撤销／重做；同轨节拍碰撞后推，关联节拍仍按原规则跟随场次。
6. 用“全片总览”串读剧本、查看各场分镜并定位到对应轨道。
7. 顶栏“导出工程”下载完整 `.openfilm.json` 备份。“本机工程”可以导入这个备份，也可导入包含 `film.html` 的完整 OpenFilm 工程文件夹。

分镜图、视频、未引用但仍用于重做的素材、各场 `film.html`、帧率、轨道设置和标记包含在工程备份中；素材逐项校验 SHA-256，导入验证完毕后整批提交，不覆盖原工程。切换设备或浏览器需要导出再导入。自动保存是每次写入 IndexedDB 成功后确认，不依赖关闭页面时保存。

当前设备、浏览器和网站域名共同决定数据位置：预览域名和正式域名不会共享工程。请固定使用正式域名；清除网站数据、使用隐私窗口或浏览器回收存储可能导致工程丢失，因此保留导出备份。浏览器会尝试申请持久存储；拒绝申请不影响编辑。撤销沿用原编辑器的会话历史，跨场次跳转保留，刷新或重启后不保证恢复撤销栈。

## 版本边界

浏览器版面向剧本、故事线、场次、分镜与基础剪辑，使用浏览器自身解码图片和视频。视频格式受浏览器支持范围限制，优先使用可播放的 MP4/WebM。

依赖本机 FFmpeg、Git、外部智能体或 Node 插件执行的能力保留在原 Node 版：包括服务端 MP4 渲染／转码、任意 HTML 动画项目的执行预览、云端生成和原生版本快照。这些能力没有伪装为已迁移的浏览器功能；浏览器版顶栏导出的是完整工程备份。声音设计仍见 TODO.md。

原 Node 版不受浏览器构建模式影响：`pnpm --filter openfilm build:ui` 后仍按 STORY-WORKBENCH.md 启动，可继续使用其本机扩展能力。

## 实现

- `src/browser/storage.ts`：IndexedDB 数据层；工程值与素材分别存储，影片修改用同一读写事务检查 revision 并执行完整原生 `applyOps`。并发旧版本写入返回冲突，操作失败整批回滚。
- `local-api.ts`：原编辑器接口的本地适配层，沿用工程格式和原编辑器的撤销与剪辑实现。没有转发业务请求到网络。
- `service-worker.ts`：本地请求、带 Range 的素材读取和版本化离线应用外壳。完整预缓存成功后才安装，工程数据不放入应用缓存，更新不会清除工程库。
- `BrowserPreview.tsx`：原生图片／视频预览，使用真实视频时长，支持复合场次与镜头时序。导入的 HTML 作为工程数据读取，不在编辑器源下执行；素材响应增加隔离策略。
- `archive.ts`：一致性快照备份；导出等待当前写入与素材导入完成，再在一个只读事务中取得工程和素材快照。

## 已实测

在只提供静态文件的 4750 端口测试，没有使用 4747 的本机业务接口：

- 原片验证工程：13 个完整剧本节拍、2 个场次及各场分镜；正文编辑、真实时间拖拽与修边、碰撞处理和整次撤销。
- 8 镜场次中的分镜图读取、独立内容编辑、往返场次后撤销。
- 断网刷新恢复工程与分镜图，断网新增镜头与撤销，完整导出／导入后关闭并重启浏览器离线恢复。
- 空白工程：新增正文、选区划为场次、进入新场次填写分镜。
- 本机生成的 2 秒 MP4：导入、真实时长、拖入时间轴、浏览器解码、断网重开后的预览。
- 并发 revision 冲突、无效批次回滚，以及工程备份恢复帧率和自定义轨道设置。
- 119 项原有故事、剪辑、撤销和布局测试通过。

回归脚本：

```sh
node scripts/check-browser-create.mjs
node scripts/check-browser-storage.mjs
# 原片验证样例及其素材由本机独立提供，不包含在公开仓库。
node scripts/check-browser-offline.mjs "/绝对路径/原片验证样例"
```

可用 `BROWSER_URL` 指定正式部署地址，`CHROME_PATH` 指定 Chrome 可执行文件。合成测试视频在 `scripts/fixtures/browser-preview.mp4`，由 FFmpeg `testsrc2` 生成，不含原片素材。


新增基础关系的回归脚本：

```sh
node --experimental-strip-types --test packages/openfilm/studio/ui/src/lib/story-documents.test.ts
BROWSER_URL=http://127.0.0.1:4751 node scripts/check-story-documents.mjs "/绝对路径/原片验证样例"
```

该脚本以原片样例验证跨场段落引用、同一正文关联 A/B 两线及独立拖动、新建空场次和空镜头、镜头段落关联，以及离线重开和完整备份恢复。公开仓库不包含原片素材。


幕／序列与稳定场号：编辑区展开「幕／序列与场号」，可创建分组并归入所选节拍／场次。旧工程可一次「固定现有场号」；新增场次会自动分配场号，移动不重排，删除保留号段。分组与场号和正文一起保存在本机，包含在完整工程备份中。规则与验收见 `story-structure.md`。

```sh
node --experimental-strip-types --test packages/openfilm/studio/ui/src/lib/story-structure.test.ts
BROWSER_URL=http://127.0.0.1:4751 node scripts/check-story-structure.mjs "/绝对路径/原片验证样例"
```
