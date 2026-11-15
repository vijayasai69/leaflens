$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$pythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    py -3 -m venv (Join-Path $PSScriptRoot '.venv')
}

& $pythonPath -c "import torch, transformers; from PIL import Image" 2>$null
if ($LASTEXITCODE -ne 0) {
    & $pythonPath -m pip install -r (Join-Path $PSScriptRoot 'requirements-web.txt')
}

& $pythonPath (Join-Path $PSScriptRoot 'server.py')
