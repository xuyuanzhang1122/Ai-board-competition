# 文本调用预算与服务端准入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 所有官方文本调用在发出请求前验证数据库启用状态并持久化预留人民币额度，受理不明时停止后续调用。

**Architecture:** 在现有官方文本适配器集中校验并预留，覆盖文本任务和直接剧本调用。独立短事务保存额度及调用审计，不随业务事务回滚；HTTP 请求不占用数据库事务。默认预算 20 元，未配置已核验价格时拒绝调用。

**Tech Stack:** Java 17、Spring JDBC / TransactionTemplate、MySQL 增量迁移；H2 隔离测试与模拟 HTTP，无新依赖。

**Spec:** `docs/competition/改造方案与实施计划.md` 的统一生成服务、预算、任务审计要求；用户已确认参赛免费、真实用量记录、20–50 元预算。延续已授权的本会话直接实施。

## Global Constraints

- 仅修改参赛仓库；不读复制来的密钥配置，不启动原数据库和队列，不推送远程。
- 用户积分费用零与供应商人民币成本分离。默认新上游关闭；本轮不发起真实付费请求。
- 固定单个预算账户初始 20.000000 元；价格缺失、过期或不合法拒绝，不编造真实价格。
- 每次预留依据已核验的模型最大计费输入 token 数及本次最大输出 token 数，使用人民币单价计算上界，向上取到小数点后 6 位。价格配置必须包含版本、核验时间、依据和实际响应模型标识；7 天后重新核验。
- 预留不会自动退款或按不完整用量释放；成功也保留完整上界。因此额度表示保守占用，不等于实际账单。配置上界正确性需账户实测及供应商价格核验，不能宣称能限制供应商计费系统本身。
- 网络/解析异常、缺失用量、响应模型或用量越界均标为待核对并冻结新预留。中断后保留 `RESERVED`，不自动重新发送。
- 保留历史 Flyway、钱包和用量；新增表。图片/视频仍待下一阶段接入同一额度账户，不宣称全链路预算完成。

## Review Focus

- 同时到达的调用必须竞争同一账户额度，不能因并发超过 20 元。
- 外层业务事务失败不能撤回已经发出的调用的预留和审计。
- HTTP 之前的模型停用、错误供应商、缺失/过期价格和额度不足应拒绝，不能绕过直接调用入口。
- HTTP 超时、响应损坏和未知用量不可按零成本处理，不得自动重试或释放预留。
- 管理端停用仍必须可执行；新启用须先具备有效预算配置，预算只读接口不提供提额或退款捷径。

## Task 1：服务端文本准入

**Files:** 新建 `provider/TextModelAccess.java`；修改 `provider/OfficialTextProvider.java`；测试 `provider/TextModelAccessTest.java`、`provider/OfficialTextProviderTest.java`。

**Interfaces:** `TextModelAccess.requireEnabled(String model)` 通过 AiModelMapper 查代码并校验启用、语言类型及供应商。适配器在 validateRequest 和实际提交前使用；配置校验保持独立，管理员可从停用状态启用合法模型。

- [x] 添加停用/缺行/供应商或类型错误拒绝、合法启用允许测试，先观察失败。
- [x] 实现服务端校验并接入适配器，模拟 HTTP 验证无绕过请求。
- [x] 运行相关文本/目录/任务测试，检查 diff 并提交。

## Task 2：持久化额度和审计

**Files:** 新建 `budget/TextBudgetProperties.java`、`TextBudgetPolicy.java`、`TextBudgetLedger.java`；新增 `V34__generation_budget_ledger.sql`；新建对应 policy / ledger 测试。

**Interfaces:** `TextBudgetPolicy.quote(String model, int maxTokens)` 返回不可变版本化价格上界快照；`TextBudgetLedger.reserve(Quote, Long userId)` 返回 reservation；`complete(reservation, result)` 保存真实 token 和响应 ID；`requireReview(reservation, reason)` 保留额度并冻结；`status()` 只读摘要。

- [x] 添加缺价格/过期/未来时间/非法小数/向上取整测试，先观察失败。
- [x] 实现默认关闭的配置与不可变上界快照；不填真实模型价格。
- [x] 添加 H2 执行生产 V34、并发占用 20 元上限、外层回滚仍保留预留、重复完成不改写、未知用量冻结测试，先观察失败。
- [x] 独立 REQUIRES_NEW 短事务完成条件扣占和审计入库；不在网络调用期间持锁。
- [x] 运行测试并提交可独立验证单元。

## Task 3：适配器集成、结果关联及文档

**Files:** 修改 `provider/OfficialTextProvider.java`、`provider/TextGenerationResult.java`、`service/AiTextService.java`；新建只读 `controller/AdminGenerationBudgetController.java`；扩展 protocol / ledger / service 测试；新增实施记录。

**Interfaces:** TextGenerationResult 增加输入/输出 token 和预算预留 ID，保留五参兼容构造；Job 元数据保存关联 ID 与实际用量。预算摘要使用 `/api/admin/generation-budget`，由既有管理员拦截器保护。

- [x] 模拟供应商测试验证先预留后 POST、无额度不 POST、异常待核对、返回关联 ID；先观察失败。
- [x] 将所有适配器调用接入预算服务，保留不重试及错误脱敏；真实价格和密钥仍缺失时保持拒绝。
- [x] 跑完整相关 Java、Python 回归及 diff 检查；一次独立只读审查，重要问题用失败测试复现后修复。
- [x] 更新实施记录，区分 H2/模拟验证与真实 MySQL/供应商验证；提交并报告状态。
