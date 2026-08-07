const SALARY_DATA = [{"name": "gustavo", "role": "jovem aprendiz", "salary": 1747.2, "aliases": ["gustavo"]}, {"name": "rogger", "role": "ASSISTENTE DE MANUTENÇÃO", "salary": 3150.0, "aliases": ["roger", "rogger"]}, {"name": "thiago", "role": "mecanico de producao", "salary": 3465.0, "aliases": ["thiago"]}, {"name": "igor", "role": "", "salary": 3811.0, "aliases": ["igor"]}, {"name": "marcelo", "role": "mecanico de producao", "salary": 3465.0, "aliases": ["marcelo"]}, {"name": "jeanderson", "role": "mecanico de producao", "salary": 3465.0, "aliases": ["jean", "jeanderson"]}, {"name": "roberto", "role": "mecanico de producao", "salary": 3811.0, "aliases": ["roberto"]}, {"name": "ALEILSON DE SOUZA ALMEIDA", "role": "MECANICO DE PRODUÇÃO NIVEL I", "salary": 4192.0, "aliases": ["aleilson", "aleilsondesouzaalmeida"]}, {"name": "MARCOS ROBERTO", "role": "MECANICO DE PRODUÇÃO NIVEL I", "salary": 3811.0, "aliases": ["marcos", "marcosroberto"]}, {"name": "CARLOS DA SILVA MATOS", "role": "MECANICO DE PRODUÇÃO NIVEL II", "salary": 4192.0, "aliases": ["carlos", "carlosdasilvamatos"]}, {"name": "LUIZ AFONSO VIEIRA JUNIOR", "role": "Lider de Manutenção", "salary": 4611.0, "aliases": ["luiz", "luizafonsovieirajunior"]}, {"name": "ALLAN TEODORAK SOARES", "role": "Lider de Manutenção", "salary": 4611.0, "aliases": ["allan", "allanteodoraksoares"]}, {"name": "joao", "role": "MECANICO DE PRODUÇÃO NIVEL III", "salary": 4611.0, "aliases": ["joao"]}, {"name": "Rosental", "role": "Lider de Manutenção", "salary": 4410.0, "aliases": ["rosental"]}, {"name": "DANILO NEPOMUCENO DA SILVA", "role": "LIDER DE MANUTENÇÃO I", "salary": 6595.0, "aliases": ["danilo", "danilonepomucenodasilva"]}, {"name": "FIDERLANIO SOARES REIS", "role": "LIDER DE MANUTENÇÃO I", "salary": 6595.0, "aliases": ["fider", "fiderlanio", "fiderlaniosoaresreis"]}, {"name": "RICARDO DOLA SERAFIM", "role": "LIDER DE MANUTENÇÃO I", "salary": 6595.0, "aliases": ["ricardo", "ricardodolaserafim"]}, {"name": "EMERSON DAVID NUNES", "role": "LIDER DE MANUTENÇÃO I", "salary": 6595.0, "aliases": ["emerson", "emersondavidnunes"]}];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const configuredPin = String(process.env.MANAGEMENT_PIN || '').trim();

  if (!configuredPin) {
    return res.status(503).json({
      ok: false,
      code: 'MANAGEMENT_PIN_REQUIRED',
      error: 'Configure MANAGEMENT_PIN nas variáveis de ambiente da Vercel.'
    });
  }

  const pin = String(req.body?.pin || '').trim();

  if (!pin || pin !== configuredPin) {
    return res.status(401).json({ ok: false, error: 'PIN de gestão inválido.' });
  }

  const hoursPerMonth = safeNumber(req.body?.hoursPerMonth, 220);
  const employerMultiplier = safeNumber(req.body?.employerMultiplier, 1);

  const rates = SALARY_DATA.map(item => {
    const companyMonthlyCost = item.salary * employerMultiplier;
    const hourlyCost = companyMonthlyCost / hoursPerMonth;

    return {
      name: item.name,
      role: item.role,
      aliases: item.aliases,
      hourlyCost: Number(hourlyCost.toFixed(4)),
      companyMonthlyCost: Number(companyMonthlyCost.toFixed(2))
    };
  });

  return res.status(200).json({
    ok: true,
    hoursPerMonth,
    employerMultiplier,
    count: rates.length,
    rates
  });
}
