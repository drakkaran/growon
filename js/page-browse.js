/* Outgrown — browse page */
document.addEventListener('DOMContentLoaded', function () {

  let currentFilters = { gender: 'all' };
  let userBalance = 0;

  async function loadUserBalance() {
    const user = await getUser();
    if (user) {
      try {
        const profile = await fetchProfile(user.id);
        userBalance = profile.points_balance || 0;
      } catch (_) {}
    }
  }

  async function loadItems() {
    const grid = document.getElementById('items-grid');
    try {
      const filters = {};
      if (currentFilters.gender && currentFilters.gender !== 'all') filters.gender = currentFilters.gender;
      const sizeVal = document.getElementById('filter-size').value;
      const catVal  = document.getElementById('filter-cat').value;
      const condVal = document.getElementById('filter-cond').value;
      if (sizeVal) filters.size_group = sizeVal;
      if (catVal)  filters.category   = catVal;
      if (condVal) filters.condition  = condVal;

      const items = await fetchItems(filters);

      if (!items.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="big">🧺</div><p>No items match your filters right now.<br>Check back soon or <a href="contribute.html" style="color:var(--sage)">contribute some!</a></p></div>`;
        return;
      }
      grid.innerHTML = items.map(buildItemCard).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p style="color:var(--clay)">Could not load items. Please check your connection.</p></div>`;
      console.error(err);
    }
  }

  // Override triggerClaim (defined in ui.js) to inject live balance info
  const _origTrigger = window.triggerClaim;
  window.triggerClaim = function (itemId, pointCost, title, emoji) {
    _origTrigger(itemId, pointCost, title, emoji);
    document.getElementById('modal-balance-before').textContent = `${userBalance} pts`;
    document.getElementById('modal-balance-after').textContent  = `${userBalance - pointCost} pts`;
  };

  // Called from onclick attributes in HTML — must be on window
  window.setGender = function (el, val) {
    document.querySelectorAll('[data-filter="gender"]').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    currentFilters.gender = val;
    updateResetBtn();
    loadItems();
  };

  function updateResetBtn() {
    const active = currentFilters.gender !== 'all'
      || document.getElementById('filter-size').value
      || document.getElementById('filter-cat').value
      || document.getElementById('filter-cond').value;
    document.getElementById('filter-reset').style.display = active ? '' : 'none';
  }

  window.applyFilters = function () { updateResetBtn(); loadItems(); };

  window.resetFilters = function () {
    currentFilters.gender = 'all';
    document.querySelectorAll('[data-filter="gender"]').forEach(b =>
      b.classList.toggle('active', b.dataset.value === 'all')
    );
    document.getElementById('filter-size').value = '';
    document.getElementById('filter-cat').value  = '';
    document.getElementById('filter-cond').value = '';
    updateResetBtn();
    loadItems();
  };

  // Make loadItems available globally so confirmClaim in ui.js can refresh the grid
  window.loadItems = loadItems;

  // Wait for session + saved IDs before rendering cards
  initNav().then(async () => {
    if (_userIsLoggedIn) {
      try {
        const user = await getUser();
        const saved = await fetchSavedItems(user.id);
        _savedItemIds = new Set(saved.map(s => s.item_id));
      } catch (_) {}
    }
    loadItems();
  });
  loadUserBalance();
});
