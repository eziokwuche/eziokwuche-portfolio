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
              I&apos;m Uchechukwu Nnani — an Information Science graduate from
              UNC Greensboro based in Raleigh, North Carolina. I work at the
              intersection of data and design, building everything from
              Python-powered data pipelines and sentiment analysis tools to
              interactive web experiences with React and Canvas. I co-founded
              InOptive Studios, a streetwear brand where I handled everything
              from market research to digital strategy. When I&apos;m not
              writing code or crunching data, I&apos;m probably deep in an
              album.
            </p>
          </div>
        </div>
      </div>
      <MusicCarousel />
    </>
  );
}
