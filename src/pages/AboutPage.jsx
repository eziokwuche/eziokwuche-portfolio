import InteractiveHero from "@/components/InteractiveHero";
import MusicCarousel from "@/components/MusicCarousel";

export default function AboutPage() {
  return (
    <>
      <InteractiveHero />
      <div id="content" className="home-intro">
        <div className="home-intro__editorial">
          <div className="home-intro__copy p1">
            <p>
              I&apos;m Uchechukwu, a software engineer and designer based in Raleigh, North Carolina, and an Information Science graduate from University of North Carolina at Greensboro. 
              <br /><br /> 
              Over the past few years, I&apos;ve gained hands-on experience at Microchip Technology and Tri-County Resources Group, alongside co-founding InOptive Studios—a streetwear brand where I managed everything from market research to digital strategy.
              <br /><br />
              I&apos;m very interested in reverse-engineering systems and building digital experiences that sit right at the intersection of raw data and visual design. Most recently, I&apos;ve been focused on bridging the gap between heavy backend logic and pixel-perfect UI, building everything from Python-based web crawlers to interactive, audio-reactive web experiences using React and Canvas.
              <br /><br />
              Outside of coding, I'm proudly tied to my Igbo roots. You can usually find me making beats, working on graphic design, or listening to music.
            </p>
          </div>
          <div className="home-intro__image">
            <img 
              src="/IMG_7015.jpg" 
              alt="Uchechukwu Nnani" 
            />
          </div>
        </div>
      </div>
      <MusicCarousel />
    </>
  );
}
