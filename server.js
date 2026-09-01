import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAdminRequest } from './scripts/admin-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || process.env.SERVER_PORT || 4321;
const ADMIN_DIR = path.join(__dirname, 'public', 'admin');

// 动态获取静态文件目录 (构建后优先使用 dist，否则使用 public)
function getPublicDir() {
  return fs.existsSync(path.join(__dirname, 'dist')) ? path.join(__dirname, 'dist') : path.join(__dirname, 'public');
}

// 配置的 DeepSeek API Key
const CUSTOM_API_KEY = process.env.DEEPSEEK_API_KEY || "sk-7c4f6d9881be4a23b2785140b42d9f5a";
const CUSTOM_API_URL = process.env.DEEPSEEK_API_URL || "api.deepseek.com";

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// 本地智能对话兜底（当无 Key 或网络不通时自动启用）
function generateFallbackChatResponse(bodyStr) {
  let userText = '';
  let systemText = '';
  try {
    const data = JSON.parse(bodyStr);
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach(m => {
        if (m.role === 'user') userText = m.content;
        if (m.role === 'system') systemText = m.content;
      });
    }
  } catch (e) {}

  let replyContent = "【系统提示】已收到指认线索。请继续在群中发言。";

  if (systemText.includes("林曼") || systemText.includes("Linda")) {
    replyContent = "建议大家按照流程来对齐，不要冲动说话。人事部也是在配合高层进行正规调查。";
  } else if (systemText.includes("王建国") || systemText.includes("老王")) {
    replyContent = "服务器那边的日志我都看过了，没有任何越权痕迹。别什么脏水都往运维身上抹。";
  } else if (systemText.includes("唐强") || systemText.includes("Tony")) {
    replyContent = "我都说了我只是给客户展示过演示环境！真正的访问记录根本不是我产生的！";
  } else if (systemText.includes("白芷") || systemText.includes("小白")) {
    replyContent = "我……我只是个实习生，什么都不知道……求求你们别指认我……";
  }

  if (userText.includes("后门") || userText.includes("不是人") || userText.includes("实验")) {
    replyContent = "（私聊加密消息）你……你也察觉到了对不对？服务器里跑着的 Project Silent 根本不是常规系统！前几年的事故也是它造成的！";
  } else if (userText.includes("医院") || userText.includes("女儿")) {
    replyContent = "（私聊加密消息）小伙子，既然你问到这里了……我承认我卖过报废硬盘，那是因为我女儿在 ICU 欠着几万块账单！";
  }

  return JSON.stringify({
    id: "chatcmpl-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "deepseek-v4-flash",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: replyContent
        },
        finish_reason: "stop"
      }
    ]
  });
}

const server = http.createServer(async (req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // 1. 处理后台管理系统 API (/api/admin/...)
  try {
    const handledAdmin = await handleAdminRequest(req, res);
    if (handledAdmin) return;
  } catch (err) {
    console.error('[Admin API Error]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: '服务器内部错误: ' + err.message }));
    return;
  }

  // 2. 处理后台管理前端页面 (/admin, /admin/...)
  if (reqPath === '/admin' || reqPath === '/admin/') {
    const adminIndex = path.join(ADMIN_DIR, 'index.html');
    if (fs.existsSync(adminIndex)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(adminIndex).pipe(res);
      return;
    }
  } else if (reqPath.startsWith('/admin/')) {
    const subPath = reqPath.replace(/^\/admin\//, '');
    let adminFile = path.join(ADMIN_DIR, subPath);
    if (fs.existsSync(adminFile) && fs.statSync(adminFile).isFile()) {
      const ext = path.extname(adminFile).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(adminFile).pipe(res);
      return;
    }
    // SPA Fallback
    const adminIndex = path.join(ADMIN_DIR, 'index.html');
    if (fs.existsSync(adminIndex)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(adminIndex).pipe(res);
      return;
    }
  }

  // 3. 处理 API 代理请求 (/api-proxy/...)
  if (reqPath.startsWith('/api-proxy')) {
    let bodyBuffers = [];
    req.on('data', chunk => bodyBuffers.push(chunk));
    req.on('end', () => {
      const bodyStr = Buffer.concat(bodyBuffers).toString();
      const targetPath = reqPath.replace('/api-proxy', '');

      const hostname = CUSTOM_API_KEY ? CUSTOM_API_URL : 'www.anyanygame.com';
      const authHeader = CUSTOM_API_KEY ? `Bearer ${CUSTOM_API_KEY}` : (req.headers['authorization'] || '');

      const proxyOptions = {
        hostname: hostname,
        port: 443,
        path: CUSTOM_API_KEY ? '/chat/completions' : '/api-proxy' + targetPath,
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'Authorization': authHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://www.anyanygame.com',
          'Referer': 'https://www.anyanygame.com/game/'
        },
        timeout: 15000
      };

      const proxyReq = https.request(proxyOptions, proxyRes => {
        let respBuffers = [];
        proxyRes.on('data', c => respBuffers.push(c));
        proxyRes.on('end', () => {
          const respStr = Buffer.concat(respBuffers).toString();
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(respStr);
          } else {
            console.log(`[API Proxy] 远程响应 ${proxyRes.statusCode}, 启用本地智能兜底回复。`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(generateFallbackChatResponse(bodyStr));
          }
        });
      });

      proxyReq.on('error', err => {
        console.log(`[API Proxy] 网络连接错误 (${err.message})，启用本地智能兜底回复。`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(generateFallbackChatResponse(bodyStr));
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        console.log(`[API Proxy] 请求超时，启用本地智能兜底回复。`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(generateFallbackChatResponse(bodyStr));
      });

      if (bodyStr) proxyReq.write(bodyStr);
      proxyReq.end();
    });
    return;
  }

  // 4. 静态文件路由
  const publicDir = getPublicDir();
  let filePath = path.join(publicDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // 如果在 dist 没找到但在 public 中存在 (比如刚上传的图片 /images/...)
  if (!fs.existsSync(filePath)) {
    const directPublicPath = path.join(__dirname, 'public', reqPath);
    if (fs.existsSync(directPublicPath) && fs.statSync(directPublicPath).isFile()) {
      filePath = directPublicPath;
    }
  }

  if (!fs.existsSync(filePath)) {
    // 404 fallback to dist/404.html or index.html
    const fallback404 = path.join(publicDir, '404.html');
    filePath = fs.existsSync(fallback404) ? fallback404 : path.join(publicDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end(`404 Not Found`);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`Mizuki 博客 & SCP 游戏服务器已启动！`);
  console.log(`博客地址: http://127.0.0.1:${PORT}/`);
  console.log(`管理后台: http://127.0.0.1:${PORT}/admin/`);
  console.log(`游戏地址: http://127.0.0.1:${PORT}/game/`);
  console.log(`====================================================`);
});
