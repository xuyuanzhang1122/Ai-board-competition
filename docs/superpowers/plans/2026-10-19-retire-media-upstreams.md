# 旧媒体上游退出 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Existing approved competition plan and continued execution authorization apply.

**Goal:** 删除图片/视频旧上游的 HTTP 实现、默认凭据入口及自动回退；未核验的新媒体能力明确拒绝调用，保留历史素材和任务记录。

**Architecture:** 图片、视频业务分别依赖中立 provider 接口与结果类型。当前唯一实现明确不可用，无传输客户端、端点或凭据；所有生成/查询/下载/参考图上传方法均拒绝。模型目录关闭媒体项，管理员不能重新启用；未来官方适配器须独立完成能力和预算核验后替换不可用实现。

**Tech Stack:** Java 17、Spring、MyBatis、增量 MySQL 迁移；H2 和离线测试，无新依赖。

**Spec:** `docs/competition/改造方案与实施计划.md` 第六节、M1；`AGENTS.md` 的全部旧上游替换硬约束。沿用独立参赛仓库和当前分支，原项目只读。

## Global Constraints

- 不读取本机密钥，不启动真实服务，不发模型请求，不推送远程。
- 不删历史迁移、素材、钱包、审计与已完成任务；旧在途任务不重新提交。
- 没有经过文档/账户/计费核验，不伪造模型 ID、官方协议和可用性。
- 本批是退出旧上游与建立接口边界，不宣称图片/视频官方适配器已可用。

## Review Focus

- 工具箱、批量、MQ、恢复、轮询和下载不能旁路到旧客户端。
- 不可用能力在新建任务、计费和发 MQ 前拒绝；历史素材读取仍可用。
- 数据库旧启用标记和管理员操作不能恢复已移除的能力。
- 关闭旧任务保留外部任务 ID、结果和待核对信息，不能编造已退款或上游已取消。
- 删除旧协议测试应只涉及已移除的客户端，保留并迁移业务状态测试。

## Task 1：中立媒体接口与旧传输退出

**Files:** 新建 `provider/ImageGenerationProvider.java`、`VideoGenerationProvider.java`、结果类型与 `UnavailableMediaProvider.java`；调整引用客户端的 service/MQ；删除三个旧 HTTP 客户端和图片渠道路由。

- [ ] 新增不可用 provider 的生成/查询/下载/参考图拒绝及入口无副作用测试，先观察失败。
- [ ] 用中立结果迁移业务依赖，移除旧端点、重试和回退实现；历史结果处理继续保留。
- [ ] 迁移业务测试到中立接口，仅删除旧 HTTP 协议的成功契约测试。
- [ ] 验证并提交。

## Task 2：目录与配置停用

**Files:** `AiProperties.java`、`.env.example`、模型 policy；新建 `V35__retire_legacy_media_models.sql` 和迁移/目录测试。

- [ ] 新增迁移保留历史、关闭媒体模型和计费项、管理员拒绝媒体启用测试，先观察失败。
- [ ] 删除旧凭据和媒体模型默认配置；目录过滤和管理员启用均拒绝未核验媒体能力。
- [ ] 验证并提交。

## Task 3：审查与记录

- [ ] 运行 Java 单元/隔离集成、Python 和静态扫描，记录完整启动测试的既有 H2/MySQL 限制。
- [ ] 一次独立只读审查，重要问题先复现再修复。
- [ ] 更新实施记录和剩余真实接入关卡，提交并报告工作区。
