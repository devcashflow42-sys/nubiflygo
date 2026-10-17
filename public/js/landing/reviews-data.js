'use strict';
/* reviews-data.js — Datos de las opiniones de ejemplo (muro en movimiento).
 *
 * Son contenido de ejemplo para el boceto; reemplázalas por reseñas reales.
 * Las personas (nombre + iniciales del avatar) son constantes; el texto y el
 * rol se traducen por idioma. Si un idioma no tiene traducción, cae al español.
 * El archivo reviews.js arma las tarjetas a partir de aquí. */

const REVIEW_PEOPLE = [
  { name: 'Carla V.',    avatar: 'CV' },
  { name: 'Óscar P.',    avatar: 'OP' },
  { name: 'Nadia S.',    avatar: 'NS' },
  { name: 'Hugo R.',     avatar: 'HR' },
  { name: 'Tania L.',    avatar: 'TL' },
  { name: 'Marco A.',    avatar: 'MA' },
  { name: 'Andrés B.',   avatar: 'AB' },
  { name: 'Mónica R.',   avatar: 'MR' },
  { name: 'Paula V.',    avatar: 'PV' },
  { name: 'Sara M.',     avatar: 'SM' },
  { name: 'Alma P.',     avatar: 'AP' },
  { name: 'Nico F.',     avatar: 'NF' }
];

const REVIEW_TEXT = {
  es: [
    { q: 'La página se ve limpia y carga rapidísimo. Me encanta.', role: 'Freelancer' },
    { q: 'Por fin un lugar donde mis proyectos y archivos no se pierden.', role: 'Contador' },
    { q: 'El diseño es simple y va directo al grano.', role: 'Estudiante' },
    { q: 'Subir documentos a cada proyecto es rapidísimo.', role: 'Ingeniero' },
    { q: 'Guardar mis API keys por proyecto me cambió la rutina.', role: 'Dev backend' },
    { q: 'Mis expedientes por proyecto, sin perder nada.', role: 'Abogado' },
    { q: 'El diseño está muy bien logrado, se ve pro.', role: 'Dev frontend' },
    { q: 'Cada proyecto con sus llaves y documentos. Perfecto.', role: 'Consultora' },
    { q: 'Me gusta cómo separa todo por proyectos.', role: 'Contadora' },
    { q: 'Mis documentos ordenados y siempre a la mano.', role: 'Investigadora' },
    { q: 'Me encanta la estética limpia y clara.', role: 'Diseñadora UX' },
    { q: 'Guardar mis API keys aquí es comodísimo.', role: 'Dev móvil' }
  ],
  en: [
    { q: 'The site looks clean and loads super fast. I love it.', role: 'Freelancer' },
    { q: 'Finally a place where my projects and files don’t get lost.', role: 'Accountant' },
    { q: 'The design is simple and gets straight to the point.', role: 'Student' },
    { q: 'Uploading documents to each project is lightning fast.', role: 'Engineer' },
    { q: 'Keeping my API keys per project changed my routine.', role: 'Backend dev' },
    { q: 'My case files per project, nothing lost.', role: 'Lawyer' },
    { q: 'The design is really well done, it looks pro.', role: 'Frontend dev' },
    { q: 'Each project with its keys and documents. Perfect.', role: 'Consultant' },
    { q: 'I like how it separates everything by project.', role: 'Accountant' },
    { q: 'My documents tidy and always within reach.', role: 'Researcher' },
    { q: 'I love the clean, clear aesthetic.', role: 'UX designer' },
    { q: 'Storing my API keys here is super convenient.', role: 'Mobile dev' }
  ],
  pt: [
    { q: 'A página é limpa e carrega super rápido. Adoro.', role: 'Freelancer' },
    { q: 'Enfim um lugar onde meus projetos e arquivos não se perdem.', role: 'Contador' },
    { q: 'O design é simples e vai direto ao ponto.', role: 'Estudante' },
    { q: 'Enviar documentos a cada projeto é rapidíssimo.', role: 'Engenheiro' },
    { q: 'Guardar minhas API keys por projeto mudou minha rotina.', role: 'Dev backend' },
    { q: 'Meus processos por projeto, sem perder nada.', role: 'Advogado' },
    { q: 'O design está muito bem feito, parece pro.', role: 'Dev frontend' },
    { q: 'Cada projeto com suas chaves e documentos. Perfeito.', role: 'Consultora' },
    { q: 'Gosto de como separa tudo por projeto.', role: 'Contadora' },
    { q: 'Meus documentos organizados e sempre à mão.', role: 'Pesquisadora' },
    { q: 'Adoro a estética limpa e clara.', role: 'Designer UX' },
    { q: 'Guardar minhas API keys aqui é comodíssimo.', role: 'Dev mobile' }
  ],
  fr: [
    { q: 'Le site est net et se charge très vite. J’adore.', role: 'Freelance' },
    { q: 'Enfin un endroit où mes projets et fichiers ne se perdent pas.', role: 'Comptable' },
    { q: 'Le design est simple et va droit au but.', role: 'Étudiant' },
    { q: 'Envoyer des documents dans chaque projet est ultra rapide.', role: 'Ingénieur' },
    { q: 'Garder mes clés API par projet a changé ma routine.', role: 'Dev backend' },
    { q: 'Mes dossiers par projet, sans rien perdre.', role: 'Avocat' },
    { q: 'Le design est très réussi, ça fait pro.', role: 'Dev frontend' },
    { q: 'Chaque projet avec ses clés et documents. Parfait.', role: 'Consultante' },
    { q: 'J’aime comment tout est séparé par projet.', role: 'Comptable' },
    { q: 'Mes documents rangés et toujours à portée.', role: 'Chercheuse' },
    { q: 'J’adore l’esthétique nette et claire.', role: 'Designer UX' },
    { q: 'Garder mes clés API ici est super pratique.', role: 'Dev mobile' }
  ],
  de: [
    { q: 'Die Seite ist sauber und lädt blitzschnell. Ich liebe es.', role: 'Freiberufler' },
    { q: 'Endlich ein Ort, an dem meine Projekte und Dateien nicht verloren gehen.', role: 'Buchhalter' },
    { q: 'Das Design ist schlicht und kommt direkt auf den Punkt.', role: 'Student' },
    { q: 'Dokumente in jedes Projekt hochzuladen ist blitzschnell.', role: 'Ingenieur' },
    { q: 'Meine API-Keys pro Projekt zu speichern hat meinen Alltag verändert.', role: 'Backend-Dev' },
    { q: 'Meine Akten pro Projekt, nichts geht verloren.', role: 'Anwalt' },
    { q: 'Das Design ist sehr gelungen, wirkt professionell.', role: 'Frontend-Dev' },
    { q: 'Jedes Projekt mit seinen Keys und Dokumenten. Perfekt.', role: 'Beraterin' },
    { q: 'Mir gefällt, wie alles nach Projekt getrennt ist.', role: 'Buchhalterin' },
    { q: 'Meine Dokumente ordentlich und immer griffbereit.', role: 'Forscherin' },
    { q: 'Ich liebe die klare, saubere Ästhetik.', role: 'UX-Designerin' },
    { q: 'Meine API-Keys hier zu speichern ist super bequem.', role: 'Mobile-Dev' }
  ],
  it: [
    { q: 'Il sito è pulito e si carica velocissimo. Lo adoro.', role: 'Freelance' },
    { q: 'Finalmente un posto dove i miei progetti e file non si perdono.', role: 'Contabile' },
    { q: 'Il design è semplice e va dritto al punto.', role: 'Studente' },
    { q: 'Caricare documenti in ogni progetto è rapidissimo.', role: 'Ingegnere' },
    { q: 'Salvare le mie chiavi API per progetto ha cambiato la mia routine.', role: 'Dev backend' },
    { q: 'I miei fascicoli per progetto, senza perdere nulla.', role: 'Avvocato' },
    { q: 'Il design è molto ben fatto, sembra pro.', role: 'Dev frontend' },
    { q: 'Ogni progetto con le sue chiavi e documenti. Perfetto.', role: 'Consulente' },
    { q: 'Mi piace come separa tutto per progetto.', role: 'Contabile' },
    { q: 'I miei documenti ordinati e sempre a portata.', role: 'Ricercatrice' },
    { q: 'Adoro l’estetica pulita e chiara.', role: 'Designer UX' },
    { q: 'Salvare le mie chiavi API qui è comodissimo.', role: 'Dev mobile' }
  ],
  zh: [
    { q: '页面干净，加载飞快。我很喜欢。', role: '自由职业者' },
    { q: '终于有个地方，我的项目和文件不会丢了。', role: '会计' },
    { q: '设计简洁，直奔主题。', role: '学生' },
    { q: '把文档上传到每个项目都非常快。', role: '工程师' },
    { q: '按项目保存 API 密钥改变了我的日常。', role: '后端开发' },
    { q: '按项目归档我的案卷，一点都不丢。', role: '律师' },
    { q: '设计做得很到位，看起来很专业。', role: '前端开发' },
    { q: '每个项目都有各自的密钥和文档。完美。', role: '顾问' },
    { q: '我喜欢它按项目把一切分开。', role: '会计' },
    { q: '我的文档井井有条，随时可取。', role: '研究员' },
    { q: '我喜欢这种干净清爽的美感。', role: 'UX 设计师' },
    { q: '在这里保存 API 密钥太方便了。', role: '移动端开发' }
  ],
  ja: [
    { q: 'サイトがすっきりしていて読み込みがとても速い。気に入っています。', role: 'フリーランス' },
    { q: 'ようやくプロジェクトとファイルが迷子にならない場所ができた。', role: '経理' },
    { q: 'デザインはシンプルで要点がすぐ分かる。', role: '学生' },
    { q: '各プロジェクトへの書類アップロードがとても速い。', role: 'エンジニア' },
    { q: 'API キーをプロジェクトごとに保存できて日課が変わった。', role: 'バックエンド開発' },
    { q: '案件ごとに書類をまとめても、何も失わない。', role: '弁護士' },
    { q: 'デザインがよくできていて、プロっぽい。', role: 'フロントエンド開発' },
    { q: '各プロジェクトにキーと書類がそろう。完璧。', role: 'コンサルタント' },
    { q: 'すべてをプロジェクトごとに分けられるのが良い。', role: '経理' },
    { q: '書類が整理され、いつでもすぐ手に取れる。', role: 'リサーチャー' },
    { q: 'すっきりと澄んだ見た目が気に入っています。', role: 'UX デザイナー' },
    { q: 'ここに API キーを保存できてとても便利。', role: 'モバイル開発' }
  ]
};
