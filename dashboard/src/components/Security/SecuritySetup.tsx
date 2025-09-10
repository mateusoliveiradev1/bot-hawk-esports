import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
// Using basic HTML elements instead of missing UI components
import { Shield, Key, QrCode, Copy, Check } from 'lucide-react';

interface CaptchaData {
  id: string;
  svg: string;
}

interface TwoFASetup {
  qrCode: string;
  backupCodes: string[];
}

const SecuritySetup: React.FC = () => {
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState<TwoFASetup | null>(null);
  const [twoFAToken, setTwoFAToken] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    generateCaptcha();
    checkTwoFAStatus();
  }, []);

  const generateCaptcha = async () => {
    try {
      const response = await fetch('/api/auth/captcha');
      const data = await response.json();

      if (data.success) {
        setCaptcha(data.data);
        setCaptchaVerified(false);
        setCaptchaAnswer('');
      }
    } catch (error) {
      console.error('Erro ao gerar CAPTCHA:', error);
      setError('Erro ao gerar CAPTCHA');
    }
  };

  const verifyCaptcha = async () => {
    if (!captcha || !captchaAnswer) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/captcha/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          captchaId: captcha.id,
          answer: captchaAnswer,
        }),
      });

      const data = await response.json();

      if (data.success && data.data.valid) {
        setCaptchaVerified(true);
        setSuccess('CAPTCHA verificado com sucesso!');
        setError('');
      } else {
        setError('CAPTCHA incorreto. Tente novamente.');
        generateCaptcha();
      }
    } catch (error) {
      console.error('Erro ao verificar CAPTCHA:', error);
      setError('Erro ao verificar CAPTCHA');
    } finally {
      setLoading(false);
    }
  };

  const checkTwoFAStatus = async () => {
    // Check if user has 2FA enabled (this would need to be added to user data)
    setTwoFAEnabled(false); // Mock: 2FA not enabled by default
  };

  const setup2FA = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        setTwoFASetup(data.data);
        setSuccess('2FA configurado! Escaneie o QR Code com seu app autenticador.');
        setError('');
      } else {
        setError(data.error || 'Erro ao configurar 2FA');
      }
    } catch (error) {
      console.error('Erro ao configurar 2FA:', error);
      setError('Erro ao configurar 2FA');
    } finally {
      setLoading(false);
    }
  };

  const enable2FA = async () => {
    if (!twoFAToken) {
      setError('Digite o código do seu app autenticador');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: twoFAToken }),
      });

      const data = await response.json();

      if (data.success) {
        setTwoFAEnabled(true);
        setSuccess('2FA ativado com sucesso!');
        setError('');
        setTwoFASetup(null);
        setTwoFAToken('');
      } else {
        setError(data.error || 'Código inválido');
      }
    } catch (error) {
      console.error('Erro ao ativar 2FA:', error);
      setError('Erro ao ativar 2FA');
    } finally {
      setLoading(false);
    }
  };

  const disable2FA = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        setTwoFAEnabled(false);
        setSuccess('2FA desativado com sucesso!');
        setError('');
      } else {
        setError(data.error || 'Erro ao desativar 2FA');
      }
    } catch (error) {
      console.error('Erro ao desativar 2FA:', error);
      setError('Erro ao desativar 2FA');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    if (twoFASetup?.backupCodes) {
      navigator.clipboard.writeText(twoFASetup.backupCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  return (
    <div className='space-y-6'>
      {/* CAPTCHA Verification */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Shield className='h-5 w-5' />
            Verificação Anti-Bot
          </CardTitle>
          <CardDescription>
            Complete a verificação CAPTCHA para provar que você é humano
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {captcha && (
            <div className='flex flex-col items-center space-y-4'>
              <div
                className='border rounded-lg p-4 bg-white'
                dangerouslySetInnerHTML={{ __html: captcha.svg }}
              />
              <div className='flex gap-2 w-full max-w-sm'>
                <input
                  type='text'
                  placeholder='Digite o código do CAPTCHA'
                  value={captchaAnswer}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCaptchaAnswer(e.target.value)
                  }
                  disabled={captchaVerified}
                  className='flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
                <Button
                  onClick={verifyCaptcha}
                  disabled={loading || captchaVerified || !captchaAnswer}
                >
                  {captchaVerified ? <Check className='h-4 w-4' /> : 'Verificar'}
                </Button>
              </div>
              {!captchaVerified && (
                <Button variant='outline' onClick={generateCaptcha}>
                  Gerar Novo CAPTCHA
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Key className='h-5 w-5' />
            Autenticação de Dois Fatores (2FA)
          </CardTitle>
          <CardDescription>Adicione uma camada extra de segurança à sua conta</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!twoFAEnabled && !twoFASetup && (
            <Button onClick={setup2FA} disabled={loading || !captchaVerified}>
              Configurar 2FA
            </Button>
          )}

          {twoFASetup && (
            <div className='space-y-4'>
              <div className='text-center'>
                <QrCode className='h-8 w-8 mx-auto mb-2' />
                <p className='text-sm text-muted-foreground mb-4'>
                  Escaneie este QR Code com seu app autenticador
                </p>
                <img
                  src={twoFASetup.qrCode}
                  alt='QR Code para 2FA'
                  className='mx-auto border rounded-lg'
                />
              </div>

              <div className='space-y-2'>
                <label className='block text-sm font-medium mb-2'>Códigos de Backup</label>
                <div className='bg-muted p-3 rounded-lg'>
                  <div className='flex justify-between items-center mb-2'>
                    <span className='text-sm font-medium'>
                      Salve estes códigos em local seguro:
                    </span>
                    <Button variant='outline' size='sm' onClick={copyBackupCodes}>
                      {copiedCodes ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
                    </Button>
                  </div>
                  <div className='grid grid-cols-2 gap-1 text-sm font-mono'>
                    {twoFASetup.backupCodes.map((code, index) => (
                      <div key={index}>{code}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className='space-y-2'>
                <label className='block text-sm font-medium mb-2'>Código do App Autenticador</label>
                <div className='flex gap-2'>
                  <input
                    type='text'
                    placeholder='000000'
                    value={twoFAToken}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setTwoFAToken(e.target.value)
                    }
                    maxLength={6}
                    className='flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  />
                  <Button onClick={enable2FA} disabled={loading || !twoFAToken}>
                    Ativar 2FA
                  </Button>
                </div>
              </div>
            </div>
          )}

          {twoFAEnabled && (
            <div className='space-y-4'>
              <div className='flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg'>
                <Shield className='h-4 w-4 text-green-600' />
                <span className='text-green-800'>
                  2FA está ativo em sua conta. Sua conta está protegida!
                </span>
              </div>
              <Button variant='destructive' onClick={disable2FA} disabled={loading}>
                Desativar 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Messages */}
      {error && (
        <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
          <span className='text-red-800'>{error}</span>
        </div>
      )}

      {success && (
        <div className='p-4 bg-green-50 border border-green-200 rounded-lg'>
          <span className='text-green-800'>{success}</span>
        </div>
      )}
    </div>
  );
};

export default SecuritySetup;
