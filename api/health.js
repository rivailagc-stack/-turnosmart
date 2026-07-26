module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '50.0.0',
    ecopack_default_profile: true,
    configurable_company_profile: true,
    configurable_maintenance_targets: true,
    configurable_report_modules: true,
    organization_export_import: true,
    maintenance_accountability_report_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
