const API_BASE = 'https://meeting-invite.onrender.com';
const form = document.getElementById('regForm');
const statusEl = document.getElementById('status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Enviando...';

  const fd = new FormData(form);
  const payload = {
    name: fd.get('name')?.trim(),
    email: fd.get('email')?.trim(),
    position: fd.get('position')?.trim(),
    orgType: fd.get('orgType')?.trim(),
    orgName: fd.get('orgName')?.trim(),
    optIn: fd.get('optIn') === 'yes'
  };

  try {
      const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    statusEl.textContent = json?.message || '¡Invitación enviada! Revisa tu correo.';
    form.reset();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error: ' + (err.message || 'No se pudo enviar la invitación.');
  }
});