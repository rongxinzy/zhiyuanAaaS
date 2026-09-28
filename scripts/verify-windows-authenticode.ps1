# Verifies the Authenticode signatures of a packaged enterprise Windows release:
# every installer at the release root, the packaged application executable, and
# the bundled uninstaller must carry a valid, RFC3161-timestamped signature.
# When -ExpectedThumbprint is provided, each signer certificate must also match
# the configured Certum certificate. Centrally signed runtime binaries such as
# engram.exe are out of scope; the host win.signExts already excludes them from
# re-signing. Keep this file UTF-8 with BOM: the default executable name is
# Chinese and Windows PowerShell 5.1 misreads BOM-less UTF-8.

param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseDir,

  [Parameter(Mandatory = $false)]
  [string]$ExpectedThumbprint = '',

  [Parameter(Mandatory = $false)]
  [string]$ExecutableName = '知远企业版'
)

$ErrorActionPreference = 'Stop'

$normalizedThumbprint = ($ExpectedThumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
if ($normalizedThumbprint.Length -gt 0 -and $normalizedThumbprint -notmatch '^[0-9A-F]{40}$') {
  throw "ExpectedThumbprint must contain a 40-character SHA-1 thumbprint; got '$ExpectedThumbprint'."
}

if (-not (Test-Path -LiteralPath $ReleaseDir -PathType Container)) {
  throw "Release directory was not found: $ReleaseDir"
}
$ReleaseDir = (Resolve-Path -LiteralPath $ReleaseDir).ProviderPath
$unpackedDir = Join-Path $ReleaseDir 'win-unpacked'

$targets = @(
  Get-ChildItem -LiteralPath $ReleaseDir -Filter '*.exe' -File |
    Select-Object -ExpandProperty FullName
)
if ($targets.Count -eq 0) {
  throw "No Windows installer (*.exe) found in $ReleaseDir."
}

$appExecutable = Join-Path $unpackedDir "$ExecutableName.exe"
if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
  throw "Packaged application executable was not found: $appExecutable"
}
$targets += $appExecutable

$targets += @(
  Get-ChildItem -LiteralPath $unpackedDir -Filter 'Uninstall *.exe' -File |
    Select-Object -ExpandProperty FullName
)

$failures = @()
foreach ($target in $targets) {
  $signature = Get-AuthenticodeSignature -FilePath $target
  if ($signature.Status -ne 'Valid') {
    $failures += "${target}: Authenticode status is $($signature.Status), expected Valid."
    continue
  }
  if ($null -eq $signature.TimeStamperCertificate) {
    $failures += "${target}: signature has no RFC3161 timestamp certificate."
  }
  if ($normalizedThumbprint.Length -gt 0) {
    $actualThumbprint = (
      $signature.SignerCertificate.Thumbprint -replace '[^0-9A-Fa-f]', ''
    ).ToUpperInvariant()
    if ($actualThumbprint -ne $normalizedThumbprint) {
      $failures += "${target}: signer thumbprint is $actualThumbprint, expected $normalizedThumbprint."
    }
  }
  Write-Output "OK: $target"
}

if ($failures.Count -gt 0) {
  throw "Authenticode verification failed:`n$($failures -join "`n")"
}

Write-Output "All $($targets.Count) Windows executable(s) carry a valid, timestamped Authenticode signature."
