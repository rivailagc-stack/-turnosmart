// ============================================================
// ATUALIZAÇÃO TURNOSMART - CORREÇÃO LEITURA GEMINI
// (Sobrescreve o auto-recorte e lê a coluna inteira com gabarito)
// ============================================================
(function() {
  async function prepararFotoQuadroCompleta(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 2048;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function executarLeituraGeminiCorrigida() {
    const inputArquivo = document.getElementById('inputFotoQuadro') || 
                         document.querySelector('input[type="file"]');
    const file = inputArquivo?.files?.[0];
    if (!file) {
      alert('Selecione ou tire a foto do quadro semanal antes de ler.');
      return;
    }

    const colunaAlvo = window.colunaIdentificada || 
                       document.getElementById('colunaTurnoTexto')?.innerText?.trim() || 
                       'TERÇA A';

    const botoes = Array.from(document.querySelectorAll('button')).filter(b => 
      b.innerText.includes('Gemini') || (b.id && b.id.includes('Gemini'))
    );
    const btn = botoes[0];
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Lendo coluna ' + colunaAlvo + '...';
    }

    try {
      const imagemBase64 = await prepararFotoQuadroCompleta(file);

      const response = await fetch('/api/oee-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imagemBase64,
          coluna: colunaAlvo
        })
      });

      const res = await response.json();
      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Falha ao processar quadro.');
      }

      window.leiturasOEE = res.dados;
      window.oeeGeralTurno = res.oeeGeral;

      if (Array.isArray(res.dados)) {
        res.dados.forEach(item => {
          const input = document.getElementById(`oee-${item.maquina}`) || 
                        document.querySelector(`input[data-mk="${item.maquina}"]`);
          if (input) {
            input.value = (item.oee !== null && item.oee !== undefined) ? item.oee : '';
            input.classList.remove('oee-baixo', 'oee-atencao', 'oee-ok', 'oee-vazio');
            if (item.oee === null || item.oee === '') {
              input.classList.add('oee-vazio');
            } else if (item.oee < 50) {
              input.classList.add('oee-baixo');
            } else if (item.oee < 65) {
              input.classList.add('oee-atencao');
            } else {
              input.classList.add('oee-ok');
            }
          }
        });
      }

      const imgPreview = document.getElementById('imgColunaPreview') || 
                         document.querySelector('.preview-coluna-recortada img');
      if (imgPreview) {
        imgPreview.src = imagemBase64;
      }

      alert(`Leitura de ${colunaAlvo} finalizada! Confira os números antes de gerar a análise.`);

    } catch (err) {
      console.error(err);
      alert('Erro na leitura: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
      }
    }
  }

  window.lerComGemini = executarLeituraGeminiCorrigida;

  function acoplarNovoBotao() {
    const botoes = Array.from(document.querySelectorAll('button')).filter(b => 
      b.innerText.includes('Gemini') || (b.id && b.id.includes('Gemini'))
    );
    botoes.forEach(antigoBtn => {
      const novoBtn = antigoBtn.cloneNode(true);
      antigoBtn.parentNode.replaceChild(novoBtn, antigoBtn);
      novoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        executarLeituraGeminiCorrigida();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', acoplarNovoBotao);
  } else {
    acoplarNovoBotao();
  }
})();
