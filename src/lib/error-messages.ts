/**
 * Centralized error messages for consistent API responses.
 * Use these constants across all API routes to ensure uniform error communication.
 */

export const ERROR_MESSAGES = {
  // Authentication & Authorization
  AUTH: {
    UNAUTHORIZED: 'Não autorizado',
    FORBIDDEN: 'Acesso restrito',
    SESSION_EXPIRED: 'Sessão expirada. Faça login novamente.',
    INVALID_CREDENTIALS: 'Usuário ou senha inválidos',
  },

  // Database & Data Operations
  DATABASE: {
    CONNECTION_ERROR: 'Erro ao conectar ao banco de dados',
    QUERY_ERROR: 'Erro ao executar operação no banco de dados',
    NOT_FOUND: 'Registro não encontrado',
    DUPLICATE_ENTRY: 'Registro já existe',
  },

  // External API Integrations
  EXTERNAL_API: {
    AVEC_ERROR: 'Erro ao sincronizar com Avec',
    AVEC_TIMEOUT: 'Timeout na sincronização com Avec',
    WEBHOOK_INVALID: 'Webhook inválido ou assinatura incorreta',
  },

  // Validation Errors
  VALIDATION: {
    INVALID_INPUT: 'Dados inválidos',
    MISSING_REQUIRED_FIELD: 'Campo obrigatório faltando',
    INVALID_FORMAT: 'Formato inválido',
  },

  // Generic Errors
  GENERIC: {
    INTERNAL_ERROR: 'Erro interno do servidor',
    SERVICE_UNAVAILABLE: 'Serviço indisponível. Tente novamente mais tarde.',
    TIMEOUT: 'Requisição expirou. Tente novamente.',
    UNKNOWN_ERROR: 'Erro desconhecido. Contate o suporte.',
  },
} as const;

/**
 * Get error message by category and key
 * @example getErrorMessage('AUTH', 'UNAUTHORIZED')
 */
export function getErrorMessage(
  category: keyof typeof ERROR_MESSAGES,
  key: keyof (typeof ERROR_MESSAGES)[typeof category],
): string {
  return ERROR_MESSAGES[category][key] as string;
}
