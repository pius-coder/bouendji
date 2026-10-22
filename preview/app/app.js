/* ============================================================================
   Revue de l'application — jetons, écrans, navigation.
   Structure et parcours : prototype « Le Billet ». Habillage : identité choisie.
   Aucune dépendance, aucune ressource distante.
   ========================================================================== */

/* ------------------------------------------------------------------ jetons */

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';

const TOKENS = {
  halo: {
    dir: 'Halo — verre dépoli',
    dark: {
      bg: '#070A12', bgAlt: '#0B1120',
      surface: 'rgba(18,26,43,.90)', surface2: 'rgba(26,36,56,.96)',
      ink: '#F3F7FF', muted: '#A9B6CE', faint: '#6B7896',
      accent: '#7DE2D1', accentInk: '#04231F',
      line: 'rgba(255,255,255,.12)', ok: '#5BE0A8', warn: '#FFC46B', bad: '#FF7A8A',
      rLg: '28px', rMd: '20px', rSm: '14px', rPill: '999px', border: '1px', pad: '20px',
      fontUi: SANS, fontDisplay: SANS, fontMono: MONO,
      displayWeight: '200', titleWeight: '600', labelTrack: '.18em',
      shadow: '0 22px 54px rgba(0,0,0,.38)', blur: 'blur(18px) saturate(1.2)'
    },
    light: {
      bg: '#EDF1F8', bgAlt: '#E2E9F5',
      surface: 'rgba(255,255,255,.88)', surface2: '#FFFFFF',
      ink: '#0A1020', muted: '#54607A', faint: '#8A94AA',
      accent: '#0FAE96', accentInk: '#FFFFFF',
      line: 'rgba(0,0,0,.09)', ok: '#0E9E6E', warn: '#A96B00', bad: '#C93048',
      rLg: '28px', rMd: '20px', rSm: '14px', rPill: '999px', border: '1px', pad: '20px',
      fontUi: SANS, fontDisplay: SANS, fontMono: MONO,
      displayWeight: '200', titleWeight: '600', labelTrack: '.18em',
      shadow: '0 18px 44px rgba(16,32,60,.12)', blur: 'blur(18px) saturate(1.15)'
    }
  },
  mono: {
    dir: 'Mono — éditorial',
    dark: {
      bg: '#0B0B0B', bgAlt: '#111111',
      surface: '#141414', surface2: '#1C1C1C',
      ink: '#F4F1EA', muted: '#9E9A91', faint: '#6A665F',
      accent: '#F4F1EA', accentInk: '#0B0B0B',
      line: '#2C2C2C', ok: '#9ED8A4', warn: '#E3C07A', bad: '#E2857F',
      rLg: '2px', rMd: '2px', rSm: '2px', rPill: '2px', border: '1px', pad: '24px',
      fontUi: SANS, fontDisplay: SERIF, fontMono: MONO,
      displayWeight: '400', titleWeight: '400', labelTrack: '.26em',
      shadow: 'none', blur: 'none'
    },
    light: {
      bg: '#F6F3EC', bgAlt: '#EFEAE0',
      surface: '#FFFEFA', surface2: '#FFFFFF',
      ink: '#141210', muted: '#5B574F', faint: '#8C877C',
      accent: '#141210', accentInk: '#FFFEFA',
      line: '#DDD6C7', ok: '#2C6E49', warn: '#8A5A00', bad: '#9B2C2C',
      rLg: '2px', rMd: '2px', rSm: '2px', rPill: '2px', border: '1px', pad: '24px',
      fontUi: SANS, fontDisplay: SERIF, fontMono: MONO,
      displayWeight: '400', titleWeight: '400', labelTrack: '.26em',
      shadow: 'none', blur: 'none'
    }
  },
  vector: {
    dir: 'Vector — tube cathodique',
    dark: {
      bg: '#04070A', bgAlt: '#06120D',
      surface: '#08130F', surface2: '#0C1B15',
      ink: '#C9FFDA', muted: '#6FBF8B', faint: '#3F7A57',
      accent: '#39FF88', accentInk: '#04130A',
      line: '#14301F', ok: '#39FF88', warn: '#FFD166', bad: '#FF5C5C',
      rLg: '4px', rMd: '4px', rSm: '2px', rPill: '2px', border: '1px', pad: '16px',
      fontUi: MONO, fontDisplay: MONO, fontMono: MONO,
      displayWeight: '400', titleWeight: '700', labelTrack: '.16em',
      shadow: '0 0 24px rgba(57,255,136,.10)', blur: 'none'
    },
    light: {
      bg: '#E9F6ED', bgAlt: '#DCEFE2',
      surface: '#F3FCF6', surface2: '#FFFFFF',
      ink: '#0A2415', muted: '#356B49', faint: '#6C9A7C',
      accent: '#0E8F4A', accentInk: '#FFFFFF',
      line: '#B9DCC5', ok: '#0E8F4A', warn: '#8A6100', bad: '#B03030',
      rLg: '4px', rMd: '4px', rSm: '2px', rPill: '2px', border: '1px', pad: '16px',
      fontUi: MONO, fontDisplay: MONO, fontMono: MONO,
      displayWeight: '400', titleWeight: '700', labelTrack: '.16em',
      shadow: '0 0 18px rgba(14,143,74,.12)', blur: 'none'
    }
  },
  otaku: {
    dir: 'Otaku — manga',
    dark: {
      bg: '#101014', bgAlt: '#16161C',
      surface: '#1A1A22', surface2: '#22222C',
      ink: '#FAFAFA', muted: '#A6A6B4', faint: '#6E6E7E',
      accent: '#FF4D7D', accentInk: '#1A0A11',
      line: '#46465A', ok: '#57E2A0', warn: '#FFC24B', bad: '#FF5B5B',
      rLg: '20px', rMd: '16px', rSm: '10px', rPill: '999px', border: '3px', pad: '18px',
      fontUi: SANS, fontDisplay: SANS, fontMono: MONO,
      displayWeight: '900', titleWeight: '900', labelTrack: '.12em',
      shadow: '6px 6px 0 rgba(255,77,125,.35)', blur: 'none'
    },
    light: {
      bg: '#FDFDFD', bgAlt: '#F2F2F4',
      surface: '#FFFFFF', surface2: '#FFFFFF',
      ink: '#0B0B0B', muted: '#585864', faint: '#8A8A96',
      accent: '#FF3B6B', accentInk: '#FFFFFF',
      line: '#0B0B0B', ok: '#128F5B', warn: '#9A6A00', bad: '#C0283F',
      rLg: '20px', rMd: '16px', rSm: '10px', rPill: '999px', border: '3px', pad: '18px',
      fontUi: SANS, fontDisplay: SANS, fontMono: MONO,
      displayWeight: '900', titleWeight: '900', labelTrack: '.12em',
      shadow: '6px 6px 0 #0B0B0B', blur: 'none'
    }
  }
};

const SCREEN_LIST = [
  ['splash', 'Démarrage', 'Entrée'],
  ['onboarding', 'Bienvenue', 'Entrée'],
  ['login', 'Connexion', 'Entrée'],
  ['vpn-auth', 'Autorisation VPN', 'Entrée'],
  ['home', 'Accueil', 'Cœur'],
  ['servers', 'Serveurs', 'Cœur'],
  ['nji', 'Code d’accès', 'Cœur'],
  ['no-egress', 'Aucune sortie', 'Cœur'],
  ['order', 'Forfait et paiement', 'Argent'],
  ['order-done', 'Paiement confirmé', 'Argent'],
  ['paywall', 'Offre', 'Argent'],
  ['subscription', 'Abonnement', 'Compte'],
  ['devices', 'Appareils', 'Compte'],
  ['invite', 'Invitation', 'Compte'],
  ['profile', 'Compte', 'Compte'],
  ['settings', 'Réglages', 'Compte'],
  ['help', 'Aide', 'Compte'],
  ['privacy', 'Confidentialité', 'Compte']
];

const TABS = { home: 'home', subscription: 'subscription', profile: 'profile' };

const S = {
  id: 'halo',
  mode: 'dark',
  screen: 'home',
  tunnel: 'connected',
  server: 'Nji · Francfort',
  plan: '3',
  method: 'momo',
  appearance: 'Sombre',
  alwaysOn: true,
  autoReconnect: true,
  killSwitch: false,
  diagnostics: false,
  filter: 'all',
  connectedAt: Date.now() - 1478 * 1000,
  timer: null,
  stack: []
};

/* ------------------------------------------------------------------- icônes */

const I = {
  shield: '<path d="M12 3.2 19 6v5.4c0 4.2-2.9 7.5-7 9.4-4.1-1.9-7-5.2-7-9.4V6l7-2.8Z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/>',
  devices: '<rect x="3" y="5.5" width="12.5" height="10" rx="2"/><path d="M3 19h12.5"/><rect x="17.4" y="9" width="4.6" height="10" rx="1.6"/>',
  gear: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>',
  contrast: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 0 0 16.8z" fill="currentColor" stroke="none"/>',
  external: '<path d="M6 18 18 6"/><path d="M10 6h8v8"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5.2 20c.7-3.6 3.4-5.6 6.8-5.6s6.1 2 6.8 5.6"/>',
  help: '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1 .9-1 1.6v.4"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17"/><path d="M12 9v11"/><path d="M12 9S9.5 3.5 7.4 5c-1.6 1.2.4 4 4.6 4Zm0 0s2.5-5.5 4.6-4c1.6 1.2-.4 4-4.6 4Z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
  check: '<path d="m5 12.5 4.6 4.6L19 7"/>',
  server: '<rect x="3" y="4.5" width="18" height="6" rx="2"/><rect x="3" y="13.5" width="18" height="6" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4H6.2A2.2 2.2 0 0 0 4 6.2v6.3A2.5 2.5 0 0 0 6.5 15"/>',
  alert: '<path d="M12 3.6 21 20H3L12 3.6Z"/><path d="M12 9v5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
  key: '<circle cx="8.2" cy="12" r="3.6"/><path d="M11.8 12H21"/><path d="M18 12v3.2"/><path d="M15.2 12v2.4"/>',
  spark: '<path d="M12 3.6 13.9 9l5.5 1.9-5.5 1.9L12 20.4 10.1 12.8 4.6 10.9 10.1 9 12 3.6Z"/>',
  logout: '<path d="M10 5.5H6.2A2.2 2.2 0 0 0 4 7.7v8.6a2.2 2.2 0 0 0 2.2 2.2H10"/><path d="M15 8.5 18.5 12 15 15.5"/><path d="M9 12h9.5"/>',
  wifi: '<path d="M2.5 8.5a14 14 0 0 1 19 0"/><path d="M6 12.4a9 9 0 0 1 12 0"/><path d="M9.4 16.2a4 4 0 0 1 5.2 0"/><circle cx="12" cy="19.4" r="1.2" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6 18 18M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.6 6.4"/><path d="M20 4.5V11h-6.5"/>'
};

function ico(name, cls) {
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[name] + '</svg>';
}

/* ------------------------------------------------------------------ briques */

const el = (id) => document.getElementById(id);
const screenEl = el('screen');

function tokens() { return TOKENS[S.id][S.mode]; }

function statusbar() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return '<div class="statusbar"><span>' + hh + ':' + mm + '</span>' +
    '<span class="sysicons">' + ico('wifi', 'xs') + '<span class="battery"></span></span></div>';
}

function topbar(lead, trail) {
  return '<div class="topbar"><div class="lead">' + (lead || '') + '</div>' +
    '<div class="trail">' + (trail || '') + '</div></div>';
}

function backbar(title, trail) {
  return '<div class="topbar">' +
    '<button class="iconbtn" data-back aria-label="Retour">' + ico('back') + '</button>' +
    '<span class="barname">' + title + '</span>' +
    '<div class="trail">' + (trail || '') + '</div></div>';
}

function head(kicker, title, sub) {
  return '<div class="head">' + (kicker ? '<div class="kicker">' + kicker + '</div>' : '') +
    '<h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>';
}

function group(rows, mod) {
  return '<div class="group' + (mod ? ' ' + mod : '') + '">' + rows.join('') + '</div>';
}

function row(o) {
  const icon = o.icon ? '<span class="row-icon">' + ico(o.icon) + '</span>' : '';
  const value = o.value ? '<span class="row-value">' + o.value + '</span>' : '';
  const chev = o.chev === false ? '' : ico('chev', 'chev');
  const sw = o.switchOn !== undefined
    ? '<span class="switch" role="switch" tabindex="0" aria-checked="' + (o.switchOn ? 'true' : 'false') + '" data-toggle aria-label="' + (o.label || '') + '"></span>'
    : '';
  const attrs = (o.go ? ' data-go="' + o.go + '"' : '') +
    (o.server ? ' data-server="' + o.server + '"' : '');
  return '<button class="row' + (o.danger ? ' danger' : '') + '"' + attrs + ' type="button">' +
    icon +
    '<span class="row-main"><span class="row-label">' + o.label + '</span>' +
    (o.sub ? '<span class="row-sub">' + o.sub + '</span>' : '') + '</span>' +
    value + sw + (o.switchOn === undefined ? chev : '') +
    '</button>';
}

function seal(size) {
  const s = size || 104;
  return '<div class="seal" style="width:' + s + 'px;height:' + s + 'px;color:var(--accent)">' +
    '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true">' +
    '<circle cx="60" cy="60" r="52" stroke-width="1" opacity=".35"/>' +
    '<circle cx="60" cy="60" r="44" stroke-width="1" opacity=".22" stroke-dasharray="2 6"/>' +
    '<path d="M60 24 90 37v23c0 19-13 31-30 36-17-5-30-17-30-36V37l30-13Z" stroke-width="1.6"/>' +
    '<path d="m47 60 9 9 18-19" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg></div>';
}

function tabbar() {
  const items = [
    ['home', 'Connexion', 'shield'],
    ['subscription', 'Abonnement', 'card'],
    ['profile', 'Compte', 'user']
  ];
  return '<nav class="tabbar" aria-label="Navigation principale">' + items.map(function (it) {
    const on = TABS[S.screen] === it[0];
    return '<button type="button" data-go="' + it[0] + '"' + (on ? ' aria-current="page"' : '') + '>' +
      ico(it[2]) + '<span>' + it[1] + '</span></button>';
  }).join('') + '</nav>';
}

/* ------------------------------------------------------------------- écrans */

function screenSplash() {
  return '<div class="viewport" style="display:flex">' +
    '<div class="splash">' +
    seal(112) +
    '<div class="wordmark">Bouendji</div>' +
    '<div class="kicker">VPN</div>' +
    '<div class="splashbar"><span></span></div>' +
    '</div>' +
    '<div style="position:absolute;left:0;right:0;bottom:18px;text-align:center">' +
    '<button class="btn ghost sm" data-go="onboarding" type="button">Passer</button></div>' +
    '</div>';
}

function screenOnboarding() {
  return '<div class="viewport" style="display:flex;flex-direction:column">' +
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">' +
    seal(96) +
    '<div class="kicker" style="margin-top:20px">Étape 1 sur 3</div>' +
    '<h1 style="margin-top:10px">Ton réseau,<br>sans témoin.</h1>' +
    '<p class="sub" style="max-width:270px">Une seule sortie chiffrée. Aucune configuration visible, aucun journal de navigation.</p>' +
    '<div class="dots"><i class="on"></i><i></i><i></i></div>' +
    '</div>' +
    '<div class="stack">' +
    '<button class="btn lg block" data-go="login" type="button">Continuer</button>' +
    '<button class="btn ghost block" data-go="login" type="button">J’ai déjà un compte</button>' +
    '</div>' +
    '</div>';
}

function screenLogin() {
  return '<div class="viewport">' +
    backbar('', '') +
    head('Compte', 'Connexion', 'Le même compte sur tous tes appareils, trois au maximum.') +
    '<div style="margin-top:18px">' +
    '<label class="field"><span>Adresse e-mail</span><input type="email" value="ange@exemple.cm" autocomplete="username"></label>' +
    '<label class="field"><span>Mot de passe</span><input type="password" value="motdepasse" autocomplete="current-password"></label>' +
    '</div>' +
    '<button class="btn lg block" data-go="home" type="button">Se connecter</button>' +
    '<div class="btn-row"><button class="btn ghost" data-go="nji" type="button">J’ai un code</button>' +
    '<button class="btn ghost" data-go="onboarding" type="button">Créer un compte</button></div>' +
    '<p class="footnote">Mot de passe oublié : la réinitialisation passe par l’e-mail du compte, jamais par SMS.</p>' +
    '</div>';
}

function screenVpnAuth() {
  return '<div class="viewport" style="display:flex;flex-direction:column">' +
    backbar('', '') +
    '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">' +
    '<div class="check-big" style="background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)">' + ico('shield') + '</div>' +
    '<h1 style="margin-top:14px">Autoriser la connexion VPN</h1>' +
    '<p class="sub" style="max-width:282px;margin:10px auto 0">Android va afficher sa propre fenêtre. Elle demandera d’accepter que Bouendji VPN crée un tunnel local. C’est la seule autorisation système dont l’application a besoin.</p>' +
    '<p class="footnote" style="text-align:center;margin-top:18px">La fenêtre qui s’ouvre ensuite est celle d’Android, pas la nôtre : elle ne peut pas être dessinée à notre manière.</p>' +
    '</div>' +
    '<div class="stack" style="margin-bottom:6px">' +
    '<button class="btn lg block" data-go="home" data-connect type="button">Autoriser</button>' +
    '<button class="btn ghost block" data-go="home" type="button">Plus tard</button>' +
    '</div>' +
    '</div>';
}

function screenHome() {
  const t = S.tunnel;
  const copy = {
    connected: {
      title: 'Vous êtes connecté.', sub: 'Votre trafic est chiffré jusqu’au serveur.',
      chip: 'Connexion sécurisée', dot: '', cta: 'Appuyer pour déconnecter', orb: 'Connecté', state: 'var(--ok)'
    },
    stopped: {
      title: 'Vous êtes hors ligne.', sub: 'Le tunnel est arrêté. Rien ne sort par lui.',
      chip: 'Tunnel arrêté', dot: 'bad', cta: 'Appuyer pour connecter', orb: 'Appuyer', state: 'var(--muted)'
    },
    connecting: {
      title: 'Connexion en cours…', sub: 'Négociation avec le serveur, puis montée du tunnel.',
      chip: 'Négociation', dot: 'warn', cta: 'Appuyer pour annuler', orb: 'Négociation', state: 'var(--warn)'
    },
    'no-egress': {
      title: 'Aucune sortie disponible.', sub: 'Les configurations de cet appareil ont expiré.',
      chip: 'Configurations expirées', dot: 'bad', cta: 'Appuyer pour réessayer', orb: 'Aucune sortie', state: 'var(--bad)'
    }
  }[t];

  let core;
  if (t === 'connected') {
    core = '<span class="orb-k">Session</span>' +
      '<span class="timer" id="sessionTimer">' + fmtElapsed() + '</span>' +
      '<span class="orb-s">Connecté</span>';
  } else if (t === 'connecting') {
    core = '<span class="orb-k">Session</span>' +
      '<span class="timer" style="opacity:.65">·· ·</span>' +
      '<span class="orb-s">Négociation</span>';
  } else if (t === 'no-egress') {
    core = '<span class="orb-power">' + ico('alert') + '</span>' +
      '<span class="orb-s" style="color:var(--bad)">Aucune sortie</span>';
  } else {
    core = '<span class="orb-power">' + ico('shield') + '</span>' +
      '<span class="orb-s">Appuyer</span>';
  }

  const latency = t === 'connected' ? '24 ms' : '—';

  return '<div class="viewport">' +
    topbar(
      '<button class="avatar" data-go="profile" aria-label="Profil">AN</button>',
      '<button class="iconbtn" data-mode aria-label="Apparence">' + ico('contrast') + '</button>' +
      '<button class="iconbtn" data-go="settings" aria-label="Réglages">' + ico('gear') + '</button>'
    ) +
    '<div class="head" style="padding-top:0">' +
    '<span class="chip"><span class="dot ' + (copy.dot || '') + '"></span>' + copy.chip +
    (t === 'connected' ? '<span class="sep"></span><span>SE · 24 ms</span>' : '') + '</span>' +
    '<h1 style="margin-top:14px">' + copy.title + '</h1>' +
    '<p class="sub">' + copy.sub + '</p>' +
    '</div>' +

    '<div class="orbwrap" style="--state:' + copy.state + '">' +
    '<button class="orb" id="orb" type="button" aria-label="' + copy.cta + '">' +
    '<svg class="orbring" viewBox="0 0 240 240" aria-hidden="true">' +
    '<circle class="rt" cx="120" cy="120" r="112"/>' +
    '<circle class="rtick" cx="120" cy="120" r="104" stroke-dasharray="2 9"/>' +
    '<circle class="rp" cx="120" cy="120" r="100"/>' +
    '<circle class="ra" cx="120" cy="120" r="112" stroke-dasharray="148 556"/>' +
    '</svg>' +
    '<span class="orbcore">' + core + '</span>' +
    '</button>' +
    '</div>' +
    '<span class="cta">' + copy.cta + '</span>' +

    '<div class="stats">' +
    '<span class="stat">' + ico('clock') + latency + '</span>' +
    '<span class="stat">' + ico('devices') + '1 / 3</span>' +
    '</div>' +

    group([
      row({ icon: 'server', label: 'Serveur', value: S.server, go: 'servers' }),
      row({ icon: 'card', label: 'Premium', sub: 'Actif · 12 jours restants', go: 'subscription' })
    ]) +

    '</div>';
}

function screenServers() {
  const all = [
    { name: 'Nji · Francfort', country: 'Allemagne', ping: '24 ms', nji: true, fav: true },
    { name: 'Paris', country: 'France', ping: '38 ms', nji: false, fav: true },
    { name: 'Amsterdam', country: 'Pays-Bas', ping: '42 ms', nji: false, fav: false },
    { name: 'Douala', country: 'Cameroun', ping: '61 ms', nji: false, fav: false },
    { name: 'Montréal', country: 'Canada', ping: '118 ms', nji: false, fav: false }
  ];
  const list = all.filter(function (s) {
    if (S.filter === 'fav') return s.fav;
    if (S.filter === 'nji') return s.nji;
    return true;
  });
  const rows = list.map(function (s) {
    const on = S.server === s.name;
    return '<button class="row" type="button" data-server="' + s.name + '">' +
      '<span class="row-icon">' + ico('server') + '</span>' +
      '<span class="row-main"><span class="row-label">' + s.name + '</span>' +
      '<span class="row-sub">' + s.country + ' · ' + s.ping + '</span></span>' +
      (on ? '<span style="color:var(--accent)">' + ico('check') + '</span>' : ico('chev', 'chev')) +
      '</button>';
  });
  return '<div class="viewport">' +
    backbar('Serveurs', '<button class="iconbtn" data-go="settings" aria-label="Réglages">' + ico('gear') + '</button>') +
    head('Sortie', 'Choisir un serveur', 'Le changement ne coupe pas la session en cours : la sortie bascule après la mesure.') +
    '<div class="seg" style="margin:14px 0 12px">' +
    '<button data-filter="all" aria-pressed="' + (S.filter === 'all' ? 'true' : 'false') + '">Tous</button>' +
    '<button data-filter="fav" aria-pressed="' + (S.filter === 'fav' ? 'true' : 'false') + '">Favoris</button>' +
    '<button data-filter="nji" aria-pressed="' + (S.filter === 'nji' ? 'true' : 'false') + '">Nji</button>' +
    '</div>' +
    group(rows.length ? rows : ['<div class="slot free"><span class="row-label">Aucun serveur dans ce filtre.</span></div>']) +
    '<p class="footnote">La latence est mesurée en direct depuis l’appareil. Aucun débit n’est affiché : nous ne le mesurons pas encore.</p>' +
    '</div>';
}

function screenNji() {
  return '<div class="viewport">' +
    backbar('Code d’accès') +
    '<div class="center" style="margin-top:6px">' + seal(76) + '</div>' +
    head('Activation', 'Activer un code', 'Un code à usage unique, lié à ton compte et à cet appareil.') +
    '<div class="code"><i>NJI4</i><i>7K2M</i></div>' +
    '<div class="btn-row"><button class="btn ghost" type="button">' + ico('copy') + 'Coller</button>' +
    '<button class="btn" data-go="order-done" type="button">Activer</button></div>' +
    '<div class="card" style="margin-top:18px"><div class="kicker">Ce que le code débloque</div>' +
    '<p>Le forfait choisi, sur cet appareil uniquement. Le code se consomme à la première activation et ne peut pas être rejoué ailleurs.</p></div>' +
    '<p class="footnote">La vérification se fait côté serveur. Aucun code n’est validé dans l’application elle-même.</p>' +
    '</div>';
}

function screenNoEgress() {
  return '<div class="viewport">' +
    backbar('Diagnostic') +
    '<div class="center" style="margin-top:6px">' + seal(76) + '</div>' +
    head('État', 'Aucune sortie', 'Toutes les configurations de cet appareil ont expiré. Le tunnel ne peut pas être monté.') +
    '<div class="mono-block">code      NO_EGRESS\nbundle    rev 41 · expiré\nappareil  d-8f2c…a91\nmesure    échec 3/3 · 12:04</div>' +
    '<div class="stack" style="margin-top:14px">' +
    '<button class="btn lg block" data-refresh type="button">' + ico('refresh') + 'Réessayer</button>' +
    '<button class="btn ghost block" data-go="servers" type="button">Choisir un autre serveur</button>' +
    '<button class="btn ghost block" data-go="order" type="button">Renouveler le forfait</button>' +
    '</div>' +
    '<p class="footnote">Aucune donnée de navigation n’est remontée : ce diagnostic ne contient que des codes et des horodatages locaux.</p>' +
    '</div>';
}

function screenOrder() {
  const plans = [
    ['1', '1 mois', '3 500', ''],
    ['3', '3 mois', '9 000', ' −14 %'],
    ['12', '12 mois', '30 000', ' −29 %']
  ];
  const planRows = plans.map(function (p) {
    const on = S.plan === p[0];
    return '<button class="plan" type="button" data-plan="' + p[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="radio"></span>' +
      '<span class="row-main"><span class="row-label">' + p[1] + (p[3] ? ' <span class="badge neutral">' + p[3] + '</span>' : '') + '</span>' +
      '<span class="row-sub">Accès complet, trois appareils</span></span>' +
      '<span class="amount">' + p[2] + ' FCFA<span class="demo">exemple</span></span>' +
      '</button>';
  });
  const methods = [
    ['momo', 'MTN Mobile Money', 'Fapshi · confirmation par l’opérateur'],
    ['om', 'Orange Money', 'Fapshi · confirmation par l’opérateur']
  ];
  const methodRows = methods.map(function (m) {
    const on = S.method === m[0];
    return '<button class="plan" type="button" data-method="' + m[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="radio"></span>' +
      '<span class="row-main"><span class="row-label">' + m[1] + '</span>' +
      '<span class="row-sub">' + m[2] + '</span></span></button>';
  });
  return '<div class="viewport">' +
    backbar('Forfait') +
    head('Paiement', 'Choisir un forfait', 'Le paiement crée une commande chez nous, puis Fapshi encaisse. Le webhook ne vaut jamais preuve : nous relisons le statut.') +
    group(planRows) +
    '<div class="section-title">Moyen de paiement</div>' +
    group(methodRows) +
    '<div class="card"><div class="kicker">Récapitulatif</div>' +
    '<p><strong>' + (S.plan === '1' ? '1 mois' : S.plan === '3' ? '3 mois' : '12 mois') + '</strong> · trois appareils · renouvellement manuel</p>' +
    '<p>Le montant exact est confirmé par Fapshi avant l’encaissement. Aucun prélèvement automatique.</p></div>' +
    '<button class="btn lg block" data-go="order-done" type="button">Payer avec Fapshi</button>' +
    '<p class="footnote">Montants d’exemple : le tarif n’est pas encore fixé dans la base de connaissances.</p>' +
    '</div>';
}

function screenOrderDone() {
  return '<div class="viewport">' +
    backbar('') +
    '<div class="check-big">' + ico('check') + '</div>' +
    '<div class="center"><h1 style="margin-top:0">Forfait actif</h1>' +
    '<p class="sub">Le paiement est confirmé par le serveur, pas par le retour du navigateur.</p></div>' +
    group([
      row({ label: 'Référence', value: 'ORD-2481', chev: false }),
      row({ label: 'Montant', value: '9 000 FCFA', chev: false }),
      row({ label: 'Échéance', value: '21 janv. 2027', chev: false }),
      row({ label: 'Moyen', value: 'MTN MoMo', chev: false })
    ]) +
    '<button class="btn lg block" data-go="home" type="button">Continuer</button>' +
    '<p class="footnote">Un reçu est disponible dans Abonnement. Aucun code n’est envoyé par message : tout est déjà sur l’appareil.</p>' +
    '</div>';
}

function screenPaywall() {
  return '<div class="viewport" style="display:flex;flex-direction:column">' +
    '<div class="topbar"><button class="iconbtn" data-go="home" aria-label="Fermer">' + ico('close') + '</button>' +
    '<div class="trail"><span class="badge warn">Offre</span></div></div>' +
    '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">' +
    seal(88) +
    '<div class="kicker" style="margin-top:18px">Trois appareils · une sortie</div>' +
    '<h1 style="margin-top:10px">Trois jours pour juger.</h1>' +
    '<p class="sub" style="max-width:280px;margin:10px auto 0">Puis 3 500 FCFA par mois, ou moins si tu prends douze. Sans reconduction automatique.</p>' +
    '<div class="stack" style="margin-top:20px;text-align:left">' +
    '<div class="card" style="margin:0"><p><strong>Ce qui est inclus</strong></p>' +
    '<p>Configurations chiffrées pour cet appareil, bascule automatique, trois appareils, aucun journal de navigation.</p></div>' +
    '</div>' +
    '</div>' +
    '<div class="stack" style="margin-bottom:6px">' +
    '<button class="btn lg block" data-go="order" type="button">Voir les forfaits</button>' +
    '<button class="btn ghost block" data-go="home" type="button">Plus tard</button>' +
    '</div>' +
    '</div>';
}

function screenSubscription() {
  return '<div class="viewport">' +
    backbar('Abonnement', '<button class="iconbtn" data-go="settings" aria-label="Réglages">' + ico('gear') + '</button>') +
    '<div class="card" style="margin-top:4px">' +
    '<div class="kicker">Formule</div>' +
    '<h1 style="font-size:23px;margin-top:2px">12 jours restants</h1>' +
    '<p style="margin-top:8px">Échéance le 2 novembre 2026 · renouvellement manuel</p>' +
    '<div class="bar" style="margin:16px 0 8px"><span style="width:40%"></span></div>' +
    '<p style="font-size:12px">40 % du forfait restant</p>' +
    '</div>' +
    group([
      row({ icon: 'card', label: 'Renouveler', sub: 'Payer par Mobile Money', go: 'order' }),
      row({ icon: 'devices', label: 'Appareils', value: '1 / 3', go: 'devices' }),
      row({ icon: 'help', label: 'Reçus et factures', value: '2', chev: true })
    ]) +
    '<div class="section-title">Inclus</div>' +
    group([
      row({ label: 'Configurations chiffrées', value: 'oui', chev: false }),
      row({ label: 'Bascule automatique', value: 'oui', chev: false }),
      row({ label: 'Journal de navigation', value: 'aucun', chev: false })
    ]) +
    '<p class="footnote">Aucune reconduction automatique : à l’échéance, la sortie cesse, rien n’est débité.</p>' +
    '</div>';
}

function screenDevices() {
  return '<div class="viewport">' +
    backbar('Appareils') +
    head('Compte', 'Trois appareils', 'Chaque appareil a sa propre paire de clés. Révoquer un appareil coupe sa prochaine connexion, pas la session en cours.') +
    '<div class="group" style="margin-top:14px">' +
    '<div class="slot"><span class="row-icon">' + ico('devices') + '</span>' +
    '<span class="row-main"><span class="row-label">Pixel 8</span><span class="row-sub">Cet appareil · clé dans le Keystore</span></span>' +
    '<span class="badge">actif</span></div>' +
    '<div class="slot"><span class="row-icon">' + ico('devices') + '</span>' +
    '<span class="row-main"><span class="row-label">Tecno Spark</span><span class="row-sub">Dernière connexion il y a 2 jours</span></span>' +
    '<button class="btn ghost sm" type="button">Révoquer</button></div>' +
    '<div class="slot free"><span class="ghost-ic">' + ico('devices') + '</span>' +
    '<span class="row-main"><span class="row-label">Emplacement libre</span>' +
    '<span class="row-sub">Disponible pour un nouvel appareil</span></span></div>' +
    '</div>' +
    '<p class="footnote">Pas d’identifiant matériel, pas d’IMEI : l’appareil est reconnu par sa clé, pas par son numéro de série.</p>' +
    '</div>';
}

function screenInvite() {
  return '<div class="viewport">' +
    backbar('Invitation') +
    '<div class="center" style="margin-top:4px">' + seal(72) + '</div>' +
    head('Gagner', 'Inviter un ami', 'Ton filleul obtient un jour, tu obtiens trois jours quand son forfait devient actif.') +
    '<div class="code"><i>ANGE</i><i>2481</i></div>' +
    '<div class="btn-row"><button class="btn ghost" type="button">' + ico('copy') + 'Copier</button>' +
    '<button class="btn" type="button">' + ico('external') + 'Partager</button></div>' +
    '<div class="card" style="margin-top:16px"><div class="kicker">Comment ça marche</div>' +
    '<p>Le code est rattaché à ton compte. Le crédit est appliqué côté serveur, jamais dans l’application.</p></div>' +
    '<p class="footnote">Trois invitations actives au maximum. Un compte ne peut être filleul qu’une fois.</p>' +
    '</div>';
}

function screenProfile() {
  return '<div class="viewport">' +
    topbar('<button class="avatar" data-go="profile" aria-label="Profil">AN</button>',
      '<button class="iconbtn" data-go="settings" aria-label="Réglages">' + ico('gear') + '</button>') +
    '<div class="head" style="padding-top:2px">' +
    '<div class="kicker">Compte</div>' +
    '<h1>Ange N.</h1>' +
    '<p class="sub">ange@exemple.cm · +237 6 21 82 65 74</p>' +
    '</div>' +
    group([
      row({ icon: 'card', label: 'Abonnement', value: '12 j', go: 'subscription' }),
      row({ icon: 'devices', label: 'Mes appareils', value: '1 / 3', go: 'devices' }),
      row({ icon: 'gift', label: 'Inviter un ami', go: 'invite' }),
      row({ icon: 'help', label: 'Aide', go: 'help' }),
      row({ icon: 'gear', label: 'Réglages', go: 'settings' })
    ]) +
    group([
      row({ icon: 'lock', label: 'Confidentialité', go: 'privacy' }),
      row({ icon: 'logout', label: 'Se déconnecter', danger: true, chev: false })
    ]) +
    '<p class="footnote">Version 0.1.0 · moteur sing-box 1.14.3</p>' +
    '</div>';
}

function screenSettings() {
  return '<div class="viewport">' +
    backbar('Réglages') +
    '<div class="section-title">Apparence</div>' +
    '<div class="card" style="padding:12px">' +
    '<div class="seg">' +
    ['Système', 'Clair', 'Sombre'].map(function (v) {
      return '<button data-appearance="' + v + '" aria-pressed="' + (S.appearance === v ? 'true' : 'false') + '">' + v + '</button>';
    }).join('') +
    '</div></div>' +
    '<div class="section-title">Connexion</div>' +
    group([
      row({ label: 'Toujours actif', sub: 'Proposé, jamais imposé', switchOn: S.alwaysOn }),
      row({ label: 'Reconnexion automatique', sub: 'Après une coupure réseau', switchOn: S.autoReconnect }),
      row({ label: 'Couper le réseau sans tunnel', sub: 'Kill switch · bloque tout si le tunnel tombe', switchOn: S.killSwitch })
    ]) +
    '<div class="section-title">Confidentialité</div>' +
    group([
      row({ label: 'Journal de diagnostic', sub: 'Local, effacé à la désinstallation', switchOn: S.diagnostics })
    ]) +
    '<div class="section-title">À propos</div>' +
    group([
      row({ label: 'Version', value: '0.1.0', chev: false }),
      row({ label: 'Licences', value: 'GPL-3.0', chev: true }),
      row({ label: 'Confidentialité', go: 'privacy' })
    ]) +
    '</div>';
}

function screenHelp() {
  const faq = [
    ['Pourquoi je ne vois pas ma configuration ?', 'La configuration vit dans un coffre chiffré, sur l’appareil. Elle n’est jamais affichée, jamais copiable, jamais exportable. C’est ce qui empêche de la partager.'],
    ['Combien d’appareils ?', 'Trois, chacun avec sa propre clé. Révoquer un appareil coupe sa prochaine connexion ; la session en cours n’est pas interrompue.'],
    ['Ça marche sans réseau au premier lancement ?', 'Non. Il faut une connexion pour enrôler l’appareil et récupérer un bundle. Ensuite, le bundle hors ligne prend le relais.'],
    ['Que se passe-t-il à l’échéance ?', 'Le tunnel cesse de se monter. Rien n’est débité, aucune reconduction automatique.']
  ];
  const rows = faq.map(function (f, i) {
    return '<div class="acc" data-acc><button type="button" data-acc-head>' +
      '<span class="row-main">' + f[0] + '</span>' + ico('chev', 'chev') + '</button>' +
      '<div class="acc-body">' + f[1] + '</div></div>';
  });
  return '<div class="viewport">' +
    backbar('Aide') +
    head('Support', 'Une question précise', 'Réponses courtes, sans détour. Le reste passe par WhatsApp.') +
    '<div class="group" style="margin-top:14px">' + rows.join('') + '</div>' +
    group([
      row({ icon: 'external', label: 'Écrire sur WhatsApp', sub: 'Réponse sous 24 h ouvrées', chev: false }),
      row({ icon: 'alert', label: 'Diagnostic de connexion', go: 'no-egress' })
    ]) +
    '<p class="footnote">Aucun formulaire ne demande ton mot de passe. Si on te le demande, ce n’est pas nous.</p>' +
    '</div>';
}

function screenPrivacy() {
  return '<div class="viewport">' +
    backbar('Confidentialité') +
    head('Engagements', 'Ce que nous savons', 'Le strict nécessaire pour facturer et connecter. Rien de plus.') +
    group([
      row({ label: 'Journal de navigation', value: 'aucun', chev: false }),
      row({ label: 'Contenu inspecté', value: 'jamais', chev: false }),
      row({ label: 'Identifiant matériel', value: 'aucun', chev: false }),
      row({ label: 'Clé privée', value: 'sur l’appareil', chev: false })
    ]) +
    '<div class="section-title">Ce qui est conservé</div>' +
    '<div class="card"><p>Le compte, les appareils enrôlés (clé publique seule), les commandes et les commissions. Les configurations sont chiffrées pour un appareil précis et expirent.</p>' +
    '<p>Les adresses IP de connexion ne sont pas conservées au-delà de la session technique nécessaire au service.</p></div>' +
    '<div class="section-title">Ce qui n’est jamais fait</div>' +
    '<div class="card"><p>Pas de revente de données, pas de publicité ciblée, pas de lecture du trafic, pas de capture d’écran de l’application.</p></div>' +
    '<p class="footnote">Une question sur un point précis : la page Aide donne le contact direct.</p>' +
    '</div>';
}

const SCREENS = {
  splash: screenSplash,
  onboarding: screenOnboarding,
  login: screenLogin,
  'vpn-auth': screenVpnAuth,
  home: screenHome,
  servers: screenServers,
  nji: screenNji,
  'no-egress': screenNoEgress,
  order: screenOrder,
  'order-done': screenOrderDone,
  paywall: screenPaywall,
  subscription: screenSubscription,
  devices: screenDevices,
  invite: screenInvite,
  profile: screenProfile,
  settings: screenSettings,
  help: screenHelp,
  privacy: screenPrivacy
};

/* ------------------------------------------------------------------ rendu */

function apply() {
  const t = tokens();
  const st = screenEl.style;
  st.setProperty('--bg', t.bg);
  st.setProperty('--bg-alt', t.bgAlt);
  st.setProperty('--surface', t.surface);
  st.setProperty('--surface-2', t.surface2);
  st.setProperty('--ink', t.ink);
  st.setProperty('--muted', t.muted);
  st.setProperty('--faint', t.faint);
  st.setProperty('--accent', t.accent);
  st.setProperty('--accent-ink', t.accentInk);
  st.setProperty('--line', t.line);
  st.setProperty('--ok', t.ok);
  st.setProperty('--warn', t.warn);
  st.setProperty('--bad', t.bad);
  st.setProperty('--radius-lg', t.rLg);
  st.setProperty('--radius-md', t.rMd);
  st.setProperty('--radius-sm', t.rSm);
  st.setProperty('--radius-pill', t.rPill);
  st.setProperty('--border', t.border);
  st.setProperty('--pad', t.pad);
  st.setProperty('--font-ui', t.fontUi);
  st.setProperty('--font-display', t.fontDisplay);
  st.setProperty('--font-mono', t.fontMono);
  st.setProperty('--display-weight', t.displayWeight);
  st.setProperty('--title-weight', t.titleWeight);
  st.setProperty('--label-track', t.labelTrack);
  st.setProperty('--shadow', t.shadow);
  st.setProperty('--blur', t.blur);

  screenEl.dataset.id = S.id;
  screenEl.dataset.mode = S.mode;
  screenEl.dataset.tunnel = S.tunnel;

  el('modeBtn').textContent = 'Mode : ' + (S.mode === 'dark' ? 'sombre' : 'clair');

  const sw = el('swatches');
  sw.innerHTML = '';
  [t.bg, t.surface2, t.accent, t.ink, t.ok, t.bad].forEach(function (color) {
    const d = document.createElement('div');
    d.className = 'swatch';
    d.style.background = color;
    sw.appendChild(d);
  });

  el('panelName').textContent = t.dir;
  el('panelTokens').innerHTML = [
    ['Rayon des cartes', t.rLg],
    ['Rayon des pastilles', t.rPill],
    ['Épaisseur du trait', t.border],
    ['Marge latérale', t.pad],
    ['Police d’affichage', t.fontDisplay.indexOf('Georgia') >= 0 ? 'Serif' : t.fontDisplay.indexOf('ui-monospace') >= 0 ? 'Monospace' : 'Système'],
    ['Graisse du titre', t.titleWeight],
    ['Graisse du chrono', t.displayWeight],
    ['Interlettrage', t.labelTrack],
    ['Accent', t.accent]
  ].map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
}

function render() {
  apply();
  const body = SCREENS[S.screen] ? SCREENS[S.screen]() : screenHome();
  const speed = S.id === 'otaku' ? '<div class="screen-speed"></div>' : '';
  const tabs = TABS[S.screen] ? tabbar() : '';
  screenEl.innerHTML = statusbar() + '<div class="bgfx"></div>' + speed + body + tabs +
    '<div class="home-ind"></div>';
  const vp = screenEl.querySelector('.viewport');
  if (vp) vp.scrollTop = 0;
  paintTimer();
}

function fmtElapsed() {
  if (S.tunnel !== 'connected') return '00:00';
  const total = Math.max(0, Math.floor((Date.now() - S.connectedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

function paintTimer() {
  const node = el('sessionTimer');
  if (node && S.tunnel === 'connected') node.textContent = fmtElapsed();
}

/* ------------------------------------------------------------ interactions */

function goTo(name) {
  if (!SCREENS[name]) return;
  if (name !== S.screen) {
    S.stack.push(S.screen);
    if (S.stack.length > 20) S.stack.shift();
  }
  S.screen = name;
  el('screenSel').value = name;
  render();
}

function goBack() {
  const prev = S.stack.pop();
  S.screen = prev && SCREENS[prev] ? prev : 'home';
  el('screenSel').value = S.screen;
  render();
}

function setTunnel(next, silent) {
  S.tunnel = next;
  if (next === 'connected') S.connectedAt = Date.now();
  if (!silent) el('tunnelSel').value = next;
  if (!silent) render();
}

function cycleTunnel() {
  if (S.timer) { clearTimeout(S.timer); S.timer = null; }
  if (S.tunnel === 'stopped' || S.tunnel === 'no-egress') {
    setTunnel('connecting');
    S.timer = setTimeout(function () { S.timer = null; setTunnel('connected'); }, 1400);
  } else if (S.tunnel === 'connecting') {
    setTunnel('stopped');
  } else {
    setTunnel('stopped');
  }
}

screenEl.addEventListener('click', function (event) {
  const orb = event.target.closest('#orb');
  if (orb) { cycleTunnel(); return; }

  const back = event.target.closest('[data-back]');
  if (back) { goBack(); return; }

  const modeBtn = event.target.closest('[data-mode]');
  if (modeBtn) { S.mode = S.mode === 'dark' ? 'light' : 'dark'; render(); return; }

  const go = event.target.closest('[data-go]');
  if (go) {
    if (go.hasAttribute('data-connect')) setTunnel('connected', true);
    goTo(go.getAttribute('data-go'));
    return;
  }

  const refresh = event.target.closest('[data-refresh]');
  if (refresh) { cycleTunnel(); goTo('home'); return; }

  const server = event.target.closest('[data-server]');
  if (server) { S.server = server.getAttribute('data-server'); goTo('home'); return; }

  const plan = event.target.closest('[data-plan]');
  if (plan) { S.plan = plan.getAttribute('data-plan'); render(); return; }

  const method = event.target.closest('[data-method]');
  if (method) { S.method = method.getAttribute('data-method'); render(); return; }

  const filter = event.target.closest('[data-filter]');
  if (filter) {
    S.filter = filter.getAttribute('data-filter');
    render();
    return;
  }

  const appearance = event.target.closest('[data-appearance]');
  if (appearance) {
    const v = appearance.getAttribute('data-appearance');
    S.appearance = v;
    S.mode = v === 'Clair' ? 'light' : v === 'Sombre' ? 'dark' : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    render();
    return;
  }

  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const on = toggle.getAttribute('aria-checked') === 'true';
    toggle.setAttribute('aria-checked', on ? 'false' : 'true');
    return;
  }

  const accHead = event.target.closest('[data-acc-head]');
  if (accHead) { accHead.parentElement.classList.toggle('open'); return; }
});

/* --------------------------------------------------------------- chrome */

el('screenSel').innerHTML = SCREEN_LIST.map(function (s) {
  return '<option value="' + s[0] + '">' + s[1] + '</option>';
}).join('');
el('screenSel').value = S.screen;

el('screenSel').addEventListener('change', function (e) { goTo(e.target.value); });

el('idSeg').addEventListener('click', function (e) {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  S.id = b.getAttribute('data-id');
  Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) {
    x.setAttribute('aria-pressed', String(x === b));
  });
  render();
});

el('modeBtn').addEventListener('click', function () {
  S.mode = S.mode === 'dark' ? 'light' : 'dark';
  S.appearance = S.mode === 'dark' ? 'Sombre' : 'Clair';
  render();
});

el('tunnelSel').addEventListener('change', function (e) { setTunnel(e.target.value); });

setInterval(function () {
  paintTimer();
}, 500);

render();
