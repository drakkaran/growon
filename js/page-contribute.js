/* Outgrown — contribute page */
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

  // ── Image compression using canvas ─────────────────────────────────────────
  // Resizes to max 1200px on the longest edge, then steps JPEG quality down
  // until the blob fits under TARGET_BYTES. Always outputs JPEG.
  const TARGET_BYTES = 200 * 1024; // 200 KB — comfortable margin under 1 MB
  const MAX_DIMENSION = 1200;

  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        // Scale down preserving aspect ratio
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height / width) * MAX_DIMENSION);
            width  = MAX_DIMENSION;
          } else {
            width  = Math.round((width / height) * MAX_DIMENSION);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // White background so transparent PNGs don't go black
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Step quality down until under TARGET_BYTES (min quality 0.4)
        const tryQuality = (quality) => {
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            if (blob.size <= TARGET_BYTES || quality <= 0.4) {
              resolve(blob);
            } else {
              tryQuality(Math.round((quality - 0.1) * 10) / 10);
            }
          }, 'image/jpeg', quality);
        };

        tryQuality(0.85);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not load image'));
      };

      img.src = objectUrl;
    });
  }

  // Holds the compressed Blob so handleSubmit can upload it directly
  let compressedBlob = null;

  // ── Photo handlers — called from onchange/onclick in HTML
  window.handlePhoto = async function (input) {
    const file = input.files[0];
    if (!file) return;

    const preview    = document.getElementById('photo-preview');
    const photoImg   = document.getElementById('photo-img');
    const sizeLabel  = document.getElementById('photo-size-label');

    // Show a loading state while compressing
    preview.style.display  = 'block';
    photoImg.style.opacity = '0.4';
    if (sizeLabel) sizeLabel.textContent = 'Compressing…';

    try {
      compressedBlob = await compressImage(file);

      const dataUrl = await new Promise(res => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result);
        reader.readAsDataURL(compressedBlob);
      });

      photoImg.src = dataUrl;
      photoImg.style.opacity = '1';

      const kb = Math.round(compressedBlob.size / 1024);
      if (sizeLabel) sizeLabel.textContent = `${kb} KB`;
    } catch (err) {
      compressedBlob = null;
      preview.style.display = 'none';
      showToast('Could not process image — please try another file');
    }
  };

  window.clearPhoto = function () {
    document.getElementById('photo-input').value = '';
    document.getElementById('photo-preview').style.display = 'none';
    compressedBlob = null;
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
      if (compressedBlob) {
        // Always store as .jpg regardless of original format
        const storagePath = `${session.user.id}/${Date.now()}.jpg`;
        const { error: upErr } = await db.storage
          .from('item-photos')
          .upload(storagePath, compressedBlob, { contentType: 'image/jpeg' });
        if (!upErr) {
          const { data: urlData } = db.storage.from('item-photos').getPublicUrl(storagePath);
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
