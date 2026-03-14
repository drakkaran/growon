/* GrowOn — reset password page */
document.addEventListener('DOMContentLoaded', async function () {

  function show(stateId) {
    ['state-loading', 'state-form', 'state-success', 'state-error'].forEach(id => {
      document.getElementById(id).classList.remove('active');
    });
    document.getElementById(stateId).classList.add('active');
  }

  show('state-loading');

  // Supabase appends the recovery token as a URL hash:
  //   reset-password.html#access_token=xxx&refresh_token=yyy&type=recovery
  const params       = new URLSearchParams(window.location.hash.slice(1));
  const type         = params.get('type');
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || type !== 'recovery') {
    document.getElementById('error-message').textContent =
      'No valid reset token found. Please use the link from your email, or request a new one.';
    show('state-error');
    return;
  }

  try {
    // Exchange tokens — this signs the user in so updateUser() works
    const { error } = await db.auth.setSession({
      access_token:  accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    // Clean tokens out of the URL bar
    history.replaceState(null, '', window.location.pathname);
    show('state-form');
    document.getElementById('new-password').focus();
  } catch (err) {
    document.getElementById('error-message').textContent =
      err.message || 'This link has expired. Please request a new password reset.';
    show('state-error');
  }

  // ── Password strength indicator — called from oninput in HTML
  window.checkStrength = function (val) {
    const fill  = document.getElementById('strength-fill');
    const label = document.getElementById('strength-label');
    if (!val) { fill.style.width = '0%'; label.textContent = ''; return; }

    let score = 0;
    if (val.length >= 8)              score++;
    if (val.length >= 12)             score++;
    if (/[A-Z]/.test(val))            score++;
    if (/[0-9]/.test(val))            score++;
    if (/[^A-Za-z0-9]/.test(val))     score++;

    const levels = [
      { w: '20%',  bg: '#e57373', text: 'Too short' },
      { w: '40%',  bg: '#ef9a9a', text: 'Weak'      },
      { w: '60%',  bg: '#ffb74d', text: 'Fair'      },
      { w: '80%',  bg: '#81c784', text: 'Good'      },
      { w: '100%', bg: '#4a7c59', text: 'Strong'    },
    ];
    const l = levels[Math.min(score, 4)];
    fill.style.width      = l.w;
    fill.style.background = l.bg;
    label.textContent     = l.text;
    label.style.color     = l.bg;
  };

  // ── Submit new password — called from onclick in HTML
  window.handleReset = async function () {
    const pwd     = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;

    if (pwd.length < 8)  { showToast('Password must be at least 8 characters'); return; }
    if (pwd !== confirm) { showToast('Passwords do not match'); return; }

    const btn = document.getElementById('reset-btn');
    setLoading(btn, true);
    try {
      const { error } = await updatePassword(pwd);
      if (error) throw error;
      show('state-success');
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Could not update password'));
      setLoading(btn, false);
    }
  };

  // Enter key submits when the form is visible
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('state-form').classList.contains('active')) {
      window.handleReset();
    }
  });
});
