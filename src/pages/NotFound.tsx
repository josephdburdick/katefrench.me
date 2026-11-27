import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import SiteLink from "@/components/global/SiteLink"

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="container space-y-4 py-16">
        <h2 className="text-primary text-2xl font-light">Page not found</h2>
        <p>
          <SiteLink className="text-primary underline" href="/">
            Go back to the home page
          </SiteLink>
        </p>
      </main>
      <Footer />
    </>
  )
}
