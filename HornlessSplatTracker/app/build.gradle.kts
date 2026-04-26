plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hornlesssplat.tracker"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hornlesssplat.tracker"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}

dependencies {
    implementation("com.google.ar:core:1.46.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
