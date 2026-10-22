// Texte français de la sortie (l’anglais est dans en/release.ts, en/brand.ts et en/hud.ts) : l’écran
// de plantage, les graphismes, les mentions de licence, la page de confidentialité, la marque et le
// HUD de la marche au toucher.
import type { TextKey } from '../en';

export const release: Partial<Record<TextKey, string>> = {
  // Plantage et graphismes
  'release.crash.message': 'DEEP DOWN a rencontré un problème. Votre dernière sauvegarde automatique est intacte.',
  'release.crash.restart': 'Redémarrer',
  'release.crash.copy': 'Copier les détails',
  'release.crash.copied': 'Détails copiés. Rien n’a été envoyé.',
  'release.crash.copyManual': 'Sélectionnez les détails ci-dessous pour les copier. Rien n’est envoyé.',
  'release.crash.detailsLabel': 'Détails techniques',
  'release.crash.graphicsLost': 'Impossible de rétablir les graphismes.',
  'release.gl.restoring': 'Rétablissement des graphismes…',
  'release.quality.lowered': 'Qualité réglée sur Économie pour garder le jeu fluide. Vous pouvez la changer dans les Réglages.',

  // Mentions de licence
  'release.licenses.title': 'DEEP DOWN : mentions open source',
  'release.licenses.intro': 'DEEP DOWN est construit avec les logiciels libres ci-dessous. Chaque mention est reproduite comme sa licence l’exige.',
  'release.licenses.three': 'three.js {version}, le moteur 3D (https://threejs.org)',
  'release.licenses.vite': 'Vite {version} : l’outil de build insère de petites aides d’exécution (préchargement des modules) dans le code du jeu',

  // Confidentialité
  'release.privacy.pageTitle': 'DEEP DOWN : confidentialité',
  'release.privacy.heading': 'Confidentialité',
  'release.privacy.summary': 'DEEP DOWN ne collecte aucune donnée. Pas de compte, pas de publicité, pas de statistiques, pas de pistage.',
  'release.privacy.networkTitle': 'Rien ne quitte votre appareil',
  'release.privacy.network': 'Le jeu n’envoie rien sur le réseau. L’application Android ne demande pas l’accès à Internet : elle ne le peut donc pas.',
  'release.privacy.storageTitle': 'Ce qui reste sur votre appareil',
  'release.privacy.storage': 'Votre expédition sauvegardée et vos réglages sont conservés dans le stockage propre à l’application, sur votre appareil. Désinstaller le jeu ou effacer ses données les supprime.',
  'release.privacy.backupTitle': 'Sauvegarde Android',
  'release.privacy.backup': 'Si vous avez activé la sauvegarde de l’appareil Android, Android peut inclure les données du jeu dans votre sauvegarde, selon les conditions de Google. Le développeur ne peut ni les voir ni y accéder.',
  'release.privacy.permissionsTitle': 'Autorisations',
  'release.privacy.permissions': 'L’application Android ne demande que la vibration, pour de courts retours haptiques que vous pouvez désactiver dans les Réglages.',
  'release.privacy.crashTitle': 'Rapports de problème',
  'release.privacy.crash': 'Si le jeu rencontre un problème, il peut afficher des détails techniques (version du jeu, navigateur et description de l’appareil, puce graphique, message d’erreur) pour que vous puissiez les copier vous-même. Ils ne sont jamais envoyés automatiquement.',
  'release.privacy.childrenTitle': 'Enfants',
  'release.privacy.children': 'Le jeu ne collecte aucune donnée sur personne, enfants compris.',
  'release.privacy.changesTitle': 'Modifications',
  'release.privacy.changes': 'Si cela devait changer, cette page et la fiche du jeu sur la boutique seraient mises à jour avant la sortie du changement.',
  'release.privacy.contactTitle': 'Questions',
  'release.privacy.contact': 'Utilisez l’adresse de contact indiquée sur la page du jeu dans la boutique.',
  'release.privacy.version': 'Cette déclaration s’applique à DEEP DOWN {version}.',

  // La marque (1.x)
  'brand.discoveryCount': '{index}/{total}',
  'brand.subtitle': 'LE CREUX DE LA LANTERNE',

  // La marche au toucher
  'tap.noPath': 'Aucun passage d’ici.',
};
