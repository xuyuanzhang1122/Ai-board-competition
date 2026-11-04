# 文件职责清单

参赛改造当前状态、原始需求对照和剩余任务见[项目状态与任务总表](./competition/项目状态与任务总表.md)；本清单中原工程描述需结合参赛改造记录阅读。

本清单按“目录约定 + 关键文件 + 同类文件规则”覆盖仓库代码。对于 DTO、Entity、Mapper 等高度规则化文件，不重复逐个解释同一套 CRUD 语义，而是给出完整域分组和命名规则。

## 1. 根目录

| 文件/目录 | 作用 | 是否进入镜像/版本库 |
| --- | --- | --- |
| `.gitignore` | 忽略本地密钥（`.env*`）、`application.yml`/`application-*.yml`、依赖、构建产物、IDE 文件和历史交接文档 | 版本库 |
| `.dockerignore` | 缩小 Docker build context，排除 `.env`/`.env.local` 等真实密钥文件 | Docker 构建控制 |
| `.env.example` | 环境变量模板（数据库/Redis/RabbitMQ/JWT/AI Provider Key 等） | 版本库，不含真实密钥 |
| `docker-compose.yml` | 唯一的 Docker 编排文件：MySQL/Redis/RabbitMQ + 后端 + 用户端 + 管理端 | 开发/自部署 |
| `Dockerfile.backend` | Maven 构建 JAR，JRE 运行 | 后端镜像 |
| `Dockerfile.frontend` | npm 锁定安装、Vite 构建、Nginx 运行用户端 | 用户端镜像 |
| `Dockerfile.admin` | pnpm 锁定安装、Vite 构建、Nginx 运行管理端 | 管理端镜像 |
| `nginx.conf` | SPA fallback、静态缓存、上传上限、API/上传代理、`/health` 健康端点 | 两个前端镜像 |
| `README.md` | 项目入口与快速启动说明 | 版本库 |
| `GENERATION_RESUME_PLAN.md` | 生成任务刷新恢复功能的历史设计/实施计划 | 设计记录 |
| `LICENSE` | MIT 许可证 | 版本库 |

`.env`、`backend/.env*`、`backend/src/main/resources/application.yml`、`application-*.yml` 都是本地专属配置，被 `.gitignore` 排除，不进入版本库，也不会发送进 Docker build context。

## 2. 用户端 `frontend/`

### 构建与入口

| 文件 | 作用 |
| --- | --- |
| `package.json` | 用户端依赖和 `dev/build/test/lint/type-check` 脚本 |
| `package-lock.json` | Dockerfile 使用的 npm 确定性依赖锁 |
| `pnpm-lock.yaml` / `pnpm-workspace.yaml` | 本地 pnpm 工作流兼容；需避免和 npm 锁产生双源漂移 |
| `vite.config.ts` | React/Tailwind 插件、`@` alias、3000 端口、`/api` 与 `/uploads` 开发代理 |
| `tsconfig*.json` | 浏览器/Node TypeScript 编译边界 |
| `eslint.config.mjs`、`stylelint.config.mjs`、`prettier.config.mjs` | 代码、样式与格式规范 |
| `index.html` | Vite HTML 入口 |
| `src/main.tsx` | 挂载 React Router 和全局 Provider |
| `src/index.css` | Tailwind 入口、主题变量和全局样式 |

### `src/app/`

| 文件 | 作用 |
| --- | --- |
| `router.tsx` | 登录守卫和 home/toolbox/wallet/recharge/editor 路由；页面按路由懒加载 |
| `providers.tsx` | Lobe 主题、TanStack Query、全局反馈宿主 |
| `MainLayout.tsx` | 登录后侧栏、功能开关、用户资料与一级 Outlet |
| `Placeholder.tsx` | 尚未完成页面的占位视图 |

### `src/shared/`

| 路径 | 作用 |
| --- | --- |
| `api/client.ts` | Axios 实例、JWT 注入、Result 解包、统一错误/401 处理 |
| `api/auth.ts` | 登录、用户资料、头像等认证 API |
| `api/upload.ts` | 通用上传调用 |
| `store/user.ts` | Token、用户资料、积分和登录/登出 Zustand Store |
| `types/api.ts` | 用户端所有后端 VO/DTO TypeScript 契约；当前体积较大，应按域拆分 |
| `constants/config.ts` | 品牌、API baseURL、全局画幅和风格代码 |
| `constants/features.ts` | 钱包、充值、邀请等 UI 可见性开关；只隐藏入口，不是服务端授权 |
| `feedback/*` | Toast、确认框、全局反馈队列 |
| `components/ModelProviderIcon.tsx` | Provider 图标映射 |

### `src/features/home/`

- `HomePage.tsx`：项目与文件夹主页。
- `api.ts`：项目、文件夹 CRUD。
- `store.ts`：项目列表、目录和当前项目状态。
- `components/CreateProjectModal.tsx`：创建项目及风格/时代设置。
- `components/ProjectTable.tsx`：项目列表操作入口。
- `components/FolderModal.tsx`、`MoveProjectModal.tsx`：目录管理。
- `home.css`：主页专属布局样式。
- 同名 `*.test.ts`：Store 与纯逻辑测试。

### `src/features/editor/`

| 文件/目录 | 作用 |
| --- | --- |
| `EditorPage.tsx` | 编辑器组合根：项目加载、工具栏、导出、左右区域和弹窗 |
| `store.ts` | 分镜/资产数据、选择、历史、批量生成、Job 恢复和轮询；当前最大耦合点 |
| `api.ts` | 分镜、角色、场景、道具、资产、Job、导入导出的 API facade |
| `project-store.ts` | 当前项目元数据与更新 |
| `model-config-store.ts` | 用户选择的文本/图片/视频模型，持久化到 localStorage |
| `model-api.ts`、`useAvailableModels.ts` | 从后端读取启用模型 |
| `panel-manager-store.ts` | 右侧面板栈与当前面板 |
| `editor-page-logic.ts` | 初始化、导出素材收集等页面纯逻辑 |
| `editor-page-keyboard.ts` | Undo/Redo、全选、批量删除快捷键 |
| `preserve-identity.ts` | 刷新数据时保留对象身份，减少不必要重渲染 |
| `utils/script-highlight.ts` | 对剧本文本 HTML 转义后做角色/场景/道具高亮 |

`components/` 子目录：

| 子目录 | 作用 |
| --- | --- |
| `storyboard/` | 虚拟化分镜表、行/单元格、脚本编辑、资产绑定、轮询、Excel 导入 |
| `panels/` | 角色/场景/道具/资产、分镜图、视频、生成历史等右侧面板 |
| `panels/asset-edit/` | 资产描述解析、本地/素材库/自定义生成、版本和缩略图更新 |
| `dialogs/` | 模型配置、资产生成、版本选择、剧本展开等弹窗 |
| `batch-operation/` | 选择分镜后的批量图片/视频生成状态机与底部操作条 |
| `export/` | 导出表单、Job 进度轮询和下载 |
| `library-modal/` | 角色/场景/道具素材库选择器与加载逻辑 |

其余关键组件：

- `RightPanelManager.tsx`：按 panel type 渲染右侧面板。
- `right-panel-resolver.ts`：面板类型到组件/参数的纯映射。
- `ProjectNameEditor.tsx`：项目名内联编辑。
- `*.test.ts(x)`：Store、键盘、轮询、资产绑定、生成状态机和导出逻辑测试。

### 其他用户功能

| 目录 | 作用 |
| --- | --- |
| `features/auth/` | 用户名密码登录页 |
| `features/toolbox/` | 对话侧栏、消息、Composer、历史和文本/图片/视频独立生成；`constants/toolbox-models.ts` 仍硬编码能力/成本 |
| `features/wallet/` | 余额卡、流水表和钱包 API/Store；导航默认关闭 |
| `features/recharge/` | 套餐、二维码支付弹窗、订单轮询；导航默认关闭且后端未达到生产条件 |
| `assets/` | Logo、Hero 和 Vite 示例资源 |
| `components/ui/card.tsx` | 项目自有基础 Card 组件 |

## 3. 管理端 `frontend-admin/`

### 构建文件

`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`vite.config.ts`、`tsconfig*.json` 和 lint/format 配置与用户端职责相同；管理端开发端口为 3001，`/api` 代理到后端 8080。

### 源码

| 文件/目录 | 作用 |
| --- | --- |
| `src/main.tsx` | 管理 SPA 入口 |
| `src/app/router.tsx` | `/login`、`/users`、`/models` 路由 |
| `src/app/RouteGuards.tsx` | 已登录/未登录路由守卫 |
| `src/app/AdminShell.tsx` | 管理端导航与 Outlet |
| `src/app/providers.tsx` | UI 主题 Provider |
| `src/features/auth/AdminLogin.tsx` | 管理员登录 |
| `src/features/users/UserManage.tsx` | 用户搜索、分页、创建、编辑、删除和积分调整 |
| `src/features/models/ModelConfig.tsx` | AI 模型启停与基础配置 |
| `src/shared/api/client.ts` | 管理员 Axios/JWT/401 处理 |
| `src/shared/api/admin.ts` | 管理 API 方法 |
| `src/shared/api/types.ts` | 管理 API 类型 |
| `src/shared/store/auth.ts` | 管理员 Token 与资料状态 |
| `src/shared/components/ModelProviderIcon.tsx` | Provider 图标 |

## 4. 后端 `backend/`

### 构建和资源

| 文件/目录 | 作用 |
| --- | --- |
| `pom.xml` | Java 17、Spring Boot、MyBatis、Flyway、JWT、COS、Redis、RabbitMQ、微信支付、POI 依赖 |
| `settings.xml` | Maven 镜像配置 |
| `src/main/resources/application.yml` | 本地配置：数据源、Redis、RabbitMQ、JWT、存储、AI Provider Key 等；被 `.gitignore` 排除，不进入版本库 |
| `META-INF/spring.factories` | 注册本地 Dotenv EnvironmentPostProcessor |
| `db/migration/` | V1–V32 Flyway 数据库演进；严格按版本顺序执行，禁止修改已发布迁移 |
| `test_asset_service.sql`、`test-data-recharge.sql` | 手工测试数据脚本，不应在生产自动执行 |

### Java 包

| 包 | 文件规模 | 作用 |
| --- | ---: | --- |
| `annotation` | 1 | `@NoAuth` 免 JWT 标记 |
| `common` | 2 | 统一 `Result` 与 `ResultCode` |
| `config` | 14 | 配置绑定、线程池、Redis、Web、密码编码、管理员初始化、dotenv |
| `interceptor` | 1 | JWT、USER/ADMIN 域隔离、Context 注入 |
| `exception` | 4 | 业务异常、存储/重试异常和全局异常响应 |
| `controller` | 31 | HTTP 入口 |
| `dto` | 102 | 按域组织请求与 VO，不直接暴露 Entity |
| `entity` | 37 | MySQL 表映射 |
| `mapper` | 37 | MyBatis-Plus Mapper，通常与 Entity 一一对应 |
| `service` | 74 | 业务接口、跨域编排、异步与恢复任务 |
| `client` | 4 | AI Provider HTTP 客户端和图片路由 |
| `mq` | 10 | 拓扑、消息、Producer、Consumer、延迟轮询和 DLQ |
| `util` | 5 | JWT、Redis、图片合并、用户/管理员 ThreadLocal Context |

### `config` 文件职责

| 文件 | 作用 |
| --- | --- |
| `AdminProperties` / `AdminInitializer` | 读取一次性管理员变量并创建/重置管理员 |
| `AiProperties` | 所有 Provider、模型和轮询配置绑定 |
| `StorageProperties` | local/COS 存储配置绑定 |
| `SmsProperties` / `WechatPayProperties` | 短信和支付配置绑定 |
| `JwtProperties` | JWT 配置绑定（密钥、过期时间、请求头） |
| `DotenvEnvironmentPostProcessor` | 加载项目根目录/`backend/` 下的 `.env`，值优先于系统环境变量 |
| `AsyncConfig` | Spring `@Async` 线程池、拒绝策略和异常处理 |
| `RedisConfig` | RedisTemplate 序列化 |
| `WebConfig` | JWT 路径、上传静态资源映射 |
| `MyBatisPlusConfig` / `MyMetaObjectHandler` | MyBatis 插件与时间字段自动填充 |
| `PasswordEncoderConfig` | BCrypt Encoder |

### Controller 到业务域

| Controller | 路径/职责 |
| --- | --- |
| `AuthController`、`UserController` | 用户登录、资料和头像 |
| `AdminAuthController`、`AdminUserController`、`AdminModelController` | 管理员、用户、积分和模型 |
| `ProjectController`、`FolderController` | 项目与目录 |
| `Character*`、`Scene*`、`Prop*` | 三类素材库、分类和项目引用 |
| `ShotController` | 分镜 CRUD、解析、排序、绑定和媒体 |
| `AssetController` | 资产版本、上传、当前版本、URL 下载代理 |
| `GenerateController` | 文本/图片/视频及单个/批量项目生成入口 |
| `JobController` | Job 列表、详情、取消 |
| `ImportController` / `ExportController` | Excel/图片导入与 ZIP 导出 |
| `ToolboxController` | 独立工具箱生成、会话、历史 |
| `WalletController` / `PaymentController` | 积分、套餐、订单和微信回调 |
| `InviteController` | 邀请码与统计 |
| `StylePresetController` / `PromptTemplateController` | 风格和提示模板 |
| `AiModelController` | 用户可用模型查询 |
| `CommonController` | 通用上传 |
| `ImageUtilController` | 图片合并 |
| `HealthController` | 轻量健康检查接口 `/api/health` |

### Service 分组

| 分组 | 主要文件 | 作用 |
| --- | --- | --- |
| 生成编排 | `AiTextService`、`AiImageService`、`AiVideoService`、`BatchGenerationService` | 创建 Job、调用 Provider/MQ、汇总结果 |
| 异步/恢复 | `Async*TaskService`、`ImageGenerationTaskService`、`ImageTaskRecoveryService` | Provider 任务轮询、持久化、恢复、幂等 |
| 资产 | `AssetService`、`AssetCreationService`、`StorageService` 与 local/COS 实现 | 资产版本和二进制存储 |
| 项目内容 | `Project*Service`、`ShotService`、三类 Library/Category Service | 项目、分镜和素材 CRUD/绑定 |
| 任务/计费 | `JobService`、`ChargingService`、`WalletService` | Job 查询取消、积分扣费和流水 |
| 账户/商业 | `AuthService`、`Admin*Service`、`PaymentService`、`InviteService` | 登录、管理、支付、邀请 |
| 数据交换 | `ImportService`、`ExportService` | Excel/图片导入和 ZIP 导出 |
| 工具箱 | `ToolboxService` | 会话与独立 AI 任务 |

### Provider 与 MQ

历史客户端 `ImageGenerationRouter`、`GeeknowClient`、`Sub2ApiImageClient`、`SudashuiVideoClient` 已随旧上游退出删除，不得恢复或作为接入参考（见 `docs/competition/M1旧媒体上游退出记录.md`）。

- `provider/OfficialTextProvider`、`OfficialModelCatalog*`、`TextModel*`：官方文字调用、模型目录同步与准入。
- `provider/UnavailableMediaProvider`：同时实现图片与视频 Provider 接口，在官方媒体适配接入前一律拒绝受理。
- `ImageGenerationProvider`、`VideoGenerationProvider`：媒体 Provider 接口，新官方适配器应实现它们。
- `MQConstant`：交换机、队列、routing key、TTL。
- `MQInitConfig`：声明业务、重试、延迟和死信拓扑。
- `MQProducer`：发布并等待 confirm。
- `MQConsumer`：批量/单个图片视频和文本消费；当前 2000+ 行，应拆分。
- `ImagePollConsumer`：图片 Provider 状态轮询、延迟重投和 DLQ。
- `*Message` Record：队列消息契约。

### Entity/Mapper/DTO 规则

Entity 按领域分组：

- 账户：`User`、`UserAuth`、`Admin`。
- 项目：`Project`、`ProjectFolder`、`StoryboardShot`、`ShotBinding`。
- 素材：Character/Scene/Prop 的 Category、Library、Project*。
- 资产：`Asset`、`AssetVersion`、`AssetRef`、`ImageGenerationTask`、`ImageReferenceUpload`。
- 任务与计费：`Job`、`JobItem`、`Wallet`、`WalletTransaction`、`UsageCharge`、`PricingRule`。
- 支付/邀请：`PayOrder`、`PayEvent`、`Recharge*`、`Invite*`。
- 工具：`ToolboxSession`、`PromptTemplate`、`StylePreset`、`AiModel`。

同名 `XxxMapper` 是对应 Entity 的持久层入口。`dto/<domain>/` 下 `Create/Update/*Request` 是入参，`*VO` 是响应，Record 的校验注解是 HTTP 契约的一部分。

### Flyway 迁移范围

- `V1`：初始账户、项目、素材、分镜、资产、任务、计费和支付表。
- `V2–V5`：风格/邀请、模型、外键修复、钱包默认值。
- `V6–V16`：Job 结果、模型与角色/场景/道具缩略图和关联。
- `V17–V21`：管理员、用户名认证、工具箱会话与级联。
- `V22–V25`：Provider/模型白名单和媒体契约。
- `V26–V27`：Rabbit 图片任务状态和参考图去重。
- `V28–V31`：视频/图片 Provider 与模型切换。
- `V32`：道具 JobItem target type 与僵尸任务清理（当前工作树新增迁移）。

`V1` 包含 DROP，`V5` 会改零余额，任何既有库上线前必须先手动核对迁移内容再执行。

## 5. 测试目录

- `frontend/src/**/*.test.ts(x)`：Vitest 纯逻辑/Store/组件契约，共 31 个测试文件、241 项基线测试。
- `frontend-admin/src/**/*.test.ts`：认证 Store 和 API Client，共 6 项基线测试。
- `backend/src/test/java/**`：JUnit/Mockito，覆盖 MQ、任务恢复、Provider Client、存储和部分 Service，共 57 项基线测试。
- 当前缺少 Playwright/Cypress 浏览器 E2E、真实 MySQL/RabbitMQ Testcontainers 集成测试、真实 Provider 沙箱和 CI 配置。

