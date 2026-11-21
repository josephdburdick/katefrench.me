import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import About from "@/sections/About"
import Experience from "@/sections/Experience"
import Intro from "@/sections/Intro"

export default function Home() {
  return (
    <>
      <Header />
      <Intro />
      <About />
      <Experience />
      <Header />
      <Footer />
    </>
  )
}
