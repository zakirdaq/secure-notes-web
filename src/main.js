import './style.css';
import { api, auth, API_BASE_URL, ApiRequestError } from './api.js';

const $ = (id) => document.getElementById(id);

const state = {
  page: { notes: 1, users: 1, posts: 1, interests: 1 },
  postsUserId: null
};

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const csv = (value) =>
  value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

function setStatus(message, isError = true) {
  const el = $('status');
  el.textContent = message ?? '';
  el.style.color = isError ? '#b91c1c' : '#15803d';
}

/** Runs an action and funnels any API error into the status line. */
async function guard(fn) {
  try {
    setStatus('');
    await fn();
  } catch (error) {
    setStatus(error instanceof ApiRequestError ? error.message : String(error));
  }
}

function userId() {
  const user = auth.user;
  return user?._id ?? user?.id;
}

function render() {
  const user = auth.user;
  const authed = Boolean(auth.token && user);
  const admin = user?.role === 'admin';

  $('authSection').classList.toggle('hidden', authed);
  $('sessionSection').classList.toggle('hidden', !authed);
  $('notesSection').classList.toggle('hidden', !authed);
  $('postsSection').classList.toggle('hidden', !authed);
  $('adminSection').classList.toggle('hidden', !admin);
  $('interestsSection').classList.toggle('hidden', !admin);
  $('allNotesWrap').classList.toggle('hidden', !admin);

  if (!authed) return;

  $('whoami').textContent = `${user.name} <${user.email}>`;
  $('roleBadge').textContent = user.role;

  loadNotes();
  loadPosts();
  if (admin) loadUsers();
}

function setMeta(el, meta) {
  if (!meta) return ($(el).textContent = '');
  const total = meta.total === undefined ? '' : ` of ${meta.total}`;
  $(el).textContent = `page ${meta.page}${meta.totalPages ? `/${meta.totalPages}` : ''}${total}`;
}

/* -------------------------------- notes -------------------------------- */

function loadNotes() {
  return guard(async () => {
    const showAll = auth.user?.role === 'admin' && $('allNotes').checked;
    const scope = showAll ? '' : `&owner=${userId()}`;
    const { data, meta } = await api(`/notes?page=${state.page.notes}&limit=10${scope}`);

    $('noteList').innerHTML = data.length
      ? data
          .map(
            (n) => `<li>
              <div>
                <strong>${escapeHtml(n.title)}</strong>
                <div class="meta">${escapeHtml(n.body)}</div>
                <div class="meta">owner ${n.owner} · ${new Date(n.createdAt).toLocaleString()}</div>
              </div>
              <div class="row">
                <button class="secondary" data-edit-note="${n._id}">Edit</button>
                <button class="danger" data-del-note="${n._id}">Delete</button>
              </div>
            </li>`
          )
          .join('')
      : '<li class="meta">No notes yet.</li>';

    setMeta('notesMeta', meta);
  });
}

/* -------------------------------- posts -------------------------------- */

function loadPosts() {
  return guard(async () => {
    const target = state.postsUserId || userId();
    // Public endpoint — no token needed, which also proves the route is open.
    const { data, meta } = await api(
      `/posts/user/${target}?page=${state.page.posts}&limit=10`,
      { auth: false }
    );

    $('postList').innerHTML = data.posts.length
      ? data.posts
          .map(
            (p) => `<li><div>
              <strong>${escapeHtml(p.title)}</strong>
              <div class="meta">${escapeHtml(p.body)}</div>
              <div class="meta">${new Date(p.createdAt).toLocaleString()}</div>
            </div></li>`
          )
          .join('')
      : '<li class="meta">No posts for this user.</li>';

    $('postsMeta').textContent = `${data.author.name} · page ${meta.page}${
      meta.hasNextPage ? ' (more)' : ''
    }`;
  });
}

/* -------------------------------- users -------------------------------- */

function loadUsers() {
  return guard(async () => {
    const { data, meta } = await api(`/users?page=${state.page.users}&limit=10`);

    $('userList').innerHTML = data
      .map(
        (u) => `<li>
          <div>
            <strong>${escapeHtml(u.name)}</strong> <span class="pill">${u.role}</span>
            <div class="meta">${escapeHtml(u.email)} · ${u._id}</div>
            <div class="meta">interests: ${escapeHtml(u.interests?.join(', ')) || '—'}</div>
          </div>
          <div class="row">
            <button class="secondary" data-promote="${u._id}" data-role="${
              u.role === 'admin' ? 'user' : 'admin'
            }">Make ${u.role === 'admin' ? 'user' : 'admin'}</button>
            <button class="danger" data-del-user="${u._id}">Delete</button>
          </div>
        </li>`
      )
      .join('');

    setMeta('usersMeta', meta);
  });
}

function loadInterests() {
  return guard(async () => {
    const filter = $('interestFilter').value.trim();
    const q = filter ? `&interest=${encodeURIComponent(filter)}` : '';
    const { data, meta } = await api(
      `/users/grouped-by-interests?page=${state.page.interests}&limit=10${q}`
    );

    $('interestsOut').textContent = JSON.stringify(data, null, 2);
    setMeta('interestsMeta', meta);
  });
}

/* ------------------------------- handlers ------------------------------- */

$('registerBtn').onclick = () =>
  guard(async () => {
    const { data } = await api('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        name: $('regName').value.trim(),
        email: $('regEmail').value.trim(),
        password: $('regPassword').value,
        interests: csv($('regInterests').value)
      }
    });
    auth.set(data.accessToken, data.user);
    render();
    setStatus('Registered.', false);
  });

$('loginBtn').onclick = () =>
  guard(async () => {
    const { data } = await api('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: $('loginEmail').value.trim(), password: $('loginPassword').value }
    });
    auth.set(data.accessToken, data.user);
    render();
    setStatus('Logged in.', false);
  });

$('logoutBtn').onclick = () => {
  auth.set(null, null);
  setStatus('');
  render();
};

$('createNoteBtn').onclick = () =>
  guard(async () => {
    await api('/notes', {
      method: 'POST',
      body: { title: $('noteTitle').value.trim(), body: $('noteBody').value }
    });
    $('noteTitle').value = '';
    $('noteBody').value = '';
    state.page.notes = 1;
    await loadNotes();
  });

$('allNotes').onchange = () => {
  state.page.notes = 1;
  loadNotes();
};

$('createPostBtn').onclick = () =>
  guard(async () => {
    await api('/posts', { method: 'POST', body: { title: $('postTitle').value.trim() } });
    $('postTitle').value = '';
    state.page.posts = 1;
    await loadPosts();
  });

$('loadPostsBtn').onclick = () => {
  state.postsUserId = $('postUserId').value.trim() || null;
  state.page.posts = 1;
  loadPosts();
};

$('createUserBtn').onclick = () =>
  guard(async () => {
    await api('/users', {
      method: 'POST',
      body: {
        name: $('newUserName').value.trim(),
        email: $('newUserEmail').value.trim(),
        password: $('newUserPassword').value,
        role: $('newUserRole').value,
        interests: csv($('newUserInterests').value)
      }
    });
    await loadUsers();
  });

$('loadInterestsBtn').onclick = () => {
  state.page.interests = 1;
  loadInterests();
};

document.body.addEventListener('click', (event) => {
  const t = event.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.dataset.delNote) {
    return guard(async () => {
      await api(`/notes/${t.dataset.delNote}`, { method: 'DELETE' });
      await loadNotes();
    });
  }

  if (t.dataset.editNote) {
    const title = prompt('New title?');
    if (!title) return;
    return guard(async () => {
      await api(`/notes/${t.dataset.editNote}`, { method: 'PATCH', body: { title } });
      await loadNotes();
    });
  }

  if (t.dataset.delUser) {
    if (!confirm('Delete this user?')) return;
    return guard(async () => {
      await api(`/users/${t.dataset.delUser}`, { method: 'DELETE' });
      await loadUsers();
    });
  }

  if (t.dataset.promote) {
    return guard(async () => {
      await api(`/users/${t.dataset.promote}`, {
        method: 'PATCH',
        body: { role: t.dataset.role }
      });
      await loadUsers();
    });
  }

  if (t.dataset.page) {
    const key = t.dataset.page;
    const next = state.page[key] + Number(t.dataset.dir);
    if (next < 1) return;
    state.page[key] = next;
    return { notes: loadNotes, users: loadUsers, posts: loadPosts, interests: loadInterests }[
      key
    ]?.();
  }
});

$('apiTarget').textContent = `API: ${API_BASE_URL}`;
render();
