/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
    type: "widget",
    name: "JourneyWidget",
    bundleIdentifier: ".JourneyWidget",
    deploymentTarget: "16.1",
    entitlements: {
        "com.apple.security.application-groups": [
            "group.com.wayfarian.wayfarianadventures"
        ]
    },
    frameworks: [
        "ActivityKit",
        "WidgetKit",
        "SwiftUI"
    ]
};
