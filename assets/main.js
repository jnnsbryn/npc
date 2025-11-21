document.addEventListener('DOMContentLoaded', () => {
  // === CONFIG ===
  const CONFIG = {
    REPO_OWNER: 'jnnsbryn',
    REPO_NAME: 'npc',
    BRANCH: 'main',
    POSTS_PATH: 'post'
  };

  // === DOM ===
  const postListEl = document.getElementById('post-list');
  const contentEl = document.getElementById('content');
  const searchEl = document.getElementById('search');
  const themeToggleEl = document.getElementById('theme-toggle');
  const tagHeaderEl = document.getElementById('tag-header');
  const currentTagEl = document.getElementById('current-tag');
  const clearTagBtn = document.getElementById('clear-tag');

  if (!postListEl || !contentEl) {
    console.warn('[NPC] Elemen utama tidak ditemukan.');
    return;
  }

  let allPosts = [];
  let displayedCount = 0;
  let currentTag = null;
  let isViewingPost = false;
  const LOAD_STEP = 10;

  // === PARSING ===
  function parseFrontMatter(md) {
    let title = 'Tanpa Judul';
    let date = '';
    let tags = [];
    let body = md;

    if (md.startsWith('---')) {
      const end = md.indexOf('---', 3);
      if (end !== -1) {
        const meta = md.substring(3, end).trim();
        const lines = meta.split('\n');
        for (let line of lines) {
          const i = line.indexOf(':');
          if (i === -1) continue;
          const key = line.substring(0, i).trim();
          const value = line.substring(i + 1).trim();
          
          if (key === 'title') title = value.replace(/^["']|["']$/g, '');
          else if (key === 'date') date = value;
          else if (key === 'tags') {
            let tagStr = value.replace(/[[\]"]/g, '').trim();
            tags = tagStr.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
          }
        }
        body = md.substring(end + 3).trim();
      }
    }
    return { title, date, tags, body };
  }

  // === FETCH ===
  async function fetchPosts() {
    try {
      const treeUrl = `https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/git/trees/${CONFIG.BRANCH}?recursive=1`;
      const treeRes = await fetch(treeUrl);
      if (!treeRes.ok) throw new Error(`Gagal baca repo: ${treeRes.status}`);
      const { tree } = await treeRes.json();

      const postFolders = {};
      tree.forEach(item => {
        if (item.type === 'blob' && item.path.startsWith('post/') && item.path.endsWith('index.md')) {
          const folderPath = item.path.replace(/\/index\.md$/, '');
          postFolders[folderPath] = { folder: folderPath, indexPath: item.path };
        }
      });

      const posts = [];
      for (const folder of Object.values(postFolders)) {
        const rawUrl = `https://raw.githubusercontent.com/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/${CONFIG.BRANCH}/${folder.indexPath}`;
        const md = await fetch(rawUrl).then(r => r.text());
        const { title, date, tags, body } = parseFrontMatter(md);
        const folderName = folder.folder.split('/').pop();
        posts.push({
          folderName,
          title,
          date,
          tags,
          rawUrl,
          bodyPreview: body.substring(0, 200)
        });
      }

      posts.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);
      allPosts = posts;
      renderAllPosts();
      loadFromHash();
    } catch (err) {
      console.error('[Error]', err);
      if (postListEl) postListEl.innerHTML = `<li style="color:#e53e3e">⚠️ Gagal muat: ${err.message}</li>`;
    }
  }

  // === RENDER ===
  function renderAllPosts() {
    isViewingPost = false;
    currentTag = null;
    if (postListEl) postListEl.style.display = 'block';
    if (tagHeaderEl) tagHeaderEl.style.display = 'none';
    if (contentEl) contentEl.innerHTML = '';
    renderPostList(allPosts);
  }

  function renderTagPage(tag) {
    isViewingPost = false;
    currentTag = tag;
    if (postListEl) postListEl.style.display = 'block';
    if (tagHeaderEl) tagHeaderEl.style.display = 'block';
    if (currentTagEl) currentTagEl.textContent = tag;
    if (contentEl) contentEl.innerHTML = '';
    renderPostList(allPosts.filter(p => p.tags.includes(tag)));
  }

  function renderPostList(posts, reset = true) {
    if (isViewingPost || !postListEl) return;

    if (reset) {
      displayedCount = 0;
      postListEl.innerHTML = '';
    }

    const slice = posts.slice(displayedCount, displayedCount + LOAD_STEP);
    slice.forEach(post => {
      const li = document.createElement('li');
      li.className = 'post-item';
      const dateStr = post.date ? new Date(post.date).toLocaleDateString('id-ID') : '';
      const tagLinks = post.tags.map(t => `<a href="#tag/${t}" class="tag">${t}</a>`).join(' ');

      li.innerHTML = `
        <a href="#post/${post.folderName}" class="post-title">${post.title}</a>
        <div class="post-meta">
          ${dateStr ? `${dateStr} · ` : ''}
          ${tagLinks}
        </div>
      `;
      li.querySelector('a.post-title').onclick = e => {
        e.preventDefault();
        loadPost(post);
        history.pushState(null, '', `#post/${post.folderName}`);
      };
      postListEl.appendChild(li);
    });

    displayedCount += slice.length;

    document.getElementById('load-more')?.remove();
    if (displayedCount < posts.length) {
      const btn = document.createElement('button');
      btn.id = 'load-more';
      btn.className = 'load-more';
      btn.textContent = `Muat ${Math.min(LOAD_STEP, posts.length - displayedCount)} lagi…`;
      btn.onclick = () => renderPostList(posts, false);
      postListEl.appendChild(btn);
    }
  }

  // === LOAD POST (FULL SCREEN) ===
  function loadPost(post) {
    isViewingPost = true;
    if (postListEl) postListEl.style.display = 'none';
    if (tagHeaderEl) tagHeaderEl.style.display = 'none';
    if (contentEl) contentEl.innerHTML = 'Memuat...';

    fetch(post.rawUrl)
      .then(r => r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`))
      .then(md => {
        const { title, date, tags, body } = parseFrontMatter(md);
        const dateStr = date ? `<p class="post-date">${new Date(date).toLocaleDateString('id-ID')}</p>` : '';
        
        const fixedBody = body.replace(
          /!\[([^\]]*)\]\(([^)]+)\)/g,
          (match, alt, src) => src.startsWith('http') ? match : `![${alt}](/post/${post.folderName}/${src})`
        );

        const html = marked.parse(fixedBody, { gfm: true, breaks: true });
        if (!contentEl) return;
        contentEl.innerHTML = `
          <article class="post-single">
            <a href="#" class="back-to-list">&larr; Kembali ke daftar</a>
            <h1>${title}</h1>
            ${dateStr}
            ${html}
            <footer class="post-meta">
              <small>🏷️ ${tags.map(t => `<a href="#tag/${t}" class="tag">${t}</a>`).join(' ')}</small>
            </footer>
            <a href="#" class="back-to-list">&larr; Kembali ke daftar</a>
          </article>
        `;

        document.querySelectorAll('.back-to-list').forEach(btn => {
          btn.onclick = e => {
            e.preventDefault();
            history.pushState(null, '', '#');
            renderAllPosts();
          };
        });

        window.scrollTo(0, 0);
      })
      .catch(err => {
        if (contentEl) contentEl.innerHTML = `<p style="color:#e53e3e">Gagal: ${err.message}</p>`;
      });
  }

  // === SEARCH ===
  searchEl?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const source = currentTag 
      ? allPosts.filter(p => p.tags.includes(currentTag))
      : allPosts;
      
    const filtered = q 
      ? source.filter(p => 
          p.title.toLowerCase().includes(q) || 
          p.bodyPreview.toLowerCase().includes(q) ||
          p.tags.some(t => t.includes(q))
        )
      : source;
        
    renderPostList(filtered);
  });

  // === THEME ===
  function setTheme(theme) {
    if (!['light', 'dark', 'auto'].includes(theme)) return;
    localStorage.setItem('theme', theme);
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', 
      theme === 'auto' ? (dark ? 'dark' : 'light') : theme
    );
    updateThemeBtn();
  }

  function updateThemeBtn() {
    const t = document.documentElement.dataset.theme;
    if (themeToggleEl) {
      themeToggleEl.textContent = t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '🌓';
    }
  }

  themeToggleEl?.addEventListener('click', () => {
    const curr = localStorage.getItem('theme') || 'auto';
    setTheme(curr === 'auto' ? 'light' : curr === 'light' ? 'dark' : 'auto');
  });

  // === HASH ROUTING ===
  function loadFromHash() {
    const hash = location.hash;
    if (hash.startsWith('#tag/')) {
      const tag = hash.split('/').pop();
      renderTagPage(tag);
    } else if (hash.startsWith('#post/')) {
      const folderName = hash.split('/').pop();
      const post = allPosts.find(p => p.folderName === folderName);
      if (post) loadPost(post);
    } else {
      renderAllPosts();
    }
  }
  window.addEventListener('hashchange', loadFromHash);

  // === EVENTS ===
  clearTagBtn?.addEventListener('click', () => {
    history.pushState(null, '', '#');
    renderAllPosts();
  });

  // === INIT ===
  setTheme(localStorage.getItem('theme') || 'auto');
  updateThemeBtn();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (localStorage.getItem('theme') === 'auto') setTheme('auto');
  });

  fetchPosts();
});