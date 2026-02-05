const { withXcodeProject } = require('@expo/config-plugins');

const withWidgetXcodeFix = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const nativeTargets = project.pbxNativeTargetSection();
    const configurationLists = project.pbxXCConfigurationList();
    const buildConfigurationSection = project.pbxXCBuildConfigurationSection();

    console.log('[withWidgetXcodeFix] Starting to patch extension targets...');

    // Iterate over all native targets
    for (const uuid in nativeTargets) {
      const target = nativeTargets[uuid];
      
      // Check if it's a valid target object (not a comment)
      if (!target || typeof target !== 'object' || !target.productType) {
        continue;
      }
      
      // Check if it is an extension or widget
      // productType is often quoted string like '"com.apple.product-type.app-extension"'
      const productType = target.productType.replace(/"/g, '');
      const targetName = target.name ? target.name.replace(/"/g, '') : '';
      const isExtension = 
        productType.includes('extension') || 
        productType.includes('widget') ||
        targetName.includes('Widget');

      if (isExtension) {
        console.log(`[withWidgetXcodeFix] Found extension target: ${targetName} (${productType})`);
        
        const buildConfigListParams = configurationLists[target.buildConfigurationList];
        if (buildConfigListParams && buildConfigListParams.buildConfigurations) {
          
          buildConfigListParams.buildConfigurations.forEach(configRef => {
            const buildConfig = buildConfigurationSection[configRef.value];
            if (buildConfig && buildConfig.buildSettings) {
              
              const configName = buildConfig.name ? buildConfig.name.replace(/"/g, '') : 'Unknown';
              console.log(`[withWidgetXcodeFix]   Patching config: ${configName}`);
              
              // Explicitly set CC and CXX to default clang to override any inherited xcconfig values
              // This prevents the widget from using the React Native ccache wrapper scripts
              buildConfig.buildSettings['CC'] = 'clang';
              buildConfig.buildSettings['CXX'] = 'clang++';
              
              // Remove other ccache-related settings
              delete buildConfig.buildSettings['LD'];
              delete buildConfig.buildSettings['LDPLUSPLUS'];
              delete buildConfig.buildSettings['CCACHE_BINARY'];
              
              console.log(`[withWidgetXcodeFix]     Set CC=clang, CXX=clang++`);
            }
          });
        }
      }
    }

    console.log('[withWidgetXcodeFix] Done patching extension targets.');
    return config;
  });
};

module.exports = withWidgetXcodeFix;
