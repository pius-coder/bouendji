<#
  Compile `libbox.aar` — le moteur sing-box — depuis les sources, sous Windows.

  Pourquoi ce script existe : `libbox` n'est publie sur aucun depot Maven
  (verifie : Maven Central renvoie 0 resultat pour `libbox`). L'application
  Android ne peut donc pas le declarer comme dependance : il faut le compiler.

  La procedure suit celle du depot lui-meme, pas une improvisation :
      Makefile:273-274   go install github.com/sagernet/gomobile/cmd/{gomobile,gobind}@v0.1.13
      Makefile:lib_android  go run ./cmd/internal/build_libbox -target android

  Ce que ce script ajoute, et qui n'est pas dans le Makefile :
    - il place le NDK la ou `build_shared/findNDK` le cherche ;
    - il verifie que le `.aar` contient bien les bibliotheques natives de
      l'architecture demandee (sinon l'app se compile et plante au demarrage) ;
    - il copie le resultat dans `apps/android/app/libs/`.

  Usage :
      powershell -ExecutionPolicy Bypass -File tools\build-libbox.ps1
      powershell -ExecutionPolicy Bypass -File tools\build-libbox.ps1 -FullAbi   # 4 architectures
#>
param(
    [string] $Version  = 'v1.14.3',
    [string] $Platform = 'android/arm64',
    [string] $GoRoot   = 'C:\Users\HP\android-toolchain\go',
    [string] $SrcRoot  = 'C:\Users\HP\android-toolchain\sing-box',
    [string] $Jdk      = 'C:\Users\HP\android-toolchain\jdk17',
    [string] $NdkZip   = 'C:\Users\HP\android-toolchain\ndk.zip',
    [string] $Repo     = 'C:\Users\HP\Documents\Codex\2026-10-19\es\outputs\vpn-platform',
    [switch] $FullAbi
)

$ErrorActionPreference = 'Continue'

function Exiger($chemin, $quoi) {
    if (-not (Test-Path $chemin)) { throw "$quoi introuvable : $chemin" }
}

$sdk    = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$goExe  = Join-Path $GoRoot 'bin\go.exe'
# `build_shared.FindMobile` exige gobind dans `go env GOPATH`/bin : c'est-la, pas ailleurs.
$goPath = Join-Path $env:USERPROFILE 'go'
$goBin  = Join-Path $goPath 'bin'

Exiger $goExe 'Go'
Exiger (Join-Path $goBin 'gomobile.exe') 'gomobile (lancer go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.13)'
Exiger (Join-Path $goBin 'gobind.exe') 'gobind'
Exiger (Join-Path $Jdk 'bin\java.exe') 'JDK 17'
Exiger (Join-Path $SrcRoot 'go.mod') 'sources sing-box'

if (-not (Test-Path (Join-Path $sdk 'licenses\android-sdk-license'))) {
    throw "licences SDK absentes : build_shared/FindSDK refuse de continuer sans elles"
}

# --- JAVA : build_libbox verifie que `java --version` contient « openjdk 17 » ---
$env:JAVA_HOME = $Jdk
$env:PATH      = "$Jdk\bin;$GoRoot\bin;$goBin;$env:PATH"
$version = (& (Join-Path $Jdk 'bin\java.exe') --version 2>&1 | Out-String)
if ($version -notmatch 'openjdk 17') {
    throw "java --version ne contient pas « openjdk 17 » :$([Environment]::NewLine)$version"
}
Write-Host "-- java : openjdk 17 confirme"

# --- NDK : findNDK le cherche dans $SDK\ndk\<version>, avec un source.properties ---
$ndkRoot = Join-Path $sdk 'ndk'
if (-not (Test-Path $ndkRoot)) { New-Item -ItemType Directory -Force -Path $ndkRoot | Out-Null }

$ndkPath = $null
foreach ($d in @(Get-ChildItem $ndkRoot -Directory -ErrorAction SilentlyContinue)) {
    if (Test-Path (Join-Path $d.FullName 'source.properties')) { $ndkPath = $d.FullName; break }
}

if (-not $ndkPath) {
    Exiger $NdkZip 'archive du NDK'
    Write-Host "-- NDK : decompression (une seule fois)"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $tmp = Join-Path $ndkRoot '_extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($NdkZip, $tmp)

    $inner = @(Get-ChildItem $tmp -Directory)[0]
    $props = Join-Path $inner.FullName 'source.properties'
    if (-not (Test-Path $props)) { throw "le NDK decompresse n'a pas de source.properties : $($inner.FullName)" }

    # Le nom du dossier doit etre la version : c'est ce que `sdkmanager` ferait,
    # et ce que lisent gomobile et AGP.
    $num = (Select-String -Path $props -Pattern '^\s*Pkg\.Revision\s*=\s*(.+)$' |
            Select-Object -First 1).Matches.Groups[1].Value.Trim()
    if (-not $num) { throw "Pkg.Revision absent de $props" }
    $ndkPath = Join-Path $ndkRoot $num
    if (Test-Path $ndkPath) { Remove-Item $ndkPath -Recurse -Force }
    Move-Item $inner.FullName $ndkPath
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "-- NDK installe : $ndkPath"
} else {
    Write-Host "-- NDK deja en place : $ndkPath"
}

$env:ANDROID_HOME     = $sdk
$env:ANDROID_SDK_HOME = $sdk
$env:ANDROID_NDK_HOME = $ndkPath
$env:NDK              = $ndkPath

# --- compilation ---
$target = if ($FullAbi) { 'android' } else { $Platform }
Write-Host "-- sing-box $Version, cible : $target"
Write-Host "-- premiere compilation : gomobile telecharge et compile les modules Go, c'est long"

Push-Location $SrcRoot
try {
    & $goExe run ./cmd/internal/build_libbox -target android -platform $target
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($code -ne 0) { throw "build_libbox a echoue (code $code)" }

$aars = @('libbox.aar') + (Get-ChildItem $SrcRoot -Filter 'libbox*.aar' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$aar  = Join-Path $SrcRoot 'libbox.aar'
Exiger $aar 'libbox.aar produit'

# --- verification : un .aar sans jni/ est un aar vide qui plante a l'execution ---
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($aar)
try {
    $abis = @($zip.Entries | Where-Object { $_.FullName -like 'jni/*/libbox.so' } |
              ForEach-Object { ($_.FullName -split '/')[1] } | Sort-Object -Unique)
} finally { $zip.Dispose() }

if ($abis.Count -eq 0) { throw "libbox.aar ne contient aucune bibliotheque native (jni/*/libbox.so)" }

$taille = (Get-Item $aar).Length
Write-Host ("-- libbox.aar : {0:N0} octets, architectures : {1}" -f $taille, ($abis -join ', '))

# --- copie dans le projet ---
$libs = Join-Path $Repo 'apps\android\app\libs'
if (-not (Test-Path $libs)) { New-Item -ItemType Directory -Force -Path $libs | Out-Null }
Copy-Item -Force $aar (Join-Path $libs 'libbox.aar')
Write-Host ("-- copie : {0}" -f (Join-Path $libs 'libbox.aar'))
Write-Host 'OK'
