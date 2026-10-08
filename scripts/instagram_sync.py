#!/usr/bin/env python3
"""
Flow Garage - Sincronizador Automático Instagram -> iaPedido (Catálogo IA)
--------------------------------------------------------------------------
Monitora o perfil @flowgarage.escapamentos, baixa fotos em alta resolução,
estrutura os dados técnicos com Google Gemini e cadastra como referências
na plataforma iaPedido automaticamente.
"""

import os
import sys
import time
import json
import argparse
import requests
from datetime import datetime
from pathlib import Path

# Carregar variáveis de ambiente do .env
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / '.env'

GEMINI_API_KEY = None
if ENV_PATH.exists():
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('GEMINI_API_KEY='):
                GEMINI_API_KEY = line.split('=', 1)[1].strip()

# Configurações Padrão
DEFAULT_STORE_ID = "ZFFWUNspKNYKsn22kKDH6nybCWw2" # FLOW GARAGE EXHAUST
DEFAULT_PROFILE = "flowgarage.escapamentos"
API_URL = "https://iapedido.web.app/api"
STORAGE_BUCKET = "iapedido.firebasestorage.app"
HISTORY_FILE = BASE_DIR / "scripts" / "synced_posts.json"

CATEGORIAS_OFICIAIS = [
    "Porsche", "Ferrari", "BMW", "Audi", "Mercedes", "Chevrolet", "Ford", "Geral"
]

def load_history():
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_history(history_set):
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(list(history_set), f, indent=2, ensure_ascii=False)

def parse_with_gemini(caption: str) -> dict:
    """Usa o Google Gemini para extrair informações do projeto a partir da legenda."""
    if not GEMINI_API_KEY:
        print("  [Aviso] GEMINI_API_KEY não encontrada no .env. Usando extração simples.")
        first_line = caption.strip().split('\n')[0][:60]
        return {
            "name": first_line or "Projeto de Escapamento",
            "category": "Geral",
            "description": caption
        }

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = f"""
Você é um especialista técnico em catalogação para oficina de escapamentos esportivos de alta performance (FLOW GARAGE EXHAUST).
Analise a legenda do Instagram abaixo e retorne APENAS um JSON puro com os seguintes campos:
- name: Nome conciso e chamativo do projeto (ex: 'Porsche 911 (992.2) — Catback Full Titanium')
- category: A marca do veículo exatamente entre: 'Porsche', 'Ferrari', 'BMW', 'Audi', 'Mercedes', 'Chevrolet', 'Ford', 'Geral'
- description: Resumo técnico elegante para o vendedor virtual da IA do WhatsApp responder dúvidas de clientes sobre o projeto, sem hashtags e sem excesso de emojis.

Legenda do Instagram:
\"\"\"{caption}\"\"\"
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json'
            )
        )
        data = json.loads(response.text)
        if data.get('category') not in CATEGORIAS_OFICIAIS:
            # Fallback se a categoria não bater exata
            cat = data.get('category', 'Geral')
            for c in CATEGORIAS_OFICIAIS:
                if c.lower() in cat.lower():
                    data['category'] = c
                    break
            else:
                data['category'] = 'Geral'
        return data
    except Exception as e:
        print(f"  [Gemini Erro] {e}. Usando fallback.")
        return {
            "name": caption.strip().split('\n')[0][:60] or "Projeto de Escapamento",
            "category": "Geral",
            "description": caption
        }

def upload_to_firebase_storage(data_bytes: bytes, filename: str, store_id: str, content_type: str = "image/jpeg") -> str:
    """Faz o upload direto para o Firebase Storage e retorna o link permanente de download."""
    clean_name = filename.replace(' ', '_')
    storage_path = f"establishments/{store_id}/products/{clean_name}"
    encoded_path = requests.utils.quote(storage_path, safe='')
    
    upload_url = f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o?name={encoded_path}&uploadType=media"
    res = requests.post(
        upload_url,
        data=data_bytes,
        headers={"Content-Type": content_type, "Connection": "close"},
        timeout=60
    )
    res.raise_for_status()
    data = res.json()
    token = data.get("downloadTokens")
    safe_name = data.get("name", "").replace("/", "%2F")
    return f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o/{safe_name}?alt=media&token={token}"

def register_product_in_platform(project_data: dict, store_id: str):
    """Envia o novo projeto para a API do iaPedido."""
    endpoint = f"{API_URL}/products"
    headers = {
        "Content-Type": "application/json",
        "x-establishment-id": store_id
    }
    payload = {
        "establishmentId": store_id,
        "name": project_data["name"],
        "category": project_data["category"],
        "price": 0,
        "available": True,
        "description": project_data["description"],
        "imageUrl": project_data.get("imageUrl", ""),
        "images": project_data.get("images", []),
        "videoUrl": project_data.get("videoUrl", None),
        "instagramShortcode": project_data.get("shortcode", "")
    }
    res = requests.post(endpoint, json=payload, headers=headers, timeout=15)
    res.raise_for_status()
    return res.json()

def process_post_url(post_url: str, store_id: str, history: set) -> bool:
    """Extrai informações completas de um post (fotos, carrossel e vídeo) usando instaloader."""
    import instaloader
    L = instaloader.Instaloader()

    shortcode = post_url.rstrip('/').split('/')[-1].split('?')[0]
    if shortcode in history:
        print(f"⏩ Post {shortcode} já cadastrado anteriormente. Pulando.")
        return False

    print(f"\n🔍 Processando post {shortcode} ({post_url})...")
    
    try:
        post = instaloader.Post.from_shortcode(L.context, shortcode)
    except Exception as e:
        print(f"❌ Falha ao buscar post no Instagram: {e}")
        return False

    caption = post.caption or ''
    photo_urls = []
    raw_video_url = None

    if post.typename == 'GraphSidecar':
        print("📑 Post identificado como CARROSSEL!")
        for idx, node in enumerate(post.get_sidecar_nodes()):
            if node.is_video and not raw_video_url:
                raw_video_url = node.video_url
                print(f"  🎬 Slide {idx+1}: Vídeo detectado (ronco/escapamento)!")
            elif not node.is_video and len(photo_urls) < 6:
                photo_urls.append(node.display_url)
                print(f"  📷 Slide {idx+1}: Foto do projeto adicionada.")
    elif post.is_video:
        print("🎬 Post identificado como VÍDEO / REEL!")
        raw_video_url = post.video_url
        photo_urls.append(post.url)
    else:
        print("📷 Post identificado como FOTO ÚNICA!")
        photo_urls.append(post.url)

    if not photo_urls and not raw_video_url:
        print("❌ Nenhuma mídia encontrada para este post.")
        return False

    print("🤖 Analisando especificações técnicas com Google Gemini...")
    parsed = parse_with_gemini(caption)
    print(f"   Nome do Projeto: {parsed.get('name')}")
    print(f"   Marca/Categoria: {parsed.get('category')}")

    timestamp = int(time.time())
    uploaded_photos = []

    # Upload das fotos do carrossel para o Firebase Storage
    for i, p_url in enumerate(photo_urls):
        try:
            print(f"☁️ Baixando e enviando foto {i+1}/{len(photo_urls)} para o Firebase Storage...")
            img_res = requests.get(p_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=20)
            if img_res.status_code == 200:
                filename = f"insta_{shortcode}_img{i+1}_{timestamp}.jpg"
                storage_url = upload_to_firebase_storage(img_res.content, filename, store_id, "image/jpeg")
                uploaded_photos.append(storage_url)
        except Exception as e:
            print(f"  ⚠️ Erro na foto {i+1}: {e}")

    # Upload do vídeo (se houver)
    uploaded_video_url = None
    if raw_video_url:
        try:
            print("🎥 Baixando vídeo do escapamento/ronco e enviando para o Firebase Storage...")
            v_res = requests.get(raw_video_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=40)
            if v_res.status_code == 200:
                v_filename = f"insta_{shortcode}_ronco_{timestamp}.mp4"
                uploaded_video_url = upload_to_firebase_storage(v_res.content, v_filename, store_id, "video/mp4")
                print(f"  ✅ Vídeo enviado com sucesso! ({len(v_res.content) // 1024} KB)")
        except Exception as e:
            print(f"  ⚠️ Erro ao processar vídeo: {e}")

    parsed['imageUrl'] = uploaded_photos[0] if uploaded_photos else ""
    parsed['images'] = uploaded_photos
    parsed['videoUrl'] = uploaded_video_url
    parsed['shortcode'] = shortcode

    print("🚀 Cadastrando referência na plataforma FLOW GARAGE EXHAUST...")
    result = register_product_in_platform(parsed, store_id)

    print(f"✅ SUCESSO! Projeto cadastrado com ID: {result.get('product', {}).get('id')}")
    print(f"   Fotos salvas: {len(uploaded_photos)} | Vídeo salvo: {'SIM' if uploaded_video_url else 'NÃO'}")
    
    history.add(shortcode)
    save_history(history)
    return True

def sync_from_profile(username: str, store_id: str, history: set, max_posts: int = 15):
    """Varre posts recentes do perfil do Instagram."""
    import instaloader
    L = instaloader.Instaloader()
    
    # Tenta carregar sessão salva previamente se existir
    session_file = Path.home() / f".config/instaloader/session-{username}"
    if session_file.exists():
        try:
            L.load_session_from_file(username)
            print(f"🔑 Sessão de @{username} carregada com sucesso.")
        except Exception as e:
            print(f"⚠️ Erro ao carregar sessão salva: {e}")

    try:
        print(f"📡 Buscando perfil @{username}...")
        profile = instaloader.Profile.from_username(L.context, username)
        synced_count = 0
        for i, post in enumerate(profile.get_posts()):
            if i >= max_posts:
                break
            if post.shortcode in history:
                print(f"⏩ Post {post.shortcode} já sincronizado.")
                continue

            print(f"\n📦 Novo post detectado: {post.shortcode} ({post.date_utc})")
            caption = post.caption or ""
            
            # Baixa imagem
            img_res = requests.get(post.url, timeout=20)
            if img_res.status_code != 200:
                continue

            parsed = parse_with_gemini(caption)
            filename = f"insta_{post.shortcode}_{int(time.time())}.jpg"
            image_url = upload_to_firebase_storage(img_res.content, filename, store_id)
            
            parsed['imageUrl'] = image_url
            parsed['shortcode'] = post.shortcode
            register_product_in_platform(parsed, store_id)
            print(f"✅ Projeto {parsed.get('name')} inserido!")
            
            history.add(post.shortcode)
            save_history(history)
            synced_count += 1
            time.sleep(2) # Pequena pausa de segurança

        print(f"\n✨ Sincronização concluída! {synced_count} novos projetos cadastrados.")
    except Exception as e:
        print(f"❌ Não foi possível varrer o perfil automaticamente sem sessão: {e}")
        print("\n💡 DICA: O Instagram bloqueia consultas anônimas constantes.")
        print("Para permitir que o script varra novos posts 100% automático todo dia:")
        print(f"  ./venv/bin/instaloader --login SEU_INSTAGRAM")
        print("Isso salvará os cookies no seu computador e permitirá monitoramento contínuo sem bloqueios.")

def main():
    parser = argparse.ArgumentParser(description="Sincronizador Instagram -> Catálogo iaPedido")
    parser.add_argument("--profile", default=DEFAULT_PROFILE, help="Usuário do Instagram")
    parser.add_argument("--store-id", default=DEFAULT_STORE_ID, help="ID do Estabelecimento na Plataforma")
    parser.add_argument("--url", help="URL de um post específico para cadastrar imediatamente")
    parser.add_argument("--urls-file", help="Arquivo .txt com uma lista de URLs de posts para processar em lote")
    parser.add_argument("--watch", action="store_true", help="Executa em segundo plano monitorando periodicamente")
    parser.add_argument("--interval", type=int, default=14400, help="Intervalo em segundos para o modo watch (padrão: 4h = 14400s)")
    
    args = parser.parse_args()
    history = load_history()

    # Caso 1: Cadastrar uma URL específica
    if args.url:
        process_post_url(args.url, args.store_id, history)
        return

    # Caso 2: Cadastrar URLs de um arquivo txt
    if args.urls_file:
        p = Path(args.urls_file)
        if not p.exists():
            print(f"Arquivo {args.urls_file} não encontrado.")
            sys.exit(1)
        with open(p, 'r') as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        print(f"Processando {len(urls)} posts da lista...")
        for u in urls:
            try:
                process_post_url(u, args.store_id, history)
            except Exception as e:
                print(f"Erro no post {u}: {e}")
        return

    # Caso 3: Monitoramento Contínuo (--watch)
    if args.watch:
        print(f"👀 Iniciando monitor de posts para @{args.profile} (Intervalo: {args.interval}s)...")
        print("Pressione Ctrl+C para encerrar.")
        while True:
            try:
                sync_from_profile(args.profile, args.store_id, history)
            except Exception as e:
                print(f"[Erro no ciclo] {e}")
            print(f"Aguardando próximo ciclo em {args.interval // 60} minutos...")
            time.sleep(args.interval)

    # Caso 4: Execução única do perfil
    sync_from_profile(args.profile, args.store_id, history)

if __name__ == '__main__':
    main()
