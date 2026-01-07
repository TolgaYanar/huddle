plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
}

android {
    namespace = "tv.wehuddle.app"
    compileSdk = 35

    // For real devices on your network, set HUDDLE_DEV_HOST in gradle.properties
    // For emulators (both phone and TV), 10.0.2.2 is used automatically at runtime
    val devHost = (project.findProperty("HUDDLE_DEV_HOST") as String?)?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: "192.168.1.108"
    
    // Emulator host - 10.0.2.2 is the special alias for the host machine
    val emulatorHost = "10.0.2.2"

    defaultConfig {
        applicationId = "tv.wehuddle.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "SOCKET_URL", "\"https://wehuddle.tv\"")
        buildConfigField("String", "API_BASE_URL", "\"https://wehuddle.tv/api/\"")
    }

    buildTypes {
        debug {
            isDebuggable = true
            // Primary URL (for real devices on network)
            buildConfigField("String", "SOCKET_URL", "\"http://$devHost:4000\"")
            buildConfigField("String", "API_BASE_URL", "\"http://$devHost:4000/api/\"")
            // Emulator fallback URL (10.0.2.2 is the host machine from emulator)
            buildConfigField("String", "EMULATOR_SOCKET_URL", "\"http://$emulatorHost:4000\"")
            buildConfigField("String", "EMULATOR_API_BASE_URL", "\"http://$emulatorHost:4000/api/\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

dependencies {
    // Android Core
    implementation(libs.androidx.core.ktx)

    // Lifecycle
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)

    // Compose
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    
    // TV Support - Leanback & Compose TV
    implementation(libs.androidx.leanback)
    implementation(libs.androidx.tv.foundation)
    implementation(libs.androidx.tv.material)

    // Navigation
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)

    // Kotlin Serialization
    implementation(libs.kotlinx.serialization.json)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // Networking
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)

    // Image Loading
    implementation(libs.coil.compose)

    // DataStore
    implementation(libs.androidx.datastore.preferences)

    // Media3 (ExoPlayer)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.exoplayer.hls)
    implementation(libs.androidx.media3.ui)

    // Socket.IO
    implementation(libs.socket.io.client)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
    
    // WebRTC
    implementation(libs.webrtc)
}
