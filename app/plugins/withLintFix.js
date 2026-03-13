const { withGradleProperties, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Config plugin to suppress ExtraTranslation lint errors caused by
 * Expo's locales config serializing iOS infoPlist objects into Android strings.xml
 * as "[object Object]".
 */
function withLintFix(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const lintXmlPath = path.join(projectRoot, "android", "app", "lint.xml");

      const lintXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<lint>
    <!-- Suppress ExtraTranslation errors from Expo locale infoPlist serialization -->
    <issue id="ExtraTranslation" severity="warning" />
</lint>
`;

      fs.mkdirSync(path.dirname(lintXmlPath), { recursive: true });
      fs.writeFileSync(lintXmlPath, lintXmlContent);

      return config;
    },
  ]);
}

module.exports = withLintFix;
