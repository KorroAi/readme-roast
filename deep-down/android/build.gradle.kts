// Android Gradle Plugin pinned to an exact version (AGP 8.11 supports compileSdk 36; it needs
// Gradle 8.13+ and JDK 17). CI installs Gradle 8.14.3 (.github/workflows/deep-down-android.yml).
plugins {
    id("com.android.application") version "8.11.1" apply false
}
