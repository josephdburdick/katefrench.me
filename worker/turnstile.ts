export interface TurnstileVerifier {
  verify(token: string, ip?: string): Promise<boolean>
}

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** The token Cloudflare's published test site keys hand the page. */
export const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

export function siteverify(
  secret: string,
  fetchImpl: typeof fetch = fetch,
): TurnstileVerifier {
  return {
    async verify(token, ip) {
      const form = new FormData()
      form.append("secret", secret)
      form.append("response", token)
      if (ip) form.append("remoteip", ip)
      try {
        const response = await fetchImpl(SITEVERIFY, {
          method: "POST",
          body: form,
        })
        const result = (await response.json()) as { success?: unknown }
        return result.success === true
      } catch {
        return false
      }
    },
  }
}

export function localTurnstile(): TurnstileVerifier {
  return {
    async verify(token) {
      return token === DUMMY_TOKEN
    },
  }
}
