# 🎵 Guia Completo de Configuração da API do Spotify

## 📋 Passo a Passo para Obter as Credenciais

### 1. Acesse o Dashboard do Spotify
- Vá para: https://developer.spotify.com/dashboard
- Faça login com sua conta do Spotify (gratuita ou premium)
- Se não tiver conta, crie uma gratuitamente

### 2. Crie um Novo App
- Clique em **"Create an App"**
- Preencha os campos:
  - **App Name**: `Bot Hawk eSports Music`
  - **App Description**: `Bot Discord para reprodução de música`
  - **Website**: `http://localhost` (pode deixar assim)
  - **Redirect URIs**: `http://localhost:3000` (obrigatório, mas não usado)
- Marque a caixa **"Web API"**
- Aceite os termos de serviço
- Clique em **"Save"**

### 3. Obtenha as Credenciais
- Após criar o app, você verá a página de configurações
- Copie o **Client ID** (visível)
- Clique em **"View client secret"** e copie o **Client Secret**
- ⚠️ **IMPORTANTE**: Mantenha o Client Secret seguro!

### 4. Configure as Variáveis de Ambiente
Crie ou edite o arquivo `.env` na raiz do projeto e adicione:

```env
# Spotify API Credentials
SPOTIFY_CLIENT_ID=seu_client_id_aqui
SPOTIFY_CLIENT_SECRET=seu_client_secret_aqui
```

## 🔧 Funcionalidades Implementadas

### ✅ O que já está funcionando:
- ✅ Busca de músicas no Spotify
- ✅ Integração automática com YouTube para reprodução
- ✅ Cache de resultados (1 hora)
- ✅ Refresh automático do token (a cada 55 minutos)
- ✅ Detecção automática de URLs do Spotify
- ✅ Fallback para YouTube quando Spotify não encontra resultados

### 🎯 Como usar:
1. **Busca por texto**: `/play hip hop music`
2. **URL do Spotify**: `/play https://open.spotify.com/track/...`
3. **URL do YouTube**: `/play https://youtube.com/watch?v=...`

## 🔄 Fluxo de Funcionamento

1. **Usuário executa comando** `/play`
2. **Sistema detecta o tipo**:
   - URL do Spotify → Busca metadados no Spotify
   - URL do YouTube → Busca diretamente no YouTube
   - Texto → Busca no YouTube primeiro, depois Spotify
3. **Para músicas do Spotify**:
   - Obtém metadados (título, artista, duração)
   - Busca equivalente no YouTube para reprodução
   - Reproduz o áudio via YouTube
4. **Cache e otimização**:
   - Resultados ficam em cache por 1 hora
   - Token do Spotify renova automaticamente

## 🚨 Limitações da API Gratuita

- **Client Credentials Flow**: Não acessa dados pessoais do usuário
- **Sem playlists privadas**: Apenas busca pública
- **Sem controle de reprodução**: Não controla o player do Spotify
- **Rate Limits**: Limite de requisições por minuto

## 🛠️ Troubleshooting

### Erro: "Spotify API not initialized"
- Verifique se as variáveis `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` estão no `.env`
- Reinicie o bot após adicionar as credenciais

### Erro: "Invalid client credentials"
- Verifique se copiou corretamente o Client ID e Secret
- Certifique-se de que não há espaços extras

### Música não encontrada
- O sistema tentará YouTube automaticamente
- Tente termos de busca mais específicos

## 📞 Suporte

Se tiver problemas:
1. Verifique os logs do bot
2. Confirme as credenciais no Dashboard do Spotify
3. Teste com uma busca simples primeiro

---

**🎉 Pronto! Sua integração com Spotify está configurada e funcionando!**