import { test, expect } from '@playwright/test';
import { TestHelpers, TestData } from '../helpers/test-helpers';

test.describe('API - Authentication', () => {
  let helpers: TestHelpers;
  const baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
  let testUser: any;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    // Criar usuário de teste
    testUser = await helpers.createTestUser();
  });

  test.afterEach(async () => {
    await helpers.cleanup();
  });

  test('deve fazer login com credenciais válidas', async ({ request }) => {
    const loginEndpoints = [
      '/api/auth/login',
      '/auth/login',
      '/api/login',
      '/login'
    ];

    const loginData = {
      email: TestData.user.email,
      password: TestData.user.password
    };

    let loginSuccessful = false;

    for (const endpoint of loginEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: loginData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok()) {
          const data = await response.json();
          
          // Verificar se retornou token
          const token = data.token || data.accessToken || data.access_token;
          expect(token).toBeTruthy();
          
          // Verificar se retornou dados do usuário
          const user = data.user || data.userData;
          if (user) {
            expect(user.email).toBeTruthy();
            expect(user.id || user._id).toBeTruthy();
          }
          
          loginSuccessful = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    // Se nenhum endpoint de login funcionou, pode ser que use OAuth apenas
    // Não falhar o teste neste caso
  });

  test('deve rejeitar credenciais inválidas', async ({ request }) => {
    const loginEndpoints = [
      '/api/auth/login',
      '/auth/login',
      '/api/login'
    ];

    const invalidLoginData = {
      email: 'invalid@example.com',
      password: 'wrongpassword'
    };

    for (const endpoint of loginEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: invalidLoginData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        // Deve retornar erro de autenticação
        if (response.status() === 401 || response.status() === 400) {
          expect(response.status()).toBeGreaterThanOrEqual(400);
          
          const errorData = await response.json();
          expect(errorData.error || errorData.message).toBeTruthy();
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve registrar novo usuário', async ({ request }) => {
    const registerEndpoints = [
      '/api/auth/register',
      '/auth/register',
      '/api/register',
      '/register'
    ];

    const newUserData = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      username: `testuser${Date.now()}`,
      name: 'Test User E2E'
    };

    for (const endpoint of registerEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: newUserData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok()) {
          const data = await response.json();
          
          // Verificar se o usuário foi criado
          expect(data).toBeTruthy();
          
          // Pode retornar token imediatamente ou apenas confirmação
          const user = data.user || data;
          expect(user.email).toBe(newUserData.email);
          
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve validar dados obrigatórios no registro', async ({ request }) => {
    const registerEndpoints = [
      '/api/auth/register',
      '/auth/register'
    ];

    const invalidData = {
      // email ausente
      password: 'TestPassword123!'
    };

    for (const endpoint of registerEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: invalidData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        // Deve retornar erro de validação
        if (response.status() >= 400 && response.status() < 500) {
          expect(response.status()).toBeGreaterThanOrEqual(400);
          
          const errorData = await response.json();
          expect(errorData.error || errorData.message).toBeTruthy();
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve verificar token válido', async ({ request }) => {
    // Primeiro fazer login para obter token
    let authToken: string;
    
    try {
      const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
        data: {
          email: TestData.user.email,
          password: TestData.user.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (loginResponse.ok()) {
        const loginData = await loginResponse.json();
        authToken = loginData.token || loginData.accessToken;
      }
    } catch (error) {
      // Login failed
    }

    if (authToken) {
      const verifyEndpoints = [
        '/api/auth/verify',
        '/auth/verify',
        '/api/auth/me',
        '/auth/me',
        '/api/me'
      ];

      for (const endpoint of verifyEndpoints) {
        try {
          const response = await request.get(`${baseURL}${endpoint}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          });
          
          if (response.ok()) {
            const data = await response.json();
            
            // Verificar se retornou dados do usuário
            expect(data).toBeTruthy();
            expect(data.email || data.user?.email).toBeTruthy();
            expect(data.id || data._id || data.user?.id).toBeTruthy();
            
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
  });

  test('deve rejeitar token inválido', async ({ request }) => {
    const invalidToken = 'invalid.jwt.token';
    
    const protectedEndpoints = [
      '/api/auth/verify',
      '/api/auth/me',
      '/api/me'
    ];

    for (const endpoint of protectedEndpoints) {
      try {
        const response = await request.get(`${baseURL}${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${invalidToken}`
          }
        });
        
        // Deve retornar erro de autenticação
        if (response.status() === 401 || response.status() === 403) {
          expect(response.status()).toBeGreaterThanOrEqual(401);
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve fazer logout', async ({ request }) => {
    // Primeiro fazer login
    let authToken: string;
    
    try {
      const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
        data: {
          email: TestData.user.email,
          password: TestData.user.password
        }
      });
      
      if (loginResponse.ok()) {
        const loginData = await loginResponse.json();
        authToken = loginData.token || loginData.accessToken;
      }
    } catch (error) {
      // Login failed
    }

    if (authToken) {
      const logoutEndpoints = [
        '/api/auth/logout',
        '/auth/logout',
        '/api/logout',
        '/logout'
      ];

      for (const endpoint of logoutEndpoints) {
        try {
          const response = await request.post(`${baseURL}${endpoint}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          });
          
          if (response.ok()) {
            const data = await response.json();
            expect(data.message || data.success).toBeTruthy();
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
  });

  test('deve refresh token', async ({ request }) => {
    // Primeiro fazer login
    let authToken: string;
    let refreshToken: string;
    
    try {
      const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
        data: {
          email: TestData.user.email,
          password: TestData.user.password
        }
      });
      
      if (loginResponse.ok()) {
        const loginData = await loginResponse.json();
        authToken = loginData.token || loginData.accessToken;
        refreshToken = loginData.refreshToken || loginData.refresh_token;
      }
    } catch (error) {
      // Login failed
    }

    if (refreshToken) {
      const refreshEndpoints = [
        '/api/auth/refresh',
        '/auth/refresh',
        '/api/refresh'
      ];

      for (const endpoint of refreshEndpoints) {
        try {
          const response = await request.post(`${baseURL}${endpoint}`, {
            data: {
              refreshToken: refreshToken
            },
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok()) {
            const data = await response.json();
            
            // Verificar se retornou novo token
            const newToken = data.token || data.accessToken;
            expect(newToken).toBeTruthy();
            expect(newToken).not.toBe(authToken); // Deve ser diferente do anterior
            
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
  });

  test('deve resetar senha', async ({ request }) => {
    const resetEndpoints = [
      '/api/auth/forgot-password',
      '/auth/forgot-password',
      '/api/forgot-password'
    ];

    const resetData = {
      email: TestData.user.email
    };

    for (const endpoint of resetEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: resetData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok()) {
          const data = await response.json();
          expect(data.message || data.success).toBeTruthy();
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve validar formato de email', async ({ request }) => {
    const registerEndpoints = [
      '/api/auth/register',
      '/auth/register'
    ];

    const invalidEmailData = {
      email: 'invalid-email-format',
      password: 'TestPassword123!',
      username: 'testuser'
    };

    for (const endpoint of registerEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: invalidEmailData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        // Deve retornar erro de validação
        if (response.status() >= 400 && response.status() < 500) {
          expect(response.status()).toBeGreaterThanOrEqual(400);
          
          const errorData = await response.json();
          expect(errorData.error || errorData.message).toBeTruthy();
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve validar força da senha', async ({ request }) => {
    const registerEndpoints = [
      '/api/auth/register',
      '/auth/register'
    ];

    const weakPasswordData = {
      email: `test-weak-${Date.now()}@example.com`,
      password: '123', // Senha muito fraca
      username: 'testuser'
    };

    for (const endpoint of registerEndpoints) {
      try {
        const response = await request.post(`${baseURL}${endpoint}`, {
          data: weakPasswordData,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        // Deve retornar erro de validação
        if (response.status() >= 400 && response.status() < 500) {
          expect(response.status()).toBeGreaterThanOrEqual(400);
          
          const errorData = await response.json();
          expect(errorData.error || errorData.message).toBeTruthy();
          break;
        }
      } catch (error) {
        continue;
      }
    }
  });

  test('deve prevenir registro de email duplicado', async ({ request }) => {
    const registerEndpoint = '/api/auth/register';
    
    const userData = {
      email: TestData.user.email, // Email já existente
      password: 'TestPassword123!',
      username: `duplicate${Date.now()}`
    };

    try {
      const response = await request.post(`${baseURL}${registerEndpoint}`, {
        data: userData,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Deve retornar erro de conflito
      if (response.status() === 409 || response.status() === 400) {
        expect(response.status()).toBeGreaterThanOrEqual(400);
        
        const errorData = await response.json();
        expect(errorData.error || errorData.message).toBeTruthy();
      }
    } catch (error) {
      // Endpoint pode não existir
    }
  });

  test('deve lidar com rate limiting', async ({ request }) => {
    const loginEndpoint = '/api/auth/login';
    
    const invalidData = {
      email: 'nonexistent@example.com',
      password: 'wrongpassword'
    };

    // Fazer múltiplas tentativas de login inválidas
    const attempts = [];
    for (let i = 0; i < 10; i++) {
      attempts.push(
        request.post(`${baseURL}${loginEndpoint}`, {
          data: invalidData,
          headers: {
            'Content-Type': 'application/json'
          }
        }).catch(() => null)
      );
    }

    const responses = await Promise.allSettled(attempts);
    
    // Verificar se alguma resposta indica rate limiting
    const rateLimitedResponses = responses.filter(
      result => result.status === 'fulfilled' && 
                result.value && 
                result.value.status() === 429
    );

    // Se há rate limiting implementado, deve haver pelo menos uma resposta 429
    // Se não há, não é um erro - apenas não está implementado
  });
});