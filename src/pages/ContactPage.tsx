import ContactForm from "@/components/contact/ContactForm"
import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import { useApi } from "@/components/providers/ContentProvider"
import { prefillFrom } from "@/lib/contact-form"
import { useSearchParams } from "react-router"

export default function ContactPage() {
  const { data } = useApi()
  const [params] = useSearchParams()
  const email: string | undefined = data.contact.attributes.email || undefined
  const intro = data.intro.attributes
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="container flex flex-1 items-start py-8 md:items-center md:py-12">
        <div className="mx-auto grid w-full max-w-xl items-center gap-x-16 md:max-w-5xl md:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
          <div className="hidden min-w-0 flex-col gap-8 md:flex">
            <span className="relative self-start">
              <img
                decoding="async"
                width={intro.picture.width}
                height={intro.picture.height}
                alt={intro.picture.alt}
                src={intro.picture.src}
                className="block h-auto w-64 max-w-full rounded-b-full object-cover object-center"
              />
              <span className="bg-primary/10 absolute inset-0 rounded-b-full mix-blend-overlay" />
            </span>
            <div className="flex flex-col gap-3">
              <p className="font-display text-primary text-[clamp(2rem,2.5vw+1rem,3.25rem)] leading-none font-semibold tracking-[-0.035em] text-balance">
                {intro.heading1}
                <br />
                {intro.heading2}
              </p>
              <p className="text-foreground/70 text-[1.0625rem]">
                {intro.location}
              </p>
            </div>
          </div>
          <ContactForm email={email} prefill={prefillFrom(params)} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
