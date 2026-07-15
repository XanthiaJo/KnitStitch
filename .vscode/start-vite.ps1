# Start Vite dev server only if port 5173 is not already listening.
# When the server is already up, emit a "ready in" line so the VS Code
# background problemMatcher is satisfied and Chrome can launch immediately.
if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host 'Vite already running on :5173 — ready in 0ms'
    exit 0
}

npm run dev
