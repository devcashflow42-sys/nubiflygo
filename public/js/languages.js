'use strict';
/* languages.js — Textos centralizados por idioma (i18n).
 *
 * Estructura:
 *   STRINGS[<idioma>] = { app, common, nav, dashboard, ..., login, landing }
 *
 * - Español (es) es el idioma base y está completo (app + landing).
 * - Los demás idiomas traen, como mínimo, la sección `landing` (la página
 *   principal main.html). Cualquier texto que falte cae automáticamente al
 *   español gracias a la función t() (fallback a DEFAULT_LANG).
 *
 * Para traducir TAMBIÉN la app (home.html), copia las secciones app/common/
 * nav/dashboard/... de `es` dentro del idioma y tradúcelas. No hace falta
 * tocar el HTML: todo se resuelve por clave con data-i18n y t().
 */

/* Idiomas disponibles (orden del selector). Añade uno copiando la forma de es. */
const LANGS = [
  { code: 'es', name: 'Español',    flag: '🇲🇽' },
  { code: 'en', name: 'English',    flag: '🇺🇸' },
  { code: 'pt', name: 'Português',  flag: '🇧🇷' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'zh', name: '中文',        flag: '🇨🇳' },
  { code: 'ja', name: '日本語',       flag: '🇯🇵' }
];

const STRINGS = {
  es: {
    app: {
      title: 'NubiFlyGo',
      brand: 'NubiFlyGo',
      userName: 'Sophia Lane',
      userEmail: 'sophia@nubiflygo.app'
    },
    common: {
      cancel: 'Cancelar',
      close: 'Cerrar',
      confirm: 'Confirmar',
      back: 'Volver',
      share: 'Compartir',
      more: 'Más',
      delete: 'Eliminar',
      copy: 'Copiar',
      change: 'Cambiar',
      view: 'Ver',
      viewAll: 'Ver todos',
      viewAllFeminine: 'Ver todas',
      untitled: 'Sin titulo',
      now: 'ahora',
      linkCopied: 'Enlace copiado al portapapeles',
      openMenu: 'Abrir menú',
      collapseMenu: 'Colapsar menú',
      expandMenu: 'Expandir menú',
      changeTheme: 'Cambiar tema'
    },
    nav: {
      dashboard: 'Inicio',
      projects: 'Proyectos',
      notes: 'Notas',
      files: 'Archivos',
      reports: 'Informes',
      apiKeys: 'API keys',
      automation: 'Automatización'
    },
    dashboard: {
      welcome: 'Bienvenida, Sophia',
      subtitle: 'Un resumen de tu espacio de trabajo.',
      tiles: {
        projects: 'Proyectos',
        activeGroups: 'Grupos activos',
        documents: 'Documentos',
        allProjects: 'En todos los proyectos',
        files: 'Archivos',
        uploaded: 'Subidos',
        notes: 'Notas',
        saved: 'Guardadas',
        apiKeys: 'API keys',
        active: 'Activas'
      },
      recentProjects: 'Proyectos recientes',
      recentNotes: 'Notas recientes',
      newProject: 'Nuevo proyecto',
      createProject: 'Crear proyecto',
      createNote: 'Crear nota',
      emptyProjectsTitle: 'Aún no hay proyectos',
      emptyProjectsText: 'Crea un proyecto para empezar a organizar tus documentos y archivos.',
      emptyNotesTitle: 'Aún no hay notas',
      emptyNotesText: 'Captura ideas, resúmenes o apuntes para después analizarlos.'
    },
    sidebar: {
      newProject: 'Nuevo proyecto',
      newNote: 'Nueva nota'
    },
    info: {
      title: 'Información',
      documents: 'Documentos',
      storage: 'Almacenamiento',
      summary: 'Resumen',
      projects: 'Proyectos',
      notes: 'Notas',
      apiKeys: 'API keys',
      recentActivity: 'Actividad reciente',
      noActivity: 'Sin actividad todavía.',
      fileUnit: 'archivo',
      filesUnit: 'archivos'
    },
    routes: {
      edit: 'Editar',
      newProject: 'Nuevo proyecto'
    },
    automation: {
      title: 'Automatización',
      subtitle: 'Reglas para automatizar tareas repetitivas.',
      soonTitle: 'Próximamente',
      soonText: 'Pronto podrás configurar flujos: ejecutar algo cuando se cree un documento, enviar notificaciones, programar informes. Trabajamos en ello.'
    },
    login: {
      backHome: 'Volver al inicio',
      panelSoft: 'Tu espacio de trabajo.',
      panelTitle: 'Publica y comparte tus archivos.',
      f1Title: 'Publica en segundos',
      f1Text: 'Sube tus documentos y genera un enlace listo para compartir.',
      f2Title: 'Todo por proyectos',
      f2Text: 'Reúne archivos, notas e informes en un mismo lugar y encuéntralo al instante.',
      f3Title: 'Control y seguridad',
      f3Text: 'Tú decides qué es privado y qué compartes; tus archivos siempre protegidos.',
      footPrivacy: 'Privacidad',
      footTerms: 'Términos',
      footSupport: 'Soporte',
      titleLogin: 'Inicia sesión o regístrate',
      titleRegister: 'Crea tu cuenta',
      leadLogin: 'Usa tu correo o elige una de las opciones para continuar.',
      leadRegister: 'Regístrate con tu correo o con una de las opciones.',
      google: 'Continuar con Google',
      github: 'Continuar con GitHub',
      guest: 'Continuar como invitado',
      or: 'O',
      nameLabel: 'Nombre completo',
      namePlaceholder: 'Tu nombre',
      emailLabel: 'Correo electrónico',
      emailPlaceholder: 'ejemplo@correo.com',
      passwordLabel: 'Contraseña',
      showPassword: 'Mostrar contraseña',
      hidePassword: 'Ocultar contraseña',
      forgot: '¿Olvidaste tu contraseña?',
      termsText: 'Acepto los',
      termsLink: 'términos y condiciones',
      submitLogin: 'Iniciar sesión',
      submitRegister: 'Crear cuenta',
      loading: 'Cargando',
      swapTextLogin: '¿Aún no tienes cuenta?',
      swapTextRegister: '¿Ya tienes cuenta?',
      swapBtnLogin: 'Regístrate',
      swapBtnRegister: 'Inicia sesión',
      copyright: '© {year} NubiFlyGo · Todos los derechos reservados',
      docTitleLogin: 'NubiFlyGo · Iniciar sesión',
      docTitleRegister: 'NubiFlyGo · Crear cuenta',
      errName: 'Por favor, escribe tu nombre.',
      errEmail: 'Por favor, revisa tu correo electrónico.',
      errPass: 'La contraseña debe tener al menos 8 caracteres.',
      errTerms: 'Debes aceptar los términos para continuar.',
      toastLoggedIn: 'Sesión iniciada',
      toastRegistered: 'Cuenta creada',
      toastGuest: 'Entraste como invitado',
      toastConnecting: 'Conectando con {name}…',
      toastProviderError: 'No se pudo continuar con {name}',
      toastReset: 'Te enviamos un enlace a {email}',
      toastGenericError: 'No se pudo completar. Intenta de nuevo.'
    },
    landing: {
      docTitle: 'NubiFlyGo · Tu espacio de trabajo',
      nav: { features: 'Funciones', api: 'API', projects: 'Proyectos', reviews: 'Opiniones', pricing: 'Precios', faq: 'FAQ', login: 'Iniciar sesión', signup: 'Registrarse' },
      langLabel: 'Idioma',
      hero: {
        badgeNew: 'Nuevo',
        badgeText: 'Tu espacio de trabajo, en un solo lugar',
        lead: 'NubiFlyGo reúne tus proyectos, notas e informes en una sola interfaz. Sube archivos de cualquier tipo, publícalos dentro de cada proyecto y conecta tus propias API keys para automatizar lo demás.',
        ctaStart: 'Empezar gratis',
        ctaHow: 'Ver cómo funciona',
        note: 'Sin tarjeta · Tus llaves se quedan contigo · 2 500+ espacios creados'
      },
      typed: [
        'Organiza proyectos y documentos.',
        'Tu espacio de trabajo, en un lugar.',
        'Sube archivos en segundos.',
        'Tus API keys, seguras por proyecto.',
        'Notas, informes y archivos juntos.',
        'Publica documentos en tus proyectos.',
        'Tus llaves se quedan contigo.',
        'Trabaja desde el navegador.',
        'Automatiza con tus propias llaves.',
        'Todo ordenado y a la mano.',
        'Empieza gratis, sin tarjeta.',
        'Un espacio limpio por proyecto.'
      ],
      strip: { title: 'Conecta tus propias llaves de los servicios que ya usas' },
      features: {
        eyebrow: 'Funciones',
        title: 'Todo lo que necesitas para trabajar con tus archivos',
        lead: 'Cada proyecto es un espacio propio donde guardas, publicas y conectas lo que necesitas.',
        f1Title: 'Proyectos organizados', f1Text: 'Crea un espacio por cada proyecto y mantén archivos, notas e informes separados y fáciles de encontrar.', f1Tags: ['carpetas', 'etiquetas', 'búsqueda'],
        f2Title: 'Documentos y archivos', f2Text: 'Sube y publica archivos de varios tipos dentro de cada proyecto: PDF, Word, imágenes, hojas de cálculo y más.', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'Tus API keys', f3Text: 'Guarda y usa tus propias llaves de API por proyecto. Se quedan contigo y nunca se comparten.', f3Tags: ['por proyecto', 'cifradas'],
        f4Title: 'Notas, informes y automatización', f4Text: 'Escribe notas, genera informes y automatiza tareas repetitivas usando los archivos y llaves de cada espacio.', f4Tags: ['notas', 'informes', 'automatización']
      },
      api: {
        eyebrow: 'API',
        title: 'Conéctate por API en minutos',
        lead: 'Automatiza tu flujo con tu propia API key: crea proyectos, sube archivos y consulta tus documentos directamente desde tu código.',
        li1: 'Autentícate con una API key única por proyecto.',
        li2: 'SDK oficial para JavaScript y Python, o peticiones directas con cURL.',
        li3: 'Respuestas en JSON con estados claros y predecibles.',
        respLabel: 'Respuesta', copy: 'Copiar', copied: 'Copiado'
      },
      why: {
        eyebrow: 'Por qué NubiFlyGo',
        title: 'Pensado para que tú tengas el control',
        i1Title: 'Un solo lugar', i1Text: 'Proyectos, documentos y llaves juntos, sin saltar entre herramientas.',
        i2Title: 'Tus llaves, tus datos', i2Text: 'Conectas tus propias API keys; nada sale de tu espacio sin que tú lo decidas.',
        i3Title: 'Cualquier archivo', i3Text: 'Publica documentos de varios tipos dentro de cada proyecto sin límites raros.',
        i4Title: 'Ligero y rápido', i4Text: 'Interfaz limpia en HTML/CSS/JS, sin instalaciones ni procesos pesados.'
      },
      reviews: {
        eyebrow: 'Opiniones',
        title: 'Lo que dicen quienes la usan',
        desc: 'Deja que la experiencia real convenza por ti.',
        note: '* Opiniones de ejemplo para el boceto — se reemplazarán por reseñas reales.'
      },
      pricing: {
        eyebrow: 'Precios',
        title: 'Un plan para cada forma de trabajar',
        lead: 'Empieza gratis y crece cuando lo necesites. Sin contratos ni sorpresas.',
        popular: 'Más popular',
        perMonth: 'por mes', forever: 'para siempre', billedMonthly: 'facturación mensual', according: 'según', yourUse: 'tu uso',
        free:  { name: 'Gratis', desc: 'Para empezar y probar sin costo.', cta: 'Empezar gratis', feats: ['2 GB de almacenamiento', 'Hasta 3 proyectos', 'Documentos de cualquier tipo', '1 API key'], more: '¿Necesitas más espacio?' },
        pro:   { name: 'Pro', desc: 'Para uso personal intensivo.', cta: 'Elegir Pro', feats: ['100 GB de almacenamiento', 'Proyectos ilimitados', '5 API keys', 'Automatizaciones básicas', 'Soporte por correo'], more: '¿Necesitas más límites?' },
        mega:  { name: 'Mega', desc: 'Para quienes manejan mucho archivo.', cta: 'Elegir Mega', feats: ['1 TB de almacenamiento', 'Proyectos ilimitados', '20 API keys', 'Automatizaciones avanzadas', 'Historial de versiones'], more: '¿Necesitas más límites?' },
        sup:   { name: 'Super', desc: 'Máximo rendimiento y espacio.', cta: 'Elegir Super', feats: ['5 TB de almacenamiento', 'API keys ilimitadas', 'Prioridad en la API', 'Soporte prioritario'], more: '¿Necesitas más límites?' },
        ent:   { name: 'Empresa', desc: 'Para equipos y organizaciones.', cta: 'Contactar', custom: 'A medida', feats: ['Almacenamiento a medida', 'Usuarios y permisos', 'Inicio de sesión SSO', 'Soporte dedicado'], more: 'Habla con ventas' },
        note: '* Precios de ejemplo. Cambia o cancela cuando quieras.'
      },
      faq: {
        eyebrow: 'Preguntas frecuentes',
        title: 'Resuelve tus dudas antes de empezar',
        q1: '¿Qué tipos de archivos puedo subir?', a1: 'Puedes publicar documentos de varios tipos dentro de cada proyecto: PDF, Word, imágenes, hojas de cálculo y archivos de texto, entre otros.',
        q2: '¿Dónde se guardan mis API keys?', a2: 'Tus llaves se guardan por proyecto y se mantienen contigo. Las usas dentro de tu espacio y no se comparten con terceros.',
        q3: '¿Puedo tener varios proyectos a la vez?', a3: 'Sí. Cada proyecto es un espacio independiente con sus propios archivos, notas, informes y llaves.',
        q4: '¿Necesito instalar algo?', a4: 'No. NubiFlyGo funciona en el navegador. Abres tu espacio y empiezas a trabajar enseguida.'
      },
      cta: { title: 'Crea tu primer espacio hoy', text: 'Reúne proyectos, documentos y llaves en una interfaz que trabaja a tu ritmo.', button: 'Empezar ahora' },
      footer: {
        tagline: 'Tu espacio para proyectos, documentos y API keys, todo en un mismo lugar.',
        newsPlaceholder: 'tu@correo.com', newsBtn: 'Avísame', newsMsg: '¡Listo! Te avisaremos en {email}',
        colProduct: 'Producto', colResources: 'Recursos', colLegal: 'Legal',
        linkFeatures: 'Funciones', linkProjects: 'Proyectos', linkReviews: 'Opiniones', linkFaq: 'FAQ',
        linkStart: 'Guía de inicio', linkDocs: 'Documentación', linkNews: 'Novedades',
        linkTerms: 'Términos', linkPrivacy: 'Privacidad', linkContact: 'Contacto',
        rights: '© {year} NubiFlyGo. Todos los derechos reservados.', madeWith: 'Hecho con HTML · CSS · JS'
      }
    }
  },

  en: {
    landing: {
      docTitle: 'NubiFlyGo · Your workspace',
      nav: { features: 'Features', api: 'API', projects: 'Projects', reviews: 'Reviews', pricing: 'Pricing', faq: 'FAQ', login: 'Log in', signup: 'Sign up' },
      langLabel: 'Language',
      hero: {
        badgeNew: 'New',
        badgeText: 'Your workspace, all in one place',
        lead: 'NubiFlyGo brings your projects, notes and reports together in a single interface. Upload files of any kind, publish them inside each project and connect your own API keys to automate the rest.',
        ctaStart: 'Start free',
        ctaHow: 'See how it works',
        note: 'No card · Your keys stay with you · 2,500+ spaces created'
      },
      typed: [
        'Organize projects and documents.',
        'Your workspace, in one place.',
        'Upload files in seconds.',
        'Your API keys, safe per project.',
        'Notes, reports and files together.',
        'Publish documents in your projects.',
        'Your keys stay with you.',
        'Work right from the browser.',
        'Automate with your own keys.',
        'Everything tidy and within reach.',
        'Start free, no card.',
        'A clean space for every project.'
      ],
      strip: { title: 'Connect your own keys for the services you already use' },
      features: {
        eyebrow: 'Features',
        title: 'Everything you need to work with your files',
        lead: 'Each project is its own space where you store, publish and connect what you need.',
        f1Title: 'Organized projects', f1Text: 'Create a space for each project and keep files, notes and reports separate and easy to find.', f1Tags: ['folders', 'tags', 'search'],
        f2Title: 'Documents and files', f2Text: 'Upload and publish many file types inside each project: PDF, Word, images, spreadsheets and more.', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'Your API keys', f3Text: 'Store and use your own API keys per project. They stay with you and are never shared.', f3Tags: ['per project', 'encrypted'],
        f4Title: 'Notes, reports and automation', f4Text: 'Write notes, generate reports and automate repetitive tasks using each space’s files and keys.', f4Tags: ['notes', 'reports', 'automation']
      },
      api: {
        eyebrow: 'API',
        title: 'Connect via API in minutes',
        lead: 'Automate your workflow with your own API key: create projects, upload files and query your documents straight from your code.',
        li1: 'Authenticate with a unique API key per project.',
        li2: 'Official SDK for JavaScript and Python, or direct requests with cURL.',
        li3: 'JSON responses with clear, predictable statuses.',
        respLabel: 'Response', copy: 'Copy', copied: 'Copied'
      },
      why: {
        eyebrow: 'Why NubiFlyGo',
        title: 'Built so you stay in control',
        i1Title: 'A single place', i1Text: 'Projects, documents and keys together, without jumping between tools.',
        i2Title: 'Your keys, your data', i2Text: 'You connect your own API keys; nothing leaves your space unless you decide.',
        i3Title: 'Any file', i3Text: 'Publish many document types inside each project with no odd limits.',
        i4Title: 'Light and fast', i4Text: 'A clean HTML/CSS/JS interface, with no installs or heavy processes.'
      },
      reviews: {
        eyebrow: 'Reviews',
        title: 'What people who use it say',
        desc: 'Let the real experience convince you.',
        note: '* Sample reviews for the mockup — to be replaced with real ones.'
      },
      pricing: {
        eyebrow: 'Pricing',
        title: 'A plan for every way of working',
        lead: 'Start free and grow when you need to. No contracts, no surprises.',
        popular: 'Most popular',
        perMonth: 'per month', forever: 'forever', billedMonthly: 'billed monthly', according: 'based on', yourUse: 'your usage',
        free:  { name: 'Free', desc: 'To get started and try at no cost.', cta: 'Start free', feats: ['2 GB storage', 'Up to 3 projects', 'Documents of any kind', '1 API key'], more: 'Need more space?' },
        pro:   { name: 'Pro', desc: 'For heavy personal use.', cta: 'Choose Pro', feats: ['100 GB storage', 'Unlimited projects', '5 API keys', 'Basic automations', 'Email support'], more: 'Need higher limits?' },
        mega:  { name: 'Mega', desc: 'For those who handle lots of files.', cta: 'Choose Mega', feats: ['1 TB storage', 'Unlimited projects', '20 API keys', 'Advanced automations', 'Version history'], more: 'Need higher limits?' },
        sup:   { name: 'Super', desc: 'Maximum performance and space.', cta: 'Choose Super', feats: ['5 TB storage', 'Unlimited API keys', 'API priority', 'Priority support'], more: 'Need higher limits?' },
        ent:   { name: 'Enterprise', desc: 'For teams and organizations.', cta: 'Contact us', custom: 'Custom', feats: ['Custom storage', 'Users and permissions', 'SSO sign-in', 'Dedicated support'], more: 'Talk to sales' },
        note: '* Sample prices. Change or cancel anytime.'
      },
      faq: {
        eyebrow: 'Frequently asked questions',
        title: 'Clear up your doubts before you start',
        q1: 'What file types can I upload?', a1: 'You can publish many document types inside each project: PDF, Word, images, spreadsheets and text files, among others.',
        q2: 'Where are my API keys stored?', a2: 'Your keys are stored per project and stay with you. You use them inside your space and they are not shared with third parties.',
        q3: 'Can I have several projects at once?', a3: 'Yes. Each project is an independent space with its own files, notes, reports and keys.',
        q4: 'Do I need to install anything?', a4: 'No. NubiFlyGo runs in the browser. Open your space and start working right away.'
      },
      cta: { title: 'Create your first space today', text: 'Bring projects, documents and keys together in an interface that works at your pace.', button: 'Start now' },
      footer: {
        tagline: 'Your space for projects, documents and API keys, all in one place.',
        newsPlaceholder: 'you@email.com', newsBtn: 'Notify me', newsMsg: 'Done! We’ll let you know at {email}',
        colProduct: 'Product', colResources: 'Resources', colLegal: 'Legal',
        linkFeatures: 'Features', linkProjects: 'Projects', linkReviews: 'Reviews', linkFaq: 'FAQ',
        linkStart: 'Getting started', linkDocs: 'Documentation', linkNews: 'What’s new',
        linkTerms: 'Terms', linkPrivacy: 'Privacy', linkContact: 'Contact',
        rights: '© {year} NubiFlyGo. All rights reserved.', madeWith: 'Made with HTML · CSS · JS'
      }
    }
  },

  pt: {
    landing: {
      docTitle: 'NubiFlyGo · O seu espaço de trabalho',
      nav: { features: 'Recursos', api: 'API', projects: 'Projetos', reviews: 'Opiniões', pricing: 'Preços', faq: 'FAQ', login: 'Entrar', signup: 'Criar conta' },
      langLabel: 'Idioma',
      hero: {
        badgeNew: 'Novo',
        badgeText: 'O seu espaço de trabalho, num só lugar',
        lead: 'O NubiFlyGo reúne os seus projetos, notas e relatórios numa única interface. Envie arquivos de qualquer tipo, publique-os dentro de cada projeto e conecte as suas próprias API keys para automatizar o resto.',
        ctaStart: 'Começar grátis',
        ctaHow: 'Ver como funciona',
        note: 'Sem cartão · As suas chaves ficam com você · 2.500+ espaços criados'
      },
      typed: [
        'Organize projetos e documentos.',
        'O seu espaço de trabalho, num lugar.',
        'Envie arquivos em segundos.',
        'As suas API keys, seguras por projeto.',
        'Notas, relatórios e arquivos juntos.',
        'Publique documentos nos seus projetos.',
        'As suas chaves ficam com você.',
        'Trabalhe pelo navegador.',
        'Automatize com as suas próprias chaves.',
        'Tudo organizado e à mão.',
        'Comece grátis, sem cartão.',
        'Um espaço limpo por projeto.'
      ],
      strip: { title: 'Conecte as suas próprias chaves dos serviços que já usa' },
      features: {
        eyebrow: 'Recursos',
        title: 'Tudo o que precisa para trabalhar com os seus arquivos',
        lead: 'Cada projeto é um espaço próprio onde você guarda, publica e conecta o que precisa.',
        f1Title: 'Projetos organizados', f1Text: 'Crie um espaço para cada projeto e mantenha arquivos, notas e relatórios separados e fáceis de encontrar.', f1Tags: ['pastas', 'etiquetas', 'busca'],
        f2Title: 'Documentos e arquivos', f2Text: 'Envie e publique vários tipos de arquivo dentro de cada projeto: PDF, Word, imagens, planilhas e mais.', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'As suas API keys', f3Text: 'Guarde e use as suas próprias chaves de API por projeto. Ficam com você e nunca são compartilhadas.', f3Tags: ['por projeto', 'criptografadas'],
        f4Title: 'Notas, relatórios e automação', f4Text: 'Escreva notas, gere relatórios e automatize tarefas repetitivas usando os arquivos e chaves de cada espaço.', f4Tags: ['notas', 'relatórios', 'automação']
      },
      api: {
        eyebrow: 'API',
        title: 'Conecte-se por API em minutos',
        lead: 'Automatize o seu fluxo com a sua própria API key: crie projetos, envie arquivos e consulte os seus documentos direto do seu código.',
        li1: 'Autentique-se com uma API key única por projeto.',
        li2: 'SDK oficial para JavaScript e Python, ou requisições diretas com cURL.',
        li3: 'Respostas em JSON com estados claros e previsíveis.',
        respLabel: 'Resposta', copy: 'Copiar', copied: 'Copiado'
      },
      why: {
        eyebrow: 'Por que NubiFlyGo',
        title: 'Pensado para que você tenha o controle',
        i1Title: 'Um só lugar', i1Text: 'Projetos, documentos e chaves juntos, sem pular entre ferramentas.',
        i2Title: 'As suas chaves, os seus dados', i2Text: 'Você conecta as suas próprias API keys; nada sai do seu espaço sem a sua decisão.',
        i3Title: 'Qualquer arquivo', i3Text: 'Publique vários tipos de documento dentro de cada projeto sem limites estranhos.',
        i4Title: 'Leve e rápido', i4Text: 'Interface limpa em HTML/CSS/JS, sem instalações nem processos pesados.'
      },
      reviews: {
        eyebrow: 'Opiniões',
        title: 'O que dizem quem usa',
        desc: 'Deixe a experiência real convencer por você.',
        note: '* Opiniões de exemplo para o rascunho — serão substituídas por avaliações reais.'
      },
      pricing: {
        eyebrow: 'Preços',
        title: 'Um plano para cada forma de trabalhar',
        lead: 'Comece grátis e cresça quando precisar. Sem contratos nem surpresas.',
        popular: 'Mais popular',
        perMonth: 'por mês', forever: 'para sempre', billedMonthly: 'cobrança mensal', according: 'conforme', yourUse: 'o seu uso',
        free:  { name: 'Grátis', desc: 'Para começar e testar sem custo.', cta: 'Começar grátis', feats: ['2 GB de armazenamento', 'Até 3 projetos', 'Documentos de qualquer tipo', '1 API key'], more: 'Precisa de mais espaço?' },
        pro:   { name: 'Pro', desc: 'Para uso pessoal intenso.', cta: 'Escolher Pro', feats: ['100 GB de armazenamento', 'Projetos ilimitados', '5 API keys', 'Automações básicas', 'Suporte por e-mail'], more: 'Precisa de mais limites?' },
        mega:  { name: 'Mega', desc: 'Para quem lida com muitos arquivos.', cta: 'Escolher Mega', feats: ['1 TB de armazenamento', 'Projetos ilimitados', '20 API keys', 'Automações avançadas', 'Histórico de versões'], more: 'Precisa de mais limites?' },
        sup:   { name: 'Super', desc: 'Máximo desempenho e espaço.', cta: 'Escolher Super', feats: ['5 TB de armazenamento', 'API keys ilimitadas', 'Prioridade na API', 'Suporte prioritário'], more: 'Precisa de mais limites?' },
        ent:   { name: 'Empresa', desc: 'Para equipes e organizações.', cta: 'Falar conosco', custom: 'Sob medida', feats: ['Armazenamento sob medida', 'Usuários e permissões', 'Login SSO', 'Suporte dedicado'], more: 'Falar com vendas' },
        note: '* Preços de exemplo. Altere ou cancele quando quiser.'
      },
      faq: {
        eyebrow: 'Perguntas frequentes',
        title: 'Tire as suas dúvidas antes de começar',
        q1: 'Que tipos de arquivo posso enviar?', a1: 'Você pode publicar vários tipos de documento dentro de cada projeto: PDF, Word, imagens, planilhas e arquivos de texto, entre outros.',
        q2: 'Onde ficam as minhas API keys?', a2: 'As suas chaves ficam guardadas por projeto e permanecem com você. Você as usa dentro do seu espaço e não são compartilhadas com terceiros.',
        q3: 'Posso ter vários projetos ao mesmo tempo?', a3: 'Sim. Cada projeto é um espaço independente com os seus próprios arquivos, notas, relatórios e chaves.',
        q4: 'Preciso instalar algo?', a4: 'Não. O NubiFlyGo funciona no navegador. Abra o seu espaço e comece a trabalhar na hora.'
      },
      cta: { title: 'Crie o seu primeiro espaço hoje', text: 'Reúna projetos, documentos e chaves numa interface que trabalha no seu ritmo.', button: 'Começar agora' },
      footer: {
        tagline: 'O seu espaço para projetos, documentos e API keys, tudo num mesmo lugar.',
        newsPlaceholder: 'voce@email.com', newsBtn: 'Avise-me', newsMsg: 'Pronto! Avisaremos você em {email}',
        colProduct: 'Produto', colResources: 'Recursos', colLegal: 'Legal',
        linkFeatures: 'Recursos', linkProjects: 'Projetos', linkReviews: 'Opiniões', linkFaq: 'FAQ',
        linkStart: 'Guia de início', linkDocs: 'Documentação', linkNews: 'Novidades',
        linkTerms: 'Termos', linkPrivacy: 'Privacidade', linkContact: 'Contato',
        rights: '© {year} NubiFlyGo. Todos os direitos reservados.', madeWith: 'Feito com HTML · CSS · JS'
      }
    }
  },

  fr: {
    landing: {
      docTitle: 'NubiFlyGo · Votre espace de travail',
      nav: { features: 'Fonctions', api: 'API', projects: 'Projets', reviews: 'Avis', pricing: 'Tarifs', faq: 'FAQ', login: 'Se connecter', signup: 'S’inscrire' },
      langLabel: 'Langue',
      hero: {
        badgeNew: 'Nouveau',
        badgeText: 'Votre espace de travail, en un seul endroit',
        lead: 'NubiFlyGo réunit vos projets, notes et rapports dans une seule interface. Importez des fichiers de tout type, publiez-les dans chaque projet et connectez vos propres clés API pour automatiser le reste.',
        ctaStart: 'Commencer gratuitement',
        ctaHow: 'Voir comment ça marche',
        note: 'Sans carte · Vos clés restent chez vous · 2 500+ espaces créés'
      },
      typed: [
        'Organisez projets et documents.',
        'Votre espace de travail, en un lieu.',
        'Importez des fichiers en quelques secondes.',
        'Vos clés API, sûres par projet.',
        'Notes, rapports et fichiers réunis.',
        'Publiez des documents dans vos projets.',
        'Vos clés restent chez vous.',
        'Travaillez depuis le navigateur.',
        'Automatisez avec vos propres clés.',
        'Tout bien rangé et à portée.',
        'Commencez gratuitement, sans carte.',
        'Un espace net par projet.'
      ],
      strip: { title: 'Connectez vos propres clés des services que vous utilisez déjà' },
      features: {
        eyebrow: 'Fonctions',
        title: 'Tout ce qu’il faut pour travailler avec vos fichiers',
        lead: 'Chaque projet est un espace à lui où vous stockez, publiez et connectez ce dont vous avez besoin.',
        f1Title: 'Projets organisés', f1Text: 'Créez un espace par projet et gardez fichiers, notes et rapports séparés et faciles à retrouver.', f1Tags: ['dossiers', 'étiquettes', 'recherche'],
        f2Title: 'Documents et fichiers', f2Text: 'Importez et publiez plusieurs types de fichiers dans chaque projet : PDF, Word, images, tableurs et plus.', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'Vos clés API', f3Text: 'Stockez et utilisez vos propres clés API par projet. Elles restent chez vous et ne sont jamais partagées.', f3Tags: ['par projet', 'chiffrées'],
        f4Title: 'Notes, rapports et automatisation', f4Text: 'Écrivez des notes, générez des rapports et automatisez les tâches répétitives avec les fichiers et clés de chaque espace.', f4Tags: ['notes', 'rapports', 'automatisation']
      },
      api: {
        eyebrow: 'API',
        title: 'Connectez-vous par API en quelques minutes',
        lead: 'Automatisez votre flux avec votre propre clé API : créez des projets, importez des fichiers et interrogez vos documents directement depuis votre code.',
        li1: 'Authentifiez-vous avec une clé API unique par projet.',
        li2: 'SDK officiel pour JavaScript et Python, ou requêtes directes en cURL.',
        li3: 'Réponses en JSON avec des états clairs et prévisibles.',
        respLabel: 'Réponse', copy: 'Copier', copied: 'Copié'
      },
      why: {
        eyebrow: 'Pourquoi NubiFlyGo',
        title: 'Conçu pour que vous gardiez le contrôle',
        i1Title: 'Un seul endroit', i1Text: 'Projets, documents et clés réunis, sans sauter d’un outil à l’autre.',
        i2Title: 'Vos clés, vos données', i2Text: 'Vous connectez vos propres clés API ; rien ne sort de votre espace sans votre accord.',
        i3Title: 'N’importe quel fichier', i3Text: 'Publiez plusieurs types de documents dans chaque projet sans limites bizarres.',
        i4Title: 'Léger et rapide', i4Text: 'Interface nette en HTML/CSS/JS, sans installations ni processus lourds.'
      },
      reviews: {
        eyebrow: 'Avis',
        title: 'Ce qu’en disent les utilisateurs',
        desc: 'Laissez l’expérience réelle vous convaincre.',
        note: '* Avis d’exemple pour la maquette — à remplacer par de vrais avis.'
      },
      pricing: {
        eyebrow: 'Tarifs',
        title: 'Un forfait pour chaque façon de travailler',
        lead: 'Commencez gratuitement et évoluez quand il le faut. Sans contrat ni surprise.',
        popular: 'Le plus populaire',
        perMonth: 'par mois', forever: 'pour toujours', billedMonthly: 'facturation mensuelle', according: 'selon', yourUse: 'votre usage',
        free:  { name: 'Gratuit', desc: 'Pour démarrer et essayer sans frais.', cta: 'Commencer gratuitement', feats: ['2 Go de stockage', 'Jusqu’à 3 projets', 'Documents de tout type', '1 clé API'], more: 'Besoin de plus d’espace ?' },
        pro:   { name: 'Pro', desc: 'Pour un usage personnel intensif.', cta: 'Choisir Pro', feats: ['100 Go de stockage', 'Projets illimités', '5 clés API', 'Automatisations de base', 'Support par e-mail'], more: 'Besoin de plus de limites ?' },
        mega:  { name: 'Mega', desc: 'Pour ceux qui gèrent beaucoup de fichiers.', cta: 'Choisir Mega', feats: ['1 To de stockage', 'Projets illimités', '20 clés API', 'Automatisations avancées', 'Historique des versions'], more: 'Besoin de plus de limites ?' },
        sup:   { name: 'Super', desc: 'Performance et espace au maximum.', cta: 'Choisir Super', feats: ['5 To de stockage', 'Clés API illimitées', 'Priorité sur l’API', 'Support prioritaire'], more: 'Besoin de plus de limites ?' },
        ent:   { name: 'Entreprise', desc: 'Pour les équipes et les organisations.', cta: 'Nous contacter', custom: 'Sur mesure', feats: ['Stockage sur mesure', 'Utilisateurs et permissions', 'Connexion SSO', 'Support dédié'], more: 'Parler aux ventes' },
        note: '* Tarifs d’exemple. Changez ou annulez quand vous voulez.'
      },
      faq: {
        eyebrow: 'Questions fréquentes',
        title: 'Levez vos doutes avant de commencer',
        q1: 'Quels types de fichiers puis-je importer ?', a1: 'Vous pouvez publier plusieurs types de documents dans chaque projet : PDF, Word, images, tableurs et fichiers texte, entre autres.',
        q2: 'Où sont stockées mes clés API ?', a2: 'Vos clés sont stockées par projet et restent chez vous. Vous les utilisez dans votre espace et elles ne sont pas partagées avec des tiers.',
        q3: 'Puis-je avoir plusieurs projets à la fois ?', a3: 'Oui. Chaque projet est un espace indépendant avec ses propres fichiers, notes, rapports et clés.',
        q4: 'Dois-je installer quelque chose ?', a4: 'Non. NubiFlyGo fonctionne dans le navigateur. Ouvrez votre espace et commencez à travailler tout de suite.'
      },
      cta: { title: 'Créez votre premier espace aujourd’hui', text: 'Réunissez projets, documents et clés dans une interface qui suit votre rythme.', button: 'Commencer maintenant' },
      footer: {
        tagline: 'Votre espace pour projets, documents et clés API, le tout au même endroit.',
        newsPlaceholder: 'vous@email.com', newsBtn: 'Prévenez-moi', newsMsg: 'C’est fait ! Nous vous préviendrons à {email}',
        colProduct: 'Produit', colResources: 'Ressources', colLegal: 'Légal',
        linkFeatures: 'Fonctions', linkProjects: 'Projets', linkReviews: 'Avis', linkFaq: 'FAQ',
        linkStart: 'Guide de démarrage', linkDocs: 'Documentation', linkNews: 'Nouveautés',
        linkTerms: 'Conditions', linkPrivacy: 'Confidentialité', linkContact: 'Contact',
        rights: '© {year} NubiFlyGo. Tous droits réservés.', madeWith: 'Fait avec HTML · CSS · JS'
      }
    }
  },

  de: {
    landing: {
      docTitle: 'NubiFlyGo · Dein Arbeitsbereich',
      nav: { features: 'Funktionen', api: 'API', projects: 'Projekte', reviews: 'Bewertungen', pricing: 'Preise', faq: 'FAQ', login: 'Anmelden', signup: 'Registrieren' },
      langLabel: 'Sprache',
      hero: {
        badgeNew: 'Neu',
        badgeText: 'Dein Arbeitsbereich, alles an einem Ort',
        lead: 'NubiFlyGo vereint deine Projekte, Notizen und Berichte in einer einzigen Oberfläche. Lade Dateien jeder Art hoch, veröffentliche sie in jedem Projekt und verbinde deine eigenen API-Keys, um den Rest zu automatisieren.',
        ctaStart: 'Kostenlos starten',
        ctaHow: 'So funktioniert’s',
        note: 'Keine Karte · Deine Keys bleiben bei dir · 2.500+ erstellte Bereiche'
      },
      typed: [
        'Projekte und Dokumente organisieren.',
        'Dein Arbeitsbereich, an einem Ort.',
        'Dateien in Sekunden hochladen.',
        'Deine API-Keys, sicher pro Projekt.',
        'Notizen, Berichte und Dateien zusammen.',
        'Dokumente in deinen Projekten veröffentlichen.',
        'Deine Keys bleiben bei dir.',
        'Arbeite direkt im Browser.',
        'Automatisiere mit eigenen Keys.',
        'Alles ordentlich und griffbereit.',
        'Kostenlos starten, ohne Karte.',
        'Ein sauberer Bereich pro Projekt.'
      ],
      strip: { title: 'Verbinde deine eigenen Keys der Dienste, die du schon nutzt' },
      features: {
        eyebrow: 'Funktionen',
        title: 'Alles, was du für die Arbeit mit deinen Dateien brauchst',
        lead: 'Jedes Projekt ist ein eigener Bereich, in dem du speicherst, veröffentlichst und verbindest, was du brauchst.',
        f1Title: 'Organisierte Projekte', f1Text: 'Erstelle einen Bereich pro Projekt und halte Dateien, Notizen und Berichte getrennt und leicht auffindbar.', f1Tags: ['Ordner', 'Tags', 'Suche'],
        f2Title: 'Dokumente und Dateien', f2Text: 'Lade viele Dateitypen in jedes Projekt hoch und veröffentliche sie: PDF, Word, Bilder, Tabellen und mehr.', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'Deine API-Keys', f3Text: 'Speichere und nutze deine eigenen API-Keys pro Projekt. Sie bleiben bei dir und werden nie geteilt.', f3Tags: ['pro Projekt', 'verschlüsselt'],
        f4Title: 'Notizen, Berichte und Automatisierung', f4Text: 'Schreibe Notizen, erstelle Berichte und automatisiere wiederkehrende Aufgaben mit den Dateien und Keys jedes Bereichs.', f4Tags: ['Notizen', 'Berichte', 'Automatisierung']
      },
      api: {
        eyebrow: 'API',
        title: 'In Minuten per API verbinden',
        lead: 'Automatisiere deinen Ablauf mit deinem eigenen API-Key: Projekte erstellen, Dateien hochladen und Dokumente direkt aus deinem Code abfragen.',
        li1: 'Authentifiziere dich mit einem eindeutigen API-Key pro Projekt.',
        li2: 'Offizielles SDK für JavaScript und Python oder direkte Anfragen mit cURL.',
        li3: 'JSON-Antworten mit klaren, vorhersehbaren Status.',
        respLabel: 'Antwort', copy: 'Kopieren', copied: 'Kopiert'
      },
      why: {
        eyebrow: 'Warum NubiFlyGo',
        title: 'So gemacht, dass du die Kontrolle behältst',
        i1Title: 'Ein einziger Ort', i1Text: 'Projekte, Dokumente und Keys zusammen, ohne zwischen Tools zu springen.',
        i2Title: 'Deine Keys, deine Daten', i2Text: 'Du verbindest deine eigenen API-Keys; nichts verlässt deinen Bereich ohne deine Entscheidung.',
        i3Title: 'Jede Datei', i3Text: 'Veröffentliche viele Dokumenttypen in jedem Projekt ohne komische Limits.',
        i4Title: 'Leicht und schnell', i4Text: 'Saubere Oberfläche in HTML/CSS/JS, ohne Installationen oder schwere Prozesse.'
      },
      reviews: {
        eyebrow: 'Bewertungen',
        title: 'Was Nutzer sagen',
        desc: 'Lass die echte Erfahrung für dich sprechen.',
        note: '* Beispielbewertungen für den Entwurf — werden durch echte ersetzt.'
      },
      pricing: {
        eyebrow: 'Preise',
        title: 'Ein Plan für jede Arbeitsweise',
        lead: 'Starte kostenlos und wachse, wenn du es brauchst. Keine Verträge, keine Überraschungen.',
        popular: 'Am beliebtesten',
        perMonth: 'pro Monat', forever: 'für immer', billedMonthly: 'monatliche Abrechnung', according: 'je nach', yourUse: 'deiner Nutzung',
        free:  { name: 'Gratis', desc: 'Zum Starten und kostenlos testen.', cta: 'Kostenlos starten', feats: ['2 GB Speicher', 'Bis zu 3 Projekte', 'Dokumente jeder Art', '1 API-Key'], more: 'Mehr Speicher nötig?' },
        pro:   { name: 'Pro', desc: 'Für intensive persönliche Nutzung.', cta: 'Pro wählen', feats: ['100 GB Speicher', 'Unbegrenzte Projekte', '5 API-Keys', 'Basis-Automatisierungen', 'E-Mail-Support'], more: 'Höhere Limits nötig?' },
        mega:  { name: 'Mega', desc: 'Für alle mit vielen Dateien.', cta: 'Mega wählen', feats: ['1 TB Speicher', 'Unbegrenzte Projekte', '20 API-Keys', 'Erweiterte Automatisierungen', 'Versionsverlauf'], more: 'Höhere Limits nötig?' },
        sup:   { name: 'Super', desc: 'Maximale Leistung und Speicher.', cta: 'Super wählen', feats: ['5 TB Speicher', 'Unbegrenzte API-Keys', 'API-Priorität', 'Priorisierter Support'], more: 'Höhere Limits nötig?' },
        ent:   { name: 'Unternehmen', desc: 'Für Teams und Organisationen.', cta: 'Kontakt aufnehmen', custom: 'Individuell', feats: ['Individueller Speicher', 'Nutzer und Rechte', 'SSO-Anmeldung', 'Dedizierter Support'], more: 'Mit dem Vertrieb sprechen' },
        note: '* Beispielpreise. Jederzeit ändern oder kündigen.'
      },
      faq: {
        eyebrow: 'Häufige Fragen',
        title: 'Kläre deine Zweifel, bevor du startest',
        q1: 'Welche Dateitypen kann ich hochladen?', a1: 'Du kannst viele Dokumenttypen in jedem Projekt veröffentlichen: PDF, Word, Bilder, Tabellen und Textdateien, unter anderem.',
        q2: 'Wo werden meine API-Keys gespeichert?', a2: 'Deine Keys werden pro Projekt gespeichert und bleiben bei dir. Du nutzt sie in deinem Bereich und sie werden nicht an Dritte weitergegeben.',
        q3: 'Kann ich mehrere Projekte gleichzeitig haben?', a3: 'Ja. Jedes Projekt ist ein eigenständiger Bereich mit eigenen Dateien, Notizen, Berichten und Keys.',
        q4: 'Muss ich etwas installieren?', a4: 'Nein. NubiFlyGo läuft im Browser. Öffne deinen Bereich und leg sofort los.'
      },
      cta: { title: 'Erstelle heute deinen ersten Bereich', text: 'Vereine Projekte, Dokumente und Keys in einer Oberfläche, die in deinem Tempo arbeitet.', button: 'Jetzt starten' },
      footer: {
        tagline: 'Dein Bereich für Projekte, Dokumente und API-Keys, alles an einem Ort.',
        newsPlaceholder: 'du@email.com', newsBtn: 'Benachrichtigen', newsMsg: 'Fertig! Wir melden uns unter {email}',
        colProduct: 'Produkt', colResources: 'Ressourcen', colLegal: 'Rechtliches',
        linkFeatures: 'Funktionen', linkProjects: 'Projekte', linkReviews: 'Bewertungen', linkFaq: 'FAQ',
        linkStart: 'Erste Schritte', linkDocs: 'Dokumentation', linkNews: 'Neuigkeiten',
        linkTerms: 'AGB', linkPrivacy: 'Datenschutz', linkContact: 'Kontakt',
        rights: '© {year} NubiFlyGo. Alle Rechte vorbehalten.', madeWith: 'Gemacht mit HTML · CSS · JS'
      }
    }
  },

  it: {
    landing: {
      docTitle: 'NubiFlyGo · Il tuo spazio di lavoro',
      nav: { features: 'Funzioni', api: 'API', projects: 'Progetti', reviews: 'Recensioni', pricing: 'Prezzi', faq: 'FAQ', login: 'Accedi', signup: 'Registrati' },
      langLabel: 'Lingua',
      hero: {
        badgeNew: 'Nuovo',
        badgeText: 'Il tuo spazio di lavoro, in un solo posto',
        lead: 'NubiFlyGo riunisce i tuoi progetti, note e report in un’unica interfaccia. Carica file di qualsiasi tipo, pubblicali dentro ogni progetto e collega le tue chiavi API per automatizzare il resto.',
        ctaStart: 'Inizia gratis',
        ctaHow: 'Guarda come funziona',
        note: 'Senza carta · Le tue chiavi restano con te · 2.500+ spazi creati'
      },
      typed: [
        'Organizza progetti e documenti.',
        'Il tuo spazio di lavoro, in un posto.',
        'Carica file in pochi secondi.',
        'Le tue chiavi API, sicure per progetto.',
        'Note, report e file insieme.',
        'Pubblica documenti nei tuoi progetti.',
        'Le tue chiavi restano con te.',
        'Lavora dal browser.',
        'Automatizza con le tue chiavi.',
        'Tutto in ordine e a portata.',
        'Inizia gratis, senza carta.',
        'Uno spazio pulito per progetto.'
      ],
      strip: { title: 'Collega le tue chiavi dei servizi che usi già' },
      features: {
        eyebrow: 'Funzioni',
        title: 'Tutto ciò che ti serve per lavorare con i tuoi file',
        lead: 'Ogni progetto è uno spazio a sé dove salvi, pubblichi e colleghi ciò che ti serve.',
        f1Title: 'Progetti organizzati', f1Text: 'Crea uno spazio per ogni progetto e tieni file, note e report separati e facili da trovare.', f1Tags: ['cartelle', 'etichette', 'ricerca'],
        f2Title: 'Documenti e file', f2Text: 'Carica e pubblica vari tipi di file in ogni progetto: PDF, Word, immagini, fogli di calcolo e altro.', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'Le tue chiavi API', f3Text: 'Salva e usa le tue chiavi API per progetto. Restano con te e non vengono mai condivise.', f3Tags: ['per progetto', 'crittografate'],
        f4Title: 'Note, report e automazione', f4Text: 'Scrivi note, genera report e automatizza le attività ripetitive usando i file e le chiavi di ogni spazio.', f4Tags: ['note', 'report', 'automazione']
      },
      api: {
        eyebrow: 'API',
        title: 'Collegati via API in pochi minuti',
        lead: 'Automatizza il tuo flusso con la tua chiave API: crea progetti, carica file e interroga i tuoi documenti direttamente dal codice.',
        li1: 'Autenticati con una chiave API unica per progetto.',
        li2: 'SDK ufficiale per JavaScript e Python, o richieste dirette con cURL.',
        li3: 'Risposte in JSON con stati chiari e prevedibili.',
        respLabel: 'Risposta', copy: 'Copia', copied: 'Copiato'
      },
      why: {
        eyebrow: 'Perché NubiFlyGo',
        title: 'Pensato per farti mantenere il controllo',
        i1Title: 'Un solo posto', i1Text: 'Progetti, documenti e chiavi insieme, senza saltare tra strumenti.',
        i2Title: 'Le tue chiavi, i tuoi dati', i2Text: 'Colleghi le tue chiavi API; niente esce dal tuo spazio senza che tu lo decida.',
        i3Title: 'Qualsiasi file', i3Text: 'Pubblica vari tipi di documento in ogni progetto senza limiti strani.',
        i4Title: 'Leggero e veloce', i4Text: 'Interfaccia pulita in HTML/CSS/JS, senza installazioni né processi pesanti.'
      },
      reviews: {
        eyebrow: 'Recensioni',
        title: 'Cosa dice chi la usa',
        desc: 'Lascia che sia l’esperienza reale a convincerti.',
        note: '* Recensioni di esempio per la bozza — verranno sostituite con quelle reali.'
      },
      pricing: {
        eyebrow: 'Prezzi',
        title: 'Un piano per ogni modo di lavorare',
        lead: 'Inizia gratis e cresci quando ti serve. Senza contratti né sorprese.',
        popular: 'Più popolare',
        perMonth: 'al mese', forever: 'per sempre', billedMonthly: 'fatturazione mensile', according: 'in base', yourUse: 'al tuo uso',
        free:  { name: 'Gratis', desc: 'Per iniziare e provare senza costi.', cta: 'Inizia gratis', feats: ['2 GB di spazio', 'Fino a 3 progetti', 'Documenti di ogni tipo', '1 chiave API'], more: 'Ti serve più spazio?' },
        pro:   { name: 'Pro', desc: 'Per un uso personale intenso.', cta: 'Scegli Pro', feats: ['100 GB di spazio', 'Progetti illimitati', '5 chiavi API', 'Automazioni di base', 'Supporto via email'], more: 'Ti servono più limiti?' },
        mega:  { name: 'Mega', desc: 'Per chi gestisce tanti file.', cta: 'Scegli Mega', feats: ['1 TB di spazio', 'Progetti illimitati', '20 chiavi API', 'Automazioni avanzate', 'Cronologia versioni'], more: 'Ti servono più limiti?' },
        sup:   { name: 'Super', desc: 'Massime prestazioni e spazio.', cta: 'Scegli Super', feats: ['5 TB di spazio', 'Chiavi API illimitate', 'Priorità sull’API', 'Supporto prioritario'], more: 'Ti servono più limiti?' },
        ent:   { name: 'Azienda', desc: 'Per team e organizzazioni.', cta: 'Contattaci', custom: 'Su misura', feats: ['Spazio su misura', 'Utenti e permessi', 'Accesso SSO', 'Supporto dedicato'], more: 'Parla con le vendite' },
        note: '* Prezzi di esempio. Cambia o annulla quando vuoi.'
      },
      faq: {
        eyebrow: 'Domande frequenti',
        title: 'Chiarisci i dubbi prima di iniziare',
        q1: 'Che tipi di file posso caricare?', a1: 'Puoi pubblicare vari tipi di documento in ogni progetto: PDF, Word, immagini, fogli di calcolo e file di testo, tra gli altri.',
        q2: 'Dove si salvano le mie chiavi API?', a2: 'Le tue chiavi si salvano per progetto e restano con te. Le usi nel tuo spazio e non vengono condivise con terzi.',
        q3: 'Posso avere più progetti alla volta?', a3: 'Sì. Ogni progetto è uno spazio indipendente con i propri file, note, report e chiavi.',
        q4: 'Devo installare qualcosa?', a4: 'No. NubiFlyGo funziona nel browser. Apri il tuo spazio e inizia a lavorare subito.'
      },
      cta: { title: 'Crea oggi il tuo primo spazio', text: 'Riunisci progetti, documenti e chiavi in un’interfaccia che lavora al tuo ritmo.', button: 'Inizia ora' },
      footer: {
        tagline: 'Il tuo spazio per progetti, documenti e chiavi API, tutto in un posto.',
        newsPlaceholder: 'tu@email.com', newsBtn: 'Avvisami', newsMsg: 'Fatto! Ti avviseremo a {email}',
        colProduct: 'Prodotto', colResources: 'Risorse', colLegal: 'Legale',
        linkFeatures: 'Funzioni', linkProjects: 'Progetti', linkReviews: 'Recensioni', linkFaq: 'FAQ',
        linkStart: 'Guida iniziale', linkDocs: 'Documentazione', linkNews: 'Novità',
        linkTerms: 'Termini', linkPrivacy: 'Privacy', linkContact: 'Contatto',
        rights: '© {year} NubiFlyGo. Tutti i diritti riservati.', madeWith: 'Fatto con HTML · CSS · JS'
      }
    }
  },

  zh: {
    landing: {
      docTitle: 'NubiFlyGo · 你的工作空间',
      nav: { features: '功能', api: 'API', projects: '项目', reviews: '评价', pricing: '价格', faq: '常见问题', login: '登录', signup: '注册' },
      langLabel: '语言',
      hero: {
        badgeNew: '全新',
        badgeText: '你的工作空间，尽在一处',
        lead: 'NubiFlyGo 将你的项目、笔记和报告汇聚到同一个界面。上传任意类型的文件，在每个项目中发布，并连接你自己的 API 密钥来自动化其余工作。',
        ctaStart: '免费开始',
        ctaHow: '了解如何使用',
        note: '无需银行卡 · 密钥归你所有 · 已创建 2,500+ 个空间'
      },
      typed: [
        '整理项目与文档。',
        '你的工作空间，集于一处。',
        '几秒钟上传文件。',
        '每个项目的 API 密钥都很安全。',
        '笔记、报告与文件在一起。',
        '在你的项目中发布文档。',
        '密钥始终归你所有。',
        '直接在浏览器中工作。',
        '用你自己的密钥实现自动化。',
        '一切井然有序，触手可及。',
        '免费开始，无需银行卡。',
        '每个项目都有干净的空间。'
      ],
      strip: { title: '连接你已在使用的服务的专属密钥' },
      features: {
        eyebrow: '功能',
        title: '处理文件所需的一切',
        lead: '每个项目都是独立空间，你可以在其中存储、发布并连接所需内容。',
        f1Title: '井然有序的项目', f1Text: '为每个项目创建一个空间，让文件、笔记和报告分门别类、便于查找。', f1Tags: ['文件夹', '标签', '搜索'],
        f2Title: '文档与文件', f2Text: '在每个项目中上传并发布多种文件类型：PDF、Word、图片、电子表格等。', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: '你的 API 密钥', f3Text: '按项目存储并使用你自己的 API 密钥。它们归你所有，绝不共享。', f3Tags: ['按项目', '已加密'],
        f4Title: '笔记、报告与自动化', f4Text: '利用每个空间的文件和密钥撰写笔记、生成报告并自动化重复任务。', f4Tags: ['笔记', '报告', '自动化']
      },
      api: {
        eyebrow: 'API',
        title: '几分钟内通过 API 接入',
        lead: '用你自己的 API 密钥自动化工作流：创建项目、上传文件，并直接在代码中查询文档。',
        li1: '每个项目使用唯一的 API 密钥进行身份验证。',
        li2: '提供 JavaScript 和 Python 官方 SDK，或用 cURL 直接请求。',
        li3: 'JSON 响应，状态清晰且可预测。',
        respLabel: '响应', copy: '复制', copied: '已复制'
      },
      why: {
        eyebrow: '为什么选择 NubiFlyGo',
        title: '让你始终掌控一切',
        i1Title: '集于一处', i1Text: '项目、文档和密钥汇聚在一起，无需在工具间切换。',
        i2Title: '你的密钥，你的数据', i2Text: '你连接自己的 API 密钥；未经你的决定，任何内容都不会离开你的空间。',
        i3Title: '任意文件', i3Text: '在每个项目中发布多种文档类型，没有奇怪的限制。',
        i4Title: '轻量又快速', i4Text: '简洁的 HTML/CSS/JS 界面，无需安装，也没有繁重的流程。'
      },
      reviews: {
        eyebrow: '评价',
        title: '用户怎么说',
        desc: '让真实体验替你说话。',
        note: '* 草图中的示例评价 —— 将替换为真实评价。'
      },
      pricing: {
        eyebrow: '价格',
        title: '适配每一种工作方式的方案',
        lead: '免费开始，需要时再升级。没有合同，也没有意外。',
        popular: '最受欢迎',
        perMonth: '每月', forever: '永久', billedMonthly: '按月计费', according: '取决于', yourUse: '你的用量',
        free:  { name: '免费', desc: '零成本起步与试用。', cta: '免费开始', feats: ['2 GB 存储', '最多 3 个项目', '任意类型文档', '1 个 API 密钥'], more: '需要更多空间？' },
        pro:   { name: 'Pro', desc: '适合高强度个人使用。', cta: '选择 Pro', feats: ['100 GB 存储', '无限项目', '5 个 API 密钥', '基础自动化', '邮件支持'], more: '需要更高额度？' },
        mega:  { name: 'Mega', desc: '适合处理大量文件的人。', cta: '选择 Mega', feats: ['1 TB 存储', '无限项目', '20 个 API 密钥', '高级自动化', '版本历史'], more: '需要更高额度？' },
        sup:   { name: 'Super', desc: '极致的性能与空间。', cta: '选择 Super', feats: ['5 TB 存储', '无限 API 密钥', 'API 优先级', '优先支持'], more: '需要更高额度？' },
        ent:   { name: '企业版', desc: '面向团队和组织。', cta: '联系我们', custom: '定制', feats: ['定制存储', '用户与权限', 'SSO 登录', '专属支持'], more: '联系销售' },
        note: '* 示例价格。随时更改或取消。'
      },
      faq: {
        eyebrow: '常见问题',
        title: '开始前先解决你的疑问',
        q1: '我可以上传哪些文件类型？', a1: '你可以在每个项目中发布多种文档类型：PDF、Word、图片、电子表格和文本文件等。',
        q2: '我的 API 密钥保存在哪里？', a2: '你的密钥按项目保存并归你所有。你在自己的空间内使用，不会与第三方共享。',
        q3: '我可以同时拥有多个项目吗？', a3: '可以。每个项目都是独立空间，拥有各自的文件、笔记、报告和密钥。',
        q4: '我需要安装什么吗？', a4: '不需要。NubiFlyGo 在浏览器中运行。打开你的空间即可立即开始工作。'
      },
      cta: { title: '今天就创建你的第一个空间', text: '在一个随你节奏运转的界面中，汇聚项目、文档和密钥。', button: '立即开始' },
      footer: {
        tagline: '你的项目、文档和 API 密钥空间，尽在一处。',
        newsPlaceholder: 'you@email.com', newsBtn: '通知我', newsMsg: '完成！我们会通过 {email} 通知你',
        colProduct: '产品', colResources: '资源', colLegal: '法律',
        linkFeatures: '功能', linkProjects: '项目', linkReviews: '评价', linkFaq: '常见问题',
        linkStart: '入门指南', linkDocs: '文档', linkNews: '更新',
        linkTerms: '条款', linkPrivacy: '隐私', linkContact: '联系',
        rights: '© {year} NubiFlyGo. 保留所有权利。', madeWith: '使用 HTML · CSS · JS 构建'
      }
    }
  },

  ja: {
    landing: {
      docTitle: 'NubiFlyGo · あなたのワークスペース',
      nav: { features: '機能', api: 'API', projects: 'プロジェクト', reviews: 'レビュー', pricing: '料金', faq: 'よくある質問', login: 'ログイン', signup: '登録' },
      langLabel: '言語',
      hero: {
        badgeNew: '新着',
        badgeText: 'あなたのワークスペースを、ひとつの場所に',
        lead: 'NubiFlyGo はプロジェクト、メモ、レポートを一つの画面にまとめます。あらゆる種類のファイルをアップロードし、各プロジェクト内で公開し、自分の API キーをつないで残りを自動化できます。',
        ctaStart: '無料で始める',
        ctaHow: '使い方を見る',
        note: 'カード不要 · キーはあなたの手元に · 作成された空間 2,500+'
      },
      typed: [
        'プロジェクトと書類を整理。',
        'ワークスペースを、ひとつの場所に。',
        '数秒でファイルをアップロード。',
        'API キーはプロジェクトごとに安全。',
        'メモ・レポート・ファイルをまとめて。',
        'プロジェクトに書類を公開。',
        'キーはあなたの手元に。',
        'ブラウザーからそのまま作業。',
        '自分のキーで自動化。',
        'すべて整理され、すぐ手に届く。',
        'カード不要で無料スタート。',
        'プロジェクトごとに整った空間。'
      ],
      strip: { title: 'すでに使っているサービスの、自分のキーをつなぐ' },
      features: {
        eyebrow: '機能',
        title: 'ファイルを扱うのに必要なすべて',
        lead: '各プロジェクトは、必要なものを保存・公開・連携できる独自の空間です。',
        f1Title: '整理されたプロジェクト', f1Text: 'プロジェクトごとに空間を作り、ファイル・メモ・レポートを分けて見つけやすく保ちます。', f1Tags: ['フォルダー', 'タグ', '検索'],
        f2Title: '書類とファイル', f2Text: '各プロジェクトに多様な種類のファイルをアップロードして公開：PDF、Word、画像、表計算など。', f2Tags: ['PDF', 'DOCX', 'PNG', 'XLSX'],
        f3Title: 'あなたの API キー', f3Text: '自分の API キーをプロジェクトごとに保存して使用。手元に残り、共有されることはありません。', f3Tags: ['プロジェクト別', '暗号化'],
        f4Title: 'メモ・レポート・自動化', f4Text: '各空間のファイルとキーを使って、メモを書き、レポートを生成し、繰り返し作業を自動化します。', f4Tags: ['メモ', 'レポート', '自動化']
      },
      api: {
        eyebrow: 'API',
        title: '数分で API 連携',
        lead: '自分の API キーでワークフローを自動化：プロジェクトを作成し、ファイルをアップロードし、コードから直接書類を照会します。',
        li1: 'プロジェクトごとに固有の API キーで認証。',
        li2: 'JavaScript と Python の公式 SDK、または cURL で直接リクエスト。',
        li3: '明確で予測しやすいステータスを持つ JSON レスポンス。',
        respLabel: 'レスポンス', copy: 'コピー', copied: 'コピーしました'
      },
      why: {
        eyebrow: 'NubiFlyGo を選ぶ理由',
        title: 'あなたが主導権を持てる設計',
        i1Title: 'ひとつの場所', i1Text: 'プロジェクト・書類・キーをまとめ、ツール間を行き来しません。',
        i2Title: 'あなたのキー、あなたのデータ', i2Text: '自分の API キーをつなぎ、あなたが決めない限り何も空間の外に出ません。',
        i3Title: 'どんなファイルも', i3Text: '各プロジェクトに多様な書類を、おかしな制限なく公開できます。',
        i4Title: '軽快で高速', i4Text: 'HTML/CSS/JS の整った画面。インストールも重い処理もありません。'
      },
      reviews: {
        eyebrow: 'レビュー',
        title: '使っている人の声',
        desc: '実際の体験に語らせましょう。',
        note: '* 下書き用のサンプルレビューです — 実際のレビューに置き換わります。'
      },
      pricing: {
        eyebrow: '料金',
        title: '働き方ごとのプラン',
        lead: '無料で始めて、必要になったら拡張。契約もサプライズもありません。',
        popular: '一番人気',
        perMonth: '月額', forever: 'ずっと', billedMonthly: '毎月請求', according: '利用に応じて', yourUse: '',
        free:  { name: '無料', desc: 'まず無料で始めて試す。', cta: '無料で始める', feats: ['2 GB ストレージ', 'プロジェクト最大 3 件', 'あらゆる種類の書類', 'API キー 1 個'], more: 'もっと容量が必要？' },
        pro:   { name: 'Pro', desc: '個人のヘビーユース向け。', cta: 'Pro を選ぶ', feats: ['100 GB ストレージ', 'プロジェクト無制限', 'API キー 5 個', '基本の自動化', 'メールサポート'], more: 'もっと上限が必要？' },
        mega:  { name: 'Mega', desc: 'ファイルが多い人向け。', cta: 'Mega を選ぶ', feats: ['1 TB ストレージ', 'プロジェクト無制限', 'API キー 20 個', '高度な自動化', 'バージョン履歴'], more: 'もっと上限が必要？' },
        sup:   { name: 'Super', desc: '最大の性能と容量。', cta: 'Super を選ぶ', feats: ['5 TB ストレージ', 'API キー無制限', 'API 優先', '優先サポート'], more: 'もっと上限が必要？' },
        ent:   { name: 'エンタープライズ', desc: 'チームと組織向け。', cta: 'お問い合わせ', custom: '個別見積', feats: ['個別ストレージ', 'ユーザーと権限', 'SSO ログイン', '専任サポート'], more: '営業に相談' },
        note: '* サンプル価格です。いつでも変更・解約できます。'
      },
      faq: {
        eyebrow: 'よくある質問',
        title: '始める前に疑問を解消',
        q1: 'どんなファイル形式をアップロードできますか？', a1: '各プロジェクトに多様な書類を公開できます：PDF、Word、画像、表計算、テキストファイルなど。',
        q2: 'API キーはどこに保存されますか？', a2: 'キーはプロジェクトごとに保存され、あなたの手元に残ります。自分の空間内で使い、第三者と共有されません。',
        q3: '複数のプロジェクトを同時に持てますか？', a3: 'はい。各プロジェクトは独立した空間で、独自のファイル・メモ・レポート・キーを持ちます。',
        q4: '何かインストールが必要ですか？', a4: 'いいえ。NubiFlyGo はブラウザーで動きます。空間を開けばすぐに作業を始められます。'
      },
      cta: { title: '今日、最初の空間を作ろう', text: 'あなたのペースで動く画面に、プロジェクト・書類・キーをまとめましょう。', button: '今すぐ始める' },
      footer: {
        tagline: 'プロジェクト・書類・API キーのための、あなたの空間をひとつに。',
        newsPlaceholder: 'you@email.com', newsBtn: '通知を受け取る', newsMsg: '完了！ {email} にお知らせします',
        colProduct: '製品', colResources: 'リソース', colLegal: '法的情報',
        linkFeatures: '機能', linkProjects: 'プロジェクト', linkReviews: 'レビュー', linkFaq: 'よくある質問',
        linkStart: 'はじめに', linkDocs: 'ドキュメント', linkNews: '新着情報',
        linkTerms: '利用規約', linkPrivacy: 'プライバシー', linkContact: 'お問い合わせ',
        rights: '© {year} NubiFlyGo. All rights reserved.', madeWith: 'HTML · CSS · JS で制作'
      }
    }
  }
};

const DEFAULT_LANG = 'es';

/* Detecta el idioma inicial a partir del idioma del navegador/dispositivo.
 * Toma el subtag principal (p. ej. "en-US" -> "en", "pt-BR" -> "pt",
 * "zh-Hans-CN" -> "zh") y lo compara con los idiomas disponibles (LANGS).
 * Si ninguno coincide, usa el idioma base (DEFAULT_LANG).
 *
 * FUTURO (detección por país): este es el único punto a extender. Para
 * decidir por país real puedes añadir aquí tu señal de región —
 * geolocalización por IP desde tu backend, o
 * new Intl.Locale(navigator.language).region (p. ej. "MX", "BR") — y
 * mapear ese país al idioma antes de caer al navegador. El menú popup
 * sigue mandando: en cuanto el usuario elige, su elección se guarda y
 * esta detección deja de aplicarse. */
function detectLanguage() {
  const supported = LANGS.map(l => l.code);
  const candidates = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || navigator.userLanguage || ''];
  for (const tag of candidates) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (supported.indexOf(base) !== -1) return base;
  }
  return DEFAULT_LANG;
}

/* Prioridad: elección guardada (menú popup) > idioma detectado > base. */
let currentLang = localStorage.getItem('workspace:lang') || detectLanguage();
if (!STRINGS[currentLang]) currentLang = DEFAULT_LANG;

/* Devuelve el texto de una clave ('a.b.c'), con fallback al idioma base.
   Sustituye {param} por params.param. Puede devolver también arrays/objetos. */
function t(path, params = {}) {
  const parts = String(path).split('.');
  const pick = (lang) => parts.reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), STRINGS[lang]);
  let value = pick(currentLang);
  if (value === undefined && currentLang !== DEFAULT_LANG) value = pick(DEFAULT_LANG);
  if (value === undefined) return path;
  if (typeof value !== 'string') return value; // arrays (p. ej. landing.typed) y objetos
  return value.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined && params[key] !== null ? params[key] : ''));
}

function getLang() { return currentLang; }

function setLanguage(lang) {
  currentLang = STRINGS[lang] ? lang : DEFAULT_LANG;
  localStorage.setItem('workspace:lang', currentLang);
  document.documentElement.lang = currentLang;
  applyStaticStrings();
  // La app (home.html) se redibuja con render(); la landing escucha el evento.
  if (typeof render === 'function') render();
  document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: currentLang } }));
}

/* Rellena los nodos marcados con data-i18n* dentro de root. */
function applyStaticStrings(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(node => { node.setAttribute('title', t(node.dataset.i18nTitle)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder)); });
  root.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
  // Título del documento: usa landing.docTitle si existe en el idioma/base; si no, app.title.
  const docTitle = t('landing.docTitle');
  document.title = (docTitle && docTitle !== 'landing.docTitle') ? docTitle : t('app.title');
}

/* ------------------------------------------------------------------ *
 * Selector de idioma reutilizable.
 * Construye un botón + menú dentro del contenedor indicado. Al elegir
 * un idioma llama a setLanguage() (que relee los textos y avisa por
 * el evento 'languagechange'). Funciona en cualquier página que cargue
 * este archivo.
 * ------------------------------------------------------------------ */
function mountLanguageSwitcher(container) {
  if (!container) return;
  const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>';
  const tick = '<span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>';

  container.classList.add('lang');
  container.setAttribute('data-open', 'false');
  container.innerHTML =
    '<button type="button" class="lang-btn" aria-haspopup="listbox" aria-expanded="false">' +
      globe + '<span class="lang-name"></span>' + chev +
    '</button>' +
    '<div class="lang-menu" role="listbox"></div>';

  const btn = container.querySelector('.lang-btn');
  const nameEl = container.querySelector('.lang-name');
  const menu = container.querySelector('.lang-menu');

  menu.innerHTML = LANGS.map(l =>
    '<button type="button" role="option" data-lang="' + l.code + '">' +
      '<span class="flag">' + l.flag + '</span>' +
      '<span>' + l.name + '</span>' + tick +
    '</button>'
  ).join('');

  function syncLabel() {
    const active = LANGS.find(l => l.code === currentLang) || LANGS[0];
    nameEl.textContent = active.name;
    btn.setAttribute('aria-label', t('landing.langLabel') + ': ' + active.name);
    menu.querySelectorAll('button[data-lang]').forEach(b => {
      b.setAttribute('aria-selected', b.dataset.lang === currentLang ? 'true' : 'false');
    });
  }
  function open(v) {
    container.setAttribute('data-open', v ? 'true' : 'false');
    btn.setAttribute('aria-expanded', v ? 'true' : 'false');
  }

  btn.addEventListener('click', e => { e.stopPropagation(); open(container.getAttribute('data-open') !== 'true'); });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    setLanguage(b.dataset.lang);
    open(false);
  });
  document.addEventListener('click', e => { if (!container.contains(e.target)) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
  document.addEventListener('languagechange', syncLabel);

  syncLabel();
}
