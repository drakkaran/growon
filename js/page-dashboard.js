/* GrowOn — dashboard page */
document.addEventListener('DOMContentLoaded', function () {

  let currentUser = null;

  async function init() {
    const session = await requireAuth('login.html');
    if (!session) return;
    currentUser = session.user;
    initNav();
    loadProfile();
    loadActivity();
    loadWishlist();
  }

  async function loadProfile() {
    try {
      const profile  = await fetchProfile(currentUser.id);
      const initials = (profile.display_name || currentUser.email || 'U')
        .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      document.getElementById('dash-avatar').textContent = initials;
      document.getElementById('dash-name').textContent   = `Welcome back, ${profile.display_name || 'there'}`;
      document.getElementById('dash-sub').textContent    =
        `Member since ${new Date(currentUser.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}` +
        (profile.suburb ? ` · ${profile.suburb}` : '');

      document.getElementById('stat-balance').textContent     = profile.points_balance   || 0;
      document.getElementById('stat-contributed').textContent = profile.items_contributed || 0;
      document.getElementById('stat-claimed').textContent     = profile.items_claimed     || 0;

      const ratio = profile.items_claimed
        ? (profile.items_contributed / profile.items_claimed).toFixed(1)
        : (profile.items_contributed > 0 ? '∞' : '—');
      document.getElementById('stat-ratio').textContent = ratio;
    } catch (err) {
      console.error(err);
    }
  }

  async function loadActivity() {
    const list = document.getElementById('activity-list');
    try {
      const txns = await fetchActivity(currentUser.id);
      if (!txns.length) {
        list.innerHTML = '<div class="empty-activity">No activity yet. Contribute your first item to get started!</div>';
        return;
      }
      list.innerHTML = txns.map(t => {
        const isContrib = t.type === 'contribute';
        const itemTitle = t.items?.title || 'Item';
        const emoji     = t.items?.emoji || (isContrib ? '📦' : '🛍');
        return `
          <div class="activity-item">
            <div class="activity-icon ${isContrib ? 'contributed' : 'claimed'}">${emoji}</div>
            <div class="activity-text">
              <p>${escHtml(itemTitle)} ${isContrib ? 'contributed' : 'claimed'}</p>
              <span>${relativeTime(t.created_at)}</span>
            </div>
            <div class="activity-pts ${isContrib ? 'plus' : 'minus'}">
              ${isContrib ? '+' : '−'}${Math.abs(t.points)} pts
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = '<div class="empty-activity">Could not load activity.</div>';
    }
  }

  async function loadWishlist() {
    try {
      const items = await fetchWishlist(currentUser.id);
      const row   = document.getElementById('wishlist-row');
      const tags  = items.map(w =>
        `<span class="wishlist-tag">
          ${escHtml(w.gender)} ${escHtml(w.size_group)} ${w.category ? '· ' + escHtml(w.category) : ''}
          <span class="wishlist-remove" onclick="removeWishlist(${w.id})">×</span>
        </span>`
      ).join('');
      row.innerHTML = tags + `<button class="add-wishlist-btn" onclick="promptWishlist()">+ Add size</button>`;
    } catch (_) {}
  }

  // ── Functions called from onclick in HTML — must be on window
  window.removeWishlist = async function (id) {
    await db.from('wishlist').delete().eq('id', id);
    loadWishlist();
  };

  window.promptWishlist = function () { openModal('wishlist-modal'); };

  window.saveWishlist = async function () {
    try {
      await addWishlistItem({
        gender:     document.getElementById('wl-gender').value,
        size_group: document.getElementById('wl-size').value,
        category:   document.getElementById('wl-cat').value || null,
      });
      closeModal('wishlist-modal');
      loadWishlist();
      showToast('Wishlist updated!');
    } catch (err) {
      showToast('⚠ ' + err.message);
    }
  };

  init();
});
