import ExperienceTimeline from "@/components/ExperienceTimeline";
import SkillsMarquee from "@/components/SkillsMarquee";
import { skillsMarqueeRow1, skillsMarqueeRow2 } from "@/data/skills";

export default function ExperiencePage() {
  return (
    <>
      <section className="page-section">
        <div className="container">
          <h1 className="section-title">Relevant Experience</h1>
          <ExperienceTimeline />
        </div>
      </section>
      <section className="page-section skills-section">
        <div className="skills-marquee-stack">
          <div className="skills-marquee-stack__title">
            <h2 className="section-title skills-marquee-stack__heading">
              Skills
            </h2>
          </div>
          <SkillsMarquee skills={skillsMarqueeRow1} durationSec={25} />
          <SkillsMarquee skills={skillsMarqueeRow2} reverse durationSec={28} />
        </div>
      </section>
    </>
  );
}
