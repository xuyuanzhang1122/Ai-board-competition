### Task 2: 统一右侧单项入口

**Files:** frontend EditorPage/ShotTable 相关行组件、panel-manager-store、RightPanelManager、图/视频面板及草稿/历史逻辑；相关测试。

**Interfaces:** 沿用 `openPanel('shot-image-generate'|'video-generate',{shotId,shotNo})`、项目资产 `asset-edit`。默认列表恢复其 activeTab；预览入口独立。

- [ ] 写并观察失败测试：行内生成操作打开同一右侧面板，不走单项弹窗；媒体不可用时按钮明确禁用；A/B 草稿与迟到结果隔离；返回保留列表分类，单次模型不改项目默认。
- [ ] 完成入口归一与必要目标草稿保护，保留绑定/大图/播放等非生成弹窗，批量参数冻结不受单项覆盖。
- [ ] 跑用户端全测试、类型/构建、scoped lint，浏览器验证五类入口、返回与不可用状态后提交。

