# Servidor Web Local en PowerShell
# Este script levanta un servidor HTTP ligero en el puerto 8080 para servir los archivos de la web en local.

$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Iniciando Servidor de Experiencia Interactiva..." -ForegroundColor Cyan
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

try {
    $listener.Start()
} catch {
    Write-Host "ERROR: No se pudo iniciar el servidor en el puerto $port." -ForegroundColor Red
    Write-Host "Es posible que el puerto ya esté en uso por otra aplicación." -ForegroundColor Red
    Write-Host "Detalles: $_" -ForegroundColor DarkRed
    Pause
    Exit
}

Write-Host "Servidor activo en: http://localhost:$port" -ForegroundColor Green
Write-Host "Abriendo el navegador..." -ForegroundColor Yellow
Write-Host "Presiona Ctrl+C en esta ventana para apagar el servidor." -ForegroundColor DarkYellow
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

# Abrir en el navegador predeterminado
Start-Process "http://localhost:$port/"

# Bucle para manejar peticiones
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") {
            $urlPath = "/index.html"
        }

        # Evitar vulnerabilidad de path traversal simple
        $cleanPath = $urlPath.Replace("/", "\").TrimStart("\")
        $filePath = Join-Path $PSScriptRoot $cleanPath

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".gif"  { "image/gif" }
                ".svg"  { "image/svg+xml" }
                ".mp4"  { "video/mp4" }
                ".mp3"  { "audio/mpeg" }
                ".wav"  { "audio/wav" }
                ".webm" { "video/webm" }
                ".ogg"  { "audio/ogg" }
                default { "application/octet-stream" }
            }

            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $response.ContentType = "text/plain; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Archivo no encontrado: $urlPath")
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    } catch {
        # Captura errores silenciosamente para evitar que el bucle se detenga
    }
}
