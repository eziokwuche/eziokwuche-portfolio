# Portfolio Website for Uche Nnani

**Live Site:** [eziokwuche.com](https://eziokwuche.com)

This repository contains the source code for my interactive personal portfolio, built to showcase my capabilities in frontend engineering, data analysis, and digital design. Anchored by the concept of "Eziokwu"—the Igbo word for "Truth"—the project merges my cultural heritage with high-level technical execution. Drawing UI inspiration from Apple's classic Cover Flow and the brutalist layout of Baby Keem's digital platforms.

## Project Overview

* **Goal:** Build a highly interactive, single-page application (SPA) that acts as both a professional engineering portfolio and an immersive digital experience.
* **Technologies in Focus:** React, Vite, HTML5 `<canvas>`, GSAP (GreenSock Animation Platform), ScrollSmoother, CSS3, and Vercel Analytics/Speed Insights.

## Core Architecture & Pages

This project utilizes a **Pure State Routing** architecture, bypassing traditional browser URL hash-routing to create a seamless, app-like component swapping experience. It includes:
* **Home:** An interactive entry point featuring a custom-engineered `<canvas>` particle physics engine that reacts to user cursor movement.
* **About:** A deep dive into my background, featuring a custom-built 20-album 3D media carousel with synchronized audio playback and dynamic background color transitioning. 
* **Experience:** A structured timeline documenting my professional roles, including IT Help Desk Support at Tri-County Resources Group and Data Analysis at Microchip Technology Inc.
* **Projects:** A comprehensive grid detailing technical builds, including Python web crawlers, data visualization dashboards, and UI/UX design.

## Key Technical Features

* **Interactive Canvas Hero:**   
Engineered a custom particle matrix rendering of a portrait that calculates cursor proximity for real-time physics-based scattering and reformation.

* **Advanced Motion & Scroll:**   
Integrated GSAP's ScrollTrigger and ScrollSmoother plugins to hijack the native browser scrollbar, replacing it with a buttery, momentum-based scrolling physics engine.

* **Custom Audio Engine:**   
Built a state-managed audio context to handle seamless playback, pausing, and track-switching across the interactive music carousel without overlapping audio channels.

* **Performance Optimization:**   
Deployed globally via Vercel edge networks, utilizing modular CSS and React component unmounting to ensure rapid load times and 60fps animations.

## How to Run Locally

To view and edit this project on your local machine:

1. **Clone the Repository:**
   ```bash
   git clone [https://github.com/aunnani03/eziokwuche.git](https://github.com/aunnani03/eziokwuche.git)
