# Bootstrap de la chaine Android sur cette machine.
#
# Ce script n'installe pas Android Studio : il installe ce qui est necessaire
# pour compiler et lancer l'application depuis un terminal.
#
#   JDK 17 (Temurin)  -> AGP 8.5.2 exige Java 17
#   Gradle 8.7        -> version attendue par le catalogue et par la CI
#   cmdline-tools     -> sdkmanager / avdmanager / adb
#   platform 35, build-tools 35.0.0, platform-tools, emulator, image systeme
#
# Idempotent : chaque etape est sautee si la cible existe deja.
# Aucun accent dans ce fichier : Windows PowerShell 5.1 lit un .ps1 sans BOM
# en ANSI, et un accent mal decode casserait une chaine.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File tools/install-android-toolchain.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Toolchain = 'C:\Users\HP\android-toolchain'
$Sdk       = "$env:LOCALAPPDATA\Android\Sdk"
$Jdk       = "$Toolchain\jdk17"
$GradleDir = "$Toolchain\gradle-8.7"
$AvdName   = 'vpn35'
$ApiLevel  = '35'
$Image     = "system-images;android-$ApiLevel;google_apis;x86_64"

function Step($message) {
    Write-Host ""
    Write-Host "=== $message" -ForegroundColor Cyan
}

function Fetch($url, $target) {
    if (Test-Path $target) { Remove-Item -Force $target }
    Write-Host "telechargement : $url"
    # curl/schannel echoue ici sur certaines poignees TLS (erreur 35). .NET
    # passe par SChannel egalement mais accepte mieux les redirections longues ;
    # on force TLS 1.2 et on retente une fois avec curl en dernier recours.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ok = $false
    try {
        Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 900 -MaximumRedirection 10
        $ok = $true
    } catch {
        Write-Host "echec .NET : $($_.Exception.Message)" -ForegroundColor Yellow
    }
    if (-not $ok) {
        & curl.exe -L --fail --retry 3 --retry-delay 2 --ssl-no-revoke --silent --show-error -o $target $url
        $ok = ($LASTEXITCODE -eq 0)
    }
    if (-not $ok) { throw "echec du telechargement : $url" }
    $size = [math]::Round((Get-Item $target).Length / 1MB, 1)
    Write-Host "recu : $size Mo"
}

New-Item -ItemType Directory -Force -Path $Toolchain | Out-Null
New-Item -ItemType Directory -Force -Path $Sdk | Out-Null

# ---------------------------------------------------------------------------
Step 'JDK 17 (Temurin)'
if (-not (Test-Path "$Jdk\bin\java.exe")) {
    $zip = "$Toolchain\temurin17.zip"
    Fetch 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' $zip
    $tmp = "$Toolchain\jdk-extract"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (-not $inner) { throw 'archive JDK vide' }
    Move-Item $inner.FullName $Jdk
    Remove-Item -Recurse -Force $tmp, $zip
} else {
    Write-Host "deja present : $Jdk"
}
$env:JAVA_HOME = $Jdk
$env:PATH = "$Jdk\bin;$env:PATH"
& "$Jdk\bin\java.exe" -version

# ---------------------------------------------------------------------------
Step 'Gradle 8.7'
if (-not (Test-Path "$GradleDir\bin\gradle.bat")) {
    $zip = "$Toolchain\gradle-8.7-bin.zip"
    Fetch 'https://services.gradle.org/distributions/gradle-8.7-bin.zip' $zip
    Expand-Archive -Path $zip -DestinationPath $Toolchain -Force
    Remove-Item $zip
} else {
    Write-Host "deja present : $GradleDir"
}
$env:PATH = "$GradleDir\bin;$env:PATH"

# ---------------------------------------------------------------------------
Step 'cmdline-tools'
if (-not (Test-Path "$Sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
    $zip = "$Toolchain\cmdline-tools.zip"
    Fetch 'https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip' $zip
    $tmp = "$Toolchain\cmdline-extract"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path "$Sdk\cmdline-tools" | Out-Null
    if (Test-Path "$Sdk\cmdline-tools\latest") { Remove-Item -Recurse -Force "$Sdk\cmdline-tools\latest" }
    Move-Item "$tmp\cmdline-tools" "$Sdk\cmdline-tools\latest"
    Remove-Item -Recurse -Force $tmp, $zip
} else {
    Write-Host "deja present : $Sdk\cmdline-tools\latest"
}

$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$sdkmanager = "$Sdk\cmdline-tools\latest\bin\sdkmanager.bat"
$avdmanager = "$Sdk\cmdline-tools\latest\bin\avdmanager.bat"

# ---------------------------------------------------------------------------
Step 'Licences Android'
# sdkmanager demande « y » pour chaque licence non acceptee. On en envoie
# assez pour couvrir les 8 categories, sans dependre d'une reponse interactive.
$answers = (1..40 | ForEach-Object { 'y' }) -join "`n"
$answers | & $sdkmanager --licenses --sdk_root=$Sdk | Out-Host

# ---------------------------------------------------------------------------
Step 'Paquets SDK'
& $sdkmanager --sdk_root=$Sdk "platform-tools" "platforms;android-$ApiLevel" "build-tools;35.0.0" "emulator" $Image | Out-Host

# ---------------------------------------------------------------------------
Step "Emulateur $AvdName"
$existing = & $avdmanager list avd -c 2>$null
if ($existing -contains $AvdName) {
    Write-Host "deja present : $AvdName"
} else {
    'no' | & $avdmanager create avd -n $AvdName -k $Image --device pixel_6 --force | Out-Host
}

# ---------------------------------------------------------------------------
Step 'Recapitulatif'
& "$Sdk\platform-tools\adb.exe" version
& "$Sdk\emulator\emulator.exe" -list-avds
Write-Host ""
Write-Host "JAVA_HOME      $Jdk"
Write-Host "ANDROID_HOME   $Sdk"
Write-Host "Gradle         $GradleDir"
Write-Host ""
Write-Host "Termine." -ForegroundColor Green
