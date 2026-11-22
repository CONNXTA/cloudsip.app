const FORMAT = 'cloudsip-configuration';
const VERSION = 1;

export function createConfigurationExport(settings, includePassword = false){
  const exportedSettings = { ...settings };
  if (!includePassword) exportedSettings.password = '';
  return JSON.stringify({ format: FORMAT, version: VERSION, settings: exportedSettings }, null, 2);
}

export function parseConfigurationImport(text){
  const data = JSON.parse(text);
  if (data?.format !== FORMAT || data?.version !== VERSION || !data?.settings || typeof data.settings !== 'object') {
    throw new Error('Invalid CloudSIP configuration file');
  }
  return data.settings;
}

export function downloadConfiguration(settings, includePassword = false){
  const blob = new Blob([createConfigurationExport(settings, includePassword)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cloudsip-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
