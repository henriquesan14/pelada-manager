param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
    $OutputPath = Join-Path $repoPath ('.qa/pelada-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
}
$targetPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $targetPath) { throw 'O arquivo de destino já existe. Escolha outro nome.' }
$parentPath = Split-Path -Parent $targetPath
New-Item -ItemType Directory -Path $parentPath -Force | Out-Null
$containerPath = '/tmp/pelada-' + [guid]::NewGuid().ToString('N') + '.dump'
Push-Location $repoPath
try {
    & docker compose exec -T db pg_dump -U resenha -d resenha -Fc --no-owner --no-acl -f $containerPath
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar backup do PostgreSQL.' }
    & docker compose exec -T db pg_restore --list $containerPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'O arquivo de backup não passou na verificação.' }
    & docker compose cp "db:$containerPath" $targetPath
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao copiar o backup para a máquina.' }
    Write-Output "Backup verificado: $targetPath"
}
finally {
    & docker compose exec -T db rm -f $containerPath | Out-Null
    Pop-Location
}
