/**
 * Outgrown — Shared UI Utilities
 */

/* ── Auth state (set by initNav, used by buildItemCard) ── */
let _userIsLoggedIn = false;

/* ── Saved item IDs (populated by page-browse before rendering) ── */
let _savedItemIds = new Set();

/* ── Toast notifications ── */
function showToast(msg, duration = 3200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ── Modal helpers ── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// Close on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

/* ── Loading state on buttons ── */
function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.origText = btn.textContent;
    btn.textContent = 'Loading…';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.origText || btn.textContent;
    btn.disabled = false;
  }
}

/* ── Condition badge helper ── */
function conditionBadge(condition) {
  const map = {
    excellent: '<span class="pill pill-excellent">Excellent</span>',
    good:      '<span class="pill pill-good">Good</span>',
    fair:      '<span class="pill pill-fair">Fair</span>',
  };
  return map[condition] || '';
}

/* ── Relative time ── */
function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins  / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 30) return new Date(dateStr).toLocaleDateString('en-AU', { day:'numeric', month:'short' });
  if (days  >  0) return `${days}d ago`;
  if (hours >  0) return `${hours}h ago`;
  if (mins  >  0) return `${mins}m ago`;
  return 'just now';
}

/* ── Auth guard: redirect if not signed in ── */
async function requireAuth(redirectTo = 'login.html') {
  const session = await getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

/* ── Render nav user state ── */
async function initNav() {
  const session    = await getSession();
  const signInBtn  = document.getElementById('nav-signin');
  const accountBtn = document.getElementById('nav-account');
  const signOutBtn = document.getElementById('nav-signout');
  const adminBtn   = document.getElementById('nav-admin');

  if (session) {
    _userIsLoggedIn = true;
    signInBtn?.classList.add('hidden');
    accountBtn?.classList.remove('hidden');
    signOutBtn?.classList.remove('hidden');

    // Show volunteer admin link only for volunteers
    if (adminBtn) {
      try {
        const profile = await fetchProfile(session.user.id);
        if (profile.is_volunteer || profile.is_admin) {
          adminBtn.classList.remove('hidden');
        }
      } catch (_) {}
    }
  } else {
    signInBtn?.classList.remove('hidden');
    accountBtn?.classList.add('hidden');
    signOutBtn?.classList.add('hidden');
    adminBtn?.classList.add('hidden');
  }

  signOutBtn?.addEventListener('click', async () => {
    await signOut();
    window.location.href = 'index.html';
  });
}

/* ── Item card HTML factory ── */
function buildItemCard(item) {
  const bg = {
    'Outerwear':      '#e8f5e9', 'Tops':      '#e3f2fd',
    'Bottoms':        '#fff3e0', 'Footwear':  '#f3e5f5',
    'Swimwear':       '#e0f7fa', 'Sleepwear': '#fce4ec',
    'School uniform': '#e8f5e9',
  };
  const bgColor = bg[item.category] || '#f5f5f5';

  return `
    <div class="item-card" data-id="${item.id}" onclick="window.location='item.html?id=${item.id}'">
      <div class="item-img" style="background:${bgColor}">
        ${item.photo_url
          ? `<img src="${escHtml(item.photo_url)}" alt="${escHtml(item.title)}" loading="lazy">`
          : `<span class="item-emoji">${item.emoji || '👕'}</span>`}
        ${conditionBadge(item.condition)}
        ${_userIsLoggedIn
          ? `<button class="save-btn${_savedItemIds.has(item.id) ? ' saved' : ''}"
               title="${_savedItemIds.has(item.id) ? 'Remove from wishlist' : 'Save to wishlist'}"
               onclick="toggleSave(${item.id}, this, event)">${_savedItemIds.has(item.id) ? '♥' : '♡'}</button>`
          : ''}
      </div>
      <div class="item-info">
        <h4>${escHtml(item.title)}</h4>
        <div class="item-meta">${escHtml(item.gender)} · Size ${escHtml(item.size_label)} · ${escHtml(item.suburb || '')}</div>
        <div class="item-points">
          <span class="points-chip">${item.point_cost} pts</span>
          ${_userIsLoggedIn
            ? `<button class="btn btn-sm btn-sage claim-btn"
                onclick="event.stopPropagation(); triggerClaim(${item.id}, ${item.point_cost}, '${escHtml(item.title)}', '${item.emoji || '👕'}')">
                Claim
               </button>`
            : ''}
        </div>
      </div>
    </div>`;
}

/* ── Save / unsave item toggle (used on browse cards) ── */
window.toggleSave = async function (itemId, btn, event) {
  event.stopPropagation();
  const saving = !_savedItemIds.has(itemId);
  // Optimistic update
  btn.textContent = saving ? '♥' : '♡';
  btn.classList.toggle('saved', saving);
  btn.title = saving ? 'Remove from wishlist' : 'Save to wishlist';
  _savedItemIds[saving ? 'add' : 'delete'](itemId);
  try {
    if (saving) await saveItem(itemId);
    else        await unsaveItem(itemId);
  } catch (err) {
    // Revert
    btn.textContent = saving ? '♡' : '♥';
    btn.classList.toggle('saved', !saving);
    btn.title = saving ? 'Save to wishlist' : 'Remove from wishlist';
    _savedItemIds[saving ? 'delete' : 'add'](itemId);
    showToast('⚠ ' + err.message);
  }
};

/* ── Escape HTML to prevent XSS ── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Shared claim modal (used on browse + item pages) ── */
let _claimTarget = null;

function triggerClaim(itemId, pointCost, title, emoji) {
  _claimTarget = { itemId, pointCost, title, emoji };
  const el = document.getElementById('claim-modal');
  if (!el) return;
  el.querySelector('#modal-emoji').textContent  = emoji;
  el.querySelector('#modal-title').textContent  = title;
  el.querySelector('#modal-pts').textContent    = `−${pointCost} pts`;
  // balance updated per page after profile load
  openModal('claim-modal');
}

async function confirmClaim() {
  if (!_claimTarget) return;
  const btn = document.querySelector('#claim-modal .modal-confirm');
  setLoading(btn, true);
  try {
    await claimItem(_claimTarget.itemId, _claimTarget.pointCost);
    closeModal('claim-modal');
    showToast(`${_claimTarget.emoji} Claimed! Collect from hub this Saturday.`);
    // Refresh page content
    if (typeof loadItems === 'function') loadItems();
  } catch (err) {
    showToast('⚠ ' + (err.message || 'Could not complete claim'));
  } finally {
    setLoading(btn, false);
  }
}
