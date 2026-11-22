import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import Closing from "@/sections/Closing"
import FirstCall from "@/sections/FirstCall"
import Marketing from "@/sections/Marketing"
import NewYork from "@/sections/NewYork"
import Numbers from "@/sections/Numbers"
import Opening from "@/sections/Opening"
import Venues from "@/sections/Venues"

export default function Home() {
  return (
    <>
      <Header />
      <main className="container flex flex-col gap-[clamp(3rem,7vw,6rem)] pb-[clamp(2rem,5vw,4rem)]">
        <Opening />
        <Numbers />
        <NewYork />
        <FirstCall />
        <Marketing />
        <Venues />
        <Closing />
      </main>
      <Footer />
    </>
  )
}
