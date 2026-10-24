# Jobs tab: which resume fits a job posting

## Why

You paste a job posting and resumezip tells you which of your resumes to send,
with a score for each. Then it keeps the job in a list, with the resume you used
and where the application stands. That list is something you'll come back to and
look through, so its saved format has to be easy to show.

## What it does

1. The dashboard gets two tabs at the top: **Resumes**, which is today's dashboard
   and stays the default, and **Jobs**.
2. On **Jobs**, there's a box to paste the posting, an optional link field, and
   **Find the best resume**.
3. resumezip makes sure every resume has an up-to-date **profile**, then sends the
   posting and the profiles to the AI. The AI picks out the job's requirements
   and says where in each resume each one shows up.
4. The resumes are listed best first, each with a score out of 100, what matched,
   what's missing and a one-line reason. Next to each is **Use this one**.
5. The job is saved to the **job list** below the box straight away, with status
   **Saved**. From the list you can see each job, open its link, change its status
   (Saved, Applied, Interviewing, Offer, Rejected), see which resume you chose,
   look at the scores again, and delete it.

## The AI calls

Both go through a new server route, `/api/jobs`. It is a copy of `/api/review`'s
guard rails:

- It only accepts requests from the site's own pages.
- It answers `off` when no AI key is set.
- It checks each request's size and shape.
- It allows 20 requests per browser per 10 minutes.

It reuses the AI notes' provider code: `providersOf` and `askAny` in
`src/lib/review/ai/providers.ts`. So the keys are tried in the same order: Claude,
then OpenAI, then Azure, and on `npm run dev` with `GEMINI_API_KEY` set, Gemini
first. Two changes to `providers.ts`:

- `ask` and `askAny` take the answer's JSON schema as an option. The default is
  the notes' `ANSWER_SCHEMA`, so the AI notes don't change.
- Their log line names which feature asked.

Nothing is stored on the server and nothing is logged beyond which service failed.

**Profile request**: `{ kind: "profiles", resumes: [{ id, experience, projects, skills, coursework }] }`

- Each resume is sent as its printed text, in those four groups, with nothing that
  was left out of the PDF:
  - experience: each job's role, company and bullets;
  - projects: each project's name, tech stack and bullets;
  - skills: each skill group's category and skills;
  - coursework: each school's coursework.
- At most 5 resumes per request. More are sent 5 at a time.
- The answer, for each resume:
  - `targets`: up to 5 job titles it suits;
  - `level`: intern, entry, mid, senior or lead;
  - `experience`, `projects`, `skills` and `coursework`: the skills and fields each
    group shows, up to 25 short terms each;
  - `summary`: one line.

**Match request**: `{ kind: "match", posting, profiles: [{ id, ...profile }] }`

- `posting` is at most 20,000 characters, and there are at most 50 profiles.
- The answer:
  - `job`: `title`, `company`, `location`, `level`, and `requirements` (up to 15,
    each a short `name` and whether it's a `must` or nice to have);
  - for each resume: for each requirement, the best place it's shown (experience,
    projects, skills, coursework or nowhere), plus a one-line `reason`.

## The posting: pasted, from its link, or both

Only one of the two is needed.

- **Link only:** `/api/jobs` fetches the page on the server and reads the posting from
  it (`src/lib/jobs/pageText.ts`). It uses the page's schema.org `JobPosting` data
  when there is some, which Greenhouse, Lever, Ashby and Workday include. Otherwise it
  uses the page's title and main text, without scripts, styles, menus or the footer.
- **Pasted only:** the text is used as it is.
- **Both:** they're matched together, the pasted text first. If the link can't be
  read, only the pasted text is matched, and the tab says so.
- The job saves the text it was matched on.

The fetch (`src/lib/jobs/fetchPosting.ts`, Node's `http` and `https`, no new package)
only reads public web addresses:

- `http` or `https`, on the usual port, with no password in the address;
- not `localhost` or `.local`, `.internal` or `home.arpa` names;
- every address the name resolves to is checked before connecting, after each of up
  to 4 redirects too, and private, shared, link-local (cloud metadata), loopback,
  documentation and reserved ranges are refused;
- web pages only, at most 2 MB, within 10 seconds.

The time spent reading the link comes out of the AI's budget, so the whole request
stays under the route's 60 seconds. LinkedIn, Indeed and pages that need a login, or
build the page in JavaScript, usually can't be read: the tab says to paste the
description instead.

## Nothing made up

- Text under 25 words isn't sent to the AI ("too short to be a job posting"). With a
  link, this is checked on the text read from it.
- The AI says whether the text is a job posting at all. When it isn't, nothing is
  saved.
- Each requirement quotes the posting's words, and is dropped when they aren't in the
  posting word for word. The same goes for a title, company or location.
- An answer missing a field, a resume or a profile is an error ("came back
  incomplete"), never filled in with defaults.

## The score

The score is worked out in layers in the browser, from what the AI said, so the
same answer always gives the same number. The question it answers: if a recruiter
spends 15 to 30 seconds on each resume, which gives the most immediate evidence that
you already do the kind of work described?

**First, the job is classified.** The AI picks the kind of role (systems/infra,
backend/product, low-level C++, quant/HPC, gaming/graphics, compiler/toolchain and so
on) and the domain the work is in.

**Requirements have tiers:**

| Tier | Meaning | Worth |
|---|---|---|
| 1 | Must-have, screening ("proficiency in C++", graduating by a date) | 3 |
| 2 | Strong signal the posting emphasizes or repeats (concurrency, SQL) | 2 |
| 3 | Nice to have ("LLVM is a plus") | 1 |

Requirements are only the technical work: languages, systems, frameworks, tools and
kinds of engineering. Anything about hiring rather than the work is left out, since a
resume doesn't prove it and every resume would miss it: degree, GPA and graduation
date; availability, full-time, internship term and start date; location, relocation,
remote and travel; work authorization, sponsorship, citizenship and clearance;
years-of-experience counts ("3+ years of C++" is C++); and soft skills like
communication. The prompt says so, and `workName` in `request.ts` drops any the AI
gives anyway, matching soft skills and arrangements whole so "high availability" and
"inter-process communication" stay.

**Evidence has strengths, and more examples earn more.** For each requirement, the AI
judges how directly each resume proves it, using the profile's highlights first. The
browser counts how many of the resume's jobs and projects mention the requirement's
keyword or name (`examplesOf` in `match.ts`), so two C++ projects beat one:

| Strength | Meaning | 1 example | 2 | 3 or more |
|---|---|---|---|---|
| strong | the work with its scale or results ("sharded concurrent engine, 100K+ ops/s") | 0.85 | 0.925 | 1 |
| good | a job or project shows the work ("concurrent client handling") | 0.65 | 0.725 | 0.8 |
| weak | only a listed skill or coursework | 0.4 | | |
| none | not there | 0 | | |

**Graduation date.** When the posting gives a graduation window ("graduating between
December 2026 and June 2027", "Class of 2027"), the AI reads it as `earliest` and
`latest` (`YYYY-MM` or `YYYY`, either end open) and quotes the posting, and the quote
must be in it. The resume's date is its latest school end date as printed, read with
the checker's date reader (`graduation.ts`), never by the AI. If it fits, nothing
changes. If it's outside the window, the score is multiplied by 0.8, as for a missing
must-have. If the resume has no date, it says so, with no penalty.

**The layers:**

| Layer | Weight | From |
|---|---|---|
| Core technical requirements | 35% | each requirement's tier worth × its evidence credit, out of the total worth |
| Project relevance | 25% | the AI's 0 to 100; projects in an unrelated specialty count against it |
| Experience relevance | 20% | the AI's 0 to 100 |
| Domain alignment | 10% | the AI's 0 to 100 |
| Keyword coverage | 5% | checked in the browser: each requirement's term found whole on the resume as written, by tier worth |
| Narrative coherence | 5% | the AI's 0 to 100 |

- A job with no requirements leaves out the core and keyword layers, and the others
  are scaled up to make 100.
- Each tier 1 requirement with no evidence at all multiplies the whole score by 0.8.
- Ties go to the resume edited most recently.
- Each job also gets a line of advice on which projects, from any of the resumes,
  would make the strongest lineup, when mixing them beats any one resume.
- Each match saves its layers as `parts: { core, projects, experience, domain,
  keywords, narrative }`, plus `missedScreening` and, for each requirement, `evidence:
  { strength, place, onResume }`, which the list shows requirement by requirement.
  Jobs matched before the layers have `parts: null`. Their must-haves read as tier 1
  and the rest as tier 3.

**Profiles** also hold `domains` and up to 15 `highlights`: the resume's strongest
concrete claims, with their numbers, tagged experience or projects. That's the
evidence matched on, without sending the whole resume again. The fingerprint includes
a profile version, so profiles made before highlights existed are made once more.

## What's saved in localStorage

Three new keys. The resumes' own format doesn't change, so it needs no migration,
and profiles don't go into downloaded PDF, Word or JSON files.

- `resumezip.jobProfile:<resumeId>`: `{ version: 1, hash, madeAt, profile }`
  - `hash` is a fingerprint of the four groups of text that were sent. A
    profile counts as out of date when the resume's text no longer gives the same
    fingerprint.
  - Profiles are only made when you match a job. Editing a resume doesn't call the
    AI.
  - A profile whose resume has been deleted is cleared the next time the Jobs tab
    opens.
- `resumezip.jobs`: `{ version: 1, jobs: Job[] }`, newest first. The list is kept to 200 jobs:
  past that, the oldest **Saved** ones are dropped first, and jobs with any other
  status are kept. A `Job` is:

  ```ts
  {
    id: string                 // uuid
    savedAt: string            // ISO date
    link: string               // "" if none
    posting: string            // the text pasted, so it can be matched again
    title: string; company: string; location: string; level: string   // from the AI, "" if not found
    requirements: { name: string; must: boolean }[]
    matches: {                 // best first, as scored when it was saved
      resumeId: string
      resumeTitle: string      // the resume's name when it was matched, shown if it's deleted later
      score: number            // 0–100
      found: { experience: number; projects: number; skills: number; coursework: number; missing: number }
      matched: string[]; missing: string[]
      reason: string
    }[]
    chosenResumeId: string | null
    status: "saved" | "applied" | "interviewing" | "offer" | "rejected"
    appliedAt: string | null   // set when it's first marked Applied or past it
  }
  ```

  Everything shown in the list is in the record itself, so the list can be shown
  without asking the AI again, even after a resume has been deleted.
- The job list is untrusted when it's read back, like a resume. Records in the wrong shape
  are dropped, and fields are read defensively. The same goes for profiles.

## Privacy

When you click **Find the best resume**, every resume's experience, projects, skills
and coursework are sent to the AI, not just the one you have open. The Jobs tab says
so next to the button. The rest of the site still sends nothing unless you ask.

## Not doing

- No automatic tailoring of a resume to the job.
- No sync between devices. Like resumes, jobs live in this browser.
- No scoring without AI. With no key set, the tab says AI isn't set up.

## My calls (the builder's)

- The 1, 0.75, 0.5 and 0.25 credits for the four groups, and must = 2, nice to have = 1.
- Profiles are kept apart from resumes rather than on them, so files and the resume
  format don't change.
- Resumes go to the AI under ids made for each request (`r1`, `r2`, ...), mapped back in the browser, since saved resume ids can be any text.
- A resume too long for a request is cut to fit rather than refused.
- The four groups are what's sent. The summary, profile details and added sections
  aren't.
- The limits: 5 resumes per profile request, 50 profiles per match, 20,000 characters
  per posting, 20 requests per 10 minutes, 200 jobs.
- Which tab is open is kept in the address as `#jobs`, so a reload stays on Jobs.

## Tests (written, not run, per your instructions)

- Unit tests for:
  - the score;
  - reading saved jobs and profiles back, including bad data;
  - the route's request checks, refusing other sites, `off`, the limit, and the
    provider order, mocked as `route.test.ts` does;
  - the profile fingerprint.
- One browser test, with `/api/jobs` stubbed: paste a posting, see the resumes
  ranked, choose one, mark the job Applied, reload, and it's still there.
