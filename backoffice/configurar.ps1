# Configura e sobe o backoffice da Equacao da Abertura no Windows.
# Rode na pasta backoffice:  powershell -ExecutionPolicy Bypass -File .\configurar.ps1
# As senhas sao digitadas aqui no terminal e nao ficam salvas fora do arquivo .env.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Read-Default($prompt, $default) {
    $value = Read-Host "$prompt [$default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $default }
    return $value.Trim()
}

# 1. Ferramentas necessarias
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host 'psql nao encontrado. Adicione a pasta bin do PostgreSQL ao PATH,'
    Write-Host 'por exemplo: C:\Program Files\PostgreSQL\16\bin, e rode o script de novo.'
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host 'npm nao encontrado. Instale o Node.js (versao 20 ou superior) e rode o script de novo.'
    exit 1
}

# 2. Dados do PostgreSQL
$pgHost = Read-Default 'Host do PostgreSQL' 'localhost'
$pgPort = Read-Default 'Porta do PostgreSQL' '5432'
$pgUser = Read-Default 'Usuario do PostgreSQL' 'postgres'
$pgDb   = Read-Default 'Nome do banco' 'equacao_abertura'
$pgPassSecure = Read-Host 'Senha do PostgreSQL' -AsSecureString
$pgPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassSecure))

# 3. Dados do primeiro administrador
$adminName  = Read-Default 'Nome do administrador' 'Administrador'
$adminEmail = Read-Host 'E-mail do administrador'
$adminPassSecure = Read-Host 'Senha do administrador (use uma senha forte)' -AsSecureString
$adminPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassSecure))
if ([string]::IsNullOrWhiteSpace($adminEmail) -or [string]::IsNullOrWhiteSpace($adminPass)) {
    Write-Host 'E-mail e senha do administrador sao obrigatorios.'
    exit 1
}

# 4. Cria o banco (se ja existir, segue em frente)
$env:PGPASSWORD = $pgPass
& psql -h $pgHost -p $pgPort -U $pgUser -d postgres -c "CREATE DATABASE $pgDb;" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Banco '$pgDb' criado."
} else {
    Write-Host "Banco '$pgDb' ja existe ou nao foi possivel criar. Vou tentar usar o que ja existe."
}
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# 5. Gera o SESSION_SECRET e grava o .env
$secretBytes = New-Object byte[] 48
(New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($secretBytes)
$sessionSecret = [Convert]::ToBase64String($secretBytes)

$encUser = [uri]::EscapeDataString($pgUser)
$encPass = [uri]::EscapeDataString($pgPass)
$databaseUrl = "postgres://${encUser}:${encPass}@${pgHost}:${pgPort}/${pgDb}"

$envContent = @"
DATABASE_URL=$databaseUrl
SESSION_SECRET=$sessionSecret
PORT=3000
NODE_ENV=development
ADMIN_NAME=$adminName
ADMIN_EMAIL=$adminEmail
ADMIN_PASSWORD=$adminPass
"@
Set-Content -Path (Join-Path $PSScriptRoot '.env') -Value $envContent -Encoding UTF8
Write-Host '.env gravado.'

# 6. Dependencias, primeiro administrador e servidor
if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    npm install
}
npm run seed
Write-Host ''
Write-Host 'Pronto. Abra http://localhost:3000/admin no navegador.'
npm start
