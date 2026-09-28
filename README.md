# 🚀 iaPedido - Automação WhatsApp & Gestão de Pedidos com Evolution API + Firebase

Plataforma completa para estabelecimentos comerciais (restaurantes, lanchonetes, pizzarias, lojas) com atendimento automatizado no **WhatsApp via Evolution API**, inteligência artificial com **Google Gemini** e painel em tempo real integrado ao **Firebase Firestore**.

---

## 🌟 Recursos Principais

1. **Atendente Virtual com IA (Google Gemini 2.5 Flash)**:
   - Conhece todo o catálogo de produtos e categorias em tempo real.
   - Tira dúvidas sobre ingredientes, valores e tempo de entrega.
   - Coleta os dados do cliente (nome, endereço ou retirada, itens, observações e forma de pagamento).
   - Registra pedidos automaticamente usando **Function Calling / Tool Calling**.

2. **Gestor de Pedidos em Tempo Real (KDS)**:
   - Sincronização em tempo real via **Firebase Firestore (`onSnapshot`)**.
   - **Alerta sonoro sintetizado** no navegador para novos pedidos recebidos.
   - Abas de status: *Novos / Pendentes*, *Em Preparo*, *Saiu p/ Entrega*, *Pronto p/ Retirada*, *Concluídos* e *Cancelados*.
   - **Impressão de Comanda Térmica** (formato 80mm com 1 clique).

3. **Automação de Resposta no WhatsApp (Evolution API)**:
   - **Ao clicar em "Confirmar Pedido":** A plataforma dispara automaticamente uma mensagem no WhatsApp do cliente informando que o pedido foi aceito e já está em preparo.
   - **Ao clicar em "Despachar Entrega":** Avisa o cliente no WhatsApp com o endereço de destino.
   - **Ao clicar em "Pronto p/ Retirada":** Avisa que o pedido está pronto no balcão.
   - **Ao cancelar/recusar:** Envia uma mensagem educada informando o motivo informado pelo lojista.

4. **Gestão de Cardápio & Produtos**:
   - Cadastro e edição de produtos com nome, preço, categoria, fotos e descrição detalhada.
   - Ativação/Pausa rápida de produtos para que a IA não ofereça itens sem estoque.

5. **Simulador de WhatsApp Interativo Embutido**:
   - Permite que você converse com a IA como cliente e faça pedidos de teste diretamente pelo navegador, vendo o pedido cair ao vivo no gestor!

6. **Painel de Conexão Evolution API**:
   - Conector com QR Code direto na interface para pareamento do WhatsApp.
   - Guia e URL do Webhook prontos para copiar.

---

## 🛠️ Arquitetura Técnica

- **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Firebase Client SDK.
- **Backend:** Node.js, Express, Firebase Admin SDK, Google Gen AI SDK (`@google/genai`).
- **Banco de Dados:** Google Firebase Firestore & Firebase Storage.
- **Integração WhatsApp:** Evolution API (v1 / v2).

---

## 🚀 Como Iniciar o Projeto

### 1. Acessar a pasta do projeto:
```bash
cd "/Users/thiagojosedeoliveira/Downloads/psicocall---teleconsulta-para-psicólogos (2)/pedidos-evolution-ia"
```

### 2. Instalar as dependências:
*(Como as dependências já estão instaladas na pasta raiz, basta rodar ou executar o npm install)*
```bash
npm install
```

### 3. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```

O servidor iniciará na porta **3001**:
- 🌐 **Painel Web:** [http://localhost:3001](http://localhost:3001)
- ⚡ **Endpoint do Webhook:** `http://localhost:3001/api/webhook/evolution`

---

## 📱 Configuração da Evolution API

1. No painel web da plataforma, acesse a aba **"WhatsApp Evolution"**.
2. Preencha a URL da sua Evolution API (ex: `http://localhost:8080` ou sua VPS) e a sua **API Key**.
3. Clique em **"Conectar / Gerar QR Code"** e aponte a câmera do seu WhatsApp.
4. Na sua Evolution API, configure o Webhook da instância com a URL:
   `http://<SEU_IP_OU_NGROK>:3001/api/webhook/evolution`
   - Marque o evento: `MESSAGES_UPSERT`.

---

## 📂 Como Abrir como Workspace Separado no Antigravity / VS Code

Se você desejar abrir esta pasta como um projeto/janela independente:
1. Abra o menu do seu editor (ou Antigravity) > **File > Open Folder...**
2. Selecione a pasta:
   `/Users/thiagojosedeoliveira/Downloads/psicocall---teleconsulta-para-psicólogos (2)/pedidos-evolution-ia`
*(Ou você pode mover/copiar a pasta `pedidos-evolution-ia` para qualquer outro local do seu computador, mantendo seus arquivos intactos!)*
