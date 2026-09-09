// gemini-fix.js - Leitura direta sem recortar
window.addEventListener('load', () => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => 
    b.innerText.includes('Gemini')
  );
  if (!btn) return;

  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const input = document.getElementById('inputFotoQuadro') || document.querySelector('input[type="file"]');
    const file = input?.files?.[0];
    if (!file) return alert('Selecione a foto do quadro primeiro.');

    const coluna = window.colunaIdentificada || 'TERÇA A';
    btn.disabled = true;
    const txtAntigo = btn.innerHTML;
    btn.innerHTML = '⏳ Lendo coluna...';

    try {
      // Converte imagem inteira para base64
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const resp = await fetch('/api/oee-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, coluna })
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) throw new Error(data.error || 'Erro na leitura');

      // Preenche os campos do quadro
      data.dados.forEach(item => {
        const campo = document.getElementById(`oee-${item.maquina}`) || document.querySelector(`input[data-mk="${item.maquina}"]`);
        if (campo) campo.value = item.oee !== null ? item.oee : '';
      });

      alert('Leitura concluída com sucesso!');
    } catch (err) {
      alert('Falha: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = txtAntigo;
    }
  };
});
