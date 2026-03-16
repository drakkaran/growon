/* Outgrown — item detail page */
document.addEventListener('DOMContentLoaded', async function () {

  initNav();

  const params = new URLSearchParams(window.location.search);
  const itemId = parseInt(params.get('id'), 10);

  if (!itemId) {
    showError('No item specified.');
    return;
  }

  let currentItem  = null;
  let userBalance  = 0;

  const CATEGORY_BG = {
    'Outerwear':      '#e8f5e9',
    'Tops':           '#e3f2fd',
    'Bottoms':        '#fff3e0',
    'Footwear':       '#f3e5f5',
    'Swimwear':       '#e0f7fa',
    'Sleepwear':      '#fce4ec',
    'School uniform': '#e8f5e9',
  };

  async function init() {
    const [itemResult, sessionResult] = await Promise.allSettled([
      fetchItemById(itemId),
      getSession(),
    ]);

    if (itemResult.status === 'rejected') {
      showError('Item not found.');
      return;
    }

    currentItem = itemResult.value;
    const session = sessionResult.status === 'fulfilled' ? sessionResult.value : null;

    if (session) {
      try {
        const profile = await fetchProfile(session.user.id);
        userBalance = profile.points_balance || 0;
      } catch (_) {}
    }

    render(currentItem, !!session);
  }

  function render(item, isLoggedIn) {
    document.title = `${item.title} — Outgrown`;

    // Photo or emoji
    const bg = CATEGORY_BG[item.category] || '#f5f5f0';
    document.getElementById('photo-box').style.background = bg;

    if (item.photo_url) {
      const img = document.getElementById('item-photo');
      img.src = item.photo_url;
      img.alt = item.title;
      img.classList.remove('hidden');
    } else {
      const emojiEl = document.getElementById('item-emoji');
      emojiEl.textContent = item.emoji || '👕';
      emojiEl.classList.remove('hidden');
    }

    // Header
    document.getElementById('item-condition-badge').innerHTML = conditionBadge(item.condition);
    document.getElementById('item-category-tag').textContent  = item.category || '';
    document.getElementById('item-title').textContent         = item.title;

    // Detail grid
    document.getElementById('d-gender').textContent = item.gender || '—';
    document.getElementById('d-size').textContent   = item.size_label || item.size_group || '—';
    document.getElementById('d-listed').textContent = relativeTime(item.created_at);

    setOptionalRow('d-material-row', 'd-material', item.material);
    setOptionalRow('d-brand-row',    'd-brand',    item.brand);
    setOptionalRow('d-season-row',   'd-season',   item.season);

    // Claim area
    if (item.status !== 'available') {
      const msgs = {
        claimed:  'This item has already been claimed.',
        pending:  'This item isn\'t available yet.',
        rejected: 'This item is no longer available.',
      };
      document.getElementById('unavailable-msg').textContent = msgs[item.status] || 'This item is no longer available.';
      show('claim-unavailable');
    } else if (!isLoggedIn) {
      document.getElementById('item-cost-anon').textContent = `${item.point_cost} pts`;
      show('claim-signin');
    } else {
      document.getElementById('item-cost').textContent    = `${item.point_cost} pts`;
      document.getElementById('balance-note').textContent = `Balance: ${userBalance} pts`;
      if (userBalance < item.point_cost) {
        document.getElementById('claim-btn').disabled = true;
        document.getElementById('claim-btn').style.cssText = 'opacity:0.45;cursor:not-allowed';
        document.getElementById('low-balance-note').classList.remove('hidden');
      }
      show('claim-active');
    }

    // Reveal page
    document.getElementById('item-loading').style.display = 'none';
    document.getElementById('item-content').classList.remove('hidden');
  }

  function setOptionalRow(rowId, valueId, value) {
    if (value) {
      document.getElementById(valueId).textContent = value;
    } else {
      document.getElementById(rowId).style.display = 'none';
    }
  }

  function show(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function showError(msg) {
    document.getElementById('item-loading').style.display = 'none';
    document.getElementById('item-error-msg').textContent = msg;
    document.getElementById('item-error').classList.remove('hidden');
  }

  // Called from the Claim button
  window.handleClaim = function () {
    if (!currentItem) return;
    triggerClaim(currentItem.id, currentItem.point_cost, currentItem.title, currentItem.emoji || '👕');
    document.getElementById('modal-balance-before').textContent = `${userBalance} pts`;
    document.getElementById('modal-balance-after').textContent  = `${userBalance - currentItem.point_cost} pts`;
  };

  // Called by confirmClaim() in ui.js after a successful claim
  window.loadItems = function () {
    const btn = document.getElementById('claim-btn');
    btn.textContent = '✓ Claimed!';
    btn.disabled    = true;
    btn.style.cssText = 'opacity:0.6;cursor:default;background:var(--sage-mid)';
    document.getElementById('balance-note').textContent = '';
  };

  init().catch(err => {
    console.error('Item page failed to load:', err);
    showError('Could not load this item. Please try again.');
  });
});
