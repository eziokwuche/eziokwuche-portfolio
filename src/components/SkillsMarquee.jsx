function SkillIcon({ skill }) {
  if (skill.logo) {
    return (
      <img
        src={skill.logo}
        alt=""
        width={22}
        height={22}
        className="skill-pill__img"
        aria-hidden
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <i className={`skill-pill__icon ${skill.icon}`} aria-hidden="true" />
  );
}

export default function SkillsMarquee({
  skills: skillList,
  reverse = false,
  durationSec = 25,
}) {
  if (!skillList?.length) return null;

  const doubled = [...skillList, ...skillList];

  return (
    <div
      className="skill-marquee-group"
      style={{ "--skill-marquee-duration": `${durationSec}s` }}
    >
      <div className="skill-marquee-fade skill-marquee-fade--left" aria-hidden />
      <div
        className="skill-marquee-fade skill-marquee-fade--right"
        aria-hidden
      />
      <div className="skill-marquee-clip">
        <div
          className={
            reverse
              ? "skill-marquee-track skill-marquee-track--reverse"
              : "skill-marquee-track"
          }
        >
          {doubled.map((skill, i) => (
            <div
              className="skill-pill"
              key={`${skill.name}-${i}`}
              tabIndex={0}
              aria-label={skill.ariaLabel ?? skill.name}
            >
              <SkillIcon skill={skill} />
              <span className="skill-pill__name">{skill.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
