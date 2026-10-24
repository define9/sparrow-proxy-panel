// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-auth-utils'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    classSuffix: '',
    fallback: 'light'
  },

  runtimeConfig: {
    databaseUrl: '',
    dbPoolMax: 10,
    masterKey: '',
    public: {
      siteName: 'Sparrow Proxy',
      siteUrl: ''
    }
  },

  // workspace 依赖以 TS 源码形式引入
  build: {
    transpile: ['@sparrow/contracts']
  },

  routeRules: {
    '/': { prerender: true }
  },
  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fonts: {
    families: [
      { name: 'Public Sans', provider: 'google' }
    ]
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'zh-CN',
    locales: [
      { code: 'zh-CN', language: 'zh-CN', name: '简体中文', files: ['zh-CN.json', 'plugins.zh-CN.json'] },
      { code: 'en', language: 'en', name: 'English', files: ['en.json', 'plugins.en.json'] }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'sparrow_locale',
      redirectOn: 'root',
      alwaysRedirect: false
    }
  }
})
