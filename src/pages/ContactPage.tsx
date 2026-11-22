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
  return (
    <>
      <Header />
      <main className="container py-8 md:py-12">
        <div className="mx-auto w-full max-w-xl">
          <ContactForm email={email} prefill={prefillFrom(params)} />
        </div>
      </main>
      <Footer />
    </>
  )
}
