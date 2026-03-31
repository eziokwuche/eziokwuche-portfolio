import projects from "@/data/projects";

export default function ProjectGrid() {
  return (
    <div className="project-grid">
      {projects.map((project, i) => {
        const hasLink = project.github && project.github !== "";

        const cardContent = (
          <>
            {project.thumbnail ? (
              <div className="project-thumb">
                <img src={project.thumbnail} alt={project.title} />
              </div>
            ) : (
              <div className="project-thumb-placeholder" />
            )}

            <div className="project-info">
              <h3 className="project-name">
                {project.title} {hasLink && <span className="arrow">↗</span>}
              </h3>
              <p className="project-desc">{project.description}</p>
              
              <div className="project-tags">
                {project.tags.map((tag) => (
                  <span className="project-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </>
        );

        
        if (hasLink) {
          return (
            <a 
              key={i} 
              href={project.github} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="project-card"
            >
              {cardContent}
            </a>
          );
        }

        
        return (
          <div key={i} className="project-card non-clickable">
            {cardContent}
          </div>
        );
      })}
    </div>
  );
}