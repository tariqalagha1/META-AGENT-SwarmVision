import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

const resources = {
  en: {
    translation: {
      nav: {
        observe: 'Observe',
        visualize: 'Visualize',
        command: 'Command',
      },
      header: {
        title: 'SwarmVision Observability',
        global: 'Global',
        tenant: 'Tenant {{id}}',
        app: 'App {{id}}',
        pauseVisuals: 'Pause visuals',
        resumeVisuals: 'Resume visuals',
        agentEcosystem: '⬡ AGENT ECOSYSTEM',
        closeEcosystem: '✕ CLOSE ECOSYSTEM',
        reconnect: 'Reconnect',
        disconnect: 'Disconnect',
      },
      runbar: {
        placeholder: 'Enter swarm task...',
        run: 'Run Swarm',
        running: 'Running...',
      },
      viz: {
        opsView: 'OPS VIEW',
        demoView: 'DEMO VIEW',
        live: '⚡ LIVE',
        mock: '◎ MOCK',
        source: 'Data source',
      },
      status: {
        disconnected: 'Disconnected from events channel. Panels are showing the last snapshot.',
        live: 'LIVE',
        paused: 'PAUSED',
      },
    },
  },
  ar: {
    translation: {
      nav: {
        observe: 'مراقبة',
        visualize: 'تصور',
        command: 'أوامر',
      },
      header: {
        title: 'رصد SwarmVision',
        global: 'عالمي',
        tenant: 'مستأجر {{id}}',
        app: 'تطبيق {{id}}',
        pauseVisuals: 'إيقاف العرض',
        resumeVisuals: 'استئناف العرض',
        agentEcosystem: '⬡ نظام الوكلاء',
        closeEcosystem: '✕ إغلاق النظام',
        reconnect: 'إعادة الاتصال',
        disconnect: 'قطع الاتصال',
      },
      runbar: {
        placeholder: 'أدخل مهمة السرب...',
        run: 'تشغيل السرب',
        running: 'جارٍ التشغيل...',
      },
      viz: {
        opsView: 'عرض العمليات',
        demoView: 'عرض تجريبي',
        live: '⚡ مباشر',
        mock: '◎ محاكاة',
        source: 'مصدر البيانات',
      },
      status: {
        disconnected: 'انقطع الاتصال بقناة الأحداث. تعرض اللوحات آخر لقطة.',
        live: 'مباشر',
        paused: 'متوقف',
      },
    },
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
