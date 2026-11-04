# 已上传的原始工作资料

2026-11-04 按用户要求补传。除实际 API key、登录令牌和密码所在文件外，现有资料按原文件上传，没有重写、脱敏替换普通内容或重新生成验收结果。

逐文件结果见 [UPLOAD-MANIFEST.json](./UPLOAD-MANIFEST.json)：包括原路径、上传路径、原始大小、SHA-256 和排除原因。此次清单覆盖本机原有的 201 个 credentials 文件及父目录 5 个源资料文件。

- `runtime/`：原始过程 JSON、验收脚本、截图、Excel、构建及测试日志、独立审查记录和现有 `application.jar`。记录仅证明其记载时点的本机验收，不等同于云端已通过。
- `runtime/acceptance-2026-11-01-prompts-panels-partial/`：上一阶段任务简报、实施报告、复审、代码差异和验证日志。
- 原始后端日志超过 GitHub 单文件大小限制，保存为 `runtime/backend.log.gz`，仅使用无损 gzip 压缩。`gzip -dk credentials/runtime/backend.log.gz` 可恢复相同字节的日志；清单记录解压后 SHA-256。
- 父目录最初设想、原始实施计划、赛事 PDF/Word 附件和原始抓包 ZIP 见 [source-materials](../docs/competition/source-materials/)。仓库现行实施计划与父目录原版有后续修订，两份均保留。

实际未上传的凭据文件：`probe.env`、`runtime/kling-api.env`、`runtime/application.properties`、`runtime/admin-session.json`、`runtime/chat-user-session.json`、`runtime/isolation-user-session.json`、`runtime/user-session.json`、`runtime/验收账号.txt`、`runtime/新对话验收账号.txt`。此外仅排除 `.DS_Store`、三个 PID 文件和一个运行锁文件。原件均保留本机。

这些是历史工作原件，脚本中可能含本机绝对路径、端口和对本机登录会话的引用。云端可以直接阅读并接续实现；执行历史联调脚本前须使用云端服务和登录会话，不能把上传资料等同于迁移了本机数据库或账号。现有依赖服务配置见 `infra/competition/compose.yaml` 及同目录 `.env.example`；安装与启动说明见 `infra/codex-cloud/`。

目录仍由 `.gitignore` 默认保护，防止今后新产生的真实凭据被批量提交。清单内原件已显式纳入 Git 跟踪，克隆或更新仓库即可取得，无须重新生成。
