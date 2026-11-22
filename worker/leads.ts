import type { Answers, Source } from "../src/lib/contact-form"

/** Takes answers that already passed `validateAll`. `status` is left to the table's default. */
export async function insertLead(
  db: D1Database,
  answers: Answers,
  from: Source | null,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO leads (id, created_at, intent, answers, name, email, company, from_section) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      answers.intent,
      JSON.stringify({
        details: answers.details,
        message: answers.message.trim(),
      }),
      answers.name.trim(),
      answers.email.trim(),
      answers.company.trim() || null,
      from,
    )
    .run()
}
