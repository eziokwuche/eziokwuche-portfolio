import experience from "@/data/experience";


const sortedExperience = [...experience].sort((a, b) =>
  b.endDate.localeCompare(a.endDate)
);

function companyInitials(company) {
  const words = company.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return company.slice(0, 2).toUpperCase();
}

function LocationPin({ className }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.25" fill="currentColor" />
    </svg>
  );
}

export default function ExperienceTimeline() {
  return (
    <div className="experience-timeline-wrap">
      <div className="experience-timeline" role="list">
        <div className="experience-timeline__axis" aria-hidden />
        {sortedExperience.map((item, i) => {
          const side = i % 2 === 0 ? "right" : "left";
          const card = (
            <article className="experience-timeline__card">
              <div className="experience-timeline__head">
                <span className="experience-timeline__summary-row">
                  {item.logo ? (
                    <span className="experience-timeline__logo">
                      <img src={item.logo} alt="" />
                    </span>
                  ) : (
                    <span
                        className="experience-timeline__logo experience-timeline__logo--initials"
                      aria-hidden
                    >
                      {companyInitials(item.company)}
                    </span>
                  )}
                  <span className="experience-timeline__summary-copy">
                    <span className="experience-timeline__summary-company">
                      {item.company}
                    </span>
                    <span className="experience-timeline__summary-period">
                      {item.period}
                    </span>
                    <span className="experience-timeline__summary-title">
                      {item.title}
                    </span>
                  </span>
                </span>
              </div>
              <div className="experience-timeline__panel">
                <p className="experience-timeline__location">
                  <LocationPin className="experience-timeline__pin" />
                  <span>{item.location}</span>
                </p>
                <p className="experience-timeline__desc">{item.description}</p>
                <div className="experience-timeline__tags">
                  {item.tags.map((tag) => (
                    <span className="experience-timeline__tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
          const node = (
            <div className="experience-timeline__node" aria-hidden key="node" />
          );
          const spacer = (
            <div className="experience-timeline__spacer" aria-hidden key="sp" />
          );

          return (
            <div
              key={`${item.company}-${item.endDate}`}
              className={`experience-timeline__row experience-timeline__row--${side}`}
              role="listitem"
            >
              {side === "right" ? (
                <>
                  {spacer}
                  {node}
                  {card}
                </>
              ) : (
                <>
                  {card}
                  {node}
                  {spacer}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
