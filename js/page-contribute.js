/* GrowOn — contribute page */
document.addEventListener('DOMContentLoaded', function () {

  let selectedCondition = 'excellent';

  initNav();

  // ── Condition selector — called from onclick in HTML
  window.selectCondition = function (el, cond) {
    document.querySelectorAll('.condition-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedCondition = cond;
    calcPoints();
  };

  // ── Points calculator — called from onchange/oninput in HTML
  window.calcPoints = function () {
    const sizeGroup = document.getElementById('size_group').value;
    const material  = document.getElementById('material').value;
    const brand     = document.getElementById('brand').value.trim();
    const pts = calculatePoints(
      SIZE_BASE[sizeGroup]              || 17,
      CONDITION_MULT[selectedCondition] || 1.0,
      MATERIAL_BONUS[material]          || 1.0,
      brand.length > 0
    );
    document.getElementById('pts-preview').textContent = pts;
  };

  // ── Photo handlers — called from onchange/onclick in HTML
  window.handlePhoto = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('photo-img').src = e.target.result;
      document.getElementById('photo-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  window.clearPhoto = function () {
    document.getElementById('photo-input').value = '';
    document.getElementById('photo-preview').style.display = 'none';
  };

  // ── Form submit — called from onclick in HTML
  window.handleSubmit = async function () {
    const session = await getSession();
    if (!session) {
      showToast('Please sign in to contribute items');
      setTimeout(() => window.location.href = 'login.html', 1500);
      return;
    }

    const title  = document.getElementById('title').value.trim();
    const suburb = document.getElementById('suburb').value.trim();
    if (!title)  { showToast('Please enter an item name'); return; }
    if (!suburb) { showToast('Please enter your suburb');  return; }

    const btn = document.getElementById('submit-btn');
    setLoading(btn, true);

    try {
      let photoUrl = null;
      const photoFile = document.getElementById('photo-input').files[0];
      if (photoFile) {
        const ext  = photoFile.name.split('.').pop();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await db.storage.from('item-photos').upload(path, photoFile);
        if (!upErr) {
          const { data: urlData } = db.storage.from('item-photos').getPublicUrl(path);
          photoUrl = urlData.publicUrl;
        }
      }

      const sizeGroup = document.getElementById('size_group').value;
      const sizeLabel = document.getElementById('size_group')
        .options[document.getElementById('size_group').selectedIndex].text.split(' ')[0];
      const material  = document.getElementById('material').value;
      const brand     = document.getElementById('brand').value.trim();

      await submitItem({
        title,
        category:   document.getElementById('category').value,
        gender:     document.getElementById('gender').value,
        size_group: sizeGroup,
        size_label: sizeLabel,
        season:     document.getElementById('season').value,
        material,
        brand:      brand || null,
        emoji:      document.getElementById('emoji').value,
        condition:  selectedCondition,
        suburb,
        photo_url:  photoUrl,
        point_cost: parseInt(document.getElementById('pts-preview').textContent),
      });

      showToast("🎉 Item submitted! We'll confirm your points after assessment.");
      setTimeout(() => window.location.href = 'dashboard.html', 2000);
    } catch (err) {
      showToast('⚠ ' + (err.message || 'Submission failed'));
    } finally {
      setLoading(btn, false);
    }
  };

  // Run initial calculation
  calcPoints();
});
