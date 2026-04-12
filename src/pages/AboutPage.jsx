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
            I&apos;m Uche, a software engineer and designer based in Raleigh and an Information Science graduate from UNC Greensboro. I&apos;ve always been driven by the need to take systems apart and rebuild them better, a curiosity that led me to build this entire portfolio from scratch.
            <br /><br />
            My name translates to &apos;God&apos;s Will,&apos; a philosophy I carry into my work as a reminder that as long as there is a will, there is a way to solve even the most complex technical problems. I strive to build digital experiences that sit at the intersection of data and design, bridging the gap between heavy logic and a clean user experience.
            <br /><br />
            Outside of engineering, I am a believer that life without music would be pure agony. I find beauty in every genre and spend my time producing beats and exploring new sounds. I&apos;m also an avid supporter of <span style={{ color: '#6CABDD' }}>Manchester City</span>, <span style={{ color: '#241773' }}>Baltimore Ravens</span>, <span style={{ color: '#CC0000' }}>Carolina Hurricanes</span>, <span style={{ color: '#005A9C' }}>LA Dodgers</span>, and the <span style={{ color: '#FDB927' }}>Los Angeles Lakers</span>.
            <br /><br />
            I&apos;m always looking for new challenges where I can turn raw ideas into something impactful, whether that&apos;s through code, music, or design.
          </p>
          </div>
          <div className="home-intro__image">
            <img 
              src="assets/profile-picture.jpg" 
              alt="Uchechukwu Nnani" 
            />
          </div>
        </div>
      </div>
      <MusicCarousel />
    </>
  );
}
