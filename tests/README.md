# Testes Automatizados - Hawk Esports Bot

Este diretório contém a suíte completa de testes automatizados para o bot Hawk Esports, incluindo testes unitários, de integração e utilitários.

## 📁 Estrutura dos Testes

```
tests/
├── README.md                     # Este arquivo
├── setup.ts                      # Configuração global dos testes
├── global-setup.ts              # Setup executado antes de todos os testes
├── global-teardown.ts           # Cleanup executado após todos os testes
├── services/                    # Testes dos serviços principais
│   ├── ticket.service.test.ts   # Testes do sistema de tickets
│   ├── xp.service.test.ts       # Testes do sistema de XP
│   ├── rank.service.test.ts     # Testes do sistema de ranking
│   └── pubg.service.test.ts     # Testes da integração PUBG API
├── utils/                       # Testes dos utilitários
│   ├── validation.util.test.ts  # Testes de validação
│   └── format.util.test.ts      # Testes de formatação
└── integration/                 # Testes de integração
    └── ticket-flow.test.ts      # Teste do fluxo completo de tickets
```

## 🚀 Como Executar os Testes

### Executar todos os testes
```bash
npm test
```

### Executar testes em modo watch (desenvolvimento)
```bash
npm run test:watch
```

### Executar testes com relatório de cobertura
```bash
npm run test:coverage
```

### Executar testes específicos
```bash
# Executar apenas testes de serviços
npm test -- services/

# Executar apenas um arquivo específico
npm test -- ticket.service.test.ts

# Executar testes que correspondem a um padrão
npm test -- --testNamePattern="deve criar ticket"
```

## 🧪 Tipos de Testes

### Testes Unitários
Testam componentes individuais isoladamente:
- **Services**: Lógica de negócio dos serviços
- **Utils**: Funções utilitárias (validação, formatação)
- **Mocks**: Todas as dependências externas são mockadas

### Testes de Integração
Testam fluxos completos entre múltiplos componentes:
- **Ticket Flow**: Criação → Processamento → Fechamento de tickets
- **XP System**: Ganho de XP → Level up → Recompensas
- **PUBG Integration**: API calls → Data processing → Database updates

## 🔧 Configuração

### Mocks Globais
O arquivo `setup.ts` configura mocks para:
- **Discord.js**: Client, EmbedBuilder, ButtonBuilder, etc.
- **Prisma Client**: Operações de banco de dados
- **Variáveis de ambiente**: Tokens e chaves de API

### Variáveis de Ambiente para Testes
```env
NODE_ENV=test
DISCORD_TOKEN=test-token
DATABASE_URL=test-database-url
PUBG_API_KEY=test-pubg-key
LOG_LEVEL=error
```

## 📊 Cobertura de Código

Os testes cobrem:
- ✅ **Services**: 85%+ de cobertura
- ✅ **Utils**: 90%+ de cobertura
- ✅ **Integration**: Fluxos principais
- ❌ **Excluded**: Arquivos de configuração, tipos, deploy

### Relatório de Cobertura
Após executar `npm run test:coverage`, o relatório estará disponível em:
- **Terminal**: Resumo da cobertura
- **coverage/lcov-report/index.html**: Relatório detalhado em HTML

## 🎯 Boas Práticas

### Estrutura dos Testes
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  
  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceName(mockDependencies);
  });
  
  describe('methodName', () => {
    it('deve fazer algo específico', async () => {
      // Arrange
      const input = { /* dados de teste */ };
      mockDependency.method = jest.fn().mockResolvedValue(expectedResult);
      
      // Act
      const result = await service.methodName(input);
      
      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockDependency.method).toHaveBeenCalledWith(expectedParams);
    });
  });
});
```

### Nomenclatura
- **Arquivos**: `*.test.ts` ou `*.spec.ts`
- **Describes**: Nome da classe/módulo sendo testado
- **Its**: Comportamento esperado em português claro

### Mocks
- Use `jest.fn()` para funções simples
- Use `jest.mock()` para módulos completos
- Limpe mocks com `jest.clearAllMocks()` no `beforeEach`

## 🐛 Debugging

### Executar testes com debug
```bash
# Node.js debug
node --inspect-brk node_modules/.bin/jest --runInBand

# VS Code debug
# Use a configuração de debug do VS Code
```

### Logs durante testes
```typescript
// Habilitar logs específicos
console.log = jest.fn(); // Mock global
console.log.mockRestore(); // Restaurar para debug
```

## 📈 Métricas de Qualidade

### Critérios de Aprovação
- ✅ Todos os testes passando
- ✅ Cobertura mínima de 80%
- ✅ Sem vazamentos de memória
- ✅ Tempo de execução < 30s

### Performance
- **Timeout**: 30 segundos por teste
- **Paralelização**: Habilitada por padrão
- **Cache**: Jest cache habilitado

## 🔄 CI/CD Integration

Os testes são executados automaticamente:
- **Pre-commit**: Testes dos arquivos modificados
- **Pull Request**: Suíte completa de testes
- **Deploy**: Testes + cobertura obrigatórios

### GitHub Actions
```yaml
- name: Run Tests
  run: |
    npm test
    npm run test:coverage
```

## 📝 Contribuindo

### Adicionando Novos Testes
1. Crie o arquivo na estrutura apropriada
2. Siga as convenções de nomenclatura
3. Inclua testes para casos de sucesso e erro
4. Mantenha cobertura acima de 80%
5. Execute `npm test` antes do commit

### Atualizando Testes Existentes
1. Mantenha compatibilidade com testes existentes
2. Atualize mocks se necessário
3. Verifique se não quebrou outros testes
4. Documente mudanças significativas

## 🆘 Troubleshooting

### Problemas Comuns

**Erro: "Cannot find module"**
```bash
npm install
npm run build
```

**Timeout nos testes**
```typescript
// Aumentar timeout específico
it('teste longo', async () => {
  // ...
}, 60000); // 60 segundos
```

**Mocks não funcionando**
```typescript
// Verificar ordem dos imports
import { jest } from '@jest/globals';
// Mocks devem vir antes dos imports do código
```

**Problemas de memória**
```bash
# Executar com mais memória
node --max-old-space-size=4096 node_modules/.bin/jest
```

---

## 📞 Suporte

Para dúvidas sobre os testes:
1. Consulte a documentação do Jest
2. Verifique exemplos nos testes existentes
3. Abra uma issue no repositório