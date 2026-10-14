#!/usr/bin/env python3
"""
Render Real Presenter Reels (Vídeo Humano Real + Carro + Ficha Técnica)
------------------------------------------------------------------------
Usa o vídeo gravado real do Thiago se movimentando, falando e gesticulando,
combinado com a vitrine do veículo em formato vertical Reels 1080x1920.
"""

import sys
import time
import subprocess
import cv2
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "scripts" / "output_videos"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

THIAGO_VIDEO = BASE_DIR / "scripts" / "thiago-video.mp4"
CAR_IMAGE = OUTPUT_DIR / "temp_car.jpg"
AUDIO_FILE = OUTPUT_DIR / "temp_speech.mp3"
OUTPUT_VIDEO = OUTPUT_DIR / f"reels_thiago_apresentador_{int(time.time())}.mp4"

def render_real_presenter():
    print("🎬 Renderizando Reels com o VÍDEO REAL do Thiago...")

    if not THIAGO_VIDEO.exists():
        raise FileNotFoundError(f"Vídeo {THIAGO_VIDEO} não encontrado.")

    # Abre o vídeo do Thiago
    cap_thiago = cv2.VideoCapture(str(THIAGO_VIDEO))
    thiago_fps = cap_thiago.get(cv2.CAP_PROP_FPS) or 30.0
    thiago_total_frames = int(cap_thiago.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"📹 Vídeo do Thiago carregado: {thiago_total_frames} frames a {thiago_fps:.1f} fps")

    # Áudio de referência (15s do roteiro do Porsche)
    # Pega duração do áudio
    probe_cmd = [
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(AUDIO_FILE)
    ]
    audio_dur_str = subprocess.check_output(probe_cmd).decode().strip()
    audio_duration = float(audio_dur_str) if audio_dur_str else 15.0
    
    fps = 30
    total_frames = int(audio_duration * fps)
    width = 1080
    height = 1920

    print(f"⏱️ Duração da apresentação: {audio_duration:.2f}s ({total_frames} frames)")

    # Carrega imagem de fundo do carro
    if CAR_IMAGE.exists():
        bg_car = cv2.imread(str(CAR_IMAGE))
    else:
        bg_car = np.zeros((height, width, 3), dtype=np.uint8)

    temp_raw = OUTPUT_DIR / "temp_thiago_raw.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(temp_raw), fourcc, fps, (width, height))

    start_time = time.time()

    for i in range(total_frames):
        # 1. Background com zoom suave do Porsche
        zoom = 1.0 + (i / total_frames) * 0.06
        h_zoom, w_zoom = int(height * zoom), int(width * zoom)
        bg_zoomed = cv2.resize(bg_car, (w_zoom, h_zoom))
        sy = (h_zoom - height) // 2
        sx = (w_zoom - width) // 2
        frame = bg_zoomed[sy:sy + height, sx:sx + width].copy()

        # Vinhetas escuras
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (width, 280), (0, 0, 0), -1)
        cv2.rectangle(overlay, (0, height - 680), (width, height), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.72, frame, 0.28, 0, frame)

        # 2. Header Superior da Loja
        cv2.rectangle(frame, (40, 60), (460, 140), (15, 23, 42), -1)
        cv2.rectangle(frame, (40, 60), (460, 140), (51, 65, 85), 2)
        cv2.putText(frame, "FLOW GARAGE", (65, 112), cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2)

        cv2.rectangle(frame, (width - 320, 60), (width - 40, 140), (16, 185, 129), -1)
        cv2.putText(frame, "EM ESTOQUE", (width - 295, 112), cv2.FONT_HERSHEY_DUPLEX, 0.9, (15, 23, 42), 2)

        # 3. Título do Carro e Preço
        cv2.rectangle(frame, (40, 165), (width - 40, 265), (10, 15, 25), -1)
        cv2.rectangle(frame, (40, 165), (width - 40, 265), (99, 102, 241), 2)
        cv2.putText(frame, "Porsche 911 (992.2) Carrera", (65, 220), cv2.FONT_HERSHEY_DUPLEX, 1.05, (255, 255, 255), 2)
        cv2.putText(frame, "R$ 890.000", (width - 320, 220), cv2.FONT_HERSHEY_DUPLEX, 1.05, (52, 211, 153), 2)

        # 4. Cards de Especificações Técnicas
        specs = [
            ("LAUDO CAUTELAR", "100% APROVADO"),
            ("NEGOCIACAO", "ACEITA SEU USADO"),
            ("CONDICAO", "GARANTIA DE 1 ANO")
        ]
        card_y = height - 640
        for label, val in specs:
            cv2.rectangle(frame, (40, card_y), (width - 40, card_y + 60), (15, 23, 42), -1)
            cv2.rectangle(frame, (40, card_y), (width - 40, card_y + 60), (51, 65, 85), 1)
            cv2.putText(frame, label, (65, card_y + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (148, 163, 184), 2)
            cv2.putText(frame, val, (width - 390, card_y + 40), cv2.FONT_HERSHEY_DUPLEX, 0.85, (251, 191, 36), 2)
            card_y += 72

        # 5. O VÍDEO REAL DO THIAGO EM MOVIMENTO
        ret, thiago_frame = cap_thiago.read()
        if not ret:
            cap_thiago.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, thiago_frame = cap_thiago.read()

        # Dimensões da janela do Thiago no Reels
        # Formato retangular vertical elegante no canto inferior esquerdo
        box_w = 340
        box_h = 420
        box_x = 50
        box_y = height - 460

        # Recorta e redimensiona o vídeo do Thiago para preencher a janela
        th_h, th_w = thiago_frame.shape[:2]
        crop_ratio = box_w / box_h
        target_src_w = int(th_h * crop_ratio)
        if target_src_w < th_w:
            start_x = (th_w - target_src_w) // 2
            thiago_cropped = thiago_frame[:, start_x:start_x + target_src_w]
        else:
            thiago_cropped = thiago_frame

        thiago_resized = cv2.resize(thiago_cropped, (box_w, box_h))

        # Cria máscara com cantos arredondados para o vídeo do Thiago
        mask = np.zeros((box_h, box_w), dtype=np.uint8)
        cv2.rectangle(mask, (10, 10), (box_w - 10, box_h - 10), 255, -1)
        # Suaviza a borda da máscara
        mask = cv2.GaussianBlur(mask, (15, 15), 0)

        # Mescla o vídeo do Thiago dentro do frame
        for c in range(3):
            alpha = mask / 255.0
            frame[box_y:box_y + box_h, box_x:box_x + box_w, c] = (
                alpha * thiago_resized[:, :, c] + (1.0 - alpha) * frame[box_y:box_y + box_h, box_x:box_x + box_w, c]
            )

        # Borda elegante com efeito neon em volta do Thiago
        cv2.rectangle(frame, (box_x, box_y), (box_x + box_w, box_y + box_h), (99, 102, 241), 3)

        # Card de Identificação do Apresentador ao lado do Thiago
        info_x = box_x + box_w + 20
        info_w = width - info_x - 40
        info_y = box_y + 120
        cv2.rectangle(frame, (info_x, info_y), (info_x + info_w, info_y + 180), (10, 15, 30), -1)
        cv2.rectangle(frame, (info_x, info_y), (info_x + info_w, info_y + 180), (99, 102, 241), 2)
        cv2.putText(frame, "Thiago Oliveira", (info_x + 25, info_y + 60), cv2.FONT_HERSHEY_DUPLEX, 1.15, (255, 255, 255), 2)
        cv2.putText(frame, "Apresentador Oficial da Loja", (info_x + 25, info_y + 110), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (165, 180, 252), 2)
        cv2.putText(frame, "Chame no WhatsApp e agende seu test-drive!", (info_x + 25, info_y + 150), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (52, 211, 153), 2)

        out.write(frame)

        if i % 60 == 0:
            pct = (i / total_frames) * 100
            print(f"  Frame {i}/{total_frames} ({pct:.0f}%) concluído...")

    out.release()
    cap_thiago.release()

    print(f"⚡ Renderização dos frames concluída em {time.time() - start_time:.1f}s!")

    # Mescla áudio com FFmpeg
    print("🔊 Mesclando áudio com FFmpeg...")
    subprocess.run([
        'ffmpeg', '-y',
        '-i', str(temp_raw),
        '-i', str(AUDIO_FILE),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        str(OUTPUT_VIDEO)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    if temp_raw.exists():
        temp_raw.unlink()

    print(f"\n🎉 VÍDEO FINAL COM THIAGO GERADO!")
    print(f"📂 Arquivo: {OUTPUT_VIDEO}")
    return OUTPUT_VIDEO

if __name__ == '__main__':
    render_real_presenter()
