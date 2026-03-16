/* Outgrown — index page */
document.addEventListener('DOMContentLoaded', function () {

  initNav();

  async function loadStats() {
    try {
      const [{ count: available }, { count: families }, { count: exchanged }] = await Promise.all([
        db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'available'),
        db.from('profiles').select('*', { count: 'exact', head: true }),
        db.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'claim'),
      ]);
      document.getElementById('stat-items').textContent     = available ?? '—';
      document.getElementById('stat-families').textContent  = families  ?? '—';
      document.getElementById('stat-exchanged').textContent = exchanged ?? '—';
    } catch (e) {
      console.warn('Stats unavailable:', e.message);
    }
  }

  loadStats();
});
