<div align="center">

# 漫剧 · Super AI Story Studio

**用 AI（爱）叙事，传递爱与快乐**

面向个人创作者的 AI 漫剧 / 短剧分镜自动化工作台。<br/>
把"剧本 → 角色 / 场景 / 道具 → 分镜 → 图像 / 视频"全流程搬进浏览器，<br/>
支持从 Excel 一键导入剧本，按行解析镜头并自动关联资源。

[![Java](https://img.shields.io/badge/Java-17-007396?logo=openjdk&logoColor=white)](https://adoptium.net/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.5-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Author](https://img.shields.io/badge/by-Xumy-f43f5e?logo=github)](https://github.com/xuyuanzhang1122)

</div>

---

## ✨ 核心特性

| 模块 | 能力 |
|---|---|
| 🎯 **项目管理** | 多项目 / 文件夹归类、画幅 / 风格 / 时代配置、模型组合 |
| 📜 **剧本导入** | **.xlsx 一键导入**：自动解析「分镜 / 出场人物 / 场景 / 道具」四个 Sheet，按行追加镜头并建立绑定 |
| 🖼️ **图片导入** | Excel 内嵌图片自动抽取 + 独立 `assetFiles` 上传包，按文件名匹配角色 / 场景 / 道具缩略图 |
| 🎨 **分镜编辑器** | 富文本染色（角色 / 场景 / 道具 / 声纹特征 / 运镜标签按类型上色）、行高自适应、悬浮放大编辑 |
| 👤 **资源库** | 角色 / 场景 / 道具的项目库 ↔ 全局库引用，支持项目内覆盖、缩略图、悬停大图预览 |
| 🤖 **AI 生成** | 文本拆分、角色 / 场景 / 道具 / 分镜图 / 视频生成；批量任务通过 RabbitMQ 异步消费，支持刷新后恢复进度 |
| 💾 **存储** | 默认本地磁盘（`backend/uploads/`），可切换腾讯云 COS |
| 🖥️ **管理端** | 独立 `frontend-admin/` 应用：用户管理、AI 模型启停与配置 |
| 🔐 **认证** | JWT；用户名密码登录，账号由管理员在管理端创建（不再是手机号注册） |

---

## 🛠️ 技术栈

**后端**
- Spring Boot 3.2.5 / Java 17
- MyBatis-Plus 3.5.12
- MySQL 8.0（Flyway 自动迁移，当前 V1–V32）
- Redis · RabbitMQ
- Apache POI（Excel 解析）
- JWT
- 腾讯云 COS / 本地磁盘存储（可切换）
- 阿里云短信服务（`AliyunSmsServiceImpl`，默认 mock 兜底；当前登录走用户名密码，暂未接入短信验证码）

**前端**（`frontend/` 用户端与 `frontend-admin/` 管理端同一套技术栈）
- React 19 + TypeScript
- Vite 8
- Zustand · React Router 7 · TanStack Query
- TailwindCSS 4 · Ant Design 6 · @lobehub/ui
- Axios

**基础设施**
- Docker Compose（一键拉起 MySQL / Redis / RabbitMQ / 后端 / 用户端 / 管理端）
- Nginx（静态资源 + 反向代理）

---

## 🚀 快速开始

### 方式一：Docker 一键启动（推荐）

```bash
git clone https://github.com/xuyuanzhang1122/Ai-board.git
cd Ai-board
docker-compose up -d
```

启动后访问：
- 用户端：http://localhost:8081
- 管理端：http://localhost:8082
- 后端 API：http://localhost:8080
- RabbitMQ 管理台：http://localhost:15672（admin / admin123）

### 方式二：本地开发模式

#### 1. 启动依赖容器
```bash
docker-compose up -d mysql redis rabbitmq
```

#### 2. 启动后端
```powershell
# Windows PowerShell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;<your-maven-path>\bin;$env:PATH"
cd backend
mvn spring-boot:run "-Dspring-boot.run.jvmArguments=-Dspring.datasource.url=jdbc:mysql://localhost:3307/ai_story_studio?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true -Dspring.datasource.password=1234"
```

```bash
# macOS / Linux
cd backend
mvn spring-boot:run \
  -Dspring-boot.run.jvmArguments="-Dspring.datasource.url=jdbc:mysql://localhost:3307/ai_story_studio?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true -Dspring.datasource.password=1234"
```

#### 3. 启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

```bash
# 管理端（另开一个终端）
cd frontend-admin
pnpm install
pnpm dev
```

> 默认端口被占用时 Vite 会自动尝试下一个。

### 登录

账号不再是手机号自助注册，改成了用户名密码，由管理员统一创建：

1. 启动前在 `.env` 里配置 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，后端启动时 `AdminInitializer` 会据此创建（或更新）首个管理员；首个管理员建好后建议清空这两个变量，避免每次重启都重置密码。
2. 用该账号登录管理端（`http://localhost:8082`），在「用户管理」里创建普通用户账号（用户名 + 密码）。
3. 用刚创建的账号登录用户端（`http://localhost:8081`）。

---

## 📜 Excel 剧本导入说明

支持固定格式导出的 `.xlsx` 文件，结构如下：

| Sheet 名 | 列 | 说明 |
|---|---|---|
| **分镜** | 序号 / 剧本 / 出场人物 / 场景 / 道具 / 分镜图 | 每行 = 一个镜头 |
| **出场人物** | 名称 / 描述词 / 图片 | 全量角色清单 + AI 生图 Prompt |
| **场景** | 名称 / 描述词 / 图片 | 全量场景清单 |
| **道具** | 名称 / 描述词 / 图片 | 全量道具清单 |

### 使用流程

1. 进入任一项目的分镜编辑器
2. 工具栏点 **「导入分镜表格」**，选 `.xlsx` 文件
3. 后端自动：
   - 按名称在项目内 upsert 角色 / 场景 / 道具（同名复用，已存在仅补全缺失描述）
   - 按行追加分镜，`shot_no` 从当前最大值递增
   - 解析"出场人物 / 场景 / 道具"列建立 `shot_bindings`
   - 抽取 Excel 内嵌图片 + 上传的 `assetFiles`，按文件名匹配资源缩略图
4. 完成后弹窗汇总：新增分镜数、涉及角色 / 场景 / 道具数、图片匹配数

---

## 📁 目录结构

```
.
├── backend/                    # Spring Boot 后端
│   ├── src/main/java/com/ym/ai_story_studio_server/
│   │   ├── controller/         # REST 接口
│   │   ├── service/            # 业务服务
│   │   │   └── impl/
│   │   │       ├── ImportServiceImpl.java       # ⭐ Excel 导入核心
│   │   │       ├── LocalStorageServiceImpl.java # ⭐ 本地磁盘存储
│   │   │       ├── CosStorageServiceImpl.java   # ⭐ 腾讯云 COS 存储
│   │   │       └── ...
│   │   ├── mapper/             # MyBatis-Plus 映射
│   │   ├── entity/             # 数据库实体
│   │   ├── dto/                # 请求 / 响应模型
│   │   ├── config/             # Web / JWT / Storage / RabbitMQ 配置
│   │   └── mq/                 # RabbitMQ 生产者 / 消费者
│   └── src/main/resources/
│       ├── application.yml     # 本地专属，不进版本库
│       └── db/migration/       # Flyway 迁移脚本（V1 - V32）
│
├── frontend/                    # React 用户端
│   └── src/
│       ├── app/                 # 路由、Provider、登录后布局
│       ├── features/
│       │   ├── editor/          # 分镜编辑器（剧本、资产、批量生成）
│       │   ├── home/            # 项目 / 文件夹主页
│       │   ├── auth/            # 登录
│       │   ├── toolbox/         # 独立文本 / 图片 / 视频生成
│       │   ├── wallet/          # 积分钱包
│       │   └── recharge/        # 充值
│       └── shared/              # Axios 客户端、公共 Store、类型
│
├── frontend-admin/              # React 管理端（用户管理、模型配置）
│
├── docker-compose.yml          # MySQL / Redis / RabbitMQ / 后端 / 用户端 / 管理端
├── Dockerfile.backend
├── Dockerfile.frontend
├── Dockerfile.admin
├── nginx.conf
└── README.md
```

---

## 🔌 关键接口

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/auth/login` | 用户名密码登录 |
| `POST` | `/api/admin/users` | 管理员创建用户账号 |
| `POST` | `/api/projects/{projectId}/import/excel` | 上传 .xlsx 导入分镜表 |
| `POST` | `/api/projects/{projectId}/import/asset-images` | 补传角色/场景/道具图片 |
| `GET` | `/api/projects/{projectId}/shots` | 分镜列表 |
| `POST` | `/api/projects/{projectId}/shots` | 新增分镜 |
| `POST` | `/api/projects/{projectId}/shots/parse-script` | AI 解析剧本批量建分镜 |
| `POST` | `/api/projects/{projectId}/export` | 项目素材打包导出 |

完整接口看 `backend/src/main/java/.../controller/`。

---

## 🧩 二次开发

### 切换存储后端

`application.yml` → `storage.provider`：
- `local`（默认）：写到 `backend/uploads/`，通过 `WebConfig` 暴露静态资源
- `cos`：写到腾讯云 COS，需要在 `storage.cos.*` 填 secret-id / secret-key / region / bucket

### 数据库迁移

放进 `backend/src/main/resources/db/migration/`，命名 `V{N}__description.sql`，重启后端 Flyway 会自动执行。

### 认证方式

当前主用户名密码登录（`AuthServiceImpl.usernameLogin`），账号只能由管理员在管理端创建，没有自助注册入口。手机号登录（`phoneLogin`/`sendVerificationCode`）和微信登录（`wechatLogin`）的接口和 `AliyunSmsServiceImpl`/`MockSmsServiceImpl` 仍在代码里，但当前前端未接入，可按需重新启用。

---

## 👤 关于作者

由 **Xumy** 开发维护。

- GitHub：[@xuyuanzhang1122](https://github.com/xuyuanzhang1122?tab=repositories)

> [!TIP]
> 如有侵权请及时联系我，E-mail：xumy121@gmail.com

---

## 🪪 License

MIT

