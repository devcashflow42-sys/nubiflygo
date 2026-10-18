'use strict';
/* login.js — Lógica de la pantalla de acceso (login / registro).
   Los textos vienen de js/languages.js (STRINGS.es.login) a través de t().
   Para traducir la pantalla basta con agregar otro idioma en languages.js. */
(function(){
  var isRegister = false;
  var validated = false; // empieza a avisar solo después del primer intento de envío

  var wrap   = document.getElementById('wrap');
  var form   = document.getElementById('form');
  var submit = document.getElementById('submit');
  var pass   = document.getElementById('password');
  var toastEl = document.getElementById('toast');
  var toastTimer;

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var names = { google:'Google', github:'GitHub' };

  /* ---------- Textos (i18n) ---------- */
  // Rellena los textos estáticos marcados con data-i18n / -placeholder / -aria.
  if (typeof applyStaticStrings === 'function') applyStaticStrings(document);

  var yearEl = document.getElementById('copyright');
  if (yearEl) yearEl.textContent = t('login.copyright', { year: new Date().getFullYear() });

  /* ---------- Barra superior: sombra al hacer scroll ---------- */
  var bar  = document.querySelector('.mobile-top');
  var tbar = document.querySelector('.toolbar');
  window.addEventListener('scroll', function(){
    var s = window.scrollY > 4;
    if (bar)  bar.classList.toggle('scrolled', s);
    if (tbar) tbar.classList.toggle('scrolled', s);
  }, { passive:true });

  /* ---------- Notificaciones ---------- */
  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 2800);
  }

  /* ---------- Alternar iniciar sesión / registro ---------- */
  function setMode(reg){
    isRegister = reg;
    wrap.classList.toggle('is-register', reg);
    document.getElementById('title').textContent = t(reg ? 'login.titleRegister' : 'login.titleLogin');
    document.getElementById('lead').textContent  = t(reg ? 'login.leadRegister'  : 'login.leadLogin');
    submit.textContent = t(reg ? 'login.submitRegister' : 'login.submitLogin');
    document.getElementById('swap-text').textContent = t(reg ? 'login.swapTextRegister' : 'login.swapTextLogin');
    document.getElementById('swap').textContent       = t(reg ? 'login.swapBtnRegister'  : 'login.swapBtnLogin');
    pass.setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
    document.title = t(reg ? 'login.docTitleRegister' : 'login.docTitleLogin');
    validated = false;
    clearErrors();
  }
  document.getElementById('swap').addEventListener('click', function(){ setMode(!isRegister); });

  /* ---------- Mostrar / ocultar contraseña ---------- */
  var eyeOpen  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var eyeOff   = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.1 10.1 0 0 1 12 19c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20"/></svg>';
  var tp = document.querySelector('.toggle-pass');
  tp.addEventListener('click', function(){
    var show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    tp.setAttribute('aria-pressed', show ? 'true' : 'false');
    tp.setAttribute('aria-label', t(show ? 'login.hidePassword' : 'login.showPassword'));
    tp.innerHTML = show ? eyeOff : eyeOpen;
  });

  /* ---------- Validación en cascada (un campo a la vez) ---------- */
  function setErr(id, bad){
    var f = document.getElementById(id);
    f.classList.toggle('has-error', bad);
    f.querySelector('input').setAttribute('aria-invalid', bad ? 'true' : 'false');
  }

  // Orden de revisión (el nombre solo cuenta al registrarse):
  var checks = [
    { id:'f-name',  onlyRegister:true,  ok:function(){ return form.name.value.trim().length > 1; } },
    { id:'f-email', onlyRegister:false, ok:function(){ return emailRe.test(form.email.value.trim()); } },
    { id:'f-pass',  onlyRegister:false, ok:function(){ return pass.value.length >= 8; } },
    { id:'f-terms', onlyRegister:true,  ok:function(){ return form.terms.checked; } }
  ];
  function activeChecks(){
    return checks.filter(function(c){ return !(c.onlyRegister && !isRegister); });
  }
  function firstInvalid(){
    var list = activeChecks();
    for (var i=0;i<list.length;i++){ if(!list[i].ok()) return list[i]; }
    return null;
  }
  function applyErrors(){
    var bad = firstInvalid();
    checks.forEach(function(c){ setErr(c.id, !!bad && c.id === bad.id); });
  }
  function clearErrors(){ checks.forEach(function(c){ setErr(c.id, false); }); }

  // Revalida en vivo (tras el primer intento)
  ['name','email','password'].forEach(function(n){
    if (form[n]) form[n].addEventListener('input', function(){ if(validated) applyErrors(); });
  });
  form.terms.addEventListener('change', function(){ if(validated) applyErrors(); });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    validated = true;
    var bad = firstInvalid();
    applyErrors();
    if (bad){
      var field = document.getElementById(bad.id);
      var input = field.querySelector('input');
      if (input) input.focus();
      // pequeña sacudida para llamar la atención al campo pendiente
      field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake');
      setTimeout(function(){ field.classList.remove('shake'); }, 500);
      return;
    }
    var data = {
      mode: isRegister ? 'register' : 'login',
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      password: pass.value,
      terms: form.terms.checked
    };
    loading(true);
    Auth.email(data).then(function(){
      toast(t(isRegister ? 'login.toastRegistered' : 'login.toastLoggedIn'));
    }).catch(function(err){
      toast(err && err.message ? err.message : t('login.toastGenericError'));
    }).then(function(){ loading(false); });
  });

  function loading(on){
    submit.disabled = on;
    submit.innerHTML = on
      ? '<span class="spin" aria-hidden="true"></span><span class="sr-only">' + t('login.loading') + '</span>'
      : t(isRegister ? 'login.submitRegister' : 'login.submitLogin');
  }

  /* ---------- Proveedores e invitado ---------- */
  document.querySelectorAll('[data-provider]').forEach(function(b){
    b.addEventListener('click', function(){
      var p = b.getAttribute('data-provider');
      Auth.provider(p).catch(function(){ toast(t('login.toastProviderError', { name: names[p] })); });
    });
  });
  document.getElementById('guest').addEventListener('click', function(){
    var gb = document.getElementById('guest'); gb.disabled = true;
    Auth.guest()
      .catch(function(err){ toast(err && err.message ? err.message : t('login.toastGuest')); gb.disabled = false; });
  });
  document.getElementById('forgot').addEventListener('click', function(e){
    e.preventDefault();
    var email = form.email.value.trim();
    if (!email){ setErr('f-email', true); form.email.focus(); return; }
    Auth.reset(email).then(function(){ toast(t('login.toastReset', { email: email })); });
  });

  /* =========================================================
     CONECTA AQUÍ TU BACKEND
     Reemplaza cada función por tu servicio (Firebase Auth,
     Supabase, tu API, etc.). Todas deben devolver una Promise.
     ========================================================= */
  // Base de la API. Si el frontend está en el MISMO dominio que el servidor,
  // deja '' (se usa /api/v1). Si la API está en otro dominio, pon aquí su URL,
  // p. ej. 'https://nubiflygo.com'.
  var API_BASE = '';

  // Idioma detectado del navegador (para guardarlo con la cuenta).
  function detectedLang() {
    try { if (typeof getLang === 'function') return getLang(); } catch (e) {}
    return String((navigator.language || 'es')).slice(0, 2).toLowerCase();
  }

  var Auth = {
    email: function(data){
      // Login/registro real contra el servidor. La sesión viaja en una cookie
      // httpOnly (credentials:'include'); no se guarda ningún token en el navegador.
      return fetch(API_BASE + '/api/v1/account/' + data.mode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NubiFly-Client': 'web' },
        credentials: 'include',
        body: JSON.stringify({ name: data.name, email: data.email, password: data.password, language: detectedLang() })
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(body){
          if (!r.ok) throw new Error(body.error || 'No se pudo completar la operación.');
          // Sesión iniciada → ir a la app.
          window.location.href = '/main';
          return body;
        });
      });
    },
    provider: function(p){
      if (p === 'google') {
        // Camino FIABLE: redirección OAuth. Al hacer clic siempre lleva a la
        // pantalla de Google (no se "cancela" solo como One Tap). El servidor
        // hace el intercambio del token en /auth/google/callback.
        window.location.href = '/auth/google/start';
        return Promise.resolve();
      }
      if (p === 'github') {
        // Redirección OAuth; el servidor hace el intercambio en /auth/github/callback.
        window.location.href = '/auth/github/start';
        return Promise.resolve();
      }
      // Otros proveedores aún no conectados.
      toast(t('login.toastConnecting', { name: names[p] }));
      return Promise.resolve();
    },
    // Login por idToken (Google Identity / One Tap). El navegador obtiene el
    // "credential" y aquí se manda al servidor, que lo verifica y deja la cookie.
    googleToken: function(credential, nonce){
      return fetch(API_BASE + '/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NubiFly-Client': 'web' },
        credentials: 'include',
        body: JSON.stringify({ credential: credential, nonce: nonce })
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(body){
          if (!r.ok) throw new Error(body.error || 'No se pudo entrar con Google.');
          window.location.href = '/main';
          return body;
        });
      });
    },
    guest: function(){
      // Crea una cuenta de invitado temporal (prueba de 24 h) y entra a la app.
      return fetch(API_BASE + '/api/v1/account/guest', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-NubiFly-Client': 'web' },
        body: JSON.stringify({ language: detectedLang() })
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(body){
          if (!r.ok) throw new Error(body.error || 'No se pudo iniciar como invitado.');
          window.location.href = '/main';
          return body;
        });
      });
    },
    reset: function(email){
      // Firebase: sendPasswordResetEmail(auth, email)
      return Promise.resolve();
    }
  };

  /* =========================================================
     GOOGLE IDENTITY (One Tap) — opcional, no obligatorio.
     Muestra el aviso de "una pulsación" de Google. Si el usuario lo cierra o
     el navegador no lo muestra (FedCM, cooldown, ajustes), NO pasa nada: se
     ignora en silencio. El botón "Continuar con Google" siempre sigue
     disponible con el flujo de redirección. Así se evita el "me lo cancelaba".
     ========================================================= */
  function initGoogleOneTap(){
    // 1) Pide al servidor el client_id (no es secreto; va en el navegador).
    fetch(API_BASE + '/auth/google', { credentials:'include', cache:'no-store', headers: { 'X-NubiFly-Client': 'web' } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(cfg){
        if (!cfg || !cfg.configured || !cfg.clientId) return;  // sin configurar → solo redirección
        loadGsi(function(){
          if (!(window.google && google.accounts && google.accounts.id)) return;
          try {
            google.accounts.id.initialize({
              client_id: cfg.clientId,
              callback: onGoogleCredential,
              auto_select: false,
              cancel_on_tap_outside: true,
              use_fedcm_for_prompt: true,
              context: 'signin'
            });
            // Muestra One Tap. El callback recibe el "momento": si no se mostró
            // o el usuario lo cerró/omitió, NO lo tratamos como error.
            google.accounts.id.prompt(function(/* notification */){ /* cancelado = sin acción */ });
          } catch (e) { /* silencio: queda el botón de redirección */ }
        });
      })
      .catch(function(){ /* sin red: queda el botón de redirección */ });
  }

  // Recibe el credential (idToken) de Google y lo valida en el servidor.
  function onGoogleCredential(resp){
    if (!resp || !resp.credential) return;  // cancelado / vacío → sin acción
    Auth.googleToken(resp.credential).catch(function(err){
      toast(err && err.message ? err.message : t('login.toastProviderError', { name:'Google' }));
    });
  }

  // Carga el script de Google Identity una sola vez. Si falla (sin red o
  // bloqueado), no rompe: simplemente no habrá One Tap.
  var _gsiLoading = false;
  function loadGsi(cb){
    if (window.google && google.accounts && google.accounts.id) return cb();
    if (_gsiLoading) { var iv = setInterval(function(){ if (window.google && google.accounts && google.accounts.id){ clearInterval(iv); cb(); } }, 120); setTimeout(function(){ clearInterval(iv); }, 6000); return; }
    _gsiLoading = true;
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = function(){ cb(); };
    s.onerror = function(){ _gsiLoading = false; };  // sin One Tap; queda el botón
    document.head.appendChild(s);
  }

  /* ---------- Arranque ---------- */
  setMode(false);
  initGoogleOneTap();

  // Mensaje si el login con Google falló (vuelve con ?error=google...).
  try {
    var errCode = new URLSearchParams(location.search).get('error');
    if (errCode) {
      var msgs = {
        google: 'No se pudo entrar con Google. Inténtalo de nuevo.',
        google_state: 'La sesión de Google caducó. Inténtalo de nuevo.',
        google_token: 'No se pudo validar con Google. Revisa la configuración e inténtalo de nuevo.',
        google_profile: 'Google no compartió tu correo. Inténtalo de nuevo.',
        google_config: 'El acceso con Google aún no está configurado.',
        github: 'No se pudo entrar con GitHub. Inténtalo de nuevo.',
        github_state: 'La sesión de GitHub caducó. Inténtalo de nuevo.',
        github_token: 'No se pudo validar con GitHub. Revisa la configuración e inténtalo de nuevo.',
        github_profile: 'GitHub no compartió tu perfil. Inténtalo de nuevo.',
        github_email: 'Tu cuenta de GitHub no tiene un correo verificado.',
        github_config: 'El acceso con GitHub aún no está configurado.'
      };
      setTimeout(function(){ toast(msgs[errCode] || 'No se pudo completar el acceso.'); }, 300);
      history.replaceState(null, '', location.pathname);  // limpia la URL
    }
  } catch (e) {}
})();
