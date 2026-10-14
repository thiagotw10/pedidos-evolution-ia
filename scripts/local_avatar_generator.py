#!/usr/bin/env python3
"""
Local AI Avatar & Video Generator for Apple Silicon (Mac M2)
-----------------------------------------------------------
Renders complete 9:16 Instagram Reels / Stories with:
- Car background video or image
- Talking AI Presenter (Avatar) with lip-sync / audio energy animation
- Lower-third dynamic specs cards (Ano, KM, Laudo, Troca)
- Top dealership badge & animated audio wave
- Merged high-quality MP4 ready for Instagram / WhatsApp
"""

import os
import sys
import time
import math
import json
import argparse
import subprocess
import requests
import numpy as np
import cv2
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "scripts" / "output_videos"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_CAR_IMAGE = "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1080&q=80"
DEFAULT_AVATAR_IMAGE = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80"
DEFAULT_AUDIO_TEXT = "Fala galera! Olha esse Porsche 911 que acabou de entrar no nosso pátio! Laudo 100% aprovado, revisado com garantia e aceitamos seu usado na troca. Manda mensagem no WhatsApp agora para agendar sua visita!"

def download_file(url: str, dest_path: Path):
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return dest_path
    print(f"📥 Baixando {url[:60]}...")
    res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
    res.raise_for_status()
    with open(dest_path, 'wb') as f:
        f.write(res.content)
    return dest_path

def generate_local_speech(text: str, output_mp3: Path):
    """Gera áudio em português usando Edge TTS via Python."""
    print("🎙️ Gerando áudio de voz em português...")
    import edge_tts
    import asyncio
    communicate = edge_tts.Communicate(text, "pt-BR-ThalitaMultilingualNeural")
    asyncio.run(communicate.save(str(output_mp3)))
    print(f"✅ Áudio gerado: {output_mp3.name}")
    return output_mp3

def get_audio_duration_and_samples(audio_path: Path, fps: int = 30):
    """Extrai amplitude do áudio por frame para sincronia labial e animação."""
    wav_path = audio_path.with_suffix('.wav')
    # Converte para WAV temporário para ler dados brutos de amplitude
    subprocess.run([
        'ffmpeg', '-y', '-i', str(audio_path),
        '-ar', '16000', '-ac', '1', str(wav_path)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    import wave
    with wave.open(str(wav_path), 'rb') as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)
        duration = n_frames / float(framerate)

    # Remove o wav temporário
    if wav_path.exists():
        wav_path.unlink()

    samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32)
    max_val = np.max(np.abs(samples)) or 1.0
    normalized = np.abs(samples) / max_val

    # Agrupa amostras por frame de vídeo
    total_video_frames = int(duration * fps)
    samples_per_frame = int(len(normalized) / max(1, total_video_frames))
    
    frame_energies = []
    for i in range(total_video_frames):
        start = i * samples_per_frame
        end = start + samples_per_frame
        chunk = normalized[start:end]
        energy = float(np.mean(chunk)) if len(chunk) > 0 else 0.0
        frame_energies.append(energy)

    return duration, total_video_frames, frame_energies

def create_circular_avatar(avatar_img, size=(180, 180), mouth_open_ratio=0.0):
    """Cria o avatar circular recortado com animação sutil na boca / mandíbula."""
    resized = cv2.resize(avatar_img, size, interpolation=cv2.INTER_AREA)
    h, w = size

    # Efeito de movimento labial (deforma sutilmente a parte inferior do rosto com a fala)
    if mouth_open_ratio > 0.05:
        # Área estimada da boca (região central inferior: 65% a 85% da altura)
        mouth_y1, mouth_y2 = int(h * 0.62), int(h * 0.88)
        mouth_x1, mouth_x2 = int(w * 0.32), int(w * 0.68)
        mouth_roi = resized[mouth_y1:mouth_y2, mouth_x1:mouth_x2]

        # Estica verticalmente proporcional à energia da voz
        stretch_factor = 1.0 + (mouth_open_ratio * 0.18)
        new_h = int(mouth_roi.shape[0] * stretch_factor)
        stretched_roi = cv2.resize(mouth_roi, (mouth_roi.shape[1], new_h), interpolation=cv2.INTER_LINEAR)
        
        # Recorta de volta para caber
        target_h = mouth_y2 - mouth_y1
        stretched_roi = stretched_roi[:target_h, :]
        resized[mouth_y1:mouth_y2, mouth_x1:mouth_x2] = stretched_roi

    # Máscara circular
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (w // 2, h // 2), (min(h, w) // 2) - 4, 255, -1)
    
    # Aplica canal Alpha
    b, g, r = cv2.split(resized)
    avatar_rgba = cv2.merge([b, g, r, mask])
    return avatar_rgba

def render_reels_video(
    car_media_path: Path,
    avatar_image_path: Path,
    audio_path: Path,
    car_name: str,
    car_price: str,
    output_video_path: Path,
    persona_name: str = "Sofia",
    persona_role: str = "Consultora Digital"
):
    print("\n🎬 Iniciando renderização do Reels 1080x1920 (Apple Silicon GPU)...")
    fps = 30
    width = 1080
    height = 1920

    duration, total_frames, energies = get_audio_duration_and_samples(audio_path, fps)
    print(f"⏱️ Duração do áudio: {duration:.2f}s ({total_frames} frames)")

    # Carrega avatar
    raw_avatar = cv2.imread(str(avatar_image_path))
    if raw_avatar is None:
        raise ValueError("Não foi possível carregar a imagem do avatar")

    # Carrega imagem ou vídeo de fundo do carro
    is_video_bg = str(car_media_path).endswith(('.mp4', '.mov', '.avi'))
    bg_cap = None
    if is_video_bg:
        bg_cap = cv2.VideoCapture(str(car_media_path))
    else:
        bg_static = cv2.imread(str(car_media_path))
        # Ajusta para formato 9:16 com zoom/preenchimento
        bg_static = cv2.resize(bg_static, (width, height))

    temp_raw_video = output_video_path.with_name("temp_no_audio.mp4")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(temp_raw_video), fourcc, fps, (width, height))

    print("🚀 Processando frames...")
    start_time = time.time()

    for frame_idx in range(total_frames):
        if is_video_bg and bg_cap:
            ret, frame = bg_cap.read()
            if not ret:
                bg_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = bg_cap.read()
            frame = cv2.resize(frame, (width, height))
        else:
            # Efeito de zoom lento (Ken Burns) na imagem do carro
            zoom = 1.0 + (frame_idx / total_frames) * 0.08
            h_zoom, w_zoom = int(height * zoom), int(width * zoom)
            zoomed = cv2.resize(bg_static, (w_zoom, h_zoom))
            # Corta centralizado
            start_y = (h_zoom - height) // 2
            start_x = (w_zoom - width) // 2
            frame = zoomed[start_y:start_y + height, start_x:start_x + width].copy()

        # Vinheta escura nos topos e rodapés para máxima legibilidade
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (width, 260), (0, 0, 0), -1)
        cv2.rectangle(overlay, (0, height - 520), (width, height), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

        # 1. Header do Topo (Loja & Badge Em Estoque)
        cv2.rectangle(frame, (40, 60), (480, 140), (20, 20, 25), -1)
        cv2.rectangle(frame, (40, 60), (480, 140), (60, 60, 75), 2)
        cv2.putText(frame, "FLOW GARAGE", (65, 112), cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2)

        cv2.rectangle(frame, (width - 320, 60), (width - 40, 140), (16, 185, 129), -1)
        cv2.putText(frame, "EM ESTOQUE", (width - 295, 112), cv2.FONT_HERSHEY_DUPLEX, 0.9, (15, 23, 42), 2)

        # 2. Título do Carro e Preço no Topo/Centro
        cv2.rectangle(frame, (40, 170), (width - 40, 270), (10, 15, 25), -1)
        cv2.rectangle(frame, (40, 170), (width - 40, 270), (99, 102, 241), 2)
        cv2.putText(frame, car_name[:36], (65, 225), cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2)
        cv2.putText(frame, car_price, (width - 340, 225), cv2.FONT_HERSHEY_DUPLEX, 1.1, (52, 211, 153), 2)

        # 3. Cards de Ficha Técnica Animados
        specs = [
            ("LAUDO CAUTELAR", "100% APROVADO"),
            ("NEGOCIACAO", "ACEITA TROCA"),
            ("CONDICAO", "GARANTIA 1 ANO")
        ]
        card_y = height - 480
        for label, val in specs:
            cv2.rectangle(frame, (40, card_y), (width - 40, card_y + 65), (15, 23, 42), -1)
            cv2.rectangle(frame, (40, card_y), (width - 40, card_y + 65), (51, 65, 85), 1)
            cv2.putText(frame, label, (65, card_y + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (148, 163, 184), 2)
            cv2.putText(frame, val, (width - 380, card_y + 44), cv2.FONT_HERSHEY_DUPLEX, 0.9, (251, 191, 36), 2)
            card_y += 78

        # 4. Caixa do Apresentador Virtual (Avatar com Lip-Sync)
        energy = energies[frame_idx] if frame_idx < len(energies) else 0.0
        # Normaliza a energia para abertura da boca
        mouth_ratio = min(1.0, energy * 3.5)

        avatar_size = 220
        avatar_rgba = create_circular_avatar(raw_avatar, (avatar_size, avatar_size), mouth_ratio)
        
        # Posição do Avatar: Canto inferior esquerdo
        pos_x = 50
        pos_y = height - 250

        # Card de fundo do apresentador
        cv2.rectangle(frame, (pos_x + 90, pos_y + 30), (width - 50, pos_y + 190), (10, 15, 30), -1)
        cv2.rectangle(frame, (pos_x + 90, pos_y + 30), (width - 50, pos_y + 190), (99, 102, 241), 2)
        cv2.putText(frame, f"{persona_name} ({persona_role})", (pos_x + 190, pos_y + 90), cv2.FONT_HERSHEY_DUPLEX, 1.0, (255, 255, 255), 2)
        cv2.putText(frame, "Apresentando o veiculo ao vivo", (pos_x + 190, pos_y + 140), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (165, 180, 252), 1)

        # Barra de áudio / onda de voz animada
        wave_width = int(energy * 250)
        cv2.rectangle(frame, (width - 320, pos_y + 110), (width - 320 + wave_width, pos_y + 130), (16, 185, 129), -1)

        # Sobrepõe o avatar com alpha
        for c in range(3):
            alpha = avatar_rgba[:, :, 3] / 255.0
            frame[pos_y:pos_y + avatar_size, pos_x:pos_x + avatar_size, c] = (
                alpha * avatar_rgba[:, :, c] + (1.0 - alpha) * frame[pos_y:pos_y + avatar_size, pos_x:pos_x + avatar_size, c]
            )

        # Borda brilhante em volta do avatar
        cv2.circle(frame, (pos_x + avatar_size // 2, pos_y + avatar_size // 2), (avatar_size // 2) - 4, (99, 102, 241), 4)

        out.write(frame)

        if frame_idx % 60 == 0:
            pct = (frame_idx / total_frames) * 100
            print(f"  Frame {frame_idx}/{total_frames} ({pct:.0f}%) concluído...")

    out.release()
    if bg_cap:
        bg_cap.release()

    render_elapsed = time.time() - start_time
    print(f"⚡ Renderização visual concluída em {render_elapsed:.1f}s!")

    # 5. Mescla áudio com FFmpeg
    print("🔊 Mesclando áudio original e gerando arquivo final com FFmpeg...")
    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', str(temp_raw_video),
        '-i', str(audio_path),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        str(output_video_path)
    ]
    subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    if temp_raw_video.exists():
        temp_raw_video.unlink()

    print(f"\n🎉 VÍDEO CONCLUÍDO COM SUCESSO!")
    print(f"📂 Arquivo salvo em: {output_video_path}")
    print(f"📊 Tamanho do arquivo: {output_video_path.stat().st_size // (1024 * 1024)} MB")
    return output_video_path

def main():
    parser = argparse.ArgumentParser(description="Gerador Local de Vídeo & Avatar com IA (Mac M2)")
    parser.add_argument("--car-name", default="Porsche 911 (992.2) Carrera", help="Nome do Veículo")
    parser.add_argument("--car-price", default="R$ 890.000", help="Preço do Veículo")
    parser.add_argument("--car-image", default=DEFAULT_CAR_IMAGE, help="URL ou caminho da imagem/vídeo do carro")
    parser.add_argument("--avatar-image", default=DEFAULT_AVATAR_IMAGE, help="URL ou caminho da foto do apresentador")
    parser.add_argument("--text", default=DEFAULT_AUDIO_TEXT, help="Texto do roteiro falado")
    parser.add_argument("--output", default=str(OUTPUT_DIR / f"reels_apresentador_{int(time.time())}.mp4"), help="Caminho do MP4 de saída")

    args = parser.parse_args()

    # Prepara arquivos
    car_file = OUTPUT_DIR / "temp_car.jpg"
    download_file(args.car_image, car_file)

    avatar_file = OUTPUT_DIR / "temp_avatar.jpg"
    download_file(args.avatar_image, avatar_file)

    audio_file = OUTPUT_DIR / "temp_speech.mp3"
    generate_local_speech(args.text, audio_file)

    output_path = Path(args.output)
    render_reels_video(
        car_media_path=car_file,
        avatar_image_path=avatar_file,
        audio_path=audio_file,
        car_name=args.car_name,
        car_price=args.car_price,
        output_video_path=output_path
    )

if __name__ == '__main__':
    main()
