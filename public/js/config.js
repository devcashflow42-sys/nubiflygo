'use strict';
/* config.js — Constantes globales: claves de almacenamiento y paleta de proyectos. */

  const STORE_KEY = 'workspace:data';
  const PREF_KEY  = 'workspace:prefs';
  const PROJECT_COLORS = ['#2b5fff', '#8b5cf6', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f97316'];
  // Nombres de la paleta (para lectores de pantalla y descripciones).
  const PROJECT_COLOR_NAMES = ['Azul', 'Violeta', 'Rojo', 'Ámbar', 'Esmeralda', 'Cian', 'Rosa', 'Naranja'];
  // Color de un proyecto, solo si es hexadecimal (#abc o #aabbcc). Va dentro de
  // degradados y variables CSS, así que cualquier otro valor (antiguo o
  // manipulado) se cambia por el primero de la paleta.
  function safeColor(c) {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c || '')) ? c : PROJECT_COLORS[0];
  }
