# Bootstrap de la chaine Android sur cette machine.
#
# Ce script n'installe pas Android Studio : il installe ce qui est necessaire
# pour compiler et lancer l'application depuis un terminal.
#
#   JDK 17 (Temurin)  -> AGP 8.5.2 exige Java 17
#   Gradle 8.7        -> version attendue par le catalogue et par la CI
#   cmdline-tools     -> sdkmanager / avdmanager / adb
#   platform 35, build-tools 35.0.0, platform-tools
#   emulator + image systeme (facultatif : non bloquant si le reseau cede)
#
# Idempotent : chaque etape est sautee si la cible existe deja.
# Aucun accent dans ce fichier : Windows PowerShell 5.1 lit un .ps1 sans BOM
# en ANSI, et un accent mal decode casserait une chaine.
#
# Sur le reseau : les gros transferts sont coupes (EOF, handshake TLS). Une
# archive n'est donc JAMAIS presume complete sur sa taille : on ouvre le zip.
# Trois chemins de telechargement, dans cet ordre : .NET, curl.exe en reprise,
# puis WSL en reprise (c'est celui qui tient le mieux).
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File tools/install-android-toolchain.ps1

# `Continue` et non `Stop` : sous PowerShell 5.1, la moindre sortie sur stderr
# d'une commande native (java -version, sdkmanager, gradle) leve une erreur
# FATALE quand la preference vaut Stop. Le script mourrait a la premiere ligne
# de java -version. Les echecs sont donc verifies explicitement : `throw`, et
# controles de presence apres chaque decompression.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Toolchain = 'C:\Users\HP\android-toolchain'
$Sdk       = "$env:LOCALAPPDATA\Android\Sdk"
$Jdk       = "$Toolchain\jdk17"
$GradleDir = "$Toolchain\gradle-8.7"
$AvdName   = 'vpn35'
$ApiLevel  = '35'
$Image     = "system-images;android-$ApiLevel;google_apis;x86_64"
$Repo      = 'C:\Users\HP\Documents\Codex\2026-10-19\es\outputs\vpn-platform'

function Step($message) {
    Write-Host ""
    Write-Host "=== $message" -ForegroundColor Cyan
}

# ------------------------------------------------------------------ outils ---

Add-Type -AssemblyName System.IO.Compression.FileSystem

<#
    Un zip valide s'ouvre et contient au moins une entree. Un fichier tronque
    echoue ici : c'est le seul controle qui distingue une archive complete d'une
    archive interrompue a 72 Mo sur 190.
#>
function Test-ZipComplete($path) {
    if (-not (Test-Path $path)) { return $false }
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
        $count = $zip.Entries.Count
        $zip.Dispose()
        return ($count -gt 0)
    } catch {
        return $false
    }
}

function ToUnixPath($windowsPath) {
    $drive = $windowsPath.Substring(0, 1).ToLower()
    $rest = $windowsPath.Substring(2).Replace('\', '/')
    return "/mnt/$drive$rest"
}

# Script bash ecrit une fois : passer les arguments par argv evite de lutter
# avec le quoting PowerShell -> WSL, qui casse des qu'une commande contient
# un tube ou un point-virgule.
function EnsureWslFetcher() {
    $sh = "$Toolchain\wsl-fetch.sh"
    $body = @'
#!/usr/bin/env bash
# Telechargement reprenable : on reprend ou on s'est arrete au lieu de
# repartir de zero. $1=url $2=cible $3=taille plancher en octets.
set -u
URL="$1"; TARGET="$2"; FLOOR="$3"
for i in $(seq 1 30); do
  curl -L --retry 3 --retry-all-errors --continue-at - --max-time 900 \
       --silent --show-error -o "$TARGET" "$URL" || true
  size=$(stat -c%s "$TARGET" 2>/dev/null || echo 0)
  echo "    essai $i : $size octets"
  if [ "$size" -ge "$FLOOR" ]; then echo FETCH_OK; exit 0; fi
  sleep 2
done
echo FETCH_ECHEC
exit 1
'@
    Set-Content -Path $sh -Value $body -Encoding ASCII
    return $sh
}

<#
    Recupere $url dans $target et refuse de rendre la main tant que le zip n'est
    pas ouvrable. Trois tentatives de nature differente, parce que l'echec vient
    du reseau et non de la commande : changer de chemin est ce qui debloque.
#>
function Fetch($url, $target, $floorBytes) {
    if (Test-ZipComplete $target) {
        Write-Host "archive complete deja presente : $target"
        return
    }
    if (Test-Path $target) {
        Write-Host "archive incomplete, on reprend : $target"
    }

    Write-Host "telechargement : $url"

    # 1. .NET : rapide quand le reseau tient, echoue vite quand il ne tient pas.
    try {
        Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 300 -MaximumRedirection 10
        if (Test-ZipComplete $target) { Write-Host "recu (.NET)"; return }
    } catch {
        Write-Host "  .NET a echoue : $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # 2. curl.exe, en reprise, en boucle.
    $curl = "$env:SystemRoot\System32\curl.exe"
    if (Test-Path $curl) {
        for ($i = 1; $i -le 5; $i++) {
            & $curl -L --retry 3 --retry-all-errors --continue-at - --max-time 900 `
                --ssl-no-revoke --silent --show-error -o $target $url
            if (Test-ZipComplete $target) { Write-Host "recu (curl.exe, essai $i)"; return }
            Start-Sleep -Seconds 2
        }
    }

    # 3. WSL : c'est le chemin qui a deja ramene 72 Mo la ou Windows echouait.
    $sh = EnsureWslFetcher
    $unixTarget = ToUnixPath $target
    $unixSh = ToUnixPath $sh
    & wsl.exe -e bash -lc "sed -i 's/\r`$//' '$unixSh' && bash '$unixSh' '$url' '$unixTarget' '$floorBytes'"
    if (Test-ZipComplete $target) { Write-Host "recu (WSL)"; return }

    throw "echec du telechargement (archive inutilisable) : $url"
}

function Expand-SingleRoot($zipPath, $destParent, $finalName) {
    $tmp = "$Toolchain\_extract_$finalName"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (-not $inner) { throw "archive vide : $zipPath" }
    $final = Join-Path $destParent $finalName
    if (Test-Path $final) { Remove-Item -Recurse -Force $final }
    Move-Item $inner.FullName $final
    Remove-Item -Recurse -Force $tmp
}

New-Item -ItemType Directory -Force -Path $Toolchain | Out-Null
New-Item -ItemType Directory -Force -Path $Sdk | Out-Null

# ---------------------------------------------------------------------------
Step 'JDK 17 (Temurin)'
if (-not (Test-Path "$Jdk\bin\java.exe")) {
    $zip = "$Toolchain\temurin17.zip"
    Fetch 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' $zip 150000000
    Expand-SingleRoot $zip $Toolchain 'jdk17'
    Remove-Item -Force $zip
} else {
    Write-Host "deja present : $Jdk"
}
$env:JAVA_HOME = $Jdk
$env:PATH = "$Jdk\bin;$env:PATH"
$javaOut = & "$Jdk\bin\java.exe" -version 2>&1
if ($LASTEXITCODE -ne 0) { throw "java.exe ne repond pas : $Jdk" }
Write-Host ($javaOut | Select-Object -First 1)

# ---------------------------------------------------------------------------
Step 'Gradle 8.7'
if (-not (Test-Path "$GradleDir\bin\gradle.bat")) {
    $zip = "$Toolchain\gradle-8.7-bin.zip"
    Fetch 'https://services.gradle.org/distributions/gradle-8.7-bin.zip' $zip 100000000
    Expand-Archive -Path $zip -DestinationPath $Toolchain -Force
    Remove-Item -Force $zip
} else {
    Write-Host "deja present : $GradleDir"
}
# Avec `Continue`, une decompression ratee ne stoppe plus le script : on le
# verifie donc a la main.
if (-not (Test-Path "$GradleDir\bin\gradle.bat")) { throw "Gradle inutilisable : $GradleDir" }
$env:PATH = "$GradleDir\bin;$env:PATH"

# ---------------------------------------------------------------------------
Step 'cmdline-tools'
if (-not (Test-Path "$Sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
    $zip = "$Toolchain\cmdline-tools.zip"
    Fetch 'https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip' $zip 100000000
    $tmp = "$Toolchain\cmdline-extract"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path "$Sdk\cmdline-tools" | Out-Null
    if (Test-Path "$Sdk\cmdline-tools\latest") { Remove-Item -Recurse -Force "$Sdk\cmdline-tools\latest" }
    Move-Item "$tmp\cmdline-tools" "$Sdk\cmdline-tools\latest"
    Remove-Item -Recurse -Force $tmp
    Remove-Item -Force $zip
} else {
    Write-Host "deja present : $Sdk\cmdline-tools\latest"
}

$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$sdkmanager = "$Sdk\cmdline-tools\latest\bin\sdkmanager.bat"
$avdmanager = "$Sdk\cmdline-tools\latest\bin\avdmanager.bat"
if (-not (Test-Path $sdkmanager)) { throw "sdkmanager inutilisable : $sdkmanager" }

# ---------------------------------------------------------------------------
Step 'Licences Android'
$answers = (1..40 | ForEach-Object { 'y' }) -join "`n"
$answers | & $sdkmanager --licenses --sdk_root=$Sdk | Out-Host

# ---------------------------------------------------------------------------
Step 'Paquets SDK indispensables (petits, bloquants)'
# Ce qu'il faut pour compiler un APK, et rien de plus. L'emulateur et son image
# pesent plus d'un gigaoctet et viennent apres : leur echec ne doit pas laisser
# une chaine sans adb ni build-tools.
#
# Chaque paquet est retente : `sdkmanager` ne reprend pas un telechargement
# interrompu, et ce reseau en interrompt. On verifie ensuite la presence reelle
# du fichier attendu, pas le code de sortie de l'outil.
$indispensables = @(
    @{ Pkg = 'platform-tools';                 Check = "$Sdk\platform-tools\adb.exe" },
    @{ Pkg = "platforms;android-$ApiLevel";    Check = "$Sdk\platforms\android-$ApiLevel\android.jar" },
    @{ Pkg = 'build-tools;35.0.0';             Check = "$Sdk\build-tools\35.0.0\aapt2.exe" }
)
foreach ($item in $indispensables) {
    if (Test-Path $item.Check) {
        Write-Host "-- $($item.Pkg) : deja present"
        continue
    }
    $ok = $false
    for ($essai = 1; $essai -le 4; $essai++) {
        Write-Host "-- $($item.Pkg) (essai $essai)"
        & $sdkmanager --sdk_root=$Sdk $item.Pkg | Out-Host
        if (Test-Path $item.Check) { $ok = $true; break }
        Start-Sleep -Seconds 5
    }
    if (-not $ok) { throw "paquet SDK non installe malgre 4 essais : $($item.Pkg)" }
}

# ---------------------------------------------------------------------------
Step "Emulateur + image systeme (facultatif, $Image)"
# Trois essais : sdkmanager ne reprend pas un telechargement interrompu, donc on
# relance l'operation elle-meme.
$emulatorOk = $false
for ($i = 1; $i -le 3; $i++) {
    Write-Host "-- essai $i"
    try {
        & $sdkmanager --sdk_root=$Sdk 'emulator' $Image | Out-Host
        $emulatorOk = $true
        break
    } catch {
        Write-Host "  echec : $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
}
if (-not $emulatorOk) {
    Write-Host "image systeme non recuperee : compilation possible, emulateur non." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
Step "Emulateur $AvdName"
if (Test-Path "$Sdk\emulator\emulator.exe") {
    $existing = & $avdmanager list avd -c 2>$null
    if ($existing -contains $AvdName) {
        Write-Host "deja present : $AvdName"
    } else {
        'no' | & $avdmanager create avd -n $AvdName -k $Image --device pixel_6 --force | Out-Host
    }
} else {
    Write-Host "emulateur absent : AVD non cree." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
Step 'Rattachement du projet Android'
$localProps = Join-Path $Repo 'apps\android\local.properties'
"sdk.dir=$($Sdk.Replace('\','\\'))" | Set-Content -Path $localProps -Encoding ASCII
Write-Host "ecrit : $localProps"

# La CI genere le wrapper elle-meme (voir .github/workflows/android-brand.yml).
# En local, on le genere aussi pour que build.bat/gradlew.bat existent ensuite
# sans reseau.
if (-not (Test-Path (Join-Path $Repo 'apps\android\gradlew.bat'))) {
    Push-Location (Join-Path $Repo 'apps\android')
    & gradle wrapper --gradle-version 8.7 --distribution-type bin | Out-Host
    Pop-Location
} else {
    Write-Host "wrapper deja present"
}

# ---------------------------------------------------------------------------
Step 'Recapitulatif'
& "$Sdk\platform-tools\adb.exe" version
if (Test-Path "$Sdk\emulator\emulator.exe") {
    & "$Sdk\emulator\emulator.exe" -list-avds
    Write-Host "-- acceleration materielle"
    & "$Sdk\emulator\emulator.exe" -accel-check
}
Write-Host ""
Write-Host "JAVA_HOME      $Jdk"
Write-Host "ANDROID_HOME   $Sdk"
Write-Host "Gradle         $GradleDir"
Write-Host ""
Write-Host "Pour compiler :" -ForegroundColor Green
Write-Host "  cd `"$Repo\apps\android`""
Write-Host "  `$env:JAVA_HOME=`"$Jdk`"; `$env:ANDROID_HOME=`"$Sdk`"; gradle :app:assembleDebug"
Write-Host ""
Write-Host "Termine." -ForegroundColor Green