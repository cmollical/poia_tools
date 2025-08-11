document.getElementById('uploader').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const logNode = document.getElementById('log');
  logNode.textContent = '';

  const token = localStorage.getItem('token'); // assume login stored token
  const resp = await fetch('/admin/upload', {
    method: 'POST',
    body: fd,
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  });

  if (!resp.ok) {
    logNode.textContent = 'Error: ' + resp.statusText;
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    logNode.textContent += decoder.decode(value);
    logNode.scrollTop = logNode.scrollHeight;
  }
});
