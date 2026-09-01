# KataBump 部署指南 (Mizuki Blog & Admin & SCP Game)

本打包专为 **KataBump (及其他基于 Pterodactyl 翼龙面板的 Node.js 托管平台)** 进行了全面适配与优化。

---

## 📦 打包包含内容
- `dist/`：已完整预构建的前端静态文件、页面路由、Pagefind 全文检索索引、压缩字体资源。
- `public/`：管理后台 (`/admin/`)、SCP 互动游戏 (`/game/`)、图库与静态资源。
- `server.js` & `index.js`：轻量级纯 Node.js 服务端（零外部 npm 依赖，开箱即启，超低内存占用）。
- `scripts/`：后台管理 API (`admin-api.js`) 与辅助工具。
- `src/`：博客源码与 Markdown 文章内容（支持后台在线编辑管理）。
- `package.json`：已配置 `"main": "index.js"` 与 `"start": "node index.js"`。

---

## 🚀 部署步骤

### 第一步：在 KataBump 创建 Node.js 实例
1. 登录 [KataBump 控制台](https://katabump.com/)。
2. 创建或选择一个 **Node.js** 服务器实例（推荐选择 Node.js 18、20 或 22 版本）。

### 第二步：上传并解压文件
1. 进入服务器控制面板的 **Files（文件管理）**。
2. 点击 **Upload（上传）**，上传 `katabump-deploy.zip`。
3. 找到上传后的压缩包，点击右侧的菜单选择 **Unarchive（解压）** 到根目录。
4. 解压完成后可以删除压缩包以节省空间。

### 第三步：检查启动配置（Startup）
1. 点击面板左侧的 **Startup（启动设置）**。
2. 确认 **Startup Command** 为：
   ```bash
   node index.js
   ```
   *(或者 `npm start` 均可)*
3. 检查 **Main File** 是否为 `index.js`。

### 第四步：环境变量配置（可选）
在 KataBump 的 **Startup** 或直接修改根目录下的 `.env` 文件：
- `ADMIN_PASSWORD`：管理后台密码（默认：`admin123456`）
- `DEEPSEEK_API_KEY`：用于 SCP 互动游戏的 AI 对话 Key（可选）
- `PORT` 或 `SERVER_PORT`：KataBump 面板会自动注入分配的端口，服务端已自动兼容。

### 第五步：启动服务器
1. 返回 **Console（控制台）**。
2. 点击 **Start（启动）**。
3. 看到以下日志即表示运行成功：
   ```
   ====================================================
   Mizuki 博客 & SCP 游戏服务器已启动！
   博客地址: http://0.0.0.0:端口/
   管理后台: http://0.0.0.0:端口/admin/
   游戏地址: http://0.0.0.0:端口/game/
   ====================================================
   ```

---

## 🌐 绑定域名与访问
- **面板分配地址**：使用 KataBump 分配的 `IP:端口` 直接访问。
- **免费二级域名**：可在 KataBump 面板中申请免费的 `.kdns.fr` 二级域名并绑定。
- **自定义域名**：在 Cloudflare / DNS 提供商处添加 A 记录或 SRV / CNAME 映射至 KataBump 分配的地址。

---

## 💡 常见问题说明
1. **内存是否够用？**
   由于我们已经预先打包构建好了 `dist/`，服务器端运行仅需纯 Node.js 静态与 API 服务，内存占用仅 **30MB ~ 60MB**，在 KataBump 免费实例上也能极速稳定运行！
2. **如何在后台写文章？**
   访问 `/admin/` 登录管理后台，可在线撰写 Markdown 文章、管理图库、修改配置。
