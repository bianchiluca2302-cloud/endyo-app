import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.endyo',
  appName: 'Endyo',
  webDir: 'dist',
  server: {
    // Android WebView usa https://, iOS usa capacitor://
    androidScheme: 'https',
    hostname: 'app.endyo.it',
    // In sviluppo: punta al dev server locale (commentare in produzione)
    // url: 'http://192.168.x.x:5173',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0a0a0f',
      showSpinner: false,
    },
  },
  android: {
    // Consente immagini HTTPS da Railway
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
