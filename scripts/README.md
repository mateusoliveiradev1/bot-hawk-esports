# Scripts Directory

Esta pasta contém scripts utilitários e de configuração do projeto Hawk Esports Bot.

## Estrutura

### `/setup`
Contém scripts de configuração e inicialização:
- `setup-complete.js` / `setup-complete.ps1` - Scripts de configuração completa
- `setup-spotify.js` / `setup-spotify.ps1` - Scripts específicos para configuração do Spotify
- `healthcheck.js` - Script de verificação de saúde do sistema

### `/tests`
Contém scripts de teste para funcionalidades específicas:
- `test-music.js` - Testes para funcionalidades de música
- `test-pubg-api.js` - Testes para integração com API do PUBG
- `test-youtubedl.js` - Testes para YouTube DL
- `test-yt-dlp.js` - Testes para YT-DLP

## Uso

Para executar qualquer script, navegue até a pasta apropriada e execute:

```bash
# Para scripts JavaScript
node script-name.js

# Para scripts PowerShell
.\script-name.ps1
```

## Notas

- Todos os scripts foram movidos da raiz do projeto para melhor organização
- Os scripts de teste são independentes e podem ser executados para validar funcionalidades específicas
- Os scripts de setup devem ser executados apenas durante a configuração inicial do projeto