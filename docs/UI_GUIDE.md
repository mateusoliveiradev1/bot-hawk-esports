# 🎨 Guia de Interface do Usuário - Hawk Esports Bot

## 📋 Índice
- [Padrões de Cores](#padrões-de-cores)
- [Estrutura de Embeds](#estrutura-de-embeds)
- [Componentes de Interação](#componentes-de-interação)
- [Emojis e Ícones](#emojis-e-ícones)
- [Boas Práticas](#boas-práticas)
- [Exemplos de Implementação](#exemplos-de-implementação)

## 🎨 Padrões de Cores

### Cores Principais
```typescript
const COLORS = {
  ERROR: 0xFF0000,      // Vermelho - Erros e falhas
  SUCCESS: 0x00FF00,    // Verde - Sucessos e confirmações
  WARNING: 0xFFFF00,    // Amarelo - Avisos e atenção
  INFO: 0x0099FF,       // Azul - Informações gerais
  PRIMARY: 0x5865F2,    // Roxo Discord - Ações principais
};
```

### Cores Específicas por Contexto
- **PUBG/Gaming**: `0x9B59B6` (Roxo)
- **Música**: `0x00AE86` (Verde-azulado)
- **Economia**: `0xFF6B35` (Laranja)
- **Administração**: `0x3498DB` (Azul)
- **Perfil**: `0x0099FF` (Azul claro)

## 📝 Estrutura de Embeds

### Template Padrão
```typescript
const embed = new EmbedBuilder()
  .setTitle('🎯 Título com Emoji')
  .setDescription('Descrição clara e concisa')
  .setColor(COR_APROPRIADA)
  .setThumbnail(urlImagem) // Opcional
  .addFields(
    { name: '📊 Campo 1', value: 'Valor', inline: true },
    { name: '⚡ Campo 2', value: 'Valor', inline: true }
  )
  .setFooter({ text: 'Informação adicional' })
  .setTimestamp();
```

### Hierarquia de Títulos
1. **Título Principal**: Sempre com emoji relevante
2. **Campos**: Organizados logicamente, máximo 25 campos
3. **Footer**: Informações secundárias ou instruções
4. **Timestamp**: Para contexto temporal

## 🔘 Componentes de Interação

### Botões
```typescript
const button = new ButtonBuilder()
  .setCustomId('action_id')
  .setLabel('📊 Ação')
  .setStyle(ButtonStyle.Primary)
  .setEmoji('📊');
```

#### Estilos de Botão por Contexto
- **Primary** (Azul): Ações principais
- **Secondary** (Cinza): Ações secundárias
- **Success** (Verde): Confirmações
- **Danger** (Vermelho): Ações destrutivas
- **Link**: Links externos

### Menus de Seleção
```typescript
const selectMenu = new StringSelectMenuBuilder()
  .setCustomId('menu_id')
  .setPlaceholder('🎯 Selecione uma opção...')
  .addOptions(
    {
      label: 'Opção 1',
      description: 'Descrição da opção',
      value: 'option1',
      emoji: '🎮'
    }
  );
```

## 😀 Emojis e Ícones

### Categorias de Emojis
- **Ações**: ⚡ 🔄 ✅ ❌ ⚠️
- **Navegação**: ◀️ ▶️ 🔼 🔽 🏠
- **Gaming**: 🎮 🏆 🎯 🎲 🕹️
- **Música**: 🎵 🎶 ⏯️ ⏹️ 🔊
- **Usuário**: 👤 👥 🏅 ⭐ 💰
- **Sistema**: 🔧 ⚙️ 📊 📈 🔍
- **Comunicação**: 💬 📢 📝 📋 📌

### Consistência de Emojis
- **Erro**: ❌ sempre para erros
- **Sucesso**: ✅ sempre para confirmações
- **Aviso**: ⚠️ sempre para alertas
- **Info**: ℹ️ sempre para informações
- **Loading**: ⏳ para processos em andamento

## ✨ Boas Práticas

### 1. Consistência Visual
- Use sempre a mesma cor para o mesmo tipo de ação
- Mantenha padrão de emojis em contextos similares
- Estruture embeds de forma consistente

### 2. Usabilidade
- Máximo de 5 botões por linha
- Máximo de 25 opções em menus de seleção
- Textos claros e objetivos
- Feedback visual imediato para ações

### 3. Acessibilidade
- Cores não devem ser a única forma de transmitir informação
- Textos alternativos para emojis importantes
- Contraste adequado entre texto e fundo

### 4. Performance
- Reutilize componentes quando possível
- Use ephemeral para respostas pessoais
- Implemente timeouts em collectors

## 🛠️ Exemplos de Implementação

### Embed de Erro Padrão
```typescript
const errorEmbed = EmbedUtils.createErrorEmbed(
  'Operação Falhou',
  'Descrição detalhada do erro ocorrido.'
);
```

### Embed de Perfil
```typescript
const profileEmbed = new EmbedBuilder()
  .setTitle(`👤 Perfil de ${user.displayName}`)
  .setThumbnail(user.displayAvatarURL({ size: 256 }))
  .setColor('#0099FF')
  .addFields(
    { name: '⭐ XP', value: userData.xp.toString(), inline: true },
    { name: '💰 Moedas', value: userData.coins.toString(), inline: true },
    { name: '🏅 Badges', value: userBadges.length.toString(), inline: true }
  )
  .setTimestamp();
```

### Sistema de Navegação
```typescript
const navigationRow = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('prev_page')
      .setLabel('◀️ Anterior')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('home')
      .setLabel('🏠 Início')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('next_page')
      .setLabel('Próximo ▶️')
      .setStyle(ButtonStyle.Secondary)
  );
```

### Menu de Categorias
```typescript
const categoryMenu = new StringSelectMenuBuilder()
  .setCustomId('category_select')
  .setPlaceholder('🎯 Escolha uma categoria...')
  .addOptions(
    {
      label: 'PUBG',
      description: 'Comandos relacionados ao PUBG',
      value: 'pubg',
      emoji: '🎮'
    },
    {
      label: 'Música',
      description: 'Sistema de música e playlists',
      value: 'music',
      emoji: '🎵'
    }
  );
```

## 📊 Métricas de Qualidade

### Checklist de Qualidade UI
- [ ] Cores consistentes por contexto
- [ ] Emojis apropriados e consistentes
- [ ] Textos claros e objetivos
- [ ] Componentes organizados logicamente
- [ ] Feedback visual para todas as ações
- [ ] Tratamento de erros padronizado
- [ ] Timeouts implementados em collectors
- [ ] Respostas ephemeral quando apropriado

### Padrões de Nomenclatura
- **CustomIds**: `categoria_acao` (ex: `profile_badges`, `music_play`)
- **Labels**: Sempre com emoji + texto descritivo
- **Placeholders**: Instruções claras com emoji

---

**Última atualização**: Janeiro 2025
**Versão**: 1.0
**Responsável**: Sistema de Auditoria UI/UX