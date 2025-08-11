Write-Host "Restarting ROIA-Suite services..." -ForegroundColor Cyan

# Stop existing PM2 processes for ROIA-Suite
Write-Host "Stopping existing PM2 processes..." -ForegroundColor Yellow
pm2 stop roia-suite-backend 2>$null
pm2 stop roia-suite-frontend 2>$null
pm2 delete roia-suite-backend 2>$null
pm2 delete roia-suite-frontend 2>$null

# Start backend with PM2
Write-Host "Starting backend with HTTPS..." -ForegroundColor Green
Set-Location -Path "C:\poia_tools\roia-suite\backend"
pm2 start pm2_starter.js --name roia-suite-backend

# Start frontend with PM2
Write-Host "Starting frontend..." -ForegroundColor Green
Set-Location -Path "C:\poia_tools\roia-suite\frontend"
pm2 start start_frontend.js --name roia-suite-frontend

Write-Host "Services restarted successfully!" -ForegroundColor Cyan
Write-Host "Backend URL: https://localhost:8005" -ForegroundColor Magenta
Write-Host "Frontend URL: http://localhost:8006" -ForegroundColor Magenta
Write-Host "Note: You will need to accept the self-signed certificate warning in your browser" -ForegroundColor Yellow
