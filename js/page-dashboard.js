/* Outgrown — dashboard page */
document.addEventListener('DOMContentLoaded', function () {

  let currentUser    = null;
  let currentProfile = null;

  async function init() {
    let session;
    try {
      session = await requireAuth('login.html');
    } catch (err) {
      console.error('Auth check failed:', err);
      document.getElementById('dash-name').textContent = 'Could not load account';
      document.getElementById('dash-sub').textContent  = 'Please refresh the page or sign in again.';
      return;
    }
    if (!session) return;
    currentUser = session.user;

    // Run initNav concurrently but don't block data loading on it
    initNav();

    // Load profile first — its data is needed to show the page header.
    // Fall back to auth user data if the profiles row is missing or RLS
    // is blocking the read (common during initial setup).
    await loadProfile();

    // Load the rest in parallel once we have the user ID confirmed
    await Promise.allSettled([loadActivity(), loadSavedItems(), loadWishlist()]);
  }

  async function loadProfile() {
    // Always populate from the auth user first so the page is never blank
    const nameFromEmail = (currentUser.email || '').split('@')[0];
    const fallbackName  = currentUser.user_metadata?.display_name || nameFromEmail || 'there';
    const fallbackInit  = fallbackName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

    document.getElementById('dash-avatar').textContent = fallbackInit;
    document.getElementById('dash-name').textContent   = `Welcome back, ${fallbackName}`;
    document.getElementById('dash-sub').textContent    =
      `Member since ${new Date(currentUser.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}`;

    try {
      const profile  = await fetchProfile(currentUser.id);
      const initials = (profile.display_name || fallbackName)
        .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      document.getElementById('dash-avatar').textContent = initials;
      document.getElementById('dash-name').textContent   = `Welcome back, ${profile.display_name || fallbackName}`;
      document.getElementById('dash-sub').textContent    =
        `Member since ${new Date(currentUser.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}` +
        (profile.suburb ? ` · ${profile.suburb}` : '');

      currentProfile = profile;

      document.getElementById('stat-balance').textContent     = profile.points_balance   ?? 0;
      document.getElementById('stat-contributed').textContent = profile.items_contributed ?? 0;
      document.getElementById('stat-claimed').textContent     = profile.items_claimed     ?? 0;

      const ratio = profile.items_claimed
        ? (profile.items_contributed / profile.items_claimed).toFixed(1)
        : (profile.items_contributed > 0 ? '∞' : '—');
      document.getElementById('stat-ratio').textContent = ratio;

      document.getElementById('edit-profile-btn').style.display = '';
    } catch (err) {
      // Profile row missing or RLS blocking read — show zeros rather than staying on "Loading…"
      console.warn('Could not load profile row:', err.message);
      document.getElementById('stat-balance').textContent     = 0;
      document.getElementById('stat-contributed').textContent = 0;
      document.getElementById('stat-claimed').textContent     = 0;
      document.getElementById('stat-ratio').textContent       = '—';
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
      console.warn('Could not load activity:', err.message);
      list.innerHTML = '<div class="empty-activity">No activity yet. Contribute your first item to get started!</div>';
    }
  }

  async function loadSavedItems() {
    const section = document.getElementById('saved-items-section');
    try {
      const saved = await fetchSavedItems(currentUser.id);
      if (!saved.length) {
        section.innerHTML = '<p class="empty-saved">No saved items yet. Browse and tap ♡ to save items you\'re interested in.</p>';
        return;
      }
      const bg = {
        'Outerwear': '#e8f5e9', 'Tops': '#e3f2fd', 'Bottoms': '#fff3e0',
        'Footwear': '#f3e5f5', 'Swimwear': '#e0f7fa', 'Sleepwear': '#fce4ec',
        'School uniform': '#e8f5e9',
      };
      section.innerHTML = `<div class="saved-grid">${saved.map(({ item_id, items: item }) => {
        if (!item) return '';
        const bgColor = bg[item.category] || '#f5f5f5';
        const imgHtml = item.photo_url
          ? `<img src="${escHtml(item.photo_url)}" alt="${escHtml(item.title)}" loading="lazy">`
          : `<span class="saved-emoji">${item.emoji || '👕'}</span>`;
        return `
          <div class="saved-card" onclick="window.location='item.html?id=${item.id}'">
            <div class="saved-card-img" style="background:${bgColor}">${imgHtml}</div>
            <div class="saved-card-info">
              <p>${escHtml(item.title)}</p>
              <span>Size ${escHtml(item.size_label || item.size_group)}</span>
            </div>
            <button class="saved-card-remove" title="Remove from wishlist"
              onclick="event.stopPropagation(); removeSavedItem(${item_id})">♥</button>
          </div>`;
      }).join('')}</div>`;
    } catch (err) {
      console.warn('Could not load saved items:', err.message);
      section.innerHTML = '<p class="empty-saved">Could not load saved items.</p>';
    }
  }

  window.removeSavedItem = async function (itemId) {
    try {
      await unsaveItem(itemId);
      loadSavedItems();
    } catch (err) {
      showToast('⚠ ' + err.message);
    }
  };

  async function loadWishlist() {
    const row = document.getElementById('wishlist-row');
    try {
      const items = await fetchWishlist(currentUser.id);
      const tags  = items.map(w =>
        `<span class="wishlist-tag">
          ${escHtml(w.gender)} ${escHtml(w.size_group)} ${w.category ? '· ' + escHtml(w.category) : ''}
          <span class="wishlist-remove" onclick="removeWishlist(${w.id})">×</span>
        </span>`
      ).join('');
      row.innerHTML = tags + `<button class="add-wishlist-btn" onclick="promptWishlist()">+ Add size</button>`;
    } catch (err) {
      console.warn('Could not load wishlist:', err.message);
      row.innerHTML = `<button class="add-wishlist-btn" onclick="promptWishlist()">+ Add size</button>`;
    }
  }

  // ── Edit profile
  window.openEditProfile = function () {
    document.getElementById('edit-name').value   = currentProfile?.display_name || '';
    document.getElementById('edit-suburb').value = currentProfile?.suburb || '';
    openModal('edit-profile-modal');
  };

  window.saveProfile = async function () {
    const btn    = document.getElementById('save-profile-btn');
    const name   = document.getElementById('edit-name').value.trim();
    const suburb = document.getElementById('edit-suburb').value.trim();
    if (!name) { showToast('Please enter a display name'); return; }

    setLoading(btn, true);
    try {
      await updateProfile(currentUser.id, { display_name: name, suburb: suburb || null });
      currentProfile = { ...currentProfile, display_name: name, suburb };
      closeModal('edit-profile-modal');
      // Refresh header text
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      document.getElementById('dash-avatar').textContent = initials;
      document.getElementById('dash-name').textContent   = `Welcome back, ${name}`;
      const since = new Date(currentUser.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      document.getElementById('dash-sub').textContent = `Member since ${since}` + (suburb ? ` · ${suburb}` : '');
      showToast('Profile updated!');
    } catch (err) {
      showToast('⚠ ' + err.message);
    } finally {
      setLoading(btn, false);
    }
  };

  // ── Change password
  window.openChangePassword = function () {
    document.getElementById('new-pw').value     = '';
    document.getElementById('confirm-pw').value = '';
    openModal('change-pw-modal');
  };

  window.savePassword = async function () {
    const btn       = document.getElementById('save-pw-btn');
    const newPw     = document.getElementById('new-pw').value;
    const confirmPw = document.getElementById('confirm-pw').value;
    if (newPw.length < 8)         { showToast('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw)      { showToast('Passwords do not match'); return; }

    setLoading(btn, true);
    try {
      await updatePassword(newPw);
      closeModal('change-pw-modal');
      showToast('Password updated!');
    } catch (err) {
      showToast('⚠ ' + err.message);
    } finally {
      setLoading(btn, false);
    }
  };

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

  init().catch(err => {
    console.error('Dashboard init failed:', err);
    document.getElementById('dash-name').textContent = 'Could not load account';
    document.getElementById('dash-sub').textContent  = 'Please refresh the page or sign in again.';
  });
});
