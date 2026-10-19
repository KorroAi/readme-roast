# DEEP DOWN on iOS: plan (not built)

A plan only: there is no iOS wrapper in this pass (plan §10 cuts it), and nothing here has been
tried. It records what a wrapper would need so the web build does not drift away from it.

## Shape

- A single-view app with a full-screen `WKWebView`, landscape only, status bar hidden, home
  indicator auto-hidden (`prefersHomeIndicatorAutoHidden`), `viewport-fit=cover` (already in
  `index.html`), safe areas from `env(safe-area-inset-*)` (already in `styles.css`).
- Files served from a custom scheme with `WKURLSchemeHandler` (e.g. `deepdown://app/index.html`),
  mirroring the Android shell's virtual origin: module scripts, module workers and
  `localStorage` need a real origin, and every other request is refused (offline by construction,
  no App Transport Security exceptions).
- The same bridge names as Android, through `WKScriptMessageHandler`:
  `DeepDownAndroid.keepScreenOn(bool)` → `isIdleTimerDisabled`; `setBackHandled` is unused (no
  system Back on iOS); lifecycle `deepDownLifecycle('pause' | 'resume')` from
  `sceneWillResignActive` / `sceneDidBecomeActive`; `webViewWebContentProcessDidTerminate` →
  reload (the Android `onRenderProcessGone` equivalent).
- Audio: `AVAudioSession` category `.ambient` (respects the silent switch) and the game's existing
  "unlock on gesture" path, which already handles iOS's rule that audio starts inside a touch end.
- Haptics: `navigator.vibrate` does not exist in WKWebView; a `UIImpactFeedbackGenerator` bridge
  would replace `src/ui/haptics.ts`'s backend (the patterns stay).

## Risks to measure first

- WebGL 2 performance in WKWebView on an A12–A13 iPhone (the oldest supported), with the Battery
  preset; the quality governor applies unchanged.
- `localStorage` persistence: WKWebView data can be evicted under storage pressure; a native
  save mirror (also cut on Android) may be required on iOS.
- Module workers in a custom-scheme origin (supported since iOS 15; test the world generation).

## Release

- Apple Developer Program (US$99/year), an App Store Connect record, the same title decision, the
  hosted privacy statement, App Privacy "Data Not Collected", age rating 4+.
- Versioning: `CFBundleShortVersionString` = package.json version, `CFBundleVersion` = the same
  versionCode from `tools/version.mjs`.
