/* GrowOn — volunteer admin page */
document.addEventListener('DOMContentLoaded', async function () {

  /* ── Auth guard: must be a signed-in volunteer ── */
  const session = await requireAuth('login.html');
  if (!session) return;

  const profile = await fetchProfile(session.user.id);
  if (!profile.is_volunteer) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;font-family:'DM Sans',sans-serif;">
        <div>
          <div style="font-size:48px;margin-bottom:16px">🔒</div>
          <h2 style="font-family:'DM Serif Display',serif;margin-bottom:8px">Access restricted</h2>
          <p style="color:#6b6b63;margin-bottom:24px">This page is for GrowOn volunteers only.</p>
          <a href="index.html" style="background:#4a7c59;color:white;padding:11px 24px;border-radius:999px;text-decoration:none;font-size:14px">Back to home</a>
        </div>
      </div>`;
    return;
  }

  initNav();

  /* ── State ── */
  let allItems   = {};   // keyed by status: pending, available, claimed, rejected
  let allMembers = [];
  let pendingApprove = null;  // { item, points, notes }
  let pendingReject  = null;  // { item, reason }
  let adjustTarget   = null;  // { userId, displayName }
  let selectedRejectReason = '';
  let currentTab = 'pending';

  /* ── Load everything ── */
  async function loadAll() {
    await Promise.all([loadItems(), loadMembers(), loadStats()]);
  }

  async function loadItems() {
    const statuses = ['pending', 'available', 'claimed', 'rejected'];
    const results  = await Promise.all(
      statuses.map(s =>
        db.from('items')
          .select('*, profiles(display_name, suburb, points_balance)')
          .eq('status', s)
          .order('created_at', { ascending: false })
      )
    );
    statuses.forEach((s, i) => {
      allItems[s] = results[i].data || [];
    });
    renderCurrentTab();
    updateCounts();
  }

  async function loadMembers() {
    const { data } = await db
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    allMembers = data || [];
    updateCounts();
  }

  async function loadStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [pending, approvedToday, available, claimedWeek, members] = await Promise.all([
      db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('transactions').select('*', { count: 'exact', head: true })
        .eq('type', 'contribute').gte('created_at', todayStart.toISOString()),
      db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      db.from('transactions').select('*', { count: 'exact', head: true })
        .eq('type', 'claim').gte('created_at', weekStart.toISOString()),
      db.from('profiles').select('*', { count: 'exact', head: true }),
    ]);

    document.getElementById('stat-pending').textContent        = pending.count       ?? '—';
    document.getElementById('stat-approved-today').textContent = approvedToday.count ?? '—';
    document.getElementById('stat-available').textContent      = available.count      ?? '—';
    document.getElementById('stat-claimed').textContent        = claimedWeek.count    ?? '—';
    document.getElementById('stat-members').textContent        = members.count        ?? '—';
  }

  /* ── Tab switching ── */
  window.switchTab = function (tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-'   + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
    renderCurrentTab();
  };

  function renderCurrentTab() {
    if (currentTab === 'members') {
      renderMembers(allMembers);
    } else {
      renderQueue(currentTab, allItems[currentTab] || []);
    }
  }

  /* ── Counts ── */
  function updateCounts() {
    const statuses = ['pending', 'available', 'claimed', 'rejected'];
    statuses.forEach(s => {
      const el    = document.getElementById('count-' + s);
      const count = (allItems[s] || []).length;
      el.textContent = count;
      el.classList.toggle('zero', count === 0);
    });
    const mc = document.getElementById('count-members');
    mc.textContent = allMembers.length;
    mc.classList.toggle('zero', allMembers.length === 0);
  }

  /* ── Render item queue ── */
  function renderQueue(status, items) {
    const container = document.getElementById('list-' + status);
    if (!items.length) {
      const msgs = {
        pending:   { icon: '✅', text: 'No items pending review — queue is clear!' },
        available: { icon: '🛍', text: 'No items currently in the catalogue.' },
        claimed:   { icon: '📦', text: 'No claimed items yet.' },
        rejected:  { icon: '✓', text: 'No rejected items.' },
      };
      const m = msgs[status] || { icon: '📋', text: 'Nothing here.' };
      container.innerHTML = `<div class="empty"><div class="big">${m.icon}</div><p>${m.text}</p></div>`;
      return;
    }
    container.innerHTML = items.map(item => buildQueueCard(item, status)).join('');
  }

  function buildQueueCard(item, status) {
    const contributor = item.profiles;
    const contribName = contributor?.display_name || 'Unknown';
    const contribSub  = contributor?.suburb || '';
    const condClass   = { excellent: 'pill-excellent', good: 'pill-good', fair: 'pill-fair' }[item.condition] || '';
    const age         = relativeTime(item.created_at);

    const photoHtml = item.photo_url
      ? `<img class="detail-photo" src="${escHtml(item.photo_url)}" alt="${escHtml(item.title)}" loading="lazy">`
      : `<div class="no-photo">📷 No photo submitted</div>`;

    const statusBadge = {
      pending:   '',
      available: '<span class="pill pill-sage" style="font-size:11px">Live</span>',
      claimed:   '<span class="pill pill-clay" style="font-size:11px">Claimed</span>',
      rejected:  '<span class="pill" style="font-size:11px;background:#fce4ec;color:#c62828">Rejected</span>',
    }[status] || '';

    // Points field — editable for pending, readonly otherwise
    const ptsField = status === 'pending'
      ? `<div class="pts-override">
           <label>Points to award</label>
           <input class="pts-input" type="number" id="pts-${item.id}" value="${item.point_cost}" min="1" max="100">
         </div>`
      : `<div class="pts-override">
           <label>Points awarded</label>
           <input class="pts-input" type="number" value="${item.point_cost}" readonly style="opacity:0.6;cursor:default">
         </div>`;

    const actionButtons = status === 'pending'
      ? `<div class="notes-field">
           <label>Volunteer note (optional)</label>
           <textarea class="notes-input" id="note-${item.id}" placeholder="e.g. Bonds size 6, as described"></textarea>
         </div>
         <button class="btn-approve" onclick="confirmApprove(${item.id})">✓ Approve</button>
         <button class="btn-reject"  onclick="confirmReject(${item.id})">✕ Reject</button>`
      : status === 'available'
        ? `<button class="btn-reject" onclick="revokeItem(${item.id})">Revoke from catalogue</button>`
        : '';

    const notesHtml = item.volunteer_notes
      ? `<div style="background:var(--sage-light);border-radius:var(--radius);padding:10px 14px;font-size:13px;color:var(--sage);margin-bottom:14px">
           <strong>Volunteer note:</strong> ${escHtml(item.volunteer_notes)}
         </div>`
      : '';

    return `
      <div class="queue-item ${status === 'rejected' ? 'rejected' : ''}" id="qi-${item.id}">
        <div class="qi-header" onclick="toggleCard(${item.id})">
          <div class="qi-emoji">${item.emoji || '👕'}</div>
          <div class="qi-info">
            <div class="qi-title">${escHtml(item.title)}</div>
            <div class="qi-meta">
              ${escHtml(item.gender)} · Size ${escHtml(item.size_label || item.size_group)} · ${escHtml(item.category)}
              · <strong>${contribName}</strong>${contribSub ? ', ' + escHtml(contribSub) : ''}
              · ${age}
            </div>
          </div>
          <div class="qi-right">
            <span class="pill ${condClass}" style="font-size:11px">${item.condition}</span>
            ${statusBadge}
            <span class="points-chip">${item.point_cost} pts</span>
            <span class="qi-expand">⌄</span>
          </div>
        </div>
        <div class="qi-detail">
          ${photoHtml}
          ${notesHtml}
          <div class="detail-grid">
            <div class="detail-field"><div class="df-label">Category</div><div class="df-value">${escHtml(item.category)}</div></div>
            <div class="detail-field"><div class="df-label">Gender</div><div class="df-value">${escHtml(item.gender)}</div></div>
            <div class="detail-field"><div class="df-label">Size</div><div class="df-value">${escHtml(item.size_label || item.size_group)}</div></div>
            <div class="detail-field"><div class="df-label">Material</div><div class="df-value">${escHtml(item.material || '—')}</div></div>
            <div class="detail-field"><div class="df-label">Brand</div><div class="df-value">${escHtml(item.brand || '—')}</div></div>
            <div class="detail-field"><div class="df-label">Season</div><div class="df-value">${escHtml(item.season || '—')}</div></div>
            <div class="detail-field"><div class="df-label">Condition</div><div class="df-value">${escHtml(item.condition)}</div></div>
            <div class="detail-field"><div class="df-label">Submitted</div><div class="df-value">${new Date(item.created_at).toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'})}</div></div>
          </div>
          <div class="action-row">
            ${ptsField}
            ${actionButtons}
          </div>
        </div>
      </div>`;
  }

  /* ── Toggle card expand ── */
  window.toggleCard = function (id) {
    document.getElementById('qi-' + id)?.classList.toggle('open');
  };

  /* ── Search / filter ── */
  window.filterQueue = function (status) {
    const q     = document.getElementById('search-' + status).value.toLowerCase();
    const items = (allItems[status] || []).filter(item =>
      !q ||
      item.title?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.size_label?.toLowerCase().includes(q) ||
      item.size_group?.toLowerCase().includes(q) ||
      item.gender?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q) ||
      item.profiles?.display_name?.toLowerCase().includes(q)
    );
    renderQueue(status, items);
  };

  /* ── Approve flow ── */
  window.confirmApprove = function (itemId) {
    const item  = (allItems['pending'] || []).find(i => i.id === itemId);
    if (!item) return;
    const pts   = parseInt(document.getElementById('pts-' + itemId)?.value) || item.point_cost;
    const notes = document.getElementById('note-' + itemId)?.value.trim() || null;
    pendingApprove = { item, points: pts, notes };

    document.getElementById('approve-details').innerHTML = `
      <div class="row"><span>Item</span><span>${escHtml(item.title)}</span></div>
      <div class="row"><span>Contributor</span><span>${escHtml(item.profiles?.display_name || '—')}</span></div>
      <div class="row"><span>Points to award</span><span style="color:var(--sage);font-weight:600">+${pts} pts</span></div>
      ${notes ? `<div class="row"><span>Note</span><span>${escHtml(notes)}</span></div>` : ''}
    `;
    openModal('approve-modal');
  };

  window.executeApprove = async function () {
    if (!pendingApprove) return;
    const btn = document.getElementById('approve-confirm-btn');
    setLoading(btn, true);
    try {
      const { error } = await db.rpc('approve_item', {
        p_item_id:    pendingApprove.item.id,
        p_point_cost: pendingApprove.points,
        p_notes:      pendingApprove.notes,
      });
      if (error) throw error;
      closeModal('approve-modal');
      showToast(`✓ ${pendingApprove.item.title} approved — ${pendingApprove.points} pts awarded`);
      pendingApprove = null;
      await loadItems();
      await loadStats();
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Approval failed'));
    } finally {
      setLoading(btn, false);
    }
  };

  /* ── Reject flow ── */
  window.confirmReject = function (itemId) {
    const item = (allItems['pending'] || []).find(i => i.id === itemId);
    if (!item) return;
    pendingReject = { item };
    selectedRejectReason = '';
    document.querySelectorAll('.reject-option').forEach(o => o.classList.remove('selected'));
    openModal('reject-modal');
  };

  window.selectRejectReason = function (el, reason) {
    document.querySelectorAll('.reject-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedRejectReason = reason;
  };

  window.executeReject = async function () {
    if (!pendingReject) return;
    if (!selectedRejectReason) { showToast('Please select a reason'); return; }
    const btn = document.getElementById('reject-confirm-btn');
    setLoading(btn, true);
    try {
      const { error } = await db
        .from('items')
        .update({ status: 'rejected', volunteer_notes: selectedRejectReason, updated_at: new Date().toISOString() })
        .eq('id', pendingReject.item.id);
      if (error) throw error;
      closeModal('reject-modal');
      showToast(`Item rejected — contributor notified`);
      pendingReject = null;
      await loadItems();
      await loadStats();
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Rejection failed'));
    } finally {
      setLoading(btn, false);
    }
  };

  /* ── Revoke live item back to pending ── */
  window.revokeItem = async function (itemId) {
    if (!confirm('Move this item back to pending review?')) return;
    try {
      const { error } = await db
        .from('items')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (error) throw error;
      showToast('Item moved back to pending queue');
      await loadItems();
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Failed'));
    }
  };

  /* ── Members tab ── */
  function renderMembers(members) {
    const container = document.getElementById('list-members');
    if (!members.length) {
      container.innerHTML = '<div class="empty"><div class="big">👥</div><p>No members yet.</p></div>';
      return;
    }
    container.innerHTML = members.map(m => {
      const initials = (m.display_name || m.id.slice(0, 2)).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const ratio    = m.items_claimed
        ? (m.items_contributed / m.items_claimed).toFixed(1)
        : (m.items_contributed > 0 ? '∞' : '—');
      return `
        <div class="member-row">
          <div class="member-avatar">${escHtml(initials)}</div>
          <div class="member-info">
            <strong>${escHtml(m.display_name || 'Unnamed')}</strong>
            <span>${escHtml(m.suburb || '—')} · Joined ${new Date(m.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</span>
          </div>
          <div class="member-stats">
            <div class="member-stat">
              <div class="ms-num" style="color:var(--sage)">${m.points_balance}</div>
              <div class="ms-lbl">pts</div>
            </div>
            <div class="member-stat">
              <div class="ms-num">${m.items_contributed}</div>
              <div class="ms-lbl">contributed</div>
            </div>
            <div class="member-stat">
              <div class="ms-num">${m.items_claimed}</div>
              <div class="ms-lbl">claimed</div>
            </div>
            <div class="member-stat">
              <div class="ms-num">${ratio}</div>
              <div class="ms-lbl">ratio</div>
            </div>
          </div>
          <button
            class="volunteer-toggle ${m.is_volunteer ? 'active' : ''}"
            onclick="toggleVolunteer('${m.id}', ${m.is_volunteer})">
            ${m.is_volunteer ? '★ Volunteer' : 'Make volunteer'}
          </button>
          <button
            class="volunteer-toggle"
            style="margin-left:4px"
            onclick="openAdjust('${m.id}', '${escHtml(m.display_name || 'Member')}')">
            Adjust pts
          </button>
        </div>`;
    }).join('');
  }

  window.filterMembers = function () {
    const q = document.getElementById('search-members').value.toLowerCase();
    const filtered = q
      ? allMembers.filter(m =>
          m.display_name?.toLowerCase().includes(q) ||
          m.suburb?.toLowerCase().includes(q)
        )
      : allMembers;
    renderMembers(filtered);
  };

  /* ── Toggle volunteer status ── */
  window.toggleVolunteer = async function (userId, currentlyVolunteer) {
    try {
      const { error } = await db
        .from('profiles')
        .update({ is_volunteer: !currentlyVolunteer })
        .eq('id', userId);
      if (error) throw error;
      showToast(currentlyVolunteer ? 'Volunteer status removed' : '★ Volunteer status granted');
      await loadMembers();
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Failed'));
    }
  };

  /* ── Point adjustment ── */
  window.openAdjust = function (userId, displayName) {
    adjustTarget = { userId, displayName };
    document.getElementById('adj-name').value   = displayName;
    document.getElementById('adj-points').value = '';
    document.getElementById('adj-note').value   = '';
    openModal('adjust-modal');
  };

  window.executeAdjustment = async function () {
    if (!adjustTarget) return;
    const pts  = parseInt(document.getElementById('adj-points').value);
    const note = document.getElementById('adj-note').value.trim();
    if (isNaN(pts) || pts === 0) { showToast('Enter a non-zero point value'); return; }
    if (!note)                   { showToast('Please enter a reason');        return; }

    const btn = document.querySelector('#adjust-modal .modal-confirm');
    setLoading(btn, true);
    try {
      // Insert transaction record
      const { error: txErr } = await db.from('transactions').insert({
        user_id: adjustTarget.userId,
        item_id: null,
        type:    'adjustment',
        points:  pts,
        note,
      });
      if (txErr) throw txErr;

      // Update balance
      const { data: prof } = await db.from('profiles').select('points_balance').eq('id', adjustTarget.userId).single();
      const newBalance = (prof?.points_balance || 0) + pts;
      const { error: profErr } = await db.from('profiles').update({ points_balance: newBalance }).eq('id', adjustTarget.userId);
      if (profErr) throw profErr;

      closeModal('adjust-modal');
      showToast(`${pts > 0 ? '+' : ''}${pts} pts applied to ${adjustTarget.displayName}`);
      adjustTarget = null;
      await loadMembers();
      await loadStats();
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Adjustment failed'));
    } finally {
      setLoading(btn, false);
    }
  };

  /* ── Make loadAll available to the refresh button ── */
  window.loadAll = loadAll;

  /* ── Boot ── */
  loadAll();
});
