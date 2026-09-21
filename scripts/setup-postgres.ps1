$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Name = "sys112-postgres"

function Wait-Docker {
  for ($i = 0; $i -lt 60; $i++) {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 3
  }
  throw "Docker Desktop не поднялся. Откройте Docker и повторите."
}

Wait-Docker
$running = docker ps -a --filter "name=$Name" --format "{{.Names}}"
if ($running) {
  docker start $Name | Out-Null
} else {
  docker run -d --name $Name --restart unless-stopped `
    -e POSTGRES_USER=sys112 `
    -e POSTGRES_PASSWORD=sys112 `
    -e POSTGRES_DB=sys112 `
    -p 5435:5432 `
    -v sys112-pgdata:/var/lib/postgresql/data `
    postgres:16-alpine | Out-Null
}

for ($i = 0; $i -lt 40; $i++) {
  docker exec $Name pg_isready -U sys112 -d sys112 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    break
  }
  Start-Sleep -Seconds 2
}

Set-Location (Join-Path $Root "apps\api")
pnpm db:migrate
Write-Output "PostgreSQL local ready on 127.0.0.1:5435 db=sys112"
