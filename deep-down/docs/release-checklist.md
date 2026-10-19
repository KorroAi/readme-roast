# DEEP DOWN: release checklist (director)

Everything here needs a person: an account, money, a legal decision, a secret, or a phone. None of
it can be done from code. Steps are in the order they unblock each other; the calendar long pole
is the closed test (step 6), so start steps 1–4 now.

Repository: `KorroAi/readme-roast`, game in `deep-down/`. Package name: `com.korroai.deepdown`.

---

## 1. Play developer account

- [ ] Choose the account type in Play Console (https://play.google.com/console/signup):
  - **Organization** (needs a D-U-N-S number for the legal entity): no testing gate before
    production.
  - **Personal**: production access needs a closed test with at least 12 testers opted in for
    14 continuous days. Recruit 15–20 so drop-outs do not reset the clock.
- [ ] Pay the US$25 registration fee.
- [ ] Complete identity verification (and the organization's D-U-N-S verification if chosen).

## 2. Trademark and title

"Deep Down" has a live registration held by Capcom. Decide the title before the listing exists.

- [ ] Search USPTO (https://tmsearch.uspto.gov) for `DEEP DOWN` in classes 9 (software) and 41
  (entertainment).
- [ ] Search EUIPO eSearch plus (https://euipo.europa.eu/eSearch) for the same, classes 9 and 41.
- [ ] Decide the store title. Candidate: **DEEP DOWN: Lantern Hollow** (25 of 30 characters).
  The wordmark has a subtitle lockup ready. Tell the team the decision: the title appears in
  `src/i18n/en/core.ts` (`game.title`), the web manifest and the store listing.

## 3. Upload key and GitHub secrets

The upload key signs what CI uploads; Google re-signs for users with the app signing key
(Play App Signing, step 4). Losing the upload key is recoverable through Play support; leaking it
is not a disaster either, but keep it off every shared system.

- [ ] On your own machine (not a server, not this container), create the key. keytool asks for
  one password (PKCS12 uses the same one for the store and the key):

  ```bash
  keytool -genkeypair -v -storetype PKCS12 -keystore deep-down-upload.p12 \
    -alias deepdown-upload -keyalg RSA -keysize 4096 -validity 10000 \
    -dname "CN=<legal name>, O=<legal entity>, C=<country code>"
  # 10000 days ≈ 27 years (Play needs ≥ 25)
  keytool -list -v -keystore deep-down-upload.p12   # check: RSA 4096, valid until 2053+
  ```

- [ ] Store `deep-down-upload.p12` and its password in a password manager, plus one offline copy
  (an encrypted USB stick). Never in git, chat, email or a ticket. (`android/.gitignore` refuses
  `*.p12`, `*.jks`, `*.keystore`, `*.pem`.)
- [ ] Add the four repository secrets (Settings → Secrets and variables → Actions), or with `gh`:

  ```bash
  base64 -w0 deep-down-upload.p12 > upload.b64          # macOS: base64 -i deep-down-upload.p12 | tr -d '\n' > upload.b64
  gh secret set DD_UPLOAD_KEYSTORE_B64 --repo KorroAi/readme-roast < upload.b64
  gh secret set DD_UPLOAD_STORE_PASSWORD --repo KorroAi/readme-roast   # prompts; paste the password
  gh secret set DD_UPLOAD_KEY_PASSWORD --repo KorroAi/readme-roast     # the same password
  gh secret set DD_UPLOAD_KEY_ALIAS --repo KorroAi/readme-roast --body deepdown-upload
  rm upload.b64
  ```

## 4. First CI bundle, internal testing, Play App Signing

The CI workflow and the Gradle project are **unverified until this first run**. If it fails, send
the run's log to the team; the smoke-test APK (`./android/build-apk.sh`) is unaffected.

- [ ] Run the workflow on the main branch:

  ```bash
  gh workflow run deep-down-android.yml --repo KorroAi/readme-roast -f build=0
  gh run watch --repo KorroAi/readme-roast $(gh run list --repo KorroAi/readme-roast --workflow deep-down-android.yml --limit 1 --json databaseId -q '.[0].databaseId')
  gh run download --repo KorroAi/readme-roast --name deep-down-1.0.0-1000000 --dir deep-down-1.0.0
  ```

  Each further upload of the same version needs a higher build number (`-f build=1`, `2`, …);
  a new version is a package.json change. For the release itself, tag it:

  ```bash
  git tag deep-down-v1.0.0 && git push origin deep-down-v1.0.0    # CI checks the tag matches package.json
  ```

- [ ] Play Console → Create app: the decided title, default language English (United States),
  Game, Free.
- [ ] Enrol in **Play App Signing** with a Google-generated app signing key (the default when the
  first bundle is uploaded). Keep the upload key from step 3 as the upload key.
- [ ] Testing → Internal testing → Create release → upload `app-release.aab` from the artifact →
  add yourself and the team as testers → roll out.
- [ ] Read the **pre-launch report** (Release → Testing → Pre-launch report, ready about an hour
  after the upload). The gate needs **0 crashes**; note any accessibility and screenshot findings
  for the team.
- [ ] Start the **closed test** as soon as your account type requires it (personal accounts: right
  now; the 14 days start when the 12th tester has opted in). Testing → Closed testing → create a
  track, upload the same bundle, invite the testers by email list or Google Group, share the
  opt-in link.

## 5. Confirm the facts the game and the listing state

Until each is decided, the About screen and the listing leave it out (never a placeholder).

- [ ] Package name `com.korroai.deepdown`: permanent after the first upload.
- [ ] The legal entity and the copyright line (korroai or KORROCORP).
- [ ] The game's own licence: MIT as today, or "all rights reserved".
- [ ] A support email (Play requires one on the listing).

## 6. Listing forms (Play Console → Policy and programs → App content, and Store presence)

Answers are prepared in `docs/store-listing.md`.

- [ ] Host the privacy statement publicly. It is built from `src/i18n/en/release.ts`:

  ```bash
  cd deep-down && DD_RELEASE=1 npx vite build     # writes dist/privacy.html (self-contained)
  # GitHub Pages: publish it on a gh-pages branch
  git worktree add --orphan -b gh-pages /tmp/dd-pages && cp dist/privacy.html /tmp/dd-pages/index.html   # git 2.42+
  cd /tmp/dd-pages && git add index.html && git commit -m "DEEP DOWN privacy statement" && git push origin gh-pages
  # then Settings → Pages → Branch: gh-pages / root. URL: https://korroai.github.io/readme-roast/
  ```

  Enter that URL under App content → Privacy policy.
- [ ] Content rating (IARC questionnaire): expected PEGI 3 / ESRB Everyone.
- [ ] Data safety: no data collected, no data shared.
- [ ] Ads: no ads.
- [ ] Target audience: 13 and over (not designed for children; avoids the Families programme
  requirements).
- [ ] App category: Game → Adventure. Contact details: the support email (step 5).
- [ ] Store listing text from `docs/store-listing.md`; graphics (icon `android/build/play-icon-512.png`
  from `./android/build-apk.sh`, the feature graphic and 6–8 screenshots) come from the release gate
  (`tools/store-assets.mjs`, after the last wave).

## 7. Device runs

Follow `docs/device-test-protocol.md` on two phones and record the results in TEST_REPORT.md:

- [ ] one 2022 mid-range phone (Adreno 642L or Mali-G68 class, e.g. Galaxy A54 / Pixel 6a class);
- [ ] one 3 GB phone (Adreno 610 or Mali-G52 class, e.g. Galaxy A13 / Redmi 10 class).

Listen to the mix with headphones and with the speaker, and feel the haptics: neither can be
judged in this environment.

## 8. Production

- [ ] The release gate (plan §13) is green: every MUST acceptance line has evidence, the AAB came
  from CI, the device results are recorded, the pre-launch report shows 0 crashes.
- [ ] Personal account: the closed test ran 14 days with ≥ 12 testers; apply for production
  access (Dashboard → Apply for production), answering the questions about the test.
- [ ] Production → Create release → promote the tested bundle → staged rollout (start at 20 %).
