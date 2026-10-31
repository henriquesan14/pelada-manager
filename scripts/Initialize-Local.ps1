$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envFile) {
    Write-Output 'O arquivo .env já existe e foi preservado.'
    exit 0
}
function New-LocalKey {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
$databasePassword = New-LocalKey
$setupKey = New-LocalKey
$content = "POSTGRES_PASSWORD=$databasePassword`nSETUP_TOKEN=$setupKey`nAPP_ORIGIN=http://localhost:8080`nAPP_ENV=Development`nWEB_PORT=8080`n"
[System.IO.File]::WriteAllText($envFile, $content)
Write-Output 'Arquivo .env criado com chaves aleatórias. Nenhuma chave foi exibida.'
