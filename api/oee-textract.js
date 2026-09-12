const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');

function normalizeMachineCode(value) {
  const digits = String(value || '').toUpperCase().replace(/[^0-9]/g, '');
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return `MK-${n < 10 ? String(n).padStart(2, '0') : String(n)}`;
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) throw new Error('Imagem inválida para leitura.');
  return Buffer.from(match[1], 'base64');
}

function numericOee(text = '') {
  const cleaned = String(text).replace(',', '.').replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function centerY(block = {}) {
  const box = block.Geometry?.BoundingBox || {};
  return Number(box.Top || 0) + Number(box.Height || 0) / 2;
}

function centerX(block = {}) {
  const box = block.Geometry?.BoundingBox || {};
  return Number(box.Left || 0) + Number(box.Width || 0) / 2;
}

function buildRows(blocks = [], machines = []) {
  const machineSet = new Set(machines.map(normalizeMachineCode).filter(Boolean));
  const lines = blocks
    .filter(block => block.BlockType === 'LINE' && String(block.Text || '').trim())
    .map(block => ({
      text: String(block.Text || '').trim(),
      confidence: Number(block.Confidence || 0),
      y: centerY(block),
      x: centerX(block)
    }));

  const labels = [];
  for (const line of lines) {
    const matches = line.text.toUpperCase().match(/MK\s*[- ]?\s*\d{1,3}/g) || [];
    for (const raw of matches) {
      const machine = normalizeMachineCode(raw);
      if (!machine || (machineSet.size && !machineSet.has(machine))) continue;
      labels.push({ machine, y: line.y, confidence: line.confidence });
    }
  }

  const rows = [];
  for (const machine of machines.map(normalizeMachineCode)) {
    const label = labels.find(item => item.machine === machine);
    if (!label) {
      rows.push({ machine, oee:'', confidence:0, source:'Textract', evidence:'Máquina não localizada na folha de células.' });
      continue;
    }

    const candidates = lines
      .filter(line => Math.abs(line.y - label.y) <= 0.018)
      .map(line => ({ ...line, value:numericOee(line.text) }))
      .filter(line => line.value !== null)
      .filter(line => !/MK\s*[- ]?\s*\d/i.test(line.text))
      .sort((a,b) => b.confidence - a.confidence || b.x - a.x);

    const best = candidates[0];
    if (!best) {
      rows.push({ machine, oee:'', confidence:0, source:'Textract', evidence:'Sem número seguro na mesma linha.' });
      continue;
    }

    rows.push({
      machine,
      oee:best.value,
      confidence:Math.round(Math.min(label.confidence, best.confidence)),
      source:'Textract',
      evidence:`Texto: ${best.text}`
    });
  }
  return rows;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Método não permitido.' });

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    return res.status(503).json({
      ok:false,
      error:'Amazon Textract não configurado. Defina AWS_REGION, AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY na Vercel.'
    });
  }

  try {
    const imageDataUrl = req.body?.imageDataUrl;
    const machines = Array.isArray(req.body?.machines) ? req.body.machines : [];
    if (!imageDataUrl || !machines.length) throw new Error('Imagem ou lista de máquinas ausente.');

    const client = new TextractClient({
      region,
      credentials:{ accessKeyId, secretAccessKey }
    });

    const result = await client.send(new AnalyzeDocumentCommand({
      Document:{ Bytes:parseDataUrl(imageDataUrl) },
      FeatureTypes:['TABLES','LAYOUT']
    }));

    const rows = buildRows(result.Blocks || [], machines);
    return res.status(200).json({
      ok:true,
      provider:'Amazon Textract',
      rows,
      detected:rows.filter(row => row.oee !== '').length
    });
  } catch (error) {
    console.error('Textract OEE:', error);
    return res.status(500).json({ ok:false, error:error.message || 'Falha no Amazon Textract.' });
  }
};
