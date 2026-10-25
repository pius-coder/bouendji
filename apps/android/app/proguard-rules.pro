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
# libbox.aar embarque ses règles consommateur (proguard.txt de l'AAR) :
#   -keep class go.** { *; }
#   -keep class io.nekohasekai.** { *; }
# Vérifié dans mapping.txt du 2026-10-25 : aucune classe ni membre renommé.
# Un AAR reconstruit sans ce fichier casserait le JNI en release seulement.

# --- Modèle de tunnel ------------------------------------------------------
-keep interface cm.bouendji.vpn.vpn.TunnelEngine { *; }
-keep class * implements cm.bouendji.vpn.vpn.TunnelEngine { *; }

# --- Lisibilité des traces en production -----------------------------------
# Sans cela, une pile d'exception release est illisible et le support ne peut
# rien diagnostiquer. Le mapping.txt doit être archivé à chaque build.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
