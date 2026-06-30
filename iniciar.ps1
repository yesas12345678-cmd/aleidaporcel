# Servidor Web Local y Backend PostgreSQL en Node.js
# Este script levanta el servidor Express en el puerto 8080 para servir los archivos y conectar con PostgreSQL.

$port = 8080

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Iniciando Servidor de Experiencia Interactiva..." -ForegroundColor Cyan
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

# 1. Verificar si Node.js está disponible
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "Por favor instalalo o reinicia el shell si lo acabas de instalar." -ForegroundColor Red
    Pause
    Exit
}

# 2. Instalar dependencias si no existe node_modules
if (!(Test-Path "node_modules")) {
    Write-Host "Instalando dependencias necesarias (primera vez)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Falló la instalación de dependencias de npm." -ForegroundColor Red
        Pause
        Exit
    }
}

Write-Host "Servidor activo en: http://localhost:$port" -ForegroundColor Green
Write-Host "Abriendo el navegador..." -ForegroundColor Yellow
Write-Host "Presiona Ctrl+C en esta ventana para apagar el servidor." -ForegroundColor DarkYellow
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

# Abrir en el navegador predeterminado
Start-Process "http://localhost:$port/"

# Iniciar servidor Node.js (bloquea la consola para mantenerla activa)
node server.js
