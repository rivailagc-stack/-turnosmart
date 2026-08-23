const DEFAULT_MODEL = 'gemini-3.6-flash';

function parseDataUrl(value) {
  const match = String(value || '').match(
    /^data:(image\/[^;]+);base64,(.+)$/s
  );

  return match
    ? {
        mimeType: match[1],
        data: match[2]
      }
    : null;
}

function responseText(body) {
  return (body?.candidates?.[0]?.content?.parts || [])
    .map(part => part?.text || '')
    .join('')
    .trim();
}

function parseJson(text) {
  const clean = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');

  if (start >= 0 && end > start) {
    return JSON.parse(clean.slice(start, end + 1));
  }

  throw new Error('Gemini não retornou JSON válido.');
}

function normalizeMachine(value) {
  const match = String(value || '').match(/\d{1,3}/);

  return match
    ? `MK-${String(Number(match[0])).padStart(2, '0')}`
    : '';
}

module.exports = async function handler(req, res) {

  // =====================================================
  // SOMENTE POST
  // =====================================================

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Use POST.'
    });
  }

  // =====================================================
  // CHAVE GEMINI
  // =====================================================

  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!key) {
    return res.status(503).json({
      ok: false,
      error:
        'GEMINI_API_KEY não configurada na Vercel.'
    });
  }

  try {

    // =====================================================
    // RECEBE DADOS DO TURNOSMART
    // =====================================================

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

    const image = parseDataUrl(body.imageDataUrl);

    if (!image) {
      return res.status(400).json({
        ok: false,
        error:
          'Imagem da coluna do OEE não recebida.'
      });
    }

    // =====================================================
    // LISTA OFICIAL DAS MÁQUINAS DO QUADRO
    // =====================================================

    const machines = (body.machines || [])
      .map(normalizeMachine)
      .filter(Boolean);

    if (!machines.length) {
      return res.status(400).json({
        ok: false,
        error:
          'Lista das máquinas não recebida.'
      });
    }

    const scope = body.scope || {};

    // =====================================================
    // EXEMPLOS QUE O SUPERVISOR ENSINOU
    // =====================================================

    const examples =
      Array.isArray(body.examples)
        ? body.examples.slice(-3)
        : [];

    // =====================================================
    // INSTRUÇÃO PRINCIPAL PARA O GEMINI
    // =====================================================

    const instruction = `
Você é o leitor visual do quadro semanal de OEE da Ecopack Brasil.

IMPORTANTE:
A imagem recebida corresponde a UMA COLUNA do quadro.

COLUNA QUE DEVE SER LIDA:
${scope.label || 'não informada'}

As linhas do quadro aparecem exatamente nesta ordem,
de cima para baixo:

${machines.join(', ')}

=====================================================
O QUE VOCÊ DEVE LER
=====================================================

Para cada máquina, procure SOMENTE o percentual de OEE
escrito manualmente na célula correspondente.

Exemplos corretos:

MK-223 = 33%
MK-173 = 54%
MK-212 = 67%
MK-149 = 62%

Retorne:

MK-223 -> 33
MK-173 -> 54
MK-212 -> 67
MK-149 -> 62

=====================================================
NÚMEROS QUE VOCÊ DEVE IGNORAR
=====================================================

Dentro da célula podem existir vários números.

Exemplo:

SANORO
48.540
54%

Nesse caso:

48.540 = produção
54% = OEE

Resposta correta:

54

Outro exemplo:

MARISA
31.200
59%

Resposta correta:

59

=====================================================
REGRA MAIS IMPORTANTE
=====================================================

O OEE é o número acompanhado do símbolo %.

NÃO use:

- quantidade produzida
- horário
- nome do operador
- quantidade de paradas
- números escritos sem %
- números de outras linhas
- números de outras colunas

=====================================================
CÉLULA VAZIA
=====================================================

Se não existir percentual claramente escrito:

oee = null

NUNCA transforme célula vazia em 0%.

0 somente pode ser retornado se estiver claramente
escrito "0%" na célula.

=====================================================
ESCRITA MANUAL
=====================================================

A escrita é feita com caneta e pode ser difícil.

Analise visualmente cada número.

Tenha atenção especial para:

2 e 7
3 e 5
3 e 8
4 e 7
5 e 6
1 e 7

Use também a posição da linha da máquina para evitar
pegar o percentual da máquina acima ou abaixo.

=====================================================
CONFIANÇA
=====================================================

Use:

90 a 100
quando número e símbolo % estiverem muito claros.

70 a 89
quando a leitura estiver boa, mas a escrita não estiver perfeita.

50 a 69
quando existir dúvida.

Abaixo de 50
quando não houver segurança.

Se houver muita dúvida:

oee = null

É melhor deixar vazio do que inventar um valor.

=====================================================
EXEMPLOS ENSINADOS
=====================================================

Depois desta instrução você poderá receber imagens
que já foram corrigidas pelo supervisor.

Esses exemplos servem SOMENTE para aprender:

- estilo da escrita
- posição dos números
- formato do quadro
- aparência das células
- maneira como o percentual é escrito

NUNCA copie os números dos exemplos para a imagem atual.

=====================================================
FORMATO DA RESPOSTA
=====================================================

Retorne SOMENTE JSON.

Exemplo:

{
  "rows": [
    {
      "machine": "MK-223",
      "oee": 33,
      "confidence": 95,
      "evidence": "33%",
      "reason": "33% visível na linha MK-223"
    },
    {
      "machine": "MK-192",
      "oee": null,
      "confidence": 0,
      "evidence": "",
      "reason": "célula sem percentual legível"
    }
  ]
}

Inclua TODAS as máquinas da lista.

Não escreva explicações fora do JSON.
`;

    const parts = [
      {
        text: instruction
      }
    ];

    // =====================================================
    // ADICIONA EXEMPLOS CORRIGIDOS
    // =====================================================

    for (
      let index = 0;
      index < examples.length;
      index++
    ) {

      const example = examples[index];

      const exImage =
        parseDataUrl(example.imageDataUrl);

      if (!exImage) continue;

      const correctRows =
        (example.rows || [])
          .map(row => ({
            machine:
              normalizeMachine(row.machine),

            oee:
              Number(row.oee)
          }))
          .filter(
            row =>
              row.machine &&
              Number.isFinite(row.oee)
          );

      parts.push({
        text:
          `EXEMPLO CORRIGIDO ${index + 1}.
          
Coluna:
${example.scope || example.column || 'não informada'}

A imagem seguinte foi conferida manualmente
pelo supervisor.

Use somente para aprender o padrão visual
da lousa e da escrita.`
      });

      parts.push({
        inlineData: {
          mimeType: exImage.mimeType,
          data: exImage.data
        }
      });

      parts.push({
        text:
          `RESPOSTA CORRETA DO EXEMPLO ${
            index + 1
          }:

${JSON.stringify(correctRows)}`
      });
    }

    // =====================================================
    // FOTO ATUAL
    // =====================================================

    parts.push({
      text: `
AGORA ANALISE A FOTO ATUAL.

Coluna atual:

${scope.label || 'não informada'}

Leia máquina por máquina.

Lembre-se:

número com % = candidato a OEE.

Quantidade produzida NÃO é OEE.

Célula vazia NÃO é 0%.

Não copie valores dos exemplos anteriores.
`
    });

    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });

    // =====================================================
    // MODELO GEMINI
    // =====================================================

    const model =
      process.env.GEMINI_MODEL ||
      DEFAULT_MODEL;

    // =====================================================
    // CHAMADA GEMINI
    // =====================================================

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },

        body: JSON.stringify({

          contents: [
            {
              role: 'user',
              parts
            }
          ],

          generationConfig: {
            responseMimeType:
              'application/json'
          }
        })
      }
    );

    const result =
      await response
        .json()
        .catch(() => ({}));

    // =====================================================
    // ERRO GEMINI
    // =====================================================

    if (!response.ok) {

      throw new Error(
        result?.error?.message ||
        `Gemini HTTP ${response.status}`
      );
    }

    // =====================================================
    // INTERPRETA JSON
    // =====================================================

    const text = responseText(result);

    const parsed = parseJson(text);

    const map = new Map(
      (parsed.rows || [])
        .map(row => [
          normalizeMachine(row.machine),
          row
        ])
        .filter(([machine]) => machine)
    );

    // =====================================================
    // GARANTE TODAS AS MÁQUINAS
    // =====================================================

    const rows =
      machines.map(machine => {

        const row =
          map.get(machine) || {};

        const raw =
          row.oee;

        const has =
          raw !== null &&
          raw !== undefined &&
          raw !== '';

        const oee =
          has
            ? Number(raw)
            : null;

        const valid =
          Number.isFinite(oee) &&
          oee >= 0 &&
          oee <= 100;

        return {

          machine,

          oee:
            valid
              ? oee
              : null,

          confidence:
            Math.max(
              0,
              Math.min(
                100,
                Number(
                  row.confidence || 0
                )
              )
            ),

          evidence:
            String(
              row.evidence || ''
            ),

          reason:
            String(
              row.reason || ''
            )
        };
      });

    // =====================================================
    // RESPOSTA PARA TURNOSMART
    // =====================================================

    return res
      .status(200)
      .json({

        ok: true,

        model,

        column:
          scope.label || '',

        examplesUsed:
          examples.length,

        detected:
          rows.filter(
            row =>
              row.oee !== null
          ).length,

        rows
      });

  } catch (error) {

    console.error(
      'Erro OEE Gemini:',
      error
    );

    return res
      .status(502)
      .json({

        ok: false,

        error:
          String(
            error?.message ||
            error
          )
      });
  }
};
