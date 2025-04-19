# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile


# Optimizations: If you don't want to optimize your code, you can remove these lines.
-optimizationpasses 10
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-dontpreverify
-verbose

-keep class com.google.** { *; }
-keep class com.github.maoabc.unrar.** { *; }
-keep class com.huxq17.download.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

## This is required for Kotlin code
#-keepattributes Signature
#-keepattributes *Annotation*
#
## For Jackson JSON library
#-dontwarn org.codehaus.jackson.**
#
## For Gson
#-keepattributes *Annotation*
#-keepattributes Signature
#-keep class com.google.gson.examples.android.model.** { *; }
#
## For Retrofit
#-keep class retrofit.** { *; }
#-keepclasseswithmembers class * {
#    @retrofit.http.* <methods>;
#}
#
## For OkHttp
#-dontwarn com.squareup.okhttp.**
#-keep class com.squareup.okhttp.** { *; }
#
## For Android support libraries
#-keep class android.support.v4.** { *; }
#-keep interface android.support.v4.** { *; }
#-keep class android.support.** { *; }
#-keep interface android.support.** { *; }