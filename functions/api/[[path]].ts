import { handleOpenAiProxy, type ProxyEnv } from '../../src/server/openaiProxy'

// Cloudflare Pages Function: catches /api/* and delegates to the pure handler.
export const onRequest = (context: {
  request: Request
  env: ProxyEnv
}): Promise<Response> => handleOpenAiProxy(context.request, context.env)
