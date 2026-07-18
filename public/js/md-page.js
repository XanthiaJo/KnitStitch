(function () {
  'use strict';

  var src = document.body.getAttribute('data-md-src');
  if (!src) return;

  var loadingEl = document.getElementById('md-loading');
  var contentEl = document.getElementById('md-content');
  var tocEl = document.getElementById('md-toc');
  var tocSection = document.getElementById('md-toc-section');

  if (!contentEl) return;

  function parseRepoUrl(rawUrl) {
    try {
      var url = new URL(rawUrl);
      var parts = url.pathname.replace(/^\/+/, '').split('/');
      if (parts.length < 3) return null;
      var owner = parts[0];
      var repo = parts[1];
      var branch = parts[2];
      return {
        owner: owner,
        repo: repo,
        branch: branch,
        rawPrefix: 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/',
        blobPrefix: 'https://github.com/' + owner + '/' + repo + '/blob/' + branch + '/'
      };
    } catch (e) {
      return null;
    }
  }

  function repoPathFromRawUrl(resolvedUrl, repo) {
    try {
      var url = new URL(resolvedUrl);
      var path = url.pathname.replace(/^\/+/, '');
      var prefix = repo.owner + '/' + repo.repo + '/' + repo.branch + '/';
      if (path.indexOf(prefix) === 0) {
        return path.slice(prefix.length);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function rewriteRelativeLinks(repo) {
    if (!repo) return;
    var base = src;

    var anchors = contentEl.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href');
      if (!href || /^(https?:|\/\/|mailto:|tel:|#)/i.test(href)) continue;

      var resolved, relPath;
      try {
        resolved = new URL(href, base).href;
        relPath = repoPathFromRawUrl(resolved, repo);
      } catch (e) {
        continue;
      }
      if (!relPath) continue;

      var extMatch = relPath.match(/\.([^.\/]+)$/);
      var ext = extMatch ? extMatch[1].toLowerCase() : '';
      var imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'];
      if (imageExts.indexOf(ext) !== -1) {
        a.href = repo.rawPrefix + relPath;
      } else {
        a.href = repo.blobPrefix + relPath;
      }
    }

    var images = contentEl.querySelectorAll('img[src]');
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var s = img.getAttribute('src');
      if (!s || /^(https?:|\/\/|data:|#)/i.test(s)) continue;

      var resolved, relPath;
      try {
        resolved = new URL(s, base).href;
        relPath = repoPathFromRawUrl(resolved, repo);
      } catch (e) {
        continue;
      }
      if (!relPath) continue;
      img.src = repo.rawPrefix + relPath;
    }
  }

  function slug(text) {
    return text.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildToc() {
    if (!tocEl) return;

    var headings = contentEl.querySelectorAll('h1, h2, h3, h4');
    if (!headings.length) {
      if (tocSection) tocSection.style.display = 'none';
      return;
    }

    var seen = {};
    headings.forEach(function (h) {
      if (!h.id) {
        var base = slug(h.textContent || '');
        var id = base;
        var n = 1;
        while (seen[id] || document.getElementById(id)) {
          id = base + '-' + n;
          n++;
        }
        seen[id] = true;
        h.id = id;
      }
    });

    tocEl.innerHTML = '';
    headings.forEach(function (h) {
      var a = document.createElement('a');
      a.className = 'chip color-pair-sky';
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      tocEl.appendChild(a);
    });
  }

  function showError(message) {
    if (loadingEl) {
      loadingEl.className = 'md-error';
      loadingEl.textContent = 'Error: ' + message;
    }
  }

  function wrapContentInPanels(container) {
    var temp = document.createElement('div');
    while (container.firstChild) {
      temp.appendChild(container.firstChild);
    }
    container.innerHTML = '';

    var children = Array.prototype.slice.call(temp.childNodes);
    var currentPanel = null;

    children.forEach(function (node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'hr') {
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/i.test(node.tagName)) {
        currentPanel = document.createElement('div');
        currentPanel.className = 'panel panel--padded';
        container.appendChild(currentPanel);
      }

      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '') {
        return;
      }

      if (!currentPanel) {
        currentPanel = document.createElement('div');
        currentPanel.className = 'panel panel--padded';
        container.appendChild(currentPanel);
      }

      currentPanel.appendChild(node);
    });
  }

  function render(md) {
    if (typeof window.marked === 'undefined' || typeof window.marked.parse !== 'function') {
      showError('Markdown renderer not available.');
      return;
    }

    var html;
    try {
      html = window.marked.parse(md, { gfm: true });
    } catch (e) {
      showError('Failed to render markdown: ' + e.message);
      return;
    }

    contentEl.innerHTML = html;
    wrapContentInPanels(contentEl);
    if (loadingEl) loadingEl.style.display = 'none';

    rewriteRelativeLinks(parseRepoUrl(src));
    buildToc();
  }

  fetch(src)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(render)
    .catch(function (err) {
      showError('Failed to load content: ' + err.message);
    });
})();
