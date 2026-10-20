# Règles R8 — socle Android.
#
# Rien ici n'a été validé par un build. Les règles sont volontairement larges :
# un `-keep` superflu coûte quelques octets, une règle manquante casse la
# sérialisation en production et seulement en production.

# --- kotlinx.serialization -------------------------------------------------
# Les sérialiseurs générés sont référencés par réflexion depuis @Serializable.
-keepattributes *Annotation*, InnerClasses, Signature
-keepclassmembers class **$$serializer {
    *** descriptor;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class cm.bouendji.vpn.**$$serializer { *; }
-keepclassmembers class cm.bouendji.vpn.** {
    *** Companion;
}
-keepclasseswithmembers class cm.bouendji.vpn.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- OkHttp ----------------------------------------------------------------
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Keystore / crypto -----------------------------------------------------
# Les providers ne sont pas atteints par réflexion depuis notre code, mais les
# noms d'algorithme sont des chaînes : rien à garder côté classes.

# --- libbox (sing-box) -----------------------------------------------------
# Non intégré dans ce lot (aucune version vérifiée). Quand l'adaptateur sera
# branché, libbox est appelé depuis JNI : ses classes doivent survivre à R8,
# sinon l'échec n'apparaît qu'en release. Gabarit à décommenter avec la
# dépendance réelle :
# -keep class io.nekohasekai.libbox.** { *; }
# -keep interface io.nekohasekai.libbox.** { *; }

# --- Modèle de tunnel ------------------------------------------------------
-keep interface cm.bouendji.vpn.vpn.TunnelEngine { *; }
-keep class * implements cm.bouendji.vpn.vpn.TunnelEngine { *; }

# --- Lisibilité des traces en production -----------------------------------
# Sans cela, une pile d'exception release est illisible et le support ne peut
# rien diagnostiquer. Le mapping.txt doit être archivé à chaque build.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
