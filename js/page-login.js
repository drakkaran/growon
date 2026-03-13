/* GrowOn — login page */
document.addEventListener('DOMContentLoaded', function () {

  // Redirect if already signed in
  getSession().then(s => { if (s) window.location.href = 'dashboard.html'; });

  // ── Tab switcher — called from onclick in HTML
  window.switchTab = function (tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-'   + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
  };

  // ── Sign in
  window.handleSignIn = async function () {
    const email    = document.getElementById('si-email').value.trim();
    const password = document.getElementById('si-password').value;
    if (!email || !password) { showToast('Please fill in all fields'); return; }

    const btn = document.getElementById('si-btn');
    setLoading(btn, true);
    try {
      const { error } = await signIn(email, password);
      if (error) throw error;
      window.location.href = 'dashboard.html';
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Sign in failed'));
      setLoading(btn, false);
    }
  };

  // ── Sign up
  window.handleSignUp = async function () {
    const first    = document.getElementById('su-first').value.trim();
    const last     = document.getElementById('su-last').value.trim();
    const email    = document.getElementById('su-email').value.trim();
    const suburb   = document.getElementById('su-suburb').value.trim();
    const password = document.getElementById('su-password').value;

    if (!first || !email || !password) { showToast('Please fill in required fields'); return; }
    if (password.length < 8) { showToast('Password must be at least 8 characters'); return; }

    const btn = document.getElementById('su-btn');
    setLoading(btn, true);
    try {
      const { error } = await signUp(email, password, {
        display_name: `${first} ${last}`.trim(),
        suburb,
      });
      if (error) throw error;
      showToast('🎉 Account created! Check your email to confirm.');
      setTimeout(() => switchTab('signin'), 2500);
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Sign up failed'));
    } finally {
      setLoading(btn, false);
    }
  };

  // Allow Enter key to submit whichever panel is active
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('panel-signin').classList.contains('active')) {
      window.handleSignIn();
    } else {
      window.handleSignUp();
    }
  });
});
