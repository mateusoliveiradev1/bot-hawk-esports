# 🦅 Hawk Esports - Guia de Identidade Visual

**Versão**: 2.0  
**Data**: Janeiro 2025  
**Objetivo**: Modernizar e padronizar toda a experiência visual do bot Discord

## 🎨 Identidade Visual

### 🦅 Logo e Símbolo
- **Símbolo Principal**: 🦅 (Águia)
- **Cores Primárias**: Roxo (#9B59B6) e Azul (#3498DB)
- **Estilo**: Moderno, competitivo, profissional

### 🎯 Personalidade da Marca
- **Competitivo**: Focado em performance e rankings
- **Moderno**: Interface limpa e tecnológica
- **Acessível**: Fácil de usar para todos os níveis
- **Confiável**: Informações precisas e atualizadas

## 🌈 Sistema de Cores

### 🎨 Paleta Principal
```typescript
export const HAWK_COLORS = {
  // Cores da Marca
  HAWK_PRIMARY: 0x9B59B6,    // Roxo Hawk - Cor principal da marca
  HAWK_SECONDARY: 0x3498DB,  // Azul Hawk - Cor secundária
  HAWK_ACCENT: 0x00D4AA,     // Verde Hawk - Destaque e sucesso
  
  // Estados do Sistema
  SUCCESS: 0x2ECC71,         // Verde - Sucessos, confirmações
  ERROR: 0xE74C3C,           // Vermelho - Erros, falhas
  WARNING: 0xF39C12,         // Laranja - Avisos, atenção
  INFO: 0x3498DB,            // Azul - Informações gerais
  
  // Categorias Funcionais
  PUBG: 0x9B59B6,            // Roxo - Sistema PUBG
  MUSIC: 0x1DB954,           // Verde Spotify - Sistema de música
  ECONOMY: 0xF39C12,         // Dourado - Economia e moedas
  ADMIN: 0xE74C3C,           // Vermelho - Comandos administrativos
  PROFILE: 0x3498DB,         // Azul - Perfis e estatísticas
  BADGES: 0xF1C40F,          // Ouro - Badges e conquistas
  RANKING: 0x8E44AD,         // Roxo escuro - Rankings
  TICKETS: 0x2ECC71,         // Verde - Sistema de tickets
  GAMES: 0xFF6B35,           // Laranja - Mini-games
  
  // Raridades (Badges/Items)
  COMMON: 0x95A5A6,          // Cinza - Comum
  UNCOMMON: 0x2ECC71,        // Verde - Incomum
  RARE: 0x3498DB,            // Azul - Raro
  EPIC: 0x9B59B6,            // Roxo - Épico
  LEGENDARY: 0xF39C12,       // Dourado - Lendário
  MYTHIC: 0xE74C3C,          // Vermelho - Mítico
  
  // Estados de Usuário
  ONLINE: 0x2ECC71,          // Verde - Online
  IDLE: 0xF39C12,            // Laranja - Ausente
  DND: 0xE74C3C,             // Vermelho - Não perturbe
  OFFLINE: 0x95A5A6,         // Cinza - Offline
};
```

### 🎨 Esquemas de Cores
```typescript
export const COLOR_SCHEMES = {
  HAWK_BRAND: {
    primary: HAWK_COLORS.HAWK_PRIMARY,
    secondary: HAWK_COLORS.HAWK_SECONDARY,
    accent: HAWK_COLORS.HAWK_ACCENT,
  },
  GAMING: {
    primary: HAWK_COLORS.PUBG,
    secondary: HAWK_COLORS.GAMES,
    accent: HAWK_COLORS.EPIC,
  },
  SUCCESS: {
    primary: HAWK_COLORS.SUCCESS,
    secondary: HAWK_COLORS.HAWK_ACCENT,
    accent: HAWK_COLORS.UNCOMMON,
  },
  PREMIUM: {
    primary: HAWK_COLORS.LEGENDARY,
    secondary: HAWK_COLORS.MYTHIC,
    accent: HAWK_COLORS.EPIC,
  },
};
```

## 📝 Padrões de Embeds

### 🏗️ Estrutura Padrão
```typescript
// Embed Padrão Hawk Esports
const hawkEmbed = new EmbedBuilder()
  .setColor(HAWK_COLORS.HAWK_PRIMARY)
  .setTitle('🦅 Título do Embed')
  .setDescription('Descrição clara e concisa')
  .setThumbnail(user.displayAvatarURL({ size: 128 }))
  .setFooter({ 
    text: '🦅 Hawk Esports • Dominando os Battlegrounds', 
    iconURL: guild.iconURL() 
  })
  .setTimestamp();
```

### 📊 Templates por Categoria

#### 🎮 PUBG/Gaming
```typescript
static createPUBGEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.PUBG)
    .setTitle(`🎮 ${title}`)
    .setDescription(description)
    .setFooter({ text: '🦅 Hawk Esports PUBG System' })
    .setTimestamp();
}
```

#### 🏆 Ranking/Conquistas
```typescript
static createRankingEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.RANKING)
    .setTitle(`🏆 ${title}`)
    .setDescription(description)
    .setFooter({ text: '🦅 Hawk Esports Ranking System' })
    .setTimestamp();
}
```

#### 🏅 Badges/Conquistas
```typescript
static createBadgeEmbed(rarity: string, title: string, description?: string): EmbedBuilder {
  const rarityColors = {
    common: HAWK_COLORS.COMMON,
    uncommon: HAWK_COLORS.UNCOMMON,
    rare: HAWK_COLORS.RARE,
    epic: HAWK_COLORS.EPIC,
    legendary: HAWK_COLORS.LEGENDARY,
    mythic: HAWK_COLORS.MYTHIC,
  };
  
  return new EmbedBuilder()
    .setColor(rarityColors[rarity] || HAWK_COLORS.BADGES)
    .setTitle(`🏅 ${title}`)
    .setDescription(description)
    .setFooter({ text: '🦅 Hawk Esports Badge System' })
    .setTimestamp();
}
```

## 🔘 Componentes Interativos

### 🎮 Botões Padrão

#### Navegação
```typescript
// Botões de Navegação Hawk
static createHawkNavigation(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hawk_nav_first')
      .setEmoji('⏮️')
      .setLabel('Primeiro')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId('hawk_nav_prev')
      .setEmoji('◀️')
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId('hawk_nav_home')
      .setEmoji('🦅')
      .setLabel('Hawk Home')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('hawk_nav_next')
      .setEmoji('▶️')
      .setLabel('Próximo')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages),
    new ButtonBuilder()
      .setCustomId('hawk_nav_last')
      .setEmoji('⏭️')
      .setLabel('Último')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages)
  );
}
```

#### Ações Principais
```typescript
// Botões de Ação Hawk
static createHawkActions(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hawk_profile')
      .setEmoji('👤')
      .setLabel('Meu Perfil')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('hawk_ranking')
      .setEmoji('🏆')
      .setLabel('Rankings')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('hawk_badges')
      .setEmoji('🏅')
      .setLabel('Badges')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('hawk_stats')
      .setEmoji('📊')
      .setLabel('Estatísticas')
      .setStyle(ButtonStyle.Secondary)
  );
}
```

### 📋 Menus Suspensos

#### Menu Principal Hawk
```typescript
static createHawkMainMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('hawk_main_menu')
      .setPlaceholder('🦅 Escolha uma opção do Hawk Esports')
      .addOptions([
        {
          label: 'PUBG System',
          description: 'Rankings, estatísticas e dados PUBG',
          value: 'pubg',
          emoji: '🎮'
        },
        {
          label: 'Meu Perfil',
          description: 'Visualizar perfil e conquistas',
          value: 'profile',
          emoji: '👤'
        },
        {
          label: 'Rankings',
          description: 'Leaderboards e classificações',
          value: 'ranking',
          emoji: '🏆'
        },
        {
          label: 'Sistema de Badges',
          description: 'Conquistas e recompensas',
          value: 'badges',
          emoji: '🏅'
        },
        {
          label: 'Música',
          description: 'Player de música e playlists',
          value: 'music',
          emoji: '🎵'
        }
      ])
  );
}
```

## 📱 Responsividade

### 📏 Diretrizes de Layout

#### Embeds Responsivos
- **Títulos**: Máximo 256 caracteres
- **Descrições**: Máximo 4096 caracteres, quebrar em parágrafos
- **Fields**: Máximo 25 fields, 1024 caracteres por field
- **Footer**: Máximo 2048 caracteres

#### Adaptação Mobile
```typescript
// Função para adaptar conteúdo para mobile
static adaptForMobile(content: string, maxLength: number = 1000): string {
  if (content.length <= maxLength) return content;
  
  return content.substring(0, maxLength - 3) + '...';
}

// Embed adaptado para mobile
static createMobileEmbed(title: string, content: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.HAWK_PRIMARY)
    .setTitle(this.adaptForMobile(title, 200))
    .setDescription(this.adaptForMobile(content, 800))
    .setFooter({ text: '🦅 Hawk Esports' })
    .setTimestamp();
}
```

### 🔘 Botões Responsivos
```typescript
// Botões adaptados para telas menores
static createMobileButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hawk_quick_profile')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('hawk_quick_rank')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('hawk_quick_badges')
      .setEmoji('🏅')
      .setStyle(ButtonStyle.Secondary)
  );
}
```

## 🎭 Emojis e Ícones

### 🦅 Ícones da Marca
- **Hawk Principal**: 🦅
- **Hawk Alternativo**: 🪶
- **Competitivo**: ⚔️
- **Vitória**: 👑

### 🎮 Ícones por Categoria
```typescript
export const HAWK_EMOJIS = {
  // Sistema
  HAWK: '🦅',
  LOADING: '⏳',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  
  // PUBG
  PUBG: '🎮',
  KILL: '💀',
  WIN: '👑',
  DAMAGE: '💥',
  HEADSHOT: '🎯',
  RANK: '🏆',
  
  // Badges/Raridades
  COMMON: '⚪',
  UNCOMMON: '🟢',
  RARE: '🔵',
  EPIC: '🟣',
  LEGENDARY: '🟠',
  MYTHIC: '🔴',
  
  // Navegação
  FIRST: '⏮️',
  PREV: '◀️',
  NEXT: '▶️',
  LAST: '⏭️',
  HOME: '🏠',
  
  // Ações
  PROFILE: '👤',
  STATS: '📊',
  BADGES: '🏅',
  RANKING: '🏆',
  MUSIC: '🎵',
  GAMES: '🎯',
  ECONOMY: '💰',
  ADMIN: '🔧',
};
```

## 📊 Mensagens de Feedback

### ✅ Mensagens de Sucesso
```typescript
static createSuccessMessage(action: string, details?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.SUCCESS)
    .setTitle(`✅ ${action} realizada com sucesso!`)
    .setDescription(details || 'Operação concluída.')
    .setFooter({ text: '🦅 Hawk Esports System' })
    .setTimestamp();
}
```

### ❌ Mensagens de Erro
```typescript
static createErrorMessage(error: string, solution?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.ERROR)
    .setTitle(`❌ ${error}`)
    .setDescription(solution || 'Tente novamente ou contate o suporte.')
    .setFooter({ text: '🦅 Hawk Esports System' })
    .setTimestamp();
}
```

### ⚠️ Mensagens de Aviso
```typescript
static createWarningMessage(warning: string, action?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.WARNING)
    .setTitle(`⚠️ ${warning}`)
    .setDescription(action || 'Verifique as informações e tente novamente.')
    .setFooter({ text: '🦅 Hawk Esports System' })
    .setTimestamp();
}
```

## 🎨 Animações e Transições

### ⏳ Loading States
```typescript
// Embed de carregamento
static createLoadingEmbed(action: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HAWK_COLORS.INFO)
    .setTitle('⏳ Processando...')
    .setDescription(`${action} em andamento. Aguarde um momento.`)
    .setFooter({ text: '🦅 Hawk Esports System' })
    .setTimestamp();
}

// Sequência de loading com emojis
static getLoadingEmoji(step: number): string {
  const loadingEmojis = ['⏳', '⌛', '🔄', '⚡'];
  return loadingEmojis[step % loadingEmojis.length];
}
```

### 🔄 Estados Dinâmicos
```typescript
// Atualização dinâmica de embeds
static updateEmbedProgress(embed: EmbedBuilder, progress: number): EmbedBuilder {
  const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
  
  return embed.setDescription(`Progresso: ${progress}%\n\`${progressBar}\``);
}
```

## 🔧 Implementação

### 📁 Estrutura de Arquivos
```
src/
├── constants/
│   ├── hawk-colors.ts      # Cores da marca Hawk
│   ├── hawk-emojis.ts      # Emojis padronizados
│   └── hawk-themes.ts      # Temas e esquemas
├── utils/
│   ├── hawk-embed-builder.ts    # Builder de embeds Hawk
│   ├── hawk-component-factory.ts # Factory de componentes
│   └── hawk-responsive.ts       # Utilitários responsivos
└── types/
    └── hawk-ui.ts          # Tipos para UI
```

### 🚀 Migração Gradual
1. **Fase 1**: Implementar novos utilitários
2. **Fase 2**: Migrar comandos principais
3. **Fase 3**: Atualizar todos os comandos
4. **Fase 4**: Testes e otimizações

## 📏 Métricas de Qualidade

### 🎯 KPIs de UI/UX
- **Consistência Visual**: 100%
- **Tempo de Resposta**: < 2s
- **Taxa de Erro de Interação**: < 1%
- **Satisfação do Usuário**: > 90%

### 📊 Checklist de Qualidade
- [ ] Cores consistentes em todos os embeds
- [ ] Emojis padronizados em todos os botões
- [ ] Footers informativos em todos os embeds
- [ ] Responsividade testada em mobile
- [ ] Mensagens de erro claras e úteis
- [ ] Navegação intuitiva e consistente

---

**🦅 Hawk Esports - Dominando os Battlegrounds com Estilo**

*Este guia deve ser seguido por todos os desenvolvedores para manter a consistência visual e a qualidade da experiência do usuário.*