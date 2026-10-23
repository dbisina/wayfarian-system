const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Android 14 only lets a foreground service run as "location" when its manifest entry says so.
 * notifee's ForegroundService is declared without a type, so the rich ride notification (which is
 * the location foreground service when the beta setting is on) could not start. This adds the type.
 */
function withNotifeeLocationService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const app = manifest.application[0];
    app.service = app.service || [];
    const name = 'app.notifee.core.ForegroundService';
    const existing = app.service.find((s) => s.$['android:name'] === name);
    const attrs = {
      'android:name': name,
      'android:exported': 'false',
      'android:foregroundServiceType': 'location',
      'tools:replace': 'android:foregroundServiceType',
    };
    if (existing) existing.$ = { ...existing.$, ...attrs };
    else app.service.push({ $: attrs });
    return cfg;
  });
}

module.exports = withNotifeeLocationService;
