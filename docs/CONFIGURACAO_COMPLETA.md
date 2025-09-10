# 🔧 Configuração Completa - Hawk Esports Bot

## ❌ Problemas Identificados

### 1. Token do Discord Inválido
**Status:** ❌ CRÍTICO - Bot não pode iniciar

**Problema:** O token atual no `.env` é um placeholder inválido (formato repetitivo)

**Solução:**
1. Acesse: https://discord.com/developers/applications/1317247547297290240
2. Vá para a aba "Bot"
3. Clique em "Reset Token"
4. Copie o novo token
5. Substitua no arquivo `.env`

### 2. Configurações de Música Incompletas
**Status:** ⚠️ PARCIAL - Comandos de música não funcionarão

**Problemas:**
- `SPOTIFY_CLIENT_ID=your_spotify_client_id_32_chars`
- `SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_32_chars`

**Solução:**
1. Acesse: https://developer.spotify.com/dashboard
2. Crie uma nova aplicação
3. Copie Client ID e Client Secret
4. Configure no `.env`

### 3. Configurações de IA Pendentes
**Status:** ⚠️ OPCIONAL - Recursos de IA não funcionarão

**Problema:**
- `OPENAI_API_KEY=your_openai_api_key_here`

**Solução:**
1. Acesse: https://platform.openai.com/api-keys
2. Crie uma nova API key
3. Configure no `.env`

## 🛠️ Guia de Configuração Passo a Passo

### Passo 1: Configurar Discord Bot

1. **Acesse o Discord Developer Portal:**
   ```
   https://discord.com/developers/applications/1317247547297290240
   ```

2. **Configure o Bot:**
   - Vá para "Bot" → "Reset Token"
   - Copie o novo token
   - Ative "Message Content Intent"
   - Ative "Server Members Intent"
   - Ative "Presence Intent"

3. **Configure Permissões:**
   - Vá para "OAuth2" → "URL Generator"
   - Selecione "bot" e "applications.commands"
   - Permissões necessárias:
     - Administrator (recomendado para desenvolvimento)
     - Ou permissões específicas: Manage Channels, Manage Roles, Send Messages, etc.

4. **Convide o Bot:**