const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withPodfileFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      // Check if file exists first
      if (!fs.existsSync(file)) {
        console.warn('[withPodfileFix] Podfile not found. Skipping patch.');
        return config;
      }

      let contents = await fs.promises.readFile(file, 'utf8');

      // Skip if already patched
      if (contents.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        console.log('[withPodfileFix] Podfile already patched. Skipping.');
        return config;
      }

      const buildSettingsFix = `
    # Fix for Firebase non-modular header includes (added by withPodfileFix)
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end`;

      // Strategy 1: Look for post_install block with installer parameter
      // Match variations: post_install do |installer| or post_install do |pi|, etc.
      const postInstallMatch = contents.match(/post_install\s+do\s+\|(\w+)\|/);
      
      if (postInstallMatch) {
        const installerVarName = postInstallMatch[1];
        console.log(`[withPodfileFix] Found post_install block with variable: ${installerVarName}`);
        
        // Replace installer with the actual variable name used in the Podfile
        const fixCode = buildSettingsFix.replace(/installer\./g, `${installerVarName}.`);
        
        // Insert the fix right after the post_install block opens
        const regex = new RegExp(`(post_install\\s+do\\s+\\|${installerVarName}\\|[^\\n]*\\n)`);
        contents = contents.replace(regex, `$1${fixCode}\n`);
        
        await fs.promises.writeFile(file, contents, 'utf8');
        console.log('[withPodfileFix] Successfully patched Podfile post_install block.');
        return config;
      }

      // Strategy 2: If no post_install block, we need to add one
      // This is rare but could happen with some Expo configurations
      console.warn('[withPodfileFix] No post_install block found. Adding one at end of file.');
      
      const fullPostInstall = `
post_install do |installer|
${buildSettingsFix}
end
`;
      
      // Check if there's already a post_install (in case our regex failed)
      if (contents.includes('post_install')) {
        console.error('[withPodfileFix] post_install exists but our regex did not match. Manual review needed.');
        console.error('[withPodfileFix] Podfile content near post_install:');
        const postInstallIndex = contents.indexOf('post_install');
        console.error(contents.substring(postInstallIndex, postInstallIndex + 200));
        return config;
      }
      
      contents = contents + fullPostInstall;
      await fs.promises.writeFile(file, contents, 'utf8');
      console.log('[withPodfileFix] Added new post_install block to Podfile.');
      return config;
    },
  ]);
};

module.exports = withPodfileFix;
