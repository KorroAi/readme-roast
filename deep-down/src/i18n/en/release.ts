// English text for the release: crash panel, privacy, licences, quality governor.

export const release = {
  // Crash panel (src/main.ts). Nothing is ever sent anywhere: details are copied by the player.
  'release.crash.message': 'DEEP DOWN hit a problem. Your last autosave is safe.',
  'release.crash.restart': 'Restart',
  'release.crash.copy': 'Copy details',
  'release.crash.copied': 'Details copied. Nothing was sent anywhere.',
  'release.crash.copyManual': 'Select the details below to copy them. Nothing is sent anywhere.',
  'release.crash.detailsLabel': 'Technical details',
  'release.crash.graphicsLost': 'The graphics could not be restored.',

  // Context loss (the GPU dropped the WebGL context): shown while the browser restores it.
  'release.gl.restoring': 'Restoring graphics…',

  // Automatic quality (src/render/QualityGovernor.ts): shown once, the first time it steps down.
  'release.quality.lowered': 'Quality set to Battery to keep the game smooth. You can change it in Settings.',

  // dist/licenses.txt (vite.config.ts).
  'release.licenses.title': 'DEEP DOWN: open-source notices',
  'release.licenses.intro': 'DEEP DOWN is built with the open-source software below. Each notice is reproduced as its licence requires.',
  'release.licenses.three': 'three.js {version}, the 3D engine (https://threejs.org)',
  'release.licenses.vite': 'Vite {version}: the build tool inserts small runtime helpers (module preloading) into the game code',

  // dist/privacy.html (vite.config.ts), hosted publicly for the store listing.
  'release.privacy.pageTitle': 'DEEP DOWN: Privacy',
  'release.privacy.heading': 'Privacy',
  'release.privacy.summary': 'DEEP DOWN does not collect any data. No account, no ads, no analytics, no tracking.',
  'release.privacy.networkTitle': 'Nothing leaves your device',
  'release.privacy.network': 'The game sends nothing over the network. The Android app does not request permission to use the internet, so it cannot.',
  'release.privacy.storageTitle': 'What stays on your device',
  'release.privacy.storage': 'Your saved expedition and your settings are kept in the app’s own storage on your device. Uninstalling the game or clearing its storage deletes them.',
  'release.privacy.backupTitle': 'Android backup',
  'release.privacy.backup': 'If you have turned on Android’s device backup, Android may include the game’s saved data in your backup, under Google’s terms. The developer cannot see or access it.',
  'release.privacy.permissionsTitle': 'Permissions',
  'release.privacy.permissions': 'The Android app asks only for vibration, used for short haptic effects that you can turn off in Settings.',
  'release.privacy.crashTitle': 'Problem reports',
  'release.privacy.crash': 'If the game hits a problem, it can show technical details (game version, browser and device description, graphics chip, error message) so that you can copy them yourself. They are never sent automatically.',
  'release.privacy.childrenTitle': 'Children',
  'release.privacy.children': 'The game collects no data from anyone, children included.',
  'release.privacy.changesTitle': 'Changes',
  'release.privacy.changes': 'If this ever changes, this page and the store listing will be updated before the change ships.',
  'release.privacy.contactTitle': 'Questions',
  'release.privacy.contact': 'Use the contact address on the game’s store page.',
  'release.privacy.version': 'This statement applies to DEEP DOWN {version}.',
} as const;
