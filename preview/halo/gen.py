# -*- coding: utf-8 -*-
"""Génère index.html : accueil des 4 identités tiré verbatim de l'atelier,
   + toutes les pages de l'application dans le même cadre (identité Halo)."""
import re, pathlib

HERE = pathlib.Path(__file__).parent
ATELIER = pathlib.Path(r"C:\Users\HP\Documents\Codex\2026-10-19\es\outputs\Atelier-identites-VPN-v2.html")
src = ATELIER.read_text(encoding="utf-8", errors="replace")

arts = re.findall(r'<article class="col" data-theme="(\w+)">.*?</article>', src, re.S)
blocks = re.findall(r'(<article class="col" data-theme="\w+">.*?</article>)', src, re.S)
assert len(blocks) == 4, f"articles trouves: {len(blocks)}"

SBAR = '''<div class="sbar"><span class="sbar-time">9:41</span><span class="sbar-ic" aria-hidden="true"><svg class="sb-bars" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg><svg class="sb-wifi" viewBox="0 0 16 12"><path d="M1.8 4.2a9 9 0 0 1 12.4 0"/><path d="M4 6.4a6 6 0 0 1 8 0"/><path d="M6.2 8.5a3 3 0 0 1 3.6 0"/><circle cx="8" cy="10.4" r=".9" fill="currentColor" stroke="none"/></svg><svg class="sb-batt" viewBox="0 0 25 12"><rect x=".8" y="2.2" width="20" height="8" rx="2.4"/><rect x="3" y="4.4" width="13.5" height="3.6" rx="1.1" fill="currentColor" stroke="none"/><path d="M22.4 5v2.4" stroke-linecap="round"/></svg></span></div>'''

def ic(path, cls=""):
    return f'<svg class="ico {cls}" viewBox="0 0 24 24">{path}</svg>'
P = {
 "back": '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
 "chev": '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
 "gear": '<path d="M4 7h8.5M17 7h3M4 17h3M11.5 17H20"/><circle cx="15" cy="7" r="2.1"/><circle cx="9" cy="17" r="2.1"/>',
 "card": '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3 10h18"/>',
 "dev": '<rect x="3" y="5" width="12.5" height="10" rx="2"/><path d="M3 19h12.5"/><rect x="17.4" y="9" width="4.6" height="10" rx="1.6"/>',
 "user": '<circle cx="12" cy="8" r="3.4"/><path d="M5.2 20c.7-3.6 3.4-5.6 6.8-5.6s6.1 2 6.8 5.6"/>',
 "help": '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1 .9-1 1.6v.4"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
 "gift": '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/>',
 "lock": '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
 "srv": '<rect x="3" y="4.5" width="18" height="6" rx="2"/><rect x="3" y="13.5" width="18" height="6" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
 "key": '<circle cx="8.2" cy="12" r="3.6"/><path d="M11.8 12H21M18 12v3.2M15.2 12v2.4"/>',
 "out": '<path d="M10 5.5H6.2A2.2 2.2 0 0 0 4 7.7v8.6a2.2 2.2 0 0 0 2.2 2.2H10"/><path d="M15 8.5 18.5 12 15 15.5"/><path d="M9 12h9.5"/>',
 "shield": '<path d="M12 3.2 19 6v5.4c0 4.2-2.9 7.5-7 9.4-4.1-1.9-7-5.2-7-9.4V6l7-2.8Z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
 "copy": '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4H6.2A2.2 2.2 0 0 0 4 6.2v6.3A2.5 2.5 0 0 0 6.5 15"/>',
 "alert": '<path d="M12 3.6 21 20H3L12 3.6Z"/><path d="M12 9v5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
 "ext": '<path d="M6 18 18 6"/><path d="M10 6h8v8"/>',
 "check": '<path d="m5 12.5 4.6 4.6L19 7"/>',
 "ref": '<path d="M20 11a8 8 0 1 0-2.6 6.4"/><path d="M20 4.5V11h-6.5"/>',
}

def head(title, kick=None):
    k = f'<div class="hkick">{kick}</div>' if kick else ''
    return (f'<div class="hhead"><button class="halo-ico" type="button" aria-label="Retour">{ic(P["back"])}</button>'
            f'<span class="t"></span></div>{k}'
            f'<h3 class="htitle" style="font-family:var(--font-display)">{title}</h3>')

def bar(title):
    return (f'<div class="hhead"><button class="halo-ico" type="button" aria-label="Retour">{ic(P["back"])}</button>'
            f'<span class="t">{title}</span>'
            f'<span class="trail"><button class="halo-ico" type="button" aria-label="Réglages">{ic(P["gear"])}</button></span></div>')

def row(icon, label, sub="", val="", chev=True):
    s = f'<span class="hrs">{sub}</span>' if sub else ''
    v = f'<span class="hrv">{val}</span>' if val else ''
    c = '<span class="hrchev">›</span>' if chev else ''
    return (f'<button class="hrow" type="button"><span class="hric">{ic(icon)}</span>'
            f'<span class="hrm"><span class="hrl">{label}</span>{s}</span>{v}{c}</button>')

def swrow(label, sub, on):
    return (f'<div class="hrow"><span class="hrm"><span class="hrl">{label}</span>'
            f'<span class="hrs">{sub}</span></span>'
            f'<button class="hswitch" role="switch" aria-checked="{str(on).lower()}" type="button" aria-label="{label}"></button></div>')

def group(*rows): return '<div class="hgroup">' + "".join(rows) + '</div>'

def phone(caption, inner):
    return (f'<div><div class="phone"><div class="screen t-halo">'
            f'<div class="halo-aurora" aria-hidden="true"><i></i><i></i><i></i></div>'
            f'{SBAR}<div class="hscreen"><div class="hscroll">{inner}</div></div>'
            f'<div class="home-ind" aria-hidden="true"></div></div></div>'
            f'<div class="cap">{caption}</div></div>')

SEAL = '''<div style="display:flex;justify-content:center;margin-top:26px;color:var(--accent)"><svg width="86" height="86" viewBox="0 0 120 120" fill="none" stroke="currentColor"><circle cx="60" cy="60" r="52" opacity=".35"/><circle cx="60" cy="60" r="44" stroke-dasharray="2 6" opacity=".25"/><path d="M60 24 90 37v23c0 19-13 31-30 36-17-5-30-17-30-36V37l30-13Z" stroke-width="1.6"/><path d="m47 60 9 9 18-19" stroke-width="2.4" stroke-linecap="round"/></svg></div>'''

PAGES = []

# splash
PAGES.append(("01 · Démarrage", f'''
<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
{SEAL}
<div style="font-family:var(--font-display);font-size:30px;font-weight:640;letter-spacing:-.03em;margin-top:16px">Bouendji</div>
<div class="hkick" style="margin-top:6px">VPN</div>
</div><p class="hfoot">Chargement du coffre chiffré…</p>'''))

# onboarding
PAGES.append(("02 · Bienvenue", f'''
{bar("")}
<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
{SEAL}
<div class="hkick">Étape 1 sur 3</div>
<h3 class="htitle">Ton réseau,<br>sans témoin.</h3>
<p class="hsub" style="max-width:270px">Une seule sortie chiffrée. Aucune configuration visible, aucun journal de navigation.</p>
</div>
<button class="hbtn" type="button">Continuer</button>
<button class="hbtn ghost" type="button">J'ai déjà un compte</button>'''))

# login
PAGES.append(("03 · Connexion", f'''
{bar("Compte")}
<div class="hkick">Compte</div><h3 class="htitle">Connexion</h3>
<p class="hsub">Le même compte sur tous tes appareils, trois au maximum.</p>
<div class="hfield"><label>Adresse e-mail</label><input value="ange@exemple.cm"></div>
<div class="hfield"><label>Mot de passe</label><input type="password" value="motdepasse"></div>
<button class="hbtn" type="button">Se connecter</button>
<div class="hbtnrow"><button class="hbtn ghost" type="button">J'ai un code</button><button class="hbtn ghost" type="button">Créer un compte</button></div>
<p class="hfoot">Mot de passe oublié : la réinitialisation passe par l'e-mail du compte, jamais par SMS.</p>'''))

# vpn-auth
PAGES.append(("04 · Autorisation VPN", f'''
{bar("")}
<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
<div class="hbigic">{ic(P["shield"])}</div>
<h3 class="htitle">Autoriser la connexion VPN</h3>
<p class="hsub" style="max-width:280px">Android affichera sa propre fenêtre : c'est la seule autorisation système dont l'application a besoin.</p>
</div>
<button class="hbtn" type="button">Autoriser</button>
<button class="hbtn ghost" type="button">Plus tard</button>
<p class="hfoot">La fenêtre qui s'ouvre ensuite est celle d'Android, pas la nôtre.</p>'''))

# servers
srv = "".join(
  f'<button class="hrow" type="button"><span class="hric">{ic(P["srv"])}</span><span class="hrm"><span class="hrl">{n}</span><span class="hrs">{c} · {p}</span></span>' +
  ('<span style="color:var(--accent)">'+ic(P["check"])+'</span>' if on else '<span class="hrchev">›</span>') + '</button>'
  for n,c,p,on in [("Nji · Francfort","Allemagne","24 ms",True),("Paris","France","38 ms",False),("Amsterdam","Pays-Bas","42 ms",False),("Douala","Cameroun","61 ms",False),("Montréal","Canada","118 ms",False)])
PAGES.append(("05 · Serveurs", f'''
{bar("Serveurs")}
<div class="hkick">Sortie</div><h3 class="htitle">Choisir un serveur</h3>
<p class="hsub">La bascule se fait après la mesure, sans couper la session.</p>
<div class="hseg"><button class="on" type="button">Tous</button><button type="button">Favoris</button><button type="button">Nji</button></div>
<div class="hgroup">{srv}</div>
<p class="hfoot">Latence mesurée en direct depuis l'appareil. Aucun débit affiché : nous ne le mesurons pas encore.</p>'''))

# nji
PAGES.append(("06 · Code d'accès", f'''
{bar("Code d'accès")}
{SEAL}
<div class="hkick" style="text-align:center">Activation</div>
<h3 class="htitle" style="text-align:center">Activer un code</h3>
<p class="hsub" style="text-align:center">Un code à usage unique, lié à ton compte et à cet appareil.</p>
<div class="hcode"><i>NJI4</i><i>7K2M</i></div>
<div class="hbtnrow"><button class="hbtn ghost" type="button">{ic(P["copy"])} Coller</button><button class="hbtn" type="button">Activer</button></div>
<div class="hcard"><span class="k">Ce que le code débloque</span><p>Le forfait choisi, sur cet appareil uniquement. La vérification se fait côté serveur, jamais dans l'application.</p></div>'''))

# no-egress
PAGES.append(("07 · Aucune sortie", f'''
{bar("Diagnostic")}
{SEAL}
<div class="hkick">État</div><h3 class="htitle">Aucune sortie</h3>
<p class="hsub">Toutes les configurations de cet appareil ont expiré. Le tunnel ne peut pas être monté.</p>
<div class="hmono" style="margin-top:16px">code      NO_EGRESS
bundle    rev 41 · expiré
appareil  d-8f2c…a91
mesure    échec 3/3</div>
<button class="hbtn" type="button">{ic(P["ref"])} Réessayer</button>
<button class="hbtn ghost" type="button">Choisir un autre serveur</button>
<button class="hbtn ghost" type="button">Renouveler le forfait</button>
<p class="hfoot">Ce diagnostic ne contient que des codes et des horodatages locaux.</p>'''))

# order
plans = "".join(
  f'<button class="hplan {"on" if on else ""}" type="button"><span class="hradio"></span><span class="hrm"><span class="hrl">{n}</span><span class="hrs">Accès complet, trois appareils</span></span><span class="hamt">{a}</span></button>'
  for n,a,on in [("1 mois","3 500 FCFA",False),("3 mois","9 000 FCFA",True),("12 mois","30 000 FCFA",False)])
PAGES.append(("08 · Forfait et paiement", f'''
{bar("Forfait")}
<div class="hkick">Paiement</div><h3 class="htitle">Choisir un forfait</h3>
<p class="hsub">La commande est créée chez nous, Fapshi encaisse. Le webhook ne vaut jamais preuve : nous relisons le statut.</p>
<div class="hgroup">{plans}</div>
<div class="hkick">Moyen de paiement</div>
{group(row(P["card"],"MTN Mobile Money","Fapshi · confirmation par l'opérateur"), row(P["card"],"Orange Money","Fapshi · confirmation par l'opérateur"))}
<div class="hcard"><span class="k">Récapitulatif</span><p><strong>3 mois</strong> · trois appareils · renouvellement manuel. Aucun prélèvement automatique.</p></div>
<button class="hbtn" type="button">Payer avec Fapshi</button>
<p class="hfoot">Montants d'exemple : le tarif n'est pas encore fixé.</p>'''))

# order-done
PAGES.append(("09 · Paiement confirmé", f'''
{bar("")}
<div class="hbigic ok">{ic(P["check"])}</div>
<h3 class="htitle" style="text-align:center">Forfait actif</h3>
<p class="hsub" style="text-align:center">Confirmé par le serveur, pas par le retour du navigateur.</p>
{group(
  row(P["key"],"Référence", val="ORD-2481", chev=False),
  row(P["card"],"Montant", val="9 000 FCFA", chev=False),
  row(P["dev"],"Appareils", val="3 inclus", chev=False))}
<button class="hbtn" type="button">Continuer</button>
<p class="hfoot">Aucun code n'est envoyé par message : tout est déjà sur l'appareil.</p>'''))

# paywall
PAGES.append(("10 · Offre", f'''
{bar("Offre")}
{SEAL}
<div class="hkick" style="text-align:center">Trois appareils · une sortie</div>
<h3 class="htitle" style="text-align:center">Trois jours pour juger.</h3>
<p class="hsub" style="text-align:center;max-width:280px;margin-left:auto;margin-right:auto">Puis le forfait de ton choix. Sans reconduction automatique, sans prélèvement caché.</p>
<div class="hcard"><span class="k">Inclus</span><p>Configurations chiffrées pour cet appareil, bascule automatique, trois appareils, aucun journal de navigation.</p></div>
<button class="hbtn" type="button">Voir les forfaits</button>
<button class="hbtn ghost" type="button">Plus tard</button>'''))

# subscription
PAGES.append(("11 · Abonnement", f'''
{bar("Abonnement")}
<div class="hcard" style="margin-top:18px"><span class="k">Formule</span>
<div style="font-family:var(--font-display);font-size:24px;font-weight:640;letter-spacing:-.02em">12 jours restants</div>
<p style="margin-top:6px">Échéance le 2 novembre 2026 · renouvellement manuel</p>
<div class="hbar2"><span style="width:40%"></span></div><p style="font-size:11px">40 % du forfait restant</p></div>
{group(
  row(P["card"],"Renouveler","Payer par Mobile Money"),
  row(P["dev"],"Appareils", val="1 / 3"),
  row(P["help"],"Reçus et factures", val="2"))}
<div class="hkick">Inclus</div>
{group(
  row(P["lock"],"Configurations chiffrées", val="oui", chev=False),
  row(P["ref"],"Bascule automatique", val="oui", chev=False),
  row(P["shield"],"Journal de navigation", val="aucun", chev=False))}
<p class="hfoot">À l'échéance, la sortie cesse. Rien n'est débité.</p>'''))

# devices
slots = f'''
<div class="hgroup">
<div class="hrow"><span class="hric">{ic(P["dev"])}</span><span class="hrm"><span class="hrl">Pixel 8</span><span class="hrs">Cet appareil · clé dans le Keystore</span></span><span class="hbadge">actif</span></div>
<div class="hrow"><span class="hric">{ic(P["dev"])}</span><span class="hrm"><span class="hrl">Tecno Spark</span><span class="hrs">Dernière connexion il y a 2 jours</span></span><button class="hbtn ghost sm" style="width:auto;margin:0" type="button">Révoquer</button></div>
<div class="hrow" style="color:var(--muted)"><span class="hric" style="background:none;border:1px dashed var(--line);color:var(--muted)">{ic(P["dev"])}</span><span class="hrm"><span class="hrl">Emplacement libre</span><span class="hrs">Pour un nouvel appareil</span></span></div>
</div>'''
PAGES.append(("12 · Appareils", f'''
{bar("Appareils")}
<div class="hkick">Compte</div><h3 class="htitle">Trois appareils</h3>
<p class="hsub">Chacun a sa propre paire de clés. Révoquer coupe la prochaine connexion, pas la session en cours.</p>
{slots}
<p class="hfoot">Pas d'IMEI, pas d'identifiant matériel : l'appareil est reconnu par sa clé.</p>'''))

# invite
PAGES.append(("13 · Invitation", f'''
{bar("Invitation")}
{SEAL}
<div class="hkick" style="text-align:center">Gagner</div>
<h3 class="htitle" style="text-align:center">Inviter un ami</h3>
<p class="hsub" style="text-align:center">Il obtient un jour, tu obtiens trois jours quand son forfait devient actif.</p>
<div class="hcode"><i>ANGE</i><i>2481</i></div>
<div class="hbtnrow"><button class="hbtn ghost" type="button">{ic(P["copy"])} Copier</button><button class="hbtn" type="button">{ic(P["ext"])} Partager</button></div>
<div class="hcard"><span class="k">Comment ça marche</span><p>Le code est rattaché à ton compte. Le crédit est appliqué côté serveur, jamais dans l'application.</p></div>'''))

# profile
PAGES.append(("14 · Compte", f'''
{bar("Compte")}
<div style="display:flex;align-items:center;gap:14px;margin-top:18px">
<button class="halo-ico halo-avatar" type="button" style="width:56px;height:56px;font-size:19px"><span>AN</span></button>
<div><div style="font-family:var(--font-display);font-size:21px;font-weight:640;letter-spacing:-.02em">Ange N.</div>
<div style="font-size:11.5px;color:var(--muted)">ange@exemple.cm · +237 6 21 82 65 74</div></div></div>
{group(
  row(P["card"],"Abonnement", val="12 j"),
  row(P["dev"],"Mes appareils", val="1 / 3"),
  row(P["gift"],"Inviter un ami"),
  row(P["help"],"Aide"),
  row(P["gear"],"Réglages"))}
{group(row(P["out"],"Se déconnecter", chev=False))}
<p class="hfoot">Version 0.1.0 · moteur sing-box 1.14.3</p>'''))

# settings
PAGES.append(("15 · Réglages", f'''
{bar("Réglages")}
<div class="hkick">Apparence</div>
<div class="hcard" style="padding:10px"><div class="hseg" style="margin:0"><button type="button">Système</button><button type="button">Clair</button><button class="on" type="button">Sombre</button></div></div>
<div class="hkick">Connexion</div>
{group(
  swrow("Toujours actif","Proposé, jamais imposé",True),
  swrow("Reconnexion automatique","Après une coupure réseau",True),
  swrow("Couper le réseau sans tunnel","Kill switch",False))}
<div class="hkick">À propos</div>
{group(
  row(P["key"],"Version", val="0.1.0", chev=False),
  row(P["lock"],"Confidentialité"))}'''))

# help
faq = "".join(f'<div class="hacc"><b>{q}</b><p>{a}</p></div>' for q,a in [
 ("Pourquoi je ne vois pas ma configuration ?","Elle vit dans un coffre chiffré sur l'appareil : jamais affichée, jamais copiable. C'est ce qui empêche de la partager."),
 ("Combien d'appareils ?","Trois, chacun avec sa propre clé."),
 ("Ça marche sans réseau au premier lancement ?","Non : il faut enrôler l'appareil une première fois. Ensuite le bundle hors ligne prend le relais."),
 ("Que se passe-t-il à l'échéance ?","Le tunnel cesse de se monter. Rien n'est débité.")])
PAGES.append(("16 · Aide", f'''
{bar("Aide")}
<div class="hkick">Support</div><h3 class="htitle">Une question précise</h3>
<p class="hsub">Réponses courtes. Le reste passe par WhatsApp.</p>
<div class="hgroup">{faq}</div>
{group(row(P["ext"],"Écrire sur WhatsApp","Réponse sous 24 h ouvrées", chev=False), row(P["alert"],"Diagnostic de connexion"))}
<p class="hfoot">Aucun formulaire ne demande ton mot de passe. Si on te le demande, ce n'est pas nous.</p>'''))

# privacy
PAGES.append(("17 · Confidentialité", f'''
{bar("Confidentialité")}
<div class="hkick">Engagements</div><h3 class="htitle">Ce que nous savons</h3>
<p class="hsub">Le strict nécessaire pour facturer et connecter. Rien de plus.</p>
{group(
  row(P["shield"],"Journal de navigation", val="aucun", chev=False),
  row(P["lock"],"Contenu inspecté", val="jamais", chev=False),
  row(P["dev"],"Identifiant matériel", val="aucun", chev=False),
  row(P["key"],"Clé privée", val="sur l'appareil", chev=False))}
<div class="hcard"><span class="k">Ce qui est conservé</span><p>Le compte, les appareils enrôlés (clé publique seule), les commandes et les commissions. Les configurations sont chiffrées pour un appareil précis et expirent.</p>
<p>Pas de revente de données, pas de publicité ciblée, pas de lecture du trafic.</p></div>'''))

# --- bloc stats de l'accueil Halo : icônes (demande Q2a) ---
halo = blocks[0]
old_stats = re.search(r'<div class="halo-stats">.*?</div>\s*</div>', halo, re.S)
icon_stats = '''<div class="halo-stats" style="grid-template-columns:1fr 1fr">
<div class="halo-stat" style="flex-direction:row;align-items:center;justify-content:center;gap:8px"><svg class="ico" style="width:17px;height:17px;color:var(--accent)" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/></svg><strong>24 ms</strong></div>
<div class="halo-stat" style="flex-direction:row;align-items:center;justify-content:center;gap:8px"><svg class="ico" style="width:17px;height:17px;color:var(--accent)" viewBox="0 0 24 24"><rect x="3" y="5" width="12.5" height="10" rx="2"/><path d="M3 19h12.5"/><rect x="17.4" y="9" width="4.6" height="10" rx="1.6"/></svg><strong>1 / 3</strong></div>
</div>
</div>'''
halo = halo[:old_stats.start()] + icon_stats + halo[old_stats.end():]
blocks[0] = halo

# captions de l'atelier : on retire les badges d'attribution (bruit de revue)
ident_html = "\n".join(blocks)

pages_html = "\n".join(phone(cap, body) for cap, body in PAGES)

html = f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Toutes les pages — identités portées</title>
<link rel="stylesheet" href="atelier.css">
<link rel="stylesheet" href="page.css">
<style>body{{--p:.72}}</style>
</head>
<body data-appearance="dark" data-state="connected">
<div class="hbar"><b>Toutes les pages</b><span>Structure : prototype de ton associé · Habillage : atelier (verbatim). Accueil Halo : stats refaites en icônes.</span><span class="sp"></span><button id="modeBtn" type="button">Mode : sombre</button></div>
<div class="wrap">
<h2 class="sec">1 · L'accueil, quatre identités (atelier, tel quel)</h2>
<p class="secsub">Ces quatre téléphones sont copiés du fichier Atelier-identites-VPN-v2.html sans retouche de style, hormis le bloc de stats de Halo remplacé par des icônes comme demandé.</p>
<main class="gallery" data-view="all">
{ident_html}
</main>
<h2 class="sec">2 · Toutes les pages — identité Halo</h2>
<p class="secsub">Mêmes structure et parcours que le prototype, composants de l'atelier (verre, orbe, barre d'outils 1 + 3). Les trois autres identités appliquent la même structure avec leur matière.</p>
<div class="gal">
{pages_html}
</div>
</div>
<script>
(function(){{
  var b=document.getElementById('modeBtn');
  b.addEventListener('click',function(){{
    var d=document.body.getAttribute('data-appearance')==='dark';
    document.body.setAttribute('data-appearance', d?'light':'dark');
    b.textContent='Mode : '+(d?'clair':'sombre');
  }});
  var t0=Date.now()-1478000;
  function tick(){{
    var s=Math.floor((Date.now()-t0)/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;
    var v=(h>0?h+':':'')+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0');
    document.querySelectorAll('.js-timer').forEach(function(n){{n.textContent=v;}});
  }}
  tick(); setInterval(tick,1000);
  document.querySelectorAll('.hswitch').forEach(function(sw){{
    sw.addEventListener('click',function(){{
      sw.setAttribute('aria-checked', sw.getAttribute('aria-checked')==='true'?'false':'true');
    }});
  }});
}})();
</script>
</body></html>'''

out = HERE / "index.html"
out.write_text(html, encoding="utf-8")
print(f"ecrit {out} : {out.stat().st_size:,} o ; pages internes: {len(PAGES)}")
