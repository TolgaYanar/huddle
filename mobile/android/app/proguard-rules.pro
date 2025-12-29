# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.kts.

# Keep Kotlin Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class tv.wehuddle.app.**$$serializer { *; }
-keepclassmembers class tv.wehuddle.app.** {
    *** Companion;
}
-keepclasseswithmembers class tv.wehuddle.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep Socket.IO
-keep class io.socket.** { *; }
-keep class org.json.** { *; }

# Keep Okhttp
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }

# Keep Retrofit
-keepattributes Signature
-keepattributes Exceptions
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# Keep Compose
-keep class androidx.compose.** { *; }
