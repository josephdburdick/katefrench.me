type Address = { email: string; name: string }

export type EmailMessage = {
  from: Address
  to: string
  replyTo: Address
  subject: string
  text: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>
}

export function cloudflareEmail(binding: SendEmail): EmailSender {
  return {
    async send(message) {
      await binding.send(message)
    },
  }
}

export function localEmail(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    sent,
    async send(message) {
      sent.push(message)
      console.log(`local email to ${message.to}: ${message.subject}`)
    },
  }
}
