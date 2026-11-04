### Task 3: 指定镜头局部重生成

**Files:** creation/CreationTypes、CreationService、新迁移（若需要）、CreationServiceTest；frontend creation types/api/hook/page/编辑器与测试。

**Interfaces:** 新增 POST `/api/creation/drafts/{id}/partial-runs` body `{requestId,revision,model,shotIds,lockedShotIds,instruction}`，返回已有 Run；stage=`STORYBOARD_PARTIAL`。冻结完整现有分镜、简报、已确认剧本及所选/锁定 ID。已有采用接口处理候选；Run.output 为可核对完整分镜候选，只将指定镜头替换回原数据；锁定集合持久化于草稿（独立于 Board），新增 PUT `/api/creation/drafts/{id}/shot-locks` `{revision,lockedShotIds}` 返回 Draft，Draft 增加 `lockedShotIds` 数组；锁定变化递增版本并保存审计，从而拒绝运行后新增锁定的旧候选。局部请求中的 lockedShotIds 必须与服务端当前锁定集合相同。

- [ ] 写并观察失败测试：UUID 幂等/改变目标拒绝、跨用户、空/未知/重复/锁定目标、未确认/过期剧本；输出只准所选镜头、ID/序号/时长/资产/来源校验；旧候选不能覆盖新编辑。
- [ ] 模板 `STORYBOARD_PARTIAL` 返回 `{shots:[完整 Shot 对象]}`；服务端要求输出集合精确匹配选中镜头，合并到冻结原分镜，完整校验后才成为 SUCCEEDED 候选。后台持久 jobs，不自动重复未知受理调用；采用由用户显式触发并保存事件。
- [ ] 页面提供镜头勾选与锁定、局部修改要求、明确目标数，使用现有恢复副本和原 UUID；脏编辑先保存，运行中不可混改提交目标；候选展示/采用沿用既有机制。
- [ ] 跑后端/用户端完整测试、构建；实际文字局部运行验收只改一个镜头、其他人工镜头保留，刷新/幂等/过期拒绝/导出证据验证后提交。

