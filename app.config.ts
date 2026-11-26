import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Mercadin',
  slug: 'mercadin',
  scheme: 'mercadin',
  owner: undefined,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './src/ui/assets/icon.png',
  userInterfaceStyle: 'automatic',
  // A chave `splash` de topo saiu do ExpoConfig no SDK 57, a splash agora é
  // configurada exclusivamente pelo plugin `expo-splash-screen`, mais abaixo.
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mercadin.app'
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './src/ui/assets/adaptive-icon.png',
      backgroundColor: '#000000'
    },
    package: 'com.mercadin.app'
  },
  web: {
    favicon: './src/ui/assets/favicon.png',
    bundler: 'metro'
  },
  plugins: [
    'expo-router',
    // A partir do SDK 57 estes módulos precisam ser declarados explicitamente
    // como plugins (antes eram resolvidos por autolinking sem entrada aqui).
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission:
          'O Mercadin usa a câmera para ler o QR Code do cupom fiscal e preencher a compra automaticamente.'
      }
    ],
    'expo-sharing',
    'expo-sqlite',
    'expo-status-bar',
    [
      'expo-splash-screen',
      {
        // A splash nativa existe por imposição do sistema: Android e iOS
        // mostram alguma tela enquanto o bundle JavaScript carrega, e não há
        // como suprimi-la. O que dá para fazer é torná-la invisível, deixando
        // só o fundo, igual ao da TelaAbertura, que assume em seguida. O
        // usuário percebe uma tela de abertura só, não duas.
        //
        // A imagem é um PNG 1x1 transparente, e não a ausência de imagem,
        // porque o plugin aponta `windowSplashScreenAnimatedIcon` para
        // `@drawable/splashscreen_logo` de qualquer jeito: sem arquivo, o
        // recurso não é gerado e a referência órfã quebra o build.
        //
        // As cores acompanham o esquema do sistema, que é o padrão da
        // preferência de tema do app. Quem forçar o tema oposto ao do
        // aparelho vai ver uma troca de cor no primeiro instante, não há como
        // evitar: a preferência mora no SQLite e só é lida depois do JS subir.
        backgroundColor: '#FBF8FF',
        image: './src/ui/assets/splash-vazio.png',
        imageWidth: 1,
        dark: {
          backgroundColor: '#10131B',
          image: './src/ui/assets/splash-vazio.png'
        }
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    router: {
      origin: false
    }
  }
});
