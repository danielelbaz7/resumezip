// Resumes that more than one spec opens.

/** A resume from elsewhere, as the lines of a plain PDF (textPdf): a bullet in it is a duty rather than a contribution. */
export const FROM_ELSEWHERE = [
  "Mara Lin",
  "mara@example.com | (555) 010-2020 | Seattle, WA",
  "EXPERIENCE",
  "Software Engineer, Acme Corp",
  "Jan 2024 - Present",
  "- Responsible for testing the checkout service",
  "- Built a deploy tool that cut release time from two hours to ten minutes for 40 engineers",
  "EDUCATION",
  "State University",
  "B.S. in Computer Science, 2019 - 2023",
]

/** A resume saved in this browser, with a job, a bullet and an entry left out of the PDF. */
export const MARA = {
  id: "mara",
  resumeTitle: "Mara at Stripe",
  updatedAt: "2026-10-08T12:00:00.000Z",
  selectedTemplate: "modernjack",
  sectionOrder: ["Work", "Education", "Skills"],
  sectionsChosen: true,
  headings: {},
  profileSection: { fullName: "Mara Lin", email: "mara@example.com", linkedin: "linkedin.com/in/maralin" },
  educationSection: [{ id: 1, schoolName: "State University", degree: "B.S. in Biology", schoolEndDate: "May 2024" }],
  workExperienceSection: [
    {
      id: 1,
      workRole: "Engineer",
      companyName: "Stripe",
      workStartDate: "Jun 2024",
      workEndDate: "Present",
      workDescription: "• Built **payments** search for R&D\n○ Fed the cat",
    },
    { id: 2, workRole: "Secret agent", companyName: "MI6", leftOut: true },
  ],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Go, TypeScript" }],
  projectsSection: [],
  publicationsSection: [],
  volunteerExperienceSection: [],
  leadershipExperienceSection: [],
  awardsSection: [],
}
