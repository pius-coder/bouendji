/*
 * Console d'administration — SPA statique.
 *
 * Ce fichier vise les routes réellement écrites dans apps/api/src/routes/admin.ts.
 * Toutes les routes sont sous /v1/admin et relatives à l'origine : aucun hôte
 * n'est codé en dur. Le serveur Fastify sert cette page sous /admin/.
 *
 * POST /v1/admin/auth/login est écrite dans routes/adminAuth.ts : la connexion
 * délivre un jeton de 8 h, sans jeton préalable. Elle est limitée par IP et par
 * compte, et une connexion réussie laisse une ligne d'audit.
 *
 * Contraintes tenues :
 *   - aucun build, aucune dépendance, aucun CDN ;
 *   - le jeton ne vit que dans cette closure (jamais stockage, cookie ni URL) ;
 *   - un seul appel réseau, `request()`, qui exige un jeton avant d'appeler
 *     fetch pour toute requête authentifiée ;
 *   - aucun balisage serveur injecté : tout passe par textContent.
 */
(function () {
  'use strict';

  var IS_FILE = window.location.protocol === 'file:';
  var API_BASE = '';
  var ADMIN = '/v1/admin';

  var STATUS_LABEL = {
    active: 'Actif',
    suspended: 'Suspendue',
    disabled: 'Désactivé',
    revoked: 'Révoqué',
    pending: 'En attente',
    paid: 'Payée',
    failed: 'Échouée',
    refunded: 'Remboursée',
    expired: 'Expirée',
    healthy: 'Sain',
    degraded: 'Dégradé',
    down: 'Hors service',
    draining: 'En drainage',
    available: 'Disponible',
    approved: 'Approuvé',
    rejected: 'Rejeté',
    reversed: 'Annulée',
    created: 'Créé',
    running: 'En cours',
    succeeded: 'Réussi',
    unknown: 'Inconnu'
  };

  var ROLE_LABEL = {
    owner: 'Propriétaire',
    community_admin: 'Administrateur de communauté',
    support: 'Support',
    finance: 'Finance'
  };

  var STAFF_ROLES = ['community_admin', 'support', 'finance'];

  var API = {
    login: function () { return ADMIN + '/auth/login'; },
    me: function () { return ADMIN + '/me'; },
    communities: function () { return ADMIN + '/communities'; },
    community: function (id) { return ADMIN + '/communities/' + encodeURIComponent(id); },
    memberships: function (communityId) {
      return ADMIN + '/communities/' + encodeURIComponent(communityId) + '/memberships';
    },
    membership: function (id) { return ADMIN + '/memberships/' + encodeURIComponent(id); },
    admins: function () { return ADMIN + '/admins'; },
    orders: function (communityId, query) {
      return ADMIN + '/communities/' + encodeURIComponent(communityId) + '/orders' + qs(query);
    },
    commissions: function (communityId, query) {
      return ADMIN + '/communities/' + encodeURIComponent(communityId) + '/commissions' + qs(query);
    },
    devices: function (communityId) {
      return ADMIN + '/communities/' + encodeURIComponent(communityId) + '/devices';
    },
    revoke: function (deviceId) {
      return ADMIN + '/devices/' + encodeURIComponent(deviceId) + '/revoke';
    },
    offlineBundle: function (deviceId) {
      return ADMIN + '/devices/' + encodeURIComponent(deviceId) + '/offline-bundles';
    },
    pool: function () { return ADMIN + '/pool'; },
    audit: function (query) { return ADMIN + '/audit-log' + qs(query); }
  };

  var SCREENS = {
    overview: 'Vue d’ensemble',
    communities: 'Communautés',
    members: 'Membres',
    orders: 'Commandes et commissions',
    network: 'Réseau',
    bundles: 'Bundles hors-ligne',
    audit: 'Journal d’audit'
  };

  var state = {
    token: null,
    admin: null,
    expiresAt: null,
    expiryTimer: null,
    renderToken: 0,
    communities: null,
    communityId: null,
    editCommunityId: null,
    lastAdminId: null,
    issuedBundles: []
  };

  var filters = {
    orders: { status: '' },
    commissions: { status: '' },
    audit: { communityId: '', limit: 50 }
  };

  var view = null;
  var nav = null;
  var bannerEl = null;
  var identityEl = null;
  var logoutBtn = null;
  var bannerTimer = null;
  var idSeq = 0;

  /* -------------------------------------------------------------- utilitaires */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    var p = props || {};
    if (p.class) node.className = p.class;
    if (p.text !== undefined && p.text !== null) node.textContent = String(p.text);
    if (p.attrs) {
      Object.keys(p.attrs).forEach(function (key) {
        var value = p.attrs[key];
        if (value === false || value === null || value === undefined) return;
        node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    if (p.on) {
      Object.keys(p.on).forEach(function (eventName) {
        node.addEventListener(eventName, p.on[eventName]);
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === undefined || children === null) return;
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    });
  }

  function get(object, camelName) {
    if (!object || typeof object !== 'object') return undefined;
    if (camelName in object) return object[camelName];
    var snake = camelName.replace(/[A-Z]/g, function (letter) { return '_' + letter.toLowerCase(); });
    return object[snake];
  }

  function asString(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  function numberOrNull(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function asIso(value) {
    if (typeof value !== 'string' || !value) return null;
    return Number.isFinite(Date.parse(value)) ? value : null;
  }

  function items(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function qs(params) {
    var search = new URLSearchParams();
    if (params) {
      Object.keys(params).forEach(function (key) {
        var value = params[key];
        if (value === undefined || value === null || value === '') return;
        search.set(key, String(value));
      });
    }
    var built = search.toString();
    return built ? '?' + built : '';
  }

  function intFormat(value) {
    var n = numberOrNull(value);
    if (n === null) return '—';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  }

  function countLabel(count, singular, plural) {
    var n = numberOrNull(count);
    if (n === null) return '—';
    return intFormat(n) + ' ' + (n === 1 ? singular : plural);
  }

  function money(value) {
    var n = numberOrNull(value);
    if (n === null) return '—';
    return intFormat(n) + '\u00a0XAF';
  }

  function bpsPercent(value) {
    var n = numberOrNull(value);
    if (n === null) return '—';
    return (n / 100).toFixed(2).replace('.', ',') + '\u00a0%';
  }

  function dateTime(value) {
    var iso = asIso(value);
    if (!iso) return '—';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  }

  function relative(value) {
    var iso = asIso(value);
    if (!iso) return '—';
    var diff = Date.parse(iso) - Date.now();
    var abs = Math.abs(diff);
    var minutes = Math.round(abs / 60000);
    if (minutes < 1) return diff >= 0 ? 'dans moins d’une minute' : 'à l’instant';
    if (minutes < 60) return diff >= 0 ? 'dans ' + minutes + ' min' : 'il y a ' + minutes + ' min';
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours < 48) {
      var hourText = diff >= 0 ? 'dans ' + hours + ' h' : 'il y a ' + hours + ' h';
      return rest && diff >= 0 ? hourText + ' ' + rest + ' min' : hourText;
    }
    var days = Math.floor(hours / 24);
    return diff >= 0 ? 'dans ' + days + ' j' : 'il y a ' + days + ' j';
  }

  function timeTag(iso) {
    var valid = asIso(iso);
    if (!valid) return document.createTextNode('—');
    return el('time', { text: dateTime(valid), attrs: { datetime: valid, title: dateTime(valid) } });
  }

  function shortRef(value) {
    var text = asString(value);
    if (!text) return '—';
    return text.length > 12 ? text.slice(0, 12) + '…' : text;
  }

  /**
   * Enregistre un objet JSON sous forme de fichier. Aucun réseau : le contenu
   * est déjà en mémoire, et il ne doit pas transiter par une URL (le jeton
   * n'apparaît jamais dans l'historique du navigateur).
   */
  function downloadJson(filename, data) {
    try {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = asString(filename) || 'bundle.json';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (error) {
      showBanner('Le navigateur a refusé le téléchargement. Copiez le fichier depuis un autre navigateur.', 'error');
    }
  }

  function refNode(value) {
    var text = asString(value);
    if (!text) return document.createTextNode('—');
    return el('span', {
      class: 'mono',
      text: shortRef(text),
      attrs: { title: text }
    });
  }

  function option(value, label) {
    return el('option', { text: label, attrs: { value: value } });
  }

  function pill(value) {
    var key = asString(value).toLowerCase();
    var label = STATUS_LABEL[key] || (key || 'Inconnu');
    return el('span', { class: 'pill', text: label, attrs: { 'data-state': key || 'unknown' } });
  }

  function roleLabel(role) {
    return ROLE_LABEL[role] || '—';
  }

  function field(labelText, control, hint) {
    var id = control.id || 'field-' + (++idSeq);
    control.id = id;
    var hintNode = null;
    if (hint) {
      hintNode = el('p', { class: 'hint', text: hint, attrs: { id: id + '-hint' } });
      control.setAttribute('aria-describedby', id + '-hint');
    }
    return el('div', { class: 'field' }, [
      el('label', { text: labelText, attrs: { for: id } }),
      control,
      hintNode
    ]);
  }

  function input(props) {
    var attrs = props.attrs || {};
    attrs.type = attrs.type || 'text';
    if (!attrs.id) attrs.id = 'input-' + (++idSeq);
    if (!attrs.name) attrs.name = attrs.id;
    if (!attrs.autocomplete) attrs.autocomplete = 'off';
    return el('input', { class: props.class || 'input', attrs: attrs, on: props.on });
  }

  function selectControl(options, value, onChange, attrs) {
    var node = el('select', {
      class: 'select',
      attrs: attrs || {},
      on: {
        change: function () {
          if (onChange) onChange(node.value);
        }
      }
    });
    if (!node.id) node.id = 'select-' + (++idSeq);
    if (!node.name) node.name = node.id;
    options.forEach(function (entry) {
      node.appendChild(option(entry.value, entry.label));
    });
    node.value = value;
    return node;
  }

  function sectionHead(title, description, actions) {
    return el('div', { class: 'section-head' }, [
      el('div', {}, [
        el('h1', { text: title }),
        description ? el('p', { class: 'lede', text: description }) : null
      ]),
      actions && actions.length ? el('div', { class: 'actions' }, actions) : null
    ]);
  }

  function loadingBlock() {
    return el('div', { class: 'loading', attrs: { role: 'status' } }, el('p', { class: 'muted', text: 'Chargement…' }));
  }

  function emptyPanel(title, message) {
    return el('section', { class: 'panel empty' }, [
      el('h2', { text: title }),
      el('p', { text: message })
    ]);
  }

  function notice(message) {
    return el('p', { class: 'notice', text: message });
  }

  function formErrorNode() {
    return el('p', { class: 'form-error', attrs: { role: 'alert', hidden: '' } });
  }

  function setFormError(node, message) {
    node.textContent = message;
    node.hidden = !message;
  }

  function accessPanel(title, message) {
    return el('section', { class: 'panel error-panel' }, [
      el('h1', { text: title }),
      el('p', { text: message }),
      el('p', {}, el('a', { href: '#/overview', text: 'Revenir à la vue d’ensemble' }))
    ]);
  }

  function failurePanel(error, retry) {
    var detail = [];
    if (error && error.status) detail.push('HTTP ' + error.status);
    if (error && error.code) detail.push(error.code);
    if (error && error.retryAfter) detail.push('réessayer dans ' + error.retryAfter + ' s');
    var details = null;
    if (error && error.details) {
      var entries = Object.keys(error.details).map(function (key) {
        return el('div', {}, [
          el('dt', { text: key }),
          el('dd', { text: asString(error.details[key]) || 'Valeur refusée' })
        ]);
      });
      if (entries.length) details = el('dl', { class: 'details' }, entries);
    }
    return el('section', { class: 'panel error-panel', attrs: { role: 'alert' } }, [
      el('h2', { text: 'Chargement impossible' }),
      el('p', { text: (error && error.message) || 'La requête n’a pas abouti.' }),
      detail.length ? el('p', { class: 'meta mono', text: detail.join(' · ') }) : null,
      details,
      retry ? el('button', {
        class: 'button',
        text: 'Réessayer',
        attrs: { type: 'button' },
        on: { click: retry }
      }) : null
    ]);
  }

  function withBusy(button, label, task) {
    var previous = button.textContent;
    button.disabled = true;
    button.textContent = label;
    return Promise.resolve()
      .then(task)
      .finally(function () {
        button.disabled = false;
        button.textContent = previous;
      });
  }

  /* ------------------------------------------------------------------- API */

  function ApiError(status, code, message, details, extra) {
    this.name = 'ApiError';
    this.status = status || 0;
    this.code = code || '';
    this.message = message || 'Erreur inconnue.';
    this.details = details || null;
    this.retryAfter = extra && extra.retryAfter ? extra.retryAfter : null;
    this.requestId = extra && extra.requestId ? extra.requestId : null;
    this.handled = false;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function networkMessage() {
    if (IS_FILE) {
      return 'Cette page est ouverte en file:// : les appels sont relatifs à l’origine et ne peuvent pas aboutir. Ouvrez la console via /admin/, servie par l’API.';
    }
    return 'Impossible de joindre l’API. Vérifiez la connexion réseau, puis réessayez.';
  }

  /*
   * Unique point d'appel réseau du fichier. Toute requête authentifiée exige
   * un jeton AVANT d'appeler fetch : sans jeton, aucune requête ne part.
   */
  function request(path, options) {
    var opts = options || {};
    var authenticated = opts.auth !== false;
    if (authenticated && !state.token) {
      return Promise.reject(new ApiError(401, 'UNAUTHENTICATED', 'Aucune session active.'));
    }

    var headers = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (authenticated) headers.authorization = 'Bearer ' + state.token;

    var init = {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'omit',
      cache: 'no-store'
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    return fetch(API_BASE + path, init).then(function (response) {
      return response.text().then(function (raw) {
        var payload = null;
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch (parseError) {
            throw new ApiError(response.status, 'BAD_RESPONSE', 'La réponse de l’API n’est pas du JSON lisible.');
          }
        }

        if (response.ok) return payload;

        var apiError = payload && payload.error && typeof payload.error === 'object' ? payload.error : {};
        var failure = new ApiError(
          response.status,
          asString(apiError.code),
          asString(apiError.message) || 'La requête a été refusée (HTTP ' + response.status + ').',
          apiError.details && typeof apiError.details === 'object' ? apiError.details : null,
          { retryAfter: apiError.retryAfter, requestId: apiError.requestId }
        );

        if (response.status === 401 && authenticated) {
          failure.handled = true;
          endSession('expired');
        } else if (response.status === 403) {
          showBanner('Accès refusé : votre rôle ne permet pas cette opération.', 'error');
        }
        throw failure;
      });
    }, function () {
      throw new ApiError(0, 'NETWORK', networkMessage());
    });
  }

  /* ---------------------------------------------------------- normalisation */

  function normalizeAdmin(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new ApiError(200, 'BAD_RESPONSE', 'L’API n’a pas renvoyé d’identité administrateur.');
    }
    var memberships = [];
    var rawMemberships = Array.isArray(raw.memberships) ? raw.memberships : [];
    rawMemberships.forEach(function (membership) {
      if (!membership || typeof membership !== 'object') return;
      var communityId = asString(get(membership, 'communityId'));
      var role = asString(membership.role);
      if (!communityId || STAFF_ROLES.indexOf(role) === -1) return;
      memberships.push({ communityId: communityId, role: role });
    });
    return {
      adminId: asString(get(raw, 'adminId')) || asString(raw.id),
      email: asString(raw.email),
      name: asString(raw.name) || asString(raw.email) || 'Administrateur',
      platformRole: raw.platformRole === 'owner' ? 'owner' : 'none',
      memberships: memberships
    };
  }

  function normalizeCommunity(raw) {
    return {
      id: asString(raw.id),
      name: asString(raw.name) || 'Communauté sans nom',
      slug: asString(raw.slug),
      status: asString(raw.status) || 'unknown',
      commissionBps: numberOrNull(get(raw, 'commissionBps')),
      createdAt: asIso(get(raw, 'createdAt'))
    };
  }

  function normalizeMembership(raw) {
    return {
      id: asString(raw.id),
      adminUserId: asString(get(raw, 'adminUserId')),
      email: asString(raw.email),
      name: asString(raw.name),
      role: asString(raw.role),
      status: asString(raw.status) || 'unknown',
      createdAt: asIso(get(raw, 'createdAt'))
    };
  }

  function normalizeOrder(raw) {
    return {
      id: asString(raw.id),
      status: asString(raw.status) || 'unknown',
      currency: asString(raw.currency) || 'XAF',
      amountXaf: numberOrNull(get(raw, 'amountXaf')),
      commissionBps: numberOrNull(get(raw, 'commissionBps')),
      commissionXaf: numberOrNull(get(raw, 'commissionXaf')),
      createdAt: asIso(get(raw, 'createdAt')),
      paidAt: asIso(get(raw, 'paidAt'))
    };
  }

  function normalizeCommission(raw) {
    return {
      id: asString(raw.id),
      orderId: asString(get(raw, 'orderId')),
      bps: numberOrNull(raw.bps),
      amountXaf: numberOrNull(get(raw, 'amountXaf')),
      status: asString(raw.status) || 'unknown',
      createdAt: asIso(get(raw, 'createdAt')),
      availableAt: asIso(get(raw, 'availableAt'))
    };
  }

  /*
   * Liste blanche stricte : le pool de l'API ne contient déjà ni UUID, ni chemin
   * WebSocket, ni credential. Ce normaliseur garantit qu'un champ ajouté plus
   * tard ne peut pas atteindre le DOM par accident : seuls ces champs existent.
   */
  function normalizeEndpoint(raw) {
    return {
      label: asString(raw.label) || 'Nœud sans libellé',
      region: asString(raw.region),
      capacity: numberOrNull(raw.capacity),
      inUse: numberOrNull(get(raw, 'inUse')),
      status: asString(raw.status) || 'unknown',
      health: asString(raw.health) || 'unknown',
      latencyMs: numberOrNull(get(raw, 'latencyMs')),
      lastSeenAt: asIso(get(raw, 'lastSeenAt')),
      expiresAt: asIso(get(raw, 'expiresAt'))
    };
  }

  function normalizeDevice(raw) {
    return {
      deviceId: asString(get(raw, 'deviceId')),
      name: asString(raw.name) || 'Appareil sans nom',
      platform: asString(raw.platform),
      status: asString(raw.status) || 'unknown',
      lastSeenAt: asIso(get(raw, 'lastSeenAt')),
      revokedAt: asIso(get(raw, 'revokedAt'))
    };
  }

  function normalizeAudit(raw) {
    return {
      id: asString(raw.id),
      action: asString(raw.action) || '—',
      actorRole: asString(get(raw, 'actorRole')) || '—',
      targetType: asString(get(raw, 'targetType')) || '—',
      communityId: asString(get(raw, 'communityId')),
      createdAt: asIso(get(raw, 'createdAt'))
    };
  }

  /* --------------------------------------------------------------- session */

  function endSession(reason) {
    state.token = null;
    state.admin = null;
    state.expiresAt = null;
    state.communities = null;
    state.communityId = null;
    state.editCommunityId = null;
    state.lastAdminId = null;
    state.issuedBundles = [];
    if (state.expiryTimer) window.clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
    updateChrome('');
    if (reason === 'expired') {
      showBanner('Session expirée. Reconnectez-vous pour continuer.', 'error');
    } else if (reason === 'logout') {
      showBanner('Session fermée.', 'ok');
    }
    if (window.location.hash !== '#/login') {
      window.location.hash = '#/login';
    } else {
      renderRoute();
    }
  }

  function handleLogout() {
    /* Aucune route de déconnexion administrateur n'existe : le jeton étant
       uniquement en mémoire, le fait d'oublier la variable suffit. */
    endSession('logout');
  }

  function scheduleExpiry() {
    if (state.expiryTimer) window.clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
    if (!state.expiresAt) return;
    state.expiryTimer = window.setTimeout(function () {
      endSession('expired');
    }, Math.max(0, state.expiresAt - Date.now()));
  }

  function localRole(communityId) {
    if (!state.admin || !communityId) return null;
    var found = null;
    state.admin.memberships.forEach(function (membership) {
      if (membership.communityId === communityId) found = membership.role;
    });
    return found;
  }

  function hasAnyRole(roles) {
    if (!state.admin) return false;
    return state.admin.memberships.some(function (membership) {
      return roles.indexOf(membership.role) !== -1;
    });
  }

  function isOwner() {
    return !!state.admin && state.admin.platformRole === 'owner';
  }

  /* Réplique exacte de la matrice de routes/admin.ts. */
  function can(capability, communityId) {
    if (!state.admin) return false;
    if (isOwner()) return true;
    var local = communityId ? localRole(communityId) : null;
    switch (capability) {
      case 'community.read':
        return communityId ? local !== null : state.admin.memberships.length > 0;
      case 'community.manage':
        return false;
      case 'membership.read':
      case 'membership.write':
        return local === 'community_admin';
      case 'member.read':
        return local === 'community_admin' || local === 'support';
      case 'order.read':
        return local !== null || hasAnyRole(['finance']);
      case 'commission.read':
        return local === 'community_admin' || local === 'finance' || hasAnyRole(['finance']);
      case 'endpoint.read':
        return hasAnyRole(['community_admin', 'support']);
      case 'device.revoke':
      case 'offline_bundle.issue':
        return local === 'community_admin' || local === 'support';
      case 'audit.read':
        return local === 'community_admin';
      default:
        return false;
    }
  }

  function seesMoney(communityId) {
    if (!state.admin) return false;
    if (isOwner()) return true;
    var local = localRole(communityId);
    return local === 'community_admin' || local === 'finance';
  }

  function screenAllowed(screen) {
    if (!state.admin) return false;
    switch (screen) {
      case 'overview':
      case 'communities':
        return true;
      case 'members':
        return isOwner() || hasAnyRole(['community_admin']);
      case 'orders':
        return isOwner() || state.admin.memberships.length > 0;
      case 'network':
        return can('endpoint.read', null);
      case 'bundles':
        return isOwner() || hasAnyRole(['community_admin', 'support']);
      case 'audit':
        return isOwner() || hasAnyRole(['community_admin']);
      default:
        return false;
    }
  }

  function roleSummary() {
    if (!state.admin) return '';
    if (isOwner()) return 'Propriétaire';
    var parts = state.admin.memberships.map(function (membership) {
      var community = communityById(membership.communityId);
      var base = roleLabel(membership.role);
      return community ? base + ' — ' + community.name : base;
    });
    return parts.join(' · ') || 'Aucun périmètre';
  }

  /* ---------------------------------------------------------- communautés */

  function communityById(id) {
    if (!state.communities) return null;
    var found = null;
    state.communities.forEach(function (community) {
      if (community.id === id) found = community;
    });
    return found;
  }

  function ensureCommunities(force) {
    if (state.communities && !force) return Promise.resolve(state.communities);
    return request(API.communities()).then(function (payload) {
      state.communities = items(payload).map(normalizeCommunity).filter(function (community) {
        return !!community.id;
      });
      updateChrome(routeFromHash());
      return state.communities;
    });
  }

  function selectedCommunityId() {
    var list = state.communities || [];
    if (!list.length) return null;
    var exists = list.some(function (community) { return community.id === state.communityId; });
    if (!exists) state.communityId = list[0].id;
    return state.communityId;
  }

  function communityPicker(currentId, onChange, allowAll) {
    var options = allowAll ? [{ value: '', label: 'Toutes les communautés' }] : [];
    (state.communities || []).forEach(function (community) {
      options.push({
        value: community.id,
        label: community.name + (community.status === 'suspended' ? ' (suspendue)' : '')
      });
    });
    var control = selectControl(options, currentId || '', onChange);
    return field('Communauté', control, allowAll ? 'Sans filtre, le journal couvre toutes les communautés visibles.' : null);
  }

  /* ------------------------------------------------------------------ chrome */

  function showBanner(message, tone) {
    if (!bannerEl) return;
    if (bannerTimer) window.clearTimeout(bannerTimer);
    bannerTimer = null;
    bannerEl.dataset.tone = tone === 'error' ? 'error' : tone === 'ok' ? 'ok' : 'info';
    bannerEl.setAttribute('role', bannerEl.dataset.tone === 'error' ? 'alert' : 'status');
    bannerEl.replaceChildren(
      el('p', { class: 'banner-text', text: message }),
      el('button', {
        class: 'button button-quiet banner-close',
        text: 'Fermer',
        attrs: { type: 'button' },
        on: {
          click: function () {
            bannerEl.hidden = true;
          }
        }
      })
    );
    bannerEl.hidden = false;
    if (tone === 'ok') {
      bannerTimer = window.setTimeout(function () { bannerEl.hidden = true; }, 7000);
    }
  }

  function updateChrome(route) {
    var authenticated = !!state.token && !!state.admin;
    if (nav) nav.hidden = !authenticated;
    if (logoutBtn) logoutBtn.hidden = !authenticated;
    if (identityEl) {
      identityEl.hidden = !authenticated;
      identityEl.textContent = authenticated && state.admin
        ? state.admin.name + ' · ' + roleSummary()
        : '';
    }
    if (!nav) return;
    var links = nav.querySelectorAll('a[data-screen]');
    Array.prototype.forEach.call(links, function (link) {
      var screen = link.getAttribute('data-screen');
      link.hidden = authenticated ? !screenAllowed(screen) : false;
      if (authenticated && route === screen) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  /* ----------------------------------------------------------------- routeur */

  function routeFromHash() {
    return window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '').trim();
  }

  async function renderRoute() {
    if (!view) return;
    var run = ++state.renderToken;
    var route = routeFromHash();
    updateChrome(route);
    view.setAttribute('aria-busy', 'true');

    if (!state.token || !state.admin) {
      if (route && route !== 'login') {
        window.location.hash = '#/login';
      }
      renderLogin();
      view.setAttribute('aria-busy', 'false');
      return;
    }
    if (!route || route === 'login') {
      window.location.hash = '#/overview';
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(SCREENS, route)) {
      view.replaceChildren(accessPanel('Écran inconnu', 'Cette adresse ne correspond à aucun écran de la console.'));
      view.setAttribute('aria-busy', 'false');
      return;
    }
    if (!screenAllowed(route)) {
      view.replaceChildren(accessPanel('Accès refusé', 'Votre rôle ne donne accès à aucun contenu de cette section.'));
      view.setAttribute('aria-busy', 'false');
      return;
    }

    view.replaceChildren(loadingBlock());
    try {
      var node = await screens[route]();
      if (run !== state.renderToken) return;
      view.replaceChildren(node);
    } catch (error) {
      if (run !== state.renderToken || (error && error.handled)) return;
      view.replaceChildren(failurePanel(error, function () { renderRoute(); }));
    } finally {
      if (run === state.renderToken) view.setAttribute('aria-busy', 'false');
    }
  }

  /* ------------------------------------------------------------------- login */

  function renderLogin() {
    updateChrome('');
    var email = input({ attrs: { type: 'email', name: 'email', autocomplete: 'username', required: '', spellcheck: 'false', autofocus: '' } });
    var password = input({ attrs: { type: 'password', name: 'password', autocomplete: 'current-password', required: '' } });
    var errorNode = formErrorNode();
    var submit = el('button', { class: 'button button-primary', text: 'Se connecter', attrs: { type: 'submit' } });

    var form = el('form', { class: 'panel login-panel', attrs: { novalidate: '' } }, [
      el('h1', { text: 'Connexion' }),
      el('p', { class: 'lede', text: 'Accès réservé aux administrateurs de la plateforme et des communautés.' }),
      errorNode,
      field('Adresse email', email),
      field('Mot de passe', password),
      el('div', { class: 'actions' }, submit)
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var emailValue = email.value.trim();
      var passwordValue = password.value;
      if (!emailValue || !passwordValue) {
        setFormError(errorNode, 'Renseignez l’adresse email et le mot de passe.');
        (emailValue ? password : email).focus();
        return;
      }
      setFormError(errorNode, '');
      withBusy(submit, 'Connexion…', function () {
        return request(API.login(), {
          method: 'POST',
          auth: false,
          body: { email: emailValue, password: passwordValue }
        }).then(function (payload) {
          var token = asString(get(payload, 'accessToken')) || asString(get(payload, 'token'));
          if (!token) {
            throw new ApiError(200, 'BAD_RESPONSE', 'La connexion a répondu sans jeton de session.');
          }
          var expiresRaw = asString(get(payload, 'accessExpiresAt')) || asString(get(payload, 'expiresAt'));
          var expires = Date.parse(expiresRaw);
          state.token = token;
          state.expiresAt = Number.isFinite(expires) ? expires : null;
          scheduleExpiry();
          return request(API.me()).then(function (me) {
            state.admin = normalizeAdmin(me);
            updateChrome('');
            return ensureCommunities(true).catch(function () {
              state.communities = [];
              return state.communities;
            });
          }).then(function () {
            password.value = '';
            showBanner('Session ouverte.', 'ok');
            if (routeFromHash() === 'overview') {
              renderRoute();
            } else {
              window.location.hash = '#/overview';
            }
            if (view) view.focus();
          });
        }).catch(function (error) {
          state.token = null;
          state.admin = null;
          if (error && error.handled) return;
          if (error && error.status === 429) {
            setFormError(errorNode, 'Trop de tentatives. Attendez quelques minutes avant de réessayer.');
          } else if (error && error.status === 403) {
            setFormError(errorNode, 'Ce compte administrateur est désactivé.');
          } else if (error && error.status === 401) {
            setFormError(errorNode, 'Email ou mot de passe incorrect.');
          } else {
            setFormError(errorNode, (error && error.message) || 'Connexion impossible.');
          }
        });
      });
    });

    var notes = [
      el('p', { class: 'muted', text: 'Le jeton de session reste en mémoire de cet onglet. Un rechargement de la page impose une nouvelle connexion.' }),
      el('p', { class: 'muted', text: 'La connexion est limitée par adresse et par compte : après plusieurs échecs, il faut attendre.' })
    ];
    if (IS_FILE) {
      notes.push(el('p', { class: 'notice', text: 'Page ouverte en file:// : elle s’affiche pour inspection, mais les appels sont relatifs à l’origine et ne peuvent pas atteindre l’API. Servez la console via /admin/.' }));
    }

    view.replaceChildren(
      el('div', { class: 'login-wrap' }, [
        form,
        el('div', { class: 'login-notes' }, notes)
      ])
    );
  }

  /* -------------------------------------------------------------- composants */

  function metric(label, value, hint, tone) {
    return el('article', { class: 'metric', attrs: tone ? { 'data-tone': tone } : null }, [
      el('p', { class: 'metric-label', text: label }),
      el('p', { class: 'metric-value', text: value }),
      el('p', { class: 'metric-hint', text: hint })
    ]);
  }

  function fact(label, value) {
    return el('div', { class: 'fact' }, [
      el('dt', { text: label }),
      el('dd', { text: value })
    ]);
  }

  function table(caption, columns, rows, emptyMessage) {
    var thead = el('thead', {}, el('tr', {}, columns.map(function (column) {
      return el('th', {
        text: column.label,
        attrs: {
          scope: 'col',
          class: column.num ? 'num' : null
        }
      });
    })));
    var tbody = el('tbody', {});
    if (!rows.length) {
      tbody.appendChild(el('tr', {}, el('td', {
        text: emptyMessage,
        attrs: { colspan: String(columns.length) }
      })));
    } else {
      rows.forEach(function (row) { tbody.appendChild(row); });
    }
    return el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, [
      el('caption', { class: 'sr-only', text: caption }),
      thead,
      tbody
    ]));
  }

  function cell(label, content) {
    return el('td', { attrs: { 'data-label': label } }, content);
  }

  function actionButton(label, onClick, opts) {
    var options = opts || {};
    return el('button', {
      class: 'button button-compact' + (options.danger ? ' button-danger' : '') + (options.quiet ? ' button-quiet' : ''),
      text: label,
      attrs: { type: 'button' },
      on: { click: onClick }
    });
  }

  function runAction(button, label, task) {
    return withBusy(button, label, task).catch(function (error) {
      if (error && error.handled) return;
      showBanner((error && error.message) || 'L’opération a échoué.', 'error');
    });
  }

  /* --------------------------------------------------------- vue d'ensemble */

  async function screenOverview() {
    var communities = await ensureCommunities(true);
    var pool = null;
    var poolError = null;
    if (can('endpoint.read', null)) {
      try {
        pool = await request(API.pool());
      } catch (error) {
        if (error && error.handled) throw error;
        poolError = error;
      }
    }

    var endpoints = pool ? (Array.isArray(pool.endpoints) ? pool.endpoints : []).map(normalizeEndpoint) : null;
    var active = endpoints ? endpoints.filter(function (endpoint) { return endpoint.status === 'active'; }).length : null;
    var suspended = communities.filter(function (community) { return community.status === 'suspended'; }).length;
    var alerts = buildAlerts(communities, endpoints);
    var revision = pool ? numberOrNull(get(pool, 'poolRevision')) : null;

    var cards = el('div', { class: 'metrics' }, [
      metric('Communautés', intFormat(communities.length), suspended ? countLabel(suspended, 'suspendue', 'suspendues') : 'Aucune suspendue', suspended ? 'warn' : 'ok'),
      metric('Endpoints actifs', endpoints ? intFormat(active) : '—', endpoints ? 'Sur ' + intFormat(endpoints.length) + ' dans le pool' : poolError ? 'Pool indisponible' : 'Non accessible à votre rôle'),
      metric('Alertes', intFormat(alerts.length), alerts.length ? 'Détail ci-dessous' : 'Aucune anomalie détectée', alerts.length ? 'warn' : 'ok'),
      metric('Pool', revision === null ? '—' : intFormat(revision), revision === null ? 'Révision non disponible' : 'Révision publiée')
    ]);

    var facts = el('dl', { class: 'facts' }, [
      fact('Rôle', isOwner() ? 'Propriétaire' : 'Staff'),
      fact('Périmètre', countLabel(state.admin.memberships.length, 'communauté rattachée', 'communautés rattachées')),
      fact('Endpoints en drainage', endpoints ? intFormat(endpoints.filter(function (endpoint) { return endpoint.status === 'draining'; }).length) : '—'),
      fact('Endpoints dégradés', endpoints ? intFormat(endpoints.filter(function (endpoint) { return endpoint.health !== 'healthy'; }).length) : '—')
    ]);

    var communityRows = communities.map(function (community) {
      return el('tr', {}, [
        cell('Nom', el('span', { class: 'cell-title', text: community.name })),
        cell('Identifiant', el('span', { class: 'mono', text: community.slug || '—' })),
        cell('Statut', pill(community.status)),
        cell('Commission', bpsPercent(community.commissionBps)),
        cell('Créée le', timeTag(community.createdAt))
      ]);
    });

    var children = [
      sectionHead('Vue d’ensemble', 'État consolidé à partir des listes accessibles à votre rôle.', [
        el('button', {
          class: 'button button-quiet',
          text: 'Rafraîchir',
          attrs: { type: 'button' },
          on: { click: function () { renderRoute(); } }
        })
      ]),
      notice('L’API n’expose pas encore d’agrégat global (abonnés, revenus). Cette vue n’affiche que des chiffres calculés localement sur les listes accessibles, jamais une estimation.'),
      cards,
      facts
    ];

    children.push(el('div', { class: 'two-col' }, [
      alertPanel(alerts, poolError),
      el('section', { class: 'panel' }, [
        el('h2', { text: 'Communautés' }),
        communities.length
          ? table('Communautés visibles', [
            { label: 'Nom' },
            { label: 'Identifiant' },
            { label: 'Statut' },
            { label: 'Commission' },
            { label: 'Créée le' }
          ], communityRows, '')
          : el('p', { class: 'muted', text: 'Aucune communauté n’est rattachée à ce compte.' })
      ])
    ]));

    return el('section', { class: 'stack' }, children);
  }

  function buildAlerts(communities, endpoints) {
    var alerts = [];
    communities.forEach(function (community) {
      if (community.status === 'suspended') {
        alerts.push({ tone: 'warn', text: community.name + ' est suspendue.', detail: 'Les accès de cette communauté sont bloqués.' });
      }
    });
    if (!endpoints) return alerts;
    var soon = 60 * 60 * 1000; /* seuil d'affichage, pas une limite d'API */
    endpoints.forEach(function (endpoint) {
      var expires = endpoint.expiresAt ? Date.parse(endpoint.expiresAt) : NaN;
      if (Number.isFinite(expires) && expires <= Date.now()) {
        alerts.push({ tone: 'danger', text: endpoint.label + ' est expiré.', detail: dateTime(endpoint.expiresAt) });
      } else if (Number.isFinite(expires) && expires - Date.now() < soon) {
        alerts.push({ tone: 'warn', text: endpoint.label + ' expire ' + relative(endpoint.expiresAt) + '.', detail: dateTime(endpoint.expiresAt) });
      }
      if (endpoint.health === 'down') {
        alerts.push({ tone: 'danger', text: endpoint.label + ' ne répond plus.', detail: 'Dernière vue : ' + dateTime(endpoint.lastSeenAt) });
      } else if (endpoint.health === 'degraded') {
        alerts.push({ tone: 'warn', text: endpoint.label + ' est dégradé.', detail: endpoint.latencyMs !== null ? 'Latence : ' + intFormat(endpoint.latencyMs) + ' ms' : null });
      }
      if (endpoint.status === 'draining') {
        alerts.push({ tone: 'warn', text: endpoint.label + ' est en drainage.', detail: 'Il ne reçoit plus de nouveaux clients.' });
      }
    });
    return alerts;
  }

  function alertPanel(alerts, poolError) {
    var list = alerts.length
      ? el('ul', { class: 'alerts' }, alerts.map(function (alert) {
        return el('li', { attrs: { 'data-tone': alert.tone || 'warn' } }, [
          el('span', { text: alert.text }),
          alert.detail ? el('span', { class: 'meta', text: ' ' + alert.detail }) : null
        ]);
      }))
      : el('p', { class: 'muted', text: 'Aucune alerte : aucune communauté suspendue, aucun endpoint expiré, dégradé ou en drainage.' });

    return el('section', { class: 'panel' }, [
      el('h2', { text: 'Alertes' }),
      list,
      poolError ? el('p', { class: 'form-error', text: 'Le pool n’a pas pu être chargé : ' + ((poolError && poolError.message) || 'erreur inconnue') }) : null
    ]);
  }

  /* ----------------------------------------------------------- communautés */

  async function screenCommunities() {
    var communities = await ensureCommunities(true);
    var owner = isOwner();
    var errorNode = formErrorNode();
    var name = input({ attrs: { type: 'text', name: 'name', required: '', minlength: '2', maxlength: '120', placeholder: 'Nom affiché' } });
    var slug = input({ attrs: { type: 'text', name: 'slug', required: '', pattern: '[a-z0-9]+(-[a-z0-9]+)*', maxlength: '64', placeholder: 'exemple-communaute', spellcheck: 'false' } });
    var commission = input({ attrs: { type: 'number', name: 'commission', min: '0', max: '100', step: '0.01', value: '20' } });
    var submit = el('button', { class: 'button button-primary', text: 'Créer la communauté', attrs: { type: 'submit' } });

    var createForm = owner
      ? el('form', { class: 'panel', attrs: { novalidate: '' } }, [
        el('h2', { text: 'Créer une communauté' }),
        errorNode,
        el('div', { class: 'form-grid' }, [
          field('Nom', name),
          field('Identifiant (slug)', slug, 'Minuscules, chiffres et tirets uniquement.'),
          field('Commission', commission, 'Pourcentage des ventes reversé à la communauté (0 à 100).'),
          el('div', { class: 'actions span-all' }, submit)
        ])
      ])
      : null;

    if (createForm) {
      createForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var nameValue = name.value.trim();
        var slugValue = slug.value.trim();
        var percent = numberOrNull(commission.value);
        if (nameValue.length < 2) { setFormError(errorNode, 'Le nom doit contenir au moins 2 caractères.'); name.focus(); return; }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugValue)) {
          setFormError(errorNode, 'L’identifiant doit être en minuscules, chiffres et tirets, sans tiret au début ni à la fin.');
          slug.focus();
          return;
        }
        if (percent === null || percent < 0 || percent > 100) {
          setFormError(errorNode, 'La commission doit être comprise entre 0 et 100 %.');
          commission.focus();
          return;
        }
        setFormError(errorNode, '');
        runAction(submit, 'Création…', function () {
          return request(API.communities(), {
            method: 'POST',
            body: { name: nameValue, slug: slugValue, commissionBps: Math.round(percent * 100) }
          }).then(function () {
            showBanner('Communauté créée.', 'ok');
            renderRoute();
          });
        });
      });
    }

    var rows = communities.map(function (community) {
      var actions = [];
      if (owner) {
        var nextStatus = community.status === 'suspended' ? 'active' : 'suspended';
        actions.push(actionButton(community.status === 'suspended' ? 'Reprendre' : 'Suspendre', function (event) {
          var button = event.currentTarget;
          if (nextStatus === 'suspended' && !window.confirm('Suspendre « ' + community.name + ' » ? Les accès de ses abonnés seront bloqués.')) return;
          runAction(button, 'En cours…', function () {
            return request(API.community(community.id), {
              method: 'PATCH',
              body: { status: nextStatus }
            }).then(function () {
              showBanner(nextStatus === 'suspended' ? 'Communauté suspendue.' : 'Communauté réactivée.', 'ok');
              renderRoute();
            });
          });
        }, { quiet: true, danger: nextStatus === 'suspended' }));
      }
      return el('tr', {}, [
        cell('Nom', el('div', {}, [
          el('span', { class: 'cell-title', text: community.name }),
          el('span', { class: 'meta mono', text: community.slug || '' })
        ])),
        cell('Statut', pill(community.status)),
        cell('Commission', bpsPercent(community.commissionBps)),
        cell('Créée le', timeTag(community.createdAt)),
        cell('Actions', el('div', { class: 'row-actions' }, actions.length ? actions : '—'))
      ]);
    });

    var editId = state.editCommunityId;
    if (!editId || !communities.some(function (community) { return community.id === editId; })) {
      editId = communities.length ? communities[0].id : '';
    }
    var editing = communityById(editId);
    var editPercent = input({ attrs: { type: 'number', min: '0', max: '100', step: '0.01', value: editing && editing.commissionBps !== null ? (editing.commissionBps / 100).toFixed(2) : '20' } });
    var editSubmit = el('button', { class: 'button button-primary', text: 'Enregistrer la commission', attrs: { type: 'submit' } });
    var editError = formErrorNode();
    var editForm = owner && communities.length
      ? el('form', { class: 'panel', attrs: { novalidate: '' } }, [
        el('h2', { text: 'Modifier la commission' }),
        editError,
        el('div', { class: 'form-grid' }, [
          field('Communauté', selectControl(communities.map(function (community) {
            return { value: community.id, label: community.name };
          }), editId, function (value) {
            state.editCommunityId = value;
            renderRoute();
          })),
          field('Nouvelle commission', editPercent, 'Le changement est journalisé dans audit_log.'),
          el('div', { class: 'actions span-all' }, editSubmit)
        ])
      ])
      : null;

    if (editForm) {
      editForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var percent = numberOrNull(editPercent.value);
        if (percent === null || percent < 0 || percent > 100) {
          setFormError(editError, 'La commission doit être comprise entre 0 et 100 %.');
          editPercent.focus();
          return;
        }
        setFormError(editError, '');
        runAction(editSubmit, 'Enregistrement…', function () {
          return request(API.community(editId), {
            method: 'PATCH',
            body: { commissionBps: Math.round(percent * 100) }
          }).then(function () {
            showBanner('Commission mise à jour.', 'ok');
            renderRoute();
          });
        });
      });
    }

    var children = [
      sectionHead('Communautés', 'Création, suspension et taux de commission. Seul le propriétaire peut modifier une communauté.', []),
      notice('L’API renvoie au plus 200 communautés, les plus récentes.'),
      createForm,
      el('section', { class: 'panel panel-flush' }, [
        communities.length
          ? table('Liste des communautés', [
            { label: 'Nom' },
            { label: 'Statut' },
            { label: 'Commission' },
            { label: 'Créée le' },
            { label: 'Actions' }
          ], rows, '')
          : emptyPanel('Aucune communauté', 'Ce compte n’est rattaché à aucune communauté. Le propriétaire peut en créer une ci-dessus.')
      ]),
      editForm
    ];

    return el('section', { class: 'stack' }, children);
  }

  /* --------------------------------------------------------------- membres */

  async function screenMembers() {
    var communities = await ensureCommunities(false);
    if (!communities.length) {
      return el('section', { class: 'stack' }, [
        sectionHead('Membres', 'Personnel rattaché aux communautés.', []),
        emptyPanel('Aucune communauté', 'Aucune communauté n’est accessible à ce compte : il n’y a donc aucun membre à afficher.')
      ]);
    }
    var communityId = selectedCommunityId();
    if (!can('membership.read', communityId)) {
      return accessPanel('Membres', 'La gestion des membres est réservée au propriétaire et aux administrateurs de la communauté sélectionnée.');
    }

    var memberships = items(await request(API.memberships(communityId))).map(normalizeMembership);

    var rows = memberships.map(function (membership) {
      var self = state.admin && membership.adminUserId === state.admin.adminId;
      var roleSelect = selectControl(STAFF_ROLES.map(function (role) {
        return { value: role, label: roleLabel(role) };
      }), membership.role, function (value) {
        if (self) return;
        var select = roleSelect;
        withBusy(select, 'Enregistrement…', function () {
          return request(API.membership(membership.id), {
            method: 'PATCH',
            body: { role: value }
          }).then(function () {
            showBanner('Rôle mis à jour.', 'ok');
            renderRoute();
          });
        }).catch(function (error) {
          select.value = membership.role;
          if (error && error.handled) return;
          showBanner((error && error.message) || 'Le rôle n’a pas pu être modifié.', 'error');
        });
      });
      roleSelect.disabled = self || !can('membership.write', communityId);
      roleSelect.setAttribute('aria-label', 'Rôle de ' + (membership.name || membership.email || 'ce membre'));

      var toggle = null;
      if (!self && can('membership.write', communityId)) {
        if (membership.status === 'active') {
          toggle = actionButton('Désactiver', function (event) {
            var button = event.currentTarget;
            if (!window.confirm('Désactiver l’accès de ' + (membership.name || membership.email || 'ce membre') + ' ?')) return;
            runAction(button, 'En cours…', function () {
              return request(API.membership(membership.id), { method: 'DELETE' }).then(function () {
                showBanner('Membre désactivé.', 'ok');
                renderRoute();
              });
            });
          }, { quiet: true, danger: true });
        } else {
          toggle = actionButton('Réactiver', function (event) {
            runAction(event.currentTarget, 'En cours…', function () {
              return request(API.membership(membership.id), {
                method: 'PATCH',
                body: { status: 'active' }
              }).then(function () {
                showBanner('Membre réactivé.', 'ok');
                renderRoute();
              });
            });
          }, { quiet: true });
        }
      }

      return el('tr', {}, [
        cell('Membre', el('div', {}, [
          el('span', { class: 'cell-title', text: membership.name || membership.email || 'Compte sans nom' }),
          membership.email ? el('span', { class: 'meta', text: membership.email }) : null
        ])),
        cell('Rôle', roleSelect),
        cell('Statut', pill(membership.status)),
        cell('Depuis', timeTag(membership.createdAt)),
        cell('Action', el('div', { class: 'row-actions' }, toggle || (self ? 'Vous' : '—')))
      ]);
    });

    var addError = formErrorNode();
    var adminUserId = input({
      attrs: {
        type: 'text',
        name: 'adminUserId',
        required: '',
        maxlength: '190',
        spellcheck: 'false',
        placeholder: 'identifiant du compte administrateur'
      }
    });
    if (state.lastAdminId) adminUserId.value = state.lastAdminId;
    var role = selectControl(STAFF_ROLES.map(function (item) {
      return { value: item, label: roleLabel(item) };
    }), 'support', null);
    var addSubmit = el('button', { class: 'button button-primary', text: 'Ajouter le membre', attrs: { type: 'submit' } });

    var addForm = el('form', { class: 'panel', attrs: { novalidate: '' } }, [
      el('h2', { text: 'Ajouter un membre' }),
      addError,
      el('div', { class: 'form-grid' }, [
        field('Identifiant du compte', adminUserId, 'L’API attend l’identifiant admin (adminUserId), pas l’adresse email. Un compte existant est requis.'),
        field('Rôle dans la communauté', role),
        el('div', { class: 'actions span-all' }, addSubmit)
      ])
    ]);

    addForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = adminUserId.value.trim();
      if (!id) {
        setFormError(addError, 'Renseignez l’identifiant du compte administrateur.');
        adminUserId.focus();
        return;
      }
      setFormError(addError, '');
      runAction(addSubmit, 'Ajout…', function () {
        return request(API.memberships(communityId), {
          method: 'POST',
          body: { adminUserId: id, role: role.value }
        }).then(function () {
          state.lastAdminId = null;
          showBanner('Membre ajouté.', 'ok');
          renderRoute();
        });
      });
    });

    var adminPanel = null;
    if (isOwner()) {
      var adminError = formErrorNode();
      var adminEmail = input({ attrs: { type: 'email', name: 'adminEmail', required: '', maxlength: '190', autocomplete: 'off' } });
      var adminName = input({ attrs: { type: 'text', name: 'adminName', required: '', minlength: '2', maxlength: '120', autocomplete: 'off' } });
      var adminPassword = input({ attrs: { type: 'password', name: 'adminPassword', required: '', minlength: '12', maxlength: '256', autocomplete: 'new-password' } });
      var platformRole = selectControl([
        { value: 'none', label: 'Aucun rôle plateforme (staff)' },
        { value: 'owner', label: 'Propriétaire' }
      ], 'none', null);
      var adminSubmit = el('button', { class: 'button button-primary', text: 'Créer le compte', attrs: { type: 'submit' } });

      adminPanel = el('form', { class: 'panel', attrs: { novalidate: '' } }, [
        el('h2', { text: 'Créer un compte administrateur' }),
        el('p', { class: 'muted', text: 'Le mot de passe n’est jamais conservé par cette page. Il est transmis une fois à l’API, qui le hache.' }),
        adminError,
        el('div', { class: 'form-grid' }, [
          field('Adresse email', adminEmail),
          field('Nom', adminName),
          field('Mot de passe', adminPassword, '12 caractères minimum.'),
          field('Rôle plateforme', platformRole, 'Un rôle plateforme « owner » donne tous les droits ; sinon, ajoutez une appartenance ci-dessus.'),
          el('div', { class: 'actions span-all' }, adminSubmit)
        ])
      ]);

      adminPanel.addEventListener('submit', function (event) {
        event.preventDefault();
        var emailValue = adminEmail.value.trim();
        var nameValue = adminName.value.trim();
        var passwordValue = adminPassword.value;
        if (!emailValue || nameValue.length < 2 || passwordValue.length < 12) {
          setFormError(adminError, 'Email valide, nom d’au moins 2 caractères et mot de passe d’au moins 12 caractères requis.');
          return;
        }
        setFormError(adminError, '');
        withBusy(adminSubmit, 'Création…', function () {
          return request(API.admins(), {
            method: 'POST',
            body: {
              email: emailValue,
              name: nameValue,
              password: passwordValue,
              platformRole: platformRole.value
            }
          }).then(function (payload) {
            passwordValue = '';
            adminPassword.value = '';
            state.lastAdminId = asString(get(payload, 'adminId'));
            showBanner(state.lastAdminId ? 'Compte créé. Identifiant : ' + state.lastAdminId : 'Compte créé.', 'ok');
            renderRoute();
          });
        }).catch(function (error) {
          if (error && error.handled) return;
          setFormError(adminError, (error && error.message) || 'Création impossible.');
        });
      });
    }

    var children = [
      sectionHead('Membres', 'Personnel de la communauté sélectionnée. Les rôles sont locaux : une personne peut avoir un rôle différent dans chaque communauté.', []),
      el('div', { class: 'toolbar' }, [
        communityPicker(communityId, function (value) {
          state.communityId = value;
          renderRoute();
        })
      ]),
      el('section', { class: 'panel panel-flush' }, [
        memberships.length
          ? table('Membres de la communauté', [
            { label: 'Membre' },
            { label: 'Rôle' },
            { label: 'Statut' },
            { label: 'Depuis' },
            { label: 'Action' }
          ], rows, '')
          : emptyPanel('Aucun membre', 'Cette communauté n’a encore aucun membre du personnel.')
      ]),
      addForm,
      adminPanel
    ];

    return el('section', { class: 'stack' }, children);
  }

  /* ------------------------------------------------------ commandes et commissions */

  async function screenOrders() {
    var communities = await ensureCommunities(false);
    if (!communities.length) {
      return el('section', { class: 'stack' }, [
        sectionHead('Commandes et commissions', 'Ventes et reversements par communauté.', []),
        emptyPanel('Aucune communauté', 'Aucune communauté n’est accessible à ce compte.')
      ]);
    }
    var communityId = selectedCommunityId();
    if (!can('order.read', communityId)) {
      return accessPanel('Commandes', 'Votre rôle ne permet pas de lire les commandes de cette communauté.');
    }
    var showMoney = seesMoney(communityId);

    var ordersPayload = await request(API.orders(communityId, {
      limit: 20,
      status: filters.orders.status
    }));
    var orders = items(ordersPayload).map(normalizeOrder);
    var cursor = asString(get(ordersPayload, 'nextCursor')) || null;

    var commissions = null;
    var commissionsError = null;
    if (can('commission.read', communityId)) {
      try {
        commissions = items(await request(API.commissions(communityId, {
          limit: 100,
          status: filters.commissions.status
        }))).map(normalizeCommission);
      } catch (error) {
        if (error && error.handled) throw error;
        commissionsError = error;
      }
    }

    function orderRow(order) {
      return el('tr', {}, [
        cell('Date', timeTag(order.createdAt)),
        cell('Statut', pill(order.status)),
        cell('Montant', showMoney ? money(order.amountXaf) : el('span', { class: 'muted', text: 'masqué' })),
        cell('Taux', showMoney ? bpsPercent(order.commissionBps) : '—'),
        cell('Commission', showMoney ? money(order.commissionXaf) : '—'),
        cell('Référence', refNode(order.id))
      ]);
    }

    var orderBody = el('tbody', {});
    orders.forEach(function (order) { orderBody.appendChild(orderRow(order)); });
    if (!orders.length) {
      orderBody.appendChild(el('tr', {}, el('td', {
        text: 'Aucune commande pour ce filtre.',
        attrs: { colspan: '6' }
      })));
    }

    var more = el('button', { class: 'button', text: 'Charger plus', attrs: { type: 'button' } });
    var moreWrap = el('div', { class: 'table-footer' }, more);
    function refreshMore() {
      more.hidden = !cursor;
      more.disabled = !cursor;
    }
    refreshMore();
    more.addEventListener('click', function () {
      if (!cursor) return;
      withBusy(more, 'Chargement…', function () {
        return request(API.orders(communityId, {
          limit: 20,
          status: filters.orders.status,
          cursor: cursor
        })).then(function (next) {
          items(next).map(normalizeOrder).forEach(function (order) {
            if (orderBody.querySelector('td[colspan]')) orderBody.replaceChildren();
            orderBody.appendChild(orderRow(order));
          });
          cursor = asString(get(next, 'nextCursor')) || null;
          refreshMore();
        });
      }).catch(function (error) {
        if (error && error.handled) return;
        showBanner((error && error.message) || 'Chargement impossible.', 'error');
      });
    });

    var orderTable = el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, [
      el('caption', { class: 'sr-only', text: 'Commandes de la communauté' }),
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Date', attrs: { scope: 'col' } }),
        el('th', { text: 'Statut', attrs: { scope: 'col' } }),
        el('th', { text: 'Montant', attrs: { scope: 'col' } }),
        el('th', { text: 'Taux', attrs: { scope: 'col' } }),
        el('th', { text: 'Commission', attrs: { scope: 'col' } }),
        el('th', { text: 'Référence', attrs: { scope: 'col' } })
      ])),
      orderBody
    ]));

    var ordersPanel = el('section', { class: 'panel panel-flush' }, [
      el('div', { class: 'section-head' }, [
        el('div', {}, el('h2', { text: 'Commandes' })),
        el('div', { class: 'filters' }, [
          field('Statut', selectControl([
            { value: '', label: 'Tous les statuts' },
            { value: 'pending', label: 'En attente' },
            { value: 'paid', label: 'Payée' },
            { value: 'failed', label: 'Échouée' },
            { value: 'refunded', label: 'Remboursée' },
            { value: 'expired', label: 'Expirée' }
          ], filters.orders.status, function (value) {
            filters.orders.status = value;
            renderRoute();
          }))
        ])
      ]),
      orderTable,
      moreWrap
    ]);

    var commissionPanel;
    if (!can('commission.read', communityId)) {
      commissionPanel = notice('Les commissions ne sont pas accessibles à votre rôle.');
    } else if (commissionsError) {
      commissionPanel = failurePanel(commissionsError, function () { renderRoute(); });
    } else {
      var commissionRows = (commissions || []).map(function (commission) {
        return el('tr', {}, [
          cell('Date', timeTag(commission.createdAt)),
          cell('Commande', refNode(commission.orderId)),
          cell('Taux', bpsPercent(commission.bps)),
          cell('Montant', money(commission.amountXaf)),
          cell('Statut', pill(commission.status)),
          cell('Disponible le', timeTag(commission.availableAt))
        ]);
      });
      commissionPanel = el('section', { class: 'panel panel-flush' }, [
        el('div', { class: 'section-head' }, [
          el('div', {}, [
            el('h2', { text: 'Commissions' }),
            el('p', { class: 'muted', text: 'Les 100 dernières commissions de la communauté.' })
          ]),
          el('div', { class: 'filters' }, [
            field('Statut', selectControl([
              { value: '', label: 'Tous les statuts' },
              { value: 'pending', label: 'En attente' },
              { value: 'available', label: 'Disponible' },
              { value: 'paid', label: 'Payée' },
              { value: 'reversed', label: 'Annulée' }
            ], filters.commissions.status, function (value) {
              filters.commissions.status = value;
              renderRoute();
            }))
          ])
        ]),
        commissionRows.length
          ? table('Commissions de la communauté', [
            { label: 'Date' },
            { label: 'Commande' },
            { label: 'Taux' },
            { label: 'Montant' },
            { label: 'Statut' },
            { label: 'Disponible le' }
          ], commissionRows, '')
          : emptyPanel('Aucune commission', 'Aucune commission ne correspond à ce filtre.')
      ]);
    }

    return el('section', { class: 'stack' }, [
      sectionHead('Commandes et commissions', 'Montants en XAF. Les montants sont masqués par l’API pour les rôles qui n’y ont pas droit.', []),
      el('div', { class: 'toolbar' }, [
        communityPicker(communityId, function (value) {
          state.communityId = value;
          filters.orders.status = '';
          filters.commissions.status = '';
          renderRoute();
        })
      ]),
      showMoney ? null : notice('Votre rôle ne donne pas accès aux montants : les colonnes financières restent vides.'),
      ordersPanel,
      commissionPanel
    ]);
  }

  /* ---------------------------------------------------------------- réseau */

  async function screenNetwork() {
    if (!can('endpoint.read', null)) {
      return accessPanel('Réseau', 'La lecture du pool est réservée au propriétaire, aux administrateurs de communauté et au support.');
    }
    var payload = await request(API.pool());
    var endpoints = (Array.isArray(payload && payload.endpoints) ? payload.endpoints : []).map(normalizeEndpoint);
    var revision = numberOrNull(get(payload, 'poolRevision'));
    var count = numberOrNull(payload && payload.count);

    var active = endpoints.filter(function (endpoint) { return endpoint.status === 'active'; }).length;
    var degraded = endpoints.filter(function (endpoint) { return endpoint.health !== 'healthy'; }).length;
    var expiring = endpoints.filter(function (endpoint) {
      if (!endpoint.expiresAt) return false;
      return Date.parse(endpoint.expiresAt) - Date.now() < 60 * 60 * 1000;
    }).length;

    var cards = el('div', { class: 'metrics' }, [
      metric('Endpoints', intFormat(count === null ? endpoints.length : count), 'Pool global de la plateforme'),
      metric('Actifs', intFormat(active), 'Reçoivent de nouveaux clients'),
      metric('Dégradés', intFormat(degraded), degraded ? 'Santé à vérifier' : 'Tous sains', degraded ? 'warn' : 'ok'),
      metric('Expirent sous 1 h', intFormat(expiring), 'Seuil d’affichage de l’interface', expiring ? 'warn' : 'ok')
    ]);

    var rows = endpoints.map(function (endpoint) {
      var load = endpoint.capacity && endpoint.inUse !== null
        ? intFormat(endpoint.inUse) + ' / ' + intFormat(endpoint.capacity) + ' (' + Math.round((endpoint.inUse / endpoint.capacity) * 100) + ' %)'
        : '—';
      return el('tr', {}, [
        cell('Libellé', el('span', { class: 'cell-title', text: endpoint.label })),
        cell('Région', endpoint.region || '—'),
        cell('Statut', pill(endpoint.status)),
        cell('Santé', pill(endpoint.health)),
        cell('Charge', load),
        cell('Latence', endpoint.latencyMs === null ? '—' : intFormat(endpoint.latencyMs) + '\u00a0ms'),
        cell('Expire', el('span', {}, [timeTag(endpoint.expiresAt), el('span', { class: 'meta', text: ' ' + relative(endpoint.expiresAt) })])),
        cell('Dernière vue', el('span', {}, [timeTag(endpoint.lastSeenAt), el('span', { class: 'meta', text: ' ' + relative(endpoint.lastSeenAt) })]))
      ]);
    });

    return el('section', { class: 'stack' }, [
      sectionHead('Réseau', 'État du pool. Cette vue ne montre que le libellé, la région, la charge, la latence et les dates : jamais d’identité de tunnel.', [
        el('button', {
          class: 'button button-quiet',
          text: 'Rafraîchir',
          attrs: { type: 'button' },
          on: { click: function () { renderRoute(); } }
        })
      ]),
      el('dl', { class: 'facts' }, [
        fact('Révision du pool', revision === null ? '—' : intFormat(revision)),
        fact('Endpoints listés', intFormat(endpoints.length))
      ]),
      cards,
      endpoints.length
        ? el('section', { class: 'panel panel-flush' }, table('Endpoints du pool', [
          { label: 'Libellé' },
          { label: 'Région' },
          { label: 'Statut' },
          { label: 'Santé' },
          { label: 'Charge' },
          { label: 'Latence' },
          { label: 'Expire' },
          { label: 'Dernière vue' }
        ], rows, ''))
        : emptyPanel('Pool vide', 'Aucun endpoint n’est enregistré pour le moment.')
    ]);
  }

  /* ------------------------------------------------------- bundles hors-ligne */

  async function screenBundles() {
    var communities = await ensureCommunities(false);
    if (!communities.length) {
      return el('section', { class: 'stack' }, [
        sectionHead('Bundles hors-ligne', 'Droit daté pour un appareil, sans configuration ni identité de tunnel.', []),
        emptyPanel('Aucune communauté', 'Aucune communauté n’est accessible à ce compte.')
      ]);
    }
    var communityId = selectedCommunityId();
    if (!can('offline_bundle.issue', communityId)) {
      return accessPanel('Bundles hors-ligne', 'L’émission d’un bundle est réservée au propriétaire, aux administrateurs de communauté et au support.');
    }
    var devices = items(await request(API.devices(communityId))).map(normalizeDevice).filter(function (device) {
      return !!device.deviceId;
    });

    var rows = devices.map(function (device, index) {
      var ttl = input({
        class: 'input input-compact',
        attrs: {
          type: 'number',
          min: '1',
          max: '72',
          step: '1',
          value: '24',
          'aria-label': 'Durée en heures du bundle pour ' + device.name
        }
      });
      var issue = actionButton('Émettre', function (event) {
        var hours = numberOrNull(ttl.value);
        if (hours === null || hours < 1 || hours > 24 || Math.floor(hours) !== hours) {
          showBanner('La durée doit être un nombre entier d’heures entre 1 et 24 : un fichier de secours ne doit pas rester utilisable des jours.', 'error');
          ttl.focus();
          return;
        }
        runAction(event.currentTarget, 'Émission…', function () {
          return request(API.offlineBundle(device.deviceId), {
            method: 'POST',
            body: { ttlHours: hours }
          }).then(function (payload) {
            state.issuedBundles.unshift({
              deviceName: device.name,
              bundleId: asString(get(payload, 'bundleId')),
              notAfter: asIso(get(payload, 'notAfter')),
              createdAt: asIso(get(payload, 'createdAt')),
              singleUse: get(payload, 'singleUse') === true,
              // Le fichier est scellé pour l'appareil : l'admin le transmet tel
              // quel, il ne peut pas en lire le contenu.
              file: get(payload, 'file')
            });
            showBanner('Bundle émis pour ' + device.name + ', valable jusqu’au ' + dateTime(get(payload, 'notAfter')) + '. Téléchargez le fichier : il ne sera plus réémis.', 'ok');
            renderRoute();
          });
        });
      });
      var revoke = can('device.revoke', communityId)
        ? actionButton('Révoquer', function (event) {
          if (!window.confirm('Révoquer « ' + device.name + ' » ? Ses sessions seront fermées.')) return;
          runAction(event.currentTarget, 'Révocation…', function () {
            return request(API.revoke(device.deviceId), { method: 'POST' }).then(function (payload) {
              var sessions = numberOrNull(get(payload, 'sessionsRevoked'));
              showBanner('Appareil révoqué' + (sessions !== null ? ' · ' + countLabel(sessions, 'session fermée', 'sessions fermées') : '') + '.', 'ok');
              renderRoute();
            });
          });
        }, { quiet: true, danger: true })
        : null;

      return el('tr', {}, [
        cell('Appareil', el('div', {}, [
          el('span', { class: 'cell-title', text: device.name }),
          el('span', { class: 'meta', text: device.platform || 'plateforme inconnue' })
        ])),
        cell('Statut', pill(device.status)),
        cell('Dernière activité', timeTag(device.lastSeenAt)),
        cell('Bundle', el('div', { class: 'inline-form' }, [
          ttl,
          el('span', { class: 'meta', text: 'heures' }),
          issue
        ])),
        cell('Révoquer', revoke || '—')
      ]);
    });

    var issuedRows = state.issuedBundles.map(function (bundle) {
      return el('tr', {}, [
        cell('Appareil', bundle.deviceName),
        cell('Émis le', timeTag(bundle.createdAt)),
        cell('Valable jusqu’à', timeTag(bundle.notAfter)),
        cell('Usage', bundle.singleUse ? 'Unique' : '—'),
        cell('Référence', refNode(bundle.bundleId)),
        cell(
          'Fichier',
          bundle.file
            ? el('button', {
              class: 'button quiet',
              type: 'button',
              text: 'Télécharger',
              onclick: function () {
                downloadJson(
                  'vpn-' + (bundle.deviceName || 'appareil').replace(/[^A-Za-z0-9_-]+/g, '-') + '-' + (bundle.bundleId || 'bundle') + '.json',
                  bundle.file
                );
              }
            })
            : '—'
        )
      ]);
    });

    var issuedPanel = state.issuedBundles.length
      ? el('section', { class: 'panel panel-flush' }, [
        el('div', { class: 'section-head' }, el('div', {}, [
          el('h2', { text: 'Bundles émis dans cette session' }),
          el('p', { class: 'muted', text: 'Le fichier du bundle est scellé pour l’appareil : il ne s’ouvre que sur lui. Téléchargez-le et transmettez-le tel quel. L’historique ci-dessous vit dans cet onglet ; le serveur garde de son côté le droit daté, consultable par appareil.' })
        ])),
        table('Bundles émis pendant cette session', [
          { label: 'Appareil' },
          { label: 'Émis le' },
          { label: 'Valable jusqu’à' },
          { label: 'Usage' },
          { label: 'Référence' },
          { label: 'Fichier' }
        ], issuedRows, '')
      ])
      : null;

    return el('section', { class: 'stack' }, [
      sectionHead('Bundles hors-ligne', 'Un bundle est un fichier daté, scellé pour un appareil précis : le dashboard ne montre jamais son contenu — ni UUID, ni chemin réseau.', []),
      el('div', { class: 'toolbar' }, [
        communityPicker(communityId, function (value) {
          state.communityId = value;
          renderRoute();
        })
      ]),
      devices.length
        ? el('section', { class: 'panel panel-flush' }, table('Appareils de la communauté', [
          { label: 'Appareil' },
          { label: 'Statut' },
          { label: 'Dernière activité' },
          { label: 'Bundle' },
          { label: 'Révoquer' }
        ], rows, ''))
        : emptyPanel('Aucun appareil', 'Cette communauté n’a encore aucun appareil enregistré.'),
      issuedPanel
    ]);
  }

  /* ---------------------------------------------------------- journal d'audit */

  async function screenAudit() {
    if (!isOwner() && !hasAnyRole(['community_admin'])) {
      return accessPanel('Journal d’audit', 'Le journal est lisible par le propriétaire et les administrateurs de communauté.');
    }
    var communities = await ensureCommunities(false);
    var owner = isOwner();
    var selected = filters.audit.communityId;
    if (!owner) {
      if (!communities.length) {
        return emptyPanel('Aucune communauté', 'Aucune communauté n’est rattachée à ce compte.');
      }
      var allowed = communities.some(function (community) { return community.id === selected; });
      if (!allowed) selected = communities[0].id;
      filters.audit.communityId = selected;
    }

    var query = { limit: filters.audit.limit };
    if (selected) query.community_id = selected;
    var entries = items(await request(API.audit(query))).map(normalizeAudit);

    var rows = entries.map(function (entry) {
      var community = entry.communityId ? communityById(entry.communityId) : null;
      return el('tr', {}, [
        cell('Date', timeTag(entry.createdAt)),
        cell('Action', el('span', { class: 'mono', text: entry.action })),
        cell('Rôle exercé', roleLabel(entry.actorRole) || entry.actorRole),
        cell('Cible', entry.targetType),
        cell('Communauté', community ? community.name : '—')
      ]);
    });

    var children = [
      sectionHead('Journal d’audit', 'Lecture seule. Chaque action privilégiée est écrite par l’API dans la transaction de la mutation.', []),
      notice('L’API refuse toute modification du journal. Les états avant/après et les adresses IP ne sont pas affichés ici.'),
      el('div', { class: 'toolbar' }, [
        owner
          ? communityPicker(selected, function (value) {
            filters.audit.communityId = value;
            renderRoute();
          }, true)
          : communityPicker(selected, function (value) {
            filters.audit.communityId = value;
            renderRoute();
          }, false),
        field('Lignes', selectControl([
          { value: '25', label: '25' },
          { value: '50', label: '50' },
          { value: '100', label: '100' },
          { value: '200', label: '200' }
        ], String(filters.audit.limit), function (value) {
          filters.audit.limit = Number(value);
          renderRoute();
        }))
      ])
    ];

    children.push(entries.length
      ? el('section', { class: 'panel panel-flush' }, table('Journal d’audit', [
        { label: 'Date' },
        { label: 'Action' },
        { label: 'Rôle exercé' },
        { label: 'Cible' },
        { label: 'Communauté' }
      ], rows, ''))
      : emptyPanel('Journal vide', 'Aucune action n’a encore été journalisée pour ce filtre.'));

    return el('section', { class: 'stack' }, children);
  }

  var screens = {
    overview: screenOverview,
    communities: screenCommunities,
    members: screenMembers,
    orders: screenOrders,
    network: screenNetwork,
    bundles: screenBundles,
    audit: screenAudit
  };

  /* -------------------------------------------------------------------- init */

  function init() {
    view = document.getElementById('view');
    nav = document.getElementById('nav');
    bannerEl = document.getElementById('banner');
    identityEl = document.getElementById('identity');
    logoutBtn = document.getElementById('logout');

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    window.addEventListener('hashchange', function () { renderRoute(); });

    if (!window.location.hash) {
      window.location.hash = '#/login';
    }
    renderRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
