/**
 * Expo config plugin that copies the adaptive icon as an Android
 * notification small-icon drawable (ic_notification).
 *
 * Notifee (and any other code) that references `smallIcon: 'ic_notification'`
 * will find the resource at runtime, preventing the
 * "Invalid notification (no valid small icon)" crash.
 *
 * For the best visual result the source image should be a white-on-transparent
 * silhouette, but any valid PNG will prevent the crash.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * densities → scale factors relative to the source (mdpi = 1×)
 * We simply copy the source into every bucket so the system can pick
 * the right density. A single drawable/ copy already prevents the crash,
 * but shipping all densities is cleaner.
 */
const DENSITIES = [
  "drawable-mdpi",
  "drawable-hdpi",
  "drawable-xhdpi",
  "drawable-xxhdpi",
  "drawable-xxxhdpi",
];

function withNotificationIcon(expoConfig, opts = {}) {
  // Allow overriding the source icon via plugin options:
  //   ["./plugins/withNotificationIcon", { icon: "./assets/icons/notification-icon.png" }]
  const sourceIcon =
    opts.icon || "./assets/icons/adaptive-icon.png";

  return withDangerousMod(expoConfig, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res"
      );

      const srcPath = path.resolve(projectRoot, sourceIcon);

      if (!fs.existsSync(srcPath)) {
        console.warn(
          `[withNotificationIcon] Source icon not found at ${srcPath} – skipping`
        );
        return config;
      }

      for (const density of DENSITIES) {
        const destDir = path.join(resDir, density);
        fs.mkdirSync(destDir, { recursive: true });

        const destPath = path.join(destDir, "ic_notification.png");
        fs.copyFileSync(srcPath, destPath);
      }

      console.log(
        `[withNotificationIcon] Copied ${sourceIcon} → ic_notification.png into ${DENSITIES.length} drawable buckets`
      );
      return config;
    },
  ]);
}

module.exports = withNotificationIcon;
