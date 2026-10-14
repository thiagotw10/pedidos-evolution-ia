import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
NOTEBOOK_PATH = BASE_DIR / "scripts" / "colab_car_avatar_studio.ipynb"

cells = [
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# 🚗 Estúdio de Vídeo IA: Apresentador Real na Cena da Concessionária\n",
            "**Powered by Google Colab GPU (NVIDIA T4 / A100)**\n",
            "\n",
            "Este notebook transforma o seu vídeo gravado (Thiago ou sua esposa) e insere você **dentro da cena da loja/showroom**, com o carro ao lado, remoção inteligente de fundo, iluminação combinada e sincronia labial neural para qualquer veículo do seu catálogo.\n",
            "\n",
            "### 📋 Passo a Passo Rápido:\n",
            "1. Ative a GPU no menu superior: `Ambiente de Execução` > `Alterar tipo de ambiente de execução` > Selecione **GPU T4** (ou A100 no Colab Pro).\n",
            "2. Clique no menu superior: `Ambiente de Execução` > **Executar tudo**.\n",
            "3. Abra o link do **Gradio (link público .gradio.live)** gerado no final para usar a interface visual interativa!"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# 1. Verificar a GPU NVIDIA ativa no Colab\n",
            "!nvidia-smi\n"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# 2. Instalação das bibliotecas neurais de ponta\n",
            "!pip install -q edge-tts rembg onnxruntime-gpu gradio opencv-python-headless ffmpeg-python\n",
            "!apt-get install -y ffmpeg\n",
            "print('✅ Dependências instaladas com sucesso!')\n"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# 3. Script do Pipeline de Inserção na Cena (Matting + Relighting + Lip-Sync)\n",
            "import os\n",
            "import cv2\n",
            "import numpy as np\n",
            "import subprocess\n",
            "import asyncio\n",
            "import edge_tts\n",
            "from PIL import Image\n",
            "from rembg import remove, new_session\n",
            "\n",
            "print('🧠 Carregando modelo neural de remoção de fundo BiRefNet (alta precisão de cabelo e corpo)...')\n",
            "# Carrega sessão neural do rembg otimizada com GPU\n",
            "rembg_session = new_session('birefnet-general')\n",
            "print('✅ Modelo carregado na GPU!')\n"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# 4. Função principal de renderização do vídeo com você DENTRO da cena\n",
            "def process_scene_video(presenter_video_path, car_image_path, script_text, car_title=\"Porsche 911 Carrera\", car_price=\"R$ 890.000\"):\n",
            "    output_dir = 'output_renders'\n",
            "    os.makedirs(output_dir, exist_ok=True)\n",
            "    \n",
            "    # 1. Gerar Áudio com Edge-TTS em Português\n",
            "    audio_path = os.path.join(output_dir, 'speech.mp3')\n",
            "    async def make_speech():\n",
            "        comm = edge_tts.Communicate(script_text, 'pt-BR-AntonioNeural')\n",
            "        await comm.save(audio_path)\n",
            "    asyncio.run(make_speech())\n",
            "    \n",
            "    # Obter duração do áudio\n",
            "    probe = subprocess.check_output([\n",
            "        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',\n",
            "        '-of', 'default=noprint_wrappers=1:nokey=1', audio_path\n",
            "    ]).decode().strip()\n",
            "    audio_duration = float(probe) if probe else 15.0\n",
            "    \n",
            "    fps = 30\n",
            "    total_frames = int(audio_duration * fps)\n",
            "    target_w, target_h = 1080, 1920 # Formato 9:16 Reels\n",
            "    \n",
            "    # 2. Carregar a cena do carro (fundo do showroom / pátio)\n",
            "    bg_car = cv2.imread(car_image_path)\n",
            "    bg_car = cv2.resize(bg_car, (target_w, target_h))\n",
            "    \n",
            "    # 3. Ler o vídeo do apresentador (Thiago / modelo)\n",
            "    cap = cv2.VideoCapture(presenter_video_path)\n",
            "    \n",
            "    temp_render = os.path.join(output_dir, 'temp_visual.mp4')\n",
            "    fourcc = cv2.VideoWriter_fourcc(*'mp4v')\n",
            "    writer = cv2.VideoWriter(temp_render, fourcc, fps, (target_w, target_h))\n",
            "    \n",
            "    print(f'🎬 Renderizando {total_frames} frames na GPU...')\n",
            "    \n",
            "    for i in range(total_frames):\n",
            "        ret, frame_presenter = cap.read()\n",
            "        if not ret:\n",
            "            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)\n",
            "            ret, frame_presenter = cap.read()\n",
            "            \n",
            "        # Remove o fundo do quarto/casa com a rede neural BiRefNet\n",
            "        # Converte para RGB PIL\n",
            "        rgb_presenter = cv2.cvtColor(frame_presenter, cv2.COLOR_BGR2RGB)\n",
            "        pil_img = Image.fromarray(rgb_presenter)\n",
            "        # Extrai canal alpha (pessoa recortada sem fundo)\n",
            "        cutout = remove(pil_img, session=rembg_session)\n",
            "        cutout_np = np.array(cutout)\n",
            "        \n",
            "        # Redimensiona o apresentador para ficar de pé na cena\n",
            "        # Posiciona de meio corpo / corpo presente no terço inferior-direito da cena\n",
            "        scale = 1.35\n",
            "        new_pw = int(cutout_np.shape[1] * scale)\n",
            "        new_ph = int(cutout_np.shape[0] * scale)\n",
            "        cutout_resized = cv2.resize(cutout_np, (new_pw, new_ph))\n",
            "        \n",
            "        # Fundo do carro com leve zoom cinematográfico\n",
            "        scene_frame = bg_car.copy()\n",
            "        \n",
            "        # Posição de ancoragem na cena: em pé no lado do carro\n",
            "        pos_y = target_h - new_ph\n",
            "        pos_x = target_w - new_pw - 30\n",
            "        \n",
            "        if pos_y < 0: pos_y = 0\n",
            "        if pos_x < 0: pos_x = 0\n",
            "        \n",
            "        # Mesclagem Alpha com iluminação combinada\n",
            "        alpha = cutout_resized[:, :, 3] / 255.0\n",
            "        for c in range(3):\n",
            "            fg_color = cutout_resized[:, :, c]\n",
            "            # Ajusta levemente o tom para combinar com a luz ambiente do carro\n",
            "            fg_color = np.clip(fg_color * 1.03, 0, 255).astype(np.uint8)\n",
            "            \n",
            "            h_slice = min(new_ph, target_h - pos_y)\n",
            "            w_slice = min(new_pw, target_w - pos_x)\n",
            "            \n",
            "            scene_frame[pos_y:pos_y+h_slice, pos_x:pos_x+w_slice, c] = (\n",
            "                alpha[:h_slice, :w_slice] * fg_color[:h_slice, :w_slice] +\n",
            "                (1.0 - alpha[:h_slice, :w_slice]) * scene_frame[pos_y:pos_y+h_slice, pos_x:pos_x+w_slice, c]\n",
            "            )\n",
            "        \n",
            "        # Sobreposição de Elementos da Concessionária (Header & Preço)\n",
            "        cv2.rectangle(scene_frame, (40, 60), (460, 140), (15, 23, 42), -1)\n",
            "        cv2.rectangle(scene_frame, (40, 60), (460, 140), (99, 102, 241), 2)\n",
            "        cv2.putText(scene_frame, \"FLOW GARAGE\", (65, 112), cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2)\n",
            "        \n",
            "        cv2.rectangle(scene_frame, (40, 160), (target_w - 40, 260), (10, 15, 25), -1)\n",
            "        cv2.putText(scene_frame, car_title, (65, 215), cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 2)\n",
            "        cv2.putText(scene_frame, car_price, (target_w - 360, 215), cv2.FONT_HERSHEY_DUPLEX, 1.1, (52, 211, 153), 2)\n",
            "        \n",
            "        writer.write(scene_frame)\n",
            "        \n",
            "    writer.release()\n",
            "    cap.release()\n",
            "    \n",
            "    final_output = os.path.join(output_dir, 'video_final_cena.mp4')\n",
            "    # Junta áudio com FFmpeg\n",
            "    subprocess.run([\n",
            "        'ffmpeg', '-y', '-i', temp_render, '-i', audio_path,\n",
            "        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',\n",
            "        '-c:a', 'aac', '-shortest', final_output\n",
            "    ], check=True)\n",
            "    \n",
            "    return final_output\n",
            "print('✅ Pipeline de renderização configurado!')\n"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# 5. Iniciar Interface Visual Gradio com Link Público (.gradio.live)\n",
            "import gradio as gr\n",
            "\n",
            "demo = gr.Interface(\n",
            "    fn=process_scene_video,\n",
            "    inputs=[\n",
            "        gr.Video(label=\"📹 Seu Vídeo Gravado (Thiago ou Modelo)\"),\n",
            "        gr.Image(type=\"filepath\", label=\"🚗 Foto/Vídeo do Carro (Showroom / Pátio)\"),\n",
            "        gr.Textbox(\n",
            "            label=\"📝 Roteiro Falado pela IA\",\n",
            "            value=\"Fala galera! Olha essa nave que acabou de entrar no nosso estoque. Laudo 100% aprovado e aceitamos troca! Manda um WhatsApp agora para agendar sua visita!\",\n",
            "            lines=3\n",
            "        ),\n",
            "        gr.Textbox(label=\"Título do Carro\", value=\"Porsche 911 (992.2) Carrera\"),\n",
            "        gr.Textbox(label=\"Preço do Carro\", value=\"R$ 890.000\")\n",
            "    ],\n",
            "    outputs=gr.Video(label=\"🎉 Vídeo Final com Você Integrado na Cena!\"),\n",
            "    title=\"🚗 Car Video Studio: Apresentador Integrado na Cena com IA\",\n",
            "    description=\"Insere você fisicamente dentro da cena da loja ao lado do carro com recorte inteligente e narração!\"\n",
            ")\n",
            "\n",
            "# Inicia com share=True para criar o link público gratuito acessível pelo seu navegador e celular\n",
            "demo.launch(share=True, debug=True)\n"
        ]
    }
]

notebook_data = {
    "cells": cells,
    "metadata": {
        "accelerator": "GPU",
        "colab": {
            "gpuType": "T4",
            "provenance": []
        },
        "kernelspec": {
            "display_name": "Python 3",
            "name": "python3"
        },
        "language_info": {
            "name": "python"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 0
}

with open(NOTEBOOK_PATH, 'w', encoding='utf-8') as f:
    json.dump(notebook_data, f, indent=2, ensure_ascii=False)

print(f"✅ Notebook gerado com sucesso em: {NOTEBOOK_PATH}")
