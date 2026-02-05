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

      // Verify if the specific widget fix is already present
      if (contents.includes('Fix for widget targets failing due to ccache path issues')) {
        console.log('[withPodfileFix] Podfile already patched with widget fix. Skipping.');
        return config;
      }
      
      // If the old patch exists but not the widget one, we might need to be careful
      // But for simplicity, we'll append the widget fix if it's missing, 
      // or replace the whole block if we can identify the old one. 
      // Let's just define the block we want to ensure exists.

      const buildSettingsFix = `
    # Fix for Firebase non-modular header includes (added by withPodfileFix)
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end

    # Fix for widget targets failing due to ccache path issues
    # Widget extensions don't have REACT_NATIVE_PATH set, causing ccache scripts to fail
    # We clear the CC/CXX/LD/LDPLUSPLUS settings for extension targets
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_project.native_targets.each do |target|
        # Check if this is an extension target (widgets, app clips, etc.)
        is_extension = target.product_type.to_s.include?('extension') || 
                       target.product_type.to_s.include?('widget') ||
                       target.name.to_s.include?('Widget')
        if is_extension
          target.build_configurations.each do |config|
            # Explicitly set compilers to system default to override values from xcconfig
            config.build_settings['CC'] = 'clang'
            config.build_settings['CXX'] = 'clang++'
            config.build_settings['LD'] = 'clang'
            config.build_settings['LDPLUSPLUS'] = 'clang++'
            
            # Remove ccache specific settings
            config.build_settings.delete('CCACHE_BINARY')
          end
        end
      end
      aggregate_target.user_project.save()
    end`;

      // Strategy: Check if we have the old patch (Firebase only) and replace it for cleaner file
      // OR just look for post_install loop.
      
      const postInstallMatch = contents.match(/post_install\s+do\s+\|(\w+)\|/);

      if (postInstallMatch) {
        const installerVarName = postInstallMatch[1];
        console.log(`[withPodfileFix] Found post_install block with variable: ${installerVarName}`);

        // Prepare the code snippet with the correct installer variable name
        const fixCode = buildSettingsFix.replace(/installer\./g, `${installerVarName}.`);

        // Check if we already have the Firebase fix but miss the Widget fix
        if (contents.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
             // If we already have the old fix, let's just append the WIDGET fix part right after it
             // Finding the end of the old fix is hard via regex. 
             // Simplest approach: Inject the NEW widget fix right at the start of post_install anyway.
             // It's safe to run the firebase fix twice (idempotent-ish assignment).
             // But to avoid duplication, let's NOT include the firebase fix in the new block if it exists?
             // No, let's just leave it. If it sets it to YES again, that's fine.
        }

        // Insert the fix right after the post_install block opens
        const regex = new RegExp(`(post_install\\s+do\\s+\\|${installerVarName}\\|[^\\n]*\\n)`);
        contents = contents.replace(regex, `$1${fixCode}\n`);

        await fs.promises.writeFile(file, contents, 'utf8');
        console.log('[withPodfileFix] Successfully patched Podfile post_install block.');
        return config;
      }

      // Strategy 2: If no post_install block, add one
      console.warn('[withPodfileFix] No post_install block found. Adding one at end of file.');

      const fullPostInstall = `
post_install do |installer|
${buildSettingsFix}
end
`;
      // Safety check
      if (contents.includes('post_install')) {
         // Should have matched regex above. If here, regex failed but 'post_install' string exists.
         // fallback to appending might break syntax if inside another block.
         // But usually this means weird formatting.
         console.warn('[withPodfileFix] post_install detected but regex failed. Appending anyway.');
      }

      contents = contents + fullPostInstall;
      await fs.promises.writeFile(file, contents, 'utf8');
      console.log('[withPodfileFix] Added new post_install block to Podfile.');
      return config;
    },
  ]);
};

module.exports = withPodfileFix;
