import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { id: "about", label: "About" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
];

const SOCIALS = [
  { label: "LinkedIn", href: "https://linkedin.com/in/andrewnnani" },
  { label: "GitHub", href: "https://github.com/eziokwuche" },
  { label: "Instagram", href: "https://www.instagram.com/eziokwuche/" },
  { label: "Twitter", href: "https://twitter.com/eziokwuche" },
];

function LiveClock() {
  const [time, setTime] = useState(() => formatTime());

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return <>{time}</>;
}

function formatTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export default function HomePage({ navigate }) {
  return (
    <section className="site-footer home-entrance">
      <section className="ft-navs">
        <div className="ft-navs-self">
          <div className="ft-nav">
            <h4 className="ft-label">Explore</h4>
            <nav className="ft-nav-links">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className="ft-link"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="ft-nav">
            <h4 className="ft-label">Connect</h4>
            <nav className="ft-nav-links">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ft-link"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="ft-mails">
          <div className="ft-mail">
            <h4 className="ft-label">Get In Touch</h4>
            <a href="mailto:nnaniandrew@gmail.com" className="ft-link ft-link--info">
              nnaniandrew@gmail.com
            </a>
          </div>
          <div className="ft-mail">
            <h4 className="ft-label">Location</h4>
            <p className="ft-link ft-link--info ft-link--static">
              Raleigh, NC &mdash; <LiveClock />
            </p>
          </div>
        </div>
      </section>

      <section className="ft-end">
        <div
          className="ft-end-logo-marquee"
          aria-label="Uchechukwu Nnani"
        >
          <div className="ft-end-logo-track">
            {[0, 1].map((dup) => (
              <div
                key={dup}
                className="ft-end-logo-segment"
                aria-hidden={dup === 1}
              >
                <img
                  src="/favicon.png"
                  alt=""
                  className="ft-end-icon"
                  draggable={false}
                />

                <span>UCHECHUKWU</span>
                <span>NNANI</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
