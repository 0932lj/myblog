import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const zipName = 'katabump-deploy.zip';
const zipPath = path.join(rootDir, zipName);
const desktopZipPath = path.join('C:', 'Users', 'Administrator', 'Desktop', zipName);

console.log('📦 开始生成 KataBump 部署安装包...');

// 确保 dist 存在
if (!fs.existsSync(path.join(rootDir, 'dist'))) {
  console.error('❌ dist 目录不存在，请先运行 pnpm run build 构建博客！');
  process.exit(1);
}

// 需要打包的条目清单
const includeItems = [
  'dist',
  'public',
  'scripts',
  'src',
  'index.js',
  'server.js',
  'package.json',
  'astro.config.mjs',
  'tsconfig.json',
  'README-KATABUMP.md',
  '.env.example'
];

if (fs.existsSync(path.join(rootDir, '.env'))) {
  includeItems.push('.env');
}

// 移除旧 zip
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const itemsList = includeItems.map(item => `'${item}'`).join(', ');
const psCommand = `Compress-Archive -Path ${itemsList} -DestinationPath '${zipPath}' -Force`;

console.log('⏳ 正在压缩打包核心文件 (跳过 node_modules 和 .git 以大幅压缩体积)...');
try {
  execSync(`powershell -NoProfile -Command "${psCommand}"`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  
  if (fs.existsSync(zipPath)) {
    const stats = fs.statSync(zipPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ 打包完成！`);
    console.log(`📁 压缩包路径: ${zipPath}`);
    console.log(`📊 文件大小: ${sizeMb} MB`);

    // 复制一份到桌面根目录方便用户直接取用
    if (path.resolve(desktopZipPath) !== path.resolve(zipPath)) {
      try {
        fs.copyFileSync(zipPath, desktopZipPath);
        console.log(`📋 已同步拷贝到桌面: ${desktopZipPath}`);
      } catch (e) {}
    }
  }
} catch (err) {
  console.error('❌ 打包过程出现异常:', err.message);
  process.exit(1);
}
