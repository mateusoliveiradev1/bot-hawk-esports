# 🚀 Configuração do Render.com - Bot Hawk Esports

## ❌ Erro Atual
```
Exited with status 1 Error: Missing required environment variable: JWT_SECRET
```

## 🔧 Solução: Configurar Variáveis de Ambiente

### 📋 Variáveis Obrigatórias que Precisam ser Configuradas

As seguintes variáveis estão definidas no `render.yaml` mas precisam ser configuradas manualmente no painel do Render:

```env
# Variáveis de Segurança (OBRIGATÓRIAS)
JWT_SECRET=ZeSnPKa0jGiiwA5kyca-FOnrUHicXD2bIPXVjLZgn7vI3ueYO9qU3KkV8jH99QKChNqnhejzhTMDY1ZaFSP1Xw
WEBHOOK_SECRET=ce4fe06f269404e0cddb7708b2d0ea90b7bad89ef8cb8c345e8f3b818f3244c9
SESSION_SECRET=d9c6376410c1df4742639e45d27be8fdabe7824e17e6f955c18e28dc0839d7b1
CSRF_SECRET=b82e50b8c29c260ae8e606762a2ae00e551c4e84749c0bcbec9103394b4f8f7c
ENCRYPTION_KEY=84486dbccc4a5c06d0a8a51919c65acca70d99bfeeb6a949b26e3c308de41331

# Discord (OBRIGATÓRIAS)
DISCORD_TOKEN=seu_token_do_discord_aqui
DISCORD_CLIENT_ID=seu_client_id_do_discord_aqui
DISCORD_CLIENT_SECRET=seu_client_secret_do_discord_aqui

# APIs Externas (OBRIGATÓRIAS)
PUBG_API_KEY=sua_chave_da_api_pubg_aqui

# Database será configurado automaticamente pelo Render
DATABASE_URL=será_gerado_automaticamente
REDIS_URL=será_gerado_automaticamente
```

### 🎯 Passos para Configurar no Render

1. **Acesse o Render Dashboard**
   - Vá para [https://dashboard.render.com](https://dashboard.render.com)
   - Faça login na sua conta

2. **Selecione o Serviço**
   - Clique no serviço `bot-hawk-esports`

3. **Acesse Environment Variables**
   - No menu lateral, clique em **"Environment"**
   - Ou vá para a aba **"Environment"**

4. **Adicione as Variáveis**
   Para cada variável listada acima:
   - Clique em **"Add Environment Variable"**
   - **Key**: Nome da variável (ex: `JWT_SECRET`)
   - **Value**: Valor correspondente
   - Clique em **"Save"**

5. **Variáveis Prioritárias (Configure PRIMEIRO)**
   ```
   JWT_SECRET=ZeSnPKa0jGiiwA5kyca-FOnrUHicXD2bIPXVjLZgn7vI3ueYO9qU3KkV8jH99QKChNqnhejzhTMDY1ZaFSP1Xw
   WEBHOOK_SECRET=ce4fe06f269404e0cddb7708b2d0ea90b7bad89ef8cb8c345e8f3b818f3244c9
   SESSION_SECRET=d9c6376410c1df4742639e45d27be8fdabe7824e17e6f955c18e28dc0839d7b1
   CSRF_SECRET=b82e50b8c29c260ae8e606762a2ae00e551c4e84749c0bcbec9103394b4f8f7c
   ENCRYPTION_KEY=84486dbccc4a5c06d0a8a51919c65acca70d99bfeeb6a949b26e3c308de41331
   ```

6. **Salvar e Redesploy**
   - Após adicionar todas as variáveis, clique em **"Save Changes"**
   - O Render fará automaticamente um novo deploy

### 🔍 Verificação

Após configurar as variáveis:

1. **Aguarde o Deploy**
   - O deploy pode levar alguns minutos
   - Acompanhe os logs na aba **"Logs"**

2. **Verifique os Logs**
   - Procure por mensagens de erro
   - O bot deve inicializar sem erros de variáveis faltando

3. **Teste o Bot**
   - Verifique se o bot está online no Discord
   - Teste alguns comandos básicos

### ⚠️ Notas Importantes

- **Segurança**: Os valores gerados são únicos e seguros
- **Backup**: Guarde estes valores em local seguro
- **Não Compartilhe**: Nunca exponha estes secrets publicamente
- **Database**: O `DATABASE_URL` será configurado automaticamente pelo Render quando o banco PostgreSQL for criado
- **Redis**: O `REDIS_URL` será configurado automaticamente pelo Render quando o Redis for criado

### 🐛 Troubleshooting

Se ainda houver erros após configurar:

1. **Verifique se todas as variáveis foram salvas**
2. **Confirme que não há espaços extras nos valores**
3. **Aguarde o deploy completo antes de testar**
4. **Verifique os logs para outros possíveis erros**

---

**Status**: ✅ Valores gerados e prontos para configuração
**Próximo Passo**: Configurar as variáveis no painel do Render