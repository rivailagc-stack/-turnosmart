module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '53.0.0',
    daily_report_enabled: true,
    management_index_enabled: true,
    shift_targets_enabled: true,
    maintenance_name_removed_from_report_header: true,
    training_module_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
