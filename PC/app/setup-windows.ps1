# Run in PowerShell as the current user. Installs QEMU only if winget has a matching package.
$ErrorActionPreference = "Stop"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Error "winget is unavailable. Install QEMU from a trusted Windows package source and add its bin folder to PATH."
  exit 1
}
winget install --id SoftwareFreedomConservancy.QEMU -e --accept-package-agreements --accept-source-agreements
Write-Host "Restart Nova PC after installing QEMU."
