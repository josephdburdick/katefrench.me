import ContactForm from "@/components/contact/ContactForm"
import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import { useApi } from "@/components/providers/ContentProvider"

export default function ContactPage() {
  const { data } = useApi()
  const email: string | undefined = data.contact.attributes.email || undefined
  return (
    <>
      <Header />
      <main className="container py-8 md:py-12">
        <div className="mx-auto w-full max-w-xl">
          <ContactForm email={email} />
        </div>
      </main>
      <Footer />
    </>
  )
}
