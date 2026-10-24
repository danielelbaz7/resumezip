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

## The score

The score is worked out in the browser from what the AI said, so it's the same
every time for the same answer. It follows the order you asked for: experience
first, then projects, then skills, then coursework.

- Each requirement is worth 2 if it's a must and 1 if it's nice to have.
- A requirement earns its full worth when it shows up in **experience**, 0.75 of it
  in **projects**, 0.5 in **skills**, 0.25 in **coursework**, and nothing when it's
  nowhere.
- The score is what all the requirements earn, divided by what they're worth, out
  of 100.
- Ties go to the resume edited most recently.
- Each result keeps how many requirements were met in each group, so the page can
  show something like "4 in experience, 2 in projects, 1 missing".

## What's saved in localStorage

Three new keys. The resumes' own format doesn't change, so it needs no migration,
and profiles don't go into downloaded PDF, Word or JSON files.

- `jobProfile:<resumeId>`: `{ version: 1, hash, madeAt, profile }`
  - `hash` is a fingerprint of the four groups of text that were sent. A
    profile counts as out of date when the resume's text no longer gives the same
    fingerprint.
  - Profiles are only made when you match a job. Editing a resume doesn't call the
    AI.
  - A profile whose resume has been deleted is cleared the next time the Jobs tab
    opens.
- `jobs`: `{ version: 1, jobs: Job[] }`, newest first. The list is kept to 200 jobs:
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
- `jobs` is untrusted when it's read back, like a resume. Records in the wrong shape
  are dropped, and fields are read defensively. The same goes for profiles.

## Privacy

When you click **Find the best resume**, every resume's experience, projects, skills
and coursework are sent to the AI, not just the one you have open. The Jobs tab says
so next to the button. The rest of the site still sends nothing unless you ask.

## Not doing

- No automatic tailoring of a resume to the job.
- No reading postings from a link: the page doesn't fetch anything. The link is only
  saved.
- No sync between devices. Like resumes, jobs live in this browser.
- No scoring without AI. With no key set, the tab says AI isn't set up.

## My calls (the builder's)

- The 1, 0.75, 0.5 and 0.25 credits for the four groups, and must = 2, nice to have = 1.
- Profiles are kept apart from resumes rather than on them, so files and the resume
  format don't change.
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
