<#
  Compile l'APK de debogage, en boucle, jusqu'a succes.

  Pourquoi une boucle : cette ligne coupe les connexions TLS en pleine poignee
  de main ("Remote host terminated the handshake") sur dl.google.com comme sur
  repo.maven.apache.org. Gradle ne retente pas indefiniment, mais il **garde**
  chaque artefact deja telecharge. Chaque tentative repart donc d'un cache plus
  complet : c'est un progres monotone, pas un tirage au sort.

  On allonge aussi les delais et le nombre de reprises internes de Gradle, parce
  que l'echec observe n'est pas un refus du serveur : c'est une coupure.

  Usage :
      powershell -ExecutionPolicy Bypass -File tools\build-apk.ps1
      powershell -ExecutionPolicy Bypass -File tools\build-apk.ps1 -Attempts 20
#>
param(
    [int]    $Attempts = 10,
    [string] $Task     = ':app:assembleDebug',
    [string] $Jdk      = 'C:\Users\HP\android-toolchain\jdk17',
    [string] $Gradle   = 'C:\Users\HP\android-toolchain\gradle-8.7'
)

# Pas de 'Stop' : les outils natifs ecrivent sur stderr en permanence (avertissements
# Gradle, Kotlin, aapt2). Le verdict se lit sur $LASTEXITCODE et sur la presence de
# l'APK, pas sur une preference globale.
$ErrorActionPreference = 'Continue'

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo   = Split-Path -Parent $here
$projet = Join-Path $repo 'apps\android'
$apk    = Join-Path $projet 'app\build\outputs\apk\debug\app-debug.apk'
$log    = Join-Path $env:TEMP 'gradle-assemble.log'

if (-not (Test-Path (Join-Path $Jdk 'bin\java.exe'))) {
    throw "JDK introuvable : $Jdk (lancer tools\install-android-toolchain.ps1)"
}
if (-not (Test-Path (Join-Path $Gradle 'bin\gradle.bat'))) {
    throw "Gradle introuvable : $Gradle"
}

$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not (Test-Path (Join-Path $sdk 'platforms\android-35\android.jar'))) {
    throw "SDK incomplet : platforms\android-35 absent de $sdk"
}

$env:JAVA_HOME         = $Jdk
$env:ANDROID_HOME      = $sdk
$env:ANDROID_SDK_ROOT  = $sdk
$env:PATH              = "$Jdk\bin;$Gradle\bin;$env:PATH"

$gradleExe = Join-Path $Gradle 'bin\gradle.bat'

# Delais et reprises : ce sont des coupures de transport, pas des 404.
$options = @(
    '--no-daemon',
    '--console=plain',
    '--stacktrace',
    '-Dorg.gradle.internal.http.socketTimeout=180000',
    '-Dorg.gradle.internal.http.connectionTimeout=90000',
    '-Dorg.gradle.internal.repository.max.retries=12',
    '-Dorg.gradle.internal.repository.retry.delay=4000'
)

Push-Location $projet
try {
    for ($i = 1; $i -le $Attempts; $i++) {
        Write-Host ''
        Write-Host ("=== tentative {0} / {1} ===" -f $i, $Attempts)

        & $gradleExe $Task @options *> $log
        $code = $LASTEXITCODE

        if ($code -eq 0 -and (Test-Path $apk)) {
            $taille = (Get-Item $apk).Length
            Write-Host ("OK  APK produit : {0} ({1:N0} octets)" -f $apk, $taille)
            exit 0
        }

        Write-Host ("    echec (code {0})" -f $code)
        Get-Content $log -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { "    $_" }
        if ($i -lt $Attempts) {
            Write-Host "    reprise dans 5 s (le cache est conserve)"
            Start-Sleep -Seconds 5
        }
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host ("ECHEC apres {0} tentatives - journal complet : {1}" -f $Attempts, $log)
exit 1
