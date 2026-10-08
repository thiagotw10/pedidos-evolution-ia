#!/bin/bash
# Inicia o monitoramento automático do perfil em segundo plano
# Verifica se há novos posts a cada 4 horas (14400 segundos)

cd "$(dirname "$0")/.."
echo "Iniciando monitoramento automático do Instagram (@flowgarage.escapamentos)..."
./venv/bin/python3 scripts/instagram_sync.py --watch --interval 14400
