# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Google Maps and Directions API key

This app uses Google Maps for the map view and the Google Directions API to render routes. Both use the same Google Maps API key.

Setup options:

- Preferred: define an environment variable `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` before building/running the app. Expo will inline this value into the client.

Fallbacks supported by the app:

- `GOOGLE_MAPS_API_KEY` env var
- `ios.config.googleMapsApiKey` and `android.config.googleMaps.apiKey` in `app.json`
- `expo.extra.googleMapsApiKey` in `app.json`

Ensure the following Google APIs are enabled for your key:

- Maps SDK for Android
- Maps SDK for iOS
- Directions API

Tip: In production, consider using a server-side key for Directions API calls to avoid exposing secrets in the client. In this project, the same client key is used for Directions fetches to keep things simple.
