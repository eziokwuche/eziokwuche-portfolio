import ProjectGrid from "@/components/ProjectGrid";

export default function ProjectsPage() {
  return (
    <>
      <section className="page-section projects-page">
        <div className="container">
          <div className="section-content-column">
            <h1 className="section-title projects-page__section-heading">
              Projects
            </h1>
            <ProjectGrid />
          </div>
        </div>
      </section>
      <section className="page-section github-cta-section">
        <div className="github-cta">
          <h2 className="github-cta-heading">Want to see more?</h2>
          <p className="github-cta-sub">Check out my GitHub profile.</p>
          <a
            href="https://github.com/eziokwuche"
            target="_blank"
            rel="noopener noreferrer"
            className="github-cta-btn"
          >
            GitHub
          </a>
        </div>
      </section>
    </>
  );
}
