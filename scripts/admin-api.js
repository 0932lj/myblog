import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

loadEnv();

const POSTS_DIR = path.join(rootDir, 'src', 'content', 'posts');
const SPEC_DIR = path.join(rootDir, 'src', 'content', 'spec');
const CONFIG_FILE = path.join(rootDir, 'src', 'config.ts');
const DIARY_FILE = path.join(rootDir, 'src', 'data', 'diary.ts');
const ANIME_FILE = path.join(rootDir, 'src', 'data', 'anime.ts');
const IMAGES_DIR = path.join(rootDir, 'public', 'images');
const ALBUMS_DIR = path.join(rootDir, 'public', 'images', 'albums');
const DIARY_IMAGES_DIR = path.join(rootDir, 'public', 'images', 'diary');
const ADMIN_DIR = path.join(rootDir, 'public', 'admin');

// 确保必要目录存在
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(ALBUMS_DIR)) fs.mkdirSync(ALBUMS_DIR, { recursive: true });
if (!fs.existsSync(DIARY_IMAGES_DIR)) fs.mkdirSync(DIARY_IMAGES_DIR, { recursive: true });
if (!fs.existsSync(ADMIN_DIR)) fs.mkdirSync(ADMIN_DIR, { recursive: true });

// 简易 Token 内存池与密钥
const activeSessions = new Map(); // token -> { createdAt, expiresAt }
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天有效期

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'admin123456';
}

// 校验 Token
export function verifyToken(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

// 检查请求是否带合法 Token
export function isAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookieHeader = req.headers['cookie'] || '';
    const match = cookieHeader.match(/admin_token=([^;]+)/);
    if (match) token = match[1];
  }
  return verifyToken(token);
}

// 读取 JSON Body 辅助函数
export function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const str = Buffer.concat(body).toString('utf-8');
        resolve(str ? JSON.parse(str) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// 发送 JSON 响应
export function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// ==================== Frontmatter 解析与序列化 ====================
export function parseFrontmatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: fileContent };
  }
  const yamlStr = match[1];
  const content = match[2] || '';
  const fm = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      const val = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '');
      fm[currentKey].push(val);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      currentKey = key;

      if (val === '') {
        fm[key] = '';
      } else if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        fm[key] = inner
          ? inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
          : [];
      } else if (val.toLowerCase() === 'true') {
        fm[key] = true;
      } else if (val.toLowerCase() === 'false') {
        fm[key] = false;
      } else if (!isNaN(Number(val)) && val !== '' && !val.includes('-') && !val.includes(':')) {
        fm[key] = Number(val);
      } else {
        fm[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { frontmatter: fm, content };
}

export function stringifyFrontmatter(fm, content) {
  const lines = ['---'];
  const orderedKeys = ['title', 'published', 'updated', 'description', 'image', 'tags', 'category', 'draft', 'pinned', 'lang', 'comment'];
  const allKeys = Array.from(new Set([...orderedKeys, ...Object.keys(fm)]));

  for (const key of allKeys) {
    if (!(key in fm)) continue;
    const value = fm[key];
    if (Array.isArray(value)) {
      const items = value.map(v => typeof v === 'string' && (v.includes(',') || v.includes(' ')) ? `"${v}"` : v).join(', ');
      lines.push(`${key}: [${items}]`);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'string') {
      if (value.includes(':') || value.includes('#') || value.includes('\n')) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (value === null || value === undefined) {
      lines.push(`${key}: ''`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n\n' + (content || '').trimStart();
}

function getAllPostFiles(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllPostFiles(filePath, baseDir));
    } else if (file.endsWith('.md') || file.endsWith('.markdown')) {
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
      results.push({ fullPath: filePath, relativePath, stat });
    }
  }
  return results;
}

// 递归获取所有图片文件
function getAllImageFiles(dir, baseDir = path.join(rootDir, 'public')) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getAllImageFiles(filePath, baseDir));
    } else if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(file)) {
      const relToPublic = path.relative(baseDir, filePath).replace(/\\/g, '/');
      let category = '主目录';
      if (relToPublic.startsWith('images/albums/')) {
        const albumName = relToPublic.split('/')[2] || '';
        category = `相册: ${albumName}`;
      } else if (relToPublic.startsWith('images/diary/')) {
        category = '日记插图';
      } else if (relToPublic.startsWith('images/device/')) {
        category = '设备图片';
      } else if (relToPublic.startsWith('images/')) {
        category = '文章图片';
      }

      results.push({
        name: file,
        path: relToPublic,
        url: `/${relToPublic}`,
        category,
        size: stat.size,
        mtime: stat.mtime
      });
    }
  }
  return results;
}

// ==================== 构建管理 ====================
let buildStatus = {
  status: 'idle',
  startTime: null,
  finishTime: null,
  durationMs: 0,
  logs: []
};

function appendBuildLog(msg) {
  const cleanMsg = msg.toString().replace(/\x1b\[[0-9;]*m/g, '');
  const line = `[${new Date().toLocaleTimeString()}] ${cleanMsg}`;
  buildStatus.logs.push(line);
  if (buildStatus.logs.length > 500) {
    buildStatus.logs.shift();
  }
}

export function triggerBuild() {
  if (buildStatus.status === 'building') {
    return { success: false, message: '构建已在进行中，请稍候...' };
  }

  buildStatus = {
    status: 'building',
    startTime: Date.now(),
    finishTime: null,
    durationMs: 0,
    logs: []
  };

  appendBuildLog('🚀 开始执行博客静态构建 (pnpm run build)...');

  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';
  const fallbackCmd = isWindows ? 'npm.cmd' : 'npm';

  let child;
  try {
    child = spawn(npmCmd, ['run', 'build'], {
      cwd: rootDir,
      shell: true,
      env: { ...process.env }
    });
  } catch (err) {
    try {
      child = spawn(fallbackCmd, ['run', 'build'], {
        cwd: rootDir,
        shell: true,
        env: { ...process.env }
      });
    } catch (e) {
      buildStatus.status = 'error';
      buildStatus.finishTime = Date.now();
      appendBuildLog(`❌ 启动构建失败: ${e.message}`);
      return { success: false, message: e.message };
    }
  }

  child.stdout.on('data', data => appendBuildLog(data));
  child.stderr.on('data', data => appendBuildLog(data));

  child.on('close', code => {
    buildStatus.finishTime = Date.now();
    buildStatus.durationMs = buildStatus.finishTime - buildStatus.startTime;
    if (code === 0) {
      buildStatus.status = 'success';
      appendBuildLog(`✨ 构建成功！耗时 ${(buildStatus.durationMs / 1000).toFixed(1)} 秒。最新内容已上线！`);
    } else {
      buildStatus.status = 'error';
      appendBuildLog(`❌ 构建失败，退出码: ${code}`);
    }
  });

  child.on('error', err => {
    buildStatus.status = 'error';
    buildStatus.finishTime = Date.now();
    appendBuildLog(`❌ 构建进程异常: ${err.message}`);
  });

  return { success: true, message: '构建进程已在后台启动' };
}

// ==================== 日记数据管理 (src/data/diary.ts) ====================
export function getDiaries() {
  if (!fs.existsSync(DIARY_FILE)) return [];
  const content = fs.readFileSync(DIARY_FILE, 'utf-8');
  const match = content.match(/const\s+diaryData:\s*DiaryItem\[\]\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  try {
    const fn = new Function(`return ${match[1]}`);
    return fn();
  } catch (e) {
    console.error('解析 diary.ts 失败:', e);
    return [];
  }
}

export function saveDiaries(list) {
  if (!fs.existsSync(DIARY_FILE)) return false;
  const content = fs.readFileSync(DIARY_FILE, 'utf-8');
  const formatted = JSON.stringify(list, null, '\t');
  const newContent = content.replace(
    /(const\s+diaryData:\s*DiaryItem\[\]\s*=\s*)\[[\s\S]*?\];/,
    `$1${formatted};`
  );
  fs.writeFileSync(DIARY_FILE, newContent, 'utf-8');
  return true;
}

// ==================== 追番数据管理 (src/data/anime.ts) ====================
export function getAnimeList() {
  if (!fs.existsSync(ANIME_FILE)) return [];
  const content = fs.readFileSync(ANIME_FILE, 'utf-8');
  const match = content.match(/const\s+localAnimeList:\s*AnimeItem\[\]\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  try {
    const fn = new Function(`return ${match[1]}`);
    return fn();
  } catch (e) {
    console.error('解析 anime.ts 失败:', e);
    return [];
  }
}

export function saveAnimeList(list) {
  if (!fs.existsSync(ANIME_FILE)) return false;
  const content = fs.readFileSync(ANIME_FILE, 'utf-8');
  const formatted = JSON.stringify(list, null, '\t');
  const newContent = content.replace(
    /(const\s+localAnimeList:\s*AnimeItem\[\]\s*=\s*)\[[\s\S]*?\];/,
    `$1${formatted};`
  );
  fs.writeFileSync(ANIME_FILE, newContent, 'utf-8');
  return true;
}

// ==================== 相册数据管理 (public/images/albums) ====================
export function getAlbumsList() {
  if (!fs.existsSync(ALBUMS_DIR)) return [];
  const folders = fs.readdirSync(ALBUMS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const albums = [];
  for (const folder of folders) {
    const folderPath = path.join(ALBUMS_DIR, folder);
    const infoPath = path.join(folderPath, 'info.json');
    let info = {};
    if (fs.existsSync(infoPath)) {
      try {
        info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      } catch (e) {}
    }

    // 扫描照片
    const files = fs.readdirSync(folderPath);
    const photos = files.filter(f => /\.(png|jpe?g|webp|gif|svg)$/i.test(f) && f !== 'cover.jpg' && f !== 'cover.webp')
      .map(f => ({
        name: f,
        url: `/images/albums/${folder}/${f}`
      }));

    let cover = '';
    if (fs.existsSync(path.join(folderPath, 'cover.webp'))) {
      cover = `/images/albums/${folder}/cover.webp`;
    } else if (fs.existsSync(path.join(folderPath, 'cover.jpg'))) {
      cover = `/images/albums/${folder}/cover.jpg`;
    } else if (info.cover) {
      cover = info.cover;
    } else if (photos.length > 0) {
      cover = photos[0].url;
    }

    albums.push({
      id: folder,
      title: info.title || folder,
      description: info.description || '',
      date: info.date || '',
      location: info.location || '',
      tags: info.tags || [],
      layout: info.layout || 'masonry',
      columns: info.columns || 3,
      hidden: Boolean(info.hidden),
      cover,
      photosCount: photos.length,
      photos
    });
  }
  return albums;
}

// ==================== 站点配置管理 ====================
export function getSiteConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  
  const titleMatch = content.match(/title:\s*["']([^"']*)["']/);
  const subtitleMatch = content.match(/subtitle:\s*["']([^"']*)["']/);
  const siteURLMatch = content.match(/siteURL:\s*["']([^"']*)["']/);
  const bannerHomeTitleMatch = content.match(/homeText:\s*\{[\s\S]*?title:\s*["']([^"']*)["']/);
  
  let bannerSubtitles = [];
  const subtitleArrMatch = content.match(/subtitle:\s*\[([\s\S]*?)\]/);
  if (subtitleArrMatch) {
    bannerSubtitles = subtitleArrMatch[1]
      .split('\n')
      .map(s => s.trim().replace(/^["']|["'],?$/g, ''))
      .filter(Boolean);
  }

  const profileNameMatch = content.match(/profileConfig:\s*ProfileConfig\s*=\s*\{[\s\S]*?name:\s*["']([^"']*)["']/);
  const profileBioMatch = content.match(/bio:\s*["']([^"']*)["']/);
  const profileAvatarMatch = content.match(/avatar:\s*["']([^"']*)["']/);
  const annContentMatch = content.match(/announcementConfig:\s*AnnouncementConfig\s*=\s*\{[\s\S]*?content:\s*["']([^"']*)["']/);

  return {
    title: titleMatch ? titleMatch[1] : '',
    subtitle: subtitleMatch ? subtitleMatch[1] : '',
    siteURL: siteURLMatch ? siteURLMatch[1] : '',
    bannerTitle: bannerHomeTitleMatch ? bannerHomeTitleMatch[1] : '',
    bannerSubtitles: bannerSubtitles,
    profileName: profileNameMatch ? profileNameMatch[1] : '',
    profileBio: profileBioMatch ? profileBioMatch[1] : '',
    profileAvatar: profileAvatarMatch ? profileAvatarMatch[1] : '',
    announcement: annContentMatch ? annContentMatch[1] : ''
  };
}

export function updateSiteConfig(newConf) {
  if (!fs.existsSync(CONFIG_FILE)) return false;
  let content = fs.readFileSync(CONFIG_FILE, 'utf-8');

  if (newConf.title !== undefined) {
    content = content.replace(/(title:\s*)["'][^"']*["']/, `$1"${newConf.title}"`);
  }
  if (newConf.subtitle !== undefined) {
    content = content.replace(/(subtitle:\s*)["'][^"']*["']/, `$1"${newConf.subtitle}"`);
  }
  if (newConf.siteURL !== undefined) {
    content = content.replace(/(siteURL:\s*)["'][^"']*["']/, `$1"${newConf.siteURL}"`);
  }
  if (newConf.bannerTitle !== undefined) {
    content = content.replace(/(homeText:\s*\{[\s\S]*?title:\s*)["'][^"']*["']/, `$1"${newConf.bannerTitle}"`);
  }
  if (Array.isArray(newConf.bannerSubtitles)) {
    const formattedSubs = newConf.bannerSubtitles.map(s => `\t\t\t\t"${s.replace(/"/g, '\\"')}",`).join('\n');
    content = content.replace(/(homeText:\s*\{[\s\S]*?subtitle:\s*\[)[\s\S]*?(\],)/, `$1\n${formattedSubs}\n\t\t\t$2`);
  }
  if (newConf.profileName !== undefined) {
    content = content.replace(/(profileConfig:\s*ProfileConfig\s*=\s*\{[\s\S]*?name:\s*)["'][^"']*["']/, `$1"${newConf.profileName}"`);
  }
  if (newConf.profileBio !== undefined) {
    content = content.replace(/(profileConfig:\s*ProfileConfig\s*=\s*\{[\s\S]*?bio:\s*)["'][^"']*["']/, `$1"${newConf.profileBio}"`);
  }
  if (newConf.profileAvatar !== undefined) {
    content = content.replace(/(profileConfig:\s*ProfileConfig\s*=\s*\{[\s\S]*?avatar:\s*)["'][^"']*["']/, `$1"${newConf.profileAvatar}"`);
  }
  if (newConf.announcement !== undefined) {
    content = content.replace(/(announcementConfig:\s*AnnouncementConfig\s*=\s*\{[\s\S]*?content:\s*)["'][^"']*["']/, `$1"${newConf.announcement.replace(/"/g, '\\"')}"`);
  }

  fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
  return true;
}

// ==================== 主请求处理入口 ====================
export async function handleAdminRequest(req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const rawPath = urlObj.pathname;
  const pathname = rawPath.replace(/\/+$/, '') || '/';
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return true;
  }

  // 1. 登录接口
  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const expectedPassword = getAdminPassword();
    if (body.password === expectedPassword) {
      const token = crypto.randomBytes(32).toString('hex');
      activeSessions.set(token, {
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL
      });
      sendJson(res, 200, { success: true, token, message: '登录成功' });
    } else {
      sendJson(res, 401, { success: false, message: '密码错误，请重试' });
    }
    return true;
  }

  // 2. 检查 Token 有效性
  if (pathname === '/api/admin/auth/check' && method === 'GET') {
    const authorized = isAuthorized(req);
    sendJson(res, authorized ? 200 : 401, { success: authorized });
    return true;
  }

  // 后续 API 必须鉴权
  if (pathname.startsWith('/api/admin')) {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { success: false, message: '未授权或登录已过期，请重新登录' });
      return true;
    }

    // --- 仪表盘统计数据 ---
    if (pathname === '/api/admin/stats' && method === 'GET') {
      const files = getAllPostFiles(POSTS_DIR);
      let draftCount = 0;
      let categories = new Set();
      let tags = new Set();

      for (const f of files) {
        try {
          const content = fs.readFileSync(f.fullPath, 'utf-8');
          const { frontmatter } = parseFrontmatter(content);
          if (frontmatter.draft) draftCount++;
          if (frontmatter.category) categories.add(frontmatter.category);
          if (Array.isArray(frontmatter.tags)) frontmatter.tags.forEach(t => tags.add(t));
        } catch (e) {}
      }

      const diaries = getDiaries();
      const anime = getAnimeList();
      const albums = getAlbumsList();

      sendJson(res, 200, {
        success: true,
        stats: {
          totalPosts: files.length,
          publishedPosts: files.length - draftCount,
          draftPosts: draftCount,
          categoriesCount: categories.size,
          tagsCount: tags.size,
          diariesCount: diaries.length,
          animeCount: anime.length,
          albumsCount: albums.length,
          nodeVersion: process.version,
          uptime: Math.floor(process.uptime()),
          buildStatus: buildStatus.status
        }
      });
      return true;
    }

    // --- 文章列表 (查) ---
    if (pathname === '/api/admin/posts' && method === 'GET') {
      const files = getAllPostFiles(POSTS_DIR);
      const posts = [];

      for (const f of files) {
        try {
          const content = fs.readFileSync(f.fullPath, 'utf-8');
          const { frontmatter, content: body } = parseFrontmatter(content);
          posts.push({
            relativePath: f.relativePath,
            title: frontmatter.title || f.relativePath,
            published: frontmatter.published || '',
            updated: frontmatter.updated || '',
            category: frontmatter.category || '',
            tags: frontmatter.tags || [],
            draft: Boolean(frontmatter.draft),
            pinned: Boolean(frontmatter.pinned),
            description: frontmatter.description || '',
            image: frontmatter.image || '',
            wordCount: body.trim().length,
            mtime: f.stat.mtime
          });
        } catch (err) {
          posts.push({
            relativePath: f.relativePath,
            title: f.relativePath,
            error: err.message
          });
        }
      }

      posts.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const dateA = new Date(a.published || a.mtime || 0).getTime();
        const dateB = new Date(b.published || b.mtime || 0).getTime();
        return dateB - dateA;
      });

      sendJson(res, 200, { success: true, posts });
      return true;
    }

    // --- 单篇文章读取 (查详情) ---
    if (pathname.startsWith('/api/admin/posts/') && method === 'GET') {
      const relPath = decodeURIComponent(pathname.replace('/api/admin/posts/', ''));
      const targetFile = path.resolve(POSTS_DIR, relPath);

      if (!targetFile.startsWith(POSTS_DIR) || !fs.existsSync(targetFile)) {
        sendJson(res, 404, { success: false, message: '文章不存在' });
        return true;
      }

      const content = fs.readFileSync(targetFile, 'utf-8');
      const { frontmatter, content: body } = parseFrontmatter(content);
      const stat = fs.statSync(targetFile);

      sendJson(res, 200, {
        success: true,
        post: {
          relativePath: relPath,
          frontmatter,
          content: body,
          raw: content,
          mtime: stat.mtime
        }
      });
      return true;
    }

    // --- 新建文章 (增) ---
    if (pathname === '/api/admin/posts' && method === 'POST') {
      const body = await readBody(req);
      let filename = (body.filename || body.relativePath || '').trim();
      if (!filename) {
        const titleSlug = (body.frontmatter?.title || 'new-post')
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
          .replace(/^-+|-+$/g, '');
        filename = `${titleSlug || 'post'}-${Date.now().toString().slice(-4)}.md`;
      }
      if (!filename.endsWith('.md') && !filename.endsWith('.markdown')) {
        filename += '.md';
      }

      const targetFile = path.resolve(POSTS_DIR, filename);
      if (!targetFile.startsWith(POSTS_DIR)) {
        sendJson(res, 400, { success: false, message: '非法路径' });
        return true;
      }

      if (fs.existsSync(targetFile)) {
        sendJson(res, 400, { success: false, message: '同名文章已存在，请更改文件名' });
        return true;
      }

      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      const frontmatter = body.frontmatter || {};
      if (!frontmatter.published) {
        const now = new Date();
        frontmatter.published = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }

      const fullContent = stringifyFrontmatter(frontmatter, body.content || '');
      fs.writeFileSync(targetFile, fullContent, 'utf-8');

      sendJson(res, 200, { success: true, message: '文章创建成功', relativePath: filename });
      return true;
    }

    // --- 更新文章 (改) ---
    if (pathname.startsWith('/api/admin/posts/') && method === 'PUT') {
      const currentRelPath = decodeURIComponent(pathname.replace('/api/admin/posts/', ''));
      const oldFile = path.resolve(POSTS_DIR, currentRelPath);

      if (!oldFile.startsWith(POSTS_DIR) || !fs.existsSync(oldFile)) {
        sendJson(res, 404, { success: false, message: '要更新的文章不存在' });
        return true;
      }

      const body = await readBody(req);
      let newRelPath = (body.newRelativePath || body.filename || currentRelPath).trim();
      if (!newRelPath.endsWith('.md') && !newRelPath.endsWith('.markdown')) {
        newRelPath += '.md';
      }

      const newFile = path.resolve(POSTS_DIR, newRelPath);
      if (!newFile.startsWith(POSTS_DIR)) {
        sendJson(res, 400, { success: false, message: '非法路径' });
        return true;
      }

      if (newFile !== oldFile && fs.existsSync(newFile)) {
        sendJson(res, 400, { success: false, message: '目标文件名已存在，无法重命名' });
        return true;
      }

      const frontmatter = body.frontmatter || {};
      const now = new Date();
      frontmatter.updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const fullContent = stringifyFrontmatter(frontmatter, body.content || '');

      const newDir = path.dirname(newFile);
      if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
      fs.writeFileSync(newFile, fullContent, 'utf-8');

      if (newFile !== oldFile) {
        fs.unlinkSync(oldFile);
      }

      sendJson(res, 200, { success: true, message: '文章已保存', relativePath: newRelPath });
      return true;
    }

    // --- 删除文章 (删) ---
    if (pathname.startsWith('/api/admin/posts/') && method === 'DELETE') {
      const relPath = decodeURIComponent(pathname.replace('/api/admin/posts/', ''));
      const targetFile = path.resolve(POSTS_DIR, relPath);

      if (!targetFile.startsWith(POSTS_DIR) || !fs.existsSync(targetFile)) {
        sendJson(res, 404, { success: false, message: '文章不存在' });
        return true;
      }

      fs.unlinkSync(targetFile);
      sendJson(res, 200, { success: true, message: '文章已删除' });
      return true;
    }

    // ==================== 日记模块 CRUD ====================
    if (pathname === '/api/admin/diaries' && method === 'GET') {
      const list = getDiaries();
      sendJson(res, 200, { success: true, diaries: list });
      return true;
    }

    if (pathname === '/api/admin/diaries' && method === 'POST') {
      const body = await readBody(req);
      const list = getDiaries();
      const newId = list.length > 0 ? Math.max(...list.map(d => Number(d.id) || 0)) + 1 : 1;
      const newDiary = {
        id: newId,
        content: body.content || '',
        date: body.date || new Date().toISOString(),
        images: Array.isArray(body.images) ? body.images : [],
        location: body.location || '',
        mood: body.mood || '',
        tags: Array.isArray(body.tags) ? body.tags : []
      };
      list.unshift(newDiary);
      saveDiaries(list);
      sendJson(res, 200, { success: true, message: '日记发布成功', diary: newDiary });
      return true;
    }

    if (pathname.startsWith('/api/admin/diaries/') && method === 'PUT') {
      const id = Number(decodeURIComponent(pathname.replace('/api/admin/diaries/', '')));
      const body = await readBody(req);
      const list = getDiaries();
      const idx = list.findIndex(d => Number(d.id) === id);
      if (idx === -1) {
        sendJson(res, 404, { success: false, message: '未找到该日记' });
        return true;
      }
      list[idx] = {
        ...list[idx],
        content: body.content !== undefined ? body.content : list[idx].content,
        date: body.date !== undefined ? body.date : list[idx].date,
        images: body.images !== undefined ? body.images : list[idx].images,
        location: body.location !== undefined ? body.location : list[idx].location,
        mood: body.mood !== undefined ? body.mood : list[idx].mood,
        tags: body.tags !== undefined ? body.tags : list[idx].tags
      };
      saveDiaries(list);
      sendJson(res, 200, { success: true, message: '日记更新成功' });
      return true;
    }

    if (pathname.startsWith('/api/admin/diaries/') && method === 'DELETE') {
      const id = Number(decodeURIComponent(pathname.replace('/api/admin/diaries/', '')));
      let list = getDiaries();
      list = list.filter(d => Number(d.id) !== id);
      saveDiaries(list);
      sendJson(res, 200, { success: true, message: '日记已删除' });
      return true;
    }

    // ==================== 追番模块 CRUD ====================
    if (pathname === '/api/admin/anime' && method === 'GET') {
      const list = getAnimeList();
      sendJson(res, 200, { success: true, anime: list });
      return true;
    }

    if (pathname === '/api/admin/anime' && method === 'POST') {
      const body = await readBody(req);
      const list = getAnimeList();
      const newItem = {
        title: body.title || '未命名番剧',
        status: body.status || 'watching',
        rating: Number(body.rating) || 9.0,
        cover: body.cover || '',
        description: body.description || '',
        episodes: body.episodes || `${body.totalEpisodes || 12} 集`,
        year: body.year || new Date().getFullYear().toString(),
        genre: Array.isArray(body.genre) ? body.genre : (body.genre ? body.genre.split(/[,，]/) : []),
        studio: body.studio || '',
        link: body.link || '',
        progress: Number(body.progress) || 0,
        totalEpisodes: Number(body.totalEpisodes) || 12,
        startDate: body.startDate || '',
        endDate: body.endDate || ''
      };
      list.unshift(newItem);
      saveAnimeList(list);
      sendJson(res, 200, { success: true, message: '番剧已添加', item: newItem });
      return true;
    }

    if (pathname.startsWith('/api/admin/anime/') && method === 'PUT') {
      const index = Number(decodeURIComponent(pathname.replace('/api/admin/anime/', '')));
      const body = await readBody(req);
      const list = getAnimeList();
      if (index < 0 || index >= list.length) {
        sendJson(res, 404, { success: false, message: '未找到该番剧' });
        return true;
      }
      list[index] = {
        ...list[index],
        ...body,
        genre: Array.isArray(body.genre) ? body.genre : (body.genre ? body.genre.split(/[,，]/) : list[index].genre)
      };
      saveAnimeList(list);
      sendJson(res, 200, { success: true, message: '番剧修改成功' });
      return true;
    }

    if (pathname.startsWith('/api/admin/anime/') && method === 'DELETE') {
      const index = Number(decodeURIComponent(pathname.replace('/api/admin/anime/', '')));
      let list = getAnimeList();
      if (index >= 0 && index < list.length) {
        list.splice(index, 1);
        saveAnimeList(list);
        sendJson(res, 200, { success: true, message: '番剧已删除' });
      } else {
        sendJson(res, 404, { success: false, message: '未找到番剧' });
      }
      return true;
    }

    // ==================== 相册模块 CRUD ====================
    if (pathname === '/api/admin/albums' && method === 'GET') {
      const list = getAlbumsList();
      sendJson(res, 200, { success: true, albums: list });
      return true;
    }

    if (pathname === '/api/admin/albums' && method === 'POST') {
      const body = await readBody(req);
      const albumId = (body.id || body.title || `album-${Date.now().toString().slice(-4)}`)
        .replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
      const albumFolder = path.join(ALBUMS_DIR, albumId);

      if (fs.existsSync(albumFolder)) {
        sendJson(res, 400, { success: false, message: '同名相册已存在' });
        return true;
      }

      fs.mkdirSync(albumFolder, { recursive: true });
      const info = {
        title: body.title || albumId,
        hidden: Boolean(body.hidden),
        description: body.description || '',
        date: body.date || new Date().toISOString().split('T')[0],
        location: body.location || 'Local',
        tags: Array.isArray(body.tags) ? body.tags : (body.tags ? body.tags.split(/[,，]/) : []),
        layout: body.layout || 'masonry',
        columns: Number(body.columns) || 3
      };
      fs.writeFileSync(path.join(albumFolder, 'info.json'), JSON.stringify(info, null, '\t'), 'utf-8');

      sendJson(res, 200, { success: true, message: '相册创建成功', id: albumId });
      return true;
    }

    if (pathname.startsWith('/api/admin/albums/') && method === 'PUT') {
      const albumId = decodeURIComponent(pathname.replace('/api/admin/albums/', ''));
      const albumFolder = path.join(ALBUMS_DIR, albumId);
      if (!fs.existsSync(albumFolder)) {
        sendJson(res, 404, { success: false, message: '相册不存在' });
        return true;
      }

      const body = await readBody(req);
      const infoPath = path.join(albumFolder, 'info.json');
      let currentInfo = {};
      if (fs.existsSync(infoPath)) {
        try { currentInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8')); } catch (e) {}
      }

      const updatedInfo = {
        ...currentInfo,
        title: body.title !== undefined ? body.title : currentInfo.title,
        description: body.description !== undefined ? body.description : currentInfo.description,
        date: body.date !== undefined ? body.date : currentInfo.date,
        location: body.location !== undefined ? body.location : currentInfo.location,
        tags: body.tags !== undefined ? (Array.isArray(body.tags) ? body.tags : body.tags.split(/[,，]/)) : currentInfo.tags,
        hidden: body.hidden !== undefined ? Boolean(body.hidden) : currentInfo.hidden,
        layout: body.layout || currentInfo.layout || 'masonry',
        columns: body.columns || currentInfo.columns || 3
      };

      fs.writeFileSync(infoPath, JSON.stringify(updatedInfo, null, '\t'), 'utf-8');
      sendJson(res, 200, { success: true, message: '相册信息已更新' });
      return true;
    }

    if (pathname.startsWith('/api/admin/albums/') && method === 'DELETE') {
      const albumId = decodeURIComponent(pathname.replace('/api/admin/albums/', ''));
      const albumFolder = path.join(ALBUMS_DIR, albumId);
      if (fs.existsSync(albumFolder)) {
        fs.rmSync(albumFolder, { recursive: true, force: true });
        sendJson(res, 200, { success: true, message: '相册已删除' });
      } else {
        sendJson(res, 404, { success: false, message: '相册不存在' });
      }
      return true;
    }

    // 相册照片上传
    if (pathname.match(/^\/api\/admin\/albums\/([^\/]+)\/photos/) && method === 'POST') {
      const albumId = decodeURIComponent(pathname.match(/^\/api\/admin\/albums\/([^\/]+)\/photos/)[1]);
      const albumFolder = path.join(ALBUMS_DIR, albumId);
      if (!fs.existsSync(albumFolder)) {
        sendJson(res, 404, { success: false, message: '目标相册不存在' });
        return true;
      }

      const body = await readBody(req);
      let filename = body.filename || `photo_${Date.now()}.png`;
      filename = filename.replace(/[^\w\u4e00-\u9fa5\.-]+/g, '_');

      if (body.base64) {
        const base64Data = body.base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(path.join(albumFolder, filename), buffer);
        sendJson(res, 200, { success: true, message: '照片已上传至相册', url: `/images/albums/${albumId}/${filename}` });
      } else {
        sendJson(res, 400, { success: false, message: '未提供图片数据' });
      }
      return true;
    }

    // 删除相册中的某张照片
    if (pathname.match(/^\/api\/admin\/albums\/([^\/]+)\/photos\/(.+)/) && method === 'DELETE') {
      const match = pathname.match(/^\/api\/admin\/albums\/([^\/]+)\/photos\/(.+)/);
      const albumId = decodeURIComponent(match[1]);
      const photoName = decodeURIComponent(match[2]);
      const photoPath = path.join(ALBUMS_DIR, albumId, photoName);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
        sendJson(res, 200, { success: true, message: '照片已从相册中删除' });
      } else {
        sendJson(res, 404, { success: false, message: '照片不存在' });
      }
      return true;
    }

    // --- 站点配置读取与保存 ---
    if (pathname === '/api/admin/config' && method === 'GET') {
      const conf = getSiteConfig();
      sendJson(res, 200, { success: true, config: conf });
      return true;
    }

    if (pathname === '/api/admin/config' && method === 'PUT') {
      const body = await readBody(req);
      const success = updateSiteConfig(body);
      sendJson(res, success ? 200 : 500, { success, message: success ? '配置保存成功' : '配置保存失败' });
      return true;
    }

    // --- 独立页面读取与保存 (About 等) ---
    if (pathname.startsWith('/api/admin/spec/') && method === 'GET') {
      const specName = decodeURIComponent(pathname.replace('/api/admin/spec/', ''));
      const targetFile = path.resolve(SPEC_DIR, specName.endsWith('.md') ? specName : `${specName}.md`);
      if (!targetFile.startsWith(SPEC_DIR) || !fs.existsSync(targetFile)) {
        sendJson(res, 404, { success: false, message: '页面文件不存在' });
        return true;
      }
      const raw = fs.readFileSync(targetFile, 'utf-8');
      const { frontmatter, content } = parseFrontmatter(raw);
      sendJson(res, 200, { success: true, frontmatter, content });
      return true;
    }

    if (pathname.startsWith('/api/admin/spec/') && method === 'PUT') {
      const specName = decodeURIComponent(pathname.replace('/api/admin/spec/', ''));
      const targetFile = path.resolve(SPEC_DIR, specName.endsWith('.md') ? specName : `${specName}.md`);
      if (!targetFile.startsWith(SPEC_DIR)) {
        sendJson(res, 400, { success: false, message: '非法路径' });
        return true;
      }
      const body = await readBody(req);
      const full = stringifyFrontmatter(body.frontmatter || {}, body.content || '');
      fs.writeFileSync(targetFile, full, 'utf-8');
      sendJson(res, 200, { success: true, message: '页面已保存' });
      return true;
    }

    // --- 媒体库全量图片列表与上传 ---
    if (pathname === '/api/admin/media' && method === 'GET') {
      const images = getAllImageFiles(IMAGES_DIR);
      images.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
      sendJson(res, 200, { success: true, media: images });
      return true;
    }

    if (pathname === '/api/admin/upload' && method === 'POST') {
      const body = await readBody(req);
      let filename = body.filename || `img_${Date.now()}.png`;
      filename = filename.replace(/[^\w\u4e00-\u9fa5\.-]+/g, '_');

      // 支持上传到指定目标子文件夹 (如 "diary", "albums/acg" 等)
      let destDir = IMAGES_DIR;
      let targetSubdir = (body.folder || '').trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
      if (targetSubdir) {
        destDir = path.resolve(IMAGES_DIR, targetSubdir);
        if (!destDir.startsWith(IMAGES_DIR)) destDir = IMAGES_DIR;
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      }
      
      let buffer;
      if (body.base64) {
        const base64Data = body.base64.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        sendJson(res, 400, { success: false, message: '未提供有效图片数据' });
        return true;
      }

      const savePath = path.join(destDir, filename);
      fs.writeFileSync(savePath, buffer);

      const relPath = path.relative(path.join(rootDir, 'public'), savePath).replace(/\\/g, '/');
      sendJson(res, 200, {
        success: true,
        message: '图片上传成功',
        url: `/${relPath}`,
        filename
      });
      return true;
    }

    if (pathname.startsWith('/api/admin/media/') && method === 'DELETE') {
      const relPath = decodeURIComponent(pathname.replace('/api/admin/media/', ''));
      const targetFile = path.resolve(path.join(rootDir, 'public'), relPath.replace(/^\/+/, ''));
      if (!targetFile.startsWith(IMAGES_DIR) || !fs.existsSync(targetFile)) {
        sendJson(res, 404, { success: false, message: '图片不存在' });
        return true;
      }
      fs.unlinkSync(targetFile);
      sendJson(res, 200, { success: true, message: '图片已删除' });
      return true;
    }

    // --- 一键构建发布与构建状态 ---
    if (pathname === '/api/admin/build' && method === 'POST') {
      const result = triggerBuild();
      sendJson(res, 200, result);
      return true;
    }

    if (pathname === '/api/admin/build/status' && method === 'GET') {
      sendJson(res, 200, {
        success: true,
        ...buildStatus
      });
      return true;
    }

    sendJson(res, 404, { success: false, message: 'API 不存在' });
    return true;
  }

  return false;
}
