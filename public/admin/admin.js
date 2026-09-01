// ==================== Mizuki Admin Dashboard Core JS (v9.0 Extended) ====================

const API_BASE = '/api/admin';
let state = {
  token: localStorage.getItem('mizuki_admin_token') || '',
  posts: [],
  albums: [],
  diaries: [],
  anime: [],
  media: [],
  currentPost: null,
  currentAlbumId: null,
  activeTab: 'dashboard',
  buildInterval: null,
  isBuilding: false,
  isDirty: false,
  mediaFilter: 'all',
  animeFilter: 'all',
  activeImageTargetField: null
};

// ==================== 初始化与鉴权 ====================
document.addEventListener('DOMContentLoaded', async () => {
  initEvents();
  initMarked();
  await checkAuth();
});

// 配置 marked 解析器
function initMarked() {
  if (window.marked) {
    window.marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function (code, lang) {
        if (window.hljs && lang && window.hljs.getLanguage(lang)) {
          try {
            return window.hljs.highlight(code, { language: lang }).value;
          } catch (e) {}
        }
        return code;
      }
    });
  }
}

// 统一 API 请求封装
async function apiRequest(endpoint, options = {}) {
  const cleanEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  const url = `${API_BASE}${cleanEndpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 401) {
      handleLogout();
      throw new Error('登录凭据已失效，请重新登录');
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`API Error [${cleanEndpoint}]:`, err);
    throw err;
  }
}

// 检查 Token
async function checkAuth() {
  if (!state.token) {
    showLogin();
    return;
  }

  try {
    const res = await apiRequest('/auth/check');
    if (res.success) {
      showApp();
      loadInitialData();
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('appContainer').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');
}

function handleLogout() {
  state.token = '';
  localStorage.removeItem('mizuki_admin_token');
  showLogin();
  showToast('已安全退出登录', 'info');
}

// 加载初始所有数据
async function loadInitialData() {
  await Promise.all([
    fetchDashboardStats(),
    fetchPostsList(),
    fetchAlbumsList(),
    fetchDiariesList(),
    fetchAnimeList(),
    fetchSiteConfig(),
    fetchSpecPage('about.md'),
    fetchMediaList(),
    checkBuildStatus()
  ]);
}

// ==================== 模态弹窗控制 ====================
window.openModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
};

window.closeModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
};

// ==================== 事件监听注册 ====================
function initEvents() {
  // 1. 登录表单
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.getElementById('loginSubmitBtn');
    const errorDiv = document.getElementById('loginError');

    submitBtn.disabled = true;
    errorDiv.classList.add('hidden');

    try {
      const res = await fetch(`${API_BASE}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(`服务器响应格式异常 (${res.status})，请重启 npm run dev`);
      }

      if (data.success && data.token) {
        state.token = data.token;
        localStorage.setItem('mizuki_admin_token', data.token);
        showApp();
        loadInitialData();
        showToast('欢迎进入后台管理控制台', 'success');
      } else {
        errorDiv.textContent = data.message || '密码错误';
        errorDiv.classList.remove('hidden');
      }
    } catch (err) {
      errorDiv.textContent = err.message || '网络错误，无法连接后台服务';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // 密码显示/隐藏
  document.getElementById('togglePasswordBtn').addEventListener('click', () => {
    const input = document.getElementById('loginPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // 侧边栏导航切换
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab === 'editor' && btn.id === 'navNewPostBtn') {
        openNewPostEditor();
      } else {
        switchTab(tab);
      }
    });
  });

  // 移动端菜单
  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // 顶栏一键发布
  document.getElementById('quickBuildBtn').addEventListener('click', triggerBuildNow);
  document.getElementById('startBuildBtn')?.addEventListener('click', triggerBuildNow);

  // 文章搜索与过滤
  document.getElementById('postSearchInput').addEventListener('input', filterAndRenderPosts);
  document.getElementById('postCategoryFilter').addEventListener('change', filterAndRenderPosts);
  document.getElementById('postStatusFilter').addEventListener('change', filterAndRenderPosts);

  // Frontmatter 抽屉折叠
  document.getElementById('toggleMetaDrawerBtn').addEventListener('click', () => {
    const drawer = document.getElementById('metaDrawer');
    drawer.classList.toggle('hidden');
  });

  // 标题输入自动生成文件名 slug
  const titleInput = document.getElementById('editPostTitle');
  const filenameInput = document.getElementById('editPostFilename');
  titleInput.addEventListener('input', (e) => {
    if (!state.currentPost) {
      const val = e.target.value.trim();
      if (val && (!filenameInput.dataset.manual || filenameInput.value === '')) {
        const slug = val
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .slice(0, 40);
        filenameInput.value = `${slug || 'article'}.md`;
      }
    }
  });
  filenameInput.addEventListener('input', () => {
    filenameInput.dataset.manual = 'true';
  });

  // Markdown 编辑器实时同步
  const editorArea = document.getElementById('markdownEditorArea');
  editorArea.addEventListener('input', updateMarkdownPreview);

  // 文章保存按钮
  document.getElementById('savePostBtn').addEventListener('click', saveCurrentPost);

  // 站点配置表单
  document.getElementById('configForm').addEventListener('submit', saveSiteConfig);

  // 关于页面保存
  document.getElementById('saveSpecBtn')?.addEventListener('click', saveSpecPage);
  const specEditor = document.getElementById('specEditorArea');
  if (specEditor) {
    specEditor.addEventListener('input', () => {
      const preview = document.getElementById('specPreviewArea');
      if (preview && window.marked) {
        preview.innerHTML = window.marked.parse(specEditor.value);
      }
    });
  }

  // 媒体图库分类 Tabs
  document.getElementById('mediaCategoryTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab-btn');
    if (!btn) return;
    document.querySelectorAll('#mediaCategoryTabs .filter-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mediaFilter = btn.getAttribute('data-cat') || 'all';
    renderMedia();
  });

  // 追番状态 Filter Tabs
  document.getElementById('animeFilterTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab-btn');
    if (!btn) return;
    document.querySelectorAll('#animeFilterTabs .filter-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.animeFilter = btn.getAttribute('data-status') || 'all';
    renderAnime();
  });

  // 媒体图库拖拽上传
  initDropZone('mediaDropZone', 'mediaFileInput', handleMediaUpload);

  // 相册内照片拖拽上传
  initDropZone('albumPhotoDropZone', 'albumPhotoFileInput', handleAlbumPhotoUpload);

  // 相册表单提交
  document.getElementById('albumForm').addEventListener('submit', handleAlbumSubmit);

  // 日记表单提交
  document.getElementById('diaryForm').addEventListener('submit', handleDiarySubmit);

  // 追番表单提交
  document.getElementById('animeForm').addEventListener('submit', handleAnimeSubmit);
}

// 拖拽上传工具
function initDropZone(zoneId, inputId, uploadCallback) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadCallback(Array.from(e.target.files));
      input.value = '';
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    zone.addEventListener(name, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    zone.addEventListener(name, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });

  zone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadCallback(Array.from(e.dataTransfer.files));
    }
  });
}

// ==================== 标签页切换 ====================
window.switchTab = function(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${tabName}`);
  });

  const titles = {
    dashboard: '仪表盘',
    posts: '文章管理',
    editor: state.currentPost ? '编辑文章' : '新建文章',
    albums: '相册画廊',
    diaries: '随手日记',
    anime: '我的追番',
    config: '站点配置',
    spec: '独立页面',
    media: '媒体图库',
    build: '构建发布'
  };
  document.getElementById('pageTitle').textContent = titles[tabName] || '控制台';

  document.querySelector('.sidebar')?.classList.remove('open');
};

// ==================== 1. 仪表盘模块 ====================
async function fetchDashboardStats() {
  try {
    const res = await apiRequest('/stats');
    if (res.success && res.stats) {
      const s = res.stats;
      document.getElementById('statTotalPosts').textContent = s.totalPosts;
      document.getElementById('statPublishedPosts').textContent = s.publishedPosts;
      document.getElementById('statAlbumsCount').textContent = s.albumsCount ?? '-';
      document.getElementById('statDiariesCount').textContent = s.diariesCount ?? '-';
      document.getElementById('statAnimeCount').textContent = s.animeCount ?? '-';
      document.getElementById('statBuildStatus').textContent = s.buildStatus === 'building' ? '构建中...' : '正常运行';

      document.getElementById('sysNodeVer').textContent = s.nodeVersion || '-';
      const hours = Math.floor((s.uptime || 0) / 3600);
      const mins = Math.floor(((s.uptime || 0) % 3600) / 60);
      document.getElementById('sysUptime').textContent = `${hours}小时 ${mins}分`;
    }
  } catch (e) {
    console.error('获取统计失败:', e);
  }
}

// ==================== 2. 文章管理模块 ====================
function getPostFrontendUrl(post) {
  const rel = post.relativePath || '';
  const slug = rel.replace(/\.(md|mdx|markdown)$/i, '').replace(/\\/g, '/');
  return `/posts/${slug}/`;
}

async function fetchPostsList() {
  try {
    const res = await apiRequest('/posts');
    if (res.success) {
      state.posts = res.posts || [];
      document.getElementById('navPostCount').textContent = state.posts.length;
      updateCategoryFilterOptions();
      filterAndRenderPosts();
      renderDashboardRecentPosts();
    }
  } catch (e) {
    showToast('获取文章列表失败', 'error');
  }
}

function updateCategoryFilterOptions() {
  const catSelect = document.getElementById('postCategoryFilter');
  const currentVal = catSelect.value;
  const categories = Array.from(new Set(state.posts.map(p => p.category).filter(Boolean)));

  catSelect.innerHTML = '<option value="">全部分类</option>' +
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
  catSelect.value = currentVal;
}

function filterAndRenderPosts() {
  const query = document.getElementById('postSearchInput').value.trim().toLowerCase();
  const category = document.getElementById('postCategoryFilter').value;
  const status = document.getElementById('postStatusFilter').value;

  let filtered = state.posts.filter(post => {
    if (query) {
      const matchTitle = (post.title || '').toLowerCase().includes(query);
      const matchPath = (post.relativePath || '').toLowerCase().includes(query);
      const matchTags = (post.tags || []).some(t => t.toLowerCase().includes(query));
      if (!matchTitle && !matchPath && !matchTags) return false;
    }
    if (category && post.category !== category) return false;
    if (status === 'published' && post.draft) return false;
    if (status === 'draft' && !post.draft) return false;
    return true;
  });

  const tbody = document.getElementById('postsTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-muted">未找到匹配文章</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(post => `
    <tr>
      <td>
        <div class="post-item-title">${escapeHtml(post.title || post.relativePath)}</div>
        <div class="post-item-path">${escapeHtml(post.relativePath)}</div>
      </td>
      <td>
        <span class="badge badge-info">${escapeHtml(post.category || '未分类')}</span>
        ${(post.tags || []).map(t => `<span class="badge badge-outline">${escapeHtml(t)}</span>`).join('')}
      </td>
      <td>${post.wordCount || 0} 字</td>
      <td>${post.published || '未设置'}</td>
      <td>
        ${post.draft ? '<span class="badge badge-warning">草稿</span>' : '<span class="badge badge-success">已发布</span>'}
        ${post.pinned ? '<span class="badge badge-accent">置顶</span>' : ''}
      </td>
      <td class="text-right">
        <div class="btn-group">
          <a class="btn btn-sm btn-outline" href="${getPostFrontendUrl(post)}" target="_blank" title="在新标签页中查看前台文章">👁️ 查看</a>
          <button class="btn btn-sm btn-outline" onclick="openEditPost('${encodeURIComponent(post.relativePath)}')">✏️ 编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deletePost('${encodeURIComponent(post.relativePath)}')">🗑️ 删除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderDashboardRecentPosts() {
  const container = document.getElementById('dashRecentPosts');
  const recent = state.posts.slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">暂无文章</td></tr>';
    return;
  }

  container.innerHTML = recent.map(p => `
    <tr>
      <td>
        <div class="font-medium">${escapeHtml(p.title || p.relativePath)}</div>
      </td>
      <td><span class="badge badge-info">${escapeHtml(p.category || '未分类')}</span></td>
      <td>${p.published || '-'}</td>
      <td>${p.draft ? '<span class="badge badge-warning">草稿</span>' : '<span class="badge badge-success">已发布</span>'}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="openEditPost('${encodeURIComponent(p.relativePath)}')">编辑 →</button>
      </td>
    </tr>
  `).join('');
}

// ==================== 3. 文章编辑器模块 ====================
window.openNewPostEditor = function() {
  state.currentPost = null;
  document.getElementById('editPostTitle').value = '';
  document.getElementById('editPostFilename').value = '';
  document.getElementById('editPostPublished').value = new Date().toISOString().split('T')[0];
  document.getElementById('editPostCategory').value = '';
  document.getElementById('editPostTags').value = '';
  document.getElementById('editPostImage').value = '';
  document.getElementById('editPostDesc').value = '';
  document.getElementById('editPostDraft').checked = false;
  document.getElementById('editPostPinned').checked = false;
  document.getElementById('editPostComment').checked = true;
  document.getElementById('markdownEditorArea').value = '# 欢迎开始创作\n\n在此输入你的文章正文内容...';
  document.getElementById('metaDrawer').classList.remove('hidden');

  updateMarkdownPreview();
  switchTab('editor');
};

window.openEditPost = async function(encodedRelPath) {
  const relPath = decodeURIComponent(encodedRelPath);
  try {
    const res = await apiRequest(`/posts/${encodeURIComponent(relPath)}`);
    if (res.success && res.post) {
      const p = res.post;
      state.currentPost = p;

      document.getElementById('editPostTitle').value = p.frontmatter.title || '';
      document.getElementById('editPostFilename').value = p.relativePath;
      document.getElementById('editPostPublished').value = p.frontmatter.published || '';
      document.getElementById('editPostCategory').value = p.frontmatter.category || '';
      document.getElementById('editPostTags').value = (p.frontmatter.tags || []).join(', ');
      document.getElementById('editPostImage').value = p.frontmatter.image || '';
      document.getElementById('editPostDesc').value = p.frontmatter.description || '';
      document.getElementById('editPostDraft').checked = Boolean(p.frontmatter.draft);
      document.getElementById('editPostPinned').checked = Boolean(p.frontmatter.pinned);
      document.getElementById('editPostComment').checked = p.frontmatter.comment !== false;
      document.getElementById('markdownEditorArea').value = p.content || '';

      updateMarkdownPreview();
      switchTab('editor');
    }
  } catch (e) {
    showToast('加载文章详情失败', 'error');
  }
};

function updateMarkdownPreview() {
  const md = document.getElementById('markdownEditorArea').value;
  const preview = document.getElementById('markdownPreviewArea');
  const wordCount = document.getElementById('editorWordCount');

  if (window.marked) {
    preview.innerHTML = window.marked.parse(md);
  } else {
    preview.textContent = md;
  }
  wordCount.textContent = `${md.trim().length} 字`;
}

window.insertMarkdown = function(prefix, suffix, placeholder) {
  const textarea = document.getElementById('markdownEditorArea');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end) || placeholder;

  const replacement = prefix + selected + suffix;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);

  textarea.focus();
  textarea.selectionStart = start + prefix.length;
  textarea.selectionEnd = start + prefix.length + selected.length;
  updateMarkdownPreview();
};

window.insertImageToEditor = function() {
  selectImageForField('editorInsert');
};

async function saveCurrentPost() {
  const title = document.getElementById('editPostTitle').value.trim();
  let filename = document.getElementById('editPostFilename').value.trim();
  const content = document.getElementById('markdownEditorArea').value;

  if (!title) {
    showToast('请输入文章标题', 'warning');
    return;
  }

  const tags = document.getElementById('editPostTags').value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const frontmatter = {
    title,
    published: document.getElementById('editPostPublished').value,
    category: document.getElementById('editPostCategory').value.trim(),
    tags,
    description: document.getElementById('editPostDesc').value.trim(),
    image: document.getElementById('editPostImage').value.trim(),
    draft: document.getElementById('editPostDraft').checked,
    pinned: document.getElementById('editPostPinned').checked,
    comment: document.getElementById('editPostComment').checked
  };

  const saveBtn = document.getElementById('savePostBtn');
  saveBtn.disabled = true;

  try {
    let res;
    if (state.currentPost) {
      res = await apiRequest(`/posts/${encodeURIComponent(state.currentPost.relativePath)}`, {
        method: 'PUT',
        body: JSON.stringify({
          newRelativePath: filename,
          frontmatter,
          content
        })
      });
    } else {
      res = await apiRequest('/posts', {
        method: 'POST',
        body: JSON.stringify({
          filename,
          frontmatter,
          content
        })
      });
    }

    if (res.success) {
      showToast(state.currentPost ? '文章更新成功' : '文章创建成功', 'success');
      await fetchPostsList();
      fetchDashboardStats();
      switchTab('posts');
    } else {
      showToast(res.message || '保存文章失败', 'error');
    }
  } catch (e) {
    showToast(e.message || '网络异常', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

window.deletePost = async function(encodedRelPath) {
  const relPath = decodeURIComponent(encodedRelPath);
  if (!confirm(`确定要彻底删除文章 "${relPath}" 吗？此操作无法撤销。`)) return;

  try {
    const res = await apiRequest(`/posts/${encodeURIComponent(relPath)}`, {
      method: 'DELETE'
    });
    if (res.success) {
      showToast('文章已删除', 'success');
      fetchPostsList();
      fetchDashboardStats();
    } else {
      showToast(res.message || '删除失败', 'error');
    }
  } catch (e) {
    showToast('删除请求异常', 'error');
  }
};

// ==================== 4. 相册画廊模块 (新增) ====================
async function fetchAlbumsList() {
  try {
    const res = await apiRequest('/albums');
    if (res.success) {
      state.albums = res.albums || [];
      document.getElementById('navAlbumsCount').textContent = state.albums.length;
      document.getElementById('statAlbumsCount').textContent = state.albums.length;
      renderAlbums();
      updateUploadFolderOptions();
    }
  } catch (e) {
    console.error('获取相册列表失败:', e);
  }
}

function renderAlbums() {
  const container = document.getElementById('albumsGrid');
  if (!container) return;

  if (state.albums.length === 0) {
    container.innerHTML = '<div class="card text-center py-12 text-muted">暂无相册，点击上方“新建相册”即可创建</div>';
    return;
  }

  container.innerHTML = state.albums.map(a => `
    <div class="album-card">
      <div class="album-cover-box">
        <img src="${a.cover || '/favicon/favicon.ico'}" class="album-cover-img" alt="${escapeHtml(a.title)}" onerror="this.src='/favicon/favicon.ico'">
        <span class="album-badge-count">📸 ${a.photosCount || 0} 张</span>
        ${a.hidden ? '<span class="album-badge-hidden">隐藏</span>' : ''}
      </div>
      <div class="album-content">
        <div class="album-title">${escapeHtml(a.title)}</div>
        <div class="album-desc">${escapeHtml(a.description || '暂无描述')}</div>
        <div class="album-meta-row">
          <span>📁 ${escapeHtml(a.id)}</span>
          <span>📅 ${a.date || '未设日期'}</span>
        </div>
        <div class="album-actions-row">
          <button class="btn btn-sm btn-primary" onclick="openAlbumPhotosManager('${escapeHtml(a.id)}')">🖼️ 照片管理</button>
          <button class="btn btn-sm btn-outline" onclick="openEditAlbumModal('${escapeHtml(a.id)}')">⚙️ 设置</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAlbum('${escapeHtml(a.id)}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.openNewAlbumModal = function() {
  document.getElementById('albumModalTitle').textContent = '新建相册';
  document.getElementById('albumIdInput').value = '';
  document.getElementById('albumIdInput').disabled = false;
  document.getElementById('albumTitleInput').value = '';
  document.getElementById('albumDescInput').value = '';
  document.getElementById('albumDateInput').value = new Date().toISOString().split('T')[0];
  document.getElementById('albumLocationInput').value = 'Local';
  document.getElementById('albumTagsInput').value = '';
  document.getElementById('albumColumnsInput').value = '3';
  document.getElementById('albumHiddenInput').checked = false;
  openModal('albumModal');
};

window.openEditAlbumModal = function(albumId) {
  const a = state.albums.find(item => item.id === albumId);
  if (!a) return;

  document.getElementById('albumModalTitle').textContent = '编辑相册设置';
  document.getElementById('albumIdInput').value = a.id;
  document.getElementById('albumIdInput').disabled = true;
  document.getElementById('albumTitleInput').value = a.title || '';
  document.getElementById('albumDescInput').value = a.description || '';
  document.getElementById('albumDateInput').value = a.date || '';
  document.getElementById('albumLocationInput').value = a.location || '';
  document.getElementById('albumTagsInput').value = (a.tags || []).join(', ');
  document.getElementById('albumColumnsInput').value = String(a.columns || 3);
  document.getElementById('albumHiddenInput').checked = Boolean(a.hidden);
  openModal('albumModal');
};

async function handleAlbumSubmit(e) {
  e.preventDefault();
  const isEdit = document.getElementById('albumIdInput').disabled;
  const albumId = document.getElementById('albumIdInput').value.trim();
  const title = document.getElementById('albumTitleInput').value.trim();
  const description = document.getElementById('albumDescInput').value.trim();
  const date = document.getElementById('albumDateInput').value;
  const location = document.getElementById('albumLocationInput').value.trim();
  const tags = document.getElementById('albumTagsInput').value.split(',').map(s => s.trim()).filter(Boolean);
  const columns = Number(document.getElementById('albumColumnsInput').value) || 3;
  const hidden = document.getElementById('albumHiddenInput').checked;

  try {
    let res;
    if (isEdit) {
      res = await apiRequest(`/albums/${encodeURIComponent(albumId)}`, {
        method: 'PUT',
        body: JSON.stringify({ title, description, date, location, tags, columns, hidden })
      });
    } else {
      res = await apiRequest('/albums', {
        method: 'POST',
        body: JSON.stringify({ id: albumId, title, description, date, location, tags, columns, hidden })
      });
    }

    if (res.success) {
      showToast(isEdit ? '相册信息已保存' : '相册创建成功', 'success');
      closeModal('albumModal');
      await fetchAlbumsList();
    } else {
      showToast(res.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('提交相册异常', 'error');
  }
}

window.deleteAlbum = async function(albumId) {
  if (!confirm(`确定要删除相册 "${albumId}" 及其全部照片吗？此操作不可撤销。`)) return;
  try {
    const res = await apiRequest(`/albums/${encodeURIComponent(albumId)}`, { method: 'DELETE' });
    if (res.success) {
      showToast('相册已删除', 'success');
      fetchAlbumsList();
    } else {
      showToast(res.message || '删除失败', 'error');
    }
  } catch (e) {
    showToast('请求异常', 'error');
  }
};

// 相册内照片管理抽屉
window.openAlbumPhotosManager = function(albumId) {
  const album = state.albums.find(a => a.id === albumId);
  if (!album) return;

  state.currentAlbumId = albumId;
  document.getElementById('albumPhotosTitle').textContent = `📸 相册照片管理: ${album.title} (${album.id})`;
  document.getElementById('albumPhotosDesc').textContent = `共 ${album.photos?.length || 0} 张照片 | 目录: public/images/albums/${album.id}/`;

  renderAlbumPhotosGrid(album);
  openModal('albumPhotosModal');
};

function renderAlbumPhotosGrid(album) {
  const grid = document.getElementById('albumPhotosGrid');
  if (!album.photos || album.photos.length === 0) {
    grid.innerHTML = '<div class="text-center py-8 text-muted" style="grid-column: 1/-1;">相册内暂无照片，拖拽上方区域即可上传！</div>';
    return;
  }

  grid.innerHTML = album.photos.map(p => `
    <div class="album-photo-item">
      <img src="${p.url}" alt="${escapeHtml(p.name)}" onerror="this.src='/favicon/favicon.ico'">
      <div class="album-photo-overlay">
        <button class="btn btn-sm btn-outline" onclick="copyToClipboard('${p.url}')" title="复制链接">🔗</button>
        <button class="btn btn-sm btn-danger" onclick="deletePhotoFromAlbum('${album.id}', '${encodeURIComponent(p.name)}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function handleAlbumPhotoUpload(files) {
  if (!state.currentAlbumId) return;
  showToast(`正在上传 ${files.length} 张照片到相册...`, 'info');

  for (const file of files) {
    const base64 = await readFileAsBase64(file);
    try {
      await apiRequest(`/albums/${encodeURIComponent(state.currentAlbumId)}/photos`, {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          base64
        })
      });
    } catch (e) {
      showToast(`上传 ${file.name} 失败`, 'error');
    }
  }

  showToast('照片上传完成', 'success');
  await fetchAlbumsList();
  await fetchMediaList();
  const updatedAlbum = state.albums.find(a => a.id === state.currentAlbumId);
  if (updatedAlbum) {
    renderAlbumPhotosGrid(updatedAlbum);
  }
}

window.deletePhotoFromAlbum = async function(albumId, photoNameEncoded) {
  const photoName = decodeURIComponent(photoNameEncoded);
  if (!confirm(`确定从相册删除照片 "${photoName}" 吗？`)) return;

  try {
    const res = await apiRequest(`/albums/${encodeURIComponent(albumId)}/photos/${encodeURIComponent(photoName)}`, {
      method: 'DELETE'
    });
    if (res.success) {
      showToast('照片已删除', 'success');
      await fetchAlbumsList();
      await fetchMediaList();
      const updatedAlbum = state.albums.find(a => a.id === albumId);
      if (updatedAlbum) renderAlbumPhotosGrid(updatedAlbum);
    }
  } catch (e) {
    showToast('删除照片失败', 'error');
  }
};

// ==================== 5. 随手日记模块 (新增) ====================
async function fetchDiariesList() {
  try {
    const res = await apiRequest('/diaries');
    if (res.success) {
      state.diaries = res.diaries || [];
      document.getElementById('navDiariesCount').textContent = state.diaries.length;
      document.getElementById('statDiariesCount').textContent = state.diaries.length;
      renderDiaries();
    }
  } catch (e) {
    console.error('获取日记失败:', e);
  }
}

function renderDiaries() {
  const container = document.getElementById('diariesTimeline');
  if (!container) return;

  if (state.diaries.length === 0) {
    container.innerHTML = '<div class="card text-center py-12 text-muted">暂无日记，点击右上角“写新日记”发布一条吧！</div>';
    return;
  }

  container.innerHTML = state.diaries.map(d => {
    const dateStr = d.date ? new Date(d.date).toLocaleString('zh-CN', { hour12: false }) : '未记录时间';
    const photos = Array.isArray(d.images) ? d.images : [];
    return `
      <div class="diary-card">
        <div class="diary-header">
          <div class="diary-meta-left">
            ${d.mood ? `<span class="diary-mood-tag">${escapeHtml(d.mood)}</span>` : ''}
            <span class="diary-date">📅 ${dateStr}</span>
            ${d.location ? `<span class="diary-location">📍 ${escapeHtml(d.location)}</span>` : ''}
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline" onclick="openEditDiaryModal(${d.id})">✏️ 编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteDiary(${d.id})">🗑️</button>
          </div>
        </div>
        <div class="diary-text">${escapeHtml(d.content || '')}</div>
        ${photos.length > 0 ? `
          <div class="diary-photos-preview">
            ${photos.map(src => `<img src="${src}" class="diary-photo-thumb" onclick="copyToClipboard('${src}')" title="点击复制链接" onerror="this.src='/favicon/favicon.ico'">`).join('')}
          </div>
        ` : ''}
        ${(d.tags && d.tags.length > 0) ? `
          <div class="diary-tags-row">
            ${d.tags.map(t => `<span class="badge badge-outline">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

window.openNewDiaryModal = function() {
  document.getElementById('diaryModalTitle').textContent = '写新日记';
  document.getElementById('diaryEditId').value = '';
  document.getElementById('diaryContentInput').value = '';
  const now = new Date();
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('diaryDateInput').value = localDatetime;
  document.getElementById('diaryMoodInput').value = '🌸 开心';
  document.getElementById('diaryLocationInput').value = 'Local';
  document.getElementById('diaryTagsInput').value = '日常, 随笔';
  document.getElementById('diaryImagesInput').value = '';
  openModal('diaryModal');
};

window.openEditDiaryModal = function(id) {
  const d = state.diaries.find(item => Number(item.id) === Number(id));
  if (!d) return;

  document.getElementById('diaryModalTitle').textContent = '编辑日记';
  document.getElementById('diaryEditId').value = d.id;
  document.getElementById('diaryContentInput').value = d.content || '';
  if (d.date) {
    const dateObj = new Date(d.date);
    const localDatetime = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('diaryDateInput').value = localDatetime;
  }
  document.getElementById('diaryMoodInput').value = d.mood || '';
  document.getElementById('diaryLocationInput').value = d.location || '';
  document.getElementById('diaryTagsInput').value = (d.tags || []).join(', ');
  document.getElementById('diaryImagesInput').value = (d.images || []).join('\n');
  openModal('diaryModal');
};

async function handleDiarySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('diaryEditId').value;
  const content = document.getElementById('diaryContentInput').value.trim();
  const rawDate = document.getElementById('diaryDateInput').value;
  const date = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
  const mood = document.getElementById('diaryMoodInput').value.trim();
  const location = document.getElementById('diaryLocationInput').value.trim();
  const tags = document.getElementById('diaryTagsInput').value.split(',').map(s => s.trim()).filter(Boolean);
  const images = document.getElementById('diaryImagesInput').value.split('\n').map(s => s.trim()).filter(Boolean);

  try {
    let res;
    if (id) {
      res = await apiRequest(`/diaries/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content, date, mood, location, tags, images })
      });
    } else {
      res = await apiRequest('/diaries', {
        method: 'POST',
        body: JSON.stringify({ content, date, mood, location, tags, images })
      });
    }

    if (res.success) {
      showToast(id ? '日记已保存' : '日记发布成功', 'success');
      closeModal('diaryModal');
      await fetchDiariesList();
      fetchDashboardStats();
    } else {
      showToast(res.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('提交日记异常', 'error');
  }
}

window.deleteDiary = async function(id) {
  if (!confirm('确定要删除这条日记吗？')) return;
  try {
    const res = await apiRequest(`/diaries/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('日记已删除', 'success');
      fetchDiariesList();
      fetchDashboardStats();
    }
  } catch (e) {
    showToast('删除日记失败', 'error');
  }
};

window.selectImageForDiary = function() {
  selectImageForField('diaryImages');
};

// ==================== 6. 我的追番模块 (新增) ====================
async function fetchAnimeList() {
  try {
    const res = await apiRequest('/anime');
    if (res.success) {
      state.anime = res.anime || [];
      document.getElementById('navAnimeCount').textContent = state.anime.length;
      document.getElementById('statAnimeCount').textContent = state.anime.length;
      renderAnime();
    }
  } catch (e) {
    console.error('获取番剧失败:', e);
  }
}

function renderAnime() {
  const container = document.getElementById('animeGrid');
  if (!container) return;

  const filtered = state.anime.filter(a => {
    if (state.animeFilter === 'all') return true;
    return a.status === state.animeFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="card text-center py-12 text-muted">暂无符合条件的番剧记录</div>';
    return;
  }

  const statusMap = {
    watching: { text: '正在追', class: 'watching' },
    completed: { text: '已看完', class: 'completed' },
    planned: { text: '想看', class: 'planned' }
  };

  container.innerHTML = filtered.map((a, idx) => {
    const st = statusMap[a.status] || { text: a.status, class: 'watching' };
    const prog = Number(a.progress) || 0;
    const total = Number(a.totalEpisodes) || 12;
    const pct = Math.min(100, Math.round((prog / total) * 100));

    return `
      <div class="anime-card">
        <div class="anime-cover-box">
          <img src="${a.cover || '/favicon/favicon.ico'}" class="anime-cover-img" alt="${escapeHtml(a.title)}" onerror="this.src='/favicon/favicon.ico'">
          <span class="anime-status-badge ${st.class}">${st.text}</span>
        </div>
        <div class="anime-body">
          <div class="anime-title" title="${escapeHtml(a.title)}">${escapeHtml(a.title)}</div>
          <div class="anime-meta-sub">
            <span class="anime-rating-tag">⭐ ${a.rating || 9.0}</span>
            <span>🏢 ${escapeHtml(a.studio || '未知')}</span>
            <span>📅 ${escapeHtml(a.year || '')}</span>
          </div>
          <div class="anime-desc-text">${escapeHtml(a.description || '暂无简介')}</div>
          <div class="anime-progress-section">
            <div class="anime-progress-info">
              <span>进度: ${prog} / ${total} 集</span>
              <span>${pct}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
          <div class="anime-card-footer">
            <div class="btn-group">
              <button class="btn btn-sm btn-accent" onclick="incrementAnimeProgress(${idx})" title="看完一集">+1集</button>
              ${a.link ? `<a href="${a.link}" target="_blank" class="btn btn-sm btn-outline">🔗 链接</a>` : ''}
            </div>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline" onclick="openEditAnimeModal(${idx})">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteAnime(${idx})">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.openNewAnimeModal = function() {
  document.getElementById('animeModalTitle').textContent = '添加追番记录';
  document.getElementById('animeEditIndex').value = '';
  document.getElementById('animeTitleInput').value = '';
  document.getElementById('animeStatusInput').value = 'watching';
  document.getElementById('animeRatingInput').value = '9.5';
  document.getElementById('animeProgressInput').value = '0';
  document.getElementById('animeTotalInput').value = '12';
  document.getElementById('animeCoverInput').value = '';
  document.getElementById('animeYearInput').value = new Date().getFullYear().toString();
  document.getElementById('animeStudioInput').value = '';
  document.getElementById('animeGenreInput').value = '日常, 治愈';
  document.getElementById('animeLinkInput').value = '';
  document.getElementById('animeDescInput').value = '';
  openModal('animeModal');
};

window.openEditAnimeModal = function(index) {
  const a = state.anime[index];
  if (!a) return;

  document.getElementById('animeModalTitle').textContent = '编辑番剧信息';
  document.getElementById('animeEditIndex').value = String(index);
  document.getElementById('animeTitleInput').value = a.title || '';
  document.getElementById('animeStatusInput').value = a.status || 'watching';
  document.getElementById('animeRatingInput').value = String(a.rating || 9.0);
  document.getElementById('animeProgressInput').value = String(a.progress || 0);
  document.getElementById('animeTotalInput').value = String(a.totalEpisodes || 12);
  document.getElementById('animeCoverInput').value = a.cover || '';
  document.getElementById('animeYearInput').value = a.year || '';
  document.getElementById('animeStudioInput').value = a.studio || '';
  document.getElementById('animeGenreInput').value = Array.isArray(a.genre) ? a.genre.join(', ') : (a.genre || '');
  document.getElementById('animeLinkInput').value = a.link || '';
  document.getElementById('animeDescInput').value = a.description || '';
  openModal('animeModal');
};

async function handleAnimeSubmit(e) {
  e.preventDefault();
  const idx = document.getElementById('animeEditIndex').value;
  const isEdit = idx !== '';
  const item = {
    title: document.getElementById('animeTitleInput').value.trim(),
    status: document.getElementById('animeStatusInput').value,
    rating: Number(document.getElementById('animeRatingInput').value) || 9.0,
    progress: Number(document.getElementById('animeProgressInput').value) || 0,
    totalEpisodes: Number(document.getElementById('animeTotalInput').value) || 12,
    cover: document.getElementById('animeCoverInput').value.trim(),
    year: document.getElementById('animeYearInput').value.trim(),
    studio: document.getElementById('animeStudioInput').value.trim(),
    genre: document.getElementById('animeGenreInput').value.split(',').map(s => s.trim()).filter(Boolean),
    link: document.getElementById('animeLinkInput').value.trim(),
    description: document.getElementById('animeDescInput').value.trim()
  };

  try {
    let res;
    if (isEdit) {
      res = await apiRequest(`/anime/${idx}`, {
        method: 'PUT',
        body: JSON.stringify(item)
      });
    } else {
      res = await apiRequest('/anime', {
        method: 'POST',
        body: JSON.stringify(item)
      });
    }

    if (res.success) {
      showToast(isEdit ? '番剧修改已保存' : '新番剧已添加', 'success');
      closeModal('animeModal');
      await fetchAnimeList();
      fetchDashboardStats();
    } else {
      showToast(res.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('提交番剧异常', 'error');
  }
}

window.incrementAnimeProgress = async function(index) {
  const a = state.anime[index];
  if (!a) return;
  const current = Number(a.progress) || 0;
  const total = Number(a.totalEpisodes) || 12;
  const newProgress = Math.min(total, current + 1);
  const newStatus = newProgress >= total ? 'completed' : a.status;

  try {
    const res = await apiRequest(`/anime/${index}`, {
      method: 'PUT',
      body: JSON.stringify({ progress: newProgress, status: newStatus })
    });
    if (res.success) {
      a.progress = newProgress;
      a.status = newStatus;
      renderAnime();
      showToast(`《${a.title}》进度已更新为 ${newProgress}/${total} 集`, 'success');
    }
  } catch (e) {
    showToast('更新进度失败', 'error');
  }
};

window.deleteAnime = async function(index) {
  const a = state.anime[index];
  if (!confirm(`确定要删除《${a?.title || '该番剧'}》的追番记录吗？`)) return;
  try {
    const res = await apiRequest(`/anime/${index}`, { method: 'DELETE' });
    if (res.success) {
      showToast('番剧已删除', 'success');
      fetchAnimeList();
      fetchDashboardStats();
    }
  } catch (e) {
    showToast('删除失败', 'error');
  }
};

// ==================== 7. 站点配置模块 ====================
async function fetchSiteConfig() {
  try {
    const res = await apiRequest('/config');
    if (res.success && res.config) {
      const c = res.config;
      document.getElementById('confTitle').value = c.title || '';
      document.getElementById('confSubtitle').value = c.subtitle || '';
      document.getElementById('confSiteURL').value = c.siteURL || '';
      document.getElementById('confBannerTitle').value = c.bannerTitle || '';
      document.getElementById('confBannerSubtitles').value = (c.bannerSubtitles || []).join('\n');
      document.getElementById('confProfileName').value = c.profileName || '';
      document.getElementById('confProfileBio').value = c.profileBio || '';
      document.getElementById('confProfileAvatar').value = c.profileAvatar || '';
      document.getElementById('confAnnouncement').value = c.announcement || '';
    }
  } catch (e) {
    console.error('获取站点配置失败:', e);
  }
}

async function saveSiteConfig(e) {
  e.preventDefault();
  const bannerSubtitles = document.getElementById('confBannerSubtitles').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const payload = {
    title: document.getElementById('confTitle').value.trim(),
    subtitle: document.getElementById('confSubtitle').value.trim(),
    siteURL: document.getElementById('confSiteURL').value.trim(),
    bannerTitle: document.getElementById('confBannerTitle').value.trim(),
    bannerSubtitles,
    profileName: document.getElementById('confProfileName').value.trim(),
    profileBio: document.getElementById('confProfileBio').value.trim(),
    profileAvatar: document.getElementById('confProfileAvatar').value.trim(),
    announcement: document.getElementById('confAnnouncement').value.trim()
  };

  try {
    const res = await apiRequest('/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast('站点配置已保存', 'success');
    } else {
      showToast(res.message || '保存失败', 'error');
    }
  } catch (err) {
    showToast('保存配置异常', 'error');
  }
}

// ==================== 8. 独立页面模块 (About 等) ====================
async function fetchSpecPage(name) {
  try {
    const res = await apiRequest(`/spec/${encodeURIComponent(name)}`);
    if (res.success) {
      const editor = document.getElementById('specEditorArea');
      const preview = document.getElementById('specPreviewArea');
      if (editor) editor.value = res.content || '';
      if (preview && window.marked) preview.innerHTML = window.marked.parse(res.content || '');
    }
  } catch (e) {
    console.error('读取独立页面失败:', e);
  }
}

async function saveSpecPage() {
  const content = document.getElementById('specEditorArea').value;
  try {
    const res = await apiRequest('/spec/about.md', {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
    if (res.success) {
      showToast('关于页面保存成功', 'success');
    } else {
      showToast(res.message || '保存失败', 'error');
    }
  } catch (e) {
    showToast('保存异常', 'error');
  }
}

// ==================== 9. 媒体图库模块 (全量升级) ====================
async function fetchMediaList() {
  try {
    const res = await apiRequest('/media');
    if (res.success) {
      state.media = res.media || [];
      document.getElementById('mediaTotalCount').textContent = state.media.length;
      renderMedia();
    }
  } catch (e) {
    console.error('获取媒体库失败:', e);
  }
}

function updateUploadFolderOptions() {
  const sel = document.getElementById('uploadDestFolder');
  if (!sel) return;

  let html = `
    <option value="">文章/通用图片 (public/images)</option>
    <option value="diary">日记插图 (public/images/diary)</option>
    <option value="device">设备图片 (public/images/device)</option>
  `;

  if (state.albums && state.albums.length > 0) {
    html += '<optgroup label="上传至指定相册">';
    state.albums.forEach(a => {
      html += `<option value="albums/${a.id}">相册: ${a.title} (${a.id})</option>`;
    });
    html += '</optgroup>';
  }

  sel.innerHTML = html;
}

function renderMedia() {
  const container = document.getElementById('mediaGrid');
  if (!container) return;

  const filtered = state.media.filter(m => {
    if (state.mediaFilter === 'all') return true;
    return (m.category || '').includes(state.mediaFilter);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-muted" style="grid-column: 1/-1;">暂无匹配的图片素材</div>';
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="media-card">
      <div class="media-preview-box">
        <img src="${item.url}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='/favicon/favicon.ico'">
        <span class="media-cat-badge">${escapeHtml(item.category || '通用')}</span>
      </div>
      <div class="media-info">
        <div class="media-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="media-size">${(item.size / 1024).toFixed(1)} KB</div>
        <div class="media-actions">
          <button class="btn btn-sm btn-outline" onclick="copyToClipboard('![${escapeHtml(item.name)}](${item.url})')" title="复制 Markdown 代码">📋 MD</button>
          <button class="btn btn-sm btn-outline" onclick="copyToClipboard('${item.url}')" title="复制图片 URL">🔗 URL</button>
          <button class="btn btn-sm btn-danger" onclick="deleteMediaFile('${encodeURIComponent(item.path)}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function handleMediaUpload(files) {
  const folder = document.getElementById('uploadDestFolder')?.value || '';
  showToast(`正在上传 ${files.length} 个文件...`, 'info');

  for (const file of files) {
    const base64 = await readFileAsBase64(file);
    try {
      await apiRequest('/upload', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          folder,
          base64
        })
      });
    } catch (e) {
      showToast(`上传 ${file.name} 失败`, 'error');
    }
  }

  showToast('上传完成', 'success');
  await fetchMediaList();
  fetchAlbumsList();
}

window.deleteMediaFile = async function(encodedPath) {
  const relPath = decodeURIComponent(encodedPath);
  if (!confirm(`确定要彻底删除图片 "${relPath}" 吗？`)) return;

  try {
    const res = await apiRequest(`/media/${encodeURIComponent(relPath)}`, {
      method: 'DELETE'
    });
    if (res.success) {
      showToast('图片已删除', 'success');
      fetchMediaList();
      fetchAlbumsList();
    } else {
      showToast(res.message || '删除失败', 'error');
    }
  } catch (e) {
    showToast('删除异常', 'error');
  }
};

window.selectImageForField = function(targetFieldId) {
  state.activeImageTargetField = targetFieldId;
  const input = prompt('请输入图片 URL 地址，或直接从下方媒体库复制（也可以前往“媒体图库”复制后粘贴）：', '/images/');
  if (input !== null && input.trim() !== '') {
    const cleanUrl = input.trim();
    if (targetFieldId === 'editorInsert') {
      window.insertMarkdown(`![图片](${cleanUrl})`, '', '');
    } else if (targetFieldId === 'diaryImages') {
      const textarea = document.getElementById('diaryImagesInput');
      textarea.value = textarea.value ? `${textarea.value}\n${cleanUrl}` : cleanUrl;
    } else {
      const el = document.getElementById(targetFieldId);
      if (el) el.value = cleanUrl;
    }
  }
};

// ==================== 10. 构建发布模块 ====================
window.triggerBuildNow = async function() {
  if (state.isBuilding) {
    showToast('构建已在进行中...', 'warning');
    return;
  }

  try {
    const res = await apiRequest('/build', { method: 'POST' });
    if (res.success) {
      showToast('静态构建任务已在后台启动！', 'success');
      startBuildPolling();
      switchTab('build');
    } else {
      showToast(res.message || '启动构建失败', 'error');
    }
  } catch (e) {
    showToast('触发构建异常', 'error');
  }
};

async function checkBuildStatus() {
  try {
    const res = await apiRequest('/build/status');
    if (res.success) {
      updateBuildUI(res);
    }
  } catch (e) {}
}

function startBuildPolling() {
  if (state.buildInterval) clearInterval(state.buildInterval);
  state.isBuilding = true;
  state.buildInterval = setInterval(async () => {
    try {
      const res = await apiRequest('/build/status');
      if (res.success) {
        updateBuildUI(res);
        if (res.status !== 'building') {
          clearInterval(state.buildInterval);
          state.buildInterval = null;
          state.isBuilding = false;
          if (res.status === 'success') {
            showToast('🎉 站点构建发布成功！最新内容已生效', 'success');
          } else if (res.status === 'error') {
            showToast('构建失败，请查看日志', 'error');
          }
        }
      }
    } catch (e) {}
  }, 1000);
}

function updateBuildUI(statusData) {
  const badge = document.getElementById('buildStatusBadge');
  const dot = document.getElementById('navBuildDot');
  const consoleEl = document.getElementById('buildLogConsole');

  if (statusData.status === 'building') {
    badge.textContent = '🚀 构建中...';
    badge.className = 'badge badge-warning';
    dot.className = 'status-dot building';
  } else if (statusData.status === 'success') {
    badge.textContent = '✨ 构建完成';
    badge.className = 'badge badge-success';
    dot.className = 'status-dot';
  } else if (statusData.status === 'error') {
    badge.textContent = '❌ 构建出错';
    badge.className = 'badge badge-danger';
    dot.className = 'status-dot';
  } else {
    badge.textContent = '空闲';
    badge.className = 'badge badge-info';
    dot.className = 'status-dot';
  }

  if (statusData.logs && statusData.logs.length > 0) {
    consoleEl.innerHTML = statusData.logs.map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('');
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

// ==================== 通用辅助工具 ====================
window.copyToClipboard = function(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`已复制: ${text}`, 'success');
    }).catch(() => {
      prompt('按 Ctrl+C 复制:', text);
    });
  } else {
    prompt('按 Ctrl+C 复制:', text);
  }
};

window.showToast = function(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
