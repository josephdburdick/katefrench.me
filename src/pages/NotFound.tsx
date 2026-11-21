import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"

export default function NotFound() {
  return (
    <>
      <Header />
      <div className="container space-y-4 py-16">
        <h2 className="text-primary text-2xl font-light">Page not found</h2>
        <p>
          <a className="text-primary underline" href="/">
            Go back to the home page
          </a>
        </p>
      </div>
      <Footer />
    </>
  )
}
