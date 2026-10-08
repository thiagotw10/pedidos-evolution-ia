#!/bin/bash
# Script de conveniência para cadastrar um post do Instagram rapidamente
# Uso: ./scripts/cadastrar_post.sh https://www.instagram.com/p/CODIGO/

if [ -z "$1" ]; then
  echo "Uso: ./scripts/cadastrar_post.sh <URL_DO_POST_OU_SHORTCODE>"
  echo "Exemplo: ./scripts/cadastrar_post.sh https://www.instagram.com/p/DSC7P9-kaMK/"
  exit 1
fi

cd "$(dirname "$0")/.."
./venv/bin/python3 scripts/instagram_sync.py --url "$1"
