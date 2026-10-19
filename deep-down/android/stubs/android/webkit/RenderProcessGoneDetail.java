package android.webkit;

/**
 * Compile-only stub of the API 26 class, so android/build-apk.sh can compile MainActivity's
 * onRenderProcessGone override against the API 23 platform. It is never dexed or packaged: on a
 * device the framework's own class is used, and Gradle compiles against the real API 36 SDK.
 */
public abstract class RenderProcessGoneDetail {
    public abstract boolean didCrash();

    public abstract int rendererPriorityAtExit();
}
