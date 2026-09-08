// api/oee-gemini.js
// TurnoSmart - Leitura Estruturada do Quadro de OEE Semanal Ecopack

const GABARITO_MAQUINAS = [
  "MK-02", "MK-08", "MK-138", "MK-105", "MK-108", "MK-223",
  "MK-192", "MK-69", "MK-172", "MK-173", "MK-178", "MK-179",
  "MK-212", "MK-214", "MK-217", "MK-220", "MK-159", "MK-222",
  "MK-170", "MK-176", "MK-188", "MK-149"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no ambiente.' });
  }

  try {
    const { image, coluna = 'TERÇA A' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Imagem em base64 não fornecida.' });
    }

    // Extrai o base64 puro removendo prefixo data:image/...
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const promptSistema = `
Você é um leitor óptico industrial de precisão para a fábrica da Ecopack Brasil.
Sua tarefa é extrair os dados de OEE da coluna específica de um quadro branco semanal manuscrito.

COLUNA ALVO A SER LIDA: "${coluna}"

ESTRUTURA DO QUADRO:
1. A coluna da extrema esquerda ("MK / SEMANA") lista exatamente 22 máquinas de cima para baixo nesta ordem estrita:
${GABARITO_MAQUINAS.map((mk, idx) => `Linha ${idx + 1}: ${mk}`).join('\n')}

2. O cabeçalho da coluna alvo contém:
   - Meta ou produção da coluna
   - % OEE geral do turno (ex: 61%)

3. Cada célula da coluna possui até 3 informações manuscritas:
   - Nome do operador (ex: "Felipe", "Pamela", "Claudinete")
   - Produção em peças (ex: "47.700", "20.042", "15.000")
   - Porcentagem de OEE (ex: "78%", "37%", "05%", "21%")

REGRAS CRÍTICAS DE EXTRAÇÃO:
- JAMAIS DESLOQUE LINHAS: Máquinas sem anotação (em branco, como MK-138, MK-108, MK-192, MK-188) devem retornar oee: null e producao: null. Não suba nem desça valores entre linhas adjacentes.
- CUIDADO COM COLUNAS VIZINHAS: Leia estritamente a coluna referente a "${coluna}". Não capture valores da coluna anterior ou seguinte.
- RETORNE APENAS JSON VÁLIDO no formato especificado abaixo, sem crases de markdown (\`\`\`json).

FORMATO DE RESPOSTA OBRIGATÓRIO:
{
  "colunaLida": "${coluna}",
  "oeeGeral": 61,
  "leitura": [
    { "maquina": "MK-02", "operador": "Pamela", "producao": 20042, "oee": 37 },
    { "maquina": "MK-08", "operador": "Edilene", "producao": 32130, "oee": 21 },
    { "maquina": "MK-138", "operador": null, "producao": null, "oee": null }
  ]
}
`;

    // Chamada à API Gemini REST
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptSistema },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro Gemini API:', data);
      return res.status(response.status).json({ error: data.error?.message || 'Erro ao processar imagem no Gemini.' });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'Resposta vazia recebida do Gemini.' });
    }

    const resultadoJson = JSON.parse(rawText.replace(/```json|```/g, '').trim());

    // Garante que todas as 22 máquinas existam na saída com o gabarito preenchido
    const leituraPadronizada = GABARITO_MAQUINAS.map(mk => {
      const encontrada = (resultadoJson.leitura || []).find(item => item.maquina === mk);
      return {
        maquina: mk,
        operador: encontrada?.operador || null,
        producao: encontrada?.producao || null,
        oee: typeof encontrada?.oee === 'number' ? encontrada.oee : (encontrada?.oee ? parseInt(encontrada.oee, 10) : null)
      };
    });

    return res.status(200).json({
      success: true,
      coluna: resultadoJson.colunaLida || coluna,
      oeeGeral: resultadoJson.oeeGeral || null,
      dados: leituraPadronizada
    });

  } catch (err) {
    console.error('Erro no handler oee-gemini:', err);
    return res.status(500).json({ error: 'Falha interna ao processar OEE.', detalhe: err.message });
  }
}
