// DEEP DOWN Android: the Play bundle (AAB) build. Unverified until its first CI run: Google's
// SDK and Gradle downloads are blocked in the container this was written in (see README.md).
// The smoke-test APK keeps its own Gradle-free path: build-apk.sh.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "deep-down"
include(":app")
