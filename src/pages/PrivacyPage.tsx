import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import { useApi } from "@/components/providers/ContentProvider"

export default function PrivacyPage() {
  const { data } = useApi()
  const privacy = data.privacy
  const updated = privacy?.attributes.updated
    ? new Date(privacy.attributes.updated).toLocaleDateString("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      })
    : null
  return (
    <>
      <Header />
      <main className="container max-w-2xl space-y-6 py-12">
        <h1 className="text-primary text-4xl font-semibold tracking-tight">
          {privacy?.attributes.title ?? "Privacy"}
        </h1>
        {privacy ? (
          <div
            className="[&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-2 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: privacy.html }}
          />
        ) : (
          <p>This page isn&rsquo;t available right now.</p>
        )}
        {updated && <p className="text-sm">Last updated {updated}.</p>}
      </main>
      <Footer />
    </>
  )
}
